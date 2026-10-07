/**
 * Messages between the app (React Native / React DOM) and the map engine page (engine.js, running
 * MapLibre GL inside a WebView on phones and an iframe on the web). JSON strings both ways.
 */
import type { FeatureCollection } from './features';

export type CameraView = { center: [number, number]; zoom: number; pitch?: number; bearing?: number };
export type Padding = { top: number; bottom: number; left: number; right: number };

/** App → engine. */
export type HostMessage =
  | {
      type: 'init';
      intro: boolean;
      view: CameraView;
      geo: FeatureCollection;
      terr: FeatureCollection;
      labels: FeatureCollection;
      cities: FeatureCollection;
      campuses: FeatureCollection;
      places: FeatureCollection;
      corridors: FeatureCollection;
    }
  | { type: 'terr'; terr: FeatureCollection; labels: FeatureCollection }
  | { type: 'particles'; particles: FeatureCollection }
  | { type: 'fly'; view: CameraView; duration?: number; padding?: Padding }
  | { type: 'fit'; bbox: [number, number, number, number]; padding: Padding; maxZoom?: number; pitch?: number; duration?: number }
  | { type: 'select'; id: string | null }
  | { type: 'me'; pos: [number, number] | null; accuracy: number; heading: number | null; state: 'idle' | 'active' | 'battle'; preview: boolean; announce?: boolean }
  | { type: 'fx'; kind: 'claim' | 'capture' | 'discover' | 'defend' | 'repel' | 'challenge' | 'push'; id: string; color: string }
  | { type: 'ping'; pos: [number, number]; color: string }
  | { type: 'heat'; on: boolean }
  | { type: 'insets'; top: number; right: number; focusTop: number; focusBottom: number }
  | { type: 'active'; on: boolean }
  /** Run mode: your route so far ([lng, lat]), crossed territories, and a camera that follows you. */
  | { type: 'route'; coords: [number, number][] }
  | { type: 'trail'; visited: string[]; here: string | null }
  | { type: 'follow'; on: boolean; zoom?: number; pitch?: number; top?: number; bottom?: number };

/** Engine → app. */
export type EngineMessage =
  | { type: 'ready' }
  | { type: 'loaded'; tiles: boolean }
  | { type: 'camera'; center: [number, number]; zoom: number; pitch: number; bearing: number; moving: boolean }
  | { type: 'needDetail' }
  | { type: 'tap'; id: string | null; kind?: 'territory' | 'place' | 'city'; lngLat: [number, number] }
  | { type: 'longpress'; id: string | null; x: number; y: number }
  | { type: 'introDone' }
  | { type: 'error'; detail: string };

export function parseEngineMessage(raw: unknown): EngineMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as EngineMessage;
    return m && typeof m === 'object' && typeof m.type === 'string' && m.type in KNOWN ? m : null;
  } catch {
    return null;
  }
}

const KNOWN: Record<EngineMessage['type'], true> = { ready: true, loaded: true, camera: true, needDetail: true, tap: true, longpress: true, introDone: true, error: true };
