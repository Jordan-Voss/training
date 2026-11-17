import React, { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Plus } from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';
import { useRuntime, useTraining } from '../../src/data/runtime';
import type { Interval, Session, Sport } from '../../packages/core/model';
import { newSet, optionalNumber, sportLabels, workingTotals } from '../../packages/core/training';
import {
  Button,
  Choice,
  Divider,
  Field,
  Page,
  Row,
  Stack,
  SyncLine,
  T,
} from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';
import { WorkoutExercise } from '../../src/ui/WorkoutExercise';
export default function Workout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useTraining();
  const { store, run, sync, deviceSaving } = useRuntime();
  const c = useTheme();
  const session = state.sessions.find((s) => s.id === id);
  const [finishing, setFinishing] = useState(false);
  const [newName, setNewName] = useState('');
  if (!session)
    return (
      <Page title="Session unavailable">
        <T>This session is not stored for the current account.</T>
        <Button title="Back to Today" onPress={() => router.replace('/')} />
      </Page>
    );
  const readOnly = session.status !== 'inProgress';
  const totals = workingTotals(session);
  function patch(patch: Partial<Session>) {
    void run(() => store.saveSession(id, (s) => ({ ...s, ...patch })));
  }
  function numeric(
    key: 'durationSeconds' | 'distanceMetres' | 'averageHeartRate' | 'elevationMetres',
    value: string,
  ) {
    try {
      patch({ [key]: optionalNumber(value, 10000000) });
    } catch (error) {
      void run(async () => {
        throw error;
      });
    }
  }
  async function finish() {
    const done = await run(async () => {
      await store.saveSession(id, (s) => ({
        ...s,
        status: 'completed',
        finishedAt: new Date().toISOString(),
      }));
      return true;
    });
    if (done) {
      void sync();
      router.replace('/history');
    }
  }
  function addExercise() {
    if (!newName.trim()) return;
    void run(() =>
      store.saveSession(id, (s) => {
        const prescriptionId = randomUUID();
        return {
          ...s,
          exercises: [
            ...s.exercises,
            {
              id: randomUUID(),
              prescriptionId,
              substitution: newName.trim(),
              notes: 'Additional exercise',
              sets: [newSet(randomUUID)],
            },
          ],
        };
      }),
    );
    setNewName('');
  }
  const activity =
    !!session.sourceActivity ||
    session.sport === 'tagRugby' ||
    ['running', 'cycling', 'rowing', 'skiErg'].includes(session.sport);
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: c.background }}
    >
      <View
        style={{
          backgroundColor: c.surface,
          paddingHorizontal: c.compact ? 16 : 40,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: c.divider,
        }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            onPress={() => router.back()}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <ChevronLeft size={20} color={c.accent} />
            <T style={{ color: c.accent }}>Today</T>
          </Pressable>
          <T weight="600">{session.day ? `Day ${session.day}` : session.title}</T>
          <T size={12} muted>
            {readOnly ? 'Completed' : 'In progress'}
          </T>
        </Row>
      </View>
      <Page
        title={session.title}
        subtitle={`${session.day ? `Round ${session.round} · ` : ''}${session.trainingDate} · ${sportLabels[session.sport]}`}
        action={<SyncLine />}
        hideTitle={c.compact}
      >
        {c.compact ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <T size={12} muted>
              Round {session.round} · {session.trainingDate}
            </T>
            <T size={12} muted>
              {state.scope === 'demo' ? 'Local demo · ' : ''}
              {deviceSaving ? 'Saving…' : 'Saved on device'}
            </T>
          </Row>
        ) : null}
        {session.prescription.coachNotes && state.scope !== 'demo' ? (
          <T muted>{session.prescription.coachNotes}</T>
        ) : null}
        <Stack gap={24} style={{ maxWidth: 950, width: '100%' }}>
          {activity ? (
            <Stack gap={16}>
              <T size={20} weight="600">
                Activity log
              </T>
              {session.sport === 'tagRugby' ? (
                <Choice
                  label="Rugby activity"
                  value={session.classification ?? 'training'}
                  options={[
                    { value: 'training', label: 'Training' },
                    { value: 'match', label: 'Match' },
                  ]}
                  onChange={(classification) => !readOnly && patch({ classification })}
                />
              ) : null}
              <Field
                label="Duration (minutes)"
                numeric
                disabled={readOnly}
                value={
                  session.durationSeconds === undefined
                    ? undefined
                    : String(session.durationSeconds / 60)
                }
                onChange={(v) => {
                  try {
                    const minutes = optionalNumber(v, 10000);
                    patch({ durationSeconds: minutes === undefined ? undefined : minutes * 60 });
                  } catch (error) {
                    void run(async () => {
                      throw error;
                    });
                  }
                }}
              />
              {session.sport !== 'tagRugby' ? (
                <Field
                  label="Distance (metres)"
                  numeric
                  disabled={readOnly}
                  value={session.distanceMetres?.toString()}
                  onChange={(v) => numeric('distanceMetres', v)}
                />
              ) : null}
              <Field
                label="Average heart rate (optional)"
                numeric
                disabled={readOnly}
                value={session.averageHeartRate?.toString()}
                onChange={(v) => numeric('averageHeartRate', v)}
              />
              {session.sport === 'running' || session.sport === 'cycling' ? (
                <Field
                  label="Elevation gain (metres, optional)"
                  numeric
                  disabled={readOnly}
                  value={session.elevationMetres?.toString()}
                  onChange={(v) => numeric('elevationMetres', v)}
                />
              ) : null}
              <T weight="600">Intervals</T>
              {(session.intervals ?? []).map((interval, i) => (
                <Row key={interval.id} style={{ alignItems: 'flex-start' }}>
                  <T muted style={{ paddingTop: 30 }}>
                    {i + 1}
                  </T>
                  {(['durationSeconds', 'distanceMetres', 'recoverySeconds'] as const).map(
                    (key) => (
                      <View key={key} style={{ flex: 1, minWidth: 95 }}>
                        <Field
                          label={
                            {
                              durationSeconds: 'Work (sec)',
                              distanceMetres: 'Distance (m)',
                              recoverySeconds: 'Recovery (sec)',
                            }[key]
                          }
                          numeric
                          disabled={readOnly}
                          value={interval[key]?.toString()}
                          onChange={(v) => {
                            try {
                              const number = optionalNumber(v);
                              patch({
                                intervals: session.intervals!.map((x) =>
                                  x.id === interval.id ? { ...x, [key]: number } : x,
                                ),
                              });
                            } catch (error) {
                              void run(async () => {
                                throw error;
                              });
                            }
                          }}
                        />
                      </View>
                    ),
                  )}
                </Row>
              ))}
              {!readOnly ? (
                <Button
                  title="Add interval"
                  secondary
                  onPress={() =>
                    patch({ intervals: [...(session.intervals ?? []), { id: randomUUID() }] })
                  }
                />
              ) : null}
            </Stack>
          ) : null}
          {session.exercises.map((result, i) => {
            const prescription = session.prescription.exercises.find(
              (e) => e.id === result.prescriptionId,
            ) ?? {
              id: result.prescriptionId,
              name: result.substitution ?? 'Additional exercise',
              order: String.fromCharCode(65 + i),
              sport: session.sport,
              prescription: 'Additional work',
            };
            return (
              <WorkoutExercise
                key={result.id}
                session={session}
                result={result}
                exercise={prescription}
                initialOpen={i === 0}
                readOnly={readOnly}
              />
            );
          })}
          {!activity && !readOnly ? (
            <Row style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Additional exercise"
                  value={newName}
                  onChange={setNewName}
                  placeholder="Exercise name"
                />
              </View>
              <Button title="Add exercise" secondary onPress={addExercise} />
            </Row>
          ) : null}
          <Field
            label="Session notes"
            value={session.notes}
            multiline
            disabled={readOnly}
            onChange={(notes) => patch({ notes })}
          />
          {!readOnly ? (
            <>
              <Row>
                <Field
                  label="Local training date (YYYY-MM-DD)"
                  value={session.trainingDate}
                  onChange={(trainingDate) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(trainingDate)) patch({ trainingDate });
                  }}
                />
                <Field
                  label="Scheduled date (optional, YYYY-MM-DD)"
                  value={session.scheduledDate}
                  onChange={(scheduledDate) => {
                    if (!scheduledDate || /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate))
                      patch({ scheduledDate: scheduledDate || undefined });
                  }}
                />
              </Row>
              <T size={13} muted>
                Training timezone: {session.timezone}. Actual start and finish timestamps are
                retained separately.
              </T>
            </>
          ) : null}
          <Divider />
          <T size={14} muted>
            {totals.loggedSets} logged sets · {totals.workingKg.toLocaleString('en-IE')} kg working
            volume · {totals.warmupKg.toLocaleString('en-IE')} kg warm-up volume
          </T>
          {readOnly ? (
            <>
              <T>Session RPE: {session.sessionRpe ?? 'Not recorded'} / 7</T>
              <Button
                title="Back to History"
                secondary
                onPress={() => router.replace('/history')}
              />
            </>
          ) : !c.compact ? (
            <Row>
              <Button title="Finish workout" onPress={() => setFinishing(true)} />
              <Button title="Save & leave" secondary onPress={() => router.replace('/')} />
            </Row>
          ) : null}
        </Stack>
      </Page>
      {c.compact && !readOnly ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: c.divider,
            backgroundColor: c.surface,
          }}
        >
          <Button title="Finish workout" onPress={() => setFinishing(true)} />
        </View>
      ) : null}
      <Modal
        visible={finishing}
        animationType="none"
        transparent
        onRequestClose={() => setFinishing(false)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 }}
        >
          <Stack
            gap={20}
            style={{
              padding: 24,
              backgroundColor: c.surface,
              borderRadius: 12,
              maxWidth: 600,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <T size={22} weight="600">
              Finish this session
            </T>
            <T muted>
              Unlogged, partial and failed sets keep their own status. Session RPE is optional and
              uses your coach’s 1–7 scale.
            </T>
            <Choice
              label="Session RPE"
              value={session.sessionRpe ?? 0}
              options={[
                { value: 0, label: 'Not recorded' },
                ...[1, 2, 3, 4, 5, 6, 7].map((value) => ({ value, label: String(value) })),
              ]}
              onChange={(value) => patch({ sessionRpe: value || undefined })}
            />
            <Button title="Save to History" onPress={() => void finish()} />
            <Row>
              <Button title="Keep training" secondary onPress={() => setFinishing(false)} />
              <Button
                title="Skip this session"
                secondary
                onPress={() =>
                  void run(async () => {
                    await store.saveSession(id, (s) => ({
                      ...s,
                      status: 'skipped',
                      finishedAt: new Date().toISOString(),
                    }));
                    router.replace('/history');
                  })
                }
              />
            </Row>
          </Stack>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
