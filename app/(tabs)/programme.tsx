import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useRuntime, useTraining } from '../../src/data/runtime';
import { api, supabase } from '../../src/data/supabase';
import type { PrescriptionVersion } from '../../packages/core/model';
import { acceptVersion, activeVersion, nextSlot } from '../../packages/core/training';
import {
  Button,
  Choice,
  Divider,
  Empty,
  Field,
  ListItem,
  Page,
  Row,
  Stack,
  T,
} from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';
type Source = { sheetId: number; title: string; hidden?: boolean; range?: string };
export default function Programme() {
  const state = useTraining();
  const { store, user, run, start } = useRuntime();
  const c = useTheme();
  const version = activeVersion(state);
  const slot = nextSlot(state);
  const [round, setRound] = useState(1);
  const [rounds, setRounds] = useState('4');
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState<number>();
  const [preview, setPreview] = useState<PrescriptionVersion>();
  const [archive, setArchive] = useState(false);
  const [routines, setRoutines] = useState(false);
  const [origin, setOrigin] = useState('');
  const [mode, setMode] = useState<'update' | 'rollover'>('update');
  useEffect(() => {
    if (!user || !supabase) return;
    void supabase
      .from('training_candidates')
      .select('prescription,captured_at')
      .then(({ data }) => {
        if (data?.length) {
          const all = data.map((x) => x.prescription as PrescriptionVersion);
          const routineVersion = all.find((x) => x.kind === 'routines');
          if (routineVersion) void store.update((s) => ({ ...s, routines: routineVersion.days }));
          const versions = all.filter((x) => x.kind !== 'routines');
          setSources(
            versions
              .filter((x) => x.source)
              .map((x) => ({
                sheetId: x.source!.sheetId,
                title: x.source!.title,
                range: x.source!.range,
              })),
          );
          setSource(versions[0].source?.sheetId);
          setOrigin(
            `Read-only snapshot captured ${new Date(data[0].captured_at).toLocaleDateString('en-IE')}. Live refresh requires Training’s own Google authorisation.`,
          );
        }
      });
  }, [user]);
  async function inspect() {
    await run(async () => {
      const result = await api<{ sources: Source[] }>('sheets/sources');
      setSources(result.sources.filter((x) => !x.hidden));
      setOrigin('Live workbook metadata · Read-only');
    });
  }
  async function loadPreview() {
    await run(async () => {
      if (source === undefined) throw new Error('Choose a source tab.');
      const { data, error } = await supabase!
        .from('training_candidates')
        .select('prescription')
        .eq('sheet_id', source)
        .order('captured_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (data?.[0]) {
        const v = data[0].prescription as PrescriptionVersion;
        if (v.kind === 'routines') {
          await store.update((s) => ({ ...s, routines: v.days }));
          setRoutines(true);
        } else setPreview(v);
        return;
      }
      const result = await api<{ version: PrescriptionVersion }>('sheets/preview', {
        sheetId: source,
      });
      if (result.version.kind === 'routines') {
        await store.update((s) => ({ ...s, routines: result.version.days }));
        setRoutines(true);
      } else setPreview(result.version);
    });
  }
  async function accept() {
    if (!preview) return;
    await run(async () => {
      const n = Number(rounds);
      if (!Number.isInteger(n) || n < 1 || n > 52) throw new Error('Choose 1–52 rounds.');
      const blockId = mode === 'rollover' || !state.programme ? randomUUID() : state.programme.id;
      const v: PrescriptionVersion = {
        ...preview,
        id: randomUUID(),
        blockId,
        acceptedAt: new Date().toISOString(),
        source: preview.source
          ? {
              ...preview.source,
              generation: blockId,
              round: 1,
              verified: false,
              writebackEnabled: false,
            }
          : undefined,
      };
      const { error } = await supabase!.rpc('training_accept_programme', {
        p_version: v,
        p_rounds: n,
      });
      if (error) throw error;
      await store.update((s) => acceptVersion(s, v, n));
      setPreview(undefined);
    });
  }
  return (
    <Page
      title="Programme"
      subtitle="An ordered sequence. Train at your own pace."
      action={
        <Button
          title={archive ? 'Current programme' : 'Version archive'}
          secondary
          onPress={() => setArchive(!archive)}
        />
      }
    >
      {archive ? (
        <Stack gap={12}>
          <T size={20} weight="600">
            Accepted versions
          </T>
          {state.versions.map((v) => (
            <Stack
              key={v.id}
              gap={6}
              style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}
            >
              <T weight="600">{v.title}</T>
              <T muted size={14}>
                {v.source?.title ?? 'Local example'} ·{' '}
                {new Date(v.acceptedAt).toLocaleDateString('en-IE')} · {v.days.length} sessions
              </T>
              <T size={13} muted>
                {v.id === state.programme?.activeVersionId
                  ? 'Current version'
                  : 'Archived prescription · retained for history'}
              </T>
              {v.days.map((d) => (
                <T key={d.id} size={14}>
                  Day {d.day}: {d.exercises.map((e) => `${e.name} ${e.prescription}`).join(' · ')}
                </T>
              ))}
            </Stack>
          ))}
        </Stack>
      ) : (
        <>
          {version && state.programme ? (
            <Stack gap={20}>
              <Stack gap={4}>
                <T size={22} weight="600">
                  {state.programme.title}
                </T>
                <T muted>
                  {version.days.length} sessions per mesocycle · {state.programme.rounds} rounds
                </T>
                <T size={13} muted>
                  {version.origin === 'demo'
                    ? 'Local fixture programme'
                    : `${version.source?.title} → Day 1–${version.days.length} sequence · Google Sheets prescriptions`}
                </T>
              </Stack>
              <Row>
                <T size={14} muted>
                  View round
                </T>
                <Choice
                  label="Round"
                  value={round}
                  options={Array.from({ length: state.programme.rounds }, (_, i) => ({
                    value: i + 1,
                    label: String(i + 1),
                  }))}
                  onChange={setRound}
                />
              </Row>
              <View>
                {version.days.map((day) => {
                  const logged = state.sessions.find(
                    (s) => s.blockId === version.blockId && s.round === round && s.dayId === day.id,
                  );
                  return (
                    <ListItem
                      key={day.id}
                      title={`Day ${day.day} · ${day.exercises
                        .slice(0, 2)
                        .map((e) => e.name)
                        .join(' & ')}`}
                      subtitle={`${day.exercises.length} exercises · ${logged ? (logged.status === 'inProgress' ? 'In progress' : logged.status === 'skipped' ? 'Skipped' : 'Completed') : 'Planned'}`}
                      onPress={() => {
                        if (logged) router.push(`/workout/${logged.id}`);
                        else
                          void start(version, day, round).then((id) => {
                            if (id) router.push(`/workout/${id}`);
                          });
                      }}
                    />
                  );
                })}
              </View>
              <T size={13} muted>
                Starting a session freezes its prescription. Rest days and moved sessions do not
                advance the sequence.
              </T>
            </Stack>
          ) : (
            <Empty
              title="No accepted programme yet"
              body="Review a source below, choose how it maps to your training sequence, then accept it. Other training is available from Today."
            />
          )}
          <Divider />
          <Stack gap={16} style={{ maxWidth: 850 }}>
            <T size={22} weight="600">
              Coach source
            </T>
            {!user ? (
              <>
                <T muted>
                  Sign in from Profile to review your private workbook. The example programme and
                  its results stay separate from your personal notebook.
                </T>
                <Button title="Open Profile" secondary onPress={() => router.push('/profile')} />
              </>
            ) : (
              <>
                <T muted>
                  {origin ||
                    'Connect Training’s own Google authorisation to refresh workbook sources. The chat’s Drive connection is separate.'}
                </T>
                <Row>
                  <Button title="Refresh live sources" secondary onPress={() => void inspect()} />
                </Row>
                {sources.length ? (
                  <>
                    <T size={14} muted>
                      Source tab → ordered training sequence
                    </T>
                    <Choice
                      label="Source tab"
                      value={source ?? -1}
                      options={sources.map((s) => ({ value: s.sheetId, label: s.title }))}
                      onChange={(v) => {
                        setSource(v);
                        setPreview(undefined);
                      }}
                    />
                    <Button
                      title="Preview source mapping"
                      secondary
                      onPress={() => void loadPreview()}
                    />
                  </>
                ) : null}
              </>
            )}
            {preview ? (
              <Stack
                gap={16}
                style={{
                  padding: 20,
                  borderWidth: 1,
                  borderColor: c.divider,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                }}
              >
                <T size={20} weight="600">
                  Review {preview.source?.title}
                </T>
                <T muted>
                  {preview.days.length} numbered sessions → one mesocycle. The tab name does not
                  represent a calendar week.
                </T>
                <Field label="Number of rounds" value={rounds} numeric onChange={setRounds} />
                <Choice
                  label="Programme change"
                  value={mode}
                  options={[
                    {
                      value: 'update',
                      label: state.programme ? 'Update future sessions' : 'Use as first block',
                    },
                    { value: 'rollover', label: 'Start a new block' },
                  ]}
                  onChange={setMode}
                />
                {preview.days.map((d) => (
                  <Stack key={d.id} gap={6}>
                    <T weight="600">Day {d.day}</T>
                    {d.exercises.map((e) => {
                      const old = version?.days
                        .flatMap((x) => x.exercises)
                        .find((x) => x.id === e.id);
                      return (
                        <Stack key={e.id} gap={2}>
                          <T size={14}>
                            {e.name} · {e.prescription}
                            {e.rpe ? ` @ RPE ${e.rpe}` : ''}
                            {e.backoff
                              ? ` · Back-offs ${e.backoff.prescription} at ${Math.round(e.backoff.fraction * 100)}%`
                              : ''}
                          </T>
                          {old && old.prescription !== e.prescription ? (
                            <T size={13} style={{ color: c.accent }}>
                              Changed from {old.prescription}; affects future unstarted sessions
                              only.
                            </T>
                          ) : null}
                          {e.review ? (
                            <T size={12} muted>
                              {e.review}
                            </T>
                          ) : null}
                        </Stack>
                      );
                    })}
                  </Stack>
                ))}
                <T size={13} muted>
                  Original values, formulas and legacy result cells are retained as provenance. No
                  historical sets or dates are inferred. Sheet writeback stays off until a test-copy
                  mapping is verified.
                </T>
                <Button title="Accept prescription version" onPress={() => void accept()} />
              </Stack>
            ) : null}
          </Stack>
        </>
      )}
    </Page>
  );
}
