import type { AppState, IdFactory, Session } from './model';
import { createSession, validateSession } from './training';
import { clone, stableJson } from './json';
export interface Persistence {
  load(scope: string): Promise<AppState | undefined>;
  save(state: AppState): Promise<void>;
}
export interface SessionTransport {
  apply(operation: AppState['outbox'][number]): Promise<void>;
}
export class ConflictError extends Error {}
/** One transaction persists the record and its outbound operation before the UI reports a device save. */
export class TrainingStore {
  private state: AppState;
  private listeners = new Set<() => void>();
  private serial: Promise<unknown> = Promise.resolve();
  private syncing = false;
  private deviceSaving = 0;
  getDeviceSaving = () => this.deviceSaving > 0;
  private error?: string;
  private undoStack: { sessionId: string; previous: Session }[] = [];
  constructor(
    initial: AppState,
    private persistence: Persistence,
    private id: IdFactory,
    private clock = () => Date.now(),
  ) {
    this.state = initial;
  }
  getSnapshot = () => this.state;
  getError = () => this.error;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  update(change: (s: AppState) => AppState): Promise<void> {
    const work = this.serial.then(async () => {
      const next = change(clone(this.state));
      next.savedAt = new Date(this.clock()).toISOString();
      this.deviceSaving++;
      this.emit();
      try {
        await this.persistence.save(next);
        this.state = next;
        this.error = undefined;
        this.emit();
      } catch (error) {
        this.error = 'Could not save on this device. Keep this screen open and try again.';
        this.emit();
        throw error;
      } finally {
        this.deviceSaving--;
        this.emit();
      }
    });
    this.serial = work.catch(() => undefined);
    return work;
  }
  saveSession(sessionId: string, change: (session: Session) => Session, undoable = true) {
    return this.update((state) => {
      const previous = state.sessions.find((s) => s.id === sessionId);
      if (!previous) throw new Error('Session not found.');
      const next = change(clone(previous));
      validateSession(next);
      if (
        previous.startedAt !== next.startedAt ||
        stableJson(previous.prescription) !== stableJson(next.prescription)
      )
        throw new Error('The original prescription is frozen.');
      if (undoable) {
        this.undoStack.push({ sessionId, previous: clone(previous) });
        this.undoStack = this.undoStack.slice(-30);
      }
      next.revision = previous.revision + 1;
      state.sessions = state.sessions.map((s) => (s.id === sessionId ? next : s));
      if (state.scope !== 'demo')
        state.outbox.push({
          id: this.id(),
          sessionId,
          expectedRevision: previous.revision,
          session: clone(next),
          attempts: 0,
          nextAttemptAt: 0,
          status: 'pending',
        });
      return state;
    });
  }
  addSession(session: Session) {
    return this.update((state) => {
      if (state.sessions.some((s) => s.id === session.id)) return state;
      session.revision = 1;
      validateSession(session);
      state.sessions.push(session);
      if (state.scope !== 'demo')
        state.outbox.push({
          id: this.id(),
          sessionId: session.id,
          expectedRevision: 0,
          session: clone(session),
          attempts: 0,
          nextAttemptAt: 0,
          status: 'pending',
        });
      return state;
    });
  }
  async undo(sessionId: string) {
    const index = this.undoStack.findLastIndex((s) => s.sessionId === sessionId);
    if (index < 0) return;
    const [item] = this.undoStack.splice(index, 1);
    await this.saveSession(sessionId, () => item.previous, false);
  }
  async sync(transport: SessionTransport) {
    if (this.syncing || this.state.scope === 'demo') return;
    this.syncing = true;
    try {
      while (true) {
        const blocked = new Set(
          this.state.outbox
            .filter((o) => o.status === 'conflict' || o.nextAttemptAt > this.clock())
            .map((o) => o.sessionId),
        );
        const op = this.state.outbox.find(
          (o) =>
            o.status === 'pending' && o.nextAttemptAt <= this.clock() && !blocked.has(o.sessionId),
        );
        if (!op) break;
        try {
          await transport.apply(op);
          await this.update((s) => ({ ...s, outbox: s.outbox.filter((o) => o.id !== op.id) }));
        } catch (error) {
          const conflict = error instanceof ConflictError;
          await this.update((s) => ({
            ...s,
            outbox: s.outbox.map((o) =>
              o.id === op.id
                ? {
                    ...o,
                    attempts: o.attempts + 1,
                    nextAttemptAt:
                      this.clock() + Math.min(300000, 1000 * 2 ** Math.min(o.attempts, 8)),
                    status: conflict ? 'conflict' : 'pending',
                    error: conflict
                      ? 'Another device changed this session. Review before syncing.'
                      : 'Waiting to retry cloud save.',
                  }
                : o,
            ),
          }));
          if (!conflict) break;
        }
      }
    } finally {
      this.syncing = false;
    }
  }
  retry() {
    return this.update((s) => ({
      ...s,
      outbox: s.outbox.map((o) => (o.status === 'pending' ? { ...o, nextAttemptAt: 0 } : o)),
    }));
  }
  resolveConflict(sessionId: string, remote: Session, choice: 'device' | 'cloud') {
    return this.update((state) => {
      const local = state.sessions.find((s) => s.id === sessionId);
      if (!local || remote.id !== sessionId) throw new Error('Session unavailable for comparison.');
      if (stableJson(local.prescription) !== stableJson(remote.prescription))
        throw new Error('The original prescription differs. Export both copies for review.');
      state.conflictBackups = [
        ...(state.conflictBackups ?? []),
        {
          id: this.id(),
          sessionId,
          local: clone(local),
          remote: clone(remote),
          choice,
          resolvedAt: new Date(this.clock()).toISOString(),
        },
      ];
      state.outbox = state.outbox.filter((o) => o.sessionId !== sessionId);
      const next =
        choice === 'cloud' ? clone(remote) : { ...clone(local), revision: remote.revision + 1 };
      state.sessions = state.sessions.map((s) => (s.id === sessionId ? next : s));
      if (choice === 'device')
        state.outbox.push({
          id: this.id(),
          sessionId,
          expectedRevision: remote.revision,
          session: next,
          attempts: 0,
          nextAttemptAt: 0,
          status: 'pending',
        });
      return state;
    });
  }
  async importActivity(activityId: string, timezone: string) {
    let importedId: string | undefined;
    await this.update((state) => {
      const activity = state.activities.find((a) => a.id === activityId);
      if (!activity) throw new Error('Activity source unavailable.');
      const existing = state.sessions.find(
        (s) =>
          s.sourceActivity?.provider === activity.provider &&
          s.sourceActivity.externalId === activity.externalId,
      );
      if (existing) {
        importedId = existing.id;
        return state;
      }
      if (activity.matchedSessionId) {
        importedId = activity.matchedSessionId;
        return state;
      }
      const day = {
        id: this.id(),
        day: 0,
        title: activity.name,
        sport: activity.sport,
        exercises: [],
      };
      const versionId = this.id();
      const session = createSession(
        {
          id: versionId,
          blockId: versionId,
          title: activity.name,
          acceptedAt: new Date(this.clock()).toISOString(),
          digest: versionId,
          origin: 'manual',
          days: [day],
        },
        day,
        1,
        this.id,
        new Date(activity.startedAt),
        timezone,
      );
      Object.assign(session, {
        status: 'completed',
        durationSeconds: activity.durationSeconds,
        distanceMetres: activity.distanceMetres,
        averageHeartRate: activity.averageHeartRate,
        elevationMetres: activity.elevationMetres,
        sourceActivity: { provider: activity.provider, externalId: activity.externalId },
        revision: 1,
      });
      validateSession(session);
      state.sessions.push(session);
      importedId = session.id;
      state.activities = state.activities.map((a) =>
        a.id === activityId
          ? {
              ...a,
              matchedSessionId: session.id,
              syncStatus: state.scope === 'demo' ? undefined : 'pending',
            }
          : a,
      );
      if (state.scope !== 'demo')
        state.outbox.push({
          id: this.id(),
          sessionId: session.id,
          expectedRevision: 0,
          session: clone(session),
          attempts: 0,
          nextAttemptAt: 0,
          status: 'pending',
        });
      return state;
    });
    return importedId;
  }
}
