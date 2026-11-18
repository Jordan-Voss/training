import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
} from 'react';
import { AppState as NativeAppState, Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import {
  blankState,
  type PrescriptionVersion,
  type Programme,
  type Session,
  type Sport,
  type TrainingDay,
} from '../../packages/core/model';
import { demoState } from '../../packages/core/fixtures';
import { TrainingStore } from '../../packages/core/store';
import { createSession, manualDay } from '../../packages/core/training';
import { persistence } from '../storage/persistence';
import { authStorage } from '../storage/auth-storage';
import { supabase, transport } from './supabase';
import { processUploads } from './videos';
type Runtime = {
  store: TrainingStore;
  user?: User;
  saving: number;
  cloudReady: boolean;
  deviceSaving: boolean;
  notice?: string;
  dismiss: () => void;
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  start: (
    version: PrescriptionVersion,
    day: TrainingDay,
    round: number,
  ) => Promise<string | undefined>;
  manual: (sport: Sport) => Promise<string | undefined>;
  sync: () => Promise<void>;
};
const Context = createContext<Runtime | null>(null);
export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<TrainingStore>();
  const [user, setUser] = useState<User>();
  const [notice, setNotice] = useState<string>();
  const [saving, setSaving] = useState(0);
  const [cloudReady, setCloudReady] = useState(false);
  const activitySyncing = useRef(false);
  useEffect(() => {
    let generation = 0;
    let disposed = false;
    let loadedScope: string | undefined;
    let liveStore: TrainingStore | undefined;
    async function load(nextUser?: User) {
      const current = ++generation;
      const scope = nextUser?.id ?? 'demo';
      if (loadedScope !== scope) {
        setStore(undefined);
        setCloudReady(false);
      }
      setUser(nextUser);
      try {
        let state =
          (await persistence.load(scope)) ?? (scope === 'demo' ? demoState() : blankState(scope));
        if (state.schema !== 1 || state.scope !== scope)
          throw new Error(
            'Local data needs recovery. Export the device database before resetting.',
          );
        state.savedAt = new Date().toISOString();
        let localStore = loadedScope === scope ? liveStore : undefined;
        if (!localStore) {
          await persistence.save(state);
          localStore = new TrainingStore(state, persistence, randomUUID);
          if (disposed || current !== generation) return;
          loadedScope = scope;
          liveStore = localStore;
          setStore(localStore);
        }
        if (nextUser && supabase) {
          const [sessions, versions, blocks, media, membership] = await Promise.all([
            supabase.from('training_sessions').select('payload'),
            supabase.from('training_versions').select('prescription'),
            supabase
              .from('training_blocks')
              .select('*')
              .eq('archived', false)
              .order('created_at', { ascending: false })
              .limit(1),
            supabase.from('training_media').select('*').eq('status', 'uploaded'),
            supabase
              .from('training_members')
              .select('user_id')
              .eq('user_id', nextUser.id)
              .maybeSingle(),
          ]);
          if (disposed || current !== generation) return;
          if (sessions.error || versions.error || blocks.error || media.error || membership.error) {
            setCloudReady(false);
            setNotice(
              'Cloud records could not be loaded. Your device notebook is available. Retry sync when connected.',
            );
          } else if (!membership.data) {
            setCloudReady(false);
            setNotice(
              'This account is not authorised for Training. Device records are kept locally.',
            );
          } else {
            await localStore.update((latest) => {
              const pending = new Set(latest.outbox.map((o) => o.sessionId));
              for (const row of sessions.data ?? []) {
                const remote = row.payload as Session;
                const local = latest.sessions.find((x) => x.id === remote.id);
                if (!pending.has(remote.id) && (!local || remote.revision > local.revision))
                  latest.sessions = [...latest.sessions.filter((x) => x.id !== remote.id), remote];
              }
              for (const row of versions.data ?? []) {
                const version = row.prescription as PrescriptionVersion;
                if (!latest.versions.some((x) => x.id === version.id))
                  latest.versions.push(version);
              }
              const block = blocks.data?.[0];
              if (block)
                latest.programme = {
                  id: block.id,
                  title: block.title,
                  rounds: block.round_count,
                  activeVersionId: block.active_version_id,
                } as Programme;
              for (const m of media.data ?? []) {
                const local = latest.media.find((x) => x.id === m.id);
                if (local) local.status = 'uploaded';
                else
                  latest.media.push({
                    id: m.id,
                    sessionId: m.session_id,
                    setId: m.set_id,
                    uri: '',
                    mime: m.mime_type,
                    bytes: m.bytes,
                    objectPath: m.object_path,
                    status: 'uploaded',
                    progress: 100,
                  });
              }
              return latest;
            });
            setCloudReady(true);
          }
        }
      } catch (error) {
        if (!disposed)
          setNotice(error instanceof Error ? error.message : 'Device storage is unavailable.');
      }
    }
    if (supabase) {
      void (async () => {
        let cached: User | undefined;
        try {
          const raw = await authStorage.getItem('training.cached-user');
          if (raw) cached = JSON.parse(raw) as User;
        } catch {
          /* Auth still decides server access; a missing local hint must not block sign-in. */
        }
        if (cached?.id) void load(cached);
        const { data, error } = await supabase!.auth.getSession();
        if (disposed) return;
        if (error) {
          setNotice('Cloud sign-in is unavailable. Your cached notebook remains available.');
          if (!cached) void load();
          return;
        }
        if (data.session?.user) {
          await authStorage.setItem('training.cached-user', JSON.stringify(data.session.user));
          if (cached?.id === data.session.user.id) setUser(data.session.user);
          else void load(data.session.user);
        } else {
          await authStorage.removeItem('training.cached-user');
          void load();
        }
      })();
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT')
          setTimeout(() => {
            void (async () => {
              if (session?.user)
                await authStorage.setItem('training.cached-user', JSON.stringify(session.user));
              else await authStorage.removeItem('training.cached-user');
              await load(session?.user);
            })();
          }, 0);
      });
      return () => {
        disposed = true;
        data.subscription.unsubscribe();
      };
    }
    void load();
    return () => {
      disposed = true;
    };
  }, []);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setSaving((n) => n + 1);
    try {
      return await fn();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save. Try again.');
      return undefined;
    } finally {
      setSaving((n) => n - 1);
    }
  }, []);
  const sync = useCallback(async () => {
    if (!store || !user) return;
    await store.sync(transport);
    await processUploads(store, user.id);
    if (activitySyncing.current || !supabase) return;
    activitySyncing.current = true;
    try {
      for (const activity of store
        .getSnapshot()
        .activities.filter((a) => a.syncStatus === 'pending')) {
        if (
          activity.matchedSessionId &&
          store.getSnapshot().outbox.some((o) => o.sessionId === activity.matchedSessionId)
        )
          continue;
        const { error } = await supabase.from('training_external_activities').upsert(
          {
            user_id: user.id,
            provider: activity.provider,
            external_id: activity.externalId,
            activity: { ...activity, syncStatus: 'synced' },
            matched_session_id: activity.matchedSessionId ?? null,
            dismissed: activity.dismissed ?? false,
          },
          { onConflict: 'user_id,provider,external_id' },
        );
        if (error) break;
        await store.update((s) => ({
          ...s,
          activities: s.activities.map((a) =>
            a.id === activity.id &&
            a.matchedSessionId === activity.matchedSessionId &&
            a.dismissed === activity.dismissed
              ? { ...a, syncStatus: 'synced' }
              : a,
          ),
        }));
      }
    } finally {
      activitySyncing.current = false;
    }
  }, [store, user]);
  useEffect(() => {
    if (!store || !user) return;
    void sync().catch(() => undefined);
    const timer = setInterval(() => {
      void sync().catch(() => undefined);
    }, 15000);
    const subscription = NativeAppState.addEventListener('change', (state) => {
      if (state === 'active') void sync().catch(() => undefined);
    });
    const online = () => {
      void sync().catch(() => undefined);
    };
    if (Platform.OS === 'web') window.addEventListener('online', online);
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('online', online);
    };
  }, [store, user, sync]);
  const deviceSaving = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getDeviceSaving ?? (() => false),
    () => false,
  );
  if (!store) return <RuntimeLoading message={notice} />;
  async function start(version: PrescriptionVersion, day: TrainingDay, round: number) {
    const existing = store!
      .getSnapshot()
      .sessions.find(
        (s) =>
          s.blockId === version.blockId &&
          s.round === round &&
          s.dayId === day.id &&
          s.status === 'inProgress',
      );
    if (existing) return existing.id;
    const session = createSession(
      version,
      day,
      round,
      randomUUID,
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Dublin',
    );
    return run(async () => {
      await store!.addSession(session);
      return session.id;
    });
  }
  async function manual(sport: Sport) {
    const day = manualDay(sport, randomUUID);
    const id = randomUUID();
    const version: PrescriptionVersion = {
      id,
      blockId: id,
      title: 'Other training',
      acceptedAt: new Date().toISOString(),
      digest: id,
      days: [day],
      origin: 'manual',
    };
    return start(version, day, 1);
  }
  return (
    <Context.Provider
      value={{
        store,
        user,
        saving,
        cloudReady,
        deviceSaving,
        notice,
        dismiss: () => setNotice(undefined),
        run,
        start,
        manual,
        sync,
      }}
    >
      {children}
    </Context.Provider>
  );
}
import { Text, View } from 'react-native';
function RuntimeLoading({ message }: { message?: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 32, backgroundColor: '#F7F8FA' }}>
      <Text style={{ fontSize: 24, color: '#15181E', fontWeight: '600' }}>Training</Text>
      <Text accessibilityRole="alert" style={{ fontSize: 16, marginTop: 16, color: '#5A6472' }}>
        {message ?? 'Opening your training notebook…'}
      </Text>
    </View>
  );
}
export function useRuntime() {
  const context = useContext(Context);
  if (!context) throw new Error('Training runtime missing');
  return context;
}
export function useTraining() {
  const { store } = useRuntime();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
