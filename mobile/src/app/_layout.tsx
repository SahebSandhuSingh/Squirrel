import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Knewave_400Regular } from '@expo-google-fonts/knewave';
import { Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { AppStateProvider } from '@/state/AppState';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastHost } from '@/components/Toast';
import { colors } from '@/theme';

const sheet = { presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } } as const;

export default function RootLayout() {
  const [loaded] = useFonts({
    Knewave_400Regular,
    Oswald_600SemiBold,
    Oswald_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
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
      <AuthProvider>
      <AppStateProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
            <Stack.Screen name="sign-in" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="run" options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="level-up" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="highlight/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="create" options={sheet} />
            <Stack.Screen name="city" options={sheet} />
            <Stack.Screen name="item/[id]" options={sheet} />
            <Stack.Screen name="compose" options={{ animation: 'slide_from_bottom' }} />
          </Stack>
          <ToastHost />
        </View>
      </AppStateProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
