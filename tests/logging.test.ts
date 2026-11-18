import { describe, expect, it } from 'vitest';
import { demoState } from '../packages/core/fixtures';
import type { AppState } from '../packages/core/model';
import { TrainingStore } from '../packages/core/store';
import {
  addWarmup,
  createSession,
  fillBackoffs,
  fixedReps,
  setAttempt,
  setPrescription,
} from '../packages/core/training';
let sequence = 0;
const id = () => `logging-${++sequence}`;
function fixture() {
  const state = demoState();
  const version = state.versions[0];
  const session = createSession(version, version.days[0], 1, id, new Date(), 'Europe/Dublin');
  session.prescription.exercises[0].backoff!.fraction = 0.9;
  return { state, session, exercise: session.prescription.exercises[0] };
}
describe('prescription-led logging', () => {
  it('uses the separate top and back-off prescriptions while leaving ranges open', () => {
    const { session, exercise } = fixture();
    expect(fixedReps(setPrescription(exercise, session.exercises[0].sets[0]))).toBe(4);
    expect(fixedReps(setPrescription(exercise, session.exercises[0].sets[1]))).toBe(2);
    expect(fixedReps(session.prescription.exercises[2].parsed)).toBeUndefined();
    expect(fixedReps({ amrap: true })).toBeUndefined();
    expect(fixedReps({ reps: 3, review: 'Ambiguous' })).toBeUndefined();
  });
  it('records fixed reps only after completion and puts a missed-rep deviation in notes', () => {
    const { session, exercise } = fixture();
    const original = session.exercises[0].sets[0];
    const completed = setAttempt(exercise, original, 'completed');
    expect(original.reps).toBeUndefined();
    expect(completed.reps).toBe(4);
    expect(completed.repsSource).toBe('prescription');
    const missed = setAttempt(exercise, { ...completed, notes: 'Missed the last rep' }, 'partial');
    expect(missed.notes).toBe('Missed the last rep');
    expect(missed.reps).toBeUndefined();
    expect(missed.status).toBe('partial');
    expect(exercise.parsed?.reps).toBe(4);
  });
  it('does not invent a ranged rep result or overwrite earlier explicitly logged reps', () => {
    const { session, exercise } = fixture();
    const accessory = session.prescription.exercises[2];
    expect(setAttempt(accessory, session.exercises[2].sets[0], 'completed').reps).toBeUndefined();
    expect(
      setAttempt(exercise, { ...session.exercises[0].sets[0], reps: 3 }, 'completed').reps,
    ).toBe(3);
  });
  it('persists prefilled loads and confirmed reps before queueing, then updates only remaining sets', async () => {
    const { state, session, exercise } = fixture();
    state.scope = 'athlete';
    let disk: AppState | undefined;
    const store = new TrainingStore(
      state,
      {
        load: async () => disk,
        save: async (s) => {
          disk = structuredClone(s);
        },
      },
      id,
    );
    await store.addSession(session);
    await store.saveSession(session.id, (s) => {
      s.exercises[0].sets[0].load = 180;
      return s;
    });
    const first = store.getSnapshot().sessions[0].exercises[0];
    expect(
      first.sets.slice(1).every((set) => set.load === 162.5 && set.loadSource === 'topSet'),
    ).toBe(true);
    expect(first.sets[1].reps).toBeUndefined();
    await store.saveSession(session.id, (s) => {
      s.exercises[0].sets[1] = setAttempt(exercise, s.exercises[0].sets[1], 'completed');
      return s;
    });
    await store.saveSession(session.id, (s) => {
      s.exercises[0].sets[0].load = 200;
      return s;
    });
    const saved = disk!.sessions[0].exercises[0].sets;
    expect(saved[1]).toMatchObject({ load: 162.5, reps: 2, status: 'completed' });
    expect(saved[2]).toMatchObject({ load: 180, status: 'unlogged' });
    expect(disk!.outbox.at(-1)?.session.exercises[0].sets).toEqual(saved);
    expect(disk!.sessions[0].prescription).toEqual(session.prescription);
  });
  it('preserves manual and legacy unlogged weights while clearing empty automatic targets', () => {
    const { session, exercise } = fixture();
    const result = session.exercises[0];
    result.sets[0].load = 200;
    result.sets[1] = { ...result.sets[1], load: 175, loadSource: 'manual' };
    result.sets[2].load = 177.5;
    let next = fillBackoffs(exercise, result);
    expect(next.sets[1].load).toBe(175);
    expect(next.sets[2].load).toBe(177.5);
    expect(next.sets[3].load).toBe(180);
    next.sets[0].load = undefined;
    next = fillBackoffs(exercise, next);
    expect(next.sets[3].load).toBeUndefined();
    expect(next.sets[1].load).toBe(175);
  });
  it('adds warm-ups before work, reusing chosen reps without inventing load or completion', () => {
    const { session } = fixture();
    let result = addWarmup(session.exercises[0], id);
    expect(result.sets[0].kind).toBe('warmup');
    expect(result.sets[1].kind).toBe('top');
    result.sets[0] = { ...result.sets[0], load: 20, reps: 5, status: 'completed' };
    const next = addWarmup(result, id);
    expect(next.sets.slice(0, 3).map((set) => set.kind)).toEqual(['warmup', 'warmup', 'top']);
    expect(next.sets[1]).toMatchObject({ reps: 5, status: 'unlogged' });
    expect(next.sets[1].load).toBeUndefined();
    expect(next.sets[1].id).not.toBe(next.sets[0].id);
  });
});
