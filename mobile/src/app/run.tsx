/**
 * RUN / WALK. Start → live GPS route on the campus map → stop → summary (distance, duration,
 * route, zones interacted with, zones eligible to claim + the action where the backend allows).
 *
 * A run never claims anything by itself. Zone eligibility, claim / steal / defend availability
 * and ownership all come from the backend after the activity is recorded.
 *
 * Handles: permission denied/blocked, location services off, weak GPS, no fix, backgrounding
 * (foreground-only tracking — gaps are reported, not invented), discard, and upload failure
 * with a resumable retry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, AppState as RNAppState, Easing, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Scene } from '@/art/Scene';
import { RunRoute } from '@/art/CityMap';
import { Mascot } from '@/art/Mascot';
import { campusApi, CAMPUS_SOURCE, type ActivityType, type LatLng } from '@/api/campus';
import { formatArea, rejectionText, submitRun, TERMINAL_STATUSES, xpApi, type RunSummary } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { CampusMap } from '@/components/campus/CampusMap';
import { RunZones, type RunZonesState } from '@/components/campus/RunZones';
import { Button, Display, Icon, IconButton, Kicker, NATIVE, Pulse, Segmented, tap } from '@/components/ui';
import { useMe, useTerritorySync, useZones } from '@/hooks/useCampus';
import { DEMO_SPEED, demoPosition } from '@/logic/demoRoute';
import { addFix, emptyTrack, localVerdict, MAX_ACCURACY_M, type TrackState, type Verdict } from '@/logic/track';
import { useApp, type FinishRunResult } from '@/state/AppState';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

const two = (n: number) => String(Math.floor(n)).padStart(2, '0');
const fmtPace = (secPerKm: number) => (Number.isFinite(secPerKm) && secPerKm > 0 ? `${Math.floor(secPerKm / 60)}'${two(secPerKm % 60)}"` : `--'--"`);
const fmtClock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${two((s % 3600) / 60)}:${two(s % 60)}` : `${two(s / 60)}:${two(s % 60)}`);

type Phase = 'setup' | 'countdown' | 'running' | 'paused' | 'uploading' | 'done';
type Perm = 'checking' | 'undetermined' | 'granted' | 'denied' | 'blocked' | 'services_off' | 'web';
type Outcome = Verdict | 'processing';
type Source = 'gps' | 'demo';
const STAGE_TEXT = { uploading: 'Uploading your route…', finishing: 'Closing it out…', polling: 'Verifying your activity…' } as const;
const KINDS = ['Run', 'Walk'] as const;

const VERDICT_UI: Record<Outcome, { label: string; icon: React.ComponentProps<typeof Icon>['name']; color: string }> = {
  accepted: { label: 'Activity accepted', icon: 'check-decagram', color: colors.primary },
  flagged: { label: 'Flagged for review', icon: 'alert-decagram', color: colors.gold },
  rejected: { label: 'Activity rejected', icon: 'close-octagon', color: colors.coral },
  processing: { label: 'Still processing', icon: 'progress-clock', color: colors.dim },
};

type Summary = FinishRunResult & { verdict: Outcome; reason: string; km: number; time: string; pace: string; uploadNote?: string; areaText?: string; uploadFailed?: boolean };

export default function Run() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ type?: string }>();
  const { finishRun, toast, syncServerXp } = useApp();
  const auth = useAuth();
  const live = auth.mode === 'live';
  const zones = useZones();
  const me = useMe();
  useTerritorySync();
  const meId = me.data?.user_id ?? null;

  const [kind, setKind] = useState<ActivityType>(params.type === 'walk' ? 'walk' : 'run');
  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState(3);
  const [perm, setPerm] = useState<Perm>(Platform.OS === 'web' ? 'web' : 'checking');
  const [source, setSource] = useState<Source | null>(null);
  const [here, setHere] = useState<LatLng | null>(null);
  const [sec, setSec] = useState(0);
  const [track, setTrack] = useState<TrackState>(emptyTrack);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [zonesState, setZonesState] = useState<RunZonesState>({ status: 'idle' });
  const [stage, setStage] = useState<keyof typeof STAGE_TEXT>('uploading');
  const [canSkipWait, setCanSkipWait] = useState(false);

  const pollAbort = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const activityIdRef = useRef<string | null>(null);
  const startedAt = useRef(0);
  const endedAt = useRef(0);
  const phaseRef = useRef<Phase>('setup');
  const sourceRef = useRef<Source | null>(null);
  const lastFixAt = useRef(0);
  const bgAt = useRef<number | null>(null);
  const demoMeters = useRef(0);
  const lastKmMarker = useRef(0);
  const [progress] = useState(() => new Animated.Value(0.2));
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    phaseRef.current = phase;
    sourceRef.current = source;
  });
  useEffect(() => () => pollAbort.current?.abort(), []);

  // ---- Location permission + a warm GPS watch (so the first fix is ready at Start).
  const startWatch = useCallback(async () => {
    try {
      if (!(await Location.hasServicesEnabledAsync())) return setPerm('services_off');
      setPerm('granted');
      return await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (loc) => {
        const acc = loc.coords.accuracy ?? null;
        setAccuracy(acc);
        setHere([loc.coords.latitude, loc.coords.longitude]);
        lastFixAt.current = Date.now();
        if (phaseRef.current !== 'running' || sourceRef.current !== 'gps') return;
        setTrack((t) => addFix(t, { lat: loc.coords.latitude, lon: loc.coords.longitude, t: loc.timestamp, accuracy: acc }));
      });
    } catch {
      setPerm('services_off');
      return null;
    }
  }, []);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      try {
        const p = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (p.status === 'granted') {
          const sub = await startWatch();
          if (cancelled) sub?.remove();
          else watchRef.current = sub ?? null;
        } else setPerm(p.status === 'denied' ? (p.canAskAgain ? 'denied' : 'blocked') : 'undetermined');
      } catch {
        if (!cancelled) setPerm('services_off');
      }
    })();
    return () => {
      cancelled = true;
      watchRef.current?.remove();
    };
  }, [startWatch]);

  const askPermission = async () => {
    tap();
    if (perm === 'blocked') return Linking.openSettings();
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.status === 'granted') {
      watchRef.current?.remove();
      watchRef.current = (await startWatch()) ?? null;
    } else setPerm(p.canAskAgain ? 'denied' : 'blocked');
  };

  // ---- Backgrounding: tracking is foreground-only; report the gap honestly.
  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (st) => {
      if (phaseRef.current !== 'running') return;
      if (st === 'background' || st === 'inactive') bgAt.current = Date.now();
      else if (st === 'active' && bgAt.current) {
        const gap = Math.round((Date.now() - bgAt.current) / 1000);
        bgAt.current = null;
        if (gap >= 5) setNotice(`Tracking paused for ${gap < 60 ? `${gap}s` : `${Math.round(gap / 60)} min`} while Squirrel was in the background. Keep the app open for a complete route.`);
      }
    });
    return () => sub.remove();
  }, []);

  // ---- Countdown
  useEffect(() => {
    if (phase !== 'countdown') return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(2)), useNativeDriver: NATIVE }).start();
    const t = setTimeout(() => {
      if (count <= 1) {
        tap('success');
        startedAt.current = Date.now();
        lastFixAt.current = Date.now();
        setPhase('running');
      } else {
        tap('impact');
        setCount(count - 1);
      }
    }, 850);
    return () => clearTimeout(t);
  }, [phase, count, pop]);

  // ---- Clock (+ demo movement, + no-fix detection)
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setSec((s) => s + 1);
      if (sourceRef.current === 'demo') {
        demoMeters.current += DEMO_SPEED[kind];
        const [lat, lon] = demoPosition(demoMeters.current);
        setHere([lat, lon]);
        setTrack((t) => addFix(t, { lat, lon, t: Date.now(), accuracy: 5 }));
      } else if (Date.now() - lastFixAt.current > 20_000) {
        setNotice('No GPS fix for 20 s. Head into open sky — distance only counts with a location fix.');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, kind]);

  const km = track.meters / 1000;
  const movingSec = track.movingSec;
  const paceSec = km >= 0.05 ? movingSec / km : NaN;
  const time = fmtClock(sec);
  const kcal = Math.round(km * (kind === 'walk' ? 55 : 80.5));
  const route = useMemo(() => track.points.map((p) => [p.lat, p.lon] as LatLng), [track.points]);
  const weak = source === 'gps' && accuracy != null && accuracy > MAX_ACCURACY_M;

  useEffect(() => {
    if (phase !== 'running') return;
    const whole = Math.floor(km);
    if (whole > lastKmMarker.current && whole > 0) {
      lastKmMarker.current = whole;
      tap('success');
      toast(`${whole} km! 🎉`, 'flag-checkered', colors.gold);
    }
  }, [km, phase, toast]);
  useEffect(() => {
    Animated.timing(progress, { toValue: Math.min(1, 0.2 + (km % 1) * 0.8), duration: 900, useNativeDriver: false }).start();
  }, [km, progress]);

  const start = (src: Source) => {
    tap('impact');
    setSource(src);
    setTrack(emptyTrack());
    setSec(0);
    demoMeters.current = 0;
    lastKmMarker.current = 0;
    setNotice(null);
    setCount(3);
    setPhase('countdown');
  };

  // ---- Zones: recorded activity → backend eligibility (never inferred here)
  const loadZones = useCallback(async () => {
    setZonesState({ status: 'loading' });
    try {
      if (CAMPUS_SOURCE === 'off') return setZonesState({ status: 'unavailable', note: 'Zone claiming switches on when the campus backend goes live.' });
      let id = activityIdRef.current ?? runIdRef.current;
      if (CAMPUS_SOURCE === 'mock' && !activityIdRef.current) {
        // Dev mock records the route itself; live runs are recorded by the Run Module.
        const pts = track.points.map((p) => ({ lat: p.lat, lng: p.lon, recorded_at: new Date(p.t).toISOString(), accuracy_m: p.accuracy ?? 10 }));
        const r = await campusApi.submitActivity({ type: kind, started_at: new Date(startedAt.current).toISOString(), ended_at: new Date(endedAt.current).toISOString(), points: pts });
        activityIdRef.current = r.activity_id;
        id = r.activity_id;
      }
      if (!id) {
        return setZonesState({
          status: 'unavailable',
          note: sourceRef.current === 'demo' ? 'Demo activities (no GPS) can’t unlock zones.' : 'Upload the activity first — zones are checked once the server has your route.',
        });
      }
      setZonesState({ status: 'ready', data: await campusApi.activityZones(id) });
    } catch (e) {
      setZonesState({ status: 'error', error: e });
    }
  }, [track.points, kind]);

  // ---- Upload to the Run Module (live), resumable
  const upload = useCallback(async (): Promise<Partial<Summary> & { kmFinal?: number; minutes?: number; pace?: string; serverXpTotal?: number }> => {
    setStage('uploading');
    const before = await xpApi.me().catch(() => null);
    const ctrl = new AbortController();
    pollAbort.current = ctrl;
    let skipTimer: ReturnType<typeof setTimeout> | undefined;
    const r: RunSummary = await submitRun(startedAt.current, track.points, {
      signal: ctrl.signal,
      runId: runIdRef.current ?? undefined,
      onCreated: (id) => (runIdRef.current = id),
      activityType: kind,
      onStage: (st) => {
        setStage(st);
        if (st === 'polling') skipTimer = setTimeout(() => setCanSkipWait(true), 15_000);
      },
    }).finally(() => {
      clearTimeout(skipTimer);
      setCanSkipWait(false);
    });
    const out: Partial<Summary> & { kmFinal?: number; minutes?: number; pace?: string; serverXpTotal?: number } = {};
    if (r.stats?.distance_m != null) out.kmFinal = +(r.stats.distance_m / 1000).toFixed(2);
    if (r.stats?.moving_time_s != null) {
      out.minutes = Math.round(r.stats.moving_time_s / 60);
      out.pace = fmtPace((out.kmFinal ?? km) > 0 ? r.stats.moving_time_s / (out.kmFinal ?? km) : NaN);
    }
    const terminal = TERMINAL_STATUSES.includes(r.status);
    const outcome: Outcome = !terminal ? 'processing' : r.status === 'finalized' ? 'accepted' : r.status === 'flagged' ? 'flagged' : 'rejected';
    out.verdict = outcome;
    out.reason = outcome === 'rejected' ? rejectionText(r.rejection) : outcome === 'flagged' ? 'Flagged for review.' : outcome === 'processing' ? 'Uploaded. The server is still finishing it.' : 'Verified by the server.';
    const area = r.territory && typeof r.territory.area_m2 === 'number' ? r.territory.area_m2 : undefined;
    if (area != null && outcome !== 'rejected') out.areaText = `${formatArea(area)} of route area`;
    const after = terminal ? await xpApi.me().catch(() => null) : null;
    if (after) {
      out.serverXpTotal = after.xp;
      const gained = before ? Math.max(0, after.xp - before.xp) : undefined;
      if (gained != null) {
        out.xp = gained;
        out.lines = [{ label: 'Awarded by the server', xp: gained }];
      }
    }
    out.uploadNote = `Run ${r.run_id.slice(0, 8)} · ${r.status}`;
    return out;
  }, [track.points, kind, km]);

  const finish = useCallback(async () => {
    tap('success');
    endedAt.current = Date.now();
    setConfirmDiscard(false);
    let kmFinal = +km.toFixed(2);
    let minutes = Math.max(1, Math.round(movingSec / 60));
    let pace = fmtPace(paceSec);
    const rejectedRatio = track.points.length ? track.rejected / (track.points.length + track.rejected) : 0;
    const local = source === 'demo' ? { verdict: 'accepted' as Verdict, reason: 'Demo activity — no GPS, the route is simulated.' } : localVerdict(kmFinal, movingSec, rejectedRatio);
    let s: Partial<Summary> = { verdict: local.verdict, reason: local.reason };
    let serverXpTotal: number | undefined;
    if (live && source === 'gps' && track.points.length > 1) {
      setPhase('uploading');
      try {
        const u = await upload();
        kmFinal = u.kmFinal ?? kmFinal;
        minutes = u.minutes ?? minutes;
        pace = u.pace ?? pace;
        serverXpTotal = u.serverXpTotal;
        s = { ...s, ...u };
      } catch (e) {
        s = { ...s, uploadFailed: true, uploadNote: `Couldn’t upload (${e instanceof Error ? e.message : 'error'}). Your route is kept — retry below.` };
      }
    } else if (!live) {
      s.uploadNote = source === 'demo' ? 'Demo mode · nothing was uploaded.' : 'Not signed in · the activity stays on this phone.';
    }
    const res = finishRun({ km: kmFinal, minutes, verdict: s.verdict === 'processing' || !s.verdict ? 'accepted' : s.verdict, serverXp: s.xp, serverLines: s.lines });
    if (serverXpTotal != null) syncServerXp(serverXpTotal);
    setSummary({ ...res, ...s, xp: s.xp ?? res.xp, lines: s.lines ?? res.lines, verdict: s.verdict ?? 'accepted', reason: s.reason ?? '', km: kmFinal, time, pace } as Summary);
    setPhase('done');
  }, [km, movingSec, paceSec, track, source, live, finishRun, time, syncServerXp, upload]);

  // Zones load once the summary is up (and again after a successful retry).
  useEffect(() => {
    if (phase === 'done' && zonesState.status === 'idle') void loadZones();
  }, [phase, zonesState.status, loadZones]);

  const retryUpload = async () => {
    if (!summary) return;
    setPhase('uploading');
    try {
      const u = await upload();
      if (u.serverXpTotal != null) syncServerXp(u.serverXpTotal);
      setSummary({ ...summary, ...u, uploadFailed: false, km: u.kmFinal ?? summary.km, pace: u.pace ?? summary.pace } as Summary);
      setZonesState({ status: 'idle' });
    } catch (e) {
      setSummary({ ...summary, uploadFailed: true, uploadNote: `Still couldn’t upload (${e instanceof Error ? e.message : 'error'}).` });
    }
    setPhase('done');
  };

  const discard = () => {
    if (!confirmDiscard) {
      tap();
      setConfirmDiscard(true);
      return;
    }
    tap('impact');
    router.back();
  };
  const close = () => (phase === 'running' || phase === 'paused' ? discard() : router.back());

  // ---- Render
  const heroH = Math.max(300, height * 0.46);
  const zoneList = zones.data ?? [];
  const gpsPill =
    source === 'demo'
      ? { text: 'Demo · simulated route', color: colors.dim }
      : perm === 'granted'
        ? accuracy == null
          ? { text: 'GPS · searching', color: colors.gold }
          : weak
            ? { text: `Weak GPS · ±${Math.round(accuracy)} m`, color: colors.orange }
            : { text: `GPS · ±${Math.round(accuracy)} m`, color: colors.primary }
        : perm === 'web'
          ? { text: 'No GPS on web', color: colors.dim }
          : perm === 'checking'
            ? { text: 'Checking location…', color: colors.dim }
            : { text: 'Location off', color: colors.coral };
  const title = kind === 'walk' ? (phase === 'setup' ? 'Walk' : 'Walking') : phase === 'setup' ? 'Run' : 'Running';

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={{ height: heroH }}>
        {zoneList.length ? (
          <CampusMap zones={zoneList} meId={meId} route={route} me={here} interactive={false} style={[StyleSheet.absoluteFill, { borderRadius: 0, borderWidth: 0 }]} />
        ) : (
          <>
            <Scene kind="city-night" seed={9} aspect={width / heroH} style={StyleSheet.absoluteFill} />
            <RunRoute progress={progress} style={StyleSheet.absoluteFill} />
          </>
        )}
      </View>

      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.header}>
          <IconButton icon={phase === 'running' || phase === 'paused' ? 'close' : 'chevron-down'} size={24} onPress={close} label={phase === 'running' || phase === 'paused' ? 'Discard activity' : 'Close'} />
          <Display size={30} color={colors.onImage} style={{ flex: 1, marginLeft: 10 }}>{title}</Display>
          <View style={[styles.gps, { borderColor: `${gpsPill.color}88` }]} accessibilityLabel={gpsPill.text}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: gpsPill.color }}>{perm === 'granted' && source !== 'demo' && <Pulse size={8} color={gpsPill.color} />}</View>
            <Text style={[styles.gpsText, { color: gpsPill.color }]}>{gpsPill.text}</Text>
          </View>
        </View>
        {(notice || weak) && phase === 'running' && (
          <Pressable onPress={() => setNotice(null)} style={styles.notice} accessibilityRole="alert">
            <Icon name={weak ? 'signal-cellular-1' : 'information-outline'} size={16} color={colors.gold} />
            <Text style={styles.noticeText}>{notice ?? `Weak GPS (±${Math.round(accuracy ?? 0)} m). Points worse than ±${MAX_ACCURACY_M} m are skipped.`}</Text>
          </Pressable>
        )}
      </View>

      {phase === 'setup' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.col, { paddingTop: 16, paddingBottom: insets.bottom + 18 }]}>
          <Kicker>Start activity</Kicker>
          <Segmented items={KINDS} value={kind === 'walk' ? 'Walk' : 'Run'} onChange={(k) => setKind(k === 'Walk' ? 'walk' : 'run')} style={{ marginTop: 8 }} />
          <Text style={styles.setupText}>
            Your route shows on the campus map as you go. Afterwards you’ll see which zones you moved through — and any you’re eligible to claim. Crossing a zone never claims it on its own.
          </Text>
          {perm === 'granted' ? (
            <Button label={`Start ${kind}`} icon="arrow-right" onPress={() => start('gps')} style={{ marginTop: 16 }} />
          ) : perm === 'checking' ? (
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.permBox}>
              <Icon name={perm === 'services_off' ? 'map-marker-off-outline' : perm === 'web' ? 'monitor' : 'map-marker-alert-outline'} size={26} color={colors.gold} />
              <Text style={styles.permTitle}>
                {perm === 'web' ? 'GPS tracking needs the phone app' : perm === 'services_off' ? 'Location services are off' : perm === 'blocked' ? 'Location is blocked for Squirrel' : 'Squirrel needs your location'}
              </Text>
              <Text style={styles.setupText}>
                {perm === 'web'
                  ? 'The web preview can’t read GPS. You can try a demo route instead — it’s clearly marked and never counts as a real activity.'
                  : perm === 'services_off'
                    ? 'Turn on location in your phone settings, then come back.'
                    : 'We use it only while you record, to draw your route and check which zones you moved through. Other people never see your location.'}
              </Text>
              {perm !== 'web' && perm !== 'services_off' && (
                <Button label={perm === 'blocked' ? 'Open settings' : 'Allow location'} iconLeft="crosshairs-gps" size="md" onPress={askPermission} style={{ alignSelf: 'stretch', marginTop: 10 }} />
              )}
              {perm === 'services_off' && <Button label="Open settings" iconLeft="cog-outline" size="md" onPress={() => Linking.openSettings()} style={{ alignSelf: 'stretch', marginTop: 10 }} />}
              <Button label="Try a demo route" variant="secondary" size="md" onPress={() => start('demo')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={[styles.col, { flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.panel}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
              <Text style={styles.km}>{km.toFixed(2)}</Text>
              <Text style={styles.kmUnit}> KM</Text>
            </View>
            <View style={styles.metrics}>
              {[
                [time, 'Duration'],
                [fmtPace(paceSec), 'Pace'],
                [String(kcal), 'Calories'],
              ].map(([v, l], i) => (
                <View key={l} style={[styles.metric, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
                  <Text style={styles.metricV}>{v}</Text>
                  <Text style={styles.metricL}>{l}</Text>
                </View>
              ))}
            </View>
            {source === 'demo' && <Text style={styles.demoNote}>Demo route · simulated, not a real activity</Text>}
          </View>

          <View style={styles.controls}>
            <Pressable
              onPress={() => { tap('impact'); setPhase((p) => (p === 'running' ? 'paused' : 'running')); }}
              onLongPress={finish}
              disabled={phase === 'countdown' || phase === 'uploading'}
              accessibilityLabel={phase === 'running' ? 'Pause' : 'Resume'}
              accessibilityHint="Long press to finish"
              style={({ pressed }) => [styles.pauseWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              {phase === 'running' && <Pulse size={104} color={colors.primary} />}
              <View style={styles.pause}>
                <Icon name={phase === 'running' ? 'pause' : 'play'} size={48} color={colors.onPrimary} />
              </View>
            </Pressable>
          </View>
          {phase === 'paused' ? (
            <View style={{ gap: 10, marginTop: 14 }}>
              <Button label={`Finish ${kind}`} iconLeft="flag-checkered" onPress={finish} />
              <Button label={confirmDiscard ? 'Tap again to discard — nothing is saved' : 'Discard'} variant="secondary" size="md" iconLeft="delete-outline" onPress={discard} />
            </View>
          ) : (
            <Text style={styles.hint}>{confirmDiscard ? 'Tap ✕ again to discard this activity' : 'Tap to pause · hold to finish'}</Text>
          )}
        </View>
      )}

      {phase === 'countdown' && (
        <View style={styles.overlayFull}>
          <Animated.Text style={[styles.countText, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [2, 1] }) }] }]}>{count}</Animated.Text>
          <Text style={styles.countSub}>Get ready…</Text>
        </View>
      )}

      {phase === 'uploading' && (
        <View style={styles.overlayFull}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.countSub, { marginTop: 14 }]}>{STAGE_TEXT[stage]}</Text>
          {canSkipWait && <Button label="Don't wait" variant="secondary" size="md" onPress={() => pollAbort.current?.abort()} style={{ marginTop: 18 }} />}
        </View>
      )}

      {phase === 'done' && summary && (
        <View style={[styles.overlayFull, { justifyContent: 'flex-start', padding: 0 }]}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
            <View style={styles.summary}>
              <Mascot pose={summary.verdict === 'rejected' ? 'sit' : 'celebrate'} size={96} animated />
              <View style={[styles.verdict, { borderColor: VERDICT_UI[summary.verdict].color }]}>
                <Icon name={VERDICT_UI[summary.verdict].icon} size={16} color={VERDICT_UI[summary.verdict].color} />
                <Text style={[styles.verdictText, { color: VERDICT_UI[summary.verdict].color }]}>{VERDICT_UI[summary.verdict].label}</Text>
              </View>
              {!!summary.reason && <Text style={styles.reason}>{summary.reason}</Text>}
              <Display size={34} style={{ marginTop: 6 }}>{summary.km.toFixed(2)} km</Display>
              <Text style={styles.sumLine}>{summary.time} · {summary.pace}/km · {kind}</Text>

              {zoneList.length > 0 && route.length > 1 && (
                <CampusMap zones={zoneList} meId={meId} route={route} interactive={false} highlight={zonesState.data?.zones.map((z) => z.zone_id)} style={styles.sumMap} />
              )}

              <RunZones state={zonesState} meId={meId} onRetry={loadZones} />

              <View style={styles.xpBox}>
                <Kicker>XP</Kicker>
                {summary.lines.map((l) => (
                  <View key={l.label} style={styles.xpRow}>
                    <Text style={styles.xpLabel}>{l.label}</Text>
                    <Text style={[styles.xpVal, l.xp < 0 && { color: colors.dim }]}>{l.xp >= 0 ? `+${l.xp}` : l.xp}</Text>
                  </View>
                ))}
                <View style={[styles.xpRow, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[styles.xpLabel, { color: colors.text, fontFamily: fonts.label }]}>TOTAL</Text>
                  <Text style={[styles.xpVal, { fontSize: 18 }]}>+{summary.xp} XP</Text>
                </View>
              </View>
              {summary.areaText && <Text style={styles.note}>{summary.areaText}</Text>}
              {summary.uploadNote && <Text style={[styles.note, summary.uploadFailed && { color: colors.coral }]}>{summary.uploadNote}</Text>}
              {summary.uploadFailed && <Button label="Retry upload" iconLeft="cloud-upload-outline" size="md" onPress={retryUpload} style={{ alignSelf: 'stretch', marginTop: 10 }} />}

              {summary.verdict !== 'rejected' && source !== 'demo' && (
                <Button
                  label="Share to feed"
                  iconLeft="send"
                  onPress={() => router.replace({ pathname: '/compose', params: { km: summary.km.toFixed(2), min: String(Math.round(movingSec / 60)), pace: summary.pace } })}
                  style={{ alignSelf: 'stretch', marginTop: 14 }}
                />
              )}
              <Button
                label={summary.leveledUp ? 'See level up' : 'Open campus map'}
                variant="secondary"
                size="md"
                onPress={() => (summary.leveledUp ? router.replace('/level-up') : router.replace('/explore'))}
                style={{ alignSelf: 'stretch', marginTop: 10 }}
              />
              <Button label="Done" variant="ghost" size="sm" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 8 }} />
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  col: { paddingHorizontal: 16, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center' },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,10,10,0.8)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  gpsText: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10, backgroundColor: 'rgba(10,10,10,0.9)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(255,210,31,0.5)', padding: 10 },
  noticeText: { flex: 1, color: colors.sub, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  setupText: { color: colors.dim, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'left' },
  permBox: { marginTop: 16, alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 4 },
  permTitle: { color: colors.text, fontFamily: fonts.label, fontSize: 17, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center', marginTop: 4 },
  panel: { backgroundColor: colors.bg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 12 },
  km: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 64, lineHeight: 76, letterSpacing: 1 },
  kmUnit: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 24 },
  metrics: { flexDirection: 'row', marginTop: 8 },
  metric: { flex: 1, alignItems: 'center' },
  metricV: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 26, letterSpacing: 0.5 },
  metricL: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  demoNote: { color: colors.dim, fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', marginTop: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  pauseWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 56, shadowColor: colors.primary, shadowOpacity: 0.7, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 14 },
  pause: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  hint: { color: colors.mute, fontSize: 11, fontFamily: fonts.mono, textAlign: 'center', marginTop: 14 },
  overlayFull: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,10,10,0.92)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  countText: { color: colors.primary, fontFamily: fonts.display, fontSize: 150 },
  countSub: { color: colors.onImageSub, fontFamily: fonts.mono, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
  summary: { width: '100%', maxWidth: 440, alignItems: 'center', backgroundColor: colors.bg2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 16 },
  sumMap: { alignSelf: 'stretch', height: 200, marginTop: 12 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
  verdictText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  reason: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 6, textAlign: 'center' },
  sumLine: { color: colors.sub, fontFamily: fonts.mono, fontSize: 13 },
  xpBox: { alignSelf: 'stretch', marginTop: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabel: { color: colors.sub, fontFamily: fonts.regular, fontSize: 13 },
  xpVal: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 15 },
  note: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
