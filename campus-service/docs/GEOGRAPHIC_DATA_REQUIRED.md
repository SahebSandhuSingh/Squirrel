# Geographic data required before launch

**Everything geographic in this repo is a development placeholder.** The seed (`src/seed/zones.ts`) places
rectangles and ovals in metres around a single campus-centre coordinate — the same convention as the mobile
dev mock — so the app and backend line up in development. None of it has been checked against the ground.
Every seeded zone carries `geometry_source = 'dev_placeholder'`; the seed will overwrite a zone's geometry only
while it still has that marker, so replacing a polygon with real data is safe and permanent.

## What is needed

| item | needed for | format | who can supply |
|---|---|---|---|
| **Campus centre + fence radius** (`CAMPUS_CENTER_LAT/LNG`, `CAMPUS_MAX_RADIUS_M`) | rejecting off-campus GPS, nearby search bias | decimal degrees; metres | a phone standing at the main gate / centre; confirm the campus fits in 4 km |
| **Zone polygons (16 seeded, ~15 wanted)** — hostels (Narmada, Tapti, Godavari, Kaveri, Ganga…), Mess, CC1, Library, LHC, Admin lawn, Main gate boulevard, Research complex, Amphitheatre, Health centre, Sports ground, Lake | qualification, claims, map | closed WGS84 polygon (GeoJSON or KML), **valid** (no self-intersections), 5–30 vertices | walk the boundary with a GPS-tracing app (OSMAnd, Strava route, Google My Maps) or trace on satellite imagery |
| **Route lines for ROUTE zones** — Sports Ground Loop, Lake Walk (+ any other loops) | route_completion | WGS84 LineString following the actual path/track | trace by walking it once with the app in dev mode and exporting the `track` from `GET /v1/activities/:id` |
| **Per-zone thresholds** (optional) | fairness | number 0–1 | product decision after a week of real runs; defaults 0.6 AREA / 0.8 ROUTE |
| **Hostel list + names** | hostel leaderboard, profiles | id, full name, short name | admin |
| **Zone kinds & short names** | UI | enum | product |

## Constraints on polygons

* SRID 4326 (lon/lat), ring closed, `ST_IsValid` true (the schema enforces it).
* Hostel zones should be the block **plus** its courtyard/approach so a loop around it is possible.
* Avoid overlapping zones unless intentional; overlapping zones qualify independently.
* AREA zones smaller than ~4 000 m² are hard to hit 60 % coverage on with 15 m buffer — either lower the threshold or enlarge the zone.

## How to load real data

```sql
UPDATE zones SET geometry = ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[lng,lat],…]]}'),
                 centroid = ST_Centroid(ST_GeomFromGeoJSON('…')), geometry_source = 'survey', updated_at = now()
WHERE id = 'cc1';
UPDATE zones SET required_route = ST_GeomFromGeoJSON('{"type":"LineString","coordinates":[…]}'), geometry_source='survey' WHERE id = 'sports';
```
or replace the `xy`/`routeXy` arrays in `src/seed/zones.ts` with real coordinates (change `toLngLat` to pass through) and re-run `npm run seed`.
Verify with `GET /v1/zones?format=geojson` in any GeoJSON viewer, then do one real run through each zone and check `GET /v1/activities/:id/zones`.
