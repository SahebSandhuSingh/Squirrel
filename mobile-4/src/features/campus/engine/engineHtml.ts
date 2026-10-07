/**
 * The campus map page: MapLibre GL (the same build and CDN as the Territory Network) + the campus
 * engine, inlined. Phones load it in a WebView and the web in an iframe.
 */
import { mapAssets } from '@/features/world/engine/engineHtml';
import { CAMPUS_ENGINE_CSS, CAMPUS_ENGINE_JS } from './engineSource.generated';

export function campusEngineHtml(): string {
  const a = mapAssets();
  const config = JSON.stringify({ tiles: a.tiles, glyphs: a.glyphs }).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<link rel="stylesheet" href="${a.css}" crossorigin="anonymous">
<style>${CAMPUS_ENGINE_CSS}</style>
</head><body>
<div id="map"></div><div id="vignette"></div><div id="tip"></div><div id="fallback">MAP OFFLINE</div>
<script>window.__CAMPUS_CONFIG=${config};</script>
<script src="${a.js}" crossorigin="anonymous"></script>
<script>${CAMPUS_ENGINE_JS.replace(/<\/script/gi, '<\\/script')}</script>
</body></html>`;
}
