import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Dumbbell, ArrowRight, Plus } from 'lucide-react-native';
import { useRuntime, useTraining } from '../../src/data/runtime';
import { activeVersion, nextSlot, sportLabels } from '../../packages/core/training';
import type { Sport } from '../../packages/core/model';
import {
  Button,
  Divider,
  Empty,
  ListItem,
  Page,
  Row,
  Stack,
  SyncLine,
  T,
} from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';
export default function Today() {
  const state = useTraining();
  const { start, manual } = useRuntime();
  const c = useTheme();
  const version = activeVersion(state);
  const slot = nextSlot(state);
  const unfinished = state.sessions.filter((s) => s.status === 'inProgress');
  async function startNext() {
    if (version && slot) {
      const id = await start(version, slot.day, slot.round);
      if (id) router.push(`/workout/${id}`);
    }
  }
  async function other(sport: Sport) {
    const id = await manual(sport);
    if (id) router.push(`/workout/${id}`);
  }
  return (
    <Page
      title="Today"
      subtitle={new Intl.DateTimeFormat('en-IE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date())}
    >
      <View style={{ flexDirection: c.wide ? 'row' : 'column', gap: c.wide ? 40 : 28 }}>
        <Stack gap={24} style={{ flex: 1 }}>
          {unfinished.length ? (
            <Stack gap={4}>
              <T size={14} muted>
                Unfinished training
              </T>
              {unfinished.map((s) => (
                <ListItem
                  key={s.id}
                  title={`Resume ${s.day ? `Day ${s.day} · ` : ''}${s.title}`}
                  subtitle={`${s.trainingDate} · Saved on this device`}
                  onPress={() => router.push(`/workout/${s.id}`)}
                />
              ))}
            </Stack>
          ) : null}
          {version && state.programme ? (
            <>
              <Stack gap={5}>
                <T size={14} muted>
                  Current programme
                </T>
                <T size={22} weight="600">
                  {state.programme.title}
                </T>
                <T muted>
                  Round {slot?.round ?? state.programme.rounds} of {state.programme.rounds} ·{' '}
                  {version.days.length}-session sequence
                </T>
                {version.origin === 'demo' ? (
                  <T size={13} muted>
                    Local example programme · No personal results
                  </T>
                ) : (
                  <T size={13} muted>
                    {version.source?.title} · Accepted{' '}
                    {new Date(version.acceptedAt).toLocaleDateString('en-IE')}
                  </T>
                )}
              </Stack>
              <Divider />
              {slot ? (
                <>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Stack gap={4}>
                      <T size={28} weight="700">
                        Day {slot.day.day}
                      </T>
                      <T size={20} muted>
                        {slot.day.title !== `Day ${slot.day.day}`
                          ? slot.day.title
                          : slot.day.exercises
                              .slice(0, 2)
                              .map((e) => e.name)
                              .join(' & ')}
                      </T>
                    </Stack>
                    <Dumbbell size={38} strokeWidth={1.5} color={c.secondary} />
                  </Row>
                  {slot.day.coachNotes ? (
                    <View
                      style={{
                        padding: 14,
                        borderLeftWidth: 3,
                        borderLeftColor: c.accent,
                        backgroundColor: c.selected,
                        borderRadius: 5,
                      }}
                    >
                      <T size={14}>{slot.day.coachNotes}</T>
                    </View>
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
                    <Row style={{ padding: 12, backgroundColor: c.background, flexWrap: 'nowrap' }}>
                      <T size={11} weight="600" muted style={{ width: 48 }}>
                        ORDER
                      </T>
                      <T size={11} weight="600" muted style={{ flex: 1 }}>
                        EXERCISE
                      </T>
                      <T size={11} weight="600" muted style={{ width: c.compact ? 102 : 155 }}>
                        PRESCRIPTION
                      </T>
                    </Row>
                    {slot.day.exercises.slice(0, 5).map((e) => (
                      <Row
                        key={e.id}
                        style={{
                          padding: 12,
                          borderTopWidth: 1,
                          borderTopColor: c.divider,
                          flexWrap: 'nowrap',
                          alignItems: 'flex-start',
                        }}
                      >
                        <T weight="600" style={{ width: 48 }}>
                          {e.order}
                        </T>
                        <T weight="500" style={{ flex: 1 }}>
                          {e.name}
                        </T>
                        <T size={14} style={{ width: c.compact ? 102 : 155 }}>
                          {e.prescription}
                          {e.rpe ? ` @ RPE ${e.rpe}` : ''}
                        </T>
                      </Row>
                    ))}
                  </View>
                  <Row>
                    <Button title="Start workout" onPress={() => void startNext()} />
                    <Button
                      title="Choose a session"
                      secondary
                      onPress={() => router.push('/programme')}
                    />
                  </Row>
                </>
              ) : (
                <Empty
                  title="Sequence complete"
                  body="Every planned round has been logged. You can repeat a session or start your next block from Programme."
                >
                  <Button title="View programme" onPress={() => router.push('/programme')} />
                </Empty>
              )}
            </>
          ) : (
            <Empty
              title="Your programme starts here"
              body="Import a selected coach source in Programme. You can log other training straight away."
            >
              <Button title="Open Programme" onPress={() => router.push('/programme')} />
            </Empty>
          )}
          <Divider />
          <SyncLine />
        </Stack>
        <Stack gap={24} style={{ width: c.wide ? 240 : '100%' }}>
          <Stack gap={4}>
            <T size={20} weight="600">
              Up next
            </T>
            {version && slot ? (
              version.days
                .filter((d) => d.day > slot.day.day)
                .slice(0, 3)
                .map((d) => (
                  <ListItem
                    key={d.id}
                    title={`Day ${d.day}`}
                    subtitle={d.exercises
                      .slice(0, 2)
                      .map((e) => e.name)
                      .join(' & ')}
                    onPress={() => router.push('/programme')}
                  />
                ))
            ) : (
              <T muted size={14}>
                Choose any planned session in Programme.
              </T>
            )}
          </Stack>
          <Divider />
          <Stack gap={4}>
            <T size={20} weight="600">
              Other training
            </T>
            {(['running', 'cycling', 'tagRugby', 'rowing', 'skiErg', 'plyometrics'] as Sport[]).map(
              (s) => (
                <ListItem key={s} title={sportLabels[s]} onPress={() => void other(s)} />
              ),
            )}
          </Stack>
        </Stack>
      </View>
    </Page>
  );
}
