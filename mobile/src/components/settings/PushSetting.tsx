/**
 * Settings row: turn push notifications on/off for this device. Registers the Expo push token with
 * the Social service (lib/push.ts). Hidden without a Social service or when not signed in; on web,
 * Expo Go (Android) and builds without an EAS projectId it explains why it can't be turned on.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SOCIAL_API_CONFIGURED } from '@/api/social';
import { useAuth } from '@/auth/AuthProvider';
import { Icon } from '@/components/ui';
import { getRegisteredPushToken, pushReasonText, pushUnsupportedReason, registerForPush, unregisterPush } from '@/lib/push';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius } from '@/theme';

type RowState = { kind: 'loading' } | { kind: 'on' } | { kind: 'off' } | { kind: 'blocked' } | { kind: 'unavailable'; text: string };

export function PushSetting() {
  const { mode } = useAuth();
  const visible = SOCIAL_API_CONFIGURED && mode === 'live';
  if (!visible) return null;
  return <PushSettingRow />;
}

function PushSettingRow() {
  const { toast } = useApp();
  const [state, setState] = useState<RowState>(() => {
    const reason = pushUnsupportedReason();
    return reason ? { kind: 'unavailable', text: pushReasonText(reason) } : { kind: 'loading' };
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (pushUnsupportedReason()) return;
    (async () => {
      const token = await getRegisteredPushToken();
      let next: RowState = { kind: 'off' };
      try {
        const p = await Notifications.getPermissionsAsync();
        if (!p.granted && !p.canAskAgain) next = { kind: 'blocked' };
        else if (p.granted && token) next = { kind: 'on' };
      } catch {
        next = token ? { kind: 'on' } : { kind: 'off' };
      }
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        const r = await registerForPush();
        if (r.status === 'registered') {
          setState({ kind: 'on' });
          toast('Push notifications on', 'bell-ring-outline');
        } else if (r.status === 'denied') {
          setState({ kind: 'blocked' });
        } else if (r.status === 'unsupported') {
          setState({ kind: 'unavailable', text: pushReasonText(r.reason) });
        } else {
          toast('Couldn’t turn on notifications — try again', 'alert-circle-outline', colors.coral);
        }
      } else {
        const ok = await unregisterPush();
        if (ok) setState({ kind: 'off' });
        else toast('Couldn’t turn off notifications — try again', 'alert-circle-outline', colors.coral);
      }
    } finally {
      setBusy(false);
    }
  };

  const enabled = state.kind === 'on';
  const disabled = state.kind === 'loading' || state.kind === 'unavailable' || busy;
  const detail =
    state.kind === 'loading' ? 'Checking…'
    : state.kind === 'on' ? 'On'
    : state.kind === 'off' ? 'Off'
    : state.kind === 'blocked' ? 'Blocked — allow in system Settings'
    : state.text;
  const detailColor = state.kind === 'on' ? colors.primary : state.kind === 'blocked' ? colors.coral : colors.dim;

  return (
    <View style={styles.row} accessibilityLabel={`Push notifications. ${detail}`}>
      <Icon name={enabled ? 'bell-ring-outline' : 'bell-off-outline'} size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Push notifications</Text>
        <Text
          style={[styles.rowDetail, { color: detailColor }]}
          numberOfLines={1}
          onPress={state.kind === 'blocked' && Platform.OS !== 'web' ? () => Linking.openSettings().catch(() => undefined) : undefined}>
          {detail}
        </Text>
      </View>
      {busy || state.kind === 'loading' ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={disabled || state.kind === 'blocked'}
          trackColor={{ false: colors.lineHi, true: colors.primaryDeep }}
          thumbColor={enabled ? colors.primary : colors.dim}
          accessibilityLabel="Push notifications"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
  rowTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
  rowDetail: { fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
});
