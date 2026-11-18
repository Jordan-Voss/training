import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { useRuntime, useTraining } from '../../src/data/runtime';
import { api, supabase } from '../../src/data/supabase';
import { chooseActivities, exportNotebook } from '../../src/data/files';
import { matchingSessions, mergeActivities } from '../../packages/core/activities';
import { resolveVideoUri, retryVideo } from '../../src/data/videos';
import { localVideoUri } from '../../src/data/video-source';
import { MediaThumbnail } from '../../src/ui/MediaThumbnail';
import type { Session } from '../../packages/core/model';
import { useTheme } from '../../src/ui/theme';
import { VideoPlayer } from '../../src/ui/VideoPlayer';
import {
  Button,
  Choice,
  Divider,
  Field,
  ListItem,
  Page,
  Row,
  Stack,
  SyncLine,
  T,
} from '../../src/ui/components';
type Status = { googleRead: boolean; writeback: boolean; garmin: boolean; sharing: boolean };
type Grant = { id: string; session_id: string; revoked_at?: string; created_at: string };
export default function Profile() {
  const state = useTraining();
  const c = useTheme();
  const [comparison, setComparison] = useState<Session>();
  const { store, user, run, sync } = useRuntime();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [garminOffset, setGarminOffset] = useState(0);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState<Status>();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [play, setPlay] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string>();
  useEffect(() => {
    if (user) {
      void api<Status>('status')
        .then(setStatus)
        .catch(() => undefined);
      void supabase
        ?.from('training_shares')
        .select('id,session_id,revoked_at,created_at')
        .then(({ data }) => setGrants(data ?? []));
      void supabase
        ?.from('training_external_activities')
        .select('*')
        .then(({ data }) => {
          if (data?.length)
            void store.update((s) => ({
              ...s,
              activities: mergeActivities(
                s.activities,
                data.map((a) => ({
                  ...a.activity,
                  matchedSessionId: a.matched_session_id ?? undefined,
                  dismissed: a.dismissed,
                })),
              ),
            }));
        });
    }
  }, [user, store]);
  async function send() {
    await run(async () => {
      if (!supabase) throw new Error('Cloud sign-in is not configured.');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo:
            Platform.OS === 'web'
              ? `${window.location.origin}/auth/callback`
              : 'training://auth/callback',
        },
      });
      if (error) throw error;
      setSent(true);
    });
  }
  async function verify() {
    await run(async () => {
      const { error } = await supabase!.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
    });
  }
  async function importFile() {
    await run(async () => {
      const activities = await chooseActivities();
      await store.update((s) => ({
        ...s,
        activities: mergeActivities(
          s.activities,
          activities.map((a) => ({ ...a, syncStatus: user ? ('pending' as const) : undefined })),
        ),
      }));
      void sync();
    });
  }
  async function garmin() {
    await run(async () => {
      const result = await api<{ activities: typeof state.activities; nextStart: number | null }>(
        'garmin/import',
        { start: garminOffset },
      );
      setGarminOffset(result.nextStart ?? 0);
      await store.update((s) => ({
        ...s,
        activities: mergeActivities(s.activities, result.activities),
      }));
    });
  }
  async function match(activityId: string, sessionId?: string, dismiss = false) {
    await run(async () => {
      await store.update((s) => ({
        ...s,
        activities: s.activities.map((a) =>
          a.id === activityId
            ? {
                ...a,
                matchedSessionId: sessionId,
                dismissed: dismiss,
                syncStatus: user ? ('pending' as const) : undefined,
              }
            : a,
        ),
      }));
    });
  }
  async function shareSession(sessionId: string) {
    await run(async () => {
      const ids = state.media
        .filter((m) => m.sessionId === sessionId && m.status === 'uploaded')
        .map((m) => m.id);
      const grant = await api<{ id: string; url: string }>('shares', { sessionId, mediaIds: ids });
      setShareUrl(grant.url);
      setGrants((g) => [
        ...g,
        { id: grant.id, session_id: sessionId, created_at: new Date().toISOString() },
      ]);
    });
  }
  async function revoke(id: string) {
    await run(async () => {
      const { error } = await supabase!
        .from('training_shares')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      setGrants((g) =>
        g.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)),
      );
    });
  }
  return (
    <Page title="Profile" subtitle="Your account, preferences and connected services.">
      <Stack gap={28} style={{ maxWidth: 900 }}>
        <Stack gap={16}>
          <T size={22} weight="600">
            {user ? 'Your account' : 'Local demo'}
          </T>
          {user ? (
            <>
              <T>{user.email}</T>
              <T muted>Only authorised Training members can access the personal notebook.</T>
              <Button
                title="Sign out"
                secondary
                onPress={() =>
                  void run(async () => {
                    const { error } = await supabase!.auth.signOut();
                    if (error) throw error;
                  })
                }
              />
            </>
          ) : (
            <>
              <T muted>
                Try Training with clearly labelled local examples. Sign in to your authorised
                account for your private programme and cloud records.
              </T>
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="Your authorised email"
              />
              <Row>
                <Button
                  title={sent ? 'Send another sign-in email' : 'Send sign-in email'}
                  onPress={() => void send()}
                  disabled={!supabase}
                />
              </Row>
              {sent ? (
                <>
                  <T muted>
                    Open the email link on this device, or enter the one-time code if your email
                    includes one.
                  </T>
                  <Field label="Sign-in code" value={code} onChange={setCode} />
                  <Button title="Verify code" onPress={() => void verify()} />
                </>
              ) : null}
            </>
          )}
        </Stack>
        <Divider />
        <Stack gap={12}>
          <T size={22} weight="600">
            Appearance
          </T>
          <Choice
            label="Appearance"
            value={state.settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) =>
              void run(() => store.update((s) => ({ ...s, settings: { ...s.settings, theme } })))
            }
          />
        </Stack>
        <Divider />
        <Stack gap={16}>
          <T size={22} weight="600">
            Saving & recovery
          </T>
          <SyncLine />
          <Row>
            <Button
              title="Retry sync"
              secondary
              onPress={() =>
                void run(async () => {
                  await store.retry();
                  await sync();
                })
              }
            />
            <Button
              title="Export notebook"
              secondary
              onPress={() => void run(() => exportNotebook(state))}
            />
          </Row>
          {state.outbox
            .filter((o) => o.status === 'conflict')
            .map((o) => (
              <Stack key={o.id} gap={8}>
                <T role="alert">{o.error}</T>
                <T size={13} muted>
                  Your device copy is preserved. Export the notebook before resolving with the
                  server record.
                </T>
                <Button
                  title="Compare cloud version"
                  secondary
                  onPress={() =>
                    void run(async () => {
                      const { data, error } = await supabase!
                        .from('training_sessions')
                        .select('payload')
                        .eq('id', o.sessionId)
                        .single();
                      if (error) throw error;
                      setComparison(data.payload as Session);
                    })
                  }
                />
                <Button
                  title="Open affected session"
                  secondary
                  onPress={() => router.push(`/workout/${o.sessionId}`)}
                />
              </Stack>
            ))}
        </Stack>
        <Divider />
        <Stack gap={12}>
          <T size={22} weight="600">
            Connections
          </T>
          <ListItem
            title="Google Sheets"
            subtitle={
              status?.googleRead
                ? 'Read-only connection configured'
                : user
                  ? 'Private snapshot available in Programme · Live authorisation required'
                  : 'Sign in to review your private coach source'
            }
          />
          <ListItem
            title="Coach result writeback"
            subtitle={
              status?.writeback
                ? 'Enabled for verified test mapping only'
                : 'Off · Test-copy and recovery verification required'
            }
          />
          <ListItem
            title="Garmin Personal API"
            subtitle={
              status?.garmin
                ? 'Backend key configured · Import to review matches'
                : 'Backend key required · See secure setup in the runbook'
            }
          />
          <Row>
            <Button
              title={garminOffset ? 'Import next Garmin activities' : 'Import Garmin activities'}
              secondary
              disabled={!user || !status?.garmin}
              onPress={() => void garmin()}
            />
            <Button title="Import activity file" secondary onPress={() => void importFile()} />
          </Row>
          <T size={13} muted>
            Supported file formats: Garmin activity JSON, TCX, GPX. Imported activities are reviewed
            before matching; no workout is counted twice.
          </T>
        </Stack>
        {state.activities.length ? (
          <Stack gap={16}>
            <T size={20} weight="600">
              Review imported activities
            </T>
            {state.activities.map((a) => (
              <Stack gap={8} key={a.id}>
                <T weight="600">{a.name}</T>
                <T muted size={14}>
                  {new Date(a.startedAt).toLocaleString('en-IE')} ·{' '}
                  {a.durationSeconds !== undefined
                    ? `${Math.round(a.durationSeconds / 60)} min`
                    : ''}
                  {a.distanceMetres !== undefined
                    ? ` · ${(a.distanceMetres / 1000).toFixed(2)} km`
                    : ''}
                </T>
                {a.matchedSessionId ? (
                  <T size={14}>Matched to an existing session · Counted once</T>
                ) : a.dismissed ? (
                  <T muted size={14}>
                    Kept as an unmatched source record
                  </T>
                ) : (
                  <>
                    <T muted size={13}>
                      Review a possible match
                    </T>
                    {matchingSessions(a, state.sessions).map((m) => (
                      <Button
                        key={m.session.id}
                        secondary
                        small
                        title={`Match ${m.session.title} · ${m.minutesApart} min apart`}
                        onPress={() => void match(a.id, m.session.id)}
                      />
                    ))}
                    <T size={12} muted>
                      New sessions use your device’s training timezone:{' '}
                      {Intl.DateTimeFormat().resolvedOptions().timeZone}. Review this if the
                      activity was recorded while travelling.
                    </T>
                    <Button
                      title="Save as a new session"
                      secondary
                      small
                      onPress={() =>
                        void run(async () => {
                          const id = await store.importActivity(
                            a.id,
                            Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Dublin',
                          );
                          if (id) router.push(`/workout/${id}`);
                          void sync();
                        })
                      }
                    />
                    <Button
                      title="Keep as unmatched source"
                      secondary
                      small
                      onPress={() => void match(a.id, undefined, true)}
                    />
                  </>
                )}
              </Stack>
            ))}
          </Stack>
        ) : null}
        <Divider />
        <Stack gap={16}>
          <T size={22} weight="600">
            Videos & sharing
          </T>
          <T>
            {(
              state.media.filter((m) => m.uri).reduce((n, m) => n + m.bytes, 0) /
              1024 /
              1024
            ).toFixed(1)}{' '}
            MiB attached on this device ·{' '}
            {(
              state.media.filter((m) => m.status === 'uploaded').reduce((n, m) => n + m.bytes, 0) /
              1024 /
              1024
            ).toFixed(1)}{' '}
            MiB in your private cloud
          </T>
          <T size={13} muted>
            Cloud usage is based on your uploaded video records. Full account usage is available in
            the Supabase dashboard.
          </T>
          <Choice
            label="Capture quality"
            value={state.settings.compression}
            options={[
              { value: 'medium', label: 'Medium capture quality' },
              { value: 'original', label: 'High capture quality' },
            ]}
            onChange={(compression) =>
              void run(() =>
                store.update((s) => ({ ...s, settings: { ...s.settings, compression } })),
              )
            }
          />
          <T size={13} muted>
            Medium compression prepares iPhone recordings and selected videos before upload. Browser
            uploads retain the selected file. Automatic retention is off; videos are never deleted
            automatically.
          </T>
          {state.media.map((m) => (
            <Stack key={m.id} gap={8}>
              {m.thumbnailUri ? <MediaThumbnail uri={m.thumbnailUri} /> : null}
              <T size={14}>
                {m.status === 'uploaded'
                  ? 'Private cloud video'
                  : m.status === 'error'
                    ? 'Upload needs attention'
                    : 'Pending video'}{' '}
                · {(m.bytes / 1024 / 1024).toFixed(1)} MiB
              </T>
              {m.error ? (
                <T size={13} muted>
                  {m.error}
                </T>
              ) : null}
              <Row>
                <Button
                  title="Play video"
                  small
                  secondary
                  onPress={() => void run(async () => setPlay(await resolveVideoUri(m)))}
                />
                {m.status === 'error' ? (
                  <Button
                    title="Retry video"
                    small
                    secondary
                    onPress={() =>
                      void run(async () => {
                        await retryVideo(store, m.id);
                        await sync();
                      })
                    }
                  />
                ) : null}
              </Row>
            </Stack>
          ))}
          {play ? <VideoPlayer uri={play} /> : null}
          <T muted>
            Viewer links grant access to the selected videos to anyone who possesses the link.
            Revoke a link to stop new temporary media access. Already issued media URLs expire after
            60 seconds.
          </T>
          {[
            ...new Set(state.media.filter((m) => m.status === 'uploaded').map((m) => m.sessionId)),
          ].map((id) => (
            <Button
              key={id}
              title={`Create viewer link · ${state.sessions.find((s) => s.id === id)?.title ?? 'Session'}`}
              secondary
              disabled={!status?.sharing}
              onPress={() => void shareSession(id)}
            />
          ))}
          {!status?.sharing ? (
            <T size={13} muted>
              Sharing requires the backend signing secret. No public media access is enabled.
            </T>
          ) : null}
          {shareUrl ? (
            <>
              <Field label="Selected viewer link" value={shareUrl} onChange={() => undefined} />
              <Button
                title="Share selected viewer link"
                secondary
                onPress={() => void Share.share({ message: shareUrl, url: shareUrl })}
              />
            </>
          ) : null}
          {grants.map((g) => (
            <ListItem
              key={g.id}
              title={state.sessions.find((s) => s.id === g.session_id)?.title ?? 'Shared session'}
              subtitle={
                g.revoked_at
                  ? 'Revoked'
                  : `Created ${new Date(g.created_at).toLocaleDateString('en-IE')}`
              }
              trailing={
                !g.revoked_at ? (
                  <Button title="Revoke link" small secondary onPress={() => void revoke(g.id)} />
                ) : null
              }
            />
          ))}
        </Stack>
      </Stack>
      <Modal
        visible={!!comparison}
        transparent
        animationType="none"
        onRequestClose={() => setComparison(undefined)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#00000066', padding: 20, justifyContent: 'center' }}
        >
          <ScrollView
            style={{
              maxHeight: '90%',
              maxWidth: 800,
              width: '100%',
              alignSelf: 'center',
              backgroundColor: c.surface,
              borderRadius: 12,
            }}
            contentContainerStyle={{ padding: 24, gap: 20 }}
          >
            <T size={22} weight="600">
              Review session copies
            </T>
            <T muted>
              Choose which changes to use. Both copies are preserved in your device recovery backup
              and notebook export. If the cloud changes again, Training will ask you to review
              again.
            </T>
            {comparison
              ? [
                  {
                    label: 'This device',
                    session: state.sessions.find((s) => s.id === comparison.id)!,
                  },
                  { label: 'Cloud', session: comparison },
                ].map(({ label, session }) => (
                  <Stack key={label} gap={8}>
                    <T size={20} weight="600">
                      {label}
                    </T>
                    <T>
                      {session.title} · {session.trainingDate}
                    </T>
                    <T size={14}>{session.notes ?? 'No session notes'}</T>
                    {session.exercises.map((e) => (
                      <T size={13} key={e.id}>
                        {session.prescription.exercises.find((x) => x.id === e.prescriptionId)
                          ?.name ??
                          e.substitution ??
                          'Exercise'}
                        :{' '}
                        {e.sets
                          .map(
                            (s) =>
                              `${s.load ?? '—'} ${s.loadUnit} × ${s.reps ?? '—'} · ${s.status}`,
                          )
                          .join('; ')}
                        {e.notes ? ` · ${e.notes}` : ''}
                      </T>
                    ))}
                  </Stack>
                ))
              : null}
            <Row>
              {(['cloud', 'device'] as const).map((choice) => (
                <Button
                  key={choice}
                  title={choice === 'cloud' ? 'Use cloud version' : 'Keep device changes'}
                  secondary={choice === 'cloud'}
                  onPress={() =>
                    void run(async () => {
                      await store.resolveConflict(comparison!.id, comparison!, choice);
                      setComparison(undefined);
                      await sync();
                    })
                  }
                />
              ))}
              <Button title="Cancel" secondary onPress={() => setComparison(undefined)} />
            </Row>
          </ScrollView>
        </View>
      </Modal>
    </Page>
  );
}
