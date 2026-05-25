// ==========================================
// DETERMINISTIC HTML WEATHER BRIEFING ENGINE
// On-device, no AI, mirrors AI section ordering and rich-text markup.
// Output uses [!dbz:NN]NN dBZ[/!], [!red|orange|yellow|green|cyan]...[/!],
// **bold**, *italic*, __underline__ — rendered by ai.js fmtAIText().
// ==========================================
(function(){
  function _fmtDist(mi){if(mi==null||isNaN(mi))return '?';const r=Math.round(mi*10)/10;return S.radarMetric?(r*1.60934).toFixed(1)+' km':r.toFixed(1)+' mi'}
  function _emojiTier(k){return ({direct:'🔴',near_direct:'🟠',near_miss:'🟡',miss:'🔵',distant:'⚪',far:'⚫',passing:'🟡',moving_away:'🟢'})[k]||'⚫'}
  function _labelTier(k){return ({direct:'DIRECT',near_direct:'NEAR DIRECT',near_miss:'NEAR MISS',miss:'MISS',distant:'DISTANT',far:'FAR',passing:'PASSING',moving_away:'MOVING AWAY'})[k]||(k||'UNKNOWN').toUpperCase()}
  function _dbzTag(n){return `[!dbz:${n}]${n} dBZ[/!]`}
  function _safeDeg(b){try{return (typeof degToDir==='function')?degToDir(b):''}catch(e){return ''}}
  function _safeTemp(c){try{return (typeof fmtTemp==='function')?fmtTemp(c):(c+'°C')}catch(e){return c+'°'}}
  function _safeWind(k){try{return (typeof fmtWind==='function')?fmtWind(k):k+' km/h'}catch(e){return k+''}}
  function _safePres(m){try{return (typeof fmtPres==='function')?fmtPres(m):m+' mb'}catch(e){return m+''}}

  function _classifiedStorms(){
    const out={inbound:[],background:[],passing:[],away:[],hiddenCount:0,totalCount:0};
    if(!S.storms||!S.storms.length)return out;
    for(const s of S.storms){
      if(!s||s.distance==null||s.bearing==null||s.dbz==null)continue;
      out.totalCount++;
      let b=s._brief;
      try{if(!b&&typeof calcStormETAForBriefing==='function')b=calcStormETAForBriefing(s);}catch(e){}
      if(b&&b.estDbzAtUser!=null&&b.estDbzAtUser<15){out.hiddenCount++;continue}
      const c=b?b.classification:'unknown';
      if(b&&(c==='direct'||c==='near_direct'||c==='near_miss')&&b.closingMph>0){
        out.inbound.push({s,b,tier:c});
      }else if(c==='miss'||c==='distant'||c==='far'){
        out.background.push({s,b,tier:c});
      }else if(c==='passing'){
        out.passing.push({s,b,tier:c});
      }else if(c==='moving_away'){
        out.away.push({s,b,tier:c});
      }else{
        out.background.push({s,b,tier:c||'unknown'});
      }
    }
    const order={direct:0,near_direct:1,near_miss:2};
    out.inbound.sort((a,b)=>{const o=(order[a.tier]??9)-(order[b.tier]??9);return o!==0?o:a.s.distance-b.s.distance});
    out.background.sort((a,b)=>b.s.dbz-a.s.dbz);
    return out;
  }

  function _stormLine(item){
    const{s,b,tier}=item;
    const e=_emojiTier(tier);
    const lbl=_labelTier(tier);
    const dir=_safeDeg(s.bearing);
    const dist=_fmtDist(s.distance);
    const dbz=_dbzTag(s.dbz);
    if(!b||tier==='unknown')return `${e} ${lbl}: ${dbz} cell ${dist} ${dir}, motion unknown.`;
    const closingNum=b.closingMph;
    const closingStr=closingNum!=null?(closingNum>=0?'+':'')+closingNum+' mph':'?';
    const miss=b.perpMissMi!=null?b.perpMissMi.toFixed(1)+' mi':'?';
    const pct=(b.closenessPct!=null&&(tier==='direct'||tier==='near_direct'||tier==='near_miss'))?' '+b.closenessPct+'%':'';
    const estDbz=b.estDbzAtUser;
    const movStr=(b.movSpdMph&&b.movDirDeg!=null)?`, motion ${_safeDeg(b.movDirDeg)} @ ${b.movSpdMph} mph`:'';
    if(tier==='direct'){
      const eta=b.etaMin!=null?`, ETA __~${b.etaMin} min__`:'';
      const estStr=estDbz!=null?`, ~${_dbzTag(estDbz)} expected at you`:'';
      return `${e} **DIRECT${pct}**: ${dbz} cell ${dist} ${dir} closing ${closingStr}${eta}, projected pass within ${miss}${estStr}${movStr}. **Expect overhead impact.**`;
    }
    if(tier==='near_direct'){
      const eta=b.etaMin!=null?`, ETA __~${b.etaMin} min__`:'';
      const estStr=estDbz!=null?`, ~${_dbzTag(estDbz)} at you`:'';
      return `${e} NEAR DIRECT${pct}: ${dbz} cell ${dist} ${dir} closing ${closingStr}${eta}, projected miss ${miss}${estStr}${movStr}. Brief heavy downpour likely.`;
    }
    if(tier==='near_miss'){
      const estStr=estDbz!=null?`, ~${_dbzTag(estDbz)} at you`:'';
      return `${e} NEAR MISS${pct}: ${dbz} cell ${dist} ${dir} closing ${closingStr}, miss ${miss}${estStr}${movStr}.`;
    }
    return `${e} ${lbl}: ${dbz} cell ${dist} ${dir}, miss ${miss}${movStr}.`;
  }

  function buildOverview(){
    const lines=['🌐 Situation Overview'];
    const loc=S.locName||'your location';
    const now=new Date().toLocaleString();
    lines.push(`Briefing for **${loc}** — ${now}.`);
    if(S.weather){
      const w=S.weather;
      const parts=[];
      if(w.temperature_2m!=null)parts.push(`temp ${_safeTemp(w.temperature_2m)}`);
      if(w.apparent_temperature!=null&&w.temperature_2m!=null&&Math.abs(w.apparent_temperature-w.temperature_2m)>=2)parts.push(`feels ${_safeTemp(w.apparent_temperature)}`);
      if(w.relative_humidity_2m!=null)parts.push(`${w.relative_humidity_2m}% RH`);
      if(w.wind_speed_10m!=null){
        const wd=w.wind_direction_10m!=null?_safeDeg(w.wind_direction_10m):'';
        const gst=(w.wind_gusts_10m!=null&&w.wind_gusts_10m>w.wind_speed_10m+5)?' gusts '+_safeWind(w.wind_gusts_10m):'';
        parts.push(`wind ${wd} ${_safeWind(w.wind_speed_10m)}${gst}`);
      }
      if(w.pressure_msl!=null)parts.push(`pressure ${_safePres(w.pressure_msl)}`);
      if(w.cloud_cover!=null)parts.push(`${w.cloud_cover}% clouds`);
      if(parts.length)lines.push('Current: '+parts.join(', ')+'.');
    }
    const c=_classifiedStorms();
    if(c.totalCount===0){
      lines.push('Radar is [!green]clear[/!] across the scan radius — no precipitation detected.');
    }else if(c.inbound.length===0){
      const bits=[];
      if(c.background.length)bits.push(`${c.background.length} background`);
      if(c.passing.length)bits.push(`${c.passing.length} passing`);
      if(c.away.length)bits.push(`${c.away.length} receding`);
      lines.push(`Radar shows ${c.totalCount} return${c.totalCount===1?'':'s'}, [!green]none on track to impact you[/!]${bits.length?' ('+bits.join(', ')+')':''}.`);
    }else{
      const tc={direct:0,near_direct:0,near_miss:0};
      for(const it of c.inbound)tc[it.tier]++;
      const tcStr=Object.entries(tc).filter(([,n])=>n>0).map(([k,n])=>`${n} ${_labelTier(k)}`).join(', ');
      const peak=Math.max(...c.inbound.map(x=>x.s.dbz));
      const sev=peak>=60?'red':peak>=52?'orange':peak>=41?'yellow':'cyan';
      lines.push(`Radar shows [!${sev}]**${c.inbound.length} inbound cell${c.inbound.length===1?'':'s'}**[/!] (${tcStr}) within 12 mi miss-distance, peak ${_dbzTag(peak)}.`);
    }
    if(S._afd&&S._afd.discussion){
      const snip=S._afd.discussion.replace(/\s+/g,' ').slice(0,260);
      lines.push(`*AFD (${S._afd.office||'NWS'}):* ${snip}${S._afd.discussion.length>260?'…':''}`);
    }
    return lines.join('\n');
  }

  function buildThreats(){
    const c=_classifiedStorms();
    const hasAlerts=S.alerts&&S.alerts.length>0;
    if(c.inbound.length===0&&c.background.length===0&&c.passing.length===0&&c.away.length===0&&!hasAlerts)return null;
    const lines=['⛈️ Active Threats & Storm Tracking'];
    if(hasAlerts){
      for(const a of S.alerts.slice(0,6)){
        const p=a.properties||a;
        const sev=(p.severity||'').toLowerCase();
        const color=sev==='extreme'?'red':sev==='severe'?'orange':sev==='moderate'?'yellow':'cyan';
        const ev=p.event||p.headline||'NWS Alert';
        const ends=p.ends||p.expires;
        let endsStr='';
        if(ends){try{endsStr=` (expires __${new Date(ends).toLocaleString()}__)`;}catch(e){}}
        lines.push(`- ⚠️ [!${color}]${ev}[/!]${endsStr}`);
      }
    }
    for(const it of c.inbound.filter(x=>x.tier==='direct'))lines.push('- '+_stormLine(it));
    for(const it of c.inbound.filter(x=>x.tier==='near_direct'))lines.push('- '+_stormLine(it));
    for(const it of c.inbound.filter(x=>x.tier==='near_miss'))lines.push('- '+_stormLine(it));
    if(c.background.length){
      const sig=c.background.filter(x=>x.s.dbz>=55);
      for(const it of sig)lines.push('- '+_stormLine(it));
      const rest=c.background.filter(x=>x.s.dbz<55);
      if(rest.length){
        const dbzMin=Math.min(...rest.map(x=>x.s.dbz));
        const dbzMax=Math.max(...rest.map(x=>x.s.dbz));
        const dirs=[...new Set(rest.map(x=>_safeDeg(x.s.bearing)))].slice(0,4);
        const range=dbzMin===dbzMax?_dbzTag(dbzMin):`${_dbzTag(dbzMin)}–${_dbzTag(dbzMax)}`;
        lines.push(`- Background context: ${rest.length} non-inbound cells (${range}) to the ${dirs.join('/')} — no direct impact.`);
      }
    }
    if(c.passing.length){
      const dbzMax=Math.max(...c.passing.map(x=>x.s.dbz));
      const dirs=[...new Set(c.passing.map(x=>_safeDeg(x.s.bearing)))].slice(0,3);
      lines.push(`- 🟡 PASSING: ${c.passing.length} cell${c.passing.length===1?'':'s'} (up to ${_dbzTag(dbzMax)}) tracking past to the ${dirs.join('/')} — outflow possible, no direct hit.`);
    }
    if(c.away.length){
      const dbzMax=Math.max(...c.away.map(x=>x.s.dbz));
      const dirs=[...new Set(c.away.map(x=>_safeDeg(x.s.bearing)))].slice(0,3);
      lines.push(`- 🟢 MOVING AWAY: ${c.away.length} cell${c.away.length===1?'':'s'} (up to ${_dbzTag(dbzMax)}) receding to the ${dirs.join('/')} — [!green]no threat[/!].`);
    }
    return lines.join('\n');
  }

  function buildSafety(){
    const lines=['🚸 Public Safety & Outdoor Guidance'];
    const c=_classifiedStorms();
    const hasExtremeAlert=S.alerts&&S.alerts.some(a=>((a.properties||a).severity||'').toLowerCase()==='extreme');
    const hasSevereAlert=S.alerts&&S.alerts.some(a=>((a.properties||a).severity||'').toLowerCase()==='severe');
    const peakInbound=c.inbound.length?Math.max(...c.inbound.map(x=>x.s.dbz)):0;
    if(hasExtremeAlert||peakInbound>=60){
      lines.push('[!red]**Seek shelter now.**[/!] Severe weather is active or imminent. Stay away from windows, avoid travel, and monitor official alerts.');
    }else if(hasSevereAlert||peakInbound>=52){
      lines.push('[!orange]Strong storms are active.[/!] Move indoors, secure outdoor items, avoid open areas, and delay outdoor activity until the cells pass.');
    }else if(c.inbound.length){
      const top=c.inbound[0];
      const eta=top.b&&top.b.etaMin;
      const etaStr=eta!=null?` (~__${eta} min__ away)`:'';
      lines.push(`[!yellow]Light to moderate rain is approaching${etaStr}.[/!] Plan around the cell — bring an umbrella, expect a brief downpour, then clearing.`);
    }else{
      lines.push('[!green]Conditions are quiet.[/!] Outdoor activity is fine; no storm-related restrictions.');
    }
    if(S.weather){
      const w=S.weather;
      if(w.temperature_2m!=null&&w.temperature_2m>=32)lines.push('Heat caution: hydrate, take shade breaks, and limit strenuous outdoor exertion during the hottest part of the day.');
      else if(w.temperature_2m!=null&&w.temperature_2m<=-5)lines.push('Cold caution: dress in layers, watch for icy surfaces, and limit exposed-skin time outdoors.');
      if(w.wind_gusts_10m!=null&&w.wind_gusts_10m>=50)lines.push(`Wind caution: gusts to ${_safeWind(w.wind_gusts_10m)} — secure loose objects and use care on high-profile vehicles.`);
    }
    return lines.join('\n');
  }

  function buildAviationMarine(){
    if(!S.station&&!S._aloftData&&!S.weather)return null;
    const lines=['✈️ Aviation & Marine Briefing'];
    const c=_classifiedStorms();
    const closeInbound=c.inbound.filter(x=>x.s.distance<=30);
    if(closeInbound.length){
      lines.push('[!orange]Convective hazards active within ~30 mi:[/!] expect turbulence, windshear, possible IFR in TSRA, and lightning. Avoid cell cores; defer departures until clear.');
    }
    if(S.station){
      const st=S.station;
      const visSM=st.visMeter!=null?(st.visMeter/1609.34):null;
      try{
        if(typeof getFltCatDetail==='function'){
          const fc=getFltCatDetail(visSM,st);
          if(fc&&fc.cat)lines.push(`Flight category: **${fc.cat}**${fc.limit?' ('+fc.limit+')':''}.`);
        }
      }catch(e){}
      if(st.windKmh!=null){
        const wd=st.windDir!=null?_safeDeg(st.windDir):'VRB';
        const knots=Math.round(st.windKmh*0.539957);
        const gstStr=st.gustKmh!=null?`, gusts ${_safeWind(st.gustKmh)} (${Math.round(st.gustKmh*0.539957)} kts)`:'';
        lines.push(`Surface wind ${wd} ${_safeWind(st.windKmh)} (${knots} kts)${gstStr}.`);
      }
    }
    if(S._aloftData&&S._aloftData.length){
      const pToAlt={1013:'SFC',925:'2,500 ft',850:'5,000 ft',700:'10,000 ft',500:'18,000 ft'};
      const parts=S._aloftData.map(a=>`${pToAlt[a.p]||a.p+'hPa'}: ${_safeDeg(a.dir)} ${Math.round(a.spd*0.539957)} kts`);
      lines.push(`*Winds aloft:* ${parts.join(' · ')}.`);
    }
    const w=S.weather;
    if(w&&w.wind_speed_10m!=null){
      const ws=w.wind_speed_10m;
      const wsKts=Math.round(ws*0.539957);
      let marine='';
      if(wsKts>=33)marine=' — [!red]Gale conditions[/!], not safe for small craft.';
      else if(wsKts>=22)marine=' — [!orange]Small Craft Advisory[/!] criteria; reef sails, secure gear.';
      else if(wsKts>=15)marine=' — brisk; expect chop.';
      else marine=' — light to moderate, generally favorable.';
      lines.push(`Marine: surface wind ${_safeWind(ws)} (${wsKts} kts)${marine}`);
      if(closeInbound.length)lines.push('[!yellow]Outflow winds and a wind shift may arrive before the storm core[/!] — reduce sail and seek shelter ahead of the visible cell.');
    }
    return lines.length>1?lines.join('\n'):null;
  }

  function buildBottomLine(){
    const c=_classifiedStorms();
    const hasExtreme=S.alerts&&S.alerts.some(a=>((a.properties||a).severity||'').toLowerCase()==='extreme');
    const peakIn=c.inbound.length?Math.max(...c.inbound.map(x=>x.s.dbz)):0;
    let line;
    if(hasExtreme||peakIn>=60)line='[!red]**Active severe threat — take protective action now.**[/!]';
    else if(peakIn>=52)line='[!orange]**Strong storms approaching — be ready to move indoors.**[/!]';
    else if(c.inbound.length)line='[!yellow]Rain is on the way — plan for a wet window then clearing.[/!]';
    else line='[!green]All quiet — no storm impact expected.[/!]';
    return '🎯 Bottom Line\n'+line;
  }

  function buildBriefing(){
    try{
      const out=[buildOverview(),buildThreats(),buildSafety(),buildAviationMarine(),buildBottomLine()].filter(Boolean);
      return out.join('\n\n');
    }catch(e){
      console.error('briefingEngine error',e);
      return '⚠️ Briefing engine error: '+e.message;
    }
  }

  if(typeof window!=='undefined'){
    window.buildBriefing=buildBriefing;
    window.buildBriefingOverview=buildOverview;
    window.buildBriefingThreats=buildThreats;
    window.buildBriefingSafety=buildSafety;
    window.buildBriefingAviationMarine=buildAviationMarine;
    window.buildBriefingBottomLine=buildBottomLine;
  }
})();

// ----- Briefing Mode (System vs AI) -----
function getBriefingMode(){
  const m=localStorage.getItem('st_briefingMode');
  const hasKey=(typeof getAIKey==='function')?!!getAIKey():false;
  if(m==='ai'&&hasKey)return 'ai';
  return 'system';
}
function saveBriefingMode(v){
  const hasKey=(typeof getAIKey==='function')?!!getAIKey():false;
  const next=(v==='ai'&&hasKey)?'ai':'system';
  localStorage.setItem('st_briefingMode',next);
}
function syncBriefingModeUI(){
  const sel=document.getElementById('settings-briefing-mode');
  if(!sel)return;
  const hasKey=(typeof getAIKey==='function')?!!getAIKey():false;
  const aiOpt=sel.querySelector('option[value="ai"]');
  if(aiOpt){
    aiOpt.disabled=!hasKey;
    aiOpt.textContent=hasKey?'AI Briefing':'AI Briefing (add OpenAI key to enable)';
  }
  sel.value=getBriefingMode();
  const hint=document.getElementById('briefing-mode-hint');
  if(hint){
    hint.textContent=hasKey
      ? 'System Briefing is instant and on-device. AI Briefing uses OpenAI for natural-language reasoning.'
      : 'System Briefing runs on-device with no API key required. Add an OpenAI key below to unlock AI Briefing.';
  }
}
if(typeof window!=='undefined'){
  window.getBriefingMode=getBriefingMode;
  window.saveBriefingMode=saveBriefingMode;
  window.syncBriefingModeUI=syncBriefingModeUI;
}
