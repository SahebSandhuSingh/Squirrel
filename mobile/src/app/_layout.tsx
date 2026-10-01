import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_700Bold_Italic,
  BarlowCondensed_800ExtraBold_Italic,
} from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { AppStateProvider } from '@/state/AppState';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { LaunchSplash } from '@/components/LaunchSplash';
import { ToastHost } from '@/components/Toast';
import { SocialHost } from '@/components/social/SocialHost';
import { usePushTapRouting } from '@/lib/push';
import { useAlarmTriggers } from '@/features/alarm/useAlarmTriggers';
import { colors, statusBarStyle } from '@/theme';

const sheet = { presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } } as const;

export default function RootLayout() {
  const [loaded] = useFonts({
    Anton_400Regular,
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    BarlowCondensed_700Bold_Italic,
    BarlowCondensed_800ExtraBold_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });
  // Tapping a push opens its data.route (cold-start taps wait until the navigator is mounted).
  usePushTapRouting(loaded);
  useAlarmTriggers(loaded);

  // Auth restores the saved session while the fonts load and the launch splash plays; the
  // splash lifts only when both are ready (and at least SPLASH_MIN_MS have passed).
  return (
    <SafeAreaProvider>
      <AuthProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {loaded && (
      <AppStateProvider>
        <StatusBar style={statusBarStyle} />
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="sign-in" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="run" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="level-up" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="create" options={sheet} />
            <Stack.Screen name="exercise/select" options={sheet} />
            <Stack.Screen name="exercise/train/[key]" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="compose" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ambassador" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="alarm/ring/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="alarm/edit" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          <SocialHost />
          <ToastHost />
        </View>
      </AppStateProvider>
      )}
      <Splash fontsLoaded={loaded} />
      </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

/** The launch splash, ready once fonts are loaded and the saved session has been restored. */
function Splash({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { mode } = useAuth();
  return <LaunchSplash ready={fontsLoaded && mode !== 'loading'} />;
}
