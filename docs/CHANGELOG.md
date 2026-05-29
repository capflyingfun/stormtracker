# StormTracker Changelog

This file tracks per-version changes for the static site under `docs/`.
Newest first. Service-worker cache name follows the version (e.g., `stormtracker-v542` for v4.46).

## v4.69

The **Total Precipitation Next 36 hrs** chart is now fully independent of the Rain Clock.

We tried tying the two together once (the chart's first 3 hours were overridden with the Rain Clock's live radar nowcast so they'd agree about "right now"). In practice that mixed two different things — a short-range radar nowcast and a 36-hour forecast — and made the chart confusing. They're now kept separate, as they should be.

Changes (all in `docs/js/weather.js`, `renderRainForecastBars`):

- **Forecast-only, all 36 hours** — the chart now draws the precipitation forecast straight from the hourly forecast data (Open-Meteo, with the NWS QPF merge already applied) for every hour, with no radar/clock override on hours 0–2. The Rain Clock keeps doing its own thing (inbound radar cells, 0–3 h); this chart is the forecast (0–36 h). They're deliberately separate measurements.
- **Always shows the graph, even with no rain** — when the forecast has no measurable rain, the card used to collapse to a single line of text. Now it still draws the chart frame (time axis, "Now → +36 h" labels, gridlines) with a centered "No measurable rain forecast" note, so it's clear the widget is working and it's simply a dry forecast — not a broken/empty card.

## v4.68

The Rain Clock dial now shows the **exact same inbound storms as the Storms tab** — same cells, same count, always in sync.

User asked for full sync (not a relabel): the Storms tab said "2 inbound" while the Rain Clock showed 3 cells. The two surfaces were telling different stories about the same thing.

Root cause: the Rain Clock ran its **own independent pipeline**. `_rainClockProject()` re-clustered the raw radar pixels (`S._rawScanPts`) using advection plus a 2.5 mi spatial-hash cluster — a completely different data path and a different clustering rule from the Storms-tab cards (which come from `computeTopStorms` → `S._topStorms` → the filtered, capped `S._inboundShown`). Different input + different clustering = a different number, every time.

Changes (all in `docs/js/weather.js`):

- **One source of truth for the dial's cells** — `_rainClockProject()` no longer re-clusters raw pixels. It now reads the **same `S._inboundShown` list** the header pill (`core.js`) and the Storms-tab cards (`storms.js`) read, falling back to the unfiltered top-storms list only before the Storms tab has rendered once. Each inbound storm card maps to exactly one cell on the dial, so the dial, the pill, and the cards can never disagree on which storms are inbound or how many there are. The user's active storm filter is honored automatically because `S._inboundShown` already reflects it.
- **Arrival mapped from the card's own ETA** — each cell is placed on the 0–180 min (3 h) dial at the same ETA the card shows. An overhead/now cell sits at the top; a card whose ETA is beyond the 3 h horizon is pinned to the dial edge so it is still counted (one card = one cell, always) without painting a misleading mid-dial arc. The v4.66 intensity-scaled cell radius and diameter ÷ speed pass-duration model are retained — only the *source* of each cell changed (storm card, not raw pixel).
- **No more cell capping** — the old window builder did `clusters.slice(0,5)`, which could undercount cells in a busy window. Now every cell is assigned to exactly one window and never dropped, so the total number of cells across all windows always equals the inbound card count. Tap-tooltips ("N cells"), the tap-details list, and the cards stay in lock-step.
- **Nearest Precipitation readout unchanged** — it still scans the raw radar points, so "rain X mi to the NW" keeps working even when nothing is inbound. Zero inbound storms now means the dial correctly shows "No rain expected next 3 hours," matching a Storms tab with no inbound cards.
- **Always re-renders when the inbound set changes** — the dial now recomputes whenever the Storms tab re-renders (`renderStorms` in `docs/js/storms.js`) and whenever you return to the weather page (`switchPage('weather')` in `docs/js/core.js`). Previously a storm-filter change or a page switch could update the cards/pill while the dial kept showing a stale window/count until an unrelated refresh; now the dial stays in lock-step in real time. Also, the dial no longer blanks out when the radar scan is stale — the cards still show their inbound storms (with ETAs) when stale, so the dial mirrors them instead of dropping to zero cells.

Note: "inbound" on the dial means the same thing it means on the Storms tab — approaching cells. Overhead cells (sitting on you, not approaching) are tracked separately on the Storms tab and aren't counted as "inbound" on either surface; the Nearest Precipitation line still surfaces close rain. The 36-hour bar chart still mirrors the clock for hours 0–2 via the radar-derived `radarHourlyMm`, which is now computed from these inbound cells.

## v4.67

Reconciled the confusing "inbound" counts across the app and switched the Rain Clock summary to a single clock format.

User reported the header pill said "5 inbound", the Storms-tab cards showed "2 inbound", and the Rain Clock told a third story — three different numbers for what reads like the same thing. Separately, the Rain Clock's plain-language summary printed every time in both 12-hour and 24-hour form ("around 11:00 AM (1100)"), ignoring the user's chosen time format.

Changes:

- **One inbound count everywhere** — the Storms tab is now the single source of truth. After it builds the filtered, capped inbound set it stashes it on `S._inboundShown` (`docs/js/storms.js`). The header pill (`docs/js/core.js`) and the "Light rain inbound — N cells" forecast banner (`buildStormForecastLines` in `docs/js/storms.js`) both read that same set, so all three agree and all honor the user's active storm filter. Previously the pill counted the unfiltered top-storms list while the cards counted the filtered list, which is why they disagreed (5 vs 2). Before the Storms tab has rendered once, the pill and banner fall back to their old unfiltered computation so nothing is blank on first paint.
- **Single clock format in the Rain Clock summary** — the summary sentence now shows arrival/end times in the app's chosen format only (12h or 24h, via the existing `fmtClock` helper that respects the time-format setting), e.g. *"A light rain cell @ 20 dBZ arriving around 11:00 AM, ending about 3 min later (around 11:03 AM)."* The dual-format helpers `_rcFmt12`/`_rcFmt24` were removed from `docs/js/weather.js`.

Note on the other on-screen numbers: the "storm track cones" count (how many storms' projected paths currently cover you) and the Rain Clock's "cells contributing" (radar-pixel rain windows) are deliberately different measurements from "inbound storm cards" and keep their own distinct labels — they were never meant to equal the inbound count. *(Superseded in v4.68: the Rain Clock's cells are no longer independent radar-pixel windows — the dial now mirrors the inbound storm cards exactly, so its cell count equals the inbound count. The storm-track-cones count remains a separate measurement.)*

## v4.66

Rain Clock now uses a dynamic, intensity-based catch size (like the storm cones), estimates how long the rain lasts from the cell's size and speed, and writes a plain-language summary.

User asked for the Rain Clock to size each cell by its strength the same way the Storms-tab cones do — a light drizzle cell should have a small footprint, an extreme core a large one — and to use that size, the storm speed, and the arrival time to estimate how long the rain will actually last over them. Desired summary wording: *"A Light rain cell @ 20 dBZ arriving around 11:00 AM (1100) ending about 3 minutes later."*

Changes (all in `docs/js/weather.js`):

- **Dynamic cell radius** — replaced the flat 1.5 mi catch radius that every cell used with `_rcCellRadiusMi(dbz)`, which mirrors the Storms-tab cone base width `clamp((dbz-20)/15, 0, 3)` plus a 0.2 mi floor. A ~20 dBZ cell is ~0.2 mi; a 60+ dBZ core is ~3 mi.
- **Cone-matched catch** — the catch radius now widens with how far the cell must travel to reach its closest approach, using the same 15° cone half-angle the cards use (`effR = baseR + distAlongV·tan15`, capped at 6 mi to avoid sweeping in far off-track cells). This makes the dial agree with the Storms-tab cards: a distant lighter cell the cards call "inbound" now registers an arrival on the dial instead of being missed by the old fixed circle.
- **Duration from diameter ÷ speed** — each rain window's length now reflects the physical pass time of the cell (cell diameter divided by storm speed, centered on the closest-approach time) instead of the old catch-circle chord length, which grew with the catch radius and didn't represent the real cell size.
- **Plain-language summary** — the Rain Clock text view now reads e.g. *"A light rain cell @ 20 dBZ arriving around 11:00 AM (1100), ending about 3 min later (around 11:03 AM)."* It names the intensity (Light / Moderate / Heavy / Intense from peak dBZ), shows the dBZ value, and shows the arrival time plus the estimated duration. *(Superseded in v4.67: the summary now uses a single clock format instead of both 12-hour and 24-hour.)*

## v4.65

Reverted the Storms-tab filter to its original working behavior and flipped the direction of the match: the Rain Clock now matches the Storms-tab cards, not the other way around.

User asked to put the cards back exactly as they were (they worked) and instead make the Rain Clock agree with the cards. Previously v4.63/v4.64 raised the shared floor to 20 dBZ and pushed the cards up toward the Rain Clock's stricter cutoff, which hid inbound cards. The Storms tab is now the source of truth.

Changes:

- **`docs/js/core.js`** — `STORM_MIN_DBZ` changed from 20 to 15, matching the Storms tab's long-standing radar detection floor.
- **`docs/js/storms.js`** — the card filter is back to its original form (only drops a cell when its estimated intensity at the user would arrive below 15 dBZ); no peak-reflectivity gate. The radar scan floor now reads from `STORM_MIN_DBZ` (still 15) so it stays linked to the Rain Clock.
- **`docs/js/weather.js`** — the Rain Clock's `_RC_MIN_DBZ` reads from `STORM_MIN_DBZ` (15), down from its old 25, so it surfaces the same light cells the cards do.

Net effect: storm cards behave exactly as before the v4.63 experiment, and the Rain Clock now shows rain for the same cells the cards surface instead of using a stricter, separate threshold.

## v4.64

Fixed a regression from v4.63 that hid every storm card.

User reported the Storms tab showed "5 inbound" with the mini sonar map and Rain Clock rendering normally, but the Storm Points cards were completely gone ("showing 0/1038"). v4.63 applied the new 20 dBZ shared floor to TWO different metrics: the cell's own peak reflectivity AND its estimated intensity at the user's exact location (`estDbzAtUser`). The est-at-user metric is not what the Rain Clock filters on — the Rain Clock gates on raw radar point reflectivity. Because inbound cells commonly weaken to below 20 dBZ by the time they reach the user's precise location, the est-at-user gate hid all of them, leaving no cards even though strong cells were clearly on the map.

Fix:

- **`docs/js/storms.js`** — the shared `STORM_MIN_DBZ` (20) floor is now applied ONLY to a cell's own peak reflectivity (`s.dbz`), which is the same metric the Rain Clock uses. The original weak-arrival guard (hide cells projected to arrive below 15 dBZ) is kept as-is, not raised to the shared floor. This restores the inbound cards while still enforcing a true 20 dBZ minimum on both surfaces using one consistent rule.

## v4.63

Storms-tab cards and the Rain Clock now share one minimum-dBZ floor (20 dBZ).

User reported a mismatch: the Storms tab was showing a weak "Rain Cell" (peak 25 dBZ, projected to arrive at only ~18 dBZ, labeled LIGHT RAIN / Drizzle) as "1 inbound", while the Rain Clock said "No rain expected next 3 hours." The two surfaces were using different cutoffs — the Rain Clock filtered cells below 25 dBZ, while the Storms tab only hid cells whose estimated arrival intensity was below 15 dBZ. The user asked that both use the same minimum and set it to 20 dBZ.

Changes:

- **`docs/js/core.js`** — new shared constant `STORM_MIN_DBZ = 20`, exported on `window`, so there's a single source of truth for the minimum-rain floor.
- **`docs/js/weather.js`** — the Rain Clock's `_RC_MIN_DBZ` (was hardcoded `25`) now reads from `STORM_MIN_DBZ`, lowering its floor to 20 to match.
- **`docs/js/storms.js`** — the Storms-tab baseline filter now hides a cell if EITHER its own peak reflectivity is below 20 dBZ OR its estimated intensity at the user's location is below 20 dBZ (was: only hide when estimated arrival < 15 dBZ). This drops the weak drizzle cells the user didn't want surfaced and keeps the Storms tab in agreement with the Rain Clock.

Net effect: anything too weak to register on the Rain Clock no longer shows up as an "inbound" storm card, and vice versa. The radar scan itself still samples down to 15 dBZ for accurate cell-building; the 20 dBZ floor is applied at display time.

## v4.62

Fixed raw `[!dbz:...]` / `[/!]` markup leaking into AI briefings.

User reported that about 3/4 of the way down their AI briefing, raw markup tokens like `[!dbz:...]` and `[/!]` were leaking into the rendered text. The system prompt instructs the model to wrap every dBZ value in a custom tag — `[!dbz:55]55 dBZ[/!]` — so the number can be rendered in the radar-palette color matching its intensity. The renderer's regex was strict: it only matched a single number (`[!dbz:55]`), no ranges, no stray whitespace, no case variation. The model frequently emits ranges in summary sentences (`[!dbz:45-55]45–55 dBZ[/!]`), and when it does, the regex misses and the raw markup leaks straight through to the user's screen and the copied-to-clipboard text.

Changes (`docs/js/ai.js`):

- **`fmtAIText()`** — dBZ regex widened to accept ranges (`[!dbz:45-55]`), decimals, optional whitespace around the colon/brackets, and case-insensitive `DBZ`. The color/severity regex (`[!red]…[/!]`, etc.) is now also case-insensitive and whitespace-tolerant.
- **Defensive sweep at the end of `fmtAIText()`** — any orphan `[!...]` or `[/!]` token that survived the structured passes (mismatched pairs, unknown tag names, markup the model invented on its own) is stripped before render. The user will never again see raw markup leak, even if the model invents a tag we don't recognize.
- **`stripAIMarkup()`** (the copy-to-clipboard path) — same tolerance widening and the same final sweep, so the text the user copies into another app is also always clean.

## v4.61

AI request per-attempt timeout bumped from 30s to 60s.

User reported that on slower connections legitimate AI Briefing responses were sometimes pushing close to a minute end-to-end (the model is summarizing storms, METAR, AFD, alerts, shear, instability, and inbound cells all in one prompt — it's a lot of context to chew through). At a 30-second per-attempt timeout the AbortController was firing on real, in-flight responses, not just dead sockets, so the user was watching the retry kick in unnecessarily.

Changes:

- **`docs/js/ai.js`** — `PER_ATTEMPT_MS` in `sendAIChat` raised from `30000` to `60000`. The visible countdown ("Attempt 2/3 · 47s remaining…") and the abort-error fallback string ("timed out after 60s") follow. Total worst-case wall time is now 3 × 60s ≈ 3 minutes before the "Three failed attempts" message appears, vs. ~1.5 minutes before. Non-retryable failures (401 / 429 / 402) still short-circuit instantly, so the longer ceiling only applies when the network is actually struggling.

## v4.60

AI panel collapses to a clean "Built-in Summary Assistant (NO AI)" view when there's no OpenAI key.

User pointed out that the AI panel was showing five quick-question buttons (Current conditions, Storms approaching?, Next few hours?, Safe outdoors?, plus the Send button and chat input) even when no API key was configured — and every one of those except "Full briefing" just produced a "No API key configured" error. Dead buttons that all fail with the same message are worse than no buttons. Asked to auto-run the briefing on open and replace the dead controls with a single ♻️ refresh button.

Changes:

- **`docs/index.html`** — added IDs (`ai-header-icon`, `ai-header-title`, `ai-input-row`, `ai-refresh-btn`, `ai-clear-btn`) so the panel can be retitled and restructured per mode. Added the ♻️ refresh button next to the close button (hidden by default).
- **`docs/js/ai.js`** — new `_applyAIPanelMode()` runs every time the panel opens and picks between two modes based on `getAIKey()`:
  - **No key:** title becomes "Built-in Summary Assistant (NO AI)", icon swaps to 📋, the chat input row and quick-question buttons are hidden, the 🗑️ clear button is hidden (nothing to clear — each refresh replaces the previous snapshot), and the ♻️ button is exposed. The deterministic on-device briefing auto-runs immediately on open and on every ♻️ press, with the panel cleared first so each refresh feels instant and snapshot-like instead of stacking stale briefings.
  - **Key present:** original full chat UI is restored — same title, same quick questions, same input, same Send button. Nothing changes for paying users.
- New `refreshSummaryBriefing()` is the single entry point for the no-key path. It clears the message area, calls `buildBriefing()`, and prepends a small `[!cyan]Built-in Summary (deterministic, on-device · no AI).[/!]` banner so the user always knows which engine produced the text on screen.

## v4.59

System Briefing drops the AFD wall + AI Briefing now retries with a visible countdown.

User reported two things:

1. The non-AI (System) briefing was getting cut short because we were dumping the full NWS Area Forecast Discussion (AFD) verbatim into the body. The AFD is a long, technical narrative written for meteorologists — it overflowed the briefing window with a "...[Truncated]" tail and pushed the useful sections off-screen. User suggested either dropping it from the System briefing or summarizing it with something free.
2. The AI Briefing hit a "Connection error" on spotty LTE with no retry — the user had to manually re-ask. Asked for an automatic retry with a visible 30-second countdown, up to 3 attempts total, and a friendly message after the third failure.

Changes:

- **`docs/js/briefingEngine.js`** — the System (non-AI) briefing no longer pastes the raw AFD into the Situation Overview. The AI Briefing still consumes the AFD (with the model summarizing it naturally) via the separate `buildWeatherContext()` path in `docs/js/ai.js`, so nothing is lost on that side. Skipping a third-party summarizer service keeps the System briefing fully on-device and key-free as advertised.
- **`docs/js/ai.js`** — `sendAIChat` rewritten as a retry loop: up to 3 attempts, each with a hard 30-second timeout via `AbortController`. A live status line under the typing dots shows which attempt is running (`Attempt 2/3 · 27s remaining…`). After the third failure the user sees: *"Three failed attempts. Internet connection is weak — try moving to a different location or connecting to Wi-Fi, then ask again."* Non-retryable failures (401 bad key, 429 rate limit, 402 quota) still short-circuit and surface their specific message immediately — no point burning retries on errors that won't fix themselves.

## v4.58

Rain Clock wording fix + faster recovery on slow connections.

User reported two issues on a slow LTE connection: (1) the Rain Clock header still said "RADAR + FORECAST" and the card showed "Nothing showing up on radar" next to "~0.06 in expected next 3 h" — a confusing contradiction, since the small expected amount was actually coming from the Open-Meteo fallback, not from radar. (2) Storm points loaded but winds aloft never arrived; the card sat on "Waiting on Open-Meteo" indefinitely and only fixed itself when the app was closed and reopened.

Wording fixes in `docs/js/weather.js`:

1. **Source tag**: "RADAR + FORECAST" → just "RADAR" (or "FORECAST (fallback)" in the rare case radar isn't ready but the forecast has filled in). The dial is radar-only as of v4.57, so claiming forecast input on the tag was wrong.
2. **Expected-rainfall amount** is now suppressed when the dial has no rain windows AND the amount came purely from the forecast fallback — so the card no longer shows "No rain on radar" right next to "~0.06 in expected." When radar actually projects rain, the amount still appears as before.

Recovery fixes:

3. **Open-Meteo background retry** (`_OM_RETRY_DELAYS` in `docs/js/weather.js`): retry delays tightened from [15s, 30s, 60s] (gave up after ~1m45s) to [5s, 10s, 20s, 45s, 90s] (~3m total, snappier first attempt). On slow connections this back-fills hourly/daily/UV/freeze-level cells without the user having to close and reopen the app.
4. **Winds aloft background retry** (new `_scheduleWindsAloftRetry` in `docs/js/storms.js`): mirrors the Open-Meteo retry. Previously, if every aloft provider (Open-Meteo main → customer-api → NOMADS GFS) timed out, the card just said "Winds aloft failed" and storm-cone projections silently went stale until the next hourly autorefresh. Now a retry chain fires at 6s / 15s / 30s / 60s, and on success the rain clock and storm projections re-render automatically.

## v4.57

Rain Clock shrunk back to 3 hours, radar-only.

User reported the rain clock was still putting too much emphasis on Open-Meteo instead of actual radar, plus a startup timing race where on the first load OM hadn't loaded yet but the dial drew anyway, then on subsequent loads OM was there but still wasn't drawing correctly. Asked to simply: make the clock a 3-hour radar-only dial, keep the expected-rainfall amount, and let the 36-hour bar chart below carry the forecast story.

Changes to the rain clock in `docs/js/weather.js`:

1. **Dial span**: `_RC_TOTAL_MIN` 720 → 180. The whole dial now represents the next 3 hours, matching the radar advection horizon.
2. **Hour labels**: 12 hourly labels → 6 labels at 30-minute intervals (Now, +30m, +1h, +1h30m, +2h, +2h30m). The live wall-clock time tick still updates each label every 60s.
3. **Tick ring**: minor ticks unchanged (still 120), majors moved from every 10th tick to every 20th so they line up with the new 30-minute label positions.
4. **Forecast overlay removed from the dial**. The hourly forecast walk still runs, but only to compute a 3-hour fallback rainfall amount — it no longer paints arcs. Radar advection is the sole source for what appears on the dial.
5. **Center text** now reads "next 3 hours" instead of "next 12 hours". Expected-rainfall amount prefers the radar-derived per-hour mm/hr sum (from v4.56) and only falls back to the forecast model when radar isn't ready yet.
6. **Boundary marker** at the 3-hour position removed — it now coincides with the top of the dial (same place as "Now"), so the dashed line would have been redundant.
7. **Background arc** redrawn as a full circle (the old SVG path arc degenerated at TOTAL=180 because start and end angles coincided).
8. **Title** updated from "Rain Clock · 12h" to "Rain Clock · 3h".

The 36-hour Total Precipitation bar chart below is unchanged — it still uses the OM+NWS hybrid for hours 3+ and the v4.56 radar-derived values for hours 0-2.

## v4.56

Rain Clock and Rain Forecast Bars now agree about the next 3 hours.

User reported the bar chart was painting heavy rain Now → 19:00 (NWS QPF) while the rain clock above it only showed a small arc at +3h. Same time window, two different data sources, two different stories. The user asked: first 3 hours should be real radar observations on **both** views, and only +3h onward should use the forecast hybrid (Open-Meteo preferred, NWS as backup).

Implementation:

1. **Rain clock forecast overlay** now skips minutes 0–180 entirely. The 0–3h ring is filled exclusively by radar advection (cells projected to cross the 1.5 mi radius). Forecast data only fills the 3–12h zone. This was already mostly the case, but the v4.55 forecast loop would still write into minutes 0–180 whenever radar wrote nothing — now it doesn't.

2. **Radar-derived per-hour mm/hr** is computed inside `_rainClockProject()` before the forecast overlay runs. Per-minute dBZ values from the radar advection are converted back to mm/hr via inverse Marshall-Palmer (R = (Z/200)^(1/1.6)), then averaged across each hour. Result is stashed on `S._rainClockData.radarHourlyMm` as a 3-element array.

3. **Rain Forecast Bars** read that array and override the first three forecast slots with the radar-derived values whenever radar is ready. Hours 3+ keep the existing hybrid OM+NWS forecast (with NWS still merged per-hour MAX, as v4.54 introduced — the user wants both sources represented for the forecast zone).

Net effect: if the rain clock says "no rain in the next hour," the bar chart's first hour bar will also be zero. If the clock shows a window of moderate rain starting at +90 min, the second hour of the bar chart will reflect that. When radar isn't loaded yet, the bars fall back to the forecast for hours 0-2 — graceful degradation, same pattern as the v4.51 winds-aloft watchdog.

## v4.55

Rain Clock now draws forecast rain that's below the radar-noise threshold.

User reported the Rain Forecast Bars graph was painting the next 6 hours of rain after the v4.54 NWS QPF backup, but the Rain Clock dial above it was completely empty — only a tiny "Now" arc at top. Same data, two different renderings, only one of them showed rain.

Root cause: the rain clock used a single 25 dBZ threshold for everything, originally tuned to keep radar noise off the dial. But the forecast overlay feeds the dial with `_precipMmToDbz(mm)`, and NWS QPF returns its values as 3–6 hour gridpoint totals that get spread across clock hours — peak per-hour values typically land around 0.3–1 mm/hr, which converts to about 15–23 dBZ. Right under the 25 dBZ cutoff. The bar chart shows the values fine (it uses raw mm); the clock silently dropped them.

Two fixes, both in `_rainClockProject()` in `docs/js/weather.js`:

1. **Forecast overlay**: now uses a light-rain floor (`mm >= 0.1`) instead of the dBZ filter, and clamps the dBZ value to a minimum of 15 so even drizzle-class forecast hours get drawn in the dial's lightest color. Radar contributions still use the original 25 dBZ noise filter — only the forecast portion is more permissive.
2. **Window builder**: the "where is rain happening" detector that walks `out.minutes[]` and groups continuous segments into colored arcs also used 25 dBZ as its start threshold. Lowered to 15 dBZ to match the new floor; otherwise anything just written in by fix #1 would still get dropped here.

Net effect: the Rain Clock now paints the same continuous rain windows you see in the bar chart, including light-rain hours. Radar advection still wins for the 0–180 min ring (no fighting between the two sources for the same minute).

## v4.54

NWS gridpoint QPF added as a backup precipitation source for US locations.

After v4.53 fixed the "graph disappears" bug, the user reported the graph was now rendering but reading zero across the next 36 hours in Pensacola despite radar clearly showing inbound storms. Open-Meteo's GFS+HRRR blend was returning 0 mm for every hour — a real model-vs-radar disagreement, not a missing-data bug. User correctly suggested adding NWS as a backup, same pattern as the v4.51 winds-aloft watchdog.

Added `fetchNwsHourlyQpf()` that pulls `quantitativePrecipitation` from `api.weather.gov/gridpoints/{wfo}/{x},{y}`. The endpoint returns multi-hour periods in ISO 8601 notation (e.g. `"2026-05-26T18:00:00+00:00/PT3H"` with a single mm value covering 3 hours); `_parseNwsValidTime()` decodes the period and `_nwsQpfOnce()` spreads the value evenly across clock hours so it lines up with Open-Meteo's hourly grid. Two-try retry pattern mirrors `fetchNWSForecast()`.

Hooked into the existing parallel fan-out in `fetchWeather()` (US-only — NWS coverage), and merged into `omData.hourly.precipitation` via `_mergeNwsQpfIntoOM()`. Strategy: per-hour MAX, same safety-conservative pattern as the GFS+HRRR blend. If OM says 0 mm and NWS says 0.5 mm, the bar reflects 0.5 mm. Logs how many hours got bumped upward so model disagreements are visible in console.

Non-US locations are unchanged (no QPF backup available globally yet). When NWS is down, the bars still render with whatever Open-Meteo returned.

## v4.53

Rain Forecast Bars graph stops vanishing when one Open-Meteo model is missing the precipitation array.

User reported the "Total Precipitation Next 36 hrs" graph was completely missing in Pensacola — not "no rain" empty state, the entire card was gone. Root cause was a precipitation-specific strictness bug in `_blendOMModels()`: every other field (temperature, humidity, wind, pressure, etc.) gracefully falls back to whichever model has the data when one is missing it, but `precipitation` required **both** GFS and HRRR to have the array, otherwise the blended output had no `precipitation` key at all. When the renderer then saw `!h.precipitation`, it set `el.innerHTML=''` and the card disappeared with no indication anything was wrong.

Two fixes:

1. **`_blendOMModels()` in `docs/js/weather.js`**: `hourly.precipitation`, `daily.precipitation_sum`, and `daily.precipitation_probability_max` now mirror the same "both → max, one → use it, neither → skip" fallback pattern that the rest of the fields already use.

2. **`renderRainForecastBars()`**: never blanks the card. Both empty-state code paths (missing precipitation array, zero usable slots after the time-window filter) now always render the card frame with a friendly placeholder message ("⏳ Hourly precipitation forecast not available right now — will appear on the next refresh.") so the user can see the section exists and that it's a data issue, not a missing widget.

No other behavior changed — when both models return precipitation as before, the bars render identically.

## v4.52

AI briefing — every ≥45 dBZ non-inbound cell gets called out individually.

After v4.51 the AI was finally seeing the full unfiltered scan radius, but it still rolled strong non-inbound cells into vague group sentences like "a ring of 20–55 dBZ echoes is drifting NW." The user wanted each strong cell named: "the strongest storm on radar is 25 mi NE of you with a strength of 55 dBZ moving N at 12 mph, poses no risk."

v4.52 adds a dedicated `STRONG NON-INBOUND CELLS` block to the AI prompt context. The block lists every non-inbound cell at ≥45 dBZ (capped at 12 for prompt size), pre-sorted by dBZ descending, with the exact distance, bearing of user, dBZ, motion direction & speed, projected miss, closing speed, and a precomputed threat verdict ("receding — no threat", "tangent track — no impact", "well clear — no threat", or "inbound but hidden by your filter — review filter" for the `_hiddenInbound` edge case from v4.51).

A matching hard rule was added to the prompt: when the `STRONG NON-INBOUND CELLS` block is present, every cell in it MUST be named individually in the "Elsewhere on Radar" subsection in the form *"The strongest cell on radar is a [!dbz:55]55 dBZ[/!] cell 25 mi NE of you, moving N at 12 mph — receding, no threat."* — strongest first, with the `[!dbz:NN]` color tag, and the threat verdict from the block. Weaker cells (<45 dBZ) still get the existing geometry/motion narrative ("a band of 20–35 dBZ cells parked to the SW"); only ≥45 dBZ get individual call-outs.

No changes to the storm classifier, the data path, the deterministic briefing, or any UI rendering — just additional context fed to the AI plus one prompt rule.

## v4.51

AI briefing — non-inbound buckets now bypass the user's storm filter, plus a winds-aloft watchdog.

**The actual fix for "AI keeps missing stuff that's clearly on radar."**

Background: in v4.50 the AI's Active Threats section was already split into two mandatory subsections — Inbound (filtered) and Elsewhere on Radar (situational awareness). But the *data* fed to both subsections was being pulled from the user's filtered storm set, so cells hidden by the user's filter (e.g. "Threats only ✓", "min 31 dBZ") never reached the AI in any bucket. The AI couldn't narrate the big yellow/red blob to the north because the briefing engine was told that blob didn't exist.

v4.51 changes the data path in `gatherBriefingData()`:

- **Inbound bucket** is still built from the filtered set, so the "Inbound (in your impact corridor)" bullets exactly mirror the cards on the Storms tab.
- **Background / passing / moving-away buckets** now walk the **entire unfiltered scan radius** (the full ~80 mi `S.storms` list), minus any cell already surfaced as inbound to avoid double-counting. A new `unfilteredTotal` count is exposed so the prompt can say "X cells after filter / Y total in scan radius."
- If an inbound cell was hidden by the user's filter (e.g. a 28 dBZ cell with the filter set to ≥31), it now appears in the background bucket with a `_hiddenInbound` flag and a NOTE in the STORM DATA line so the AI explicitly knows "N inbound cell(s) hidden by your filter."

The STORM DATA preamble in `ai.js` was updated to mark the buckets as "inbound = post-filter mirror; non-inbound = full unfiltered scan radius" so the model understands the asymmetry.

**Winds-aloft watchdog.** Separate from the AI fix: the user reported winds aloft sometimes fails on a flaky connection and only recovers on app restart. v4.51 adds `scheduleAloftWatchdog()` in `geo.js` that runs every 10 min and re-fetches winds aloft if `S._aloftData` is empty or the wind cache is older than 30 min. Cheap when winds are already loaded (just a presence check); only fires the network call when data is actually stale. Hooked into `scheduleAutoRefresh()` so it runs whenever auto-refresh is scheduled. Travel mode and "no location yet" both skip it.

What this does NOT change: the storm classifier itself, the radar scan, the deterministic system briefing, or any UI rendering. Same set of cells the user sees on the Storms tab; the AI just gets a richer picture of what's around them.

## v4.50

AI briefing — explicit "filtered first, then non-filtered for situational awareness" layout in **Active Threats & Storm Tracking**.

Background: a user report showed the AI confidently narrating two small inbound cells from the south while completely ignoring a wall of 45-55 dBZ cells parked over the N-NE quadrant that the radar sonar made obvious. The cells were in the data — MOVING AWAY and OVERHEAD buckets — but the previous prompt called the non-inbound narration a "Surrounding Picture: wrap-up" of "1-3 sentences," which the model kept collapsing into a single "nothing else of note" sentence even when the buckets were full.

v4.50 restructures the section into two **mandatory subsections** so the model can't compress them away:

1. **Subsection 1 — Inbound (in your impact corridor):** the existing per-cell bullets for DIRECT / NEAR DIRECT / NEAR MISS. These are the *filtered* cells the user sees on the Storms tab.
2. **Subsection 2 — Elsewhere on Radar (situational awareness):** a 1-4-sentence prose block walking through every non-empty non-inbound bucket (MISS / DISTANT / FAR background, PASSING, MOVING AWAY, and OVERHEAD / ARRIVED) by direction, with explicit dBZ when a non-inbound cell is **stronger than the strongest inbound cell**. New label "**Elsewhere on Radar:**" replaces the old "Surrounding Picture:" label so the user has a stable thing to search for.

Hard rules added: never write "no other notable storms" or "nothing else on radar" as a contradiction of the STORM DATA block; if the data shows non-zero counts in any non-inbound bucket those cells exist on the user's screen and MUST be narrated. The "all buckets empty" fallback sentence is preserved verbatim so the model still has a clean exit when the screen really is quiet.

Only the prompt strings in `docs/js/ai.js` changed — no behavior change in the deterministic briefing or the storm classifier. The cell classifier itself (the upstream reason cells may end up in the "moving away" bucket when they're huge and overhead) is a separate, larger problem that this prompt change does not fix; it just guarantees the AI will narrate what it's already given.

## v4.49

Adds the dial ↔ text-view toggle requested after v4.48 shipped.

1. **Tap the dial center to switch to text view.** A transparent click target now sits over the center of the Rain Clock SVG; tapping it (or the new TEXT/DIAL pill in the card header) flips `S._rainClockTextView` and re-renders. The text view is a single card with a one-line headline and a friendly prose body — phrasings like "Rain starts in 5 min · Begins around 12:05, lasts about 30 min, ending around 12:35. Then a second round around 13:15 (~15 min)." or "Raining until 12:30 · Active rain for about 25 min more. Next round starts around 13:45 (~20 min)." The first and (when it exists) second rain windows from `_rainClockProject()` drive both views, so the dial and the text never disagree about what's coming. Tap anywhere on the text card to flip back. State is intentionally session-only — every reload starts on the dial.

2. **Plumbing.** New `_phrases[]` array is built alongside the existing `centerLines[]` inside `renderRainClock()` so both surfaces share one source of truth. New `_fmtDur(min)` helper writes durations as "30 min" / "1 h" / "1 h 15 min". New `_rainClockToggleView()` global function is the click handler. The dial-mode SVG gains one new `<circle>` (r=55, transparent) acting as the tap surface; the text-mode card replaces the SVG block entirely. Both modes still emit the same header (with reorder buttons + sourceTag + new toggle pill), nearest-precipitation sub line, "motion unknown" footer, and tap-arc hint, so nothing else about the card moves around when you flip views.

The AI briefing's "missed the heavy yellow/red blob to the north" issue from the same report is logged as a separate follow-up — the cell-classifier is collapsing those cells into "moving away" with zero counts before they reach the AI prompt, so the fix needs deeper work in the briefing engine, not the Rain Clock.

## v4.48

Three more refinements to the Rain Clock based on the user's annotated screenshot of v4.47:

1. **Forecast arc now wraps the full 12 h.** The v4.47 forecast loop iterated from a `findIndex` anchor with a fixed 14-slot cap, intending to mirror the Rain Forecast Bars below the dial. In practice, when the bar chart and the dial computed their anchors slightly differently (or when Open-Meteo returned a non-monotonic first slot), the dial's loop could exit before reaching slots at +5h..+11h, leaving the arc visually "stopping" around the radar/forecast boundary even though the bar chart clearly showed rain later. v4.48 drops the anchor and the cap entirely and instead walks the whole `h.time` array, bucketing each entry by its computed `mins` offset (`-60 ≤ mins ≤ 720`). Every future hour with rain is now considered, regardless of where Open-Meteo's first slot lands.

2. **Arc moved out to the rim.** The arc band was at `R_ARC=78` inside a 320-px viewBox — deep in the middle of the dial face, where the labels and the center status text crowded it. v4.48 enlarges the dial canvas to 360 px (CX/CY = 180) and moves the arc to `R_ARC=122, R_ARC_W=18`, sitting in the wide strip between the tick ring (`R_TICK_OUT=108`) and the outer rim (`R_OUTER=132`). The arc is now visually the dominant element of the dial.

3. **Hour labels moved outside the dial circle.** Labels were at `R_LABEL=139` (inside the old `R_OUTER=152`), so they overlapped the arc near the top. v4.48 puts them at `R_LABEL=154`, in the new space between `R_OUTER=132` and the 360-px viewBox edge. Nothing on the dial face fights the rain arc for attention anymore. Font sizes nudged up (11 / 10) to fill the extra room. SVG `max-width` bumped from 340 px to 380 px to keep the rendered size visually similar despite the larger viewBox.

The 24-hour clock complaint was already covered by `fmtClock()` honoring `_timeFormat` from `localStorage.st_timeFormat`; if the user was still seeing AM/PM in the screenshot, it was the v4.46 service worker serving stale JS. The v4.48 cache bump (`?v=544`, `stormtracker-v544`) forces a fresh fetch, after which the label times will follow whichever `st_timeFormat` value the user has selected.

## v4.47

Fixes three user-reported issues on the v4.46 Rain Clock:

1. **Combined hour labels.** The old design had two concentric rings of text — "+1h / +2h / …" on the inner ring and "12:24 / 13:24 / …" on the outer ring — which doubled the visual noise and collided with the rain arc near the top of the dial. v4.47 collapses both into a single combined label per hour position, stacked as two short lines inside one `<text>` element: top line is the offset (`Now` / `+1h` / `+2h` / …), bottom line is the dynamic wall-clock time, refreshed every 60 s by `_rainClockStartTick()` via the existing `data-rc-outer` tspan scan. Constants `R_OUTER_LABEL=144` and `R_HOUR_LABEL=98` were replaced with a single `R_LABEL=139` ring positioned just outside the tick marks.

2. **Forecast rain now appears on the dial.** v4.46's `_rainClockProject()` iterated `h.time` from index 0 with `i < 60`, computing `mins = (ts - now) / 60000` for each entry. When Open-Meteo's first hourly slot wasn't aligned with "now" (e.g., starts at today 00:00 and includes past hours), future-hour slots were either skipped by the `mins < -30` filter or computed against the wrong base. v4.47 uses the same `findIndex(t => ts >= now - 30min)` anchor that the Rain Forecast Bars below the dial already use, so what the dial paints and what the bar chart paints now always agree.

3. **Cache bust ?v=542 → 543, SW cache stormtracker-v542 → v543.**

## v4.46

v4.46 overhauls the Weather tab per user feedback: (1) the Rain Clock is redesigned as a 12-hour analog face with **dynamic outer wall-clock labels** at each hour position (each label = `fmtClock(now + i hours)` for i=0..11, repainted every 60s via a `data-rc-outer` text scan so the labels stay current without rebuilding the whole SVG), an inner "Now / +1h / +2h …" ring, and a small "Now" pointer at the top; (2) the clock now spans the next 12 hours instead of 180 minutes by overlaying **radar advection (0-180min) with Open-Meteo hourly precipitation (181-720min)** — `_rainClockProject()` extends the minutes array from 181 → 721 slots and fills the 181+ portion from `S._hourlyData.precipitation` via `_precipMmToDbz` (Marshall-Palmer), with a faint blue background tint on the 0-180 radar zone and a dashed boundary line at the 3-hour position so users can see where radar ends and forecast begins; (3) rain windows are now painted as **per-minute gradient segments** (one tiny colored chord per minute where dBZ ≥ 25, each colored by `dbzHex(minutes[m])`) instead of one flat color per window — so a window that ramps from light → moderate → heavy → light visibly blends Green → Yellow → Orange → Red along the arc, matching the user's "BLUE→YELLOW→GREEN→BLUE break, YELLOW/RED/MAGENTA/GREEN end" mental model; (4) the cone-projection floor is raised from 20 dBZ → **25 dBZ** so only cells producing measurable rain at the user's location are counted; (5) a proper **loading state** — when neither weather data nor radar points have loaded yet, the dial center shows "Loading rain forecast…" instead of the misleading "No rain expected for hours"; (6) the dial center now shows an **estimated rain amount** ("~0.42 in expected") summed from the 12h Open-Meteo precipitation total below the start/end clock time; (7) the source tag in the card header shows `RADAR + FORECAST` / `RADAR` / `FORECAST` based on which providers fed the dial; (8) the Rain Clock and Rain Forecast Bars cards both get **up/down reorder buttons** in their headers — the existing `secBtns` / `getSecOrder` / `moveSection` reorder system now includes `rainclock` and `rainbars` alongside `wind`/`trends`/`forecast`/`hourly`, and `moveSection()` physically reparents the `#rain-clock` and `#rain-forecast-bars` DOM divs (in addition to re-running `renderWeather()`) so swapping their order persists between cards that own their own card wrappers; (9) the **Rain Forecast Bars** chart gets **horizontal gridlines + Y-axis labels** (dashed lines at 25/50/75/100% of peak with mm/in labels right-aligned), gated by a new per-graph toggle button (📊) in the card header that flips `localStorage.st_grid_rainbars` and re-renders — `_graphGridOn(key)` and `toggleGraphGrid(key)` are generic helpers ready for the trend charts to opt in. Built atop v4.45 (Open-Meteo outage survival). Open-Meteo, NWS, and AWC now fan out in parallel (no longer gated by OM serial-first), and the OM fetch itself has an `api.open-meteo.com` → `customer-api.open-meteo.com` sibling-host fallback (mirrors the v4.42 winds-aloft pattern). When BOTH hosts fail but NWS or AWC returned data, the renderer paints a **partial hero** using whatever the other services provided (temp/feels/humidity/dew/pressure/cloud/wind/precip), shows a "⏳ Waiting on Open-Meteo" banner at the top of the hero plus inline chips on the Open-Meteo-only cells (UV, Freezing Level, hourly bars, 36h rain forecast), and a `· ⏳ Open-Meteo` suffix on the source line. A capped background retry (15s → 30s → 60s) attempts OM again in the background; on success the cached omData is mutated in place — `hourly`, `daily`, `_modelBlend`, `_omHost` are set, missing `current.*` fields are filled, `_omPartial` cleared, source suffix stripped — then `renderWeather()` and `refreshRainClock(true)` are called so UV / freeze level / hourly bars / 36h rain bars / 7-day forecast appear without the user touching anything. After 3 background attempts the retry stops and the regular auto-refresh interval picks it up. The `blendSources` filter accepts both `Open-Meteo` and `Open-Meteo (customer-api)` labels so the customer-host path participates in the multi-source blend identically

## v4.44

v4.44 adds an optional Skylink (RapidAPI) aviation-grade winds-aloft provider as a user opt-in upgrade. When the user pastes a RapidAPI key into Settings → ✈️ Skylink, `fetchWindsAloft()` tries Skylink first; on any error (missing key, 401/403, 429 quota, bad shape, timeout) it falls through to the existing free chain (Open-Meteo api → customer-api → NOMADS GFS for US). Skylink returns winds at FAA-standard altitude bands (3k/6k/9k/12k/18k/24k/30k/34k/39k ft); the new `fetchWindsAloftSkylink()` helper converts each band to ISA pressure and snaps to the existing 925/850/700/500 hPa slots `_applyAloftData()` consumers expect, so the radar sonar ALOFT arrow, G1000 panel, briefing, AI prompt, and ILS cone all see the new data without any further changes. Key persists in `localStorage.st_skylinkKey` (paste/save/show-eye/clear, mirrors the OpenAI key pattern, never sent anywhere except RapidAPI). Boot-splash row reads `Winds aloft: 18 mph @ 240° · Skylink` when this path succeeds. Defensive parser accepts multiple plausible JSON shapes (root array, `winds`, `windsAloft`, `data`, `forecast.winds`) and common field-name variants so minor API quirks don't break the upgrade

## v4.43

v4.43 adds a NOAA NOMADS GFS fallback for US locations to the winds-aloft chain. When both Open-Meteo subdomains fail (HTTP 5xx, timeout, network error) AND `isUSLocation(lat,lon)` is true, `fetchWindsAloft()` now calls the new `fetchWindsAloftNOMADS(lat,lon)` helper, which queries NOAA GSL's rucsoundings.noaa.gov for the same NCEP GFS model output that NOMADS distributes — but as plain GSL-format text with CORS=*, so it's browser-fetchable without GRIB2 binary parsing. The parser scans type 4/5/9 (mandatory/significant/surface) rows, extracts wind dir + speed at 1000 / 925 / 850 / 700 / 500 hPa within ±5 mb tolerance, and writes the same `S._aloftData` shape the existing consumers use. A new `_applyAloftData(aloftSpeeds, providerInfo, lat, lon)` helper was extracted so both Open-Meteo and NOMADS providers drive identical downstream logic (`S._windShear`, `S._upperWindDir/Spd`, `S.stormMovement`, `S._windCache`, boot-splash row, path arrows). Cache TTL reuses the existing 30 min / 100 mi rule (NOMADS GFS only updates every 6 h so over-fetching is also wasteful). `S._windCache.provider='nomads-gfs'` (host=null) when this path is used, and the boot splash row reads `Winds aloft: 24 mph @ 220° · NOMADS GFS` so the source is visible. On non-US coordinates the NOMADS fallback is skipped and the existing failure path runs as before

## v4.42

v4.42 adds a sibling-subdomain fallback to the winds-aloft fetcher: when `api.open-meteo.com` returns HTTP 5xx, times out, or fails to reach the network, `fetchWindsAloft()` automatically retries the same query against `customer-api.open-meteo.com` (the Open-Meteo customer subdomain is operationally independent and tends to stay up when the public subdomain is throwing 502s from nginx). Both subdomains are no-key/free, so the upgrade requires no settings change. The successful host is recorded in `S._windCache.provider='open-meteo'` / `S._windCache.host='api'|'customer-api'` and surfaced in the boot-splash row as `Winds aloft: 24 mph @ 220° · Open-Meteo (customer-api)` so the source is visible. Only on a back-to-back failure across both subdomains does the existing failure path run

## v4.41

v4.41 makes the Rain Clock forecast-aware so it stops sitting on `Waiting for radar…` when scan points exist. A new `_nextRainHourFromForecast()` helper scans `S._hourlyData.precipitation` for the first hour ≥0.1 mm in the next 36 h. The dial center text now reads `Possible rain at {clock}` when rain is within 6 h, `No threat of rain / next 3 hours` when rain comes later in the 36 h window, or `No rain expected / for hours` when the window is dry — applied to BOTH the `data.empty` (no scan pts yet) and `data.windows.length===0` (scan ran, nothing inside the 3 h advection cone) branches, so the dial degrades gracefully before AND after a scan. To make sure the dial actually refreshes when radar populates, `_clusterSonarPoints()` in `gauges.js` now calls `refreshRainClock(true)` after writing `S._sonarClusteredPts`, covering every path that publishes new scan points (initial scan, hi-res scan, overhead poll, sonar zoom) in addition to the existing post-scan hooks

## v4.40

v4.40 bundles two Weather-hero upgrades that landed together. First, the Rain Clock arcs are now **tappable** — clicking a colored arc opens an inline detail panel below the dial listing the storm cells responsible for that rain window. Each row shows peak dBZ (color-chip swatch), current distance + bearing from the user (respects the user's mi/km radar unit), ETA range as `+tIn-tOut min` (or "overhead" when t=0), and a `View on radar` button that calls `switchPage('radar')` then `S.map.setView([lat, lng], 10)`. Cells are derived from the same `S._rawScanPts` slice `_rainClockProject()` already uses: each contributing point's `{lat,lng,dbz,dist,bearing,tIn,tOut}` is recorded during the closest-approach pass and then matched to each window where `tIn ≤ endMin && tOut ≥ startMin`. Matched contributors are spatially clustered with a 2.5 mi merge radius (peak dBZ wins for each cluster's display values) and the top 5 by dBZ are attached as `w.cells`. The render side adds `onclick="_rainClockSelectWindow(wi)"` to each arc `<path>`, a small "Tap a colored arc to see which storms cause it" hint when at least one window has cells, and a `<div id="rain-clock-detail">` panel slot. Tapping the same arc twice toggles the panel closed; the `✕` in the panel header also closes it. Selection survives radar refreshes via `S._rainClockSelectedIdx`. Second, v4.40 also adds a 36-hour rain forecast bar chart directly under the Rain Clock on the Weather hero tab, matching the RainAware reference layout (IMG_7613–7615). New `renderRainForecastBars()` in `weather.js` reads `S._hourlyData.precipitation` / `S._hourlyData.time` (already loaded by Open-Meteo), finds the current hour, bars the next 36 hourly slots, colors each bar by intensity (mm/h converted to dBZ via the Marshall-Palmer Z-R relation `dBZ = 10·log10(200·R^1.6)`, then through the existing `dbzHex()` palette so the bars match the Rain Clock's Light→Heavy gradient). X-axis ticks at Now / +6h / +12h / +24h / +36h render in the user's 12h/24h format via `fmtClock()`. Header shows total inches/mm over the window and a "peak X.XX/hr" badge using `fmtPrecip()` for unit consistency. Renders on every weather refresh and on every Rain Clock refresh (so a fresh radar scan re-paints both). Shows a clean "No measurable rain in the next 36 hours" empty state when total < 0.01

## v4.39

v4.39 adds a RainAware-style **Rain Clock** at the very top of the Weather hero — a 280px circular SVG dial showing the next 0–180 min of expected precipitation at the user's location. Tick marks every 3 min (thicker every 15) with minute labels at `Now / 15 / 30 / … / 165`. Rain windows are painted as colored arcs using the existing `dbzHex()` palette (green→yellow→orange→red), with a small Light→Heavy gradient legend inside the dial. Center text summarizes the situation: `Dry for the next 3 hours` when nothing is projected to hit, `Rain starting at {clock time}` when the first window is in the future, or `Rain until {clock time}` when rain is already overhead. A header bar above the dial mirrors the first window as `Rain Start Time:` / `Rain End Time:`, and a sub-line below reads `Nearest Precipitation: {N} mi to the {DIR}`. Clock times honor the user's 12h/24h setting via `fmtClock()`. Projection is **deterministic on-device**: for each scan point in `S._rawScanPts` with dBZ ≥ 20, the new `_rainClockProject()` helper analytically solves the closest-approach time against the user's location using the `S.stormMovement` advection vector (no per-minute brute-force scan), fills a 181-slot intensity array, and collapses contiguous runs into `{startMin, endMin, peakDbz}` windows. Empty / stale states: `Waiting for radar…` when `_rawScanPts` is empty, `Radar stale` when the last scan is >15 min old, and a `Motion unknown — projection limited` footnote when `stormMovement` is missing (only points already over the user are counted in that case). The dial auto-refreshes after every radar scan via `refreshRainClock(true)` hooks added next to each `refreshHeroFromZone()` call-site (view scan, hi-res scan, overhead poll, and the location-aware scan in storms.js), throttled to once per 10 s

## v4.38

v4.38 fixes two confusing things on the Storms-tab cell cards: (1) the "STRENGTH AT YOU" tile no longer reads "0% of peak" on DIRECT-hit drizzle cells — it now shows the expected dBZ at the user with a secondary "% of peak" derived from `estDbzAtUser / storm.dbz`, e.g. a DIRECT hit on a 20 dBZ cell now reads `20 dBZ (100% of peak)` instead of the broken `0% of peak` that came from `impactScore = closeness × intensityFactor` zeroing out for any cell at the 20 dBZ floor. (2) The "PROJECTED MISS" tile is renamed to "Storm X-TRK" and ALWAYS shows distance + bearing — even for DIRECT cells, which previously displayed the standalone text "Direct hit" that conflicted with the format used by NEAR DIRECT / NEAR MISS tiles. DIRECT-overhead cells (perpMissMi=0) render as `0.0 mi` with no bearing suffix. Both changes are display-only in `storms.js buildCard()`; `calcStormETAForBriefing()` (which feeds the AI prompt, system briefing, and storms-tab snapshot) is unchanged so downstream consumers keep the same `impactScore` / `closenessPct` / `estDbzAtUser` semantics

## v4.37

v4.37 appends a wall-clock arrival time alongside every storm ETA so users immediately see when a cell hits without doing the math — `ETA ~28 min (13:18)` in 24h mode or `ETA ~28 min (1:18 PM)` in 12h mode (uses the user's Time Format setting via `fmtClock()`). Applied to the AI's STORM DATA bullets in `getAIChatContext()` (ai.js) and to all three ETA call-sites in the System Briefing (`briefingEngine.js`: DIRECT bullets, NEAR DIRECT bullets, and the Public Safety "Light to moderate rain is approaching" line)

## v4.36

v4.36 makes the "Surrounding Picture" wrap-up a hard, non-skippable output requirement in the AI's `⛈️ Active Threats & Storm Tracking` section: after the per-cell inbound bullets, the model must end with 1–3 narrative sentences painting what else is on radar (background / passing / moving-away groups), or emit the exact "nothing else of note on radar — the inbound cells above are the whole story" line when those buckets are empty. To support this, `getAIChatContext()` now precomputes ready-made `SCENE HINTS` phrasings ("a ring of returns 28-34 mi to the SE, sitting in the background" / "a small cluster 18-22 mi NW, tracking past, outside the impact corridor") that the model can quote or rephrase, and the STORM DATA bucket lines are reworded to drop dismissive "background context, NOT inbound" / "no threat" framing that was previously telling the model to skip them

## v4.35

v4.35 hardens the service worker so it never intercepts non-GET requests or cross-origin requests — this fixes a "FetchEvent.respondWith received an error: Returned response is null" error that was breaking AI chat (the SW was catching the OpenAI POST and falling back to a null cache match). The AI system prompt also adds a `DETAIL vs MENTAL PICTURE` rule: inbound DIRECT/NEAR DIRECT/NEAR MISS cells get per-cell bullets with numbers, while background/passing/moving-away cells are painted as one short narrative sentence per group ("a ring of light returns sits 25-35 mi to the NE, drifting away") instead of a data-dump

## v4.34

v4.34 makes the user's Storms-tab filter (`S._stormFilter`: Min dBZ / Max dist / Approaching only / Threats only / Sort) the single source of truth across all three surfaces. New `getFilteredStorms()` helper in `storms.js` exposes the post-filter snapshot; `gatherBriefingData()` in `briefingEngine.js` now consumes it (so the System Briefing only references cells the user is actually looking at, plus a one-line "Storm filter active: showing N of M cells (X hidden by your filters)" mirror of the Storms-tab badge); and `getAIChatContext()` in `ai.js` replaces its ~155-line raw-storm rebuild with a snapshot consumer that reads `classified.inboundTop / inboundRest / inboundLight / background / passing / away` from the same source and injects an explicit `STORM FILTER` section + system-prompt instruction telling the model never to reference cells outside the filter. Active NWS alerts in the AI prompt now include `areaDesc`, full description (up to 1200 chars), and `instruction` so the AI sees the same wording the Alerts tab renders. `fetchAFD()` now concatenates SYNOPSIS + DISCUSSION + NEAR/SHORT/LONG TERM + AVIATION + MARINE sections from the NWS product (12 KB safety bound, replacing the prior 1500-char cap) so the System Briefing AFD line reflects the full forecaster discussion. The `⛈️ Active Threats & Storm Tracking` inbound bullet selection adds two upgrades in `gatherBriefingData()`: a significance filter (cells <25 dBZ and >5 mi away collapse into one `💧 N light cells (sprinkles / drizzle)` summary line) and a strongest-cell guarantee (top 4 by raw dBZ always present in the bullets so peak cells like 55 dBZ DIRECT at 58 mi aren't starved by hundreds of close 20 dBZ noise pixels sharing miss-band 0). Display order in the bullets still follows the v4.31 miss-distance-band sort. Built atop the v4.30 deterministic on-device HTML Weather Briefing engine (docs/js/briefingEngine.js) with Settings → Briefing Mode toggle (System default vs AI).

