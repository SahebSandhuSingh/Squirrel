import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { AppStateProvider } from '@/state/AppState';
import { colors } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    Anton_400Regular,
    PermanentMarker_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="run" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="level-up" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        </Stack>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
