/**
 * Push notifications through Expo's push service, delivered by the Social service.
 *
 * `registerForPush()` asks permission, fetches this device's Expo push token
 * (`ExponentPushToken[...]`) and registers it with the Social service; the token is kept locally
 * so `unregisterPush()` can remove it again. Web, Expo Go on Android and builds without an EAS
 * projectId can't receive Expo pushes: those report `unsupported` instead of pretending.
 *
 * `usePushTapRouting()` opens a tapped notification's `data.route` (an in-app path like "/profile").
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import { AlarmService } from '@/features/alarm/AlarmService';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { router, type Href } from 'expo-router';
import { socialApi } from '@/api/social';

export type PushUnsupportedReason = 'web' | 'expo-go' | 'no-project-id' | 'no-device';

export type PushResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unsupported'; reason: PushUnsupportedReason }
  | { status: 'error'; message: string };

const KEY = 'squirrel.push.token';
const CHANNEL_ID = 'default';
const isWeb = Platform.OS === 'web';

// ---------------------------------------------------------------------------
// Stored token (secure store on device, localStorage on web — same pattern as state/invite.ts)
// ---------------------------------------------------------------------------

const stored = {
  get: async (): Promise<string | null> => {
    try {
      return isWeb ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  set: async (token: string) => {
    try {
      if (isWeb) globalThis.localStorage?.setItem(KEY, token);
      else await SecureStore.setItemAsync(KEY, token);
    } catch {
      // storage unavailable: unregistering after a restart won't know the token
    }
  },
  clear: async () => {
    try {
      if (isWeb) globalThis.localStorage?.removeItem(KEY);
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      // nothing to clear
    }
  },
};

/** The token this device last registered with the Social service, if any. */
export const getRegisteredPushToken = () => stored.get();

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

function projectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined)?.eas?.projectId;
  const id = (typeof fromExtra === 'string' ? fromExtra : undefined) ?? Constants.easConfig?.projectId;
  return id || undefined;
}

/** Why push can't work in this runtime, or null when it can be attempted. Synchronous, no prompts. */
export function pushUnsupportedReason(): PushUnsupportedReason | null {
  if (isWeb) return 'web';
  // Remote notifications were removed from Expo Go on Android (SDK 53+); a development build is needed.
  if (Platform.OS === 'android' && isRunningInExpoGo()) return 'expo-go';
  if (!projectId()) return 'no-project-id';
  return null;
}

/** Short, user-facing explanation for an unsupported reason. */
export function pushReasonText(reason: PushUnsupportedReason): string {
  switch (reason) {
    case 'web':
      return 'Not available on web';
    case 'expo-go':
      return 'Needs a development build';
    case 'no-project-id':
      return 'Not set up in this build';
    case 'no-device':
      return 'Needs a real device';
  }
}

// ---------------------------------------------------------------------------
// Foreground behaviour + Android channel (set once, native only)
// ---------------------------------------------------------------------------

let configured = false;
function configure() {
  if (configured || isWeb) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Squirrel Social',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#D7FF1F',
    }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Register / unregister
// ---------------------------------------------------------------------------

function errMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Asks permission, gets the Expo push token and registers it with the Social service. */
export async function registerForPush(): Promise<PushResult> {
  const reason = pushUnsupportedReason();
  if (reason) return { status: 'unsupported', reason };
  configure();

  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return { status: 'denied' };
  } catch (e) {
    return { status: 'error', message: errMessage(e) };
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  } catch (e) {
    const msg = errMessage(e);
    // Simulators / emulators without push services can't produce a device token.
    if (/simulator|emulator|SERVICE_NOT_AVAILABLE|MISSING_INSTANCEID_SERVICE|FIS_AUTH_ERROR/i.test(msg)) return { status: 'unsupported', reason: 'no-device' };
    return { status: 'error', message: msg };
  }
  if (!/^ExponentPushToken\[.+\]$/.test(token)) return { status: 'error', message: 'Unexpected push token format' };

  try {
    await socialApi.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (e) {
    return { status: 'error', message: errMessage(e) };
  }
  await stored.set(token);
  return { status: 'registered', token };
}

/** Removes this device's token from the Social service. Resolves false if the server call failed. */
export async function unregisterPush(): Promise<boolean> {
  const token = await stored.get();
  if (!token) return true;
  try {
    await socialApi.removePushToken(token);
  } catch {
    return false; // keep the token so the user can retry turning it off
  }
  await stored.clear();
  return true;
}

// ---------------------------------------------------------------------------
// Tap routing
// ---------------------------------------------------------------------------

function routeOf(response: Notifications.NotificationResponse | null | undefined): string | null {
  const route = (response?.notification.request.content.data as Record<string, unknown> | null | undefined)?.route;
  return typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') ? route : null;
}

/**
 * Opens `data.route` when the user taps a notification — including the tap that cold-started the
 * app. `ready` should be true once the navigator is mounted; cold-start taps wait for it.
 */
export function usePushTapRouting(ready = true) {
  const handled = useRef<Set<string>>(new Set());
  const pending = useRef<string | null>(null);
  const readyRef = useRef(ready);

  useEffect(() => {
    readyRef.current = ready;
    if (ready && pending.current) {
      const route = pending.current;
      pending.current = null;
      router.push(route as Href);
    }
  }, [ready]);

  useEffect(() => {
    if (isWeb) return;
    configure();
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;
      handled.current.add(id);
      // Movement alarms open through AlarmService, which won't stack a challenge that's already on screen.
      const alarmId = AlarmService.alarmIdOf(response.notification.request.content.data);
      if (alarmId) return AlarmService.fire(alarmId);
      const route = routeOf(response);
      if (!route) return;
      if (readyRef.current) router.push(route as Href);
      else pending.current = route;
    };
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        open(r);
        if (r) Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
