import { describe, expect, it } from 'vitest';
import { demoState } from '../packages/core/fixtures';
import {
  acceptVersion,
  backoffLoad,
  createSession,
  exerciseBackoff,
  nextSlot,
  optionalNumber,
  workingTotals,
} from '../packages/core/training';
import { TrainingStore, ConflictError, type Persistence } from '../packages/core/store';
import {
  ATHLETE_MARKER,
  coachInputText,
  importSheet,
  parsePrescription,
  planWrite,
  type Sheet,
} from '../packages/core/sheets';
import { blankState, type AppState, type SourceMapping } from '../packages/core/model';
import {
  garminActivity,
  matchingSessions,
  mergeActivities,
  parseActivityFile,
} from '../packages/core/activities';
let nextId = 0;
const id = () => `id-${++nextId}`;
function fixture(scope = 'demo') {
  const state = demoState();
  state.scope = scope;
  const version = state.versions[0];
  const session = createSession(
    version,
    version.days[0],
    1,
    id,
    new Date('2026-11-17T20:00:00Z'),
    'Europe/Dublin',
  );
  return { state, version, session };
}
class Disk implements Persistence {
  state?: AppState;
  fail = false;
  async load() {
    return this.state ? structuredClone(this.state) : undefined;
  }
  async save(s: AppState) {
    if (this.fail) throw new Error('Disk full');
    this.state = structuredClone(s);
  }
}
describe('back-off calculation', () => {
  it.each([
    [180, 0.9, 162.5],
    [250, 0.9, 225],
    [170, 0.95, 162.5],
    [117.5, 1, 117.5],
    [75, 0.85, 65],
    [112.5, 0.9, 102.5],
    [0, 0.9, 0],
  ])('matches MROUND(%s × %s, 2.5)', (top, fraction, result) =>
    expect(backoffLoad(top, fraction)).toBe(result),
  );
  it('keeps empty top weights empty', () => {
    expect(backoffLoad(undefined, 0.9)).toBeUndefined();
    expect(backoffLoad(180, undefined)).toBeUndefined();
  });
  it('updates targets while leaving completed actual back-offs unchanged', () => {
    const { session, version } = fixture();
    const exercise = version.days[0].exercises[0];
    exercise.backoff!.fraction = 0.9;
    const sets = session.exercises[0].sets;
    sets[0].load = 180;
    sets[1].load = 160;
    sets[1].status = 'completed';
    expect(exerciseBackoff(exercise, sets)?.kg).toBe(162.5);
    sets[0].load = 200;
    expect(exerciseBackoff(exercise, sets)?.kg).toBe(180);
    expect(sets[1].load).toBe(160);
  });
  it('converts pounds before applying the verified kilogram rounding', () => {
    const { version, session } = fixture();
    session.exercises[0].sets[0].load = 396.8320719328;
    session.exercises[0].sets[0].loadUnit = 'lb';
    expect(exerciseBackoff(version.days[0].exercises[0], session.exercises[0].sets)?.kg).toBe(180);
  });
});
describe('journal invariants', () => {
  it('does not convert missing fields to zero', () => {
    expect(optionalNumber('')).toBeUndefined();
    expect(optionalNumber('  ')).toBeUndefined();
    expect(optionalNumber('0')).toBe(0);
    expect(optionalNumber('82,5')).toBe(82.5);
  });
  it('creates distinct repeated days and preserves all results', () => {
    const { version, session } = fixture();
    const repeat = createSession(version, version.days[0], 2, id, new Date(), 'Europe/Dublin');
    expect(repeat.id).not.toBe(session.id);
    expect(repeat.exercises[0].sets[0].id).not.toBe(session.exercises[0].sets[0].id);
    expect(repeat.round).toBe(2);
  });
  it('preserves started prescriptions after a coach update', () => {
    const { state, version, session } = fixture();
    state.sessions.push(session);
    const replacement = structuredClone(version);
    replacement.id = 'v2';
    replacement.days[0].exercises[0].prescription = '5x5';
    const updated = acceptVersion(state, replacement);
    expect(updated.sessions[0].prescription.exercises[0].prescription).toBe('4');
    expect(updated.versions).toHaveLength(2);
  });
  it('advances by sequence and round rather than calendar date', () => {
    const { state, version } = fixture();
    state.programme!.rounds = 2;
    for (const d of version.days) {
      const s = createSession(version, d, 1, id, new Date('2026-01-01'), 'Europe/Dublin');
      s.status = 'completed';
      state.sessions.push(s);
    }
    expect(nextSlot(state)?.round).toBe(2);
    expect(nextSlot(state)?.day.day).toBe(1);
  });
  it('keeps warm-up totals and failed/partial attempts distinct', () => {
    const { session } = fixture();
    session.exercises[0].sets = [
      { id: 'a', kind: 'warmup', load: 20, loadUnit: 'kg', reps: 5, status: 'completed' },
      { id: 'b', kind: 'top', load: 100, loadUnit: 'kg', reps: 2, status: 'partial' },
      { id: 'c', kind: 'working', load: 120, loadUnit: 'kg', reps: 0, status: 'failed' },
    ];
    expect(workingTotals(session)).toEqual({ warmupKg: 100, workingKg: 200, loggedSets: 2 });
  });
});
describe('durable save and sync', () => {
  it('survives process restart and retries an uncertain server success exactly once', async () => {
    const { state, session } = fixture('athlete');
    const disk = new Disk();
    const store = new TrainingStore(state, disk, id, () => 0);
    await store.addSession(session);
    await store.saveSession(session.id, (s) => ({ ...s, notes: 'missed final rep' }));
    const restart = new TrainingStore((await disk.load())!, disk, id, () => 2000);
    expect(restart.getSnapshot().sessions[0].notes).toBe('missed final rep');
    const receipts = new Set<string>();
    let calls = 0;
    const transport = {
      async apply(op: AppState['outbox'][number]) {
        if (!receipts.has(op.id)) {
          receipts.add(op.id);
          calls++;
          if (calls === 1) throw new Error('Response lost after commit');
        }
      },
    };
    await restart.sync(transport);
    await restart.retry();
    await restart.sync(transport);
    expect(receipts.size).toBe(2);
    expect(calls).toBe(2);
    expect(restart.getSnapshot().outbox).toHaveLength(0);
  });
  it('never claims a device save if persistence fails', async () => {
    const { state, session } = fixture();
    const disk = new Disk();
    disk.fail = true;
    const store = new TrainingStore(state, disk, id);
    await expect(store.addSession(session)).rejects.toThrow('Disk full');
    expect(store.getSnapshot().sessions).toHaveLength(0);
    expect(store.getError()).toContain('Could not save');
  });
  it('holds a version conflict and its dependent operations', async () => {
    const { state, session } = fixture('athlete');
    const store = new TrainingStore(state, new Disk(), id);
    await store.addSession(session);
    await store.saveSession(session.id, (s) => ({ ...s, notes: 'next' }));
    let calls = 0;
    await store.sync({
      async apply() {
        calls++;
        throw new ConflictError();
      },
    });
    expect(calls).toBe(1);
    expect(store.getSnapshot().outbox[0].status).toBe('conflict');
    expect(store.getSnapshot().outbox).toHaveLength(2);
  });
  it('keeps session RPE at 1–7 separately from set RPE', async () => {
    const { state, session } = fixture();
    const store = new TrainingStore(state, new Disk(), id);
    await store.addSession(session);
    await expect(store.saveSession(session.id, (s) => ({ ...s, sessionRpe: 8 }))).rejects.toThrow(
      '1–7',
    );
    await store.saveSession(session.id, (s) => ({
      ...s,
      sessionRpe: 7,
      exercises: s.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, rpe: 10 })) })),
    }));
    expect(store.getSnapshot().sessions[0].sessionRpe).toBe(7);
  });
  it('never queues demo fixtures for a real account', async () => {
    const { state, session } = fixture();
    const store = new TrainingStore(state, new Disk(), id);
    await store.addSession(session);
    expect(store.getSnapshot().outbox).toHaveLength(0);
    expect(blankState('athlete').sessions).toHaveLength(0);
  });
});
describe('Sheets adapter and write protection', () => {
  it.each([
    ['3x8-12', { sets: 3, reps: 8, repsMax: 12 }],
    ['2-4x30-60s', { sets: 2, setsMax: 4, durationSeconds: 30, durationMaxSeconds: 60 }],
    ['3-5x400m', { sets: 3, setsMax: 5, distanceMetres: 400 }],
    ['3xAMRAP', { sets: 3, amrap: true }],
  ])('parses %s without guessing', (text, result) =>
    expect(parsePrescription(text as string)).toEqual(result),
  );
  it('retains ambiguous text', () =>
    expect(parsePrescription('3x3m countermovement jump').review).toBeTruthy());
  const mapping: SourceMapping = {
    workbookId: 'wb',
    sheetId: 0,
    title: 'Week 1',
    range: 'A1:N166',
    fingerprint: 'fingerprint',
    generation: 'block',
    round: 1,
    verified: true,
    writebackEnabled: true,
  };
  const job = {
    id: 'job',
    blockId: 'block',
    round: 1,
    sessionId: 'session',
    mapping,
    row: 9,
    exerciseName: 'Squat',
    expectedTop: '',
    expectedNotes: 'Pause at bottom',
    top: 180,
    notes: 'Missed rep',
  };
  const dest = {
    mapping,
    coachFingerprint: 'fingerprint',
    exerciseName: 'Squat',
    top: {},
    notes: { formattedValue: 'Pause at bottom' },
  };
  it('preserves mixed coach notes and only prepares explicit target values', () => {
    const plan = planWrite(job, dest);
    expect(plan.top).toBe(180);
    expect(plan.notes).toBe(`Pause at bottom${ATHLETE_MARKER}Round 1 · session\nMissed rep`);
  });
  it('rejects queued results after cell reuse or a different round', () => {
    expect(() =>
      planWrite(job, { ...dest, mapping: { ...mapping, generation: 'new-block' } }),
    ).toThrow('Stale');
    expect(() => planWrite(job, { ...dest, mapping: { ...mapping, round: 2 } })).toThrow('Stale');
  });
  it('rejects existing results and never replaces formulas', () => {
    expect(() => planWrite(job, { ...dest, top: { formattedValue: '200' } })).toThrow('existing');
    expect(() =>
      planWrite(job, { ...dest, top: { userEnteredValue: { formulaValue: '=A1' } } }),
    ).toThrow('Formula');
  });
  it('reconciles a response lost after successful write', () => {
    const plan = planWrite(job, dest);
    expect(
      planWrite(job, {
        ...dest,
        top: { effectiveValue: { numberValue: 180 } },
        notes: { formattedValue: plan.notes },
      }).alreadyApplied,
    ).toBe(true);
  });
  it('ignores app result writes and expected formula recalculation in coach digest', () => {
    const sheet: Sheet = {
      properties: { sheetId: 0, title: 'Week 1' },
      data: [
        {
          startRow: 8,
          rowData: [
            {
              values: [
                {},
                {},
                { userEnteredValue: { stringValue: 'Squat' } },
                { userEnteredValue: { stringValue: '4' } },
                {},
                { userEnteredValue: { numberValue: 180 } },
                { userEnteredValue: { numberValue: 0.9 } },
                {
                  userEnteredValue: { formulaValue: '=MROUND(F1*G1,2.5)' },
                  effectiveValue: { numberValue: 162.5 },
                },
                {},
                {},
                { userEnteredValue: { stringValue: 'Coach' } },
              ],
            },
          ],
        },
      ],
    };
    const before = coachInputText(sheet);
    sheet.data![0].rowData![0].values![5] = { userEnteredValue: { numberValue: 200 } };
    sheet.data![0].rowData![0].values![7].effectiveValue = { numberValue: 180 };
    sheet.data![0].rowData![0].values![10] = {
      userEnteredValue: { stringValue: `Coach${ATHLETE_MARKER}athlete` },
    };
    expect(coachInputText(sheet)).toBe(before);
  });
});
describe('activity import and matching', () => {
  const raw = {
    activityId: 123,
    activityName: 'Evening run',
    startTimeGMT: '2026-11-17 20:00:00',
    activityType: { typeKey: 'running' },
    duration: 1200,
    distance: 4000,
  };
  it('deduplicates stable external IDs and retains manual matches', () => {
    const a = garminActivity(raw);
    a.matchedSessionId = 'logged';
    expect(mergeActivities([a], [garminActivity(raw)])).toHaveLength(1);
    expect(mergeActivities([a], [garminActivity(raw)])[0].matchedSessionId).toBe('logged');
  });
  it('offers a reviewable match without creating another workout', () => {
    const { session } = fixture();
    session.sport = 'running';
    const a = garminActivity(raw);
    expect(matchingSessions(a, [session])).toHaveLength(1);
    expect(a.matchedSessionId).toBeUndefined();
  });
  it('imports actual TCX timestamps and summary detail', async () => {
    const [a] = await parseActivityFile(
      '<TrainingCenterDatabase><Activities><Activity Sport="Running"><Id>2026-11-17T20:00:00Z</Id><Lap><TotalTimeSeconds>120</TotalTimeSeconds><DistanceMeters>400</DistanceMeters></Lap></Activity></Activities></TrainingCenterDatabase>',
      'run.tcx',
    );
    expect(a.durationSeconds).toBe(120);
    expect(a.distanceMetres).toBe(400);
    expect(a.startedAt).toBe('2026-11-17T20:00:00.000Z');
  });
});
