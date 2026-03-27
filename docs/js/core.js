const S = {
  lat:null, lon:null, locName:'',
  tempUnit:0, windUnit:0, presUnit:0, visUnit:0, precipUnit:0,
  weather:null, forecast:null,
  storms:[], stormMarkers:[],
  alerts:[], station:null, stationId:null,
  map:null, radarLayer:null, radarFrames:[], radarIdx:0,
  radarPlaying:false, radarTimer:null, scanRadius:80, radarSource:'nexrad', nexradLayer:null, radarMetric:false,
  activePage:'weather', nearbyStations:[], stormMovement:null, scanTime:null, etaTimer:null, autoScanTimer:null, lastScanMs:0, _lastScanWasHiRes:false, _stormETAs:{}, _etaRescanInProgress:false,
  travelMode:false, travelWatchId:null, travelLastUpdate:0, travelMarker:null,
  showClutter:false,
};
const TEMP_UNITS = ['°F','°C'];
const WIND_UNITS = ['mph','kts','km/h','m/s'];
const PRES_UNITS = ['inHg','mb','mmHg','kPa'];
const VIS_UNITS = ['mi','km'];
const PRECIP_UNITS = ['in','mm','cm'];
let _timeFormat=localStorage.getItem('st_timeFormat')||'auto';
function _detectSystem24h(){
  try{
    const d=new Date(2020,0,1,13,0,0);
    const parts=new Intl.DateTimeFormat(undefined,{hour:'numeric'}).formatToParts(d);
    const hasDayPeriod=parts.some(p=>p.type==='dayPeriod');
    if(!hasDayPeriod)return true;
    const hourPart=parts.find(p=>p.type==='hour');
    if(hourPart&&parseInt(hourPart.value,10)>=13)return true;
    return false;
  }catch(e){
    try{
      const f=new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'numeric'}).format(d);
      if(f.includes('13'))return true;
      const lo=f.toLowerCase();
      if(lo.includes('am')||lo.includes('pm'))return false;
      return true;
    }catch(e2){return false}
  }
}
function _is24h(){
  if(_timeFormat==='24h')return true;
  if(_timeFormat==='12h')return false;
  return _detectSystem24h();
}
function _pad2(n){return n<10?'0'+n:''+n}
function fmtClock(d,showSec){
  if(!(d instanceof Date)||isNaN(d))d=new Date(d);
  if(isNaN(d))return'--:--';
  const h=d.getHours(),m=d.getMinutes(),s=d.getSeconds();
  if(_is24h()){
    return _pad2(h)+':'+_pad2(m)+(showSec?':'+_pad2(s):'');
  }
  const hr12=h%12||12,ap=h>=12?'PM':'AM';
  return hr12+':'+_pad2(m)+(showSec?':'+_pad2(s):'')+' '+ap;
}
function fmtClockShort(d){
  if(!(d instanceof Date)||isNaN(d))d=new Date(d);
  if(isNaN(d))return'--:--';
  const h=d.getHours(),m=d.getMinutes();
  if(_is24h())return h+':'+_pad2(m);
  const hr12=h%12||12,ap=h>=12?'PM':'AM';
  return hr12+':'+_pad2(m)+' '+ap;
}
function reformatNwsTimes(text){
  if(!text)return text;
  function _fmt(h,mi,ap,tz){
    let h24=parseInt(h,10);const m=parseInt(mi,10);
    if(ap.toUpperCase()==='PM'&&h24<12)h24+=12;
    if(ap.toUpperCase()==='AM'&&h24===12)h24=0;
    if(_is24h())return _pad2(h24)+':'+_pad2(m)+' '+tz.toUpperCase();
    const hr12=h24%12||12;return hr12+':'+_pad2(m)+' '+(h24>=12?'PM':'AM')+' '+tz.toUpperCase();
  }
  text=text.replace(/(\d{1,2}):(\d{2})\s*(AM|PM)\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT|AKST|AKDT|HST|AST)/gi,(m,hh,mm,ap,tz)=>_fmt(hh,mm,ap,tz));
  text=text.replace(/(\d{1,2})(\d{2})\s*(AM|PM)\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT|AKST|AKDT|HST|AST)/gi,(m,hh,mm,ap,tz)=>_fmt(hh,mm,ap,tz));
  text=text.replace(/(?<![:\d])(\d{1,2})\s+(AM|PM)\s+(EST|EDT|CST|CDT|MST|MDT|PST|PDT|AKST|AKDT|HST|AST)/gi,(m,hh,ap,tz)=>_fmt(hh,'0',ap,tz));
  return text;
}
function fmtHrLabel(d){
  if(!(d instanceof Date)||isNaN(d))d=new Date(d);
  if(isNaN(d))return'--';
  if(_is24h()){return _pad2(d.getHours())+':00'}
  const hr=d.getHours(),ap=hr>=12?'p':'a';return(hr%12||12)+ap;
}
function setTimeFormat(fmt){
  _timeFormat=fmt;localStorage.setItem('st_timeFormat',fmt);
  syncTimeFmtBtns();reRenderActive();
}
function syncTimeFmtBtns(){
  document.querySelectorAll('.tf-btn').forEach(b=>{
    const active=b.dataset.tf===_timeFormat;
    b.style.background=active?'rgba(0,229,255,0.15)':'rgba(255,255,255,0.04)';
    b.style.borderColor=active?'var(--accent-cyan)':'var(--border-subtle)';
    b.style.color=active?'var(--accent-cyan)':'var(--text-muted)';
  });
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function toast(msg,dur){
  if(S.travelMode&&!msg.startsWith('🧭')&&!msg.startsWith('📍')&&!msg.startsWith('Travel')){
    const bar=document.getElementById('travel-toast-bar');
    if(bar){bar.textContent=msg;bar.style.opacity='1';clearTimeout(S._travelToastFade);S._travelToastFade=setTimeout(()=>{bar.style.opacity='0'},dur||3000);}
    return;
  }
  const c=document.getElementById('toast-container');const el=document.createElement('div');el.className='toast';el.textContent=msg;c.appendChild(el);setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),250)},dur||3000);
}
function showSkel(el,n){el.innerHTML=Array.from({length:n},()=>`<div class="skeleton skel-line" style="width:${60+Math.random()*40}%"></div>`).join('')}
function degToDir(d){const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];return dirs[Math.round(d/22.5)%16]}

function cToF(c){return(c*9/5+32).toFixed(1)}
function calcFeelsLike(tc,wKmh,rh){
  const tf=tc*9/5+32;const wMph=(wKmh||0)*0.621371;
  if(tf<=50&&wMph>3){const wc=35.74+0.6215*tf-35.75*Math.pow(wMph,0.16)+0.4275*tf*Math.pow(wMph,0.16);return(wc-32)*5/9}
  if(tf>=80&&rh!=null){const hi=-42.379+2.04901523*tf+10.14333127*rh-0.22475541*tf*rh-0.00683783*tf*tf-0.05481717*rh*rh+0.00122874*tf*tf*rh+0.00085282*tf*rh*rh-0.00000199*tf*tf*rh*rh;return(hi-32)*5/9}
  return tc;
}
function fmtTemp(c){return S.tempUnit===0?(cToF(c)+' °F'):(c.toFixed(1)+' °C')}
function fmtTempShort(c){return S.tempUnit===0?(cToF(c)+'°'):(c.toFixed(1)+'°')}
function fmtTempDiff(c){return S.tempUnit===0?((c*9/5).toFixed(1)+' °F'):(c.toFixed(1)+' °C')}

function kmhTo(kmh,unit){
  if(unit===0) return (kmh/1.609).toFixed(1);
  if(unit===1) return (kmh/1.852).toFixed(1);
  if(unit===2) return kmh.toFixed(1);
  return (kmh/3.6).toFixed(1);
}
function fmtWind(kmh){return kmhTo(kmh,S.windUnit)+' '+WIND_UNITS[S.windUnit]}
function ktsTo(kts,unit){
  if(unit===0) return (kts*1.151).toFixed(0);
  if(unit===1) return kts.toFixed(0);
  if(unit===2) return (kts*1.852).toFixed(0);
  return (kts*0.5144).toFixed(1);
}
function fmtWindKts(kts){return ktsTo(kts,S.windUnit)+' '+WIND_UNITS[S.windUnit]}
const _BFT_KMH=[1,6,12,20,29,39,50,62,75,89,103,118,1000];
const _BFT_NAME=['Calm','Light Air','Light Breeze','Gentle Breeze','Mod Breeze','Fresh Breeze','Strong Breeze','Near Gale','Gale','Strong Gale','Storm','Violent Storm','Hurricane'];
const _BFT_CLR=['#88ccff','#66ddaa','#44cc88','#33bb66','#aadd44','#ddcc33','#ffaa22','#ff7722','#ff4444','#dd2222','#bb1155','#991177','#770099'];
function beaufortFromKmh(kmh){for(let i=0;i<_BFT_KMH.length;i++){if(kmh<_BFT_KMH[i])return i}return 12}
function _beaufortBar(kmh){
  const bf=beaufortFromKmh(kmh);
  let bars='';
  for(let i=0;i<=12;i++){
    const fill=i<=bf?_BFT_CLR[i]:'rgba(255,255,255,0.08)';
    bars+=`<div style="flex:1;height:4px;border-radius:2px;background:${fill}"></div>`;
  }
  return`<div style="width:100%;margin-top:1px"><div style="display:flex;gap:1px;margin-bottom:1px">${bars}</div><div style="font-size:0.38em;color:${_BFT_CLR[bf]};font-weight:600;text-align:center;line-height:1">F${bf} ${_BFT_NAME[bf]}</div></div>`;
}

let _windMinKmh=Infinity,_windMaxKmh=0;
const _SONAR_ZOOM_LEVELS=[15,20,30,40,50,60,70,80];
const _SONAR_DBZ_CLASSES=['light','moderate','heavy','intense','extreme'];
const _SONAR_DBZ_LABELS={light:'Light (0-29)',moderate:'Moderate (30-39)',heavy:'Heavy (40-49)',intense:'Intense (50-59)',extreme:'Extreme (60+)'};
const _SONAR_DBZ_COLORS={light:'#00ccff',moderate:'#aaff00',heavy:'#ffee00',intense:'#ff2200',extreme:'#ff00ff'};
const _SONAR_DEFAULTS={dbzScale:{},sweepSpeed:40,fadeDur:2,alwaysOn:false,dotOpacity:100,glowInt:1,gridBright:100,dbzFloor:0,showStormArrows:true,showAloft:true,showLightning:true};
let _sonarCfg=(function(){try{const s=JSON.parse(localStorage.getItem('st_sonarCfg'));if(s&&typeof s==='object')return Object.assign({},_SONAR_DEFAULTS,s)}catch(e){}return Object.assign({},_SONAR_DEFAULTS)})();
function _saveSonarCfg(){localStorage.setItem('st_sonarCfg',JSON.stringify(_sonarCfg))}
function _getDbzScale(cls){return _sonarCfg.dbzScale[cls]!=null?_sonarCfg.dbzScale[cls]:1}
function _setDbzScale(cls,v){_sonarCfg.dbzScale[cls]=v;_saveSonarCfg()}
function _toggleSonarSettings(){
  let p=document.getElementById('sonar-settings-panel');
  if(p){p.style.display=p.style.display==='none'?'block':'none';return}
  const wrap=document.getElementById('mini-sonar-wrap');if(!wrap)return;
  p=document.createElement('div');p.id='sonar-settings-panel';
  p.style.cssText='position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(10,14,20,0.92);z-index:20;border-radius:8px;padding:10px 14px;overflow-y:auto;backdrop-filter:blur(4px)';
  const sw=_sonarCfg,lb='font-size:0.55em;color:rgba(255,255,255,0.7)',tl='font-size:0.6em;color:#00eeff;font-weight:600',vl='font-size:0.5em;color:rgba(255,255,255,0.6);min-width:28px;text-align:right';
  const spdNames={20:'Slow',40:'Medium',60:'Fast',80:'Turbo'};
  const fadeNames={1:'Short',2:'Medium',3:'Long'};
  const glowNames={0:'None',1:'Subtle',2:'Intense'};
  let html='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="color:#00eeff;font-weight:700;font-size:0.7em">⚙ Sonar Settings</span><button onclick="_toggleSonarSettings()" style="background:none;border:none;color:#00eeff;font-size:1em;cursor:pointer;padding:2px 6px">✕</button></div>';
  html+='<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(0,220,255,0.15)">';
  html+='<div style="'+tl+';margin-bottom:4px">Sweep</div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="'+lb+'">Speed</span><div style="display:flex;gap:3px">';
  for(const spd of [20,40,60,80])html+=`<button onclick="_setSonarOpt('sweepSpeed',${spd})" id="ss-spd-${spd}" style="font-size:0.45em;padding:2px 5px;border-radius:3px;cursor:pointer;border:1px solid ${sw.sweepSpeed===spd?'#00eeff':'rgba(0,220,255,0.3)'};background:${sw.sweepSpeed===spd?'rgba(0,220,255,0.2)':'none'};color:${sw.sweepSpeed===spd?'#00eeff':'rgba(255,255,255,0.5)'}">${spdNames[spd]}</button>`;
  html+='</div></div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="'+lb+'">Fade</span><div style="display:flex;gap:3px">';
  for(const fd of [1,2,3])html+=`<button onclick="_setSonarOpt('fadeDur',${fd})" id="ss-fade-${fd}" style="font-size:0.45em;padding:2px 5px;border-radius:3px;cursor:pointer;border:1px solid ${sw.fadeDur===fd?'#00eeff':'rgba(0,220,255,0.3)'};background:${sw.fadeDur===fd?'rgba(0,220,255,0.2)':'none'};color:${sw.fadeDur===fd?'#00eeff':'rgba(255,255,255,0.5)'}">${fadeNames[fd]}</button>`;
  html+='</div></div>';
  html+=`<div style="display:flex;justify-content:space-between;align-items:center"><span style="${lb}">Always On (no sweep)</span><button onclick="_setSonarOpt('alwaysOn',!_sonarCfg.alwaysOn)" id="ss-always" style="font-size:0.45em;padding:2px 8px;border-radius:3px;cursor:pointer;border:1px solid ${sw.alwaysOn?'#00ff88':'rgba(0,220,255,0.3)'};background:${sw.alwaysOn?'rgba(0,255,136,0.2)':'none'};color:${sw.alwaysOn?'#00ff88':'rgba(255,255,255,0.5)'}">${sw.alwaysOn?'ON':'OFF'}</button></div>`;
  html+='</div>';
  html+='<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(0,220,255,0.15)">';
  html+='<div style="'+tl+';margin-bottom:4px">Visual</div>';
  html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="${lb}">Dot Opacity</span><span id="ss-opac-v" style="${vl}">${sw.dotOpacity}%</span></div><input type="range" min="20" max="100" value="${sw.dotOpacity}" step="10" oninput="_setSonarSlider('dotOpacity',this.value,'ss-opac-v','%')" style="width:100%;height:14px;accent-color:#00eeff;cursor:pointer;margin-bottom:4px">`;
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="'+lb+'">Glow</span><div style="display:flex;gap:3px">';
  for(const gl of [0,1,2])html+=`<button onclick="_setSonarOpt('glowInt',${gl})" id="ss-glow-${gl}" style="font-size:0.45em;padding:2px 5px;border-radius:3px;cursor:pointer;border:1px solid ${sw.glowInt===gl?'#00eeff':'rgba(0,220,255,0.3)'};background:${sw.glowInt===gl?'rgba(0,220,255,0.2)':'none'};color:${sw.glowInt===gl?'#00eeff':'rgba(255,255,255,0.5)'}">${glowNames[gl]}</button>`;
  html+='</div></div>';
  html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="${lb}">Grid Brightness</span><span id="ss-grid-v" style="${vl}">${sw.gridBright}%</span></div><input type="range" min="0" max="200" value="${sw.gridBright}" step="20" oninput="_setSonarSlider('gridBright',this.value,'ss-grid-v','%')" style="width:100%;height:14px;accent-color:#00eeff;cursor:pointer;margin-bottom:4px">`;
  html+=`<div style="display:flex;justify-content:space-between;align-items:center"><span style="${lb}">dBZ Floor (hide below)</span><span id="ss-floor-v" style="${vl}">${sw.dbzFloor}</span></div><input type="range" min="0" max="40" value="${sw.dbzFloor}" step="5" oninput="_setSonarSlider('dbzFloor',this.value,'ss-floor-v','')" style="width:100%;height:14px;accent-color:#00eeff;cursor:pointer">`;
  html+='</div>';
  html+='<div style="margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(0,220,255,0.15)">';
  html+='<div style="'+tl+';margin-bottom:4px">Overlays</div>';
  const togs=[['showStormArrows','Storm Arrows'],['showAloft','Aloft Wind'],['showLightning','⚡ Lightning (≥48 dBZ)']];
  for(const[key,lbl]of togs){
    const on=sw[key];
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="${lb}">${lbl}</span><button onclick="_setSonarOpt('${key}',!_sonarCfg.${key})" id="ss-${key}" style="font-size:0.45em;padding:2px 8px;border-radius:3px;cursor:pointer;border:1px solid ${on?'#00ff88':'rgba(0,220,255,0.3)'};background:${on?'rgba(0,255,136,0.2)':'none'};color:${on?'#00ff88':'rgba(255,255,255,0.5)'}">${on?'ON':'OFF'}</button></div>`;
  }
  html+='</div>';
  html+='<div style="margin-bottom:6px">';
  html+='<div style="'+tl+';margin-bottom:4px">Dot Size by dBZ</div>';
  for(const cls of _SONAR_DBZ_CLASSES){
    const val=Math.round(_getDbzScale(cls)*100);
    const col=_SONAR_DBZ_COLORS[cls];
    html+=`<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1px"><span style="font-size:0.5em;color:${col};font-weight:600">${_SONAR_DBZ_LABELS[cls]}</span><span id="sonar-dbz-val-${cls}" style="${vl}">${val}%</span></div><input type="range" min="50" max="200" value="${val}" step="10" id="sonar-dbz-${cls}" oninput="_onDbzSlider('${cls}',this.value)" style="width:100%;height:14px;accent-color:${col};cursor:pointer"></div>`;
  }
  html+='</div>';
  html+='<button onclick="_resetAllSonar()" style="background:none;border:1px solid rgba(0,220,255,0.3);color:rgba(0,220,255,0.6);font-size:0.5em;padding:3px 10px;border-radius:4px;cursor:pointer;width:100%">Reset All to Default</button>';
  p.innerHTML=html;
  wrap.style.position='relative';wrap.appendChild(p);
}
function _setSonarOpt(key,val){_sonarCfg[key]=val;_saveSonarCfg();const p=document.getElementById('sonar-settings-panel');if(p)p.remove();drawMiniSonar();setTimeout(()=>_toggleSonarSettings(),50)}
function _setSonarSlider(key,val,elId,suffix){_sonarCfg[key]=Number(val);_saveSonarCfg();const el=document.getElementById(elId);if(el)el.textContent=val+suffix;drawMiniSonar()}
function _onDbzSlider(cls,val){
  _setDbzScale(cls,val/100);
  const el=document.getElementById('sonar-dbz-val-'+cls);
  if(el)el.textContent=val+'%';
  drawMiniSonar();
}
function _resetAllSonar(){
  const fresh=JSON.parse(JSON.stringify(_SONAR_DEFAULTS));
  for(const k in _sonarCfg)delete _sonarCfg[k];
  Object.assign(_sonarCfg,fresh);
  _saveSonarCfg();
  const p=document.getElementById('sonar-settings-panel');
  if(p)p.remove();
  drawMiniSonar();
  setTimeout(()=>_toggleSonarSettings(),50);
}
let _sonarZoomMi=parseInt(localStorage.getItem('st_sonarZoom'))||80;
if(!_SONAR_ZOOM_LEVELS.includes(_sonarZoomMi))_sonarZoomMi=80;
function sonarZoomIn(){const i=_SONAR_ZOOM_LEVELS.indexOf(_sonarZoomMi);if(i>0){_sonarZoomMi=_SONAR_ZOOM_LEVELS[i-1];localStorage.setItem('st_sonarZoom',_sonarZoomMi);S._sonarTotalSwept=0;S._sonarSweepAngle=0;_clusterSonarPoints();drawMiniSonar();_syncSonarZoomBtns()}}
function sonarZoomOut(){const i=_SONAR_ZOOM_LEVELS.indexOf(_sonarZoomMi);if(i<_SONAR_ZOOM_LEVELS.length-1){_sonarZoomMi=_SONAR_ZOOM_LEVELS[i+1];localStorage.setItem('st_sonarZoom',_sonarZoomMi);S._sonarTotalSwept=0;S._sonarSweepAngle=0;_clusterSonarPoints();drawMiniSonar();_syncSonarZoomBtns()}}
function _clusterSonarPoints(){
  const pts=S._rawScanPts;
  if(!pts||!pts.length){S._sonarClusteredPts=[];return}
  const viewR=_sonarZoomMi;
  const res=viewR<=20?0.003:viewR<=40?0.005:0.01;
  const inv=1/res;
  const cells=new Map();
  for(let i=0;i<pts.length;i++){
    const p=pts[i];
    const gx=Math.floor(p.lat*inv);
    const gy=Math.floor(p.lng*inv);
    const k=gx+','+gy;
    const c=cells.get(k);
    if(c){c.sLat+=p.lat;c.sLng+=p.lng;if(p.dbz>c.dbz)c.dbz=p.dbz;c.n++}
    else{cells.set(k,{sLat:p.lat,sLng:p.lng,dbz:p.dbz,n:1})}
  }
  const out=new Array(cells.size);
  let idx=0;
  for(const c of cells.values()){out[idx++]={lat:c.sLat/c.n,lng:c.sLng/c.n,dbz:c.dbz,count:c.n}}
  S._sonarClusteredPts=out;
}
function _syncSonarZoomBtns(){const zi=document.getElementById('sonar-zoom-in');const zo=document.getElementById('sonar-zoom-out');if(zi)zi.style.opacity=_sonarZoomMi<=_SONAR_ZOOM_LEVELS[0]?'0.3':'0.8';if(zo)zo.style.opacity=_sonarZoomMi>=_SONAR_ZOOM_LEVELS[_SONAR_ZOOM_LEVELS.length-1]?'0.3':'0.8'}
let _gyroHeading=null,_gyroEnabled=false,_gyroRaw=null,_gyroSmooth=null;
function initGyroCompass(){
  if(_gyroEnabled)return;
  const handler=e=>{
    let h=null;
    if(e.webkitCompassHeading!=null)h=e.webkitCompassHeading;
    else if(e.absolute&&e.alpha!=null)h=(360-e.alpha)%360;
    else if(e.alpha!=null)h=(360-e.alpha)%360;
    if(h==null)return;
    _gyroRaw=h;
    if(_gyroSmooth==null){_gyroSmooth=h;_gyroHeading=h;return}
    let diff=h-_gyroSmooth;
    if(diff>180)diff-=360;if(diff<-180)diff+=360;
    _gyroSmooth=((_gyroSmooth+diff*0.15)%360+360)%360;
    _gyroHeading=Math.round(_gyroSmooth*10)/10;
  };
  if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
    DeviceOrientationEvent.requestPermission().then(r=>{
      if(r==='granted'){window.addEventListener('deviceorientation',handler,true);_gyroEnabled=true;localStorage.setItem('st_gyro','1')}
    }).catch(()=>{});
  }else{
    window.addEventListener('deviceorientationabsolute',handler,true);
    window.addEventListener('deviceorientation',handler,true);
    _gyroEnabled=true;localStorage.setItem('st_gyro','1');
  }
}
function disableGyro(){_gyroEnabled=false;_gyroHeading=null;_gyroRaw=null;_gyroSmooth=null;localStorage.removeItem('st_gyro')}
if(localStorage.getItem('st_gyro')==='1'){try{initGyroCompass()}catch(e){}}
function _resetMinMax(){_windMinKmh=Infinity;_windMaxKmh=0}
function _trackMinMax(kmh){if(kmh>0.1){if(kmh<_windMinKmh)_windMinKmh=kmh;if(kmh>_windMaxKmh)_windMaxKmh=kmh}}
function getGaugeStyle(){return localStorage.getItem('st_gaugeStyle')||'neon'}
function setGaugeStyle(s){localStorage.setItem('st_gaugeStyle',s);reRenderActive();syncGaugeStyleBtns()}
function _led7(num,color,sz,dec){
  const segs=[0x7E,0x30,0x6D,0x79,0x33,0x5B,0x5F,0x70,0x7F,0x7B];
  const str=num.toFixed(dec!=null?dec:1);const chars=str.split('');
  let svg='';let xOff=0;const w=sz*0.6,h=sz,g=sz*0.06,sw=sz*0.12;
  const onC=color||'#ff2222';const offC='rgba(255,255,255,0.04)';
  chars.forEach(ch=>{
    if(ch==='.'){svg+=`<circle cx="${xOff+sw}" cy="${h-sw/2}" r="${sw*0.6}" fill="${onC}"/>`;xOff+=sw*2;return}
    if(ch==='-'){svg+=`<rect x="${xOff+g}" y="${h/2-sw/2}" width="${w-2*g}" height="${sw}" rx="${sw*0.3}" fill="${onC}"/>`;xOff+=w+g;return}
    const d=parseInt(ch);if(isNaN(d)){xOff+=w+g;return}
    const bits=segs[d];
    const paths=[
      {x:g,y:0,w:w-2*g,h:sw,rx:sw*0.3},
      {x:w-sw,y:g,w:sw,h:h/2-g-sw/2,rx:sw*0.3},
      {x:w-sw,y:h/2+sw/2,w:sw,h:h/2-g-sw/2,rx:sw*0.3},
      {x:g,y:h-sw,w:w-2*g,h:sw,rx:sw*0.3},
      {x:0,y:h/2+sw/2,w:sw,h:h/2-g-sw/2,rx:sw*0.3},
      {x:0,y:g,w:sw,h:h/2-g-sw/2,rx:sw*0.3},
      {x:g,y:h/2-sw/2,w:w-2*g,h:sw,rx:sw*0.3}
    ];
    paths.forEach((p,i)=>{
      const on=bits&(1<<(6-i));
      svg+=`<rect x="${xOff+p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}" fill="${on?onC:offC}"/>`;
    });
    xOff+=w+g;
  });
  return{svg,width:xOff};
}
function _getSimInterval(){const v=parseInt(localStorage.getItem('st_windSimInterval'),10);return(v>=5&&v<=30)?v*1000:5000;}
function _getGustWindow(){const v=parseInt(localStorage.getItem('st_gustWindow'),10);return[30,60,120,300].includes(v)?v*1000:30000;}
function _getAvgWindow(){const v=parseInt(localStorage.getItem('st_avgWindow'),10);return[10,30,60,120].includes(v)?v*1000:10000;}
function _fmtWindowLabel(ms){if(ms>=120000)return(ms/60000)+'m';if(ms>=60000)return'1m';return(ms/1000)+'s';}
function _trendArrowHtml(){
  if(Math.abs(_windTrend)<0.05)return'<span style="color:#94a3b8;font-size:0.6em;margin-left:2px">→</span>';
  if(_windTrend>=0.05)return'<span style="color:#22c55e;font-size:0.6em;margin-left:2px">↑</span>';
  return'<span style="color:#ef4444;font-size:0.6em;margin-left:2px">↓</span>';
}
function renderGaugeNeon(d){
  const{windSpd,wd,windDisp,gustDisp,gustRaw,windNum,windUnit,gustStr,bf,simActive}=d;
  const cx=50,cy=50,r=42,ri=36;
  const neonCyan='rgba(0,220,255,',neonOrange='rgba(255,160,0,';
  let g='';
  g+=`<defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.5" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  g+=`<circle cx="${cx}" cy="${cy}" r="${ri}" fill="none" stroke="${neonCyan}0.08)" stroke-width="0.5"/>`;
  g+=`<circle cx="${cx}" cy="${cy}" r="${ri*0.55}" fill="none" stroke="${neonCyan}0.05)" stroke-width="0.3"/>`;
  const maxArcSpd=Math.max(5,Math.ceil(Math.max(windDisp,gustDisp)*2/5)*5);
  const segsPerUnit=maxArcSpd<=30?2:1;
  const segCount=maxArcSpd*segsPerUnit;
  const segGap=segCount<=20?4:segCount<=40?2.5:1.5;
  const segR=r+4,segRi=r+0.5;
  S._gaugeMaxSegs=segCount;S._gaugeSegsPerUnit=segsPerUnit;S._gaugeArcR=segR;S._gaugeMaxSpd=maxArcSpd;
  const segAngle=360/segCount,segArc=segAngle-segGap;
  g+=`<g id="gauge-seg-group" transform="translate(${cx},${cy})">`;
  for(let i=0;i<segCount;i++){
    const rotDeg=-90+i*segAngle,radEnd=segArc*Math.PI/180;
    const cosE=Math.cos(radEnd),sinE=Math.sin(radEnd);
    const d2=`M${segR},0 A${segR},${segR} 0 ${segArc>180?1:0} 1 ${(segR*cosE).toFixed(2)},${(segR*sinE).toFixed(2)} L${(segRi*cosE).toFixed(2)},${(segRi*sinE).toFixed(2)} A${segRi},${segRi} 0 ${segArc>180?1:0} 0 ${segRi},0 Z`;
    const segVal=i/segsPerUnit;
    let fill=segVal<windDisp?`${neonCyan}0.85)`:segVal<gustDisp?`${neonOrange}0.6)`:`${neonCyan}0.08)`;
    g+=`<path class="gauge-seg" d="${d2}" fill="${fill}" style="transform:rotate(${rotDeg}deg)"/>`;
  }
  g+=`</g>`;
  const spdStep=maxArcSpd<=10?2:maxArcSpd<=20?5:maxArcSpd<=50?5:maxArcSpd<=100?10:maxArcSpd<=150?25:50;
  g+=`<g id="gauge-tick-group">`;
  for(let s=0;s<maxArcSpd;s+=spdStep){
    const frac=s/maxArcSpd,deg=(-90+frac*360)*Math.PI/180;
    const lx=cx+Math.cos(deg)*(segR+4.5),ly=cy+Math.sin(deg)*(segR+4.5);
    g+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${neonCyan}0.5)" font-size="3.2" font-weight="700" text-anchor="middle" dominant-baseline="central">${s}</text>`;
  }
  g+=`</g>`;
  [0,30,60,90,120,150,180,210,240,270,300,330].forEach(deg=>{
    const a=(deg-90)*Math.PI/180,isMajor=deg%90===0;
    const x1=cx+Math.cos(a)*(ri-0.5),y1=cy+Math.sin(a)*(ri-0.5);
    const len=isMajor?5:3;
    const x2=cx+Math.cos(a)*(ri-0.5-len),y2=cy+Math.sin(a)*(ri-0.5-len);
    g+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${neonCyan}${isMajor?'0.45':'0.15'})" stroke-width="${isMajor?1.2:0.5}"/>`;
    if(!isMajor){
      const lx=cx+Math.cos(a)*(ri-8),ly=cy+Math.sin(a)*(ri-8);
      g+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${neonCyan}0.2)" font-size="3.5" text-anchor="middle" dominant-baseline="central">${deg||360}</text>`;
    }
  });
  for(let dd=0;dd<360;dd+=10){if(dd%30===0)continue;
    const a=(dd-90)*Math.PI/180;
    g+=`<line x1="${(cx+Math.cos(a)*(ri-0.5)).toFixed(1)}" y1="${(cy+Math.sin(a)*(ri-0.5)).toFixed(1)}" x2="${(cx+Math.cos(a)*(ri-2)).toFixed(1)}" y2="${(cy+Math.sin(a)*(ri-2)).toFixed(1)}" stroke="${neonCyan}0.08)" stroke-width="0.4"/>`;
  }
  const ptrAng=(wd-90)*Math.PI/180,pTip=r-1,pBase=10;
  const px=cx+Math.cos(ptrAng)*pTip,py=cy+Math.sin(ptrAng)*pTip;
  const pLx=cx+Math.cos(ptrAng-0.2)*pBase,pLy=cy+Math.sin(ptrAng-0.2)*pBase;
  const pRx=cx+Math.cos(ptrAng+0.2)*pBase,pRy=cy+Math.sin(ptrAng+0.2)*pBase;
  const pBx=cx+Math.cos(ptrAng+Math.PI)*5,pBy=cy+Math.sin(ptrAng+Math.PI)*5;
  const neonRed='rgba(255,70,70,';
  g+=`<polygon points="${px.toFixed(1)},${py.toFixed(1)} ${pLx.toFixed(1)},${pLy.toFixed(1)} ${pBx.toFixed(1)},${pBy.toFixed(1)} ${pRx.toFixed(1)},${pRy.toFixed(1)}" fill="${neonRed}0.85)" stroke="${neonRed}1)" stroke-width="0.3"/>`;
  g+=`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2" fill="#fff" stroke="${neonRed}1)" stroke-width="0.5"/>`;
  g+=`<circle cx="${cx}" cy="${cy}" r="3" fill="${neonRed}0.3)" stroke="${neonRed}0.5)" stroke-width="0.5"/>`;
  const dotCount=Math.max(3,Math.min(16,Math.round(windDisp/2)));
  for(let i=0;i<dotCount;i++){
    const ang=(wd-90+i*5-dotCount*2.5)*Math.PI/180,dr=ri-1;
    const dx=cx+Math.cos(ang)*dr,dy=cy+Math.sin(ang)*dr;
    g+=`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${(1+i*0.05).toFixed(1)}" fill="${neonRed}${(0.2+0.6*(i/dotCount)).toFixed(2)})"/>`;
  }
  const dirStr=simActive?degToDir(_windCurSim.dir)+' '+_windCurSim.dir.toFixed(0)+'°':degToDir(wd)+' '+wd.toFixed(0)+'°';
  return`<div class="wind-rose" style="cursor:pointer" data-gauge="neon">
    <svg viewBox="-12 -12 124 124">${g}</svg>
    <div class="wind-rose-labels"><span class="wr-n">N</span><span class="wr-s">S</span><span class="wr-e">E</span><span class="wr-w">W</span></div>
    <div class="wind-rose-center">
      <div class="wrc-speed"><span class="wrc-num">${windNum}</span><span class="wrc-unit">${windUnit}</span><span class="wrc-trend">${_trendArrowHtml()}</span></div>
      <div class="wrc-dir">${dirStr}</div>
      ${gustStr?`<div class="wrc-gust">${gustStr}</div>`:''}
      <div class="wrc-avg"></div>
      <div class="wrc-force">${_beaufortBar(d.windSpd)}</div>
    </div>
  </div>`;
}
function renderGaugeMarine(d){
  const{windSpd,wd,windDisp,gustDisp,windNum,windUnit,gustStr,bf,simActive}=d;
  const minDisp=_windMinKmh<Infinity?parseFloat(kmhTo(_windMinKmh,S.windUnit)):0;
  const maxDisp=_windMaxKmh>0?parseFloat(kmhTo(_windMaxKmh,S.windUnit)):0;
  const dirDeg=simActive?_windCurSim.dir:wd;
  const cx=100,cy=100,r=82,ri=70;
  let svg='';
  svg+=`<rect x="0" y="0" width="200" height="200" rx="8" fill="#0a0a0a" stroke="#333" stroke-width="1"/>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#222" stroke-width="1"/>`;
  const segCount=72;
  for(let i=0;i<segCount;i++){
    const ang=(i*5-90)*Math.PI/180;
    const diff=((i*5-dirDeg)%360+360)%360;
    const close=diff<20||diff>340;
    const fill=close?'#dddddd':'#555555';
    const iLen=close?12:8;
    const x1=cx+Math.cos(ang)*(r-1),y1=cy+Math.sin(ang)*(r-1);
    const x2=cx+Math.cos(ang)*(r-iLen),y2=cy+Math.sin(ang)*(r-iLen);
    const sw=close?3:1.5;
    svg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${fill}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  const cardinals=[{a:0,l:'N'},{a:45,l:'NE'},{a:90,l:'E'},{a:135,l:'SE'},{a:180,l:'S'},{a:225,l:'SW'},{a:270,l:'W'},{a:315,l:'NW'}];
  cardinals.forEach(c=>{
    const a=(c.a-90)*Math.PI/180;
    const tx=cx+Math.cos(a)*(r+12),ty=cy+Math.sin(a)*(r+12);
    svg+=`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#888" font-size="8" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${c.l}</text>`;
  });
  [0,30,60,90,120,150].forEach(v=>{
    const a=(v-90)*Math.PI/180;
    const tx=cx+Math.cos(a)*(r+22),ty=cy+Math.sin(a)*(r+22);
    const a2=(360-v-90)*Math.PI/180;
    const tx2=cx+Math.cos(a2)*(r+22),ty2=cy+Math.sin(a2)*(r+22);
    svg+=`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#cc3333" font-size="7" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="monospace">${v}</text>`;
    if(v>0&&v<180)svg+=`<text x="${tx2.toFixed(1)}" y="${ty2.toFixed(1)}" fill="#cc3333" font-size="7" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="monospace">${v}</text>`;
  });
  svg+=`<text x="${cx}" y="${cy-32}" fill="#888" font-size="6" font-weight="600" text-anchor="middle" font-family="monospace">WIND SPEED</text>`;
  const spdLed=_led7(parseFloat(windNum),'#ff2222',18);
  svg+=`<g transform="translate(${cx-spdLed.width/2},${cy-30})">${spdLed.svg}</g>`;
  svg+=`<text x="${cx+spdLed.width/2+4}" y="${cy-18}" fill="#cc3333" font-size="5" text-anchor="start" font-family="monospace">${windUnit}</text>`;
  const _mtClr=Math.abs(_windTrend)<0.05?'#888':_windTrend>=0.05?'#22c55e':'#ff4444';
  const _mtSym=Math.abs(_windTrend)<0.05?'→':_windTrend>=0.05?'↑':'↓';
  svg+=`<text x="${cx+spdLed.width/2+4}" y="${cy-24}" fill="${_mtClr}" font-size="7" font-weight="700" text-anchor="start" font-family="monospace">${_mtSym}</text>`;
  svg+=`<text x="${cx}" y="${cy+2}" fill="#888" font-size="6" font-weight="600" text-anchor="middle" font-family="monospace">WIND FORCE</text>`;
  const bfBarW=120,bfBarX=cx-bfBarW/2,bfBarY=cy+5;
  for(let i=1;i<=12;i++){
    const bw=bfBarW/12;
    const fill=i<=bf?'#dddddd':'#333333';
    svg+=`<rect x="${bfBarX+(i-1)*bw+0.5}" y="${bfBarY}" width="${bw-1}" height="6" fill="${fill}" rx="1"/>`;
    svg+=`<text x="${bfBarX+(i-0.5)*bw}" y="${bfBarY+12}" fill="#777" font-size="4" text-anchor="middle" font-family="monospace">${i}</text>`;
  }
  svg+=`<text x="${cx}" y="${cy+28}" fill="#888" font-size="6" font-weight="600" text-anchor="middle" font-family="monospace">WIND DIRECTION</text>`;
  const dirLed=_led7(Math.round(dirDeg),'#ff2222',16,0);
  svg+=`<g transform="translate(${cx-dirLed.width/2},${cy+30})">${dirLed.svg}</g>`;
  svg+=`<text x="${cx+dirLed.width/2+2}" y="${cy+42}" fill="#cc3333" font-size="5" text-anchor="start" font-family="monospace">°</text>`;
  const mnLed=_led7(minDisp,'#ff2222',12);
  svg+=`<text x="16" y="14" fill="#888" font-size="6" font-weight="600" text-anchor="start" font-family="monospace">MIN</text>`;
  svg+=`<g transform="translate(10,17)">${mnLed.svg}</g>`;
  svg+=`<text x="${10+mnLed.width+2}" y="28" fill="#cc3333" font-size="4.5" text-anchor="start" font-family="monospace">${windUnit}</text>`;
  const mxLed=_led7(maxDisp,'#ff2222',12);
  svg+=`<text x="${200-16}" y="14" fill="#888" font-size="6" font-weight="600" text-anchor="end" font-family="monospace">MAX</text>`;
  svg+=`<g transform="translate(${200-10-mxLed.width},17)">${mxLed.svg}</g>`;
  svg+=`<text x="12" y="${cy}" fill="#555" font-size="7" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace" transform="rotate(-90,12,${cy})">PORT</text>`;
  svg+=`<text x="188" y="${cy}" fill="#555" font-size="7" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace" transform="rotate(90,188,${cy})">STBD</text>`;
  const pAng=(dirDeg-90)*Math.PI/180;
  svg+=`<polygon points="${(cx+Math.cos(pAng)*(ri-2)).toFixed(1)},${(cy+Math.sin(pAng)*(ri-2)).toFixed(1)} ${(cx+Math.cos(pAng-0.15)*18).toFixed(1)},${(cy+Math.sin(pAng-0.15)*18).toFixed(1)} ${(cx+Math.cos(pAng+0.15)*18).toFixed(1)},${(cy+Math.sin(pAng+0.15)*18).toFixed(1)}" fill="rgba(255,100,150,0.7)" stroke="#ff6699" stroke-width="0.5"/>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="4" fill="#222" stroke="#ff6699" stroke-width="1"/>`;
  return`<div class="wind-rose gauge-marine" data-gauge="marine" style="cursor:pointer;width:200px;height:200px;flex-shrink:0;position:relative">
    <svg viewBox="0 0 200 200" style="width:100%;height:100%">${svg}</svg>
  </div>`;
}
function renderGaugeMinimal(d){
  const{windSpd,wd,windDisp,gustDisp,windNum,windUnit,gustStr,bf,simActive}=d;
  const dirDeg=simActive?_windCurSim.dir:wd;
  const cx=50,cy=50,r=42;
  let svg='';
  svg+=`<circle cx="${cx}" cy="${cy}" r="${r+2}" fill="none" stroke="rgba(148,163,184,0.12)" stroke-width="0.8"/>`;
  const maxSpd=Math.max(10,Math.ceil(Math.max(windDisp,gustDisp)*1.3/5)*5);
  const sweepAngle=270,startAngle=135;
  const spdFrac=Math.min(1,windDisp/maxSpd);
  const gustFrac=Math.min(1,gustDisp/maxSpd);
  const endAngG=startAngle+gustFrac*sweepAngle;
  const endAngW=startAngle+spdFrac*sweepAngle;
  function arcPath(cx2,cy2,r2,a1,a2){
    const r1d=a1*Math.PI/180,r2d=a2*Math.PI/180;
    return`M${(cx2+Math.cos(r1d)*r2).toFixed(1)},${(cy2+Math.sin(r1d)*r2).toFixed(1)} A${r2},${r2} 0 ${a2-a1>180?1:0} 1 ${(cx2+Math.cos(r2d)*r2).toFixed(1)},${(cy2+Math.sin(r2d)*r2).toFixed(1)}`;
  }
  svg+=`<path d="${arcPath(cx,cy,r+2,startAngle,startAngle+sweepAngle)}" fill="none" stroke="rgba(148,163,184,0.08)" stroke-width="3" stroke-linecap="round"/>`;
  if(gustFrac>0.01)svg+=`<path d="${arcPath(cx,cy,r+2,startAngle,endAngG)}" fill="none" stroke="rgba(239,68,68,0.35)" stroke-width="3" stroke-linecap="round"/>`;
  if(spdFrac>0.01)svg+=`<path d="${arcPath(cx,cy,r+2,startAngle,endAngW)}" fill="none" stroke="rgba(148,163,184,0.6)" stroke-width="3" stroke-linecap="round"/>`;
  for(let s=0;s<=maxSpd;s+=maxSpd<=20?5:10){
    const frac=s/maxSpd;
    const a=(startAngle+frac*sweepAngle)*Math.PI/180;
    const x1=cx+Math.cos(a)*(r-2),y1=cy+Math.sin(a)*(r-2);
    const x2=cx+Math.cos(a)*(r+0.5),y2=cy+Math.sin(a)*(r+0.5);
    svg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(148,163,184,0.25)" stroke-width="0.6"/>`;
    const tx=cx+Math.cos(a)*(r-5),ty=cy+Math.sin(a)*(r-5);
    svg+=`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="rgba(148,163,184,0.35)" font-size="3.5" text-anchor="middle" dominant-baseline="central">${s}</text>`;
  }
  const pAng=(dirDeg-90)*Math.PI/180;
  const pTip=r-8;
  svg+=`<line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(pAng)*pTip).toFixed(1)}" y2="${(cy+Math.sin(pAng)*pTip).toFixed(1)}" stroke="rgba(148,163,184,0.5)" stroke-width="1.5" stroke-linecap="round"/>`;
  svg+=`<circle cx="${(cx+Math.cos(pAng)*pTip).toFixed(1)}" cy="${(cy+Math.sin(pAng)*pTip).toFixed(1)}" r="1.5" fill="rgba(148,163,184,0.7)"/>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="2" fill="rgba(148,163,184,0.3)" stroke="rgba(148,163,184,0.4)" stroke-width="0.5"/>`;
  ['N','E','S','W'].forEach((l,i)=>{
    const a=(i*90-90)*Math.PI/180;
    const tx=cx+Math.cos(a)*(r-14),ty=cy+Math.sin(a)*(r-14);
    svg+=`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="rgba(148,163,184,0.3)" font-size="4" font-weight="600" text-anchor="middle" dominant-baseline="central">${l}</text>`;
  });
  const bfClr=_BFT_CLR[bf];
  const dirStr=degToDir(dirDeg)+' '+dirDeg.toFixed(0)+'°';
  return`<div class="wind-rose gauge-minimal" data-gauge="minimal" style="cursor:pointer;width:200px;height:200px;flex-shrink:0;position:relative">
    <svg viewBox="-8 -8 116 116" style="width:100%;height:100%">${svg}</svg>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none">
      <div style="font-size:1.6em;font-weight:800;color:#e2e8f0;line-height:1"><span class="wrc-num">${windNum}</span>${_trendArrowHtml()}</div>
      <div style="font-size:0.55em;font-weight:600;color:#94a3b8;margin-top:1px" class="wrc-unit">${windUnit}</div>
      <div style="font-size:0.5em;color:#94a3b8;margin-top:2px" class="wrc-dir">${dirStr}</div>
      <div style="font-size:0.45em;color:#ef4444;margin-top:1px" class="wrc-gust">${gustStr||''}</div>
      <div style="display:inline-block;padding:1px 5px;border-radius:3px;background:${bfClr}22;border:1px solid ${bfClr}44;margin-top:2px">
        <span style="font-size:0.4em;font-weight:700;color:${bfClr}">F${bf}</span>
      </div>
    </div>
  </div>`;
}
function renderGaugeG1000(d){
  const{windSpd,wd,windDisp,gustDisp,windNum,windUnit,gustStr,bf,simActive,pressure}=d;
  const dirDeg=simActive?_windCurSim.dir:wd;
  const W=300,H=280,topBar=16,botBar=14;
  const tapeW=38,tapeTop=topBar+2,tapeBot=H-botBar-2,tapeH=tapeBot-tapeTop;
  const compassR=52,compassCx=W/2,compassCy=topBar+18+(tapeBot-topBar-36)/2;
  const green='#00ff00',cyan='#00ddff',magenta='#ff00ff',amber='#ffaa00',yellow='#ffff00';
  let svg='';
  svg+=`<rect x="0" y="0" width="${W}" height="${H}" rx="3" fill="#111318"/>`;
  svg+=`<rect x="0" y="0" width="${W}" height="${topBar}" rx="3" fill="#1a1a22"/>`;
  svg+=`<line x1="0" y1="${topBar}" x2="${W}" y2="${topBar}" stroke="#3a3e48" stroke-width="0.5"/>`;
  const storms=S.storms||[];
  const strongest=storms.length?storms.reduce((a,b)=>(b.dbz||0)>(a.dbz||0)?b:a,storms[0]):null;
  const mv=S.stormMovement;
  let topTxt='';
  if(strongest){
    topTxt+=`STM ${strongest.dbz||0}dBZ ${strongest.distance.toFixed(0)}${S.radarMetric?'km':'mi'}`;
    if(mv&&mv.speed>=2)topTxt+=`  MVG ${degToDir(mv.direction)} (${Math.round(mv.direction)}°) ${mv.speed.toFixed(0)}${S.radarMetric?'km/h':'mph'}`;
  }else{topTxt='NO STORMS DETECTED'}
  svg+=`<text x="${W/2}" y="${topBar/2+1}" fill="${strongest?amber:'#5a6070'}" font-size="5" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="monospace">${topTxt}</text>`;
  svg+=`<rect x="0" y="${H-botBar}" width="${W}" height="${botBar}" rx="3" fill="#1a1a22"/>`;
  svg+=`<line x1="0" y1="${H-botBar}" x2="${W}" y2="${H-botBar}" stroke="#3a3e48" stroke-width="0.5"/>`;
  const tempC=S.weather?S.weather.temperature_2m:null;
  const oat=tempC!=null?`OAT ${S.tempUnit===0?cToF(tempC)+'°F':tempC.toFixed(1)+'°C'}`:'';
  svg+=`<text x="4" y="${H-botBar/2+1}" fill="${cyan}" font-size="4.5" font-weight="600" text-anchor="start" dominant-baseline="central" font-family="monospace">${oat}</text>`;
  const pMb=pressure||1013.25;
  const pDisp=S.presUnit===0?(pMb*0.02953).toFixed(2):pMb.toFixed(0);
  const pUnit=S.presUnit===0?'IN':'MB';
  svg+=`<text x="${W/2}" y="${H-botBar/2+1}" fill="${green}" font-size="4.5" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="monospace">BARO ${pDisp}${pUnit}</text>`;
  svg+=`<text x="${W-4}" y="${H-botBar/2+1}" fill="#8b95a5" font-size="4.5" font-weight="600" text-anchor="end" dominant-baseline="central" font-family="monospace">F${bf} ${_BFT_NAME[bf]}</text>`;
  svg+=`<rect x="1" y="${tapeTop}" width="${tapeW}" height="${tapeH}" fill="#0c0e14" stroke="#2a2e38" stroke-width="0.5"/>`;
  const maxTape=Math.max(20,Math.ceil(Math.max(windDisp,gustDisp)*1.5/10)*10);
  const tapeCenter=tapeTop+tapeH/2;
  const pxPerUnit=tapeH*0.8/maxTape;
  for(let s=0;s<=maxTape;s+=maxTape<=30?2:5){
    const yy=tapeCenter-(s-windDisp)*pxPerUnit;
    if(yy<tapeTop+4||yy>tapeBot-4)continue;
    const major=s%(maxTape<=30?10:20)===0;
    svg+=`<line x1="1" y1="${yy.toFixed(1)}" x2="${1+(major?10:5)}" y2="${yy.toFixed(1)}" stroke="${major?'#5a6070':'#2a2e38'}" stroke-width="${major?1:0.5}"/>`;
    if(major)svg+=`<text x="13" y="${yy.toFixed(1)}" fill="#e2e8f0" font-size="6.5" font-weight="600" text-anchor="start" dominant-baseline="central" font-family="monospace">${s}</text>`;
  }
  if(gustDisp>windDisp){
    const gustY=tapeCenter-(gustDisp-windDisp)*pxPerUnit;
    if(gustY>tapeTop+4&&gustY<tapeBot-4){
      svg+=`<line x1="1" y1="${gustY.toFixed(1)}" x2="${tapeW}" y2="${gustY.toFixed(1)}" stroke="red" stroke-width="1.8"/>`;
      svg+=`<text x="${tapeW+2}" y="${gustY.toFixed(1)}" fill="#ff3333" font-size="4.5" font-weight="700" text-anchor="start" dominant-baseline="central" font-family="monospace">G${parseFloat(kmhTo(d.gustRaw,S.windUnit)).toFixed(0)}</text>`;
    }
  }
  const avgKmh=(_windMinKmh<Infinity&&_windMaxKmh>0)?(_windMinKmh+_windMaxKmh)/2:0;
  if(avgKmh>0){
    const avgDisp=parseFloat(kmhTo(avgKmh,S.windUnit));
    const avgY=tapeCenter-(avgDisp-windDisp)*pxPerUnit;
    if(avgY>tapeTop+4&&avgY<tapeBot-4){
      svg+=`<polygon points="${tapeW},${(avgY-4).toFixed(1)} ${tapeW+8},${avgY.toFixed(1)} ${tapeW},${(avgY+4).toFixed(1)}" fill="${cyan}" stroke="${cyan}" stroke-width="0.5"/>`;
      svg+=`<text x="${tapeW+10}" y="${avgY.toFixed(1)}" fill="${cyan}" font-size="4" font-weight="600" text-anchor="start" dominant-baseline="central" font-family="monospace">A${avgDisp.toFixed(0)}</text>`;
    }
  }
  const maxKmhDisp=_windMaxKmh>0?parseFloat(kmhTo(_windMaxKmh,S.windUnit)):0;
  if(maxKmhDisp>0){
    const maxY=tapeCenter-(maxKmhDisp-windDisp)*pxPerUnit;
    if(maxY>tapeTop+4&&maxY<tapeBot-4){
      svg+=`<line x1="1" y1="${maxY.toFixed(1)}" x2="${tapeW}" y2="${maxY.toFixed(1)}" stroke="${amber}" stroke-width="1" stroke-dasharray="3,2"/>`;
    }
  }
  svg+=`<polygon points="${tapeW},${(tapeCenter-7).toFixed(1)} ${tapeW+13},${(tapeCenter-7).toFixed(1)} ${tapeW+17},${tapeCenter.toFixed(1)} ${tapeW+13},${(tapeCenter+7).toFixed(1)} ${tapeW},${(tapeCenter+7).toFixed(1)}" fill="#111" stroke="${green}" stroke-width="1"/>`;
  svg+=`<text x="${tapeW+8}" y="${tapeCenter.toFixed(1)}" fill="${green}" font-size="8" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${parseFloat(windNum).toFixed(0)}</text>`;
  const _gtClr=Math.abs(_windTrend)<0.05?'#5a6070':_windTrend>=0.05?'#22c55e':'#ff4444';
  const _gtSym=Math.abs(_windTrend)<0.05?'→':_windTrend>=0.05?'↑':'↓';
  svg+=`<text x="${tapeW+8}" y="${(tapeCenter-12).toFixed(1)}" fill="${_gtClr}" font-size="7" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${_gtSym}</text>`;
  svg+=`<text x="${tapeW/2+1}" y="${tapeTop+8}" fill="${cyan}" font-size="5" font-weight="600" text-anchor="middle" font-family="monospace">${windUnit.toUpperCase()}</text>`;
  svg+=`<rect x="${W-tapeW-1}" y="${tapeTop}" width="${tapeW}" height="${tapeH}" fill="#0c0e14" stroke="#2a2e38" stroke-width="0.5"/>`;
  const pMax=S.presUnit===0?31.5:1060;const pMin=S.presUnit===0?28.5:960;
  const pVal=S.presUnit===0?pMb*0.02953:pMb;
  const pRange=pMax-pMin;
  const pTapeCenter=tapeTop+tapeH/2;
  const ppxPerUnit=tapeH*0.8/pRange;
  for(let p=Math.floor(pMin*10)/10;p<=pMax;p+=S.presUnit===0?0.5:10){
    const yy=pTapeCenter-(p-pVal)*ppxPerUnit;
    if(yy<tapeTop+4||yy>tapeBot-4)continue;
    const major=S.presUnit===0?Math.abs(p*2-Math.round(p*2))<0.01&&Math.round(p)===p:(p%50===0);
    const x0=W-tapeW-1;
    svg+=`<line x1="${(x0+tapeW-1-(major?10:5)).toFixed(1)}" y1="${yy.toFixed(1)}" x2="${(x0+tapeW-1).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="${major?'#5a6070':'#2a2e38'}" stroke-width="${major?1:0.5}"/>`;
    if(major)svg+=`<text x="${(x0+tapeW-13).toFixed(1)}" y="${yy.toFixed(1)}" fill="#e2e8f0" font-size="5.5" font-weight="600" text-anchor="end" dominant-baseline="central" font-family="monospace">${S.presUnit===0?p.toFixed(1):p}</text>`;
  }
  const pPtrR=W-tapeW-1,pPtrW=S.presUnit===0?36:26;
  svg+=`<polygon points="${pPtrR.toFixed(1)},${(pTapeCenter+7).toFixed(1)} ${(pPtrR-4).toFixed(1)},${(pTapeCenter+7).toFixed(1)} ${(pPtrR-4-pPtrW).toFixed(1)},${(pTapeCenter+7).toFixed(1)} ${(pPtrR-4-pPtrW-4).toFixed(1)},${pTapeCenter.toFixed(1)} ${(pPtrR-4-pPtrW).toFixed(1)},${(pTapeCenter-7).toFixed(1)} ${(pPtrR-4).toFixed(1)},${(pTapeCenter-7).toFixed(1)} ${pPtrR.toFixed(1)},${(pTapeCenter-7).toFixed(1)}" fill="#111" stroke="${green}" stroke-width="1"/>`;
  svg+=`<text x="${(pPtrR-4-pPtrW/2).toFixed(1)}" y="${pTapeCenter.toFixed(1)}" fill="${green}" font-size="${S.presUnit===0?'6':'7'}" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${pDisp}</text>`;
  svg+=`<text x="${W-tapeW/2-1}" y="${tapeTop+8}" fill="${cyan}" font-size="5" font-weight="600" text-anchor="middle" font-family="monospace">${pUnit}</text>`;
  const hasStorm=!!(strongest&&strongest.distance<80);
  const rotOff=(_gyroEnabled&&_gyroHeading!=null)?_gyroHeading:0;
  svg+=`<circle cx="${compassCx}" cy="${compassCy}" r="${compassR}" fill="none" stroke="${green}" stroke-width="1"/>`;
  for(let dd=0;dd<360;dd+=10){
    const a=((dd-rotOff)-90)*Math.PI/180;
    const major=dd%30===0;
    const r1=compassR-1,r2=compassR-(major?8:3);
    svg+=`<line x1="${(compassCx+Math.cos(a)*r1).toFixed(1)}" y1="${(compassCy+Math.sin(a)*r1).toFixed(1)}" x2="${(compassCx+Math.cos(a)*r2).toFixed(1)}" y2="${(compassCy+Math.sin(a)*r2).toFixed(1)}" stroke="${major?'#e2e8f0':'#3a3e48'}" stroke-width="${major?1.2:0.5}"/>`;
    if(dd%30===0){
      const lbl=dd===0?'N':dd===90?'E':dd===180?'S':dd===270?'W':String(dd/10);
      const tx=compassCx+Math.cos(a)*(compassR-14),ty=compassCy+Math.sin(a)*(compassR-14);
      svg+=`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="${dd%90===0?'#ffffff':'#e2e8f0'}" font-size="${dd%90===0?'7':'5.5'}" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${lbl}</text>`;
    }
  }
  const drawArrow=(deg,color,label,dashed,len)=>{
    const ang=((deg-rotOff)-90)*Math.PI/180;
    const aLen=len||compassR-18;
    if(dashed){
      svg+=`<line x1="${(compassCx+Math.cos(ang+Math.PI)*6).toFixed(1)}" y1="${(compassCy+Math.sin(ang+Math.PI)*6).toFixed(1)}" x2="${(compassCx+Math.cos(ang)*aLen).toFixed(1)}" y2="${(compassCy+Math.sin(ang)*aLen).toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    }else{
      svg+=`<line x1="${(compassCx+Math.cos(ang+Math.PI)*6).toFixed(1)}" y1="${(compassCy+Math.sin(ang+Math.PI)*6).toFixed(1)}" x2="${(compassCx+Math.cos(ang)*aLen).toFixed(1)}" y2="${(compassCy+Math.sin(ang)*aLen).toFixed(1)}" stroke="${color}" stroke-width="1.8"/>`;
    }
    svg+=`<polygon points="${(compassCx+Math.cos(ang)*aLen).toFixed(1)},${(compassCy+Math.sin(ang)*aLen).toFixed(1)} ${(compassCx+Math.cos(ang-0.2)*(aLen-7)).toFixed(1)},${(compassCy+Math.sin(ang-0.2)*(aLen-7)).toFixed(1)} ${(compassCx+Math.cos(ang+0.2)*(aLen-7)).toFixed(1)},${(compassCy+Math.sin(ang+0.2)*(aLen-7)).toFixed(1)}" fill="${color}" opacity="0.85"/>`;
    const lx=compassCx+Math.cos(ang)*(aLen+8),ly=compassCy+Math.sin(ang)*(aLen+8);
    if(lx>compassCx-compassR+10&&lx<compassCx+compassR-10&&ly>compassCy-compassR+5&&ly<compassCy+compassR-5){
      svg+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${color}" font-size="3.5" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${label}</text>`;
    }
  };
  drawArrow(dirDeg,magenta,'WIND',false,compassR-18);
  const upperDir=S._upperWindDir!=null?S._upperWindDir:null;
  if(upperDir!=null)drawArrow((upperDir+180)%360,yellow,'ALOFT',true,compassR-20);
  let stmEta=null,stmImpact=0,stmClosing=0;
  if(hasStorm){
    stmEta=calcStormETA(strongest);
    stmImpact=stmEta?stmEta.impact:0;
    stmClosing=stmEta?stmEta.closingSpeed:0;
    drawArrow(strongest.bearing,cyan,'STORM',false,compassR-16);
  }
  svg+=`<circle cx="${compassCx}" cy="${compassCy}" r="3.5" fill="#222" stroke="${green}" stroke-width="1"/>`;
  svg+=`<circle cx="${compassCx}" cy="${compassCy}" r="1.2" fill="${green}"/>`;
  const infoTop=compassCy-compassR-16;
  const infoBot=compassCy+compassR+4;
  const gyroLabel=(_gyroEnabled&&_gyroHeading!=null)?`GYRO ${Math.round(_gyroHeading)}°`:'N UP';
  svg+=`<rect x="${compassCx-22}" y="${infoTop}" width="44" height="12" rx="2" fill="#111" stroke="${green}" stroke-width="0.8"/>`;
  svg+=`<text x="${compassCx}" y="${infoTop+6}" fill="${green}" font-size="5.5" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">${gyroLabel}</text>`;
  const legItems=[[magenta,`WIND ${dirDeg.toFixed(0)}°`,false]];
  if(upperDir!=null)legItems.push([yellow,`ALOFT ${Math.round((upperDir+180)%360)}°`,true]);
  if(hasStorm)legItems.push([cyan,`STM ${Math.round(strongest.bearing)}°`,false]);
  const legX0=tapeW+3;
  const legY0=tapeTop+4;
  legItems.forEach((it,i)=>{
    const ly=legY0+i*9;
    if(it[2]){svg+=`<line x1="${legX0}" y1="${(ly+4).toFixed(1)}" x2="${(legX0+10).toFixed(1)}" y2="${(ly+4).toFixed(1)}" stroke="${it[0]}" stroke-width="1.2" stroke-dasharray="3,2"/>`}
    else{svg+=`<line x1="${legX0}" y1="${(ly+4).toFixed(1)}" x2="${(legX0+10).toFixed(1)}" y2="${(ly+4).toFixed(1)}" stroke="${it[0]}" stroke-width="1.5"/>`}
    svg+=`<text x="${(legX0+13).toFixed(1)}" y="${(ly+4).toFixed(1)}" fill="${it[0]}" font-size="4" font-weight="600" text-anchor="start" dominant-baseline="central" font-family="monospace">${it[1]}</text>`;
  });
  if(hasStorm){
    const distStr=strongest.distance<10?strongest.distance.toFixed(1):strongest.distance.toFixed(0);
    const distUnit=S.radarMetric?'km':'mi';
    svg+=`<rect x="${compassCx-28}" y="${infoBot}" width="56" height="12" rx="2" fill="#111" stroke="#3a3e48" stroke-width="0.6"/>`;
    svg+=`<text x="${compassCx}" y="${infoBot+6}" fill="#e2e8f0" font-size="5" font-weight="600" text-anchor="middle" dominant-baseline="central" font-family="monospace">${distStr}${distUnit} ${strongest.dbz||0}dBZ</text>`;
    const impColor=stmImpact>=80?'#ef4444':stmImpact>=50?amber:stmImpact>=20?'#eab308':green;
    svg+=`<text x="${compassCx}" y="${infoBot+18}" fill="${impColor}" font-size="5" font-weight="700" text-anchor="middle" font-family="monospace">${stmImpact}% IMPACT</text>`;
    if(stmEta&&stmEta.eta!=null){
      const etaStr=stmEta.eta<60?stmEta.eta.toFixed(0)+'m':(stmEta.eta/60).toFixed(1)+'h';
      svg+=`<text x="${compassCx}" y="${infoBot+26}" fill="${amber}" font-size="4.5" font-weight="600" text-anchor="middle" font-family="monospace">ETA ${etaStr} · ${stmClosing.toFixed(0)}mph closing</text>`;
    }
  }else{
    svg+=`<text x="${compassCx}" y="${infoBot+6}" fill="#5a6070" font-size="5" text-anchor="middle" font-family="monospace">NORTH UP · NO STORMS</text>`;
  }
  return`<div class="wind-rose gauge-g1000" data-gauge="g1000" style="cursor:pointer;width:300px;height:280px;flex-shrink:0;position:relative">
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%">${svg}</svg>
  </div>`;
}
function renderGaugeSpeedo(d){
  const{windSpd,wd,windDisp,gustDisp,windNum,windUnit,gustStr,bf,simActive}=d;
  const dirDeg=simActive?_windCurSim.dir:wd;
  const cx=100,cy=95,r=80;
  const startAng=220,endAng=-40,sweep=startAng-endAng;
  const maxSpd=Math.max(10,Math.ceil(Math.max(windDisp,gustDisp)*1.3/5)*5);
  let svg='';
  svg+=`<defs>
    <radialGradient id="speedo-bg" cx="50%" cy="45%"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0a15"/></radialGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#888"/><stop offset="50%" stop-color="#444"/><stop offset="100%" stop-color="#666"/></linearGradient>
  </defs>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="${r+10}" fill="url(#chrome)" stroke="#222" stroke-width="1"/>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="${r+7}" fill="url(#speedo-bg)"/>`;
  svg+=`<path d="${arcPathFull(cx,cy,r+3,endAng,startAng)}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>`;
  if(gustDisp>windDisp){
    const windFrac=Math.min(1,windDisp/maxSpd);
    const gustFrac=Math.min(1,gustDisp/maxSpd);
    const windAngDeg=startAng-windFrac*sweep;
    const gustAngDeg=Math.max(endAng,startAng-gustFrac*sweep);
    const rr=r+3;
    const wa=windAngDeg*Math.PI/180,ga=gustAngDeg*Math.PI/180;
    const wx=cx+Math.cos(wa)*rr,wy=cy-Math.sin(wa)*rr;
    const gx=cx+Math.cos(ga)*rr,gy=cy-Math.sin(ga)*rr;
    const angSpan=windAngDeg-gustAngDeg;
    svg+=`<path d="M${wx.toFixed(1)},${wy.toFixed(1)} A${rr},${rr} 0 ${angSpan>180?1:0} 1 ${gx.toFixed(1)},${gy.toFixed(1)}" fill="none" stroke="rgba(255,50,50,0.25)" stroke-width="8"/>`;
  }
  const step=maxSpd<=15?1:maxSpd<=30?2:maxSpd<=60?5:10;
  for(let s=0;s<=maxSpd;s+=step){
    const frac=s/maxSpd;
    const ang=(startAng-frac*sweep)*Math.PI/180;
    const major=s%(step*5===0?step*5:step<=2?10:step<=5?10:step<=10?20:50)===0||s===0;
    const x1=cx+Math.cos(ang)*(r-2),y1=cy-Math.sin(ang)*(r-2);
    const x2=cx+Math.cos(ang)*(r-(major?12:6)),y2=cy-Math.sin(ang)*(r-(major?12:6));
    svg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${major?'#ddd':'#666'}" stroke-width="${major?1.5:0.8}"/>`;
    if(major){
      const tx=cx+Math.cos(ang)*(r-18),ty=cy-Math.sin(ang)*(r-18);
      svg+=`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#ccc" font-size="7" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${s}</text>`;
    }
  }
  const needleFrac=Math.min(1,windDisp/maxSpd);
  const needleAng=(startAng-needleFrac*sweep)*Math.PI/180;
  const nx=cx+Math.cos(needleAng)*(r-6),ny=cy-Math.sin(needleAng)*(r-6);
  const nLx=cx+Math.cos(needleAng+0.08)*12,nLy=cy-Math.sin(needleAng+0.08)*12;
  const nRx=cx+Math.cos(needleAng-0.08)*12,nRy=cy-Math.sin(needleAng-0.08)*12;
  const nBx=cx+Math.cos(needleAng+Math.PI)*8,nBy=cy-Math.sin(needleAng+Math.PI)*8;
  svg+=`<polygon points="${nx.toFixed(1)},${ny.toFixed(1)} ${nLx.toFixed(1)},${nLy.toFixed(1)} ${nBx.toFixed(1)},${nBy.toFixed(1)} ${nRx.toFixed(1)},${nRy.toFixed(1)}" fill="rgba(255,40,40,0.9)" stroke="#ff2222" stroke-width="0.5"/>`;
  svg+=`<circle cx="${nx.toFixed(1)}" cy="${ny.toFixed(1)}" r="1.5" fill="#ff6666"/>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="5" fill="#333" stroke="#888" stroke-width="1"/>`;
  svg+=`<circle cx="${cx}" cy="${cy}" r="2.5" fill="#ff3333"/>`;
  const _stClr=Math.abs(_windTrend)<0.05?'#888':_windTrend>=0.05?'#22c55e':'#ff4444';
  const _stSym=Math.abs(_windTrend)<0.05?'→':_windTrend>=0.05?'↑':'↓';
  svg+=`<text x="${cx}" y="${cy-22}" fill="#00ddff" font-size="6" font-weight="600" text-anchor="middle" font-family="sans-serif">${windUnit.toUpperCase()}</text>`;
  svg+=`<text x="${cx+20}" y="${cy-22}" fill="${_stClr}" font-size="7" font-weight="700" text-anchor="start" font-family="sans-serif">${_stSym}</text>`;
  svg+=`<rect x="${cx-30}" y="${cy+12}" width="60" height="16" rx="3" fill="#0a0a15" stroke="#444" stroke-width="0.8"/>`;
  svg+=`<text x="${cx}" y="${cy+21}" fill="#00ff00" font-size="7.5" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace" class="wrc-dir">${degToDir(dirDeg)} ${dirDeg.toFixed(0)}°</text>`;
  const bfClr=_BFT_CLR[bf];
  svg+=`<rect x="${cx-14}" y="${cy+32}" width="28" height="10" rx="2" fill="#111" stroke="${bfClr}66" stroke-width="0.5"/>`;
  svg+=`<text x="${cx}" y="${cy+37}" fill="${bfClr}" font-size="5" font-weight="700" text-anchor="middle" dominant-baseline="central" font-family="monospace">F${bf}</text>`;
  if(gustDisp>windDisp){
    svg+=`<text x="${cx+38}" y="${cy+37}" fill="#ff4444" font-size="4.5" font-weight="600" text-anchor="start" font-family="monospace">G${parseFloat(kmhTo(d.gustRaw,S.windUnit)).toFixed(0)}</text>`;
  }
  return`<div class="wind-rose gauge-speedo" data-gauge="speedo" style="cursor:pointer;width:200px;height:200px;flex-shrink:0;position:relative">
    <svg viewBox="0 0 200 200" style="width:100%;height:100%">${svg}</svg>
  </div>`;
}
function arcPathFull(cx,cy,r,a1Deg,a2Deg){
  const a1=a2Deg*Math.PI/180,a2=a1Deg*Math.PI/180;
  const x1=cx+Math.cos(a1)*r,y1=cy-Math.sin(a1)*r;
  const x2=cx+Math.cos(a2)*r,y2=cy-Math.sin(a2)*r;
  const sweep=a2Deg-a1Deg;
  const large=Math.abs(sweep)>180?1:0;
  return`M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 0 ${x2.toFixed(1)},${y2.toFixed(1)}`;
}
function renderWindGauge(d){
  const style=getGaugeStyle();
  if(style==='marine')return renderGaugeMarine(d);
  if(style==='minimal')return renderGaugeMinimal(d);
  if(style==='g1000')return renderGaugeG1000(d);
  if(style==='speedo')return renderGaugeSpeedo(d);
  return renderGaugeNeon(d);
}
function syncGaugeStyleBtns(){
  const cur=getGaugeStyle();
  document.querySelectorAll('.gauge-style-btn').forEach(b=>{
    const s=b.dataset.style;
    const active=s===cur;
    b.style.background=active?'rgba(0,229,255,0.15)':'rgba(255,255,255,0.04)';
    b.style.borderColor=active?'var(--accent-cyan)':'var(--border-subtle)';
    b.style.color=active?'var(--accent-cyan)':'var(--text-muted)';
  });
}

function toggleGyroCompass(){
  if(_gyroEnabled){disableGyro();syncGyroBtn();reRenderActive();return}
  initGyroCompass();
  setTimeout(()=>{syncGyroBtn();reRenderActive()},300);
}
function syncGyroBtn(){
  const btn=document.getElementById('gyro-toggle-btn');
  if(!btn)return;
  if(_gyroEnabled){btn.textContent='✅ Gyro Compass ON';btn.style.background='rgba(0,229,255,0.15)';btn.style.borderColor='var(--accent-cyan)';btn.style.color='var(--accent-cyan)'}
  else{btn.textContent='🔄 Enable Gyro Compass';btn.style.background='rgba(255,255,255,0.04)';btn.style.borderColor='var(--border-subtle)';btn.style.color='var(--text-muted)'}
}

function fmtPres(mb){
  if(S.presUnit===0) return (mb*0.02953).toFixed(2)+' inHg';
  if(S.presUnit===1) return mb.toFixed(0)+' mb';
  if(S.presUnit===2) return (mb*0.75006).toFixed(0)+' mmHg';
  return (mb*0.1).toFixed(1)+' kPa';
}

function fmtVis(sm){
  if(S.visUnit===0) return sm.toFixed(1)+' mi';
  return (sm*1.609).toFixed(1)+' km';
}

function fmtPrecip(mm){
  if(S.precipUnit===0) return (mm/25.4).toFixed(2)+' in';
  if(S.precipUnit===1) return mm.toFixed(1)+' mm';
  return (mm/10).toFixed(2)+' cm';
}

function cycleUnit(key){
  const maxes={tempUnit:2,windUnit:4,presUnit:4,visUnit:2,precipUnit:3};
  S[key]=(S[key]+1)%maxes[key];
  try{localStorage.setItem('st_units',JSON.stringify({t:S.tempUnit,w:S.windUnit,p:S.presUnit,v:S.visUnit,pr:S.precipUnit}))}catch(e){}
  if(key==='windUnit'&&_windCurSim.spd>0&&S.activePage==='weather'){
    _windSweepAfterRender=true;
  }
  S._skipWindRestart=true;
  reRenderActive();
  S._skipWindRestart=false;
}
let _gaugeCurrentMax=10;
let _gaugeTargetMax=10;
let _gaugeLastGustFlash=0;
let _gaugePrevGust=0;
let _gaugeAvgSamples=[];
let _gaugeAvg=0;
let _gaugePrevAvg=0;
let _gaugeAvgHistory=[];
function updateGaugeSegments(windVal,gustVal){
  const g=document.getElementById('gauge-seg-group');
  if(!g)return;
  const now=Date.now();
  _gaugeAvgSamples.push({t:now,v:windVal});
  while(_gaugeAvgSamples.length&&now-_gaugeAvgSamples[0].t>_getAvgWindow())_gaugeAvgSamples.shift();
  if(_gaugeAvgSamples.length>0){
    _gaugePrevAvg=_gaugeAvg;
    _gaugeAvg=_gaugeAvgSamples.reduce((s,p)=>s+p.v,0)/_gaugeAvgSamples.length;
  }
  if(now-(_gaugeAvgHistory.length?_gaugeAvgHistory[_gaugeAvgHistory.length-1].t:0)>=200){
    _gaugeAvgHistory.push({t:now,v:_gaugeAvg});
    while(_gaugeAvgHistory.length>10)_gaugeAvgHistory.shift();
  }
  const peak=Math.max(_gaugeAvg,gustVal,1);
  const newMax=Math.max(5,Math.ceil(peak*2/5)*5);
  if(newMax!==_gaugeTargetMax)_gaugeTargetMax=newMax;
  const maxDelta=_gaugeTargetMax-_gaugeCurrentMax;
  if(Math.abs(maxDelta)>0.5){
    const rate=maxDelta>0?0.15:0.04;
    _gaugeCurrentMax+=(maxDelta*rate);
  }else _gaugeCurrentMax=_gaugeTargetMax;
  const maxSpd=Math.max(5,Math.round(_gaugeCurrentMax));
  S._gaugeMaxSpd=maxSpd;
  const isGustSpike=gustVal>_gaugePrevGust*1.15&&gustVal>windVal*1.2;
  if(isGustSpike)_gaugeLastGustFlash=now;
  _gaugePrevGust=gustVal;
  const flashActive=now-_gaugeLastGustFlash<800;
  const breathPhase=Math.sin(now*0.003)*0.08;
  const segs=g.querySelectorAll('.gauge-seg');
  const spu=S._gaugeSegsPerUnit||1;
  const avgDisp=_gaugeAvg;
  segs.forEach((s,i)=>{
    const segVal=(i/spu)*(maxSpd/(S._gaugeMaxSegs/spu||maxSpd));
    const nextSegVal=((i+1)/spu)*(maxSpd/(S._gaugeMaxSegs/spu||maxSpd));
    if(avgDisp>=segVal&&avgDisp<nextSegVal){
      s.setAttribute('fill','rgba(255,0,255,0.9)');
    }else if(segVal<windVal){
      const alpha=0.8+breathPhase;
      s.setAttribute('fill',`rgba(0,255,0,${Math.min(0.95,Math.max(0.6,alpha)).toFixed(2)})`);
    }else if(segVal<gustVal){
      const gAlpha=flashActive?1.0:0.7;
      s.setAttribute('fill',`rgba(255,0,0,${gAlpha})`);
    }else{
      s.setAttribute('fill','rgba(0,220,255,0.08)');
    }
  });
  const tickG=document.getElementById('gauge-tick-group');
  if(tickG){
    const spdStep=maxSpd<=10?2:maxSpd<=20?5:maxSpd<=50?5:maxSpd<=100?10:maxSpd<=150?25:50;
    let tickHtml='';
    for(let spd=0;spd<maxSpd;spd+=spdStep){
      const frac=spd/maxSpd;
      const deg=(-90+frac*360)*Math.PI/180;
      const lx=50+Math.cos(deg)*58.5,ly=50+Math.sin(deg)*58.5;
      tickHtml+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="rgba(0,220,255,0.5)" font-size="3.2" font-weight="700" text-anchor="middle" dominant-baseline="central">${spd}</text>`;
    }
    tickG.innerHTML=tickHtml;
  }
  const avgEl=document.querySelector('.wrc-avg');
  if(avgEl)avgEl.textContent='A'+avgDisp.toFixed(1)+' '+WIND_UNITS[S.windUnit]+' ('+_fmtWindowLabel(_getAvgWindow())+')';
  const trendEl=document.querySelector('.wrc-trend');
  if(trendEl)trendEl.innerHTML=_trendArrowHtml();
}
function windSweepAnim(){
  if(_windSweepRaf){cancelAnimationFrame(_windSweepRaf);_windSweepRaf=null}
  _windSweepPaused=true;
  const targetSpd=_windCurSim.spd;
  const targetGust=_windCurSim.gust;
  const numEl=document.querySelector('.wrc-num');
  const gustEl=document.querySelector('.wrc-gust');
  if(numEl)numEl.textContent=kmhTo(targetSpd,S.windUnit);
  if(gustEl)gustEl.textContent=targetGust>0?'G'+fmtWind(targetGust)+' ('+_fmtWindowLabel(_getGustWindow())+')':'';
  updateGaugeSegments(parseFloat(kmhTo(targetSpd,S.windUnit)),parseFloat(kmhTo(targetGust,S.windUnit)));
  _windSweepRaf=null;
  _windSweepPaused=false;
}
function loadUnits(){
  const mode=localStorage.getItem('st_unitMode');
  try{
    const u=JSON.parse(localStorage.getItem('st_units'));
    if(u!=null&&mode&&mode!=='auto'){S.tempUnit=u.t||0;S.windUnit=u.w||0;S.presUnit=u.p||0;S.visUnit=u.v||0;S.precipUnit=u.pr||0;return}
  }catch(e){}
  autoDetectUnits();
}
const IMPERIAL_CC=['US','LR','MM','PR','GU','VI','AS','MP','FM','MH','PW'];
function autoDetectUnits(){
  let cc='';
  try{
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';
    const tzCountry={'America/New_York':'US','America/Chicago':'US','America/Denver':'US','America/Los_Angeles':'US','America/Anchorage':'US','America/Phoenix':'US','Pacific/Honolulu':'US','America/Indianapolis':'US','America/Detroit':'US','America/Boise':'US','America/Juneau':'US','America/Adak':'US','Pacific/Guam':'GU','Pacific/Pago_Pago':'AS','Pacific/Palau':'PW','Pacific/Majuro':'MH','Pacific/Chuuk':'FM','Africa/Monrovia':'LR','Asia/Yangon':'MM'};
    cc=tzCountry[tz]||'';
    if(!cc&&tz.startsWith('America/')){
      const usZones=['New_York','Chicago','Denver','Los_Angeles','Anchorage','Phoenix','Honolulu','Indianapolis','Detroit','Boise','Juneau','Adak','Kentucky','North_Dakota','Menominee','Nome','Sitka','Yakutat','Metlakatla'];
      const city=tz.split('/').pop();
      if(usZones.includes(city))cc='US';
    }
    if(!cc){
      const loc=navigator.language||navigator.userLanguage||'';
      const parts=loc.split('-');
      if(parts.length>=2)cc=parts[parts.length-1].toUpperCase();
    }
  }catch(e){}
  applyUnitsForCountry(cc);
  console.log('[Units] Auto-detected: '+(IMPERIAL_CC.includes(cc)?'Imperial':'Metric')+' ('+cc+')');
}
function applyUnitsForCountry(cc){
  const isImperial=IMPERIAL_CC.includes(cc);
  S.tempUnit=isImperial?0:1;
  S.windUnit=isImperial?0:2;
  S.presUnit=isImperial?0:1;
  S.visUnit=isImperial?0:1;
  S.precipUnit=isImperial?0:1;
  S.radarMetric=!isImperial;
  S._lastDetectedCC=cc;
}
function checkLocationUnits(countryCode){
  if(!countryCode)return;
  const cc=countryCode.toUpperCase();
  const mode=localStorage.getItem('st_unitMode')||'auto';
  if(mode!=='auto')return;
  const locIsImperial=IMPERIAL_CC.includes(cc);
  const curIsImperial=S.tempUnit===0;
  if(locIsImperial===curIsImperial)return;
  applyUnitsForCountry(cc);
  saveUnits();
  const miBtn=document.getElementById('radar-toggle-units');
  if(miBtn)miBtn.textContent=S.radarMetric?'KM':'MI';
  reRenderActive();
  toast('📐 Switched to '+(locIsImperial?'Imperial (°F, mph)':'Metric (°C, km/h)')+' for this region');
}
function applyUnitPreset(mode){
  localStorage.setItem('st_unitMode',mode);
  if(mode==='imperial'){applyUnitsForCountry('US');saveUnits()}
  else if(mode==='metric'){applyUnitsForCountry('BR');saveUnits()}
  else if(mode==='custom'){
    try{
      const saved=JSON.parse(localStorage.getItem('st_customUnits'));
      if(saved){S.tempUnit=saved.t;S.windUnit=saved.w;S.presUnit=saved.p;S.visUnit=saved.v;S.precipUnit=saved.pr;saveUnits()}
    }catch(e){}
  }
  else if(mode==='auto'){autoDetectUnits();saveUnits()}
  syncUnitSelects();
  reRenderActive();
  const miBtn=document.getElementById('radar-toggle-units');
  if(miBtn)miBtn.textContent=S.radarMetric?'KM':'MI';
}
function saveCustomUnits(){
  const obj={t:S.tempUnit,w:S.windUnit,p:S.presUnit,v:S.visUnit,pr:S.precipUnit};
  localStorage.setItem('st_customUnits',JSON.stringify(obj));
  localStorage.setItem('st_unitMode','custom');
  syncUnitSelects();
  toast('💾 Custom units saved');
}
function setIndividualUnit(key,val){
  S[key]=parseInt(val,10);
  saveUnits();
  const mode=localStorage.getItem('st_unitMode')||'auto';
  if(mode==='auto')localStorage.setItem('st_unitMode','custom');
  syncUnitSelects();
  reRenderActive();
  const miBtn=document.getElementById('radar-toggle-units');
  if(miBtn)miBtn.textContent=S.radarMetric?'KM':'MI';
}
function _ubtn(containerId,options,curVal,key){
  const c=document.getElementById(containerId);if(!c)return;
  c.innerHTML=options.map((o,i)=>{
    const active=i===curVal;
    return`<button onclick="setIndividualUnit('${key}',${i})" style="padding:3px 7px;font-size:0.68em;font-weight:${active?'700':'500'};border-radius:5px;cursor:pointer;border:1px solid ${active?'var(--accent-cyan)':'var(--border-subtle)'};background:${active?'rgba(0,229,255,0.15)':'rgba(255,255,255,0.04)'};color:${active?'var(--accent-cyan)':'var(--text-muted)'};transition:all 0.15s">${o}</button>`;
  }).join('');
}
function syncUnitSelects(){
  const mode=localStorage.getItem('st_unitMode')||'auto';
  document.querySelectorAll('.unit-preset-btn').forEach(b=>{
    const id=b.id.replace('up-','');
    const active=id===mode;
    b.style.background=active?'rgba(0,229,255,0.15)':'rgba(255,255,255,0.04)';
    b.style.borderColor=active?'var(--accent-cyan)':'var(--border-subtle)';
    b.style.color=active?'var(--accent-cyan)':'var(--text-muted)';
  });
  const desc=document.getElementById('unit-preset-desc');
  if(desc){
    const msgs={auto:'Auto mode switches units when you change location',imperial:'US standard: °F, mph, inHg, mi, in',metric:'International: °C, km/h, mb, km, mm',custom:'Your saved custom unit combination'};
    desc.textContent=msgs[mode]||'';
  }
  _ubtn('ubg-temp',['°F','°C'],S.tempUnit,'tempUnit');
  _ubtn('ubg-wind',['mph','kts','km/h','m/s'],S.windUnit,'windUnit');
  _ubtn('ubg-pres',['inHg','mb','mmHg','kPa'],S.presUnit,'presUnit');
  _ubtn('ubg-vis',['mi','km'],S.visUnit,'visUnit');
  _ubtn('ubg-precip',['in','mm','cm'],S.precipUnit,'precipUnit');
  const saveRow=document.getElementById('unit-save-row');
  if(saveRow)saveRow.style.display=(mode!=='auto')?'':'none';
}

function reRenderActive(){
  if(S.forecast) renderWeather(S.forecast);
  if(S.station) renderStation();
  renderStorms();
  if(S.map){const el=document.getElementById('radar-time');if(el)el.textContent=fmtClock(new Date())}
  if(_curLang!=='en')setTimeout(quickTranslate,300);
}

function haversine(lat1,lon1,lat2,lon2){const R=3959,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function bearingDeg(lat1,lon1,lat2,lon2){const dLon=(lon2-lon1)*Math.PI/180;const y=Math.sin(dLon)*Math.cos(lat2*Math.PI/180);const x=Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180)-Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon);return((Math.atan2(y,x)*180/Math.PI)+360)%360}

const _ICON_PACKS={
  basmilius:{name:'Animated',desc:'Basmilius animated SVG'},
  emoji:{name:'Emoji',desc:'Native emoji icons'},
  'flat-filled':{name:'Flat Filled',desc:'Colorful flat icons'},
  'flat-outline':{name:'Flat Outline',desc:'Outlined flat icons'},
  glossy:{name:'Glossy 3D',desc:'Shiny 3D icons'},
  neon:{name:'Neon',desc:'Neon glow weather icons'},
  globe:{name:'3D Globe',desc:'Miniature world diorama icons'},
  'globe-animated':{name:'Animated Globe',desc:'Animated 3D globe diorama icons'},
  custom:{name:'Custom',desc:'Your own uploaded icons'}
};
const _CUSTOM_ICON_CACHE={};
let _customIconDB=null;
const _ALL_CONDITIONS=['clear-day','clear-night','few-clouds-day','few-clouds-night','partly-cloudy-day','partly-cloudy-night','overcast','fog','haze','rain','rain-heavy','snow','blizzard','sleet','thunderstorm','thunderstorm-night','thunderstorm-rain','thunderstorm-lightning','tornado','hot','cold','wind','few-clouds-day-rain','few-clouds-day-snow','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy','mostly-cloudy-night-snow','partly-cloudy-day-snow','snow-night'];
const _COND_LABELS={'clear-day':'Clear Day','clear-night':'Clear Night','few-clouds-day':'Few Clouds','few-clouds-night':'Few Clouds Night','partly-cloudy-day':'Partly Cloudy','partly-cloudy-night':'Partly Cloudy Night','overcast':'Overcast','fog':'Fog','haze':'Haze','rain':'Rain','rain-heavy':'Heavy Rain','snow':'Snow','blizzard':'Blizzard','sleet':'Sleet','thunderstorm':'Thunderstorm','thunderstorm-night':'T-Storm Night','thunderstorm-rain':'T-Storm Rain','thunderstorm-lightning':'Lightning','tornado':'Tornado','hot':'Hot','cold':'Cold','wind':'Wind','few-clouds-day-rain':'Light Rain','few-clouds-day-snow':'Light Snow','mostly-cloudy-day-rain':'Cloudy Rain','mostly-cloudy-day-rain-heavy':'Heavy Cloudy Rain','mostly-cloudy-night':'Cloudy Night','mostly-cloudy-night-rain':'Night Rain','mostly-cloudy-night-rain-heavy':'Heavy Night Rain','mostly-cloudy-night-snow':'Night Snow','partly-cloudy-day-snow':'Cloudy Snow','snow-night':'Snow Night'};
function _openCustomIconDB(){
  return new Promise((resolve,reject)=>{
    if(_customIconDB){resolve(_customIconDB);return}
    const req=indexedDB.open('StormTrackerIcons',1);
    req.onupgradeneeded=e=>{e.target.result.createObjectStore('custom-icons')};
    req.onsuccess=e=>{_customIconDB=e.target.result;resolve(_customIconDB)};
    req.onerror=e=>reject(e);
  });
}
function _putCustomIcon(cond,dataUrl){
  return _openCustomIconDB().then(db=>{
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('custom-icons','readwrite');
      tx.objectStore('custom-icons').put(dataUrl,cond);
      tx.oncomplete=()=>{_CUSTOM_ICON_CACHE[cond]=dataUrl;resolve()};
      tx.onerror=e=>reject(e);
    });
  });
}
function _deleteCustomIcon(cond){
  return _openCustomIconDB().then(db=>{
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('custom-icons','readwrite');
      tx.objectStore('custom-icons').delete(cond);
      tx.oncomplete=()=>{delete _CUSTOM_ICON_CACHE[cond];resolve()};
      tx.onerror=e=>reject(e);
    });
  });
}
function _loadAllCustomIcons(){
  return _openCustomIconDB().then(db=>{
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('custom-icons','readonly');
      const store=tx.objectStore('custom-icons');
      const req=store.openCursor();
      req.onsuccess=e=>{
        const cursor=e.target.result;
        if(cursor){_CUSTOM_ICON_CACHE[cursor.key]=cursor.value;cursor.continue()}
        else resolve(_CUSTOM_ICON_CACHE);
      };
      req.onerror=e=>reject(e);
    });
  });
}
function _clearAllCustomIcons(){
  return _openCustomIconDB().then(db=>{
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('custom-icons','readwrite');
      tx.objectStore('custom-icons').clear();
      tx.oncomplete=()=>{Object.keys(_CUSTOM_ICON_CACHE).forEach(k=>delete _CUSTOM_ICON_CACHE[k]);resolve()};
      tx.onerror=e=>reject(e);
    });
  });
}
const _BUILTIN_PACKS=['basmilius','emoji','flat-filled','flat-outline','glossy','neon','globe','globe-animated'];
function _getCustomBasePack(){const p=localStorage.getItem('st_customBasePack');return(p&&_BUILTIN_PACKS.includes(p))?p:'basmilius'}
function _setCustomBasePack(p){if(_BUILTIN_PACKS.includes(p))localStorage.setItem('st_customBasePack',p)}
function _resizeImageToSquare(file,size){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const c=document.createElement('canvas');c.width=size;c.height=size;
        const ctx=c.getContext('2d');
        const s=Math.min(img.width,img.height);
        const sx=(img.width-s)/2,sy=(img.height-s)/2;
        ctx.drawImage(img,sx,sy,s,s,0,0,size,size);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror=reject;
      img.src=e.target.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}
function uploadCustomIcon(cond){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='image/png,image/jpeg,image/svg+xml,image/webp';
  inp.onchange=async()=>{
    const f=inp.files[0];if(!f)return;
    try{
      const dataUrl=await _resizeImageToSquare(f,128);
      await _putCustomIcon(cond,dataUrl);
      syncCustomIconGrid();
      if(_getIconPack()==='custom')reRenderActive();
      showToast('Icon saved','success');
    }catch(e){showToast('Failed to process image','error')}
  };
  inp.click();
}
function removeCustomIcon(cond){
  _deleteCustomIcon(cond).then(()=>{
    syncCustomIconGrid();
    if(_getIconPack()==='custom')reRenderActive();
    showToast('Icon removed','success');
  });
}
function resetAllCustomIcons(){
  if(!confirm('Remove all custom icons? This cannot be undone.'))return;
  _clearAllCustomIcons().then(()=>{
    syncCustomIconGrid();
    if(_getIconPack()==='custom')reRenderActive();
    showToast('All custom icons cleared','success');
  });
}
function exportCustomPack(){
  const data={version:1,basePack:_getCustomBasePack(),icons:{}};
  let count=0;
  _ALL_CONDITIONS.forEach(c=>{if(_CUSTOM_ICON_CACHE[c]){data.icons[c]=_CUSTOM_ICON_CACHE[c];count++}});
  if(!count){showToast('No custom icons to export','error');return}
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='stormtracker-custom-icons.json';a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Exported ${count} custom icons`,'success');
}
function importCustomPack(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
  inp.onchange=async()=>{
    const f=inp.files[0];if(!f)return;
    try{
      const text=await f.text();
      const data=JSON.parse(text);
      if(!data.icons||typeof data.icons!=='object'){showToast('Invalid pack file','error');return}
      if(data.basePack&&_BUILTIN_PACKS.includes(data.basePack))_setCustomBasePack(data.basePack);
      const entries=Object.entries(data.icons);
      for(const[cond,url]of entries){
        if(_ALL_CONDITIONS.includes(cond))await _putCustomIcon(cond,url);
      }
      setIconPack('custom');
      syncCustomIconGrid();
      showToast(`Imported ${entries.length} icons`,'success');
    }catch(e){showToast('Failed to import pack','error')}
  };
  inp.click();
}
function _getCustomIconHtml(cond,sz){
  const url=_CUSTOM_ICON_CACHE[cond];
  if(!url)return null;
  const raw=String(sz||32);
  const hasCssUnit=/[a-z%]/.test(raw);
  const cssSize=hasCssUnit?raw:(parseInt(raw)||32)+'px';
  const numSize=parseInt(raw)||32;
  return hasCssUnit?`<img src="${url}" style="width:${cssSize};height:${cssSize};display:inline-block;vertical-align:middle" alt="${cond}" loading="lazy">`:`<img src="${url}" width="${numSize}" height="${numSize}" alt="${cond}" style="display:inline-block;vertical-align:middle" loading="lazy">`;
}
function syncCustomIconGrid(){
  const grid=document.getElementById('custom-icon-grid');if(!grid)return;
  const bp=_getCustomBasePack();
  const bpSel=document.getElementById('custom-base-pack');
  if(bpSel)bpSel.value=bp;
  let h='';
  _ALL_CONDITIONS.forEach(c=>{
    const hasCustom=!!_CUSTOM_ICON_CACHE[c];
    const icon=hasCustom?_getCustomIconHtml(c,40):getWeatherIcon(c,40,bp);
    h+=`<div class="custom-icon-slot${hasCustom?' has-custom':''}" onclick="uploadCustomIcon('${c}')">
      <div class="custom-icon-img">${icon}</div>
      <div class="custom-icon-label">${_COND_LABELS[c]||c}</div>
      ${hasCustom?`<button class="custom-icon-remove" onclick="event.stopPropagation();removeCustomIcon('${c}')" title="Remove">&times;</button>`:''}
    </div>`;
  });
  grid.innerHTML=h;
}
function changeCustomBasePack(val){
  _setCustomBasePack(val);
  syncCustomIconGrid();
  if(_getIconPack()==='custom')reRenderActive();
}
const _ICON_PACK_FILES={
  'flat-filled':['clear-day','clear-night','few-clouds-day-rain','few-clouds-day-snow','few-clouds-night','partly-cloudy-day','partly-cloudy-day-snow','partly-cloudy-night','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy','mostly-cloudy-night-snow','thunderstorm-night','snow-night','crescent-night','cloudy-night-snow','starry-night-rain','starry-night-snow','starry-night-thunder','rain','rain-heavy','snow','blizzard','overcast','cloud-light','tornado','fog','thunderstorm-lightning','thunderstorm','haze','thunderstorm-rain','overcast-dark'],
  'flat-outline':['clear-day','clear-night','few-clouds-day-rain','few-clouds-day-snow','few-clouds-night','partly-cloudy-day','partly-cloudy-day-snow','partly-cloudy-night','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy','mostly-cloudy-night-snow','thunderstorm-night','snow-night','crescent-night','cloudy-night-snow','starry-night-rain','starry-night-snow','starry-night-thunder','rain','rain-heavy','snow','blizzard','overcast','tornado','fog','thunderstorm-lightning','thunderstorm','cloud-small','haze','thunderstorm-rain','overcast-dark'],
  glossy:['clear-day','clear-night','few-clouds-day','few-clouds-night','partly-cloudy-day','overcast','rain','rain-night','thunderstorm','thunderstorm-night','snow','sleet','blizzard','hot','cold','wind'],
  neon:['clear-day','clear-night','cloud-light','cloud-small','partly-cloudy-day','partly-cloudy-day-snow','overcast','overcast-dark','few-clouds-day-rain','few-clouds-day-snow','rain','rain-heavy','thunderstorm','thunderstorm-rain','thunderstorm-lightning','snow','blizzard','fog','haze','mostly-cloudy-night','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy'],
  globe:['clear-day','clear-night','partly-cloudy-day','partly-cloudy-day-snow','overcast','overcast-dark','cloud-light','cloud-small','few-clouds-day-rain','few-clouds-day-snow','rain','rain-heavy','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy','mostly-cloudy-night-snow','thunderstorm','thunderstorm-rain','thunderstorm-lightning','thunderstorm-night','snow','snow-night','blizzard','fog','haze','tornado'],
  'globe-animated':['clear-day','clear-night','partly-cloudy-day','partly-cloudy-day-snow','overcast','overcast-dark','cloud-light','cloud-small','few-clouds-day-rain','few-clouds-day-snow','rain','rain-heavy','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy','mostly-cloudy-night-snow','thunderstorm','thunderstorm-rain','thunderstorm-lightning','thunderstorm-night','snow','snow-night','blizzard','fog','haze','tornado']
};
const _WMO_TO_COND={};
function _buildWmoCondMap(isDay){
  return{0:isDay?'clear-day':'clear-night',1:isDay?'few-clouds-day':'few-clouds-night',2:isDay?'partly-cloudy-day':'partly-cloudy-night',3:'overcast',45:'fog',48:'fog',51:isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain',53:isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain',55:isDay?'mostly-cloudy-day-rain':'mostly-cloudy-night-rain',56:'sleet',57:'sleet',61:isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain',63:'rain',65:'rain-heavy',66:'sleet',67:'sleet',71:isDay?'few-clouds-day-snow':'snow-night',73:'snow',75:'blizzard',77:'snow',80:isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain',81:isDay?'mostly-cloudy-day-rain':'mostly-cloudy-night-rain',82:isDay?'mostly-cloudy-day-rain-heavy':'mostly-cloudy-night-rain-heavy',85:isDay?'partly-cloudy-day-snow':'mostly-cloudy-night-snow',86:'blizzard',95:isDay?'thunderstorm':'thunderstorm-night',96:isDay?'thunderstorm-rain':'thunderstorm-night',99:isDay?'thunderstorm-rain':'thunderstorm-night'};
}
function wmoToCondition(code,isDay){return _buildWmoCondMap(isDay)[code]||'overcast'}
function _getIconPack(){return S.iconPack||localStorage.getItem('st_iconPack')||'basmilius'}
function setIconPack(pack){
  S.iconPack=pack;
  localStorage.setItem('st_iconPack',pack);
  syncIconPackUI();
  reRenderActive();
}
function _condToEmoji(cond){
  const m={'clear-day':'☀️','clear-night':'🌙','few-clouds-day':'🌤️','few-clouds-day-rain':'🌦️','few-clouds-day-snow':'🌨️','few-clouds-night':'🌙','partly-cloudy-day':'⛅','partly-cloudy-day-snow':'🌨️','partly-cloudy-night':'☁️','mostly-cloudy-day-rain':'🌧️','mostly-cloudy-day-rain-heavy':'🌧️','mostly-cloudy-night':'☁️','mostly-cloudy-night-rain':'🌧️','mostly-cloudy-night-rain-heavy':'🌧️','mostly-cloudy-night-snow':'🌨️','overcast':'☁️','fog':'🌫️','rain':'🌧️','rain-heavy':'🌧️','rain-night':'🌧️','snow':'🌨️','snow-night':'🌨️','blizzard':'❄️','sleet':'🧊','thunderstorm':'⛈️','thunderstorm-night':'⛈️','thunderstorm-rain':'⛈️','thunderstorm-lightning':'🌩️','tornado':'🌪️','hot':'🌡️','cold':'🌡️','wind':'💨','haze':'🌫️','crescent-night':'🌙','starry-night-rain':'🌧️','starry-night-snow':'🌨️','starry-night-thunder':'⛈️','cloudy-night-snow':'🌨️','cloud-light':'☁️','cloud-small':'☁️','overcast-dark':'☁️'};
  return m[cond]||'🌡️';
}
function _condToBasmilius(cond){
  const m={'clear-day':'clear-day','clear-night':'clear-night','few-clouds-day':'partly-cloudy-day','few-clouds-day-rain':'partly-cloudy-day-rain','few-clouds-day-snow':'partly-cloudy-day-snow','few-clouds-night':'partly-cloudy-night','partly-cloudy-day':'partly-cloudy-day','partly-cloudy-day-snow':'overcast-day-snow','partly-cloudy-night':'partly-cloudy-night','mostly-cloudy-day-rain':'overcast-day-rain','mostly-cloudy-day-rain-heavy':'extreme-rain','mostly-cloudy-night':'overcast-night','mostly-cloudy-night-rain':'overcast-night-rain','mostly-cloudy-night-rain-heavy':'extreme-rain','mostly-cloudy-night-snow':'overcast-night-snow','overcast':'overcast','fog':'fog','rain':'rain','rain-heavy':'extreme-rain','rain-night':'overcast-night-rain','snow':'snow','snow-night':'overcast-night-snow','blizzard':'extreme-snow','sleet':'sleet','thunderstorm':'thunderstorms-day-rain','thunderstorm-night':'thunderstorms-night-rain','thunderstorm-rain':'thunderstorms-day-extreme-rain','thunderstorm-lightning':'thunderstorms-rain','tornado':'tornado','hot':'thermometer-warmer','cold':'thermometer-colder','wind':'wind','haze':'haze','crescent-night':'clear-night','starry-night-rain':'overcast-night-rain','starry-night-snow':'overcast-night-snow','starry-night-thunder':'thunderstorms-night-rain','cloudy-night-snow':'overcast-night-snow','cloud-light':'overcast','cloud-small':'overcast','overcast-dark':'overcast'};
  return m[cond]||'not-available';
}
function _packHasIcon(pack,cond){
  const files=_ICON_PACK_FILES[pack];
  return files&&files.includes(cond);
}
function _findBestPackIcon(pack,cond){
  if(_packHasIcon(pack,cond))return cond;
  const fb={'few-clouds-day':'clear-day','few-clouds-night':'clear-night','few-clouds-day-rain':'rain','few-clouds-day-snow':'snow','partly-cloudy-day-snow':'snow','mostly-cloudy-day-rain':'rain','mostly-cloudy-day-rain-heavy':'rain-heavy','mostly-cloudy-night':'overcast','mostly-cloudy-night-rain':'rain','mostly-cloudy-night-rain-heavy':'rain-heavy','mostly-cloudy-night-snow':'snow','rain-night':'rain','snow-night':'snow','thunderstorm-night':'thunderstorm','thunderstorm-rain':'thunderstorm','thunderstorm-lightning':'thunderstorm','starry-night-rain':'rain','starry-night-snow':'snow','starry-night-thunder':'thunderstorm','cloudy-night-snow':'snow','crescent-night':'clear-night','cloud-light':'overcast','cloud-small':'overcast','overcast-dark':'overcast','haze':'fog','sleet':'snow','blizzard':'snow','hot':'clear-day','cold':'snow','wind':'overcast','tornado':'thunderstorm'};
  const alt=fb[cond];
  if(alt&&_packHasIcon(pack,alt))return alt;
  return null;
}
function getWeatherIcon(cond,sz,forcePack){
  const pack=forcePack||_getIconPack();
  const raw=String(sz||32);
  const hasCssUnit=/[a-z%]/.test(raw);
  const cssSize=hasCssUnit?raw:(parseInt(raw)||32)+'px';
  const numSize=parseInt(raw)||32;
  if(pack==='custom'){
    const customHtml=_getCustomIconHtml(cond,sz);
    if(customHtml)return customHtml;
    return getWeatherIcon(cond,sz,_getCustomBasePack());
  }
  if(pack==='emoji')return`<span style="font-size:${cssSize};line-height:1;display:inline-block;vertical-align:middle">${_condToEmoji(cond)}</span>`;
  if(pack==='basmilius'){const bm=_condToBasmilius(cond);return hasCssUnit?`<img src="${BMCDN}${bm}.svg" style="width:${cssSize};height:${cssSize};display:inline-block;vertical-align:middle" alt="" loading="lazy">`:`<img src="${BMCDN}${bm}.svg" width="${numSize}" height="${numSize}" alt="" style="display:inline-block;vertical-align:middle" loading="lazy">`}
  const _VIDEO_PACKS=['globe-animated'];
  if(_VIDEO_PACKS.includes(pack)){
    const best=_findBestPackIcon(pack,cond);
    if(best){
      const vidSrc=`icons/${pack}/${best}.mp4`;
      const fallbackSrc=`icons/globe/${best}.png`;
      const sizeStyle=hasCssUnit?`width:${cssSize};height:${cssSize}`:`width:${numSize}px;height:${numSize}px`;
      return`<video autoplay muted playsinline style="${sizeStyle};display:inline-block;vertical-align:middle;object-fit:cover;border-radius:50%" src="${vidSrc}" poster="${fallbackSrc}" onloadedmetadata="this._ppDir=1;this._ppDur=this.duration" ontimeupdate="if(this._ppDir===1&&this.currentTime>=this._ppDur-0.05){this.pause();this._ppDir=-1;this._ppRaf=()=>{if(this._ppDir!==-1)return;this.currentTime=Math.max(0,this.currentTime-0.033);if(this.currentTime<=0.05){this._ppDir=1;this.currentTime=0;this.play();return};requestAnimationFrame(this._ppRaf)};requestAnimationFrame(this._ppRaf)}" onerror="this.outerHTML='<img src=&quot;${fallbackSrc}&quot; style=&quot;${sizeStyle};display:inline-block;vertical-align:middle&quot; alt=&quot;${cond}&quot;>'"></video>`;
    }
    return getWeatherIcon(cond,sz,'globe');
  }
  const best=_findBestPackIcon(pack,cond);
  const src=best?`icons/${pack}/${best}.png`:`${BMCDN}${_condToBasmilius(cond)}.svg`;
  return hasCssUnit?`<img src="${src}" style="width:${cssSize};height:${cssSize};display:inline-block;vertical-align:middle" alt="${cond}" loading="lazy">`:`<img src="${src}" width="${numSize}" height="${numSize}" alt="${cond}" style="display:inline-block;vertical-align:middle" loading="lazy">`;
}
const _ICON_PREVIEW_CONDS=['clear-day','few-clouds-day','rain','thunderstorm','snow','clear-night'];
function syncIconPackUI(){
  const pack=_getIconPack();
  document.querySelectorAll('.icon-pack-btn').forEach(btn=>{
    const p=btn.dataset.pack;
    btn.style.background=p===pack?'rgba(0,229,255,0.2)':'rgba(255,255,255,0.04)';
    btn.style.borderColor=p===pack?'var(--accent-cyan)':'var(--border-subtle)';
    btn.style.color=p===pack?'var(--accent-cyan)':'var(--text-muted)';
  });
  const prev=document.getElementById('icon-pack-preview');
  if(prev){let h='';_ICON_PREVIEW_CONDS.forEach(c=>{h+=getWeatherIcon(c,28)});prev.innerHTML=h}
  const customSection=document.getElementById('custom-icon-section');
  if(customSection)customSection.style.display=pack==='custom'?'block':'none';
  if(pack==='custom')syncCustomIconGrid();
}
function wmoIcon(code,isDay){return _condToEmoji(wmoToCondition(code,isDay))}
const BMCDN='https://cdn.jsdelivr.net/gh/basmilius/weather-icons@dev/production/fill/svg/';
function wmoToBasmilius(code,isDay){
  const d=isDay;
  const map={
    0:d?'clear-day':'clear-night',
    1:d?'partly-cloudy-day':'partly-cloudy-night',
    2:d?'partly-cloudy-day':'partly-cloudy-night',
    3:'overcast',
    45:d?'fog-day':'fog-night',
    48:d?'fog-day':'fog-night',
    51:'drizzle',53:'drizzle',55:'drizzle',
    56:d?'overcast-day-sleet':'overcast-night-sleet',
    57:d?'overcast-day-sleet':'overcast-night-sleet',
    61:d?'overcast-day-rain':'overcast-night-rain',
    63:'rain',65:'extreme-rain',
    66:d?'overcast-day-sleet':'overcast-night-sleet',
    67:'sleet',
    71:d?'overcast-day-snow':'overcast-night-snow',
    73:'snow',75:'extreme-snow',
    77:'snow',
    80:d?'partly-cloudy-day-rain':'partly-cloudy-night-rain',
    81:d?'overcast-day-rain':'overcast-night-rain',
    82:'extreme-rain',
    85:d?'partly-cloudy-day-snow':'partly-cloudy-night-snow',
    86:'extreme-snow',
    95:d?'thunderstorms-day-rain':'thunderstorms-night-rain',
    96:d?'thunderstorms-day-extreme-rain':'thunderstorms-night-extreme-rain',
    99:'thunderstorms-extreme-rain'
  };
  return map[code]||'not-available';
}
function bmIcon(name,sz){
  const s=parseInt(sz)||32;
  return`<img src="${BMCDN}${name}.svg" width="${s}" height="${s}" alt="" style="display:inline-block;vertical-align:middle" loading="lazy">`;
}
function neonWx(code,isDay,sz){
  const cond=wmoToCondition(code,isDay);
  return getWeatherIcon(cond,parseInt(sz)||32);
}
function animEmoji(code,isDay,size){
  const px=typeof size==='string'&&size.endsWith('px')?parseInt(size):size==='1.2em'?38:size==='1em'?30:parseInt(size)||28;
  return neonWx(code,isDay,px);
}
function _metarHasWxCodes(raw){if(!raw)return false;const parts=raw.split(/\s+/);for(const p of parts){if(p.match(/^[-+]?(VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(RA|SN|DZ|GR|GS|PL|IC|PE|SG|UP|FG|BR|HZ|FU|SA|DU|VA|PO|SQ|FC|SS|DS)+$/))return true}return false}
function _validateWxString(wxStr,rawMetar){if(!wxStr)return wxStr;if(rawMetar&&_metarHasWxCodes(rawMetar))return wxStr;if(/rain|snow|drizzle|thunder|storm|fog|mist|haze|sleet|hail|freezing|shower|precip/i.test(wxStr))return '';return wxStr}
function wmoDesc(code){const m={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',56:'Freezing drizzle',57:'Dense freezing drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Mod rain showers',82:'Violent rain showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'T-storm w/ hail',99:'T-storm w/ heavy hail'};return m[code]||'Unknown'}

const DBZ_SCALE=[
  {min:0,  color:'#0099ff',label:'Drizzle/Mist',           cls:'light',   opacity:0.15},
  {min:20, color:'#00ccff',label:'Light rain',              cls:'light',   opacity:0.18},
  {min:25, color:'#00ffcc',label:'Light rain',              cls:'light',   opacity:0.22},
  {min:30, color:'#00ff66',label:'Light to moderate rain',  cls:'moderate',opacity:0.28},
  {min:35, color:'#aaff00',label:'Moderate rain',           cls:'moderate',opacity:0.33},
  {min:40, color:'#ffee00',label:'Moderate to heavy rain',  cls:'heavy',   opacity:0.40},
  {min:45, color:'#ff5500',label:'Heavy rain',              cls:'heavy',   opacity:0.45},
  {min:50, color:'#ff2200',label:'Heavy rain, small hail possible',cls:'intense',opacity:0.50},
  {min:55, color:'#ff0033',label:'Very heavy rain, hail possible',cls:'intense',opacity:0.55},
  {min:60, color:'#ff00ff',label:'Very heavy rain, hail likely',cls:'extreme',opacity:0.60},
  {min:65, color:'#ff00ff',label:'Hail very likely, large hail',cls:'extreme',opacity:0.60}
];
function _dbzEntry(dbz){for(let i=DBZ_SCALE.length-1;i>=0;i--){if(dbz>=DBZ_SCALE[i].min)return DBZ_SCALE[i]}return DBZ_SCALE[0]}
function stormCat(dbz){
  const e=_dbzEntry(dbz);
  const m=S.radarMetric;
  const rainMap={0:m?'trace':'trace',20:m?'0.6 mm/hr':'0.02 in/hr',25:m?'1.3 mm/hr':'0.05 in/hr',30:m?'2.7 mm/hr':'0.10 in/hr',35:m?'5.6 mm/hr':'0.22 in/hr',40:m?'1.1 cm/hr':'0.45 in/hr',45:m?'2.3 cm/hr':'0.92 in/hr',50:m?'4.8 cm/hr':'1.9 in/hr',55:m?'10 cm/hr':'4 in/hr',60:m?'20 cm/hr':'8 in/hr',65:m?'>42 cm/hr':'>16.6 in/hr'};
  return{label:e.label,cls:e.cls,color:e.color,rain:rainMap[e.min]||'trace'};
}
function dbzHex(dbz){return _dbzEntry(dbz).color}
function fmtStormDist(mi){return S.radarMetric?(mi*1.60934).toFixed(1)+' km':mi.toFixed(1)+' mi'}
function fmtCountdown(totalSec){
  if(totalSec<=0)return'NOW';
  const h=Math.floor(totalSec/3600),m=Math.floor((totalSec%3600)/60),s=totalSec%60;
  if(h>0)return h+'h:'+String(m).padStart(2,'0')+'m:'+String(s).padStart(2,'0')+'s';
  return m+'m:'+String(s).padStart(2,'0')+'s';
}
function fmtArrivalTime(etaMin){
  return fmtClockShort(new Date(Date.now()+etaMin*60000));
}
function stormKey(s){return s.lat.toFixed(3)+','+s.lng.toFixed(3)}
function autoScanInterval(){
  const n=S.storms.length;
  if(n>=4)return 10*60*1000;
  if(n>=1)return 15*60*1000;
  return 30*60*1000;
}
function scheduleAutoScan(){
  if(S.autoScanTimer)clearTimeout(S.autoScanTimer);
  const interval=autoScanInterval();
  const elapsed=Date.now()-S.lastScanMs;
  const wait=Math.max(0,interval-elapsed);
  S.autoScanTimer=setTimeout(()=>{
    if(S.lat!=null){
      if(S._lastScanWasHiRes&&S.map)scanRadarHiRes(S.map,true);
      else scanRadarForStorms();
      updateAutoScanUI();
    }
  },wait);
  updateAutoScanUI();
}
function updateAutoScanUI(){
  const el=document.getElementById('auto-scan-status');
  if(!el)return;
  const interval=autoScanInterval();
  const n=S.storms.length;
  const mins=Math.round(interval/60000);
  el.textContent=n?`Auto-scan: ${mins}m (${n} storm${n>1?'s':''})`:`Auto-scan: ${mins}m`;
}
function startEtaCountdowns(){
  if(S.etaTimer)clearInterval(S.etaTimer);
  S.etaTimer=setInterval(()=>{
    const now=Date.now();
    let expiredKeys=[];
    document.querySelectorAll('[data-eta-sec]').forEach(el=>{
      const target=parseInt(el.getAttribute('data-eta-sec'));
      const key=el.getAttribute('data-storm-key');
      const remain=Math.max(0,Math.round((target-now)/1000));
      if(remain<=0){
        if(key)expiredKeys.push(key);
      }else{
        el.textContent=fmtCountdown(remain);
      }
    });
    if(expiredKeys.length&&!S._etaRescanInProgress){
      const sinceLastScan=now-S.lastScanMs;
      if(sinceLastScan<30000){
        expiredKeys.forEach(k=>{delete S._stormETAs[k]});
        S.storms=S.storms.filter(s=>!expiredKeys.includes(stormKey(s)));
        computeTopStorms();
        renderStorms();updateStormBadges();
        if(S.map)plotStormMarkers(S.map);
        return;
      }
      expiredKeys.forEach(k=>{delete S._stormETAs[k]});
      S.storms=S.storms.filter(s=>!expiredKeys.includes(stormKey(s)));
      computeTopStorms();
      renderStorms();updateStormBadges();
      if(S.map)plotStormMarkers(S.map);
      S._etaRescanInProgress=true;
      const doScan=async()=>{
        if(S.lat!=null){
          if(S._lastScanWasHiRes&&S.map)await scanRadarHiRes(S.map,true);
          else await scanRadarForStorms();
        }
        S._etaRescanInProgress=false;
      };
      doScan();
    }
    document.querySelectorAll('.popup-countdown').forEach(el=>{
      const target=parseInt(el.getAttribute('data-target'));
      const remain=Math.max(0,Math.round((target-now)/1000));
      el.textContent=fmtCountdown(remain);
    });
    document.querySelectorAll('.tier-eta-cd').forEach(el=>{
      const target=parseInt(el.getAttribute('data-tier-target'));
      if(!target||isNaN(target))return;
      const remain=Math.max(0,Math.round((target-now)/1000));
      const cd=fmtCountdown(remain);
      const arr=fmtClockShort(new Date(target));
      el.innerHTML='<b>'+cd+'</b> ('+arr+')';
    });
    document.querySelectorAll('[data-dist-mi]').forEach(el=>{
      const closSpd=parseFloat(el.getAttribute('data-closing-mph')||'0');
      const targetMs=parseInt(el.getAttribute('data-target-ms')||'0');
      if(!closSpd||!targetMs)return;
      const remainHrs=Math.max(0,(targetMs-now)/3600000);
      const curDist=remainHrs*closSpd;
      el.textContent=S.radarMetric?(curDist*1.60934).toFixed(2)+' km':curDist.toFixed(2)+' mi';
    });
  },1000);
}
function toggleStormUnits(){
  S.radarMetric=!S.radarMetric;
  const btn=document.getElementById('radar-toggle-units');
  if(btn)btn.textContent=S.radarMetric?'KM':'MI';
  renderStorms();
  if(S.map)plotStormMarkers(S.map);
}
function calcDewC(tc,rh){const a=17.27,b=237.7,g=(a*tc)/(b+tc)+Math.log(Math.min(100,rh)/100);return Math.min(tc,(b*g)/(a-g))}

function pixelToDbz(r,g,b,a){
  if(a<30)return 0;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  if(d===0||d/mx<0.15)return 0;
  let h;
  if(mx===r)h=60*((g-b)/d%6);
  else if(mx===g)h=60*((b-r)/d+2);
  else h=60*((r-g)/d+4);
  if(h<0)h+=360;
  if(h>=170&&h<=250)return 15;
  if(h>=80&&h<170)return 25;
  if(h>=40&&h<80)return 35;
  if(h>=20&&h<40)return 45;
  if(h<20||h>=340)return 55;
  if(h>=250&&h<340)return 70;
  return 0;
}
const NEXRAD_PAL=[
  {dbz:5,r:100,g:210,b:230},{dbz:5,r:136,g:221,b:238},
  {dbz:10,r:54,g:186,b:229},{dbz:10,r:0,g:100,b:150},
  {dbz:15,r:0,g:160,b:230},{dbz:15,r:0,g:136,b:191},
  {dbz:15,r:0,g:145,b:202},{dbz:15,r:0,g:163,b:224},
  {dbz:20,r:0,g:127,b:180},{dbz:20,r:0,g:112,b:163},
  {dbz:20,r:0,g:215,b:130},{dbz:20,r:0,g:145,b:65},
  {dbz:25,r:0,g:78,b:120},{dbz:25,r:0,g:74,b:112},
  {dbz:25,r:0,g:81,b:128},{dbz:25,r:0,g:85,b:136},
  {dbz:25,r:0,g:110,b:33},{dbz:30,r:0,g:75,b:0},
  {dbz:35,r:255,g:255,b:33},{dbz:35,r:255,g:238,b:0},
  {dbz:42,r:255,g:115,b:0},
  {dbz:45,r:255,g:0,b:0},{dbz:55,r:150,g:0,b:0},
  {dbz:55,r:175,g:0,b:150},
  {dbz:60,r:230,g:100,b:230}
];
function nexradToDbz(r,g,b,a){
  if(a<30)return 0;
  if(r+g+b<40)return 0;
  if(r>220&&g>220&&b>220)return 0;
  let best=0,bestD=1e9;
  for(const p of NEXRAD_PAL){
    const d=(r-p.r)**2+(g-p.g)**2+(b-p.b)**2;
    if(d<bestD){bestD=d;best=p.dbz}
  }
  if(bestD>5000)return 0;
  return best;
}
const RV_UB=[
  {dbz:10,r:0xce,g:0xc0,b:0x87},{dbz:12,r:0xd6,g:0xc8,b:0x8f},
  {dbz:14,r:0xde,g:0xd0,b:0x97},{dbz:15,r:0x88,g:0xdd,b:0xee},
  {dbz:16,r:0x6c,g:0xd1,b:0xeb},{dbz:17,r:0x51,g:0xc5,b:0xe8},
  {dbz:18,r:0x36,g:0xba,b:0xe5},{dbz:19,r:0x1b,g:0xae,b:0xe2},
  {dbz:20,r:0x00,g:0xa3,b:0xe0},{dbz:22,r:0x00,g:0x91,b:0xca},
  {dbz:25,r:0x00,g:0x77,b:0xaa},{dbz:27,r:0x00,g:0x69,b:0x9c},
  {dbz:30,r:0x00,g:0x55,b:0x88},{dbz:32,r:0x00,g:0x4e,b:0x78},
  {dbz:34,r:0x00,g:0x47,b:0x68},{dbz:35,r:0xff,g:0xee,b:0x00},
  {dbz:37,r:0xff,g:0xd2,b:0x00},{dbz:39,r:0xff,g:0xb7,b:0x00},
  {dbz:40,r:0xff,g:0xaa,b:0x00},{dbz:42,r:0xff,g:0x95,b:0x00},
  {dbz:44,r:0xff,g:0x81,b:0x00},{dbz:45,r:0xff,g:0x44,b:0x00},
  {dbz:47,r:0xe6,g:0x28,b:0x00},{dbz:48,r:0xd9,g:0x1b,b:0x00},
  {dbz:50,r:0xc1,g:0x00,b:0x00},{dbz:52,r:0x8f,g:0x00,b:0x00},
  {dbz:54,r:0x5d,g:0x00,b:0x00},{dbz:55,r:0xff,g:0xaa,b:0xff},
  {dbz:57,r:0xff,g:0x95,b:0xff},{dbz:60,r:0xff,g:0x77,b:0xff},
  {dbz:63,r:0xff,g:0x58,b:0xff},{dbz:65,r:0xff,g:0xff,b:0xff},
  {dbz:10,r:0xbf,g:0xff,b:0xff},{dbz:15,r:0x9f,g:0xdf,b:0xff},
  {dbz:20,r:0x7f,g:0xbf,b:0xff},{dbz:25,r:0x5f,g:0x9f,b:0xff},
  {dbz:30,r:0x4f,g:0x8f,b:0xff},{dbz:35,r:0x3f,g:0x7f,b:0xff},
  {dbz:40,r:0x2f,g:0x6f,b:0xff},{dbz:45,r:0x1f,g:0x5f,b:0xff},
  {dbz:50,r:0x0f,g:0x4f,b:0xff},{dbz:55,r:0x00,g:0x3f,b:0xff}
];
function rvToDbz(r,g,b,a){
  if(a<20)return 0;
  let raw=0;
  if(r<10&&g>200&&b<10)raw=75;
  else if(r>240&&g>240&&b>240)raw=65;
  else if(r>200&&b>200&&g<r){
    raw=g>160?55:g>130?57:g>100?59:g>80?61:63;
  }
  else if(r>200&&g>60&&b<30){
    if(g>200)raw=35;else if(g>170)raw=37;else if(g>140)raw=39;
    else if(g>120)raw=40;else if(g>100)raw=42;else if(g>80)raw=44;
    else raw=45;
  }
  else if(r>80&&g<70&&b<30&&a>200){
    if(r>240)raw=45;else if(r>220)raw=47;else if(r>200)raw=48;
    else if(r>180)raw=50;else if(r>130)raw=52;else raw=54;
  }
  else if(b>150&&r<180&&g>150){
    if(r>120)raw=15;else if(g>200)raw=16;else if(g>180)raw=17;
    else raw=18;
  }
  else if(r<10&&g<180&&b>80){
    if(g>150)raw=20;else if(g>120)raw=22;else if(g>100)raw=25;
    else if(g>80)raw=28;else raw=30+Math.min(4,Math.floor((88-g)/10));
  }
  else if(a<150&&r>80&&g>70&&b>50&&r<230){
    raw=Math.min(14,Math.max(8,Math.round((a-20)/15)+8));
  }
  else if(b>200&&g>100&&r<150){
    if(g>200)raw=10;else if(g>160)raw=15;else if(g>100)raw=20;
    else raw=30;
  }
  else{
    let best=0,bestD=1e9;
    for(const p of RV_UB){
      const d=(r-p.r)**2+(g-p.g)**2+(b-p.b)**2;
      if(d<bestD){bestD=d;best=p.dbz}
    }
    raw=bestD<6000?best:0;
  }
  if(raw<=0)return 0;
  const boost=raw>=30?Math.round(raw*1.29):raw>=20?Math.round(raw*1.18):raw>=15?Math.round(raw*1.10):raw;
  return Math.min(75,boost);
}

// ==========================================
// NAVIGATION
// ==========================================
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const page=btn.dataset.page;
    switchPage(page);
  });
});

// ==========================================
// LOCATION
// ==========================================
function toggleLocOverlay(open){
  const el=document.getElementById('loc-overlay');
  if(open){
    el.classList.add('open');
    setTimeout(()=>document.getElementById('location-input').focus(),100);
    const tb=document.getElementById('travel-btn');
    if(S.travelMode){tb.textContent='⏹ Stop Travel Mode';tb.classList.add('active')}
    else{tb.textContent='🧭 Travel Mode — Follow GPS Live';tb.classList.remove('active')}
    const intRow=document.getElementById('gps-interval-row');
    if(intRow)intRow.style.display=S.travelMode?'block':'none';
    if(S.travelMode){const intSel=document.getElementById('gps-interval-sel');if(intSel)intSel.value=String(S.gpsInterval||5);}
    renderFavorites();
    const saveBtn=document.getElementById('fav-save-btn');
    if(saveBtn)saveBtn.style.display=S.lat?'':'none';
  }
  else el.classList.remove('open');
}
function switchPage(page){
  document.querySelectorAll('.nav-item').forEach(b=>{b.classList.toggle('active',b.dataset.page===page)});
  document.querySelectorAll('.section-page').forEach(p=>{p.classList.toggle('visible',p.id==='page-'+page)});
  S.activePage=page;
  if(page==='radar'&&S.lat){
    if(S.map){setTimeout(()=>{S.map.invalidateSize();if(S._showZones&&S._rawScanPts.length)buildStormZones(S.map,S._rawScanPts);if(S._showPathArrows)buildPathArrows(S.map)},150);if(S._nextRefreshAt)startScanRefreshTimer()}
    else{initRadar()}
  }
  if(page==='weather'){startSonarSweep()}else{stopSonarSweep()}
  if(page==='station'&&S.lat&&(!S.station||S._stationLocKey!==S.lat+','+S.lon))fetchStation();
  if(page==='alerts'&&S.lat){fetchAlerts();fetchHazards()}
  if(page==='storms'&&S.lat)renderStorms();
  if(_curLang!=='en'){setTimeout(()=>quickTranslate(),200);setTimeout(()=>quickTranslate(),800)}
}
function updateStormBadges(){
  const inbound=S._topStorms?S._topStorms.length:0;
  const maxDbz=S._topStorms&&S._topStorms.length?Math.max(...S._topStorms.map(s=>s.dbz)):0;
  const sevIcon=maxDbz>=65?'‼️':maxDbz>=56?'🚨':maxDbz>=45?'⚠️':maxDbz>=40?'🟡':maxDbz>=30?'🟢':'🔵';
  const sevBg=maxDbz>=65?'#dc2626':maxDbz>=56?'#ef4444':maxDbz>=45?'#f97316':maxDbz>=40?'#eab308':maxDbz>=30?'#22c55e':'#6b7280';
  const hdr=document.getElementById('header-storm-count');
  const nav=document.getElementById('nav-storm-badge');
  if(hdr){
    hdr.textContent=inbound?`${sevIcon} ${inbound} inbound`:'🌪️ 0';
    hdr.style.background=inbound?sevBg:'#6b7280';
  }
  if(nav){
    nav.textContent=inbound.toString();
    nav.style.background=inbound?sevBg:'#6b7280';
  }
  const navIcon=document.getElementById('nav-storms-icon');
  if(navIcon)navIcon.textContent=inbound>0?sevIcon:'🌪️';
  const hdrLightning=document.getElementById('header-lightning');
  if(hdrLightning)hdrLightning.className=inbound>0?'lightning-active':'';
}
document.getElementById('location-input').addEventListener('keypress',e=>{if(e.key==='Enter'){hideSuggestions();searchLoc()}});
let _sugTimer=null,_sugIdx=-1,_sugResults=[];
document.getElementById('location-input').addEventListener('input',e=>{
  const q=e.target.value.trim();
  if(q.length<2){hideSuggestions();return}
  clearTimeout(_sugTimer);
  _sugTimer=setTimeout(()=>fetchSuggestions(q),300);
});
document.getElementById('location-input').addEventListener('keydown',e=>{
  const box=document.getElementById('loc-suggestions');
  if(!box.classList.contains('active'))return;
  if(e.key==='ArrowDown'){e.preventDefault();_sugIdx=Math.min(_sugIdx+1,_sugResults.length-1);highlightSug()}
  else if(e.key==='ArrowUp'){e.preventDefault();_sugIdx=Math.max(_sugIdx-1,0);highlightSug()}
  else if(e.key==='Enter'&&_sugIdx>=0){e.preventDefault();selectSuggestion(_sugResults[_sugIdx])}
  else if(e.key==='Escape'){hideSuggestions()}
});
function cleanQ(q){return q.replace(/\./g,'').replace(/\s+/g,' ').trim()}
async function nomSearch(q,limit){
  const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=1`,{signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw new Error('Nominatim '+res.status);
  return res.json();
}
async function photonSearch(q,limit){
  const res=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en`,{signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw new Error('Photon '+res.status);
  const data=await res.json();
  return(data.features||[]).map(f=>{
    const p=f.properties||{};const c=f.geometry?.coordinates||[];
    return{lat:String(c[1]),lon:String(c[0]),display_name:[p.name,p.city||p.town||p.village||'',p.state||'',p.country||''].filter(Boolean).join(', '),
      address:{house_number:p.housenumber,road:p.street,city:p.city,town:p.town,village:p.village,hamlet:p.hamlet,suburb:p.suburb,district:p.district,administrative:p.district,county:p.county,state:p.state,state_district:p.state_district,country:p.country,country_code:p.countrycode,municipality:p.municipality,borough:p.borough,region:p.region,province:p.province}};
  });
}
async function omGeoSearch(q,limit){
  const res=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${limit}&language=en`,{signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw new Error('OM Geo '+res.status);
  const data=await res.json();
  return(data.results||[]).map(r=>({lat:String(r.latitude),lon:String(r.longitude),display_name:[r.name,r.admin1||'',r.country||''].filter(Boolean).join(', '),
    address:{city:r.name,state:r.admin1||'',country:r.country||'',country_code:(r.country_code||'').toLowerCase()}}));
}
async function geoSearch(q,limit){
  try{return await nomSearch(q,limit)}catch(e){console.log('Nominatim failed:',e.message)}
  try{return await photonSearch(q,limit)}catch(e){console.log('Photon failed:',e.message)}
  try{return await omGeoSearch(q,limit)}catch(e){console.log('Open-Meteo geo failed:',e.message)}
  return[];
}
async function fetchSuggestions(q){
  try{
    let data=await geoSearch(cleanQ(q),5);
    if(!data.length){
      const simple=q.replace(/^\d+\s*/,'').replace(/\./g,'').trim();
      if(simple!==cleanQ(q))data=await geoSearch(simple,5);
    }
    _sugResults=data;_sugIdx=-1;
    const box=document.getElementById('loc-suggestions');
    if(!data.length){hideSuggestions();return}
    box.innerHTML=data.map((r,i)=>{
      const parts=r.display_name.split(',');
      const name=parts[0].trim();
      const detail=parts.slice(1,3).map(s=>s.trim()).join(', ');
      return`<div class="loc-sug-item" data-idx="${i}" onclick="selectSuggestion(_sugResults[${i}])">
        <div class="sug-name">${name}</div>
        <div class="sug-detail">${detail}</div>
      </div>`;
    }).join('');
    box.classList.add('active');
  }catch(e){}
}
function fmtLocName(addr,fallback){
  const parts=[];
  if(addr.house_number&&addr.road)parts.push(addr.house_number+' '+addr.road);
  else if(addr.road)parts.push(addr.road);
  const place=addr.city||addr.town||addr.village||addr.hamlet||addr.municipality||addr.suburb||addr.borough||addr.district||addr.administrative||addr.county||addr.region||'';
  if(place)parts.push(place);
  const state=addr.state||addr.state_district||addr.province||'';
  if(state&&state!==place)parts.push(state);
  if(addr.country&&addr.country_code!=='us')parts.push(addr.country);
  return parts.length?parts.join(', '):(fallback||'Unknown');
}
function selectSuggestion(r){
  hideSuggestions();
  const lat=parseFloat(r.lat),lon=parseFloat(r.lon);
  const addr=r.address||{};
  const name=fmtLocName(addr,r.display_name.split(',').slice(0,2).join(',').trim());
  document.getElementById('location-input').value=name;
  toggleLocOverlay(false);
  setLoc(lat,lon,name);
  const cc=addr.country_code;
  if(cc)setTimeout(()=>checkLocationUnits(cc),500);
}
function hideSuggestions(){
  const box=document.getElementById('loc-suggestions');
  box.classList.remove('active');box.innerHTML='';_sugIdx=-1;_sugResults=[];
}
function highlightSug(){
  document.querySelectorAll('.loc-sug-item').forEach((el,i)=>{
    el.classList.toggle('selected',i===_sugIdx);
    if(i===_sugIdx)el.scrollIntoView({block:'nearest'});
  });
}

function showLocationConfirm(){
  if(!navigator.geolocation){toast('GPS not available');return}
  const overlay=document.createElement('div');
  overlay.className='confirm-overlay';
  overlay.innerHTML=`<div class="confirm-box">
    <h3>📍 Share Your Location?</h3>
    <p>StormTracker needs your location to show local weather, radar, and storm data. Your position is only used in your browser and never sent to any server.</p>
    <div class="confirm-btns">
      <button class="confirm-deny" id="loc-deny">No Thanks</button>
      <button class="confirm-allow" id="loc-allow">Allow Location</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('loc-deny').addEventListener('click',()=>{overlay.remove();toast('You can search for a location instead')});
  document.getElementById('loc-allow').addEventListener('click',()=>{
    overlay.remove();
    toast('Getting location...');
    navigator.geolocation.getCurrentPosition(
      pos=>{
        toast('📍 GPS locked — accuracy ±'+Math.round(pos.coords.accuracy)+'m');
        reverseGeo(pos.coords.latitude,pos.coords.longitude);
      },
      err=>{
        if(err.code===1){
          toast('📍 Location permission denied — please enable location in your browser/phone settings, then try again');
        }else if(err.code===2){
          toast('📍 Location unavailable — make sure GPS/Location Services is turned ON in your phone settings');
        }else if(err.code===3){
          toast('📍 GPS timed out — trying again with lower accuracy...');
          navigator.geolocation.getCurrentPosition(
            pos=>{toast('📍 Location found');reverseGeo(pos.coords.latitude,pos.coords.longitude);},
            err2=>{toast('📍 Still cannot get location — try searching for your city instead');},
            {enableHighAccuracy:false,timeout:15000,maximumAge:120000}
          );
          return;
        }else{
          toast('📍 Could not get location — try searching instead');
        }
      },
      {enableHighAccuracy:true,timeout:10000,maximumAge:30000}
    );
  });
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
}

async function searchLoc(){
  const q=document.getElementById('location-input').value.trim();
  if(!q)return;
  toast('Searching...');
  try{
    let data=await geoSearch(cleanQ(q),1);
    if(!data.length){
      const simple=q.replace(/^\d+\s*/,'').replace(/\./g,'').trim();
      if(simple!==cleanQ(q))data=await geoSearch(simple,1);
    }
    if(data.length){
      const r=data[0];
      const addr=r.address||{};
      const hasStreet=addr.house_number&&addr.road;
      let name;
      if(!hasStreet&&/^\d+\s/.test(q)){
        const streetPart=q.split(',')[0].replace(/\./g,'').trim();
        const place=addr.city||addr.town||addr.village||addr.suburb||addr.district||addr.administrative||addr.county||'';
        const region=addr.state||addr.country||'';
        name=[streetPart,place,region].filter(Boolean).join(', ');
      }else{
        name=fmtLocName(addr,r.display_name.split(',').slice(0,2).join(',').trim());
      }
      setLoc(parseFloat(r.lat),parseFloat(r.lon),name);
      checkLocationUnits(addr.country_code);
    }
    else toast('Location not found');
  }catch(e){toast('Search failed')}
}

async function reverseGeo(lat,lon){
  const fallback=`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,{headers:{'Accept-Language':'en'},signal:AbortSignal.timeout(5000)});
    if(res.ok){const data=await res.json();const addr=data.address||{};setLoc(lat,lon,fmtLocName(addr,fallback));checkLocationUnits(addr.country_code);return}
  }catch(e){console.log('Nominatim reverse failed:',e.message)}
  try{
    const res=await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`,{signal:AbortSignal.timeout(5000)});
    if(res.ok){const data=await res.json();const f=data.features?.[0];if(f){const p=f.properties||{};
      const addr={city:p.city,town:p.town,village:p.village,suburb:p.suburb,district:p.district,state:p.state,country:p.country,country_code:p.countrycode,road:p.street,house_number:p.housenumber,administrative:p.district,county:p.county};
      setLoc(lat,lon,fmtLocName(addr,fallback));checkLocationUnits(p.countrycode);return}}
  }catch(e){console.log('Photon reverse failed:',e.message)}
  setLoc(lat,lon,fallback);
}

function updateNavForLocation(){
  const isUS=S.lat&&isUSLocation(S.lat,S.lon);
  const stn=document.getElementById('nav-station');
  const alt=document.getElementById('nav-alerts');
  if(stn)stn.style.display='';
  if(alt)alt.style.display=isUS?'':'none';
  document.querySelectorAll('.bottom-nav .nav-item').forEach(b=>{
    b.style.flex='1';
  });
}
function getHomeLocation(){
  try{return JSON.parse(localStorage.getItem('st_home_location'))}catch(e){return null}
}
function setHomeLocation(lat,lon,name){
  try{localStorage.setItem('st_home_location',JSON.stringify({lat,lon,name}))}catch(e){}
}
function goHome(){
  let home=getHomeLocation();
  if(!home&&S.lat){
    setHomeLocation(S.lat,S.lon,S.locName);
    home={lat:S.lat,lon:S.lon,name:S.locName};
    toast('📍 Home set: '+S.locName);
  }
  if(!home){toast('📍 No home location — set a location first');return}
  clearViewScanCircle();
  S.lat=home.lat;S.lon=home.lon;S.locName=home.name;
  document.getElementById('location-input').value=S.locName;
  S.station=null;S.stationId=null;S._stationSource=null;S.stormMovement=null;S._windCache=null;
  S.radarSource=isUSLocation(home.lat,home.lon)?'nexrad':'rainviewer';
  S.storms=[];S._topStorms=[];S._topStormAnalysis={inbound:[],overhead:[],nearby:[],allWithEta:[]};S._rawScanPts=[];S._sonarClusteredPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
  try{localStorage.setItem('st_loc',JSON.stringify({lat:home.lat,lon:home.lon,name:home.name}))}catch(e){}
  if(S.map){
    S.stormMarkers.forEach(m=>S.map.removeLayer(m));S.stormMarkers=[];
    clearStormCone();
    S.map.setView([home.lat,home.lon],8,{animate:true,duration:0.5});
    if(S._userMarker)S._userMarker.setLatLng([home.lat,home.lon]);
    if(S._rangeCircle)S._rangeCircle.setLatLng([home.lat,home.lon]);
    showRadarLayer(S.map);
  }
  updateNavForLocation();
  document.getElementById('status-text').textContent='Live · '+home.name;
  fetchWeather();fetchAlerts();fetchHazards();fetchTerrainGrid();scanRadarForStorms();scheduleHourlyRefresh();
  refreshMpingIfVisible();
  toast('📍 Home: '+home.name);
}
function scanHere(){
  if(!S.map){toast('Open radar map first');return}
  const center=S.map.getCenter();
  const cLat=center.lat,cLng=center.lng;
  clearViewScanCircle();
  S.stormMarkers.forEach(m=>{try{S.map.removeLayer(m)}catch(e){}});S.stormMarkers=[];
  clearStormCone();
  S.lat=cLat;S.lon=cLng;
  S.locName=`${cLat.toFixed(4)}, ${cLng.toFixed(4)}`;
  document.getElementById('location-input').value=S.locName;
  S.station=null;S.stationId=null;S._stationSource=null;S.stormMovement=null;S._windCache=null;
  S.radarSource=isUSLocation(cLat,cLng)?'nexrad':'rainviewer';
  S.storms=[];S._topStorms=[];S._topStormAnalysis={inbound:[],overhead:[],nearby:[],allWithEta:[]};S._rawScanPts=[];S._sonarClusteredPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
  try{localStorage.setItem('st_loc',JSON.stringify({lat:cLat,lon:cLng,name:S.locName}))}catch(e){}
  if(S._userMarker)S._userMarker.setLatLng([cLat,cLng]);
  if(S._rangeCircle)S._rangeCircle.setLatLng([cLat,cLng]);
  showRadarLayer(S.map);
  updateNavForLocation();
  document.getElementById('status-text').textContent='Live · '+S.locName;
  fetchWeather();fetchAlerts();fetchHazards();fetchTerrainGrid();scanRadarForStorms();scheduleHourlyRefresh();
  refreshMpingIfVisible();
  toast('🔍 Scanning: '+S.locName);
}
function showHdScanDialog(){
  if(!S.map){toast('Open radar map first');return}
  const home=getHomeLocation();
  const mapCenter=S.map.getCenter();
  const hasHome=!!home;
  const hasSavedLoc=!!(S.lat&&S.lon);
  let overlay=document.getElementById('hd-scan-overlay');
  if(overlay)overlay.remove();
  overlay=document.createElement('div');
  overlay.id='hd-scan-overlay';
  overlay.className='hd-scan-overlay';
  let btns='';
  if(hasHome){
    btns+=`<button class="hd-scan-btn" id="hd-home"><span>🏠 Home Location</span><div class="hd-label">${home.name}</div></button>`;
  }
  if(hasSavedLoc&&(!hasHome||Math.abs(S.lat-home.lat)>0.01||Math.abs(S.lon-home.lon)>0.01)){
    btns+=`<button class="hd-scan-btn" id="hd-saved"><span>📍 Current Location</span><div class="hd-label">${S.locName}</div></button>`;
  }
  btns+=`<button class="hd-scan-btn" id="hd-center"><span>🎯 Current Map Center</span><div class="hd-label">${mapCenter.lat.toFixed(4)}, ${mapCenter.lng.toFixed(4)}</div></button>`;
  overlay.innerHTML=`<div class="hd-scan-box">
    <div style="font-size:1.3em;margin-bottom:4px">🔦</div>
    <div style="font-size:1.05em;font-weight:700;color:var(--text-primary);margin-bottom:4px">HD Scan</div>
    <div style="font-size:0.75em;color:var(--text-muted);margin-bottom:14px">15-mile high-resolution radar analysis at zoom 12</div>
    ${btns}
    <button id="hd-cancel" style="width:100%;padding:10px;margin-top:8px;border-radius:8px;border:1px solid var(--border-subtle);background:rgba(255,255,255,0.04);color:var(--text-muted);font-size:0.8em;cursor:pointer">Cancel</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay){overlay.remove()}});
  document.getElementById('hd-cancel').addEventListener('click',()=>overlay.remove());
  function prepHdTarget(lat,lon,name){
    clearViewScanCircle();
    S.stormMarkers.forEach(m=>{try{S.map.removeLayer(m)}catch(e){}});S.stormMarkers=[];
    clearStormCone();
    S.lat=lat;S.lon=lon;S.locName=name;
    document.getElementById('location-input').value=name;
    S.station=null;S.stationId=null;S._stationSource=null;S.stormMovement=null;S._windCache=null;
    S.radarSource=isUSLocation(lat,lon)?'nexrad':'rainviewer';
    S.storms=[];S._topStorms=[];S._topStormAnalysis={inbound:[],overhead:[],nearby:[],allWithEta:[]};S._rawScanPts=[];S._sonarClusteredPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
    try{localStorage.setItem('st_loc',JSON.stringify({lat,lon,name}))}catch(e){}
    if(S._userMarker)S._userMarker.setLatLng([lat,lon]);
    if(S._rangeCircle)S._rangeCircle.setLatLng([lat,lon]);
    showRadarLayer(S.map);
    updateNavForLocation();
    document.getElementById('status-text').textContent='HD Scan · '+name;
  }
  const homeBtn=document.getElementById('hd-home');
  if(homeBtn)homeBtn.addEventListener('click',()=>{
    overlay.remove();
    prepHdTarget(home.lat,home.lon,home.name);
    S.map.setView([home.lat,home.lon],10,{animate:true,duration:0.5});
    setTimeout(()=>{S.map.setZoom(12,{animate:true});scanRadarHiRes(S.map,true)},500);
  });
  const savedBtn=document.getElementById('hd-saved');
  if(savedBtn)savedBtn.addEventListener('click',()=>{
    overlay.remove();
    S.map.setView([S.lat,S.lon],10,{animate:true,duration:0.5});
    setTimeout(()=>{S.map.setZoom(12,{animate:true});scanRadarHiRes(S.map,true)},500);
  });
  const centerBtn=document.getElementById('hd-center');
  if(centerBtn)centerBtn.addEventListener('click',()=>{
    overlay.remove();
    const ctr=S.map.getCenter();
    prepHdTarget(ctr.lat,ctr.lng,`${ctr.lat.toFixed(4)}, ${ctr.lng.toFixed(4)}`);
    S.map.setZoom(12,{animate:true});
    setTimeout(()=>scanRadarHiRes(S.map,true),500);
  });
}
let _setLocTimer=null;
function setLoc(lat,lon,name,fromTravel){
  if(!getHomeLocation()){setHomeLocation(lat,lon,name||`${lat.toFixed(4)}, ${lon.toFixed(4)}`)}
  if(!fromTravel && S.travelMode) stopTravelMode();
  S.lat=lat;S.lon=lon;
  S.locName=name||`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  document.getElementById('location-input').value=S.locName;
  document.getElementById('status-dot').classList.add('live');
  document.getElementById('status-text').textContent='Loading · '+S.locName;
  S.station=null;S.stationId=null;S._stationSource=null;S.stormMovement=null;S._windCache=null;
  S.radarSource=isUSLocation(lat,lon)?'nexrad':'rainviewer';
  updateNavForLocation();
  if(S.map){
    S.stormMarkers.forEach(m=>S.map.removeLayer(m));S.stormMarkers=[];
    clearStormCone();
  }
  S.storms=[];S._topStorms=[];S._topStormAnalysis={inbound:[],overhead:[],nearby:[],allWithEta:[]};S._rawScanPts=[];S._sonarClusteredPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
  const _locChanged=S._prevLat!=null&&(Math.abs(S._prevLat-lat)>0.01||Math.abs(S._prevLon-lon)>0.01);
  S._prevLat=lat;S._prevLon=lon;
  if(_locChanged){
    _stormAlertHistory=[];_saveStormAlertHistory();
    _wxAlertHistory=[];_saveWxAlertHistory();
    _STORM_ALERT_COOLDOWN={};try{localStorage.removeItem('st_stormAlertCooldown')}catch(e){}
    if(_spcData){_spcData.reports=null;_spcData._lastFetch=0}
    if(S.activePage==='alerts')renderAlerts();
  }
  try{localStorage.setItem('st_loc',JSON.stringify({lat,lon,name:S.locName}))}catch(e){}
  if(S.map){
    S.map.setView([lat,lon],S.map.getZoom());
    if(S._userMarker)S._userMarker.setLatLng([lat,lon]);
    if(S._rangeCircle)S._rangeCircle.setLatLng([lat,lon]);
    showRadarLayer(S.map);
  }
  const wEl=document.getElementById('page-weather');if(wEl)showSkel(wEl,6);
  if(_setLocTimer)clearTimeout(_setLocTimer);
  _setLocTimer=setTimeout(()=>{
    _setLocTimer=null;
    document.getElementById('status-text').textContent='Live · '+S.locName;
    fetchWeather();
    fetchAlerts();fetchHazards();
    fetchTerrainGrid();
    scanRadarForStorms();
    scheduleHourlyRefresh();
  },0);
}

function getFavorites(){
  try{return JSON.parse(localStorage.getItem('st_favs')||'[]')}catch(e){return[]}
}
function saveFavorites(favs){
  try{localStorage.setItem('st_favs',JSON.stringify(favs))}catch(e){}
}
function saveFavorite(){
  if(!S.lat){toast('Set a location first');return}
  const favs=getFavorites();
  if(favs.length>=5){toast('Max 5 favorites — remove one first');return}
  if(favs.some(f=>Math.abs(f.lat-S.lat)<0.01&&Math.abs(f.lon-S.lon)<0.01)){toast('Location already saved');return}
  favs.push({lat:S.lat,lon:S.lon,name:S.locName});
  saveFavorites(favs);
  renderFavorites();
  toast('⭐ Saved: '+S.locName);
}
function removeFavorite(idx){
  const favs=getFavorites();
  favs.splice(idx,1);
  saveFavorites(favs);
  renderFavorites();
}
function renameFavorite(idx){
  const favs=getFavorites();
  const f=favs[idx];
  if(!f)return;
  const newName=prompt('Rename favorite:',f.name);
  if(newName!==null&&newName.trim()){
    favs[idx].name=newName.trim();
    saveFavorites(favs);
    renderFavorites();
    toast('Renamed to: '+newName.trim());
  }
}
function loadFavorite(idx){
  const favs=getFavorites();
  const f=favs[idx];
  if(f){setLoc(f.lat,f.lon,f.name);toggleLocOverlay(false)}
}
function toggleFavEmailAlert(idx){
  const favs=getFavorites();
  const f=favs[idx];
  if(!f)return;
  f.emailAlerts=f.emailAlerts===false?true:f.emailAlerts===true?false:true;
  saveFavorites(favs);
  renderFavorites();
  toast(f.emailAlerts?'📬 Email alerts ON for '+f.name:'📬 Email alerts OFF for '+f.name);
}
function renderFavorites(){
  const el=document.getElementById('fav-list');
  if(!el)return;
  const favs=getFavorites();
  if(!favs.length){el.innerHTML='<div style="font-size:0.7em;color:#555;text-align:center;padding:4px">No favorites saved</div>';return}
  const loggedIn=!!_syncToken&&!!_syncApiUrl();
  el.innerHTML=favs.map((f,i)=>{
    const emailOn=f.emailAlerts!==false;
    const emailBtn=loggedIn&&_emailAlertsOn?`<button onclick="event.stopPropagation();toggleFavEmailAlert(${i})" style="background:none;border:1px solid ${emailOn?'rgba(0,200,100,0.4)':'var(--border-subtle)'};color:${emailOn?'#00cc66':'var(--text-muted)'};font-size:0.55em;cursor:pointer;padding:1px 5px;border-radius:4px;white-space:nowrap" title="${emailOn?'Email alerts ON':'Email alerts OFF'}">${emailOn?'📬':'📭'}</button>`:'';
    return`<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin:2px 0;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer" onclick="loadFavorite(${i})">
    <span style="font-size:0.8em">⭐</span>
    <span style="flex:1;font-size:0.75em;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
    ${emailBtn}
    <button onclick="event.stopPropagation();renameFavorite(${i})" style="background:none;border:none;color:var(--accent-cyan);font-size:0.7em;cursor:pointer;padding:2px 4px" title="Rename">✏️</button>
    <button onclick="event.stopPropagation();removeFavorite(${i})" style="background:none;border:none;color:#f44;font-size:0.7em;cursor:pointer;padding:2px 4px">✕</button>
  </div>`;
  }).join('');
}

function startMapPick(){
  toggleLocOverlay(false);
  let overlay=document.getElementById('map-pick-overlay');
  if(overlay){overlay.style.display='flex';return}
  overlay=document.createElement('div');
  overlay.id='map-pick-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#0f172a';
  overlay.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0">
      <div><div style="color:#fff;font-weight:600;font-size:1em">📌 Pick Location</div>
      <div style="color:#94a3b8;font-size:0.75em">Drag the map to center the crosshair on your spot</div></div>
      <button id="map-pick-close" style="background:none;border:none;color:#94a3b8;font-size:1.4em;cursor:pointer;padding:4px 8px">✕</button>
    </div>
    <div id="map-pick-map" style="flex:1;position:relative"></div>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;pointer-events:none">
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="20" fill="none" stroke="#00ff88" stroke-width="2" opacity="0.5"/>
        <circle cx="30" cy="30" r="10" fill="none" stroke="#00ff88" stroke-width="2" opacity="0.8"/>
        <circle cx="30" cy="30" r="3" fill="#00ff88"/>
        <line x1="30" y1="0" x2="30" y2="20" stroke="#00ff88" stroke-width="1.5" opacity="0.6"/>
        <line x1="30" y1="40" x2="30" y2="60" stroke="#00ff88" stroke-width="1.5" opacity="0.6"/>
        <line x1="0" y1="30" x2="20" y2="30" stroke="#00ff88" stroke-width="1.5" opacity="0.6"/>
        <line x1="40" y1="30" x2="60" y2="30" stroke="#00ff88" stroke-width="1.5" opacity="0.6"/>
      </svg>
    </div>
    <div style="position:absolute;top:50%;left:0;right:0;border-top:1px solid rgba(0,255,136,0.12);z-index:999;pointer-events:none"></div>
    <div style="position:absolute;left:50%;top:0;bottom:0;border-left:1px solid rgba(0,255,136,0.12);z-index:999;pointer-events:none"></div>
    <div style="padding:12px 16px;background:#1e293b;border-top:1px solid #334155;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;min-height:20px">
        <span style="color:#00ff88;font-size:0.9em">⊕</span>
        <span id="map-pick-addr" style="color:#fff;font-size:0.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Resolving...</span>
      </div>
      <div style="display:flex;gap:8px">
        <button id="map-pick-cancel" style="flex:1;padding:12px;background:transparent;border:1px solid #475569;color:#cbd5e1;border-radius:8px;font-size:0.9em;font-weight:600;cursor:pointer">Cancel</button>
        <button id="map-pick-confirm" style="flex:1;padding:12px;background:#00cc6a;border:none;color:#fff;border-radius:8px;font-size:0.9em;font-weight:700;cursor:pointer">⊕ Set This Location</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const initLat=S.lat||39.8,initLon=S.lon||-98.5;
  const pickMap=L.map('map-pick-map',{center:[initLat,initLon],zoom:9,zoomControl:true});
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19,attribution:'© CartoDB'}).addTo(pickMap);
  S._pickMap=pickMap;
  let resolveTimer=null;
  const addrEl=document.getElementById('map-pick-addr');
  async function resolveAddr(lat,lon){
    addrEl.textContent='Looking up address...';
    try{
      const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`,{headers:{'Accept-Language':'en'}});
      const d=await r.json();
      if(d.address){
        const a=d.address;
        const parts=[];
        if(a.road||a.pedestrian||a.neighbourhood||a.suburb)parts.push(a.road||a.pedestrian||a.neighbourhood||a.suburb);
        parts.push(a.city||a.town||a.village||a.hamlet||a.municipality||a.county||'');
        if(a.state||a.state_district)parts.push(a.state||a.state_district);
        if(a.country&&a.country_code!=='us')parts.push(a.country);
        const name=parts.filter(Boolean).join(', ')||`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        addrEl.textContent=name;
      }else{addrEl.textContent=`${lat.toFixed(4)}, ${lon.toFixed(4)}`}
    }catch(e){addrEl.textContent=`${lat.toFixed(4)}, ${lon.toFixed(4)}`}
  }
  resolveAddr(initLat,initLon);
  pickMap.on('moveend',()=>{
    const c=pickMap.getCenter();
    if(resolveTimer)clearTimeout(resolveTimer);
    resolveTimer=setTimeout(()=>resolveAddr(c.lat,c.lng),600);
  });
  document.getElementById('map-pick-close').onclick=cancelMapPick;
  document.getElementById('map-pick-cancel').onclick=cancelMapPick;
  document.getElementById('map-pick-confirm').onclick=async()=>{
    const c=pickMap.getCenter();
    const lat=c.lat,lon=c.lng;
    let name=addrEl.textContent||`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    if(name==='Looking up address...'||name==='Resolving...')name=`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    cancelMapPick();
    setLoc(lat,lon,name);
    toast('📌 Location set: '+name);
  };
}
function cancelMapPick(){
  const overlay=document.getElementById('map-pick-overlay');
  if(overlay){
    if(S._pickMap){S._pickMap.remove();S._pickMap=null}
    overlay.remove();
  }
}

function getAutoRefreshMin(){
  const v=localStorage.getItem('autoRefreshMin');
  if(v===null)return 60;
  return parseInt(v,10);
}
function scheduleAutoRefresh(){
  if(S._autoRefreshTimer)clearInterval(S._autoRefreshTimer);
  S._autoRefreshTimer=null;
  const mins=getAutoRefreshMin();
  if(!mins||mins<=0){S._nextRefreshAt=0;return}
  const ms=mins*60*1000;
  S._nextRefreshAt=Date.now()+ms;
  S._autoRefreshTimer=setInterval(()=>{
    if(S.travelMode)return;
    S._nextRefreshAt=Date.now()+ms;
    startScanRefreshTimer();
    fetchWeather();
    fetchAlerts();fetchHazards();
    fetchTerrainGrid();
    scanRadarForStorms();
  },ms);
  startScanRefreshTimer();
}
function scheduleHourlyRefresh(){scheduleAutoRefresh()}

// ==========================================
// TRAVEL MODE (Live GPS Tracking)
// ==========================================
async function toggleTravelMode(){
  if(S.travelMode) return stopTravelMode();
  if(!localStorage.getItem('gpsInterval')){
    showTravelIntervalPopup();
    return;
  }
  if(!navigator.geolocation) return toast('GPS not available on this device');
  if(navigator.permissions){
    try{
      const perm=await navigator.permissions.query({name:'geolocation'});
      if(perm.state==='denied'){
        toast('📍 Location access denied — please enable it in your browser settings to use Travel Mode');
        return;
      }
      if(perm.state==='prompt'){
        toast('📍 Requesting location access...');
      }
    }catch(e){}
  }
  let gpsPos;
  try{
    gpsPos=await new Promise((resolve,reject)=>{
      navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000});
    });
  }catch(err){
    if(err.code===1){
      toast('📍 Location access denied — Travel Mode requires GPS permission');
    }else{
      toast('📍 Could not get GPS position — please try again');
    }
    return;
  }
  if(S.lat&&S.lon&&gpsPos){
    const gpsDist=haversine(S.lat,S.lon,gpsPos.coords.latitude,gpsPos.coords.longitude);
    if(gpsDist>50){
      const confirmed=await showGpsRelocateConfirm(gpsDist,gpsPos.coords.latitude,gpsPos.coords.longitude);
      if(!confirmed)return;
    }
  }
  S.travelMode=true;
  S.travelLastUpdate=0;
  S.gpsInterval=parseInt(localStorage.getItem('gpsInterval')||'300',10);
  const ind=document.getElementById('travel-indicator');
  ind.classList.add('show');
  document.getElementById('travel-status').textContent='🧭 Acquiring GPS...';
  const btn=document.getElementById('travel-btn');
  btn.textContent='⏹ Stop Travel Mode';
  btn.classList.add('active');
  const hdrTravel=document.getElementById('btn-travel');
  if(hdrTravel){hdrTravel.style.opacity='1';hdrTravel.style.background='rgba(0,229,255,0.2)';hdrTravel.style.borderRadius='8px';}
  document.getElementById('status-text').textContent='🧭 Travel Mode · Tracking...';
  const intRow=document.getElementById('gps-interval-row');
  if(intRow)intRow.style.display='block';
  const intSel=document.getElementById('gps-interval-sel');
  if(intSel)intSel.value=String(S.gpsInterval);
  if(S.map && !S.travelMarker){
    S.travelMarker=L.circleMarker([S.lat||0,S.lon||0],{radius:8,fillColor:'#00e5ff',fillOpacity:0.9,color:'#fff',weight:2,className:'travel-gps-dot'}).addTo(S.map);
  }
  startGpsWatch();
  toast('🧭 Travel Mode ON — GPS tracking active (updates every '+fmtGpsInt(S.gpsInterval)+')');
}
function showGpsRelocateConfirm(distMi,gpsLat,gpsLon){
  return new Promise(resolve=>{
    const distStr=distMi>500?Math.round(distMi).toLocaleString()+' mi':Math.round(distMi)+' mi';
    const overlay=document.createElement('div');
    overlay.className='confirm-overlay';
    overlay.innerHTML=`<div class="confirm-dialog" style="max-width:340px">
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:2em">📍</div>
        <div style="font-weight:700;font-size:1.1em;margin:8px 0">Switch to GPS Location?</div>
      </div>
      <p style="font-size:0.85em;color:var(--text-secondary);text-align:center;margin-bottom:16px">
        Your GPS is <strong>${distStr}</strong> from the current location.<br>
        Travel Mode will reset everything to your actual GPS position.
      </p>
      <div style="display:flex;gap:8px">
        <button id="gps-reloc-no" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text-secondary);font-weight:600;cursor:pointer">Stay Here</button>
        <button id="gps-reloc-yes" style="flex:1;padding:10px;border-radius:8px;border:none;background:var(--accent-cyan);color:#000;font-weight:700;cursor:pointer">Use GPS 📍</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('gps-reloc-no').addEventListener('click',()=>{overlay.remove();resolve(false)});
    document.getElementById('gps-reloc-yes').addEventListener('click',()=>{
      overlay.remove();
      toast('📍 Relocating to GPS position...');
      reverseGeo(gpsLat,gpsLon);
      resolve(true);
    });
    overlay.addEventListener('click',e=>{if(e.target===overlay){overlay.remove();resolve(false)}});
  });
}
function stopTravelMode(){
  S.travelMode=false;
  if(S.travelWatchId!==null){navigator.geolocation.clearWatch(S.travelWatchId);S.travelWatchId=null}
  if(S._travelDataTimer){clearInterval(S._travelDataTimer);S._travelDataTimer=null}
  document.getElementById('travel-indicator').classList.remove('show');
  const intRow=document.getElementById('gps-interval-row');
  if(intRow)intRow.style.display='none';
  const btn=document.getElementById('travel-btn');
  btn.textContent='🧭 Travel Mode — Follow GPS Live';
  btn.classList.remove('active');
  const hdrTravel=document.getElementById('btn-travel');
  if(hdrTravel){hdrTravel.style.opacity='0.5';hdrTravel.style.background='';hdrTravel.style.borderRadius='';}
  if(S.travelMarker&&S.map){S.map.removeLayer(S.travelMarker);S.travelMarker=null}
  if(S.lat) document.getElementById('status-text').textContent='Live · '+S.locName;
  toast('Travel Mode OFF');
  scheduleAutoRefresh();
  startScanRefreshTimer();
}
function fmtGpsInt(s){
  if(s<60)return s+'s';
  if(s<3600)return Math.round(s/60)+'m';
  return Math.round(s/3600)+'h';
}
function setGpsInterval(val){
  S.gpsInterval=parseInt(val,10);
  localStorage.setItem('gpsInterval',String(S.gpsInterval));
  const sel1=document.getElementById('gps-interval-sel');if(sel1)sel1.value=String(S.gpsInterval);
  const sel2=document.getElementById('settings-travel-int');if(sel2)sel2.value=String(S.gpsInterval);
  if(S.travelMode){
    startGpsWatch();
    toast('🧭 Refresh interval set to '+fmtGpsInt(S.gpsInterval));
  }
}
const TUTORIAL_SECTIONS=[
  {title:'🏠 Getting Started',text:'StormTracker detects storms around your location using live radar data. On first launch, allow GPS access or search for your location using the 🗺️ button in the header. The app scans for precipitation within an 80-mile radius and shows results across five tabs. All settings — units, gauge style, time format, AI, alerts, and more — are accessible via the ⚙️ gear icon in the header.'},
  {title:'🌤️ Weather Tab',text:'Your main dashboard. Shows current conditions (temperature, wind, humidity, pressure), a <b>wind gauge</b> with real-time animated direction, and a <b>Radar Sonar</b> mini-map.<br><br><b>Wind Gauge:</b> Choose from 5 switchable styles in Settings — <b>Neon</b> (default animated ring), <b>Marine</b> (nautical compass with LED digits), <b>Minimal</b> (clean arc with arrow), <b>G1000</b> (Garmin-style 3-panel with compass rose, speed tape, and pressure tape), and <b>Speedometer</b> (classic dial with sweeping needle). The G1000 also supports <b>Gyro Compass</b> mode — point your phone at a storm and the compass rotates with you.<br><br><b>Radar Sonar:</b> A bird\'s-eye view showing storm cells as colored blips and arrows for approaching storms. Use <b>+/−</b> buttons to zoom between 15 and 80 miles. Tap the ⚙️ gear on the sonar to customize sweep speed, fade duration, dot opacity, glow intensity, grid brightness, dBZ floor, and overlay toggles. Tap "Open Radar →" to jump to the full map.'},
  {title:'📡 Radar Tab',text:'The full interactive map. Storm cells appear as colored arrows showing movement direction. A <b>cyan crosshair</b> marks the exact map center for precise targeting. The sidebar buttons control different layers:<br>• <b>📍</b> — Return to Home location (auto-saved from your first GPS/search)<br>• <b>🔍</b> — Scan Here: grabs current map center as new scan location<br>• <b>🔦</b> — HD Scan: opens target picker (Home / Current Location / Map Center) for 15-mile high-res analysis at zoom 12<br>• <b>NEX/SRC</b> — Switch between NEXRAD (US) and RainViewer (global) radar<br>• <b>MI</b> — Toggle miles/kilometers<br>• <b>✈️</b> — Show nearby airports<br>• <b>▶️</b> — Animate radar over time<br>• <b>ZN</b> — Toggle color-coded storm zones<br>• <b>➤</b> — Toggle the ILS approach cone (dynamic length — extends 10mi past the farthest inbound storm)<br>• <b>12▶/PT</b> — Cycle storm points: off → top 12 inbound → all<br>• <b>RDR</b> — Toggle radar overlay tiles<br>• <b>🕳️</b> — Clutter toggle (appears when ≤12 returns below 22 dBZ or ≤8 below 31 dBZ are detected as likely false radar echoes). Tap to show/hide these minor returns.<br><br><b>HD Scan System:</b> After each regular scan, the app checks for nearby storms and offers tiered high-resolution scans — <b>15mi</b> (asks), <b>10mi</b> (asks), and <b>5mi</b> (auto-triggers after 5 seconds when storms are very close). HD scans sync the sonar zoom to 15mi for maximum detail.'},
  {title:'➤ ILS Approach Cone',text:'The animated cone on the radar shows where storms are heading relative to you. It\'s inspired by an airport ILS (Instrument Landing System) — a cone of dots extends from the storm source through your location. <b>White dots</b> = no storms approaching. <b>Colored dots</b> = intensity-matched to approaching storm dBZ levels. The cone is always on once wind data is received.'},
  {title:'🌩️ Storms Tab',text:'Lists all detected storm cells with details: peak dBZ, rain rate, distance, bearing, movement (direction with degrees), and ETA. Storms are grouped into <b>Approaching</b> (heading toward you) and <b>Nearby</b> (in the area but not on track). Each card shows a live countdown timer for approaching storms.<br><br><b>Storm Feedback:</b> When a countdown reaches zero, the app automatically re-checks storm data and asks "Did this storm affect your area?" with Yes/No/Unsure buttons. Your feedback helps track prediction accuracy over time.'},
  {title:'⚡ Lightning Indicators',text:'Storm cells with radar reflectivity ≥40 dBZ display a ⚡ lightning indicator. The strike count scales with intensity — stronger storms show more estimated strikes. Lightning markers appear on all three views (map, sonar, and 3D). You can toggle lightning display on or off.<br><br><i>Note: These are radar-derived estimates, not observed lightning strikes.</i>'},
  {title:'✈️ Station Tab',text:'A full aviation weather station (PWS console). Shows METAR data from nearby airports — wind, temperature, pressure, visibility, cloud layers, and more. <b>Weather descriptions are derived directly from the METAR</b> — the station tab independently parses raw METAR wx codes (e.g., -RA = Light Rain, +TSRA = Heavy Thunderstorm Rain) rather than relying on third-party text descriptions, so it always reflects what the station is actually reporting.<br><br><b>Tappable Unit Cycling:</b> Tap any value to switch units:<br>• Temperature: °F / °C<br>• Wind: mph / kts / km/h / m/s / Beaufort<br>• Pressure: inHg / mb / mmHg / kPa<br>• Visibility: mi / km / m / NM<br>• Precipitation: in / mm / cm<br>Dual units always shown (primary + secondary).<br><br>Features 24-hour trend charts (temperature, pressure, wind, visibility), wind direction history, flight category indicator (VFR/MVFR/IFR/LIFR), condition timeline, METAR decoder with color-coded severity, and multi-station TAF forecasts. Use the station selector to search by ICAO code and save favorites.'},
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
    const ask=document.createElement('div');
    ask.id='tutorial-prompt';
    ask.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10000;background:var(--bg-card);border:1px solid var(--accent-cyan);border-radius:12px;padding:14px 18px;max-width:320px;width:90%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5)';
    ask.innerHTML=`<div style="font-size:0.9em;font-weight:600;color:var(--text-primary);margin-bottom:10px">👋 Welcome to StormTracker!</div><div style="font-size:0.78em;color:var(--text-secondary);margin-bottom:12px">Would you like a quick tutorial on how everything works?</div><div style="display:flex;gap:8px"><button onclick="document.getElementById('tutorial-prompt').remove();showTutorialDirect()" style="flex:1;padding:8px;background:rgba(0,229,255,0.15);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:8px;font-size:0.85em;font-weight:600;cursor:pointer">📖 Yes, show me!</button><button onclick="document.getElementById('tutorial-prompt').remove()" style="flex:1;padding:8px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;font-size:0.85em;font-weight:600;cursor:pointer">Skip</button></div>`;
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
function setAutoRefresh(val){
  const mins=parseInt(val,10);
  localStorage.setItem('autoRefreshMin',String(mins));
  scheduleAutoRefresh();
  startScanRefreshTimer();
  toast(mins>0?'🔄 Auto refresh set to '+fmtGpsInt(mins*60):'🔄 Auto refresh off');
}
function showTravelIntervalPopup(){
  const p=document.getElementById('travel-interval-popup');
  if(p)p.style.display='flex';
}
function closeTravelIntervalPopup(){
  const p=document.getElementById('travel-interval-popup');
  if(p)p.style.display='none';
}
function pickTravelInterval(val){
  closeTravelIntervalPopup();
  S.gpsInterval=val;
  localStorage.setItem('gpsInterval',String(val));
  startTravelModeAfterPick();
}
async function startTravelModeAfterPick(){
  if(!navigator.geolocation) return toast('GPS not available on this device');
  try{
    await new Promise((resolve,reject)=>{
      navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000});
    });
  }catch(err){
    if(err.code===1)toast('📍 Location access denied — Travel Mode requires GPS permission');
    else toast('📍 Could not get GPS position — please try again');
    return;
  }
  S.travelMode=true;
  S.travelLastUpdate=0;
  const ind=document.getElementById('travel-indicator');
  ind.classList.add('show');
  document.getElementById('travel-status').textContent='🧭 Acquiring GPS...';
  const btn=document.getElementById('travel-btn');
  btn.textContent='⏹ Stop Travel Mode';btn.classList.add('active');
  const hdrTravel=document.getElementById('btn-travel');
  if(hdrTravel){hdrTravel.style.opacity='1';hdrTravel.style.background='rgba(0,229,255,0.2)';hdrTravel.style.borderRadius='8px';}
  document.getElementById('status-text').textContent='🧭 Travel Mode · Tracking...';
  const intRow=document.getElementById('gps-interval-row');if(intRow)intRow.style.display='block';
  const intSel=document.getElementById('gps-interval-sel');if(intSel)intSel.value=String(S.gpsInterval);
  if(S.map&&!S.travelMarker){
    S.travelMarker=L.circleMarker([S.lat||0,S.lon||0],{radius:8,fillColor:'#00e5ff',fillOpacity:0.9,color:'#fff',weight:2,className:'travel-gps-dot'}).addTo(S.map);
  }
  startGpsWatch();
  toast('🧭 Travel Mode ON — refreshing every '+fmtGpsInt(S.gpsInterval));
}
function startGpsWatch(){
  if(S.travelWatchId!==null){navigator.geolocation.clearWatch(S.travelWatchId);S.travelWatchId=null}
  if(S._travelDataTimer){clearInterval(S._travelDataTimer);S._travelDataTimer=null}
  S.travelWatchId=navigator.geolocation.watchPosition(
    pos=>onTravelPosition(pos),
    err=>{document.getElementById('travel-status').textContent='🧭 GPS error — retrying...'},
    {enableHighAccuracy:true, maximumAge:2000, timeout:15000}
  );
  const dataInt=Math.max((S.gpsInterval||5)*1000,5000);
  travelDataRefresh();
  S._travelDataTimer=setInterval(()=>{
    if(!S.travelMode)return;
    travelDataRefresh();
  },dataInt);
}
function onTravelPosition(pos){
  if(!S.travelMode) return;
  const lat=pos.coords.latitude, lon=pos.coords.longitude;
  const acc=pos.coords.accuracy;
  const now=Date.now();
  const dist=S.lat?haversine(S.lat,S.lon,lat,lon):999;
  const spd=pos.coords.speed;
  const spdTxt=spd!==null&&spd>=0?(S.windUnit===0?((spd*2.237).toFixed(0)+' mph'):(S.windUnit===2?((spd*3.6).toFixed(0)+' km/h'):((spd*1.944).toFixed(0)+' kts'))):'—';
  const intLabel=fmtGpsInt(S.gpsInterval||5);
  document.getElementById('travel-status').textContent='🧭 '+spdTxt+' · ±'+(acc<1000?(acc.toFixed(0)+'m'):((acc/1000).toFixed(1)+'km'))+' · 🔄'+intLabel;
  S.lat=lat;S.lon=lon;
  if(S.travelMarker)S.travelMarker.setLatLng([lat,lon]);
  if(S._userMarker)S._userMarker.setLatLng([lat,lon]);
  if(S._rangeCircle)S._rangeCircle.setLatLng([lat,lon]);
  if(S.map)S.map.panTo([lat,lon],{animate:true,duration:0.5});
}
function travelDataRefresh(){
  if(!S.travelMode||!S.lat) return;
  reverseGeocode(S.lat,S.lon).then(name=>{
    S.locName=name||`${S.lat.toFixed(4)}, ${S.lon.toFixed(4)}`;
    document.getElementById('status-text').textContent='🧭 Travel Mode · '+S.locName;
    try{localStorage.setItem('st_loc',JSON.stringify({lat:S.lat,lon:S.lon,name:S.locName}))}catch(e){}
  });
  S.radarSource=isUSLocation(S.lat,S.lon)?'nexrad':'rainviewer';
  if(S.map){
    S.map.setView([S.lat,S.lon],S.map.getZoom());
    showRadarLayer(S.map);
  }
  fetchWeather();
  fetchAlerts();fetchHazards();
  scanRadarForStorms();
}
async function reverseGeocode(lat,lon){
  const fb=`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,{headers:{'Accept-Language':'en'},signal:AbortSignal.timeout(5000)});
    if(res.ok){const d=await res.json();if(d&&d.address)return fmtLocName(d.address,d.display_name);}
  }catch(e){}
  try{
    const res=await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`,{signal:AbortSignal.timeout(5000)});
    if(res.ok){const d=await res.json();const f=d.features?.[0];if(f){const p=f.properties||{};
      return fmtLocName({city:p.city,town:p.town,village:p.village,suburb:p.suburb,district:p.district,state:p.state,country:p.country,country_code:p.countrycode,road:p.street,administrative:p.district,county:p.county},fb);}}
  }catch(e){}
  return fb;
}

// ==========================================
// WEATHER STATION ALERTS (Threshold Monitoring)
// ==========================================
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
  _WX_ALERT_DEFS.forEach(def=>{
    const cfg=th[def.key];
    if(!cfg||!cfg.on)return;
    const result=def.check(S.weather,cfg.val);
    if(!result)return;
    const lastFired=_WX_ALERT_COOLDOWN[def.key]||0;
    if(now-lastFired<900000)return;
    _WX_ALERT_COOLDOWN[def.key]=now;
    try{localStorage.setItem('st_wxAlertCooldown',JSON.stringify(_WX_ALERT_COOLDOWN))}catch(e){}
    toast(result.msg,6000);
    _wxAlertHistory.push({key:def.key,label:def.label,icon:def.icon,msg:result.msg,val:result.val,u:result.u,time:now});
    _saveWxAlertHistory();
    _sendBrowserNotification(def.label,result.msg);
    if(S.activePage==='alerts')renderAlerts();
  });
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
        <input type="checkbox" ${cfg.on?'checked':''} onchange="toggleWxAlert('${def.key}',this.checked)" style="accent-color:var(--accent-cyan)">
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
  {key:'stormDist',label:'Distance',icon:'📏',unit:'mi',defVal:20,defOn:false,dir:'below',step:1,
    check:(storm,th)=>{const d=storm.distance;if(d==null)return null;const v=S.radarMetric?parseFloat((d*1.60934).toFixed(1)):parseFloat(d.toFixed(1));const u=S.radarMetric?'km':'mi';return d<=th?{val:v,u,msg:`🌩️ Storm cell at ${v} ${u} — within your ${S.radarMetric?parseFloat((th*1.60934).toFixed(1)):th} ${u} threshold (${storm.dbz} dBZ)`}:null}},
  {key:'stormDbz',label:'Intensity (dBZ)',icon:'📡',unit:'dBZ',defVal:40,defOn:false,step:5,
    check:(storm,th)=>{const v=storm.dbz;if(v==null)return null;return v>=th?{val:v,u:'dBZ',msg:`🌩️ Storm cell at ${v} dBZ — above your ${th} dBZ intensity threshold (${parseFloat(storm.distance.toFixed(1))} mi away)`}:null}},
  {key:'stormImpact',label:'Impact Score',icon:'🎯',unit:'%',defVal:50,defOn:false,step:5,
    check:(storm,th)=>{const v=storm.impactPct;if(v==null||v<=0)return null;return v>=th?{val:v,u:'%',msg:`🌩️ Storm cell impact ${v}% — above your ${th}% threshold (${storm.dbz} dBZ, ${parseFloat(storm.distance.toFixed(1))} mi, tier: ${storm.impactTier})`}:null}}
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
  const mv=S.stormMovement;
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
    try{const se=calcStormETA(storm);if(se&&se.approaching&&se.eta!=null&&se.eta>0){etaMin=se.eta;arrivalMs=now+se.eta*60000;closingMph=se.closingSpeed||0}}catch(e){}
    const distStr=S.radarMetric?parseFloat((storm.distance*1.60934).toFixed(1))+' km':parseFloat(storm.distance.toFixed(1))+' mi';
    const etaStr=etaMin!=null?' · ETA ~'+Math.ceil(etaMin)+' min ('+fmtClockShort(new Date(arrivalMs))+')':'';
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
    const mv=S.stormMovement;
    let moveStr='';
    if(mv&&mv.speed>=2){
      const travelDir=degToDir(mv.direction);
      const spdU=S.radarMetric?'km/h':'mph';
      const spdV=S.radarMetric?Math.round(mv.speed*1.60934):Math.round(mv.speed);
      moveStr=` traveling ${travelDir} (${Math.round(mv.direction)}°) ~${spdV} ${spdU}`;
    }
    const bestEta=batch.filter(b=>b.etaMin!=null).sort((a,b)=>a.etaMin-b.etaMin)[0];
    const etaPart=bestEta?`, ETA ~${Math.ceil(bestEta.etaMin)} min`:'';
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
        <input type="checkbox" ${cfg.on?'checked':''} onchange="toggleStormAlert('${def.key}',this.checked)" style="accent-color:var(--accent-cyan)">
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
function checkRainAlert(){}
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
