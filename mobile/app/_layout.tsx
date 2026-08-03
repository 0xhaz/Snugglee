import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { shell } from '../src/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          // design.md §6 — no white flashes, no bright transitions.
          contentStyle: { backgroundColor: shell.background },
          animation: 'fade',
        }}
      />
    </SafeAreaProvider>
  );
}
