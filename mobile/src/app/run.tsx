import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Scene } from '@/art/Scene';
import { CityMap, RunRoute } from '@/art/CityMap';
import { Mascot } from '@/art/Mascot';
import { Button, Display, Icon, IconButton, Kicker, NATIVE, Pulse, Tagline, tap } from '@/components/ui';
import { formatArea, newSubmitProgress, rejectionText, submitRun, TERMINAL_STATUSES, xpApi, type RunSummary, type SubmitStage } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthProvider';
import { listPendingRuns, removePendingRun, savePendingRun, type PendingRun } from '@/logic/pendingRuns';
import * as tracker from '@/logic/runTracker';
import { addFix, emptyTrack, localVerdict, type Fix, type Verdict } from '@/logic/track';
import { runXp } from '@/logic/xp';
import { useApp, type FinishRunResult } from '@/state/AppState';
import { StatusBar } from 'expo-status-bar';
import { statusColor } from '@/data/territory';
import { colors, fonts, MAX_WIDTH, radius } from '@/theme';

/**
 * Live run screen.
 *
 * GPS, the clock and the track live in `logic/runTracker` (a module-level session that
 * survives navigation and, via a snapshot, an app kill). This screen subscribes to it,
 * renders, and drives the finish → upload → summary flow.
 *
 * Modes (route params):
 *   (none)      new run: 3-2-1 countdown, then tracking
 *   ?resume=1   pick up a run the app was killed in the middle of (paused until you resume)
 *   ?retry=1    re-attempt the oldest upload that failed (nothing to track; straight to upload)
 *
 * Demo mode (no GPS permission, or web): distance is simulated at a fixed pace and the
 * screen says so.
 */
const DEMO_PACE = 378; // sec per km (6'18")
const DEMO_START = 32 * 60 + 16; // matches the design: 5.12 km in 32:16
const two = (n: number) => String(Math.floor(n)).padStart(2, '0');
const fmtPace = (secPerKm: number) => (Number.isFinite(secPerKm) && secPerKm > 0 ? `${Math.floor(secPerKm / 60)}'${two(secPerKm % 60)}"` : `--'--"`);
const fmtTime = (sec: number) => `${two(sec / 60)}:${two(sec % 60)}`;

type Phase = 'loading' | 'countdown' | 'running' | 'paused' | 'uploading' | 'done';
/** 'processing' = uploaded, but the server's finish worker hadn't finalised the run within the poll budget. */
type Outcome = Verdict | 'processing';
const STAGE_TEXT: Record<SubmitStage, string> = { creating: 'Registering your run…', uploading: 'Uploading your route…', finishing: 'Closing the loop…', polling: 'Verifying your run…' };

const VERDICT_UI: Record<Outcome, { label: string; icon: React.ComponentProps<typeof Icon>['name']; color: string }> = {
  accepted: { label: 'Run accepted', icon: 'check-decagram', color: colors.primary },
  flagged: { label: 'Flagged for review', icon: 'alert-decagram', color: colors.gold },
  rejected: { label: 'Run rejected', icon: 'close-octagon', color: colors.coral },
  processing: { label: 'Still processing', icon: 'progress-clock', color: colors.dim },
};

type Summary = FinishRunResult & {
  verdict: Outcome;
  reason: string;
  km: number;
  time: string;
  pace: string;
  minutes: number;
  uploadNote?: string;
  areaText?: string;
  /** Set when the upload failed and the run is saved for retry. */
  pending?: PendingRun;
};

/** Everything the upload + summary step needs, independent of where the run came from. */
type Finished = { startedAt: number; elapsedMs: number; fixes: Fix[]; rejected: number; meters: number; movingSec: number; source: tracker.GpsSource; pending?: PendingRun };

export default function Run() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { resume, retry } = useLocalSearchParams<{ resume?: string; retry?: string }>();
  const { finishRun, toast, city, districts, syncServerXp, refreshRunFlags } = useApp();
  const auth = useAuth();
  const live = auth.mode === 'live';
  const [phase, setPhase] = useState<Phase>(resume || retry ? 'loading' : 'countdown');
  const [count, setCount] = useState(3);
  const [ts, setTs] = useState(tracker.getTrackerState());
  const [, setTick] = useState(0); // 1 Hz re-render while running; the clock itself is wall-clock based
  const [music, setMusic] = useState(true);
  const [photos, setPhotos] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stage, setStage] = useState<SubmitStage>('creating');
  const [canSkipWait, setCanSkipWait] = useState(false);
  const pollAbort = useRef<AbortController | null>(null);
  const finishing = useRef(false);
  useEffect(() => () => pollAbort.current?.abort(), []);
  const progress = useRef(new Animated.Value(0.62)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const lastKmMarker = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  // ---- tracker subscription + clock ------------------------------------------
  useEffect(() => tracker.subscribe(setTs), []);
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const source = ts.source;
  const isDemo = source === 'demo';
  const elapsed = tracker.elapsedSec(ts);
  const sec = isDemo ? DEMO_START + elapsed : elapsed;
  const km = isDemo ? sec / DEMO_PACE : ts.track.meters / 1000;
  const movingSec = isDemo ? sec : ts.track.movingSec;
  const paceSec = km >= 0.05 ? movingSec / km : NaN;
  const time = fmtTime(sec);
  const kcal = Math.round(km * 80.5);
  const toNextKm = (1 - (km % 1)) * 1000;
  const accuracy = ts.accuracy;

  useEffect(() => {
    if (isDemo) lastKmMarker.current = Math.max(lastKmMarker.current, Math.floor(DEMO_START / DEMO_PACE));
  }, [isDemo]);

  // ---- entry: new run / resume / retry ---------------------------------------
  const abandonAndLeave = useCallback(() => {
    tracker.abandon().finally(() => {
      refreshRunFlags().catch(() => {});
      if (router.canGoBack()) router.back();
      else router.replace('/home');
    });
  }, [refreshRunFlags]);

  const finishedRef = useRef<Finished | null>(null);

  // 3-2-1 countdown, then start the tracker.
  useEffect(() => {
    if (phase !== 'countdown') return;
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(2)), useNativeDriver: NATIVE }).start();
    const t = setTimeout(() => {
      if (count <= 1) {
        tap('success');
        setPhase('running');
        tracker.start().catch(() => {});
        refreshRunFlags().catch(() => {});
      } else {
        tap('impact');
        setCount(count - 1);
      }
    }, 850);
    return () => clearTimeout(t);
  }, [phase, count, pop, refreshRunFlags]);

  // Resume: load the snapshot and wait, paused, for the user.
  useEffect(() => {
    if (!resume || phase !== 'loading') return;
    let cancelled = false;
    tracker.restore().then((ok) => {
      if (cancelled) return;
      if (!ok) return abandonAndLeave();
      setPhase('paused');
      toast('Run restored · resume when ready', 'history', colors.primary);
    });
    return () => {
      cancelled = true;
    };
  }, [resume, phase, abandonAndLeave, toast]);

  const pauseOrResume = () => {
    tap('impact');
    if (phase === 'running') {
      tracker.pause();
      setPhase('paused');
    } else if (phase === 'paused') {
      tracker.resume(); // re-arms GPS itself if the run was restored from a snapshot
      setPhase('running');
    }
  };

  const homeDistrict = districts.find((d) => d.status === 'yours') ?? districts[0];

  // ---- upload + summary --------------------------------------------------------
  const upload = useCallback(
    async (f: Finished) => {
      const kmLocal = +(f.meters / 1000).toFixed(2);
      const movingLocal = f.movingSec;
      const rejectedRatio = f.fixes.length ? f.rejected / (f.fixes.length + f.rejected) : 0;
      const local = f.source === 'demo' ? { verdict: 'accepted' as Verdict, reason: 'Demo run — distance is simulated.' } : localVerdict(kmLocal, movingLocal, rejectedRatio);

      let kmFinal = f.source === 'demo' ? +((DEMO_START + f.elapsedMs / 1000) / DEMO_PACE).toFixed(2) : kmLocal;
      let minutes = Math.round((f.source === 'demo' ? DEMO_START + f.elapsedMs / 1000 : movingLocal) / 60);
      let pace = fmtPace(kmFinal > 0 ? (f.source === 'demo' ? DEMO_PACE : movingLocal / kmFinal) : NaN);
      const timeText = fmtTime(f.source === 'demo' ? DEMO_START + Math.floor(f.elapsedMs / 1000) : Math.floor(f.elapsedMs / 1000));
      let outcome: Outcome = local.verdict;
      let reason = local.reason;
      let serverXp: number | undefined;
      let serverLines: { label: string; xp: number }[] | undefined;
      let uploadNote: string | undefined;
      let areaText: string | undefined;
      let districtId: string | undefined = homeDistrict?.id; // local/demo rule: a ≥1 km run claims your home zone
      let serverXpTotal: number | undefined;

      const uploadable = live && f.source !== 'demo' && f.fixes.length > 1;
      if (uploadable) {
        // Save first, so a crash or network failure at any point can be retried from Home.
        const pending: PendingRun = f.pending ?? { id: '', startedAt: f.startedAt, elapsedMs: f.elapsedMs, fixes: f.fixes, progress: newSubmitProgress(), attempts: 0 };
        if (!pending.id) pending.id = pending.progress.clientRunId;
        pending.attempts += 1;
        await savePendingRun(pending).catch(() => {});
        refreshRunFlags().catch(() => {});

        setStage(pending.progress.finished ? 'polling' : pending.progress.runId ? 'uploading' : 'creating');
        setPhase('uploading');
        try {
          const before = await xpApi.me().catch(() => null);
          // Finalisation can take minutes under queue load; after 15s of verifying, offer "Don't wait".
          const ctrl = new AbortController();
          pollAbort.current = ctrl;
          let skipTimer: ReturnType<typeof setTimeout> | undefined;
          const r: RunSummary = await submitRun(f.startedAt, f.fixes, {
            progress: pending.progress,
            onProgress: (p) => {
              pending.progress = p;
              savePendingRun(pending).catch(() => {});
            },
            signal: ctrl.signal,
            onStage: (st) => {
              setStage(st);
              if (st === 'polling') skipTimer = setTimeout(() => setCanSkipWait(true), 15_000);
            },
          }).finally(() => {
            clearTimeout(skipTimer);
            setCanSkipWait(false);
          });
          // The server recomputes distance and moving time; prefer its numbers.
          if (r.stats?.distance_m != null) kmFinal = +(r.stats.distance_m / 1000).toFixed(2);
          if (r.stats?.moving_time_s != null) {
            minutes = Math.round(r.stats.moving_time_s / 60);
            pace = fmtPace(kmFinal > 0 ? r.stats.moving_time_s / kmFinal : NaN);
          }
          const terminal = TERMINAL_STATUSES.includes(r.status);
          outcome = !terminal ? 'processing' : r.status === 'finalized' ? 'accepted' : r.status === 'flagged' ? 'flagged' : 'rejected';
          reason =
            outcome === 'rejected'
              ? rejectionText(r.rejection)
              : outcome === 'flagged'
                ? 'Flagged for review. Your territory still counts.'
                : outcome === 'processing'
                  ? 'Uploaded. The server is still finishing it; check back in a minute.'
                  : 'Verified by the server.';
          // Territory comes only from the server: finalized and flagged runs can carry it.
          const gotTerritory = (outcome === 'accepted' || outcome === 'flagged') && r.territory != null;
          districtId = gotTerritory ? homeDistrict?.id : undefined;
          const area = r.territory && typeof r.territory.area_m2 === 'number' ? r.territory.area_m2 : undefined;
          if (gotTerritory && area != null) areaText = `+${formatArea(area)} claimed`;
          // XP lives only at /v1/users/me/xp: award = after − before.
          const after = terminal ? await xpApi.me().catch(() => null) : null;
          if (after) {
            serverXpTotal = after.xp;
            serverXp = before ? Math.max(0, after.xp - before.xp) : undefined;
            serverLines = serverXp != null ? [{ label: 'Awarded by the server', xp: serverXp }] : undefined;
          } else {
            serverXp = 0;
            serverLines = [{ label: outcome === 'processing' ? 'XP pending (still processing)' : 'XP unavailable right now', xp: 0 }];
          }
          uploadNote = `Run ${r.run_id.slice(0, 8)} · ${r.status}`;
          // The server has it (even if still processing): nothing left to retry.
          await removePendingRun(pending.id).catch(() => {});
          refreshRunFlags().catch(() => {});
        } catch (e) {
          // Keep the run on disk with a note; XP is NOT awarded until the upload succeeds,
          // otherwise a later retry would count it twice.
          const msg = e instanceof Error ? e.message : 'error';
          pending.lastError = msg;
          await savePendingRun(pending).catch(() => {});
          refreshRunFlags().catch(() => {});
          const est = runXp(kmFinal, false, 0);
          setSummary({
            xp: 0,
            lines: [...est.lines.map((l) => ({ ...l, label: `${l.label} (estimate)` })), { label: 'Added when the upload succeeds', xp: 0 }],
            capped: false,
            leveledUp: false,
            verdict: outcome,
            reason,
            km: kmFinal,
            time: timeText,
            pace,
            minutes,
            uploadNote: `Couldn't reach the server (${msg}). Your run is saved on this phone — retry any time from Home.`,
            pending,
          });
          setPhase('done');
          return;
        }
      } else if (!live) {
        uploadNote = 'Demo mode · sign in to sync runs with the server.';
      } else if (f.source === 'demo') {
        uploadNote = 'No GPS for this run, so it stays on this phone.';
      }

      const res = finishRun({
        km: kmFinal,
        minutes,
        verdict: outcome === 'processing' ? 'accepted' : outcome,
        districtId: outcome === 'processing' ? undefined : districtId,
        serverXp,
        serverLines,
      });
      if (serverXpTotal != null) syncServerXp(serverXpTotal);
      setSummary({ ...res, verdict: outcome, reason, km: kmFinal, time: timeText, pace, minutes, uploadNote, areaText });
      setPhase('done');
    },
    [live, homeDistrict, finishRun, syncServerXp, refreshRunFlags],
  );

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    tap('success');
    const final = await tracker.finish();
    const f: Finished = {
      startedAt: final.startedAt,
      elapsedMs: final.elapsedBase,
      fixes: final.track.points,
      rejected: final.track.rejected,
      meters: final.track.meters,
      movingSec: final.track.movingSec,
      source: final.source,
    };
    finishedRef.current = f;
    refreshRunFlags().catch(() => {});
    await upload(f);
    finishing.current = false;
  }, [upload, refreshRunFlags]);

  // Retry: pull the oldest saved upload and go straight to the upload step.
  useEffect(() => {
    if (!retry || phase !== 'loading') return;
    let cancelled = false;
    listPendingRuns().then(async (list) => {
      if (cancelled) return;
      const p = list[0];
      if (!p) {
        refreshRunFlags().catch(() => {});
        return router.canGoBack() ? router.back() : router.replace('/home');
      }
      // Re-derive the local stats from the saved fixes.
      let track = emptyTrack();
      for (const fx of p.fixes) track = addFix(track, fx);
      const f: Finished = { startedAt: p.startedAt, elapsedMs: p.elapsedMs, fixes: p.fixes, rejected: track.rejected, meters: track.meters, movingSec: track.movingSec, source: 'foreground', pending: p };
      finishedRef.current = f;
      await upload(f);
    });
    return () => {
      cancelled = true;
    };
  }, [retry, phase, upload, refreshRunFlags]);

  const retryUpload = () => {
    const f = finishedRef.current;
    if (!f || !summary?.pending) return;
    upload({ ...f, pending: summary.pending }).catch(() => {});
  };

  const discardPending = async () => {
    if (summary?.pending) await removePendingRun(summary.pending.id).catch(() => {});
    refreshRunFlags().catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  // Haptic + toast on each new km
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
    Animated.timing(progress, { toValue: Math.min(1, 0.55 + (km % 1) * 0.45), duration: 900, useNativeDriver: false }).start();
  }, [km, progress]);

  const heroH = Math.max(300, height * 0.5);
  const hasGps = source === 'background' || source === 'foreground';
  const gpsPill = hasGps
    ? accuracy == null
      ? { text: 'GPS · searching', color: colors.gold }
      : accuracy <= 15
        ? { text: `GPS · ±${Math.round(accuracy)} m${source === 'foreground' ? ' · keep app open' : ''}`, color: colors.primary }
        : { text: `Weak GPS · ±${Math.round(accuracy)} m`, color: colors.orange }
    : source === 'demo'
      ? { text: Platform.OS === 'web' ? 'Demo · no GPS on web' : 'Demo · location off', color: colors.dim }
      : { text: 'Locating…', color: colors.dim };

  const leave = () => {
    // A run in progress keeps tracking; the Home banner brings the user back.
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={{ height: heroH }}>
        <Scene kind="city-night" seed={9} aspect={width / heroH} style={StyleSheet.absoluteFill} />
        <RunRoute progress={progress} style={StyleSheet.absoluteFill} />
      </View>

      <View style={[styles.overlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <IconButton icon="chevron-down" size={26} onPress={leave} label="Minimise" />
          <Display size={30} color={colors.onImage} style={{ flex: 1, marginLeft: 10 }}>{phase === 'paused' ? 'Paused' : 'Running'}</Display>
          <View style={[styles.gps, { borderColor: `${gpsPill.color}88` }]} accessibilityLabel={gpsPill.text}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: gpsPill.color }}>{hasGps && <Pulse size={8} color={gpsPill.color} />}</View>
            <Text style={[styles.gpsText, { color: gpsPill.color }]} numberOfLines={1}>{gpsPill.text}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
          <View style={{ gap: 6, flexShrink: 1 }}>
            <View style={styles.chip}>
              <Icon name="map-marker-path" size={14} color={colors.primary} />
              <Text style={styles.chipText} numberOfLines={1}>{city.venues?.runs?.[0] ?? 'City'} loop</Text>
            </View>
            {homeDistrict && (
              <View style={styles.chip}>
                <Icon name="flag-variant" size={14} color={statusColor[homeDistrict.status]} />
                <Text style={styles.chipText} numberOfLines={1}>Claiming {homeDistrict.name}</Text>
              </View>
            )}
          </View>
          <View style={styles.mini}>
            <CityMap seed={4} route routeProgress={progress} style={StyleSheet.absoluteFill} />
          </View>
        </View>
        <Tagline size={30} color={colors.onImage} style={styles.tagline}>Just{'\n'}one more{'\n'}km</Tagline>
      </View>

      <View style={[styles.col, { flex: 1, justifyContent: 'flex-end', paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.panel}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <Text style={styles.km}>{km.toFixed(2)}</Text>
            <Text style={styles.kmUnit}> KM</Text>
          </View>
          <Text style={styles.next}>{Math.round(toNextKm)} m to the next km · +10 XP</Text>
          <View style={styles.metrics}>
            {[
              [time, 'Time'],
              [fmtPace(paceSec), 'Pace'],
              [String(kcal), 'Calories'],
            ].map(([v, l], i) => (
              <View key={l} style={[styles.metric, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.line }]}>
                <Text style={styles.metricV}>{v}</Text>
                <Text style={styles.metricL}>{l}</Text>
              </View>
            ))}
          </View>
          {music && (
            <View style={styles.nowPlaying}>
              <Icon name="music-note" size={14} color={colors.secondary} />
              <Text style={styles.npText} numberOfLines={1}>Neon Miles · Squirrel Radio</Text>
              <Icon name="equalizer" size={16} color={colors.secondary} />
            </View>
          )}
        </View>

        <View style={styles.controls}>
          <Pressable style={[styles.side, music && { borderColor: colors.secondary }]} onPress={() => { tap(); setMusic((m) => !m); }} accessibilityLabel="Music">
            <Icon name={music ? 'music' : 'music-off'} size={26} color={music ? colors.secondary : colors.text} />
          </Pressable>
          <Pressable
            onPress={pauseOrResume}
            onLongPress={finish}
            disabled={phase === 'countdown' || phase === 'uploading' || phase === 'loading' || phase === 'done'}
            accessibilityLabel={phase === 'running' ? 'Pause' : 'Resume'}
            accessibilityHint="Long press to finish run"
            style={({ pressed }) => [styles.pauseWrap, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            {phase === 'running' && <Pulse size={104} color={colors.primary} />}
            <View style={styles.pause}>
              <Icon name={phase === 'running' ? 'pause' : 'play'} size={48} color={colors.onPrimary} />
            </View>
          </Pressable>
          <Pressable
            style={styles.side}
            onPress={() => {
              tap();
              setPhotos((n) => n + 1);
              toast(`Photo pinned at ${km.toFixed(2)} km`, 'camera', colors.primary);
            }}
            accessibilityLabel="Camera">
            <Icon name="camera-outline" size={26} color={colors.text} />
            {photos > 0 && (
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>{photos}</Text>
              </View>
            )}
          </Pressable>
        </View>
        {phase === 'paused' ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Button label="Finish run" variant="secondary" size="md" iconLeft="flag-checkered" onPress={finish} style={{ flex: 1 }} />
            <Button label="Discard" variant="secondary" size="md" iconLeft="trash-can-outline" onPress={abandonAndLeave} style={{ flex: 1 }} />
          </View>
        ) : (
          <Text style={styles.hint}>Hold the button to finish</Text>
        )}
      </View>

      {phase === 'loading' && (
        <View style={styles.overlayFull}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.countSub, { marginTop: 14 }]}>{retry ? 'Preparing upload…' : 'Restoring your run…'}</Text>
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
          {canSkipWait && (
            <Button label="Don't wait" variant="secondary" size="md" onPress={() => pollAbort.current?.abort()} style={{ marginTop: 18 }} />
          )}
        </View>
      )}

      {phase === 'done' && summary && (
        <View style={styles.overlayFull}>
          <View style={[styles.summary, { marginTop: insets.top }]}>
            <Mascot pose={summary.verdict === 'rejected' ? 'sit' : 'celebrate'} size={110} animated />
            <View style={[styles.verdict, { borderColor: VERDICT_UI[summary.verdict].color }]}>
              <Icon name={VERDICT_UI[summary.verdict].icon} size={16} color={VERDICT_UI[summary.verdict].color} />
              <Text style={[styles.verdictText, { color: VERDICT_UI[summary.verdict].color }]}>{summary.pending ? 'Saved · upload failed' : VERDICT_UI[summary.verdict].label}</Text>
            </View>
            <Text style={styles.reason}>{summary.reason}</Text>
            <Display size={34} style={{ marginTop: 6 }}>{summary.km.toFixed(2)} km</Display>
            <Text style={styles.sumLine}>{summary.time} · {summary.pace}/km</Text>

            <View style={styles.xpBox}>
              <Kicker>XP breakdown</Kicker>
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

            {summary.captured && (
              <View style={styles.captured}>
                <Icon name="flag-variant" size={18} color={colors.onPrimary} />
                <Text style={styles.capturedText}>
                  {summary.captured.name}: {Math.round(summary.captured.control * 100)}% yours{summary.areaText ? ` · ${summary.areaText}` : ''}
                </Text>
              </View>
            )}
            {summary.uploadNote && <Text style={styles.note}>{summary.uploadNote}</Text>}

            {summary.pending ? (
              <>
                <Button label="Retry upload" iconLeft="cloud-upload-outline" onPress={retryUpload} style={{ alignSelf: 'stretch', marginTop: 14 }} />
                <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 10 }}>
                  <Button label="Later" variant="secondary" size="md" onPress={leave} style={{ flex: 1 }} />
                  <Button label="Discard run" variant="secondary" size="md" onPress={discardPending} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <>
                {summary.verdict !== 'rejected' && (
                  <Button
                    label="Share to feed"
                    iconLeft="send"
                    onPress={() => router.replace({ pathname: '/compose', params: { km: summary.km.toFixed(2), min: String(summary.minutes), pace: summary.pace } })}
                    style={{ alignSelf: 'stretch', marginTop: 14 }}
                  />
                )}
                <Button
                  label={summary.leveledUp ? 'See level up' : summary.captured ? 'View territory' : 'Done'}
                  variant="secondary"
                  size="md"
                  onPress={() => (summary.leveledUp ? router.replace('/level-up') : summary.captured ? router.replace('/territory') : leave())}
                  style={{ alignSelf: 'stretch', marginTop: 10 }}
                />
              </>
            )}
          </View>
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(10,10,10,0.75)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 230 },
  chipText: { color: colors.onImage, fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 1 },
  mini: { width: 92, height: 92, borderRadius: 46, overflow: 'hidden', borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.bg2 },
  tagline: { position: 'absolute', right: 22, top: 210, textAlign: 'right' },
  panel: { backgroundColor: colors.bg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, paddingTop: 16, paddingBottom: 12, paddingHorizontal: 12 },
  km: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 64, lineHeight: 76, letterSpacing: 1 },
  kmUnit: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 24 },
  next: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textAlign: 'center' },
  metrics: { flexDirection: 'row', marginTop: 12 },
  metric: { flex: 1, alignItems: 'center' },
  metricV: { color: colors.text, fontFamily: fonts.labelBold, fontSize: 26, letterSpacing: 0.5 },
  metricL: { color: colors.dim, fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  npText: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 20 },
  side: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  pauseWrap: { alignItems: 'center', justifyContent: 'center', borderRadius: 56, shadowColor: colors.primary, shadowOpacity: 0.7, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 14 },
  pause: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  photoBadge: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  photoBadgeText: { color: colors.onSecondary, fontFamily: fonts.bold, fontSize: 11 },
  hint: { color: colors.mute, fontSize: 11, fontFamily: fonts.mono, textAlign: 'center', marginTop: 14 },
  overlayFull: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,10,10,0.9)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  countText: { color: colors.primary, fontFamily: fonts.display, fontSize: 150 },
  countSub: { color: colors.onImageSub, fontFamily: fonts.mono, fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' },
  summary: { width: '100%', maxWidth: 420, alignItems: 'center', backgroundColor: colors.bg2, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 18 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4 },
  verdictText: { fontFamily: fonts.label, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  reason: { color: colors.dim, fontFamily: fonts.regular, fontSize: 12, marginTop: 6, textAlign: 'center' },
  sumLine: { color: colors.sub, fontFamily: fonts.mono, fontSize: 13 },
  xpBox: { alignSelf: 'stretch', marginTop: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabel: { color: colors.sub, fontFamily: fonts.regular, fontSize: 13 },
  xpVal: { color: colors.primary, fontFamily: fonts.labelBold, fontSize: 15 },
  captured: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginTop: 10, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  capturedText: { color: colors.onPrimary, fontFamily: fonts.label, fontSize: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
  note: { color: colors.dim, fontFamily: fonts.mono, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
