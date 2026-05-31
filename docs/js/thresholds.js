// StormTracker — Weather Alerts, Storm Cell Alerts, Rain Alerts
const _WX_ALERT_DEFS=[
  {key:'windMax',label:'Wind Speed',icon:'💨',unit:'speed',defVal:25,defOn:false,check:(c,th)=>{const kmh=c.wind_speed_10m;if(kmh==null)return null;const v=parseFloat(kmhTo(kmh,S.windUnit));return v>=th?{val:v,u:WIND_UNITS[S.windUnit],msg:`🔔 Wind speed at ${v} ${WIND_UNITS[S.windUnit]} — above your ${th} ${WIND_UNITS[S.windUnit]} threshold`}:null}},
  {key:'gustMax',label:'Wind Gusts',icon:'🌬️',unit:'speed',defVal:35,defOn:false,check:(c,th)=>{const kmh=c.wind_gusts_10m;if(kmh==null)return null;const v=parseFloat(kmhTo(kmh,S.windUnit));return v>=th?{val:v,u:WIND_UNITS[S.windUnit],msg:`🔔 Wind gusts detected at ${v} ${WIND_UNITS[S.windUnit]} — above your ${th} ${WIND_UNITS[S.windUnit]} threshold`}:null}},
  {key:'tempHigh',label:'Temp High',icon:'🌡️↑',unit:'temp',defVal:95,defOn:false,check:(c,th)=>{const tc=c.temperature_2m;if(tc==null)return null;const v=S.tempUnit===0?parseFloat(cToF(tc)):parseFloat(tc.toFixed(1));return v>=th?{val:v,u:TEMP_UNITS[S.tempUnit],msg:`🔔 Temperature reached ${v}${TEMP_UNITS[S.tempUnit]} — above your ${th}${TEMP_UNITS[S.tempUnit]} high threshold`}:null}},
  {key:'tempLow',label:'Temp Low',icon:'🌡️↓',unit:'temp',defVal:32,defOn:false,dir:'below',check:(c,th)=>{const tc=c.temperature_2m;if(tc==null)return null;const v=S.tempUnit===0?parseFloat(cToF(tc)):parseFloat(tc.toFixed(1));return v<=th?{val:v,u:TEMP_UNITS[S.tempUnit],msg:`🔔 Temperature dropped to ${v}${TEMP_UNITS[S.tempUnit]} — below your ${th}${TEMP_UNITS[S.tempUnit]} low threshold`}:null}},
  {key:'pressureDrop',label:'Pressure Drop (3hr)',icon:'📉',unit:'pressure',defVal:0.10,defOn:false,step:0.01,check:(c,th)=>{const drop=S._baroTrendMb!=null?-S._baroTrendMb:null;if(drop==null||drop<=0)return null;const dropInhg=drop*0.02953;const v=S.presUnit===0?parseFloat(dropInhg.toFixed(2)):parseFloat(drop.toFixed(1));const u=S.presUnit===0?'inHg':'mb';return v>=th?{val:v,u,msg:`🔔 Rapidly falling pressure — dropped ${v} ${u} over the last 3 hours (threshold: ${th} ${u})`}:null}},
  {key:'rainMax',label:'Rainfall Rate',icon:'🌧️',unit:'precip',defVal:1.0,defOn:false,step:0.1,check:(c,th)=>{const mmh=c.precipitation;if(mmh==null||mmh<=0)return null;let v,u;if(S.precipUnit===0){v=parseFloat((mmh/25.4).toFixed(2));u='in/hr'}else if(S.precipUnit===2){v=parseFloat((mmh/10).toFixed(2));u='cm/hr'}else{v=parseFloat(mmh.toFixed(1));u='mm/hr'}return v>=th?{val:v,u,msg:`🔔 Rainfall rate at ${v} ${u} — above your ${th} ${u} threshold`}:null}},
  {key:'humidHigh',label:'Humidity High',icon:'💧↑',unit:'%',defVal:90,defOn:false,check:(c,th)=>{const v=c.relative_humidity_2m;if(v==null)return null;return v>=th?{val:v,u:'%',msg:`🔔 Humidity at ${v}% — above your ${th}% high threshold`}:null}},
  {key:'humidLow',label:'Humidity Low',icon:'💧↓',unit:'%',defVal:20,defOn:false,dir:'below',check:(c,th)=>{const v=c.relative_humidity_2m;if(v==null)return null;return v<=th?{val:v,u:'%',msg:`🔔 Humidity at ${v}% — below your ${th}% low threshold`}:null}},
  {key:'visMin',label:'Visibility Low',icon:'👁️',unit:'vis',defVal:1.0,defOn:false,dir:'below',check:(c,th)=>{const vm=S._nwsVisM;if(vm==null)return null;let v,u;if(S.visUnit===0){v=parseFloat((vm/1609.34).toFixed(1));u='mi'}else{v=parseFloat((vm/1000).toFixed(1));u='km'}return v<=th?{val:v,u,msg:`🔔 Visibility dropped to ${v} ${u} — below your ${th} ${u} threshold`}:null}},
  {key:'uvMax',label:'UV Index',icon:'☀️',unit:'uv',defVal:8,defOn:false,check:(c,th)=>{const uv=S._uvIndex;if(uv==null)return null;return uv>=th?{val:uv,u:'',msg:`🔔 UV Index at ${uv} — above your ${th} threshold (high exposure risk)`}:null}}
];
const _WX_ALERT_COOLDOWN=(function(){try{const s=localStorage.getItem('st_wxAlertCooldown');if(s){const o=JSON.parse(s);const now=Date.now();Object.keys(o).forEach(k=>{if(now-o[k]>900000)delete o[k]});return o}}catch(e){}return{}})();
function _getAlertExpiryMs(){const v=parseInt(localStorage.getItem('st_alertExpiry'),10);return[30,60,120,240,360].includes(v)?v*60000:120*60000}
function setAlertExpiry(val){const n=parseInt(val,10);if([30,60,120,240,360].includes(n)){localStorage.setItem('st_alertExpiry',n);_pruneExpiredAlerts()}}
let _wxCheckedOnce=false;
function _pruneExpiredAlerts(){
  const ex=_getAlertExpiryMs();const now=Date.now();
  const sLen=_stormAlertHistory.length;
  _stormAlertHistory=_stormAlertHistory.filter(a=>now-a.time<ex);
  if(_stormAlertHistory.length!==sLen)_saveStormAlertHistory();
  const wLen=_wxAlertHistory.length;
  _wxAlertHistory=_wxAlertHistory.filter(a=>{
    if(a.fellBelowTime)return now-a.fellBelowTime<ex;
    if(_wxCheckedOnce)return true;
    return now-a.time<ex;
  });
  if(_wxAlertHistory.length!==wLen)_saveWxAlertHistory();
  if(S.activePage==='alerts')renderAlerts();
}
let _wxAlertHistory=JSON.parse(localStorage.getItem('st_wxAlertHistory')||'[]');
function _loadWxThresholds(){
  try{const s=localStorage.getItem('st_wxThresholds');if(s)return JSON.parse(s)}catch(e){}
  const d={};_WX_ALERT_DEFS.forEach(a=>{d[a.key]={on:a.defOn,val:a.defVal}});return d;
}
function _saveWxThresholds(th){try{localStorage.setItem('st_wxThresholds',JSON.stringify(th))}catch(e){}}
function _saveWxAlertHistory(){
  if(_wxAlertHistory.length>50)_wxAlertHistory=_wxAlertHistory.slice(-50);
  try{localStorage.setItem('st_wxAlertHistory',JSON.stringify(_wxAlertHistory))}catch(e){}
}
function checkWeatherThresholds(){
  if(!S.weather)return;
  const th=_loadWxThresholds();
  const now=Date.now();
  let histDirty=false;
  _WX_ALERT_DEFS.forEach(def=>{
    const cfg=th[def.key];
    if(!cfg||!cfg.on){
      _wxAlertHistory.forEach(a=>{if(a.key===def.key&&!a.fellBelowTime){a.fellBelowTime=now;histDirty=true}});
      return;
    }
    const result=def.check(S.weather,cfg.val);
    if(!result){
      _wxAlertHistory.forEach(a=>{if(a.key===def.key&&!a.fellBelowTime){a.fellBelowTime=now;histDirty=true}});
      return;
    }
    const lastFired=_WX_ALERT_COOLDOWN[def.key]||0;
    if(now-lastFired<900000)return;
    _WX_ALERT_COOLDOWN[def.key]=now;
    try{localStorage.setItem('st_wxAlertCooldown',JSON.stringify(_WX_ALERT_COOLDOWN))}catch(e){}
    toast(result.msg,6000);
    _wxAlertHistory.push({key:def.key,label:def.label,icon:def.icon,msg:result.msg,val:result.val,u:result.u,time:now});
    histDirty=true;
    _sendBrowserNotification(def.label,result.msg);
    if(S.activePage==='alerts')renderAlerts();
  });
  if(histDirty)_saveWxAlertHistory();
  _wxCheckedOnce=true;
  _pruneExpiredAlerts();
  checkRainAlert();
}
function _sendBrowserNotification(title,body){
  if(!('Notification' in window))return;
  if(Notification.permission!=='granted')return;
  if(document.visibilityState==='visible')return;
  try{
    if(navigator.serviceWorker&&navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({type:'WX_THRESHOLD_ALERT',title:'StormTracker: '+title,body:body.replace(/🔔\s*/,'')});
    }else{
      new Notification('StormTracker: '+title,{body:body.replace(/🔔\s*/,''),icon:'/StormTracker/icons/icon-192x192.png',tag:'wx-threshold-'+title,renotify:true});
    }
  }catch(e){console.log('Browser notification error:',e.message)}
}
function requestNotifPermission(){
  if(!('Notification' in window))return;
  if(Notification.permission==='granted')return;
  if(Notification.permission==='default')_showNotifPermissionModal();
}
function renderWxAlertSettings(){
  const th=_loadWxThresholds();
  let html='';
  _WX_ALERT_DEFS.forEach(def=>{
    const cfg=th[def.key]||{on:def.defOn,val:def.defVal};
    const step=def.step||1;
    html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px">
      <label style="display:flex;align-items:center;gap:4px;font-size:0.7em;color:var(--text-muted);flex:1;min-width:0;cursor:pointer">
        <input type="checkbox" ${cfg.on?'checked':''} onchange="toggleWxAlert('${def.key}',this.checked)" class="accent-cyan-check">
        <span style="white-space:nowrap">${def.icon} ${def.label}</span>
      </label>
      <input type="number" value="${cfg.val}" step="${step}" min="0" style="width:60px;font-size:0.7em;padding:3px 4px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;text-align:center;font-family:var(--font-mono)" onchange="setWxAlertVal('${def.key}',this.value)" ${cfg.on?'':'disabled'}>
    </div>`;
  });
  return html;
}
function toggleWxAlert(key,on){
  const th=_loadWxThresholds();
  if(!th[key]){const def=_WX_ALERT_DEFS.find(d=>d.key===key);th[key]={on,val:def?def.defVal:0}}
  else th[key].on=on;
  _saveWxThresholds(th);
  if(on)requestNotifPermission();
  const el=document.getElementById('wx-alert-settings');
  if(el)el.innerHTML=renderWxAlertSettings();
}
function setWxAlertVal(key,val){
  const n=parseFloat(val);if(isNaN(n)||n<0)return;
  const th=_loadWxThresholds();
  if(!th[key])th[key]={on:false,val:n};
  else th[key].val=n;
  _saveWxThresholds(th);
}
function clearWxAlertHistory(){_wxAlertHistory=[];_saveWxAlertHistory();if(S.activePage==='alerts')renderAlerts();}

const _STORM_ALERT_DEFS=[
  {key:'stormDist',label:'Projected Miss',icon:'📏',unit:'mi',defVal:6,defOn:false,dir:'below',step:1,
    check:(storm,th)=>{const b=storm._brief||(typeof calcStormETAForBriefing==='function'?calcStormETAForBriefing(storm):null);const miss=(b&&b.perpMissMi!=null)?b.perpMissMi:storm.distance;if(miss==null)return null;const tier=(typeof perpTier==='function')?perpTier(miss):null;const cls=b&&b.classification;if(typeof isApproachingTier==='function'){const tierKey=cls||(tier&&tier.key);if(!tierKey||!isApproachingTier(tierKey))return null}else if(cls&&typeof isInboundTier==='function'&&!isInboundTier(cls))return null;const v=S.radarMetric?parseFloat((miss*1.60934).toFixed(1)):parseFloat(miss.toFixed(1));const u=S.radarMetric?'km':'mi';const tierLbl=tier?tier.label:(cls?cls.replace('_',' ').toUpperCase():'');return miss<=th?{val:v,u,msg:`🌩️ Storm cell approaching — projected to pass ${v} ${u} from you (${storm.dbz} dBZ${tierLbl?', '+tierLbl:''})`}:null}},
  {key:'stormDbz',label:'Intensity (dBZ)',icon:'📡',unit:'dBZ',defVal:40,defOn:false,step:5,
    check:(storm,th)=>{const v=storm.dbz;if(v==null)return null;if(v<th)return null;const b=storm._brief||(typeof calcStormETAForBriefing==='function'?calcStormETAForBriefing(storm):null);const cls=b&&b.classification;if(cls&&typeof isInboundTier==='function'&&!isInboundTier(cls))return null;const miss=(b&&b.perpMissMi!=null)?b.perpMissMi:storm.distance;const tier=(miss!=null&&typeof perpTier==='function')?perpTier(miss):null;const tierLbl=tier?', '+tier.label:'';return{val:v,u:'dBZ',msg:`🌩️ Storm cell at ${v} dBZ — above your ${th} dBZ intensity threshold (${parseFloat(storm.distance.toFixed(1))} mi away${tierLbl})`}}},
  {key:'stormImpact',label:'Impact Score',icon:'🎯',unit:'%',defVal:50,defOn:false,step:5,
    check:(storm,th)=>{const v=storm.impactPct;if(v==null||v<=0)return null;if(v<th)return null;const b=storm._brief||(typeof calcStormETAForBriefing==='function'?calcStormETAForBriefing(storm):null);const cls=b&&b.classification;if(cls&&typeof isInboundTier==='function'&&!isInboundTier(cls))return null;const miss=(b&&b.perpMissMi!=null)?b.perpMissMi:storm.distance;const tier=(miss!=null&&typeof perpTier==='function')?perpTier(miss):null;const tierLbl=tier?', '+tier.label:'';return{val:v,u:'%',msg:`🌩️ Storm cell impact ${v}% — above your ${th}% threshold (${storm.dbz} dBZ, ${parseFloat(storm.distance.toFixed(1))} mi, tier: ${storm.impactTier}${tierLbl})`}}}
];
const _STORM_ALERT_COOLDOWN=(function(){try{const s=localStorage.getItem('st_stormAlertCooldown');if(s){const o=JSON.parse(s);const now=Date.now();Object.keys(o).forEach(k=>{if(now-o[k]>900000)delete o[k]});return o}}catch(e){}return{}})();
let _stormAlertHistory=JSON.parse(localStorage.getItem('st_stormAlertHistory')||'[]');
function _loadStormThresholds(){
  try{const s=localStorage.getItem('st_stormThresholds');if(s)return JSON.parse(s)}catch(e){}
  const d={};_STORM_ALERT_DEFS.forEach(a=>{d[a.key]={on:a.defOn,val:a.defVal}});return d;
}
function _saveStormThresholds(th){try{localStorage.setItem('st_stormThresholds',JSON.stringify(th))}catch(e){}}
function _saveStormAlertHistory(){
  if(_stormAlertHistory.length>50)_stormAlertHistory=_stormAlertHistory.slice(-50);
  try{localStorage.setItem('st_stormAlertHistory',JSON.stringify(_stormAlertHistory))}catch(e){}
}
function _calcStormImpact(storm){
  const mv=(typeof getHybridMovement==='function')?getHybridMovement(storm):S.stormMovement;
  if(!mv||mv.speed<2)return{impactPct:0,impactTier:'none'};
  const midBear=storm.bearing||0;
  const midDist=storm.distance||0;
  const bearToUser=(midBear+180)%360;
  const diff=Math.abs(((mv.direction-bearToUser+180)%360)-180);
  const closing=mv.speed*Math.cos(Math.min(diff,60)*Math.PI/180);
  const baseWidthMi=Math.max(0,Math.min(3,(storm.dbz-20)/15));
  const widthAngle=midDist>0.5?Math.atan2(baseWidthMi,midDist)*180/Math.PI:15;
  const coneHalf=15+widthAngle;
  let impactPct=0,impactTier='none';
  if(diff<=coneHalf*0.6&&closing>1){impactTier='high';impactPct=80+Math.round(((coneHalf*0.6)-diff)/(coneHalf*0.6)*20);}
  else if(diff<=coneHalf&&closing>0.5){impactTier='medium';impactPct=31+Math.round((coneHalf-diff)/(coneHalf*0.4)*49);}
  else if(diff<=coneHalf+10){impactTier='low';impactPct=Math.max(5,Math.round((coneHalf+10-diff)/10*30));}
  return{impactPct,impactTier};
}
function checkStormCellAlerts(){
  _pruneExpiredAlerts();
  if(!S._topStorms||!S._topStorms.length)return;
  const stormList=S._topStorms;
  const th=_loadStormThresholds();
  const anyOn=_STORM_ALERT_DEFS.some(d=>{const c=th[d.key];return c&&c.on});
  if(!anyOn)return;
  const now=Date.now();
  const batch=[];
  stormList.forEach(storm=>{
    const impact=_calcStormImpact(storm);
    storm.impactPct=impact.impactPct;
    storm.impactTier=impact.impactTier;
    const cellKey='sc_'+Math.round(storm.bearing/10)+'_'+Math.round(storm.distance/3);
    const lastFired=_STORM_ALERT_COOLDOWN[cellKey]||0;
    if(now-lastFired<900000)return;
    let allMatch=true;let bestMsg=null;
    _STORM_ALERT_DEFS.forEach(def=>{
      const cfg=th[def.key];
      if(!cfg||!cfg.on)return;
      const result=def.check(storm,cfg.val);
      if(!result){allMatch=false;return}
      if(!bestMsg)bestMsg=result;
    });
    if(!allMatch||!bestMsg)return;
    _STORM_ALERT_COOLDOWN[cellKey]=now;
    let etaMin=null,arrivalMs=null,closingMph=0;
    try{const se=calcStormETA(storm);if(se&&se.approaching&&se.eta!=null&&se.eta>0){etaMin=Math.max(0,se.eta-radarAgeMin());arrivalMs=now+etaMin*60000;closingMph=se.closingSpeed||0}}catch(e){}
    const distStr=S.radarMetric?parseFloat((storm.distance*1.60934).toFixed(1))+' km':parseFloat(storm.distance.toFixed(1))+' mi';
    const etaStr=etaMin!=null?' · ETA '+formatStormEta(etaMin)+' ('+fmtClockShort(new Date(arrivalMs))+')':'';
    const cellMsg=`🌩️ Storm cell alert: ${storm.dbz} dBZ at ${distStr}${storm.impactPct>0?' · Impact: '+storm.impactPct+'% ('+storm.impactTier+')':''}${etaStr}`;
    batch.push({storm,etaMin,arrivalMs,closingMph,cellMsg});
    _stormAlertHistory.push({key:'stormCell',label:'Storm Cell',icon:'🌩️',msg:cellMsg,val:storm.dbz,u:'dBZ',distance:storm.distance,impactPct:storm.impactPct||0,impactTier:storm.impactTier||'none',time:now,etaMin:etaMin,arrivalMs:arrivalMs,closingMph:closingMph,lat:storm.lat,lng:storm.lng,bearing:storm.bearing});
  });
  if(!batch.length)return;
  try{localStorage.setItem('st_stormAlertCooldown',JSON.stringify(_STORM_ALERT_COOLDOWN))}catch(e){}
  _saveStormAlertHistory();
  if(batch.length===1){
    toast(batch[0].cellMsg,8000);
    _sendBrowserNotification('Storm Cell Alert',batch[0].cellMsg);
  }else{
    const topDbz=Math.max(...batch.map(b=>b.storm.dbz));
    const peakImp=Math.max(...batch.map(b=>b.storm.impactPct||0));
    const closestDist=Math.min(...batch.map(b=>b.storm.distance));
    const distStr=S.radarMetric?parseFloat((closestDist*1.60934).toFixed(1))+' km':parseFloat(closestDist.toFixed(1))+' mi';
    const bearings=batch.map(b=>b.storm.bearing);
    const avgBear=Math.round(Math.atan2(bearings.reduce((s,b)=>s+Math.sin(b*Math.PI/180),0)/bearings.length,bearings.reduce((s,b)=>s+Math.cos(b*Math.PI/180),0)/bearings.length)*180/Math.PI+360)%360;
    const dirFrom=degToDir(avgBear);
    const mv=(typeof getSteeringMv==='function')?getSteeringMv():S.stormMovement;
    let moveStr='';
    if(mv&&mv.speed>=2){
      const travelDir=degToDir(mv.direction);
      const spdU=S.radarMetric?'km/h':'mph';
      const spdV=S.radarMetric?Math.round(mv.speed*1.60934):Math.round(mv.speed);
      moveStr=` traveling ${travelDir} (${Math.round(mv.direction)}°) ~${spdV} ${spdU}`;
    }
    const bestEta=batch.filter(b=>b.etaMin!=null).sort((a,b)=>a.etaMin-b.etaMin)[0];
    const etaPart=bestEta?`, ETA ${formatStormEta(bestEta.etaMin)}`:'';
    const summaryMsg=`🌩️ ${batch.length} storm cells to the ${dirFrom}${moveStr} — strongest ${topDbz} dBZ at ${distStr}, ${peakImp}% impact${etaPart}`;
    toast(summaryMsg,10000);
    _sendBrowserNotification('Storm Cell Alert',summaryMsg);
  }
  if(S.activePage==='alerts')renderAlerts();
}
function renderStormCellAlertSettings(){
  const th=_loadStormThresholds();
  let html='';
  _STORM_ALERT_DEFS.forEach(def=>{
    const cfg=th[def.key]||{on:def.defOn,val:def.defVal};
    const step=def.step||1;
    html+=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px">
      <label style="display:flex;align-items:center;gap:4px;font-size:0.7em;color:var(--text-muted);flex:1;min-width:0;cursor:pointer">
        <input type="checkbox" ${cfg.on?'checked':''} onchange="toggleStormAlert('${def.key}',this.checked)" class="accent-cyan-check">
        <span style="white-space:nowrap">${def.icon} ${def.label}</span>
      </label>
      <input type="number" value="${cfg.val}" step="${step}" min="0" style="width:60px;font-size:0.7em;padding:3px 4px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;text-align:center;font-family:var(--font-mono)" onchange="setStormAlertVal('${def.key}',this.value)" ${cfg.on?'':'disabled'}>
    </div>`;
  });
  return html;
}
function toggleStormAlert(key,on){
  const th=_loadStormThresholds();
  if(!th[key]){const def=_STORM_ALERT_DEFS.find(d=>d.key===key);th[key]={on,val:def?def.defVal:0}}
  else th[key].on=on;
  _saveStormThresholds(th);
  if(on)requestNotifPermission();
  const el=document.getElementById('storm-alert-settings');
  if(el)el.innerHTML=renderStormCellAlertSettings();
}
function setStormAlertVal(key,val){
  const n=parseFloat(val);if(isNaN(n)||n<0)return;
  const th=_loadStormThresholds();
  if(!th[key])th[key]={on:false,val:n};
  else th[key].val=n;
  _saveStormThresholds(th);
}
function clearStormAlertHistory(){_stormAlertHistory=[];_saveStormAlertHistory();if(S.activePage==='alerts')renderAlerts();}

// ==========================================
// RAIN ALERT
// ==========================================
const _RAIN_SENSITIVITY={light:20,moderate:30,heavy:40};
let _rainAlertCooldown=0;
try{_rainAlertCooldown=parseInt(localStorage.getItem('st_rainAlertCooldown'))||0}catch(e){}
let _rainAlertHistory=[];
try{const h=localStorage.getItem('st_rainAlertHistory');if(h)_rainAlertHistory=JSON.parse(h)}catch(e){}
function _loadRainAlertCfg(){
  try{const s=localStorage.getItem('st_rainAlertCfg');if(s)return JSON.parse(s)}catch(e){}
  return{on:false,sensitivity:'moderate',cooldownMin:30};
}
function _saveRainAlertCfg(cfg){try{localStorage.setItem('st_rainAlertCfg',JSON.stringify(cfg))}catch(e){}}
function _saveRainAlertHistory(){
  if(_rainAlertHistory.length>30)_rainAlertHistory=_rainAlertHistory.slice(-30);
  try{localStorage.setItem('st_rainAlertHistory',JSON.stringify(_rainAlertHistory))}catch(e){}
}
function checkRainAlert(){
  const cfg=_loadRainAlertCfg();
  if(!cfg.on)return;
  if(!S.weather||S.weather.precipitation==null)return;
  const precip=S.weather.precipitation; // mm in current observation period
  const threshMm={light:0.1,moderate:1.0,heavy:3.0};
  const thresh=threshMm[cfg.sensitivity]??1.0;
  if(precip<thresh)return;
  const now=Date.now();
  const cooldownMs=(cfg.cooldownMin||30)*60000;
  if(_rainAlertHistory.length){
    const last=_rainAlertHistory[_rainAlertHistory.length-1];
    if(now-last.ts<cooldownMs)return;
  }
  const precipStr=S.tempUnit===0?(precip/25.4).toFixed(2)+'"':precip.toFixed(1)+'mm';
  const label=cfg.sensitivity.charAt(0).toUpperCase()+cfg.sensitivity.slice(1);
  _sendBrowserNotification('🌧️ Rain Alert',`${label} rain detected: ${precipStr}`);
  toast(`🌧️ Rain: ${precipStr}`,5000);
  _rainAlertHistory.push({ts:now,precip,sensitivity:cfg.sensitivity});
  _saveRainAlertHistory();
  if(S.activePage==='alerts')renderAlerts();
}
function toggleRainAlert(on){
  const cfg=_loadRainAlertCfg();
  cfg.on=on;
  _saveRainAlertCfg(cfg);
  if(on)requestNotifPermission();
  syncRainAlertUI();
}
function setRainSensitivity(val){
  const cfg=_loadRainAlertCfg();
  cfg.sensitivity=val;
  _saveRainAlertCfg(cfg);
}
function setRainCooldown(val){
  const n=parseInt(val);if(isNaN(n)||n<5)return;
  const cfg=_loadRainAlertCfg();
  cfg.cooldownMin=n;
  _saveRainAlertCfg(cfg);
}
function syncRainAlertUI(){
  const cfg=_loadRainAlertCfg();
  const tog=document.getElementById('rain-alert-toggle');
  if(tog)tog.checked=cfg.on;
  const sens=document.getElementById('rain-alert-sensitivity');
  if(sens){sens.value=cfg.sensitivity;sens.disabled=!cfg.on}
  const cd=document.getElementById('rain-alert-cooldown');
  if(cd){cd.value=String(cfg.cooldownMin||30);cd.disabled=!cfg.on}
}
function clearRainAlertHistory(){_rainAlertHistory=[];_saveRainAlertHistory();if(S.activePage==='alerts')renderAlerts();}