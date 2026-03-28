// ==========================================
// AI WEATHER ASSISTANT
// ==========================================
const _aiChatHistory=[];
let _aiChatOpen=false;

function saveAIKey(v){localStorage.setItem('st_aiKey',v.trim());updateAIFab();}
function saveAITone(v){localStorage.setItem('st_aiTone',v);}
function saveAIDetail(v){localStorage.setItem('st_aiDetail',v);}
function getAIKey(){return localStorage.getItem('st_aiKey')||'';}
function getAITone(){return localStorage.getItem('st_aiTone')||'professional';}
function getAIDetail(){return localStorage.getItem('st_aiDetail')||'standard';}
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
    d.innerHTML=fmtAIText(text);
  }else{
    d.textContent=text;
  }
  c.appendChild(d);
  c.scrollTop=c.scrollHeight;
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
  parts.push(`Scan radius: ${S.scanRadius} miles`);

  try{
  if(S.weather){
    const w=S.weather;
    const tempC=w.temperature_2m;
    const tempF=tempC!=null?cToF(tempC):null;
    const feelsC=w.apparent_temperature;
    const feelsF=feelsC!=null?cToF(feelsC):null;
    const humid=w.relative_humidity_2m;
    const windKmh=w.wind_speed_10m;
    const windMph=windKmh!=null?(windKmh*0.621371).toFixed(1):null;
    const windDeg=w.wind_direction_10m;
    const windDir=windDeg!=null?degToDir(windDeg)+' ('+Math.round(windDeg)+'°)':null;
    const gustKmh=w.wind_gusts_10m;
    const gustMph=gustKmh!=null?(gustKmh*0.621371).toFixed(1):null;
    const precip=w.precipitation;
    const cloud=w.cloud_cover;
    const pres=w.pressure_msl||w.surface_pressure;
    const isDay=w.is_day;
    const wxCode=w.weather_code;
    const nwsDesc=w._nwsDesc;
    const src=w._source||'Open-Meteo';
    parts.push(`\nCURRENT CONDITIONS (source: ${src}):`);
    if(tempF!=null)parts.push(`  Temperature: ${tempF}°F (${Number(tempC).toFixed(1)}°C)`);
    if(feelsF!=null)parts.push(`  Feels like: ${feelsF}°F`);
    if(humid!=null)parts.push(`  Humidity: ${humid}%`);
    if(windMph!=null)parts.push(`  Wind: ${windDir||'?'} at ${windMph} mph${gustMph?' gusts '+gustMph+' mph':''}`);
    if(pres!=null)parts.push(`  Pressure: ${pres.toFixed(1)} mb (${(pres*0.02953).toFixed(2)} inHg)`);
    if(precip!=null)parts.push(`  Precipitation: ${precip} mm`);
    if(cloud!=null)parts.push(`  Cloud cover: ${cloud}%`);
    if(S._nwsVisM!=null)parts.push(`  Visibility: ${(S._nwsVisM/1609.34).toFixed(1)} mi`);
    if(nwsDesc)parts.push(`  Conditions: ${nwsDesc}`);
    if(isDay!=null)parts.push(`  Day/Night: ${isDay?'Daytime':'Nighttime'}`);
  }else{
    parts.push('\nCurrent conditions: Data not yet loaded. Weather may still be fetching.');
  }

  if(S.station){
    const st=S.station;
    parts.push(`\nMETAR STATION DATA (${S.stationId||'unknown'}):`);
    if(st.rawOb)parts.push(`  Raw METAR: ${st.rawOb}`);
    if(st.name)parts.push(`  Station: ${st.name}`);
    if(st.temp!=null)parts.push(`  METAR Temp: ${cToF(st.temp)}°F (${st.temp.toFixed(1)}°C)`);
    if(st.dewp!=null)parts.push(`  Dew point: ${cToF(st.dewp)}°F (${st.dewp.toFixed(1)}°C)`);
    if(st.windSpd!=null){
      const wDir=st.windDir!=null?degToDir(st.windDir):'VRB';
      parts.push(`  METAR Wind: ${wDir} at ${(st.windSpd*0.621371).toFixed(0)} mph${st.gustSpd?' gusts '+(st.gustSpd*0.621371).toFixed(0)+' mph':''}`);
    }
    if(st.visMi!=null)parts.push(`  Visibility: ${st.visMi.toFixed(1)} SM`);
    else if(st.visM!=null)parts.push(`  Visibility: ${(st.visM/1609.34).toFixed(1)} SM`);
    if(st.altimInHg!=null)parts.push(`  Altimeter: ${st.altimInHg.toFixed(2)} inHg`);
    else if(st.presMb!=null)parts.push(`  Pressure: ${st.presMb.toFixed(1)} mb`);
    if(st.fltCat)parts.push(`  Flight category: ${st.fltCat}`);
    if(st.wxString)parts.push(`  Weather: ${st.wxString}`);
    if(st.clouds&&st.clouds.length){
      const cStr=st.clouds.map(c=>`${c.amount||'?'} at ${c.base?.value!=null?Math.round(c.base.value*3.28084)+'ft':'?'}`).join(', ');
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
      parts.push(`  Peak intensity: ${peakDbz} dBZ [${peakCat}]. Closest significant cell: ${closestSig.distance.toFixed(1)} mi ${degToDir(closestSig.bearing)}.`);
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
        let line=`  Storm at ${st.distance.toFixed(1)} mi ${degToDir(st.bearing)} (${st.bearing.toFixed(0)}°), intensity ${st.dbz} dBZ`;
        const cat=st.dbz>=60?'EXTREME':st.dbz>=55?'SEVERE':st.dbz>=45?'HEAVY':st.dbz>=30?'MODERATE':'LIGHT';
        line+=` [${cat}]`;
        try{
          const key=`${st.lat.toFixed(2)}_${st.lon.toFixed(2)}`;
          const eta=S._stormETAs[key];
          if(eta){
            if(eta.approaching)line+=` APPROACHING - ETA ${eta.etaMin?.toFixed(0)||'?'} min, impact ${eta.impact!=null?((eta.impact*100).toFixed(0)):'?'}%`;
            else line+=' moving away/lateral';
          }
        }catch(e){console.warn('AI storm ETA calc error:',e)}
        parts.push(line);
      }
      if(sigStorms.length>top.length)parts.push(`  ... and ${sigStorms.length-top.length} more significant storm cells`);
    }
    if(S.stormMovement&&S.stormMovement.speed>=2){
      parts.push(`  General storm movement: ${degToDir(S.stormMovement.direction)} at ${S.stormMovement.speed.toFixed(0)} mph`);
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
      const tF=h.temperature_2m?cToF(h.temperature_2m[i]):'?';
      const pop=h.precipitation_probability?h.precipitation_probability[i]:'?';
      const prec=h.precipitation?h.precipitation[i]:0;
      const wSpd=h.wind_speed_10m?(h.wind_speed_10m[i]*0.621371).toFixed(0):'?';
      const wGust=h.wind_gusts_10m?(h.wind_gusts_10m[i]*0.621371).toFixed(0):null;
      const hr=fmtClockShort(new Date(t));
      let line=`  ${hr}: ${tF}°F, ${pop}% precip chance`;
      if(prec>0)line+=` (${prec}mm)`;
      line+=`, wind ${wSpd} mph`;
      if(wGust&&Number(wGust)>Number(wSpd)+5)line+=` gusts ${wGust}`;
      parts.push(line);
    }
  }

  if(S.forecast&&S.forecast.daily){
    const d=S.forecast.daily;
    parts.push('\n7-DAY FORECAST:');
    for(let i=0;i<Math.min(7,d.time?.length||0);i++){
      const day=new Date(d.time[i]+'T12:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'});
      const hi=d.temperature_2m_max?cToF(d.temperature_2m_max[i]):'?';
      const lo=d.temperature_2m_min?cToF(d.temperature_2m_min[i]):'?';
      const pop=d.precipitation_probability_max?d.precipitation_probability_max[i]:'?';
      const precSum=d.precipitation_sum?d.precipitation_sum[i]:0;
      const wMax=d.wind_speed_10m_max?(d.wind_speed_10m_max[i]*0.621371).toFixed(0):'?';
      let line=`  ${day}: Hi ${hi}°F / Lo ${lo}°F, ${pop}% precip`;
      if(precSum>0)line+=` (${precSum}mm)`;
      line+=`, max wind ${wMax} mph`;
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
      const spdMph=(a.spd*0.621371).toFixed(0);
      const spdKt=(a.spd*0.539957).toFixed(0);
      parts.push(`  ${alt}: ${degToDir(a.dir)} (${Math.round(a.dir)}°) at ${spdMph} mph (${spdKt} kts)`);
    }
  }

  const shearInfo=getWindShearAnalysis();
  if(shearInfo){
    parts.push(`\nWIND SHEAR ANALYSIS (NWS/Aviation Standard):`);
    parts.push(`  Vector shear magnitude: ${shearInfo.vectorShear} mph (${shearInfo.severity})`);
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
    if(stab.dewp!=null)parts.push(`  Dew Point: ${stab.dewp.toFixed(1)}°C (${cToF(stab.dewp)}°F)`);
    if(stab.temp!=null&&stab.dewp!=null)parts.push(`  Temp-Dewpoint Spread: ${(stab.temp-stab.dewp).toFixed(1)}°C`);
    parts.push(`\n2. ATMOSPHERIC STABILITY (${stab.stabRat}/10):`);
    parts.push(`  CAPE: ${stab.cape||0} J/kg`);
    parts.push(`  Lifted Index: ${stab.li!=null?stab.li.toFixed(1):'?'}°C (negative = unstable)`);
    if(stab.cin!=null)parts.push(`  Convective Inhibition (CIN): ${stab.cin} J/kg`);
    parts.push(`  Assessment: ${stab.stabDesc}`);
    parts.push(`\n3. LIFTING MECHANISMS (${stab.liftRat}/10):`);
    if(S._windShear)parts.push(`  Wind shear: ${S._windShear.speedDiff.toFixed(1)} km/h speed diff, ${S._windShear.dirDiff}° directional`);
    parts.push(`\nOVERALL THUNDERSTORM POTENTIAL: ${stab.overall}/10 (${stab.risk})`);
  }

  if(S._terrainData){
    const td=S._terrainData;
    parts.push(`\nTERRAIN ANALYSIS:`);
    parts.push(`  User elevation: ${td.userElev.toFixed(0)}m (${(td.userElev*3.281).toFixed(0)}ft)`);
    parts.push(`  Local relief: ${td.relief.toFixed(0)}m (${(td.relief*3.281).toFixed(0)}ft)`);
    if(td.valleys.length)parts.push(`  Valley channels: ${td.valleys.map(v=>`${v.dir}° (${Math.abs(v.diff).toFixed(0)}m deep)`).join(', ')}`);
    if(td.ridges.length)parts.push(`  Ridge barriers: ${td.ridges.map(r=>`${r.dir}° (${r.diff.toFixed(0)}m high)`).join(', ')}`);
    if(td.valleys.length||td.ridges.length)parts.push(`  Note: Valleys can channel storms, ridges can block/deflect weaker cells`);
  }
  if(S._cellTracks&&Object.keys(S._cellTracks).length){
    parts.push(`\nCELL TRACKING: ${Object.keys(S._cellTracks).length} individually tracked cells`);
    const tracks=Object.values(S._cellTracks).sort((a,b)=>b.dbz-a.dbz).slice(0,5);
    for(const t of tracks){
      parts.push(`  Cell at ${t.toLat.toFixed(2)},${t.toLng.toFixed(2)}: ${t.dbz}dBZ, moving ${t.dir}° at ${t.speed}mph`);
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

  return `You are StormTracker AI, an expert meteorologist embedded in a real-time storm tracking application. You have access to live radar data, atmospheric stability analysis, NWS forecaster discussions, winds aloft, storm cell tracking, and forecasts.

${urgencyPrefix} ${urgencyStyle}
${toneInstr}
${detailInstr}

=== LIVE WEATHER DATA ===
${ctx}

RESPONSE STRUCTURE:
Structure your response with these FIVE clearly labeled sections. Write each as a flowing paragraph. Skip a section ONLY if there is absolutely no relevant data for it:

**Summary and AFD:**
Overview of what is driving today's weather — fronts, pressure systems, atmospheric setup, timing of changes. If Area Forecast Discussion data is available, translate the technical meteorological jargon into accessible, conversational insights. Summarize what the NWS forecasters are watching and their confidence level.

**Relevant Storm Information:**
Active storms, their movement direction/speed, intensity (dBZ), and whether they are heading toward the user. Include ETAs if storms are approaching. Be specific about track cone analysis and direct threats. Any storm with an ETA time means potential contact — state this clearly.

**General:**
Public safety guidance, outdoor activity recommendations, comfort conditions, and what to expect. Include heat/cold advisories prominently.

**Aviation:**
Pilot-specific: list ALL available winds aloft levels (e.g. "At 5,000 ft: SW at 18 kts"). Include wind shear analysis between levels, turbulence potential, visibility, ceiling heights, flight categories, and METAR data. Be precise with altitudes and measurements.

**Boating:**
Marine conditions: wind patterns, storm approach timing, wave/swell potential, water safety considerations.

CRITICAL ANALYSIS REQUIREMENTS:
1. If there are active weather alerts, discuss them FIRST and prominently
2. STORM TRACK: Pay special attention to storms marked as APPROACHING with ETAs — clearly state "This storm is expected to reach your area in [ETA]"
3. HIGH IMPACT: When storms show high impact ratings, state clearly: "This storm is on a collision course with your location"
4. THUNDERSTORM POTENTIAL: When CAPE, Lifted Index, and stability data are present, assess thunderstorm formation risk and explain what conditions favor or inhibit development
5. WIND SHEAR: When wind shear data is present, discuss its impact on storm organization and aviation safety
6. Do NOT use markdown formatting (no ** or ## or * for formatting) — write plain text with section headers on their own line
7. Never mention if data sources are missing — just work with what you have
8. For safety situations, always err on the side of caution
9. Reference specific data points (temperature, wind, storm distances, dBZ, CAPE values) when relevant`;
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
      body:JSON.stringify({model:'gpt-4o-mini',messages,max_tokens:1500,temperature:0.4})
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

