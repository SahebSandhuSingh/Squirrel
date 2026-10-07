/* eslint-disable */
/**
 * Squirrel Social — IISER Kolkata territory map engine.
 *
 * Runs inside the map page (a WebView on phones, an iframe on the web) next to MapLibre GL. It is
 * not imported by the app: scripts/world-engine.mjs inlines it into engineSource.generated.ts.
 * Talks to the app with JSON messages (protocol.ts).
 *
 * It only draws what it's sent: the campus (OpenStreetMap) and zone layers built by features.ts.
 * Who holds what is in the data; the five map modes only change emphasis (paint properties).
 *
 * One requestAnimationFrame loop drives everything that moves, ambient motion capped at ~30 fps;
 * it stops when the page is hidden or the app says the map is off screen.
 */
(function () {
  'use strict';
  var CFG = window.__CAMPUS_CONFIG || {};
  var FONT = ['Noto Sans Bold'];
  var FONT_REG = ['Noto Sans Regular'];
  var INK = '#ECE8DE';
  var HALO = '#050608';
  var EMPTY = { type: 'FeatureCollection', features: [] };

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

  var zi = function (stops) {
    return ['interpolate', ['linear'], ['zoom']].concat(stops);
  };
  var ze = function (stops) {
    return ['interpolate', ['exponential', 1.6], ['zoom']].concat(stops);
  };
  var S = ['get', 'status'];
  var MINE = ['==', ['get', 'mine'], 1];
  var SEL = ['boolean', ['feature-state', 'selected'], false];
  var HOVER = ['boolean', ['feature-state', 'hover'], false];
  var CONTESTED = ['==', S, 'contested'];
  var HELD = ['match', S, ['owned', 'contested'], true, false];

  // ---------------------------------------------------------------------------
  // Style: near-black ground, thin roads, muted buildings, dark green, deep teal water
  // ---------------------------------------------------------------------------
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
      t('landcover', { id: 't-wood', type: 'fill', filter: cls(['wood', 'forest']), paint: { 'fill-color': '#0A120D', 'fill-opacity': 0.9 } }),
      t('landcover', { id: 't-grass', type: 'fill', filter: cls(['grass', 'scrub', 'farmland']), paint: { 'fill-color': '#0A0F0C', 'fill-opacity': 0.8 } }),
      t('landuse', { id: 't-residential', type: 'fill', filter: cls(['residential', 'suburb', 'neighbourhood']), paint: { 'fill-color': '#0A0B0E', 'fill-opacity': 0.9 } }),
      t('park', { id: 't-park', type: 'fill', paint: { 'fill-color': '#0A130E', 'fill-opacity': 0.9 } }),
      t('water', { id: 't-water', type: 'fill', paint: { 'fill-color': '#08161F' } }),
      t('waterway', { id: 't-waterway', type: 'line', paint: { 'line-color': '#0C2130', 'line-width': ze([12, 0.6, 17, 4]) } }),
      t('transportation', { id: 't-road-minor', type: 'line', filter: cls(['minor', 'service', 'track']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#15171C', 'line-width': ze([13, 0.4, 18, 7]) } }),
      t('transportation', { id: 't-path', type: 'line', minzoom: 15, filter: cls(['path']), paint: { 'line-color': '#1A1C21', 'line-width': 0.8, 'line-dasharray': [1.5, 1.5] } }),
      t('transportation', { id: 't-rail', type: 'line', filter: cls(['rail', 'transit']), paint: { 'line-color': '#1C1E24', 'line-width': zi([12, 0.8, 17, 1.6]), 'line-dasharray': [3, 2] } }),
      t('transportation', { id: 't-road-major', type: 'line', filter: cls(['primary', 'secondary', 'tertiary', 'trunk', 'motorway']), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1E2128', 'line-width': ze([12, 1, 18, 12]) } }),
      t('building', { id: 't-building', type: 'fill', minzoom: 14.5, paint: { 'fill-color': '#0F1115', 'fill-outline-color': '#16191E' } }),
    ];
  }

  function buildStyle() {
    var sources = {
      base: { type: 'geojson', data: EMPTY },
      zones: { type: 'geojson', data: EMPTY, promoteId: 'id' },
      nodes: { type: 'geojson', data: EMPTY, promoteId: 'id' },
      regions: { type: 'geojson', data: EMPTY },
      links: { type: 'geojson', data: EMPTY },
      vectors: { type: 'geojson', data: EMPTY },
      particles: { type: 'geojson', data: EMPTY },
      pings: { type: 'geojson', data: EMPTY },
      fx: { type: 'geojson', data: EMPTY },
      me: { type: 'geojson', data: EMPTY },
    };
    if (CFG.tiles) sources.omt = { type: 'vector', url: CFG.tiles };
    var kind = function (k) {
      return ['==', ['get', 'kind'], k];
    };
    var layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#050608' } }]
      .concat(tileLayers())
      .concat([
        // The world outside the campus stays, dimmed; the campus is lifted a shade.
        { id: 'mask', type: 'fill', source: 'base', filter: kind('mask'), paint: { 'fill-color': '#020203', 'fill-opacity': 0.62 } },
        { id: 'campus', type: 'fill', source: 'base', filter: kind('campus'), paint: { 'fill-color': '#0B0D10', 'fill-opacity': CFG.tiles ? 0.7 : 1 } },
        { id: 'green', type: 'fill', source: 'base', filter: ['match', ['get', 'kind'], ['green', 'woods'], true, false], paint: { 'fill-color': '#0C1912', 'fill-opacity': 0.95 } },
        { id: 'field', type: 'fill', source: 'base', filter: ['match', ['get', 'kind'], ['field', 'track', 'court'], true, false], paint: { 'fill-color': '#0E1C14', 'fill-opacity': 1 } },
        { id: 'field-line', type: 'line', source: 'base', filter: ['match', ['get', 'kind'], ['field', 'track', 'court'], true, false], paint: { 'line-color': '#24402E', 'line-width': zi([15, 0.6, 18, 1.4]), 'line-opacity': 0.8 } },
        { id: 'parking', type: 'fill', source: 'base', filter: kind('parking'), paint: { 'fill-color': '#0E1014' } },
        { id: 'water', type: 'fill', source: 'base', filter: kind('water'), paint: { 'fill-color': '#0A1C2A' } },
        { id: 'water-edge', type: 'line', source: 'base', filter: kind('water'), paint: { 'line-color': '#1B4A66', 'line-width': zi([15, 0.6, 18, 1.4]), 'line-opacity': 0.85 } },
        { id: 'road-casing', type: 'line', source: 'base', filter: kind('road'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#07080A', 'line-width': ze([14, 1.6, 17, 7, 19, 16]) } },
        { id: 'road', type: 'line', source: 'base', filter: kind('road'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#20242C', 'line-width': ze([14, 0.6, 17, 4.5, 19, 12]) } },
        { id: 'path', type: 'line', source: 'base', filter: kind('path'), paint: { 'line-color': '#262A31', 'line-width': zi([15, 0.6, 18, 1.4]), 'line-dasharray': [2, 1.5] } },
        { id: 'campus-glow', type: 'line', source: 'base', filter: kind('campus'), paint: { 'line-color': '#D7E4FF', 'line-width': 8, 'line-blur': 7, 'line-opacity': 0.05 } },
        { id: 'campus-edge', type: 'line', source: 'base', filter: kind('campus'), paint: { 'line-color': '#5A616D', 'line-width': zi([13, 0.8, 17, 1.6]), 'line-opacity': 0.9 } },

        // Zones: translucent crew fills under the buildings, so the campus stays readable.
        { id: 'zone-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 } },
        { id: 'zone-breath', type: 'fill', source: 'zones', filter: MINE, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0 } },
        { id: 'zone-hatch', type: 'fill', source: 'zones', filter: CONTESTED, paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.6 } },

        { id: 'building', type: 'fill', source: 'base', filter: kind('building'), maxzoom: 16.6, paint: { 'fill-color': '#171A20', 'fill-outline-color': '#2A2E37', 'fill-opacity': 0.96 } },
        { id: 'building-3d', type: 'fill-extrusion', source: 'base', filter: kind('building'), minzoom: 16.2, paint: { 'fill-extrusion-color': '#1A1D24', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': zi([16.2, 0, 16.8, 0.92]) } },

        // Crew regions: neighbouring zones of one crew read as one territory.
        { id: 'region-glow', type: 'line', source: 'regions', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 10, 'line-blur': 9, 'line-opacity': 0.16 } },
        { id: 'region-line', type: 'line', source: 'regions', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': zi([14, 1.2, 17, 2.4]), 'line-opacity': 0.75 } },

        { id: 'zone-line', type: 'line', source: 'zones', filter: HELD, layout: { 'line-join': 'round' }, paint: { 'line-color': ['case', ['>', ['coalesce', ['feature-state', 'flash'], 0], 0], '#FFFFFF', ['get', 'color']], 'line-width': zi([14, 0.5, 17, 1.2]), 'line-opacity': 0.5 } },
        { id: 'zone-neutral', type: 'line', source: 'zones', filter: ['==', S, 'neutral'], paint: { 'line-color': ['case', ['>', ['coalesce', ['feature-state', 'flash'], 0], 0], '#FFFFFF', '#626772'], 'line-width': zi([14, 0.6, 17, 1.3]), 'line-dasharray': [2, 2], 'line-opacity': 0.7 } },
        { id: 'zone-locked', type: 'line', source: 'zones', filter: ['==', S, 'locked'], paint: { 'line-color': '#E6CF8A', 'line-width': zi([14, 0.5, 17, 1]), 'line-dasharray': [1, 2.5], 'line-opacity': 0.45 } },
        { id: 'zone-contested-glow', type: 'line', source: 'zones', filter: CONTESTED, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'chal'], 'line-width': 6, 'line-blur': 5, 'line-opacity': 0.35 } },
        { id: 'zone-contested', type: 'line', source: 'zones', filter: CONTESTED, layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'chal'], 'line-width': zi([14, 1.4, 17, 2.8]), 'line-dasharray': [0, 4, 3], 'line-opacity': 0.95 } },
        { id: 'zone-hover', type: 'line', source: 'zones', layout: { 'line-join': 'round' }, paint: { 'line-color': INK, 'line-width': 1.4, 'line-opacity': ['case', HOVER, 0.55, 0] } },
        { id: 'zone-selected-glow', type: 'line', source: 'zones', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 12, 'line-blur': 9, 'line-opacity': ['case', SEL, 0.55, 0] } },
        { id: 'zone-selected', type: 'line', source: 'zones', layout: { 'line-join': 'round' }, paint: { 'line-color': '#F6F3EA', 'line-width': zi([14, 1.6, 17, 2.6]), 'line-opacity': ['case', SEL, 1, 0] } },

        // The crew network and the battles.
        { id: 'links', type: 'line', source: 'links', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': zi([14, 0.8, 17, 1.6]), 'line-dasharray': [1, 2.2], 'line-opacity': 0.4 } },
        { id: 'vector-glow', type: 'line', source: 'vectors', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 7, 'line-blur': 6, 'line-opacity': 0.25 } },
        { id: 'vector', type: 'line', source: 'vectors', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': zi([14, 1.2, 17, 2.4]), 'line-dasharray': [0, 4, 3], 'line-opacity': 0.8 } },

        // Live: activity rings, XP particles, pings, game moments.
        { id: 'act-heat', type: 'circle', source: 'nodes', filter: ['>', ['get', 'users'], 0], layout: { visibility: 'none' }, paint: { 'circle-color': ['interpolate', ['linear'], ['get', 'activity'], 0, '#3B3F8C', 0.45, '#B9488F', 0.8, '#FF9D4D', 1, '#FFE08A'], 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 14, ['*', 0.55, ['get', 'radius']], 18, ['*', 6, ['get', 'radius']]], 'circle-blur': 1, 'circle-opacity': ['*', 0.75, ['get', 'activity']], 'circle-pitch-alignment': 'map' } },
        { id: 'act-ring', type: 'circle', source: 'nodes', filter: ['>=', ['get', 'activity'], 0.55], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.2, 'circle-radius': 10, 'circle-stroke-opacity': 0.3, 'circle-pitch-alignment': 'map' } },
        { id: 'particles', type: 'circle', source: 'particles', paint: { 'circle-color': ['get', 'color'], 'circle-radius': zi([14, 1.2, 17, 2.4]), 'circle-blur': 0.4, 'circle-opacity': ['get', 'a'], 'circle-pitch-alignment': 'map' } },
        { id: 'pings', type: 'circle', source: 'pings', paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 1.5, 'circle-radius': ['+', 6, ['*', 46, ['get', 'q']]], 'circle-stroke-opacity': ['*', 0.85, ['-', 1, ['get', 'q']]], 'circle-pitch-alignment': 'map' } },
        { id: 'fx-fill', type: 'fill', source: 'fx', filter: kind('fill'), paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] } },
        { id: 'fx-ring', type: 'line', source: 'fx', filter: kind('ring'), layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-blur': 1.2, 'line-opacity': ['get', 'opacity'] } },
        { id: 'me-acc', type: 'circle', source: 'me', paint: { 'circle-color': '#D7FF1F', 'circle-opacity': 0.06, 'circle-stroke-color': '#D7FF1F', 'circle-stroke-opacity': 0.3, 'circle-stroke-width': 1, 'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, 0, 22, ['get', 'r22']], 'circle-pitch-alignment': 'map' } },

        // Nodes and names.
        { id: 'building-label', type: 'symbol', source: 'base', minzoom: 17.3, filter: ['all', kind('building'), ['has', 'label']], layout: { 'text-field': ['get', 'label'], 'text-font': FONT_REG, 'text-size': 10, 'text-max-width': 8, 'text-padding': 6 }, paint: { 'text-color': '#7B7F88', 'text-halo-color': HALO, 'text-halo-width': 1.2 } },
        {
          id: 'nodes',
          type: 'symbol',
          source: 'nodes',
          layout: {
            'icon-image': ['concat', 'n|', ['get', 'color'], '|', S, '|', ['to-string', ['get', 'level']], '|', ['to-string', ['*', 5, ['round', ['/', ['get', 'progress'], 5]]]], '|', ['coalesce', ['get', 'chal'], ''], '|', ['to-string', ['get', 'mine']]],
            'icon-size': 0.9,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-pitch-alignment': 'viewport',
            'symbol-sort-key': ['-', 0, ['get', 'xp']],
          },
          paint: { 'icon-opacity': 1 },
        },
        {
          id: 'labels',
          type: 'symbol',
          source: 'nodes',
          layout: {
            'text-field': ['get', 'name'],
            'text-font': FONT,
            'text-size': zi([14.5, 9.5, 16, 11, 18, 13.5]),
            'text-letter-spacing': 0.12,
            'text-line-height': 1.3,
            'text-max-width': 9,
            'text-anchor': 'top',
            'text-offset': [0, 1.35],
            'text-padding': 3,
            'text-optional': false,
            'symbol-sort-key': ['-', 0, ['get', 'xp']],
          },
          paint: { 'text-color': ['case', MINE, '#F2FFD0', ['==', S, 'locked'], '#A99E7E', INK], 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-halo-blur': 0.4 },
        },
      ]);
    return { version: 8, glyphs: CFG.glyphs, sources: sources, layers: layers };
  }

  // ---------------------------------------------------------------------------
  // Images (canvas): the contested hatch and the zone nodes
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
  function makeHatch() {
    var cv = canvas(10, 10);
    var g = cv.g;
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-2, 12);
    g.lineTo(12, -2);
    g.moveTo(-2, 2);
    g.lineTo(2, -2);
    g.moveTo(8, 12);
    g.lineTo(12, 8);
    g.stroke();
    addImage('hatch', cv);
  }

  /**
   * A zone node: a hexagonal plate in the holder's colour with strength pips; a capture-progress
   * arc in the attackers' colour when it's contested; dashed with a plus when neutral; a padlock
   * when protected. Your crew's nodes carry a small bright core.
   */
  function makeNode(name) {
    var p = name.split('|');
    var color = p[1];
    var status = p[2];
    var level = +p[3] || 0;
    var progress = +p[4] || 0;
    var chal = p[5];
    var mine = p[6] === '1';
    var W = 40;
    var c = W / 2;
    var cv = canvas(W, W);
    var g = cv.g;
    var hex = function (r) {
      g.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = (Math.PI / 3) * i - Math.PI / 2;
        g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
    };
    if (status === 'contested') {
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.arc(c, c, 17, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = chal || '#FFD21F';
      g.beginPath();
      g.arc(c, c, 17, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress) / 100);
      g.stroke();
    }
    hex(12.5);
    g.fillStyle = 'rgba(7,8,11,0.94)';
    g.fill();
    if (status === 'neutral') {
      g.setLineDash([2.5, 2.5]);
      g.strokeStyle = '#7A7F8A';
      g.lineWidth = 1.2;
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#B9BCC4';
      g.fillRect(c - 0.75, c - 4.5, 1.5, 9);
      g.fillRect(c - 4.5, c - 0.75, 9, 1.5);
    } else if (status === 'locked') {
      g.strokeStyle = 'rgba(230,207,138,0.7)';
      g.lineWidth = 1.2;
      g.stroke();
      g.strokeStyle = '#E6CF8A';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(c, c - 1.5, 2.8, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#E6CF8A';
      g.fillRect(c - 3.8, c - 1.5, 7.6, 5.6);
    } else {
      g.strokeStyle = color;
      g.lineWidth = mine ? 2.2 : 1.6;
      g.stroke();
      for (var l = 0; l < 5; l++) {
        g.fillStyle = l < level ? color : 'rgba(255,255,255,0.14)';
        g.fillRect(c - 6.6 + l * 2.8, c + 3.5 - l * 1.4, 1.8, 2.6 + l * 1.4);
      }
      if (mine) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(c, c - 5.5, 1.6, 0, Math.PI * 2);
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
    center: [88.5239, 22.9637],
    zoom: 14.6,
    minZoom: 13,
    maxZoom: 19.2,
    maxPitch: 60,
    maxBounds: [[88.47, 22.925], [88.58, 23.0]],
    attributionControl: false,
    renderWorldCopies: false,
    fadeDuration: 160,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap contributors' + (CFG.tiles ? ' · © OpenMapTiles' : '') }), 'top-right');
  window.__map = map;

  var tilesOk = !!CFG.tiles;
  map.on('error', function (e) {
    if (e && e.sourceId === 'omt' && tilesOk) {
      tilesOk = false;
      if (styleReady) map.setPaintProperty('campus', 'fill-opacity', 1);
      send({ type: 'loaded', tiles: false });
    }
  });
  map.on('styleimagemissing', function (e) {
    if (e.id.indexOf('n|') === 0) makeNode(e.id);
  });

  var styleReady = false;
  var queue = [];
  map.on('load', function () {
    makeHatch();
    styleReady = true;
    if (!tilesOk) map.setPaintProperty('campus', 'fill-opacity', 1);
    var attrib = document.querySelector('.maplibregl-ctrl-attrib');
    if (attrib) attrib.classList.remove('maplibregl-compact-show');
    queue.splice(0).forEach(handle);
    applyMode();
    send({ type: 'loaded', tiles: tilesOk });
    start();
  });

  var lastCam = 0;
  function camera(moving) {
    var now = Date.now();
    if (moving && now - lastCam < 160) return;
    lastCam = now;
    send({ type: 'camera', zoom: +map.getZoom().toFixed(2), bearing: Math.round(map.getBearing()), moving: moving });
  }
  map.on('move', function () {
    camera(true);
  });
  map.on('moveend', function () {
    camera(false);
  });

  // ---------------------------------------------------------------------------
  // Modes: emphasis only
  // ---------------------------------------------------------------------------
  var mode = 'territory';
  function byMode(table) {
    return table[mode] !== undefined ? table[mode] : table.territory;
  }
  function applyMode() {
    if (!styleReady) return;
    var P = function (layer, prop, v) {
      map.setPaintProperty(layer, prop, v);
    };
    var V = function (layer, on) {
      map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none');
    };
    P('zone-fill', 'fill-opacity', byMode({
      explore: ['case', SEL, 0.16, ['==', S, 'owned'], ['case', MINE, 0.07, 0.045], CONTESTED, 0.06, ['==', S, 'locked'], 0.03, 0],
      territory: ['case', SEL, 0.22, ['==', S, 'neutral'], 0.03, ['==', S, 'locked'], 0.05, ['+', 0.06, ['*', ['/', ['get', 'strength'], 100], 0.1], ['case', MINE, 0.02, 0]]],
      crews: ['case', SEL, 0.38, ['==', S, 'neutral'], 0, ['==', S, 'locked'], 0.04, 0.26],
      activity: ['case', SEL, 0.14, 0.025],
      challenges: ['case', SEL, 0.32, CONTESTED, 0.2, 0.015],
    }));
    P('zone-line', 'line-opacity', byMode({ explore: 0.3, territory: ['case', MINE, 0.85, 0.6], crews: 0.22, activity: 0.16, challenges: ['case', CONTESTED, 0.9, 0.1] }));
    P('zone-neutral', 'line-opacity', byMode({ explore: 0.4, territory: 0.75, crews: 0.3, activity: 0.22, challenges: 0.12 }));
    P('zone-locked', 'line-opacity', byMode({ explore: 0.35, territory: 0.5, crews: 0.3, activity: 0.2, challenges: 0.12 }));
    P('zone-hatch', 'fill-opacity', byMode({ explore: 0.25, territory: 0.6, crews: 0.35, activity: 0.2, challenges: 1 }));
    P('zone-contested', 'line-opacity', byMode({ explore: 0.35, territory: 0.95, crews: 0.55, activity: 0.3, challenges: 1 }));
    P('zone-contested-glow', 'line-opacity', byMode({ explore: 0, territory: 0.35, crews: 0.2, activity: 0, challenges: 0.5 }));
    P('region-line', 'line-opacity', byMode({ explore: 0.25, territory: 0.75, crews: 1, activity: 0.18, challenges: 0.15 }));
    P('region-line', 'line-width', byMode({ explore: zi([14, 0.8, 17, 1.4]), territory: zi([14, 1.2, 17, 2.4]), crews: zi([14, 1.8, 17, 3.2]), activity: 1, challenges: 1 }));
    P('region-glow', 'line-opacity', byMode({ explore: 0, territory: 0.16, crews: 0.38, activity: 0, challenges: 0 }));
    P('links', 'line-opacity', byMode({ explore: 0, territory: 0.32, crews: 0.8, activity: 0.12, challenges: 0 }));
    P('vector', 'line-opacity', byMode({ explore: 0, territory: 0.65, crews: 0.35, activity: 0, challenges: 1 }));
    P('vector-glow', 'line-opacity', byMode({ explore: 0, territory: 0.18, crews: 0.1, activity: 0, challenges: 0.4 }));
    V('act-heat', mode === 'activity');
    P('act-ring', 'circle-stroke-opacity', 0);
    P('building', 'fill-color', byMode({ explore: '#1D2028', territory: '#171A20', crews: '#14161B', activity: '#14161B', challenges: '#121418' }));
    P('building-3d', 'fill-extrusion-color', byMode({ explore: '#20242C', territory: '#1A1D24', crews: '#16181E', activity: '#16181E', challenges: '#14161B' }));
    P('nodes', 'icon-opacity', byMode({ explore: ['case', SEL, 1, 0.55], territory: 1, crews: ['case', ['==', S, 'neutral'], 0.4, 1], activity: 0.45, challenges: ['case', CONTESTED, 1, SEL, 1, 0.3] }));
    map.setLayoutProperty('nodes', 'icon-size', byMode({ explore: 0.62, territory: zi([14.5, 0.7, 17, 0.95]), crews: zi([14.5, 0.7, 17, 0.95]), activity: 0.55, challenges: ['case', CONTESTED, 1, 0.6] }));
    var sub = byMode({
      explore: ['upcase', ['get', 'type']],
      territory: ['case', ['==', S, 'neutral'], ['concat', '+', ['to-string', ['get', 'xp']], ' XP · OPEN'], ['==', S, 'locked'], 'PROTECTED', CONTESTED, ['concat', ['get', 'chalName'], ' ', ['to-string', ['get', 'progress']], '% · ', ['get', 'ownerName']], ['concat', ['get', 'ownerName'], ' · ', ['to-string', ['get', 'strength']], '%']],
      crews: ['case', ['==', S, 'neutral'], 'UNCLAIMED', ['==', S, 'locked'], 'PROTECTED', ['get', 'ownerName']],
      activity: ['case', ['>', ['get', 'users'], 0], ['concat', ['to-string', ['get', 'users']], ' ACTIVE'], 'QUIET'],
      challenges: ['case', CONTESTED, ['concat', ['get', 'chalName'], ' → ', ['get', 'ownerName'], ' · ', ['to-string', ['get', 'progress']], '%'], ''],
    });
    var subColor = byMode({ territory: ['case', CONTESTED, ['get', 'chal'], ['==', S, 'neutral'], '#9EA3AD', ['==', S, 'locked'], '#A99E7E', ['get', 'color']], crews: ['case', HELD, ['get', 'color'], '#7E838D'], activity: '#FFC67A', challenges: ['coalesce', ['get', 'chal'], '#7E838D'], explore: '#8C9099' });
    map.setLayoutProperty('labels', 'text-field', ['step', ['zoom'], ['get', 'name'], mode === 'activity' || mode === 'challenges' ? 13 : 15.2, ['format', ['get', 'name'], {}, '\n', {}, sub, { 'font-scale': 0.78, 'text-color': subColor }]]);
    P('labels', 'text-opacity', byMode({ explore: 1, territory: 1, crews: 1, activity: 1, challenges: ['case', CONTESTED, 1, SEL, 1, 0.45] }));
    particlesOn = mode === 'territory' || mode === 'crews' || mode === 'activity';
    if (!particlesOn) map.getSource('particles').setData(EMPTY);
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------
  function zoneAt(point) {
    if (!styleReady) return null;
    var box = [[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]];
    var n = map.queryRenderedFeatures(box, { layers: ['nodes'] });
    // Icons overlap their neighbours' hit boxes: take the node nearest the finger.
    var best = null;
    for (var i = 0; i < n.length; i++) {
      var q = map.project(n[i].geometry.coordinates);
      var d = (q.x - point.x) * (q.x - point.x) + (q.y - point.y) * (q.y - point.y);
      if (!best || d < best.d) best = { d: d, id: n[i].properties.id };
    }
    if (best) return best.id;
    var z = map.queryRenderedFeatures(point, { layers: ['zone-fill'] });
    return z.length ? z[0].properties.id : null;
  }
  map.on('click', function (e) {
    send({ type: 'tap', id: zoneAt(e.point), lngLat: [e.lngLat.lng, e.lngLat.lat] });
  });

  var tip = document.getElementById('tip');
  var hoverId = null;
  function setHover(id) {
    if (hoverId === id) return;
    if (hoverId) map.setFeatureState({ source: 'zones', id: hoverId }, { hover: false });
    hoverId = id;
    if (id) map.setFeatureState({ source: 'zones', id: id }, { hover: true });
  }
  map.on('mousemove', function (e) {
    if (!styleReady || (e.originalEvent && e.originalEvent.pointerType === 'touch')) return;
    var id = zoneAt(e.point);
    setHover(id);
    map.getCanvas().style.cursor = id ? 'pointer' : '';
    var f = id && byId[id];
    if (!f) {
      tip.style.opacity = 0;
      return;
    }
    var p = f.properties;
    tip.style.borderLeftColor = p.status === 'contested' ? p.chal : p.color;
    tip.innerHTML = '<b>' + esc(p.full) + '</b><span style="color:' + (p.status === 'neutral' ? '#9EA3AD' : p.color) + '">' + esc(tipLine(p)) + '</span>';
    tip.style.transform = 'translate(' + (e.point.x + 14) + 'px,' + (e.point.y + 14) + 'px)';
    tip.style.opacity = 1;
  });
  map.getCanvas().addEventListener('mouseleave', function () {
    setHover(null);
    tip.style.opacity = 0;
  });
  function tipLine(p) {
    if (p.status === 'locked') return 'PROTECTED';
    if (p.status === 'neutral') return 'UNCLAIMED · ' + p.xp + ' XP';
    if (p.status === 'contested') return p.ownerName + ' ' + p.strength + '% · ' + p.chalName + ' ATTACKING ' + p.progress + '%';
    return p.ownerName + ' · ' + p.strength + '% · ' + p.users + ' ACTIVE';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------------------------------------------------------------------------
  // You: the squirrel marker (one DOM element) + accuracy circle (map layer, metres)
  // ---------------------------------------------------------------------------
  var SQUIRREL =
    '<svg viewBox="0 0 32 32" aria-hidden="true">' +
    '<path d="M19.5 27.5c6.8-.4 9.6-6.6 6.7-11.4-1.6-2.6-3.9-3.4-3.6-6.2.2-2 2-3 3.7-2.6-.9-2.9-4.6-4.2-7.4-2.4-2.6 1.7-3 5.1-1.3 7.6 1.5 2.2 3.4 3.3 3.2 6.1-.1 1.4-.7 2.6-1.6 3.4" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M8.6 9.4l.9-3.6 2.4 3.1" fill="currentColor"/>' +
    '<circle cx="10.4" cy="12.6" r="3.9" fill="currentColor"/>' +
    '<path d="M8.2 27.5c-1.4-3.2-.8-7.6 2.6-10 2.9-2 6.7-1.2 7.6 2.2.9 3.4-.9 6.6-3 7.8z" fill="currentColor"/>' +
    '<circle cx="9.1" cy="12.1" r=".95" fill="#07080B"/>' +
    '</svg>';
  var meEl = document.createElement('div');
  meEl.className = 'me';
  meEl.innerHTML = '<div class="me-pulse"></div><div class="me-dir"></div><div class="me-core">' + SQUIRREL + '</div><div class="me-tag">PREVIEW</div>';
  var meMarker = new maplibregl.Marker({ element: meEl, pitchAlignment: 'viewport', rotationAlignment: 'viewport' });
  var meHeading = null;
  function aimMe() {
    var dir = meEl.querySelector('.me-dir');
    if (meHeading == null) dir.style.opacity = 0;
    else {
      dir.style.opacity = 1;
      dir.style.transform = 'rotate(' + (meHeading - map.getBearing()) + 'deg)';
    }
  }
  map.on('rotate', function () {
    if (meHeading != null) aimMe();
  });
  var meShown = false;
  var lastMe = null;
  function setMe(m) {
    if (!m.pos) {
      if (meShown) meMarker.remove();
      meShown = false;
      lastMe = null;
      map.getSource('me').setData(EMPTY);
      return;
    }
    lastMe = m.pos;
    meMarker.setLngLat(m.pos);
    if (!meShown) meMarker.addTo(map);
    meShown = true;
    meEl.className = 'me' + (m.preview ? ' me-preview' : '');
    meHeading = m.heading;
    aimMe();
    var mpp22 = (156543.03392 * Math.cos((m.pos[1] * Math.PI) / 180)) / Math.pow(2, 22);
    map.getSource('me').setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: m.pos }, properties: { r22: Math.max(8, m.accuracy || 25) / mpp22 } }] });
  }

  // ---------------------------------------------------------------------------
  // Messages from the app
  // ---------------------------------------------------------------------------
  var selected = null;
  var byId = {};
  var nodes = [];
  var links = [];
  var particlesOn = true;
  var NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };

  function move(fn) {
    map.stop();
    requestAnimationFrame(fn);
  }
  /**
   * Show a box, turned to `bearing`, inside the part of the map the padding leaves free. The zoom
   * is worked out here rather than with cameraForBounds, which adds the map's current padding (left
   * over from the last move) to the one asked for and then fails to fit.
   */
  function fit(bbox, padding, bearing, maxZoom, duration, pitch) {
    var b = bearing == null ? map.getBearing() : bearing;
    var p = pitch == null ? map.getPitch() : pitch;
    var mid = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    var cos = Math.cos((mid[1] * Math.PI) / 180);
    var wm = (bbox[2] - bbox[0]) * 111320 * cos;
    var hm = (bbox[3] - bbox[1]) * 111320;
    var r = (b * Math.PI) / 180;
    var bw = Math.abs(wm * Math.cos(r)) + Math.abs(hm * Math.sin(r));
    var bh = Math.abs(wm * Math.sin(r)) + Math.abs(hm * Math.cos(r));
    var cv = map.getCanvas();
    var aw = Math.max(80, cv.clientWidth - padding.left - padding.right);
    var ah = Math.max(80, cv.clientHeight - padding.top - padding.bottom);
    var mpp = Math.max(bw / aw, bh / ah);
    var zoom = Math.min(maxZoom || 18.5, Math.log2((78271.517 * cos) / mpp));
    var opts = { center: mid, zoom: zoom, padding: padding, bearing: b, pitch: p };
    if (duration === 0) map.jumpTo(opts);
    else {
      opts.duration = duration || 1200;
      opts.curve = 1.3;
      opts.essential = true;
      map.flyTo(opts);
    }
  }
  function handle(m) {
    if (!styleReady && m.type !== 'active' && m.type !== 'insets') {
      queue.push(m);
      return;
    }
    switch (m.type) {
      case 'init':
        map.getSource('base').setData(m.base);
        if (m.intro) {
          // The opening shot: the town around the campus, then down onto it.
          var mid = [(m.bbox[0] + m.bbox[2]) / 2, (m.bbox[1] + m.bbox[3]) / 2];
          map.jumpTo({ center: mid, zoom: 13.4, pitch: 0, bearing: 0 });
          setTimeout(function () {
            fit(m.bbox, m.padding, m.bearing, 17, 2400, 38);
          }, 450);
        } else fit(m.bbox, m.padding, m.bearing, 17, 0, 38);
        break;
      case 'state':
        map.getSource('zones').setData(m.zones);
        map.getSource('nodes').setData(m.nodes);
        map.getSource('regions').setData(m.regions);
        map.getSource('links').setData(m.links);
        map.getSource('vectors').setData(m.vectors);
        byId = {};
        m.zones.features.forEach(function (f) {
          byId[f.properties.id] = f;
        });
        nodes = m.nodes.features;
        links = m.links.features;
        seedParticles();
        if (selected) map.setFeatureState({ source: 'zones', id: selected }, { selected: true });
        break;
      case 'mode':
        mode = m.mode;
        applyMode();
        break;
      case 'select':
        if (selected) {
          map.setFeatureState({ source: 'zones', id: selected }, { selected: false });
          map.setFeatureState({ source: 'nodes', id: selected }, { selected: false });
        }
        selected = m.id;
        if (selected) {
          map.setFeatureState({ source: 'zones', id: selected }, { selected: true });
          map.setFeatureState({ source: 'nodes', id: selected }, { selected: true });
        }
        break;
      case 'me':
        setMe(m);
        break;
      case 'fx':
        fx(m);
        break;
      case 'ping':
        var f = nodeOf(m.id);
        if (f) {
          pings.push({ pos: f.geometry.coordinates, color: m.color, born: performance.now() });
          if (pings.length > 10) pings.shift();
          start();
        }
        break;
      case 'fit':
        move(function () {
          fit(m.bbox, m.padding, m.bearing, m.maxZoom, m.duration);
        });
        break;
      case 'fly':
        move(function () {
          map.flyTo({ center: m.center, zoom: m.zoom == null ? Math.max(map.getZoom(), 16.4) : m.zoom, bearing: m.bearing == null ? map.getBearing() : m.bearing, padding: m.padding || NO_PADDING, duration: m.duration == null ? 900 : m.duration, curve: 1.2, essential: true });
        });
        break;
      case 'north':
        map.easeTo({ bearing: 0, pitch: 0, duration: 600 });
        break;
      case 'zoom':
        map.easeTo({ zoom: map.getZoom() + m.by, duration: 300 });
        break;
      case 'insets':
        document.documentElement.style.setProperty('--inset-top', (m.top || 0) + 'px');
        document.documentElement.style.setProperty('--inset-right', (m.right || 0) + 'px');
        break;
      case 'active':
        active = !!m.on;
        if (active) start();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Game moments
  // ---------------------------------------------------------------------------
  var tweens = [];
  function tween(ms, step, done) {
    tweens.push({ t0: performance.now(), ms: ms, step: step, done: done });
    start();
  }
  var easeOut = function (t) {
    return 1 - Math.pow(1 - t, 3);
  };
  function nodeOf(id) {
    for (var i = 0; i < nodes.length; i++) if (nodes[i].properties.id === id) return nodes[i];
    return null;
  }
  function scaleRing(ring, c, k) {
    return ring.map(function (p) {
      return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
    });
  }
  function circle(c, rM, n) {
    var out = [];
    var kx = 1 / (111320 * Math.cos((c[1] * Math.PI) / 180));
    var ky = 1 / 111320;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * Math.PI * 2;
      out.push([c[0] + Math.cos(a) * rM * kx, c[1] + Math.sin(a) * rM * ky]);
    }
    return out;
  }
  function ringF(coords, color, width, opacity) {
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: { kind: 'ring', color: color, width: width, opacity: opacity } };
  }
  function fillF(coords, color, opacity) {
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: { kind: 'fill', color: color, opacity: opacity } };
  }

  function fx(m) {
    var f = byId[m.id];
    var n = nodeOf(m.id);
    if (!f || !n) return;
    var ring = f.geometry.coordinates[0];
    var c = n.geometry.coordinates;
    var r = n.properties.radius || 80;
    var src = map.getSource('fx');
    var flash = function (t) {
      map.setFeatureState({ source: 'zones', id: m.id }, { flash: t > 0.5 && t < 0.68 ? 1 : 0 });
    };
    var done = function () {
      src.setData(EMPTY);
      map.setFeatureState({ source: 'zones', id: m.id }, { flash: 0 });
    };
    if (m.kind === 'claim' || m.kind === 'capture') {
      // The crew colour floods out from where you stood, the border flashes, rings ripple out.
      var from = m.from && pointIn(m.from, ring) ? m.from : c;
      tween(2100, function (t) {
        var feats = [];
        var ft = Math.min(1, t / 0.55);
        feats.push(fillF(scaleRing(ring, from, easeOut(ft)), m.color, 0.5 * (1 - Math.max(0, (t - 0.6) / 0.4))));
        feats.push(ringF(scaleRing(ring, from, easeOut(ft)), m.color, 2.4, 0.9 * (1 - Math.max(0, (t - 0.55) / 0.2))));
        for (var k = 0; k < 3; k++) {
          var tt = Math.max(0, Math.min(1, (t - 0.5 - k * 0.1) / 0.45));
          if (tt > 0 && tt < 1) feats.push(ringF(scaleRing(ring, c, 1 + 0.35 * easeOut(tt)), m.color, 2.6 - k * 0.6, 0.8 * (1 - tt)));
        }
        var nt = Math.max(0, Math.min(1, (t - 0.45) / 0.5));
        if (nt > 0 && nt < 1) feats.push(ringF(circle(c, 6 + 40 * easeOut(nt), 40), '#FFFFFF', 2, 0.9 * (1 - nt)));
        src.setData({ type: 'FeatureCollection', features: feats });
        flash(t);
      }, done);
      burst(c, m.color, 18);
      return;
    }
    if (m.kind === 'attack' || m.kind === 'challenge') {
      // Shockwaves converge on the node, the border flickers in the attackers' colour.
      tween(1400, function (t) {
        var feats = [];
        for (var k = 0; k < 3; k++) {
          var tt = Math.max(0, Math.min(1, (t - k * 0.15) / 0.6));
          if (tt > 0 && tt < 1) feats.push(ringF(circle(c, r * (1.4 - 1.25 * easeOut(tt)), 48), m.color, 2.4, 0.9 * Math.sin(Math.PI * tt)));
        }
        src.setData({ type: 'FeatureCollection', features: feats });
        flash(t);
      }, done);
      return;
    }
    if (m.kind === 'defend' || m.kind === 'repel') {
      // A shield: the outline thickens and pulses inwards, then settles.
      tween(1500, function (t) {
        var feats = [];
        var k = 1.12 - 0.12 * easeOut(Math.min(1, t / 0.5));
        feats.push(ringF(scaleRing(ring, c, k), m.color, 4 * (1 - t) + 1, 0.95 * (1 - Math.max(0, (t - 0.5) / 0.5))));
        if (m.kind === 'repel') {
          var tt = Math.max(0, (t - 0.3) / 0.7);
          if (tt > 0 && tt < 1) feats.push(ringF(scaleRing(ring, c, 1 + 0.5 * easeOut(tt)), m.color, 2, 0.8 * (1 - tt)));
        }
        feats.push(fillF(ring, m.color, 0.18 * Math.sin(Math.PI * t)));
        src.setData({ type: 'FeatureCollection', features: feats });
      }, done);
      return;
    }
    if (m.kind === 'lost') {
      tween(1600, function (t) {
        src.setData({ type: 'FeatureCollection', features: [fillF(ring, m.color, 0.32 * Math.sin(Math.PI * t)), ringF(ring, m.color, 3, 0.9 * (1 - t))] });
        flash(t);
      }, done);
    }
  }

  function pointIn(pt, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0];
      var yi = ring[i][1];
      var xj = ring[j][0];
      var yj = ring[j][1];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ---------------------------------------------------------------------------
  // XP particles: drift in from around each busy zone into its node, and run along crew links.
  // ---------------------------------------------------------------------------
  var parts = [];
  var seed = 7;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function spawn(p, now) {
    var a = rnd() * Math.PI * 2;
    var d = p.r * (0.45 + 0.55 * rnd());
    p.from = [p.to[0] + Math.cos(a) * d * p.kx, p.to[1] + Math.sin(a) * d * p.ky];
    p.t0 = now + rnd() * 1800;
    p.ms = 1800 + rnd() * 1600;
  }
  function seedParticles() {
    var now = performance.now();
    parts = [];
    nodes.forEach(function (n) {
      var pr = n.properties;
      if (pr.status !== 'owned' && pr.status !== 'contested') return;
      var count = Math.max(1, Math.round(pr.activity * 4));
      var c = n.geometry.coordinates;
      for (var i = 0; i < count; i++) {
        var p = { to: c, color: pr.color, r: Math.max(40, pr.radius * 0.9), kx: 1 / (111320 * Math.cos((c[1] * Math.PI) / 180)), ky: 1 / 111320 };
        spawn(p, now);
        parts.push(p);
      }
    });
    links.forEach(function (l) {
      var cs = l.geometry.coordinates;
      parts.push({ link: true, a: cs[0], b: cs[1], color: l.properties.color, t0: now + rnd() * 2000, ms: 2600 + l.properties.len * 6 });
    });
    burstParts = [];
  }
  var burstParts = [];
  function burst(c, color, n) {
    var now = performance.now();
    var kx = 1 / (111320 * Math.cos((c[1] * Math.PI) / 180));
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2;
      var d = 60 + rnd() * 90;
      burstParts.push({ from: [c[0] + Math.cos(a) * d * kx, c[1] + (Math.sin(a) * d) / 111320], to: c, color: color, t0: now + 500 + rnd() * 500, ms: 900 + rnd() * 500 });
    }
  }
  function particleFrame(now) {
    var feats = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var t = (now - p.t0) / p.ms;
      if (t < 0) continue;
      if (t >= 1) {
        if (p.link) p.t0 = now + 800 + rnd() * 2400;
        else spawn(p, now);
        continue;
      }
      var e = p.link ? t : t * t;
      var a = p.link ? p.a : p.from;
      var b = p.link ? p.b : p.to;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e] }, properties: { color: p.color, a: (p.link ? 0.7 : 0.85) * Math.sin(Math.PI * t) } });
    }
    for (var j = burstParts.length - 1; j >= 0; j--) {
      var q = burstParts[j];
      var tq = (now - q.t0) / q.ms;
      if (tq >= 1) {
        burstParts.splice(j, 1);
        continue;
      }
      if (tq < 0) continue;
      var eq = tq * tq;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [q.from[0] + (q.to[0] - q.from[0]) * eq, q.from[1] + (q.to[1] - q.from[1]) * eq] }, properties: { color: q.color, a: 1 - tq * 0.5 } });
    }
    map.getSource('particles').setData({ type: 'FeatureCollection', features: feats });
  }

  // ---------------------------------------------------------------------------
  // The animation loop
  // ---------------------------------------------------------------------------
  var DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
  var LINK_DASH = [[1, 2.2], [0, 0.4, 1, 1.8], [0, 0.8, 1, 1.4], [0, 1.2, 1, 1], [0, 1.6, 1, 0.6], [0, 2, 1, 0.2]];
  var pings = [];
  var running = false;
  var active = true;
  var lastFrame = 0;
  var lastDash = 0;
  var dashStep = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      var t = Math.min(1, (now - tw.t0) / tw.ms);
      tw.step(t);
      if (t >= 1) {
        tweens.splice(i, 1);
        tw.done && tw.done();
      }
    }
    if (now - lastFrame < 33 || !styleReady) return;
    lastFrame = now;
    var s = now / 1000;
    if (!reduced && now - lastDash > 80) {
      lastDash = now;
      dashStep = (dashStep + 1) % DASH.length;
      map.setPaintProperty('zone-contested', 'line-dasharray', DASH[dashStep]);
      map.setPaintProperty('vector', 'line-dasharray', DASH[(DASH.length - dashStep) % DASH.length]);
      map.setPaintProperty('links', 'line-dasharray', LINK_DASH[dashStep % LINK_DASH.length]);
    }
    // Contested borders throb; your own zones breathe.
    var a = 0.5 + 0.5 * Math.sin(s * 3.6);
    map.setPaintProperty('zone-contested-glow', 'line-width', 4 + 6 * a);
    var breath = 0.5 + 0.5 * Math.sin(s * 1.4);
    map.setPaintProperty('zone-breath', 'fill-opacity', mode === 'territory' || mode === 'crews' ? 0.01 + 0.035 * breath : 0);
    // Activity rings ripple out from busy nodes.
    var q = (s % 2.6) / 2.6;
    var ringMax = mode === 'activity' ? 44 : 26;
    map.setPaintProperty('act-ring', 'circle-radius', 8 + ringMax * q);
    map.setPaintProperty('act-ring', 'circle-stroke-opacity', (mode === 'activity' ? 0.75 : mode === 'territory' ? 0.35 : 0) * (1 - q));
    if (particlesOn && !reduced && map.getZoom() >= 14.6) particleFrame(now);
    var live = [];
    for (var j = 0; j < pings.length; j++) if (now - pings[j].born < 2000) live.push(pings[j]);
    if (live.length || pings.length) {
      pings = live;
      map.getSource('pings').setData({
        type: 'FeatureCollection',
        features: live.map(function (pg) {
          return { type: 'Feature', geometry: { type: 'Point', coordinates: pg.pos }, properties: { color: pg.color, q: (now - pg.born) / 2000 } };
        }),
      });
    }
  }

  send({ type: 'ready' });
})();
