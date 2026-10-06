/**
 * The map page: MapLibre GL (from a CDN, or EXPO_PUBLIC_MAPLIBRE_URL) + the engine, inlined.
 * Phones load it in a WebView and the web in an iframe — the same page, so the map behaves the
 * same everywhere and no native map module (or new development build) is needed.
 */
import { MAP_GLYPHS_URL, MAP_TILES_URL, MAPLIBRE_URL } from '@/api/config';
import { ENGINE_CSS, ENGINE_JS, LOGO_DATA_URL } from './engineSource.generated';

export const MAPLIBRE_VERSION = '5.24.0';

export function mapAssets() {
  const base = MAPLIBRE_URL || `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist`;
  return {
    js: `${base}/maplibre-gl.js`,
    css: `${base}/maplibre-gl.css`,
    tiles: MAP_TILES_URL === 'off' ? null : MAP_TILES_URL || 'https://tiles.openfreemap.org/planet',
    glyphs: MAP_GLYPHS_URL || 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  };
}

export function engineHtml(): string {
  const a = mapAssets();
  const config = JSON.stringify({ tiles: a.tiles, glyphs: a.glyphs, logo: LOGO_DATA_URL }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<link rel="stylesheet" href="${a.css}" crossorigin="anonymous">
<style>${ENGINE_CSS}</style>
</head><body>
<div id="map"></div><div id="vignette"></div><div id="grain"></div><div id="tip"></div><div id="fallback">MAP OFFLINE</div>
<script>window.__WORLD_CONFIG=${config};</script>
<script src="${a.js}" crossorigin="anonymous"></script>
<script>${ENGINE_JS.replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
}
