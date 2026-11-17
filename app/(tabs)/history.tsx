import React, { useState } from 'react';
import { router } from 'expo-router';
import { useTraining } from '../../src/data/runtime';
import { sportLabels, workingTotals } from '../../packages/core/training';
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
export default function History() {
  const state = useTraining();
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('all');
  const [block, setBlock] = useState('all');
  const blocks = [
    ...new Map(
      state.sessions.map((s) => [
        s.blockId,
        state.versions.find((v) => v.blockId === s.blockId)?.title ?? 'Other training',
      ]),
    ).entries(),
  ];
  const sessions = state.sessions
    .filter(
      (s) =>
        s.status !== 'inProgress' &&
        (sport === 'all' || s.sport === sport) &&
        (block === 'all' || s.blockId === block) &&
        `${s.title} ${s.trainingDate} ${s.notes ?? ''} ${s.prescription.exercises.map((e) => e.name).join(' ')}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.trainingDate.localeCompare(a.trainingDate) || b.startedAt.localeCompare(a.startedAt),
    );
  return (
    <Page title="History" subtitle="Your actual training, with its original prescription.">
      <Field
        label="Search date, exercise or notes"
        value={query}
        onChange={setQuery}
        placeholder="e.g. squat or 2026-11"
      />
      <Choice
        label="Sport filter"
        value={sport}
        options={[
          { value: 'all', label: 'All sports' },
          ...Object.entries(sportLabels).map(([value, label]) => ({ value, label })),
        ]}
        onChange={setSport}
      />
      {blocks.length > 1 ? (
        <Choice
          label="Block filter"
          value={block}
          options={[
            { value: 'all', label: 'All blocks' },
            ...blocks.map(([value, label]) => ({ value, label })),
          ]}
          onChange={setBlock}
        />
      ) : null}
      <Divider />
      {!sessions.length ? (
        <Empty
          title={state.sessions.length ? 'No matching sessions' : 'A notebook worth keeping'}
          body={
            state.scope === 'demo'
              ? 'Finish a local example workout to try History. Demo results remain on this device.'
              : 'Your completed and skipped training will appear here. Each repeated day keeps its own results.'
          }
        >
          <Button title="Go to Today" secondary onPress={() => router.push('/')} />
        </Empty>
      ) : (
        <Stack gap={12}>
          {sessions.map((s) => (
            <Stack key={s.id} gap={4}>
              <T size={13} muted>
                {s.trainingDate}
              </T>
              <ListItem
                title={`${s.day ? `Day ${s.day} · ` : ''}${s.title}`}
                subtitle={`${sportLabels[s.sport]}${s.day ? ` · Round ${s.round}` : ''} · ${s.status === 'skipped' ? 'Skipped' : `${workingTotals(s).loggedSets} logged sets`}${s.sessionRpe ? ` · Session RPE ${s.sessionRpe}/7` : ''}`}
                onPress={() => router.push(`/workout/${s.id}`)}
              />
              {s.notes ? (
                <T size={14} muted>
                  {s.notes}
                </T>
              ) : null}
            </Stack>
          ))}
        </Stack>
      )}
    </Page>
  );
}
