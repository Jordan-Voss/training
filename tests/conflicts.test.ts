import { describe, it, expect } from 'vitest';
import { TrainingStore, type Persistence } from '../packages/core/store';
import { demoState } from '../packages/core/fixtures';
import { createSession } from '../packages/core/training';
describe('explicit conflict resolution', () => {
  it.each(['device', 'cloud'] as const)('keeps both copies before selecting %s', async (choice) => {
    let sequence = 0;
    const id = () => `conflict-${++sequence}`;
    const state = demoState();
    state.scope = 'athlete';
    const version = state.versions[0];
    const session = createSession(version, version.days[0], 1, id, new Date(), 'Europe/Dublin');
    const persistence: Persistence = { load: async () => undefined, save: async () => undefined };
    const store = new TrainingStore(state, persistence, id);
    await store.addSession(session);
    await store.saveSession(session.id, (s) => ({ ...s, notes: 'Device notes' }));
    const remote = {
      ...structuredClone(store.getSnapshot().sessions[0]),
      revision: 7,
      notes: 'Cloud notes',
    };
    remote.prescription = Object.fromEntries(
      Object.entries(remote.prescription).reverse(),
    ) as typeof remote.prescription;
    await store.resolveConflict(session.id, remote, choice);
    const saved = store.getSnapshot();
    expect(saved.conflictBackups?.[0].local.notes).toBe('Device notes');
    expect(saved.conflictBackups?.[0].remote.notes).toBe('Cloud notes');
    expect(saved.sessions[0].notes).toBe(choice === 'cloud' ? 'Cloud notes' : 'Device notes');
    expect(saved.outbox).toHaveLength(choice === 'cloud' ? 0 : 1);
    if (choice === 'device') {
      expect(saved.outbox[0].expectedRevision).toBe(7);
      expect(saved.outbox[0].session.revision).toBe(8);
    }
  });
});
