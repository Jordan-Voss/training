import { blankState, type AppState, type Exercise, type PrescriptionVersion } from './model';
import { acceptVersion } from './training';
const rows: [string, string, string, number?, string?][][] = [
  [
    ['Comp Squat', '4', '6', 1, '3x2'],
    ['Push press', '4x2', '6'],
    ['Pull Ups', '3x8-10', '9–10'],
    ['Dips', '3x8-10', '9–10'],
    ['DB Hammer Curl', '3x10-15', '9–10'],
    ['Skullcrushers', '3x10-15', '9–10'],
    ['Front lever tuck', '3xAMRAP', '9–10'],
  ],
  [
    ['Power Clean/ Front squat', '3', '6', 1, '3x2'],
    ['Snatch grip DL', '5', '6', 0.95, '3-5x3'],
    ['DB Cossack squat', '2-3x10-15', '9–10'],
    ['Hamstring Curls', '2-3x10-15', '9–10'],
    ['Standing calf raise', '2-3x10-15', '9–10'],
  ],
  [
    ['Comp Bench', '5', '6', 0.95, '3-4x5'],
    ['Front squat', '3', '6', 1, '1-3x3'],
    ['Squat clean', '3', '6', 0.95, ''],
    ['Chest press machine', '3x8-12', '9–10'],
    ['Lat Pulldown', '3x8-12', '9–10'],
  ],
  [
    ['Snatch grip high pull', '3x6-8', '7–8'],
    ['DB incline Bench', '5', '8', 0.9, '3xAMRAP'],
    ['Bulgarian split squat', '2-3x8-12', '9–10'],
    ['DB RDL', '2-3x8-12', '9–10'],
  ],
  [
    ['Comp Deadlift', '4', '6', 0.9, '2-4x3'],
    ['Barbell RDL', '6', '7', 0.9, '2xAMRAP'],
    ['DB OHP', '3x8-12', '9–10'],
    ['Barbell Row', '3x8-12', '9–10'],
  ],
  [
    ['Overhead squat', '3', '6', 1, '3x2'],
    ['Comp Bench', '5', '6', 1, '4x3'],
    ['Hamstring Curls', '3x10-15', '9–10'],
  ],
  [
    ['Pause Squat', '2', '6', 0.9, '3x1'],
    ['Comp Deadlift', '8', '8', 0.85, '2x8'],
    ['Side plank', '2-4x30-60s', ''],
  ],
  [
    ['Hang squat clean', '3', '9–10', 1, '2-3x3'],
    ['Cable rotations', '3x3-5', '7–8'],
    ['DB Bent Over Row', '3x8-12', '9–10'],
  ],
  [
    ['Pause Deadlift', '2', '6', 0.9, '3x1'],
    ['Hack squat/ Leg press', '6', '8', 0.9, '2xAMRAP'],
    ['Lying leg raise', '3xAMRAP', '9–10'],
  ],
  [
    ['Overhead squat', '3', '6', 1, '2-4x3'],
    ['Comp Bench', '3', '7', 0.9, '4x2'],
    ['Rower', '3-5x400m', ''],
  ],
];
import { parsePrescription } from './sheets';
export function demoState(): AppState {
  const version: PrescriptionVersion = {
    id: 'demo-v1',
    blockId: 'demo-block',
    title: 'Strength & athletic development',
    acceptedAt: '2026-11-17T00:00:00Z',
    digest: 'demo',
    origin: 'demo',
    days: rows.map((r, i) => ({
      id: `demo-day-${i + 1}`,
      day: i + 1,
      title: [
        'Squat, push & pull',
        'Clean & lower body',
        'Bench & front squat',
        'Pulls & accessories',
        'Deadlift & upper body',
        'Overhead & bench',
        'Squat & posterior chain',
        'Clean & accessories',
        'Deadlift & lower body',
        'Overhead, bench & row',
      ][i],
      sport: i === 1 || i === 7 ? 'weightlifting' : 'strength',
      coachNotes:
        'Local example prescription. Your accepted coach programme appears after sign-in and import.',
      exercises: r.map(([name, prescription, rpe, fraction, back], j): Exercise => ({
        id: `demo-${i}-${j}`,
        name,
        prescription,
        rpe,
        parsed: parsePrescription(prescription),
        order: String.fromCharCode(65 + j),
        sport: name === 'Rower' ? 'rowing' : i === 1 ? 'weightlifting' : 'strength',
        backoff:
          fraction && back
            ? {
                fraction,
                increment: 2.5,
                prescription: back,
                parsed: parsePrescription(back),
                formula: '=MROUND(top_set*percentage,2.5)',
              }
            : undefined,
        review: name.includes('/')
          ? 'Confirm whether this is a complex or exercise choice. Components have not been inferred.'
          : undefined,
      })),
    })),
  };
  return acceptVersion(blankState('demo'), version, 4);
}
