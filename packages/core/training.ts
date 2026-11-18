import type {
  ActualSet,
  AppState,
  Attempt,
  Exercise,
  ExerciseResult,
  IdFactory,
  PrescriptionVersion,
  ParsedPrescription,
  Session,
  Sport,
  TrainingDay,
} from './model';
import { clone, stableJson } from './json';

export function optionalNumber(value: string, max = Number.POSITIVE_INFINITY): number | undefined {
  if (!value.trim()) return undefined;
  if (!/^\d*(?:[.,]\d*)?$/.test(value) || /^[.,]$/.test(value))
    throw new Error('Enter a positive number.');
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number) || number < 0 || number > max)
    throw new Error(`Enter a value between 0 and ${max}.`);
  return number;
}
/** Matches the workbook's positive MROUND(value, increment), including half-up ties. */
export function backoffLoad(
  top: number | undefined,
  fraction: number | undefined,
  increment = 2.5,
): number | undefined {
  if (top === undefined || fraction === undefined) return undefined;
  if (
    ![top, fraction, increment].every(Number.isFinite) ||
    top < 0 ||
    fraction <= 0 ||
    fraction > 1 ||
    increment <= 0
  )
    throw new Error('Invalid back-off rule.');
  return Number(
    (Math.floor((top * fraction) / increment + 0.5 + Number.EPSILON * 8) * increment).toFixed(5),
  );
}
export function exerciseBackoff(exercise: Exercise, sets: ActualSet[]) {
  const top = [...sets]
    .reverse()
    .find(
      (s) =>
        s.kind === 'top' &&
        s.loadMode !== 'bodyweight' &&
        s.loadMode !== 'assisted' &&
        s.load !== undefined &&
        s.status !== 'failed' &&
        s.status !== 'skipped',
    );
  // Source prescriptions use kilograms. Convert before rounding when the athlete enters pounds.
  const kg =
    top?.load === undefined ? undefined : top.loadUnit === 'lb' ? top.load * 0.45359237 : top.load;
  const result = backoffLoad(kg, exercise.backoff?.fraction, exercise.backoff?.increment);
  return result === undefined
    ? undefined
    : {
        kg: result,
        display: top?.loadUnit === 'lb' ? Number((result / 0.45359237).toFixed(2)) : result,
        unit: top?.loadUnit ?? 'kg',
      };
}
export function setPrescription(exercise: Exercise, set: ActualSet) {
  if (set.kind === 'warmup' || set.kind === 'drop') return undefined;
  return set.kind === 'backoff' ? exercise.backoff?.parsed : exercise.parsed;
}
export function fixedReps(prescription?: ParsedPrescription) {
  return prescription &&
    !prescription.review &&
    !prescription.amrap &&
    prescription.repsMax === undefined
    ? prescription.reps
    : undefined;
}
/** A completion confirms fixed prescribed reps; deviations retain notes, not invented rep counts. */
export function setAttempt(exercise: Exercise, set: ActualSet, status: Attempt): ActualSet {
  const next: ActualSet = {
    ...set,
    status:
      status === 'completed' &&
      set.components?.some(
        (component) => component.status === 'partial' || component.status === 'failed',
      )
        ? 'partial'
        : status,
  };
  const reps = fixedReps(setPrescription(exercise, set));
  if (
    next.status === 'completed' &&
    reps !== undefined &&
    (next.reps === undefined || next.repsSource === 'prescription')
  ) {
    next.reps = reps;
    next.repsSource = 'prescription';
  } else if (next.status !== 'completed' && next.repsSource === 'prescription') {
    next.reps = undefined;
    next.repsSource = undefined;
  }
  return next;
}
/** Fill only untouched/unlogged back-offs. Logged loads and deliberate overrides stay intact. */
export function fillBackoffs(exercise: Exercise, result: ExerciseResult): ExerciseResult {
  if (!exercise.backoff) return result;
  const target = exerciseBackoff(exercise, result.sets);
  return {
    ...result,
    sets: result.sets.map((set) => {
      if (
        set.kind !== 'backoff' ||
        set.status !== 'unlogged' ||
        set.loadSource === 'manual' ||
        (set.load !== undefined && set.loadSource !== 'topSet') ||
        set.loadMode === 'bodyweight' ||
        set.loadMode === 'assisted'
      )
        return set;
      return {
        ...set,
        load: target?.display,
        loadUnit: target?.unit ?? set.loadUnit,
        loadSource: target ? 'topSet' : undefined,
      };
    }),
  };
}
export function fillSessionBackoffs(session: Session): Session {
  if (session.status !== 'inProgress') return session;
  return {
    ...session,
    exercises: session.exercises.map((result) => {
      const exercise = session.prescription.exercises.find((e) => e.id === result.prescriptionId);
      return exercise ? fillBackoffs(exercise, result) : result;
    }),
  };
}
export function addWarmup(result: ExerciseResult, id: IdFactory): ExerciseResult {
  const warmups = result.sets.filter((set) => set.kind === 'warmup');
  const previous = warmups.at(-1);
  return {
    ...result,
    sets: [
      ...warmups,
      {
        ...newSet(id, 'warmup'),
        loadUnit: previous?.loadUnit ?? result.sets[0]?.loadUnit ?? 'kg',
        reps: previous?.reps,
      },
      ...result.sets.filter((set) => set.kind !== 'warmup'),
    ],
  };
}
export function activeVersion(state: AppState) {
  return state.versions.find((v) => v.id === state.programme?.activeVersionId);
}
export function nextSlot(state: AppState): { round: number; day: TrainingDay } | undefined {
  const v = activeVersion(state);
  if (!v || !state.programme) return;
  for (let round = 1; round <= state.programme.rounds; round++)
    for (const day of v.days) {
      if (
        !state.sessions.some(
          (s) =>
            s.blockId === state.programme!.id &&
            s.round === round &&
            s.dayId === day.id &&
            s.status !== 'inProgress',
        )
      )
        return { round, day };
    }
}
export function newSet(id: IdFactory, kind: ActualSet['kind'] = 'working'): ActualSet {
  return { id: id(), kind, loadUnit: 'kg', status: 'unlogged' };
}
export function createSession(
  version: PrescriptionVersion,
  day: TrainingDay,
  round: number,
  id: IdFactory,
  now: Date,
  timezone: string,
  scheduledDate?: string,
): Session {
  const existingDay = clone(day);
  return {
    id: id(),
    blockId: version.blockId,
    versionId: version.id,
    round,
    dayId: day.id,
    day: day.day,
    title: day.title,
    sport: day.sport,
    status: 'inProgress',
    startedAt: now.toISOString(),
    trainingDate: localDate(now, timezone),
    timezone,
    scheduledDate,
    prescription: existingDay,
    revision: 0,
    exercises: existingDay.exercises.map((e) => {
      const count = Math.min(e.parsed?.sets ?? 1, 20);
      const sets = Array.from({ length: count }, () =>
        newSet(id, e.defaultSetKind ?? (e.backoff ? 'top' : 'working')),
      );
      if (e.backoff)
        for (let i = 0; i < Math.min(e.backoff.parsed?.sets ?? 1, 20); i++)
          sets.push(newSet(id, 'backoff'));
      return { id: id(), prescriptionId: e.id, sets };
    }),
  };
}
export function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function acceptVersion(state: AppState, version: PrescriptionVersion, rounds = 4): AppState {
  if (!version.days.length || !Number.isInteger(rounds) || rounds < 1 || rounds > 52)
    throw new Error('Choose 1–52 rounds and at least one session.');
  // Started sessions contain their own frozen prescription; accepting a version never changes them.
  const known = state.versions.find((v) => v.id === version.id);
  if (known && stableJson(known) !== stableJson(version))
    throw new Error('Accepted prescriptions are immutable.');
  return {
    ...state,
    programme: { id: version.blockId, title: version.title, rounds, activeVersionId: version.id },
    versions: known ? state.versions : [...state.versions, clone(version)],
  };
}
export function workingTotals(session: Session) {
  const sets = session.exercises
    .flatMap((e) => e.sets)
    .filter((s) => s.status === 'completed' || s.status === 'partial');
  const sum = (kind: 'warmup' | 'working') =>
    sets
      .filter((s) => (kind === 'warmup' ? s.kind === 'warmup' : s.kind !== 'warmup'))
      .reduce(
        (total, s) =>
          total +
          (s.loadMode !== 'bodyweight' &&
          s.loadMode !== 'assisted' &&
          s.load !== undefined &&
          s.reps !== undefined
            ? s.load * (s.loadUnit === 'lb' ? 0.45359237 : 1) * s.reps
            : 0),
        0,
      );
  return { warmupKg: sum('warmup'), workingKg: sum('working'), loggedSets: sets.length };
}
export function previousExercise(state: AppState, session: Session, exercise: Exercise) {
  return [...state.sessions]
    .filter(
      (s) => s.id !== session.id && s.status === 'completed' && s.startedAt < session.startedAt,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) =>
      s.prescription.exercises
        .filter((e) => e.name.toLowerCase() === exercise.name.toLowerCase())
        .map((e) => ({ session: s, result: s.exercises.find((r) => r.prescriptionId === e.id) })),
    )
    .find((x) => x.result?.sets.some((s) => s.status !== 'unlogged'));
}
export const sportLabels: Record<Sport, string> = {
  strength: 'Strength',
  weightlifting: 'Weightlifting',
  plyometrics: 'Plyometrics',
  running: 'Run',
  cycling: 'Ride',
  rowing: 'Row',
  skiErg: 'SkiErg',
  tagRugby: 'Tag rugby',
};
export function manualDay(sport: Sport, id: IdFactory): TrainingDay {
  return {
    id: id(),
    day: 0,
    title: sportLabels[sport],
    sport,
    exercises:
      sport === 'strength' || sport === 'weightlifting' || sport === 'plyometrics'
        ? [
            {
              id: id(),
              name: sport === 'plyometrics' ? 'Pogos' : 'Exercise',
              order: 'A',
              sport,
              prescription: 'Self-directed',
            },
          ]
        : [],
  };
}
export function validateSession(s: Session) {
  if (
    s.sessionRpe !== undefined &&
    (!Number.isInteger(s.sessionRpe) || s.sessionRpe < 1 || s.sessionRpe > 7)
  )
    throw new Error('Session RPE must be 1–7.');
  for (const e of s.exercises)
    for (const set of e.sets) {
      if (set.rpe !== undefined && (set.rpe < 1 || set.rpe > 10))
        throw new Error('Set RPE must be 1–10.');
      for (const field of [
        'load',
        'reps',
        'rir',
        'restSeconds',
        'durationSeconds',
        'distanceMetres',
        'contacts',
        'boxHeightCm',
        'jumpHeightCm',
      ] as const)
        if (set[field] !== undefined && (!Number.isFinite(set[field]) || set[field]! < 0))
          throw new Error('Training values must be non-negative.');
    }
}
