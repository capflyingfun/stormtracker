// ==========================================
// DETERMINISTIC HTML WEATHER BRIEFING ENGINE
// On-device, no AI. Mirrors the AI section ordering and rich-text markup.
//
// Public API:
//   gatherBriefingData()             -> snapshot object pulled from global S
//   buildSystemBriefing(data)        -> string of rich-text markup
//   buildBriefing()                  -> convenience wrapper (gather + build)
//
// Output uses [!dbz:NN]NN dBZ[/!], [!red|orange|yellow|green|cyan]...[/!],
// **bold**, *italic*, __underline__ — all rendered by ai.js fmtAIText().
// ==========================================
(function(){
  function _fmtDist(mi,metric){if(mi==null||isNaN(mi))return '?';const r=Math.round(mi*10)/10;return metric?(r*1.60934).toFixed(1)+' km':r.toFixed(1)+' mi'}
  function _emojiTier(k){return ({direct:'🔴',near_direct:'🟠',near_miss:'🟡',miss:'🔵',distant:'⚪',far:'⚫',passing:'🟡',moving_away:'🟢'})[k]||'⚫'}
  function _labelTier(k){return ({direct:'DIRECT',near_direct:'NEAR DIRECT',near_miss:'NEAR MISS',miss:'MISS',distant:'DISTANT',far:'FAR',passing:'PASSING',moving_away:'MOVING AWAY'})[k]||(k||'UNKNOWN').toUpperCase()}
  function _dbzTag(n){return `[!dbz:${n}]${n} dBZ[/!]`}
  function _safeDeg(b){try{return (typeof degToDir==='function')?degToDir(b):''}catch(e){return ''}}
  function _safeTemp(c){try{return (typeof fmtTemp==='function')?fmtTemp(c):(c+'°C')}catch(e){return c+'°'}}
  function _safeWind(k){try{return (typeof fmtWind==='function')?fmtWind(k):k+' km/h'}catch(e){return k+''}}
  function _safePres(m){try{return (typeof fmtPres==='function')?fmtPres(m):m+' mb'}catch(e){return m+''}}

  function gatherBriefingData(){
    const classified={inbound:[],background:[],passing:[],away:[],hiddenCount:0,totalCount:0};
    if(typeof S!=='undefined'&&S.storms&&S.storms.length){
      for(const s of S.storms){
        if(!s||s.distance==null||s.bearing==null||s.dbz==null)continue;
        classified.totalCount++;
        let b=s._brief;
        try{if(!b&&typeof calcStormETAForBriefing==='function')b=calcStormETAForBriefing(s);}catch(e){}
        if(b&&b.estDbzAtUser!=null&&b.estDbzAtUser<15){classified.hiddenCount++;continue}
        const c=b?b.classification:'unknown';
        const entry={s,b,tier:c||'unknown'};
        if(b&&(c==='direct'||c==='near_direct'||c==='near_miss')&&b.closingMph>0){classified.inbound.push(entry)}
        else if(c==='miss'||c==='distant'||c==='far'){classified.background.push(entry)}
        else if(c==='passing'){classified.passing.push(entry)}
        else if(c==='moving_away'){classified.away.push(entry)}
        else{classified.background.push(entry)}
      }
      const order={direct:0,near_direct:1,near_miss:2};
      classified.inbound.sort((a,b)=>{const o=(order[a.tier]??9)-(order[b.tier]??9);return o!==0?o:a.s.distance-b.s.distance});
      classified.background.sort((a,b)=>b.s.dbz-a.s.dbz);
    }
    return{
      now:new Date(),
      locName:(typeof S!=='undefined'&&S.locName)?S.locName:null,
      metric:!!(typeof S!=='undefined'&&S.radarMetric),
      weather:(typeof S!=='undefined'&&S.weather)?S.weather:null,
      station:(typeof S!=='undefined'&&S.station)?S.station:null,
      alerts:(typeof S!=='undefined'&&S.alerts)?S.alerts:[],
      afd:(typeof S!=='undefined'&&S._afd)?S._afd:null,
      aloft:(typeof S!=='undefined'&&S._aloftData)?S._aloftData:null,
      classified
    };
  }

  function _stormLine(item,metric){
    const{s,b,tier}=item;
    const e=_emojiTier(tier);
    const lbl=_labelTier(tier);
    const dir=_safeDeg(s.bearing);
    const dist=_fmtDist(s.distance,metric);
    const dbz=_dbzTag(s.dbz);
    if(!b||tier==='unknown')return `${e} ${lbl}: ${dbz} cell ${dist} ${dir}, motion unknown.`;
    const closing=b.closingMph!=null?((b.closingMph>=0?'+':'')+b.closingMph+' mph'):'?';
    const miss=b.perpMissMi!=null?b.perpMissMi.toFixed(1)+' mi':'?';
    const pct=(b.closenessPct!=null&&(tier==='direct'||tier==='near_direct'||tier==='near_miss'))?' '+b.closenessPct+'%':'';
    const estDbz=b.estDbzAtUser;
    const movStr=(b.movSpdMph&&b.movDirDeg!=null)?`, motion ${_safeDeg(b.movDirDeg)} @ ${b.movSpdMph} mph`:'';
    if(tier==='direct'){
      const eta=b.etaMin!=null?`, ETA __~${b.etaMin} min__`:'';
      const estStr=estDbz!=null?`, ~${_dbzTag(estDbz)} expected at you`:'';
      return `${e} **DIRECT${pct}**: ${dbz} cell ${dist} ${dir} closing ${closing}${eta}, projected pass within ${miss}${estStr}${movStr}. **Expect overhead impact.**`;
    }
    if(tier==='near_direct'){
      const eta=b.etaMin!=null?`, ETA __~${b.etaMin} min__`:'';
      const estStr=estDbz!=null?`, ~${_dbzTag(estDbz)} at you`:'';
      return `${e} NEAR DIRECT${pct}: ${dbz} cell ${dist} ${dir} closing ${closing}${eta}, projected miss ${miss}${estStr}${movStr}. Brief heavy downpour likely.`;
    }
    if(tier==='near_miss'){
      const estStr=estDbz!=null?`, ~${_dbzTag(estDbz)} at you`:'';
      return `${e} NEAR MISS${pct}: ${dbz} cell ${dist} ${dir} closing ${closing}, miss ${miss}${estStr}${movStr}.`;
    }
    return `${e} ${lbl}: ${dbz} cell ${dist} ${dir}, miss ${miss}${movStr}.`;
  }

  function _sumLine(label,cells,emoji,trailing,metric){
    if(!cells.length)return null;
    const dbzMin=Math.min(...cells.map(x=>x.s.dbz));
    const dbzMax=Math.max(...cells.map(x=>x.s.dbz));
    const dirs=[...new Set(cells.map(x=>_safeDeg(x.s.bearing)))].slice(0,4);
    const range=dbzMin===dbzMax?_dbzTag(dbzMin):`${_dbzTag(dbzMin)}–${_dbzTag(dbzMax)}`;
    return `- ${emoji} ${label}: ${cells.length} cell${cells.length===1?'':'s'} (${range}) ${dirs.join('/')}${trailing}`;
  }

  function buildOverview(d){
    const lines=['🌐 Situation Overview'];
    const loc=d.locName||'your location';
    lines.push(`Briefing for **${loc}** — ${d.now.toLocaleString()}.`);
    if(d.weather){
      const w=d.weather;
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
    const c=d.classified;
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
    if(d.afd&&d.afd.discussion){
      const snip=d.afd.discussion.replace(/\s+/g,' ').slice(0,260);
      lines.push(`*AFD (${d.afd.office||'NWS'}):* ${snip}${d.afd.discussion.length>260?'…':''}`);
    }
    return lines.join('\n');
  }

  function buildThreats(d){
    const c=d.classified;
    const alerts=d.alerts||[];
    if(c.inbound.length===0&&c.background.length===0&&c.passing.length===0&&c.away.length===0&&!alerts.length)return null;
    const lines=['⛈️ Active Threats & Storm Tracking'];
    for(const a of alerts.slice(0,6)){
      const p=a.properties||a;
      const sev=(p.severity||'').toLowerCase();
      const color=sev==='extreme'?'red':sev==='severe'?'orange':sev==='moderate'?'yellow':'cyan';
      const ev=p.event||p.headline||'NWS Alert';
      const ends=p.ends||p.expires;
      let endsStr='';
      if(ends){try{endsStr=` (expires __${new Date(ends).toLocaleString()}__)`;}catch(e){}}
      lines.push(`- ⚠️ [!${color}]${ev}[/!]${endsStr}`);
    }
    // DIRECT — always bullets, lead
    for(const it of c.inbound.filter(x=>x.tier==='direct'))lines.push('- '+_stormLine(it,d.metric));
    // NEAR DIRECT — always bullets, next
    for(const it of c.inbound.filter(x=>x.tier==='near_direct'))lines.push('- '+_stormLine(it,d.metric));
    // NEAR MISS — bullet ONLY when dBZ>=31 OR distance<=20; else summarize as one line
    const nearMiss=c.inbound.filter(x=>x.tier==='near_miss');
    const nmSig=nearMiss.filter(x=>x.s.dbz>=31||x.s.distance<=20);
    const nmLow=nearMiss.filter(x=>!(x.s.dbz>=31||x.s.distance<=20));
    for(const it of nmSig)lines.push('- '+_stormLine(it,d.metric));
    const nmSum=_sumLine('NEAR MISS (light)',nmLow,'🟡',' — not actionable.',d.metric);
    if(nmSum)lines.push(nmSum);
    // MISS / DISTANT / FAR — strict background; only bullet if dBZ>=55, else single summary line per tier
    function _bgTier(label,emoji,cells,sigCut){
      const sig=cells.filter(x=>x.s.dbz>=sigCut);
      const rest=cells.filter(x=>x.s.dbz<sigCut);
      for(const it of sig)lines.push('- '+_stormLine(it,d.metric));
      const sum=_sumLine(label,rest,emoji,' — background context, no direct impact.',d.metric);
      if(sum)lines.push(sum);
    }
    _bgTier('MISS','🔵',c.background.filter(x=>x.tier==='miss'),55);
    _bgTier('DISTANT','⚪',c.background.filter(x=>x.tier==='distant'),60);
    _bgTier('FAR','⚫',c.background.filter(x=>x.tier==='far'),55);
    // Unknown bucket (fallback)
    const unk=c.background.filter(x=>x.tier==='unknown');
    if(unk.length){const sum=_sumLine('UNCLASSIFIED',unk,'⚫',' — motion data unavailable.',d.metric);if(sum)lines.push(sum)}
    // PASSING / MOVING AWAY — one summary line each
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

  function buildSafety(d){
    const lines=['🚸 Public Safety & Outdoor Guidance'];
    const c=d.classified;
    const alerts=d.alerts||[];
    const hasExtreme=alerts.some(a=>((a.properties||a).severity||'').toLowerCase()==='extreme');
    const hasSevere=alerts.some(a=>((a.properties||a).severity||'').toLowerCase()==='severe');
    const peak=c.inbound.length?Math.max(...c.inbound.map(x=>x.s.dbz)):0;
    if(hasExtreme||peak>=60){
      lines.push('[!red]**Seek shelter now.**[/!] Severe weather is active or imminent. Stay away from windows, avoid travel, and monitor official alerts.');
    }else if(hasSevere||peak>=52){
      lines.push('[!orange]Strong storms are active.[/!] Move indoors, secure outdoor items, avoid open areas, and delay outdoor activity until the cells pass.');
    }else if(c.inbound.length){
      const top=c.inbound[0];
      const eta=top.b&&top.b.etaMin;
      const etaStr=eta!=null?` (~__${eta} min__ away)`:'';
      lines.push(`[!yellow]Light to moderate rain is approaching${etaStr}.[/!] Plan around the cell — bring an umbrella, expect a brief downpour, then clearing.`);
    }else{
      lines.push('[!green]Conditions are quiet.[/!] Outdoor activity is fine; no storm-related restrictions.');
    }
    if(d.weather){
      const w=d.weather;
      if(w.temperature_2m!=null&&w.temperature_2m>=32)lines.push('Heat caution: hydrate, take shade breaks, and limit strenuous outdoor exertion during the hottest part of the day.');
      else if(w.temperature_2m!=null&&w.temperature_2m<=-5)lines.push('Cold caution: dress in layers, watch for icy surfaces, and limit exposed-skin time outdoors.');
      if(w.wind_gusts_10m!=null&&w.wind_gusts_10m>=50)lines.push(`Wind caution: gusts to ${_safeWind(w.wind_gusts_10m)} — secure loose objects and use care on high-profile vehicles.`);
    }
    return lines.join('\n');
  }

  function buildAviationMarine(d){
    if(!d.station&&!d.aloft&&!d.weather)return null;
    const lines=['✈️ Aviation & Marine Briefing'];
    const c=d.classified;
    const close=c.inbound.filter(x=>x.s.distance<=30);
    if(close.length){
      lines.push('[!orange]Convective hazards active within ~30 mi:[/!] expect turbulence, windshear, possible IFR in TSRA, and lightning. Avoid cell cores; defer departures until clear.');
    }
    if(d.station){
      const st=d.station;
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
    if(d.aloft&&d.aloft.length){
      const pToAlt={1013:'SFC',925:'2,500 ft',850:'5,000 ft',700:'10,000 ft',500:'18,000 ft'};
      const parts=d.aloft.map(a=>`${pToAlt[a.p]||a.p+'hPa'}: ${_safeDeg(a.dir)} ${Math.round(a.spd*0.539957)} kts`);
      lines.push(`*Winds aloft:* ${parts.join(' · ')}.`);
    }
    const w=d.weather;
    if(w&&w.wind_speed_10m!=null){
      const ws=w.wind_speed_10m;
      const wsKts=Math.round(ws*0.539957);
      let marine='';
      if(wsKts>=33)marine=' — [!red]Gale conditions[/!], not safe for small craft.';
      else if(wsKts>=22)marine=' — [!orange]Small Craft Advisory[/!] criteria; reef sails, secure gear.';
      else if(wsKts>=15)marine=' — brisk; expect chop.';
      else marine=' — light to moderate, generally favorable.';
      lines.push(`Marine: surface wind ${_safeWind(ws)} (${wsKts} kts)${marine}`);
      if(close.length)lines.push('[!yellow]Outflow winds and a wind shift may arrive before the storm core[/!] — reduce sail and seek shelter ahead of the visible cell.');
    }
    return lines.length>1?lines.join('\n'):null;
  }

  function buildBottomLine(d){
    const c=d.classified;
    const alerts=d.alerts||[];
    const hasExtreme=alerts.some(a=>((a.properties||a).severity||'').toLowerCase()==='extreme');
    const peak=c.inbound.length?Math.max(...c.inbound.map(x=>x.s.dbz)):0;
    let line;
    if(hasExtreme||peak>=60)line='[!red]**Active severe threat — take protective action now.**[/!]';
    else if(peak>=52)line='[!orange]**Strong storms approaching — be ready to move indoors.**[/!]';
    else if(c.inbound.length)line='[!yellow]Rain is on the way — plan for a wet window then clearing.[/!]';
    else line='[!green]All quiet — no storm impact expected.[/!]';
    return '🎯 Bottom Line\n'+line;
  }

  function buildSystemBriefing(data){
    try{
      const d=data||gatherBriefingData();
      const out=[buildOverview(d),buildThreats(d),buildSafety(d),buildAviationMarine(d),buildBottomLine(d)].filter(Boolean);
      return out.join('\n\n');
    }catch(e){
      console.error('briefingEngine error',e);
      return '⚠️ Briefing engine error: '+e.message;
    }
  }

  function buildBriefing(){return buildSystemBriefing(gatherBriefingData())}

  if(typeof window!=='undefined'){
    window.gatherBriefingData=gatherBriefingData;
    window.buildSystemBriefing=buildSystemBriefing;
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
function getBriefingModePref(){return localStorage.getItem('st_briefingMode')||'system'}
function saveBriefingMode(v){
  const next=(v==='ai')?'ai':'system';
  localStorage.setItem('st_briefingMode',next);
  if(typeof syncBriefingModeUI==='function')syncBriefingModeUI();
}
function syncBriefingModeUI(){
  const wrap=document.getElementById('settings-briefing-mode-wrap');
  if(!wrap)return;
  const hasKey=(typeof getAIKey==='function')?!!getAIKey():false;
  const pref=getBriefingModePref();
  const btns=wrap.querySelectorAll('button[data-mode]');
  btns.forEach(b=>{
    const m=b.getAttribute('data-mode');
    const active=(m===pref);
    const aiDisabled=(m==='ai'&&!hasKey);
    b.disabled=aiDisabled;
    b.style.opacity=aiDisabled?'0.45':'1';
    b.style.cursor=aiDisabled?'not-allowed':'pointer';
    b.style.background=active?(m==='ai'?'rgba(168,85,247,0.18)':'rgba(0,229,255,0.18)'):'rgba(255,255,255,0.04)';
    b.style.borderColor=active?(m==='ai'?'#a855f7':'#00e5ff'):'var(--border-subtle)';
    b.style.color=active?(m==='ai'?'#a855f7':'#00e5ff'):'var(--text-muted)';
    b.title=aiDisabled?'Add an OpenAI API key below to enable AI Briefing':'';
  });
  const hint=document.getElementById('briefing-mode-hint');
  if(hint){
    hint.textContent=hasKey
      ? 'System Briefing is instant and on-device. AI Briefing uses OpenAI for natural-language reasoning.'
      : 'System Briefing runs on-device with no API key required. Add an OpenAI key below to unlock AI Briefing.';
  }
}

// Single entrypoint for the full briefing panel.
// Honors the briefing mode toggle. If user prefers AI but key is missing,
// silently falls back to System and prepends a visible notice.
async function runFullBriefing(){
  const pref=getBriefingModePref();
  const hasKey=(typeof getAIKey==='function')?!!getAIKey():false;
  const effective=(pref==='ai'&&hasKey)?'ai':'system';
  const fellBack=(pref==='ai'&&!hasKey);
  if(effective==='system'){
    if(typeof addAIMsg==='function')addAIMsg('user','Full weather briefing');
    let reply=(typeof buildBriefing==='function')?buildBriefing():'Briefing engine not loaded.';
    if(fellBack){
      reply='[!yellow]Using System Briefing — no OpenAI API key is configured.[/!] Add a key in Settings to enable AI Briefing.\n\n'+reply;
    }else{
      reply='[!cyan]System Briefing (deterministic, on-device).[/!]\n\n'+reply;
    }
    if(typeof addAIMsg==='function')addAIMsg('assistant',reply);
    return;
  }
  // AI mode — defer to the existing AI chat path with a full-analysis prompt
  const inp=document.getElementById('ai-chat-input');
  if(inp)inp.value='Give me a full weather analysis with risk assessment';
  if(typeof sendAIChat==='function')await sendAIChat();
}

if(typeof window!=='undefined'){
  window.getBriefingMode=getBriefingMode;
  window.getBriefingModePref=getBriefingModePref;
  window.saveBriefingMode=saveBriefingMode;
  window.syncBriefingModeUI=syncBriefingModeUI;
  window.runFullBriefing=runFullBriefing;
}
