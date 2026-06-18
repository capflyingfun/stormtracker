// StormTracker — Tutorial, Changelog, Settings Panel
const TUTORIAL_SECTIONS=[
  {title:'🏠 Getting Started',text:'StormTracker detects storms around your location using live radar data. On first launch, allow GPS access or search for your location using the 🗺️ button in the header. The app scans for precipitation within an 80-mile radius and shows results across five tabs. All settings — units, gauge style, time format, AI, alerts, and more — are accessible via the ⚙️ gear icon in the header.'},
  {title:'🌤️ Weather Tab',text:'Your main dashboard. Shows current conditions (temperature, wind, humidity, pressure), a <b>wind gauge</b> with real-time animated direction, and a <b>Radar Sonar</b> mini-map.<br><br><b>New in v2.84:</b> The hero section now includes <b>Fog Risk</b> (multi-factor assessment: spread + wind + time of day + cloud cover), <b>Atmospheric Stability</b> (Stable / Cond. Unstable / Unstable based on FAA weather theory), <b>estimated cloud base</b> (spread × 400ft), and <b>temperature inversion detection</b> warnings. All values respect your Imperial/Metric unit settings.<br><br><b>Wind Gauge:</b> Choose from 5 switchable styles in Settings — <b>Neon</b> (default animated ring), <b>Marine</b> (nautical compass with LED digits), <b>Minimal</b> (clean arc with arrow), <b>G1000</b> (Garmin-style 3-panel with compass rose, speed tape, and pressure tape), and <b>Speedometer</b> (classic dial with sweeping needle). The G1000 also supports <b>Gyro Compass</b> mode — point your phone at a storm and the compass rotates with you.<br><br><b>Radar Sonar:</b> A bird\'s-eye view showing storm cells as colored blips and arrows for approaching storms. Use <b>+/−</b> buttons to zoom between 15 and 80 miles. Tap the ⚙️ gear on the sonar to customize sweep speed, fade duration, dot opacity, glow intensity, grid brightness, dBZ floor, and overlay toggles. Tap "Open Radar →" to jump to the full map.'},
  {title:'📡 Radar Tab',text:'The full interactive map. Storm cells appear as colored arrows showing movement direction. A <b>cyan crosshair</b> marks the exact map center for precise targeting. The sidebar buttons control different layers:<br>• <b>📍</b> — Return to Home location (auto-saved from your first GPS/search)<br>• <b>🔍</b> — Scan Here: grabs current map center as new scan location<br>• <b>🔦</b> — HD Scan: opens target picker (Home / Current Location / Map Center) for 15-mile high-res analysis at zoom 12<br>• <b>NEX/SRC</b> — Switch between NEXRAD (US) and RainViewer (global) radar<br>• <b>MI</b> — Toggle miles/kilometers<br>• <b>✈️</b> — Show nearby airports<br>• <b>▶️</b> — Animate radar over time<br>• <b>ZN</b> — Toggle color-coded storm zones<br>• <b>➤</b> — Toggle the ILS approach cone (dynamic length — extends 10mi past the farthest inbound storm)<br>• <b>12▶/PT</b> — Cycle storm points: off → top 12 inbound → all<br>• <b>RDR</b> — Toggle radar overlay tiles<br>• <b>🕳️</b> — Clutter toggle (appears when ≤12 returns below 22 dBZ or ≤8 below 31 dBZ are detected as likely false radar echoes). Tap to show/hide these minor returns.<br><br><b>HD Scan System:</b> After each regular scan, the app checks for nearby storms and offers tiered high-resolution scans — <b>15mi</b> (asks), <b>10mi</b> (asks), and <b>5mi</b> (auto-triggers after 5 seconds when storms are very close). HD scans sync the sonar zoom to 15mi for maximum detail.'},
  {title:'➤ ILS Approach Cone',text:'The animated cone on the radar shows where storms are heading relative to you. It\'s inspired by an airport ILS (Instrument Landing System) — a cone of dots extends from the storm source through your location. <b>White dots</b> = no storms approaching. <b>Colored dots</b> = intensity-matched to approaching storm dBZ levels. The cone is always on once wind data is received.'},
  {title:'🌩️ Storms Tab',text:'Lists all detected storm cells with details: peak dBZ, rain rate, distance, bearing, movement (direction with degrees), and ETA. Storms are grouped into <b>Approaching</b> (heading toward you) and <b>Nearby</b> (in the area but not on track). Each card shows a live countdown timer for approaching storms.<br><br><b>Storm Feedback:</b> When a countdown reaches zero, the app automatically re-checks storm data and asks "Did this storm affect your area?" with Yes/No/Unsure buttons. Your feedback helps track prediction accuracy over time.'},
  {title:'⚡ Lightning Indicators',text:'Storm cells with radar reflectivity ≥40 dBZ display a ⚡ lightning indicator. The strike count scales with intensity — stronger storms show more estimated strikes. Lightning markers appear on all three views (map, sonar, and 3D). You can toggle lightning display on or off.<br><br><i>Note: These are radar-derived estimates, not observed lightning strikes.</i>'},
  {title:'✈️ Station Tab',text:'A full aviation weather station (PWS console). Shows METAR data from nearby airports — wind, temperature, pressure, visibility, cloud layers, and more. <b>Weather descriptions are derived directly from the METAR</b> — the station tab independently parses raw METAR wx codes (e.g., -RA = Light Rain, +TSRA = Heavy Thunderstorm Rain) rather than relying on third-party text descriptions, so it always reflects what the station is actually reporting.<br><br><b>New in v2.84 — FAA Weather Theory:</b><br>• <b>Flight Category Badge</b> — VFR/MVFR/IFR/LIFR with the determining factor (ceiling-limited or visibility-limited) shown in your units<br>• <b>Density Altitude</b> — color-coded from green (low) to red (high performance impact), calculated from station elevation, altimeter, and temperature<br>• <b>Pressure Altitude</b> — shown alongside density altitude in the METAR decode<br>• <b>Cloud Base</b> — METAR ceiling shown as primary value with spread × 400ft estimate as secondary, adjusted for user-station elevation difference<br>• <b>Fog Risk &amp; Inversion</b> — fog risk panel and inversion warning displayed when conditions match<br><br><b>Tappable Unit Cycling:</b> Tap any value to switch units:<br>• Temperature: °F / °C<br>• Wind: mph / kts / km/h / m/s / Beaufort<br>• Pressure: inHg / mb / mmHg / kPa<br>• Visibility: mi / km / m / NM<br>• Precipitation: in / mm / cm<br>Dual units always shown (primary + secondary).<br><br>Features 24-hour trend charts (temperature, pressure, wind, visibility), wind direction history, condition timeline, METAR decoder with color-coded severity, and multi-station TAF forecasts. Use the station selector to search by ICAO code and save favorites.'},
  {title:'⚠️ Alerts Tab',text:'Shows active NWS weather alerts for your area — watches, warnings, and advisories. Alerts are color-coded by severity and sorted chronologically. For non-English languages, alerts are automatically translated via AI.'},
  {title:'🧭 Travel Mode',text:'Tap the 🧭 compass icon in the header to activate. Your GPS position is tracked live, and weather/radar data refreshes automatically as you move. Choose refresh intervals from 5 minutes to 1 hour. The travel indicator bar shows your speed, GPS accuracy, and next refresh. Great for road trips or outdoor activities.'},
  {title:'📢 Threat Ticker',text:'The scrolling bar below the header shows real-time status:<br>• <b>Green</b> — All clear, no storms detected<br>• <b>Blue</b> — Storms nearby but not heading your way<br>• <b>Light blue</b> — Light rain approaching with ETA<br>• <b>Yellow/Orange/Red</b> — Severe storms approaching with NWS-style warnings and countdowns<br><br>The ticker rotates through 25+ contextual messages including live weather data, radar status, station info, educational tips, and fun weather facts.'},
  {title:'🌐 Language & Units',text:'Tap the flag icon 🇺🇸 in the header to switch between 20 languages. The app auto-detects your browser language on first visit.<br><br><b>Units:</b> Open Settings ⚙️ to choose Imperial, Metric, or Auto (switches automatically based on your location). Custom mode lets you mix and match individual unit preferences for temperature, wind, pressure, visibility, and precipitation.<br><br><b>Time Format:</b> Choose Auto (follows your system), 12-hour, or 24-hour format in Settings. All times throughout the app — radar timestamps, storm ETAs, sunrise/sunset, forecast hours, station observations — respect your choice.'},
  {title:'🤖 AI Weather Assistant',text:'Add your OpenAI API key in Settings to unlock the AI assistant. Tap the purple 🤖 button (bottom-right) to open the chat.<br>• Ask about current conditions, storms, forecasts, or safety<br>• The AI has access to all your live weather data: storms, ETAs, alerts, METAR, forecasts, terrain analysis, and cell tracking<br>• Choose tone (Professional/Friendly/Humorous) and detail level in Settings<br>• Quick question buttons for fast answers<br>• Your API key is stored on your device only — never shared with anyone except OpenAI'},
  {title:'⚙️ Settings Panel',text:'The unified Settings panel (gear icon in header) gives you control over everything:<br>• <b>Units</b> — Imperial/Metric/Auto/Custom with individual dropdowns<br>• <b>Time Format</b> — Auto/12h/24h<br>• <b>Wind Gauge Style</b> — Neon, Marine, Minimal, G1000, Speedometer<br>• <b>Compass Mode</b> — Enable gyro compass for G1000 gauge<br>• <b>Auto Refresh</b> — Set idle refresh interval (15m to 6h)<br>• <b>Travel Mode</b> — Configure GPS refresh interval<br>• <b>AI Assistant</b> — API key, tone, detail level<br>• <b>Tutorial & What\'s New</b> — Access this guide or the changelog anytime'},
  {title:'🗺️ 2.5D Storm View',text:'Tap the <b>3D</b> button on the radar map sidebar to open the 2.5D isometric storm view. Storms appear as weather emojis floating at different heights based on intensity:<br>• ☁️ Light (15-30 dBZ) — low, small<br>• 🌧️ Moderate (31-45 dBZ) — medium height, rain streaks<br>• ⛈️ Heavy (46-55 dBZ) — tall with dark shadows<br>• 🌩️ Severe (56+ dBZ) — tallest with red glow<br>• ⚡ Lightning on cells ≥40 dBZ<br><br>Approaching storms bob gently to draw attention. Concentric distance rings show range, and a north arrow provides orientation. <b>Drag</b> to rotate the view, <b>pinch</b> to zoom, and <b>tap</b> any storm emoji for details (dBZ, distance, direction, ETA).'},
  {title:'💡 Tips',text:'• Storm intensity is measured in <b>dBZ</b> (decibels of reflectivity). Higher = stronger: 15-30 light rain, 30-45 moderate, 45-55 heavy, 55+ severe/hail.<br>• The <b>Impact %</b> shown on storms estimates the likelihood of affecting your exact location. NWS warning polygons and terrain effects are factored in.<br>• Scan circle on the radar shows your current detection range.<br>• The sonar mini-map on the Weather tab updates with every scan — use the +/− buttons to zoom in for detail or out for a wider view.<br>• Use the <b>sonar settings gear</b> to customize the sweep animation, dot glow, grid brightness, and more.<br>• The ⚡ lightning icon on storm cells indicates radar-derived lightning potential (≥40 dBZ).<br>• Install StormTracker as a <b>standalone app</b> on your phone — tap "Add to Home Screen" in your browser menu for the best experience.'}
];
const CHANGELOG=[
  {ver:'v5.06',date:'2026-06-18',items:['🎚️ <b>Background Storm Alerts</b> now uses a simple slide toggle — tap to flip it left (off) or right (on). No more separate “Turn on / Update / Turn off” buttons. If your location moves, a small “Update” button appears so the watch follows you.','⏱️ If turning it on ever locks up, the app gives it a steady 30 seconds (with one automatic retry) before refreshing so you can try again.']},
  {ver:'v5.05',date:'2026-06-18',items:['🔧 Fixed <b>“Could not enable alerts: Fetch is aborted”</b> when turning on Background Storm Alerts. The app was giving up on the connection too quickly (10 seconds), which could fail on a weak cell signal. It now waits longer and automatically retries once, so enabling alerts works reliably on mobile data. If it still can\'t connect, you\'ll get a clearer message suggesting Wi-Fi.']},
  {ver:'v5.04',date:'2026-06-18',items:['🔧 Fixed the <b>Background Storm Alerts</b> panel sometimes showing up blank — no on/off toggle, no manage code. The part of the app that draws that panel wasn\'t being saved for offline use, so on a weak signal it could fail to load and leave the section empty. It\'s now bundled with everything else, so it always appears. If yours looks blank: fully close and reopen the app once to update.']},
  {ver:'v5.03',date:'2026-06-18',items:['⏱️ Background scans now run on a steady, predictable schedule — every 5 minutes — instead of the random 5–60 minute spacing used before. That means a fast-developing storm is caught within ~5 minutes (the fastest the schedule allows), with no long random gaps. Scans still end quietly when nothing meets your alert settings, and repeat alerts for the same storm are still spaced out so you don\'t get buzzed every few minutes.']},
  {ver:'v4.99',date:'2026-06-18',items:['🕐 Push notifications now read more clearly: storm alerts show the arrival clock time next to the ETA (e.g. <b>ETA 8 min (08:09 AM)</b>) and spell out distance as <b>“4.7 mi away”</b>.','🌪️ NWS watches &amp; warnings in push notifications now show when they\'re in effect (e.g. <b>“In effect until Thu 7:12 PM”</b>).','🧹 Tidied up old/duplicate notification subscriptions so you only get one push per device. If you ever get duplicates, toggle Background Alerts off and on once.']},
  {ver:'v4.98',date:'2026-06-18',items:['🔧 Fixed the Background Storm Alerts toggle not updating on screen the moment you tap <b>Turn on</b> — it now flips to ON instantly instead of only after you reopen the app. (The alert was actually being set up correctly; the screen just wasn\'t refreshing.)']},
  {ver:'v4.97',date:'2026-06-18',items:['🔧 Fixed the Background Storm Alerts toggle getting stuck after the v4.96 key update — tapping <b>Turn on</b> now reliably re-registers your device with the current key (it detects and clears an out-of-date subscription automatically). If yours was stuck: force-quit the app, reopen, then tap Turn on.']},
  {ver:'v4.96',date:'2026-06-18',items:['🔔 Fixed background push notifications not arriving on iPhone/iPad (Apple was rejecting every alert because of a security-key mismatch). The notification keys have been rotated and aligned. <b>Action needed:</b> if you use Background Storm Alerts, open Settings → Background Storm Alerts and tap <b>Disable</b> then <b>Enable</b> once to re-register your device.']},
  {ver:'v4.95',date:'2026-06-18',items:['🌀 Background alerts are now bundled into ONE digest notification per scan (~30 min) that lists every active alert at once, instead of separate pushes per type — no more buzz storms. Added <b>Tropical systems</b> coverage: a hurricane or tropical storm now pushes the moment it comes within your tracking radius or your location enters its forecast cone, ahead of any local NWS watch. Toggle it in the Background Alerts panel (on by default).']},
  {ver:'v4.94',date:'2026-06-18',items:['🌎 Background alerts now push EVERYTHING, not just storm cells — a full location scan runs server-side every ~30 min and sends NWS warnings (hurricane, tornado, severe, flood, fire) plus your weather threshold alerts (wind, gusts, temp, pressure, rain, humidity, visibility), even with the app closed. Toggle NWS warnings in the Background Alerts panel; the weather alerts follow your Alerts-tab on/off settings.']},
  {ver:'v4.93',date:'2026-06-17',items:['🔔 Clearer Background Storm Alerts toggle — a green "ON" / grey "OFF" status dot now shows at a glance whether alerts are active, and the watched location is named right in the panel. Note: alerts watch your single Home location captured when you turn them on — tap Update after you move.']},
  {ver:'v4.92',date:'2026-06-17',items:['🛠️ Fixed "Could not enable alerts: Not found" — Background Storm Alerts now always talk to the dedicated alert server instead of accidentally reusing an old saved sync address. Just update and turn alerts on.']},
  {ver:'v4.91',date:'2026-06-17',items:['✅ Background Storm Alerts now work out of the box — the storm-scanning server is live and built right into the app, so you no longer have to paste in a sync URL to turn alerts on. If you saw "Could not enable alerts: Not found," just update and try again.']},
  {ver:'v4.90',date:'2026-06-17',items:['📡 Background Storm Alerts — opt in (Settings → Background Storm Alerts) to get a push notification when a storm is heading your way, even with StormTracker fully closed. A server scans radar around your saved location every ~30 minutes using the same detection engine as the live map (real dBZ, winds-aloft steering, impact & ETA) and only notifies you when an inbound cell matches your strength / impact / radius thresholds. Includes a shareable manage code and one-tap disable. Requires the companion Cloudflare Worker + GitHub Actions scanner to be set up once (see the setup runbook).']},
  {ver:'v5.02',date:'2026-06-18',items:['⚡ Faster storm scans — background alerts are now checked every ~10 minutes instead of ~30, so a storm that pops up quickly is caught while there\'s still time to react, rather than possibly waiting most of an hour. Each scan still ends quietly if nothing meets your alert settings, and repeat alerts for the same storm are still spaced out so you don\'t get buzzed every few minutes.']},
  {ver:'v5.01',date:'2026-06-18',items:['⏳ Clearer notification updates — turning Background Storm Alerts on, off, or tapping Update now shows a "Updating your notification settings, please wait…" screen with a live seconds counter, so you know it\'s working. If something stalls, it safely clears and refreshes after 30 seconds.','⚡ Tidier lightning wording — when a storm\'s ETA already shows it\'s arriving soon, the alert no longer repeats "within 15 min." That phrase now only appears when it adds new info (several imminent cells, or a faster cell sneaking up behind a slower one), and the safety advice escalates to "Move indoors now" the moment anything is imminent.']},
  {ver:'v5.00',date:'2026-06-18',items:['⚡ Lightning ⚡ in background alerts — when a strong storm (≥45 dBZ) is heading your way, push notifications now estimate lightning by direction and distance, e.g. "Lightning ⚡ estimated to the southwest around 12 mi in a strong storm (52 dBZ) · ETA ~24 min." Any strikes likely within 15 minutes are flagged as the urgent set, while all strong cells in your corridor out to 80 mi are counted for context. These are radar-derived estimates, not observed strikes.','🧭 Smart corridor scan — lightning is measured along your impact corridor (approaching cells in the cone), so it can warn you about a strong cell bearing down even before it trips your normal storm-alert thresholds.','🚨 Bottom-line summary on multi-alert pushes — when several alerts fire at once, the notification now opens with a one-line "Bottom line" telling you what to do (e.g. "severe weather active near you — take protective action") before the full list.']},
  {ver:'v4.89',date:'2026-06-16',items:['🎨 AI briefing dBZ ranges now show the right color — when the AI mentioned a range like "35–55 dBZ", the colored text was tinted by the LOW number (35, green), making a range that tops out at a heavy/strong core look light. Ranges are now colored by the STRONGEST end, so "35–55 dBZ" shows red — matching the storm intensity it actually describes.','🗣️ Plain-language storm intensity in briefings — the AI now pairs every dBZ value or range with an everyday intensity word (moderate / heavy / very heavy / heavy core / severe / extreme) so you don\'t need to know the dBZ scale to understand how strong a storm is. The calibration guardrail is kept — a 55 dBZ core is described as a strong/heavy core, not automatically "severe".']},
  {ver:'v4.88',date:'2026-06-16',items:['🌀 Tropical storm alerts now tell you which way the storm is — the proximity banner and pop-up alert for an approaching hurricane/tropical system used to say only "656 mi away," with no sense of direction. They now include a compass bearing (e.g. "656 mi to the SE — Tracking") so you instantly know where the system sits relative to you. Wording inside the forecast cone is unchanged.','🌧️ Rain Clock reverted to card-driven dial — the v4.87 "reverse-cone coverage fill" (which swept extra raw radar returns onto the dial to paint broad rain shields as one continuous arc) is removed. The dial is once again built purely from the inbound storm cards, so the painted arc matches the storm cards exactly. The inbound count, tap-details, header pill, and forecast fallback are all unchanged.']},
  {ver:'v4.87',date:'2026-06-16',items:['🌧️ Rain Clock now fills in continuously for broad rain — when a wide, continuous band of rain is moving toward you, the dial used to show only a few separate colored chunks (one per inbound storm cell) with dark empty gaps between them, even though it was really raining the whole time. The clock now sweeps a cone reaching upwind from your location and catches every bit of rain (down to light/drizzle) that will pass over you, so the arc paints as one continuous stretch from now through when the back edge of the rain finally clears. If the rain band reaches farther out than the closest storms, the dial automatically zooms out so you can see how long it lasts. The inbound storm count, the tappable storm details, and every other surface are unchanged — only the painted dial arc fills in more completely.']},
  {ver:'v4.86',date:'2026-06-16',items:['✂️ Cleaner inbound storm wording — inside the inbound part of a briefing, every cell is heading your way by definition, so repeating the "DIRECT / NEAR DIRECT / NEAR MISS" label on each line was redundant and made the sentences read awkwardly. Those labels are now dropped from the inbound section; the color dot (🔴🟠🟡) stays so it still matches the storm cards. Cells elsewhere on radar can still note whether they are passing or moving away.']},
  {ver:'v4.85',date:'2026-06-16',items:['📋 Storm briefings now summarize instead of listing every cell — the AI Briefing and System Briefing used to print one line for each inbound storm cell (and call out every strong cell elsewhere on radar), which got long and repeated what the Storms tab already shows. Both briefings now describe the inbound rain as a short summary that highlights just the two cells that matter — the SOONEST to arrive and the STRONGEST at your location — and point you to the Storms tab for the full per-cell list. Storms elsewhere on radar are summarized by direction rather than named one by one. The briefing is shorter, clearer, and no longer gets cut off before the Aviation section.']},
  {ver:'v4.84',date:'2026-06-16',items:['🤖 Smarter AI briefing wording for big rain events — when a whole line or broad area of rain is moving in, the radar breaks it into dozens or even hundreds of individual "cells." The AI briefing used to repeat that raw count (e.g. "130+ inbound cells"), which read like 100+ separate storms were bearing down on you. The AI now describes it as what it really is — one continuous band of rain bringing repeated rounds over the next hour — and only calls out the strongest cores individually, so the briefing is far less alarming and easier to act on.']},
  {ver:'v4.83',date:'2026-06-15',items:['🧹 Cleaner radar map — the 💧 rain-coverage badges that used to sit on every storm-track cone are gone from the map. When you were inside several overlapping cones they stacked into an unreadable pile right over your location. That same info (rain returns inside the storm\'s projected path + strongest dBZ) now shows as a "💧 In path" line on each storm\'s card in the Storms tab, where it\'s actually readable. The cone path shading on the map is unchanged.']},
  {ver:'v4.82',date:'2026-06-15',items:['🌪️ Rotation now means a real Tornado Warning. The radar/sonar "Rotation" marker no longer fires off a radar-shape guess (hook echo), which often flagged rotation when no tornado existed. It now appears ONLY when an active NWS Tornado Warning covers the area, and the 🌪️ marker is anchored to the strongest radar cell inside the warning polygon (preferring the cell nearest the warning\'s storm-motion point when available). Labels updated to "Tornado Warning — Rotation". US-only, since NWS warnings don\'t exist elsewhere.']},
  {ver:'v4.81',date:'2026-06-15',items:['🌦️ Rain Clock Forecast — only meaningful rain now shows. The forecast dial (used when no storms are on radar) now hides light drizzle and only plots light-moderate rain and heavier (~28 dBZ / ~0.08 in/hr and up), so it no longer reads "raining for hours" when it really would not be. Real rain still shows, tagged FORECAST.']},
  {ver:'v4.80',date:'2026-06-15',items:['☔ Rain Forecast on the Rain Clock — when no storms are inbound on radar, the Rain Clock now falls back to the hourly rain forecast instead of showing an empty dial. Forecast rain amounts are converted to dBZ and plotted as windows with real durations, just like detected storms, and the dial is clearly tagged FORECAST so you know it is expected (not live-radar) rain.']},
  {ver:'v4.79',date:'2026-06-15',items:['🔄 Auto Update Check on Launch — the app now checks for a newer build automatically every time it starts, before loading weather, and refreshes itself to the latest version if one is available','🏷️ Version Label Fix — the version shown in the header and the "Check for update" button now reflects the actual deployed build (was stuck at v4.76)','💧 Storm Track Rain Coverage — each storm track cone shows a 💧 badge with the count of rain returns inside its projected path and the strongest dBZ']},
  {ver:'v3.48',date:'2026-03-29',items:['🔤 Desktop text scaled up ~38% for readability on 1920×1080','📡 Radar sonar shrunk 40% on desktop','💨 Wind gauge 175% bigger (700px max)','🗺️ Map control buttons 200% bigger (64px)','📊 7-day forecast items larger with bigger icons and text','🖥️ Desktop single-page mode with scroll spy']},
  {ver:'v3.44',date:'2026-03-29',items:['🖥️ Desktop Full-Width Layout — content now fills the entire screen on 1920×1080 and wider displays (was: capped at 1360px centered, leaving large blank margins). Container spans full available width after sidebar.','⚙️ Settings Panel Desktop — settings overlay card now uses 88% of viewport width (up to 1040px) with a 2-column layout for settings sections, making it much easier to navigate on large screens.']},
  {ver:'v3.43',date:'2026-03-29',items:['📍 Auto GPS on first launch — app now automatically prompts for location permission on first visit (fires once, falls back to welcome screen buttons if denied). Return visits with a saved location already loaded automatically.','🐛 Loading screen now correctly dismisses on fetch error (was hanging 15s)']},
  {ver:'v3.42',date:'2026-03-29',items:['🐛 Desktop layout fixes — tab switching now works correctly (was: Weather tab stayed permanently visible due to CSS ID selector overriding display:none); mini radar sonar capped at 700px width so it no longer fills the entire screen on desktop']},
  {ver:'v3.41',date:'2026-03-29',items:['🖥️ Desktop Responsive Layout — side navigation bar replaces bottom nav on screens ≥1024px; content expands to full available width; Weather page shows 2-column section grid; hero stats show up to 6 columns. Tablet (768px+) also widens layout.','⏳ Loading Screen — animated radar-ring splash screen appears while weather data loads after setting a location; auto-hides when first render completes; 15s safety timeout']},
  {ver:'v3.40',date:'2026-03-29',items:['🌦️ GFS+HRRR Multi-Model Blend — Weather forecasts now average two models: GFS (global, NWS-standard baseline) and HRRR (3km high-res CONUS, hourly updates). Precipitation uses the higher of the two models for a more conservative/safe estimate. Source label shows [GFS+HRRR] when both available. Falls back gracefully to GFS-only outside US.']},
  {ver:'v3.39',date:'2026-03-29',items:['☀️ UV Index + ❄️ Freeze Level — Weather tab now shows current UV index (color-coded Low→Extreme) and freezing level altitude (ice/snow line) from Open-Meteo hourly forecast','🌧️ Rain Alert — Rain alert system now fully functional: detects precipitation vs. sensitivity threshold (light/moderate/heavy), respects cooldown timer, sends browser notification and toast','🐛 Bug Fixes — null guard on storm distance display, added error handling for SPC/NHC data fetches, cleaned up unused Open-Meteo API fields (rain, showers, snowfall, surface_pressure)']},
  {ver:'v3.38',date:'2026-03-29',items:['⤴⤵ Cloud Base 3-Hour Trend — Est. base arrow now shows forecast spread trend for next 3 hours: green ⤴ (spread widening = base rising = improving), red ⤵ (spread narrowing = base lowering = deteriorating), gray → (steady). Uses forecast data only — no METAR conflict.','🔄 Smart Version Check — Settings refresh shows ✅ Up to date or 🆕 vXXX → vYYY comparison before updating']},
  {ver:'v3.06',date:'2026-03-29',items:['☁️ Cloud Base Altitude Calibration — METAR-reported ceiling (BKN/OVC/VV) now shown as primary cloud base value, spread×400 estimate shown as secondary','📍 GPS Altitude Capture — device GPS altitude stored for elevation calculations when available','🏔️ Observer Elevation Priority — uses GPS altitude → topographic elevation → station field elevation → 0 for accurate AGL calculations','📐 Elevation-Adjusted Cloud Base — cloud base heights adjusted for elevation difference between user position and reporting station']},
  {ver:'v2.84',date:'2026-03-28',items:['🌡️ FAA Weather Theory Pack — 8 new aviation-derived features from PHAK Chapter 12','📐 Corrected Dew Point Spread Thresholds — 0–2°C fog/mist, 2–4°C high humidity, 4–8°C moderate, 8°C+ dry air (replaces old inaccurate bands)','☁️ Estimated Cloud Base — spread × 400ft formula shows estimated cloud base AGL on Weather hero and METAR decode','🏔️ Density Altitude — calculated from station elevation, altimeter, and temperature with color-coded severity (green/yellow/orange/red)','✈️ Pressure Altitude — (29.92 − altimeter) × 1000 + field elevation shown alongside density altitude','🎯 Enhanced Flight Category — VFR/MVFR/IFR/LIFR badge now shows determining factor (ceiling-limited vs visibility-limited) in user\'s units','🌫️ Fog Risk Assessment — multi-factor indicator using spread, wind speed, time of day, and cloud cover with radiation/advection fog type identification','🌡️ Atmospheric Stability — rates Stable/Cond. Unstable/Unstable based on temperature, humidity, and spread','⚠️ Temperature Inversion Detection — flags possible surface inversions when spread≈0 + calm + clear + night','📏 Unit-Aware Display — all new values (altitude, spread, cloud base, visibility thresholds) respect your Imperial/Metric unit settings']},
  {ver:'v2.68',date:'2026-03-27',items:['📅 7-Day Forecast Day Labels Fix — "Today" label now compares each forecast date against your actual local date, so it\'s correct regardless of timezone','📡 Station Weather Independence — station tab now derives weather descriptions directly from METAR wx codes (e.g., -RA = Light Rain) instead of trusting NWS text descriptions','🐛 METAR Validation Fix — empty raw METAR no longer bypasses weather string validation, preventing incorrect precipitation labels']},
  {ver:'v2.53',date:'2026-03-27',items:['📦 Smart Alert Condensing — multiple same-scan storm cell alerts are batched into one summary toast showing count, direction, heading, speed, strongest dBZ, and nearest ETA','📏 Live Distance Countdown — alert history rows now show a live-updating distance to each approaching storm cell','🕐 NWS Hour-Only Times — time formats like "11 PM EDT" (no minutes) are now correctly parsed and reformatted']},
  {ver:'v2.52',date:'2026-03-27',items:['🧠 Threat-Priority Sorting — storm cell alerts now sort by threat score (dBZ×2 + impact×1.5 − distance×0.5) instead of chronologically','⏱ Group ETA — grouped storm cell batches show nearest ETA countdown on the header row','⏱ Per-Cell ETA — expanded cells in grouped rows show individual live ETA countdowns','🎯 Ticker Threat Sort — severe storm ticker now prioritizes strongest/highest-impact storms over nearest','🔄 Location Reset — changing location clears stale storm/weather alert history, cooldowns, and SPC reports','🕐 NWS Time Reformat — alert descriptions convert NWS timezone times (e.g. 430 PM CDT) to your local format respecting 12h/24h preference']},
  {ver:'v2.58',date:'2026-03-27',items:['🌩️ Improved storm cell alert direction and location accuracy','📍 Storm alert click-to-map now uses most recent alert position','🔧 Sync & Alerts section hidden — planned for future redesign','🧹 Removed SMS/texting features — email-only alerts']},
  {ver:'v2.51',date:'2026-03-27',items:['🧊 SPC Hail Size Fix — hail reports now display correctly as inches (e.g., 1.00") instead of raw hundredths value','🕐 Storm Cell Timestamps — expanded individual cells in grouped alerts now show per-cell timestamps']},
  {ver:'v2.50',date:'2026-03-27',items:['📦 Alert Consolidation — storm cell alerts grouped by scan batch (±5s) into collapsible rows showing cell count, dBZ range, distance range, and peak impact','📍 Alert → Radar Navigation — tap 📍 on any storm alert to fly to its location on the radar map with a pulsing highlight ring','🗺️ Storm Card → Radar — "📍 Map" button on each storm card switches to radar and highlights the cell with approach cone','🔗 Cross-Navigation — seamless jumping between Alerts ↔ Radar ↔ Storms tabs']},
  {ver:'v2.49',date:'2026-03-27',items:['⏱ Tier Summary Live Countdown — 🔵🟡🔴 ETA lines now count down every second in real-time','⚡ Sonar Lightning Clustering — nearby ⚡ icons merged into single ⚡ with count badge (e.g. ⚡3)','🌩️ Storm Alert ETA — storm cell alerts now include ETA countdown and arrival time','📍 Alert ETA respects 12h/24h time format setting']},
  {ver:'v2.47',date:'2026-03-27',items:['📈 Wind Trend Arrow — forecast-based ↑↓→ arrow next to speed on all gauge styles (green=rising, red=declining, grey=steady)','⚙️ Sim Speed Setting — choose target pick interval (5s-30s) for lively or calm gauge needle','💨 Configurable Gust Window — 30s/1m/2m/5m rolling peak window with time label','📊 Configurable Avg Window — 10s/30s/1m/2m rolling average with time label','🏷️ Window Labels — gust and avg displays now show their timeframe (e.g. G13.0 (1m))']},
  {ver:'v2.46',date:'2026-03-27',items:['🔮 Forecast-Aware Wind Bias — sim uses hourly forecast trend to shift target distribution','📉 Declining Winds — when forecast shows lower winds, gauge naturally drifts lower','📈 Rising Winds — when forecast shows higher winds, gauge favors higher targets','⚖️ Trend Blending — 30% blend factor keeps forecast influence subtle, not overpowering']},
  {ver:'v2.45',date:'2026-03-27',items:['🎯 Weighted Wind Distribution — sim needle favors actual wind speed with power-curve bias (exp 2.5)','📊 Probability Weighting — ±10% from WS ~80% of the time, ±50% ~20%, matching real wind behavior','💨 Gust Spikes — occasional excursions toward gust ceiling while mostly staying near reported speed','📐 Asymmetric Range — below-WS dips and above-WS gusts use separate scaling relative to floor/ceiling']},
  {ver:'v2.44',date:'2026-03-26',items:['💨 Wind Simulator Redesign — replaced complex fBm noise/gust/calm system with clean range-based model','📏 Floor & Ceiling — sim stays within WS−50% to WG+10% range, always bounded','🎯 Smooth Lerp — picks new Perlin target every 5s, smoothstep eases between values','🔄 Live Gust Sync — AWC refresh updates gust data for consistent range after live updates','🧹 Code Cleanup — removed fBm, gustEnvelope, gustEvents, calmState dead code (~100 lines)']},
  {ver:'v2.43',date:'2026-03-26',items:['🌍 Hurricane Region Filter — pill bar to filter storms by region (Gulf, Caribbean, Atlantic, E/W Pacific, Indian Ocean, S. Pacific)','🌏 JTWC Global Data — Western Pacific typhoons, Indian Ocean cyclones, and Southern Hemisphere systems via Joint Typhoon Warning Center','📍 Geographic Classification — storms classified by lat/lon into sub-regions (Gulf of Mexico vs open Atlantic, etc.)','🗺️ Map Filter Sync — hurricane track overlay respects region filter','💾 Persistent Filter — region preference saved in localStorage','📊 Hazard Summary Filter — tropical hazard tile and nearby alerts respect region filter']},
  {ver:'v2.42',date:'2026-03-26',items:['🧭 ILS Arrow Fix — map ILS cone direction now uses winds aloft (matches Radar Sonar ALOFT indicator)','📝 MD Distance Filter — Mesoscale Discussions limited to 200mi from your location','💨 Wind Gauge Fix — gauge starts at actual reported wind speed instead of zero','🔧 Improved wind sweep animation accuracy near storms']},
  {ver:'v2.41',date:'2026-03-26',items:['🌀 Hurricane Tracking — NHC active tropical cyclone monitoring (Atlantic + E. Pacific) with 15-min cache','🌀 Tropical Cyclones UI — Weather page section with Saffir-Simpson category scale, wind/pressure/movement details, proximity distance','🗺️ Hurricane Map Overlay — toggleable 🌀 button plots storm positions with category-colored markers, name labels, pulse rings','🌊 Storm Surge Section — Alerts page shows NWS storm surge warnings/coastal flood alerts with expected surge heights','📊 Tropical Hazard Summary — new "Tropical" tile in Environmental Hazards summary grid with active/near counts','⚠️ Proximity Alerting — push notification + toast when tropical cyclone within 200 mi (hourly cooldown)','🔗 NHC RSS Integration — parses NHC Atlantic/E. Pacific RSS feeds for storm positions, winds, pressure, movement']},
  {ver:'v2.39b',date:'2026-03-26',items:['📱 PWA Install Prompt — custom install banner with "Not now" dismiss (7-day cooldown)','📡 Offline Detection — amber banner with cached data age, stale-data labels on weather & hazard cards','🔔 Notification Permission — friendly in-app modal replaces raw browser popup','🔊 Enhanced SW Notifications — storm alerts get stronger vibration, requireInteraction, and action buttons','🤖 Android TWA — Bubblewrap config + Digital Asset Links for building native Android APK','🧭 Manifest polished — portrait orientation, categories=["weather"]']},
  {ver:'v2.39a',date:'2026-03-26',items:['🐛 Drought fix — removed _extractUSState() dependency from _fetchDrought() that caused US-only error for valid US coordinates','WMS query is coordinate-based and doesn\'t need state code extraction']},
  {ver:'v2.39',date:'2026-03-26',items:['🌋 Volcano Monitoring — NASA EONET active volcanoes within 500mi radius','🌍 Global Hazard Support — region-aware fetchHazards() hides Flood/Drought for non-US locations','🔥 Dual Wildfire Sources — NIFC perimeters (US) + NASA EONET wildfires (global)','🌧️ Precipitation-Only Section — replaces drought monitor for non-US locations','📊 Adaptive Summary Grid — adjusts columns based on available hazard types']},
  {ver:'v2.38',date:'2026-03-25',items:['🔥 Wildfire data fix — NIFC GeoJSON endpoint updated for reliable active fire perimeters','☀️ Drought monitor fix — WMS point query with corrected BBOX calculation and pixel sampling','📊 Drought severity labels and color coding aligned with US Drought Monitor D0-D4 scale','🐛 Fixed earthquake radius persistence in Settings panel']},
  {ver:'v2.37',date:'2026-03-25',items:['🌍 Environmental Hazard Dashboard — real-time monitoring for earthquakes, floods, wildfires, and drought','🌍 USGS Earthquake feed — M2.5+ within configurable radius (default 200 mi), with magnitude/depth/distance','🌊 Enhanced Flood Monitoring — NWS flood alerts + USGS river gauge heights from nearby stream stations','🔥 Wildfire Tracking — NIFC active fire perimeters + NWS fire weather alerts with acres/containment','☀️ US Drought Monitor — state-level D0-D4 severity with color-coded bar chart','⚙️ Settings → Environmental Hazards section with configurable earthquake radius','4-panel hazard summary grid with clear/active/warning status at a glance']},
  {ver:'v2.36',date:'2026-03-25',items:['🌩️ Storm Cell Alerts — configurable notifications when radar detects storms matching your thresholds','3 threshold parameters: Distance (miles), Intensity (dBZ), and Impact Score (%) — all must match when enabled','15-minute cooldown per storm cell to prevent notification spam','Toast alerts in foreground + browser push notifications in background','Storm cell alert history in Alerts tab with dBZ, distance, impact tier, and timestamps','Settings panel → Storm Cell Alerts 🌩️ section with toggle switches and adjustable values']},
  {ver:'v2.35',date:'2026-03-24',items:['📍 Home button — first GPS/search location auto-saved as home; returns to home location from anywhere','🔍 Scan Here button — grabs current map center as new scan location without page reload','🔦 HD Scan dialog — choose scan target (Home / Current Location / Map Center) for 15-mile high-res analysis at zoom 12','Cyan crosshair overlay on radar map center for precise targeting','Home location persists across sessions via localStorage']},
  {ver:'v2.34',date:'2026-03-23',items:['3D Storm Terrain — complete rewrite using HTML5 Canvas heightmap renderer replacing DOM-based 3D','64×64 terrain grid with Gaussian smoothing maps storm dBZ to elevation peaks','True 3D projection with rotation, tilt, and zoom — drag to orbit, scroll/pinch to zoom','dBZ-colored terrain quads with back-to-front painter\'s algorithm and shading','Distance rings rendered as projected ellipses on the terrain plane','Wind arrows (storm movement + aloft) drawn directly on canvas','Animated lightning ⚡ flickers on cells ≥40 dBZ','Camera pad controls (arrows, zoom, reset) all working with canvas render']},
  {ver:'v2.33',date:'2026-03-23',items:['3D Storm View: threat-based color glow — green (low), yellow (moderate), red (serious), magenta (extreme) halo around each storm icon','Threat score formula combines dBZ intensity (50%) with approach trajectory impact (50%) for meaningful color coding','Storm direction arrows repositioned above icons for better visibility — larger, colored to match threat level, with contrast shadow','Radial glow ground effect beneath each storm icon with threat-colored ring','Updated Storm Intensity legend with Threat Glow color key']},
  {ver:'v2.32',date:'2026-03-23',items:['Weather Station Alerts — set custom thresholds for wind, gusts, temperature, pressure, rainfall, humidity, visibility, and UV','10 configurable alert types with per-alert enable/disable and custom threshold values','15-minute cooldown per alert type to prevent notification spam','Browser push notifications when app is in background (via Service Worker)','Toast alerts when app is in foreground','Alert history log in Alerts tab with timestamps and clear button','Settings panel → Weather Station Alerts 🔔 section for easy configuration']},
  {ver:'v2.31e',date:'2026-03-23',items:['Fixed 3D view icon aspect ratio — storm emojis no longer squish or stretch on zoom/tilt','Changed scene transform from 2D scale to 3D scale3d for uniform scaling across all axes','Lightning, rain, and arrow indicators also maintain correct proportions at all zoom levels']},
  {ver:'v2.31d',date:'2026-03-23',items:['3D view storm arrows now use per-cell tracked movement direction from radar frame comparison','Clutter threshold raised: ≤12 returns below 22 dBZ now auto-hidden as clutter (previously ≤8 below 31 dBZ)','Inbound storm point button shows 12▶ (top 12 approaching) instead of 8▶','AI prompt updated to reflect new clutter thresholds']},
  {ver:'v2.31c',date:'2026-03-23',items:['Horizontal heading strip compass replaces round compass — aviation/marine-style with scrolling tick marks and numeric heading readout','Storm movement arrows fixed — now point in direction of travel','Left/Right D-pad controls corrected — no longer reversed','Bigger D-pad and zoom buttons for easier mobile tapping','Text selection fully disabled in 2.5D overlay (CSS + JS event blocking for iOS)']},
  {ver:'v2.31a',date:'2026-03-23',items:['Camera D-pad controls: ▲▼◀▶ buttons for tilt/rotation, +/− for zoom, RST to reset — hold for continuous movement','Text selection disabled in 2.5D view to prevent accidental copy on mobile touch']},
  {ver:'v2.31',date:'2026-03-23',items:['2.5D Isometric Storm View — pure CSS/HTML bird\'s-eye perspective with weather emojis (☁️🌧️⛈️🌩️) at height-based positions scaled by dBZ intensity','Storm emoji sizing and drop-shadows scale with severity — red glow for 56+ dBZ severe cells','Approaching storms bob gently with CSS animation; ⚡ lightning overlays on cells ≥40 dBZ with strike count','Concentric distance rings (10mi/20km intervals), north arrow, and user location pulsing dot at center','Touch interaction: drag to rotate tilt (±15°), pinch to zoom, mouse wheel zoom, tap storm for popup details','Auto-updates when new scan data arrives — view stays current without reopening','Legend panel with emoji intensity guide; storm count info badge','Rain streak animations under moderate+ cells; movement arrows below each storm emoji','Tutorial section added for 2.5D Storm View']},
  {ver:'v2.30e',date:'2026-03-23',items:['AI prompt overhaul: NWS Area Forecast Discussion (AFD) fetched live from api.weather.gov for US locations — real meteorologist analysis included in AI context','Thunderstorm formation analysis: CAPE, Lifted Index, CIN from Open-Meteo with rated moisture/stability/lifting scores and overall thunderstorm potential (1-10)','Winds aloft now included in AI context with all pressure levels (surface through 500hPa) in mph and knots','Wind shear analysis (NWS/Aviation standard) with vector magnitude, severity rating, and aviation impact assessment','5-section structured AI response: Summary & AFD, Relevant Storms, General, Aviation, Boating','Dynamic urgency tone: auto-scales from calm to URGENT based on storm dBZ and alert severity','Increased AI response length (800→1500 tokens) and lowered temperature (0.7→0.4) for more thorough and consistent analysis']},
  {ver:'v2.30d',date:'2026-03-23',items:['Fixed iOS 24-hour auto-detection: system military time setting now properly detected across all time displays','Fixed AWC METAR observation time parsing: station Updated time now correctly converts from UTC to local timezone','Eliminated 150ms location-load delay: weather data fetches instantly with immediate loading skeleton','Tutorial expanded to 15 sections covering Lightning Indicators and Settings Panel']},
  {ver:'v2.30c',date:'2026-03-23',items:['Tutorial expanded from 13 to 15 sections: added Lightning Indicators and Settings Panel overview','Updated Weather, Radar, Station, Ticker, and Units tutorial tabs with latest features','Changelog entries added for v2.29 through v2.30b']},
  {ver:'v2.30b',date:'2026-03-23',items:['12/24-hour time format setting: Auto, 12h, or 24h — configurable in Settings under Units','All time displays respect format: radar timestamps, storm ETAs, sunrise/sunset, forecasts, station observations, and charts','G1000 wind/aloft/storm legend moved to top-left to prevent compass clipping','Storm movement now shows exact degrees: e.g. E (91°)']},
  {ver:'v2.30a',date:'2026-03-23',items:['Tiered HD scan popup system: 15mi (asks), 10mi (asks), 5mi (auto-triggers after 5s countdown)','15mi added to sonar zoom levels','HD scan syncs sonar zoom to 15mi for maximum detail','Fixed sonar settings Reset All button (setTimeout delay for safe panel rebuild)']},
  {ver:'v2.30',date:'2026-03-23',items:['5 switchable wind gauge styles: Neon, Marine, Minimal, G1000, Speedometer','Wind Gauge Style selector in Settings with one-tap switching','Neon: animated ring with breathing segments and gust flash','Marine: nautical compass with LED 7-segment digits, Beaufort force bar, PORT/STBD labels','Minimal: clean thin arc with arrow and large speed number','G1000: Garmin-style 3-panel — speed tape, compass rose with wind/aloft/storm vectors, pressure tape','Speedometer: semicircular dial with sweeping needle, auto-scaling ticks, gust red zone','MIN/MAX wind tracking across all gauge styles','Gyro compass mode for G1000 — rotate your phone to track storm direction']},
  {ver:'v2.29a',date:'2026-03-22',items:['Sonar zoom controls: +/− buttons to zoom between 15mi and 80mi','8 zoom levels: 15, 20, 30, 40, 50, 60, 70, 80 miles','Zoom persists in sonar settings via localStorage']},
  {ver:'v2.29',date:'2026-03-22',items:['Expanded sonar settings panel: sweep speed (Slow/Medium/Fast/Turbo), fade duration, always-on sweep, dot opacity, glow intensity (None/Subtle/Intense), grid brightness, dBZ floor slider, overlay toggles','Lightning indicators: ⚡ emoji on storm cells ≥40 dBZ with randomized strike counts scaling with intensity','Lightning visible on map, sonar, and 3D views with toggle to show/hide','All sonar settings unified in _sonarCfg with localStorage persistence','Reset All button to restore sonar defaults']},
  {ver:'v2.28',date:'2026-03-22',items:['Historical cell tracking: compares actual storm positions across consecutive radar scans for per-cell movement vectors','NWS warning polygon geometry: point-in-polygon check against official NWS warning areas boosts impact scores for storms inside active warnings','Terrain effects: fetches 9×9 elevation grid via Open-Meteo, detects valley channels and ridge barriers that can steer or block storms','AI context enriched with terrain analysis, cell tracking data, and NWS polygon matches']},
  {ver:'v2.11',date:'2026-03-21',items:['Dynamic wind gauge: live-scaling max with smart step sizes, breathing segments, gust flash effect, 60s wind trail ring','International station loading: progressive radius search (1°→5°), improved METAR parser (MPS winds, CAVOK, SLP, fractional visibility, weather codes)','Removed VATSIM fallback — all stations now use AWC direct for reliable international data','Station distance display respects metric/imperial units','Fixed flight category for international meter-based visibility']},
  {ver:'v2.10',date:'2026-03-21',items:['Dynamic ticker: 25+ rotating messages with live weather data, radar status, station info, NWS alerts, and educational tips','Ticker pulls real-time temp, wind, humidity, pressure, visibility, cloud cover, sunrise/sunset, forecasts','Nearby-storm ticker also enriched with contextual weather + radar scan info','Fun facts: dBZ scale, NEXRAD network, lightning, dew point, wall clouds, virga, and more']},
  {ver:'v2.09',date:'2026-03-21',items:['AI chat: 🗑️ Clear History button to reset conversation','Map controls split left/right — scan tools on left, storm toggles on right','Reduced vertical button stacking on mobile radar view']},
  {ver:'v2.08',date:'2026-03-21',items:['Clutter filter: ≤8 returns below 31 dBZ auto-hidden from map, sonar, and badges as likely false positives','🕳️ toggle button on map to show/hide clutter when detected','AI assistant now distinguishes real precipitation from radar clutter/ground returns','Alert ticker threshold raised to 31+ dBZ — minor returns no longer trigger warnings']},
  {ver:'v1.95',date:'2026-03-21',items:['Fixed iOS scroll bleed — background page no longer moves when swiping inside Settings','Body position locked (fixed) while Settings is open, scroll position restored on close','Touch boundary trapping on scroll area prevents overscroll leak at top/bottom edges']},
  {ver:'v1.92',date:'2026-03-21',items:['Units now managed in Settings — Imperial/Metric/Auto system selector with individual unit dropdowns','Auto mode: units switch automatically when you search a location in a different country','Removed tap-to-cycle from weather and station displays — cleaner, no more accidental unit changes','Fixed wind gust/direction jumping when changing units']},
  {ver:'v1.90',date:'2026-03-21',items:['Auto-localization — units automatically set based on your region (Celsius, km/h, mb for metric countries; Fahrenheit, mph, inHg for US/Liberia/Myanmar)','First-time users see the right units instantly — no manual toggling needed','Detects country via timezone and browser language','Manual unit changes still saved and respected']},
  {ver:'v1.89',date:'2026-03-21',items:['PWA support — install StormTracker as a standalone app on iOS and Android','Service worker for offline caching of core app files','App manifest with icons for home screen installation','Apple-specific meta tags for full-screen iOS experience']},
  {ver:'v1.88b',date:'2026-03-21',items:['Triple-fallback geocoding: Nominatim → Photon → Open-Meteo for reliable worldwide search','International location names fixed — Dubai, suburbs, districts, provinces now display properly','AI responses render markdown: bold, headers, bullet lists styled correctly','AI context now pulls from Open-Meteo + METAR + NWS for richer analysis']},
  {ver:'v1.88',date:'2026-03-21',items:['AI Weather Assistant — GPT-4o-mini powered chat with live weather context','Direct browser-to-OpenAI calls — API key stored locally, never leaves your device','Rich context injection: current conditions, storms, ETAs, alerts, forecasts, METAR','Tone options: Professional, Friendly, Humorous','Detail levels: Brief, Standard, Technical','Quick question buttons for common weather queries','Dynamic urgency — AI prioritizes safety when threats are detected']},
  {ver:'v1.87',date:'2026-03-21',items:['Tutorial & What\'s New added to Settings','First-launch welcome prompt with skip option','Comprehensive how-to guide for all features']},
  {ver:'v1.86',date:'2026-03-21',items:['Threat ticker now shows 4 states: clear, nearby, light approaching, severe approaching','Sonar mini-map shows directional arrows for approaching storms','PT button cycles through 3 modes: off, top 8 inbound, all','Top 8 inbound is now the default storm display mode','Ticker moved inside sticky header — always visible when scrolling']},
  {ver:'v1.85',date:'2026-03-21',items:['NWS-style scrolling threat ticker for storms ≥45 dBZ approaching','Severity-colored messages: yellow (strong), orange (severe), red (extreme)','ETA countdown and arrival time in ticker']},
  {ver:'v1.84',date:'2026-03-20',items:['Unified ILS approach cone system — single animated cone replaces old chevron arrows','Cone starts 80mi from storm source, tail extends 70mi past user','White center/tail when no storms, dBZ-colored when storms inbound','Bearing bug fixed — cone always uses winds aloft direction']},
  {ver:'v1.83',date:'2026-03-19',items:['Storm zone grid sectors with impact calculation','Dynamic cone width formula based on storm dBZ','Arrival time nowrap formatting']},
  {ver:'v1.80',date:'2026-03-17',items:['Weather Station (PWS Console) with live METAR data','Wind compass with animated direction arrow','Circular gauges for humidity, visibility, UV','Barometric pressure with trend indicator','Flight category banner (VFR/MVFR/IFR/LIFR)','METAR decoder with color-coded severity','24-hour trend charts and wind direction history','Multi-station TAFs and station favorites']},
  {ver:'v1.75',date:'2026-03-15',items:['Travel Mode with live GPS tracking','Configurable refresh intervals (5m to 1h)','Speed and GPS accuracy display','Auto-refresh weather and radar while moving']},
  {ver:'v1.70',date:'2026-03-13',items:['Multi-language support: 20+ languages with auto-detection','Language selector with flag + native name dropdown','RTL support for Arabic']},
  {ver:'v1.60',date:'2026-03-10',items:['Storm movement tracking with directional arrows','ETA countdown timers for approaching storms','Impact percentage calculations','Storm popup cards with detailed info']},
  {ver:'v1.50',date:'2026-03-07',items:['NEXRAD high-resolution US radar','RainViewer global radar fallback','Multi-source radar with automatic source selection']},
  {ver:'v1.40',date:'2026-03-05',items:['Radar sonar mini-map on Weather tab','Storm cell detection from radar tile sampling','Polar grid zone binning system']},
  {ver:'v1.0',date:'2026-02-28',items:['Initial release — real-time weather dashboard','Interactive Leaflet radar map','OpenWeather API integration','NWS alerts for US locations','GPS and manual location support']}
];
function getTutorialHtml(){
  return TUTORIAL_SECTIONS.map(s=>`<div style="margin-bottom:14px"><div style="font-weight:700;color:var(--text-primary);margin-bottom:4px;font-size:0.95em">${s.title}</div><div>${s.text}</div></div>`).join('');
}
function getChangelogHtml(){
  return CHANGELOG.map(c=>`<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border-subtle)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-weight:700;color:var(--accent-cyan);font-size:1em">${c.ver}</span><span style="font-size:0.75em;color:var(--text-muted)">${c.date}</span></div><ul style="margin:0;padding-left:18px">${c.items.map(i=>`<li style="margin-bottom:3px">${i}</li>`).join('')}</ul></div>`).join('');
}
// Silent auto update-check run at launch (before weather fetch). Compares the
// loaded display version against the live network index.html; if they differ a
// newer build is available, so clear caches, drop the SW, and reload once.
// A sessionStorage guard prevents reload loops if the CDN is briefly stale.
async function _autoCheckUpdate(){
  try{
    if(sessionStorage.getItem('st_autoUpd')==='1'){sessionStorage.removeItem('st_autoUpd');return false;}
    if('onLine' in navigator&&!navigator.onLine)return false;
    const loaded=document.title.match(/v(\d+\.\d+)/);
    if(!loaded)return false;
    const loadedVer='v'+loaded[1];
    const ctrl=new AbortController();
    const to=setTimeout(()=>ctrl.abort(),3000);
    let netVer=null;
    try{
      const r=await fetch('index.html?_='+Date.now(),{cache:'no-store',signal:ctrl.signal});
      if(r.ok){
        const txt=await r.text();
        const m=txt.match(/<title>[^<]*v(\d+\.\d+)[^<]*<\/title>/i);
        if(m)netVer='v'+m[1];
      }
    }finally{clearTimeout(to);}
    if(!netVer||netVer===loadedVer)return false;
    // Newer build available — refresh to it before the app loads weather.
    sessionStorage.setItem('st_autoUpd','1');
    try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}catch(e){}
    try{if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.unregister();}}catch(e){}
    location.reload();
    return true;
  }catch(e){return false;}
}
async function forceAppUpdate(){
  const btn=document.getElementById('btn-check-update');
  if(!btn)return;
  btn.disabled=true;
  const startTime=Date.now();
  let timerInt;
  function updateTimer(prefix){
    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    btn.textContent=`${prefix} ${elapsed}s`;
  }
  btn.textContent='🔄 Checking... 0.0s';
  btn.style.color='#66bb6a';
  timerInt=setInterval(()=>updateTimer('🔄 Checking...'),100);
  try{
    // 1. Current installed version from SW cache keys
    const keys=await caches.keys();
    const currentKey=keys.find(k=>k.startsWith('stormtracker-v'))||'';
    const currentVer=currentKey?currentKey.replace('stormtracker-',''):'unknown';

    // 2. Current display version from page header (e.g. "StormTracker v3.38" → "v3.38")
    const titleMatch=document.title.match(/v(\d+\.\d+)/);
    const currentDisplayVer=titleMatch?`v${titleMatch[1]}`:'';

    // 3. Fetch latest sw.js from network bypassing cache
    let latestSwVer=currentVer;
    try{
      const r=await fetch('sw.js?_='+Date.now(),{cache:'no-store'});
      if(r.ok){
        const txt=await r.text();
        const m=txt.match(/CACHE_NAME\s*=\s*['"]stormtracker-(v\d+)['"]/);
        if(m)latestSwVer=m[1];
      }
    }catch(e){console.warn('Could not fetch sw.js for version check:',e);}

    // 4. Fetch latest index.html header version from network
    let latestDisplayVer=currentDisplayVer;
    try{
      const r=await fetch('index.html?_='+Date.now(),{cache:'no-store'});
      if(r.ok){
        const txt=await r.text();
        const m=txt.match(/<title>[^<]*v(\d+\.\d+)[^<]*<\/title>/i);
        if(m)latestDisplayVer=`v${m[1]}`;
      }
    }catch(e){console.warn('Could not fetch index.html for version check:',e);}

    clearInterval(timerInt);

    // Update needed if SW cache version differs OR page header version differs
    const swOutdated=latestSwVer!==currentVer&&currentVer!=='unknown';
    const pageOutdated=latestDisplayVer&&currentDisplayVer&&latestDisplayVer!==currentDisplayVer;
    const updateNeeded=swOutdated||pageOutdated;

    if(!updateNeeded&&currentVer!=='unknown'){
      // Already on the latest version
      const dispVer=currentDisplayVer||currentVer;
      btn.textContent=`✅ Up to date (${dispVer})`;
      btn.style.color='#4caf50';
      btn.disabled=false;
      return;
    }

    // New version available — show comparison then clear caches and reload
    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    let label;
    if(pageOutdated&&currentDisplayVer&&latestDisplayVer){
      label=`🆕 ${currentDisplayVer} → ${latestDisplayVer} (${elapsed}s)`;
    }else if(swOutdated){
      label=`🆕 ${currentVer} → ${latestSwVer} (${elapsed}s)`;
    }else{
      label=`🆕 Update available (${elapsed}s)`;
    }
    btn.textContent=label;
    btn.style.color='#00e5ff';

    await Promise.all(keys.map(k=>caches.delete(k)));
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.getRegistration();
      if(reg){
        await reg.update();
        const waiting=reg.waiting||reg.installing;
        if(waiting){
          if(waiting.state==='installed')waiting.postMessage({type:'SKIP_WAITING'});
          waiting.addEventListener('statechange',function(){
            if(this.state==='activated'){location.reload();}
          });
        }
        await reg.unregister();
      }
    }
    setTimeout(()=>location.reload(),800);
  }catch(e){
    console.error('Update check failed:',e);
    clearInterval(timerInt);
    const elapsed=((Date.now()-startTime)/1000).toFixed(1);
    btn.textContent=`🔄 Refreshing... ${elapsed}s`;
    btn.style.color='#ff9800';
    setTimeout(()=>location.reload(),300);
  }
}
function showTutorial(){
  const o=document.getElementById('tutorial-overlay');if(!o)return;
  document.getElementById('tutorial-content').innerHTML=getTutorialHtml();
  const cb=document.getElementById('tutorial-skip-cb');
  if(cb)cb.checked=localStorage.getItem('st_skipTutorial')==='1';
  o.style.display='block';
  toggleSettingsPanel();
}
function closeTutorial(){
  const o=document.getElementById('tutorial-overlay');if(o)o.style.display='none';
}
function setTutorialSkip(skip){
  localStorage.setItem('st_skipTutorial',skip?'1':'0');
}
function showChangelog(){
  const o=document.getElementById('changelog-overlay');if(!o)return;
  document.getElementById('changelog-content').innerHTML=getChangelogHtml();
  o.style.display='block';
  toggleSettingsPanel();
}
function closeChangelog(){
  const o=document.getElementById('changelog-overlay');if(o)o.style.display='none';
}
function checkFirstLaunch(){
  const skip=localStorage.getItem('st_skipTutorial');
  const seen=localStorage.getItem('st_tutorialSeen');
  if(skip==='1')return;
  if(seen)return;
  localStorage.setItem('st_tutorialSeen','1');
  setTimeout(()=>{
    if(document.querySelector('.confirm-overlay'))return;
    const ask=document.createElement('div');
    ask.id='tutorial-prompt';
    ask.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;background:var(--bg-card);border:1px solid var(--accent-cyan);border-radius:12px;padding:14px 18px;max-width:320px;width:90%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    ask.innerHTML=`<div style="font-size:0.9em;font-weight:600;color:var(--text-primary);margin-bottom:10px">👋 Welcome to StormTracker!</div><div style="font-size:0.78em;color:var(--text-secondary);margin-bottom:12px">Would you like a quick tutorial on how everything works?</div><div class="flex-gap-8"><button onclick="document.getElementById('tutorial-prompt').remove();showTutorialDirect()" style="flex:1;padding:8px;background:rgba(0,229,255,0.15);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:8px;font-size:0.85em;font-weight:600;cursor:pointer">📖 Yes, show me!</button><button onclick="document.getElementById('tutorial-prompt').remove()" style="flex:1;padding:8px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;font-size:0.85em;font-weight:600;cursor:pointer">Skip</button></div>`;
    document.body.appendChild(ask);
    setTimeout(()=>{const el=document.getElementById('tutorial-prompt');if(el)el.remove()},20000);
  },3000);
}
function showTutorialDirect(){
  const o=document.getElementById('tutorial-overlay');if(!o)return;
  document.getElementById('tutorial-content').innerHTML=getTutorialHtml();
  const cb=document.getElementById('tutorial-skip-cb');
  if(cb)cb.checked=localStorage.getItem('st_skipTutorial')==='1';
  o.style.display='block';
}
function toggleSettingsPanel(){
  const p=document.getElementById('settings-panel');
  if(!p)return;
  const vis=p.style.display==='flex';
  if(vis){
    const scrollY=Math.abs(parseInt(document.body.style.top||'0'));
    p.style.display='none';
    document.body.style.overflow='';document.body.style.position='';document.body.style.width='';document.body.style.top='';
    window.scrollTo(0,scrollY);
  }else{
    const scrollY=window.scrollY;
    document.body.style.overflow='hidden';document.body.style.position='fixed';document.body.style.width='100%';document.body.style.top=`-${scrollY}px`;
    p.style.display='flex';
    syncSettingsPanel();
  }
}
(function(){
  const sa=document.getElementById('settings-scroll-area');
  if(!sa)return;
  sa.addEventListener('touchmove',function(e){
    const st=sa.scrollTop,sh=sa.scrollHeight,ch=sa.clientHeight;
    if(sh<=ch){e.preventDefault();return}
    if(st<=0&&e.touches[0].clientY>sa._lastTouchY){e.preventDefault();return}
    if(st+ch>=sh&&e.touches[0].clientY<sa._lastTouchY){e.preventDefault();return}
  },{passive:false});
  sa.addEventListener('touchstart',function(e){sa._lastTouchY=e.touches[0].clientY},{passive:true});
})();
function syncSettingsPanel(){
  syncAISettings();
  syncUnitSelects();
  syncGaugeStyleBtns();
  syncGyroBtn();
  syncTimeFmtBtns();
  try { renderSyncSection(); } catch(e) {}
  const tsSel=document.getElementById('settings-ticker-speed');
  if(tsSel){const tsVal=parseInt(localStorage.getItem('st_tickerSpeed'))||100;tsSel.value=String(tsVal);const tsLbl=document.getElementById('ticker-speed-val');if(tsLbl)tsLbl.textContent=tsVal+'%'}
  const chSel=document.getElementById('settings-crosshair-delay');
  if(chSel)chSel.value=String(S._crosshairDelay);
  const agBtn=document.getElementById('settings-autogps-toggle');
  if(agBtn){
    const agOn=localStorage.getItem('st_autoGps')==='1';
    agBtn.textContent=agOn?'ON':'OFF';
    agBtn.style.background=agOn?'rgba(34,197,94,0.15)':'rgba(255,255,255,0.04)';
    agBtn.style.borderColor=agOn?'#22c55e':'var(--border-subtle)';
    agBtn.style.color=agOn?'#22c55e':'var(--text-muted)';
  }
  const ohBtn=document.getElementById('settings-overhead-toggle');
  if(ohBtn){
    const ohOn=typeof isOverheadPollEnabled==='function'?isOverheadPollEnabled():true;
    ohBtn.textContent=ohOn?'ON':'OFF';
    ohBtn.style.background=ohOn?'rgba(34,197,94,0.15)':'rgba(255,255,255,0.04)';
    ohBtn.style.borderColor=ohOn?'#22c55e':'var(--border-subtle)';
    ohBtn.style.color=ohOn?'#22c55e':'var(--text-muted)';
    const ohHint=document.getElementById('settings-overhead-hint');
    if(ohHint&&typeof _getOverheadPollMs==='function'){
      const ms=_getOverheadPollMs();
      const throttled=ms>=300000;
      ohHint.textContent=throttled
        ?'Slow / Data Saver connection detected — auto-throttled to one check every 5 minutes. Turn off to save mobile data.'
        :'Keeps the hero card in sync between full radar scans. Auto-throttles to 5 minutes on slow / Data Saver connections. Turn off to save mobile data.';
    }
  }
  const sel=document.getElementById('settings-travel-int');
  if(sel)sel.value=String(S.gpsInterval||300);
  const arSel=document.getElementById('settings-auto-refresh');
  if(arSel)arSel.value=String(getAutoRefreshMin());
  const btn=document.getElementById('settings-travel-toggle');
  if(btn){
    btn.textContent=S.travelMode?'ON':'OFF';
    btn.style.background=S.travelMode?'rgba(255,51,85,0.15)':'rgba(0,229,255,0.08)';
    btn.style.borderColor=S.travelMode?'var(--accent-red)':'var(--accent-cyan)';
    btn.style.color=S.travelMode?'var(--accent-red)':'var(--accent-cyan)';
  }
  const style=S._pathArrowStyle||'chevron';
  const cBtn=document.getElementById('pa-style-chevron');
  const pBtn=document.getElementById('pa-style-pointer');
  if(cBtn){cBtn.style.background=style==='chevron'?'rgba(0,229,255,0.2)':'rgba(255,255,255,0.05)';cBtn.style.borderColor=style==='chevron'?'var(--accent-cyan)':'var(--border-subtle)';}
  if(pBtn){pBtn.style.background=style==='pointer'?'rgba(0,229,255,0.2)':'rgba(255,255,255,0.05)';pBtn.style.borderColor=style==='pointer'?'var(--accent-cyan)':'var(--border-subtle)';}
  const wxAlertEl=document.getElementById('wx-alert-settings');
  if(wxAlertEl)wxAlertEl.innerHTML=renderWxAlertSettings();
  const stormAlertEl=document.getElementById('storm-alert-settings');
  if(stormAlertEl)stormAlertEl.innerHTML=renderStormCellAlertSettings();
  const pushAlertEl=document.getElementById('push-alert-settings');
  if(pushAlertEl&&typeof renderPushAlertSettings==='function')pushAlertEl.innerHTML=renderPushAlertSettings();
  const expSel=document.getElementById('settings-alert-expiry');
  if(expSel){const ev=parseInt(localStorage.getItem('st_alertExpiry'),10);expSel.value=String([30,60,120,240,360].includes(ev)?ev:120)}
  syncRainAlertUI();
  const eqSel=document.getElementById('settings-eq-radius');
  if(eqSel)eqSel.value=String(getEqRadius());
  const simIntSel=document.getElementById('settings-sim-interval');
  if(simIntSel)simIntSel.value=String(_getSimInterval()/1000);
  const gustWSel=document.getElementById('settings-gust-window');
  if(gustWSel)gustWSel.value=String(_getGustWindow()/1000);
  const avgWSel=document.getElementById('settings-avg-window');
  if(avgWSel)avgWSel.value=String(_getAvgWindow()/1000);
  syncIconPackUI();
}
function setSimInterval(val){
  const v=parseInt(val,10);
  if(v>=5&&v<=30){
    localStorage.setItem('st_windSimInterval',String(v));
    _WIND_LERP_DUR=v*1000;
    if(S._windPickTimer){clearInterval(S._windPickTimer);
      S._windPickTimer=setInterval(()=>{
        _windLerpFrom={spd:_windCurSim.spd,dir:_windCurSim.dir};
        _windLerpTo=_pickWindTarget();
        _windLerpT0=Date.now();
      },_WIND_LERP_DUR);
    }
    toast('💨 Sim speed set to '+v+'s');
  }
}
function setGustWindow(val){
  const v=parseInt(val,10);
  if([30,60,120,300].includes(v)){
    localStorage.setItem('st_gustWindow',String(v));
    toast('💨 Gust window set to '+_fmtWindowLabel(v*1000));
  }
}
function setAvgWindow(val){
  const v=parseInt(val,10);
  if([10,30,60,120].includes(v)){
    localStorage.setItem('st_avgWindow',String(v));
    toast('💨 Avg window set to '+_fmtWindowLabel(v*1000));
  }
}
function setTickerSpeed(val,final){
  const v=parseInt(val,10);
  if(v>=50&&v<=200){
    localStorage.setItem('st_tickerSpeed',String(v));
    const lbl=document.getElementById('ticker-speed-val');
    if(lbl)lbl.textContent=v+'%';
    if(final){updateThreatTicker();toast('📰 Ticker speed set to '+v+'%')}
  }
}
// v4.76: manual "reboot startup" — re-runs the startup sequence in place for the
// current location without a full app reload. Clears the winds-aloft cache so
// the WA gate genuinely re-fetches, then re-runs the location refresh pipeline
// (fetch weather → gated scanRadarForStorms → hazards). Useful if storm
// motion / ETAs look stuck because winds aloft never loaded.
function rebootStartup(){
  if(!S.lat||!S.lon){toast('📍 Set a location first');return}
  if(S._rebooting)return;
  S._rebooting=true;
  // Close the settings panel if it's open so the loading screen is visible.
  const p=document.getElementById('settings-panel');
  if(p&&p.style.display!=='none'&&typeof toggleSettingsPanel==='function')toggleSettingsPanel();
  toast('🔄 Rebooting — re-fetching winds aloft & rescanning…');
  // Force a fresh winds-aloft fetch through the gate.
  S._windCache=null;S._aloftData=null;
  Promise.resolve(setLoc(S.lat,S.lon,S.locName)).finally(()=>{S._rebooting=false});
}