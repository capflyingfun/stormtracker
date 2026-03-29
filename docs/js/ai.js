// ==========================================
// AI WEATHER ASSISTANT
// ==========================================
const _aiChatHistory=[];
let _aiChatOpen=false;

function saveAIKey(v){localStorage.setItem('st_aiKey',v.trim());updateAIFab();}
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
  if(fab)fab.style.display=getAIKey()?'block':'none';
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
  const fullText=header+raw;
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

  if(S.storms&&S.storms.length){
    const validStorms=S.storms.filter(s=>s&&s.distance!=null&&s.bearing!=null&&s.dbz!=null);
    const sigStorms=validStorms.filter(s=>s.dbz>=31);
    const lowStorms=validStorms.filter(s=>s.dbz<31);
    parts.push(`\nSTORM DATA: ${validStorms.length} radar returns detected.`);
    if(lowStorms.length>0&&sigStorms.length===0){
      parts.push(`  NOTE: All ${lowStorms.length} returns are below 31 dBZ (max ${Math.max(...lowStorms.map(s=>s.dbz))} dBZ). ${(lowStorms.every(s=>s.dbz<22)&&lowStorms.length<=12)||lowStorms.length<=8?'With '+(lowStorms.every(s=>s.dbz<22)?'12':'8')+' or fewer sub-'+(lowStorms.every(s=>s.dbz<22)?'22':'31')+' dBZ returns, these are most likely radar ground clutter or false positives — not real precipitation. Mention this to the user as "minor radar reflectivity/clutter" rather than rain.':'There are more than the clutter threshold of low-dBZ returns which may indicate light drizzle or virga, but nothing significant.'}`);
    }else if(lowStorms.length>0&&sigStorms.length>0){
      parts.push(`  ${sigStorms.length} significant cells (31+ dBZ) and ${lowStorms.length} minor returns (<31 dBZ, likely clutter).`);
    }
    if(sigStorms.length){
      const peakDbz=Math.max(...sigStorms.map(s=>s.dbz));
      const peakCat=peakDbz>=60?'EXTREME':peakDbz>=55?'SEVERE':peakDbz>=45?'HEAVY':peakDbz>=30?'MODERATE':'LIGHT';
      const closestSig=[...sigStorms].sort((a,b)=>a.distance-b.distance)[0];
      parts.push(`  Peak intensity: ${peakDbz} dBZ [${peakCat}]. Closest significant cell: ${fmtStormDist(closestSig.distance)} ${degToDir(closestSig.bearing)}.`);
      const byDist=[...sigStorms].sort((a,b)=>a.distance-b.distance).slice(0,6);
      const byDbz=[...sigStorms].sort((a,b)=>b.dbz-a.dbz).slice(0,6);
      const seen=new Set();
      const top=[];
      for(const s of [...byDbz,...byDist]){
        const k=`${s.lat.toFixed(3)}_${s.lng.toFixed(3)}`;
        if(!seen.has(k)){seen.add(k);top.push(s);}
        if(top.length>=12)break;
      }
      for(const st of top){
        let line=`  Storm at ${fmtStormDist(st.distance)} ${degToDir(st.bearing)} (${st.bearing.toFixed(0)}°), intensity ${st.dbz} dBZ`;
        const cat=st.dbz>=60?'EXTREME':st.dbz>=55?'SEVERE':st.dbz>=45?'HEAVY':st.dbz>=30?'MODERATE':'LIGHT';
        line+=` [${cat}]`;
        try{
          const key=`${st.lat.toFixed(2)}_${st.lon.toFixed(2)}`;
          const eta=S._stormETAs[key];
          if(eta){
            if(eta.approaching)line+=` APPROACHING - ETA ${eta.etaMin!=null?formatStormEta(eta.etaMin):'?'}, impact ${eta.impact!=null?((eta.impact*100).toFixed(0)):'?'}%`;
            else line+=' moving away/lateral';
          }
        }catch(e){console.warn('AI storm ETA calc error:',e)}
        parts.push(line);
      }
      if(sigStorms.length>top.length)parts.push(`  ... and ${sigStorms.length-top.length} more significant storm cells`);
    }
    if(S.stormMovement&&S.stormMovement.speed>=2){
      parts.push(`  General storm movement: ${degToDir(S.stormMovement.direction)} at ${fmtWind(S.stormMovement.speed*1.60934)}`);
    }
  }else{
    parts.push('\nSTORM DATA: No storm cells currently detected in scan radius.');
  }

  if(S.alerts&&S.alerts.length){
    parts.push(`\nACTIVE NWS ALERTS (${S.alerts.length}):`);
    for(const a of S.alerts.slice(0,8)){
      const p=a.properties||a;
      let line=`  ⚠ ${p.event||p.headline||'Alert'}`;
      if(p.severity)line+=` [Severity: ${p.severity}]`;
      if(p.urgency)line+=` [Urgency: ${p.urgency}]`;
      if(p.onset)line+=` [Onset: ${p.onset}]`;
      else if(p.effective)line+=` [Effective: ${p.effective}]`;
      if(p.ends)line+=` [Ends: ${p.ends}]`;
      else if(p.expires)line+=` [Expires: ${p.expires}]`;
      if(p.description){
        const desc=p.description.replace(/\n/g,' ').substring(0,300);
        line+=`\n    ${desc}`;
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
    parts.push(`  Lifted Index: ${stab.li!=null?stab.li.toFixed(1):'?'}°C (negative = unstable)`);
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
  const hasSevere=S.storms&&S.storms.some(st=>st&&st.dbz>=55);
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
- You distinguish between radar clutter and real precipitation (sub-22 dBZ with <12 returns = almost certainly clutter; say so clearly rather than warning about nonexistent rain)
- You treat every APPROACHING storm with an ETA as a direct threat to the user's location — state the timeline plainly: "A 52 dBZ cell is 14 miles NW and closing at 25 mph — expect it overhead in roughly 34 minutes"
- When the Area Forecast Discussion is available, you synthesize it — explain what synoptic features are driving the weather, what the forecasters are confident about vs uncertain about, and what that means for the next 6-12 hours in plain language
- For calm weather, keep it brief and conversational — don't manufacture drama when conditions are benign
- For dangerous weather, drop all humor and be direct about life safety

${urgencyPrefix} ${urgencyStyle}
${toneInstr}
${detailInstr}

=== LIVE WEATHER DATA ===
${ctx}

RESPONSE FORMAT:
Write in flowing paragraphs under these section headers. Skip any section that has no relevant data — do NOT write a section just to say "no data available."

Situation Overview
Start here. What is happening and why. Synoptic setup, frontal positions, pressure patterns, and the AFD synthesis if available. What's driving today's weather and what changes are expected in the next 6-12 hours. This is the "big picture" paragraph that frames everything else.

Active Threats & Storm Tracking
Only include if storms >= 31 dBZ exist OR active NWS alerts are present. Lead with alerts. For approaching storms, state distance, bearing, intensity, estimated speed, and ETA explicitly. For receding storms, note them briefly. For storm environments, reference CAPE, lifted index, and wind shear to assess whether cells are likely to strengthen, maintain, or weaken.

Public Safety & Outdoor Guidance
Practical advice for the general public. Should you be outside? Driving risks? Heat/cold concerns? What to watch for and when conditions change. Keep this conversational and actionable.

Aviation Briefing
Pilot-focused. Flight category and limiting factor (ceiling vs visibility). All available winds aloft with altitudes. IMPORTANT: Always report aviation winds in knots — if the user's wind unit is not knots, show knots in parentheses alongside their preferred unit (e.g. "SW at 35 km/h (19 kts)"). Wind shear assessment between levels — note any shear exceeding 25 kts per 2,000 ft. Turbulence potential. Density altitude if available. METAR decode highlights. Thunderstorm avoidance guidance if applicable.

Marine Conditions
Mariner-focused. Surface wind sustained and gusts in the user's preferred wind unit. Gale or small craft advisory relevance. Visibility over water. Storm approach timing for open-water exposure. Sea state estimation from wind data.

RULES:
- IMPORTANT: Use the units specified in USER UNITS for ALL measurements in your response. If the user has wind set to km/h, report winds in km/h — not mph or knots. If temperature is °C, use °C. If distance is km, use km. Match their preferences exactly.
- Write plain text only — no markdown formatting characters (no **, ##, *, or bullet symbols)
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
    addAIMsg('error','No API key configured. Add your OpenAI API key in Settings (gear icon) under AI Weather Assistant.');
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

