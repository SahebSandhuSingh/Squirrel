import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { colors } from '@/theme';

// Signed-in users (a stored backend token) go straight to Home; everyone else sees Welcome.
export default function Index() {
  const { mode } = useAuth();
  if (mode === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <Redirect href={mode === 'live' || mode === 'demo' ? '/home' : '/welcome'} />;
}
