# Mobile Module

This is the Android mobile client for the RUN App.

## Emulator Configuration
The emulator on this machine needs Graphics Acceleration set to **SOFTWARE**; hardware acceleration renders the app as a black screen.

## Human Verification Protocol (RM-1.1)
1. In the Emulator Extended controls > Location > Routes, load a route and play it back. Start a run. Point count rises about once a second.
2. Press Home. Wait at least 5 minutes. Return. The count kept rising the whole time ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â check that the newest points carry timestamps from while the app was in the background.
3. Note the point count. Force-stop the app: Settings > Apps > RunApp > Force stop. Reopen it. The recovery screen appears, and the stored count equals the count noted.
4. Tap RESUME. Recording continues and the count keeps rising from where it stopped.
5. Stop the run. Open the stats screen. Numbers appear; no coordinates.
## Offline to Online Sync (RM-1.6)

### H1: Live Upload
1. Run the backend locally. Open three separate terminal windows. (Note: If your path contains spaces, you may need to quote it in PowerShell):
   Window 1 (run-module):  docker compose -f infra/docker-compose.yml up -d
   Window 2 (backend):     npm run dev
   Window 3 (backend):     npm run worker
2. In the Android Emulator, open Extended Controls > Location > GPX/KML, and import dev/fixtures/test-loop.gpx.
3. Set playback speed to 1x and click Play.
4. In the app, tap START. Run the full loop, then tap STOP.
5. The Record screen will show the upload progressing as you run ("Uploaded N of M points"). Once stopped, it will transition to a server result (finalized / flagged / rejected).

### H2: Offline Sync
1. Turn ON Airplane Mode in the emulator.
2. Start playback of 	est-loop.gpx.
3. In the app, tap START. Run the loop, then tap STOP.
4. The Record screen will show "Waiting for network".
5. Turn OFF Airplane Mode.
6. Observe the app automatically completing the upload in the background and transitioning to a server result.

### H3: Server Result Verification
In both H1 and H2, the final state displayed on the screen must be one of:
- inalized
- lagged
- 
ejected (with rejection reason)
## V1-V4 Verification Steps (MapLibre Rendering)
V1. Backend running (docker, npm run dev, npm run worker). Seed a test territory with the DEV_JWT user's sub and a centre of the test-loop.gpx fixture. Open the map in the app: one polygon appears at that location, in the own-territory colour.
   (Expected test-loop.gpx run metrics: 467 points, 7m 46s duration at 1x, enclosed area ~120,000 m2. This helps verify the run covered the whole route.)
   (A correct tile request in the server log looks like GET /v1/territories/tiles/14/11724/7605.mvt. If you see %7Bz%7D in the log, it means the URL encoding defect has returned and the tile source template is broken.)
V2. Seed a second territory for a DIFFERENT user id nearby: it appears in the rival colour.
V3. Pan far away from any territory: the map stays usable and does not crash on 204 responses.
V4. A user with no territory sees the empty state, not a blank screen.