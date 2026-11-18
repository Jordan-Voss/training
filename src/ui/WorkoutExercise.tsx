import React, { useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Camera, Check, ChevronDown, ChevronUp, Plus, Video, X } from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';
import type {
  ActualSet,
  Exercise,
  ExerciseResult,
  Session,
  SetKind,
} from '../../packages/core/model';
import {
  exerciseBackoff,
  addWarmup,
  fillBackoffs,
  fixedReps,
  newSet,
  optionalNumber,
  previousExercise,
  setAttempt,
  setPrescription,
} from '../../packages/core/training';
import { parsePrescription } from '../../packages/core/sheets';
import { useRuntime, useTraining } from '../data/runtime';
import { resolveVideoUri, selectVideo } from '../data/videos';
import { VideoPlayer } from './VideoPlayer';
import { Button, Choice, Divider, Field, Row, Stack, T } from './components';
import { useTheme } from './theme';
const kindLabels: Record<SetKind, string> = {
  warmup: 'Warm-up',
  working: 'Working',
  top: 'Top',
  backoff: 'Back-off',
  drop: 'Drop',
};
export function WorkoutExercise({
  session,
  exercise,
  result: originalResult,
  initialOpen = false,
  readOnly = false,
}: {
  session: Session;
  exercise: Exercise;
  result: ExerciseResult;
  initialOpen?: boolean;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [detail, setDetail] = useState<string>();
  const [play, setPlay] = useState<string>();
  const [focusLoad, setFocusLoad] = useState<string>();
  const [focusNotes, setFocusNotes] = useState(false);
  const [componentName, setComponentName] = useState('');
  const [componentPrescription, setComponentPrescription] = useState('');
  const { store, run } = useRuntime();
  const state = useTraining();
  const c = useTheme();
  const result = readOnly ? originalResult : fillBackoffs(exercise, originalResult);
  const prev = previousExercise(state, session, exercise);
  const target = exerciseBackoff(exercise, result.sets);
  const actual = result.sets.find((s) => s.id === detail);
  const definitions = exercise.components ?? result.components ?? [];
  function update(change: (r: ExerciseResult) => ExerciseResult) {
    void run(() =>
      store.saveSession(session.id, (s) => ({
        ...s,
        exercises: s.exercises.map((e) => (e.id === result.id ? change(e) : e)),
      })),
    );
  }
  function setField<K extends keyof ActualSet>(id: string, key: K, value: ActualSet[K]) {
    update((e) => ({
      ...e,
      sets: e.sets.map((s) =>
        s.id === id
          ? key === 'status'
            ? setAttempt(exercise, s, value as ActualSet['status'])
            : {
                ...s,
                [key]: value,
                ...(key === 'load' || key === 'loadUnit' || key === 'loadMode'
                  ? { loadSource: 'manual' as const }
                  : {}),
              }
          : s,
      ),
    }));
  }
  function numeric(
    id: string,
    key:
      | 'load'
      | 'reps'
      | 'rpe'
      | 'rir'
      | 'restSeconds'
      | 'durationSeconds'
      | 'distanceMetres'
      | 'contacts'
      | 'boxHeightCm'
      | 'jumpHeightCm'
      | 'measuredDistanceCm',
    value: string,
  ) {
    try {
      setField(id, key, optionalNumber(value, key === 'rpe' ? 10 : 1000000));
    } catch (error) {
      void run(async () => {
        throw error;
      });
    }
  }
  function copy() {
    const last =
      result.sets.findLast(
        (s) => s.load !== undefined || s.reps !== undefined || s.durationSeconds !== undefined,
      ) ?? result.sets.at(-1);
    if (last)
      update((e) => ({
        ...e,
        sets:
          last.kind === 'warmup'
            ? [
                ...e.sets.filter((set) => set.kind === 'warmup'),
                { ...last, id: randomUUID(), status: 'unlogged' },
                ...e.sets.filter((set) => set.kind !== 'warmup'),
              ]
            : [...e.sets, { ...last, id: randomUUID(), status: 'unlogged' }],
      }));
  }
  return (
    <Stack
      gap={16}
      style={{ borderBottomWidth: 1, borderBottomColor: c.divider, paddingBottom: 24 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${exercise.name}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 50 }}
      >
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Stack gap={4} style={{ flex: 1 }}>
            <T size={22} weight="600">
              {result.substitution ?? exercise.name}
            </T>
            <T muted size={14}>
              {result.group ? `${result.group.type} ${result.group.label} · ` : ''}
              {exercise.order} · {exercise.prescription || 'Prescription to review'}
              {exercise.rpe ? ` @ RPE ${exercise.rpe}` : ''}
              {exercise.backoff ? ` · Back-off ${exercise.backoff.prescription}` : ''}
            </T>
          </Stack>
          {open ? (
            <ChevronUp size={20} color={c.secondary} />
          ) : (
            <ChevronDown size={20} color={c.secondary} />
          )}
        </Row>
      </Pressable>
      {open ? (
        <>
          <Stack gap={8}>
            {exercise.coachNotes ? (
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: c.accent,
                  padding: 12,
                  backgroundColor: c.selected,
                  borderRadius: 5,
                }}
              >
                <T size={14}>{exercise.coachNotes}</T>
              </View>
            ) : null}
            {exercise.review || exercise.parsed?.review ? (
              <T muted size={13}>
                Review: {exercise.review ?? exercise.parsed?.review}
              </T>
            ) : null}
            {exercise.demoUrl ? (
              <Button
                title="View exercise demonstration"
                secondary
                onPress={() => void Linking.openURL(exercise.demoUrl!)}
              />
            ) : null}
            <T size={13} muted>
              {prev
                ? `Previous · ${prev.session.trainingDate}: ${prev
                    .result!.sets.filter((s) => s.status !== 'unlogged')
                    .map(
                      (s) =>
                        `${s.load ?? 'BW'} ${s.load !== undefined ? s.loadUnit : ''} × ${s.reps ?? '—'}${s.status === 'partial' ? ' (partial)' : s.status === 'failed' ? ' (failed)' : ''}`,
                    )
                    .join(' · ')}`
                : 'Previous: No previous sets recorded'}
            </T>
          </Stack>
          {definitions.length ? (
            <Stack gap={4}>
              <T weight="600" size={14}>
                Complex components, in order
              </T>
              {definitions.map((component, i) => (
                <T key={component.id} size={14}>
                  {i + 1}. {component.name} · {component.prescription}
                </T>
              ))}
            </Stack>
          ) : null}
          {exercise.backoff ? (
            <Stack gap={6} style={{ padding: 12, backgroundColor: c.selected, borderRadius: 8 }}>
              <T size={14} weight="600">
                Back-off target:{' '}
                {target ? `${target.display} ${target.unit}` : 'Enter a top-set weight'}
              </T>
              <T muted size={13}>
                {Math.round(exercise.backoff.fraction * 100)}% of your top set · Rounded to{' '}
                {exercise.backoff.increment} kg
              </T>
              <T muted size={13}>
                Back-off loads fill automatically. Logged sets keep their recorded load.
              </T>
            </Stack>
          ) : null}
          {!readOnly ? (
            <Row>
              <Button
                small
                title="Add warm-up"
                icon={<Plus size={16} color={c.accent} />}
                secondary
                onPress={() => {
                  const id = randomUUID();
                  setFocusLoad(id);
                  update((e) => addWarmup(e, () => id));
                }}
              />
            </Row>
          ) : null}
          <View
            style={{
              borderWidth: 1,
              borderColor: c.divider,
              borderRadius: 8,
              overflow: 'hidden',
              backgroundColor: c.surface,
            }}
          >
            <Row style={{ backgroundColor: c.background, padding: 10, gap: 8, flexWrap: 'nowrap' }}>
              <T size={11} weight="600" muted style={{ width: c.compact ? 64 : 95 }}>
                SET
              </T>
              <T size={11} weight="600" muted style={{ flex: 1, textAlign: 'center' }}>
                LOAD
              </T>
              <T size={11} weight="600" muted style={{ flex: 1, textAlign: 'center' }}>
                {exercise.parsed?.durationSeconds
                  ? 'SEC'
                  : exercise.parsed?.distanceMetres
                    ? 'METRES'
                    : 'REPS'}
              </T>
              <T size={11} weight="600" muted style={{ width: 44, textAlign: 'center' }}>
                DONE
              </T>
              <View style={{ width: 44 }} />
            </Row>
            {result.sets.map((set, index) => {
              const prescription = setPrescription(exercise, set);
              const prescribedReps = fixedReps(prescription);
              return (
                <Row
                  key={set.id}
                  style={{
                    padding: 8,
                    gap: 8,
                    flexWrap: 'nowrap',
                    borderTopWidth: 1,
                    borderTopColor: c.divider,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${exercise.name} set ${index + 1} details`}
                    onPress={() => {
                      setFocusNotes(false);
                      setDetail(set.id);
                    }}
                    style={{ width: c.compact ? 64 : 95, minHeight: 44, justifyContent: 'center' }}
                  >
                    <T size={12} weight="500">
                      {kindLabels[set.kind]}
                    </T>
                    <T size={11} muted>
                      {set.loadMode === 'bodyweight'
                        ? 'BW'
                        : set.loadMode === 'assisted'
                          ? `Assisted ${set.loadUnit}`
                          : set.loadUnit}
                    </T>
                  </Pressable>
                  <Field
                    compact
                    numeric
                    label={`${exercise.name} set ${index + 1} load`}
                    value={set.load?.toString()}
                    autoFocus={focusLoad === set.id}
                    placeholder={set.kind === 'backoff' && target ? String(target.display) : '—'}
                    disabled={readOnly || set.loadMode === 'bodyweight'}
                    onChange={(v) => numeric(set.id, 'load', v)}
                  />
                  {prescribedReps !== undefined ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Note missed reps for ${exercise.name} set ${index + 1}`}
                      onPress={() => {
                        setFocusNotes(true);
                        setDetail(set.id);
                      }}
                      style={{
                        flex: 1,
                        minWidth: 52,
                        minHeight: 44,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <T size={16} weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                        {set.reps !== undefined && (readOnly || set.reps !== prescribedReps)
                          ? set.reps
                          : prescribedReps}
                      </T>
                      <T size={10} muted>
                        {set.reps !== undefined && set.reps !== prescribedReps
                          ? `recorded · Rx ${prescribedReps}`
                          : readOnly && set.reps !== undefined
                            ? 'recorded'
                            : 'prescribed'}
                      </T>
                    </Pressable>
                  ) : (
                    <Field
                      compact
                      numeric
                      label={`${exercise.name} set ${index + 1} ${prescription?.durationSeconds ? 'seconds' : prescription?.distanceMetres ? 'metres' : 'reps'}`}
                      placeholder={
                        prescription?.repsMax !== undefined
                          ? `${prescription.reps}–${prescription.repsMax}`
                          : prescription?.amrap
                            ? 'AMRAP'
                            : '—'
                      }
                      value={(prescription?.durationSeconds
                        ? set.durationSeconds
                        : prescription?.distanceMetres
                          ? set.distanceMetres
                          : set.reps
                      )?.toString()}
                      disabled={readOnly}
                      onChange={(v) =>
                        numeric(
                          set.id,
                          prescription?.durationSeconds
                            ? 'durationSeconds'
                            : prescription?.distanceMetres
                              ? 'distanceMetres'
                              : 'reps',
                          v,
                        )
                      }
                    />
                  )}
                  <Pressable
                    disabled={readOnly}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${exercise.name} set ${index + 1} completed`}
                    accessibilityState={{ checked: set.status === 'completed' }}
                    onPress={() =>
                      setField(
                        set.id,
                        'status',
                        set.status === 'completed' ? 'unlogged' : 'completed',
                      )
                    }
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: set.status === 'completed' ? c.selected : 'transparent',
                      borderRadius: 6,
                    }}
                  >
                    {set.status === 'completed' ? (
                      <Check size={22} color={c.accent} />
                    ) : set.status === 'failed' || set.status === 'partial' ? (
                      <T size={11} style={{ color: c.danger }}>
                        {set.status}
                      </T>
                    ) : (
                      <View
                        style={{
                          height: 20,
                          width: 20,
                          borderWidth: 1.5,
                          borderColor: c.secondary,
                          borderRadius: 4,
                        }}
                      />
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Attach video to ${exercise.name} set ${index + 1}`}
                    disabled={readOnly}
                    onPress={() => {
                      setFocusNotes(false);
                      setDetail(set.id);
                    }}
                    style={{
                      height: 44,
                      width: 44,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Camera
                      size={20}
                      color={state.media.some((m) => m.setId === set.id) ? c.accent : c.secondary}
                    />
                  </Pressable>
                </Row>
              );
            })}
          </View>
          {!readOnly ? (
            <>
              <Row style={{ gap: 8 }}>
                <Button
                  small
                  title={exercise.backoff ? 'Add back-off' : 'Add set'}
                  icon={<Plus size={16} color={c.accent} />}
                  secondary
                  onPress={() =>
                    update((e) => ({
                      ...e,
                      sets: [
                        ...e.sets,
                        newSet(randomUUID, exercise.backoff ? 'backoff' : 'working'),
                      ],
                    }))
                  }
                />
                <Button small title="Copy previous set" secondary onPress={copy} />
                <Button
                  small
                  title="Undo"
                  secondary
                  onPress={() => void run(() => store.undo(session.id))}
                />
              </Row>
              <T size={12} muted>
                Tick done for the prescribed reps. Tap the rep count to note missed reps or a
                change.
              </T>
              <Field
                label="Exercise notes"
                value={result.notes}
                onChange={(notes) => update((e) => ({ ...e, notes }))}
                multiline
              />
              <Field
                label="Substitute exercise (optional)"
                value={result.substitution}
                onChange={(substitution) =>
                  update((e) => ({ ...e, substitution: substitution || undefined }))
                }
              />
              <Choice
                label="Exercise group"
                value={result.group?.type ?? 'none'}
                options={[
                  { value: 'none', label: 'Individual exercise' },
                  { value: 'superset', label: 'Superset' },
                  { value: 'circuit', label: 'Circuit' },
                ]}
                onChange={(type) =>
                  update((e) => ({
                    ...e,
                    group: type === 'none' ? undefined : { type, label: e.group?.label ?? 'A' },
                  }))
                }
              />
              {result.group ? (
                <Field
                  label="Shared group label"
                  value={result.group.label}
                  onChange={(label) => update((e) => ({ ...e, group: { ...e.group!, label } }))}
                />
              ) : null}
              <T size={14} weight="600">
                Define complex components (optional)
              </T>
              <T size={12} muted>
                Enter components in order. This adds your interpretation alongside the original
                coach prescription.
              </T>
              <Field label="Component name" value={componentName} onChange={setComponentName} />
              <Field
                label="Component rep prescription"
                value={componentPrescription}
                onChange={setComponentPrescription}
              />
              <Button
                small
                secondary
                title="Add complex component"
                disabled={!componentName.trim() || !componentPrescription.trim()}
                onPress={() => {
                  update((e) => ({
                    ...e,
                    components: [
                      ...(e.components ?? []),
                      {
                        id: randomUUID(),
                        name: componentName.trim(),
                        prescription: componentPrescription.trim(),
                      },
                    ],
                  }));
                  setComponentName('');
                  setComponentPrescription('');
                }}
              />
            </>
          ) : result.notes ? (
            <T size={14}>{result.notes}</T>
          ) : null}
        </>
      ) : null}
      <Modal
        visible={!!actual}
        animationType="none"
        transparent
        onRequestClose={() => setDetail(undefined)}
      >
        <View
          style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 16 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{
              maxHeight: '90%',
              maxWidth: 650,
              width: '100%',
              alignSelf: 'center',
              backgroundColor: c.surface,
              borderRadius: 12,
            }}
            contentContainerStyle={{ padding: 20, gap: 16 }}
          >
            <Row style={{ justifyContent: 'space-between' }}>
              <T size={20} weight="600">
                Set details
              </T>
              <Button small title="Close" secondary onPress={() => setDetail(undefined)} />
            </Row>
            {actual ? (
              <>
                <T muted>
                  {exercise.name} · {kindLabels[actual.kind]}
                </T>
                {!readOnly ? (
                  <>
                    <Choice
                      label="Set type"
                      value={actual.kind}
                      options={Object.entries(kindLabels).map(([value, label]) => ({
                        value: value as SetKind,
                        label,
                      }))}
                      onChange={(v) => setField(actual.id, 'kind', v)}
                    />
                    <Choice
                      label="Attempt"
                      value={actual.status}
                      options={(
                        ['unlogged', 'completed', 'partial', 'failed', 'skipped'] as const
                      ).map((value) => ({ value, label: value }))}
                      onChange={(v) => setField(actual.id, 'status', v)}
                    />
                    <Field
                      label="Set notes / missed reps"
                      value={actual.notes}
                      autoFocus={focusNotes}
                      placeholder="e.g. Missed the last rep, or changed the prescribed work"
                      multiline
                      onChange={(v) => setField(actual.id, 'notes', v)}
                    />
                    {actual.loadSource === 'manual' &&
                    actual.kind === 'backoff' &&
                    actual.status === 'unlogged' ? (
                      <Button
                        title="Use calculated back-off load"
                        secondary
                        small
                        onPress={() => setField(actual.id, 'loadSource', 'topSet')}
                      />
                    ) : null}
                    <Choice
                      label="Load mode"
                      value={actual.loadMode ?? 'external'}
                      options={[
                        { value: 'external', label: 'External load' },
                        { value: 'bodyweight', label: 'Bodyweight' },
                        { value: 'assisted', label: 'Assisted' },
                      ]}
                      onChange={(v) => setField(actual.id, 'loadMode', v)}
                    />
                    <Choice
                      label="Load unit"
                      value={actual.loadUnit}
                      options={[
                        { value: 'kg', label: 'kg' },
                        { value: 'lb', label: 'lb' },
                      ]}
                      onChange={(v) => setField(actual.id, 'loadUnit', v)}
                    />
                    {(
                      ['rpe', 'rir', 'restSeconds', 'durationSeconds', 'distanceMetres'] as const
                    ).map((key) => (
                      <Field
                        key={key}
                        numeric
                        label={
                          {
                            rpe: 'Set RPE (1–10)',
                            rir: 'Reps in reserve',
                            restSeconds: 'Rest (seconds)',
                            durationSeconds: 'Duration (seconds)',
                            distanceMetres: 'Distance (metres)',
                          }[key]
                        }
                        value={actual[key]?.toString()}
                        onChange={(v) => numeric(actual.id, key, v)}
                      />
                    ))}
                    <Field
                      label="Tempo"
                      value={actual.tempo}
                      onChange={(v) => setField(actual.id, 'tempo', v)}
                    />
                    {definitions.length ? (
                      <Stack gap={12}>
                        <T weight="600">Complex component attempts</T>
                        {definitions.map((component) => {
                          const componentReps = fixedReps(
                            parsePrescription(component.prescription),
                          );
                          const entry = actual.components?.find(
                            (x) => x.componentId === component.id,
                          );
                          const patchComponent = (
                            patch: Partial<NonNullable<ActualSet['components']>[number]>,
                          ) => {
                            const current = {
                              componentId: component.id,
                              status: 'unlogged' as const,
                              ...entry,
                              ...patch,
                            };
                            const components = [
                              ...(actual.components ?? []).filter(
                                (x) => x.componentId !== component.id,
                              ),
                              current,
                            ];
                            update((e) => ({
                              ...e,
                              sets: e.sets.map((set) =>
                                set.id === actual.id
                                  ? setAttempt(
                                      exercise,
                                      { ...set, components },
                                      components.some(
                                        (x) => x.status === 'partial' || x.status === 'failed',
                                      )
                                        ? 'partial'
                                        : set.status,
                                    )
                                  : set,
                              ),
                            }));
                          };
                          return (
                            <Stack key={component.id} gap={8}>
                              <T size={14}>
                                {component.name} · Prescribed {component.prescription}
                              </T>
                              {componentReps !== undefined ? (
                                <T size={14}>
                                  Prescribed reps: {componentReps} · Record deviations in set notes.
                                </T>
                              ) : (
                                <Field
                                  numeric
                                  label={`${component.name} actual reps`}
                                  value={entry?.reps?.toString()}
                                  onChange={(v) => {
                                    try {
                                      patchComponent({ reps: optionalNumber(v) });
                                    } catch (error) {
                                      void run(async () => {
                                        throw error;
                                      });
                                    }
                                  }}
                                />
                              )}
                              <Choice
                                label={`${component.name} attempt`}
                                value={entry?.status ?? 'unlogged'}
                                options={(
                                  ['unlogged', 'completed', 'partial', 'failed'] as const
                                ).map((value) => ({ value, label: value }))}
                                onChange={(status) =>
                                  patchComponent({
                                    status,
                                    reps:
                                      componentReps !== undefined
                                        ? status === 'completed'
                                          ? componentReps
                                          : undefined
                                        : entry?.reps,
                                  })
                                }
                              />
                            </Stack>
                          );
                        })}
                      </Stack>
                    ) : null}
                    {exercise.sport === 'plyometrics' ? (
                      <>
                        <Divider />
                        <T weight="600">Plyometric measurements</T>
                        {(
                          ['contacts', 'boxHeightCm', 'jumpHeightCm', 'measuredDistanceCm'] as const
                        ).map((key) => (
                          <Field
                            key={key}
                            numeric
                            label={
                              {
                                contacts: 'Explicit contacts (optional)',
                                boxHeightCm: 'Box / drop height (cm)',
                                jumpHeightCm: 'Measured jump height (cm)',
                                measuredDistanceCm: 'Measured jump distance (cm)',
                              }[key]
                            }
                            value={actual[key]?.toString()}
                            onChange={(v) => numeric(actual.id, key, v)}
                          />
                        ))}
                        <Choice
                          label="Side"
                          value={actual.side ?? 'both'}
                          options={[
                            { value: 'both', label: 'Both' },
                            { value: 'left', label: 'Left' },
                            { value: 'right', label: 'Right' },
                          ]}
                          onChange={(v) => setField(actual.id, 'side', v)}
                        />
                        <Choice
                          label="Execution"
                          value={actual.execution ?? 'bilateral'}
                          options={[
                            { value: 'bilateral', label: 'Bilateral' },
                            { value: 'unilateral', label: 'Unilateral' },
                          ]}
                          onChange={(v) => setField(actual.id, 'execution', v)}
                        />
                        <Field
                          label="Surface"
                          value={actual.surface}
                          onChange={(v) => setField(actual.id, 'surface', v)}
                        />
                        <Field
                          label="Equipment"
                          value={actual.equipment}
                          onChange={(v) => setField(actual.id, 'equipment', v)}
                        />
                      </>
                    ) : null}
                    <Row>
                      <Button
                        secondary
                        title="Select video"
                        onPress={() => void run(() => selectVideo(store, session.id, actual.id))}
                      />
                      {Platform.OS !== 'web' ? (
                        <Button
                          secondary
                          title="Record set"
                          onPress={() =>
                            void run(() => selectVideo(store, session.id, actual.id, true))
                          }
                        />
                      ) : null}
                    </Row>
                    <T muted size={13}>
                      Videos remain on this device until uploaded. Uploads recover when Training is
                      open.
                    </T>
                  </>
                ) : null}
                {state.media
                  .filter((m) => m.setId === actual.id)
                  .map((m) => (
                    <Stack key={m.id} gap={8}>
                      <T size={14}>
                        {m.status === 'uploaded'
                          ? 'Private video uploaded'
                          : m.status === 'error'
                            ? m.error
                            : `Video · ${m.status} ${m.progress}%`}
                      </T>
                      <Button
                        title="Play set video"
                        secondary
                        onPress={() => void run(async () => setPlay(await resolveVideoUri(m)))}
                      />
                    </Stack>
                  ))}
                {play ? <VideoPlayer uri={play} /> : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </Stack>
  );
}
