import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RuntimeProvider } from '../src/data/runtime';
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <RuntimeProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout/[id]" />
        </Stack>
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}
