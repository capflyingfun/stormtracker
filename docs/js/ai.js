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
      const peakCat=peakDbz>=65?'EXTREME (severe-hail signature likely)':peakDbz>=60?'SEVERE (hail possible)':peakDbz>=55?'MODERATE-SEVERE (strong core, not auto-severe)':peakDbz>=45?'MODERATE-HEAVY':peakDbz>=30?'MODERATE':'LIGHT';
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
      const buckets={direct:[],near_miss:[],nearby:[],passing:[],moving_away:[],unknown:[]};
      for(const st of top){
        let tier='unknown',brief=null;
        try{
          if(typeof calcStormETAForBriefing==='function'){
            brief=calcStormETAForBriefing(st);
            if(brief&&brief.classification&&buckets[brief.classification])tier=brief.classification;
          }
        }catch(e){console.warn('AI storm ETA calc error:',e)}
        st._aiBrief=brief;st._aiTier=tier;
        buckets[tier].push(st);
      }
      for(const k of Object.keys(buckets))buckets[k].sort((a,b)=>a.distance-b.distance);
      const tierOrder=['direct','near_miss','nearby','passing','moving_away','unknown'];
      for(const tier of tierOrder){
        for(const st of buckets[tier]){
          const distRnd=Math.round(st.distance*10)/10;
          const distStr=S.radarMetric?(distRnd*1.60934).toFixed(1)+' km':distRnd.toFixed(1)+' mi';
          let line=`  Storm at ${distStr} ${degToDir(st.bearing)} (${st.bearing.toFixed(0)}°), intensity ${st.dbz} dBZ`;
          const cat=st.dbz>=65?'EXTREME (severe-hail signature likely)':st.dbz>=60?'SEVERE (hail possible)':st.dbz>=55?'MODERATE-SEVERE (strong, not auto-severe)':st.dbz>=45?'MODERATE-HEAVY':st.dbz>=30?'MODERATE':'LIGHT';
          line+=` [${cat}]`;
          const b=st._aiBrief;
          if(b&&b.classification){
            const movStr=b.movSpdMph?` (motion ${degToDir(b.movDirDeg)} @ ${b.movSpdMph} mph, ${b.source}-derived)`:'';
            const sc=(typeof stormClass==='function')?stormClass(b.classification):null;
            const impPct=(b.impactScore!=null)?Math.round(b.impactScore*100):null;
            const estDbz=(b.estDbzAtUser!=null)?b.estDbzAtUser:null;
            const estStr=(estDbz!=null)?`, ~${estDbz} dBZ expected at user`:'';
            if(b.classification==='direct'){
              line+=` ${sc?sc.aiPhrase:'APPROACHING DIRECTLY'} (${impPct}% max intensity at user${estStr}) — closing ${b.closingMph} mph, ETA ~${b.etaMin} min, projected pass within ${b.perpMissMi} mi of user${movStr}`;
            }else if(b.classification==='near_miss'){
              line+=` ${sc?sc.aiPhrase:'NEAR MISS'} (${impPct}% max intensity at user${estStr}) — closing ${b.closingMph} mph, projected miss around ${b.perpMissMi} mi (partial impact possible; do NOT quote a hard ETA)${movStr}`;
            }else if(b.classification==='nearby'){
              line+=` ${sc?sc.aiPhrase:'NEARBY'} (${impPct}% max intensity at user${estStr}) — projected miss around ${b.perpMissMi} mi (in same general area but outside the impact corridor; mention briefly, do NOT issue an ETA)${movStr}`;
            }else if(b.classification==='passing'){
              line+=` ${sc?sc.aiPhrase:'PASSING TO YOUR'} ${degToDir(b.sideBearing)} — projected miss around ${b.perpMissMi} mi, no direct impact expected; outflow possible${movStr}`;
            }else if(b.classification==='moving_away'){
              line+=` ${sc?sc.aiPhrase:'MOVING AWAY'} — closing speed ${b.closingMph} mph (≤0)${movStr}`;
            }else{
              line+=` motion unknown (insufficient steering data)`;
            }
          }
          parts.push(line);
        }
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
- You distinguish between radar clutter and real precipitation (sub-22 dBZ with <12 returns = almost certainly clutter; say so clearly rather than warning about nonexistent rain)
- dBZ severity calibration: 30-44 dBZ = moderate rain; 45-54 dBZ = heavy rain / possible small hail; 55-59 dBZ = heavy core (strong but NOT automatically "severe"); 60-64 dBZ = very heavy, severe-hail signatures possible; 65+ dBZ = severe-hail signature likely. Do NOT label 55 dBZ as "severe" or invoke severe-hail language unless the cell is 60+ dBZ or NWS has an active severe warning on it.
- Storm motion is computed for you using vector projection (dot product of motion onto the storm-to-user vector). Each storm line tells you the classification:
    * "APPROACHING DIRECTLY" — the storm's projected track passes within 3 mi of the user. Quote the ETA directly. Example: "A 52 dBZ cell 14 mi NW is closing at 25 mph; expect it overhead in roughly 34 min."
    * "NEAR MISS" — projected miss is 3-6 mi from the user. Say "near miss; partial impact / brief downpour possible" and quote the perpendicular miss distance instead of asserting a direct hit. Do NOT issue a hard ETA.
    * "NEARBY" — projected miss is greater than 6 mi but the storm is still inbound and in the same general area. Mention briefly ("a stronger cell is tracking through the area NN mi to your <DIR>, no direct impact expected at your location"). Do NOT issue an ETA.
    * "PASSING TO YOUR <DIR>" — the storm's projected track does not bring it toward the user at all. Say so plainly: "Storm is passing to your north and should only bring outflow winds or light rain." Do NOT manufacture an ETA.
    * "MOVING AWAY" — closing speed is zero or negative; the storm is receding. Mention briefly and move on.
- Impact score interpretation: every storm line gives you a percentage labelled "max intensity at user" plus an estimated dBZ ("~NN dBZ expected at user"). This is closeness-to-track × intensity. Use the estimated dBZ when describing what the user will actually experience at their location — do NOT quote the storm's peak dBZ as if that's what will hit the user when the projected miss is more than ~1 mi. Example: a 55 dBZ cell with projected miss 1.8 mi has ~52 dBZ expected at user (60% max-intensity) — describe the user experience as "heavy rain / 52 dBZ at your location" not "55 dBZ severe core overhead".
- Never invent ETAs, closing speeds, or miss distances. If the storm line does not give you an ETA, you must not state one.
- Risk Assessment intensity wording: when stating that storms do not exceed a given dBZ threshold (e.g. "no storms exceed 55 dBZ"), you MUST qualify whether the statement applies to inbound storms only or to all storms on radar. If stronger cells exist on radar but are classified PASSING or MOVING AWAY, explicitly call that out. Preferred phrasing: "No inbound storms exceed 55 dBZ. The only stronger cells are NE of your position and are moving away, posing no threat." Never make a bare intensity claim that could be read as contradicting the Active Threats section.
- Emoji color-coding for storms: every individual storm you mention in any section MUST be prefixed with the emoji that matches its track classification — 🔴 for APPROACHING DIRECTLY (direct hit), 🟠 for NEAR MISS, 🔵 for NEARBY, 🟡 for PASSING, and 🟢 for MOVING AWAY. These emojis MUST match the badge shown on the storm's cell card. Place the emoji at the start of the storm reference, e.g. "🔴 DIRECT HIT: [!dbz:52]52 dBZ[/!] cell 14 mi NW closing at +25 mph, ETA ~34 min" or "🟢 MOVING AWAY: [!dbz:55]55 dBZ[/!] cell NE closing at -18 mph, no threat". Always include the signed closing speed (+ for inbound, - for receding). Do not use ⚪, 🟥/🟧/🟨/🟩, or any other shape — round only, five tiers only. Severity (dBZ level, hail, NWS warnings) is conveyed in words, not in the classification emoji.
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
Only include if storms >= 31 dBZ exist OR active NWS alerts are present. Lead with alerts. For approaching storms, state distance, bearing, intensity, estimated speed, and ETA explicitly. For receding storms, note them briefly. For storm environments, reference CAPE, lifted index, and wind shear to assess whether cells are likely to strengthen, maintain, or weaken.

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

