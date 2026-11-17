import { it, expect } from 'vitest';
import { demoState } from '../packages/core/fixtures';
import { TrainingStore, type Persistence } from '../packages/core/store';
it('creates a source activity session once, including concurrent taps, without inventing sets', async () => {
  let counter = 0;
  const id = () => `import-${++counter}`;
  const state = demoState();
  state.scope = 'athlete';
  state.activities = [
    {
      id: 'activity',
      provider: 'garmin',
      externalId: '123',
      name: 'Run',
      sport: 'running',
      startedAt: '2026-11-17T08:00:00Z',
      durationSeconds: 1200,
      distanceMetres: 4000,
      raw: { activityId: 123 },
    },
  ];
  const disk: Persistence = { load: async () => undefined, save: async () => undefined };
  const store = new TrainingStore(state, disk, id);
  const [first, second] = await Promise.all([
    store.importActivity('activity', 'Europe/Dublin'),
    store.importActivity('activity', 'Europe/Dublin'),
  ]);
  expect(first).toBe(second);
  expect(store.getSnapshot().sessions).toHaveLength(1);
  expect(store.getSnapshot().sessions[0].exercises).toEqual([]);
  expect(store.getSnapshot().sessions[0].durationSeconds).toBe(1200);
  expect(store.getSnapshot().outbox).toHaveLength(1);
  expect(store.getSnapshot().activities[0].matchedSessionId).toBe(first);
});
