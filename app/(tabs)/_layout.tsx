import React from 'react';
import { Tabs, router, usePathname } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { CalendarDays, Layers, History, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/ui/theme';
import { T } from '../../src/ui/components';
import { useRuntime } from '../../src/data/runtime';
const routes = [
  { name: 'index', path: '/', label: 'Today', Icon: CalendarDays },
  { name: 'programme', path: '/programme', label: 'Programme', Icon: Layers },
  { name: 'history', path: '/history', label: 'History', Icon: History },
  { name: 'profile', path: '/profile', label: 'Profile', Icon: User },
] as const;
export default function TabLayout() {
  const c = useTheme();
  const path = usePathname();
  const { user } = useRuntime();
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, flexDirection: 'row', backgroundColor: c.surface }}
    >
      {c.wide ? (
        <View
          style={{
            width: 200,
            padding: 20,
            borderRightWidth: 1,
            borderRightColor: c.divider,
            gap: 32,
          }}
        >
          <T size={25} weight="700">
            Training
          </T>
          <View style={{ gap: 8 }}>
            {routes.map(({ name, path: p, label, Icon }) => (
              <Pressable
                key={name}
                accessibilityRole="link"
                accessibilityState={{ selected: path === p }}
                onPress={() => router.navigate(p)}
                style={{
                  flexDirection: 'row',
                  gap: 14,
                  alignItems: 'center',
                  minHeight: 48,
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: path === p ? c.selected : 'transparent',
                }}
              >
                <Icon size={21} color={path === p ? c.accent : c.secondary} />
                <T
                  style={{ color: path === p ? c.accent : c.text }}
                  weight={path === p ? '600' : '400'}
                >
                  {label}
                </T>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <T size={13} muted>
            {user ? 'Personal notebook' : 'Local demo'}
          </T>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: c.accent,
            tabBarInactiveTintColor: c.secondary,
            tabBarStyle: c.wide
              ? { display: 'none' }
              : {
                  backgroundColor: c.surface,
                  borderTopColor: c.divider,
                  minHeight: 68,
                  paddingTop: 8,
                },
            tabBarLabelStyle: { fontSize: 12, paddingBottom: 4 },
            sceneStyle: { backgroundColor: c.background },
          }}
        >
          {routes.map(({ name, label, Icon }) => (
            <Tabs.Screen
              key={name}
              name={name}
              options={{
                title: label,
                tabBarIcon: ({ color, size }) => <Icon color={color} size={size} />,
              }}
            />
          ))}
        </Tabs>
      </View>
    </SafeAreaView>
  );
}
