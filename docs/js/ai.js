// ==========================================
// AI WEATHER ASSISTANT
// ==========================================
const _aiChatHistory=[];
let _aiChatOpen=false;

function saveAIKey(v){const t=(v||'').trim();localStorage.setItem('st_aiKey',t);if(!t)localStorage.setItem('st_briefingMode','system');updateAIFab();if(typeof syncBriefingModeUI==='function')syncBriefingModeUI();}
function saveAITone(v){localStorage.setItem('st_aiTone',v);}
function saveAIDetail(v){localStorage.setItem('st_aiDetail',v);}
function saveAIModel(v){localStorage.setItem('st_aiModel',v);}
function getAIKey(){return localStorage.getItem('st_aiKey')||'';}
function getAITone(){return localStorage.getItem('st_aiTone')||'professional';}
function getAIDetail(){return localStorage.getItem('st_aiDetail')||'standard';}
const _AI_MODELS=['gpt-4o-mini','gpt-4o','gpt-4.1-mini','gpt-4.1'];
function getAIModel(){const m=localStorage.getItem('st_aiModel');return _AI_MODELS.includes(m)?m:'gpt-4o-mini';}
function toggleAIKeyVis(){
  const inp=document.getElementById('settings-ai-key');
  if(inp)inp.type=inp.type==='password'?'text':'password';
}
function updateAIFab(){
  const fab=document.getElementById('ai-fab');
  if(fab)fab.style.display='block';
}
function syncAISettings(){
  const inp=document.getElementById('settings-ai-key');
  if(inp)inp.value=getAIKey();
  const tone=document.getElementById('settings-ai-tone');
  if(tone)tone.value=getAITone();
  const detail=document.getElementById('settings-ai-detail');
  if(detail)detail.value=getAIDetail();
  const model=document.getElementById('settings-ai-model');
  if(model)model.value=getAIModel();
  const sk=document.getElementById('settings-skylink-key');
  if(sk&&typeof getSkylinkKey==='function')sk.value=getSkylinkKey();
  if(typeof syncBriefingModeUI==='function')syncBriefingModeUI();
}
function clearAIChat(){
  _aiChatHistory.length=0;
  const msgs=document.getElementById('ai-chat-messages');
  if(msgs)msgs.innerHTML='';
  addAIMsg('system','🤖 AI Weather Assistant ready. Ask me anything about the current weather, storms, or conditions at your location.');
}
function toggleAIChat(){
  const o=document.getElementById('ai-chat-overlay');
  if(!o)return;
  _aiChatOpen=!_aiChatOpen;
  o.style.display=_aiChatOpen?'block':'none';
  if(_aiChatOpen){
    const msgs=document.getElementById('ai-chat-messages');
    if(msgs&&!msgs.children.length){
      addAIMsg('system','🤖 AI Weather Assistant ready. Ask me anything about the current weather, storms, or conditions at your location.');
    }
    setTimeout(()=>{const inp=document.getElementById('ai-chat-input');if(inp)inp.focus()},200);
  }
}
function fmtAIText(raw){
  let s=raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/__(.+?)__/g,'<u>$1</u>');
  const _aiColors={red:'#ff3355',orange:'#f97316',yellow:'#eab308',green:'#22c55e',cyan:'#00e5ff'};
  s=s.replace(/\[!(red|orange|yellow|green|cyan)\]([\s\S]+?)\[\/!\]/g,(m,c,t)=>`<span style="color:${_aiColors[c]};font-weight:600">${t}</span>`);
  s=s.replace(/\[!dbz:(-?\d+(?:\.\d+)?)\]([\s\S]+?)\[\/!\]/g,(m,n,t)=>{const c=(typeof dbzHex==='function')?dbzHex(parseFloat(n)):'#888';return `<span style="color:${c};font-weight:600">${t}</span>`;});
  s=s.replace(/\*\*\*(.+?)\*\*\*/g,'<b><i>$1</i></b>');
  s=s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  s=s.replace(/\*(.+?)\*/g,'<i>$1</i>');
  s=s.replace(/^### (.+)$/gm,'<span style="display:block;font-weight:700;font-size:0.95em;color:var(--accent-cyan);margin-top:8px">$1</span>');
  s=s.replace(/^## (.+)$/gm,'<span style="display:block;font-weight:700;font-size:1em;color:var(--accent-cyan);margin-top:8px">$1</span>');
  s=s.replace(/^# (.+)$/gm,'<span style="display:block;font-weight:800;font-size:1.05em;color:var(--accent-cyan);margin-top:8px">$1</span>');
  s=s.replace(/^[-•] (.+)$/gm,'<span style="display:block;padding-left:12px;text-indent:-10px">• $1</span>');
  s=s.replace(/^\d+\.\s+(.+)$/gm,function(m,p1,offset,str){return '<span style="display:block;padding-left:12px">'+m+'</span>'});
  return s;
}
function stripAIMarkup(raw){
  return String(raw||'')
    .replace(/\[!dbz:[^\]]+\]([\s\S]+?)\[\/!\]/g,'$1')
    .replace(/\[!(red|orange|yellow|green|cyan)\]([\s\S]+?)\[\/!\]/g,'$2')
    .replace(/__(.+?)__/g,'$1')
    .replace(/\*\*\*(.+?)\*\*\*/g,'$1')
    .replace(/\*\*(.+?)\*\*/g,'$1')
    .replace(/\*(.+?)\*/g,'$1');
}
function addAIMsg(role,text){
  const c=document.getElementById('ai-chat-messages');if(!c)return;
  const d=document.createElement('div');
  d.className='ai-msg '+role;
  if(role==='assistant'){
    d.dataset.rawText=text;
    d.innerHTML=`<div class="ai-msg-actions"><button class="ai-copy-btn" onclick="copyAIMsg(this)" title="Copy to clipboard">📋</button></div>`+fmtAIText(text);
  }else{
    d.textContent=text;
  }
  c.appendChild(d);
  c.scrollTop=c.scrollHeight;
}
function copyAIMsg(btn){
  const msg=btn.closest('.ai-msg');if(!msg)return;
  const raw=msg.dataset.rawText||msg.textContent;
  const header=`StormTracker Weather Briefing\n${S.locName||'Unknown Location'} — ${new Date().toLocaleString()}\n${'─'.repeat(40)}\n\n`;
  const fullText=header+stripAIMarkup(raw);
  navigator.clipboard.writeText(fullText).then(()=>{
    btn.textContent='✅';setTimeout(()=>{btn.textContent='📋'},1500);
  }).catch(()=>{
    const ta=document.createElement('textarea');
    ta.value=fullText;ta.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent='✅';setTimeout(()=>{btn.textContent='📋'},1500);
  });
}
function showAITyping(){
  const c=document.getElementById('ai-chat-messages');if(!c)return;
  const d=document.createElement('div');d.className='ai-typing';d.id='ai-typing-ind';
  d.innerHTML='<span></span><span></span><span></span>';
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}
function hideAITyping(){const e=document.getElementById('ai-typing-ind');if(e)e.remove();}
function aiQuickQ(q){
  const inp=document.getElementById('ai-chat-input');
  if(inp)inp.value=q;
  sendAIChat();
}

function buildWeatherContext(){
  const parts=[];
  const now=new Date();
  parts.push(`Current time: ${now.toLocaleString()}`);
  if(S.locName)parts.push(`Location: ${S.locName} (${S.lat?.toFixed(4)}, ${S.lon?.toFixed(4)})`);
  parts.push(`Scan radius: ${S.radarMetric?(S.scanRadius*1.60934).toFixed(0)+' km':S.scanRadius+' miles'}`);
  parts.push(`USER UNITS: temperature=${TEMP_UNITS[S.tempUnit]}, wind=${WIND_UNITS[S.windUnit]}, pressure=${PRES_UNITS[S.presUnit]}, visibility=${VIS_UNITS[S.visUnit]}, precipitation=${PRECIP_UNITS[S.precipUnit]}, distance=${S.radarMetric?'km':'mi'}`);

  try{
  if(S.weather){
    const w=S.weather;
    const tempC=w.temperature_2m;
    const feelsC=w.apparent_temperature;
    const humid=w.relative_humidity_2m;
    const windKmh=w.wind_speed_10m;
    const windDeg=w.wind_direction_10m;
    const windDir=windDeg!=null?degToDir(windDeg)+' ('+Math.round(windDeg)+'°)':null;
    const gustKmh=w.wind_gusts_10m;
    const precip=w.precipitation;
    const cloud=w.cloud_cover;
    const pres=w.pressure_msl||w.surface_pressure;
    const isDay=w.is_day;
    const nwsDesc=w._nwsDesc;
    const src=w._source||'Open-Meteo';
    parts.push(`\nCURRENT CONDITIONS (source: ${src}):`);
    if(tempC!=null)parts.push(`  Temperature: ${fmtTemp(tempC)}`);
    if(feelsC!=null)parts.push(`  Feels like: ${fmtTemp(feelsC)}`);
    if(humid!=null)parts.push(`  Humidity: ${humid}%`);
    if(windKmh!=null)parts.push(`  Wind: ${windDir||'?'} at ${fmtWind(windKmh)}${gustKmh!=null?' gusts '+fmtWind(gustKmh):''}`);
    if(pres!=null)parts.push(`  Pressure: ${fmtPres(pres)}`);
    if(precip!=null)parts.push(`  Precipitation: ${fmtPrecip(precip)}`);
    if(cloud!=null)parts.push(`  Cloud cover: ${cloud}%`);
    if(S._nwsVisM!=null)parts.push(`  Visibility: ${fmtVis(S._nwsVisM/1609.34)}`);
    if(nwsDesc)parts.push(`  Conditions: ${nwsDesc}`);
    if(isDay!=null)parts.push(`  Day/Night: ${isDay?'Daytime':'Nighttime'}`);
  }else{
    parts.push('\nCurrent conditions: Data not yet loaded. Weather may still be fetching.');
  }

  if(S.station){
    const st=S.station;
    parts.push(`\nMETAR STATION DATA (${S.stationId||'unknown'}):`);
    if(st.rawMETAR)parts.push(`  Raw METAR: ${st.rawMETAR}`);
    if(st.name)parts.push(`  Station: ${st.name}`);
    if(st.temp!=null)parts.push(`  METAR Temp: ${fmtTemp(st.temp)}`);
    if(st.dewp!=null)parts.push(`  Dew point: ${fmtTemp(st.dewp)}`);
    if(st.windKmh!=null){
      const wDir=st.windDir!=null?degToDir(st.windDir):'VRB';
      parts.push(`  METAR Wind: ${wDir} at ${fmtWind(st.windKmh)}${st.gustKmh!=null?' gusts '+fmtWind(st.gustKmh):''}`);
    }
    if(st.visMeter!=null)parts.push(`  Visibility: ${fmtVis(st.visMeter/1609.34)}`);
    if(st.presPa!=null)parts.push(`  Pressure: ${fmtPres(st.presPa/100)}`);
    const visSM=st.visMeter!=null?(st.visMeter/1609.34):null;
    const fltInfo=getFltCatDetail(visSM,st);
    if(fltInfo)parts.push(`  Flight category: ${fltInfo.cat}`);
    if(st.wxString)parts.push(`  Weather: ${st.wxString}`);
    if(st.clouds&&st.clouds.length){
      const cStr=st.clouds.map(c=>`${c.amount||'?'} at ${c.base?.value!=null?fmtAlt(c.base.value*3.28084):'?'}`).join(', ');
      parts.push(`  Cloud layers: ${cStr}`);
    }
  }

  // STORM CONTEXT — consume the SAME post-filter snapshot the Storms tab cards
  // and System Briefing render from, so all three surfaces agree on the cell
  // list. This block replaces the prior raw-storm rebuild.
  if(S.storms&&S.storms.length){
    const fs=(typeof getFilteredStorms==='function')
      ?getFilteredStorms()
      :{storms:S.storms,filter:null,totalCount:S.storms.length,hiddenCount:0};
    const f=fs.filter;
    const filterActive=!!(f&&((f.minDbz|0)>0||(f.maxDist|0)>0||f.approachOnly||f.threatsOnly));
    const distU=S.radarMetric?'km':'mi';
    parts.push(`\nSTORM FILTER (user-controlled Storms-tab filter — these are the ONLY cells the user is looking at; do NOT mention cells outside this filter):`);
    if(filterActive){
      if((f.minDbz|0)>0)parts.push(`  - Min dBZ: ${f.minDbz} (cells below this are hidden by the user)`);
      if((f.maxDist|0)>0)parts.push(`  - Max distance: ${f.maxDist} ${distU} (cells beyond are hidden)`);
      if(f.approachOnly)parts.push(`  - Approaching only: ON (passing / moving-away cells are hidden)`);
      if(f.threatsOnly)parts.push(`  - Threats only: ON (only direct / near_direct / near_miss cells are shown)`);
      parts.push(`  - Sort: ${f.sort1||'threat'} then ${f.sort2||'eta'}`);
      parts.push(`  - Showing ${fs.totalCount-fs.hiddenCount} of ${fs.totalCount} cells (${fs.hiddenCount} hidden by your filters)`);
    }else{
      parts.push(`  - No filter active — all ${fs.totalCount} scanned cells are eligible.`);
    }

    let d=null;
    try{if(typeof gatherBriefingData==='function')d=gatherBriefingData();}catch(e){console.warn('briefing data error',e)}
    const c=d&&d.classified;
    if(c){
      const inboundTop=c.inboundTop||[];
      const inboundRest=c.inboundRest||[];
      const inboundLight=c.inboundLight||[];
      const bg=c.background||[];
      const passing=c.passing||[];
      const away=c.away||[];
      const sigCount=c.inbound.filter(it=>it.s.dbz>=31).length;
      const lowCount=inboundLight.length;
      parts.push(`\nSTORM DATA (inbound = post-filter mirror of Storms tab; non-inbound = FULL unfiltered scan radius for situational awareness):`);
      const modCount=c.inbound.length-sigCount-lowCount;
      const unfilt=c.unfilteredTotal!=null?c.unfilteredTotal:fs.totalCount;
      const hiddenInbound=bg.filter(it=>it._hiddenInbound).length;
      parts.push(`  Total cells: ${fs.totalCount} scanned · ${c.totalCount} after user filter · ${unfilt} total in scan radius (used for non-inbound buckets) · ${c.inbound.length} inbound after filter (${sigCount} significant ≥31 dBZ, ${modCount} moderate 25-30 dBZ, ${lowCount} light/drizzle <25 dBZ at >5 mi) · ${bg.length} background · ${passing.length} passing · ${away.length} moving away${hiddenInbound>0?` · NOTE: ${hiddenInbound} inbound cell(s) hidden by your filter are listed in background for awareness`:''}`);
      if(sigCount===0&&lowCount===0&&c.inbound.length===0&&c.totalCount>0){
        parts.push(`  NOTE: No inbound cells in the filtered view. Background / passing / moving-away cells are off the impact corridor, but they are still REAL ECHOES the user can see on radar — narrate them in the mandatory "Surrounding Picture:" wrap-up using the SCENE HINTS lines below. Do NOT dismiss them as "clutter" or skip the wrap-up.`);
      }else if(sigCount===0&&lowCount>0){
        parts.push(`  Inbound is ALL light rain (15-30 dBZ) — LEAD with these inbound cells; do NOT call this severe weather.`);
      }
      if(c.inbound.length){
        const peakDbz=Math.max(...c.inbound.map(it=>it.s.dbz));
        const peakCat=peakDbz>=65?'EXTREME (severe-hail signature likely)':peakDbz>=60?'SEVERE (hail possible)':peakDbz>=55?'MODERATE-SEVERE (strong core, not auto-severe)':peakDbz>=45?'MODERATE-HEAVY':peakDbz>=30?'MODERATE':'LIGHT';
        parts.push(`  Peak inbound intensity: ${peakDbz} dBZ [${peakCat}].`);
      }
      const fmtD=(mi)=>{const r=Math.round(mi*10)/10;return S.radarMetric?(r*1.60934).toFixed(1)+' km':r.toFixed(1)+' mi';};
      const tierLbl={direct:'DIRECT',near_direct:'NEAR DIRECT',near_miss:'NEAR MISS',miss:'MISS',distant:'DISTANT',far:'FAR',passing:'PASSING',moving_away:'MOVING AWAY'};
      const tierEmo={direct:'🔴',near_direct:'🟠',near_miss:'🟡',miss:'🔵',distant:'⚪',far:'⚫',passing:'🟡',moving_away:'🟢'};
      for(const it of inboundTop){
        const s=it.s,b=it.b||{};
        const e=tierEmo[it.tier]||'⚫',lbl=tierLbl[it.tier]||(it.tier||'').toUpperCase();
        const close=b.closingMph!=null?((b.closingMph>=0?'+':'')+b.closingMph+' mph'):'?';
        const miss=b.perpMissMi!=null?b.perpMissMi.toFixed(1)+' mi':'?';
        const eta=b.etaMin!=null?`, ETA ~${b.etaMin} min (${(typeof fmtClock==='function')?fmtClock(new Date(Date.now()+b.etaMin*60000)):''})`:'';
        const pct=b.closenessPct!=null?` (${b.closenessPct}% max intensity at user)`:'';
        const estDbz=b.estDbzAtUser!=null?`, ~${b.estDbzAtUser} dBZ expected at user`:'';
        const mov=(b.movSpdMph&&b.movDirDeg!=null)?` (motion ${degToDir(b.movDirDeg)} @ ${b.movSpdMph} mph)`:'';
        parts.push(`  ${e} ${lbl}${pct}: ${s.dbz} dBZ cell at ${fmtD(s.distance)} ${degToDir(s.bearing)} closing ${close}${eta}, projected miss ${miss}${estDbz}${mov}.`);
      }
      if(inboundRest.length){
        const peak=Math.max(...inboundRest.map(it=>it.s.dbz));
        parts.push(`  ➕ +${inboundRest.length} more inbound cell(s), peak ${peak} dBZ — see Storms tab for full list.`);
      }
      if(inboundLight.length){
        const peak=Math.max(...inboundLight.map(it=>it.s.dbz));
        const dMin=Math.min(...inboundLight.map(it=>it.s.distance));
        const dMax=Math.max(...inboundLight.map(it=>it.s.distance));
        parts.push(`  💧 ${inboundLight.length} light cell(s) (sprinkles/drizzle, ≤${peak} dBZ) through ${fmtD(dMin)}–${fmtD(dMax)} — minor reflectivity, not actionable.`);
      }
      const _ts=S._topStormAnalysis;
      if(_ts&&_ts.overhead&&_ts.overhead.length){
        parts.push(`  ⚠️ OVERHEAD / ARRIVED: ${_ts.overhead.length} cell(s) currently inside the user's storm cone.`);
        for(const s of _ts.overhead.slice(0,3)){
          parts.push(`    - ${s.dbz} dBZ at ${fmtD(s.distance)} ${degToDir(s.bearing)} (in cone).`);
        }
      }
      const _bgGroup=(tier,label,emoji)=>{
        const cells=bg.filter(it=>it.tier===tier);
        if(!cells.length)return;
        const dbzMin=Math.min(...cells.map(it=>it.s.dbz));
        const dbzMax=Math.max(...cells.map(it=>it.s.dbz));
        const dMin=Math.min(...cells.map(it=>it.s.distance)),dMax=Math.max(...cells.map(it=>it.s.distance));
        const dRange=cells.length===1?fmtD(cells[0].s.distance):`${fmtD(dMin)}–${fmtD(dMax)}`;
        const dirs=[...new Set(cells.map(it=>degToDir(it.s.bearing)))].slice(0,4);
        parts.push(`  ${emoji} ${label}: ${cells.length} cell(s) (${dbzMin===dbzMax?dbzMin+' dBZ':dbzMin+'-'+dbzMax+' dBZ'}) ${dirs.join('/')} at ${dRange}.`);
      };
      _bgGroup('miss','MISS','🔵');
      _bgGroup('distant','DISTANT','⚪');
      _bgGroup('far','FAR','⚫');
      if(passing.length){
        const dbzMax=Math.max(...passing.map(it=>it.s.dbz));
        const dirs=[...new Set(passing.map(it=>degToDir(it.s.bearing)))].slice(0,3);
        parts.push(`  🟡 PASSING: ${passing.length} cell(s) (up to ${dbzMax} dBZ) tracking past to the ${dirs.join('/')}.`);
      }
      if(away.length){
        const dbzMax=Math.max(...away.map(it=>it.s.dbz));
        const dirs=[...new Set(away.map(it=>degToDir(it.s.bearing)))].slice(0,3);
        parts.push(`  🟢 MOVING AWAY: ${away.length} cell(s) (up to ${dbzMax} dBZ) receding to the ${dirs.join('/')}.`);
      }
      // v4.52: Explicit per-cell list of every non-inbound cell ≥45 dBZ so the
      // AI can name them individually (distance, bearing, dBZ, motion, threat
      // verdict) instead of collapsing them into a vague "20-55 dBZ ring".
      // Per user request: "anything over 45 dBZ should mention the distance,
      // direction, and movement, e.g. 'the strongest storm on radar is 25 mi
      // NE of you with a strength of 55 dBZ moving N at 12 mph, poses no risk'."
      const _strongNonInbound=[...bg,...passing,...away]
        .filter(it=>it.s.dbz>=45)
        .sort((a,b)=>b.s.dbz-a.s.dbz)
        .slice(0,12);
      if(_strongNonInbound.length){
        parts.push(`\nSTRONG NON-INBOUND CELLS (≥45 dBZ, outside the impact corridor — every one of these MUST be named individually in the "Elsewhere on Radar" subsection with distance, direction, dBZ, motion, and a brief threat verdict):`);
        const tierEmo2={miss:'🔵',distant:'⚪',far:'⚫',passing:'🟡',moving_away:'🟢',unknown:'⚫'};
        const tierLbl2={miss:'MISS',distant:'DISTANT',far:'FAR',passing:'PASSING',moving_away:'MOVING AWAY',unknown:'UNKNOWN'};
        for(const it of _strongNonInbound){
          const s=it.s,b=it.b||{};
          const e=tierEmo2[it.tier]||'⚫';
          const lbl=tierLbl2[it.tier]||(it.tier||'').toUpperCase();
          const mov=(b.movSpdMph&&b.movDirDeg!=null)?`moving ${degToDir(b.movDirDeg)} at ${b.movSpdMph} mph`:'motion unknown';
          const miss=b.perpMissMi!=null?`, projected miss ${b.perpMissMi.toFixed(1)} mi`:'';
          const close=b.closingMph!=null?`, closing ${(b.closingMph>=0?'+':'')+b.closingMph} mph`:'';
          const verdict=it.tier==='moving_away'?'receding — no threat'
            :it.tier==='passing'?'tangent track — no impact'
            :it._hiddenInbound?'inbound but hidden by your filter — review filter'
            :(b.perpMissMi!=null&&b.perpMissMi>24)?'well clear — no threat'
            :'background context only';
          parts.push(`  ${e} ${lbl}: ${s.dbz} dBZ cell at ${fmtD(s.distance)} ${degToDir(s.bearing)} of user, ${mov}${miss}${close} — ${verdict}.`);
        }
      }
      // v4.36: Precomputed scene-hint phrasings so the model has ready-made
      // narrative phrasings to anchor the mandatory "Surrounding Picture"
      // wrap-up sentence on (see DETAIL vs MENTAL PICTURE rule in the prompt).
      const _scenify=(cells,verb)=>{
        if(!cells.length)return null;
        const dbzMin=Math.min(...cells.map(it=>it.s.dbz));
        const dbzMax=Math.max(...cells.map(it=>it.s.dbz));
        const dMin=Math.min(...cells.map(it=>it.s.distance));
        const dMax=Math.max(...cells.map(it=>it.s.distance));
        const dirs=[...new Set(cells.map(it=>degToDir(it.s.bearing)))];
        const dirStr=dirs.length===1?dirs[0]:dirs.length===2?dirs.join(' and '):dirs.slice(0,3).join('/');
        const dbzStr=dbzMin===dbzMax?`${dbzMin} dBZ`:`${dbzMin}-${dbzMax} dBZ`;
        const dStr=Math.abs(dMax-dMin)<2?fmtD(dMin):`${fmtD(dMin)}-${fmtD(dMax)}`;
        const geom=cells.length===1?'a lone cell':cells.length<=3?'a small cluster':cells.length<=8?'a band':'a ring of returns';
        return `${geom} (${dbzStr}) ${dStr} to the ${dirStr}, ${verb}`;
      };
      const _allBg=[...bg];
      const _hBg=_scenify(_allBg,'sitting in the background');
      const _hPass=_scenify(passing,'tracking past, outside the impact corridor');
      const _hAway=_scenify(away,'drifting away from you');
      if(_hBg||_hPass||_hAway){
        parts.push(`\nSCENE HINTS (ready-made phrasings — quote, rephrase, or combine into the mandatory Surrounding Picture wrap-up):`);
        if(_hBg)parts.push(`  • Background: ${_hBg}`);
        if(_hPass)parts.push(`  • Passing: ${_hPass}`);
        if(_hAway)parts.push(`  • Moving away: ${_hAway}`);
      }else{
        // Always emit a deterministic SCENE HINTS line so the mandatory wrap-up
        // never has to be invented from scratch — works for both "inbound but
        // nothing else" and "all clear" cases.
        parts.push(`\nSCENE HINTS: nothing else of note on radar — write the wrap-up as "Surrounding Picture: nothing else of note on radar — the inbound cells above are the whole story." (verbatim if there are inbound cells; lightly rephrased to "the rest of the scan is quiet" if not).`);
      }
    }else{
      parts.push(`\nSTORM DATA: briefing engine unavailable, ${fs.storms.length} cells after filter.`);
    }
    if(S.stormMovement&&S.stormMovement.speed>=2){
      parts.push(`  General storm movement: ${degToDir(S.stormMovement.direction)} at ${fmtWind(S.stormMovement.speed*1.60934)}`);
    }
    // STORMS TAB FORECAST — the exact tier-labeled bullets shown at the top of
    // the Storms tab ("🔵 Light rain inbound starting in 25m:28s — 102 cells", etc).
    try{
      if(typeof buildStormForecastLines==='function'){
        const fl=buildStormForecastLines(true);
        if(fl.empty){
          parts.push(`\nSTORMS TAB FORECAST: No storms currently approaching your location.`);
        }else if(fl.lines&&fl.lines.length){
          parts.push(`\nSTORMS TAB FORECAST (verbatim from the Storms tab header):`);
          for(const ln of fl.lines)parts.push(`  ${ln}`);
        }
      }
    }catch(e){console.warn('forecast lines error',e)}
  }else{
    parts.push('\nSTORM DATA: No storm cells currently detected in scan radius.');
  }

  if(S.alerts&&S.alerts.length){
    parts.push(`\nACTIVE NWS ALERTS (${S.alerts.length}) — same wording shown on the Alerts tab:`);
    for(const a of S.alerts.slice(0,8)){
      const p=a.properties||a;
      let line=`  ⚠ ${p.event||p.headline||'Alert'}`;
      if(p.severity)line+=` [Severity: ${p.severity}]`;
      if(p.urgency)line+=` [Urgency: ${p.urgency}]`;
      if(p.onset)line+=` [Onset: ${p.onset}]`;
      else if(p.effective)line+=` [Effective: ${p.effective}]`;
      if(p.ends)line+=` [Ends: ${p.ends}]`;
      else if(p.expires)line+=` [Expires: ${p.expires}]`;
      if(p.areaDesc)line+=`\n    Area: ${String(p.areaDesc).substring(0,200)}`;
      if(p.description){
        const desc=p.description.replace(/\n/g,' ').substring(0,1200);
        line+=`\n    ${desc}`;
      }
      if(p.instruction){
        const ins=p.instruction.replace(/\n/g,' ').substring(0,500);
        line+=`\n    Instruction: ${ins}`;
      }
      parts.push(line);
    }
  }

  if(S.forecast&&S.forecast.hourly){
    const h=S.forecast.hourly;
    const nowIdx=h.time?h.time.findIndex(t=>new Date(t)>=now):0;
    const startIdx=Math.max(0,nowIdx);
    parts.push('\nHOURLY FORECAST (next 8 hours):');
    for(let i=startIdx;i<Math.min(startIdx+8,h.time?.length||0);i++){
      const t=h.time[i];
      const tC=h.temperature_2m?h.temperature_2m[i]:null;
      const pop=h.precipitation_probability?h.precipitation_probability[i]:'?';
      const prec=h.precipitation?h.precipitation[i]:0;
      const wKmh=h.wind_speed_10m?h.wind_speed_10m[i]:null;
      const gKmh=h.wind_gusts_10m?h.wind_gusts_10m[i]:null;
      const hr=fmtClockShort(new Date(t));
      let line=`  ${hr}: ${tC!=null?fmtTemp(tC):'?'}, ${pop}% precip chance`;
      if(prec>0)line+=` (${fmtPrecip(prec)})`;
      line+=`, wind ${wKmh!=null?fmtWind(wKmh):'?'}`;
      if(gKmh!=null&&wKmh!=null&&gKmh>wKmh+8)line+=` gusts ${fmtWind(gKmh)}`;
      parts.push(line);
    }
  }

  if(S.forecast&&S.forecast.daily){
    const d=S.forecast.daily;
    parts.push('\n7-DAY FORECAST:');
    for(let i=0;i<Math.min(7,d.time?.length||0);i++){
      const day=new Date(d.time[i]+'T12:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
      const hiC=d.temperature_2m_max?d.temperature_2m_max[i]:null;
      const loC=d.temperature_2m_min?d.temperature_2m_min[i]:null;
      const pop=d.precipitation_probability_max?d.precipitation_probability_max[i]:'?';
      const precSum=d.precipitation_sum?d.precipitation_sum[i]:0;
      const wMaxKmh=d.wind_speed_10m_max?d.wind_speed_10m_max[i]:null;
      let line=`  ${day}: Hi ${hiC!=null?fmtTemp(hiC):'?'} / Lo ${loC!=null?fmtTemp(loC):'?'}, ${pop}% precip`;
      if(precSum>0)line+=` (${fmtPrecip(precSum)})`;
      line+=`, max wind ${wMaxKmh!=null?fmtWind(wMaxKmh):'?'}`;
      parts.push(line);
    }
  }

  if(S.forecast&&S.forecast._nwsForecast&&S.forecast._nwsForecast.length){
    parts.push('\nNWS FORECAST PERIODS:');
    for(const p of S.forecast._nwsForecast.slice(0,6)){
      parts.push(`  ${p.name}: ${p.detailedForecast||p.shortForecast||''}`);
    }
  }

  if(S._afd&&S._afd.discussion){
    parts.push(`\n=== AREA FORECAST DISCUSSION ===`);
    parts.push(`NWS Office: ${S._afd.office}`);
    if(S._afd.issuedAt)parts.push(`Issued: ${S._afd.issuedAt}`);
    parts.push(`Forecaster Discussion:\n${S._afd.discussion}`);
  }

  if(S._aloftData&&S._aloftData.length){
    const pToAlt={1013:'Surface (10m)',925:'~2,500 ft (925 hPa)',850:'~5,000 ft (850 hPa)',700:'~10,000 ft (700 hPa)',500:'~18,000 ft (500 hPa)'};
    parts.push(`\n=== WINDS ALOFT (STORM STEERING) ===`);
    for(const a of S._aloftData){
      const alt=pToAlt[a.p]||a.p+'hPa';
      parts.push(`  ${alt}: ${degToDir(a.dir)} (${Math.round(a.dir)}°) at ${fmtWind(a.spd)}`);
    }
  }

  const shearInfo=getWindShearAnalysis();
  if(shearInfo){
    parts.push(`\nWIND SHEAR ANALYSIS (NWS/Aviation Standard):`);
    parts.push(`  Vector shear magnitude: ${shearInfo.vectorShear} (${shearInfo.severity})`);
    parts.push(`  Directional change: ${shearInfo.dirDiff}°`);
    parts.push(`  Surface: ${shearInfo.surfaceWind}`);
    parts.push(`  Upper level: ${shearInfo.upperWind}`);
    parts.push(`  Aviation impact: ${shearInfo.impact}`);
  }

  const stab=getStabilityData();
  if(stab){
    parts.push(`\n=== THUNDERSTORM FORMATION ANALYSIS ===`);
    parts.push(`The Three Essential Conditions for Thunderstorm Development:`);
    parts.push(`\n1. MOISTURE (${stab.moistRat}/10):`);
    if(stab.humid!=null)parts.push(`  Relative Humidity: ${stab.humid}%`);
    if(stab.dewp!=null)parts.push(`  Dew Point: ${fmtTemp(stab.dewp)}`);
    if(stab.temp!=null&&stab.dewp!=null)parts.push(`  Temp-Dewpoint Spread: ${fmtTempDiff(stab.temp-stab.dewp)}`);
    parts.push(`\n2. ATMOSPHERIC STABILITY (${stab.stabRat}/10):`);
    parts.push(`  CAPE: ${stab.cape||0} J/kg`);
    parts.push(`  Lifted Index: ${stab.li!=null?stab.li.toFixed(1)+'°C ('+cToF(stab.li)+'°F)':'?'} (negative = unstable)`);
    if(stab.cin!=null)parts.push(`  Convective Inhibition (CIN): ${stab.cin} J/kg`);
    parts.push(`  Assessment: ${stab.stabDesc}`);
    parts.push(`\n3. LIFTING MECHANISMS (${stab.liftRat}/10):`);
    if(S._windShear)parts.push(`  Wind shear: ${fmtWind(S._windShear.speedDiff)} speed diff, ${S._windShear.dirDiff}° directional`);
    parts.push(`\nOVERALL THUNDERSTORM POTENTIAL: ${stab.overall}/10 (${stab.risk})`);
  }

  if(S._terrainData){
    const td=S._terrainData;
    parts.push(`\nTERRAIN ANALYSIS:`);
    parts.push(`  User elevation: ${fmtAlt(td.userElev*3.281)}`);
    parts.push(`  Local relief: ${fmtAlt(td.relief*3.281)}`);
    if(td.valleys.length)parts.push(`  Valley channels: ${td.valleys.map(v=>`${v.dir}° (${Math.abs(v.diff).toFixed(0)}m deep)`).join(', ')}`);
    if(td.ridges.length)parts.push(`  Ridge barriers: ${td.ridges.map(r=>`${r.dir}° (${r.diff.toFixed(0)}m high)`).join(', ')}`);
    if(td.valleys.length||td.ridges.length)parts.push(`  Note: Valleys can channel storms, ridges can block/deflect weaker cells`);
  }
  if(S._cellTracks&&Object.keys(S._cellTracks).length){
    parts.push(`\nCELL TRACKING: ${Object.keys(S._cellTracks).length} individually tracked cells`);
    const tracks=Object.values(S._cellTracks).sort((a,b)=>b.dbz-a.dbz).slice(0,5);
    for(const t of tracks){
      parts.push(`  Cell at ${t.toLat.toFixed(2)},${t.toLng.toFixed(2)}: ${t.dbz}dBZ, moving ${t.dir}° at ${fmtWind(t.speed*1.60934)}`);
    }
  }

  }catch(e){
    parts.push('\n[Error building weather context: '+e.message+']');
  }

  return parts.join('\n');
}

function getAISystemPrompt(){
  const tone=getAITone();
  const detail=getAIDetail();
  const ctx=buildWeatherContext();

  let toneInstr='';
  if(tone==='professional')toneInstr='Use a professional, clear meteorological briefing style. Be precise and factual.';
  else if(tone==='friendly')toneInstr='Be warm, conversational, and approachable. Use everyday language while keeping accuracy.';
  else if(tone==='humorous')toneInstr='Be witty and entertaining while keeping safety info serious. Light humor about non-dangerous conditions.';

  let detailInstr='';
  if(detail==='minimal')detailInstr='Keep responses brief — 2-3 sentences max focusing on essentials.';
  else if(detail==='standard')detailInstr='Provide balanced detail with key data points and practical guidance.';
  else if(detail==='technical')detailInstr='Include detailed meteorological analysis with specific measurements, dBZ values, wind shear analysis, and professional terminology.';

  const hasExtreme=S.storms&&S.storms.some(st=>st&&st.dbz>=65);
  const hasSevere=S.storms&&S.storms.some(st=>st&&st.dbz>=60);
  const hasHigh=S.storms&&S.storms.some(st=>st&&st.dbz>=45);
  const hasAlerts=S.alerts&&S.alerts.length>0;
  const hasExtremeAlert=S.alerts&&S.alerts.some(a=>(a.properties||a).severity==='Extreme');
  const hasSevereAlert=S.alerts&&S.alerts.some(a=>(a.properties||a).severity==='Severe');
  let urgencyPrefix='Weather looks good:';
  let urgencyStyle='Use relaxed, conversational tone.';
  if(hasExtreme||hasExtremeAlert){
    urgencyPrefix='URGENT WEATHER ALERT:';
    urgencyStyle='Use direct, urgent, life-safety focused language. Be concise and clear about immediate threats. No humor. Start with active alerts and extreme storms.';
  }else if(hasSevere||hasSevereAlert){
    urgencyPrefix='Weather Advisory:';
    urgencyStyle='Use professional, clear language with focus on safety guidance. Be direct but not alarming. Prioritize discussing active alerts.';
  }else if(hasHigh||hasAlerts){
    urgencyPrefix='Weather Update:';
    urgencyStyle='Use balanced professional tone with clear explanations. Maintain awareness without alarm. Discuss active weather alerts before other conditions.';
  }

  return `You are a senior NWS-trained meteorologist and certified aviation weather specialist serving as the embedded AI briefer for the StormTracker app. Your audience ranges from everyday citizens checking if they need an umbrella, to GA pilots planning a flight, to boaters heading offshore. Adapt your language to serve all three — lead with what matters most to safety, then layer in technical detail.

Your professional standards:
- You brief like a WFO forecaster on a conference call: confident, specific, no waffling
- You reference actual data points (dBZ, CAPE, wind speeds, distances, ETAs) — never speak in vague generalities when you have numbers
- You distinguish between radar clutter and real precipitation (sub-22 dBZ with <12 returns = almost certainly clutter; say so clearly rather than warning about nonexistent rain). Cells in the 22-30 dBZ range ARE real light rain — when classified inbound (direct/near_direct/near_miss only, i.e. ≤12 mi projected miss with positive closing), acknowledge them as "light rain inbound" rather than calling them clutter or omitting them entirely. Cells beyond 12 mi miss (MISS/DISTANT/FAR) are NOT inbound — treat them as background context only.
- dBZ severity calibration: 30-44 dBZ = moderate rain; 45-54 dBZ = heavy rain / possible small hail; 55-59 dBZ = heavy core (strong but NOT automatically "severe"); 60-64 dBZ = very heavy, severe-hail signatures possible; 65+ dBZ = severe-hail signature likely. Do NOT label 55 dBZ as "severe" or invoke severe-hail language unless the cell is 60+ dBZ or NWS has an active severe warning on it.
- Storm motion is computed for you using vector projection (dot product of motion onto the storm-to-user vector). Each storm line tells you the classification:
    * Storms are classified by **perpendicular miss distance** from the user using a 6-tier ladder. Only DIRECT / NEAR DIRECT / NEAR MISS (≤12 mi miss with positive closing) count as INBOUND. Anything past 12 mi miss is NOT inbound — it is background context (MISS / DISTANT / FAR). Anything past 6 mi miss is NOT "approaching" / "direct" / "imminent".
      - 🔴 DIRECT (0-3 mi miss): bullet point, quote ETA, "expect overhead". Lead the section with these.
      - 🟠 NEAR DIRECT (3-6 mi miss): bullet point, quote ETA + brief downpour likely. Lead the section after DIRECT.
      - 🟡 NEAR MISS (6-12 mi miss): bullet only if dBZ ≥ 31 OR distance ≤ 20 mi; otherwise one-line summary. Do NOT call this "approaching" or "direct".
      - 🔵 MISS (12-24 mi miss): one-line summary unless dBZ ≥ 55. Not actionable for the user's location.
      - ⚪ DISTANT (24-48 mi miss): one-line summary only. Background context.
      - ⚫ FAR (48-60 mi miss): mention only if dBZ ≥ 55, otherwise omit.
    * "PASSING TO YOUR <DIR>" — the storm's projected track does not bring it toward the user at all. Summarize ALL passing-but-not-inbound cells in ONE sentence (e.g. "A few 45-55 dBZ cells are passing well SE/NE, outside the impact corridor"). Do NOT enumerate them individually unless one is 60+ dBZ within 20 mi. Do NOT manufacture an ETA.
    * "MOVING AWAY" — closing speed is zero or negative; the storm is receding. Summarize ALL moving-away cells in ONE sentence (count + dBZ range + general direction). Do NOT enumerate them individually. They are not actionable.
  ORDERING: The "Active Threats & Storm Tracking" section MUST lead with DIRECT and NEAR DIRECT cells (≤6 mi miss). Then NEAR MISS bullets if any qualify. Then MISS / DISTANT / FAR as one-line **background context** summaries (these are NOT inbound — do not count them in any "N inbound cells" claim). Then PASSING / MOVING AWAY as one-line summaries. Do NOT spend more lines on miss/distant/far/receding cells than on direct/near-direct cells. Cards with projected dBZ-at-user below 15 are hidden from the user — do not mention them.
- Impact score interpretation: every storm line gives you a percentage labelled "max intensity at user" plus an estimated dBZ ("~NN dBZ expected at user"). This is closeness-to-track × intensity. Use the estimated dBZ when describing what the user will actually experience at their location — do NOT quote the storm's peak dBZ as if that's what will hit the user when the projected miss is more than ~1 mi. Example: a 55 dBZ cell with projected miss 1.8 mi has ~52 dBZ expected at user (60% max-intensity) — describe the user experience as "heavy rain / 52 dBZ at your location" not "55 dBZ severe core overhead".
- Never invent ETAs, closing speeds, or miss distances. If the storm line does not give you an ETA, you must not state one.
- Risk Assessment intensity wording: when stating that storms do not exceed a given dBZ threshold (e.g. "no storms exceed 55 dBZ"), you MUST qualify whether the statement applies to inbound storms only or to all storms on radar. If stronger cells exist on radar but are classified PASSING or MOVING AWAY, explicitly call that out. Preferred phrasing: "No inbound storms exceed 55 dBZ. The only stronger cells are NE of your position and are moving away, posing no threat." Never make a bare intensity claim that could be read as contradicting the Active Threats section.
- Emoji color-coding for storms: every individual storm you mention in any section MUST be prefixed with the emoji that matches its perpMiss tier — 🔴 DIRECT (0-3 mi miss), 🟠 NEAR DIRECT (3-6 mi miss), 🟡 NEAR MISS (6-12 mi miss), 🔵 MISS (12-24 mi miss), ⚪ DISTANT (24-48 mi miss), ⚫ FAR (48-60 mi miss). For non-inbound motion classes use 🟡 PASSING and 🟢 MOVING AWAY. These emojis MUST match the badge shown on the storm's cell card. Place the emoji at the start of the storm reference, e.g. "🔴 DIRECT: [!dbz:52]52 dBZ[/!] cell 14 mi NW closing at +25 mph, ETA ~34 min" or "🟢 MOVING AWAY: [!dbz:55]55 dBZ[/!] cell NE closing at -18 mph, no threat". Always include the signed closing speed (+ for inbound, - for receding). Severity (dBZ level, hail, NWS warnings) is conveyed in words, not in the classification emoji.
- Rich text formatting: the briefing pane renders a limited markdown-style syntax. Use it sparingly and only where it adds clarity:
    * **bold** for safety-critical phrases ("seek shelter now", "tornado warning in effect", "do not drive through flooded roadways"). Never bold an entire paragraph.
    * *italic* for the first mention of a technical term (CAPE, lifted index, PWAT, etc.) so readers can spot it.
    * __underline__ for specific times and ETAs ("storm overhead __~34 min__", "expires __11:45 PM CDT__").
    * Semantic color tags for tier callouts — wrap the short status phrase only, never a whole sentence: [!red]severe / imminent threat[/!], [!orange]near miss / cone alert[/!], [!yellow]advisory / watch[/!], [!green]all-clear / receding[/!], [!cyan]atmospheric data[/!]. Example: "Conditions are [!red]critical[/!] — a confirmed tornado is **on the ground 6 mi SW** and tracking NE."
    * EVERY specific dBZ value you mention MUST be wrapped as [!dbz:NN]NN dBZ[/!] so the number renders in the master radar palette color for that intensity. Example: "A [!dbz:55]55 dBZ[/!] cell 14 mi NW closing at +25 mph." Use this everywhere — Situation Overview, Active Threats, Aviation, Marine — never write a bare "55 dBZ" without the tag. Decimals are allowed ([!dbz:47.5]47.5 dBZ[/!]).
  Do NOT use ###/##/# headers — section headers are already provided. Do NOT use raw HTML. Do NOT invent new color tags or hex codes. Do NOT wrap section headers in any formatting.
- Section headers: prefix each section header line with its topical emoji — 🌐 Situation Overview, ⛈️ Active Threats & Storm Tracking, 🚸 Public Safety & Outdoor Guidance, ✈️ Aviation & Marine Briefing. Headers stay on their own line, no markdown characters.
- Projected-miss phrasing: use natural language — "projected miss around NN mi". Only append "to your <direction>" if the direction has NOT already been stated earlier in the same bullet/sentence (e.g. the storm position "14 mi NW" or the classification label "PASSING TO YOUR NW" both count as already-stated). Never restate direction twice in the same sentence.
- Distances: round to 1 decimal place (e.g. "14.3 mi"). Don't repeat the same distance for multiple cells unless they are genuinely at the same range.
- Never invent PWAT (precipitable water) values. Only mention PWAT if it appears explicitly in the data above (it usually won't). If PWAT isn't given, talk about moisture using dewpoint / humidity / CAPE instead.
- Rip Current Statements: if an alert with event "Rip Current Statement" appears in ACTIVE NWS ALERTS, include the exact expiration time from the alert's Ends/Expires field. Do not paraphrase to "later today".
- Aviation section: when storms within ~30 mi are APPROACHING DIRECTLY or NEAR MISS, lead with convective hazards (turbulence, microburst, lightning, IFR in TSRA, icing if cold) rather than the VFR/MVFR ceiling-visibility category. It is misleading to call conditions VFR while severe turbulence is expected — if you mention the flight category, you must immediately qualify it with the convective threat.
- Marine section: when storms are approaching or grazing, explicitly note that gusty outflow winds (and a possible wind shift) may arrive before the storm core itself reaches the coast/water. Boaters should reduce sail and seek shelter ahead of the visible cell.
- When the Area Forecast Discussion is available, you synthesize it — explain what synoptic features are driving the weather, what the forecasters are confident about vs uncertain about, and what that means for the next 6-12 hours in plain language
- For calm weather, keep it brief and conversational — don't manufacture drama when conditions are benign
- For dangerous weather, drop all humor and be direct about life safety
- SINGLE SOURCE OF TRUTH: The STORM FILTER, STORM DATA, STORMS TAB FORECAST, and ACTIVE NWS ALERTS sections below are the EXACT cells and wording the user is looking at on the Storms and Alerts tabs after their filter is applied. Do not contradict, re-rank, or invent additional cells; do not reference cells outside the user's filter (passing / moving-away / sub-min-dBZ / beyond-max-distance cells are HIDDEN from the user). Mirror those numbers in your briefing so the user sees consistent counts, distances, ETAs, and dBZ values across the Storms tab, System Briefing, and AI Briefing. If the user's filter has hidden the strongest cells, acknowledge that explicitly ("with your Threats-only filter on, the 55 dBZ cell to the NE is hidden") rather than reaching for the raw scan.
- DETAIL vs MENTAL PICTURE: The user wants the inbound cells they're actively watching described in detail, and everything else painted as a quick visual scene — not a data dump.
    * **Detail (one bullet per cell)** for every DIRECT / NEAR DIRECT / NEAR MISS inbound cell with positive closing: state its distance, bearing, dBZ, projected miss, closing speed, ETA, and what the user will actually experience at their location. These are the cells the user is staring at on their Storms tab — they deserve specific numbers.
    * **Mental picture (one short narrative sentence per group)** for background (MISS / DISTANT / FAR), passing, and moving-away cells. Do NOT enumerate them cell-by-cell. Instead paint a scene the user can picture without reading: "a ring of light returns sits 25-35 mi to the NE, drifting away", "a band of moderate cells is sliding past well to your south", "a few weak echoes are scattered to the W, no threat". Use prepositions and geometry words (ring, band, line, cluster, arc, scattered, parked, drifting, sliding, receding) over numeric ranges.
    * Even if a non-inbound tier has only ONE cell, describe it as a scene ("a lone 35 dBZ cell is parked 18 mi west, holding station") — never as a bare data bullet.
    * If a passing-or-receding cell is the strongest thing on radar, you may quote its dBZ in the narrative sentence so the user understands what's out there, but still keep it to one sentence (e.g. "the strongest echo on the screen is a 52 dBZ cell tracking ENE about 22 mi to your N — passing well clear").
- MANDATORY TWO-SUBSECTION STRUCTURE for **Active Threats & Storm Tracking** (filtered first, then non-filtered for situational awareness). The user explicitly requested this layout — never collapse the two halves into one paragraph and never skip the second half.
    * **Subsection 1 — Inbound (in your impact corridor):** the per-cell bullets for DIRECT / NEAR DIRECT / NEAR MISS inbound cells, as defined by the DETAIL vs MENTAL PICTURE rule. Lead with these. These are the filtered cells the user sees on their Storms tab.
    * **Subsection 2 — Elsewhere on Radar (situational awareness):** a short prose block (1-4 sentences, NOT a bullet list) describing every NON-inbound bucket from the STORM DATA block. This subsection MUST be written whenever ANY of these counts is non-zero: background MISS / DISTANT / FAR cells, PASSING cells, MOVING AWAY cells, OR OVERHEAD / ARRIVED cells. Walk the user around the radar by direction (N, NE, E, SE, S, SW, W, NW), grouping cells with geometry/motion words (ring, band, line, cluster, arc, scattered, parked, drifting, sliding, receding). When a bucket contains cells stronger than the strongest inbound cell, you MUST quote its dBZ and direction explicitly so the user understands the heaviest activity on screen is being tracked, even if it isn't a threat to them. Example: "A heavy band of 50-55 dBZ cells is parked over your N-NE quadrant about 5-15 mi out, drifting NNE — they've already passed and are moving away from you, so no impact, but that's the loudest part of the screen right now." Use the SCENE HINTS lines below STORM DATA as ready-made phrasings to quote, rephrase, or combine.
    * **Header label:** prefix Subsection 2 with the literal label "**Elsewhere on Radar:**" (replacing the old "**Surrounding Picture:**" label). If the user later asks "what about the stuff to the north?" they should be able to find it under that label.
    * If ALL non-inbound buckets are empty (background, passing, moving away, AND overhead/arrived all zero), Subsection 2 reads exactly: "**Elsewhere on Radar:** nothing else of note on radar — the inbound cells above are the whole story."
    * Subsection 2 is **additive** to Subsection 1, not a replacement. Do not drop inbound bullets to make room for it, and do not skip Subsection 2 because Subsection 1 is already long.
    * NEVER write "no other notable storms" or "nothing else on radar" as a contradiction of the STORM DATA block. If STORM DATA shows non-zero counts in any non-inbound bucket, those cells exist on the user's screen and you MUST narrate them in Subsection 2.
    * **STRONG NON-INBOUND CELLS rule (≥45 dBZ):** the LIVE WEATHER DATA may include a "STRONG NON-INBOUND CELLS" block listing every non-inbound cell at 45 dBZ or higher with its exact distance, bearing, dBZ, motion, projected miss, and closing speed. When that block is present, you MUST mention **every single cell in it by name** inside Subsection 2 — do NOT roll them into a group sentence like "a ring of 20-55 dBZ echoes." Each one gets its own short sentence in the form: "🟢 The strongest cell on radar is a [!dbz:55]55 dBZ[/!] cell 25 mi NE of you, moving N at 12 mph — receding, no threat." Always lead with the strongest cell first (the block is pre-sorted by dBZ descending), use the threat verdict from the block, and quote the dBZ with the [!dbz:NN] tag. Group weaker (<45 dBZ) non-inbound cells with the geometry/motion narrative as before; only the ≥45 dBZ cells get individual call-outs.

${urgencyPrefix} ${urgencyStyle}
${toneInstr}
${detailInstr}

=== LIVE WEATHER DATA ===
${ctx}

RESPONSE FORMAT:
Write in flowing paragraphs under these section headers. Skip any section that has no relevant data — do NOT write a section just to say "no data available."

🌐 Situation Overview
Start here. What is happening and why. Synoptic setup, frontal positions, pressure patterns, and the AFD synthesis if available. What's driving today's weather and what changes are expected in the next 6-12 hours. This is the "big picture" paragraph that frames everything else.

⛈️ Active Threats & Storm Tracking
Only include if storms >= 31 dBZ exist OR active NWS alerts are present. Lead with alerts. The section is split into TWO mandatory subsections: first the **per-cell inbound bullets** (DIRECT / NEAR DIRECT / NEAR MISS only — the filtered cells the user sees on their Storms tab), then a **"Elsewhere on Radar:"** subsection (1-4 narrative sentences) that walks through the non-inbound buckets (background MISS/DISTANT/FAR, PASSING, MOVING AWAY, OVERHEAD/ARRIVED) by direction — this is situational awareness, not a wrap-up sentence. If a non-inbound cell is stronger than the strongest inbound cell, you MUST quote its dBZ and direction in the second subsection so the user understands the heaviest activity on screen is being tracked. If ALL non-inbound buckets are empty, the second subsection reads exactly: "Elsewhere on Radar: nothing else of note on radar — the inbound cells above are the whole story." See the MANDATORY TWO-SUBSECTION STRUCTURE rule above for full requirements; the second subsection is NOT optional.

🚸 Public Safety & Outdoor Guidance
Practical advice for the general public. Should you be outside? Driving risks? Heat/cold concerns? What to watch for and when conditions change. Keep this conversational and actionable.

✈️ Aviation & Marine Briefing
Combined section for pilots and mariners. IMPORTANT: Always include knots alongside the user's preferred wind unit if it is not knots (e.g. "SW at 35 km/h (19 kts)"). When any APPROACHING DIRECTLY or NEAR MISS storm exists within ~30 mi, LEAD with convective hazards (turbulence, microburst potential, lightning, IFR in TSRA, hail, icing if cold) — only mention the VFR/MVFR flight category after the convective threat is stated, and qualify it (e.g. "currently VFR but TSRA expected within 40 min"). When no storms threaten, lead with the flight category and limiting factor (ceiling vs visibility). Report winds aloft with altitudes. Wind shear assessment — note any shear exceeding 25 kts per 2,000 ft. Density altitude if available. METAR highlights. Then transition to marine conditions: surface wind sustained and gusts, small craft advisory or gale relevance, visibility over water, sea state estimation. When storms are direct/near-miss, explicitly note that outflow winds and a possible wind shift may arrive BEFORE the storm core. Thunderstorm avoidance guidance if applicable.

RULES:
- IMPORTANT: Use the units specified in USER UNITS for ALL measurements in your response. If the user has wind set to km/h, report winds in km/h — not mph or knots. If temperature is °C, use °C. If distance is km, use km. Match their preferences exactly.
- Reference specific numbers from the data whenever possible
- Never mention missing data sources — work with what you have
- Keep total response under 1200 words for standard detail, under 400 for minimal, under 2000 for technical
- For safety-critical situations, err on the side of caution
- If all conditions are calm and clear, a 3-4 sentence summary is perfectly fine — don't pad`;
}

async function sendAIChat(){
  const inp=document.getElementById('ai-chat-input');if(!inp)return;
  const msg=inp.value.trim();if(!msg)return;
  inp.value='';

  const key=getAIKey();
  if(!key){
    addAIMsg('user',msg);
    addAIMsg('error','No API key configured. Add your OpenAI API key in Settings (gear icon) under AI Weather Assistant, or tap "Full briefing" to get a deterministic on-device briefing instead.');
    return;
  }

  addAIMsg('user',msg);
  _aiChatHistory.push({role:'user',content:msg});
  showAITyping();

  try{
    const sysPrompt=getAISystemPrompt();
    const messages=[{role:'system',content:sysPrompt},..._aiChatHistory.slice(-10)];

    const res=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:getAIModel(),messages,max_tokens:2500,temperature:0.4})
    });

    hideAITyping();

    if(!res.ok){
      const err=await res.json().catch(()=>({}));
      const errMsg=err.error?.message||`API error ${res.status}`;
      if(res.status===401)addAIMsg('error','Invalid API key. Please check your OpenAI API key in Settings.');
      else if(res.status===429)addAIMsg('error','Rate limit exceeded. Please wait a moment and try again.');
      else if(res.status===402||res.status===400&&errMsg.includes('quota'))addAIMsg('error','API quota exceeded. Check your OpenAI billing at platform.openai.com.');
      else addAIMsg('error','API error: '+errMsg);
      return;
    }

    const data=await res.json();
    const reply=data.choices?.[0]?.message?.content||'No response received.';
    _aiChatHistory.push({role:'assistant',content:reply});
    addAIMsg('assistant',reply);

    if(_aiChatHistory.length>20){
      _aiChatHistory.splice(0,_aiChatHistory.length-14);
    }
  }catch(e){
    hideAITyping();
    addAIMsg('error','Connection error: '+e.message);
  }
}

