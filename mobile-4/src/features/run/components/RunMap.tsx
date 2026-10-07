/**
 * The live run map: the Territory Network engine in run mode. The camera follows you (tilted,
 * close), your route glows behind you, and every territory you've crossed keeps a bright edge —
 * the one you're in now brightest. A drag hands the camera back to you for a few seconds.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WorldCanvas, type WorldCanvasHandle } from '@/features/world/components/WorldCanvas';
import { particleFeatures, territoryFeatures } from '@/features/world/engine/features';
import { initMessage } from '@/features/world/engine/init';
import type { EngineMessage, HostMessage } from '@/features/world/engine/protocol';
import { getWorld, useDiscovered, useMapVersion } from '@/features/world/state/worldStore';

export type RunMapHandle = {
  /** Frame the whole route (results), or go back to following you. */
  frameRoute: (padding: { top: number; bottom: number; left: number; right: number }) => void;
  recenter: () => void;
};

type Props = {
  /** Your route so far, [lat, lng]. */
  route: [number, number][];
  here: [number, number] | null;
  accuracy: number | null;
  visited: string[];
  current: string | null;
  follow: boolean;
  /** 'battle' tints the marker when you're on contested ground. */
  state: 'idle' | 'active' | 'battle';
  preview: boolean;
  /** Screen space covered by the HUD (px): following keeps you in the open part of the map. */
  cover: { top: number; bottom: number };
  style?: StyleProp<ViewStyle>;
};

const START_VIEW = { center: [88.3637, 22.5762] as [number, number], zoom: 15.6, pitch: 55, bearing: -12 };

export const RunMap = forwardRef<RunMapHandle, Props>(function RunMap({ route, here, accuracy, visited, current, follow, state, preview, cover, style }, ref) {
  const canvas = useRef<WorldCanvasHandle>(null);
  const send = useCallback((m: HostMessage) => canvas.current?.send(m), []);
  const [ready, setReady] = useState(false);
  const discovered = useDiscovered();
  const mapVersion = useMapVersion();
  const latest = useRef({ route, here, cover });
  useLayoutEffect(() => {
    latest.current = { route, here, cover };
  });

  const onMessage = useCallback(
    (m: EngineMessage) => {
      if (m.type !== 'ready') return;
      const h = latest.current.here;
      send(initMessage(getWorld(), discovered, { intro: false, detail: true, view: h ? { ...START_VIEW, center: [h[1], h[0]] } : START_VIEW }));
      send({ type: 'active', on: true });
      setReady(true);
    },
    // The engine sends 'ready' once; `discovered` at that moment is what it should start with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send],
  );

  useEffect(() => {
    if (!ready) return;
    const world = getWorld();
    send({ type: 'terr', ...territoryFeatures(world, discovered, true) });
    send({ type: 'particles', particles: particleFeatures(world, discovered) });
  }, [ready, mapVersion, discovered, send]);

  useEffect(() => {
    if (ready) send({ type: 'follow', on: follow, zoom: 16.2, pitch: 58, top: cover.top, bottom: cover.bottom });
  }, [ready, follow, cover.top, cover.bottom, send]);

  const hereKey = here ? `${here[0].toFixed(6)},${here[1].toFixed(6)}` : '';
  useEffect(() => {
    if (ready) send({ type: 'me', pos: here ? [here[1], here[0]] : null, accuracy: accuracy ?? 15, heading: null, state, preview });
  }, [ready, hereKey, accuracy, state, preview, send]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready) send({ type: 'route', coords: route.map((p) => [p[1], p[0]]) });
  }, [ready, route, send]);

  const visitedKey = visited.join(',');
  useEffect(() => {
    if (ready) send({ type: 'trail', visited, here: current });
  }, [ready, visitedKey, current, send]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(
    ref,
    () => ({
      frameRoute: (padding) => {
        const pts = latest.current.route;
        if (pts.length < 2) return;
        let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const [lat, lng] of pts) {
          w = Math.min(w, lng);
          e = Math.max(e, lng);
          s = Math.min(s, lat);
          n = Math.max(n, lat);
        }
        send({ type: 'follow', on: false });
        send({ type: 'fit', bbox: [w, s, e, n], padding, maxZoom: 16.5, pitch: 30, duration: 1400 });
      },
      recenter: () => send({ type: 'follow', on: true, zoom: 16.2, pitch: 58, top: latest.current.cover.top, bottom: latest.current.cover.bottom }),
    }),
    [send],
  );

  return <WorldCanvas ref={canvas} onMessage={onMessage} style={style} />;
});
