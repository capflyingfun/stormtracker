<section class="plugin__content stormtracker-plugin" class:minimized>
    <div class="st-header">
        <span class="st-icon">⛈️</span>
        <span class="st-title">{title}</span>
        <span class="st-header-spacer"></span>
        <button class="st-minimize-btn" on:click={toggleMinimize}>{minimized ? '▲' : '▼'}</button>
    </div>

    {#if !minimized}
        <div class="st-controls">
            <label class="st-label">Display Mode</label>
            <div class="st-toggle-group">
                <button class="st-btn" class:active={displayMode === 'off'} on:click={() => setMode('off')}>Off</button>
                <button class="st-btn" class:active={displayMode === 'inbound'} on:click={() => setMode('inbound')}>12 Inbound</button>
                <button class="st-btn" class:active={displayMode === 'all'} on:click={() => setMode('all')}>All</button>
            </div>
        </div>

        <div class="st-controls">
            <label class="st-label">Scan Radius</label>
            <div class="st-toggle-group">
                <button class="st-btn" class:active={scanRadius === 40} on:click={() => setRadius(40)}>40 mi</button>
                <button class="st-btn" class:active={scanRadius === 80} on:click={() => setRadius(80)}>80 mi</button>
                <button class="st-btn" class:active={scanRadius === 120} on:click={() => setRadius(120)}>120 mi</button>
            </div>
        </div>

        <div class="st-controls">
            <label class="st-label">Layers</label>
            <div class="st-checks">
                <label class="st-check"><input type="checkbox" bind:checked={showPoints} on:change={replot} /> Storm Points</label>
                <label class="st-check"><input type="checkbox" bind:checked={showArrows} on:change={replot} /> Movement Arrows</label>
                <label class="st-check"><input type="checkbox" bind:checked={showTracks} on:change={replot} /> Track Cones</label>
            </div>
        </div>

        <div class="st-actions">
            <button class="st-scan-btn" on:click={doScan} disabled={scanning}>
                {#if scanning}
                    <span class="st-spinner"></span> Scanning...
                {:else}
                    🔍 Scan Now
                {/if}
            </button>
            {#if autoScan}
                <button class="st-scan-btn st-stop" on:click={stopAuto}>⏹ Stop Auto</button>
            {:else}
                <button class="st-scan-btn st-auto" on:click={startAuto}>▶ Auto (2 min)</button>
            {/if}
        </div>
    {/if}

    {#if scanSource}
        <div class="st-source">{scanSource} · {storms.length} cell{storms.length !== 1 ? 's' : ''}{windData ? ` · Wind ${windData.speed} mph ${degToDir(windData.direction)}` : ''}</div>
    {/if}

    {#if !minimized}
        {#if storms.length > 0}
            <div class="st-list">
                {#each visibleStorms as storm, i}
                    <div class="st-storm" on:click={() => panToStorm(storm)}>
                        <div class="st-storm-hdr">
                            <span class="st-dbz" style="background:{dbzColor(storm.dbz)};color:{storm.dbz >= 40 ? '#000' : '#fff'}">{storm.dbz} dBZ</span>
                            <span class="st-dist">{storm.dist.toFixed(1)} mi {degToDir(storm.bearing)}</span>
                            {#if storm.eta && storm.eta.approaching}
                                <span class="st-eta">⏱ {storm.eta.minutes} min</span>
                            {/if}
                        </div>
                        <div class="st-storm-sub">
                            {dbzLabel(storm.dbz)}
                            {#if storm.track}
                                · {storm.track.speed} mph {degToDir(storm.track.dir)}
                            {:else if windData}
                                · ~{windData.speed} mph {degToDir(windData.direction)}
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {:else if scanSource}
            <div class="st-empty">No storm cells detected</div>
        {/if}

        <div class="st-footer">
            <a href="https://github.com/CAPFlyingFun/StormTracker" target="_blank">StormTracker</a> · Radar: RainViewer + NEXRAD
        </div>
    {/if}
</section>

<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { LatLon } from '@windy/interfaces';
    import { map } from '@windy/map';
    import { scanForStorms, dbzColor, dbzLabel, degToDir, destPoint, haversine } from './stormScanner';
    import type { StormCell, WindData } from './stormScanner';
    import config from './pluginConfig';

    const { title } = config;

    let displayMode: 'off' | 'inbound' | 'all' = 'inbound';
    let scanRadius = 80;
    let showPoints = true;
    let showArrows = true;
    let showTracks = true;
    let scanning = false;
    let autoScan = true;
    let autoTimer: any = null;
    let storms: StormCell[] = [];
    let scanSource = '';
    let windData: WindData | null = null;
    let mounted = false;
    let minimized = false;

    let pointMarkers: any[] = [];
    let arrowLines: any[] = [];
    let trackPolys: any[] = [];
    let rangeCircle: any = null;

    $: visibleStorms = getVisibleStorms(storms, displayMode);

    function getVisibleStorms(stormList: StormCell[], mode: string): StormCell[] {
        if (mode === 'off') return [];
        if (mode === 'inbound') {
            return stormList.filter(s => s.eta && s.eta.approaching).slice(0, 12);
        }
        return stormList;
    }

    function toggleMinimize() {
        minimized = !minimized;
        updateRangeCircle();
    }

    function setMode(m: 'off' | 'inbound' | 'all') {
        displayMode = m;
        replot();
    }

    function setRadius(r: number) {
        scanRadius = r;
        updateRangeCircle();
    }

    function getVisibleMapCenter(): { lat: number; lng: number } {
        const center = map.getCenter();
        if (minimized) return { lat: center.lat, lng: center.lng };
        const isMobileFullscreen = config.mobileUI === 'fullscreen' && window.innerWidth < 768;
        if (!isMobileFullscreen) return { lat: center.lat, lng: center.lng };
        try {
            const size = map.getSize();
            if (size && size.y > 0) {
                const panelFraction = 0.45;
                const visibleH = size.y * (1 - panelFraction);
                const visibleCenterY = visibleH / 2;
                const pt = map.containerPointToLatLng([size.x / 2, visibleCenterY]);
                if (pt && pt.lat != null && pt.lng != null) {
                    return { lat: pt.lat, lng: pt.lng };
                }
            }
        } catch {}
        return { lat: center.lat, lng: center.lng };
    }

    export const onopen = (params: LatLon) => {
        if (params && params.lat != null && params.lon != null) {
            map.setView([params.lat, params.lon], Math.max(map.getZoom(), 7));
        }
        if (!mounted) return;
        doScan();
    };

    onMount(() => {
        mounted = true;
        startAuto();
    });

    onDestroy(() => {
        mounted = false;
        clearLayers();
        if (rangeCircle) { map.removeLayer(rangeCircle); rangeCircle = null; }
        stopAuto();
    });

    function clearLayers() {
        pointMarkers.forEach(m => { try { map.removeLayer(m); } catch {} });
        pointMarkers = [];
        arrowLines.forEach(l => { try { map.removeLayer(l); } catch {} });
        arrowLines = [];
        trackPolys.forEach(p => { try { map.removeLayer(p); } catch {} });
        trackPolys = [];
    }

    function updateRangeCircle() {
        const vc = getVisibleMapCenter();
        if (rangeCircle) { map.removeLayer(rangeCircle); rangeCircle = null; }
        rangeCircle = L.circle([vc.lat, vc.lng], {
            radius: scanRadius * 1609.34,
            color: '#3b82f6',
            fill: false,
            weight: 1,
            dashArray: '6 4',
            interactive: false
        }).addTo(map);
    }

    async function doScan() {
        if (scanning) return;
        scanning = true;
        const vc = getVisibleMapCenter();
        updateRangeCircle();
        try {
            const result = await scanForStorms(vc.lat, vc.lng, scanRadius);
            storms = result.storms;
            scanSource = result.source;
            windData = result.wind;
            setTimeout(() => replot(), 0);
        } catch (e) {
            scanSource = 'Scan failed';
        }
        scanning = false;
    }

    function startAuto() {
        autoScan = true;
        doScan();
        autoTimer = setInterval(doScan, 120000);
    }

    function stopAuto() {
        autoScan = false;
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    function replot() {
        clearLayers();
        if (displayMode === 'off') return;

        const plotStorms = getVisibleStorms(storms, displayMode);
        const movementSource = windData;

        for (const s of plotStorms) {
            if (showPoints) {
                const color = dbzColor(s.dbz);
                const size = s.dbz >= 50 ? 8 : s.dbz >= 40 ? 7 : 6;
                const marker = L.circleMarker([s.lat, s.lng], {
                    radius: size,
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.8,
                    weight: 1
                });
                const etaText = s.eta && s.eta.approaching ? `<br>⏱ ETA: ${s.eta.minutes} min (${s.eta.impact}% impact)` : '';
                const trackText = s.track ? `<br>📐 ${s.track.speed} mph ${degToDir(s.track.dir)}` : (movementSource ? `<br>🌬 ~${movementSource.speed} mph ${degToDir(movementSource.direction)}` : '');
                marker.bindPopup(
                    `<div style="font-family:system-ui;min-width:160px;text-align:center">` +
                    `<div style="font-weight:700;color:${color};font-size:14px">${s.dbz} dBZ — ${dbzLabel(s.dbz)}</div>` +
                    `<div style="font-size:12px;margin-top:4px">${s.dist.toFixed(1)} mi ${degToDir(s.bearing)}</div>` +
                    `<div style="font-size:11px;color:#aaa;margin-top:2px">${trackText}${etaText}</div>` +
                    `</div>`
                );
                marker.addTo(map);
                pointMarkers.push(marker);
            }

            if (showArrows) {
                const track = s.track && s.track.speed >= 2 ? s.track : null;
                const dir = track ? track.dir : (movementSource ? movementSource.direction : null);
                const spd = track ? track.speed : (movementSource ? movementSource.speed : 0);
                if (dir !== null && spd >= 2) {
                    const arrowLen = Math.min(spd * 0.15, 12);
                    const [endLat, endLng] = destPoint(s.lat, s.lng, dir, arrowLen);
                    const color = track ? '#00e5ff' : '#3b82f6';
                    const line = L.polyline([[s.lat, s.lng], [endLat, endLng]], {
                        color: color,
                        weight: 2,
                        opacity: 0.9,
                        dashArray: track ? null : '4 3'
                    });
                    line.addTo(map);
                    arrowLines.push(line);

                    const arrowHead = destPoint(s.lat, s.lng, dir, arrowLen * 0.85);
                    const headL = destPoint(arrowHead[0], arrowHead[1], (dir - 150 + 360) % 360, arrowLen * 0.3);
                    const headR = destPoint(arrowHead[0], arrowHead[1], (dir + 150) % 360, arrowLen * 0.3);
                    const chevron = L.polyline([[headL[0], headL[1]], [endLat, endLng], [headR[0], headR[1]]], {
                        color: color,
                        weight: 2,
                        opacity: 0.9
                    });
                    chevron.addTo(map);
                    arrowLines.push(chevron);
                }
            }

            if (showTracks) {
                const track = s.track && s.track.speed >= 2 ? s.track : null;
                const dir = track ? track.dir : (movementSource ? movementSource.direction : null);
                const spd = track ? track.speed : (movementSource ? movementSource.speed : 0);
                if (dir !== null && spd >= 2) {
                    const coneLenMi = spd * 0.5;
                    const coneHalf = 12;
                    const steps = 12;
                    const conePoints: [number, number][] = [[s.lat, s.lng]];
                    for (let i = 0; i <= steps; i++) {
                        const ang = dir - coneHalf + (2 * coneHalf * i / steps);
                        const [lat, lng] = destPoint(s.lat, s.lng, ang, coneLenMi);
                        conePoints.push([lat, lng]);
                    }
                    conePoints.push([s.lat, s.lng]);
                    const color = dbzColor(s.dbz);
                    const cone = L.polygon(conePoints, {
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.12,
                        weight: 1,
                        dashArray: '3 3',
                        interactive: false
                    });
                    cone.addTo(map);
                    trackPolys.push(cone);
                }
            }
        }
    }

    function panToStorm(storm: StormCell) {
        map.setView([storm.lat, storm.lng], Math.max(map.getZoom(), 8));
    }
</script>

<style>
    .stormtracker-plugin {
        color: #e0e0e0;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 14px 16px;
        font-size: 16px;
    }
    .stormtracker-plugin.minimized {
        padding: 10px 16px;
    }
    .st-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
    }
    .minimized .st-header {
        margin-bottom: 6px;
    }
    .st-header-spacer { flex: 1; }
    .st-minimize-btn {
        background: none;
        border: 1px solid #555;
        color: #ccc;
        font-size: 16px;
        width: 36px;
        height: 36px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
    }
    .st-minimize-btn:hover { border-color: #888; color: #fff; }
    .st-icon { font-size: 26px; }
    .st-title { font-weight: 700; font-size: 20px; }
    .st-controls { margin-bottom: 14px; }
    .st-label { font-size: 13px; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block; }
    .st-toggle-group { display: flex; gap: 6px; }
    .st-btn {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid #444;
        background: #1a1a2e;
        color: #aaa;
        border-radius: 6px;
        cursor: pointer;
        font-size: 15px;
        transition: all 0.15s;
    }
    .st-btn:hover { border-color: #666; color: #fff; }
    .st-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .st-checks { display: flex; flex-direction: column; gap: 10px; }
    .st-check { display: flex; align-items: center; gap: 10px; font-size: 16px; cursor: pointer; }
    .st-check input { accent-color: #3b82f6; width: 20px; height: 20px; }
    .st-actions { display: flex; gap: 8px; margin-bottom: 14px; }
    .st-scan-btn {
        flex: 1;
        padding: 12px 14px;
        border: none;
        border-radius: 8px;
        background: #3b82f6;
        color: #fff;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.15s;
    }
    .st-scan-btn:hover { background: #2563eb; }
    .st-scan-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .st-scan-btn.st-auto { background: #16a34a; }
    .st-scan-btn.st-auto:hover { background: #15803d; }
    .st-scan-btn.st-stop { background: #dc2626; }
    .st-scan-btn.st-stop:hover { background: #b91c1c; }
    .st-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .st-source { font-size: 14px; color: #888; margin-bottom: 10px; text-align: center; }
    .minimized .st-source { margin-bottom: 0; }
    .st-list { max-height: 400px; overflow-y: auto; }
    .st-storm {
        padding: 10px 12px;
        margin-bottom: 6px;
        background: rgba(255,255,255,0.04);
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s;
    }
    .st-storm:hover { background: rgba(255,255,255,0.08); }
    .st-storm-hdr { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .st-dbz { padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: 700; }
    .st-dist { font-size: 15px; color: #bbb; }
    .st-eta { font-size: 14px; color: #f59e0b; font-weight: 600; }
    .st-storm-sub { font-size: 14px; color: #777; margin-top: 3px; }
    .st-empty { text-align: center; color: #666; padding: 24px 0; font-size: 15px; }
    .st-footer { font-size: 13px; color: #555; text-align: center; margin-top: 16px; padding-top: 10px; border-top: 1px solid #333; }
    .st-footer a { color: #3b82f6; text-decoration: none; }
    .st-footer a:hover { text-decoration: underline; }
</style>
