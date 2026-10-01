/**
 * A friend's referral code from an invite link (/sign-in?mode=create&invite=CODE), kept until
 * the account exists and the code has been claimed on the Social service.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'squirrel.invite.code';

export const pendingInvite = {
  get: async (): Promise<string | null> => {
    try {
      return Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  set: async (code: string) => {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, code);
      else await SecureStore.setItemAsync(KEY, code);
    } catch {
      // storage unavailable: the code just won't survive a restart
    }
  },
  clear: async () => {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.removeItem(KEY);
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      // nothing to clear
    }
  },
};
