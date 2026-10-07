/* eslint-disable */
/**
 * Squirrel Social — Territory Network map engine.
 *
 * Runs inside the map page (a WebView on phones, an iframe on the web) next to MapLibre GL, which
 * the page loads first. It is not imported by the app: scripts/world-engine.mjs inlines it into
 * engineSource.generated.ts. Talks to the app with JSON messages (see protocol.ts).
 *
 * Everything that moves is driven from ONE requestAnimationFrame loop, capped at ~30 fps, that
 * only touches layers visible at the current zoom and stops when the page is hidden or the app
 * says the map is off screen. Data changes go through setData (parsed off the main thread).
 */
(function () {
  'use strict';
  var CFG = window.__WORLD_CONFIG || {};
  var FONT = ['Noto Sans Bold'];
  var FONT_REG = ['Noto Sans Regular'];
  var FONT_IT = ['Noto Sans Italic'];
  var INK = '#EDE6D6';
  var HALO = '#06070A';

  // ---------------------------------------------------------------------------
  // Bridge
  // ---------------------------------------------------------------------------
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, '*');
  }
  window.__host = function (msg) {
    try {
      handle(typeof msg === 'string' ? JSON.parse(msg) : msg);
    } catch (e) {
      send({ type: 'error', detail: String((e && e.message) || e) });
    }
  };
  window.addEventListener('message', function (e) {
    if (typeof e.data !== 'string' || e.data.charAt(0) !== '{') return;
    window.__host(e.data);
  });
  window.addEventListener('error', function (e) {
    send({ type: 'error', detail: String(e.message || 'error') });
  });

  if (!window.maplibregl) {
    send({ type: 'error', detail: 'maplibre_unavailable' });
    document.getElementById('fallback').style.display = 'flex';
    return;
  }

  // ---------------------------------------------------------------------------
  // Style
  // ---------------------------------------------------------------------------
  var EMPTY = { type: 'FeatureCollection', features: [] };
  function src() {
    return { type: 'geojson', data: EMPTY };
  }
  var zi = function (stops) {
    return ['interpolate', ['linear'], ['zoom']].concat(stops);
  };
  var ze = function (stops) {
    return ['interpolate', ['exponential', 1.6], ['zoom']].concat(stops);
  };

  /** Fill strength for a territory (data part), before zoom fading. */
  var FILL_BASE = [
    'case',
    ['==', ['get', 'disc'], 0], 0,
    ['==', ['get', 'status'], 'unclaimed'], 0.035,
    ['==', ['get', 'status'], 'locked'], 0.1,
    ['+', 0.03, ['*', ['/', ['get', 'control'], 100], 0.08]],
  ];
  var FILL_STATE = ['+', FILL_BASE, ['case', ['boolean', ['feature-state', 'selected'], false], 0.1, ['boolean', ['feature-state', 'here'], false], 0.12, ['boolean', ['feature-state', 'visited'], false], 0.06, ['boolean', ['feature-state', 'hover'], false], 0.06, 0]];
  /** Split zones hand over to their micro territories between z12.8 and z13.6. */
  function tierFade(expr, lowSplit, highSplit, lowMicro, highMicro) {
    return [
      'interpolate', ['linear'], ['zoom'],
      12.8, ['*', expr, ['case', ['==', ['get', 'tier'], 5], lowMicro, ['==', ['get', 'split'], 1], lowSplit, 1]],
      13.6, ['*', expr, ['case', ['==', ['get', 'tier'], 5], highMicro, ['==', ['get', 'split'], 1], highSplit, 1]],
    ];
  }

  function tileLayers() {
    if (!CFG.tiles) return [];
    var t = function (layer, extra) {
      var l = { source: 'omt', 'source-layer': layer };
      for (var k in extra) l[k] = extra[k];
      return l;
    };
    var cls = function (list) {
      return ['match', ['get', 'class'], list, true, false];
    };
    return [
      t('landcover', { id: 'lc-wood', type: 'fill', filter: cls(['wood', 'forest']), paint: { 'fill-color': '#0A110D', 'fill-opacity': 0.85 } }),
      t('landcover', { id: 'lc-wetland', type: 'fill', filter: cls(['wetland', 'swamp']), paint: { 'fill-color': '#08121A', 'fill-opacity': 0.8 } }),
      t('landcover', { id: 'lc-grass', type: 'fill', minzoom: 9, filter: cls(['grass', 'scrub']), paint: { 'fill-color': '#0B100D', 'fill-opacity': 0.6 } }),
      t('landuse', { id: 'lu-residential', type: 'fill', minzoom: 10, filter: cls(['residential', 'suburb', 'neighbourhood']), paint: { 'fill-color': '#0B0C10', 'fill-opacity': 0.9 } }),
      t('landuse', { id: 'lu-campus', type: 'fill', minzoom: 11, filter: cls(['university', 'college', 'school']), paint: { 'fill-color': '#15130D', 'fill-opacity': 0.95 } }),
      t('landuse', { id: 'lu-campus-edge', type: 'line', minzoom: 13, filter: cls(['university', 'college']), paint: { 'line-color': '#3A3220', 'line-width': 0.8, 'line-dasharray': [2, 2] } }),
      t('park', { id: 'park', type: 'fill', minzoom: 9, paint: { 'fill-color': '#0B140F', 'fill-opacity': 0.9 } }),
      t('landuse', { id: 'lu-pitch', type: 'fill', minzoom: 12, filter: cls(['pitch', 'stadium', 'playground']), paint: { 'fill-color': '#0D1610', 'fill-opacity': 0.9 } }),
      t('water', { id: 'water', type: 'fill', paint: { 'fill-color': '#0A1621' } }),
      t('water', { id: 'water-edge', type: 'line', minzoom: 10, paint: { 'line-color': '#15304A', 'line-width': zi([10, 0.4, 16, 1.2]), 'line-opacity': 0.8 } }),
      t('waterway', { id: 'waterway', type: 'line', minzoom: 8, paint: { 'line-color': '#0F2233', 'line-width': ze([8, 0.4, 14, 2.2, 18, 6]) } }),
      t('aeroway', { id: 'runway', type: 'line', minzoom: 11, filter: ['==', ['get', 'class'], 'runway'], paint: { 'line-color': '#16181E', 'line-width': ze([11, 1, 16, 26]) } }),
      t('transportation', { id: 'road-minor', type: 'line', minzoom: 12.5, filter: cls(['minor', 'service', 'track']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#13151A', 'line-width': ze([12.5, 0.3, 17, 7]) } }),
      t('transportation', { id: 'road-path', type: 'line', minzoom: 15, filter: cls(['path']), paint: { 'line-color': '#1A1C22', 'line-width': 1, 'line-dasharray': [1.5, 1.5] } }),
      t('transportation', { id: 'rail', type: 'line', minzoom: 10, filter: cls(['rail', 'transit']), paint: { 'line-color': '#1E2026', 'line-width': zi([10, 0.6, 16, 1.6]), 'line-dasharray': [3, 2] } }),
      t('transportation', { id: 'road-secondary', type: 'line', minzoom: 10, filter: cls(['secondary', 'tertiary']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1A1C22', 'line-width': ze([10, 0.3, 17, 10]) } }),
      t('transportation', { id: 'road-primary', type: 'line', minzoom: 7, filter: cls(['primary', 'trunk']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#23262D', 'line-width': ze([7, 0.3, 12, 1.6, 17, 13]) } }),
      t('transportation', { id: 'road-motorway', type: 'line', minzoom: 5, filter: cls(['motorway']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2C2F37', 'line-width': ze([5, 0.4, 12, 2.2, 17, 15]) } }),
      t('building', { id: 'building', type: 'fill', minzoom: 14, maxzoom: 15.2, paint: { 'fill-color': '#101217', 'fill-outline-color': '#181B22' } }),
      t('building', { id: 'building-3d', type: 'fill-extrusion', minzoom: 15, paint: { 'fill-extrusion-color': '#121419', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': zi([15, 0, 15.6, 0.88]) } }),
    ];
  }

  function tileLabels() {
    if (!CFG.tiles) return [];
    return [
      { id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14.5, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT_REG, 'text-size': 10, 'text-letter-spacing': 0.06 }, paint: { 'text-color': '#62656E', 'text-halo-color': HALO, 'text-halo-width': 1.2 } },
      { id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name', minzoom: 12, layout: { 'text-field': ['get', 'name'], 'text-font': FONT_IT, 'text-size': 11, 'text-letter-spacing': 0.1 }, paint: { 'text-color': '#3E5D78', 'text-halo-color': HALO, 'text-halo-width': 1 } },
      { id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 14, filter: ['match', ['get', 'class'], ['neighbourhood', 'quarter', 'suburb'], true, false], layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': FONT_REG, 'text-size': 10, 'text-letter-spacing': 0.25 }, paint: { 'text-color': '#4B4E57', 'text-halo-color': HALO, 'text-halo-width': 1 } },
    ];
  }

  function buildStyle() {
    var sources = { geo: src(), terr: { type: 'geojson', data: EMPTY, promoteId: 'id' }, labels: { type: 'geojson', data: EMPTY, promoteId: 'id' }, particles: src(), pings: src(), cities: src(), places: src(), corridors: src(), me: src(), fx: src(), grid: src(), route: { type: 'geojson', data: EMPTY, lineMetrics: true }, campuses: { type: 'geojson', data: EMPTY, cluster: true, clusterMaxZoom: 11, clusterRadius: 44 } };
    if (CFG.tiles) sources.omt = { type: 'vector', url: CFG.tiles };
    var isTerr = ['==', ['get', 'disc'], 1];
    var layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#06070A' } }]
      .concat([
        // A faint tactical grid: every 0.5° at state zoom, every 0.02° in the city.
        { id: 'grid', type: 'line', source: 'grid', paint: { 'line-color': '#FFFFFF', 'line-opacity': ['case', ['==', ['get', 'major'], 1], 0.045, 0.022], 'line-width': 0.6 } },
      ])
      .concat(tileLayers())
      .concat([
        { id: 'neighbour-line', type: 'line', source: 'geo', maxzoom: 11, filter: ['==', ['get', 'kind'], 'neighbour'], paint: { 'line-color': '#24262C', 'line-width': 0.7 } },
        { id: 'mask', type: 'fill', source: 'geo', maxzoom: 11, filter: ['==', ['get', 'kind'], 'mask'], paint: { 'fill-color': '#020203', 'fill-opacity': zi([5, 0.66, 8, 0.55, 10.5, 0]) } },
        { id: 'wb-glow', type: 'line', source: 'geo', maxzoom: 11, filter: ['==', ['get', 'kind'], 'wb'], paint: { 'line-color': '#D7FF1F', 'line-width': 7, 'line-blur': 6, 'line-opacity': zi([5, 0.10, 9, 0.06, 10.5, 0]) } },
        { id: 'wb-line', type: 'line', source: 'geo', maxzoom: 11, filter: ['==', ['get', 'kind'], 'wb'], paint: { 'line-color': '#CFC8B6', 'line-width': zi([5, 0.9, 9, 1.4]), 'line-opacity': zi([5, 0.7, 9, 0.45, 10.5, 0]) } },
        { id: 'hooghly', type: 'line', source: 'geo', filter: ['==', ['get', 'kind'], 'river'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#163452', 'line-width': ze([5, 1.1, 10, 3.2, 14, 14]), 'line-opacity': CFG.tiles ? zi([5, 0.95, 10.5, 0.8, 11.5, 0]) : 0.9 } },
        // Territories
        { id: 'terr-fog', type: 'fill', source: 'terr', minzoom: 8.5, filter: ['==', ['get', 'disc'], 0], paint: { 'fill-pattern': 'fog', 'fill-opacity': tierFade(['-', 1, ['coalesce', ['feature-state', 'reveal'], 0]], 1, 0, 0, 1) } },
        { id: 'terr-fog-shade', type: 'fill', source: 'terr', minzoom: 8.5, filter: ['==', ['get', 'disc'], 0], paint: { 'fill-color': '#030405', 'fill-opacity': tierFade(['*', 0.5, ['-', 1, ['coalesce', ['feature-state', 'reveal'], 0]]], 1, 0, 0, 1) } },
        { id: 'terr-fill', type: 'fill', source: 'terr', minzoom: 8.5, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': tierFade(FILL_STATE, 1, 0, 0, 1) } },
        { id: 'terr-glow', type: 'line', source: 'terr', minzoom: 9.5, filter: isTerr, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 9, 'line-blur': 7, 'line-opacity': tierFade(['case', ['boolean', ['feature-state', 'selected'], false], 0.55, ['all', ['>=', ['get', 'level'], 4], ['!=', ['get', 'status'], 'unclaimed']], ['*', 0.025, ['get', 'level']], 0], 1, 0.3, 0, 1) } },
      ])
      .concat(
        [1, 2, 3].map(function (i) {
          // Inner contour rings: one more per territory level above 1 — tactical "elevation" lines.
          return { id: 'terr-contour-' + i, type: 'line', source: 'terr', minzoom: 11, filter: ['all', isTerr, ['>=', ['get', 'level'], i + 1], ['!=', ['get', 'status'], 'unclaimed']], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 0.7, 'line-offset': zi([11, -1.5 * i, 15, -4.5 * i]), 'line-opacity': tierFade(0.34 - i * 0.07, 1, 0, 0, 1), 'line-dasharray': [3, 2] } };
        }),
      )
      .concat([
        { id: 'terr-line-unclaimed', type: 'line', source: 'terr', minzoom: 8.5, filter: ['all', isTerr, ['==', ['get', 'status'], 'unclaimed']], paint: { 'line-color': '#4A4D56', 'line-width': zi([9, 0.6, 14, 1.3]), 'line-dasharray': [2, 2], 'line-opacity': tierFade(0.9, 1, 0.4, 0, 1) } },
        { id: 'terr-line-fog', type: 'line', source: 'terr', minzoom: 8.5, filter: ['==', ['get', 'disc'], 0], paint: { 'line-color': '#34363D', 'line-width': 0.8, 'line-dasharray': [1, 3], 'line-opacity': tierFade(0.9, 1, 0.4, 0, 1) } },
        { id: 'terr-line', type: 'line', source: 'terr', minzoom: 8.5, filter: ['all', isTerr, ['!=', ['get', 'status'], 'unclaimed']], layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['>', ['coalesce', ['feature-state', 'flash'], 0], 0], '#FFFFFF', ['get', 'color']], 'line-width': ['interpolate', ['linear'], ['zoom'], 9, ['case', ['boolean', ['feature-state', 'selected'], false], 2.2, 0.7], 14, ['case', ['boolean', ['feature-state', 'selected'], false], 3.2, ['==', ['get', 'tier'], 4], 1.8, 1.3]], 'line-opacity': tierFade(['case', ['==', ['get', 'mine'], 1], 0.95, 0.75], 1, 0.55, 0, 1) } },
        { id: 'terr-locked-inner', type: 'line', source: 'terr', minzoom: 10, filter: ['==', ['get', 'status'], 'locked'], paint: { 'line-color': '#E6CF8A', 'line-width': 0.8, 'line-offset': zi([10, -2, 15, -5]), 'line-opacity': 0.7 } },
        { id: 'terr-contested', type: 'line', source: 'terr', minzoom: 9.5, filter: ['all', isTerr, ['match', ['get', 'status'], ['contested', 'under_attack'], true, false]], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'chal'], 'line-width': zi([10, 1.4, 15, 2.6]), 'line-dasharray': [0, 4, 3], 'line-opacity': tierFade(0.95, 1, 0.5, 0, 1) } },
        { id: 'terr-attack', type: 'line', source: 'terr', minzoom: 9.5, filter: ['all', isTerr, ['==', ['get', 'status'], 'under_attack']], layout: { 'line-join': 'round' }, paint: { 'line-color': '#FF5A36', 'line-width': 4, 'line-blur': 3, 'line-opacity': 0.5 } },
        { id: 'heat', type: 'heatmap', source: 'particles', layout: { visibility: 'none' }, paint: { 'heatmap-weight': 0.6, 'heatmap-intensity': zi([10, 0.6, 15, 1.4]), 'heatmap-radius': zi([10, 14, 15, 40]), 'heatmap-opacity': 0.7, 'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(70,30,110,0.35)', 0.45, 'rgba(160,40,120,0.55)', 0.7, 'rgba(255,45,155,0.7)', 1, 'rgba(255,190,120,0.85)'] } },
        { id: 'corridors', type: 'line', source: 'corridors', minzoom: 12, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': INK, 'line-width': zi([12, 0.8, 16, 2]), 'line-opacity': zi([12, 0, 12.8, 0.28]), 'line-dasharray': [0, 4, 3] } },
        { id: 'particles', type: 'circle', source: 'particles', minzoom: 11.5, paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, ['*', 1.1, ['get', 'size']], 16, ['*', 2.6, ['get', 'size']]], 'circle-blur': 0.5, 'circle-opacity': 0.5 } },
        { id: 'pulse', type: 'circle', source: 'labels', minzoom: 10.5, filter: ['all', isTerr, ['>=', ['get', 'activity'], 0.8], ['!=', ['get', 'split'], 1]], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.2, 'circle-radius': 10, 'circle-stroke-opacity': 0.4, 'circle-pitch-alignment': 'map' } },
        { id: 'pings', type: 'circle', source: 'pings', paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.6, 'circle-radius': 4, 'circle-stroke-opacity': 0, 'circle-pitch-alignment': 'map' } },
        { id: 'fx-fill', type: 'fill', source: 'fx', filter: ['==', ['get', 'kind'], 'fill'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] } },
        { id: 'fx-ring', type: 'line', source: 'fx', filter: ['==', ['get', 'kind'], 'ring'], layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-blur': 1.5, 'line-opacity': ['get', 'opacity'] } },
        // Run mode: the territories you've crossed, and the one you're in, get a bright edge.
        { id: 'terr-trail', type: 'line', source: 'terr', minzoom: 10, layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['boolean', ['feature-state', 'here'], false], '#F4F0E6', '#D7FF1F'], 'line-width': ['case', ['boolean', ['feature-state', 'here'], false], 3, 1.6], 'line-opacity': ['case', ['boolean', ['feature-state', 'here'], false], 0.95, ['boolean', ['feature-state', 'visited'], false], 0.55, 0] } },
        // Run mode: your route — a soft glow, a bright core that fades in from the start.
        { id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D7FF1F', 'line-width': zi([12, 8, 17, 18]), 'line-blur': 8, 'line-opacity': 0.35 } },
        { id: 'route-core', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': zi([12, 2.5, 17, 5.5]), 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, 'rgba(215,255,31,0.25)', 0.6, 'rgba(215,255,31,0.85)', 1, '#F2FFD0'] } },
        { id: 'route-start', type: 'circle', source: 'route', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#06070A', 'circle-stroke-color': '#D7FF1F', 'circle-stroke-width': 2.5 } },
        { id: 'me-acc', type: 'circle', source: 'me', paint: { 'circle-color': '#D7FF1F', 'circle-opacity': 0.07, 'circle-stroke-color': '#D7FF1F', 'circle-stroke-opacity': 0.35, 'circle-stroke-width': 1, 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, 0, 22, ['get', 'r22']], 'circle-pitch-alignment': 'map' } },
      ])
      .concat(tileLabels())
      .concat([
        // Places
        { id: 'campus-cluster', type: 'circle', source: 'campuses', filter: ['has', 'point_count'], paint: { 'circle-color': '#0D0E12', 'circle-stroke-color': '#E6CF8A', 'circle-stroke-width': 1.2, 'circle-stroke-opacity': 0.8, 'circle-radius': ['step', ['get', 'point_count'], 11, 5, 14, 10, 17] } },
        { id: 'campus-cluster-n', type: 'symbol', source: 'campuses', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT, 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#E6CF8A' } },
        { id: 'campus-pin', type: 'symbol', source: 'campuses', filter: ['!', ['has', 'point_count']], layout: { 'icon-image': ['concat', 'pin-', ['get', 'kind']], 'icon-size': zi([9, 0.75, 14, 1]), 'icon-allow-overlap': true, 'text-field': ['step', ['zoom'], '', 12, ['get', 'name']], 'text-font': FONT, 'text-size': 10.5, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9, 'text-letter-spacing': 0.04 }, paint: { 'text-color': '#E6CF8A', 'text-halo-color': HALO, 'text-halo-width': 1.4 } },
        { id: 'place-pin', type: 'symbol', source: 'places', filter: ['>=', ['zoom'], ['get', 'minZoom']], layout: { 'icon-image': ['concat', 'pin-', ['get', 'kind']], 'icon-size': zi([10, 0.7, 15, 0.95]), 'text-field': ['step', ['zoom'], '', 13.2, ['get', 'name']], 'text-font': FONT_REG, 'text-size': 10, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 8 }, paint: { 'text-color': '#A9A49A', 'text-halo-color': HALO, 'text-halo-width': 1.2 } },
        { id: 'hotspot-pulse', type: 'circle', source: 'places', minzoom: 12.8, filter: ['==', ['get', 'kind'], 'hotspot'], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#FF4FA8', 'circle-stroke-width': 1.2, 'circle-radius': 9, 'circle-stroke-opacity': 0.5 } },
        // Territory labels: zones that aren't split (always), split zones (until their territories take over), micro territories.
        labelLayer('label-zone', ['all', ['==', ['get', 'tier'], 4], ['==', ['get', 'split'], 0]], 9.8, 24, [10, 9, 13, 12.5, 16, 15]),
        labelLayer('label-split', ['all', ['==', ['get', 'tier'], 4], ['==', ['get', 'split'], 1]], 9.4, 13.4, [9.5, 10, 13, 15]),
        labelLayer('label-micro', ['==', ['get', 'tier'], 5], 13.3, 24, [13.3, 10, 16, 14]),
        // State view: cities and seas
        { id: 'city-dot', type: 'circle', source: 'cities', maxzoom: 10.2, filter: ['==', ['get', 'kind'], 'city'], paint: { 'circle-color': ['case', ['==', ['get', 'rank'], 1], '#D7FF1F', '#CFC8B6'], 'circle-radius': ['match', ['get', 'rank'], 1, 4.5, 2, 2.8, 1.8], 'circle-stroke-color': HALO, 'circle-stroke-width': 1.5, 'circle-opacity': zi([9, 1, 10.2, 0]) } },
        { id: 'city-ring', type: 'circle', source: 'cities', maxzoom: 10.2, filter: ['==', ['get', 'rank'], 1], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#D7FF1F', 'circle-stroke-width': 1.2, 'circle-radius': 14, 'circle-stroke-opacity': 0.5 } },
        { id: 'city-label', type: 'symbol', source: 'cities', maxzoom: 10.2, filter: ['==', ['get', 'kind'], 'city'], layout: { 'text-field': ['format', ['get', 'name'], { 'font-scale': 1 }, '\n', {}, ['get', 'sub'], { 'font-scale': 0.62 }], 'text-font': FONT, 'text-size': ['match', ['get', 'rank'], 1, 17, 2, 11.5, 10], 'text-letter-spacing': ['match', ['get', 'rank'], 1, 0.28, 0.18], 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-justify': 'left', 'symbol-sort-key': ['get', 'rank'], 'text-max-width': 30 }, paint: { 'text-color': ['case', ['==', ['get', 'rank'], 1], '#F4F0E6', ['==', ['get', 'rank'], 2], '#BDB7A8', '#8C877C'], 'text-halo-color': HALO, 'text-halo-width': 1.5, 'text-opacity': zi([9, 1, 10.2, 0]) } },
        { id: 'region-label', type: 'symbol', source: 'cities', maxzoom: 8.6, filter: ['!=', ['get', 'kind'], 'city'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT_IT, 'text-size': ['match', ['get', 'kind'], 'sea', 15, 11], 'text-letter-spacing': 0.5 }, paint: { 'text-color': ['match', ['get', 'kind'], 'sea', '#2D4A66', '#4C5A4E'], 'text-halo-color': HALO, 'text-halo-width': 1 } },
        { id: 'neighbour-label', type: 'symbol', source: 'geo', maxzoom: 9, filter: ['==', ['get', 'kind'], 'neighbour-label'], layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 10, 'text-letter-spacing': 0.6 }, paint: { 'text-color': '#3A3D45' } },
        { id: 'hooghly-label', type: 'symbol', source: 'geo', minzoom: 7.5, maxzoom: CFG.tiles ? 11.5 : 24, filter: ['==', ['get', 'kind'], 'river'], layout: { 'symbol-placement': 'line', 'symbol-spacing': 420, 'text-field': 'HOOGHLY', 'text-font': FONT_IT, 'text-size': 11, 'text-letter-spacing': 0.6 }, paint: { 'text-color': '#4A6E92', 'text-halo-color': HALO, 'text-halo-width': 1 } },
      ]);
    return {
      version: 8,
      glyphs: CFG.glyphs,
      sources: sources,
      layers: layers,
    };
  }

  function labelLayer(id, filter, minzoom, maxzoom, sizeStops) {
    var found = ['==', ['get', 'disc'], 1];
    return {
      id: id,
      type: 'symbol',
      source: 'labels',
      minzoom: minzoom,
      maxzoom: maxzoom,
      filter: filter,
      layout: {
        'text-field': ['step', ['zoom'], ['get', 'name'], 11.6, ['format', ['get', 'name'], { 'font-scale': 1 }, '\n', {}, ['get', 'sub'], { 'font-scale': 0.7 }]],
        'text-font': FONT,
        'text-size': zi(sizeStops),
        'text-letter-spacing': 0.16,
        'text-max-width': 8,
        'text-line-height': 1.25,
        'text-padding': 4,
        'icon-image': ['step', ['zoom'], '', 12.2, ['case', found, ['concat', 'em|', ['get', 'color'], '|', ['get', 'status'], '|', ['to-string', ['get', 'level']]], '']],
        'icon-anchor': 'bottom',
        'icon-offset': [0, -6],
        'text-anchor': 'top',
        'icon-optional': true,
        'symbol-sort-key': ['-', 0, ['get', 'activity']],
      },
      paint: {
        'text-color': ['case', found, ['case', ['==', ['get', 'mine'], 1], '#F2FFD0', INK], '#6B6E76'],
        'text-halo-color': HALO,
        'text-halo-width': 1.6,
        'text-halo-blur': 0.5,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Images (drawn once on canvases; emblems on demand)
  // ---------------------------------------------------------------------------
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w * DPR;
    c.height = h * DPR;
    var g = c.getContext('2d');
    g.scale(DPR, DPR);
    return { c: c, g: g };
  }
  function addImage(name, cv) {
    if (map.hasImage(name)) return;
    map.addImage(name, cv.g.getImageData(0, 0, cv.c.width, cv.c.height), { pixelRatio: DPR });
  }

  function makeFog() {
    var cv = canvas(14, 14);
    var g = cv.g;
    g.strokeStyle = 'rgba(200,200,210,0.09)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-2, 16);
    g.lineTo(16, -2);
    g.moveTo(-2, 2);
    g.lineTo(2, -2);
    g.moveTo(12, 16);
    g.lineTo(16, 12);
    g.stroke();
    addImage('fog', cv);
  }

  var PIN = {
    university: ['#E6CF8A', function (g) { g.beginPath(); g.moveTo(5, 10); g.lineTo(11, 7); g.lineTo(17, 10); g.lineTo(11, 13); g.closePath(); g.fill(); g.fillRect(8.5, 11.5, 5, 3); g.fillRect(15.2, 10, 0.9, 4); }],
    college: ['#CFC8B6', function (g) { g.lineWidth = 1.3; g.beginPath(); g.moveTo(11, 8.5); g.quadraticCurveTo(8.5, 7, 6, 7.8); g.lineTo(6, 14.6); g.quadraticCurveTo(8.5, 13.8, 11, 15.2); g.quadraticCurveTo(13.5, 13.8, 16, 14.6); g.lineTo(16, 7.8); g.quadraticCurveTo(13.5, 7, 11, 8.5); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(11, 8.5); g.lineTo(11, 15.2); g.stroke(); }],
    landmark: ['#CFC8B6', function (g) { g.beginPath(); g.moveTo(11, 5.5); g.lineTo(14, 15.5); g.lineTo(8, 15.5); g.closePath(); g.fill(); }],
    park: ['#6FBF8E', function (g) { g.beginPath(); g.arc(11, 9.5, 3.6, 0, 7); g.fill(); g.fillRect(10.4, 12, 1.2, 4); }],
    lake: ['#6FA6CF', function (g) { g.lineWidth = 1.4; g.beginPath(); for (var k = 0; k < 2; k++) { g.moveTo(6, 9.5 + k * 3.4); g.quadraticCurveTo(8.5, 7.5 + k * 3.4, 11, 9.5 + k * 3.4); g.quadraticCurveTo(13.5, 11.5 + k * 3.4, 16, 9.5 + k * 3.4); } g.stroke(); }],
    sports: ['#9FB7A0', function (g) { g.lineWidth = 1.4; g.beginPath(); g.ellipse(11, 11, 5, 3.4, 0, 0, 7); g.stroke(); }],
    hotspot: ['#FF4FA8', function (g) { g.beginPath(); g.arc(11, 11, 2.6, 0, 7); g.fill(); g.lineWidth = 1.1; g.beginPath(); g.arc(11, 11, 5, 0, 7); g.stroke(); }],
    junction: ['#8A8F9C', function (g) { g.beginPath(); g.moveTo(11, 7); g.lineTo(15, 11); g.lineTo(11, 15); g.lineTo(7, 11); g.closePath(); g.fill(); }],
    transit: ['#8A8F9C', function (g) { g.lineWidth = 1.3; g.beginPath(); g.moveTo(8, 14.5); g.lineTo(8, 8.5); g.quadraticCurveTo(8, 6.5, 11, 6.5); g.quadraticCurveTo(14, 6.5, 14, 8.5); g.lineTo(14, 14.5); g.closePath(); g.stroke(); g.fillRect(8.6, 9.3, 4.8, 1.6); g.beginPath(); g.moveTo(8.5, 17); g.lineTo(9.6, 15); g.moveTo(13.5, 17); g.lineTo(12.4, 15); g.stroke(); }],
  };
  function makePins() {
    Object.keys(PIN).forEach(function (kind) {
      var cv = canvas(22, 22);
      var g = cv.g;
      g.fillStyle = '#0B0C10';
      g.strokeStyle = PIN[kind][0];
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(11, 11, 9.6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.85;
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = PIN[kind][0];
      g.strokeStyle = PIN[kind][0];
      PIN[kind][1](g);
      addImage('pin-' + kind, cv);
    });
  }

  /** A hex emblem: crew colour ring, level pips; a padlock for locked ground; hollow for unclaimed. */
  function makeEmblem(name) {
    var p = name.split('|');
    var color = p[1];
    var status = p[2];
    var level = +p[3] || 1;
    var cv = canvas(30, 30);
    var g = cv.g;
    var hex = function (r) {
      g.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = (Math.PI / 3) * i - Math.PI / 2;
        g[i ? 'lineTo' : 'moveTo'](15 + Math.cos(a) * r, 15 + Math.sin(a) * r);
      }
      g.closePath();
    };
    hex(12.5);
    g.fillStyle = 'rgba(8,9,12,0.92)';
    g.fill();
    g.lineWidth = status === 'unclaimed' ? 1 : 1.6;
    g.strokeStyle = status === 'unclaimed' ? '#5A5D66' : color;
    if (status === 'unclaimed') g.setLineDash([2, 2]);
    g.stroke();
    g.setLineDash([]);
    if (status === 'locked') {
      g.strokeStyle = color;
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(15, 13, 3, Math.PI, 0);
      g.stroke();
      g.fillStyle = color;
      g.fillRect(11, 13, 8, 6);
    } else if (status === 'unclaimed') {
      g.fillStyle = '#8A8F9C';
      g.fillRect(14.3, 10.5, 1.4, 9);
      g.fillRect(10.5, 14.3, 9, 1.4);
    } else {
      // Level pips, bottom-up, like a signal meter.
      for (var l = 0; l < 5; l++) {
        g.fillStyle = l < level ? color : 'rgba(255,255,255,0.12)';
        g.fillRect(8.5 + l * 2.8, 18 - l * 1.5, 1.9, 3 + l * 1.5);
      }
      if (status === 'contested' || status === 'under_attack') {
        g.fillStyle = status === 'under_attack' ? '#FF5A36' : '#FFD21F';
        g.beginPath();
        g.arc(22.5, 7.5, 2.6, 0, 7);
        g.fill();
      }
    }
    addImage(name, cv);
  }

  // ---------------------------------------------------------------------------
  // Map
  // ---------------------------------------------------------------------------
  var map = new maplibregl.Map({
    container: 'map',
    style: buildStyle(),
    center: [87.95, 24.25],
    zoom: 5.9,
    minZoom: 5,
    maxZoom: 18,
    maxPitch: 60,
    maxBounds: [[83.8, 19.6], [92.6, 28.6]],
    attributionControl: false,
    renderWorldCopies: false,
    fadeDuration: 180,
    dragRotate: true,
    touchPitch: true,
    pitchWithRotate: true,
    cooperativeGestures: false,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: CFG.tiles ? '© OpenMapTiles © OpenStreetMap contributors · Natural Earth' : 'Natural Earth' }), 'top-right');
  map.touchZoomRotate.enableRotation();
  window.__map = map;

  var tilesOk = !!CFG.tiles;
  map.on('error', function (e) {
    if (e && e.sourceId === 'omt' && tilesOk) {
      tilesOk = false;
      ownGeography();
      send({ type: 'loaded', tiles: false });
    }
  });
  map.on('styleimagemissing', function (e) {
    if (e.id.indexOf('em|') === 0) makeEmblem(e.id);
  });

  /** Street tiles unavailable: keep the hand-traced Hooghly and its label on at every zoom. */
  function ownGeography() {
    if (!styleReady) return;
    map.setPaintProperty('hooghly', 'line-opacity', 0.9);
    map.setLayerZoomRange('hooghly-label', 7.5, 24);
  }

  var styleReady = false;
  var queue = [];
  map.on('load', function () {
    makeFog();
    makePins();
    styleReady = true;
    if (!tilesOk) ownGeography();
    setGrid();
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) attrib.classList.remove('maplibregl-compact-show');
    queue.splice(0).forEach(handle);
    send({ type: 'loaded', tiles: tilesOk });
    start();
  });

  function setGrid() {
    var f = [];
    var line = function (coords, major) {
      f.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { major: major ? 1 : 0 } });
    };
    for (var x = 84; x <= 92.5; x += 0.5) line([[x, 19.5], [x, 28.5]], x % 1 === 0);
    for (var y = 20; y <= 28.5; y += 0.5) line([[83.5, y], [92.5, y]], y % 1 === 0);
    // Finer city grid around the metro area.
    for (var cx = 88.1; cx <= 88.62; cx += 0.02) line([[cx, 22.36], [cx, 23.06]], false);
    for (var cy = 22.36; cy <= 23.06; cy += 0.02) line([[88.1, cy], [88.62, cy]], false);
    map.getSource('grid').setData({ type: 'FeatureCollection', features: f });
  }

  // ---------------------------------------------------------------------------
  // Camera → app
  // ---------------------------------------------------------------------------
  var lastCam = 0;
  var detailAsked = false;
  /** The part of the map not covered by the app's HUD (top) and sheets (bottom), in CSS px. */
  var focus = { top: 0, bottom: 0 };
  function camera(moving) {
    var now = Date.now();
    if (moving && now - lastCam < 140) return;
    lastCam = now;
    var cv = map.getCanvas();
    var h = cv.clientHeight;
    var y = (focus.top + (h - focus.bottom)) / 2;
    var c = y > focus.top && y < h ? map.unproject([cv.clientWidth / 2, y]) : map.getCenter();
    var z = map.getZoom();
    send({ type: 'camera', center: [+c.lng.toFixed(5), +c.lat.toFixed(5)], zoom: +z.toFixed(2), pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()), moving: moving });
    if (!detailAsked && z >= 10.6) {
      detailAsked = true;
      send({ type: 'needDetail' });
    }
  }
  map.on('move', function () {
    camera(true);
  });
  map.on('moveend', function () {
    camera(false);
  });
  var far = null;
  map.on('zoom', function () {
    var f = map.getZoom() < 10;
    if (f === far) return;
    far = f;
    meEl.classList.toggle('me-far', f);
  });

  // ---------------------------------------------------------------------------
  // Interaction: tap, hover tooltip (mouse), long-press
  // ---------------------------------------------------------------------------
  var TERR_LAYERS = ['terr-fill', 'terr-fog'];
  function territoryAt(point) {
    if (!styleReady) return null;
    var hits = map.queryRenderedFeatures(point, { layers: TERR_LAYERS });
    if (!hits.length) return null;
    var z = map.getZoom();
    var best = null;
    for (var i = 0; i < hits.length; i++) {
      var p = hits[i].properties;
      var score = z >= 13.2 ? (p.tier === 5 ? 3 : p.split === 1 ? 1 : 2) : p.tier === 4 ? 3 : 0;
      if (!best || score > best.score) best = { score: score, f: hits[i] };
    }
    return best && best.score > 0 ? best.f : null;
  }

  var suppressClick = false;
  map.on('click', function (e) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    var ll = [e.lngLat.lng, e.lngLat.lat];
    var cl = map.queryRenderedFeatures(e.point, { layers: ['campus-cluster'] });
    if (cl.length) {
      var id = cl[0].properties.cluster_id;
      map.getSource('campuses').getClusterExpansionZoom(id).then(function (z) {
        map.easeTo({ center: cl[0].geometry.coordinates, zoom: z + 0.3, duration: 650 });
      });
      return;
    }
    if (map.getZoom() < 10.2) {
      var city = map.queryRenderedFeatures([[e.point.x - 14, e.point.y - 14], [e.point.x + 14, e.point.y + 14]], { layers: ['city-dot', 'city-label'] });
      if (city.length) return send({ type: 'tap', id: city[0].properties.id, kind: 'city', lngLat: ll });
    }
    var pin = map.queryRenderedFeatures([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]], { layers: ['campus-pin', 'place-pin'] });
    if (pin.length && map.getZoom() >= 11.5) return send({ type: 'tap', id: pin[0].properties.id, kind: 'place', lngLat: ll });
    var t = territoryAt(e.point);
    send({ type: 'tap', id: t ? t.properties.id : null, kind: 'territory', lngLat: ll });
  });

  var tip = document.getElementById('tip');
  var hoverId = null;
  function setHover(id) {
    if (hoverId === id) return;
    if (hoverId) map.setFeatureState({ source: 'terr', id: hoverId }, { hover: false });
    hoverId = id;
    if (id) map.setFeatureState({ source: 'terr', id: id }, { hover: true });
  }
  map.on('mousemove', function (e) {
    if (!styleReady || (e.originalEvent && e.originalEvent.pointerType === 'touch')) return;
    var t = territoryAt(e.point);
    setHover(t ? t.properties.id : null);
    map.getCanvas().style.cursor = t ? 'pointer' : '';
    if (!t) {
      tip.style.opacity = 0;
      return;
    }
    var p = t.properties;
    tip.innerHTML = '<b>' + esc(p.name) + '</b><span style="color:' + (p.disc ? p.color : '#8A8F9C') + '">' + esc(p.disc ? tipLine(p) : 'UNCHARTED · VISIT TO REVEAL') + '</span>';
    tip.style.transform = 'translate(' + (e.point.x + 14) + 'px,' + (e.point.y + 14) + 'px)';
    tip.style.opacity = 1;
  });
  map.getCanvas().addEventListener('mouseleave', function () {
    setHover(null);
    tip.style.opacity = 0;
  });
  function tipLine(p) {
    if (p.status === 'locked') return 'LOCKED';
    if (p.status === 'unclaimed') return 'UNCLAIMED · LV ' + p.level;
    return p.crew + ' · ' + p.control + '% · LV ' + p.level + (p.status === 'contested' ? ' · CONTESTED' : p.status === 'under_attack' ? ' · UNDER ATTACK' : '');
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var press = null;
  var canvasEl = map.getCanvasContainer();
  canvasEl.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) {
      press && clearTimeout(press.timer);
      press = null;
      return;
    }
    var r = canvasEl.getBoundingClientRect();
    var x = e.touches[0].clientX - r.left;
    var y = e.touches[0].clientY - r.top;
    press = {
      x: x,
      y: y,
      timer: setTimeout(function () {
        var t = territoryAt([x, y]);
        suppressClick = true;
        setTimeout(function () {
          suppressClick = false;
        }, 700);
        send({ type: 'longpress', id: t ? t.properties.id : null, x: x, y: y });
        press = null;
      }, 520),
    };
  }, { passive: true });
  canvasEl.addEventListener('touchmove', function (e) {
    if (!press) return;
    var r = canvasEl.getBoundingClientRect();
    if (Math.abs(e.touches[0].clientX - r.left - press.x) + Math.abs(e.touches[0].clientY - r.top - press.y) > 10) {
      clearTimeout(press.timer);
      press = null;
    }
  }, { passive: true });
  canvasEl.addEventListener('touchend', function () {
    if (press) clearTimeout(press.timer);
    press = null;
  });
  map.on('contextmenu', function (e) {
    var t = territoryAt(e.point);
    send({ type: 'longpress', id: t ? t.properties.id : null, x: e.point.x, y: e.point.y });
  });

  // ---------------------------------------------------------------------------
  // You: radar marker (DOM, one element) + accuracy circle (map layer, metres)
  // ---------------------------------------------------------------------------
  var meEl = document.createElement('div');
  meEl.className = 'me';
  meEl.innerHTML = '<div class="me-sweep"></div><div class="me-ring"></div><div class="me-dir"></div><div class="me-core"><img alt="" src="' + (CFG.logo || '') + '"/></div><div class="me-label">YOU ARE HERE</div>';
  var meMarker = new maplibregl.Marker({ element: meEl, pitchAlignment: 'viewport', rotationAlignment: 'viewport' });
  var meShown = false;
  function setMe(m) {
    if (!m.pos) {
      if (meShown) meMarker.remove();
      meShown = false;
      map.getSource('me').setData(EMPTY);
      return;
    }
    meMarker.setLngLat(m.pos);
    if (!meShown) meMarker.addTo(map);
    meShown = true;
    meEl.className = 'me me-' + m.state + (m.preview ? ' me-preview' : '');
    var dir = meEl.querySelector('.me-dir');
    if (m.heading == null) dir.style.opacity = 0;
    else {
      dir.style.opacity = 1;
      dir.style.transform = 'rotate(' + m.heading + 'deg)';
    }
    var mpp22 = (156543.03392 * Math.cos((m.pos[1] * Math.PI) / 180)) / Math.pow(2, 22);
    map.getSource('me').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: m.pos }, properties: { r22: Math.max(8, m.accuracy || 25) / mpp22 } }] });
    if (m.announce) {
      meEl.classList.add('me-announce');
      setTimeout(function () {
        meEl.classList.remove('me-announce');
      }, 4200);
    }
  }

  // ---------------------------------------------------------------------------
  // Messages from the app
  // ---------------------------------------------------------------------------
  var selected = null;
  var data = { terr: EMPTY };
  var NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };

  // ---- Run mode -------------------------------------------------------------
  var follow = null;
  var lastMe = null;
  var userMovedAt = 0;
  // A drag / pinch takes the camera back from follow mode for a few seconds.
  ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(function (ev) {
    map.on(ev, function (e) {
      if (e && e.originalEvent) userMovedAt = Date.now();
    });
  });
  function followTo(pos, ms) {
    if (!follow || Date.now() - userMovedAt < 8000) return;
    // Keep you in the part of the map the HUD doesn't cover.
    map.easeTo({ center: pos, zoom: Math.max(map.getZoom() < 12 ? follow.zoom : map.getZoom(), 12), pitch: follow.pitch, padding: { top: follow.top, bottom: follow.bottom, left: 0, right: 0 }, duration: ms, easing: function (t) { return t; }, essential: true });
  }
  function setRoute(coords) {
    var f = [];
    if (coords && coords.length > 1) f.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    if (coords && coords.length) f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coords[0] }, properties: {} });
    map.getSource('route').setData({ type: 'FeatureCollection', features: f });
  }
  var trail = { visited: [], here: null };
  function setTrail(visited, here) {
    trail.visited.forEach(function (id) {
      map.setFeatureState({ source: 'terr', id: id }, { visited: false, here: false });
    });
    (visited || []).forEach(function (id) {
      map.setFeatureState({ source: 'terr', id: id }, { visited: true, here: id === here });
    });
    if (here && (visited || []).indexOf(here) < 0) map.setFeatureState({ source: 'terr', id: here }, { here: true });
    trail = { visited: (visited || []).concat(here ? [here] : []), here: here };
  }
  /**
   * Start a camera move cleanly. Starting a flyTo while another is mid-flight can leave MapLibre
   * stuck "zooming" (seen when a search interrupts the intro), so stop first and fly next frame.
   */
  function move(fn) {
    map.stop();
    requestAnimationFrame(fn);
  }
  function handle(m) {
    if (!styleReady && m.type !== 'active' && m.type !== 'insets') {
      queue.push(m);
      return;
    }
    switch (m.type) {
      case 'init':
        ['geo', 'terr', 'labels', 'cities', 'campuses', 'places', 'corridors'].forEach(function (k) {
          if (m[k]) map.getSource(k).setData(m[k]);
        });
        data.terr = m.terr;
        if (m.intro) intro(m.view);
        else map.jumpTo(m.view);
        camera(false);
        break;
      case 'terr':
        map.getSource('terr').setData(m.terr);
        map.getSource('labels').setData(m.labels);
        data.terr = m.terr;
        if (selected) map.setFeatureState({ source: 'terr', id: selected }, { selected: true });
        if (trail.visited.length) setTrail(trail.visited.filter(function (id) { return id !== trail.here; }), trail.here);
        break;
      case 'particles':
        map.getSource('particles').setData(m.particles);
        break;
      case 'fly':
        endIntro();
        move(function () {
          var opts = { center: m.view.center, zoom: m.view.zoom, pitch: m.view.pitch == null ? map.getPitch() : m.view.pitch, bearing: m.view.bearing == null ? map.getBearing() : m.view.bearing, duration: m.duration == null ? 1600 : m.duration, curve: 1.45, essential: true };
          // Always an explicit padding: MapLibre 5 throws mid-flight on `padding: undefined`, and
          // padding persists, so a stale one (from follow mode or a fit) must be replaced.
          opts.padding = m.padding || NO_PADDING;
          map.flyTo(opts);
        });
        break;
      case 'fit':
        endIntro();
        move(function () {
          var cam = map.cameraForBounds([[m.bbox[0], m.bbox[1]], [m.bbox[2], m.bbox[3]]], { padding: m.padding, maxZoom: m.maxZoom || 16, pitch: m.pitch == null ? map.getPitch() : m.pitch, bearing: map.getBearing() });
          // Fly to the box's own centre WITH the padding: MapLibre puts it at the centre of the
          // unpadded area, tilted or not. (cameraForBounds' centre already bakes the padding in, so
          // flying there with padding would shift it twice; without, a tilt drifts it.)
          var mid = [(m.bbox[0] + m.bbox[2]) / 2, (m.bbox[1] + m.bbox[3]) / 2];
          if (cam) map.flyTo({ center: mid, zoom: cam.zoom, padding: m.padding, pitch: m.pitch == null ? map.getPitch() : m.pitch, bearing: map.getBearing(), duration: m.duration || 1300, curve: 1.3, essential: true });
        });
        break;
      case 'select':
        if (selected) map.setFeatureState({ source: 'terr', id: selected }, { selected: false });
        selected = m.id;
        if (selected) map.setFeatureState({ source: 'terr', id: selected }, { selected: true });
        if (trail.visited.length) setTrail(trail.visited.filter(function (id) { return id !== trail.here; }), trail.here);
        break;
      case 'me':
        setMe(m);
        if (m.pos) {
          lastMe = m.pos;
          if (follow) followTo(m.pos, 1000);
        }
        break;
      case 'fx':
        fx(m);
        break;
      case 'ping':
        pings.push({ pos: m.pos, color: m.color, born: performance.now() });
        if (pings.length > 8) pings.shift();
        break;
      case 'heat':
        map.setLayoutProperty('heat', 'visibility', m.on ? 'visible' : 'none');
        map.setLayoutProperty('particles', 'visibility', m.on ? 'none' : 'visible');
        break;
      case 'insets':
        document.documentElement.style.setProperty('--inset-top', (m.top || 0) + 'px');
        document.documentElement.style.setProperty('--inset-right', (m.right || 0) + 'px');
        focus = { top: m.focusTop || 0, bottom: m.focusBottom || 0 };
        camera(false);
        break;
      case 'route':
        setRoute(m.coords);
        break;
      case 'trail':
        setTrail(m.visited, m.here);
        break;
      case 'follow':
        follow = m.on ? { zoom: m.zoom || 16, pitch: m.pitch == null ? 55 : m.pitch, bottom: m.bottom || 0, top: m.top || 0 } : null;
        if (follow) userMovedAt = 0;
        // Leaving follow mode: drop the follow padding so later camera moves centre normally.
        else map.setPadding(NO_PADDING);
        if (follow && lastMe) followTo(lastMe, 900);
        break;
      case 'active':
        active = !!m.on;
        if (active) start();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // The opening shot: Bengal → the river → Kolkata
  // ---------------------------------------------------------------------------
  // Any camera command from the app (a search, a skip, a tap) ends the intro for good.
  var introOn = false;
  function intro(view) {
    introOn = true;
    map.jumpTo({ center: [87.95, 24.25], zoom: 5.9, pitch: 0, bearing: 0 });
    var step = function (fn, ms) {
      setTimeout(function () {
        if (introOn) fn();
      }, ms);
    };
    step(function () {
      map.flyTo({ center: [88.38, 22.75], zoom: 8.6, pitch: 20, bearing: -4, duration: 2200, curve: 1.2, essential: true });
      map.once('moveend', function () {
        if (!introOn) return;
        map.flyTo({ center: view.center, zoom: view.zoom, pitch: view.pitch || 0, bearing: view.bearing || 0, duration: 2600, curve: 1.15, essential: true });
        map.once('moveend', function () {
          if (introOn) endIntro();
        });
      });
    }, 900);
  }
  function endIntro() {
    if (!introOn) return;
    introOn = false;
    send({ type: 'introDone' });
  }

  // ---------------------------------------------------------------------------
  // Game moments on the map
  // ---------------------------------------------------------------------------
  var tweens = [];
  function tween(ms, step, done) {
    tweens.push({ t0: performance.now(), ms: ms, step: step, done: done });
    start();
  }
  var easeOut = function (t) {
    return 1 - Math.pow(1 - t, 3);
  };

  function featureOf(id) {
    var fs = data.terr.features;
    for (var i = 0; i < fs.length; i++) if (fs[i].properties.id === id) return fs[i];
    return null;
  }
  function scaleRing(ring, c, k) {
    return ring.map(function (p) {
      return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
    });
  }
  function centre(ring) {
    var x = 0;
    var y = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      x += ring[i][0];
      y += ring[i][1];
    }
    return [x / (ring.length - 1), y / (ring.length - 1)];
  }

  function fx(m) {
    var f = featureOf(m.id);
    if (!f) return;
    var ring = f.geometry.coordinates[0];
    var c = centre(ring);
    var fxSrc = map.getSource('fx');
    var big = m.kind === 'claim' || m.kind === 'capture';
    if (m.kind === 'discover') {
      // The fog burns off, then a scan ring sweeps the new ground.
      tween(1400, function (t) {
        map.setFeatureState({ source: 'terr', id: m.id }, { reveal: easeOut(t) });
        fxSrc.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [scaleRing(ring, c, 0.3 + 0.9 * easeOut(t))] }, properties: { kind: 'ring', color: '#EDE6D6', width: 2, opacity: 0.8 * (1 - t) } }] });
      }, function () {
        fxSrc.setData(EMPTY);
      });
      return;
    }
    // 1) the boundary charges and expands outward, 2) the crew colour floods in from the centre,
    // 3) the border flashes white and settles into the new owner's colour.
    var rings = big ? 3 : 1;
    tween(big ? 1900 : 1100, function (t) {
      var feats = [];
      for (var r = 0; r < rings; r++) {
        var tt = Math.max(0, Math.min(1, (t - r * 0.14) / 0.6));
        if (tt > 0 && tt < 1) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [scaleRing(ring, c, 1 + 0.55 * easeOut(tt))] }, properties: { kind: 'ring', color: m.color, width: 3 - r * 0.6, opacity: 0.9 * (1 - tt) } });
      }
      if (big) {
        var ft = Math.max(0, Math.min(1, (t - 0.25) / 0.55));
        if (ft > 0) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [scaleRing(ring, c, easeOut(ft))] }, properties: { kind: 'fill', color: m.color, opacity: 0.42 * (1 - Math.max(0, (t - 0.8) / 0.2)) } });
      }
      fxSrc.setData({ type: 'FeatureCollection', features: feats });
      map.setFeatureState({ source: 'terr', id: m.id }, { flash: t > 0.55 && t < 0.75 ? 1 : 0 });
    }, function () {
      fxSrc.setData(EMPTY);
      map.setFeatureState({ source: 'terr', id: m.id }, { flash: 0 });
    });
  }

  // ---------------------------------------------------------------------------
  // The animation loop
  // ---------------------------------------------------------------------------
  var DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
  var pings = [];
  var running = false;
  var active = true;
  var lastFrame = 0;
  var dashStep = 0;
  var lastDash = 0;

  function start() {
    if (running || !active || document.hidden) return;
    running = true;
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) start();
  });

  function frame(now) {
    if (!active || document.hidden) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
    // Tweens (game moments) run every frame; ambient motion at ~30 fps.
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      var t = Math.min(1, (now - tw.t0) / tw.ms);
      tw.step(t);
      if (t >= 1) {
        tweens.splice(i, 1);
        tw.done && tw.done();
      }
    }
    if (now - lastFrame < 33) return;
    lastFrame = now;
    if (!styleReady) return;
    var z = map.getZoom();
    var s = now / 1000;

    if (z >= 9.5 && now - lastDash > 75) {
      lastDash = now;
      dashStep = (dashStep + 1) % DASH.length;
      map.setPaintProperty('terr-contested', 'line-dasharray', DASH[dashStep]);
      if (z >= 12) map.setPaintProperty('corridors', 'line-dasharray', DASH[(dashStep * 1) % DASH.length]);
    }
    if (z >= 9.5) {
      var a = 0.5 + 0.5 * Math.sin(s * 4.2);
      map.setPaintProperty('terr-attack', 'line-opacity', 0.25 + 0.5 * a);
      map.setPaintProperty('terr-attack', 'line-width', 2.5 + 4 * a);
    }
    if (z >= 10.5) {
      var p = (s % 2.4) / 2.4;
      map.setPaintProperty('pulse', 'circle-radius', 8 + 26 * p);
      map.setPaintProperty('pulse', 'circle-stroke-opacity', 0.5 * (1 - p));
    }
    if (z >= 12.8) {
      var h = (s % 1.8) / 1.8;
      map.setPaintProperty('hotspot-pulse', 'circle-radius', 8 + 14 * h);
      map.setPaintProperty('hotspot-pulse', 'circle-stroke-opacity', 0.55 * (1 - h));
    }
    if (z >= 11.5) {
      // Twinkle: each particle has its own phase; one expression update moves them all.
      var tt = +(s * 0.35).toFixed(3);
      map.setPaintProperty('particles', 'circle-opacity', ['interpolate', ['linear'], ['%', ['+', ['get', 'phase'], tt], 1], 0, 0, 0.5, 0.85, 1, 0]);
    }
    if (z < 10.2) {
      var k = (s % 3) / 3;
      map.setPaintProperty('city-ring', 'circle-radius', 8 + 22 * k);
      map.setPaintProperty('city-ring', 'circle-stroke-opacity', 0.6 * (1 - k));
    }
    // Activity pings: ripple out from the territory's centre and fade.
    var live = [];
    for (var j = 0; j < pings.length; j++) if (now - pings[j].born < 2200) live.push(pings[j]);
    if (live.length || pings.length) {
      pings = live;
      map.getSource('pings').setData({
        type: 'FeatureCollection',
        features: live.map(function (pg) {
          var q = (now - pg.born) / 2200;
          return { type: 'Feature', geometry: { type: 'Point', coordinates: pg.pos }, properties: { color: pg.color, q: q } };
        }),
      });
      map.setPaintProperty('pings', 'circle-radius', ['+', 4, ['*', 40, ['get', 'q']]]);
      map.setPaintProperty('pings', 'circle-stroke-opacity', ['*', 0.9, ['-', 1, ['get', 'q']]]);
    }
  }

  send({ type: 'ready' });
})();
