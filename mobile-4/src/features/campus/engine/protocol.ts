/**
 * Messages between the app and the campus map page (campusEngine.js: MapLibre GL in a WebView on
 * phones, an iframe on the web). JSON strings both ways.
 */
import type { CampusLayers, FeatureCollection } from './features';

export type MapMode = 'explore' | 'territory' | 'crews' | 'activity' | 'challenges';
export type Padding = { top: number; bottom: number; left: number; right: number };
export type Bbox = [number, number, number, number];

/** App → engine. */
export type HostMessage =
  | { type: 'init'; base: FeatureCollection; bbox: Bbox; padding: Padding; bearing: number; intro: boolean }
  | ({ type: 'state' } & CampusLayers)
  | { type: 'mode'; mode: MapMode }
  | { type: 'select'; id: string | null }
  | { type: 'me'; pos: [number, number] | null; accuracy: number; heading: number | null; preview: boolean }
  | { type: 'fx'; kind: 'claim' | 'capture' | 'attack' | 'defend' | 'repel' | 'challenge' | 'lost'; id: string; color: string; from?: [number, number] | null }
  | { type: 'ping'; id: string; color: string }
  | { type: 'fit'; bbox: Bbox; padding: Padding; bearing?: number; maxZoom?: number; duration?: number }
  | { type: 'fly'; center: [number, number]; zoom?: number; padding: Padding; bearing?: number; duration?: number }
  | { type: 'north' }
  | { type: 'zoom'; by: number }
  | { type: 'insets'; top: number; right: number }
  | { type: 'active'; on: boolean };

/** Engine → app. */
export type EngineMessage =
  | { type: 'ready' }
  | { type: 'loaded'; tiles: boolean }
  | { type: 'tap'; id: string | null; lngLat: [number, number] }
  | { type: 'camera'; zoom: number; bearing: number; moving: boolean }
  | { type: 'error'; detail: string };

const KNOWN: Record<EngineMessage['type'], true> = { ready: true, loaded: true, tap: true, camera: true, error: true };

export function parseEngineMessage(raw: unknown): EngineMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const m = JSON.parse(raw) as EngineMessage;
    return m && typeof m === 'object' && typeof m.type === 'string' && m.type in KNOWN ? m : null;
  } catch {
    return null;
  }
}
