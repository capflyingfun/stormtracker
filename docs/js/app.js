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
function sonarZoomIn(){const i=_SONAR_ZOOM_LEVELS.indexOf(_sonarZoomMi);if(i>0){_sonarZoomMi=_SONAR_ZOOM_LEVELS[i-1];localStorage.setItem('st_sonarZoom',_sonarZoomMi);S._sonarTotalSwept=0;S._sonarSweepAngle=0;drawMiniSonar();_syncSonarZoomBtns()}}
function sonarZoomOut(){const i=_SONAR_ZOOM_LEVELS.indexOf(_sonarZoomMi);if(i<_SONAR_ZOOM_LEVELS.length-1){_sonarZoomMi=_SONAR_ZOOM_LEVELS[i+1];localStorage.setItem('st_sonarZoom',_sonarZoomMi);S._sonarTotalSwept=0;S._sonarSweepAngle=0;drawMiniSonar();_syncSonarZoomBtns()}}
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
      <div class="wrc-speed"><span class="wrc-num">${windNum}</span><span class="wrc-unit">${windUnit}</span></div>
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
      <div style="font-size:1.6em;font-weight:800;color:#e2e8f0;line-height:1" class="wrc-num">${windNum}</div>
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
  svg+=`<text x="${cx}" y="${cy-22}" fill="#00ddff" font-size="6" font-weight="600" text-anchor="middle" font-family="sans-serif">${windUnit.toUpperCase()}</text>`;
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
  while(_gaugeAvgSamples.length&&now-_gaugeAvgSamples[0].t>10000)_gaugeAvgSamples.shift();
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
  if(avgEl)avgEl.textContent='A'+avgDisp.toFixed(1)+' '+WIND_UNITS[S.windUnit];
  const trendEl=document.querySelector('.wrc-trend');
  if(trendEl)trendEl.innerHTML='';
  if(false&&trendEl&&_gaugeAvgHistory.length>=3){
    const span=(now-_gaugeAvgHistory[0].t)/1000;
    if(span>=0.5){
      const first=_gaugeAvgHistory[0].v;
      const last=_gaugeAvgHistory[_gaugeAvgHistory.length-1].v;
      const rate=(last-first)/span;
      if(Math.abs(rate)>0.05){
        const isUp=rate>0;
        const absR=Math.abs(rate).toFixed(1);
        trendEl.innerHTML=(isUp?'<span style="color:#FF0000">⤴ +'+absR+'</span>':'<span style="color:#00FF00">⤵ -'+absR+'</span>');
      }else{
        trendEl.innerHTML='<span style="color:rgba(0,220,255,0.6)">— 0.0</span>';
      }
    }
  }
}
function windSweepAnim(){
  if(_windSweepRaf){cancelAnimationFrame(_windSweepRaf);_windSweepRaf=null}
  _windSweepPaused=true;
  const targetSpd=_windCurSim.spd;
  const targetGust=_windCurSim.gust;
  const numEl=document.querySelector('.wrc-num');
  const gustEl=document.querySelector('.wrc-gust');
  if(numEl)numEl.textContent=kmhTo(targetSpd,S.windUnit);
  if(gustEl)gustEl.textContent=targetGust>0?'G'+fmtWind(targetGust):'';
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

function wmoIcon(code,isDay){const m={0:isDay?'☀️':'🌙',1:isDay?'🌤️':'🌙',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',56:'🌧️',57:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',66:'🧊',67:'🧊',71:'🌨️',73:'🌨️',75:'❄️',77:'🌨️',80:'🌦️',81:'🌧️',82:'🌧️',85:'🌨️',86:'❄️',95:'⛈️',96:'⛈️',99:'⛈️'};return m[code]||'🌡️'}
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
  return bmIcon(wmoToBasmilius(code,isDay),parseInt(sz)||32);
}
function animEmoji(code,isDay,size){
  const px=size==='1.2em'?38:size==='1em'?30:28;
  return neonWx(code,isDay,px);
}
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
        renderStorms();updateStormBadges();
        if(S.map)plotStormMarkers(S.map);
        return;
      }
      expiredKeys.forEach(k=>{delete S._stormETAs[k]});
      S.storms=S.storms.filter(s=>!expiredKeys.includes(stormKey(s)));
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
  const vis=getVisibleStormList().length;
  const hdr=document.getElementById('header-storm-count');
  const nav=document.getElementById('nav-storm-badge');
  if(hdr){
    hdr.textContent=`🌪️ ${vis}`;
    hdr.style.background=vis?'#22c55e':'#6b7280';
  }
  if(nav){
    nav.textContent=vis.toString();
    nav.style.background=vis?'#ef4444':'#6b7280';
  }
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
  S.storms=[];S._rawScanPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
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
  S.storms=[];S._rawScanPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
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
    S.storms=[];S._rawScanPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
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
  S.storms=[];S._rawScanPts=[];S._sonarTotalSwept=0;S._sonarSweepAngle=0;clearStormZones();
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
  {title:'✈️ Station Tab',text:'A full aviation weather station (PWS console). Shows METAR data from nearby airports — wind, temperature, pressure, visibility, cloud layers, and more.<br><br><b>Tappable Unit Cycling:</b> Tap any value to switch units:<br>• Temperature: °F / °C<br>• Wind: mph / kts / km/h / m/s / Beaufort<br>• Pressure: inHg / mb / mmHg / kPa<br>• Visibility: mi / km / m / NM<br>• Precipitation: in / mm / cm<br>Dual units always shown (primary + secondary).<br><br>Features 24-hour trend charts (temperature, pressure, wind, visibility), wind direction history, flight category indicator (VFR/MVFR/IFR/LIFR), condition timeline, METAR decoder with color-coded severity, and multi-station TAF forecasts. Use the station selector to search by ICAO code and save favorites.'},
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
  const eqSel=document.getElementById('settings-eq-radius');
  if(eqSel)eqSel.value=String(getEqRadius());
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
  if(!S.storms||!S.storms.length)return;
  const th=_loadStormThresholds();
  const anyOn=_STORM_ALERT_DEFS.some(d=>{const c=th[d.key];return c&&c.on});
  if(!anyOn)return;
  const now=Date.now();
  S.storms.forEach(storm=>{
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
    try{localStorage.setItem('st_stormAlertCooldown',JSON.stringify(_STORM_ALERT_COOLDOWN))}catch(e){}
    const distStr=S.radarMetric?parseFloat((storm.distance*1.60934).toFixed(1))+' km':parseFloat(storm.distance.toFixed(1))+' mi';
    const summaryMsg=`🌩️ Storm cell alert: ${storm.dbz} dBZ at ${distStr}${storm.impactPct>0?' · Impact: '+storm.impactPct+'% ('+storm.impactTier+')':''}`;
    toast(summaryMsg,8000);
    _stormAlertHistory.push({key:'stormCell',label:'Storm Cell',icon:'🌩️',msg:summaryMsg,val:storm.dbz,u:'dBZ',distance:storm.distance,impactPct:storm.impactPct||0,impactTier:storm.impactTier||'none',time:now});
    _saveStormAlertHistory();
    _sendBrowserNotification('Storm Cell Alert',summaryMsg);
    if(S.activePage==='alerts')renderAlerts();
  });
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
// WEATHER (Open-Meteo)
// ==========================================
async function fetchWeather(){
  const el=document.getElementById('page-weather');
  if(_isOffline&&S._lastWeatherData){renderWeather(S._lastWeatherData);return}
  showSkel(el,6);
  try{
    const omUrl=`https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}`
      +`&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day`
      +`&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility,is_day,cape,lifted_index,convective_inhibition`
      +`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max`
      +`&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto&forecast_days=7&past_days=2`;
    const omRes=await fetch(omUrl);const omData=await omRes.json();
    S.forecast=omData;
    try{
      const isUS=isUSLocation(S.lat,S.lon);
      const fetches=[fetchAWCNearest()];
      if(isUS)fetches.push(fetchNWSCurrent(),fetchNWSForecast());
      const results=await Promise.allSettled(fetches);
      const awcCur=results[0].status==='fulfilled'?results[0].value:null;
      const nwsCur=isUS&&results[1].status==='fulfilled'?results[1].value:null;
      const nwsFc=isUS&&results[2]?.status==='fulfilled'?results[2].value:null;
      const sources=[];
      const om={src:'Open-Meteo',temp:omData.current.temperature_2m,dewp:null,
        windKmh:omData.current.wind_speed_10m,windDir:omData.current.wind_direction_10m,
        gustKmh:omData.current.wind_gusts_10m,presMb:omData.current.pressure_msl,
        feelsC:omData.current.apparent_temperature,humidity:omData.current.relative_humidity_2m,
        visMeter:null,wxString:''};
      sources.push(om);
      if(nwsCur){
        sources.push({src:'NWS·'+nwsCur.station,temp:nwsCur.temp,dewp:nwsCur.dewp,
          windKmh:nwsCur.windKmh,windDir:nwsCur.windDir,gustKmh:nwsCur.gustKmh,
          presMb:nwsCur.presPa!=null?nwsCur.presPa/100:null,feelsC:nwsCur.feelsC,
          humidity:null,visMeter:nwsCur.visMeter,wxString:nwsCur.wxString,station:nwsCur.station});
      }
      if(awcCur){
        sources.push({src:'AWC·'+awcCur.icao,temp:awcCur.temp,dewp:awcCur.dewp,
          windKmh:awcCur.windKmh,windDir:awcCur.windDir,gustKmh:awcCur.gustKmh,
          presMb:awcCur.presPa!=null?awcCur.presPa/100:null,feelsC:null,
          humidity:null,visMeter:awcCur.visMeter,wxString:awcCur.wxString||'',station:awcCur.icao});
      }
      const blend=blendSources(sources);
      omData.current.temperature_2m=blend.temp;
      omData.current.wind_speed_10m=blend.windKmh;
      omData.current.wind_direction_10m=blend.windDir;
      omData.current.wind_gusts_10m=blend.gustKmh;
      omData.current.pressure_msl=blend.presMb;
      if(blend.feelsC!=null)omData.current.apparent_temperature=blend.feelsC;
      if(blend.humidity!=null)omData.current.relative_humidity_2m=blend.humidity;
      if(blend.visMeter!=null)S._nwsVisM=blend.visMeter;
      if(blend.dewp!=null){
        omData.current._directDewC=blend.dewp;
        const rh=Math.round(100*Math.exp((17.27*blend.dewp)/(237.7+blend.dewp))/Math.exp((17.27*blend.temp)/(237.7+blend.temp)));
        omData.current.relative_humidity_2m=Math.min(100,Math.max(0,rh));
      }
      if(blend.wxString)omData.current._nwsDesc=blend.wxString;
      omData.current._nwsStation=blend.station||null;
      omData.current._source=blend.sourceLabel;
      omData.current._sourceCount=sources.length;
      console.log('Weather blend: '+sources.map(s=>s.src).join(' + ')+' → '+blend.sourceLabel);
      if(nwsFc&&nwsFc.length){
        omData._nwsForecast=nwsFc;
        console.log('Weather: NWS forecast loaded ('+nwsFc.length+' periods)');
      }
    }catch(e){console.log('Multi-source blend failed:',e.message)}
    S.weather=omData.current;S._lastWeatherFetch=Date.now();S._lastWeatherData=omData;_resetMinMax();renderWeather(omData);if(_curLang!=='en')setTimeout(quickTranslate,300);setTimeout(checkWeatherThresholds,500);
  }catch(e){
    if(_isOffline&&S._lastWeatherData){
      renderWeather(S._lastWeatherData);
    } else {
      el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load weather data.</p></div>`;
    }
  }
}
async function _fetchAWCOnce(){
  let data=[];
  for(const deg of [1.0,2.0,3.5]){
    const url=`https://aviationweather.gov/api/data/metar?ids=&format=json&taf=false&hours=3&bbox=${(S.lat-deg).toFixed(2)},${(S.lon-deg).toFixed(2)},${(S.lat+deg).toFixed(2)},${(S.lon+deg).toFixed(2)}`;
    console.log('AWC fetch (±'+deg+'°):',url);
    const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
    if(!r.ok){console.log('AWC fetch failed:',r.status);continue}
    data=await r.json();
    console.log('AWC returned',data.length,'stations');
    if(data.length)break;
  }
  if(!data.length)return null;
  const nearest=data.reduce((best,m)=>{
    const d=haversine(S.lat,S.lon,m.lat,m.lon);
    return(!best||d<best._dist)?{...m,_dist:d}:best;
  },null);
  if(!nearest)return null;
  console.log('AWC nearest:',nearest.icaoId,'dist:',nearest._dist?.toFixed(1)+'mi');
  return{
    icao:nearest.icaoId,temp:nearest.temp,dewp:nearest.dewp,
    windKmh:nearest.wspd!=null?nearest.wspd*1.852:null,
    windDir:nearest.wdir!=null&&nearest.wdir!=='VRB'?Number(nearest.wdir):null,
    gustKmh:nearest.wgst!=null?nearest.wgst*1.852:null,
    presPa:nearest.altim!=null?nearest.altim*100:null,
    visMeter:nearest.visib!=null?(String(nearest.visib).includes('+')?16093:Number(nearest.visib)>100?Number(nearest.visib):Number(nearest.visib)*1609.34):null,
    wxString:nearest.wxString||'',dist:nearest._dist
  };
}
async function fetchAWCNearest(){
  try{
    const r=await _fetchAWCOnce();
    if(r)return r;
    console.log('AWC retry in 2s...');
    await new Promise(ok=>setTimeout(ok,2000));
    return await _fetchAWCOnce();
  }catch(e){
    console.log('AWC nearest error:',e.message,', retrying...');
    try{await new Promise(ok=>setTimeout(ok,2000));return await _fetchAWCOnce()}
    catch(e2){console.log('AWC retry failed:',e2.message);return null}
  }
}
function blendSources(sources){
  function avg(field){
    const vals=sources.map(s=>s[field]).filter(v=>v!=null&&!isNaN(v));
    return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
  }
  function first(field){
    for(const s of sources){if(s[field]!=null)return s[field]}
    return null;
  }
  function avgDir(field){
    const dirs=sources.map(s=>s[field]).filter(v=>v!=null&&!isNaN(v));
    if(!dirs.length)return null;
    if(dirs.length===1)return dirs[0];
    let sx=0,sy=0;
    dirs.forEach(d=>{const r=d*Math.PI/180;sx+=Math.sin(r);sy+=Math.cos(r)});
    let a=Math.atan2(sx/dirs.length,sy/dirs.length)*180/Math.PI;
    return((a%360)+360)%360;
  }
  const station=sources.find(s=>s.station)?.station||null;
  const srcNames=sources.filter(s=>s.src!=='Open-Meteo').map(s=>s.src);
  const sourceLabel=srcNames.length?srcNames.join('+'):'Open-Meteo';
  return{
    temp:avg('temp'),
    dewp:first('dewp'),
    windKmh:avg('windKmh'),
    windDir:avgDir('windDir'),
    gustKmh:Math.max(avg('gustKmh')||0,avg('windKmh')||0)||null,
    presMb:avg('presMb'),
    feelsC:first('feelsC'),
    humidity:first('humidity'),
    visMeter:first('visMeter'),
    wxString:sources.find(s=>s.wxString)?.wxString||'',
    station,sourceLabel
  };
}
async function fetchNWSCurrent(){
  try{
    const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{...NWS_HDR,signal:AbortSignal.timeout(6000)});
    if(!ptRes.ok)return null;
    const pt=await ptRes.json();
    const stUrl=pt.properties?.observationStations;
    if(!stUrl)return null;
    const stRes=await fetch(stUrl,{...NWS_HDR,signal:AbortSignal.timeout(6000)});
    if(!stRes.ok)return null;
    const stData=await stRes.json();
    const nearest=stData.features?.[0];
    if(!nearest)return null;
    const icao=nearest.properties?.stationIdentifier;
    const obsRes=await fetch(`https://api.weather.gov/stations/${icao}/observations/latest`,{...NWS_HDR,signal:AbortSignal.timeout(6000)});
    if(!obsRes.ok)return null;
    const obs=await obsRes.json();
    const p=obs.properties||{};
    if(p.temperature?.value==null)return null;
    return{
      temp:p.temperature.value,dewp:p.dewpoint?.value,
      windKmh:p.windSpeed?.value,windDir:p.windDirection?.value,
      gustKmh:p.windGust?.value,presPa:p.barometricPressure?.value,
      visMeter:p.visibility?.value,wxString:p.textDescription||'',
      feelsC:p.windChill?.value??p.heatIndex?.value??null,
      station:icao
    };
  }catch(e){return null}
}
async function fetchNWSForecast(){
  try{
    const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{...NWS_HDR,signal:AbortSignal.timeout(4000)});
    if(!ptRes.ok)return null;
    const pt=await ptRes.json();
    const fcUrl=pt.properties?.forecast;
    if(!fcUrl)return null;
    const fcRes=await fetch(fcUrl,{...NWS_HDR,signal:AbortSignal.timeout(5000)});
    if(!fcRes.ok)return null;
    const fc=await fcRes.json();
    return(fc.properties?.periods||[]).slice(0,14).map(p=>({
      name:p.name,temp:p.temperature,unit:p.temperatureUnit,
      wind:p.windSpeed,windDir:p.windDirection,
      short:p.shortForecast,detail:p.detailedForecast,
      precip:p.probabilityOfPrecipitation?.value||0,
      isDaytime:p.isDaytime,icon:p.icon
    }));
  }catch(e){return null}
}

function getBaroPrediction(current,hourly){
  const presMb=current.pressure_msl;
  const windDir=current.wind_direction_10m||0;
  let trend='steady',trendMb=0;
  if(hourly&&hourly.pressure_msl&&hourly.time){
    const now=Date.now();
    const pts=hourly.time.map((t,i)=>({t:new Date(t).getTime(),p:hourly.pressure_msl[i]})).filter(p=>p.t<=now&&p.t>=now-3*3600000);
    if(pts.length>=2){trendMb=pts[pts.length-1].p-pts[0].p;trend=trendMb>0.5?'rising':trendMb<-0.5?'falling':'steady'}
  }
  const isSE=windDir>=135&&windDir<180,isS=windDir>=180&&windDir<225,isSW=windDir>=225&&windDir<270;
  const isW=windDir>=270&&windDir<315,isN=windDir>=315||windDir<45,isNW=windDir>=315;
  const isNE=windDir>=45&&windDir<90,isE=windDir>=90&&windDir<135;
  let prediction='',icon='🌤️',confidence='Moderate';
  if(trend==='falling'){
    if(presMb<1005){prediction='Storm likely';icon='⛈️';confidence='High'}
    else if(presMb<1013){
      if(isSE||isS||isSW||isW){prediction='Rain within 12-24 hrs';icon='🌧️';confidence='High'}
      else if(isN||isNW){prediction='Unsettled, clearing possible';icon='🌥️';confidence='Moderate'}
      else{prediction='Cloudiness, rain possible';icon='🌦️';confidence='Moderate'}
    }else{
      if(isS||isSW||isSE){prediction='Rain within 24-36 hrs';icon='🌦️';confidence='Moderate'}
      else{prediction='Change approaching';icon='🌥️';confidence='Moderate'}
    }
  }else if(trend==='rising'){
    if(presMb>1022){prediction='Continued fair';icon='☀️';confidence='High'}
    else if(presMb>1013){
      if(isN||isNW||isW){prediction='Fair weather ahead';icon='🌤️';confidence='High'}
      else if(isSW||isS){prediction='Fair, warming';icon='🌤️';confidence='Moderate'}
      else{prediction='Clearing';icon='⛅';confidence='Moderate'}
    }else{
      if(isW||isNW){prediction='Clearing soon';icon='⛅';confidence='Moderate'}
      else{prediction='Slow improvement';icon='🌥️';confidence='Low'}
    }
  }else{
    if(presMb>1022){prediction='Fair and dry';icon='☀️';confidence='High'}
    else if(presMb>1013){
      if(isN||isNE||isE){prediction='Fair, no change';icon='🌤️';confidence='Moderate'}
      else{prediction='Mostly fair';icon='⛅';confidence='Moderate'}
    }else if(presMb>1005){
      if(isS||isSW||isSE){prediction='Rain possible';icon='🌦️';confidence='Low'}
      else{prediction='Mostly cloudy';icon='🌥️';confidence='Low'}
    }else{prediction='Unsettled, precip likely';icon='🌧️';confidence='Moderate'}
  }
  return{prediction,icon,confidence,trend,trendMb};
}

function renderWeather(data){
  const el=document.getElementById('page-weather');
  const c=data.current,isDay=c.is_day===1;
  const tempC=c.temperature_2m,feelsC=c.apparent_temperature;
  const icon=wmoIcon(c.weather_code,isDay),desc=wmoDesc(c.weather_code);
  const wxNavBtn=document.querySelector('[data-page="weather"] .nav-icon');
  if(wxNavBtn)wxNavBtn.innerHTML=neonWx(c.weather_code,isDay,20);
  const dewC=Math.min(tempC,c._directDewC!=null?c._directDewC:calcDewC(tempC,Math.min(100,c.relative_humidity_2m)));
  const hourly=data.hourly||{},daily=data.daily||{};
  S._hourlyData=hourly;
  const baro=getBaroPrediction(c,hourly);
  S._baroTrendMb=baro.trendMb;S._baroTrend=baro.trend;
  const trendArrow=baro.trend==='rising'?'↑':baro.trend==='falling'?'↓':'→';
  const windNum=kmhTo(c.wind_speed_10m,S.windUnit);
  const windUnit=WIND_UNITS[S.windUnit];
  const hasGust=c.wind_gusts_10m!=null&&c.wind_gusts_10m>0;
  const gustNum=hasGust?kmhTo(c.wind_gusts_10m,S.windUnit):'--.-';
  const gustStr=hasGust?'G'+fmtWind(c.wind_gusts_10m):'Gust: --.- '+windUnit;

  const _simActive=_windCurSim.spd>0&&S._skipWindRestart;
  const wd=_simActive?_windCurSim.dir:Math.round((c.wind_direction_10m||0)*10)/10;
  const windSpd=_simActive?_windCurSim.spd:(c.wind_speed_10m||0);
  const windDisp=parseFloat(kmhTo(windSpd,S.windUnit));
  const gustRaw=_simActive?_windCurSim.gust:(c.wind_gusts_10m||windSpd);
  const gustDisp=parseFloat(kmhTo(gustRaw,S.windUnit));
  _trackMinMax(windSpd);
  const bf=beaufortFromKmh(windSpd);
  const gaugeData={windSpd,wd,windDisp,gustDisp,gustRaw,windNum,windUnit,gustStr,bf,simActive:_simActive,pressure:c.pressure_msl};
  const gaugeHtml=renderWindGauge(gaugeData);

  const sections={
    wind:`<div class="weather-section" data-sec="wind"><div class="sec-header"><span class="card-title" style="margin:0"><span class="icon">💨</span> Wind</span>${secBtns('wind')}</div>
      <div class="wind-gauge-full">${gaugeHtml}</div>
      <div class="wind-stats-2x2">
        <div class="wind-stat-cell"><div class="wind-stat-label">Speed</div><div class="wind-stat-val">${windNum} ${windUnit}</div></div>
        <div class="wind-stat-cell"><div class="wind-stat-label">Direction</div><div class="wind-stat-val">${degToDir(wd)} ${wd.toFixed(0)}°</div></div>
        <div class="wind-stat-cell"><div class="wind-stat-label">Gusts</div><div class="wind-stat-val">${hasGust?kmhTo(c.wind_gusts_10m,S.windUnit)+' '+windUnit:'--'}</div></div>
        <div class="wind-stat-cell"><div class="wind-stat-label">Beaufort</div><div class="wind-stat-val" style="color:${_BFT_CLR[bf]}">F${bf} ${_BFT_NAME[bf]}</div></div>
      </div></div>`,
    trends:`<div class="weather-section" data-sec="trends"><div class="sec-header"><span class="card-title" style="margin:0"><span class="icon">📈</span> 48h Trends</span>${secBtns('trends')}</div>
      ${renderTrendCharts(hourly)}</div>`,
    hourly:`<div class="weather-section" data-sec="hourly"><div class="sec-header"><span class="card-title" style="margin:0"><span class="icon">🕐</span> 72h Hourly Forecast</span>${secBtns('hourly')}</div>
      ${renderHourlyForecast(hourly,daily)}</div>`,
    forecast:`<div class="weather-section" data-sec="forecast"><div class="sec-header"><span></span>${secBtns('forecast')}</div>${data._nwsForecast?renderNWSForecast(data._nwsForecast):renderDailyForecast(daily)}</div>`
  };
  const order=getSecOrder();

  el.innerHTML=`
    <div class="weather-hero">
      <div class="hero-stats-grid">
        <div class="hero-main-stat">
          <div style="font-size:1.8em;margin-bottom:2px">${animEmoji(c.weather_code,isDay,'1em')}</div>
          <div style="font-size:1.5em;font-weight:800;color:var(--text-primary);line-height:1">${fmtTempShort(tempC)}</div>
          <div style="font-size:0.7em;color:var(--text-secondary);margin-top:3px">${c._nwsDesc||desc}</div>
          ${c._source?`<div style="font-size:0.5em;color:var(--accent-cyan);margin-top:1px;opacity:0.7">${c._source}${c._sourceCount>1?' (×'+c._sourceCount+' avg)':''}</div>`:''}
        </div>
        <div class="hero-stat-cell"><div class="hero-side-label">Feels Like</div><div class="hero-side-val">${fmtTemp(feelsC)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Humidity</div><div class="hero-side-val">${Math.min(100,c.relative_humidity_2m)}%</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">☁️ Clouds</div><div class="hero-side-val">${c.cloud_cover}%</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Pressure</div><div class="hero-side-val">${fmtPres(c.pressure_msl)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Precip</div><div class="hero-side-val">${fmtPrecip(c.precipitation||0)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">🌡️ Dew Pt</div><div class="hero-side-val">${fmtTemp(dewC)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Spread</div><div class="hero-side-val">${fmtTempDiff(tempC-dewC)}</div><div style="font-size:0.42em;color:var(--text-muted);margin-top:1px;line-height:1.2">${(tempC-dewC)<=2?'Fog/mist likely':(tempC-dewC)<=5?'Very humid, clouds low':(tempC-dewC)<=10?'Moderate moisture':'Dry air, low rain chance'}</div></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 0">
        ${(()=>{const bc={0:0,1:1,2:2,3:3};const bm={'☀️':0,'🌤️':1,'⛅':2,'🌥️':3,'☁️':3,'🌦️':51,'🌧️':61,'⛈️':95};const bc2=bm[baro.icon]!=null?bm[baro.icon]:3;return neonWx(bc2,true,28)})()}
        <span style="font-size:0.75em;font-weight:600;color:var(--text-secondary)">${baro.prediction}</span>
        <span class="baro-trend ${baro.trend}" style="font-size:0.6em;color:${baro.trend==='rising'?'var(--accent-green)':baro.trend==='falling'?'var(--accent-red)':'var(--text-muted)'};text-shadow:0 0 6px ${baro.trend==='rising'?'rgba(0,255,136,0.4)':baro.trend==='falling'?'rgba(255,51,85,0.4)':'none'}">${trendArrow} ${(()=>{const isI=S.presUnit===0;if(isI){const v=Math.abs(baro.trendMb/33.8639);return(baro.trendMb>=0?'+':'-')+(v<0.05?v.toFixed(3):v.toFixed(2))+' inHg'}return(baro.trendMb>=0?'+':'')+baro.trendMb.toFixed(1)+' mb'})()}</span>
      </div>
    </div>
    ${_staleDataLabel()}
    <div class="card" style="margin-top:8px;padding:8px" id="mini-sonar-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="card-title" style="margin:0"><span class="icon">📡</span> Radar Sonar</span>
        <div style="display:flex;gap:4px;align-items:center">
          <button id="sonar-zoom-in" onclick="event.stopPropagation();sonarZoomIn()" style="background:none;border:1px solid var(--accent-cyan);color:var(--accent-cyan);font-size:0.7em;width:24px;height:24px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-weight:700;opacity:0.8" title="Zoom in">＋</button>
          <button id="sonar-zoom-out" onclick="event.stopPropagation();sonarZoomOut()" style="background:none;border:1px solid var(--accent-cyan);color:var(--accent-cyan);font-size:0.7em;width:24px;height:24px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-weight:700;opacity:0.8" title="Zoom out">ー</button>
          <button onclick="event.stopPropagation();_toggleSonarSettings()" style="background:none;border:1px solid var(--accent-cyan);color:var(--accent-cyan);font-size:0.7em;width:24px;height:24px;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;opacity:0.8" title="Dot size settings">⚙</button>
          <button onclick="event.stopPropagation();switchPage('radar')" style="background:none;border:1px solid var(--accent-cyan);color:var(--accent-cyan);font-size:0.6em;padding:3px 8px;border-radius:4px;cursor:pointer">Open Radar →</button>
        </div>
      </div>
      <div id="mini-sonar-wrap" style="width:100%;position:relative">
        <canvas id="mini-sonar-canvas" style="width:100%;display:block;border-radius:8px"></canvas>
      </div>
      <div id="mini-sonar-info" style="font-size:0.6em;color:var(--text-muted);text-align:center;margin-top:4px"></div>
    </div>
    ${order.map(k=>sections[k]||'').join('')}
    <div id="wx-tropical-section"></div>`;
  setTimeout(initPrecipTaps,0);
  setTimeout(()=>{startSonarSweep();_syncSonarZoomBtns()},50);
  if(!S._skipWindRestart) startWindSim();
  _updateTropicalUI();
}
function _updateTropicalUI(){
  const el=document.getElementById('wx-tropical-section');
  if(!el)return;
  el.innerHTML=_renderTropicalSection();
}
function _renderTropicalHazardSection(){
  const nhc=_getFilteredSystems();
  if(!nhc||!nhc.length)return '';
  const nearStorms=nhc.filter(s=>s.dist!=null&&s.dist<=S._nhcProxRadius);
  if(!nearStorms.length)return '';
  let html=`<div style="border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:8px"><div style="font-size:0.8em;font-weight:700;color:#9333EA;margin-bottom:6px">🌀 Tropical Cyclones Nearby</div>`;
  nearStorms.forEach(s=>{
    const cat=s.category||_saffirSimpson(s.maxWind);
    const distStr=s.dist!=null?Math.round(s.dist)+' mi':'?';
    html+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:${cat.color}0a;border-left:3px solid ${cat.color};border-radius:0 6px 6px 0;margin-bottom:4px">
      <span style="font-size:1em">🌀</span>
      <div style="flex:1"><div style="font-size:0.75em;font-weight:700;color:var(--text-primary)">${s.type} ${s.name}</div><div style="font-size:0.6em;color:${cat.color};font-weight:600">${cat.label} · ${distStr}</div></div>
      ${s.maxWind?`<div style="font-size:0.7em;font-weight:700;color:${cat.color}">${s.maxWind} mph</div>`:''}</div>`;
  });
  html+=`</div>`;
  return html;
}
function drawMiniSonar(){
  const canvas=document.getElementById('mini-sonar-canvas');
  if(!canvas||!S.lat)return;
  const wrap=document.getElementById('mini-sonar-wrap');
  if(!wrap)return;
  const dpr=window.devicePixelRatio||1;
  const size=wrap.clientWidth;
  if(size<10)return;
  canvas.width=size*dpr;canvas.height=size*dpr;
  canvas.style.width=size+'px';canvas.style.height=size+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  const cx=size/2,cy=size/2,maxR=size/2-20;
  ctx.fillStyle='#0a0e14';
  ctx.beginPath();ctx.arc(cx,cy,maxR+10,0,Math.PI*2);ctx.fill();
  const scanR=S.scanRadius||80;
  const viewR=_sonarZoomMi;
  let zoneCount=0,maxDbz=0;
  if(S._rawScanPts&&S._rawScanPts.length){
    const useRaw=viewR<=40;
    const dots=[];
    if(useRaw){
      for(const p of S._rawScanPts){
        const distMi=haversine(S.lat,S.lon,p.lat,p.lng);
        if(distMi>viewR)continue;
        const bear=(bearingDeg(S.lat,S.lon,p.lat,p.lng)+360)%360;
        const aMid=(bear-90)*Math.PI/180;
        const rMid=maxR*(distMi/viewR);
        if(rMid<=0)continue;
        dots.push({x:cx+Math.cos(aMid)*rMid,y:cy+Math.sin(aMid)*rMid,dbz:p.dbz,dist:rMid,angDeg:bear});
        if(p.dbz>maxDbz)maxDbz=p.dbz;
        zoneCount++;
      }
    }else{
      const cells=polarGridBin(S._rawScanPts,S.lat,S.lon,scanR);
      const angStep=ZONE_ANG_STEP,distStep=ZONE_DIST_STEP_MI;
      for(const[k,c]of cells){
        const distMi=(c.ri+0.5)*distStep;
        if(distMi>viewR)continue;
        const aMid=((c.ai+0.5)*angStep-90)*Math.PI/180;
        const rMid=maxR*(distMi/viewR);
        if(rMid<=0)continue;
        dots.push({x:cx+Math.cos(aMid)*rMid,y:cy+Math.sin(aMid)*rMid,dbz:c.maxDbz,dist:rMid,angDeg:(c.ai+0.5)*angStep});
        if(c.maxDbz>maxDbz)maxDbz=c.maxDbz;
        zoneCount++;
      }
    }
    dots.sort((a,b)=>a.dbz-b.dbz);
    const sweepDeg=S._sonarSweepAngle||0;
    const totalSwept=S._sonarTotalSwept||0;
    const zoomScale=80/viewR;
    const minDot=Math.max(2.5,size*0.012)*Math.min(zoomScale,6),maxDot=Math.max(6,size*0.028)*Math.min(zoomScale,6);
    const rawDotR=useRaw?Math.max(2,size*0.007)*Math.min(zoomScale,3):0;
    const cfg=_sonarCfg;
    const sweepDps=cfg.sweepSpeed;
    const holdDegs=cfg.fadeDur*sweepDps;
    const fadeDegs=(cfg.fadeDur+1)*sweepDps;
    const totalDegs=holdDegs+fadeDegs;
    const opacMul=cfg.dotOpacity/100;
    const dbzFloor=cfg.dbzFloor;
    const isAlwaysOn=cfg.alwaysOn;
    const glowMul=cfg.glowInt;
    const lightningDots=[];
    for(const d of dots){
      if(d.dbz<dbzFloor)continue;
      const frac=Math.min(1,d.dist/maxR);
      const dbzCls=_dbzEntry(d.dbz).cls;
      const dbzSc=_getDbzScale(dbzCls);
      const dotR=(useRaw?rawDotR*(0.8+0.4*frac):(minDot+(maxDot-minDot)*frac))*dbzSc;
      const hex=dbzHex(d.dbz);
      let sweepAlpha=1;
      if(!isAlwaysOn){
        const dotAng=((d.angDeg-90)%360+360)%360;
        let angDiff=((sweepDeg-dotAng)%360+360)%360;
        const hasBeenSwept=totalSwept>=360||angDiff<totalSwept;
        if(!hasBeenSwept){
          ctx.beginPath();ctx.arc(d.x,d.y,dotR,0,Math.PI*2);
          ctx.fillStyle='rgba(20,25,35,0.5)';ctx.fill();
          continue;
        }
        if(angDiff<holdDegs){sweepAlpha=1}
        else if(angDiff<totalDegs){sweepAlpha=Math.max(0.06,1-(angDiff-holdDegs)/fadeDegs)}
        else{sweepAlpha=0.06}
      }
      const baseA=Math.min(0.95,0.4+d.dbz/60)*opacMul;
      const alpha=baseA*sweepAlpha;
      ctx.beginPath();ctx.arc(d.x,d.y,dotR,0,Math.PI*2);
      ctx.fillStyle=hexToRgba(hex,alpha);ctx.fill();
      if(d.dbz>=40&&sweepAlpha>0.15&&glowMul>0){
        ctx.save();ctx.shadowColor=hex;ctx.shadowBlur=dotR*3*glowMul;
        ctx.beginPath();ctx.arc(d.x,d.y,dotR*0.8,0,Math.PI*2);
        ctx.fillStyle=hexToRgba(hex,alpha*0.7);ctx.fill();
        ctx.restore();
        if(sweepAlpha>0.5&&glowMul>=1){
          ctx.beginPath();ctx.arc(d.x,d.y,dotR*(1+0.6*glowMul),0,Math.PI*2);
          ctx.strokeStyle=hexToRgba(hex,sweepAlpha*0.3);ctx.lineWidth=1;ctx.stroke();
        }
      }
      if(d.dbz>=48&&sweepAlpha>0.3&&cfg.showLightning)lightningDots.push(d);
    }
    if(cfg.showLightning&&lightningDots.length){
      ctx.save();
      ctx.font=`${Math.max(10,size*0.035)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.shadowColor='rgba(255,255,0,0.8)';ctx.shadowBlur=6;
      for(const d of lightningDots){ctx.fillStyle='rgba(255,255,50,0.9)';ctx.fillText('⚡',d.x,d.y)}
      ctx.restore();
    }
    const hookStorms=(S.storms||[]).filter(s=>s._hookEcho&&s.distance<=viewR);
    if(hookStorms.length){
      ctx.save();
      ctx.font=`${Math.max(14,size*0.05)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.shadowColor='rgba(255,23,68,0.9)';ctx.shadowBlur=10;
      for(const hs of hookStorms){
        const distMi=hs.distance;
        const bear=(bearingDeg(S.lat,S.lon,hs.lat,hs.lng)+360)%360;
        const aMid=(bear-90)*Math.PI/180;
        const rMid=maxR*(distMi/viewR);
        const hx=cx+Math.cos(aMid)*rMid,hy=cy+Math.sin(aMid)*rMid;
        ctx.fillStyle='rgba(255,23,68,0.9)';ctx.fillText('🌪️',hx,hy-Math.max(8,size*0.025));
        ctx.font=`bold ${Math.max(7,size*0.022)}px Inter,sans-serif`;
        ctx.fillStyle='rgba(255,23,68,0.8)';ctx.fillText('ROTATION',hx,hy+Math.max(10,size*0.03));
        ctx.font=`${Math.max(14,size*0.05)}px sans-serif`;
      }
      ctx.restore();
    }
  }
  const gB=(_sonarCfg.gridBright||100)/100;
  if(gB>0){
    const nRings=4;
    for(let i=1;i<=nRings;i++){
      const r=maxR*(i/nRings);
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle=`rgba(0,220,255,${0.18*gB})`;ctx.lineWidth=0.8;ctx.stroke();
      const dist=Math.round(viewR*(i/nRings));
      const label=S.radarMetric?Math.round(dist*1.60934)+'km':dist+'mi';
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=4;
      ctx.fillStyle=`rgba(0,220,255,${0.5*gB})`;ctx.font=`${Math.max(8,size*0.028)}px Inter,sans-serif`;
      ctx.textAlign='center';ctx.fillText(label,cx,cy-r+10);ctx.restore();
    }
    ctx.beginPath();ctx.moveTo(cx,cy-maxR);ctx.lineTo(cx,cy+maxR);ctx.strokeStyle=`rgba(0,220,255,${0.1*gB})`;ctx.lineWidth=0.5;ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-maxR,cy);ctx.lineTo(cx+maxR,cy);ctx.stroke();
    const dirs=[['N',0],['S',180],['E',90],['W',270]];
    ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=4;
    ctx.fillStyle=`rgba(0,220,255,${0.6*gB})`;ctx.font=`bold ${Math.max(9,size*0.035)}px Inter,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const[l,deg]of dirs){
      const a=(deg-90)*Math.PI/180;
      const lx=cx+Math.cos(a)*(maxR+12),ly=cy+Math.sin(a)*(maxR+12);
      ctx.fillText(l,lx,ly);
    }
    ctx.restore();
  }
  try{
    const sonarStorms=(S.storms||[]).filter(s=>s.distance<=viewR);
    if(_sonarCfg.showStormArrows&&S.stormMovement&&S.stormMovement.speed>=2&&sonarStorms.length){
      const mv=S.stormMovement;
      const mvRad=(mv.direction-90)*Math.PI/180;
      const approaching=[];
      for(const st of sonarStorms){
        const eta=calcStormETA(st);
        if(eta&&eta.approaching&&eta.eta){approaching.push({storm:st,eta});}
      }
      if(approaching.length>0){
        approaching.sort((a,b)=>b.storm.dbz-a.storm.dbz);
        const shown=approaching.slice(0,8);
        for(const item of shown){
          const st=item.storm;
          const dist=st.distance||0;
          const bearing=st.bearing||0;
          const stAng=(bearing-90)*Math.PI/180;
          const r=Math.min(maxR-8,maxR*(dist/viewR));
          const sx=cx+Math.cos(stAng)*r,sy=cy+Math.sin(stAng)*r;
          const neonC=dbzHex(st.dbz);
          const arrLen=Math.max(10,Math.min(20,maxR*0.12));
          const tipX=sx+Math.cos(mvRad)*arrLen,tipY=sy+Math.sin(mvRad)*arrLen;
          const headL=6,ha1=mvRad-Math.PI+0.5,ha2=mvRad-Math.PI-0.5;
          ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=6;ctx.shadowOffsetX=1;ctx.shadowOffsetY=1;
          ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(tipX,tipY);
          ctx.strokeStyle=neonC;ctx.lineWidth=2.5;ctx.stroke();
          ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(tipX+Math.cos(ha1)*headL,tipY+Math.sin(ha1)*headL);ctx.moveTo(tipX,tipY);ctx.lineTo(tipX+Math.cos(ha2)*headL,tipY+Math.sin(ha2)*headL);
          ctx.strokeStyle=neonC;ctx.lineWidth=2.5;ctx.stroke();
          ctx.beginPath();ctx.arc(sx,sy,3.5,0,Math.PI*2);ctx.fillStyle=neonC;ctx.fill();
          ctx.restore();
        }
      }
      const neonC=pathArrowNeonColor(maxDbz);
      const arrLen=maxR*0.6;
      const ax=cx+Math.cos(mvRad)*arrLen,ay=cy+Math.sin(mvRad)*arrLen;
      const la=mvRad-Math.PI+0.4,ra=mvRad-Math.PI-0.4;
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=6;
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax+Math.cos(la)*12,ay+Math.sin(la)*12);ctx.moveTo(ax,ay);ctx.lineTo(ax+Math.cos(ra)*12,ay+Math.sin(ra)*12);
      ctx.strokeStyle=neonC;ctx.lineWidth=2.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+Math.cos(mvRad)*15,cy+Math.sin(mvRad)*15);ctx.lineTo(ax,ay);
      ctx.strokeStyle=hexToRgba(neonC,0.5);ctx.lineWidth=1.5;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
      const slx=ax+Math.cos(mvRad)*10,sly=ay+Math.sin(mvRad)*10;
      ctx.fillStyle=hexToRgba(neonC,0.8);ctx.font=`bold ${Math.max(9,size*0.028)}px Inter,sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('STORM',slx,sly);
      ctx.restore();
    }
    const aloftDir=S._upperWindDir;
    if(_sonarCfg.showAloft&&aloftDir!=null){
      const toDir=(aloftDir+180)%360;
      const aloftRad=(toDir-90)*Math.PI/180;
      const aLen=maxR*0.55;
      const aStart=15;
      const ax1=cx+Math.cos(aloftRad)*aStart,ay1=cy+Math.sin(aloftRad)*aStart;
      const ax2=cx+Math.cos(aloftRad)*aLen,ay2=cy+Math.sin(aloftRad)*aLen;
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=6;
      ctx.beginPath();ctx.moveTo(ax1,ay1);ctx.lineTo(ax2,ay2);
      ctx.strokeStyle='rgba(255,0,220,0.55)';ctx.lineWidth=1.8;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);
      const headL=8,ha1=aloftRad-Math.PI+0.4,ha2=aloftRad-Math.PI-0.4;
      ctx.beginPath();ctx.moveTo(ax2,ay2);ctx.lineTo(ax2+Math.cos(ha1)*headL,ay2+Math.sin(ha1)*headL);
      ctx.moveTo(ax2,ay2);ctx.lineTo(ax2+Math.cos(ha2)*headL,ay2+Math.sin(ha2)*headL);
      ctx.strokeStyle='rgba(255,0,220,0.65)';ctx.lineWidth=2;ctx.stroke();
      const lx=ax2+Math.cos(aloftRad)*10,ly=ay2+Math.sin(aloftRad)*10;
      ctx.fillStyle='rgba(255,0,220,0.8)';ctx.font=`bold ${Math.max(9,size*0.028)}px Inter,sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ALOFT',lx,ly);
      ctx.restore();
    }
  }catch(e){console.log('Sonar storm overlay error:',e.message)}
  if(!S._sonarSweepAngle)S._sonarSweepAngle=0;
  if(!_sonarCfg.alwaysOn){
    const sweepRad=S._sonarSweepAngle*Math.PI/180;
    ctx.save();
    const sweepEndX=cx+Math.cos(sweepRad)*maxR,sweepEndY=cy+Math.sin(sweepRad)*maxR;
    const tailSpan=0.6;
    for(let i=0;i<12;i++){
      const frac=i/12;
      const aOff=sweepRad-tailSpan*frac;
      const ex=cx+Math.cos(aOff)*maxR,ey=cy+Math.sin(aOff)*maxR;
      ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);
      ctx.strokeStyle=`rgba(0,220,255,${0.18*(1-frac)})`;ctx.lineWidth=1.5*(1-frac*0.5);ctx.stroke();
    }
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(sweepEndX,sweepEndY);
    ctx.strokeStyle='rgba(0,255,255,0.35)';ctx.lineWidth=2;ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor='#00dcff';ctx.shadowBlur=10;
  ctx.beginPath();ctx.arc(cx,cy,7,0,Math.PI*2);ctx.fillStyle='#00eeff';ctx.fill();
  ctx.restore();
  ctx.beginPath();ctx.arc(cx,cy,11,0,Math.PI*2);ctx.strokeStyle='rgba(0,220,255,0.6)';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,16,0,Math.PI*2);ctx.strokeStyle='rgba(0,220,255,0.25)';ctx.lineWidth=1;ctx.stroke();
  const infoEl=document.getElementById('mini-sonar-info');
  if(infoEl){
    if(zoneCount>0){
      infoEl.textContent=`${zoneCount} zone${zoneCount>1?'s':''} · Peak ${maxDbz} dBZ · ${S.radarMetric?Math.round(viewR*1.60934)+'km':viewR+'mi'} radius`;
    }else{
      infoEl.textContent=S.scanTime?`All clear · ${S.radarMetric?Math.round(viewR*1.60934)+'km':viewR+'mi'} radius`:`Waiting for radar scan...`;
    }
  }
}
let _sonarAnimId=0;
function startSonarSweep(){
  if(_sonarAnimId)return;
  S._sonarSweepAngle=S._sonarSweepAngle||0;
  let last=0;
  function tick(ts){
    if(!document.getElementById('mini-sonar-canvas')){_sonarAnimId=0;return;}
    const dt=last?ts-last:16;last=ts;
    const prevAngle=S._sonarSweepAngle||0;
    if(_sonarCfg.alwaysOn){S._sonarTotalSwept=720;drawMiniSonar();_sonarAnimId=requestAnimationFrame(tick);return}
    const advance=dt*(_sonarCfg.sweepSpeed/1000);
    S._sonarSweepAngle=(prevAngle+advance)%360;
    S._sonarTotalSwept=Math.min(720,(S._sonarTotalSwept||0)+advance);
    drawMiniSonar();
    _sonarAnimId=requestAnimationFrame(tick);
  }
  _sonarAnimId=requestAnimationFrame(tick);
}
function stopSonarSweep(){if(_sonarAnimId){cancelAnimationFrame(_sonarAnimId);_sonarAnimId=0;}}
const _wn={p:[151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180],
  g:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]],
  fade(t){return t*t*t*(t*(t*6-15)+10)},
  lerp(a,b,t){return a+(b-a)*t},
  dot(g,x,y){return g[0]*x+g[1]*y},
  noise(x,y){
    const p=_wn.p,g=_wn.g,X=Math.floor(x)&255,Y=Math.floor(y)&255;
    x-=Math.floor(x);y-=Math.floor(y);
    const u=_wn.fade(x),v=_wn.fade(y);
    const aa=p[(p[X]+Y)&255]%8,ab=p[(p[X]+Y+1)&255]%8,ba=p[(p[(X+1)&255]+Y)&255]%8,bb=p[(p[(X+1)&255]+Y+1)&255]%8;
    return _wn.lerp(_wn.lerp(_wn.dot(g[aa],x,y),_wn.dot(g[ba],x-1,y),u),_wn.lerp(_wn.dot(g[ab],x,y-1),_wn.dot(g[bb],x-1,y-1),u),v);
  }
};
let _windSimTimer=null;
let _windRefreshTimer=null;
let _gustSamples=[];
let _gustMax=0;
let _gustResetT=0;
let _windBase={spd:0,dir:0,gust:0};
let _windCurSim={spd:0,dir:0,gust:0};
let _windFloor=0;
let _windCeil=0;
let _windLerpFrom={spd:0,dir:0};
let _windLerpTo={spd:0,dir:0};
let _windLerpT0=0;
const _WIND_LERP_DUR=5000;
let _windSweepRaf=null;
let _windSweepPaused=false;
let _windSweepAfterRender=false;
function _pickWindTarget(){
  const tSec=Date.now()/1000;
  const n=_wn.noise(tSec*0.2,0);
  const spd=_windFloor+((n+1)/2)*(_windCeil-_windFloor);
  const dn=_wn.noise(tSec*0.2,100);
  const dir=((_windBase.dir+dn*5)%360+360)%360;
  return{spd,dir};
}
function _updateWindRange(){
  const ws=_windBase.spd;
  const wg=_windBase.gust||ws;
  _windFloor=Math.max(0,ws*0.5);
  _windCeil=wg*1.1;
  if(_windCeil<=_windFloor)_windCeil=_windFloor+1;
}
function _getForecastWind(now){
  const h=S._hourlyData;
  if(!h||!h.time||!h.wind_speed_10m||!h.wind_direction_10m)return null;
  const times=h.time;const spds=h.wind_speed_10m;const dirs=h.wind_direction_10m;
  const gusts=h.wind_gusts_10m;
  const nowMs=now||Date.now();
  let i0=-1;
  for(let i=0;i<times.length-1;i++){
    const t0=new Date(times[i]).getTime(),t1=new Date(times[i+1]).getTime();
    if(nowMs>=t0&&nowMs<t1){i0=i;break}
  }
  if(i0<0)return null;
  const t0=new Date(times[i0]).getTime(),t1=new Date(times[i0+1]).getTime();
  const frac=(nowMs-t0)/(t1-t0);
  const spd=spds[i0]+(spds[i0+1]-spds[i0])*frac;
  let dd=dirs[i0+1]-dirs[i0];if(dd>180)dd-=360;if(dd<-180)dd+=360;
  const dir=((dirs[i0]+dd*frac)%360+360)%360;
  const gust=gusts?(gusts[i0]+(gusts[i0+1]-gusts[i0])*frac):null;
  return{spd,dir,gust};
}
function startWindSim(){
  if(_windSimTimer)clearInterval(_windSimTimer);
  if(_windRefreshTimer)clearInterval(_windRefreshTimer);
  if(S._windPickTimer)clearInterval(S._windPickTimer);
  if(!S.weather)return;
  _windBase={spd:S.weather.wind_speed_10m||0,dir:S.weather.wind_direction_10m||0,gust:S.weather.wind_gusts_10m||0};
  _gustSamples=[];_gustMax=0;_gustResetT=Date.now();
  _updateWindRange();
  _windCurSim={spd:_windBase.spd,dir:_windBase.dir,gust:S.weather.wind_gusts_10m||0};
  _windLerpFrom={spd:_windBase.spd,dir:_windBase.dir};
  _windLerpTo=_pickWindTarget();
  _windLerpT0=Date.now();
  _windRefreshTimer=setInterval(async()=>{
    try{
      const awc=await fetchAWCNearest();
      if(awc&&awc.windKmh!=null){
        const newSpd=awc.windKmh;
        const newDir=awc.windDir!=null?awc.windDir:_windBase.dir;
        console.log('Wind refresh from AWC·'+awc.icao+': spd='+newSpd.toFixed(1)+'kmh dir='+newDir+'°');
        const newGust=awc.gustKmh!=null?awc.gustKmh:_windBase.gust;
        _windBase={spd:newSpd,dir:newDir,gust:newGust};
        _updateWindRange();
        _windLerpFrom={spd:_windCurSim.spd,dir:_windCurSim.dir};
        _windLerpTo=_pickWindTarget();
        _windLerpT0=Date.now();
      }
    }catch(e){console.log('Wind refresh error:',e.message)}
  },120000);
  S._windPickTimer=setInterval(()=>{
    _windLerpFrom={spd:_windCurSim.spd,dir:_windCurSim.dir};
    _windLerpTo=_pickWindTarget();
    _windLerpT0=Date.now();
  },_WIND_LERP_DUR);
  _windSimTimer=setInterval(()=>{
    const now=Date.now();
    const elapsed=now-_windLerpT0;
    const p=Math.min(1,elapsed/_WIND_LERP_DUR);
    const ep=p*p*(3-2*p);
    let simSpd=_windLerpFrom.spd+(_windLerpTo.spd-_windLerpFrom.spd)*ep;
    simSpd=Math.max(_windFloor,Math.min(_windCeil,simSpd));
    let dd=_windLerpTo.dir-_windLerpFrom.dir;
    if(dd>180)dd-=360;if(dd<-180)dd+=360;
    let simDir=((_windLerpFrom.dir+dd*ep)%360+360)%360;
    _gustSamples.push(simSpd);
    if(now-_gustResetT>=30000){
      _gustMax=Math.max(..._gustSamples);
      _gustSamples=[];
      _gustResetT=now;
    }
    const displayGust=_gustSamples.length>0?Math.max(_gustMax,Math.max(..._gustSamples)):_gustMax;
    _windCurSim={spd:simSpd,dir:simDir,gust:displayGust};
    _trackMinMax(simSpd);
    const gStyle=getGaugeStyle();
    if(gStyle==='neon'){
      const dirEl=document.querySelector('.wrc-dir');
      if(dirEl)dirEl.textContent=degToDir(simDir)+' '+simDir.toFixed(0)+'°';
      const cx=50,cy=50;
      if(!_windSweepPaused){
        const numEl=document.querySelector('.wrc-num');
        const gustEl=document.querySelector('.wrc-gust');
        if(numEl)numEl.textContent=kmhTo(simSpd,S.windUnit);
        if(gustEl)gustEl.textContent=displayGust>0?'G'+fmtWind(displayGust):'';
        const simSpdDisp=parseFloat(kmhTo(simSpd,S.windUnit));
        const gustDispSim=parseFloat(kmhTo(displayGust,S.windUnit));
        updateGaugeSegments(simSpdDisp,gustDispSim);
      }
      const compass=document.querySelector('.wind-rose svg');
      if(compass){
        const ptr=compass.querySelector('polygon');
        const dot=compass.querySelector('polygon+circle');
        if(ptr&&dot){
          const r=42,pBase=10;
          const ptrAng=(simDir-90)*Math.PI/180;
          const px=cx+Math.cos(ptrAng)*r,py=cy+Math.sin(ptrAng)*r;
          const pLx=cx+Math.cos(ptrAng-0.2)*pBase,pLy=cy+Math.sin(ptrAng-0.2)*pBase;
          const pRx=cx+Math.cos(ptrAng+0.2)*pBase,pRy=cy+Math.sin(ptrAng+0.2)*pBase;
          const pBx=cx+Math.cos(ptrAng+Math.PI)*5,pBy=cy+Math.sin(ptrAng+Math.PI)*5;
          ptr.setAttribute('points',`${px.toFixed(1)},${py.toFixed(1)} ${pLx.toFixed(1)},${pLy.toFixed(1)} ${pBx.toFixed(1)},${pBy.toFixed(1)} ${pRx.toFixed(1)},${pRy.toFixed(1)}`);
          dot.setAttribute('cx',px.toFixed(1));dot.setAttribute('cy',py.toFixed(1));
        }
      }
    }else{
      const gyroActive=_gyroEnabled&&_gyroHeading!=null;
      if(!S._gaugeTickLast||now-S._gaugeTickLast>(gyroActive?150:300)){
        S._gaugeTickLast=now;
        const wr=document.querySelector('.wind-rose,[data-gauge]');
        if(wr&&S.weather){
          const c2=S.weather;
          const wn2=kmhTo(simSpd,S.windUnit);
          const wu2=WIND_UNITS[S.windUnit];
          const gd2=parseFloat(kmhTo(displayGust,S.windUnit));
          const gs2=displayGust>0?'G'+fmtWind(displayGust):'';
          const bf2=beaufortFromKmh(simSpd);
          const d2={windSpd:simSpd,wd:simDir,windDisp:parseFloat(wn2),gustDisp:gd2,gustRaw:displayGust,windNum:wn2,windUnit:wu2,gustStr:gs2,bf:bf2,simActive:true,pressure:c2.pressure_msl};
          const newHtml=renderWindGauge(d2);
          const parent=wr.parentElement;
          if(parent){
            const temp=document.createElement('div');
            temp.innerHTML=newHtml;
            parent.replaceChild(temp.firstElementChild,wr);
          }
        }
      }
    }
  },100);
  if(_windSweepAfterRender){
    _windSweepAfterRender=false;
    windSweepAnim();
  }
}
function secBtns(key){return`<div class="sec-btns"><button onclick="moveSection('${key}',-1)" title="Move up">▲</button><button onclick="moveSection('${key}',1)" title="Move down">▼</button></div>`}
const _defaultSecOrder=['wind','trends','forecast'];
function getSecOrder(){try{const o=JSON.parse(localStorage.getItem('st_sec_order'));if(Array.isArray(o)&&o.length>=2){const valid=['wind','trends','forecast','hourly'];const filtered=o.filter(k=>valid.includes(k));_defaultSecOrder.forEach(k=>{if(!filtered.includes(k))filtered.push(k)});return filtered}}catch(e){}return _defaultSecOrder.slice()}
function moveSection(key,dir){
  const order=getSecOrder();const i=order.indexOf(key);
  if(i<0)return;const ni=i+dir;
  if(ni<0||ni>=order.length)return;
  [order[i],order[ni]]=[order[ni],order[i]];
  try{localStorage.setItem('st_sec_order',JSON.stringify(order))}catch(e){}
  if(S.forecast)renderWeather(S.forecast);
}

function get48hData(h){
  if(!h||!h.time)return null;
  const nowMs=Date.now();
  const all=h.time.map((t,i)=>({t:new Date(t).getTime(),idx:i}));
  const pastStart=all.findIndex(p=>p.t>=nowMs-24*3600000);
  const futEnd=all.findIndex(p=>p.t>=nowMs+24*3600000);
  const start=Math.max(0,pastStart);
  const end=futEnd>0?futEnd:all.length;
  const nowIdx=all.findIndex(p=>p.t>=nowMs);
  return{start,end,nowIdx:nowIdx>=0?nowIdx-start:24,count:end-start};
}
const TREND_SERIES=[
  {id:'temp',label:'Temp',icon:'🌡️',color:'#ef4444',key:'temperature_2m',fmt:v=>fmtTemp(v),group:'temp'},
  {id:'feels',label:'Feels Like',icon:'🤔',color:'#f97316',key:'apparent_temperature',fmt:v=>fmtTemp(v),group:'temp'},
  {id:'dewpt',label:'Dew Point',icon:'💧',color:'#06b6d4',key:'dew_point_2m',fmt:v=>fmtTemp(v),group:'temp'},
  {id:'humidity',label:'Humidity',icon:'💦',color:'#22d3ee',key:'relative_humidity_2m',fmt:v=>v.toFixed(0)+'%',unit:'%',group:'pct'},
  {id:'cloud',label:'Clouds',icon:'☁️',color:'#94a3b8',key:'cloud_cover',fmt:v=>v.toFixed(0)+'%',unit:'%',group:'pct'},
  {id:'precip',label:'Precip',icon:'🌧️',color:'#3b82f6',key:'precipitation',fmt:v=>fmtPrecip(v),bar:true,group:'precip'},
  {id:'precipProb',label:'Rain %',icon:'☂️',color:'#818cf8',key:'precipitation_probability',fmt:v=>(v||0).toFixed(0)+'%',unit:'%',group:'pct'},
  {id:'wind',label:'Wind',icon:'💨',color:'#10b981',key:'wind_speed_10m',fmt:v=>fmtWind(v),group:'wind'},
  {id:'gust',label:'Gusts',icon:'🌬️',color:'#f59e0b',key:'wind_gusts_10m',fmt:v=>fmtWind(v),group:'wind'},
  {id:'pres',label:'Pressure',icon:'📊',color:'#00e5ff',key:'pressure_msl',fmt:v=>fmtPres(v),group:'pres'},
];
if(!S._trendSel)S._trendSel=['temp','feels'];
function toggleTrendSeries(id){
  const idx=S._trendSel.indexOf(id);
  if(idx>=0)S._trendSel.splice(idx,1);
  else{if(S._trendSel.length>=4)S._trendSel.shift();S._trendSel.push(id)}
  if(S.forecast)renderTrendChartUpdate(S.forecast.hourly);
}
function renderTrendCharts(h){
  if(!h||!h.time)return'';
  const info=get48hData(h);if(!info)return'';
  const pills=TREND_SERIES.map(s=>{
    const on=S._trendSel.includes(s.id);
    return`<button onclick="toggleTrendSeries('${s.id}')" style="padding:3px 8px;border-radius:12px;border:1px solid ${on?s.color:'#334155'};background:${on?s.color+'22':'transparent'};color:${on?s.color:'#94a3b8'};font-size:0.65em;font-weight:600;cursor:pointer;white-space:nowrap">${s.icon} ${s.label}</button>`;
  }).join('');
  return`<div class="card" id="trend-card">
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${pills}</div>
    <div id="trend-chart-area">${buildTrendSVG(h,info)}</div></div>`;
}
function renderTrendChartUpdate(h){
  const info=get48hData(h);if(!info)return;
  const pills=TREND_SERIES.map(s=>{
    const on=S._trendSel.includes(s.id);
    return`<button onclick="toggleTrendSeries('${s.id}')" style="padding:3px 8px;border-radius:12px;border:1px solid ${on?s.color:'#334155'};background:${on?s.color+'22':'transparent'};color:${on?s.color:'#94a3b8'};font-size:0.65em;font-weight:600;cursor:pointer;white-space:nowrap">${s.icon} ${s.label}</button>`;
  }).join('');
  const card=document.getElementById('trend-card');
  if(card)card.innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${pills}</div><div id="trend-chart-area">${buildTrendSVG(h,info)}</div>`;
}
function buildTrendSVG(h,info){
  const sel=S._trendSel.map(id=>TREND_SERIES.find(s=>s.id===id)).filter(Boolean);
  if(!sel.length)return'<div style="text-align:center;color:var(--text-muted);font-size:0.8em;padding:20px">Select data series above</div>';
  const W=600,H=180,PAD_L=6,PAD_R=6,PAD_T=18,PAD_B=22;
  const cW=W-PAD_L-PAD_R,cH=H-PAD_T-PAD_B;
  const {start,end,nowIdx,count}=info;
  if(count<4)return'';
  const hasBars=sel.some(s=>s.bar);
  const lineData=sel.filter(s=>!s.bar);
  const barData=sel.filter(s=>s.bar);
  let svg=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">`;
  svg+=`<defs><linearGradient id="tg-now" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(0,229,255,0.15)"/><stop offset="100%" stop-color="rgba(0,229,255,0)"/></linearGradient></defs>`;
  for(let g=0;g<=4;g++){
    const y=PAD_T+cH*(g/4);
    svg+=`<line x1="${PAD_L}" y1="${y}" x2="${W-PAD_R}" y2="${y}" stroke="rgba(148,163,184,0.1)" stroke-width="0.5"/>`;
  }
  const nowX=PAD_L+(nowIdx/(count-1))*cW;
  svg+=`<rect x="${PAD_L}" y="${PAD_T}" width="${nowX-PAD_L}" height="${cH}" fill="rgba(148,163,184,0.03)"/>`;
  svg+=`<line x1="${nowX}" y1="${PAD_T-4}" x2="${nowX}" y2="${H-PAD_B}" stroke="rgba(0,229,255,0.5)" stroke-width="1" stroke-dasharray="3,2"/>`;
  svg+=`<text x="${nowX}" y="${PAD_T-6}" fill="#00e5ff" font-size="7" font-weight="700" text-anchor="middle">NOW</text>`;
  const groups=new Map();
  sel.forEach(s=>{const g=s.group||s.id;if(!groups.has(g))groups.set(g,[]);groups.get(g).push(s)});
  const groupKeys=[...groups.keys()];
  const scales=new Map();
  groupKeys.forEach(g=>{
    const series=groups.get(g);
    let allVals=[];
    series.forEach(s=>{
      const arr=h[s.key];
      if(arr)for(let i=start;i<end;i++){if(arr[i]!=null)allVals.push(arr[i])}
    });
    if(!allVals.length)allVals=[0,1];
    let mn=Math.min(...allVals),mx=Math.max(...allVals);
    const rng=mx-mn||1;
    mn-=rng*0.1;mx+=rng*0.1;
    scales.set(g,{mn,mx,rng:mx-mn||1});
  });
  if(barData.length){
    const sc=scales.get(barData[0].group);
    barData.forEach(s=>{
      const arr=h[s.key];if(!arr)return;
      const bw=cW/count*0.7;
      for(let i=0;i<count;i++){
        const v=arr[start+i];if(v==null||v<=0)continue;
        const x=PAD_L+(i/(count-1))*cW-bw/2;
        const ht=Math.max(2,((v-0)/(sc.mx-0||1))*cH);
        const y=PAD_T+cH-ht;
        const isPast=i<nowIdx;
        svg+=`<rect x="${x}" y="${y}" width="${bw}" height="${ht}" rx="1" fill="${s.color}" opacity="${isPast?0.7:0.35}"/>`;
      }
    });
  }
  lineData.forEach((s,si)=>{
    const arr=h[s.key];if(!arr)return;
    const sc=scales.get(s.group);
    const pts=[];
    for(let i=0;i<count;i++){
      const v=arr[start+i];if(v==null)continue;
      const x=PAD_L+(i/(count-1))*cW;
      const y=PAD_T+cH-((v-sc.mn)/sc.rng)*cH;
      pts.push({x,y,v,i});
    }
    if(pts.length<2)return;
    const pastPts=pts.filter(p=>p.i<=nowIdx);
    const futPts=pts.filter(p=>p.i>=nowIdx);
    if(pastPts.length>=2){
      const d=pastPts.map((p,j)=>(j===0?`M${p.x.toFixed(1)},${p.y.toFixed(1)}`:`L${p.x.toFixed(1)},${p.y.toFixed(1)}`)).join(' ');
      svg+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if(futPts.length>=2){
      const d=futPts.map((p,j)=>(j===0?`M${p.x.toFixed(1)},${p.y.toFixed(1)}`:`L${p.x.toFixed(1)},${p.y.toFixed(1)}`)).join(' ');
      svg+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round" opacity="0.5"/>`;
    }
    const dayBuckets=new Map();
    pts.forEach(p=>{
      const dt=new Date(h.time[start+p.i]);
      const dk=dt.toDateString();
      if(!dayBuckets.has(dk))dayBuckets.set(dk,{hi:p,lo:p});
      const b=dayBuckets.get(dk);
      if(p.v>b.hi.v)b.hi=p;
      if(p.v<b.lo.v)b.lo=p;
    });
    const usedPts=new Set();
    dayBuckets.forEach(b=>{
      const hiK=b.hi.i+':hi',loK=b.lo.i+':lo';
      if(!usedPts.has(hiK)){
        usedPts.add(hiK);
        const tx=b.hi.x+5>W-PAD_R-30?b.hi.x-30:b.hi.x+5;
        svg+=`<circle cx="${b.hi.x.toFixed(1)}" cy="${b.hi.y.toFixed(1)}" r="3" fill="${s.color}" stroke="#0f172a" stroke-width="1"/>`;
        svg+=`<text x="${tx.toFixed(1)}" y="${(b.hi.y-5).toFixed(1)}" fill="${s.color}" font-size="6.5" font-weight="700">▲${s.fmt(b.hi.v)}</text>`;
      }
      if(Math.abs(b.lo.i-b.hi.i)>2&&!usedPts.has(loK)){
        usedPts.add(loK);
        const tx=b.lo.x+5>W-PAD_R-30?b.lo.x-30:b.lo.x+5;
        svg+=`<circle cx="${b.lo.x.toFixed(1)}" cy="${b.lo.y.toFixed(1)}" r="3" fill="${s.color}" stroke="#0f172a" stroke-width="1"/>`;
        svg+=`<text x="${tx.toFixed(1)}" y="${(b.lo.y+10).toFixed(1)}" fill="${s.color}" font-size="6.5" font-weight="700" opacity="0.7">▼${s.fmt(b.lo.v)}</text>`;
      }
    });
  });
  const nowLabels=[];
  lineData.forEach(s=>{
    const arr=h[s.key];if(!arr)return;
    const sc=scales.get(s.group);
    const v=arr[start+nowIdx];if(v==null)return;
    const y=PAD_T+cH-((v-sc.mn)/sc.rng)*cH;
    nowLabels.push({y,color:s.color,label:s.fmt(v),id:s.id});
  });
  barData.forEach(s=>{
    const arr=h[s.key];if(!arr)return;
    const sc=scales.get(s.group);
    const v=arr[start+nowIdx];if(v==null)return;
    const ht=Math.max(2,((v-0)/(sc.mx-0||1))*cH);
    const y=PAD_T+cH-ht;
    nowLabels.push({y,color:s.color,label:s.fmt(v),id:s.id});
  });
  if(nowLabels.length){
    nowLabels.sort((a,b)=>a.y-b.y);
    const LBL_H=9;
    const minY=PAD_T+2,maxY=H-PAD_B-4;
    const placed=[];
    nowLabels.forEach(nl=>{
      let py=nl.y;
      for(const prev of placed){
        if(py<prev+LBL_H&&py>prev-LBL_H)py=prev+LBL_H;
      }
      if(py<minY)py=minY;
      if(py>maxY)py=maxY;
      placed.push(py);
      const tx=nowX+5;
      svg+=`<circle cx="${nowX.toFixed(1)}" cy="${nl.y.toFixed(1)}" r="2.5" fill="${nl.color}" stroke="#0f172a" stroke-width="0.8"/>`;
      svg+=`<text x="${tx.toFixed(1)}" y="${(py+2.5).toFixed(1)}" fill="${nl.color}" font-size="7" font-weight="700" text-shadow="0 0 3px #000">${nl.label}</text>`;
    });
  }
  if(groupKeys.length>1||(lineData.length>0&&barData.length>0)){
    let lx=PAD_L+4,ly=PAD_T+10;
    sel.forEach(s=>{
      svg+=`<rect x="${lx}" y="${ly-5}" width="8" height="3" rx="1" fill="${s.color}"/>`;
      svg+=`<text x="${lx+11}" y="${ly-2}" fill="${s.color}" font-size="6" font-weight="600">${s.label}</text>`;
      ly+=10;
    });
  }
  const fmtHr=d=>fmtHrLabel(d);
  const labelCount=7;
  for(let li=0;li<labelCount;li++){
    const idx=Math.round(li*(count-1)/(labelCount-1));
    const t=new Date(h.time[start+idx]);
    const x=PAD_L+(idx/(count-1))*cW;
    svg+=`<text x="${x}" y="${H-4}" fill="#64748b" font-size="6" text-anchor="middle">${idx===nowIdx?'Now':fmtHr(t)}</text>`;
  }
  const yLabels=groupKeys.length<=2?groupKeys:[groupKeys[0]];
  yLabels.forEach((g,gi)=>{
    const sc=scales.get(g);
    const isRight=gi>0;
    [0,0.5,1].forEach(f=>{
      const v=sc.mn+sc.rng*f;
      const y=PAD_T+cH-f*cH;
      const s=groups.get(g)[0];
      const label=s.fmt(v);
      if(isRight)svg+=`<text x="${W-PAD_R+2}" y="${y+2}" fill="#475569" font-size="5" text-anchor="start">${label}</text>`;
      else svg+=`<text x="${PAD_L-2}" y="${y+2}" fill="#475569" font-size="5" text-anchor="end">${label}</text>`;
    });
  });
  svg+=`</svg>`;
  return svg;
}
function initPrecipTaps(){
  document.querySelectorAll('.hourly-chart').forEach(chart=>{
    chart.addEventListener('click',e=>{
      const bar=e.target.closest('.hourly-bar');
      if(!bar)return;
      const wasActive=bar.classList.contains('tapped');
      chart.querySelectorAll('.hourly-bar').forEach(b=>b.classList.remove('tapped'));
      if(!wasActive)bar.classList.add('tapped');
    });
  });
}

function renderHourlyForecast(h,d){
  if(!h||!h.time)return'';
  const now=new Date();
  const nowIdx=h.time.findIndex(t=>new Date(t)>=now);
  const startIdx=Math.max(0,nowIdx<0?0:nowIdx);
  const hours=Math.min(72,h.time.length-startIdx);
  if(hours<1)return'<div class="card"><p style="color:var(--text-muted);text-align:center;padding:16px">No hourly data available</p></div>';
  const sunrise=d&&d.sunrise?d.sunrise:[];
  const sunset=d&&d.sunset?d.sunset:[];
  function isNight(t){
    const dt=new Date(t);
    const dayStr=t.slice(0,10);
    for(let i=0;i<(d.time||[]).length;i++){
      if(d.time[i]===dayStr){
        const sr=sunrise[i]?new Date(sunrise[i]):null;
        const ss=sunset[i]?new Date(sunset[i]):null;
        if(sr&&ss)return dt<sr||dt>ss;
      }
    }
    const hr=dt.getHours();return hr<6||hr>20;
  }
  let lastDay='';
  let items='';
  for(let n=0;n<hours;n++){
    const i=startIdx+n;
    const t=h.time[i];
    const dt=new Date(t);
    const dayStr=dt.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});
    if(dayStr!==lastDay){
      lastDay=dayStr;
      const isToday=dt.toDateString()===now.toDateString();
      const isTomorrow=dt.toDateString()===new Date(now.getTime()+86400000).toDateString();
      const label=isToday?'Today':isTomorrow?'Tomorrow':dayStr;
      items+=`<div class="hourly-day-label">${label}</div>`;
    }
    const hrStr=fmtHrLabel(dt);
    const tempC=h.temperature_2m[i];
    const feelsC=h.apparent_temperature?h.apparent_temperature[i]:null;
    const precip=h.precipitation_probability?h.precipitation_probability[i]:0;
    const precipMm=h.precipitation?h.precipitation[i]:0;
    const wCode=h.weather_code?h.weather_code[i]:0;
    const isD=h.is_day?h.is_day[i]===1:!isNight(t);
    const windKmh=h.wind_speed_10m?h.wind_speed_10m[i]:0;
    const gustKmh=h.wind_gusts_10m?h.wind_gusts_10m[i]:0;
    const windDir=h.wind_direction_10m?h.wind_direction_10m[i]:0;
    const humid=h.relative_humidity_2m?h.relative_humidity_2m[i]:null;
    const night=!isD;
    const bgStyle=night?'background:rgba(10,15,40,0.6)':'background:rgba(20,35,60,0.4)';
    const precipBar=precip>0?`<div style="position:absolute;bottom:0;left:0;right:0;height:${Math.min(precip,100)*0.3}px;background:rgba(59,130,246,${Math.min(0.15+precip/200,0.5)});border-radius:0 0 8px 8px"></div>`:'';
    items+=`<div class="hourly-item" style="${bgStyle};position:relative;overflow:hidden">
      ${precipBar}
      <div class="hourly-time">${n===0?tStr('Now'):hrStr}</div>
      <div class="hourly-icon">${animEmoji(wCode,isD,'1.1em')}</div>
      <div class="hourly-temp">${fmtTempShort(tempC)}</div>
      ${feelsC!=null&&Math.abs(feelsC-tempC)>2?`<div class="hourly-feels">${tStr('Feels')} ${fmtTempShort(feelsC)}</div>`:''}
      ${precip>0?`<div class="hourly-precip">💧${precip}%</div>`:''}
      ${precipMm>0?`<div class="hourly-precip-amt">${fmtPrecip(precipMm)}</div>`:''}
      <div class="hourly-wind">${degToDir(windDir)} ${fmtWind(windKmh)}${gustKmh>windKmh*1.3?` G${fmtWind(gustKmh)}`:''}</div>
      ${humid!=null?`<div class="hourly-humid">${humid}%</div>`:''}
    </div>`;
  }
  return`<div class="card"><div class="card-title"><span class="icon">🕐</span> Hourly Forecast — Next 72h</div>
    <div class="hourly-scroll">${items}</div></div>`;
}
function renderDailyForecast(d){
  if(!d||!d.time)return'';
  return`<div class="card"><div class="card-title"><span class="icon">📊</span> ${tStr('7-Day Forecast')}</div>
    <div class="forecast-scroll">${d.time.map((t,i)=>{
      const dt=new Date(t+'T12:00'),day=i===0?tStr('Today'):dt.toLocaleDateString(_curLang||'en',{weekday:'short'});
      const hi=fmtTempShort(d.temperature_2m_max[i]),lo=fmtTempShort(d.temperature_2m_min[i]);
      const rain=d.precipitation_probability_max?d.precipitation_probability_max[i]:0;
      return`<div class="forecast-item" onclick="toggleForecastDetail(${i})" data-fi="${i}"><div class="forecast-time">${day}</div><div class="forecast-icon">${animEmoji(d.weather_code[i],true,'1em')}</div><div class="forecast-temp" style="font-weight:700;color:var(--accent-red);text-shadow:0 0 8px rgba(255,51,85,0.4)">${hi}</div><div style="font-size:0.7em;font-weight:600;color:var(--accent-cyan);text-shadow:0 0 6px rgba(0,229,255,0.3)">${lo}</div>${rain>0?`<div style="font-size:0.55em;color:var(--accent-blue);margin-top:2px">💧${rain}%</div>`:''}</div>`;
    }).join('')}</div><div id="forecast-detail-box"></div></div>`;
}
function toggleForecastDetail(idx){
  const d=S.forecast&&S.forecast.daily;if(!d)return;
  const box=document.getElementById('forecast-detail-box');
  document.querySelectorAll('.forecast-item').forEach(el=>el.classList.remove('selected'));
  if(box.dataset.idx===String(idx)){box.innerHTML='';box.dataset.idx='';return}
  box.dataset.idx=idx;
  const fi=document.querySelector(`.forecast-item[data-fi="${idx}"]`);
  if(fi)fi.classList.add('selected');
  const dt=new Date(d.time[idx]+'T12:00');
  const dayName=idx===0?tStr('Today'):dt.toLocaleDateString(_curLang||'en',{weekday:'long',month:'short',day:'numeric'});
  const hi=fmtTemp(d.temperature_2m_max[idx]),lo=fmtTemp(d.temperature_2m_min[idx]);
  const rain=d.precipitation_probability_max?d.precipitation_probability_max[idx]:0;
  const precip=d.precipitation_sum?d.precipitation_sum[idx]:0;
  const wind=d.wind_speed_10m_max?d.wind_speed_10m_max[idx]:0;
  const sunrise=d.sunrise?fmtClockShort(new Date(d.sunrise[idx])):'—';
  const sunset=d.sunset?fmtClockShort(new Date(d.sunset[idx])):'—';
  const hiC=d.temperature_2m_max[idx],loC=d.temperature_2m_min[idx];
  const tempStr=fmtTemp(hiC)+' / '+fmtTemp(loC);
  const precipStr=fmtPrecip(precip);
  const windStr=fmtWind(wind);
  box.innerHTML=`<div class="forecast-detail">
    <div style="font-weight:700;margin-bottom:6px">${animEmoji(d.weather_code[idx],true,'1.2em')} ${dayName} — ${tStr(wmoDesc(d.weather_code[idx]))}</div>
    <div class="fd-row"><span>🌡️ ${tStr('High / Low')}</span><span style="font-weight:600"><span style="color:var(--accent-red)">${fmtTemp(hiC)}</span> / <span style="color:var(--accent-cyan)">${fmtTemp(loC)}</span></span></div>
    <div class="fd-row"><span>💧 ${tStr('Rain Chance')}</span><span style="font-weight:600">${rain}%</span></div>
    <div class="fd-row"><span>🌧️ ${tStr('Precipitation')}</span><span style="font-weight:600">${precipStr}</span></div>
    <div class="fd-row"><span>💨 ${tStr('Max Wind')}</span><span style="font-weight:600">${windStr}</span></div>
    <div class="fd-row"><span>🌅 ${tStr('Sunrise')}</span><span style="font-weight:600">${sunrise}</span></div>
    <div class="fd-row"><span>🌇 ${tStr('Sunset')}</span><span style="font-weight:600">${sunset}</span></div>
  </div>`;
  if(_curLang!=='en')setTimeout(quickTranslate,100);
}
function renderNWSForecast(periods){
  if(!periods||!periods.length)return'';
  S._nwsPeriods=periods;
  const dayPairs=[];
  for(let i=0;i<periods.length;i++){
    const p=periods[i];
    if(p.isDaytime!==false){
      const night=periods[i+1]&&periods[i+1].isDaytime===false?periods[i+1]:null;
      dayPairs.push({day:p,night,idx:i});
      if(night)i++;
    }else{
      dayPairs.push({day:null,night:p,idx:i});
    }
  }
  return`<div class="card"><div class="card-title"><span class="icon">📊</span> NWS Forecast</div>
    <div class="forecast-scroll">${dayPairs.map((pair,pi)=>{
      const p=pair.day||pair.night;
      const tempF=p.temp;const tempC=p.unit==='F'?(tempF-32)*5/9:tempF;
      const hiStr=fmtTempShort(p.unit==='F'?(tempF-32)*5/9:tempF);
      const loStr=pair.night?fmtTempShort(pair.night.unit==='F'?(pair.night.temp-32)*5/9:pair.night.temp):'';
      const rain=p.precip||0;
      const emojiMap={'Sunny':'☀️','Clear':'🌙','Mostly Sunny':'🌤️','Mostly Clear':'🌤️','Partly Sunny':'⛅','Partly Cloudy':'⛅','Mostly Cloudy':'🌥️','Cloudy':'☁️','Overcast':'☁️',
        'Rain':'🌧️','Showers':'🌦️','Chance Rain':'🌦️','Slight Chance Rain':'🌦️','Thunderstorms':'⛈️','Chance Thunderstorms':'⛈️','Snow':'❄️','Chance Snow':'🌨️','Fog':'🌫️','Haze':'🌫️','Windy':'💨','Hot':'🔥','Cold':'🥶'};
      let em='🌤️';for(const[k,v]of Object.entries(emojiMap)){if(p.short.toLowerCase().includes(k.toLowerCase())){em=v;break}}
      return`<div class="forecast-item" onclick="toggleNWSDetail(${pair.idx})" data-nfi="${pair.idx}"><div class="forecast-time">${p.name.replace(/ Night$/,'').replace(/This /,'')}</div><div class="forecast-icon">${em}</div><div class="forecast-temp" style="font-weight:700;color:var(--accent-red);text-shadow:0 0 8px rgba(255,51,85,0.4)">${hiStr}</div>${loStr?`<div style="font-size:0.7em;font-weight:600;color:var(--accent-cyan);text-shadow:0 0 6px rgba(0,229,255,0.3)">${loStr}</div>`:''}${rain>0?`<div style="font-size:0.55em;color:var(--accent-blue);margin-top:2px">💧${rain}%</div>`:''}</div>`;
    }).join('')}</div><div id="nws-detail-box"></div>
    <div style="text-align:right;font-size:0.55em;color:var(--text-muted);margin-top:4px;padding-right:4px">Source: National Weather Service</div></div>`;
}
function toggleNWSDetail(idx){
  const periods=S._nwsPeriods;if(!periods)return;
  const box=document.getElementById('nws-detail-box');
  document.querySelectorAll('.forecast-item').forEach(el=>el.classList.remove('selected'));
  if(box.dataset.idx===String(idx)){box.innerHTML='';box.dataset.idx='';return}
  box.dataset.idx=idx;
  const fi=document.querySelector(`.forecast-item[data-nfi="${idx}"]`);
  if(fi)fi.classList.add('selected');
  const p=periods[idx];
  const tempC=p.unit==='F'?(p.temp-32)*5/9:p.temp;
  box.innerHTML=`<div class="forecast-detail">
    <div style="font-weight:700;margin-bottom:6px">${p.name} — ${p.short}</div>
    <div class="fd-row"><span>🌡️ Temperature</span><span style="font-weight:600">${fmtTemp(tempC)}</span></div>
    <div class="fd-row"><span>💨 Wind</span><span style="font-weight:600">${p.wind} ${p.windDir}</span></div>
    ${p.precip>0?`<div class="fd-row"><span>💧 Rain Chance</span><span style="font-weight:600">${p.precip}%</span></div>`:''}
    <div style="font-size:0.8em;color:var(--text-secondary);margin-top:8px;line-height:1.4;border-top:1px solid var(--border-subtle);padding-top:8px">${p.detail}</div>
  </div>`;
}

// ==========================================
// RADAR MAP (RainViewer) — full zoom support
// ==========================================
function initRadar(){
  if(!S.lat)return;
  const el=document.getElementById('page-radar');
  el.innerHTML=`
    <div class="card-title"><span class="icon">📡</span> ${tStr('Live Radar')}</div>
    <div class="map-container">
      <div id="radar-map"></div>
      <div class="radar-crosshair">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <line x1="20" y1="0" x2="20" y2="16" stroke="#00e5ff" stroke-width="1.5" opacity="0.7"/>
          <line x1="20" y1="24" x2="20" y2="40" stroke="#00e5ff" stroke-width="1.5" opacity="0.7"/>
          <line x1="0" y1="20" x2="16" y2="20" stroke="#00e5ff" stroke-width="1.5" opacity="0.7"/>
          <line x1="24" y1="20" x2="40" y2="20" stroke="#00e5ff" stroke-width="1.5" opacity="0.7"/>
          <circle cx="20" cy="20" r="3" fill="none" stroke="#00e5ff" stroke-width="1" opacity="0.5"/>
        </svg>
      </div>
      <div class="radar-time-label" id="radar-time">Loading...</div>
      <div class="map-controls map-controls-left">
        <div class="map-ctrl-btn" id="radar-scan" title="Home location">📍</div>
        <div class="map-ctrl-btn" id="radar-scan-view" title="Scan map center">🔍</div>
        <div class="map-ctrl-btn" id="radar-scan-hires" title="HD Scan (15mi zoom 12)" style="font-size:0.75em">🔦</div>
        <div class="map-ctrl-btn" id="radar-toggle-src" title="Toggle radar source" style="font-size:0.55em;font-weight:700;line-height:1">SRC</div>
        <div class="map-ctrl-btn" id="radar-toggle-units" title="Toggle mi/km" style="font-size:0.55em;font-weight:700;line-height:1">MI</div>
        <div class="map-ctrl-btn" id="radar-toggle-airports" title="Toggle airports" style="font-size:0.75em">✈️</div>
        <div class="map-ctrl-btn" id="radar-anim-btn" title="Animate radar" style="font-size:0.75em">▶️</div>
      </div>
      <div class="map-controls map-controls-right">
        <div class="map-ctrl-btn" id="btn-zones" title="Toggle storm zones" style="font-size:0.55em;font-weight:700;line-height:1;color:#cc00ff" onclick="toggleStormZones()">ZN</div>
        <div class="map-ctrl-btn" id="btn-path-arrows" title="Toggle storm path arrows" style="font-size:0.55em;font-weight:700;line-height:1;color:#ffcc00" onclick="togglePathArrows()">➤</div>
        <div class="map-ctrl-btn" id="btn-points" title="Toggle storm points" style="font-size:0.55em;font-weight:700;line-height:1;color:var(--accent-cyan)" onclick="toggleStormPoints()">PT</div>
        <div class="map-ctrl-btn" id="btn-radar-overlay" title="Toggle radar overlay" style="font-size:0.55em;font-weight:700;line-height:1;color:#ff9800" onclick="toggleRadarOverlay()">RDR</div>
        <div class="map-ctrl-btn" id="btn-mping" title="Toggle mPING reports" style="font-size:0.55em;font-weight:700;line-height:1;color:#4fc3f7" onclick="toggleMping()">mP</div>
        <div class="map-ctrl-btn" id="btn-alert-polys" title="Toggle NWS alert polygons" style="font-size:0.55em;font-weight:700;line-height:1;color:#ff4444" onclick="toggleAlertPolygons()">⚠</div>
        <div class="map-ctrl-btn" id="btn-nhc-tracks" title="Toggle hurricane tracks" style="font-size:0.55em;font-weight:700;line-height:1;color:#9333EA;opacity:${S._showNHCTracks?1:0.4}" onclick="toggleNHCTracks(!S._showNHCTracks)">🌀</div>
        <div class="map-ctrl-btn" id="radar-clear-cone" title="Clear track" style="font-size:0.7em;display:none" onclick="clearStormCone()">✕</div>
        <div class="map-ctrl-btn" id="btn-iso-3d" title="3D Storm Terrain" style="font-size:0.55em;font-weight:700;line-height:1;color:#66ffcc" onclick="show3DView()">3D</div>
        <div class="map-ctrl-btn" id="clutter-toggle" title="Clutter hidden (tap to show)" style="font-size:0.7em;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);border-color:#555" onclick="toggleClutter()">🕳️</div>
      </div>
      <div class="radar-anim-bar" id="radar-anim-bar" style="display:none">
        <input type="range" id="radar-anim-slider" min="0" max="0" value="0" style="flex:1">
        <span id="radar-anim-time" style="font-size:0.65em;color:var(--text-secondary);min-width:50px;text-align:right"></span>
      </div>
      <div class="map-legend">
        <span>dBZ</span>
        <div class="legend-bar">
          <span style="background:#00ccff" title="15-25 Light"></span><span style="background:#00ffcc" title="25-30 Light"></span><span style="background:#00ff66" title="30-35 Moderate"></span><span style="background:#aaff00" title="35-40 Moderate"></span>
          <span style="background:#ffee00" title="40-45 Heavy"></span><span style="background:#ff5500" title="45-50 Heavy"></span><span style="background:#ff2200" title="50-55 Intense"></span><span style="background:#ff0033" title="55-60 Severe"></span>
          <span style="background:#ff00ff" title="60+ Extreme"></span>
        </div>
        <span>15 → 60+ dBZ</span>
        <div style="display:flex;gap:6px;margin-left:6px;font-size:0.6em;opacity:0.7">
          <span style="color:#00cc44">🌧Rain</span>
          <span style="color:#66aaff">❄Snow</span>
          <span style="color:#ff77cc">🧊Mix</span>
        </div>
      </div>
      </div>
    </div>
    <div id="scan-status-bar" style="display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;font-size:0.7em;color:var(--text-muted);padding:4px 8px;min-height:20px">
      <span id="scan-dot1" style="display:none"><span class="scan-dot" id="scan-dot1-c">⚫</span> <span id="scan-dot1-t">Winds</span></span>
      <span id="scan-dot2" style="display:none"><span class="scan-dot" id="scan-dot2-c">⚫</span> <span id="scan-dot2-t">Radar</span></span>
      <span id="scan-dot3" style="display:none"><span class="scan-dot" id="scan-dot3-c">⚫</span> <span id="scan-dot3-t">Storms</span></span>
      <span id="scan-refresh-timer" style="font-family:var(--font-mono);color:var(--accent-cyan);font-weight:600"></span>
    </div>
    <div id="radar-source-label" style="font-size:0.7em;color:var(--text-muted);text-align:center"></div>`;
  setTimeout(async()=>{
    S._radarAnimPlaying=false;S._radarAnimPaused=false;
    clearInterval(S._radarAnimTimer);S._radarAnimFrames=[];
    if(S.map){S.map.remove();S.map=null}
    const map=L.map('radar-map',{zoomControl:false,attributionControl:false,maxZoom:11,maxBoundsViscosity:1.0,bounceAtZoomLimits:false,zoomSnap:0.5,zoomDelta:0.5}).setView([S.lat,S.lon],8);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:11}).addTo(map);
    S._rangeCircle=L.circle([S.lat,S.lon],{radius:S.scanRadius*1609.34,color:'#3b82f6',fill:false,weight:1,dashArray:'6 4'}).addTo(map);
    S._userMarker=L.circleMarker([S.lat,S.lon],{radius:5,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:1}).addTo(map);
    S.map=map;
    let _zoomReplot=null,_lastZoom=map.getZoom();
    map.on('zoomend',()=>{
      const z=map.getZoom();
      if(z===_lastZoom||!S.storms.length)return;
      _lastZoom=z;
      clearTimeout(_zoomReplot);
      _zoomReplot=setTimeout(()=>plotStormMarkers(map),250);
    });
    let _mpingMoveTimer=null;
    map.on('moveend',()=>{
      if(!S._mpingVisible)return;
      clearTimeout(_mpingMoveTimer);
      _mpingMoveTimer=setTimeout(()=>{
        S._mpingCache=null;S._mpingCacheTime=0;
        refreshMpingIfVisible();
      },800);
    });
    if(S._mpingPendingRestore){
      S._mpingPendingRestore=false;
      setTimeout(()=>toggleMping(),1500);
    }
    try{
      const rv=await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json());
      S.radarFrames=(rv.radar?.past||[]).concat(rv.radar?.nowcast||[]);
      if(S.radarFrames.length){
        const last=S.radarFrames[S.radarFrames.length-1];
        S._rvTilePath=last.path;
      }
    }catch(e){}
    showRadarLayer(map);
    document.getElementById('radar-scan').addEventListener('click',()=>{goHome()});
    document.getElementById('radar-scan-view').addEventListener('click',()=>{scanHere()});
    document.getElementById('radar-scan-hires').addEventListener('click',()=>{showHdScanDialog()});
    document.getElementById('radar-toggle-src').addEventListener('click',()=>{toggleRadarSource(map)});
    document.getElementById('radar-toggle-airports').addEventListener('click',()=>{toggleAirportMarkers(map)});
    document.getElementById('radar-toggle-units').addEventListener('click',()=>{
      S.radarMetric=!S.radarMetric;
      document.getElementById('radar-toggle-units').textContent=S.radarMetric?'KM':'MI';
      let openIdx=-1;
      S.stormMarkers.forEach((m,i)=>{if(m.getPopup&&m.getPopup()&&m.isPopupOpen())openIdx=i});
      plotStormMarkers(map);
      if(openIdx>=0&&S.stormMarkers[openIdx]&&S.stormMarkers[openIdx].openPopup)S.stormMarkers[openIdx].openPopup();
      if(S.activePage==='storms')renderStorms();
    });
    document.getElementById('radar-anim-btn').addEventListener('click',()=>{toggleRadarAnim(map)});
    document.getElementById('radar-anim-slider').addEventListener('input',(e)=>{
      scrubRadarAnim(map,parseInt(e.target.value));
    });
    const zbtn=document.getElementById('btn-zones');if(zbtn)zbtn.style.opacity=S._showZones?'1':'0.4';
    const pbtn=document.getElementById('btn-points');
    if(pbtn){
      if(S._pointsMode==='inbound'){pbtn.style.opacity='1';pbtn.textContent='12▶';pbtn.style.color='#ffcc00';}
      else if(S._pointsMode==='all'){pbtn.style.opacity='1';pbtn.textContent='PT';pbtn.style.color='var(--accent-cyan)';}
      else{pbtn.style.opacity='0.4';pbtn.textContent='PT';pbtn.style.color='var(--accent-cyan)';}
    }
    const rbtn=document.getElementById('btn-radar-overlay');if(rbtn)rbtn.style.opacity=S._radarOverlayVisible?'1':'0.4';
    const pabtn=document.getElementById('btn-path-arrows');if(pabtn)pabtn.style.opacity=S._showPathArrows?'1':'0.4';
    const mpbtn=document.getElementById('btn-mping');if(mpbtn)mpbtn.style.opacity='0.4';
    if(S.storms.length){
      plotStormMarkers(map);
      buildStormZones(map,S._rawScanPts);
      if(S._rawScanPts.length&&S._pointsMode==='off'){
        S.stormMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
      }
    }
    if(S._showPathArrows)buildPathArrows(map);
    if(S._nextRefreshAt)startScanRefreshTimer();
  },100);
}

function findNearestRadar(lat,lon){
  const sites=[
    {id:'BMX',lat:33.172,lon:-86.770},{id:'EOX',lat:31.460,lon:-85.459},
    {id:'MOB',lat:30.679,lon:-88.240},{id:'EVX',lat:30.565,lon:-85.921},
    {id:'TLH',lat:30.397,lon:-84.329},{id:'JAX',lat:30.485,lon:-81.702},
    {id:'LIX',lat:30.337,lon:-89.825},{id:'SHV',lat:32.451,lon:-93.841},
    {id:'POE',lat:31.156,lon:-92.976},{id:'LCH',lat:30.125,lon:-93.216},
    {id:'HGX',lat:29.472,lon:-95.079},{id:'CRP',lat:27.784,lon:-97.511},
    {id:'EWX',lat:29.704,lon:-98.029},{id:'SJT',lat:31.371,lon:-100.492},
    {id:'MAF',lat:31.943,lon:-102.189},{id:'LBB',lat:33.654,lon:-101.814},
    {id:'AMA',lat:35.233,lon:-101.709},{id:'FDR',lat:34.362,lon:-98.977},
    {id:'TLX',lat:35.333,lon:-97.278},{id:'INX',lat:36.175,lon:-95.564},
    {id:'SGF',lat:37.235,lon:-93.400},{id:'LSX',lat:38.699,lon:-90.683},
    {id:'EAX',lat:38.810,lon:-94.264},{id:'ICT',lat:37.655,lon:-97.443},
    {id:'DDC',lat:37.761,lon:-99.969},{id:'GLD',lat:39.367,lon:-101.700},
    {id:'UEX',lat:40.321,lon:-98.442},{id:'OAX',lat:41.320,lon:-96.367},
    {id:'ABR',lat:45.456,lon:-98.413},{id:'MPX',lat:44.849,lon:-93.565},
    {id:'DMX',lat:41.731,lon:-93.723},{id:'DVN',lat:41.612,lon:-90.581},
    {id:'LOT',lat:41.604,lon:-88.085},{id:'MKX',lat:42.968,lon:-88.551},
    {id:'GRB',lat:44.498,lon:-88.111},{id:'ARX',lat:43.823,lon:-91.191},
    {id:'DLH',lat:46.837,lon:-92.210},{id:'FGF',lat:47.528,lon:-97.093},
    {id:'BIS',lat:46.771,lon:-100.760},{id:'MBX',lat:48.393,lon:-100.865},
    {id:'GGW',lat:48.206,lon:-106.625},{id:'TFX',lat:47.460,lon:-111.385},
    {id:'MSX',lat:47.041,lon:-113.986},{id:'SFX',lat:43.106,lon:-112.686},
    {id:'CBX',lat:43.491,lon:-116.236},{id:'MTX',lat:41.263,lon:-112.448},
    {id:'GJX',lat:39.062,lon:-108.214},{id:'PUX',lat:38.460,lon:-104.181},
    {id:'FTG',lat:39.787,lon:-104.546},{id:'CYS',lat:41.152,lon:-104.806},
    {id:'RIW',lat:43.066,lon:-108.477},{id:'UNR',lat:44.125,lon:-105.100},
    {id:'ABX',lat:35.150,lon:-106.824},{id:'FDX',lat:34.635,lon:-103.630},
    {id:'EPZ',lat:31.873,lon:-106.698},{id:'HDX',lat:33.076,lon:-106.120},
    {id:'PHX',lat:33.422,lon:-112.166},{id:'IWA',lat:33.289,lon:-111.670},
    {id:'EMX',lat:31.894,lon:-110.630},{id:'YUX',lat:32.495,lon:-114.657},
    {id:'FSX',lat:34.574,lon:-111.198},{id:'TWX',lat:38.997,lon:-96.232},
    {id:'FWS',lat:32.573,lon:-97.303},{id:'DFX',lat:29.273,lon:-100.281},
    {id:'GRK',lat:30.722,lon:-97.383},{id:'DYX',lat:32.538,lon:-99.254},
    {id:'ATX',lat:48.195,lon:-122.496},{id:'LGX',lat:47.117,lon:-124.107},
    {id:'OTX',lat:47.681,lon:-117.627},{id:'PDT',lat:45.691,lon:-118.853},
    {id:'RTX',lat:45.715,lon:-122.965},{id:'MAX',lat:42.081,lon:-122.717},
    {id:'RGX',lat:39.754,lon:-119.462},{id:'ESX',lat:35.701,lon:-114.891},
    {id:'VBX',lat:34.836,lon:-120.397},{id:'HNX',lat:36.314,lon:-119.632},
    {id:'DAX',lat:38.501,lon:-121.678},{id:'MUX',lat:37.155,lon:-121.898},
    {id:'SOX',lat:33.818,lon:-117.636},{id:'NKX',lat:32.919,lon:-117.042},
    {id:'VTX',lat:34.412,lon:-119.179},{id:'BRO',lat:25.916,lon:-97.419},
    {id:'DTX',lat:42.700,lon:-83.472},{id:'APX',lat:44.907,lon:-84.720},
    {id:'GRR',lat:42.894,lon:-85.545},{id:'IWX',lat:41.359,lon:-85.700},
    {id:'IND',lat:39.708,lon:-86.280},{id:'VWX',lat:38.260,lon:-87.724},
    {id:'ILX',lat:40.151,lon:-89.337},{id:'CLE',lat:41.413,lon:-81.860},
    {id:'ILN',lat:39.420,lon:-83.822},{id:'JKL',lat:37.591,lon:-83.313},
    {id:'LMK',lat:38.178,lon:-85.791},{id:'HPX',lat:36.737,lon:-87.285},
    {id:'OHX',lat:36.247,lon:-86.563},{id:'MRX',lat:36.169,lon:-83.402},
    {id:'HTX',lat:34.931,lon:-86.084},{id:'GWX',lat:33.897,lon:-88.329},
    {id:'DGX',lat:32.280,lon:-89.984},{id:'JAN',lat:32.318,lon:-90.080},
    {id:'FFC',lat:33.363,lon:-84.566},{id:'GSP',lat:34.883,lon:-82.220},
    {id:'CLX',lat:32.656,lon:-81.042},{id:'CAE',lat:33.949,lon:-81.119},
    {id:'RAX',lat:35.665,lon:-78.490},{id:'MHX',lat:34.776,lon:-76.876},
    {id:'LTX',lat:33.989,lon:-78.429},{id:'AKQ',lat:36.984,lon:-77.007},
    {id:'LWX',lat:38.975,lon:-77.478},{id:'DOX',lat:38.826,lon:-75.440},
    {id:'PHI',lat:39.947,lon:-75.078},{id:'DIX',lat:39.947,lon:-74.411},
    {id:'OKX',lat:40.866,lon:-72.864},{id:'BOX',lat:41.956,lon:-71.137},
    {id:'ENX',lat:42.586,lon:-74.064},{id:'BGM',lat:42.200,lon:-75.985},
    {id:'BUF',lat:42.949,lon:-78.737},{id:'TYX',lat:43.756,lon:-75.680},
    {id:'GYX',lat:43.891,lon:-70.257},{id:'CXX',lat:44.511,lon:-73.166},
    {id:'CBW',lat:46.039,lon:-67.806},{id:'MLB',lat:28.113,lon:-80.654},
    {id:'AMX',lat:25.611,lon:-80.413},{id:'TBW',lat:27.706,lon:-82.402},
    {id:'BYX',lat:24.597,lon:-81.703},{id:'KEY',lat:24.553,lon:-81.781},
    {id:'TAE',lat:30.397,lon:-84.329},{id:'VAX',lat:30.890,lon:-83.002},
    {id:'JGX',lat:32.675,lon:-83.351},{id:'NQA',lat:35.345,lon:-89.873},
    {id:'LZK',lat:34.836,lon:-92.262},{id:'SRX',lat:35.290,lon:-94.362},
    {id:'KJK',lat:30.632,lon:-91.220}
  ];
  let best=sites[0],bestD=Infinity;
  for(const s of sites){const d=Math.hypot(lat-s.lat,lon-s.lon);if(d<bestD){bestD=d;best=s}}
  return best.id;
}
async function buildNexradFrames(lat,lon){
  const useLat=lat||S.lat,useLon=lon||S.lon;
  const site=findNearestRadar(useLat,useLon);
  const end=new Date();
  const start=new Date(end.getTime()-2*60*60*1000);
  const pad2=n=>String(n).padStart(2,'0');
  const fmtDt=d=>d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate())+'T'+pad2(d.getUTCHours())+':'+pad2(d.getUTCMinutes())+':'+pad2(d.getUTCSeconds())+'Z';
  const products=['N0B','N0Q','N0R'];
  for(const prod of products){
    try{
      const apiUrl=`https://mesonet.agron.iastate.edu/json/radar.py?operation=list&radar=${site}&product=${prod}&start=${fmtDt(start)}&end=${fmtDt(end)}`;
      console.log('[NEXRAD-ANIM] site='+site+' prod='+prod+' api='+apiUrl);
      const resp=await fetch(apiUrl);
      const data=await resp.json();
      console.log('[NEXRAD-ANIM] '+prod+' response:',JSON.stringify(data).slice(0,500));
      const scans=data.scans||[];
      if(!scans.length)continue;
      const recent=scans.slice(-25);
      toast(`📡 K${site} — ${recent.length} ${prod} frames loaded`);
      return recent.map(scan=>{
        const dt=new Date(scan.ts);
        const time=Math.floor(dt.getTime()/1000);
        const tileTs=dt.getUTCFullYear()+pad2(dt.getUTCMonth()+1)+pad2(dt.getUTCDate())+pad2(dt.getUTCHours())+pad2(dt.getUTCMinutes());
        const tileUrl=`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${site}-${prod}-${tileTs}/{z}/{x}/{y}.png`;
        return{time,type:'past',site,url:tileUrl};
      });
    }catch(e){console.warn('[NEXRAD-ANIM] '+prod+' failed:',e)}
  }
  toast(`No NEXRAD scans found for K${site}`);
  return[];
}
async function toggleRadarAnim(map){
  if(S._radarAnimPlaying) return stopRadarAnim(map);
  const btn=document.getElementById('radar-anim-btn');
  btn.textContent='⏳';
  let animFrames=[];
  if(S.radarSource==='nexrad'){
    const center=map.getCenter();
    const aLat=center.lat,aLon=center.lng;
    const nearSite=findNearestRadar(aLat,aLon);
    toast(`📡 Nearest radar: K${nearSite} — fetching scans...`);
    animFrames=await buildNexradFrames(aLat,aLon);
    S._radarAnimSrc='nexrad';
    S._radarAnimSite=nearSite;
  }else{
    if(!S.radarFrames.length){toast('No radar frames available');btn.textContent='▶️';return}
    const pastCount=(S.radarFrames||[]).filter(f=>!f.path||!f.path.includes('/nowcast/')).length;
    animFrames=S.radarFrames.map((f,i)=>({
      time:f.time, type:i<pastCount?'past':'forecast',
      url:`https://tilecache.rainviewer.com${f.path}/256/{z}/{x}/{y}/2/1_1.png`
    }));
    S._radarAnimSrc='rainviewer';
  }
  if(!animFrames.length){toast('No radar frames available');btn.textContent='▶️';return}
  S._radarAnimFrames=animFrames;
  S._radarAnimPlaying=true;
  S._radarAnimPaused=true;
  btn.textContent='⏹️';btn.classList.add('active');
  const bar=document.getElementById('radar-anim-bar');
  bar.style.display='flex';
  const slider=document.getElementById('radar-anim-slider');
  slider.min=0;slider.max=animFrames.length-1;
  S._radarAnimIdx=0;
  slider.value=0;
  showRadarAnimFrame(map,0);
  startRadarAnimLoop(map);
}
function startRadarAnimLoop(map){
  clearInterval(S._radarAnimTimer);
  S._radarAnimTimer=setInterval(()=>{
    S._radarAnimIdx++;
    if(S._radarAnimIdx>=S._radarAnimFrames.length) S._radarAnimIdx=0;
    document.getElementById('radar-anim-slider').value=S._radarAnimIdx;
    showRadarAnimFrame(map,S._radarAnimIdx);
  },700);
}
function stopRadarAnim(map){
  S._radarAnimPlaying=false;
  S._radarAnimPaused=false;
  clearInterval(S._radarAnimTimer);
  S._radarAnimFrames=[];
  const btn=document.getElementById('radar-anim-btn');
  if(btn){btn.textContent='▶️';btn.classList.remove('active')}
  const bar=document.getElementById('radar-anim-bar');
  if(bar)bar.style.display='none';
  if(!map)return;
  if(S.radarLayer){map.removeLayer(S.radarLayer);S.radarLayer=null}
  if(S.radarSource==='rainviewer'){
    fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json()).then(rv=>{
      const past=rv.radar?.past||[];const nowcast=rv.radar?.nowcast||[];
      S.radarFrames=past.concat(nowcast);
      showRadarLayer(map);
    }).catch(()=>showRadarLayer(map));
  }else{
    showRadarLayer(map);
  }
}
function scrubRadarAnim(map,idx){
  clearInterval(S._radarAnimTimer);
  S._radarAnimIdx=idx;
  showRadarAnimFrame(map,idx);
  startRadarAnimLoop(map);
}
function showRadarAnimFrame(map,idx){
  const frames=S._radarAnimFrames;
  if(!frames||!frames[idx])return;
  const frame=frames[idx];
  if(S.radarLayer){map.removeLayer(S.radarLayer);S.radarLayer=null}
  const maxNZ=S._radarAnimSrc==='nexrad'?8:7;
  S.radarLayer=L.tileLayer(frame.url,{opacity:0.7,maxZoom:11,maxNativeZoom:maxNZ}).addTo(map);
  if(S._showZones&&S._rawScanPts&&S._rawScanPts.length>0&&!S._radarOverlayVisible&&S._zoneOverlays&&S._zoneOverlays.length>0&&map.hasLayer(S.radarLayer)){try{map.removeLayer(S.radarLayer)}catch(e){}}
  const t=new Date(frame.time*1000);
  const timeStr=fmtClock(t);
  const isFuture=frame.type==='forecast';
  const siteTag=frame.site||S._radarAnimSite||'';
  const srcTag=S._radarAnimSrc==='nexrad'?(siteTag?'K'+siteTag:'NEX'):'RV';
  const label=isFuture?'▸ '+timeStr+' (forecast)':'◂ '+timeStr;
  document.getElementById('radar-time').textContent=srcTag+' '+timeStr;
  document.getElementById('radar-anim-time').textContent=label;
  const slider=document.getElementById('radar-anim-slider');
  const pct=frames.length>1?idx/(frames.length-1):0;
  slider.style.setProperty('--pct',pct);
}

function showRadarLayer(map){
  if(S.radarLayer){map.removeLayer(S.radarLayer);S.radarLayer=null}
  if(S.nexradLayer){map.removeLayer(S.nexradLayer);S.nexradLayer=null}
  const lbl=document.getElementById('radar-source-label');
  const btn=document.getElementById('radar-toggle-src');
  if(S.radarSource==='nexrad'){
    S.radarLayer=L.tileLayer(`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?t=${Date.now()}`,{opacity:0.7,maxZoom:11,maxNativeZoom:8}).addTo(map);
    if(btn){btn.textContent='NEX';btn.style.background='var(--accent-blue)'}
    if(lbl)lbl.textContent='NEXRAD (US) \u00B7 📍 Home \u00B7 🔍 Scan here \u00B7 🔦 HD Scan';
    const t=new Date();
    const el=document.getElementById('radar-time');
    if(el)el.textContent=fmtClock(t);
  }else{
    if(S.radarFrames.length){
      S.radarIdx=S.radarFrames.length-1;
      const frame=S.radarFrames[S.radarIdx];
      S.radarLayer=L.tileLayer(`https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:0.7,maxZoom:11,maxNativeZoom:7}).addTo(map);
      const t=new Date(frame.time*1000);
      const el=document.getElementById('radar-time');
      if(el)el.textContent=fmtClock(t);
    }
    if(btn){btn.textContent='RV';btn.style.background=''}
    if(lbl)lbl.textContent='RainViewer \u00B7 Updated every 10 min \u00B7 📍 Home \u00B7 🔍 Scan here \u00B7 🔦 HD Scan';
  }
  if(S._showZones&&S._rawScanPts&&S._rawScanPts.length>0&&!S._radarOverlayVisible&&S._zoneOverlays&&S._zoneOverlays.length>0&&S.radarLayer&&map.hasLayer(S.radarLayer)){try{map.removeLayer(S.radarLayer)}catch(e){}}
}

function toggleRadarSource(map){
  if(S.radarSource==='nexrad'){
    S.radarSource='rainviewer';
    toast('Switched to RainViewer (global)');
  }else{
    if(!isUSLocation(S.lat,S.lon)){toast('NEXRAD only available for US locations');return}
    S.radarSource='nexrad';
    toast('Switched to NEXRAD (US)');
  }
  clearStormCone();
  clearStormZones();
  S.storms=[];S._rawScanPts=[];
  S.stormMarkers.forEach(m=>map.removeLayer(m));
  S.stormMarkers=[];
  renderStorms();updateStormBadges();
  showRadarLayer(map);
  scanRadarForStorms();
}

function showScanOverlay(skipIfNoMap){
  if(skipIfNoMap&&!S.map)return;
  for(let i=1;i<=3;i++){
    const d=document.getElementById('scan-dot'+i);if(d)d.style.display='inline';
    const c=document.getElementById('scan-dot'+i+'-c');if(c)c.textContent='🔴';
  }
  const t1=document.getElementById('scan-dot1-t');if(t1)t1.textContent='Winds';
  const t2=document.getElementById('scan-dot2-t');if(t2)t2.textContent='Radar';
  const t3=document.getElementById('scan-dot3-t');if(t3)t3.textContent='Storms';
  const dc=document.getElementById('scan-dot1-c');if(dc)dc.textContent='🟡';
}
function scanStep(step,text){
  const prev=document.getElementById('scan-dot'+(step-1)+'-c');
  if(prev)prev.textContent='🟢';
  const cur=document.getElementById('scan-dot'+step+'-c');
  if(cur)cur.textContent='🟡';
  const txt=document.getElementById('scan-dot'+step+'-t');
  if(txt&&text)txt.textContent=text;
}
function hideScanOverlay(){
  const c3=document.getElementById('scan-dot3-c');if(c3)c3.textContent='🟢';
  if(!S.travelMode)scheduleAutoRefresh();
}
function startScanRefreshTimer(){
  if(S._scanRefreshTimer)clearInterval(S._scanRefreshTimer);
  S._lastScanTime=Date.now();
  let nextRefreshMs;
  if(S.travelMode){
    nextRefreshMs=(S.gpsInterval||300)*1000;
  }else{
    const mins=getAutoRefreshMin();
    nextRefreshMs=mins>0?mins*60*1000:0;
  }
  S._nextRefreshAt=nextRefreshMs>0?S._lastScanTime+nextRefreshMs:0;
  const el=document.getElementById('scan-refresh-timer');if(!el)return;
  if(!S._nextRefreshAt){el.textContent='🔄 Off';return;}
  function tick(){
    const remain=Math.max(0,Math.round((S._nextRefreshAt-Date.now())/1000));
    if(remain>=3600){
      const h=Math.floor(remain/3600),m=Math.floor((remain%3600)/60);
      el.textContent='🔄 '+h+'h'+String(m).padStart(2,'0')+'m';
    }else if(remain>=60){
      const m=Math.floor(remain/60),s=remain%60;
      el.textContent='🔄 '+m+':'+String(s).padStart(2,'0');
    }else{
      el.textContent='🔄 '+remain+'s';
    }
    if(remain<=0){el.textContent='🔄 now';clearInterval(S._scanRefreshTimer);}
  }
  tick();
  S._scanRefreshTimer=setInterval(tick,1000);
}

S._airportMarkers=[];
S._airportsVisible=false;
S._airportDataCache=null;
S._airportPlotId=0;

async function toggleAirportMarkers(map){
  const btn=document.getElementById('radar-toggle-airports');
  if(S._airportsVisible){
    clearAirportMarkers(map);
    btn.style.background='';
    btn.style.borderColor='';
    return;
  }
  btn.style.background='rgba(0,229,255,0.2)';
  btn.style.borderColor='var(--accent-cyan)';
  S._airportsVisible=true;
  if(S._airportDataCache&&S._airportDataCache.length){
    plotAirportMarkers(map,S._airportDataCache);
    return;
  }
  toast('Loading airports...');
  try{
    let stations=[];
    let nwsOk=false;
    try{
      const r=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{...NWS_HDR,signal:AbortSignal.timeout(5000)});
      if(r.ok){
        const pt=await r.json();
        const stUrl=pt.properties?.observationStations;
        if(stUrl){
          const sr=await fetch(stUrl,{...NWS_HDR,signal:AbortSignal.timeout(5000)});
          if(sr.ok){
            const sd=await sr.json();
            const features=sd.features||[];
            if(features.length){
              stations=features.slice(0,15).map(f=>({icao:f.properties.stationIdentifier,name:f.properties.name||'',lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],dist:haversine(S.lat,S.lon,f.geometry.coordinates[1],f.geometry.coordinates[0])}));
              nwsOk=true;
              console.log('Map airports: NWS found',stations.length);
            }
          }
        }
      }
    }catch(e){console.log('Map airports: NWS error:',e.message)}
    if(!stations.length){
      const radii=[1.5,3.0,5.0];
      for(const deg of radii){
        try{
          const r2=await fetch(`https://aviationweather.gov/api/data/stationinfo?bbox=${(S.lat-deg).toFixed(2)},${(S.lon-deg).toFixed(2)},${(S.lat+deg).toFixed(2)},${(S.lon+deg).toFixed(2)}&format=json`,{signal:AbortSignal.timeout(8000)});
          if(r2.ok){
            const body=await r2.json();
            if(Array.isArray(body)){
              const mc=body.filter(s=>s.siteType&&(Array.isArray(s.siteType)?s.siteType.includes('METAR'):String(s.siteType).includes('METAR')));
              if(mc.length){
                stations=mc.map(s=>({icao:s.icaoId,name:s.site||s.icaoId,lat:s.lat,lon:s.lon,dist:haversine(S.lat,S.lon,s.lat,s.lon)})).sort((a,b)=>a.dist-b.dist).slice(0,15);
                console.log('Map airports: AWC stationinfo found',stations.length,'in ±'+deg+'°');
                break;
              }
            }
          }
        }catch(e){console.log('Map airports: AWC error ±'+deg+'°:',e.message)}
      }
    }
    if(!stations.length){
      const airports=await _loadGlobalAirports();
      stations=_nearestAirports(S.lat,S.lon,airports,200,15);
      if(stations.length)console.log('Map airports: global DB found',stations.length);
    }
    if(stations.length){
      S._airportDataCache=stations;
      plotAirportMarkers(map,stations,nwsOk);
    }else{
      toast('No airports found nearby');
      S._airportsVisible=false;
      btn.style.background='';btn.style.borderColor='';
    }
  }catch(e){
    console.error('Airport fetch:',e);
    toast('Could not load airports');
    S._airportsVisible=false;
    btn.style.background='';btn.style.borderColor='';
  }
}

async function plotAirportMarkers(map,stations,useNWS){
  clearAirportMarkers(map);
  S._airportsVisible=true;
  const plotId=++S._airportPlotId;
  toast('✈️ Loading airports...');
  let results;
  if(useNWS){
    results=await Promise.allSettled(stations.map(async st=>{
      const or=await fetch(`https://api.weather.gov/stations/${st.icao}/observations/latest`,NWS_HDR);
      if(!or.ok)return null;
      const od=await or.json();const p=od.properties||{};
      return{st,tc:p.temperature?.value,wKmh:p.windSpeed?.value,wDir:p.windDirection?.value,
        visMi:p.visibility?.value!=null?(p.visibility.value/1609.34):null,
        clouds:(p.cloudLayers||[]).map(l=>({amount:l.amount,base:l.base}))};
    }));
  }else{
    const ids=stations.map(s=>s.icao).join(',');
    let metars=[];
    try{
      const mr=await fetch(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&hours=3`,{signal:AbortSignal.timeout(10000)});
      if(mr.ok)metars=await mr.json();
    }catch(e){console.log('Map airports AWC metar batch error:',e.message)}
    const metarMap=new Map();
    if(Array.isArray(metars))metars.forEach(m=>{if(m.icaoId&&!metarMap.has(m.icaoId))metarMap.set(m.icaoId,m)});
    results=stations.map(st=>{
      const m=metarMap.get(st.icao);
      if(m){
        const wKts=m.wspd!=null?m.wspd:null;
        const wKmh=wKts!=null?wKts*1.852:null;
        const gKts=m.wgst!=null?m.wgst:null;
        const visMi=m.visib!=null?m.visib:null;
        const clouds=(m.clouds||[]).map(c=>({amount:c.cover,base:c.base!=null?{value:c.base/0.3048}:null}));
        return{status:'fulfilled',value:{st,tc:m.temp!=null?m.temp:null,wKmh,wDir:m.wdir,visMi,clouds}};
      }
      return{status:'fulfilled',value:{st,tc:null,wKmh:null,wDir:null,visMi:null,clouds:[]}};
    });
  }
  if(S._airportPlotId!==plotId)return;
  const valid=results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);
  for(const d of valid){
    const{st,tc,wKmh,wDir,visMi,clouds}=d;
    const fltCat=getFltCat(visMi,{clouds:clouds||[]});
    const fltColor=fltCat==='VFR'?'#22c55e':fltCat==='MVFR'?'#3b82f6':fltCat==='IFR'?'#ef4444':'#d946ef';
    const icon=L.divIcon({
      className:'',
      html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">
        <div style="background:${fltColor};color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.6)">${st.icao}</div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${fltColor}"></div>
      </div>`,
      iconSize:[50,26],iconAnchor:[25,26]
    });
    const tempStr=tc!=null?fmtTemp(tc):'--';
    const windStr=wKmh!=null?(fmtWind(wKmh)+' '+(wDir!=null?degToDir(wDir):'VRB')):'Calm';
    const visStr=visMi!=null?fmtVis(visMi):'--';
    const skyStr=formatClouds({clouds:clouds||[]});
    const popup=L.popup({className:'storm-popup',maxWidth:220,closeButton:true}).setContent(`
      <div style="font-size:0.8em;line-height:1.5">
        <div style="font-weight:700;color:${fltColor};margin-bottom:4px">✈️ ${st.icao} — ${st.name}</div>
        <div style="display:inline-block;background:${fltColor};color:#fff;padding:0 6px;border-radius:3px;font-size:0.85em;font-weight:600;margin-bottom:4px">${fltCat}</div>
        <span style="color:var(--text-muted);font-size:0.85em;margin-left:4px">${st.dist.toFixed(1)} mi</span>
        <div>🌡️ ${tempStr}</div>
        <div>💨 ${windStr}</div>
        <div>👁️ Vis: ${visStr}</div>
        <div>☁️ ${skyStr}</div>
        <div style="margin-top:4px;text-align:center">
          <button onclick="switchPage('station');switchStation('${st.icao}')" style="padding:3px 10px;background:rgba(0,229,255,0.15);color:var(--accent-cyan);border:1px solid var(--accent-cyan);border-radius:5px;font-size:0.85em;cursor:pointer;font-weight:600">Open in Station Tab</button>
        </div>
      </div>
    `);
    const marker=L.marker([st.lat,st.lon],{icon,zIndexOffset:500}).addTo(map).bindPopup(popup);
    S._airportMarkers.push(marker);
  }
  toast(`✈️ ${valid.length} airports loaded`);
}

function clearAirportMarkers(map){
  const m=map||S.map;
  S._airportPlotId++;
  S._airportMarkers.forEach(mk=>{try{if(m)m.removeLayer(mk)}catch(e){}});
  S._airportMarkers=[];
  S._airportsVisible=false;
}

function clearViewScanCircle(){
  if(S._viewScanCircle&&S.map){S.map.removeLayer(S._viewScanCircle);S._viewScanCircle=null}
  if(S._viewScanCenter&&S.map){S.map.removeLayer(S._viewScanCenter);S._viewScanCenter=null}
  if(S._viewScanLabel){S._viewScanLabel.remove();S._viewScanLabel=null}
}
function showViewScanCircle(map,lat,lng,radiusMi,count){
  clearViewScanCircle();
  S._viewScanCircle=L.circle([lat,lng],{radius:radiusMi*1609.34,color:'#00e5ff',fill:false,weight:1.5,dashArray:'8 4'}).addTo(map);
  S._viewScanCenter=L.circleMarker([lat,lng],{radius:4,color:'#00e5ff',fillColor:'#00e5ff',fillOpacity:0.9,weight:1}).addTo(map);
  let label=document.getElementById('view-scan-label');
  if(!label){
    label=document.createElement('div');
    label.id='view-scan-label';
    label.style.cssText='position:absolute;bottom:12px;left:10px;z-index:500;background:rgba(17,24,39,0.92);backdrop-filter:blur(10px);border-radius:6px;padding:4px 10px;font-size:0.65em;color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.2)';
    document.querySelector('.map-container')?.appendChild(label);
  }
  const rLabel=radiusMi>=10?Math.round(radiusMi):radiusMi.toFixed(1);
  label.textContent=`⭕ ${rLabel} mi radius · ${count.toLocaleString()} points`;
  S._viewScanLabel=label;
}

async function scanRadarForView(){
  if(S._radarAnimPlaying)stopRadarAnim(S.map);
  if(!S.map)return;
  const center=S.map.getCenter();
  const cLat=center.lat,cLng=center.lng;
  const useNexrad=S.radarSource==='nexrad';
  const radius=S.scanRadius;
  showScanOverlay();
  await fetchWindsAloft(cLat,cLng);
  scanStep(2,'Scanning radar tiles...');
  try{
    const zoom=useNexrad?8:7;
    const radiusDeg=radius/69.0;
    const northLat=cLat+radiusDeg,southLat=cLat-radiusDeg;
    const eastLon=cLng+radiusDeg/Math.cos(cLat*Math.PI/180);
    const westLon=cLng-radiusDeg/Math.cos(cLat*Math.PI/180);
    const minTX=lonToTileX(westLon,zoom),maxTX=lonToTileX(eastLon,zoom);
    const minTY=latToTileY(northLat,zoom),maxTY=latToTileY(southLat,zoom);

    if(!useNexrad){
      try{
        const rv=await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json());
        const past=rv.radar?.past||[];
        const nowcast=rv.radar?.nowcast||[];
        const allFrames=past.concat(nowcast);
        S.radarFrames=allFrames;
        S._rvTilePath=allFrames.length?allFrames[allFrames.length-1].path:null;
      }catch(e){S._rvTilePath=null}
      if(!S._rvTilePath){hideScanOverlay();toast('No radar data');return}
    }

    const colorFn=useNexrad?nexradToDbz:rvToDbz;
    const minDbz=15;
    const tilePromises=[];
    const savedLat=S.lat,savedLon=S.lon;
    S.lat=cLat;S.lon=cLng;
    for(let tx=minTX;tx<=maxTX;tx++){
      for(let ty=minTY;ty<=maxTY;ty++){
        const url=useNexrad
          ?`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tx}/${ty}.png`
          :`https://tilecache.rainviewer.com${S._rvTilePath}/256/${zoom}/${tx}/${ty}/2/1_1.png`;
        tilePromises.push(scanTileForPoints(url,tx,ty,zoom,colorFn,minDbz,radius));
      }
    }
    const tileResults=await Promise.all(tilePromises);
    const rawPoints=tileResults.flat();
    S.lat=savedLat;S.lon=savedLon;

    S._rawScanPts=rawPoints;
    S.storms=spacingFilter(rawPoints).sort((a,b)=>a.distance-b.distance);
    S.scanTime=Date.now();S.lastScanMs=Date.now();S._lastScanWasHiRes=false;
    recordScanSnapshot();
    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Plotting ${S.storms.length.toLocaleString()} storm points...`);
    await new Promise(r=>setTimeout(r,300));
    renderStorms();updateStormBadges();drawMiniSonar();
    if(typeof ISO!=='undefined'&&ISO.open){ISO._grid=buildTerrainGrid();ISO._dirty=true;}
    if(S.map){
      plotStormMarkers(S.map);
      if(rawPoints.length>0){autoActivateZones()}
      else{clearStormZones();if(S.radarLayer&&!S.map.hasLayer(S.radarLayer))try{S.radarLayer.addTo(S.map)}catch(e){}}
      showViewScanCircle(S.map,cLat,cLng,radius,S.storms.length);
    }
    updateThreatTicker();
    hideScanOverlay();
    toast(`${S.storms.length.toLocaleString()} cells in ${radius} mi radius (${srcLabel})`);
    scheduleAutoScan();
    setTimeout(checkStormCellAlerts,600);
  }catch(e){hideScanOverlay();toast('View scan failed: '+e.message);console.error('ViewScan error:',e)}
}

async function scanRadarHiRes(map,fromHome){
  if(S._radarAnimPlaying){stopRadarAnim(map);}
  if(!map)return;
  if(!S._etaRescanInProgress)S._stormETAs={};
  const center=fromHome?{lat:S.lat,lng:S.lon}:map.getCenter();
  const cLat=center.lat,cLng=center.lng;
  const useNexrad=S.radarSource==='nexrad';
  const HIRES_RADIUS=15;
  const hiZoom=useNexrad?10:7;
  showScanOverlay();
  await fetchWindsAloft(cLat,cLng);
  scanStep(2,'Hi-Res scanning (step=1)...');
  try{
    const radiusDeg=HIRES_RADIUS/69.0;
    const northLat=cLat+radiusDeg,southLat=cLat-radiusDeg;
    const eastLon=cLng+radiusDeg/Math.cos(cLat*Math.PI/180);
    const westLon=cLng-radiusDeg/Math.cos(cLat*Math.PI/180);
    const minTX=lonToTileX(westLon,hiZoom),maxTX=lonToTileX(eastLon,hiZoom);
    const minTY=latToTileY(northLat,hiZoom),maxTY=latToTileY(southLat,hiZoom);

    if(!useNexrad){
      try{
        const rv=await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json());
        const past=rv.radar?.past||[];
        const nowcast=rv.radar?.nowcast||[];
        const allFrames=past.concat(nowcast);
        S.radarFrames=allFrames;
        S._rvTilePath=allFrames.length?allFrames[allFrames.length-1].path:null;
      }catch(e){S._rvTilePath=null}
      if(!S._rvTilePath){hideScanOverlay();toast('No radar data');return}
    }

    const colorFn=useNexrad?nexradToDbz:rvToDbz;
    const minDbz=10;
    const tilePromises=[];
    const savedLat=S.lat,savedLon=S.lon;
    S.lat=cLat;S.lon=cLng;
    for(let tx=minTX;tx<=maxTX;tx++){
      for(let ty=minTY;ty<=maxTY;ty++){
        const url=useNexrad
          ?`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${hiZoom}/${tx}/${ty}.png`
          :`https://tilecache.rainviewer.com${S._rvTilePath}/256/${hiZoom}/${tx}/${ty}/2/1_1.png`;
        tilePromises.push(scanTileForPoints(url,tx,ty,hiZoom,colorFn,minDbz,HIRES_RADIUS,1));
      }
    }
    const tileResults=await Promise.all(tilePromises);
    const rawPoints=tileResults.flat();
    S.lat=savedLat;S.lon=savedLon;

    S._rawScanPts=rawPoints;
    S.storms=spacingFilter(rawPoints,true).sort((a,b)=>a.distance-b.distance);
    S.scanTime=Date.now();S.lastScanMs=Date.now();S._lastScanWasHiRes=true;
    _sonarZoomMi=15;localStorage.setItem('st_sonarZoom',15);S._sonarTotalSwept=0;S._sonarSweepAngle=0;_syncSonarZoomBtns();
    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Hi-Res: ${S.storms.length.toLocaleString()} points in ${HIRES_RADIUS} mi`);
    await new Promise(r=>setTimeout(r,300));
    renderStorms();updateStormBadges();drawMiniSonar();
    if(typeof ISO!=='undefined'&&ISO.open){ISO._grid=buildTerrainGrid();ISO._dirty=true;}
    plotStormMarkers(map);
    if(rawPoints.length>0){autoActivateZones()}
    else{clearStormZones();if(S.radarLayer&&S.map&&!S.map.hasLayer(S.radarLayer))try{S.radarLayer.addTo(S.map)}catch(e){}}
    showViewScanCircle(map,cLat,cLng,HIRES_RADIUS,S.storms.length);
    if(S.map&&S._showPathArrows)setTimeout(()=>buildPathArrows(S.map),150);
    map.setView([cLat,cLng],11,{animate:true,duration:0.5});
    updateThreatTicker();
    hideScanOverlay();
    toast(`Hi-Res: ${S.storms.length.toLocaleString()} cells in ${HIRES_RADIUS} mi (${srcLabel})`);
    scheduleAutoScan();
    setTimeout(checkStormCellAlerts,600);
  }catch(e){hideScanOverlay();toast('Hi-Res scan failed: '+e.message);console.error('HiRes error:',e)}
}

function stormArrowSvg(deg,color,size){
  return`<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="transform:rotate(${deg}deg)">
    <polygon points="20,4 30,30 20,24 10,30" fill="${color}" fill-opacity="0.85" stroke="${color}" stroke-width="1.5"/>
  </svg>`;
}

function destPoint(lat,lon,bearing,distMi){
  const R=3958.8;const d=distMi/R;
  const br=bearing*Math.PI/180;
  const lat1=lat*Math.PI/180,lon1=lon*Math.PI/180;
  const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(br));
  const lon2=lon1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));
  return[lat2*180/Math.PI,lon2*180/Math.PI];
}
function showStormCone(map,storm){
  const sk=stormKey(storm);
  if(S._activeConeKey===sk){clearStormCone();return}
  clearStormCone();
  const mv=S.stormMovement;
  if(!mv||mv.speed<2)return;
  const range=Math.min(60,Math.max(storm.distance*1.5,20));
  const color=dbzHex(storm.dbz);
  const baseWidthMi=Math.max(0,Math.min(3,(storm.dbz-20)/15));
  const dir=mv.direction;
  const perpL=(dir-90+360)%360;
  const perpR=(dir+90)%360;
  let pts;
  if(baseWidthMi>0.1){
    const bL=destPoint(storm.lat,storm.lng,perpL,baseWidthMi);
    const bR=destPoint(storm.lat,storm.lng,perpR,baseWidthMi);
    const fL=destPoint(bL[0],bL[1],dir-15,range);
    const fC=destPoint(storm.lat,storm.lng,dir,range);
    const fR=destPoint(bR[0],bR[1],dir+15,range);
    pts=[bL,fL,fC,fR,bR];
  }else{
    const fL=destPoint(storm.lat,storm.lng,dir-15,range);
    const fC=destPoint(storm.lat,storm.lng,dir,range);
    const fR=destPoint(storm.lat,storm.lng,dir+15,range);
    pts=[[storm.lat,storm.lng],fL,fC,fR,[storm.lat,storm.lng]];
  }
  S._activeCone=L.polygon(pts,{color,fillColor:color,fillOpacity:0.1,weight:1.5,dashArray:'6,4',interactive:false}).addTo(map);
  S._activeConeKey=sk;
  S.stormMarkers.forEach(m=>{
    if(m._stormTrackKey&&m._stormTrackKey!==sk){
      if(m._map||m._container)try{map.removeLayer(m)}catch(e){}
      m._trackHidden=true;
    }
  });
  const btn=document.getElementById('radar-clear-cone');
  if(btn)btn.style.display='flex';
}
function clearStormCone(){
  if(S._activeCone&&S.map){S.map.removeLayer(S._activeCone);S._activeCone=null}
  S._activeConeKey=null;
  if(S.map){
    S.stormMarkers.forEach(m=>{
      if(m._stormTrackKey&&m._trackHidden){
        try{m.addTo(S.map)}catch(e){}
        m._trackHidden=false;
      }
    });
  }
  const btn=document.getElementById('radar-clear-cone');
  if(btn)btn.style.display='none';
}
function isClutterOnly(){
  if(!S.storms||!S.storms.length)return false;
  const sig=S.storms.filter(s=>s.dbz>=31);
  if(sig.length>0)return false;
  const low=S.storms.filter(s=>s.dbz<22);
  if(low.length===S.storms.length&&S.storms.length<=12)return true;
  return S.storms.length<=8;
}
function getVisibleStormList(){
  if(!S.storms||!S.storms.length)return[];
  if(isClutterOnly()&&!S.showClutter)return[];
  return S.storms;
}
function toggleClutter(){
  S.showClutter=!S.showClutter;
  const btn=document.getElementById('clutter-toggle');
  if(btn){
    btn.style.background=S.showClutter?'rgba(250,204,21,0.3)':'rgba(0,0,0,0.5)';
    btn.style.borderColor=S.showClutter?'#facc15':'#555';
    btn.title=S.showClutter?'Showing clutter (tap to hide)':'Clutter hidden (tap to show)';
  }
  if(S.map){
    S.stormMarkers.forEach(m=>S.map.removeLayer(m));S.stormMarkers=[];
  }
  renderStormMarkers();
  if(S.activePage==='storms')renderStorms();
  updateStormBadges();
  drawMiniSonar();
  if(typeof ISO!=='undefined'&&ISO.open){ISO._grid=buildTerrainGrid();ISO._dirty=true;}
}
function updateClutterButton(){
  const btn=document.getElementById('clutter-toggle');
  if(!btn)return;
  const clutter=isClutterOnly();
  btn.style.display=clutter?'flex':'none';
  if(clutter){
    btn.style.background=S.showClutter?'rgba(250,204,21,0.3)':'rgba(0,0,0,0.5)';
    btn.style.borderColor=S.showClutter?'#facc15':'#555';
    btn.title=S.showClutter?'Showing clutter (tap to hide)':'Clutter hidden (tap to show)';
  }
}
function zoomScale(map){
  const z=map.getZoom();
  return z>=10?1.4:z>=9?1.2:z>=8?1.0:z>=7?0.7:z>=6?0.45:z>=5?0.3:0.2;
}

function plotStormMarkers(map){
  S.stormMarkers.forEach(m=>map.removeLayer(m));S.stormMarkers=[];
  clearStormCone();
  updateClutterButton();
  const stormList=getVisibleStormList();
  if(!stormList.length)return;
  const mv=S.stormMovement;
  const sc=zoomScale(map);
  const pending=[];
  let visibleStorms=stormList;
  if(S._pointsMode==='inbound'){
    const inbound=[];
    for(const st of stormList){
      const eta=calcStormETA(st);
      if(eta&&eta.approaching&&eta.eta)inbound.push({storm:st,eta});
    }
    inbound.sort((a,b)=>a.storm.dbz===b.storm.dbz?(a.eta.eta-b.eta.eta):(b.storm.dbz-a.storm.dbz));
    visibleStorms=inbound.slice(0,12).map(i=>i.storm);
  }
  const visibleSet=new Set(visibleStorms);
  stormList.forEach(storm=>{
    const cat=stormCat(storm.dbz);
    const color=dbzHex(storm.dbz);
    const r=Math.max(4,Math.round(Math.max(10,storm.dbz/4)*sc));
    const eta=calcStormETA(storm);
    const popupId='pop_'+Math.random().toString(36).slice(2,8);
    let mvHtml='';
    if(mv&&mv.speed>=2){
      const spdStr=S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph';
      const imp=impactLabel(eta?eta.impact:0);
      mvHtml=`<div style="font-size:0.75em;color:#8cf;margin-top:6px;padding-top:6px;border-top:1px solid #333">→ ${degToDir(mv.direction)} (${Math.round(mv.direction)}°) ${tStr('at')} ${spdStr}</div>`;
      if(eta&&eta.proximity){
        mvHtml+=`<div style="font-size:0.75em;color:#f97316;margin-top:2px;font-weight:700">⚠️ ${tStr('Overhead · Moving away')}</div>`;
        mvHtml+=`<div style="font-size:0.85em;font-weight:700;color:${imp.color};margin-top:2px">${eta.impact}% ${tStr(imp.text)}</div>`;
      }else if(eta&&eta.approaching&&eta.impact>0){
        const sk=stormKey(storm);
        let targetMs;
        if(S._stormETAs[sk]&&S._stormETAs[sk]>Date.now()){
          targetMs=S._stormETAs[sk];
        }else{
          const elapsedMin=S.scanTime?(Date.now()-S.scanTime)/60000:0;
          const remainMin=Math.max(0,eta.eta-elapsedMin);
          targetMs=Date.now()+remainMin*60000;
          S._stormETAs[sk]=targetMs;
        }
        const remainSec=Math.max(0,Math.round((targetMs-Date.now())/1000));
        const remainMin=(targetMs-Date.now())/60000;
        const arrTime=fmtArrivalTime(remainMin);
        mvHtml+=`<div style="margin-top:4px;padding:4px 8px;background:rgba(0,0,0,0.3);border-radius:6px;border:1px solid ${imp.color}44">
          <div style="font-size:0.7em;color:#aaa">⏱ ${tStr('Countdown')}</div>
          <div style="font-size:1.1em;font-weight:700;color:${imp.color};font-family:monospace" class="popup-countdown" data-target="${Math.round(targetMs)}">${fmtCountdown(remainSec)}</div>
          <div style="font-size:0.7em;color:#bbb;margin-top:2px">${tStr('Arrives')} ~${arrTime}</div>
        </div>`;
        mvHtml+=`<div style="font-size:0.85em;font-weight:700;color:${imp.color};margin-top:4px">${eta.impact}% ${tStr(imp.text)}</div>`;
      }else{
        mvHtml+=`<div style="font-size:0.7em;color:#6b7;margin-top:2px">${tStr('Nearby · Not approaching')}</div>`;
      }
    }
    const hookInfo=storm._hookEcho?`<div style="font-size:0.8em;font-weight:700;color:#ff1744;margin-top:4px;padding:3px 8px;background:rgba(255,23,68,0.15);border:1px solid rgba(255,23,68,0.3);border-radius:6px;animation:tornado-pulse 1.8s ease-in-out infinite">🌪️ Possible Rotation (Hook Echo)</div>`:'';
    const popupHtml=`<div style="text-align:center;font-family:system-ui;min-width:155px">
      <div style="font-size:1.3em;font-weight:700;color:${color}">${storm.dbz} dBZ</div>
      <div style="font-size:0.8em;margin:2px 0">${tStr(cat.label)}</div>
      <div style="font-size:0.7em;color:#aaa">${cat.rain||''}</div>
      ${hookInfo}
      <div style="font-size:0.8em;color:#ccc;margin-top:4px">${fmtStormDist(storm.distance)} ${degToDir(storm.bearing)}</div>
      ${mvHtml}
      <div style="font-size:0.65em;color:#777;margin-top:6px">${storm.lat.toFixed(3)}°, ${Math.abs(storm.lng).toFixed(3)}° · ${storm.pixels} returns</div>
    </div>`;
    const popupOpts={closeButton:true,className:'storm-popup'};
    const stormRef=storm;
    if(mv&&mv.speed>=2){
      const sz=Math.max(10,Math.round(Math.max(24,storm.dbz/2)*sc));
      const svgHtml=stormArrowSvg(mv.direction,color,sz);
      pending.push({type:'arrow',lat:storm.lat,lng:storm.lng,sz,svgHtml,popupHtml,popupOpts,stormRef});
    }else{
      pending.push({type:'circle',lat:storm.lat,lng:storm.lng,r,color,popupHtml,popupOpts,stormRef});
    }
    if(eta&&eta.impact>=90){
      const ringSize=Math.max(36,storm.dbz/1.5);
      pending.push({type:'ring',lat:storm.lat,lng:storm.lng,ringSize,color});
    }
    if(storm.dbz>=40){
      pending.push({type:'lightning',lat:storm.lat,lng:storm.lng});
    }
    if(storm._hookEcho){
      pending.push({type:'tornado',lat:storm.lat,lng:storm.lng,stormRef:storm});
    }
    
  });
  const offscreen=document.createElement('div');
  offscreen.style.cssText='position:absolute;left:-9999px;top:-9999px;visibility:hidden';
  document.body.appendChild(offscreen);
  const arrowItems=pending.filter(p=>p.type==='arrow');
  arrowItems.forEach(p=>{
    const el=document.createElement('div');
    el.innerHTML=p.svgHtml;
    offscreen.appendChild(el);
  });
  requestAnimationFrame(()=>{requestAnimationFrame(()=>{
    document.body.removeChild(offscreen);
    const mode=S._pointsMode;
    pending.forEach(p=>{
      const isVisible=(mode==='all')||(mode==='inbound'&&visibleSet.has(p.stormRef));
      if(p.type==='arrow'){
        const arrow=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'storm-arrow-icon',html:p.svgHtml,iconSize:[p.sz,p.sz],iconAnchor:[p.sz/2,p.sz/2]})});
        if(isVisible)arrow.addTo(map);
        arrow.bindPopup(p.popupHtml,p.popupOpts);
        arrow.on('click',()=>showStormCone(map,p.stormRef));
        arrow._stormRef=p.stormRef;
        S.stormMarkers.push(arrow);
      }else if(p.type==='circle'){
        const marker=L.circleMarker([p.lat,p.lng],{radius:p.r,color:p.color,fillColor:p.color,fillOpacity:0.6,weight:2});
        if(isVisible)marker.addTo(map);
        marker.bindPopup(p.popupHtml,p.popupOpts);
        marker.on('click',()=>showStormCone(map,p.stormRef));
        marker._stormRef=p.stormRef;
        S.stormMarkers.push(marker);
      }else if(p.type==='ring'){
        const ring=L.marker([p.lat,p.lng],{interactive:false,icon:L.divIcon({className:'',html:`<div class="storm-ring" style="width:${p.ringSize}px;height:${p.ringSize}px;border:3px solid ${p.color};box-shadow:0 0 8px ${p.color}"></div>`,iconSize:[p.ringSize,p.ringSize],iconAnchor:[p.ringSize/2,p.ringSize/2]})});
        if(isVisible)ring.addTo(map);
        ring._stormRef=p.stormRef;
        S.stormMarkers.push(ring);
      }else if(p.type==='lightning'){
        const lightning=L.marker([p.lat,p.lng],{interactive:false,icon:L.divIcon({className:'storm-lightning-icon',html:`<div style="font-size:18px;text-shadow:0 0 6px #fff">⚡</div>`,iconSize:[20,20],iconAnchor:[10,10]})});
        if(isVisible)lightning.addTo(map);
        lightning._stormRef=p.stormRef;
        S.stormMarkers.push(lightning);
      }else if(p.type==='tornado'){
        const torIcon=L.marker([p.lat,p.lng],{interactive:false,icon:L.divIcon({className:'',html:`<div style="font-size:22px;text-shadow:0 0 10px #ff1744,0 0 20px #ff1744;animation:tornado-pulse 1.8s ease-in-out infinite;pointer-events:none">🌪️</div>`,iconSize:[26,26],iconAnchor:[13,-8]})});
        if(isVisible)torIcon.addTo(map);
        torIcon._stormRef=p.stormRef;
        S.stormMarkers.push(torIcon);
      }
    });
  })});
}

S._stormZoneLayers=[];
S._rawScanPts=[];
S._showZones=true;
S._showPathArrows=true;
S._pathArrowStyle='chevron';
S._pathArrowLayers=[];
S._pathArrowAnimInterval=null;
S._pathArrowsDirty=false;
const DBZ_BINS=DBZ_SCALE.filter(e=>e.min>=15);
S._radarGridLayers=[];
function clearRadarGrid(){
  S._radarGridLayers.forEach(l=>{try{S.map.removeLayer(l)}catch(e){}});
  S._radarGridLayers=[];
}
function gridNeonColor(){
  return'#00ccff';
}
function hexToRgba(hex,a){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return`rgba(${r},${g},${b},${a})`;
}
function drawRadarGrid(map,maxRadiusMi){
  clearRadarGrid();
  if(!map||!S._showZones)return;
  const gridPane='radar-grid-pane';
  if(!map.getPane(gridPane)){
    map.createPane(gridPane);
    map.getPane(gridPane).style.zIndex=340;
    map.getPane(gridPane).style.pointerEvents='none';
  }
  const gc=gridNeonColor();
  const distStep=ZONE_DIST_STEP_MI;
  const nRings=Math.ceil(maxRadiusMi/distStep);
  const innerRing=L.circle([S.lat,S.lon],{
    radius:0.5*1609.34,color:hexToRgba(gc,0.2),
    fillOpacity:0,fill:false,weight:0.3,pane:gridPane,interactive:false
  }).addTo(map);
  S._radarGridLayers.push(innerRing);
  for(let r=1;r<=nRings;r++){
    const radiusMi=r*distStep;
    const isMajor=(radiusMi%10===0);
    const isOuter=(r===nRings);
    const circle=L.circle([S.lat,S.lon],{
      radius:radiusMi*1609.34,
      color:isOuter?gc:hexToRgba(gc,0.25),
      fillOpacity:0,fill:false,
      weight:isOuter?1.5:isMajor?0.8:0.3,
      dashArray:isOuter?'8 4':null,
      pane:gridPane,interactive:false
    }).addTo(map);
    S._radarGridLayers.push(circle);
  }
  const cardDirs=[0,90,180,270];
  for(const a of cardDirs){
    const inner=destPt(S.lat,S.lon,0.5,a);
    const outer=destPt(S.lat,S.lon,maxRadiusMi,a);
    const line=L.polyline([inner,outer],{
      color:hexToRgba(gc,0.2),weight:0.5,
      pane:gridPane,interactive:false
    }).addTo(map);
    S._radarGridLayers.push(line);
  }
  const cardinals=[{a:0,l:'N'},{a:90,l:'E'},{a:180,l:'S'},{a:270,l:'W'}];
  for(const c of cardinals){
    const pt=destPt(S.lat,S.lon,maxRadiusMi+3,c.a);
    const marker=L.marker(pt,{
      icon:L.divIcon({
        className:'',
        html:`<div style="color:${hexToRgba(gc,0.5)};font-size:10px;font-weight:700;text-align:center;text-shadow:0 0 3px #000">${c.l}</div>`,
        iconSize:[16,16],iconAnchor:[8,8]
      }),
      pane:gridPane,interactive:false
    }).addTo(map);
    S._radarGridLayers.push(marker);
  }
}
function clearStormZones(){
  if(S._gridEtaInterval){clearInterval(S._gridEtaInterval);S._gridEtaInterval=null;}
  if(S._approachArrowInterval){clearInterval(S._approachArrowInterval);S._approachArrowInterval=null;}
  S._gridEtaTimers=[];
  S._stormZoneLayers.forEach(l=>{try{S.map.removeLayer(l)}catch(e){}});
  S._stormZoneLayers=[];
  clearRadarGrid();
}
const ZONE_ANG_STEP=3;
const ZONE_DIST_STEP_MI=5;
function destPt(lat1,lng1,distMi,bearDeg){
  const R=3958.8;
  const d=distMi/R;
  const b=bearDeg*Math.PI/180;
  const la=lat1*Math.PI/180,lo=lng1*Math.PI/180;
  const la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(b));
  const lo2=lo+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2));
  return[la2*180/Math.PI,lo2*180/Math.PI];
}
function polarGridBin(rawPts,cLat,cLng,maxRadiusMi){
  const angStep=ZONE_ANG_STEP;
  const distStep=ZONE_DIST_STEP_MI;
  const nAng=Math.ceil(360/angStep);
  const nDist=Math.ceil(maxRadiusMi/distStep);
  const cells=new Map();
  for(const p of rawPts){
    const dist=haversine(cLat,cLng,p.lat,p.lng);
    const bear=(bearingDeg(cLat,cLng,p.lat,p.lng)+360)%360;
    const ri=Math.floor(dist/distStep);
    const ai=Math.floor(bear/angStep)%nAng;
    if(ri>=nDist)continue;
    const key=ai+','+ri;
    if(cells.has(key)){
      const c=cells.get(key);
      if(p.dbz>c.maxDbz)c.maxDbz=p.dbz;
      c.sumDbz+=p.dbz;
      c.count++;
    }else{
      cells.set(key,{ai,ri,maxDbz:p.dbz,sumDbz:p.dbz,count:1});
    }
  }
  return cells;
}
function wedgePoly(cLat,cLng,ri,ai){
  const distStep=ZONE_DIST_STEP_MI;
  const angStep=ZONE_ANG_STEP;
  const r1=ri*distStep;
  const r2=(ri+1)*distStep;
  const a1=ai*angStep;
  const a2=(ai+1)*angStep;
  const arcSteps=Math.max(2,Math.ceil((a2-a1)/1));
  const pts=[];
  for(let i=0;i<=arcSteps;i++){
    const a=a1+i*(a2-a1)/arcSteps;
    pts.push(destPt(cLat,cLng,r2,a));
  }
  for(let i=arcSteps;i>=0;i--){
    const a=a1+i*(a2-a1)/arcSteps;
    pts.push(destPt(cLat,cLng,r1,a));
  }
  pts.push(pts[0]);
  return pts;
}
function dbzColor(dbz){return _dbzEntry(dbz)}
function gridArrowSvg(deg,color,size){
  return`<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="transform:rotate(${deg}deg)">
    <polygon points="20,6 28,28 20,22 12,28" fill="${color}" fill-opacity="0.9" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
  </svg>`;
}
function buildStormZones(map,rawPts){
  clearStormZones();
  S._arrowCells=[];
  const maxR=S._lastScanWasHiRes?15:S.scanRadius||80;
  if(!map||!rawPts||!rawPts.length||!S._showZones){
    if(map&&S.radarLayer&&!map.hasLayer(S.radarLayer)){S.radarLayer.addTo(map)}
    return;
  }
  drawRadarGrid(map,maxR);
  if(!S._radarOverlayVisible&&S.radarLayer&&map.hasLayer(S.radarLayer)){try{map.removeLayer(S.radarLayer)}catch(e){}}
  const t0=performance.now();
  const cells=polarGridBin(rawPts,S.lat,S.lon,maxR);
  const paneName='zone-pane';
  if(!map.getPane(paneName)){
    map.createPane(paneName);
    map.getPane(paneName).style.zIndex=355;
  }
  const arrowPane='zone-arrow-pane';
  if(!map.getPane(arrowPane)){
    map.createPane(arrowPane);
    map.getPane(arrowPane).style.zIndex=360;
  }
  const mv=S.stormMovement;
  let approachCount=0;
  let approachSumLat=0,approachSumLon=0,approachSumDbz=0,approachMaxDbz=0,approachMinDbz=999;
  const approachBearings=[];
  let approachMaxDist=0;
  if(S._gridEtaInterval){clearInterval(S._gridEtaInterval);S._gridEtaInterval=null;}
  if(S._approachArrowInterval){clearInterval(S._approachArrowInterval);S._approachArrowInterval=null;}
  S._gridEtaTimers=[];
  const sortedCells=[...cells.values()].sort((a,b)=>a.maxDbz-b.maxDbz);
  const rowS='display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:0.78em;';
  const lblS='color:#8899aa;white-space:nowrap;margin-right:6px;';
  const valS='color:#e0e0e0;font-weight:500;text-align:right;';
  for(const cell of sortedCells){
    const bin=dbzColor(cell.maxDbz);
    const verts=wedgePoly(S.lat,S.lon,cell.ri,cell.ai);
    const avgDbz=Math.round(cell.sumDbz/cell.count);
    const maxDbz=Math.round(cell.maxDbz);
    const cat=stormCat(maxDbz);
    const distInner=cell.ri*ZONE_DIST_STEP_MI;
    const distOuter=(cell.ri+1)*ZONE_DIST_STEP_MI;
    const bearStart=cell.ai*ZONE_ANG_STEP;
    const bearEnd=(cell.ai+1)*ZONE_ANG_STEP;
    const midBear=(bearStart+bearEnd)/2;
    const midDist=(distInner+distOuter)/2;
    let isApproaching=false;
    let etaSec=null;
    let arrivalStr='--:--';
    let mvDir='--';
    let mvBear='--';
    let mvSpd='--';
    let statusHtml='';
    const cellId='gc'+cell.ri+'_'+cell.ai;
    let impactPct=0;
    let impactTier='none';
    if(mv&&mv.speed>=2){
      const bearToUser=(midBear+180)%360;
      const diff=Math.abs(((mv.direction-bearToUser+180)%360)-180);
      const closing=mv.speed*Math.cos(Math.min(diff,60)*Math.PI/180);
      const baseWidthMi=Math.max(0,Math.min(3,(maxDbz-20)/15));
      const widthAngle=midDist>0.5?Math.atan2(baseWidthMi,midDist)*180/Math.PI:15;
      const coneHalf=15+widthAngle;
      mvDir=degToDir(mv.direction);
      mvBear=mv.direction+'°';
      mvSpd=S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph';
      if(diff<=coneHalf*0.6&&closing>1){impactTier='high';impactPct=80+Math.round(((coneHalf*0.6)-diff)/(coneHalf*0.6)*20);}
      else if(diff<=coneHalf&&closing>0.5){impactTier='medium';impactPct=31+Math.round((coneHalf-diff)/(coneHalf*0.4)*49);}
      else if(diff<=coneHalf+10){impactTier='low';impactPct=Math.max(5,Math.round((coneHalf+10-diff)/10*30));}
      isApproaching=(impactTier==='high'||impactTier==='medium');
      if(isApproaching&&midDist>1){
        etaSec=Math.round(midDist/Math.max(closing,0.5)*3600);
        const now=new Date();
        const arrival=new Date(now.getTime()+etaSec*1000);
        arrivalStr=fmtClockShort(arrival);
        approachCount++;
        const cellPt=destPt(S.lat,S.lon,midDist,midBear);
        approachSumLat+=cellPt[0]*maxDbz;
        approachSumLon+=cellPt[1]*maxDbz;
        approachSumDbz+=maxDbz;
        if(maxDbz>approachMaxDbz)approachMaxDbz=maxDbz;
        if(maxDbz<approachMinDbz)approachMinDbz=maxDbz;
        approachBearings.push(midBear);
        if(midDist>approachMaxDist)approachMaxDist=midDist;
        S._gridEtaTimers.push({id:cellId,etaSec,startTime:Date.now()});
      }
      const tierColors={high:'#eab308',medium:'#06b6d4',low:'#ec4899',none:'#22c55e'};
      const tierLabels={high:'🟡 High ('+impactPct+'%)',medium:'🔵 Medium ('+impactPct+'%)',low:'🟣 Low ('+impactPct+'%)',none:'✓ Not in path'};
      const tc=tierColors[impactTier]||'#22c55e';
      if(midDist<=1){
        statusHtml=`<div style="text-align:center;margin-top:4px;padding:3px 6px;background:rgba(239,68,68,0.15);border-radius:4px;color:#ef4444;font-size:0.8em;font-weight:600">🚨 OVERHEAD</div>`;
      }else{
        statusHtml=`<div style="text-align:center;margin-top:4px;padding:3px 6px;background:${tc}18;border:1px solid ${tc}44;border-radius:4px;color:${tc};font-size:0.78em;font-weight:600">${tierLabels[impactTier]}</div>`;
      }
    }else{
      statusHtml=`<div style="text-align:center;margin-top:4px;color:#666;font-size:0.75em">No movement data</div>`;
    }
    const fmtGridEta=(sec)=>{if(!sec||sec<=0)return'NOW';const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h>0?h+'h:'+String(m).padStart(2,'0')+'m:'+String(s).padStart(2,'0')+'s':m+'m:'+String(s).padStart(2,'0')+'s';};
    const fmtEtaInit=etaSec?fmtGridEta(etaSec):'--m:--s';
    const distUnit=S.radarMetric?'km':'mi';
    const distVal=S.radarMetric?(midDist*1.60934).toFixed(1):midDist.toFixed(1);
    const popup=`<div style="font-family:system-ui;min-width:175px;padding:2px">
      <div style="text-align:center;margin-bottom:5px">
        <span style="font-size:1.2em;font-weight:700;color:${bin.color}">${cat.label}</span>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">
        <div style="${rowS}"><span style="${lblS}">☔ Intensity:</span><span style="${valS}color:${bin.color}">${cat.label} @ ${maxDbz} dBZ max</span></div>
        <div style="${rowS}"><span style="${lblS}">📊 Avg:</span><span style="${valS}">${avgDbz} dBZ · ${cat.rain}</span></div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:3px;padding-top:4px">
        <div style="${rowS}"><span style="${lblS}">⛈️ Movement:</span><span style="${valS}">${mvDir} (${mvBear}) @ ${mvSpd}</span></div>
        <div style="${rowS}"><span style="${lblS}">⏱️ ETA:</span><span style="${valS}" id="eta-${cellId}">${fmtEtaInit}</span><span style="${lblS}margin-left:8px;">Arrival:</span><span style="${valS}white-space:nowrap;">${arrivalStr}</span></div>
      </div>
      <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:3px;padding-top:4px">
        <div style="${rowS}"><span style="${lblS}">📍 Location:</span><span style="${valS}">${distVal} ${distUnit} ${degToDir(midBear)} (${Math.round(midBear)}°) of you</span></div>
      </div>
      ${statusHtml}
      <div style="text-align:center;font-size:0.6em;color:#555;margin-top:4px">📡 ${cell.count} return${cell.count>1?'s':''} · ${distInner}-${distOuter} mi · ${bearStart}°-${bearEnd}°</div>
    </div>`;
    const borderWeight=isApproaching?1.5:0.5;
    const poly=L.polygon(verts,{
      color:bin.color,fillColor:bin.color,
      fillOpacity:bin.opacity,weight:borderWeight,opacity:isApproaching?0.9:0.5,pane:paneName
    }).addTo(map);
    poly.bindPopup(popup,{closeButton:true,className:'storm-popup',maxWidth:280});
    S._stormZoneLayers.push(poly);
    if(isApproaching){
      poly.on('add',function(){const e=this.getElement&&this.getElement();if(e)e.classList.add('grid-pulse');});
      const el=poly.getElement&&poly.getElement();
      if(el)el.classList.add('grid-pulse');
    }
    if(mv&&mv.speed>=2){
      if(!S._arrowCells)S._arrowCells=[];
      S._arrowCells.push({ri:cell.ri,ai:cell.ai,midDist,midBear,maxDbz,binIdx:bin.idx,color:bin.color,dir:mv.direction,speed:mv.speed});
    }
  }
  if(S._arrowCells)S._arrowCells=[];
  S._approachData={count:approachCount,maxDbz:approachMaxDbz,minDbz:approachMinDbz,maxDist:approachMaxDist,bearings:approachBearings,sumDbz:approachSumDbz};
  if(S.map&&S._showPathArrows)buildPathArrows(S.map);
  if(S._gridEtaTimers.length>0){
    const fmtGE=(sec)=>{if(!sec||sec<=0)return'NOW';const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h>0?h+'h:'+String(m).padStart(2,'0')+'m:'+String(s).padStart(2,'0')+'s':m+'m:'+String(s).padStart(2,'0')+'s';};
    S._gridEtaInterval=setInterval(()=>{
      const now=Date.now();
      for(const t of S._gridEtaTimers){
        const elapsed=Math.floor((now-t.startTime)/1000);
        const remain=Math.max(0,t.etaSec-elapsed);
        const el=document.getElementById('eta-'+t.id);
        if(el)el.textContent=fmtGE(remain);
        if(remain<=0&&el)el.style.color='#ef4444';
      }
    },1000);
  }
  const ms=Math.round(performance.now()-t0);
  console.log(`Polar grid: ${rawPts.length} pts → ${cells.size} cells (${ZONE_ANG_STEP}°×${ZONE_DIST_STEP_MI}mi) in ${ms}ms`);
}
function _tickerWeatherPool(){
  const pool=[];
  const w=S.weather;
  const fc=S.forecast;
  const stormCount=S.storms?S.storms.length:0;
  if(stormCount===0){
    pool.push('✅ No storms detected nearby. Clear skies and smooth sailing! 🌤️');
    pool.push('✅ All clear! No storm activity in your area. Perfect time to enjoy the weather. ☀️');
    pool.push('✅ Radar is clean! No precipitation detected in your scan area. Relax and enjoy. 😎');
    pool.push('✅ No storms detected! Let\'s keep it that way... unless you\'re looking for something to track. 📊');
  }
  if(w){
    const tc=w.temperature_2m;const fc2=w.apparent_temperature;
    if(tc!=null){
      const desc=wmoDesc(w.weather_code||0);
      pool.push(`🌡️ Currently ${fmtTemp(tc)} — ${desc}${S.locName?' in '+S.locName:''}.`);
      if(fc2!=null&&Math.abs(tc-fc2)>=2)pool.push(`🌡️ Temperature ${fmtTemp(tc)} but feels like ${fmtTemp(fc2)}${Math.abs(tc-fc2)>=5?' — dress accordingly!':'. Not bad out there.'}`);
      if(tc>35)pool.push('🔥 It\'s scorching hot out there! Stay hydrated and avoid prolonged sun exposure. 💦');
      else if(tc>30)pool.push('☀️ Warm and sunny! Great beach weather but don\'t forget sunscreen. 🧴');
      else if(tc>20)pool.push('😊 Pleasant temperatures right now. Perfect weather for outdoor activities! 🌿');
      else if(tc>10)pool.push('🧥 A bit cool out. You might want a light jacket if heading outdoors.');
      else if(tc>0)pool.push('🥶 It\'s quite cold outside. Bundle up and stay warm! 🧣');
      else pool.push('❄️ Below freezing! Watch for ice on roads and walkways. Stay safe! 🧊');
    }
    const wSpd=w.wind_speed_10m;const wDir=w.wind_direction_10m;const wGust=w.wind_gusts_10m;
    if(wSpd!=null){
      const dir=wDir!=null?degToDir(wDir):'';
      if(wSpd<5)pool.push(`🍃 Winds are calm right now${dir?' from the '+dir:''}. Peaceful conditions. 😌`);
      else if(wSpd<20)pool.push(`💨 ${dir?'Winds from the '+dir+' at ':'Winds at '}${fmtWind(wSpd)}${wGust>wSpd+10?', gusting to '+fmtWind(wGust):''}. Comfortable breeze.`);
      else if(wSpd<40)pool.push(`💨 Breezy! ${dir?'Winds '+dir+' at ':'Winds at '}${fmtWind(wSpd)}${wGust?' with gusts to '+fmtWind(wGust):''}. Hold onto your hat! 🎩`);
      else pool.push(`🌬️ Strong winds! ${dir?dir+' at ':''}${fmtWind(wSpd)}${wGust?' gusting '+fmtWind(wGust):''}. Use caution outdoors. ⚠️`);
    }
    const rh=w.relative_humidity_2m;
    if(rh!=null){
      if(rh>85)pool.push(`💧 Humidity is high at ${rh}% — the air feels thick. Stay cool and hydrated. 💦`);
      else if(rh>60)pool.push(`💧 Humidity at ${rh}%. Moderate moisture in the air — fairly comfortable conditions.`);
      else if(rh>30)pool.push(`💧 Humidity at ${rh}%. Nice and comfortable out there. Enjoy! 🌟`);
      else pool.push(`💧 Very dry air — humidity only ${rh}%. Stay hydrated and moisturize. 🏜️`);
    }
    const pres=w.pressure_msl;
    if(pres!=null){
      pool.push(`📊 Barometric pressure ${fmtPres(pres)}${pres>1020?' — high pressure, typically fair weather.':pres<1005?' — low pressure system in the area. Watch for changes.':'. Steady atmospheric conditions.'}`);
    }
    if(S._nwsVisM!=null){
      const visMi=S._nwsVisM/1609.34;
      if(visMi>=10)pool.push(`👁️ Visibility excellent at ${fmtVis(visMi)} — crystal clear conditions all around. 🔭`);
      else if(visMi>=5)pool.push(`👁️ Visibility is good at ${fmtVis(visMi)}. Clear enough for safe travel. 🚗`);
      else pool.push(`🌫️ Reduced visibility at ${fmtVis(visMi)}. Use caution while driving. 🚦`);
    }
    const cc=w.cloud_cover;
    if(cc!=null){
      if(cc<=10)pool.push('☀️ Virtually cloudless skies right now. Pure sunshine! 🌞');
      else if(cc<=30)pool.push(`⛅ Mostly clear with ${cc}% cloud cover. Enjoy the sunshine breaking through! 🌤️`);
      else if(cc<=70)pool.push(`🌥️ Partly cloudy — ${cc}% cloud cover. A nice mix of sun and clouds.`);
      else pool.push(`☁️ Overcast skies — ${cc}% cloud cover. The clouds are putting on a show today.`);
    }
  }
  if(fc&&fc.daily){
    const d=fc.daily;
    if(d.sunrise&&d.sunrise[0]){
      const sr=new Date(d.sunrise[0]);const ss=new Date(d.sunset[0]);
      const now=new Date();
      const srStr=fmtClockShort(sr);
      const ssStr=fmtClockShort(ss);
      if(now<sr)pool.push(`🌅 Sunrise at ${srStr} · Sunset at ${ssStr}. Dawn is coming! 🌄`);
      else if(now<ss){
        const minsLeft=Math.round((ss-now)/60000);
        const hrsLeft=Math.floor(minsLeft/60);const mLeft=minsLeft%60;
        pool.push(`🌇 Sunset at ${ssStr} — ${hrsLeft>0?hrsLeft+'h '+mLeft+'m':mLeft+' minutes'} of daylight remaining. ☀️`);
      }else pool.push(`🌙 Sun has set. Sunrise tomorrow at ${srStr}. Enjoy the night! ✨`);
    }
    if(d.temperature_2m_max&&d.temperature_2m_max[0]!=null){
      pool.push(`📈 Today's forecast: High ${fmtTemp(d.temperature_2m_max[0])} / Low ${fmtTemp(d.temperature_2m_min[0])}${d.precipitation_probability_max&&d.precipitation_probability_max[0]>0?' · '+d.precipitation_probability_max[0]+'% rain chance 🌧️':' · No rain expected 🌞'}`);
    }
    if(d.temperature_2m_max&&d.temperature_2m_max[1]!=null){
      const tmrwDay=new Date();tmrwDay.setDate(tmrwDay.getDate()+1);
      const dayName=tmrwDay.toLocaleDateString(_curLang||'en',{weekday:'long'});
      pool.push(`📅 Tomorrow (${dayName}): High ${fmtTemp(d.temperature_2m_max[1])} / Low ${fmtTemp(d.temperature_2m_min[1])}${d.precipitation_probability_max&&d.precipitation_probability_max[1]>20?' · '+d.precipitation_probability_max[1]+'% rain chance':''}`);
    }
  }
  if(S.scanTime){
    const ago=Math.round((Date.now()-S.scanTime)/60000);
    const src=S.radarSource==='nexrad'?'NEXRAD':'RainViewer';
    const rad=S.radarMetric?Math.round(S.scanRadius*1.60934)+' km':S.scanRadius+' mi';
    pool.push(`📡 ${src} radar scan · ${rad} radius · Last update ${ago<1?'just now':ago+' min ago'}. Monitoring conditions. 🛰️`);
  }
  if(S.station){
    const st=S.station;
    if(st.fltCat){
      pool.push(`✈️ ${S.stationId||'Nearest station'} reporting ${st.fltCat}${st.fltCat==='VFR'?' — clear for flight ops!':st.fltCat==='MVFR'?' — marginal visual conditions':' — instrument conditions in effect'}`);
    }
    if(st.rawOb)pool.push(`📋 Latest METAR: ${escHtml(st.rawOb.substring(0,80))}${st.rawOb.length>80?'...':''}`);
  }
  if(S.alerts&&S.alerts.length){
    for(const a of S.alerts.slice(0,3)){
      pool.push(`⚠️ NWS: ${escHtml(a.event||a.headline||'Weather Alert')} in effect${a.severity?' — Severity: '+escHtml(a.severity):''}`);
    }
  }
  pool.push('✅ StormTracker is actively monitoring your area. We\'ll alert you the moment conditions change. 🛡️');
  pool.push('✅ All quiet on the weather front. Sit back and relax — we\'re watching the skies for you. 🌌');
  pool.push('✅ No significant weather activity right now. Great conditions for whatever you have planned today! 🎯');
  pool.push('📚 Did you know? dBZ measures radar reflectivity: 20-30 = light rain, 30-45 = moderate, 45-55 = heavy, 55+ = severe/hail. 🌧️');
  pool.push('📚 NEXRAD is a network of 160 Doppler radar stations across the US, scanning the atmosphere every 4-10 minutes. 📡');
  pool.push('📚 Lightning heats the air to 30,000°C — 5x hotter than the sun\'s surface! That explosive expansion creates thunder. ⚡');
  pool.push('📚 The dew point is the temperature at which moisture condenses. Above 65°F (18°C) it feels muggy; above 75°F (24°C) is oppressive. 💧');
  pool.push('📚 A wall cloud is a lowering beneath a thunderstorm\'s base — if it rotates, it can produce a tornado. Stay alert during severe weather! 🌪️');
  pool.push('📚 The Eye of a hurricane is calm and clear, but surrounded by the most violent winds. Never assume the storm is over! 🌀');
  pool.push('📚 Radar returns can bounce off buildings, mountains, and even bugs — that\'s why low dBZ returns are often false positives. 🏔️');
  pool.push('📚 The 30-30 rule: if lightning-to-thunder is 30 seconds or less, go indoors. Wait 30 minutes after the last thunder before going back out. ⚡');
  pool.push('📚 VFR means Visual Flight Rules — pilots can fly by sight. IFR (Instrument Flight Rules) means relying on cockpit instruments due to poor visibility. ✈️');
  pool.push('📚 Virga is precipitation that evaporates before reaching the ground. It shows up on radar but you won\'t feel a drop! 🌫️');
  return pool;
}
function _tickerNearbyPool(sigStormCount){
  const pool=[];
  pool.push(`🔔 ${sigStormCount} storm ☔️ area${sigStormCount>1?'s':''} detected, but currently not on track to your location. Keep an eye 👁️ out and monitor conditions.`);
  pool.push(`🔔 ${sigStormCount} precipitation cell${sigStormCount>1?'s':''} in your area — none currently heading your way. Stay aware, weather can shift quickly. 🌦️`);
  pool.push(`🔔 Tracking ${sigStormCount} storm cell${sigStormCount>1?'s':''} nearby. None approaching at this time, but keep monitoring. 🌩️`);
  const w=S.weather;
  if(w){
    const tc=w.temperature_2m;
    if(tc!=null)pool.push(`🔔 ${sigStormCount} cell${sigStormCount>1?'s':''} detected nearby · Currently ${fmtTemp(tc)} and ${wmoDesc(w.weather_code||0)}. Storms not approaching. 📊`);
    const wSpd=w.wind_speed_10m;
    if(wSpd!=null&&wSpd>5)pool.push(`🔔 ${sigStormCount} cell${sigStormCount>1?'s':''} in area · Winds ${degToDir(w.wind_direction_10m||0)} at ${fmtWind(wSpd)}. Storms holding position or drifting away. 💨`);
  }
  if(S.scanTime){
    const ago=Math.round((Date.now()-S.scanTime)/60000);
    pool.push(`🔔 ${sigStormCount} storm${sigStormCount>1?'s':''} on radar · Last scan ${ago<1?'just now':ago+' min ago'}. None approaching — continuing to monitor. 📡`);
  }
  pool.push(`🔔 Storm activity nearby but no threats heading your way. Weather changes fast — we\'ll alert you if anything shifts. 👀`);
  pool.push(`🔔 Radar shows ${sigStormCount} cell${sigStormCount>1?'s':''} in range. All moving away or stationary. Keeping watch for you. 🛰️`);
  if(S.alerts&&S.alerts.length){
    for(const a of S.alerts.slice(0,3)){
      pool.push(`⚠️ NWS: ${escHtml(a.event||a.headline||'Weather Alert')} in effect${a.severity?' — Severity: '+escHtml(a.severity):''} · ${sigStormCount} cell${sigStormCount>1?'s':''} nearby but not approaching.`);
    }
  }
  return pool;
}
function updateThreatTicker(){
  const bar=document.getElementById('threat-ticker');
  const inner=document.getElementById('threat-ticker-inner');
  if(!bar||!inner)return;
  const mv=S.stormMovement;
  const stormCount=S.storms?S.storms.length:0;
  function showTicker(html,color,borderColor,bg,dur){
    inner.innerHTML=html;
    const textLen=inner.textContent?inner.textContent.length:60;
    const autoDur=Math.max(18,Math.round(textLen*0.322));
    inner.style.animationDuration=(dur||autoDur)+'s';
    bar.style.display='block';
    bar.style.borderColor=borderColor;
    bar.style.background=bg;
  }
  const alertMinDbz=31;
  const sigStormCount=S.storms?S.storms.filter(s=>s.dbz>=alertMinDbz).length:0;
  let gridZoneCount=0,gridZoneMaxDbz=0;
  if(S._rawScanPts&&S._rawScanPts.length&&S.lat!=null){
    const gzCells=polarGridBin(S._rawScanPts,S.lat,S.lon,S.scanRadius||80);
    gridZoneCount=gzCells.size;
    for(const[,c]of gzCells){if(c.maxDbz>gridZoneMaxDbz)gridZoneMaxDbz=c.maxDbz}
  }
  if(sigStormCount===0){
    const pool=_tickerWeatherPool();
    if(stormCount>0){
      const maxClutter=Math.max(...S.storms.map(s=>s.dbz));
      pool.unshift(`✅ ${stormCount} minor radar return${stormCount>1?'s':''} detected (max ${maxClutter} dBZ) — likely ground clutter, not real precipitation. All clear! 🌤️`);
      pool.unshift(`✅ Light radar reflectivity picked up (${stormCount} return${stormCount>1?'s':''}, peak ${maxClutter} dBZ). Nothing significant — enjoy your day! ☀️`);
      pool.unshift(`✅ Minor clutter on radar — ${stormCount} point${stormCount>1?'s':''} below 31 dBZ. No meaningful weather activity. 😎`);
    }else if(gridZoneCount>0){
      pool.unshift(`✅ ${gridZoneCount} radar grid zone${gridZoneCount>1?'s':''} showing faint returns (peak ${gridZoneMaxDbz} dBZ) — likely ground clutter or atmospheric noise. No real storms. 🌤️`);
      pool.unshift(`✅ Minor radar reflectivity in ${gridZoneCount} grid sector${gridZoneCount>1?'s':''} (max ${gridZoneMaxDbz} dBZ). Below storm threshold — probably clutter. 😎`);
      pool.unshift(`✅ Grid scan picked up ${gridZoneCount} faint zone${gridZoneCount>1?'s':''} (${gridZoneMaxDbz} dBZ peak). Not significant weather activity. ☀️`);
    }
    const msg=pool[Math.floor(Date.now()/60000)%pool.length];
    showTicker(`<span style="color:#4ade80">${msg}</span>`,'#4ade80','rgba(74,222,128,0.2)','linear-gradient(90deg,rgba(0,20,5,0.95),rgba(5,30,10,0.95),rgba(0,20,5,0.95))',Math.max(15,Math.round(msg.length*0.18)));
    return;
  }
  const allApproaching=[];
  const severeApproaching=[];
  for(const storm of S.storms){
    if(storm.dbz<alertMinDbz)continue;
    const eta=calcStormETA(storm);
    if(!eta||!eta.approaching||!eta.eta)continue;
    allApproaching.push({storm,eta});
    if(storm.dbz>=45)severeApproaching.push({storm,eta});
  }
  if(allApproaching.length===0){
    const pool=_tickerNearbyPool(sigStormCount);
    const msg=pool[Math.floor(Date.now()/60000)%pool.length];
    showTicker(`<span style="color:#60a5fa">${msg}</span>`,'#60a5fa','rgba(96,165,250,0.2)','linear-gradient(90deg,rgba(0,5,20,0.95),rgba(5,10,30,0.95),rgba(0,5,20,0.95))',Math.max(15,Math.round(msg.length*0.2)));
    return;
  }
  const spdUnit=S.radarMetric?'km/h':'mph';
  const spdVal=(spd)=>S.radarMetric?Math.round(spd*1.60934):spd;
  const fromDir=mv?degToDir((mv.direction+180)%360):'';
  const spd=mv?spdVal(mv.speed):0;
  function fmtEtaLive(etaMin){
    const targetMs=Date.now()+Math.round(etaMin*60)*1000;
    const arrival=new Date(targetMs);
    const arrStr=fmtClockShort(arrival);
    const cdSpan=`<span class="ticker-cd" data-target="${targetMs}"></span>`;
    return{cdSpan,arrStr};
  }
  function _tickerCdFmt(remain){
    if(remain<=0)return'NOW';
    const h=Math.floor(remain/3600),m=Math.floor((remain%3600)/60),s=remain%60;
    return h>0?h+'h:'+String(m).padStart(2,'0')+'m:'+String(s).padStart(2,'0')+'s':m+'m:'+String(s).padStart(2,'0')+'s';
  }
  if(severeApproaching.length>0){
    severeApproaching.sort((a,b)=>a.eta.eta-b.eta.eta);
    const msgs=severeApproaching.map(t=>{
      const s=t.storm;const{cdSpan,arrStr}=fmtEtaLive(t.eta.eta);
      if(s.dbz>=55)return`<span style="color:#ff3355">🚨 WARNING: Extremely dangerous storm (${s.dbz} dBZ) approaching from the ${fromDir} at ${spd} ${spdUnit}. ETA ⏱️${cdSpan} (${arrStr}). Seek shelter immediately. 🚨</span>`;
      if(s.dbz>=50)return`<span style="color:#ff6644">🚨 SEVERE WEATHER ALERT: Dangerous storm (${s.dbz} dBZ) approaching from the ${fromDir} at ${spd} ${spdUnit}. ETA ⏱️${cdSpan} (${arrStr}). Use extreme caution. 🚨</span>`;
      return`<span style="color:#ffcc00">⚠️ Strong storm (${s.dbz} dBZ) approaching from the ${fromDir} at ${spd} ${spdUnit}. ETA ⏱️${cdSpan} (${arrStr}). Use caution and be prepared. ⚠️</span>`;
    });
    const sep='<span style="color:#444;margin:0 40px">│</span>';
    const html=msgs.join(sep);
    const topDbz=severeApproaching[0].storm.dbz;
    showTicker(html,topDbz>=55?'#ff3355':topDbz>=50?'#ff6644':'#ffcc00',
      topDbz>=55?'rgba(255,51,85,0.5)':topDbz>=50?'rgba(255,102,68,0.4)':'rgba(255,204,0,0.3)',
      topDbz>=55?'linear-gradient(90deg,rgba(30,0,0,0.95),rgba(50,5,5,0.95),rgba(30,0,0,0.95))':topDbz>=50?'linear-gradient(90deg,rgba(30,10,0,0.95),rgba(50,15,5,0.95),rgba(30,10,0,0.95))':'linear-gradient(90deg,rgba(30,25,0,0.95),rgba(45,35,5,0.95),rgba(30,25,0,0.95))');
    _startTickerCountdown();
    return;
  }
  allApproaching.sort((a,b)=>a.eta.eta-b.eta.eta);
  const closest=allApproaching[0];
  const{cdSpan,arrStr}=fmtEtaLive(closest.eta.eta);
  const maxDbz=Math.max(...allApproaching.map(a=>a.storm.dbz));
  const label=maxDbz>=30?'moderate rain':'light rain';
  const lightMsgs=[
    `🌧️ ${allApproaching.length} ${label} cell${allApproaching.length>1?'s':''} heading your way from the ${fromDir} at ${spd} ${spdUnit}. Nearest ETA ⏱️${cdSpan} (~${arrStr}). Might want to grab an umbrella! ☂️`,
    `🌦️ Light precipitation approaching — ${allApproaching.length} cell${allApproaching.length>1?'s':''} inbound (${maxDbz} dBZ max). ETA ⏱️${cdSpan} (~${arrStr}). Nothing severe, but stay dry! 💧`,
    `☔ Heads up! ${allApproaching.length} rain area${allApproaching.length>1?'s':''} moving toward you (${maxDbz} dBZ). First arrival ⏱️${cdSpan} (~${arrStr}). Not dangerous, just wet. 🌂`
  ];
  const msg=lightMsgs[Math.floor(Date.now()/60000)%lightMsgs.length];
  showTicker(`<span style="color:#7dd3fc">${msg}</span>`,'#7dd3fc','rgba(125,211,252,0.2)','linear-gradient(90deg,rgba(0,8,25,0.95),rgba(5,15,35,0.95),rgba(0,8,25,0.95))');
  _startTickerCountdown();
}
let _tickerCdTimer=0;
function _startTickerCountdown(){
  if(_tickerCdTimer)clearInterval(_tickerCdTimer);
  _tickTickerCd();
  _tickerCdTimer=setInterval(_tickTickerCd,1000);
}
function _tickTickerCd(){
  const spans=document.querySelectorAll('.ticker-cd');
  if(!spans.length){if(_tickerCdTimer){clearInterval(_tickerCdTimer);_tickerCdTimer=0;}return;}
  const now=Date.now();
  spans.forEach(sp=>{
    const t=parseInt(sp.dataset.target)||0;
    const remain=Math.max(0,Math.round((t-now)/1000));
    const h=Math.floor(remain/3600),m=Math.floor((remain%3600)/60),s=remain%60;
    sp.textContent=remain<=0?'NOW':h>0?h+'h:'+String(m).padStart(2,'0')+'m:'+String(s).padStart(2,'0')+'s':m+'m:'+String(s).padStart(2,'0')+'s';
  });
}
function autoActivateZones(){
  if(!S._rawScanPts||!S._rawScanPts.length)return;
  if(!S._showZones){
    S._showZones=true;
    try{localStorage.setItem('st_zones','1')}catch(e){}
    const btn=document.getElementById('btn-zones');
    if(btn)btn.style.opacity='1';
  }
  if(S._pointsMode==='all'){
    S._pointsMode='off';S._showPoints=false;
    try{localStorage.setItem('st_pointsMode','off')}catch(e){}
    S.stormMarkers.forEach(m=>{try{S.map.removeLayer(m)}catch(e){}});
    const btn=document.getElementById('btn-points');
    if(btn){btn.style.opacity='0.4';btn.textContent='PT';btn.style.color='var(--accent-cyan)';}
  }
  if(!S._radarOverlayVisible&&S.radarLayer&&S.map){try{S.map.removeLayer(S.radarLayer)}catch(e){}}
  if(S.map)buildStormZones(S.map,S._rawScanPts);
}
function checkUserInZone(){
  if(!S._rawScanPts.length)return null;
  const cells=polarGridBin(S._rawScanPts,S.lat,S.lon,S.scanRadius||80);
  const center=cells.get(Math.floor(0/ZONE_ANG_STEP)+',0');
  if(!center)return null;
  const bin=dbzColor(center.maxDbz);
  return[bin];
}
function toggleStormZones(){
  S._showZones=!S._showZones;
  try{localStorage.setItem('st_zones',S._showZones?'1':'0')}catch(e){}
  if(S._showZones&&S._rawScanPts.length&&S.map){
    buildStormZones(S.map,S._rawScanPts);
  }else{
    clearStormZones();
    if(S.radarLayer&&S.map&&!S.map.hasLayer(S.radarLayer)){try{S.radarLayer.addTo(S.map)}catch(e){}}
  }
  const btn=document.getElementById('btn-zones');
  if(btn)btn.style.opacity=S._showZones?'1':'0.4';
}
S._radarOverlayVisible=false;
function toggleRadarOverlay(){
  S._radarOverlayVisible=!S._radarOverlayVisible;
  if(S._radarOverlayVisible&&S.radarLayer&&S.map){
    if(!S.map.hasLayer(S.radarLayer))S.radarLayer.addTo(S.map);
  }else if(!S._radarOverlayVisible&&S.radarLayer&&S.map){
    if(S.map.hasLayer(S.radarLayer))S.map.removeLayer(S.radarLayer);
  }
  const btn=document.getElementById('btn-radar-overlay');
  if(btn)btn.style.opacity=S._radarOverlayVisible?'1':'0.4';
}

S._mpingMarkers=[];
S._mpingVisible=false;
S._mpingCache=null;
S._mpingCacheTime=0;
S._mpingPlotId=0;

const MPING_ICONS={
  'Rain':'🌧️','Heavy Rain':'🌧️','Drizzle':'🌦️',
  'Freezing Rain':'🧊','Freezing Drizzle':'🧊',
  'Ice Pellets/Sleet':'🧊','Ice Pellets':'🧊',
  'Snow':'❄️','Heavy Snow':'❄️','Wet Snow':'❄️','Snow and/or Graupel':'❄️',
  'Rain/Snow':'🌨️','Mixed Rain and Snow':'🌨️',
  'Hail':'⚪','Small Hail':'⚪',
  'Wind Damage':'💨','Non-Precipitation':'🌫️',
  'Tornado':'🌪️','Funnel Cloud':'🌪️',
  'Flooding':'🌊','Flash Flooding':'🌊',
  'Thunder':'⚡','Lightning':'⚡',
  'Fog':'🌫️','Blowing Snow':'🌬️','Dust/Sand':'🏜️'
};

const MPING_COLORS={
  'Rain':'#4fc3f7','Heavy Rain':'#0288d1','Drizzle':'#81d4fa',
  'Freezing Rain':'#e040fb','Freezing Drizzle':'#ce93d8',
  'Ice Pellets/Sleet':'#ba68c8','Ice Pellets':'#ba68c8',
  'Snow':'#e0e0e0','Heavy Snow':'#bdbdbd','Wet Snow':'#b0bec5','Snow and/or Graupel':'#90a4ae',
  'Rain/Snow':'#80cbc4','Mixed Rain and Snow':'#80cbc4',
  'Hail':'#ff5252','Small Hail':'#ff8a80',
  'Wind Damage':'#ff9800','Non-Precipitation':'#78909c',
  'Tornado':'#d50000','Funnel Cloud':'#ff1744',
  'Flooding':'#1565c0','Flash Flooding':'#0d47a1',
  'Thunder':'#ffd600','Lightning':'#ffea00',
  'Fog':'#78909c','Blowing Snow':'#b0bec5','Dust/Sand':'#a1887f'
};

function _mpingCat(desc){
  if(!desc)return'Other';
  const d=desc.toLowerCase();
  if(d.includes('tornado')||d.includes('funnel'))return'Severe';
  if(d.includes('hail'))return'Hail';
  if(d.includes('wind damage'))return'Severe';
  if(d.includes('flood'))return'Flood';
  if(d.includes('freezing')||d.includes('ice pellet')||d.includes('sleet'))return'Ice';
  if(d.includes('snow')||d.includes('graupel')||d.includes('blowing snow'))return'Snow';
  if(d.includes('rain')||d.includes('drizzle'))return'Rain';
  if(d.includes('thunder')||d.includes('lightning'))return'Thunder';
  return'Other';
}

async function fetchMpingReports(){
  const map=S.map;if(!map)return[];
  const now=Date.now();
  if(S._mpingCache&&(now-S._mpingCacheTime)<300000)return S._mpingCache;
  const bounds=map.getBounds();
  const ets=new Date();
  const sts=new Date(ets.getTime()-3*3600000);
  const fmt=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:00Z`;
  const url=`https://mesonet.agron.iastate.edu/geojson/mping.geojson?sts=${fmt(sts)}&ets=${fmt(ets)}`;
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    const features=(data.features||[]).filter(f=>{
      if(!f.geometry||!f.geometry.coordinates)return false;
      const[lng,lat]=f.geometry.coordinates;
      return lat>=bounds.getSouth()&&lat<=bounds.getNorth()&&lng>=bounds.getWest()&&lng<=bounds.getEast();
    });
    S._mpingCache=features;
    S._mpingCacheTime=now;
    return features;
  }catch(e){
    console.error('mPING fetch error:',e);
    return S._mpingCache||[];
  }
}

function plotMpingMarkers(reports){
  const map=S.map;if(!map)return;
  clearMpingMarkers();
  S._mpingVisible=true;
  const plotId=++S._mpingPlotId;
  for(const f of reports){
    if(S._mpingPlotId!==plotId)return;
    const[lng,lat]=f.geometry.coordinates;
    const props=f.properties||{};
    const desc=props.description||props.type_text||props.category||'Unknown';
    const icon=MPING_ICONS[desc]||'📍';
    const color=MPING_COLORS[desc]||'#4fc3f7';
    const ts=props.valid||props.utc_valid||'';
    let timeAgo='';
    if(ts){
      const t=new Date(ts.replace(' ','T')+(ts.includes('Z')?'':'Z'));
      const mins=Math.round((Date.now()-t.getTime())/60000);
      timeAgo=mins<60?`${mins}m ago`:`${Math.floor(mins/60)}h ${mins%60}m ago`;
    }
    const cat=_mpingCat(desc);
    const divIcon=L.divIcon({
      className:'mping-marker',
      html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">
        <div style="background:${color};font-size:14px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.7);box-shadow:0 0 6px ${color}80;cursor:pointer">${icon}</div>
      </div>`,
      iconSize:[26,26],iconAnchor:[13,13]
    });
    const popup=L.popup({className:'storm-popup mping-popup',maxWidth:220,closeButton:true}).setContent(`
      <div style="font-size:0.82em;line-height:1.5">
        <div style="font-weight:700;color:${color};margin-bottom:4px">${icon} ${desc}</div>
        <div style="display:inline-block;background:${color}30;color:${color};padding:1px 8px;border-radius:10px;font-size:0.8em;font-weight:600;margin-bottom:4px">${cat}</div>
        ${timeAgo?`<div style="color:var(--text-muted);font-size:0.85em">🕐 ${timeAgo}</div>`:''}
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border-subtle);font-size:0.75em;color:var(--text-muted)">
          📡 mPING citizen report<br>
          <a href="https://mping.nssl.noaa.gov/" target="_blank" rel="noopener" style="color:var(--accent-cyan);text-decoration:none">What is mPING?</a> · 
          <a href="https://apps.apple.com/us/app/mping/id577882748" target="_blank" rel="noopener" style="color:var(--accent-cyan);text-decoration:none">iOS</a> · 
          <a href="https://play.google.com/store/apps/details?id=edu.ou.nssl.mping" target="_blank" rel="noopener" style="color:var(--accent-cyan);text-decoration:none">Android</a>
        </div>
      </div>
    `);
    const marker=L.marker([lat,lng],{icon:divIcon,zIndexOffset:600}).addTo(map).bindPopup(popup);
    S._mpingMarkers.push(marker);
  }
}

function clearMpingMarkers(){
  const m=S.map;
  S._mpingPlotId++;
  S._mpingMarkers.forEach(mk=>{try{if(m)m.removeLayer(mk)}catch(e){}});
  S._mpingMarkers=[];
}

async function toggleMping(){
  const btn=document.getElementById('btn-mping');
  if(S._mpingVisible){
    clearMpingMarkers();
    S._mpingVisible=false;
    if(btn){btn.style.opacity='0.4';btn.style.background='';btn.style.borderColor=''}
    try{localStorage.setItem('st_mping','0')}catch(e){}
    return;
  }
  if(btn){btn.style.opacity='1';btn.style.background='rgba(79,195,247,0.2)';btn.style.borderColor='#4fc3f7'}
  S._mpingVisible=true;
  try{localStorage.setItem('st_mping','1')}catch(e){}
  toast('Loading mPING reports...');
  S._mpingCache=null;S._mpingCacheTime=0;
  const reports=await fetchMpingReports();
  if(!S._mpingVisible)return;
  if(reports.length===0){
    toast('No mPING reports in this area (last 3h)');
    return;
  }
  plotMpingMarkers(reports);
  toast(`📡 ${reports.length} mPING report${reports.length!==1?'s':''} loaded`);
}

async function refreshMpingIfVisible(){
  if(!S._mpingVisible||!S.map)return;
  S._mpingCache=null;S._mpingCacheTime=0;
  const reports=await fetchMpingReports();
  if(!S._mpingVisible)return;
  plotMpingMarkers(reports);
}

try{
  const resetKey='st_defaults_v230e';
  if(!localStorage.getItem(resetKey)){
    localStorage.removeItem('st_pathArrows');
    localStorage.removeItem('st_pointsMode');
    localStorage.setItem(resetKey,'1');
  }
}catch(e){}
try{const zv=localStorage.getItem('st_zones');if(zv==='0')S._showZones=false}catch(e){}
try{const pa=localStorage.getItem('st_pathArrows');if(pa==='0')S._showPathArrows=false}catch(e){}
try{const ps=localStorage.getItem('st_arrowStyle');if(ps==='pointer')S._pathArrowStyle='pointer'}catch(e){}
S._showPoints=true;
S._pointsMode='inbound';
try{const pv=localStorage.getItem('st_pointsMode');if(pv){S._pointsMode=pv;S._showPoints=(pv!=='off')}}catch(e){}
try{const mv=localStorage.getItem('st_mping');if(mv==='1')S._mpingPendingRestore=true}catch(e){}

function clearPathArrows(){
  if(S._pathArrowAnimInterval){clearInterval(S._pathArrowAnimInterval);S._pathArrowAnimInterval=null}
  if(S._pathArrowZoomHandler&&S.map){try{S.map.off('zoomend',S._pathArrowZoomHandler)}catch(e){}}
  S._pathArrowZoomHandler=null;
  S._pathArrowLayers.forEach(l=>{try{S.map.removeLayer(l)}catch(e){}});
  S._pathArrowLayers=[];
}
function togglePathArrows(){
  S._showPathArrows=!S._showPathArrows;
  try{localStorage.setItem('st_pathArrows',S._showPathArrows?'1':'0')}catch(e){}
  if(S._showPathArrows){buildPathArrows(S.map)}else{clearPathArrows()}
  const btn=document.getElementById('btn-path-arrows');
  if(btn)btn.style.opacity=S._showPathArrows?'1':'0.4';
}
function setPathArrowStyle(style){
  S._pathArrowStyle=style;
  try{localStorage.setItem('st_arrowStyle',style)}catch(e){}
  if(S._showPathArrows)buildPathArrows(S.map);
  const cBtn=document.getElementById('pa-style-chevron');
  const pBtn=document.getElementById('pa-style-pointer');
  if(cBtn){cBtn.style.background=style==='chevron'?'rgba(0,229,255,0.2)':'rgba(255,255,255,0.05)';cBtn.style.borderColor=style==='chevron'?'var(--accent-cyan)':'var(--border-subtle)';}
  if(pBtn){pBtn.style.background=style==='pointer'?'rgba(0,229,255,0.2)':'rgba(255,255,255,0.05)';pBtn.style.borderColor=style==='pointer'?'var(--accent-cyan)':'var(--border-subtle)';}
}
function pathArrowNeonColor(maxDbz){
  if(maxDbz<15)return'#ffffff';
  return _dbzEntry(maxDbz).color;
}
function buildPathArrows(map,_retries){
  clearPathArrows();
  if(!map||!S._showPathArrows)return;
  const hasMovement=S.stormMovement&&S.stormMovement.speed&&S.stormMovement.speed>=1;
  const hasAloft=S._upperWindDir!=null;
  if(!hasMovement&&!hasAloft){
    const r=(_retries||0);
    if(r<5){setTimeout(()=>{if(S._showPathArrows)buildPathArrows(map,r+1)},800)}
    return;
  }
  const mv=hasMovement?S.stormMovement:{direction:(S._upperWindDir+180)%360,speed:S._upperWindSpd?Math.round(S._upperWindSpd*0.621371):10};
  const mvDir=hasAloft?(S._upperWindDir+180)%360:mv.direction;
  const fromBear=(mvDir+180)%360;
  const ad=S._approachData||{count:0,bearings:[],maxDist:0,sumDbz:0,maxDbz:0,minDbz:999};
  const hasInbound=ad.count>0&&ad.sumDbz>0;
  const centerColor=hasInbound?pathArrowNeonColor(ad.maxDbz):'#ffffff';
  const edgeColor=hasInbound?pathArrowNeonColor(ad.minDbz):'#ff3355';
  const tailColor=hasInbound?centerColor:'#ffffff';
  const avgBearDeg=fromBear;
  let halfAngle=15;
  const farthestStorm=hasInbound&&ad.maxDist>0?ad.maxDist:S.scanRadius||30;
  const coneDist=Math.max(15,Math.min(farthestStorm+10,120));
  if(hasInbound){
    let bearSpread=0;
    for(const b of ad.bearings){
      const d=Math.abs(((b-fromBear)+540)%360-180);
      if(d>bearSpread)bearSpread=d;
    }
    halfAngle=Math.max(8,Math.min(bearSpread+5,30));
  }
  const pane='path-arrow-pane';
  if(!map.getPane(pane)){map.createPane(pane);map.getPane(pane).style.zIndex=440}
  const ilsCount=Math.max(12,Math.min(Math.round(coneDist/4),25));
  const tailMi=Math.max(10,Math.min(coneDist*0.3,40));
  const tailCount=Math.max(6,Math.round(tailMi/5));
  const totalCenter=ilsCount+tailCount;
  const ilsCenterDots=[];
  const ilsLeftDots=[];
  const ilsRightDots=[];
  for(let i=0;i<ilsCount;i++){
    const f=(i+1)/(ilsCount+1);
    const d=coneDist*(1-f);
    const spread=halfAngle*(1-f);
    const cPt=destPt(S.lat,S.lon,d,avgBearDeg);
    const sz=Math.max(3,6-f*3);
    const dot=L.marker(cPt,{
      icon:L.divIcon({className:'',html:`<div class="ils-dot" style="width:${sz}px;height:${sz}px;background:${centerColor};box-shadow:0 0 ${sz+3}px ${centerColor};opacity:0.15"></div>`,iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]}),
      pane:pane,interactive:false
    }).addTo(map);
    ilsCenterDots.push(dot);
    S._pathArrowLayers.push(dot);
    if(spread>2){
      const lPt=destPt(S.lat,S.lon,d,avgBearDeg-spread);
      const rPt=destPt(S.lat,S.lon,d,avgBearDeg+spread);
      const barSz=Math.min(4,Math.max(2,sz-1));
      const lDot=L.marker(lPt,{
        icon:L.divIcon({className:'',html:`<div class="ils-dot" style="width:${barSz}px;height:${barSz}px;background:${edgeColor};box-shadow:0 0 ${barSz+2}px ${edgeColor};opacity:0.15"></div>`,iconSize:[barSz,barSz],iconAnchor:[barSz/2,barSz/2]}),
        pane:pane,interactive:false
      }).addTo(map);
      const rDot=L.marker(rPt,{
        icon:L.divIcon({className:'',html:`<div class="ils-dot" style="width:${barSz}px;height:${barSz}px;background:${edgeColor};box-shadow:0 0 ${barSz+2}px ${edgeColor};opacity:0.15"></div>`,iconSize:[barSz,barSz],iconAnchor:[barSz/2,barSz/2]}),
        pane:pane,interactive:false
      }).addTo(map);
      ilsLeftDots.push(lDot);
      ilsRightDots.push(rDot);
      S._pathArrowLayers.push(lDot);
      S._pathArrowLayers.push(rDot);
    }
  }
  for(let i=0;i<tailCount;i++){
    const f=(i+1)/(tailCount+1);
    const tPt=destPt(S.lat,S.lon,tailMi*f,mvDir);
    const fadeOp=Math.max(0.05,0.15*(1-f));
    const sz=Math.max(2,5-f*3);
    const dot=L.marker(tPt,{
      icon:L.divIcon({className:'',html:`<div class="ils-dot" style="width:${sz}px;height:${sz}px;background:${tailColor};box-shadow:0 0 ${sz+2}px ${tailColor};opacity:${fadeOp}"></div>`,iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]}),
      pane:pane,interactive:false
    }).addTo(map);
    ilsCenterDots.push(dot);
    S._pathArrowLayers.push(dot);
  }
  const vanePt=destPt(S.lat,S.lon,tailMi*0.92,mvDir);
  const vaneSz=16;
  const vaneArrow=L.marker(vanePt,{
    icon:L.divIcon({className:'',html:`<svg width="${vaneSz}" height="${vaneSz}" viewBox="0 0 40 40" style="transform:rotate(${mvDir}deg);filter:drop-shadow(0 0 4px ${tailColor})"><polygon points="20,4 30,30 20,24 10,30" fill="${tailColor}" fill-opacity="0.7"/></svg>`,iconSize:[vaneSz,vaneSz],iconAnchor:[vaneSz/2,vaneSz/2]}),
    pane:pane,interactive:false
  }).addTo(map);
  S._pathArrowLayers.push(vaneArrow);
  let cFrame=0,sFrame=0;
  const animDots=(dots,frame)=>{
    const len=dots.length;
    for(let i=0;i<len;i++){
      const el=dots[i].getElement();
      if(!el)continue;
      const ch=el.firstChild;
      if(!ch)continue;
      const pos=(frame-i+len)%len;
      if(pos<3){
        ch.style.opacity=String(pos===0?0.9:pos===1?0.5:0.25);
        ch.style.transform=pos===0?'scale(1.2)':'scale(1)';
      }else{
        ch.style.opacity='0.15';
        ch.style.transform='scale(1)';
      }
    }
  };
  const sideLen=ilsLeftDots.length||1;
  S._pathArrowAnimInterval=setInterval(()=>{
    animDots(ilsCenterDots,cFrame);
    animDots(ilsLeftDots,sFrame);
    animDots(ilsRightDots,sFrame);
    cFrame=(cFrame+1)%totalCenter;
    sFrame=(sFrame+1)%sideLen;
  },150);
}
function toggleStormPoints(){
  const modes=['off','inbound','all'];
  const cur=modes.indexOf(S._pointsMode);
  S._pointsMode=modes[(cur+1)%3];
  S._showPoints=(S._pointsMode!=='off');
  try{localStorage.setItem('st_pointsMode',S._pointsMode)}catch(e){}
  const btn=document.getElementById('btn-points');
  if(S._pointsMode==='off'){
    S.stormMarkers.forEach(m=>{try{S.map.removeLayer(m)}catch(e){}});
    if(btn){btn.style.opacity='0.4';btn.textContent='PT';btn.style.color='var(--accent-cyan)';}
  }else if(S._pointsMode==='inbound'){
    if(S.map)plotStormMarkers(S.map);
    if(btn){btn.style.opacity='1';btn.textContent='12▶';btn.style.color='#ffcc00';}
  }else{
    if(S.map)plotStormMarkers(S.map);
    if(btn){btn.style.opacity='1';btn.textContent='PT';btn.style.color='var(--accent-cyan)';}
  }
}

// ==========================================
// RADAR-BASED STORM DETECTION
// Two-phase adaptive scan matching main app approach
// NEXRAD primary (US) + RainViewer fallback (global)
// ==========================================
function isUSLocation(lat,lon){
  return lat>=24&&lat<=50&&lon>=-125&&lon<=-66;
}

function loadTileImage(url){
  return new Promise((resolve)=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src=url;
  });
}

async function decodeRvRgba(buf){
  const v=new DataView(buf);
  if(buf.byteLength<29)throw new Error('PNG too small');
  let o=8,w=0,h=0,bd=0,ct=0;
  const idats=[];
  while(o+8<=v.byteLength){
    const len=v.getUint32(o);
    if(len>buf.byteLength)break;
    const t=String.fromCharCode(v.getUint8(o+4),v.getUint8(o+5),v.getUint8(o+6),v.getUint8(o+7));
    if(t==='IHDR'&&o+17<v.byteLength){w=v.getUint32(o+8);h=v.getUint32(o+12);bd=v.getUint8(o+16);ct=v.getUint8(o+17)}
    else if(t==='IDAT'){
      if(o+8+len<=buf.byteLength)idats.push(new Uint8Array(buf,o+8,len));
    }
    else if(t==='IEND')break;
    o+=12+len;
    if(o<0)break;
  }
  const total=idats.reduce((s,c)=>s+c.length,0);
  const comp=new Uint8Array(total);
  let p=0;for(const c of idats){comp.set(c,p);p+=c.length}
  const ds=new DecompressionStream('deflate');
  const wr=ds.writable.getWriter();
  wr.write(comp);wr.close();
  const rd=ds.readable.getReader();
  const chunks=[];
  while(true){const{done,value}=await rd.read();if(done)break;chunks.push(value)}
  const dLen=chunks.reduce((s,c)=>s+c.length,0);
  const raw=new Uint8Array(dLen);
  p=0;for(const c of chunks){raw.set(c,p);p+=c.length}
  const bpp=ct===6?4:ct===4?2:ct===2?3:1;
  const stride=w*bpp;
  if(!w||!h||dLen<h*(stride+1))throw new Error('PNG decode: bad dimensions');
  const rgba=new Uint8Array(w*h*4);
  const prev=new Uint8Array(stride);
  for(let y=0;y<h;y++){
    const fi=y*(stride+1);
    if(fi+1+stride>raw.length)break;
    const filter=raw[fi];
    const line=new Uint8Array(stride);
    for(let x=0;x<stride;x++){
      let val=raw[fi+1+x];
      const a=x>=bpp?line[x-bpp]:0;
      const b=prev[x];
      const c=x>=bpp?prev[x-bpp]:0;
      if(filter===1)val=(val+a)&255;
      else if(filter===2)val=(val+b)&255;
      else if(filter===3)val=(val+((a+b)>>1))&255;
      else if(filter===4){const pa=Math.abs(b-c),pb=Math.abs(a-c),pc=Math.abs(a+b-2*c);val=(val+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255}
      line[x]=val;
    }
    for(let x=0;x<w;x++){
      const di=(y*w+x)*4;
      if(bpp===4){rgba[di]=line[x*4];rgba[di+1]=line[x*4+1];rgba[di+2]=line[x*4+2];rgba[di+3]=line[x*4+3]}
      else if(bpp===2){rgba[di]=line[x*2];rgba[di+1]=line[x*2];rgba[di+2]=line[x*2];rgba[di+3]=line[x*2+1]}
    }
    prev.set(line);
  }
  return{w,h,data:rgba};
}
async function scanTileForPoints(url,tx,ty,zoom,colorFn,minDbz,scanRadius,stepOverride){
  const tileSize=256,step=stepOverride||S._scanStep||2;
  const isRV=url.includes('rainviewer');
  if(isRV){
    try{
      const res=await fetch(url);
      if(!res.ok)return[];
      const buf=await res.arrayBuffer();
      const{w,h,data}=await decodeRvRgba(buf);
      const pts=[];
      for(let x=0;x<w;x+=step){
        for(let y=0;y<h;y+=step){
          const i=(y*w+x)*4;
          if(data[i+3]<30)continue;
          const dbz=rvToDbz(data[i],data[i+1],data[i+2],data[i+3]);
          if(dbz<minDbz)continue;
          const ptLon=(tx+x/w)*360/Math.pow(2,zoom)-180;
          const ptLatRad=Math.atan(Math.sinh(Math.PI*(1-2*(ty+y/h)/Math.pow(2,zoom))));
          const ptLat=ptLatRad*180/Math.PI;
          const dist=haversine(S.lat,S.lon,ptLat,ptLon);
          if(dist<=scanRadius)pts.push({lat:ptLat,lng:ptLon,dbz,dist});
        }
      }
      return pts;
    }catch(e){return[]}
  }
  const img=await loadTileImage(url);
  if(!img)return[];
  const c=document.createElement('canvas');c.width=tileSize;c.height=tileSize;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(img,0,0);
  let data;
  try{data=ctx.getImageData(0,0,tileSize,tileSize).data}catch(e){return[]}
  const pts=[];
  for(let x=0;x<tileSize;x+=step){
    for(let y=0;y<tileSize;y+=step){
      const i=(y*tileSize+x)*4;
      if(data[i+3]<30)continue;
      const dbz=colorFn(data[i],data[i+1],data[i+2],data[i+3]);
      if(dbz>=minDbz){
        const ptLon=(tx+x/tileSize)*360/Math.pow(2,zoom)-180;
        const ptLatRad=Math.atan(Math.sinh(Math.PI*(1-2*(ty+y/tileSize)/Math.pow(2,zoom))));
        const ptLat=ptLatRad*180/Math.PI;
        const dist=haversine(S.lat,S.lon,ptLat,ptLon);
        if(dist<=scanRadius)pts.push({lat:ptLat,lng:ptLon,dbz,dist});
      }
    }
  }
  return pts;
}
(function initAdaptiveScan(){
  S._scanStep=2;
  const t0=performance.now();
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillRect(0,0,256,256);
  const d=ctx.getImageData(0,0,256,256).data;
  let s=0;for(let i=0;i<d.length;i+=8)s+=d[i];
  const ms=performance.now()-t0;
  if(ms>50)S._scanStep=4;
  else if(ms>20)S._scanStep=3;
  else S._scanStep=2;
  console.log('Adaptive scan: step='+S._scanStep+' (bench='+ms.toFixed(1)+'ms)');
})();

async function fetchWindsAloft(overrideLat,overrideLon){
  const lat=overrideLat!=null?overrideLat:S.lat;
  const lon=overrideLon!=null?overrideLon:S.lon;
  if(!lat)return;
  const cache=S._windCache;
  if(cache&&(Date.now()-cache.ts<30*60000)){
    const d=haversine(lat,lon,cache.lat,cache.lon);
    if(d<100){
      console.log('Winds aloft: using cache ('+d.toFixed(0)+'mi from last fetch, '+((Date.now()-cache.ts)/60000).toFixed(0)+'m old)');
      return;
    }
  }
  try{
    const params=new URLSearchParams({
      latitude:lat,longitude:lon,
      current:['wind_speed_10m','wind_direction_10m',
        'wind_speed_925hPa','wind_direction_925hPa',
        'wind_speed_850hPa','wind_direction_850hPa',
        'wind_speed_700hPa','wind_direction_700hPa',
        'wind_speed_500hPa','wind_direction_500hPa'].join(','),
      wind_speed_unit:'ms',forecast_days:'1',timezone:'auto'
    });
    const r=await fetch('https://api.open-meteo.com/v1/forecast?'+params,{signal:AbortSignal.timeout(5000)});
    if(!r.ok)return;
    const d=await r.json();
    const c=d.current;
    const levels=[
      {p:1013,sk:'wind_speed_10m',dk:'wind_direction_10m',w:0.5,isSfc:true},
      {p:925,sk:'wind_speed_925hPa',dk:'wind_direction_925hPa',w:0.8},
      {p:850,sk:'wind_speed_850hPa',dk:'wind_direction_850hPa',w:1.5},
      {p:700,sk:'wind_speed_700hPa',dk:'wind_direction_700hPa',w:2.5},
      {p:500,sk:'wind_speed_500hPa',dk:'wind_direction_500hPa',w:1.5}
    ];
    let tx=0,ty=0,tw=0;
    const aloftSpeeds=[];
    levels.forEach(l=>{
      const spd=c[l.sk],dir=c[l.dk];
      if(spd==null||dir==null)return;
      aloftSpeeds.push({p:l.p,spd:spd*3.6,dir,isSfc:!!l.isSfc});
      const spdKt=spd*1.944;
      const movDir=(dir+180)%360;
      const rad=movDir*Math.PI/180;
      tx+=Math.sin(rad)*spdKt*l.w;
      ty+=Math.cos(rad)*spdKt*l.w;
      tw+=l.w;
    });
    S._aloftData=aloftSpeeds;
    if(aloftSpeeds.length>=2){
      const sfc=aloftSpeeds.find(a=>a.p>=1000)||aloftSpeeds[0];
      const upper=aloftSpeeds[aloftSpeeds.length-1];
      const shearSpd=Math.abs(upper.spd-sfc.spd);
      let dd=Math.abs(upper.dir-sfc.dir);if(dd>180)dd=360-dd;
      S._windShear={speedDiff:shearSpd,dirDiff:dd,factor:Math.min(2.0,0.5+shearSpd/60+dd/180)};
      S._upperWindDir=upper.dir;S._upperWindSpd=upper.spd;
      console.log('Wind shear: Δspd='+shearSpd.toFixed(1)+'km/h Δdir='+dd+'° turbFactor='+S._windShear.factor.toFixed(2));
    }
    if(tw===0)return;
    const ax=tx/tw,ay=ty/tw;
    const spd=Math.sqrt(ax*ax+ay*ay);
    let dir=(Math.atan2(ax,ay)*180/Math.PI+360)%360;
    const spdMph=Math.round(spd*1.151*0.7);
    S.stormMovement={direction:Math.round(dir),speed:spdMph};
    S._windCache={lat,lon,ts:Date.now(),dir:Math.round(dir),speed:spdMph};
    console.log('Winds aloft → storm movement: '+Math.round(dir)+'° at '+spdMph+' mph');
    if(S.map&&S._showPathArrows)buildPathArrows(S.map);
  }catch(e){console.log('Winds aloft fetch failed:',e.message)}
}

async function fetchAFD(){
  if(!S.lat||!S.lon)return;
  if(!isUSLocation(S.lat,S.lon)){S._afd=null;return;}
  const cache=S._afdCache;
  if(cache&&(Date.now()-cache.ts<60*60000)){S._afd=cache.data;return;}
  try{
    const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{
      headers:{'User-Agent':'StormTracker/2.30 (weather analysis)','Accept':'application/geo+json'},
      signal:AbortSignal.timeout(6000)
    });
    if(!ptRes.ok){S._afd=null;return;}
    const ptData=await ptRes.json();
    const office=ptData.properties?.cwa;
    if(!office){S._afd=null;return;}
    const prodRes=await fetch(`https://api.weather.gov/products/types/AFD/locations/${office}`,{
      headers:{'User-Agent':'StormTracker/2.30','Accept':'application/ld+json'},
      signal:AbortSignal.timeout(6000)
    });
    if(!prodRes.ok){S._afd=null;return;}
    const prodData=await prodRes.json();
    const products=prodData['@graph']||[];
    if(!products.length){S._afd=null;return;}
    const latest=products[0];
    const afdRes=await fetch(latest['@id'],{
      headers:{'User-Agent':'StormTracker/2.30','Accept':'application/ld+json'},
      signal:AbortSignal.timeout(6000)
    });
    if(!afdRes.ok){S._afd=null;return;}
    const afdData=await afdRes.json();
    const fullText=afdData.productText||'';
    let discussion='';
    const discMatch=fullText.match(/\.DISCUSSION\.\.\.([\s\S]*?)(?=\n\.\w|\n\$\$|$)/i);
    if(discMatch)discussion=discMatch[1].trim();
    else{
      const synMatch=fullText.match(/\.SYNOPSIS\.\.\.([\s\S]*?)(?=\n\.\w|\n\$\$|$)/i);
      if(synMatch)discussion=synMatch[1].trim();
    }
    if(!discussion||discussion.length<50){
      const lines=fullText.split('\n');
      const start=lines.findIndex(l=>/^\.\w/.test(l));
      if(start>=0)discussion=lines.slice(start,start+40).join('\n').substring(0,1500);
    }
    if(discussion&&discussion.length>1500)discussion=discussion.substring(0,1500);
    const officeName=ptData.properties?.cwa||office;
    S._afd={office:officeName,discussion,issuedAt:latest.issuanceTime||''};
    S._afdCache={ts:Date.now(),data:S._afd};
    console.log('AFD fetched from NWS '+officeName+' ('+discussion.length+' chars)');
  }catch(e){
    console.log('AFD fetch failed:',e.message);
    S._afd=null;
  }
}

function getStabilityData(){
  if(!S.forecast||!S.forecast.hourly)return null;
  const h=S.forecast.hourly;
  if(!h.cape||!h.lifted_index)return null;
  const now=new Date();
  const idx=h.time?h.time.findIndex(t=>new Date(t).getHours()===now.getHours()):0;
  if(idx<0)return null;
  const cape=h.cape[idx];
  const li=h.lifted_index[idx];
  const cin=h.convective_inhibition?h.convective_inhibition[idx]:null;
  const dewp=h.dew_point_2m?h.dew_point_2m[idx]:null;
  const temp=h.temperature_2m?h.temperature_2m[idx]:null;
  const humid=h.relative_humidity_2m?h.relative_humidity_2m[idx]:null;
  let capeRat=1;
  if(cape>=2500)capeRat=9;else if(cape>=1500)capeRat=7;else if(cape>=1000)capeRat=5;else if(cape>=500)capeRat=3;
  let liRat=1;
  if(li<=-6)liRat=9;else if(li<=-3)liRat=7;else if(li<=0)liRat=5;else if(li<=3)liRat=3;
  let cinRat=1;
  if(cin!=null){if(cin<=25)cinRat=9;else if(cin<=75)cinRat=7;else if(cin<=150)cinRat=5;else if(cin<=250)cinRat=3;}
  const stabRat=Math.round((capeRat+liRat+cinRat)/3);
  let stabDesc='Very stable atmosphere';
  if(stabRat>=8)stabDesc='Extremely unstable — high thunderstorm potential';
  else if(stabRat>=6)stabDesc='Unstable — good thunderstorm potential';
  else if(stabRat>=4)stabDesc='Marginally unstable — some thunderstorm potential';
  else if(stabRat>=2)stabDesc='Stable atmosphere — low thunderstorm potential';
  let moistRat=1;
  if(humid!=null&&dewp!=null&&temp!=null){
    const spread=temp-dewp;
    if(humid>=70&&spread<=3)moistRat=9;else if(humid>=60&&spread<=5)moistRat=7;else if(humid>=50&&spread<=8)moistRat=5;else if(humid>=40&&spread<=12)moistRat=3;
  }
  let liftRat=1;
  if(S._windShear){
    const shearMag=S._windShear.speedDiff;
    if(shearMag>=20)liftRat=8;else if(shearMag>=10)liftRat=6;else if(shearMag>=5)liftRat=4;else liftRat=2;
  }
  const overall=Math.round((moistRat+stabRat+liftRat)/3);
  let risk='LOW';
  if(overall>=8)risk='EXTREME';else if(overall>=6)risk='HIGH';else if(overall>=4)risk='MODERATE';
  return{cape,li,cin,stabRat,stabDesc,moistRat,liftRat,overall,risk,dewp,temp,humid};
}

function getWindShearAnalysis(){
  if(!S._windShear||!S._aloftData||S._aloftData.length<2)return null;
  const sfc=S._aloftData.find(a=>a.isSfc)||S._aloftData[0];
  const upper=S._aloftData[S._aloftData.length-1];
  const sfcSpdMph=(sfc.spd*0.621371).toFixed(0);
  const upperSpdMph=(upper.spd*0.621371).toFixed(0);
  const vecShear=S._windShear.speedDiff*0.621371;
  let severity='Light';
  if(vecShear>=25)severity='Strong';else if(vecShear>=15)severity='Moderate';
  let impact='Minimal turbulence expected';
  if(vecShear>=25)impact='Significant turbulence likely — hazardous for light aircraft';
  else if(vecShear>=15)impact='Moderate turbulence possible — use caution';
  else if(vecShear>=8)impact='Light chop possible';
  const pToAlt={1013:'Surface',925:'~2,500 ft',850:'~5,000 ft',700:'~10,000 ft',500:'~18,000 ft'};
  return{
    vectorShear:vecShear.toFixed(1),
    severity,
    dirDiff:S._windShear.dirDiff,
    surfaceWind:`${degToDir(sfc.dir)} at ${sfcSpdMph} mph`,
    upperWind:`${degToDir(upper.dir)} at ${upperSpdMph} mph (${pToAlt[upper.p]||upper.p+'hPa'})`,
    impact
  };
}

function directImpactPct(diff){
  if(diff<=1)return 1.0;
  if(diff<=5)return 0.95;
  if(diff<=10)return 0.85;
  if(diff<=15)return 0.65;
  if(diff<=20)return 0.40;
  if(diff<=25)return 0.20;
  return 0;
}
S._scanHistory=[];
S._cellTracks={};
function recordScanSnapshot(){
  if(!S.storms||!S.storms.length)return;
  const snap={ts:Date.now(),cells:S.storms.filter(s=>s.dbz>=25&&s.lat!=null&&s.lng!=null).map(s=>({lat:s.lat,lng:s.lng,dbz:s.dbz,distance:s.distance,bearing:s.bearing}))};
  S._scanHistory.push(snap);
  if(S._scanHistory.length>5)S._scanHistory.shift();
  if(S._scanHistory.length>=2)buildCellTracks();
}
function buildCellTracks(){
  const hist=S._scanHistory;
  const prev=hist[hist.length-2],curr=hist[hist.length-1];
  if(!prev||!curr)return;
  const dtHrs=(curr.ts-prev.ts)/3600000;
  if(dtHrs<=0||dtHrs>1)return;
  const tracks={};
  for(const c of curr.cells){
    let best=null,bestD=Infinity;
    for(const p of prev.cells){
      const d=haversine(c.lat,c.lng,p.lat,p.lng);
      const dbzDiff=Math.abs(c.dbz-p.dbz);
      if(d<bestD&&d<15&&dbzDiff<25){bestD=d;best=p;}
    }
    if(best){
      const dxMi=bestD;
      const spdMph=dxMi/dtHrs;
      if(spdMph>120)continue;
      const dy=c.lat-best.lat,dx=(c.lng-best.lng)*Math.cos(c.lat*Math.PI/180);
      const dir=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
      const key=`${c.lat.toFixed(2)}_${c.lng.toFixed(2)}`;
      tracks[key]={dir:Math.round(dir),speed:Math.round(spdMph),fromLat:best.lat,fromLng:best.lng,toLat:c.lat,toLng:c.lng,dbz:c.dbz};
    }
  }
  S._cellTracks=tracks;
  console.log(`[TRACK] ${Object.keys(tracks).length} cell tracks from ${prev.cells.length}→${curr.cells.length} cells (${(dtHrs*60).toFixed(1)}min gap)`);
}
function getCellTrack(storm){
  if(!S._cellTracks)return null;
  const key=`${storm.lat.toFixed(2)}_${storm.lng.toFixed(2)}`;
  return S._cellTracks[key]||null;
}
S._terrainData=null;
S._terrainLastLat=null;
S._terrainLastLon=null;
async function fetchTerrainGrid(){
  if(!S.lat||!S.lon)return;
  if(S._terrainLastLat&&Math.abs(S.lat-S._terrainLastLat)<0.05&&Math.abs(S.lon-S._terrainLastLon)<0.05&&S._terrainData)return;
  try{
    const pts=[];
    const gridN=9,span=0.35;
    const step=span*2/(gridN-1);
    for(let r=0;r<gridN;r++){
      for(let c=0;c<gridN;c++){
        pts.push({lat:S.lat-span+r*step,lon:S.lon-span+c*step});
      }
    }
    const lats=pts.map(p=>p.lat.toFixed(4)).join(',');
    const lons=pts.map(p=>p.lon.toFixed(4)).join(',');
    const res=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,{signal:AbortSignal.timeout(8000)});
    const data=await res.json();
    const elevs=data.elevation||[];
    if(elevs.length!==gridN*gridN)return;
    const grid=[];
    for(let r=0;r<gridN;r++){
      const row=[];
      for(let c=0;c<gridN;c++) row.push(elevs[r*gridN+c]);
      grid.push(row);
    }
    const channels=[];
    const userElev=grid[Math.floor(gridN/2)][Math.floor(gridN/2)];
    for(let ang=0;ang<360;ang+=15){
      const rad=ang*Math.PI/180;
      let sumElev=0,cnt=0,lowCount=0;
      for(let d=1;d<=4;d++){
        const dr=d*(gridN-1)/(2*4);
        const rr=Math.round(gridN/2+Math.cos(rad+Math.PI/2)*dr);
        const cc=Math.round(gridN/2+Math.cos(rad)*dr);
        if(rr>=0&&rr<gridN&&cc>=0&&cc<gridN){
          sumElev+=grid[rr][cc];cnt++;
          if(grid[rr][cc]<userElev+50)lowCount++;
        }
      }
      if(cnt>0){
        const avgElev=sumElev/cnt;
        channels.push({dir:ang,avgElev,lowRatio:lowCount/cnt,diff:avgElev-userElev});
      }
    }
    const valleys=channels.filter(c=>c.diff<-30&&c.lowRatio>=0.5);
    const ridges=channels.filter(c=>c.diff>80);
    const relief=Math.max(...channels.map(c=>c.avgElev))-Math.min(...channels.map(c=>c.avgElev));
    S._terrainData={userElev,grid,channels,valleys,ridges,relief,gridN,span};
    S._terrainLastLat=S.lat;
    S._terrainLastLon=S.lon;
    console.log(`[TERRAIN] elev=${userElev.toFixed(0)}m relief=${relief.toFixed(0)}m valleys=${valleys.length} ridges=${ridges.length}`);
  }catch(e){console.log('[TERRAIN] fetch failed:',e.message)}
}
function getTerrainEffect(stormDir){
  if(!S._terrainData||S._terrainData.relief<50)return{channelBoost:0,ridgeBlock:0,valleyAlign:false,desc:null};
  const td=S._terrainData;
  let bestValley=null,bestValleyDiff=Infinity;
  for(const v of td.valleys){
    const d1=Math.abs(((stormDir-v.dir+180)%360)-180);
    const d2=Math.abs(((stormDir-(v.dir+180)%360+180)%360)-180);
    const d=Math.min(d1,d2);
    if(d<bestValleyDiff){bestValleyDiff=d;bestValley=v;}
  }
  let channelBoost=0,valleyAlign=false,valleyDesc=null;
  if(bestValley&&bestValleyDiff<30){
    channelBoost=Math.round(Math.max(0,Math.min(12,(30-bestValleyDiff)/30*12*(Math.abs(bestValley.diff)/100))));
    valleyAlign=true;
    valleyDesc=`Valley channel ${bestValley.dir}° (${Math.abs(bestValley.diff).toFixed(0)}m below)`;
  }
  let ridgeBlock=0,ridgeDesc=null;
  for(const r of td.ridges){
    const d=Math.abs(((stormDir-r.dir+180)%360)-180);
    if(d<25){
      const block=Math.round(Math.min(10,(r.diff-80)/150*10));
      if(block>ridgeBlock){ridgeBlock=block;ridgeDesc=`Ridge barrier ${r.dir}° (${r.diff.toFixed(0)}m above)`;}
    }
  }
  const desc=valleyDesc||ridgeDesc||null;
  return{channelBoost,ridgeBlock,valleyAlign,desc};
}
function pointInNWSPolygon(lat,lon){
  if(!S.alerts||!S.alerts.length)return[];
  const matched=[];
  for(const a of S.alerts){
    const geo=a.geometry;
    if(!geo||geo.type!=='Polygon'||!geo.coordinates||!geo.coordinates.length)continue;
    const ring=geo.coordinates[0];
    if(!ring||ring.length<3)continue;
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=ring[i][1],yi=ring[i][0];
      const xj=ring[j][1],yj=ring[j][0];
      if(((yi>lon)!==(yj>lon))&&(lat<(xj-xi)*(lon-yi)/(yj-yi)+xi))inside=!inside;
    }
    if(inside){
      const p=a.properties||{};
      matched.push({event:p.event||'Alert',severity:p.severity||'Unknown',urgency:p.urgency||'',headline:p.headline||''});
    }
  }
  return matched;
}
function calcStormETA(storm){
  if(!S.stormMovement||S.stormMovement.speed<2)return{eta:null,impact:0,approaching:false};
  const cellTrack=getCellTrack(storm);
  const movDir=cellTrack?cellTrack.dir:S.stormMovement.direction;
  const movSpd=cellTrack?cellTrack.speed:S.stormMovement.speed;
  const baseWidthMi=Math.max(0,Math.min(3,(storm.dbz-20)/15));
  const widthAngle=storm.distance>0.5?Math.atan2(baseWidthMi,storm.distance)*180/Math.PI:15;
  const CONE_HALF=15+widthAngle;
  const bearingToUser=(storm.bearing+180)%360;
  const diff=Math.abs(((movDir-bearingToUser+180)%360)-180);
  const inCone=diff<=CONE_HALF;
  const closingSpeed=movSpd*Math.cos(Math.min(diff,60)*Math.PI/180);
  const proxRange=Math.max(1.5,baseWidthMi+0.5);
  const nwsWarnings=pointInNWSPolygon(storm.lat,storm.lng);
  const nwsBoost=nwsWarnings.length>0?15:0;
  const hasSevereWarning=nwsWarnings.some(w=>w.severity==='Severe'||w.severity==='Extreme');
  const terrain=getTerrainEffect(movDir);
  const terrainNet=terrain.channelBoost-terrain.ridgeBlock;
  if(!inCone||closingSpeed<=1){
    if(storm.distance<=proxRange){
      const proxPct=Math.round(Math.min(90,Math.max(0,(proxRange-storm.distance)/proxRange*60+storm.dbz/2.5+nwsBoost+Math.max(0,terrainNet))));
      return{eta:null,impact:proxPct,approaching:false,closingSpeed:0,proximity:true,cellTrack:!!cellTrack,nwsWarnings,terrain:terrain.desc};
    }
    if(hasSevereWarning&&storm.distance<=30){
      const warnPct=Math.round(Math.min(60,25+storm.dbz/3));
      return{eta:null,impact:warnPct,approaching:false,closingSpeed:0,nwsWarning:true,nwsWarnings,terrain:terrain.desc};
    }
    return{eta:null,impact:Math.max(0,nwsBoost+terrainNet),approaching:false,nwsWarnings,terrain:terrain.desc};
  }
  if(storm.distance<=proxRange){
    const proxPct=Math.round(Math.min(95,Math.max(0,(proxRange-storm.distance)/proxRange*60+storm.dbz/2.5+20+nwsBoost+Math.max(0,terrainNet))));
    return{eta:null,impact:proxPct,approaching:false,closingSpeed:0,proximity:true,cellTrack:!!cellTrack,nwsWarnings,terrain:terrain.desc};
  }
  const etaHrs=storm.distance/closingSpeed;
  const etaMin=Math.round(etaHrs*60*100)/100;
  const distScore=Math.max(0,1-storm.distance/80);
  const spdScore=Math.min(1,movSpd/20);
  const intScore=Math.min(1,(storm.dbz-15)/40);
  const widthScore=Math.min(1,baseWidthMi/3);
  const directMult=directImpactPct(diff);
  const trackBonus=cellTrack?5:0;
  const baseScore=directMult*50+distScore*15+spdScore*8+intScore*15+widthScore*12+nwsBoost+trackBonus+terrainNet;
  const closeBoost=storm.distance<20?Math.round((20-storm.distance)/20*25):0;
  let pct=Math.round(Math.min(100,baseScore+closeBoost));
  if(storm.distance<=5&&diff<=15)pct=Math.max(pct,92);
  else if(storm.distance<=10&&diff<=15)pct=Math.max(pct,82);
  else if(storm.distance<=20&&diff<=12)pct=Math.max(pct,72);
  if(hasSevereWarning)pct=Math.max(pct,Math.min(95,pct+20));
  if(storm.distance<=proxRange)pct=Math.max(pct,Math.round(75+(proxRange-storm.distance)/proxRange*20));
  return{eta:etaMin,impact:pct,approaching:pct>0,closingSpeed:Math.round(closingSpeed*100)/100,angleDiff:Math.round(diff),cellTrack:!!cellTrack,trackDir:cellTrack?cellTrack.dir:null,trackSpd:cellTrack?cellTrack.speed:null,nwsWarnings,terrain:terrain.desc};
}
function impactLabel(pct){
  if(pct>=81)return{text:'CRITICAL',color:'#ef4444'};
  if(pct>=61)return{text:'HIGH',color:'#f97316'};
  if(pct>=41)return{text:'MODERATE',color:'#eab308'};
  if(pct>=21)return{text:'LOW',color:'#60a5fa'};
  if(pct>=1)return{text:'MINIMAL',color:'#94a3b8'};
  return{text:'NONE',color:'#6b7280'};
}

async function scanRadarForStorms(){
  if(S._radarAnimPlaying)stopRadarAnim(S.map);
  if(!S.lat)return;
  if(!S._etaRescanInProgress)S._stormETAs={};
  clearViewScanCircle();
  const useNexrad=S.radarSource==='nexrad';
  showScanOverlay();
  await Promise.all([fetchWindsAloft(),fetchAFD()]);
  scanStep(2,'Scanning radar tiles...');
  try{
    const zoom=useNexrad?8:7;
    const radiusDeg=S.scanRadius/69.0;
    const northLat=S.lat+radiusDeg,southLat=S.lat-radiusDeg;
    const eastLon=S.lon+radiusDeg/Math.cos(S.lat*Math.PI/180);
    const westLon=S.lon-radiusDeg/Math.cos(S.lat*Math.PI/180);
    const minTX=lonToTileX(westLon,zoom),maxTX=lonToTileX(eastLon,zoom);
    const minTY=latToTileY(northLat,zoom),maxTY=latToTileY(southLat,zoom);

    if(!useNexrad){
      try{
        const rv=await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json());
        const past=rv.radar?.past||[];
        const nowcast=rv.radar?.nowcast||[];
        const allFrames=past.concat(nowcast);
        S.radarFrames=allFrames;
        S._rvTilePath=allFrames.length?allFrames[allFrames.length-1].path:null;
      }catch(e){S._rvTilePath=null}
      if(!S._rvTilePath){toast('No radar data available');S.storms=[];renderStorms();return}
    }

    const colorFn=useNexrad?nexradToDbz:rvToDbz;
    const minDbz=15;
    const tilePromises=[];
    const tileCount=(maxTX-minTX+1)*(maxTY-minTY+1);
    console.log('[SCAN] src='+S.radarSource+' zoom='+zoom+' tiles='+tileCount+' TX='+minTX+'-'+maxTX+' TY='+minTY+'-'+maxTY+' lat='+S.lat+' lon='+S.lon);
    for(let tx=minTX;tx<=maxTX;tx++){
      for(let ty=minTY;ty<=maxTY;ty++){
        const url=useNexrad
          ?`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tx}/${ty}.png`
          :`https://tilecache.rainviewer.com${S._rvTilePath}/256/${zoom}/${tx}/${ty}/2/1_1.png`;
        tilePromises.push(scanTileForPoints(url,tx,ty,zoom,colorFn,minDbz,S.scanRadius));
      }
    }
    const tileResults=await Promise.all(tilePromises);
    const rawPoints=tileResults.flat();
    console.log('[SCAN] rawPoints='+rawPoints.length+' from '+tileResults.length+' tiles (non-empty: '+tileResults.filter(t=>t.length>0).length+')');

    S._rawScanPts=rawPoints;
    S.storms=spacingFilter(rawPoints).sort((a,b)=>a.distance-b.distance);
    console.log('[SCAN] after spacingFilter: '+S.storms.length+' storms');
    detectHookEchoes(rawPoints, S.storms);
    S.scanTime=Date.now();S.lastScanMs=Date.now();S._lastScanWasHiRes=false;

    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Plotting ${S.storms.length} storm points...`);
    await new Promise(r=>setTimeout(r,300));
    renderStorms();updateStormBadges();drawMiniSonar();
    if(typeof ISO!=='undefined'&&ISO.open){ISO._grid=buildTerrainGrid();ISO._dirty=true;}
    if(S.map){plotStormMarkers(S.map);if(rawPoints.length>0){autoActivateZones()}else{clearStormZones();if(S.radarLayer&&!S.map.hasLayer(S.radarLayer))try{S.radarLayer.addTo(S.map)}catch(e){}}}
    if(S.map){plotSPCWatchPolygons(S.map);plotNWSWarningPolygons(S.map);plotSPCReports(S.map);plotNHCTracks(S.map)}
    updateThreatTicker();
    hideScanOverlay();
    toast(`${S.storms.length} cell${S.storms.length!==1?'s':''} found (${srcLabel})`);
    if(S.map&&S._showPathArrows)setTimeout(()=>buildPathArrows(S.map),150);
    scheduleAutoScan();
    _checkTieredHiRes();
    setTimeout(checkStormCellAlerts,600);
  }catch(e){hideScanOverlay();toast('Radar scan failed: '+e.message);console.error('Scan error:',e)}
}

let _hiResTierDismissed={15:false,10:false,5:false};
let _hiResPopupActive=false;
let _hiResPopupTimer=null;
function _resetHiResTiers(){_hiResTierDismissed={15:false,10:false,5:false}}
function _checkTieredHiRes(){
  if(!S.map||S._lastScanWasHiRes||_hiResPopupActive)return;
  const severe=S.storms.filter(s=>s.dbz>=50);
  if(!severe.length){_resetHiResTiers();return}
  const closest=Math.min(...severe.map(s=>s.distance));
  const tiers=[15,10,5];
  for(const tier of tiers){
    if(closest<=tier&&!_hiResTierDismissed[tier]){
      if(tier===5){
        _showHiResPopup(tier,closest,severe[0].dbz,true);
      }else{
        _showHiResPopup(tier,closest,severe[0].dbz,false);
      }
      return;
    }
  }
}
function _showHiResPopup(tierMi,distMi,peakDbz,autoTrigger){
  _hiResPopupActive=true;
  const existing=document.getElementById('hires-popup');
  if(existing)existing.remove();
  if(_hiResPopupTimer){clearTimeout(_hiResPopupTimer);_hiResPopupTimer=null}
  const popup=document.createElement('div');popup.id='hires-popup';
  const urgent=tierMi<=5;
  const borderClr=urgent?'#ff3333':'#ff8800';
  const bgClr=urgent?'rgba(40,8,8,0.96)':'rgba(20,12,4,0.96)';
  popup.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:${bgClr};border:2px solid ${borderClr};border-radius:12px;padding:18px 22px;max-width:320px;width:90%;box-shadow:0 0 30px rgba(0,0,0,0.8),0 0 15px ${borderClr}40;backdrop-filter:blur(8px);text-align:center;animation:hiresPopIn 0.3s ease`;
  const icon=urgent?'🚨':'⚠️';
  const title=urgent?'SEVERE STORM NEARBY':'Storm Cell Detected';
  const action=autoTrigger?'Launching deep analysis for your safety...':'Would you like a deep analysis?';
  const distUnit=S.radarMetric?Math.round(distMi*1.60934)+' km':distMi.toFixed(1)+' mi';
  let html=`<div style="font-size:1.4em;margin-bottom:6px">${icon}</div>`;
  html+=`<div style="color:${borderClr};font-weight:700;font-size:0.85em;margin-bottom:6px">${title}</div>`;
  html+=`<div style="color:#e2e8f0;font-size:0.7em;margin-bottom:4px">≥50 dBZ cell at <b>${distUnit}</b> (peak ${peakDbz} dBZ)</div>`;
  html+=`<div style="color:rgba(255,255,255,0.6);font-size:0.6em;margin-bottom:12px">${action}</div>`;
  if(autoTrigger){
    html+=`<div id="hires-countdown" style="color:${borderClr};font-size:0.65em;font-weight:600;margin-bottom:8px">Scanning in 5s...</div>`;
    html+=`<button onclick="_hiResAccept()" style="width:100%;padding:8px;border-radius:8px;border:1px solid ${borderClr};background:${borderClr}22;color:${borderClr};font-weight:700;font-size:0.7em;cursor:pointer">Scan Now</button>`;
  }else{
    html+=`<div id="hires-countdown" style="color:rgba(255,255,255,0.4);font-size:0.55em;margin-bottom:10px">Auto-dismiss in 30s</div>`;
    html+=`<div style="display:flex;gap:8px">`;
    html+=`<button onclick="_hiResAccept()" style="flex:1;padding:8px;border-radius:8px;border:1px solid #00cc44;background:rgba(0,204,68,0.15);color:#00cc44;font-weight:700;font-size:0.7em;cursor:pointer">Yes, Scan</button>`;
    html+=`<button onclick="_hiResDecline(${tierMi})" style="flex:1;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);font-weight:600;font-size:0.7em;cursor:pointer">Not Now</button>`;
    html+=`</div>`;
  }
  popup.innerHTML=html;
  document.body.appendChild(popup);
  const timeoutSec=autoTrigger?5:30;
  let remaining=timeoutSec;
  const countEl=()=>document.getElementById('hires-countdown');
  const interval=setInterval(()=>{
    remaining--;
    const el=countEl();
    if(remaining<=0){
      clearInterval(interval);
      if(autoTrigger){_hiResAccept()}
      else{_hiResDecline(tierMi)}
      return;
    }
    if(el){
      if(autoTrigger)el.textContent=`Scanning in ${remaining}s...`;
      else el.textContent=`Auto-dismiss in ${remaining}s`;
    }
  },1000);
  _hiResPopupTimer=interval;
}
function _hiResAccept(){
  _hiResPopupActive=false;
  if(_hiResPopupTimer){clearInterval(_hiResPopupTimer);_hiResPopupTimer=null}
  const p=document.getElementById('hires-popup');if(p)p.remove();
  _resetHiResTiers();
  if(S.map){
    toast('🔍 Launching Hi-Res deep analysis...');
    S.map.setView([S.lat,S.lon],11,{animate:true,duration:0.5});
    setTimeout(()=>scanRadarHiRes(S.map,true),800);
  }
}
function _hiResDecline(tierMi){
  _hiResPopupActive=false;
  if(_hiResPopupTimer){clearInterval(_hiResPopupTimer);_hiResPopupTimer=null}
  const p=document.getElementById('hires-popup');if(p)p.remove();
  _hiResTierDismissed[tierMi]=true;
}
function loadImage(url){
  return fetch(url).then(r=>{
    if(!r.ok)throw new Error('HTTP '+r.status);
    return r.blob();
  }).then(blob=>{
    if(typeof createImageBitmap==='function'){
      return createImageBitmap(blob,{premultiplyAlpha:'none'});
    }
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=URL.createObjectURL(blob);
    });
  });
}
function lonToTileX(lon,z){return Math.floor((lon+180)/360*Math.pow(2,z))}
function latToTileY(lat,z){const r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z))}
function tileXToLon(x,z){return x/Math.pow(2,z)*360-180}
function tileYToLat(y,z){const n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n)))}

function spacingFilter(points,hiRes){
  const validPoints=points.filter(p=>{
    if(p.dbz>=30)return true;
    if(hiRes&&p.dbz>=20)return true;
    const radius=p.dbz>=25?5:8;
    let nearby=0;
    for(const q of points){
      if(q===p)continue;
      const dx=(p.lat-q.lat)*69,dy=(p.lng-q.lng)*69*Math.cos(p.lat*Math.PI/180);
      if(Math.sqrt(dx*dx+dy*dy)<radius)nearby++;
      if(nearby>=1)return true;
    }
    return false;
  });
  validPoints.sort((a,b)=>b.dbz-a.dbz);
  const out=[];
  for(const p of validPoints){
    const minSpacing=hiRes?(p.dbz>=45?0.3:p.dbz>=35?0.4:0.5):(p.dbz>=45?0.8:p.dbz>=35?1.2:1.8);
    let merged=false;
    for(const e of out){
      if(haversine(p.lat,p.lng,e.lat,e.lng)<minSpacing){
        e.pixels++;
        if(p.dbz>e.dbz)e.dbz=p.dbz;
        merged=true;break;
      }
    }
    if(!merged){
      const dist=haversine(S.lat,S.lon,p.lat,p.lng);
      const bear=bearingDeg(S.lat,S.lon,p.lat,p.lng);
      out.push({lat:p.lat,lng:p.lng,dbz:p.dbz,distance:dist,bearing:bear,pixels:1});
    }
  }
  return out;
}

// ==========================================
// HOOK ECHO / TORNADIC SIGNATURE DETECTION
// ==========================================
function detectHookEchoes(rawPts, storms) {
  if (!rawPts || rawPts.length < 20 || !storms || !storms.length) return;
  const strongCells = storms.filter(s => s.dbz >= 45);
  if (!strongCells.length) return;
  for (const cell of strongCells) {
    const score = _computeHookScore(rawPts, cell);
    cell._hookScore = score;
    cell._hookEcho = score >= 0.45;
    if (cell._hookEcho) {
      console.log('[HOOK] Possible rotation detected at', cell.lat.toFixed(3), cell.lng.toFixed(3), 'dBZ=' + cell.dbz, 'hookScore=' + score.toFixed(3));
    }
  }
}
function _computeHookScore(rawPts, cell) {
  const coreRadius = 0.08;
  const hookRadius = 0.22;
  const corePts = [];
  const ringPts = [];
  for (const p of rawPts) {
    const dlat = p.lat - cell.lat;
    const dlng = (p.lng - cell.lng) * Math.cos(cell.lat * Math.PI / 180);
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist <= coreRadius && p.dbz >= 35) corePts.push({ ...p, _dx: dlng, _dy: dlat, _dist: dist });
    else if (dist <= hookRadius && p.dbz >= 15) ringPts.push({ ...p, _dx: dlng, _dy: dlat, _dist: dist });
  }
  if (corePts.length < 5 || ringPts.length < 3) return 0;
  const coreAngles = corePts.map(p => Math.atan2(p._dy, p._dx));
  const ringAngles = ringPts.map(p => Math.atan2(p._dy, p._dx));
  const sectors = 12;
  const sectorSize = (2 * Math.PI) / sectors;
  const coreSectorCounts = new Array(sectors).fill(0);
  const ringSectorCounts = new Array(sectors).fill(0);
  const ringSectorMaxDbz = new Array(sectors).fill(0);
  coreAngles.forEach(a => {
    const idx = Math.floor(((a + Math.PI) / (2 * Math.PI)) * sectors) % sectors;
    coreSectorCounts[idx]++;
  });
  ringPts.forEach(p => {
    const a = Math.atan2(p._dy, p._dx);
    const idx = Math.floor(((a + Math.PI) / (2 * Math.PI)) * sectors) % sectors;
    ringSectorCounts[idx]++;
    if (p.dbz > ringSectorMaxDbz[idx]) ringSectorMaxDbz[idx] = p.dbz;
  });
  let asymmetryScore = 0;
  const coreFilledSectors = coreSectorCounts.filter(c => c > 0).length;
  const coreCompactness = coreFilledSectors / sectors;
  let bestHookRun = 0;
  let bestGapRun = 0;
  let hookRun = 0;
  let gapRun = 0;
  for (let i = 0; i < sectors * 2; i++) {
    const idx = i % sectors;
    if (ringSectorCounts[idx] > 0 && ringSectorMaxDbz[idx] >= 20) {
      hookRun++;
      if (gapRun > bestGapRun) bestGapRun = gapRun;
      gapRun = 0;
    } else {
      if (hookRun > bestHookRun) bestHookRun = hookRun;
      hookRun = 0;
      gapRun++;
    }
  }
  if (hookRun > bestHookRun) bestHookRun = hookRun;
  if (gapRun > bestGapRun) bestGapRun = gapRun;
  const hookArcFraction = Math.min(bestHookRun, sectors) / sectors;
  const gapFraction = Math.min(bestGapRun, sectors) / sectors;
  const hasArc = hookArcFraction >= 0.25 && hookArcFraction <= 0.75;
  const hasNotch = gapFraction >= 0.15;
  if (!hasArc) return 0;
  const notchBonus = hasNotch ? 0.2 : 0;
  asymmetryScore = 1 - coreCompactness;
  const intensityBonus = cell.dbz >= 55 ? 0.15 : cell.dbz >= 50 ? 0.1 : 0;
  let score = (hookArcFraction * 0.4) + (asymmetryScore * 0.2) + notchBonus + intensityBonus;
  const mv = S.stormMovement;
  if (mv && mv.speed >= 15) score += 0.05;
  if (_spcData && _spcData.watches) {
    const inTorWatch = _spcData.watches.some(w => w.type === 'tornado' && _isPointInSpcWatch(cell.lat, cell.lng, w));
    if (inTorWatch) score += 0.1;
  }
  const torWarn = (S.alerts || []).some(a => {
    const ev = (a.properties?.event || '').toLowerCase();
    if (!ev.includes('tornado warning')) return false;
    const geom = a.geometry;
    if (!geom || !geom.coordinates) return false;
    return _pointInAlertPoly(cell.lat, cell.lng, geom);
  });
  if (torWarn) score += 0.15;
  return Math.min(score, 1.0);
}
function _pointInAlertPoly(lat, lng, geom) {
  try {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0];
      if (!ring) continue;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      if (inside) return true;
    }
  } catch (e) {}
  return false;
}
function _isPointInSpcWatch(lat, lng, watch) {
  if (!watch.coords || !watch.coords.length) return false;
  const ring = watch.coords;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
// ==========================================
// SPC DATA (WATCHES, REPORTS, MESOSCALE DISCUSSIONS)
// ==========================================
let _spcData = { watches: null, reports: null, md: null, _lastFetch: 0 };
async function fetchSPCData() {
  if (!isUSLocation(S.lat, S.lon)) { _spcData.watches = []; _spcData.reports = []; _spcData.md = []; return; }
  const now = Date.now();
  if (now - _spcData._lastFetch < 300000 && _spcData.watches !== null) return;
  _spcData._lastFetch = now;
  await Promise.allSettled([_fetchSPCWatches(), _fetchSPCReports(), _fetchSPCMesoscale()]);
}
async function _fetchSPCWatches() {
  try {
    const res = await fetch('https://www.spc.noaa.gov/products/watch/ActiveWW.json', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const watches = [];
    const features = data.features || [];
    for (const f of features) {
      const p = f.properties || {};
      const geom = f.geometry;
      let coords = [];
      if (geom && geom.type === 'Polygon') coords = geom.coordinates[0] || [];
      else if (geom && geom.type === 'MultiPolygon') coords = (geom.coordinates[0] || [])[0] || [];
      const type = (p.WATCH_TYPE || '').toLowerCase().includes('tornado') ? 'tornado' : 'severe';
      const expStr = p.EXPIRATION || p.END_TIME || '';
      let expTime = null;
      if (expStr) { try { expTime = new Date(expStr).getTime(); } catch (e) {} }
      if (expTime && expTime < Date.now()) continue;
      const watchNum = p.WATCH_NUMBER || p.WW || '';
      watches.push({
        type,
        number: watchNum,
        issued: p.ISSUED || p.START_TIME || '',
        expires: expStr,
        expTime,
        states: p.STATES || '',
        coords: coords.map(c => [c[1], c[0]])
      });
    }
    _spcData.watches = watches;
  } catch (e) {
    console.log('[SPC] Watch fetch error:', e.message);
    if (!_spcData.watches) _spcData.watches = [];
  }
}
async function _fetchSPCReports() {
  try {
    const today = new Date();
    const ymd = today.getFullYear().toString().slice(2) + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
    const csvUrl = `https://www.spc.noaa.gov/climo/reports/${ymd}_rpts_filtered.csv`;
    const res = await fetch(csvUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      _spcData.reports = [];
      return;
    }
    const text = await res.text();
    const lines = text.trim().split('\n');
    const reports = [];
    let currentType = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('Time,') || line.startsWith('F_Scale,') || line.startsWith('Speed,') || line.startsWith('Size,')) {
        if (line.includes('F_Scale') || line.includes('f_scale')) currentType = 'tornado';
        else if (line.includes('Speed') || line.includes('speed')) currentType = 'wind';
        else if (line.includes('Size') || line.includes('size')) currentType = 'hail';
        else currentType = currentType || 'tornado';
        continue;
      }
      const cols = line.split(',');
      if (cols.length < 6) continue;
      const lat = parseFloat(cols[5]);
      const lon = parseFloat(cols[6]);
      if (isNaN(lat) || isNaN(lon)) continue;
      const dist = haversine(S.lat, S.lon, lat, lon);
      if (dist > 500) continue;
      reports.push({
        type: currentType || 'unknown',
        time: cols[0] || '',
        magnitude: cols[1] || '',
        location: cols[2] || '',
        county: cols[3] || '',
        state: cols[4] || '',
        lat, lon, dist,
        comment: cols[7] || ''
      });
    }
    reports.sort((a, b) => a.dist - b.dist);
    _spcData.reports = reports;
  } catch (e) {
    console.log('[SPC] Reports fetch error:', e.message);
    if (!_spcData.reports) _spcData.reports = [];
  }
}
async function _fetchSPCMesoscale() {
  try {
    const res = await fetch('https://www.spc.noaa.gov/products/md/', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const mdList = [];
    const regex = /md(\d{4})\.html/g;
    let match;
    const seen = new Set();
    while ((match = regex.exec(html)) !== null) {
      const num = match[1];
      if (seen.has(num)) continue;
      seen.add(num);
      mdList.push({ number: num });
    }
    const detailPromises = mdList.slice(0, 10).map(async (md) => {
      try {
        const dRes = await fetch(`https://www.spc.noaa.gov/products/md/md${md.number}.html`, { signal: AbortSignal.timeout(6000) });
        if (!dRes.ok) return md;
        const dHtml = await dRes.text();
        const titleMatch = dHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        md.title = titleMatch ? titleMatch[1].trim() : 'Mesoscale Discussion #' + md.number;
        const concernMatch = dHtml.match(/CONCERNING\.\.\.([^\n]+)/i);
        md.concerning = concernMatch ? concernMatch[1].trim() : '';
        const areaMatch = dHtml.match(/AREAS?\s+AFFECTED\.\.\.([^\n]+)/i) || dHtml.match(/AREAS?\s*\.\.\.([^\n]+)/i);
        md.area = areaMatch ? areaMatch[1].trim() : '';
        const validMatch = dHtml.match(/VALID\s+(\d{6}Z)\s*-\s*(\d{6}Z)/i);
        if (validMatch) {
          md.validFrom = validMatch[1];
          md.validTo = validMatch[2];
        }
        const isTornado = /tornado|tornad/i.test(dHtml);
        const isSevere = /severe|svr|hail|wind damage/i.test(dHtml);
        md.type = isTornado ? 'tornado' : isSevere ? 'severe' : 'general';
        const llMatch = dHtml.match(/LAT\.{3}LON\s+([\d\s]+)/i);
        if (llMatch) {
          const nums = llMatch[1].trim().split(/\s+/);
          const pts = [];
          for (const n of nums) {
            if (n.length >= 7 && n.length <= 9) {
              const lat = parseInt(n.substring(0, 4)) / 100;
              const lonRaw = parseInt(n.substring(4));
              const lon = lonRaw > 999 ? -(lonRaw / 100) : -(lonRaw / 10);
              if (lat > 15 && lat < 60 && lon > -180 && lon < -50) pts.push({ lat, lon });
            }
          }
          if (pts.length > 0) {
            md._pts = pts;
            let sumLat = 0, sumLon = 0;
            pts.forEach(p => { sumLat += p.lat; sumLon += p.lon; });
            md.lat = sumLat / pts.length; md.lon = sumLon / pts.length;
          }
        }
        return md;
      } catch (e) { return md; }
    });
    const details = await Promise.allSettled(detailPromises);
    _spcData.md = details.filter(d => d.status === 'fulfilled').map(d => d.value);
    console.log('[SPC] Mesoscale discussions:', _spcData.md.length);
  } catch (e) {
    console.log('[SPC] MD fetch error:', e.message);
    if (!_spcData.md) _spcData.md = [];
  }
}
S._spcReportMarkers = [];
function plotSPCReports(map) {
  S._spcReportMarkers.forEach(m => { try { map.removeLayer(m); } catch (e) {} });
  S._spcReportMarkers = [];
  if (!_spcData.reports || !_spcData.reports.length || !S._showSPCReports) return;
  const reports = _spcData.reports.filter(r => r.dist <= (S.scanRadius || 80) * 2);
  for (const r of reports.slice(0, 50)) {
    const icon = r.type === 'tornado' ? '🌪️' : r.type === 'hail' ? '🧊' : r.type === 'wind' ? '💨' : '⚠️';
    const color = r.type === 'tornado' ? '#ff1744' : r.type === 'hail' ? '#00e5ff' : '#ff9800';
    const label = r.type === 'tornado' ? 'Tornado' : r.type === 'hail' ? 'Hail (' + r.magnitude + '")' : 'Wind (' + r.magnitude + ' mph)';
    const marker = L.marker([r.lat, r.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div style="font-size:16px;text-shadow:0 0 4px ${color};filter:drop-shadow(0 0 3px ${color})">${icon}</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    });
    marker.bindPopup(`<div style="text-align:center;font-family:system-ui;min-width:140px">
      <div style="font-size:1.1em;font-weight:700;color:${color}">${icon} ${label}</div>
      <div style="font-size:0.75em;color:#ccc;margin-top:4px">${r.location}, ${r.state}</div>
      <div style="font-size:0.7em;color:#aaa;margin-top:2px">${r.time} UTC · ${Math.round(r.dist)} mi away</div>
      ${r.comment ? '<div style="font-size:0.65em;color:#888;margin-top:4px;font-style:italic">' + r.comment + '</div>' : ''}
    </div>`);
    marker.addTo(map);
    S._spcReportMarkers.push(marker);
  }
}
S._showSPCReports = (() => { try { const v = localStorage.getItem('st_spc_reports'); return v === null ? true : v === '1'; } catch(e) { return true; } })();
S._spcWatchPolys = [];
function plotSPCWatchPolygons(map) {
  S._spcWatchPolys.forEach(l => { try { map.removeLayer(l); } catch (e) {} });
  S._spcWatchPolys = [];
  if (!_spcData.watches || !_spcData.watches.length) return;
  for (const w of _spcData.watches) {
    if (!w.coords || w.coords.length < 3) continue;
    const color = w.type === 'tornado' ? '#ff1744' : '#ff9800';
    const poly = L.polygon(w.coords, {
      color: color,
      fillColor: color,
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '6,4',
      interactive: false
    });
    poly.addTo(map);
    S._spcWatchPolys.push(poly);
  }
}
S._nwsWarnPolys = [];
S._showAlertPolygons = true;
function _alertPolyColor(ev) {
  const t = (ev || '').toLowerCase();
  if (t.includes('tornado')) return '#DC2626';
  if (t.includes('severe thunderstorm')) return '#F97316';
  if (t.includes('flash flood') || t.includes('flood')) return '#3B82F6';
  if (t.includes('hurricane') || t.includes('typhoon') || t.includes('tropical storm')) return '#9333EA';
  if (t.includes('winter storm') || t.includes('blizzard') || t.includes('ice storm')) return '#06B6D4';
  if (t.includes('fire') || t.includes('red flag')) return '#B91C1C';
  if (t.includes('watch')) return '#EAB308';
  if (t.includes('warning')) return '#F97316';
  if (t.includes('advisory')) return '#A3E635';
  return '#F59E0B';
}
function _pointInRingHTML(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1], yi = ring[i][0];
    const xj = ring[j][1], yj = ring[j][0];
    if (((yi > lon) !== (yj > lon)) && (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function isUserInAlertZone(alert) {
  if (!S.lat || !S.lon) return false;
  const geom = alert.geometry;
  if (!geom || !geom.coordinates) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const rings of polys) {
    if (!rings[0] || rings[0].length < 3) continue;
    if (!_pointInRingHTML(S.lat, S.lon, rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < rings.length; h++) { if (_pointInRingHTML(S.lat, S.lon, rings[h])) { inHole = true; break; } }
    if (!inHole) return true;
  }
  return false;
}
function toggleAlertPolygons() {
  S._showAlertPolygons = !S._showAlertPolygons;
  const btn = document.getElementById('btn-alert-polys');
  if (btn) btn.style.opacity = S._showAlertPolygons ? '1' : '0.4';
  if (S.map) plotNWSWarningPolygons(S.map);
}
function plotNWSWarningPolygons(map) {
  S._nwsWarnPolys.forEach(l => { try { map.removeLayer(l); } catch (e) {} });
  S._nwsWarnPolys = [];
  if (!S._showAlertPolygons || !S.alerts || !S.alerts.length) return;
  for (const a of S.alerts) {
    const ev = a.properties?.event || '';
    const geom = a.geometry;
    if (!geom || !geom.coordinates) continue;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    const color = _alertPolyColor(ev);
    const isTor = ev.toLowerCase().includes('tornado warning');
    for (const coords of polys) {
      const ring = coords[0];
      if (!ring || ring.length < 3) continue;
      const latlngs = ring.map(c => [c[1], c[0]]);
      const poly = L.polygon(latlngs, {
        color: color,
        fillColor: color,
        fillOpacity: isTor ? 0.18 : 0.15,
        weight: isTor ? 3 : 2,
        dashArray: isTor ? null : '4,4'
      });
      const sev = a.properties?.severity || '';
      const headline = a.properties?.headline || ev;
      const expires = a.properties?.expires ? new Date(a.properties.expires).toLocaleString() : 'Unknown';
      poly.bindPopup(`<div style="max-width:260px;font-family:system-ui,sans-serif"><div style="font-weight:700;font-size:13px;color:${color};margin-bottom:3px">${escHtml(ev)}</div><div style="font-size:11px;margin-bottom:5px">${escHtml(headline)}</div><div style="font-size:10px;color:#888"><b>Severity:</b> ${escHtml(sev)}<br><b>Expires:</b> ${expires}</div></div>`);
      poly.addTo(map);
      S._nwsWarnPolys.push(poly);
    }
  }
}
// ==========================================
// NHC TROPICAL CYCLONE TRACKING
// ==========================================
const _nhcData = { systems: null, forecast: null, cones: null, windRadii: null, _lastFetch: 0 };
S._nhcTrackLayers = [];
S._nhcSelectedStorm = null;
S._showNHCTracks = (() => { try { const v = localStorage.getItem('st_nhc_tracks'); return v === null ? true : v === '1'; } catch(e) { return true; } })();
S._nhcProxRadius = (() => { try { const v = parseInt(localStorage.getItem('st_nhc_prox_radius')); return v > 0 ? v : 200; } catch(e) { return 200; } })();
const _STORM_REGIONS = [
  { id: 'all', label: 'All Basins' },
  { id: 'gulf', label: 'Gulf of Mexico' },
  { id: 'caribbean', label: 'Caribbean' },
  { id: 'atlantic', label: 'Atlantic' },
  { id: 'epac', label: 'E. Pacific' },
  { id: 'wpac', label: 'W. Pacific' },
  { id: 'io', label: 'Indian Ocean' },
  { id: 'spac', label: 'S. Pacific' }
];
S._nhcRegionFilter = (() => { try { const v = localStorage.getItem('st_nhc_region'); return v && _STORM_REGIONS.some(r => r.id === v) ? v : 'all'; } catch(e) { return 'all'; } })();
function _classifyStormRegion(lat, lon) {
  if (lat == null || lon == null) return 'atlantic';
  if (lat >= 18 && lat <= 31 && lon >= -98 && lon <= -81) return 'gulf';
  if (lat >= 8 && lat <= 22 && lon >= -90 && lon <= -58) return 'caribbean';
  if (lat >= 0) {
    if (lon >= -140 && lon < -80) return 'epac';
    if ((lon >= -180 && lon < -140) || (lon >= 100 && lon <= 180)) return 'wpac';
    if (lon >= 40 && lon < 100) return 'io';
    return 'atlantic';
  }
  if (lon >= 20 && lon < 135) return 'io';
  if ((lon >= 135 && lon <= 180) || (lon >= -180 && lon < -120)) return 'spac';
  return 'atlantic';
}
function _getFilteredSystems() {
  const systems = _nhcData.systems;
  if (!systems || S._nhcRegionFilter === 'all') return systems;
  return systems.filter(s => s._region === S._nhcRegionFilter);
}
function setNHCRegionFilter(val) {
  S._nhcRegionFilter = val;
  try { localStorage.setItem('st_nhc_region', val); } catch(e) {}
  _updateTropicalUI();
  if (S.map) plotNHCTracks(S.map);
  if (S.activePage === 'alerts') renderAlerts();
  const label = (_STORM_REGIONS.find(r => r.id === val) || {}).label || val;
  toast('Region filter: ' + label);
}
function _recomputeNHCUserFields() {
  if (!_nhcData.systems) return;
  _nhcData.systems.forEach(s => {
    s.category = _saffirSimpson(s.maxWind);
    s._region = _classifyStormRegion(s.lat, s.lon);
    if (s.lat != null && s.lon != null && S.lat) s.dist = haversine(S.lat, S.lon, s.lat, s.lon);
    else s.dist = null;
    s._inCone = _isUserInCone(s);
    s._tropAlerts = _getTropicalAlertsForStorm(s);
  });
  _nhcData.systems.sort((a, b) => (a.dist || 99999) - (b.dist || 99999));
}
async function fetchNHCData() {
  const now = Date.now();
  if (now - _nhcData._lastFetch < 900000 && _nhcData.systems !== null) {
    _recomputeNHCUserFields();
    return;
  }
  _nhcData._lastFetch = now;
  try {
    const [gisRes, rssRes, surgeRes, jtwcRes] = await Promise.allSettled([
      _fetchNHCGIS(),
      _fetchNHCActiveStorms(),
      fetch('https://www.nhc.noaa.gov/CurrentSurges.json', { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null).catch(() => null),
      _fetchJTWCStorms()
    ]);
    const gis = gisRes.status === 'fulfilled' ? gisRes.value : null;
    const rssStorms = rssRes.status === 'fulfilled' ? rssRes.value : [];
    const surgeData = surgeRes.status === 'fulfilled' ? surgeRes.value : null;
    const jtwcStorms = jtwcRes.status === 'fulfilled' ? jtwcRes.value : [];
    let storms = [];
    if (gis && gis.positions && gis.positions.length) {
      storms = gis.positions;
      _nhcData.forecast = gis.tracks || [];
      _nhcData.cones = gis.cones || [];
      _nhcData.windRadii = gis.windRadii || [];
      for (const rs of rssStorms) {
        const existing = storms.find(s => s.name.toLowerCase() === rs.name.toLowerCase());
        if (existing) {
          if (!existing.maxWind && rs.maxWind) existing.maxWind = rs.maxWind;
          if (!existing.minPressure && rs.minPressure) existing.minPressure = rs.minPressure;
          if (!existing.moveDir && rs.moveDir) { existing.moveDir = rs.moveDir; existing.moveSpeed = rs.moveSpeed; }
          if (!existing.gusts && rs.gusts) existing.gusts = rs.gusts;
          if (!existing.link) existing.link = rs.link;
        } else {
          storms.push(rs);
        }
      }
    } else {
      storms = rssStorms;
      _nhcData.forecast = [];
      _nhcData.cones = [];
      _nhcData.windRadii = [];
    }
    if (surgeData && surgeData.activeStorms) {
      for (const surge of surgeData.activeStorms) {
        const existing = storms.find(s => s.id === surge.id || s.name === surge.name);
        if (existing) existing.surgeData = surge;
      }
    }
    if (jtwcStorms && jtwcStorms.length) {
      for (const js of jtwcStorms) {
        const dup = storms.find(s => s.name.toLowerCase() === js.name.toLowerCase());
        if (!dup) storms.push(js);
      }
    }
    _nhcData.systems = storms;
    _nhcData.surgeRaw = surgeData;
    _recomputeNHCUserFields();
    console.log('[NHC+JTWC] Tropical systems:', storms.length, 'NHC tracks:', (_nhcData.forecast||[]).length, 'cones:', (_nhcData.cones||[]).length, 'JTWC:', jtwcStorms.length);
  } catch (e) {
    console.log('[NHC] Fetch error:', e.message);
    if (!_nhcData.systems) _nhcData.systems = [];
  }
}
async function _fetchNHCGIS() {
  const base = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Active_Hurricanes_v1/FeatureServer';
  const q = 'where=1%3D1&outFields=*&f=geojson&resultRecordCount=500';
  const result = { positions: [], tracks: [], cones: [], windRadii: [] };
  try {
    const [posRes, trkRes, coneRes, wr34Res, wr50Res, wr64Res] = await Promise.allSettled([
      fetch(`${base}/0/query?${q}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/2/query?${q}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/4/query?${q}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/7/query?${q}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/8/query?${q}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/9/query?${q}`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : null)
    ]);
    const posData = posRes.status === 'fulfilled' ? posRes.value : null;
    const trkData = trkRes.status === 'fulfilled' ? trkRes.value : null;
    const coneData = coneRes.status === 'fulfilled' ? coneRes.value : null;
    const wr34Data = wr34Res.status === 'fulfilled' ? wr34Res.value : null;
    const wr50Data = wr50Res.status === 'fulfilled' ? wr50Res.value : null;
    const wr64Data = wr64Res.status === 'fulfilled' ? wr64Res.value : null;
    if (posData && posData.features) {
      const seen = new Set();
      for (const f of posData.features) {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates;
        if (!coords) continue;
        const name = p.STORMNAME || p.NAME || 'Unknown';
        const stormId = p.STORMID || p.ATCFID || '';
        const tau = p.TAU || p.ADVDATE || 0;
        const key = name + '_' + stormId;
        if (seen.has(key)) continue;
        seen.add(key);
        const windKt = p.MAXWIND || p.INTENSITY || null;
        const maxWind = windKt ? Math.round(windKt * 1.15078) : null;
        const stormType = p.STORMTYPE || (maxWind >= 74 ? 'Hurricane' : maxWind >= 39 ? 'Tropical Storm' : 'Tropical Depression');
        const basin = stormId.startsWith('EP') ? 'ep' : 'at';
        result.positions.push({
          id: stormId, name, type: stormType, basin,
          lat: coords[1], lon: coords[0],
          maxWind, gusts: p.GUST ? Math.round(p.GUST * 1.15078) : null,
          minPressure: p.MSLP || null,
          moveDir: p.STORMDIR ? _degToCompass(p.STORMDIR) : null,
          moveSpeed: p.STORMSPED ? Math.round(p.STORMSPED * 1.15078) : null,
          link: null, surgeData: null, forecastHr: tau
        });
      }
    }
    if (trkData && trkData.features) {
      for (const f of trkData.features) {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates;
        if (!coords) continue;
        result.tracks.push({
          stormId: p.STORMID || p.ATCFID || '',
          stormName: p.STORMNAME || '',
          coords: Array.isArray(coords[0]) && Array.isArray(coords[0][0]) ? coords[0] : coords,
          forecastPeriod: p.FCSTPRD || '120'
        });
      }
    }
    if (coneData && coneData.features) {
      for (const f of coneData.features) {
        const p = f.properties || {};
        const geom = f.geometry;
        if (!geom || !geom.coordinates) continue;
        const polyCoords = geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : (geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates);
        result.cones.push({
          stormId: p.STORMID || p.ATCFID || '',
          stormName: p.STORMNAME || '',
          coords: polyCoords,
          forecastPeriod: p.FCSTPRD || '120'
        });
      }
    }
    const _parseWindRadii = (data, ktLevel) => {
      if (!data || !data.features) return;
      for (const f of data.features) {
        const p = f.properties || {};
        const geom = f.geometry;
        if (!geom || !geom.coordinates) continue;
        const polyCoords = geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : (geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates);
        result.windRadii.push({
          stormId: p.STORMID || p.ATCFID || '',
          stormName: p.STORMNAME || '',
          ktLevel,
          coords: polyCoords
        });
      }
    };
    _parseWindRadii(wr34Data, 34);
    _parseWindRadii(wr50Data, 50);
    _parseWindRadii(wr64Data, 64);
  } catch (e) {
    console.log('[NHC] ArcGIS fetch error:', e.message);
  }
  return result;
}
function _degToCompass(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}
async function _fetchNHCActiveStorms() {
  const storms = [];
  const basins = [
    { code: 'at', url: 'https://www.nhc.noaa.gov/index-at.xml', prefix: 'AL' },
    { code: 'ep', url: 'https://www.nhc.noaa.gov/index-ep.xml', prefix: 'EP' }
  ];
  for (const basin of basins) {
    try {
      const res = await fetch(basin.url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const text = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const items = doc.querySelectorAll('item');
      const seen = new Set();
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const desc = item.querySelector('description')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const stormMatch = title.match(/(Hurricane|Tropical Storm|Tropical Depression|Post-Tropical|Subtropical|Remnants of)\s+(.+?)(?:\s+(?:Advisory|Forecast|Update|Graphics|Key Messages|Discussion|Watches|Warnings|Wind Speed|Public|Intermediate|Special))/i)
          || title.match(/(Hurricane|Tropical Storm|Tropical Depression|Post-Tropical|Subtropical|Remnants of)\s+(\w[\w\s-]*\w)/i);
        if (!stormMatch) return;
        const stormType = stormMatch[1];
        const stormName = stormMatch[2].trim().replace(/\s+(Advisory|Forecast|Update|Public).*$/i, '');
        if (seen.has(stormName)) return;
        seen.add(stormName);
        const latMatch = desc.match(/(\d+\.?\d*)\s*°?\s*([NS])/i);
        const lonMatch = desc.match(/(\d+\.?\d*)\s*°?\s*([EW])/i);
        const windMatch = desc.match(/(?:Max(?:imum)?\s+)?(?:sustained\s+)?winds?[:\s]+(\d+)\s*(mph|kt|knots)/i);
        const pressMatch = desc.match(/(?:min(?:imum)?\s+)?(?:central\s+)?pressure[:\s]+(\d+)\s*mb/i);
        const moveMatch = desc.match(/(?:moving|headed?)\s+([\w-]+(?:\s*[\w-]+)?)\s+(?:at\s+)?(\d+)\s*(mph|kt|knots)/i);
        const gustMatch = desc.match(/gusts?\s+(?:up\s+to\s+)?(\d+)\s*(mph|kt|knots)/i);
        let lat = null, lon = null;
        if (latMatch) lat = parseFloat(latMatch[1]) * (latMatch[2].toUpperCase() === 'S' ? -1 : 1);
        if (lonMatch) lon = parseFloat(lonMatch[1]) * (lonMatch[2].toUpperCase() === 'W' ? -1 : 1);
        const _ktToMph = (v, unit) => (unit && (unit.toLowerCase() === 'kt' || unit.toLowerCase() === 'knots')) ? Math.round(v * 1.15078) : v;
        const maxWind = windMatch ? _ktToMph(parseInt(windMatch[1]), windMatch[2]) : null;
        const minPressure = pressMatch ? parseInt(pressMatch[1]) : null;
        const moveDir = moveMatch ? moveMatch[1] : null;
        const moveSpeed = moveMatch ? _ktToMph(parseInt(moveMatch[2]), moveMatch[3]) : null;
        const gusts = gustMatch ? _ktToMph(parseInt(gustMatch[1]), gustMatch[2]) : null;
        const idMatch = link.match(/\/([AE][LP]\d{6})/i);
        const stormId = idMatch ? idMatch[1].toUpperCase() : basin.prefix + stormName.substring(0, 4).toUpperCase();
        storms.push({
          id: stormId, name: stormName, type: stormType, basin: basin.code,
          lat, lon, maxWind, gusts, minPressure, category: null,
          moveDir, moveSpeed, dist: null,
          link, surgeData: null
        });
      });
    } catch (e) {
      console.log('[NHC] Basin ' + basin.code + ' RSS error:', e.message);
    }
  }
  return storms;
}
async function _fetchJTWCStorms() {
  const storms = [];
  try {
    const jtwcUrl = 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss';
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(jtwcUrl);
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return storms;
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const items = doc.querySelectorAll('item');
    const seen = new Set();
    items.forEach(item => {
      const title = item.querySelector('title')?.textContent || '';
      const desc = item.querySelector('description')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const stormMatch = title.match(/(Typhoon|Tropical Storm|Tropical Depression|Super Typhoon|Tropical Cyclone|Post-Tropical|Subtropical)\s+(\d{2}[WSEABICP])\s*[\(:\s]+([^)]+)/i)
        || title.match(/(Typhoon|Tropical Storm|Tropical Depression|Super Typhoon|Tropical Cyclone)\s+(.+?)(?:\s+(?:Warning|Advisory|Prognostic|TCFA))/i)
        || title.match(/(Typhoon|Super Typhoon|Tropical Storm|Tropical Depression|Tropical Cyclone)\s+(.+)/i);
      if (!stormMatch) return;
      const stormType = stormMatch[1];
      let stormName = (stormMatch[3] || stormMatch[2]).trim().replace(/\s*\(.*$/, '');
      const stormCode = stormMatch[2] || '';
      if (seen.has(stormName.toUpperCase())) return;
      seen.add(stormName.toUpperCase());
      const latMatch = desc.match(/(\d+\.?\d*)\s*°?\s*([NS])/i);
      const lonMatch = desc.match(/(\d+\.?\d*)\s*°?\s*([EW])/i);
      const windMatch = desc.match(/(?:max(?:imum)?\s+)?(?:sustained\s+)?winds?[:\s]+(\d+)\s*(mph|kt|knots|kph)/i);
      const pressMatch = desc.match(/(?:min(?:imum)?\s+)?(?:central\s+)?pressure[:\s]+(\d+)\s*(?:mb|hpa)/i);
      const moveMatch = desc.match(/(?:moving|headed?)\s+([\w-]+(?:\s*[\w-]+)?)\s+(?:at\s+)?(\d+)\s*(mph|kt|knots|kph)/i);
      const gustMatch = desc.match(/gusts?\s+(?:up\s+to\s+)?(\d+)\s*(mph|kt|knots|kph)/i);
      let lat = null, lon = null;
      if (latMatch) lat = parseFloat(latMatch[1]) * (latMatch[2].toUpperCase() === 'S' ? -1 : 1);
      if (lonMatch) lon = parseFloat(lonMatch[1]) * (lonMatch[2].toUpperCase() === 'W' ? -1 : 1);
      const _convertWind = (v, unit) => {
        if (!unit) return v;
        const u = unit.toLowerCase();
        if (u === 'kt' || u === 'knots') return Math.round(v * 1.15078);
        if (u === 'kph') return Math.round(v * 0.621371);
        return v;
      };
      const maxWind = windMatch ? _convertWind(parseInt(windMatch[1]), windMatch[2]) : null;
      const minPressure = pressMatch ? parseInt(pressMatch[1]) : null;
      const moveDir = moveMatch ? moveMatch[1] : null;
      const moveSpeed = moveMatch ? _convertWind(parseInt(moveMatch[2]), moveMatch[3]) : null;
      const gusts = gustMatch ? _convertWind(parseInt(gustMatch[1]), gustMatch[2]) : null;
      let basin = 'wp';
      if (stormCode.match(/\d{2}[ABI]/i)) basin = 'io';
      else if (stormCode.match(/\d{2}[SP]/i)) basin = 'sp';
      else if (stormCode.match(/\d{2}[C]/i)) basin = 'cp';
      const stormId = 'JTWC_' + (stormCode || stormName.substring(0, 6).toUpperCase());
      storms.push({
        id: stormId, name: stormName, type: stormType, basin,
        lat, lon, maxWind, gusts, minPressure, category: null,
        moveDir, moveSpeed, dist: null,
        link: link || 'https://www.metoc.navy.mil/jtwc/jtwc.html',
        surgeData: null, _source: 'jtwc'
      });
    });
  } catch (e) {
    console.log('[JTWC] Fetch error:', e.message);
  }
  return storms;
}
function _isUserInCone(storm) {
  if (!S.lat || !S.lon || !_nhcData.cones) return false;
  const cone = _nhcData.cones.find(c => c.stormId === storm.id || c.stormName.toLowerCase() === storm.name.toLowerCase());
  if (!cone || !cone.coords || cone.coords.length < 3) return false;
  const ring = cone.coords;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1] != null ? ring[i][1] : ring[i][0];
    const yi = ring[i][0] != null ? ring[i][0] : ring[i][1];
    const xj = ring[j][1] != null ? ring[j][1] : ring[j][0];
    const yj = ring[j][0] != null ? ring[j][0] : ring[j][1];
    if (((yi > S.lon) !== (yj > S.lon)) && (S.lat < (xj - xi) * (S.lon - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function _getTropicalAlertsForStorm(storm) {
  if (!S.alerts) return { watches: [], warnings: [] };
  const name = (storm.name || '').toLowerCase();
  const stormId = (storm.id || '').toLowerCase();
  const watches = [];
  const warnings = [];
  for (const a of S.alerts) {
    const ev = (a.properties?.event || '').toLowerCase();
    const desc = (a.properties?.description || '').toLowerCase();
    const headline = (a.properties?.headline || '').toLowerCase();
    const isTropical = ev.includes('hurricane') || ev.includes('tropical storm') || ev.includes('storm surge') || ev.includes('tropical depression');
    if (!isTropical) continue;
    const matchesStorm = (name.length >= 3 && (desc.includes(name) || headline.includes(name))) || (stormId && desc.includes(stormId));
    if (!matchesStorm) continue;
    const inZone = isUserInAlertZone(a);
    if (ev.includes('warning')) warnings.push({ event: a.properties?.event, inZone });
    else if (ev.includes('watch')) watches.push({ event: a.properties?.event, inZone });
  }
  return { watches, warnings };
}
function _saffirSimpson(windMph) {
  if (!windMph) return { cat: 'Unknown', label: 'Unknown', color: '#888', num: -1 };
  if (windMph >= 157) return { cat: 'Cat 5', label: 'Category 5', color: '#ff1744', num: 5 };
  if (windMph >= 130) return { cat: 'Cat 4', label: 'Category 4', color: '#ff5722', num: 4 };
  if (windMph >= 111) return { cat: 'Cat 3', label: 'Category 3', color: '#ff9800', num: 3 };
  if (windMph >= 96) return { cat: 'Cat 2', label: 'Category 2', color: '#ffc107', num: 2 };
  if (windMph >= 74) return { cat: 'Cat 1', label: 'Category 1', color: '#ffeb3b', num: 1 };
  if (windMph >= 39) return { cat: 'TS', label: 'Tropical Storm', color: '#4fc3f7', num: 0 };
  return { cat: 'TD', label: 'Tropical Depression', color: '#90caf9', num: -1 };
}
function _tropicalStatusLabel(storm) {
  const w = storm._tropAlerts || { watches: [], warnings: [] };
  const inCone = storm._inCone;
  const warnInZone = w.warnings.some(x => x.inZone);
  const watchInZone = w.watches.some(x => x.inZone);
  if (warnInZone) return { text: '⚠️ WARNING', color: '#ff1744', bg: 'rgba(255,23,68,0.15)' };
  if (watchInZone) return { text: '👁️ WATCH', color: '#ffc107', bg: 'rgba(255,193,7,0.15)' };
  if (inCone) return { text: '🎯 IN CONE', color: '#ff9800', bg: 'rgba(255,152,0,0.15)' };
  if (storm.dist != null && storm.dist <= S._nhcProxRadius) return { text: '📡 TRACKING', color: '#4fc3f7', bg: 'rgba(79,195,247,0.15)' };
  return null;
}
function _escStormName(name) {
  return (name || '').replace(/['"\\<>&]/g, '');
}
function _renderTropicalSection() {
  const allSystems = _nhcData.systems;
  if (allSystems === null) {
    return `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">🌀</span> Tropical Cyclones</div>
      <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.8em">🔄 Loading tropical data...</div></div>`;
  }
  const systems = _getFilteredSystems() || [];
  const regionPills = _STORM_REGIONS.map(r => {
    const count = r.id === 'all' ? allSystems.length : allSystems.filter(s => s._region === r.id).length;
    const isActive = S._nhcRegionFilter === r.id;
    return `<button onclick="setNHCRegionFilter('${r.id}')" style="font-size:0.6em;padding:2px 8px;border-radius:12px;border:1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-subtle)'};background:${isActive ? 'rgba(0,229,255,0.15)' : 'var(--bg-surface)'};color:${isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'};cursor:pointer;font-weight:${isActive ? '700' : '500'};white-space:nowrap">${r.label}${count ? ' (' + count + ')' : ''}</button>`;
  }).join('');
  if (!allSystems.length) {
    return `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">🌀</span> Tropical Cyclones</div>
      <div style="text-align:center;padding:16px;color:var(--accent-green);font-size:0.8em">✅ No active tropical systems</div>
      <div style="font-size:0.6em;color:var(--text-muted);text-align:center;padding:0 8px 8px">Data: NHC + JTWC · ArcGIS + RSS</div></div>`;
  }
  let html = `<div class="card" style="margin-top:12px"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center"><span><span class="icon">🌀</span> Tropical Cyclones (${systems.length}${S._nhcRegionFilter !== 'all' ? '/' + allSystems.length : ''})</span><label style="display:flex;align-items:center;gap:4px;font-size:0.65em;font-weight:500;color:var(--text-muted);cursor:pointer"><span>Map</span><input type="checkbox" ${S._showNHCTracks ? 'checked' : ''} onchange="toggleNHCTracks(this.checked)" style="accent-color:var(--accent-cyan)"></label></div>`;
  html += `<div style="display:flex;gap:4px;margin-bottom:8px;padding:0 4px;flex-wrap:wrap;overflow-x:auto">${regionPills}</div>`;
  const catScale = `<div style="display:flex;gap:2px;margin-bottom:8px;padding:0 4px;flex-wrap:wrap">
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#90caf920;color:#90caf9;font-weight:600">TD</span>
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#4fc3f720;color:#4fc3f7;font-weight:600">TS</span>
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#ffeb3b20;color:#ffeb3b;font-weight:600">Cat 1</span>
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#ffc10720;color:#ffc107;font-weight:600">Cat 2</span>
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#ff980020;color:#ff9800;font-weight:600">Cat 3</span>
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#ff572220;color:#ff5722;font-weight:600">Cat 4</span>
    <span style="font-size:0.55em;padding:1px 5px;border-radius:4px;background:#ff174420;color:#ff1744;font-weight:600">Cat 5</span>
  </div>`;
  html += catScale;
  if (!systems.length) {
    const filterLabel = (_STORM_REGIONS.find(r => r.id === S._nhcRegionFilter) || {}).label || S._nhcRegionFilter;
    html += `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.75em">No active systems in ${filterLabel}</div>`;
  }
  systems.forEach((s, idx) => {
    const cat = s.category || _saffirSimpson(s.maxWind);
    const distStr = s.dist != null ? (S.radarMetric ? Math.round(s.dist * 1.60934) + ' km' : Math.round(s.dist) + ' mi') : 'Unknown';
    const bearing = (s.lat != null && s.lon != null) ? degToDir(bearingDeg(S.lat, S.lon, s.lat, s.lon)) : '';
    const isNear = s.dist != null && s.dist <= S._nhcProxRadius;
    const status = _tropicalStatusLabel(s);
    const hasForecast = (_nhcData.forecast || []).some(t => t.stormId === s.id || t.stormName.toLowerCase() === s.name.toLowerCase());
    const safeId = _escStormName(s.id || s.name);
    html += `<div style="padding:10px;border-left:4px solid ${cat.color};background:${cat.color}08;border-radius:0 8px 8px 0;margin-bottom:8px;cursor:pointer${isNear ? ';border:1px solid ' + cat.color + '44' : ''}" onclick="_selectNHCStorm('${safeId}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:1.3em">🌀</span>
        <div style="flex:1">
          <div style="font-weight:700;font-size:0.95em;color:var(--text-primary)">${s.type} ${s.name}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:0.7em;color:${cat.color};font-weight:700">${cat.label}${cat.num >= 1 ? ' (Category ' + cat.num + ')' : ''}</span>
            ${status ? `<span style="font-size:0.55em;padding:1px 6px;border-radius:8px;background:${status.bg};color:${status.color};font-weight:700">${status.text}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;font-size:0.75em">
          <div style="color:var(--text-muted)">${distStr}</div>
          <div style="color:var(--text-muted);font-size:0.85em">${bearing}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
        ${s.maxWind != null ? `<div style="text-align:center;padding:4px;background:var(--bg-surface);border-radius:6px;border:1px solid var(--border-subtle)"><div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase">Max Wind</div><div style="font-size:0.9em;font-weight:700;color:${cat.color}">${s.maxWind} mph${s.gusts ? '<span style="font-size:0.7em;color:var(--text-muted)"> G' + s.gusts + '</span>' : ''}</div></div>` : ''}
        ${s.minPressure != null ? `<div style="text-align:center;padding:4px;background:var(--bg-surface);border-radius:6px;border:1px solid var(--border-subtle)"><div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase">Pressure</div><div style="font-size:0.9em;font-weight:700;color:var(--text-primary)">${s.minPressure} mb</div></div>` : ''}
        ${s.moveDir ? `<div style="text-align:center;padding:4px;background:var(--bg-surface);border-radius:6px;border:1px solid var(--border-subtle)"><div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase">Movement</div><div style="font-size:0.9em;font-weight:700;color:var(--text-primary)">${s.moveDir}${s.moveSpeed ? ' ' + s.moveSpeed + ' mph' : ''}</div></div>` : ''}
      </div>
      ${s.lat != null ? `<div style="font-size:0.65em;color:var(--text-muted);margin-top:4px">📍 ${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? 'N' : 'S'}, ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? 'E' : 'W'} · ${(_STORM_REGIONS.find(r => r.id === s._region) || {}).label || s.basin}${s._source === 'jtwc' ? ' (JTWC)' : ''}${hasForecast ? ' · <span style="color:var(--accent-cyan)">Tap for forecast track</span>' : ''}</div>` : ''}
    </div>`;
  });
  html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px 2px">
    <div style="display:flex;align-items:center;gap:4px"><span style="font-size:0.6em;color:var(--text-muted)">Alert radius:</span>
      <select onchange="setNHCProxRadius(this.value)" style="font-size:0.6em;padding:1px 4px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px">${[100,200,300,500,750,1000].map(r=>`<option value="${r}"${r===S._nhcProxRadius?' selected':''}>${r} mi</option>`).join('')}</select></div>
    <span style="font-size:0.6em;color:var(--text-muted)">NHC + JTWC · 15-min</span></div></div>`;
  return html;
}
function setNHCProxRadius(val) {
  S._nhcProxRadius = parseInt(val) || 200;
  try { localStorage.setItem('st_nhc_prox_radius', String(S._nhcProxRadius)); } catch(e) {}
  if (S.activePage === 'alerts' || S.activePage === 'weather') { if (S.activePage === 'alerts') renderAlerts(); _updateTropicalUI(); }
}
function _selectNHCStorm(idOrName) {
  S._nhcSelectedStorm = idOrName;
  switchPage('radar');
  const findStorm = () => (_nhcData.systems || []).find(s => s.id === idOrName || s.name === idOrName);
  const tryPlot = () => {
    if (S.map) {
      plotNHCTracks(S.map);
      const storm = findStorm();
      if (storm && storm.lat != null) S.map.setView([storm.lat, storm.lon], 5);
      return true;
    }
    return false;
  };
  if (!tryPlot()) {
    let attempts = 0;
    const interval = setInterval(() => {
      if (tryPlot() || ++attempts >= 10) clearInterval(interval);
    }, 300);
  }
  const storm = findStorm();
  toast(`Showing forecast for ${storm ? storm.name : idOrName}`);
}
function toggleNHCTracks(on) {
  S._showNHCTracks = on;
  try { localStorage.setItem('st_nhc_tracks', on ? '1' : '0'); } catch(e) {}
  if (S.map) plotNHCTracks(S.map);
  const btn = document.getElementById('btn-nhc-tracks');
  if (btn) btn.style.opacity = on ? '1' : '0.4';
  toast(on ? 'Hurricane tracks shown on map' : 'Hurricane tracks hidden');
}
function plotNHCTracks(map) {
  S._nhcTrackLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
  S._nhcTrackLayers = [];
  if (!S._showNHCTracks || !_nhcData.systems || !_nhcData.systems.length) return;
  const filtered = _getFilteredSystems() || [];
  if (!filtered.length) return;
  const filteredIds = new Set(filtered.map(s => (s.id || '').toLowerCase()));
  const filteredNames = new Set(filtered.map(s => (s.name || '').toLowerCase()));
  const _isStormVisible = (stormId, stormName) => filteredIds.has((stormId||'').toLowerCase()) || filteredNames.has((stormName||'').toLowerCase());
  const selectedName = S._nhcSelectedStorm;
  const showAll = !selectedName;
  for (const cone of (_nhcData.cones || [])) {
    if (!_isStormVisible(cone.stormId, cone.stormName)) continue;
    if (!showAll && cone.stormName.toLowerCase() !== selectedName?.toLowerCase() && cone.stormId !== selectedName) continue;
    if (!cone.coords || cone.coords.length < 3) continue;
    const storm = (_nhcData.systems || []).find(s => s.id === cone.stormId || s.name.toLowerCase() === cone.stormName.toLowerCase());
    const cat = storm ? (storm.category || _saffirSimpson(storm.maxWind)) : { color: '#9333EA' };
    const latlngs = cone.coords.map(c => [c[1], c[0]]);
    const poly = L.polygon(latlngs, {
      color: cat.color || '#9333EA', fillColor: cat.color || '#9333EA',
      fillOpacity: 0.08, weight: 1.5, dashArray: '6,4', interactive: false
    });
    poly.addTo(map);
    S._nhcTrackLayers.push(poly);
  }
  for (const track of (_nhcData.forecast || [])) {
    if (!_isStormVisible(track.stormId, track.stormName)) continue;
    if (!showAll && track.stormName.toLowerCase() !== selectedName?.toLowerCase() && track.stormId !== selectedName) continue;
    if (!track.coords || track.coords.length < 2) continue;
    const storm = (_nhcData.systems || []).find(s => s.id === track.stormId || s.name.toLowerCase() === track.stormName.toLowerCase());
    const cat = storm ? (storm.category || _saffirSimpson(storm.maxWind)) : { color: '#9333EA' };
    const latlngs = track.coords.map(c => [c[1], c[0]]);
    const line = L.polyline(latlngs, {
      color: cat.color || '#9333EA', weight: 3, opacity: 0.9,
      dashArray: '8,6', interactive: false
    });
    line.addTo(map);
    S._nhcTrackLayers.push(line);
  }
  for (const s of filtered) {
    if (s.lat == null || s.lon == null) continue;
    const cat = s.category || _saffirSimpson(s.maxWind);
    const isSelected = !!selectedName && (s.id === selectedName || s.name.toLowerCase() === selectedName.toLowerCase());
    const marker = L.circleMarker([s.lat, s.lon], {
      radius: isSelected ? 14 : (cat.num >= 3 ? 12 : cat.num >= 1 ? 10 : 8),
      color: cat.color, fillColor: cat.color,
      fillOpacity: isSelected ? 0.7 : 0.5,
      weight: isSelected ? 4 : 3
    });
    const status = _tropicalStatusLabel(s);
    marker.bindPopup(`<div style="text-align:center;font-family:system-ui;min-width:180px">
      <div style="font-size:1.2em;font-weight:700;color:${cat.color}">🌀 ${s.type} ${s.name}</div>
      <div style="font-size:0.85em;font-weight:600;color:${cat.color}">${cat.label}</div>
      ${status ? `<div style="font-size:0.7em;font-weight:700;color:${status.color};margin:2px 0">${status.text}</div>` : ''}
      ${s.maxWind ? `<div style="font-size:0.8em;margin-top:4px">💨 Max Wind: <b>${s.maxWind} mph</b>${s.gusts ? ' (G' + s.gusts + ')' : ''}</div>` : ''}
      ${s.minPressure ? `<div style="font-size:0.8em">🔵 Pressure: <b>${s.minPressure} mb</b></div>` : ''}
      ${s.moveDir ? `<div style="font-size:0.8em">➡️ Moving: <b>${s.moveDir} ${s.moveSpeed || ''} mph</b></div>` : ''}
      ${s.dist != null ? `<div style="font-size:0.75em;color:#aaa;margin-top:4px">${Math.round(s.dist)} mi from you</div>` : ''}
      <div style="margin-top:6px"><a href="#" onclick="event.preventDefault();_selectNHCStorm('${_escStormName(s.id||s.name)}')" style="font-size:0.75em;color:var(--accent-cyan)">Show forecast track →</a></div>
    </div>`);
    marker.addTo(map);
    S._nhcTrackLayers.push(marker);
    const labelIcon = L.divIcon({
      className: '',
      html: `<div style="font-size:10px;font-weight:700;color:${cat.color};text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.7);white-space:nowrap;pointer-events:none">${s.name}${isSelected ? ' ★' : ''}</div>`,
      iconSize: [80, 14], iconAnchor: [-8, 7]
    });
    const label = L.marker([s.lat, s.lon], { icon: labelIcon, interactive: false });
    label.addTo(map);
    S._nhcTrackLayers.push(label);
    if (cat.num >= 0) {
      const pulseR = cat.num >= 3 ? 30 : cat.num >= 1 ? 22 : 16;
      const pulse = L.circleMarker([s.lat, s.lon], {
        radius: pulseR, color: cat.color, fillColor: cat.color,
        fillOpacity: 0.1, weight: 1, dashArray: '4,4', interactive: false,
        className: 'nhc-pulse-ring'
      });
      pulse.addTo(map);
      S._nhcTrackLayers.push(pulse);
    }
    if (isSelected) {
      const radiiColors = { 34: '#4fc3f7', 50: '#ffc107', 64: '#ff5722' };
      const radiiLabels = { 34: '34 kt (TS)', 50: '50 kt (Strong TS)', 64: '64 kt (Hurricane)' };
      const stormRadii = (_nhcData.windRadii || []).filter(wr => wr.stormId === s.id || wr.stormName.toLowerCase() === s.name.toLowerCase());
      if (stormRadii.length) {
        for (const wr of stormRadii) {
          if (!wr.coords || wr.coords.length < 3) continue;
          const latlngs = wr.coords.map(c => [c[1], c[0]]);
          const color = radiiColors[wr.ktLevel] || '#4fc3f7';
          const poly = L.polygon(latlngs, {
            color, fillColor: color, fillOpacity: 0.06, weight: 1.5, dashArray: '4,3', interactive: false
          });
          poly.addTo(map);
          S._nhcTrackLayers.push(poly);
          const bounds = poly.getBounds();
          const labelPt = bounds.getNorth ? L.latLng(bounds.getNorth(), bounds.getCenter().lng) : null;
          if (labelPt) {
            const rLabel = L.divIcon({
              className: '',
              html: `<div style="font-size:8px;color:${color};font-weight:600;text-shadow:0 0 3px #000;pointer-events:none">${radiiLabels[wr.ktLevel] || wr.ktLevel + ' kt'}</div>`,
              iconSize: [80, 10], iconAnchor: [40, 12]
            });
            const rm = L.marker(labelPt, { icon: rLabel, interactive: false });
            rm.addTo(map);
            S._nhcTrackLayers.push(rm);
          }
        }
      }
    }
  }
}
function _renderStormSurgeSection() {
  const surgeAlerts = (S.alerts || []).filter(a => {
    const ev = (a.properties?.event || '').toLowerCase();
    return ev.includes('storm surge') || ev.includes('coastal flood') || (ev.includes('hurricane') && ev.includes('warning'));
  });
  if (!surgeAlerts.length) return '';
  let html = `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">🌊</span> Storm Surge & Coastal Flooding (${surgeAlerts.length})</div>`;
  surgeAlerts.forEach(a => {
    const p = a.properties || {};
    const ev = p.event || 'Storm Surge Alert';
    const desc = (p.description || '');
    const surgeMatch = desc.match(/(\d+[\.\d]*)\s*(?:to\s*(\d+[\.\d]*))?\s*(?:feet|ft)\s*(?:above|of\s+storm\s+surge)/i);
    const surgeStr = surgeMatch ? (surgeMatch[2] ? surgeMatch[1] + '-' + surgeMatch[2] + ' ft' : surgeMatch[1] + ' ft') : null;
    const inZone = isUserInAlertZone(a);
    const isSurgeWarn = ev.toLowerCase().includes('storm surge warning');
    html += `<div style="padding:8px 10px;border-left:4px solid ${isSurgeWarn ? '#3b82f6' : '#06b6d4'};background:${isSurgeWarn ? 'rgba(59,130,246,0.06)' : 'rgba(6,182,212,0.06)'};border-radius:0 8px 8px 0;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:1.1em">🌊</span>
        <span style="font-weight:700;font-size:0.85em;color:${isSurgeWarn ? '#3b82f6' : '#06b6d4'}">${ev}</span>
        ${inZone ? '<span style="font-size:0.6em;background:rgba(59,130,246,0.2);color:#60a5fa;padding:1px 6px;border-radius:8px;font-weight:700;animation:tornado-pulse 2s ease-in-out infinite">YOUR AREA</span>' : ''}
      </div>
      ${surgeStr ? `<div style="font-size:0.85em;font-weight:700;color:#3b82f6;margin-bottom:4px">⬆️ Expected surge: ${surgeStr} above normal tide levels</div>` : ''}
      <div style="font-size:0.7em;color:var(--text-secondary);max-height:80px;overflow:hidden;text-overflow:ellipsis">${desc.substring(0, 300)}${desc.length > 300 ? '...' : ''}</div>
      ${p.expires ? `<div style="font-size:0.65em;color:var(--text-muted);margin-top:4px">⏱️ Expires: ${new Date(p.expires).toLocaleString()}</div>` : ''}
    </div>`;
  });
  html += `<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: National Weather Service</div></div>`;
  return html;
}
function _nhcProximityCheck() {
  const filtSystems = _getFilteredSystems();
  if (!filtSystems || !filtSystems.length || !S.lat) { _renderNHCBanner(null); return; }
  let bannerStorm = null;
  for (const s of filtSystems) {
    const cat = s.category || _saffirSimpson(s.maxWind);
    const inCone = s._inCone;
    const inRadius = s.dist != null && s.dist <= S._nhcProxRadius;
    if (!inCone && !inRadius) continue;
    if (!bannerStorm || inCone) bannerStorm = { storm: s, inCone, cat };
    const key = 'nhc_alert_' + s.name + '_' + Math.floor(Date.now() / 3600000);
    if (sessionStorage.getItem(key)) continue;
    sessionStorage.setItem(key, '1');
    const reason = inCone ? 'You are inside the forecast cone!' : `${Math.round(s.dist)} mi from your location`;
    const msg = `🌀 ${s.type} ${s.name} (${cat.label}) — ${reason}`;
    toast(msg, 8000);
    _sendBrowserNotification('Tropical Cyclone Alert', msg);
  }
  _renderNHCBanner(bannerStorm);
}
function _renderNHCBanner(data) {
  let el = document.getElementById('nhc-prox-banner');
  if (!data) { if (el) el.remove(); return; }
  const { storm, inCone, cat } = data;
  const status = _tropicalStatusLabel(storm);
  const bgColor = inCone ? 'rgba(255,152,0,0.15)' : 'rgba(79,195,247,0.1)';
  const borderColor = status ? status.color : cat.color;
  const reason = inCone ? 'You are inside the forecast cone' : `${Math.round(storm.dist)} mi away — Tracking`;
  const html = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${bgColor};border:1px solid ${borderColor}44;border-radius:8px;margin:8px 12px 0;cursor:pointer" onclick="_selectNHCStorm('${_escStormName(storm.id||storm.name)}')">
    <span style="font-size:1.4em">🌀</span>
    <div style="flex:1">
      <div style="font-weight:700;font-size:0.85em;color:${borderColor}">${storm.type} ${storm.name} — ${cat.label}</div>
      <div style="font-size:0.7em;color:var(--text-secondary)">${reason}${status ? ' · ' + status.text : ''}</div>
    </div>
    <span style="font-size:0.65em;color:var(--accent-cyan)">View →</span>
  </div>`;
  if (!el) {
    el = document.createElement('div');
    el.id = 'nhc-prox-banner';
    const header = document.querySelector('.header');
    if (header && header.nextSibling) header.parentNode.insertBefore(el, header.nextSibling);
    else document.body.prepend(el);
  }
  el.innerHTML = html;
}
// ==========================================
// STORMS DISPLAY
// ==========================================
function _loadStormFilter(){
  try{const f=JSON.parse(localStorage.getItem('st_stormFilter'));if(f)return f}catch(e){}
  return{minDbz:0,maxDist:0,approachOnly:false,sort1:'threat',sort2:'eta'};
}
function _saveStormFilter(f){localStorage.setItem('st_stormFilter',JSON.stringify(f));S._stormFilter=f}
function _stormSortFn(a,b,key){
  if(key==='dbz')return b.dbz-a.dbz;
  if(key==='dist')return a.distance-b.distance;
  if(key==='eta'){
    const ea=a._eta&&a._eta.approaching&&a._eta.eta!=null?a._eta.eta:99999;
    const eb=b._eta&&b._eta.approaching&&b._eta.eta!=null?b._eta.eta:99999;
    return ea-eb;
  }
  if(key==='threat'){
    const ta=(a.dbz||0)*(a._eta&&a._eta.approaching?2:0.5)/(Math.max(a.distance,1));
    const tb=(b.dbz||0)*(b._eta&&b._eta.approaching?2:0.5)/(Math.max(b.distance,1));
    return tb-ta;
  }
  return 0;
}
function _applyStormFilter(storms,f){
  let out=storms;
  if(f.minDbz>0)out=out.filter(s=>s.dbz>=f.minDbz);
  if(f.maxDist>0)out=out.filter(s=>s.distance<=f.maxDist);
  if(f.approachOnly)out=out.filter(s=>{const e=s._eta;return e&&e.approaching&&e.eta!=null});
  out.sort((a,b)=>{const r=_stormSortFn(a,b,f.sort1);return r!==0?r:_stormSortFn(a,b,f.sort2)});
  return out;
}
function _smartStormSummary(storms){
  const mv=S.stormMovement;
  if(!storms.length||!mv||mv.speed<2)return'';
  const approaching=storms.filter(s=>{const e=s._eta;return e&&e.approaching&&e.eta!=null});
  if(!approaching.length)return'<div style="padding:8px 12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:8px;font-size:0.8em;color:#4ade80;margin-bottom:8px">No storms currently approaching your location.</div>';
  approaching.sort((a,b)=>a._eta.eta-b._eta.eta);
  const light=approaching.filter(s=>s.dbz<40);
  const moderate=approaching.filter(s=>s.dbz>=40&&s.dbz<50);
  const severe=approaching.filter(s=>s.dbz>=50);
  const fmtEtaShort=(min)=>{const s=Math.round(min*60);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return(h>0?String(h).padStart(2,'0')+'h:':'')+String(m).padStart(2,'0')+'m:'+String(sec).padStart(2,'0')+'s';};
  const fmtTime=(min)=>fmtClockShort(new Date(Date.now()+min*60000));
  let lines=[];
  if(light.length){
    const first=light[0],last=light[light.length-1];
    lines.push(`<span style="color:#00ffcc">🔵 Light rain</span> inbound starting in <b>${fmtEtaShort(first._eta.eta)}</b> (${fmtTime(first._eta.eta)})${light.length>1?' — '+light.length+' cells':''}`);
  }
  if(moderate.length){
    const first=moderate[0];
    lines.push(`<span style="color:#ffee00">🟡 Moderate to heavy</span> cells inbound, ETA <b>${fmtEtaShort(first._eta.eta)}</b> (${fmtTime(first._eta.eta)})${moderate.length>1?' — '+moderate.length+' cells':''}`);
  }
  if(severe.length){
    const first=severe[0];
    lines.push(`<span style="color:#ff0033">🔴 Severe/intense</span> cells inbound, ETA <b>${fmtEtaShort(first._eta.eta)}</b> (${fmtTime(first._eta.eta)})${severe.length>1?' — '+severe.length+' cells':''}`);
  }
  return`<div style="padding:8px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;font-size:0.78em;line-height:1.6;margin-bottom:8px">${lines.join('<br>')}</div>`;
}
function _renderFilterBar(f){
  const sortOpts=[['threat','Threat Score'],['dbz','Strongest'],['eta','Soonest ETA'],['dist','Closest']];
  const mkOpts=(sel)=>sortOpts.map(([v,l])=>`<option value="${v}"${sel===v?' selected':''}>${l}</option>`).join('');
  return`<div class="card" style="padding:8px 10px;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.72em">
      <span style="font-weight:700;color:var(--text-secondary)">Sort:</span>
      <select id="sf-sort1" onchange="updateStormFilter()" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em">${mkOpts(f.sort1)}</select>
      <span style="color:var(--text-muted)">then</span>
      <select id="sf-sort2" onchange="updateStormFilter()" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em">${mkOpts(f.sort2)}</select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.72em;margin-top:6px">
      <span style="font-weight:700;color:var(--text-secondary)">Filter:</span>
      <label style="display:flex;align-items:center;gap:3px;color:var(--text-secondary)">Min dBZ
        <input id="sf-mindbz" type="number" min="0" max="75" step="5" value="${f.minDbz||0}" onchange="updateStormFilter()" style="width:42px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em;text-align:center">
      </label>
      <label style="display:flex;align-items:center;gap:3px;color:var(--text-secondary)">Max dist
        <input id="sf-maxdist" type="number" min="0" max="200" step="5" value="${f.maxDist||0}" onchange="updateStormFilter()" style="width:42px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em;text-align:center">
        <span style="color:var(--text-muted)">${S.radarMetric?'km':'mi'}</span>
      </label>
      <label style="display:flex;align-items:center;gap:3px;cursor:pointer;color:var(--text-secondary)">
        <input id="sf-approach" type="checkbox" ${f.approachOnly?'checked':''} onchange="updateStormFilter()"> Approaching only
      </label>
    </div>
  </div>`;
}
function updateStormFilter(){
  const f={
    sort1:document.getElementById('sf-sort1')?.value||'threat',
    sort2:document.getElementById('sf-sort2')?.value||'eta',
    minDbz:parseInt(document.getElementById('sf-mindbz')?.value)||0,
    maxDist:parseInt(document.getElementById('sf-maxdist')?.value)||0,
    approachOnly:document.getElementById('sf-approach')?.checked||false
  };
  _saveStormFilter(f);
  renderStorms();
}
S._stormFilter=_loadStormFilter();
function renderStorms(){
  const el=document.getElementById('page-storms');
  if(!S.lat){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📍</div><p>Set your location to scan for storms.</p></div>`;return}
  const storms=S.storms;
  const userZones=checkUserInZone();
  const zoneAlert=userZones?`<div class="alert-banner danger" style="border-left:4px solid ${userZones[0].color}"><span class="alert-icon">🟣</span><div class="alert-text"><span class="alert-title">You are inside ${userZones.map(z=>z.label).join(' + ')}</span><br>Your location is within an active precipitation zone.</div></div>`:'';
  if(!storms.length){
    el.innerHTML=`${zoneAlert}
      <div class="alert-banner safe"><span class="alert-icon">✅</span><div class="alert-text"><span class="alert-title">All Clear</span><br>No storm cells detected within ${S.radarMetric?(S.scanRadius*1.60934).toFixed(0)+' km':S.scanRadius+' mi'}.</div></div>
      <div class="card"><div class="card-title"><span class="icon">🛰️</span> Radar Storm Scanner</div>
        <div class="empty-state"><div class="empty-icon">${neonWx(1,isCurrentlyDay(),48)}</div>
          <p>Scans ${S.radarSource==='nexrad'?'NEXRAD':'RainViewer'} radar tiles for precipitation.<br>
          Tap 📍 on the radar map to scan around your location.<br><br>
          <strong>Scan radius: ${S.scanRadius} mi</strong></p></div></div>`;
    return;
  }
  const severe=storms.some(s=>s.dbz>=45);
  const mv=S.stormMovement;
  const stormsWithEta=storms.map(s=>({...s,_eta:calcStormETA(s)}));
  const sf=S._stormFilter||_loadStormFilter();
  const filtered=_applyStormFilter(stormsWithEta,sf);
  const prevOpen={};
  el.querySelectorAll('.storm-group').forEach(d=>{const k=d.getAttribute('data-grp');if(k)prevOpen[k]=d.open});
  function isApproaching(s){const e=s._eta;return e&&e.approaching&&e.impact>0&&e.eta!=null}
  function isOverhead(s){const e=s._eta;return e&&e.proximity}
  function isNearby(s){return!isApproaching(s)&&!isOverhead(s)}
  function buildCard(s){
      const cat=stormCat(s.dbz);
      const eta=s._eta;
      const pct=eta?eta.impact:0;
      const imp=impactLabel(pct);
      let mvLine='';
      if(mv&&mv.speed>=2){
        const spdStr=S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph';
        mvLine=`<div class="storm-detail tappable-unit" onclick="toggleStormUnits()"><div class="storm-detail-label">${tStr('Moving')}</div><div class="storm-detail-val">${degToDir(mv.direction)} (${Math.round(mv.direction)}°) ${spdStr}</div><div class="tile-tap">tap</div></div>`;
        if(isOverhead(s)){
          mvLine+=`<div class="storm-detail" style="grid-column:span 2"><div class="storm-detail-label">${tStr('Status')}</div><div class="storm-detail-val" style="color:#f97316;font-size:0.85em">⚠️ ${tStr('Overhead · Moving away')}</div></div>`;
          mvLine+=`<div class="storm-detail"><div class="storm-detail-label">${tStr('Impact')}</div><div class="storm-detail-val" style="color:${imp.color}">${pct}% ${tStr(imp.text)}</div></div>`;
        }else if(isApproaching(s)){
          const sk=stormKey(s);
          let targetMs;
          if(S._stormETAs[sk]&&S._stormETAs[sk]>Date.now()){
            targetMs=S._stormETAs[sk];
          }else{
            const elapsedMin=S.scanTime?(Date.now()-S.scanTime)/60000:0;
            const remainMin=Math.max(0,eta.eta-elapsedMin);
            targetMs=Date.now()+remainMin*60000;
            S._stormETAs[sk]=targetMs;
          }
          eta._targetMs=targetMs;
          const remainMin=(targetMs-Date.now())/60000;
          const arrivalTime=fmtArrivalTime(remainMin);
          const initCountdown=fmtCountdown(Math.round(remainMin*60));
          mvLine+=`<div class="storm-detail eta-detail"><div class="storm-detail-label">⏱ ${tStr('ETA')}</div><div class="storm-detail-val" style="color:${imp.color}"><span class="eta-countdown" data-eta-sec="${Math.round(targetMs)}" data-storm-key="${sk}">${initCountdown}</span></div><div style="font-size:0.65em;color:${imp.color};margin-top:1px">${tStr('Arrives')} ~${arrivalTime}</div></div>`;
          mvLine+=`<div class="storm-detail"><div class="storm-detail-label">${tStr('Impact')}</div><div class="storm-detail-val" style="color:${imp.color}">${pct}% ${tStr(imp.text)}</div></div>`;
        }else{
          mvLine+=`<div class="storm-detail"><div class="storm-detail-label">${tStr('Impact')}</div><div class="storm-detail-val" style="color:var(--accent-green)">${tStr('Nearby · Not approaching')}</div></div>`;
        }
      }
      const hex=dbzHex(s.dbz);
      const pulse=(s.dbz>=45)?'storm-card-pulse':'';
      const isHook=s._hookEcho;
      const cellIcon=isHook?'🌪️':s.dbz>=65?'‼️':s.dbz>=56?'🚨':s.dbz>=45?'⚠️':s.dbz>=40?'🟡':s.dbz>=30?'🟢':'🔵';
      const cellName=isHook?tStr('Possible Rotation'):s.dbz>=55?tStr('Severe Cell'):s.dbz>=40?tStr('Storm Cell'):tStr('Rain Cell');
      const hookBadge=isHook?`<span class="hook-echo-badge">🌪️ Hook Echo</span>`:'';
      return`<div class="storm-cell-card ${pulse}" style="border-color:${isHook?'#ff1744':hex};--pulse-color:${isHook?'#ff1744':hex}${isHook?';animation:tornado-pulse 1.8s ease-in-out infinite,storm-pulse 2.5s ease-in-out infinite':''}">
        <div class="storm-header"><span style="font-weight:700">${cellIcon} ${cellName}</span>${hookBadge}<span class="storm-badge" style="background:${hex}22;color:${hex};border:1px solid ${hex}44">${tStr(cat.label)}</span></div>
        <div class="storm-detail-grid">
          <div class="storm-detail"><div class="storm-detail-label">${tStr('Peak dBZ')}</div><div class="storm-detail-val" style="color:${cat.color}">${s.dbz}</div></div>
          <div class="storm-detail tappable-unit" onclick="toggleStormUnits()"><div class="storm-detail-label">${tStr('Rain Rate')}</div><div class="storm-detail-val">${cat.rain}</div><div class="tile-tap">tap</div></div>
          <div class="storm-detail tappable-unit" onclick="toggleStormUnits()"><div class="storm-detail-label">${tStr('Distance')}</div><div class="storm-detail-val"><span data-dist-mi="${s.distance}" data-closing-mph="${eta&&eta.closingSpeed?eta.closingSpeed:0}" data-target-ms="${eta&&eta._targetMs?eta._targetMs:0}">${fmtStormDist(s.distance)}</span></div><div class="tile-tap">tap</div></div>
          <div class="storm-detail"><div class="storm-detail-label">${tStr('Bearing')}</div><div class="storm-detail-val">${degToDir(s.bearing)}</div></div>
          ${mvLine}
        </div>
        <div style="font-size:0.6em;color:var(--text-muted);margin-top:6px;text-align:center">
          ${s.lat.toFixed(3)}°N, ${Math.abs(s.lng).toFixed(3)}°${s.lng<0?'W':'E'} &middot; ${s.pixels} returns
        </div>
      </div>`;
  }
  const approaching=filtered.filter(s=>isApproaching(s));
  const overhead=filtered.filter(s=>isOverhead(s));
  const nearby=filtered.filter(s=>isNearby(s));
  let groupHtml='';
  const sections=[
    {key:'approaching',items:approaching,label:'⏱️ Approaching',color:'#ef4444',open:true},
    {key:'overhead',items:overhead,label:'⚠️ Overhead · Moving Away',color:'#f97316',open:true},
    {key:'nearby',items:nearby,label:'🟢 Nearby · Not Approaching',color:'#4ade80',open:false}
  ];
  for(const sec of sections){
    if(!sec.items.length)continue;
    const cards=sec.items.map(buildCard).join('');
    const isOpen=prevOpen[sec.key]!==undefined?prevOpen[sec.key]:sec.open;
    groupHtml+=`<details class="storm-group" data-grp="${sec.key}" ${isOpen?'open':''}>
      <summary class="storm-group-header" style="border-left:3px solid ${sec.color}">
        ${sec.label} <span class="storm-group-count">${sec.items.length}</span>
      </summary>
      <div class="storm-group-body">${cards}</div>
    </details>`;
  }
  let gridHtml='';
  if(S._rawScanPts&&S._rawScanPts.length){
    const gridCells=polarGridBin(S._rawScanPts,S.lat,S.lon,S.scanRadius||80);
    const zones=[];
    const angStep=ZONE_ANG_STEP,distStep=ZONE_DIST_STEP_MI;
    for(const[k,c]of gridCells){
      const midBear=(c.ai*angStep+angStep/2)%360;
      const midDist=(c.ri+0.5)*distStep;
      const cat=stormCat(c.maxDbz);
      const hex=dbzHex(c.maxDbz);
      let etaInfo=null;
      if(mv&&mv.speed>=2){
        const travelDir=mv.direction;
        const diff=Math.abs(((travelDir-midBear+180)%360)-180);
        if(diff<=30){
          const closingSpd=mv.speed*Math.cos(diff*Math.PI/180);
          if(closingSpd>0.5){
            const etaMin=midDist/closingSpd*60;
            etaInfo={approaching:true,eta:etaMin,color:'#ef4444'};
          }
        }
      }
      zones.push({ai:c.ai,ri:c.ri,maxDbz:c.maxDbz,count:c.count,midBear,midDist,cat,hex,etaInfo});
    }
    zones.sort((a,b)=>{
      const ae=a.etaInfo&&a.etaInfo.approaching?a.etaInfo.eta:99999;
      const be=b.etaInfo&&b.etaInfo.approaching?b.etaInfo.eta:99999;
      if(ae!==be)return ae-be;
      return a.midDist-b.midDist;
    });
    if(zones.length){
      const zoneCards=zones.map(z=>{
        const dir=degToDir(z.midBear);
        const distLo=(z.ri*distStep).toFixed(0);
        const distHi=((z.ri+1)*distStep).toFixed(0);
        const distStr=S.radarMetric?`${(distLo*1.60934).toFixed(0)}-${(distHi*1.60934).toFixed(0)} km`:`${distLo}-${distHi} mi`;
        const bearStr=`${(z.ai*angStep).toFixed(0)}°-${((z.ai+1)*angStep).toFixed(0)}°`;
        let etaStr='';
        if(z.etaInfo&&z.etaInfo.approaching){
          const sec=Math.round(z.etaInfo.eta*60);
          const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
          etaStr=`<span style="color:#ef4444;font-weight:600;font-family:var(--font-mono);font-size:0.85em">⏱ ${h>0?h+'h:'+String(m).padStart(2,'0')+'m':m+'m:'+String(s).padStart(2,'0')+'s'}</span>`;
        }
        return`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-left:3px solid ${z.hex};background:${z.hex}08;border-radius:4px;margin-bottom:4px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:0.8em">${dir} <span style="color:var(--text-muted);font-weight:400">${bearStr}</span></div>
            <div style="font-size:0.7em;color:var(--text-muted)">${distStr} · ${z.count} return${z.count>1?'s':''}</div>
          </div>
          <div style="text-align:right">
            <span style="font-size:0.75em;font-weight:600;color:${z.hex}">${z.maxDbz} dBZ</span>
            <div style="font-size:0.6em;color:${z.cat.color}">${z.cat.label}</div>
            ${etaStr}
          </div>
        </div>`;
      }).join('');
      const gridOpen=prevOpen['gridzones']!==undefined?prevOpen['gridzones']:false;
      gridHtml=`<div class="card" style="margin-top:8px"><div class="card-title"><span class="icon">📡</span> Grid Zones</div>
        <details class="storm-group" data-grp="gridzones" ${gridOpen?'open':''}>
          <summary class="storm-group-header" style="border-left:3px solid var(--accent-cyan)">
            📡 Radar Grid Zones <span class="storm-group-count">${zones.length}</span>
          </summary>
          <div class="storm-group-body" style="padding:4px">${zoneCards}</div>
        </details>
      </div>`;
    }
  }
  const stormCount=approaching.length+overhead.length+nearby.length;
  const filteredCount=filtered.length;
  const totalCount=stormsWithEta.length;
  const filterNote=filteredCount<totalCount?` <span style="color:var(--text-muted);font-size:0.85em">(showing ${filteredCount}/${totalCount})</span>`:'';
  const smartSummary=_smartStormSummary(stormsWithEta);
  el.innerHTML=`${zoneAlert}
    <div class="alert-banner ${severe?'danger':'warning'}">
      <span class="alert-icon">${severe?'🚨':'⚠️'}</span>
      <div class="alert-text"><span class="alert-title">${storms.length} Cell${storms.length>1?'s':''} Detected${stormCount?' · '+stormCount+' Storm'+(stormCount>1?'s':''):''}</span>${filterNote}${approaching.length?' · <span style="color:#ef4444">'+approaching.length+' approaching</span>':''}<br>Within ${S.radarMetric?(S.scanRadius*1.60934).toFixed(0)+' km':S.scanRadius+' mi'}${mv&&mv.speed>=2?' · Moving '+degToDir(mv.direction)+' ('+Math.round(mv.direction)+'°) at '+(S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph'):''}<br><span id="auto-scan-status" style="font-size:0.8em;color:var(--text-muted)"></span></div>
    </div>
    ${smartSummary}
    ${_renderFilterBar(sf)}
    <div class="card"><div class="card-title"><span class="icon">🌪️</span> Storm Points</div>
      ${groupHtml}
    </div>
    ${gridHtml}
    <div style="font-size:0.65em;color:var(--text-muted);text-align:center;padding:4px">
      ⚡ Lightning on storms ≥40 dBZ &middot; Radar-derived, not observed<br>
      Impact % based on direction, distance, speed &amp; intensity via winds aloft
    </div>`;
  startEtaCountdowns();
  updateAutoScanUI();
}

// ==========================================
// STATION (NWS API — CORS-friendly)
// Step 1: /points/{lat},{lon} → get observationStations URL
// Step 2: Follow that URL → list of nearby stations
// Step 3: /stations/{ICAO}/observations/latest → obs data
// NWS API has Access-Control-Allow-Origin: * (works from browser)
// AWC API: aviationweather.gov/api/data/metar — international METAR fallback
// ==========================================
const NWS_HDR={headers:{'User-Agent':'StormTracker/1.50','Accept':'application/geo+json'}};

let _globalAirports=null;
async function _loadGlobalAirports(){
  if(_globalAirports)return _globalAirports;
  try{
    const r=await fetch('data/airports.json',{signal:AbortSignal.timeout(10000)});
    if(!r.ok)return null;
    const data=await r.json();
    _globalAirports=data.map(a=>({icao:a[0],iata:a[1]||null,name:a[2],lat:a[3],lon:a[4]}));
    console.log('Global airports loaded:',_globalAirports.length);
    return _globalAirports;
  }catch(e){console.log('Airport DB load error:',e.message);return null}
}
function _nearestAirports(lat,lon,airports,maxMi,limit){
  if(!airports)return[];
  return airports.map(a=>({...a,dist:haversine(lat,lon,a.lat,a.lon)}))
    .filter(a=>a.dist<=maxMi)
    .sort((a,b)=>a.dist-b.dist)
    .slice(0,limit||10);
}
async function fetchStation(){
  S._stationLocKey=S.lat+','+S.lon;
  const el=document.getElementById('page-station');showSkel(el,5);
  try{
    console.log('Tier 1: NWS — trying api.weather.gov/points for',S.lat.toFixed(4),S.lon.toFixed(4));
    const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{...NWS_HDR,signal:AbortSignal.timeout(6000)});
    if(!ptRes.ok)throw new Error('NWS_INTL');
    const ptData=await ptRes.json();
    const stationsUrl=ptData.properties?.observationStations;
    if(!stationsUrl)throw new Error('No observation stations URL');
    const stRes=await fetch(stationsUrl,{...NWS_HDR,signal:AbortSignal.timeout(6000)});
    if(!stRes.ok)throw new Error('NWS stations returned '+stRes.status);
    const stData=await stRes.json();
    const features=stData.features||stData.observationStations||[];
    if(!features.length)throw new Error('NWS_INTL');
    S._stationSource='nws';
    S.nearbyStations=features.slice(0,10).map(f=>({
      icao:f.properties.stationIdentifier,
      name:f.properties.name||'',
      lat:f.geometry.coordinates[1],
      lon:f.geometry.coordinates[0],
      dist:haversine(S.lat,S.lon,f.geometry.coordinates[1],f.geometry.coordinates[0]),
    })).sort((a,b)=>a.dist-b.dist);
    console.log('Tier 1: NWS success — nearest:',S.nearbyStations[0].icao,S.nearbyStations[0].name);
    await loadStationObs(S.nearbyStations[0].icao);
  }catch(e){
    console.log('Tier 1: NWS error:',e.message,'→ Tier 2: AWC');
    try{await fetchStationAWC()}catch(e2){
      console.log('AWC station error:',e2.message,'→ trying global airport DB');
      try{
        const airports=await _loadGlobalAirports();
        const nearest=_nearestAirports(S.lat,S.lon,airports,300,10);
        if(nearest.length){
          console.log('Global DB found',nearest.length,'airports, nearest:',nearest[0].icao,nearest[0].name,nearest[0].dist.toFixed(1)+'mi');
          S._stationSource='awc';
          S.nearbyStations=nearest;
          await loadStationObsAWC(nearest[0].icao);
        }else{
          el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>No weather stations found within 300 mi.<br><span style="font-size:0.8em;color:var(--text-muted)">Try a location closer to an airport</span></p></div>`;
        }
      }catch(e3){
        console.error('Global airport fallback error:',e3);
        el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>No weather stations found nearby.<br><span style="font-size:0.8em;color:var(--text-muted)">Try a location closer to an airport</span></p></div>`;
      }
    }
  }
}
async function fetchStationAWC(){
  const el=document.getElementById('page-station');
  const radii=[1.0,2.0,3.5,5.0];
  let foundStations=[];
  for(const degSpan of radii){
    const minLat=(S.lat-degSpan).toFixed(2),maxLat=(S.lat+degSpan).toFixed(2);
    const minLon=(S.lon-degSpan).toFixed(2),maxLon=(S.lon+degSpan).toFixed(2);
    try{
      const r=await fetch(`https://aviationweather.gov/api/data/stationinfo?bbox=${minLat},${minLon},${maxLat},${maxLon}&format=json`,{signal:AbortSignal.timeout(8000)});
      if(r.ok){
        const body=await r.json();
        if(Array.isArray(body)){
          const metarCapable=body.filter(s=>s.siteType&&(Array.isArray(s.siteType)?s.siteType.includes('METAR'):String(s.siteType).includes('METAR')));
          console.log('Tier 2: stationinfo ±'+degSpan+'° found',metarCapable.length,'METAR-capable stations');
          if(metarCapable.length){
            foundStations=metarCapable.map(s=>({icao:s.icaoId,iata:s.iataId||null,faa:s.faaId||null,name:s.site||s.icaoId,lat:s.lat,lon:s.lon,dist:haversine(S.lat,S.lon,s.lat,s.lon)})).sort((a,b)=>a.dist-b.dist).slice(0,10);
            break;
          }
        }
      }
    }catch(e){console.log('Tier 2: stationinfo error ±'+degSpan+'°:',e.message)}
  }
  if(foundStations.length){
    console.log('Tier 2: AWC stationinfo — nearest:',foundStations[0].icao,foundStations[0].name,foundStations[0].dist.toFixed(1)+'mi');
    S._stationSource='awc';
    S.nearbyStations=foundStations;
    const icao=foundStations[0].icao;
    let metarLoaded=false;
    for(const hrs of [3,6,12]){
      try{
        const mr=await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json&hours=${hrs}`,{signal:AbortSignal.timeout(8000)});
        if(mr.ok){
          const md=await mr.json();
          if(md.length){
            console.log('Tier 2: METAR found for',icao,'('+hrs+'h window)');
            S.stationId=icao;
            S.station=parseAWCobs(md[0]);
            if(foundStations[0].name)S.station.name=foundStations[0].name;
            renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
            metarLoaded=true;
            break;
          }
        }
      }catch(e){console.log('Tier 2: METAR fetch error ('+hrs+'h):',e.message)}
    }
    if(!metarLoaded){
      console.log('Tier 2: No recent METAR for',icao,'— showing station without obs');
      S.stationId=icao;
      S.station={
        icao,name:foundStations[0].name,lat:foundStations[0].lat,lon:foundStations[0].lon,
        temp:null,dewp:null,windKmh:null,windDir:null,gustKmh:null,visMeter:null,presPa:null,
        rawMETAR:'',clouds:[],obsTime:'',wxString:'',
        _noMetar:true,_reason:'No recent METAR available'
      };
      renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
    }
    return;
  }
  console.log('Tier 2: stationinfo returned 0 stations → Tier 3: global airport DB');
  const airports=await _loadGlobalAirports();
  const nearest=_nearestAirports(S.lat,S.lon,airports,300,10);
  if(nearest.length){
    console.log('Tier 3: OurAirports fallback — nearest:',nearest[0].icao,nearest[0].name,nearest[0].dist.toFixed(1)+'mi');
    S._stationSource='awc';
    S.nearbyStations=nearest;
    const icao=nearest[0].icao;
    let metarLoaded=false;
    for(const hrs of [3,6,12]){
      try{
        const mr=await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json&hours=${hrs}`,{signal:AbortSignal.timeout(8000)});
        if(mr.ok){const md=await mr.json();if(md.length){
          console.log('Tier 3: METAR found for',icao);
          S.stationId=icao;S.station=parseAWCobs(md[0]);
          if(nearest[0].name)S.station.name=nearest[0].name;
          renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
          metarLoaded=true;break;
        }}
      }catch(e){}
    }
    if(!metarLoaded){
      console.log('Tier 3: No METAR for',icao,'— showing station without obs');
      S.stationId=icao;
      S.station={icao,name:nearest[0].name,lat:nearest[0].lat,lon:nearest[0].lon,
        temp:null,dewp:null,windKmh:null,windDir:null,gustKmh:null,visMeter:null,presPa:null,
        rawMETAR:'',clouds:[],obsTime:'',wxString:'',_noMetar:true,_reason:'No recent METAR available'};
      renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
    }
    return;
  }
  throw new Error('No stations in range from any source');
}
async function fetchStationGlobal(){
  const el=document.getElementById('page-station');
  const radii=[2.0,4.0,6.0];
  let stationList=[];
  for(const degSpan of radii){
    const minLat=(S.lat-degSpan).toFixed(2),maxLat=(S.lat+degSpan).toFixed(2);
    const minLon=(S.lon-degSpan).toFixed(2),maxLon=(S.lon+degSpan).toFixed(2);
    try{
      const url=`https://aviationweather.gov/api/data/stationinfo?bbox=${minLat},${minLon},${maxLat},${maxLon}&format=json`;
      const r=await fetch(url);
      if(r.ok){
        const body=await r.json();
        if(Array.isArray(body)){
          stationList=body.filter(s=>s.siteType&&s.siteType.includes('METAR')).map(s=>({
            icao:s.icaoId,name:s.site||s.icaoId,
            lat:s.lat,lon:s.lon,
            dist:haversine(S.lat,S.lon,s.lat,s.lon)
          })).sort((a,b)=>a.dist-b.dist).slice(0,10);
        }
      }
    }catch(e){console.log('AWC stationinfo error (±'+degSpan+'°):',e.message)}
    if(stationList.length)break;
  }
  if(!stationList.length)throw new Error('No stations in range');
  S._stationSource='awc';
  S.nearbyStations=stationList;
  await loadStationObsAWC(stationList[0].icao);
}
function parseRawMetar(raw,station){
  const parts=raw.split(/\s+/);
  let temp=null,dewp=null,windDir=null,windKt=null,gustKt=null,vis=null,altim=null,slp=null;
  let clouds=[];
  let wxString='';
  const wxCodes=['RA','SN','DZ','GR','GS','TS','FG','BR','HZ','FU','SA','DU','SQ','FC','VA','PO','SS','DS','SH','FZ','MI','PR','BC','BL','DR','VC'];
  for(let pi=0;pi<parts.length;pi++){
    const p=parts[pi];
    const windM=p.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT$/);
    if(windM){
      windDir=windM[1]==='VRB'?null:Number(windM[1]);
      windKt=Number(windM[2]);
      if(windM[4])gustKt=Number(windM[4]);
      continue;
    }
    const windMPS=p.match(/^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?MPS$/);
    if(windMPS){
      windDir=windMPS[1]==='VRB'?null:Number(windMPS[1]);
      windKt=Number(windMPS[2])*1.94384;
      if(windMPS[4])gustKt=Number(windMPS[4])*1.94384;
      continue;
    }
    const tempM=p.match(/^(M?\d{1,2})\/(M?\d{1,2})?$/);
    if(tempM){
      temp=tempM[1].startsWith('M')?-Number(tempM[1].slice(1)):Number(tempM[1]);
      if(tempM[2])dewp=tempM[2].startsWith('M')?-Number(tempM[2].slice(1)):Number(tempM[2]);
      continue;
    }
    const altM=p.match(/^Q(\d{4})$/);
    if(altM){altim=Number(altM[1]);continue}
    const altA=p.match(/^A(\d{4})$/);
    if(altA){altim=Number(altA[1])/100*33.8639;continue}
    const slpM=p.match(/^SLP(\d{3})$/);
    if(slpM){
      const sv=Number(slpM[1]);
      slp=(sv>=500?900+sv/10:1000+sv/10);
      if(altim==null)altim=slp;
      continue;
    }
    if(vis===null&&p==='CAVOK'){vis=9999;continue}
    if(vis===null&&p.match(/^9999NDV?$/)){vis=9999;continue}
    if(vis===null&&p.match(/^(\d{4})$/)&&Number(p)>=100&&Number(p)<=9999){
      vis=Number(p);continue;
    }
    const visSMfrac=p.match(/^(\d+)\s*\/\s*(\d+)SM$/);
    if(visSMfrac){vis=(Number(visSMfrac[1])/Number(visSMfrac[2]))*1609.34;continue}
    if(vis===null&&pi>0&&parts[pi-1].match(/^\d+$/)&&p.match(/^(\d+)\/(\d+)SM$/)){
      const whole=Number(parts[pi-1]);
      const fm=p.match(/^(\d+)\/(\d+)SM$/);
      vis=(whole+Number(fm[1])/Number(fm[2]))*1609.34;continue;
    }
    const visSM=p.match(/^(\d+)SM$/);
    if(visSM){vis=Number(visSM[1])*1609.34;continue}
    if(p==='P6SM'){vis=10*1609.34;continue}
    const cldM=p.match(/^(FEW|SCT|BKN|OVC|CLR|SKC|NSC|NCD|VV)(\d{3})?(.*)$/);
    if(cldM){
      clouds.push({amount:cldM[1],base:{value:cldM[2]?Number(cldM[2])*100*0.3048:null}});
      continue;
    }
    for(const wx of wxCodes){
      if(p.includes(wx)&&p.match(/^[-+]?(VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(RA|SN|DZ|GR|GS|PL|IC|PE|SG|UP|FG|BR|HZ|FU|SA|DU|VA|PO|SQ|FC|SS|DS)+$/)){
        wxString+=(wxString?' ':'')+p;
        break;
      }
    }
  }
  return{
    icao:station.icao,name:station.name,lat:station.lat,lon:station.lon,
    temp,dewp,
    windKmh:windKt!=null?windKt*1.852:null,
    windDir,
    gustKmh:gustKt!=null?gustKt*1.852:null,
    visMeter:vis,
    presPa:altim!=null?altim*100:null,
    rawMETAR:raw,
    clouds,
    obsTime:new Date().toISOString(),
    wxString,
    _source:'AWC'
  };
}
function parseAWCobs(m){
  return{
    icao:m.icaoId,
    name:m.name||m.icaoId,
    lat:m.lat,lon:m.lon,
    temp:m.temp!=null?m.temp:null,
    dewp:m.dewp!=null?m.dewp:null,
    windKmh:m.wspd!=null?m.wspd*1.852:null,
    windDir:m.wdir!=null?(m.wdir==='VRB'?null:Number(m.wdir)):null,
    gustKmh:m.wgst!=null?m.wgst*1.852:null,
    visMeter:m.visib!=null?(String(m.visib).includes('+')?16093:Number(m.visib)>100?Number(m.visib):Number(m.visib)*1609.34):null,
    presPa:m.altim!=null?m.altim*100:null,
    rawMETAR:m.rawOb||'',
    clouds:(m.clouds||[]).map(c=>({amount:c.cover,base:{value:c.base!=null?c.base*0.3048:null}})),
    obsTime:(m.reportTime||m.obsTime||'').replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/,'$1T$2Z'),
    wxString:m.wxString||'',
  };
}
function loadStationFromAWC(awcData,stInfo){
  S.stationId=awcData.icaoId;
  S.station=parseAWCobs(awcData);
  if(stInfo?.name)S.station.name=stInfo.name;
  renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
}

function buildSyntheticMetar(icao,p){
  const parts=[icao];
  if(p.timestamp){const d=new Date(p.timestamp);parts.push(String(d.getUTCDate()).padStart(2,'0')+String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+'Z')}
  if(p.windDirection?.value!=null||p.windSpeed?.value!=null){
    const dir=p.windDirection?.value!=null?String(Math.round(p.windDirection.value)).padStart(3,'0'):'VRB';
    const spd=p.windSpeed?.value!=null?String(Math.round(p.windSpeed.value*0.539957)).padStart(2,'0'):'00';
    let w=dir+spd;
    if(p.windGust?.value!=null)w+='G'+String(Math.round(p.windGust.value*0.539957)).padStart(2,'0');
    parts.push(w+'KT');
  }
  if(p.visibility?.value!=null){const sm=p.visibility.value/1609.34;parts.push(sm>=10?'10SM':sm.toFixed(1)+'SM')}
  if(p.cloudLayers?.length){p.cloudLayers.forEach(c=>{const cov=c.amount||'';const alt=c.base?.value!=null?String(Math.round(c.base.value*3.28084/100)).padStart(3,'0'):'';if(cov&&alt)parts.push(cov+alt)})}
  else parts.push('CLR');
  if(p.temperature?.value!=null){const t=Math.round(p.temperature.value);const td=p.dewpoint?.value!=null?Math.round(p.dewpoint.value):null;parts.push((t<0?'M'+String(Math.abs(t)).padStart(2,'0'):String(t).padStart(2,'0'))+'/'+(td!=null?(td<0?'M'+String(Math.abs(td)).padStart(2,'0'):String(td).padStart(2,'0')):''))}
  if(p.barometricPressure?.value!=null){const inhg=p.barometricPressure.value/3386.39;parts.push('A'+Math.round(inhg*100).toString().padStart(4,'0'))}
  return parts.join(' ');
}
async function loadStationObs(icao){
  const el=document.getElementById('page-station');
  S.stationId=icao;
  if(S._stationSource==='vatsim'){
    const st=S.nearbyStations?.find(s=>s.icao===icao)||{icao,name:icao,lat:S.lat,lon:S.lon};
    return loadStationVatsim(st);
  }
  if(S._stationSource==='awc'){return loadStationObsAWC(icao)}
  try{
    const obsRes=await fetch(`https://api.weather.gov/stations/${icao}/observations/latest`,NWS_HDR);
    if(!obsRes.ok)throw new Error('Obs returned '+obsRes.status);
    const obsData=await obsRes.json();
    const p=obsData.properties||{};
    const stInfo=S.nearbyStations?.find(s=>s.icao===icao);
    const geo=obsData.geometry?.coordinates;
    const sLat=stInfo?.lat||(geo?geo[1]:S.lat);
    const sLon=stInfo?.lon||(geo?geo[0]:S.lon);
    S.station={
      icao:icao,
      name:stInfo?.name||S._airportDataCache?.find(a=>a.icao===icao)?.name||icao,
      lat:sLat,
      lon:sLon,
      temp:p.temperature?.value,
      dewp:p.dewpoint?.value,
      windKmh:p.windSpeed?.value,
      windDir:p.windDirection?.value,
      gustKmh:p.windGust?.value,
      visMeter:p.visibility?.value,
      presPa:p.barometricPressure?.value,
      rawMETAR:p.rawMessage||buildSyntheticMetar(icao,p),
      clouds:p.cloudLayers||[],
      obsTime:p.timestamp||'',
      wxString:p.textDescription||'',
    };
    renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
  }catch(e){
    console.error('Obs fetch error:',e);
    try{await loadStationObsAWC(icao)}catch(e2){
      el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>Could not load observations for ${icao}.</p></div>`;
    }
  }
}
async function loadStationObsAWC(icao){
  let data=[];
  for(const hrs of [3,6,12]){
    try{
      const r=await fetch(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json&hours=${hrs}`,{signal:AbortSignal.timeout(8000)});
      if(r.ok){data=await r.json();if(data.length)break}
    }catch(e){console.log('AWC obs fetch error ('+hrs+'h):',e.message)}
  }
  const stInfo=S.nearbyStations?.find(s=>s.icao===icao);
  S.stationId=icao;
  if(data.length){
    S.station=parseAWCobs(data[0]);
    if(stInfo?.name)S.station.name=stInfo.name;
  }else{
    console.log('loadStationObsAWC: No METAR for',icao,'— showing station without obs');
    S.station={
      icao,name:stInfo?.name||icao,lat:stInfo?.lat||S.lat,lon:stInfo?.lon||S.lon,
      temp:null,dewp:null,windKmh:null,windDir:null,gustKmh:null,visMeter:null,presPa:null,
      rawMETAR:'',clouds:[],obsTime:'',wxString:'',_noMetar:true,_reason:'No recent METAR available'
    };
  }
  renderStation();if(_curLang!=='en')setTimeout(quickTranslate,300);
}

function renderStation(){
  const el=document.getElementById('page-station');const s=S.station;if(!s)return;
  const tempC=s.temp;
  const dpC=s.dewp;
  const windKmh=s.windKmh;
  const gustKmh=s.gustKmh;
  const wDir=s.windDir;
  const visMeter=s.visMeter;
  const visSM=visMeter!=null?(visMeter/1609.34):null;
  const presPa=s.presPa;
  const presMb=presPa!=null?(presPa/100):null;
  const rh=(tempC!=null&&dpC!=null)?Math.round(100*Math.exp((17.27*dpC)/(237.7+dpC))/Math.exp((17.27*tempC)/(237.7+tempC))):null;
  const dist=(s.lat!=null&&s.lon!=null)?haversine(S.lat,S.lon,s.lat,s.lon).toFixed(1):'?';
  const raw=s.rawMETAR||'';
  const fltCat=getFltCat(visSM,s);
  const fltCls=fltCat==='VFR'?'vfr':fltCat==='MVFR'?'mvfr':fltCat==='IFR'?'ifr':'lifr';
  const stationName=s.name||S.stationId||'Weather Station';
  const obLabel=s.obsTime?fmtClock(new Date(s.obsTime)):'';

  const skyTxt=formatClouds(s);
  const wxDesc=s.wxString||skyTxt;
  const feelsLike=tempC!=null?calcFeelsLike(tempC,windKmh,rh):null;

  const homeIcao=S.nearbyStations?.length?S.nearbyStations[0].icao:null;
  const isHome=!homeIcao||S.stationId===homeIcao;

  el.innerHTML=`
    <div class="card" style="padding-bottom:8px">
      ${!isHome?`<div style="margin-bottom:8px"><button onclick="switchStation('${homeIcao}')" style="padding:4px 10px;background:rgba(0,229,255,0.1);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:6px;font-size:0.75em;cursor:pointer;font-weight:600">← Back to ${homeIcao}</button></div>`:''}
      ${s._noMetar?`<div style="background:rgba(255,193,7,0.12);border:1px solid rgba(255,193,7,0.35);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:0.78em;color:#ffc107;display:flex;align-items:center;gap:6px"><span style="font-size:1.2em">📡</span><span><b>${s.icao||S.stationId}</b> found — ${s._reason||'No recent METAR available'}. International stations may report infrequently.</span></div>`:''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        ${stationNeonIcon(wxDesc,32)}
        <div style="flex:1">
          <div style="font-weight:700;font-size:0.95em">${S.stationId} — ${stationName}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">
            <span class="flt-cat flt-${fltCls}" style="font-size:0.7em;padding:1px 8px">${fltCat==='VFR'?'●':'◉'} ${fltCat}</span>
            <span style="font-size:0.65em;color:var(--text-muted)">${S.visUnit===1?(dist*1.60934).toFixed(1)+' km':dist+' mi'} away</span>
            ${obLabel?`<span style="font-size:0.6em;color:var(--text-muted);font-family:var(--font-mono)">Updated: ${obLabel}</span>`:''}
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:16px;margin:12px 0;justify-content:center">
        <div class="wind-compass" style="width:100px;height:100px;flex-shrink:0">
          <span class="compass-label compass-n">N</span><span class="compass-label compass-s">S</span>
          <span class="compass-label compass-e">E</span><span class="compass-label compass-w">W</span>
          <div class="wind-arrow" style="transform:rotate(${wDir||0}deg)"></div>
        </div>
        <div style="text-align:left">
          <div style="font-size:1.4em;font-weight:700">${windKmh!=null?fmtWind(windKmh):'Calm'}</div>
          <div style="font-size:0.8em;color:var(--text-muted)">${wDir!=null?degToDir(wDir)+' wind':'Calm'}</div>
          ${gustKmh?`<div style="font-size:0.8em;color:var(--accent-orange);font-weight:600">Gusts ${fmtWind(gustKmh)}</div>`:''}
        </div>
      </div>

      <div class="station-grid" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">
        <div class="station-tile" style="padding:10px">
          <div style="font-size:0.6em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Temperature</div>
          <div class="station-val" style="font-size:1.3em">${tempC!=null?fmtTemp(tempC):'--'}</div>
          ${feelsLike!=null&&Math.abs(feelsLike-tempC)>1?`<div style="font-size:0.65em;color:var(--text-muted)">Feels ${fmtTemp(feelsLike)}</div>`:''}
        </div>
        <div class="station-tile" style="padding:10px">
          <div style="font-size:0.6em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Dew Point</div>
          <div class="station-val" style="font-size:1.3em">${dpC!=null?fmtTemp(dpC):'--'}</div>
          <div style="font-size:0.65em;color:var(--text-muted)">${rh!=null?rh+'% RH':''}</div>
        </div>
      </div>

      <div class="station-grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        <div class="station-tile" style="padding:8px 6px">
          <div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Pressure</div>
          <div class="station-val" style="font-size:1em">${presMb!=null?fmtPres(presMb):'--'}</div>
        </div>
        <div class="station-tile" style="padding:8px 6px">
          <div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Visibility</div>
          <div class="station-val" style="font-size:1em">${visSM!=null?fmtVis(visSM):'--'}</div>
        </div>
        <div class="station-tile" style="padding:8px 6px">
          <div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Sky</div>
          <div class="station-val" style="font-size:${skyTxt.length>10?'0.75':'1'}em">${skyTxt}</div>
        </div>
      </div>

      ${wxDesc?`<div style="text-align:center;font-size:0.75em;color:var(--accent-cyan);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px">${stationNeonIcon(wxDesc,22)} ${wxDesc}</div>`:''}
      ${raw?`<div class="metar-raw" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer">${raw} <span style="font-size:0.75em;color:var(--text-muted)">▼ tap to decode</span></div><div class="metar-decoded" style="display:none">${decodeMetar(raw)}</div>`:''}
    </div>
    ${renderNearbyStations()}`; 
}

function renderNearbyStations(){
  if(!S.nearbyStations||S.nearbyStations.length<=1)return'';
  return`<div class="card"><div class="card-title"><span class="icon">📡</span> Nearby Stations (${S.nearbyStations.length})</div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${S.nearbyStations.map(st=>{
        const active=st.icao===S.stationId;
        return`<div onclick="switchStation('${st.icao}')" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${active?'var(--bg-elevated)':'var(--bg-surface)'};border:1px solid ${active?'var(--accent-blue)':'var(--border-subtle)'};border-radius:var(--radius-sm);cursor:pointer;font-size:0.8em">
          <div><span style="font-weight:700;color:${active?'var(--accent-cyan)':'var(--text-primary)'}">${st.icao}</span> <span style="color:var(--text-muted)">${st.name||''}</span></div>
          <span style="color:var(--text-muted);font-size:0.85em">${st.dist.toFixed(1)} mi</span>
        </div>`;
      }).join('')}
    </div></div>`;
}

async function switchStation(code){
  let icao=code.toUpperCase().trim();
  if(icao.length===3){
    const match=S.nearbyStations?.find(s=>(s.iata||'').toUpperCase()===icao||(s.faa||'').toUpperCase()===icao);
    if(match){icao=match.icao}
    else{
      const airports=await _loadGlobalAirports();
      const dbMatch=airports?.find(a=>(a.iata||'').toUpperCase()===icao);
      if(dbMatch){icao=dbMatch.icao}
      else{
        try{
          const infoR=await fetch(`https://aviationweather.gov/api/data/stationinfo?ids=K${icao},C${icao},E${icao},L${icao},S${icao}&format=json`,{signal:AbortSignal.timeout(5000)});
          if(infoR.ok){const infoD=await infoR.json();if(infoD.length)icao=infoD[0].icaoId}
          else icao='K'+icao;
        }catch(e){icao='K'+icao}
      }
    }
  }
  toast('Loading '+icao+'...');
  S.stationId=icao;
  const isUS=/^K[A-Z]{3}$/.test(icao)||/^P[A-Z]{3}$/.test(icao)||/^TJ[A-Z]{2}$/.test(icao)||/^PH[A-Z]{2}$/.test(icao);
  if(isUS){
    S._stationSource='nws';
    try{
      await loadStationObs(icao);
      return;
    }catch(e){console.log('switchStation: NWS failed for',icao,', trying AWC:',e.message)}
  }
  S._stationSource='awc';
  try{
    await loadStationObsAWC(icao);
  }catch(e){
    console.error('switchStation error for',icao,':',e.message);
    const el=document.getElementById('page-station');
    if(el)el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>Could not load ${icao}.<br><span style="font-size:0.8em;color:var(--text-muted)">${e.message}</span></p></div>`;
  }
}

function decodeMetar(raw){
  if(!raw)return'';
  const WX_CODES={
    'TS':'Thunderstorm','RA':'Rain','SN':'Snow','DZ':'Drizzle','FG':'Fog','BR':'Mist',
    'HZ':'Haze','FU':'Smoke','SA':'Sand','DU':'Dust','SQ':'Squall','FC':'Funnel Cloud',
    'GR':'Hail','GS':'Small Hail/Snow Pellets','IC':'Ice Crystals','PL':'Ice Pellets',
    'SG':'Snow Grains','UP':'Unknown Precip','VA':'Volcanic Ash','PO':'Dust Whirls',
    'SS':'Sandstorm','DS':'Duststorm','FZ':'Freezing','BL':'Blowing','DR':'Low Drifting',
    'MI':'Shallow','PR':'Partial','BC':'Patches','SH':'Showers','PE':'Ice Pellets'
  };
  const parts=raw.trim().split(/\s+/);
  const rows=[];
  const c=(color,label,val,extra)=>`<div style="display:flex;align-items:baseline;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)"><span style="font-family:var(--font-mono);font-weight:700;color:${color};min-width:70px;font-size:0.85em">${label}</span><span style="color:${color};font-weight:600;font-size:0.9em">${val}</span>${extra?`<span style="font-size:0.7em;color:var(--text-muted)">${extra}</span>`:''}</div>`;

  for(let i=0;i<parts.length;i++){
    const p=parts[i];
    if(i===0&&/^[A-Z]{4}$/.test(p)){
      rows.push(c('var(--accent-cyan)','Station',p,'ICAO identifier'));continue;
    }
    if(/^\d{6}Z$/.test(p)){
      const day=p.slice(0,2),hr=p.slice(2,4),mn=p.slice(4,6);
      rows.push(c('#a78bfa','Time',`Day ${day}, ${hr}:${mn} UTC`,'Observation time'));continue;
    }
    if(p==='AUTO'){rows.push(c('#94a3b8','Type','Automated','No human observer'));continue}
    if(p==='COR'){rows.push(c('#f59e0b','Type','Corrected','Correction to prior report'));continue}
    if(/^(VRB|\d{3})\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/.test(p)){
      const m=p.match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?(KT|MPS|KMH)$/);
      if(m){
        const dir=m[1]==='VRB'?'Variable':m[1]+'°';
        const spd=parseInt(m[2]);const gust=m[4]?parseInt(m[4]):null;
        const unit=m[5];
        const unitLabel=unit==='KT'?'knots':unit==='MPS'?'m/s':'km/h';
        const spdKt=unit==='MPS'?spd*1.944:unit==='KMH'?spd*0.5399:spd;
        const gustKt=gust?(unit==='MPS'?gust*1.944:unit==='KMH'?gust*0.5399:gust):null;
        let wStr=`${dir} at ${spd} ${unitLabel}`;
        if(unit!=='KT')wStr+=` (${Math.round(spdKt)} kt)`;
        if(gust){wStr+=`, gusting ${gust} ${unitLabel}`;if(unit!=='KT')wStr+=` (${Math.round(gustKt)} kt)`}
        if(spd===0&&!gust)wStr='Calm';
        const sev=gustKt&&gustKt>=35?'color:var(--accent-red);font-weight:700':spdKt>=25?'color:var(--accent-orange)':'';
        rows.push(c(sev||'#22c55e','Wind',wStr,gustKt>=50?'⚠️ DANGEROUS':''));
      }continue;
    }
    if(/^\d{3}V\d{3}$/.test(p)){
      rows.push(c('#22c55e','Wind Var',`${p.slice(0,3)}° to ${p.slice(4)}°`,'Variable direction'));continue;
    }
    if(/^M?\d+(\/)?(SM)?$/.test(p)||/^\d+\/\d+SM$/.test(p)||/^\d+SM$/.test(p)||p==='M1/4SM'||/^\d+ \d+\/\d+SM$/.test(p)){
      let vis=p.replace('SM','');
      if(vis.startsWith('M'))vis='Less than '+vis.slice(1);
      const visMi=parseFloat(vis)||10;
      const sev=visMi<1?'var(--accent-red)':visMi<3?'var(--accent-orange)':visMi<=5?'#f59e0b':'#22c55e';
      rows.push(c(sev,'Visibility',vis+' statute miles',visMi<3?'⚠️ Low visibility':''));continue;
    }
    if(/^\d{4}$/.test(p)&&!(/^\d{6}Z$/.test(p))&&parseInt(p)>=0&&parseInt(p)<=9999&&i>1){
      const visM=parseInt(p);
      const visKm=(visM/1000).toFixed(1);
      const visMi2=(visM/1609.34).toFixed(1);
      const visStr=visM>=9999?'10+ km (6.2+ mi)':visM>=5000?`${visKm} km (${visMi2} mi)`:`${visM} m (${visMi2} mi)`;
      const sev2=visM<1600?'var(--accent-red)':visM<5000?'var(--accent-orange)':visM<=8000?'#f59e0b':'#22c55e';
      rows.push(c(sev2,'Visibility',visStr,visM<1600?'⚠️ Low visibility':'International (meters)'));continue;
    }
    if(/^R\d{2}/.test(p)){
      rows.push(c('#f59e0b','RVR',p,'Runway visual range'));continue;
    }
    const wxMatch=p.match(/^([+-]|VC)?(TS|SH|FZ|BL|DR|MI|PR|BC)?(RA|SN|DZ|FG|BR|HZ|FU|SA|DU|SQ|FC|GR|GS|IC|PL|SG|UP|VA|PO|SS|DS|PE)+$/);
    if(wxMatch){
      const intensity=p.startsWith('+')?'Heavy':p.startsWith('-')?'Light':p.startsWith('VC')?'Vicinity':'Moderate';
      let desc='';
      const body=p.replace(/^[+-]|^VC/,'');
      for(let j=0;j<body.length;j+=2){
        const code=body.slice(j,j+2);
        if(WX_CODES[code])desc+=(desc?' + ':'')+WX_CODES[code];
      }
      const hasSevere=p.includes('TS')||p.includes('GR')||p.includes('FC')||p.includes('SQ');
      const hasLightning=p.includes('TS');
      const sev=hasSevere?'var(--accent-red)':p.startsWith('+')?'var(--accent-orange)':'#f59e0b';
      rows.push(c(sev,'Weather',`${intensity}: ${desc}`,hasLightning?'⚡ Lightning possible':''));continue;
    }
    if(/^(CLR|SKC|FEW|SCT|BKN|OVC|VV)\d{0,3}/.test(p)){
      const cov=p.match(/^(CLR|SKC|FEW|SCT|BKN|OVC|VV)/)[1];
      const ht=p.replace(cov,'');
      const htFt=ht?parseInt(ht)*100:null;
      const covNames={CLR:'Clear (below 12000ft)',SKC:'Sky Clear',FEW:'Few (1-2 oktas)',SCT:'Scattered (3-4 oktas)',BKN:'Broken (5-7 oktas)',OVC:'Overcast (8 oktas)',VV:'Vertical Visibility'};
      const sev=(cov==='OVC'||cov==='BKN')&&htFt&&htFt<1000?'var(--accent-orange)':cov==='VV'?'var(--accent-red)':'#64748b';
      rows.push(c(sev,'Clouds',`${covNames[cov]||cov}${htFt!=null?' at '+htFt.toLocaleString()+' ft':''}`,''));continue;
    }
    if(/^M?\d{2}\/M?\d{2}$/.test(p)){
      const [t,d]=p.split('/');
      const tc=t.startsWith('M')?-parseInt(t.slice(1)):parseInt(t);
      const dc=d.startsWith('M')?-parseInt(d.slice(1)):parseInt(d);
      const tf=(tc*9/5+32).toFixed(0),df=(dc*9/5+32).toFixed(0);
      rows.push(c('#00e5ff','Temp/Dew',`${tc}°C (${tf}°F) / ${dc}°C (${df}°F)`,`Spread: ${(tc-dc).toFixed(0)}°C`));continue;
    }
    if(/^A\d{4}$/.test(p)){
      const inhg=(parseInt(p.slice(1))/100).toFixed(2);
      const mb=(parseFloat(inhg)*33.8639).toFixed(1);
      rows.push(c('#a78bfa','Altimeter',`${inhg} inHg (${mb} mb)`,''));continue;
    }
    if(/^Q\d{4}$/.test(p)){
      const mb=parseInt(p.slice(1));
      rows.push(c('#a78bfa','QNH',`${mb} hPa`,''));continue;
    }
    if(p==='RMK'){
      const rmk=parts.slice(i+1).join(' ');
      const rmkParts=[];
      if(rmk.includes('AO2'))rmkParts.push('Automated station with precip sensor');
      if(rmk.includes('AO1'))rmkParts.push('Automated station without precip sensor');
      const pkm=rmk.match(/PK WND (\d{3})(\d{2,3})\/(\d{2,4})/);
      if(pkm)rmkParts.push(`Peak wind ${pkm[1]}° at ${pkm[2]} kt at :${pkm[3]}`);
      const slpm=rmk.match(/SLP(\d{3})/);
      if(slpm){const slp=(parseInt(slpm[1])<500?'10':'9')+slpm[1].slice(0,2)+'.'+slpm[1].slice(2);rmkParts.push(`Sea level pressure: ${slp} mb`)}
      const tm=rmk.match(/T(\d)(\d{3})(\d)(\d{3})/);
      if(tm){const t=(tm[1]==='1'?-1:1)*parseInt(tm[2])/10;const d=(tm[3]==='1'?-1:1)*parseInt(tm[4])/10;rmkParts.push(`Precise: ${t.toFixed(1)}°C / ${d.toFixed(1)}°C`)}
      if(rmk.includes('$'))rmkParts.push('⚠️ Station needs maintenance');
      const ltg=rmk.match(/LTG(DSNT|VC)?\s*(CG|IC|CC|CA)*/);
      if(ltg)rmkParts.push('⚡ Lightning observed'+(ltg[1]==='DSNT'?' (distant)':ltg[1]==='VC'?' (vicinity)':''));
      if(rmkParts.length)rows.push(c('#94a3b8','Remarks',rmkParts.join('<br>'),''));
      else rows.push(c('#94a3b8','Remarks',rmk,''));
      break;
    }
  }
  return`<div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:8px 10px;margin-top:4px;font-size:0.8em">${rows.join('')}</div>`;
}

function wxDescToCode(desc){
  if(!desc)return 0;
  const d=desc.toLowerCase();
  if(d.includes('thunder')||d.includes('t-storm'))return d.includes('hail')?96:95;
  if(d.includes('heavy snow')||d.includes('blizzard'))return 75;
  if(d.includes('snow shower'))return 85;
  if(d.includes('snow'))return 73;
  if(d.includes('freezing rain')||d.includes('ice')||d.includes('sleet'))return 66;
  if(d.includes('heavy rain'))return 65;
  if(d.includes('rain shower'))return 80;
  if(d.includes('rain'))return 61;
  if(d.includes('drizzle'))return 51;
  if(d.includes('fog')||d.includes('mist')||d.includes('haze'))return 45;
  if(d.includes('overcast'))return 3;
  if(d.includes('mostly cloudy')||d.includes('broken'))return 3;
  if(d.includes('partly')||d.includes('scattered'))return 2;
  if(d.includes('few cloud'))return 1;
  if(d.includes('clear')||d.includes('fair')||d.includes('sunny'))return 0;
  return 2;
}
function isCurrentlyDay(){
  const h=new Date().getHours();
  return h>=6&&h<20;
}
function metarDescToBasmilius(desc,isDay){
  if(!desc)return null;
  const d=desc.toLowerCase();
  const dn=isDay!==undefined?isDay:isCurrentlyDay();
  if(d.includes('thunder')&&d.includes('rain'))return dn?'thunderstorms-day-rain':'thunderstorms-night-rain';
  if(d.includes('thunder')||d.includes('tsra')||d.includes('ts '))return dn?'thunderstorms-day':'thunderstorms-night';
  if(d.includes('freezing rain')||d.includes('freezing drizzle')||d.includes('fzra')||d.includes('fzdz'))return'sleet';
  if(d.includes('heavy rain')||d.includes('heavy shower'))return dn?'extreme-day-rain':'extreme-night-rain';
  if(d.includes('rain shower')||d.includes('light rain')||d.includes('-ra'))return dn?'partly-cloudy-day-rain':'partly-cloudy-night-rain';
  if(d.includes('rain')||d.includes(' ra'))return'rain';
  if(d.includes('heavy snow'))return dn?'extreme-day-snow':'extreme-night-snow';
  if(d.includes('snow shower')||d.includes('flurr'))return dn?'partly-cloudy-day-snow':'partly-cloudy-night-snow';
  if(d.includes('snow')||d.includes(' sn'))return'snow';
  if(d.includes('drizzle')||d.includes(' dz'))return'drizzle';
  if(d.includes('sleet')||d.includes('ice pellet')||d.includes(' pl'))return'sleet';
  if(d.includes('hail')||d.includes(' gr'))return dn?'extreme-day-hail':'extreme-night-hail';
  if(d.includes('fog')||d.includes('mist')||d.includes(' fg')||d.includes(' br'))return dn?'fog-day':'fog-night';
  if(d.includes('haze')||d.includes('smoke')||d.includes(' hz')||d.includes(' fu'))return dn?'haze-day':'haze-night';
  if(d.includes('dust')||d.includes('sand'))return dn?'dust-day':'dust-night';
  if(d.includes('tornado')||d.includes('funnel'))return'tornado';
  if(d.includes('hurricane'))return'hurricane';
  if(d.includes('overcast')||d==='ovc'||d.startsWith('ovc '))return'overcast';
  if(d.includes('broken')||d.includes('mostly cloudy')||d==='bkn'||d.startsWith('bkn '))return'overcast';
  if(d.includes('scattered')||d.includes('partly cloudy')||d.includes('partly sunny')||d==='sct'||d.startsWith('sct '))return dn?'partly-cloudy-day':'partly-cloudy-night';
  if(d.includes('few cloud')||d.includes('mostly clear')||d.includes('mostly sunny')||d==='few'||d.startsWith('few '))return dn?'partly-cloudy-day':'partly-cloudy-night';
  if(d.includes('clear')||d.includes('fair')||d.includes('sunny')||d==='clr'||d==='skc')return dn?'clear-day':'clear-night';
  if(d.includes('cloudy')||d.includes('cloud'))return'cloudy';
  if(d.includes('wind'))return'wind';
  return null;
}
function stationNeonIcon(desc,sz){
  const s=parseInt(sz)||24;
  const dn=isCurrentlyDay();
  const bm=metarDescToBasmilius(desc,dn);
  if(bm)return bmIcon(bm,s);
  return neonWx(wxDescToCode(desc),dn,s);
}

function formatClouds(s){
  if(!s.clouds||!s.clouds.length)return'CLR';
  return s.clouds.map(c=>{
    const cvg=c.amount||c.cover||'';
    let baseFt=null;
    if(c.base!=null&&typeof c.base==='object'&&c.base.value!=null)baseFt=Math.round(c.base.value*3.281/100)*100;
    else if(typeof c.base==='number')baseFt=Math.round(c.base/100)*100;
    return cvg+(baseFt!=null?' '+baseFt+'ft':'');
  }).filter(Boolean).join(', ')||'CLR';
}

function renderMetarDecoded(s){
  const parts=[];
  if(s.temp!=null)parts.push(`<span>🌡️ Temp: ${fmtTemp(s.temp)}</span>`);
  if(s.dewp!=null)parts.push(`<span>💧 Dew: ${fmtTemp(s.dewp)}</span>`);
  if(s.windKmh!=null){
    let w=`💨 Wind: ${fmtWind(s.windKmh)} ${s.windDir!=null?degToDir(s.windDir):'VRB'}`;
    if(s.gustKmh!=null)w+=` G${fmtWind(s.gustKmh)}`;
    parts.push(`<span>${w}</span>`);
  }
  if(s.visMeter!=null)parts.push(`<span>👁️ Vis: ${fmtVis(s.visMeter/1609.34)}</span>`);
  if(s.presPa!=null)parts.push(`<span>📊 Baro: ${fmtPres(s.presPa/100)}</span>`);
  if(s.wxString)parts.push(`<span style="color:var(--accent-orange)">🌤️ ${s.wxString}</span>`);
  if(!parts.length)return'';
  return`<div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:12px;font-size:0.7em;color:var(--text-secondary)">${parts.join('')}</div>`;
}

function getFltCat(visSM,s){
  let effCeil=99999;
  if(s.clouds&&s.clouds.length){
    for(const c of s.clouds){
      const amt=(c.amount||c.cover||'').toUpperCase();
      const baseFt=(c.base!=null&&typeof c.base==='object'&&c.base.value!=null)?c.base.value*3.281:(typeof c.base==='number'?c.base:null);
      if((amt==='BKN'||amt==='OVC'||amt==='VV')&&baseFt!=null){effCeil=Math.min(effCeil,baseFt);break}
    }
  }
  if((visSM!=null&&visSM<1)||effCeil<500)return'LIFR';
  if((visSM!=null&&visSM<3)||effCeil<1000)return'IFR';
  if((visSM!=null&&visSM<=5)||effCeil<=3000)return'MVFR';
  return'VFR';
}

// ==========================================
// ALERTS (NWS)
// ==========================================
async function fetchAlerts(){
  const el=document.getElementById('page-alerts');showSkel(el,3);
  try{
    const res=await fetch(`https://api.weather.gov/alerts/active?point=${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{headers:{'User-Agent':'StormTracker/1.50'}});
    const data=await res.json();S.alerts=data.features||[];renderAlerts();if(_curLang!=='en')setTimeout(quickTranslate,300);
  }catch(e){S.alerts=[];renderAlerts()}
  _extractFloodAlerts();
  fetchSPCData().then(()=>{if(S.activePage==='alerts'){renderAlerts();renderHazards()}if(S.map){plotSPCWatchPolygons(S.map);plotNWSWarningPolygons(S.map);plotSPCReports(S.map)}});
  fetchNHCData().then(()=>{if(S.map)plotNHCTracks(S.map);_nhcProximityCheck();if(S.activePage==='alerts'){renderAlerts();renderHazards()}if(S.activePage==='weather')_updateTropicalUI()});
  if(S.activePage==='alerts')renderHazards();
}

function updateAlertBadge(){
  const badge=document.getElementById('nav-alert-badge');
  if(!badge)return;
  const n=(S.alerts||[]).length;
  badge.textContent=n;
  badge.style.background=n>0?'#ef4444':'#6b7280';
}
function renderAlerts(){
  const el=document.getElementById('page-alerts');
  updateAlertBadge();
  if(!S.lat){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📍</div><p>Set your location to check alerts.</p></div>`;return}
  let html='';
  const alerts=S.alerts||[];
  const now=Date.now();
  if(alerts.length){
    S.alerts=alerts.filter(a=>{const e=a.properties?.expires;return !e||new Date(e).getTime()>now});
    updateAlertBadge();
  }
  if(S.alerts&&S.alerts.length){
    const zoneAlerts=S.alerts.filter(a=>isUserInAlertZone(a));
    const zoneBanner=zoneAlerts.length?`<div style="background:rgba(220,38,38,0.2);border:1px solid rgba(220,38,38,0.5);border-radius:8px;padding:8px 12px;margin-bottom:8px;display:flex;align-items:center;gap:8px;animation:pulse 2s infinite"><span style="font-size:1.2em">🔴</span><span style="font-size:0.8em;font-weight:700;color:#fca5a5">Your location is inside ${zoneAlerts.length} active alert zone${zoneAlerts.length>1?'s':''}: ${zoneAlerts.map(a=>escHtml(a.properties?.event||'Alert')).join(', ')}</span></div>`:'';
    html+=`<div class="card"><div class="card-title"><span class="icon">⚠️</span> NWS Alerts (${S.alerts.length})</div>${zoneBanner}
    ${S.alerts.map((a,i)=>{
      const p=a.properties||{};const event=p.event||'Alert';const sev=(p.severity||'').toLowerCase();
      const evLow=event.toLowerCase();
      const isTorWarn=evLow.includes('tornado warning');
      const isSvrWarn=evLow.includes('severe thunderstorm warning');
      let cls=(sev==='extreme'||sev==='severe')?'':sev==='moderate'?'watch':'advisory';
      if(isTorWarn)cls='tornado-warning';
      else if(isSvrWarn)cls='svr-warning';
      const desc=(p.description||'').replace(/\n/g,'<br>');
      const sevIcon=isTorWarn?'🌪️':isSvrWarn?'⛈️':sev==='extreme'?'🔴':sev==='severe'?'🟠':sev==='moderate'?'🟡':'🔵';
      const inZone=isUserInAlertZone(a);
      const zoneBadge=inZone?'<span style="display:inline-block;background:#dc2626;color:#fff;font-size:0.55em;font-weight:700;padding:2px 6px;border-radius:10px;margin-left:6px;animation:pulse 2s infinite;vertical-align:middle">IN YOUR ZONE</span>':'';
      return`<div class="nws-alert ${cls}" style="${inZone?'border-color:#dc2626;box-shadow:0 0 8px rgba(220,38,38,0.3)':''}"><div class="nws-alert-title">${sevIcon} ${event}${zoneBadge}</div><div class="nws-alert-detail" style="white-space:pre-wrap;word-break:break-word">${desc}</div>${p.expires?`<div class="nws-alert-expires">⏱️ <span id="alert-cd-${i}" data-exp="${new Date(p.expires).getTime()}"></span></div>`:''}</div>`;
    }).join('')}</div>`;
  }else{
    html+=`<div class="alert-banner safe"><span class="alert-icon">✅</span><div class="alert-text"><span class="alert-title">No Active NWS Alerts</span><br>No NWS warnings or watches for your area.</div></div>
      <div style="font-size:0.7em;color:var(--text-muted);text-align:center;padding:10px">NWS alerts cover US locations only.</div>`;
  }
  html+=_renderStormSurgeSection();
  html+=_renderTropicalSection();
  html+=_renderSPCWatchSection();
  html+=_renderSPCMDSection();
  html+=_renderSPCReportsSection();
  const hist=_wxAlertHistory.slice().reverse();
  html+=`<div class="card" style="margin-top:12px"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center"><span><span class="icon">🔔</span> Station Alerts${hist.length?' ('+hist.length+')':''}</span>${hist.length?'<button onclick="clearWxAlertHistory()" style="font-size:0.7em;padding:2px 8px;background:rgba(255,51,85,0.1);color:var(--accent-red);border:1px solid rgba(255,51,85,0.3);border-radius:6px;cursor:pointer;font-weight:600;text-transform:none;letter-spacing:0">Clear</button>':''}</div>`;
  if(!hist.length){
    const wxTh=_loadWxThresholds();
    const wxAny=Object.values(wxTh).some(t=>t&&t.on);
    html+=wxAny
      ?`<div style="text-align:center;padding:12px;color:var(--accent-green);font-size:0.75em">✅ All clear — no weather thresholds exceeded</div>`
      :`<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.75em">No station alerts yet. Enable thresholds in Settings ⚙️ → Weather Station Alerts 🔔</div>`;
  }else{
    hist.slice(0,20).forEach(h=>{
      const d=new Date(h.time);
      const tStr=fmtClock(d)+' · '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
      html+=`<div style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);font-size:0.78em">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <span>${h.icon||'🔔'}</span>
          <span style="font-weight:600;color:var(--text-primary)">${h.label}</span>
          <span style="margin-left:auto;font-size:0.8em;color:var(--text-muted);font-family:var(--font-mono)">${tStr}</span>
        </div>
        <div style="color:var(--text-secondary);font-size:0.9em">${h.msg.replace('🔔 ','')}</div>
      </div>`;
    });
  }
  html+=`</div>`;
  const stormHist=_stormAlertHistory.slice().reverse();
  html+=`<div class="card" style="margin-top:12px"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center"><span><span class="icon">🌩️</span> Storm Cell Alerts${stormHist.length?' ('+stormHist.length+')':''}</span>${stormHist.length?'<button onclick="clearStormAlertHistory()" style="font-size:0.7em;padding:2px 8px;background:rgba(255,51,85,0.1);color:var(--accent-red);border:1px solid rgba(255,51,85,0.3);border-radius:6px;cursor:pointer;font-weight:600;text-transform:none;letter-spacing:0">Clear</button>':''}</div>`;
  if(!stormHist.length){
    const stTh=_loadStormThresholds();
    const stAny=Object.values(stTh).some(t=>t&&t.on);
    html+=stAny
      ?`<div style="text-align:center;padding:12px;color:var(--accent-green);font-size:0.75em">✅ All clear — no storms currently match your thresholds</div>`
      :`<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.75em">No storm cell alerts yet. Enable thresholds in Settings ⚙️ → Storm Cell Alerts 🌩️</div>`;
  }else{
    stormHist.slice(0,20).forEach(h=>{
      const d=new Date(h.time);
      const tStr=fmtClock(d)+' · '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
      const tierColors={high:'#eab308',medium:'#06b6d4',low:'#ec4899',none:'#22c55e'};
      const tc=tierColors[h.impactTier]||'#666';
      html+=`<div style="padding:8px 10px;border-bottom:1px solid var(--border-subtle);font-size:0.78em">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <span>🌩️</span>
          <span style="font-weight:600;color:var(--text-primary)">${h.val} dBZ</span>
          ${h.impactPct>0?`<span style="font-size:0.8em;padding:1px 6px;border-radius:8px;background:${tc}18;color:${tc};font-weight:600">${h.impactPct}%</span>`:''}
          <span style="margin-left:auto;font-size:0.8em;color:var(--text-muted);font-family:var(--font-mono)">${tStr}</span>
        </div>
        <div style="color:var(--text-secondary);font-size:0.9em">${h.msg.replace('🌩️ ','')}</div>
      </div>`;
    });
  }
  html+=`</div>`;
  html+=`<div id="hazards-section"></div>`;
  el.innerHTML=html;
  if(S.alerts&&S.alerts.length)startAlertCountdowns();
  renderHazards();
}

// ==========================================
// ENVIRONMENTAL HAZARDS
// ==========================================
let _hazardData={earthquakes:null,floods:null,wildfires:null,drought:null,riverGauges:null,volcanoes:null,_lastFetch:0};

function getEqRadius(){return parseInt(localStorage.getItem('eqRadius')||'200')}
function setEqRadius(val){
  localStorage.setItem('eqRadius',String(val));
  _hazardData._lastFetch=0;_hazardData.earthquakes=null;
  if(S.activePage==='alerts')fetchHazards();
  toast('🌍 Earthquake radius: '+val+' mi');
}

function _extractUSState(){
  const name=S.locName||'';
  const stateMap={'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'};
  const abbrs=Object.values(stateMap);
  const parts=name.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean);
  for(const p of parts){if(abbrs.includes(p.toUpperCase()))return p.toUpperCase()}
  for(const [full,abbr] of Object.entries(stateMap)){if(name.toLowerCase().includes(full.toLowerCase()))return abbr}
  return null;
}

async function _fetchRecentPrecip(){
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}&daily=precipitation_sum&past_days=30&forecast_days=0&timezone=auto`;
    const res=await fetch(url,{signal:AbortSignal.timeout(6000)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    const daily=data.daily?.precipitation_sum||[];
    const total30=daily.reduce((s,v)=>s+(v||0),0);
    const monthNormals=[3.5,3.2,4.1,3.8,4.3,4.2,4.5,4.3,3.9,3.5,3.5,3.4];
    const month=new Date().getMonth();
    const normalMo=monthNormals[month];
    const normalMm=normalMo*25.4;
    const pctNormal=normalMm>0?Math.round((total30/normalMm)*100):null;
    const totalIn=(total30/25.4).toFixed(2);
    _hazardData.recentPrecip={total30,totalIn,pctNormal,normalIn:normalMo.toFixed(1)};
  }catch(e){_hazardData.recentPrecip=null;console.log('Precip fetch error:',e.message)}
}

async function fetchHazards(){
  if(!S.lat||!S.lon)return;
  const now=Date.now();
  const locKey=S.lat.toFixed(2)+','+S.lon.toFixed(2);
  if(now-_hazardData._lastFetch<300000&&_hazardData.earthquakes!==null&&_hazardData._locKey===locKey)return;
  _hazardData._lastFetch=now;
  _hazardData._locKey=locKey;
  const isUS=isUSLocation(S.lat,S.lon);
  _hazardData._isUS=isUS;
  if(!isUS){
    _hazardData.drought=null;
    _hazardData.riverGauges=[];
  }
  await Promise.allSettled([
    _fetchEarthquakes(),
    _fetchVolcanoes(),
    _fetchWildfires(),
    isUS?_fetchDrought():Promise.resolve(),
    isUS?_fetchRiverGauges():Promise.resolve(),
    _fetchRecentPrecip(),
    isUS?fetchSPCData():Promise.resolve(),
    fetchNHCData()
  ]);
  if(S.activePage==='alerts')renderHazards();
}

async function _fetchEarthquakes(){
  try{
    const res=await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    const data=await res.json();
    const quakes=(data.features||[]).filter(f=>f.geometry&&f.geometry.coordinates&&f.properties).map(f=>{
      const [lon,lat,depth]=f.geometry.coordinates;
      const dist=haversine(S.lat,S.lon,lat,lon);
      return{mag:f.properties.mag||0,place:f.properties.place||'Unknown',time:f.properties.time,depth:depth||0,dist:dist,lat,lon,url:f.properties.url};
    }).filter(q=>q.dist<=getEqRadius()).sort((a,b)=>a.dist-b.dist).slice(0,15);
    _hazardData.earthquakes=quakes;
  }catch(e){_hazardData.earthquakes=[];console.log('Earthquake fetch error:',e.message)}
}

async function _fetchVolcanoes(){
  try{
    const res=await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=volcanoes',{signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    const volcanoes=(data.events||[]).map(e=>{
      const geo=e.geometry&&e.geometry.length?e.geometry[e.geometry.length-1]:null;
      if(!geo||!geo.coordinates)return null;
      const [lon,lat]=geo.coordinates;
      const dist=haversine(S.lat,S.lon,lat,lon);
      const title=e.title||'Unknown Volcano';
      const nameParts=title.replace(' Volcano','').split(',');
      const name=nameParts[0].trim();
      const country=nameParts.length>1?nameParts[nameParts.length-1].trim():'';
      return{name,country,dist,lat,lon,date:geo.date?geo.date.substring(0,10):'',title};
    }).filter(v=>v&&v.dist<=500).sort((a,b)=>a.dist-b.dist).slice(0,10);
    _hazardData.volcanoes=volcanoes;
  }catch(e){_hazardData.volcanoes=[];console.log('Volcano fetch error:',e.message)}
}

const _stateFips={AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56',DC:'11',PR:'72'};

async function _fetchDrought(){
  const st=_extractUSState()||'';
  try{
    const d=0.01;
    const url=`https://ndmcgeodata.unl.edu/cgi-bin/mapserv.exe?map=/ms4w/apps/usdm/map/usdm_current_wms.map&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=usdm_current&QUERY_LAYERS=usdm_current&STYLES=default&CRS=EPSG:4326&BBOX=${S.lat-d},${S.lon-d},${S.lat+d},${S.lon+d}&WIDTH=2&HEIGHT=2&I=1&J=1&INFO_FORMAT=text/plain&FEATURE_COUNT=10`;
    const res=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const txt=await res.text();
    const dmMatches=[...txt.matchAll(/DM\s*=\s*'(\d+)'/g)].map(m=>parseInt(m[1]));
    if(dmMatches.length===0){
      _hazardData.drought={state:st,level:-1,levelName:'None',d0:0,d1:0,d2:0,d3:0,d4:0};
      return;
    }
    const maxDM=Math.max(...dmMatches);
    const names=['D0 Abnormally Dry','D1 Moderate Drought','D2 Severe Drought','D3 Extreme Drought','D4 Exceptional Drought'];
    const d0=dmMatches.includes(0)?1:0,d1=dmMatches.includes(1)?1:0,d2=dmMatches.includes(2)?1:0,d3=dmMatches.includes(3)?1:0,d4=dmMatches.includes(4)?1:0;
    _hazardData.drought={state:st,level:maxDM,levelName:names[maxDM]||'Unknown',d0,d1,d2,d3,d4,layers:dmMatches.sort()};
  }catch(e){
    _hazardData.drought={error:'cors',state:st};
    console.log('Drought fetch error:',e.message);
  }
}

async function _fetchWildfires(){
  const isUS=isUSLocation(S.lat,S.lon);
  if(isUS){
    try{
      const url=`https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,attr_IncidentName,poly_GISAcres,poly_DateCurrent,attr_PercentContained,attr_FireDiscoveryDateTime,attr_InitialLatitude,attr_InitialLongitude,attr_POOState&returnGeometry=false&f=json&resultRecordCount=2000`;
      const res=await fetch(url,{signal:AbortSignal.timeout(10000)});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      if(data.error){_hazardData.wildfires={error:'api'};console.log('Wildfire API error:',data.error.message);return}
      const maxDist=300;
      const fires=(data.features||[]).map(f=>{
        const a=f.attributes;
        const lat=a.attr_InitialLatitude;
        const lon=a.attr_InitialLongitude;
        const dist=(lat&&lon)?haversine(S.lat,S.lon,lat,lon):9999;
        return{name:a.poly_IncidentName||a.attr_IncidentName||'Unknown Fire',acres:a.poly_GISAcres?Math.round(a.poly_GISAcres):null,contained:a.attr_PercentContained,date:a.poly_DateCurrent||a.attr_FireDiscoveryDateTime,dist,state:a.attr_POOState||'',source:'nifc'};
      }).filter(f=>f.name&&f.name!=='Unknown Fire'&&f.dist<=maxDist).sort((a,b)=>a.dist-b.dist).slice(0,10);
      _hazardData.wildfires=fires;
    }catch(e){_hazardData.wildfires=[];console.log('Wildfire fetch error (NIFC):',e.message)}
  }else{
    try{
      const res=await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&category=wildfires&limit=200',{signal:AbortSignal.timeout(12000)});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      const maxDist=300;
      const fires=(data.events||[]).map(e=>{
        const geo=e.geometry&&e.geometry.length?e.geometry[e.geometry.length-1]:null;
        if(!geo||!geo.coordinates)return null;
        const [lon,lat]=geo.coordinates;
        const dist=haversine(S.lat,S.lon,lat,lon);
        const title=e.title||'Unknown Fire';
        const nameParts=title.split(',');
        const name=nameParts[0].trim();
        const country=nameParts.length>1?nameParts[nameParts.length-1].trim():'';
        return{name,country,dist,date:geo.date?new Date(geo.date).getTime():null,source:'eonet'};
      }).filter(f=>f&&f.dist<=maxDist).sort((a,b)=>a.dist-b.dist).slice(0,10);
      _hazardData.wildfires=fires;
    }catch(e){_hazardData.wildfires=[];console.log('Wildfire fetch error (EONET):',e.message)}
  }
}

async function _fetchRiverGauges(){
  try{
    const bBox=`${(S.lon-0.5).toFixed(4)},${(S.lat-0.5).toFixed(4)},${(S.lon+0.5).toFixed(4)},${(S.lat+0.5).toFixed(4)}`;
    const url=`https://waterservices.usgs.gov/nwis/iv/?format=json&bBox=${bBox}&parameterCd=00065&siteStatus=active&siteType=ST`;
    const res=await fetch(url,{signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    const ts=data.value?.timeSeries||[];
    const gauges=ts.map(s=>{
      const info=s.sourceInfo||{};
      const name=info.siteName||'Unknown Gauge';
      const lat2=parseFloat(info.geoLocation?.geogLocation?.latitude||0);
      const lon2=parseFloat(info.geoLocation?.geogLocation?.longitude||0);
      const dist=haversine(S.lat,S.lon,lat2,lon2);
      const vals=s.values?.[0]?.value||[];
      const latest=vals.length>0?vals[vals.length-1]:null;
      const height=latest?parseFloat(latest.value):null;
      const time=latest?latest.dateTime:null;
      return{name,dist,height,time,siteCode:info.siteCode?.[0]?.value||''};
    }).filter(g=>g.height!==null&&!isNaN(g.height)&&g.dist<=50).sort((a,b)=>a.dist-b.dist).slice(0,5);
    _hazardData.riverGauges=gauges;
  }catch(e){_hazardData.riverGauges=[];console.log('River gauge fetch error:',e.message)}
}

function _renderSPCWatchSection(){
  if (!isUSLocation(S.lat, S.lon)) return '';
  const watches = _spcData.watches;
  if (!watches || !watches.length) {
    return `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">🌪️</span> SPC Watches</div>
      <div style="text-align:center;padding:12px;color:var(--accent-green);font-size:0.75em">✅ No active SPC watches for the US</div></div>`;
  }
  const userWatches = watches.filter(w => _isPointInSpcWatch(S.lat, S.lon, w));
  const otherWatches = watches.filter(w => !_isPointInSpcWatch(S.lat, S.lon, w));
  let html = `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">🌪️</span> SPC Watches (${watches.length})</div>`;
  if (userWatches.length) {
    html += `<div class="alert-banner danger" style="margin-bottom:8px;border-left:4px solid ${userWatches.some(w => w.type === 'tornado') ? '#ff1744' : '#ff9800'}"><span class="alert-icon">${userWatches.some(w => w.type === 'tornado') ? '🌪️' : '⛈️'}</span><div class="alert-text"><span class="alert-title">You are in a ${userWatches.some(w => w.type === 'tornado') ? 'TORNADO' : 'SEVERE THUNDERSTORM'} WATCH</span><br>Conditions are favorable for severe weather in your area.</div></div>`;
  }
  const allW = [...userWatches, ...otherWatches];
  allW.forEach(w => {
    const isTor = w.type === 'tornado';
    const cls = isTor ? 'tor-watch' : 'svr-watch';
    const icon = isTor ? '🌪️' : '⛈️';
    const label = isTor ? 'Tornado Watch' : 'Severe Thunderstorm Watch';
    const inArea = _isPointInSpcWatch(S.lat, S.lon, w);
    let expStr = '';
    if (w.expTime) {
      const remain = w.expTime - Date.now();
      if (remain > 0) {
        const hrs = Math.floor(remain / 3600000);
        const mins = Math.floor((remain % 3600000) / 60000);
        expStr = hrs > 0 ? hrs + 'h ' + mins + 'm remaining' : mins + 'm remaining';
      }
    }
    html += `<div class="spc-watch-card ${cls}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:1.1em">${icon}</span>
        <span style="font-weight:700;font-size:0.9em;color:${isTor ? '#ff1744' : '#ff9800'}">${label} #${w.number}</span>
        ${inArea ? '<span style="font-size:0.6em;background:rgba(255,23,68,0.2);color:#ff4444;padding:1px 6px;border-radius:8px;font-weight:700">YOUR AREA</span>' : ''}
      </div>
      <div style="font-size:0.75em;color:var(--text-secondary)">${w.states || ''}</div>
      ${expStr ? `<div style="font-size:0.7em;color:var(--text-muted);margin-top:2px">⏱️ ${expStr}</div>` : ''}
    </div>`;
  });
  html += `<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: NOAA Storm Prediction Center</div></div>`;
  return html;
}
function _renderSPCReportsSection(){
  if (!isUSLocation(S.lat, S.lon)) return '';
  const reports = _spcData.reports;
  if (!reports || !reports.length) {
    return `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">📋</span> SPC Storm Reports (Today)</div>
      <div style="text-align:center;padding:12px;color:var(--accent-green);font-size:0.75em">✅ No severe weather reports today nearby</div></div>`;
  }
  const nearby = reports.filter(r => r.dist <= 200);
  if (!nearby.length) {
    return `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">📋</span> SPC Storm Reports (Today)</div>
      <div style="text-align:center;padding:12px;color:var(--accent-green);font-size:0.75em">✅ No severe weather reports within 200 mi today</div></div>`;
  }
  const tornadoes = nearby.filter(r => r.type === 'tornado');
  const hail = nearby.filter(r => r.type === 'hail');
  const wind = nearby.filter(r => r.type === 'wind');
  const toggleChecked = S._showSPCReports ? 'checked' : '';
  let html = `<div class="card" style="margin-top:12px"><div class="card-title" style="display:flex;justify-content:space-between;align-items:center"><span><span class="icon">📋</span> SPC Storm Reports (${nearby.length} today)</span><label style="display:flex;align-items:center;gap:4px;font-size:0.65em;font-weight:500;color:var(--text-muted);cursor:pointer"><span>Map</span><input type="checkbox" ${toggleChecked} onchange="toggleSPCReports(this.checked)" style="accent-color:var(--accent-cyan)"></label></div>`;
  const summary = [];
  if (tornadoes.length) summary.push(`🌪️ ${tornadoes.length} tornado${tornadoes.length > 1 ? 'es' : ''}`);
  if (hail.length) summary.push(`🧊 ${hail.length} hail`);
  if (wind.length) summary.push(`💨 ${wind.length} wind`);
  html += `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;padding:0 4px">${summary.map(s => `<span style="font-size:0.75em;font-weight:600;color:var(--text-secondary)">${s}</span>`).join('<span style="color:var(--text-muted)">·</span>')}</div>`;
  nearby.slice(0, 15).forEach(r => {
    const icon = r.type === 'tornado' ? '🌪️' : r.type === 'hail' ? '🧊' : '💨';
    const color = r.type === 'tornado' ? '#ff1744' : r.type === 'hail' ? '#00e5ff' : '#ff9800';
    const label = r.type === 'tornado' ? 'Tornado' : r.type === 'hail' ? `Hail (${r.magnitude}")` : `Wind (${r.magnitude} mph)`;
    const distStr = S.radarMetric ? Math.round(r.dist * 1.60934) + ' km' : Math.round(r.dist) + ' mi';
    html += `<div style="padding:6px 8px;border-left:3px solid ${color};background:${color}08;border-radius:0 6px 6px 0;margin-bottom:4px;font-size:0.75em">
      <div style="display:flex;align-items:center;gap:6px">
        <span>${icon}</span>
        <span style="font-weight:700;color:var(--text-primary)">${label}</span>
        <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">${distStr} · ${r.time} UTC</span>
      </div>
      <div style="font-size:0.9em;color:var(--text-secondary);margin-top:2px">${r.location}, ${r.state}${r.comment ? ' — ' + r.comment : ''}</div>
    </div>`;
  });
  html += `<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: NOAA Storm Prediction Center · Today's reports</div></div>`;
  return html;
}
function toggleSPCReports(on){
  S._showSPCReports = on;
  try { localStorage.setItem('st_spc_reports', on ? '1' : '0'); } catch(e) {}
  if (S.map) plotSPCReports(S.map);
  toast(on ? 'SPC reports shown on map' : 'SPC reports hidden from map');
}
function _renderSPCMDSection(){
  if (!isUSLocation(S.lat, S.lon)) return '';
  const allMds = _spcData.md;
  const mds = (allMds||[]).filter(md => {
    if (md._pts && md._pts.length) {
      let minD = Infinity;
      for (const p of md._pts) { const d = haversine(S.lat, S.lon, p.lat, p.lon); if (d < minD) minD = d; }
      return minD <= 200;
    }
    if (md.lat != null && md.lon != null) return haversine(S.lat, S.lon, md.lat, md.lon) <= 200;
    return false;
  });
  if (!mds.length) {
    return `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">📝</span> Mesoscale Discussions</div>
      <div style="text-align:center;padding:12px;color:var(--accent-green);font-size:0.75em">✅ No active mesoscale discussions nearby</div></div>`;
  }
  let html = `<div class="card" style="margin-top:12px"><div class="card-title"><span class="icon">📝</span> Mesoscale Discussions (${mds.length})</div>`;
  mds.forEach(md => {
    const isTor = md.type === 'tornado';
    const isSvr = md.type === 'severe';
    const color = isTor ? '#ff1744' : isSvr ? '#ff9800' : '#00e5ff';
    const icon = isTor ? '🌪️' : isSvr ? '⛈️' : '📝';
    html += `<div class="spc-watch-card md" style="border-left:3px solid ${color}">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:1em">${icon}</span>
        <span style="font-weight:700;font-size:0.85em;color:var(--text-primary)">MD #${md.number}</span>
        ${md.validFrom ? `<span style="font-size:0.65em;color:var(--text-muted);margin-left:auto">${md.validFrom} - ${md.validTo}</span>` : ''}
      </div>
      ${md.concerning ? `<div style="font-size:0.75em;color:${color};font-weight:600">${md.concerning}</div>` : ''}
      ${md.area ? `<div style="font-size:0.7em;color:var(--text-secondary);margin-top:2px">📍 ${md.area}</div>` : ''}
    </div>`;
  });
  html += `<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: NOAA Storm Prediction Center</div></div>`;
  return html;
}
function _extractFloodAlerts(){
  const floodEvents=['Flood','Flash Flood','Coastal Flood','Storm Surge','River Flood','Lakeshore Flood','Hydrologic'];
  const fireEvents=['Fire Weather','Red Flag','Fire'];
  const floods=[];
  const fireAlerts=[];
  (S.alerts||[]).forEach(a=>{
    const event=(a.properties?.event||'').toLowerCase();
    if(floodEvents.some(e=>event.includes(e.toLowerCase())))floods.push(a);
    if(fireEvents.some(e=>event.includes(e.toLowerCase())))fireAlerts.push(a);
  });
  _hazardData.floods=floods;
  _hazardData.fireAlerts=fireAlerts;
}

function renderHazards(){
  const el=document.getElementById('hazards-section');
  if(!el)return;
  if(!S.lat){el.innerHTML='';return}
  const isUS=isUSLocation(S.lat,S.lon);
  const sources=isUS?'USGS, NWS, NIFC, USDM & NASA':'USGS, NASA EONET';
  const _hzStale=_isOffline&&_hazardData._lastFetch?`<div style="text-align:center;padding:4px 10px;margin:0 0 8px;background:rgba(180,83,9,0.15);border:1px solid rgba(251,191,36,0.25);border-radius:8px;font-size:0.65em;color:#fbbf24">📡 Cached data · Last updated ${_relativeTime(_hazardData._lastFetch)}</div>`:'';
  let html=`<div class="card" style="margin-top:12px">
    <div class="card-title"><span class="icon">🌍</span> Environmental Hazards</div>
    <div style="font-size:0.65em;color:var(--text-muted);margin-bottom:10px">Real-time hazard monitoring from ${sources}</div>${_hzStale}`;
  html+=_renderHazardSummary();
  html+=_renderTropicalHazardSection();
  html+=_renderEarthquakeSection();
  html+=_renderVolcanoSection();
  if(isUS)html+=_renderFloodSection();
  html+=_renderWildfireSection();
  if(isUS)html+=_renderDroughtSection();
  else html+=_renderPrecipOnlySection();
  const _hzTime=_hazardData._lastFetch?new Date(_hazardData._lastFetch).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'';
  html+=_hzTime?`<div style="text-align:center;font-size:0.6em;color:var(--text-muted);margin-top:8px">Data as of ${_hzTime}</div>`:'';
  html+=`<div style="text-align:center;margin-top:6px"><button id="btn-refresh-hazards" onclick="_refreshHazardsBtn()" style="font-size:0.7em;padding:4px 14px;background:rgba(0,229,255,0.08);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.2);border-radius:6px;cursor:pointer;font-weight:600">🔄 Refresh Hazards</button></div>`;
  html+=`</div>`;
  el.innerHTML=html;
}

async function _refreshHazardsBtn(){
  const btn=document.getElementById('btn-refresh-hazards');
  if(btn){btn.disabled=true;btn.textContent='Updating...';btn.style.opacity='0.5'}
  _hazardData._lastFetch=0;
  try{await fetchHazards();renderHazards()}catch(e){console.log('Hazard refresh error:',e.message)}
  finally{const b=document.getElementById('btn-refresh-hazards');if(b){b.disabled=false;b.textContent='🔄 Refresh Hazards';b.style.opacity='1'}}
}

function _renderHazardSummary(){
  const isUS=isUSLocation(S.lat,S.lon);
  const eq=_hazardData.earthquakes;
  const vol=_hazardData.volcanoes;
  const fl=_hazardData.floods;
  const wf=_hazardData.wildfires;
  const dr=_hazardData.drought;
  const items=[];
  if(eq===null)items.push({icon:'🔄',label:'Earthquakes',status:'Loading...',color:'#666'});
  else if(eq.length===0)items.push({icon:'✅',label:'Earthquakes',status:'Clear',color:'#22c55e'});
  else{const maxMag=Math.max(...eq.map(q=>q.mag));items.push({icon:maxMag>=5?'🔴':maxMag>=4?'🟠':'🟡',label:'Earthquakes',status:`${eq.length} nearby`,color:maxMag>=5?'#ef4444':maxMag>=4?'#f97316':'#eab308'})}
  if(vol===null)items.push({icon:'🔄',label:'Volcanoes',status:'Loading...',color:'#666'});
  else if(vol.length===0)items.push({icon:'✅',label:'Volcanoes',status:'Clear',color:'#22c55e'});
  else items.push({icon:'🌋',label:'Volcanoes',status:`${vol.length} active`,color:'#ef4444'});
  if(isUS){
    if(!fl||fl.length===0)items.push({icon:'✅',label:'Flooding',status:'Clear',color:'#22c55e'});
    else items.push({icon:'🔴',label:'Flooding',status:`${fl.length} alert${fl.length>1?'s':''}`,color:'#ef4444'});
  }
  if(wf===null)items.push({icon:'🔄',label:'Wildfires',status:'Loading...',color:'#666'});
  else if(wf&&wf.error)items.push({icon:'⚠️',label:'Wildfires',status:'Data unavailable',color:'#888'});
  else if(!wf||wf.length===0)items.push({icon:'✅',label:'Wildfires',status:'Clear',color:'#22c55e'});
  else items.push({icon:'🔥',label:'Wildfires',status:`${wf.length} active`,color:'#ff6600'});
  if(isUS){
    const droughtStatus=_getDroughtStatus(dr);
    items.push(droughtStatus);
    const spcW=_spcData.watches;
    const hookCount=(S.storms||[]).filter(s=>s._hookEcho).length;
    if(!spcW)items.push({icon:'🔄',label:'Severe Wx',status:'Loading...',color:'#666'});
    else{
      const localWatches=spcW.filter(w=>_isPointInSpcWatch(S.lat,S.lon,w));
      const localTor=localWatches.filter(w=>w.type==='tornado').length;
      const localSvr=localWatches.filter(w=>w.type!=='tornado').length;
      if(!localWatches.length&&!hookCount){
        if(spcW.length){
          items.push({icon:'🟢',label:'Severe Wx',status:`Clear (${spcW.length} US)`,color:'#22c55e'});
        }else{
          items.push({icon:'✅',label:'Severe Wx',status:'Clear',color:'#22c55e'});
        }
      }else{
        const parts=[];
        if(localTor)parts.push(`TOR Watch`);if(localSvr)parts.push(`SVR Watch`);if(hookCount)parts.push(`${hookCount} rotation`);
        const topColor=localTor||hookCount?'#ff1744':localSvr?'#ff9800':'#eab308';
        items.push({icon:localTor||hookCount?'🌪️':'⛈️',label:'Severe Wx',status:parts.join(' · '),color:topColor});
      }
    }
  }
  const nhc=_getFilteredSystems();
  if(nhc===null)items.push({icon:'🔄',label:'Tropical',status:'Loading...',color:'#666'});
  else if(!nhc.length)items.push({icon:'✅',label:'Tropical',status:S._nhcRegionFilter!=='all'?'Clear (filtered)':'Clear',color:'#22c55e'});
  else{
    const inCone=nhc.filter(s=>s._inCone).length;
    const hasWarning=nhc.some(s=>s._tropAlerts&&s._tropAlerts.warnings.some(w=>w.inZone));
    const hasWatch=nhc.some(s=>s._tropAlerts&&s._tropAlerts.watches.some(w=>w.inZone));
    const nearCount=nhc.filter(s=>s.dist!=null&&s.dist<=S._nhcProxRadius).length;
    const maxCat=Math.max(...nhc.map(s=>(s.category||{num:-1}).num));
    let statusText,topColor,icon;
    if(hasWarning){statusText='⚠️ WARNING';topColor='#ff1744';icon='🔴'}
    else if(hasWatch){statusText='👁️ WATCH';topColor='#ffc107';icon='🟡'}
    else if(inCone){statusText=`${inCone} IN CONE`;topColor='#ff9800';icon='🟠'}
    else if(nearCount){statusText=`Tracking · ${nearCount} near`;topColor=maxCat>=3?'#ff5722':maxCat>=1?'#ffc107':'#4fc3f7';icon='🌀'}
    else{statusText=`${nhc.length} active`;topColor='#4fc3f7';icon='🌀'}
    items.push({icon,label:'Tropical',status:statusText,color:topColor});
  }
  const cols=items.length<=3?'1fr 1fr 1fr':'1fr 1fr';
  let html=`<div style="display:grid;grid-template-columns:${cols};gap:6px;margin-bottom:12px">`;
  items.forEach(it=>{
    html+=`<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:8px">
      <span style="font-size:1em">${it.icon}</span>
      <div><div style="font-size:0.7em;font-weight:600;color:var(--text-primary)">${it.label}</div>
      <div style="font-size:0.6em;color:${it.color};font-weight:600">${it.status}</div></div>
    </div>`;
  });
  html+=`</div>`;
  return html;
}

function _getDroughtStatus(dr){
  if(!dr)return{icon:'🔄',label:'Drought',status:'Loading...',color:'#666'};
  if(dr.error==='cors')return{icon:'⚠️',label:'Drought',status:'Data unavailable',color:'#888'};
  if(dr.error==='nodata')return{icon:'⚠️',label:'Drought',status:'No current data',color:'#888'};
  if(dr.level<0)return{icon:'✅',label:'Drought',status:'None',color:'#22c55e'};
  if(dr.level>=4)return{icon:'🔴',label:'Drought',status:'D4 Exceptional',color:'#800000'};
  if(dr.level>=3)return{icon:'🔴',label:'Drought',status:'D3 Extreme',color:'#ef4444'};
  if(dr.level>=2)return{icon:'🟠',label:'Drought',status:'D2 Severe',color:'#f97316'};
  if(dr.level>=1)return{icon:'🟡',label:'Drought',status:'D1 Moderate',color:'#eab308'};
  return{icon:'🟢',label:'Drought',status:'D0 Abn. Dry',color:'#a3e635'};
}

function _renderEarthquakeSection(){
  const eq=_hazardData.earthquakes;
  const radius=getEqRadius();
  let html=`<details style="margin-bottom:8px"><summary style="font-size:0.78em;font-weight:600;color:var(--accent-cyan);cursor:pointer;padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
    <span>🌍 Earthquakes (within ${radius} mi)</span>
    <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">▸</span>
  </summary><div style="padding:4px 0">`;
  if(eq===null){html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">Loading earthquake data...</div>`}
  else if(eq.length===0){html+=`<div style="font-size:0.75em;color:var(--accent-green);padding:8px;text-align:center">✅ No significant earthquakes nearby in the last 24 hours</div>`}
  else{
    eq.forEach(q=>{
      const magColor=q.mag>=6?'#ef4444':q.mag>=5?'#f97316':q.mag>=4?'#eab308':q.mag>=3?'#06b6d4':'#22c55e';
      const timeAgo=_timeAgo(q.time);
      const distStr=S.radarMetric?Math.round(q.dist*1.60934)+' km':Math.round(q.dist)+' mi';
      html+=`<div style="padding:6px 8px;border-bottom:1px solid var(--border-subtle);font-size:0.75em;display:flex;align-items:center;gap:8px">
        <div style="min-width:38px;text-align:center;padding:3px 6px;background:${magColor}18;border:1px solid ${magColor}44;border-radius:6px;color:${magColor};font-weight:700;font-size:1.05em">M${q.mag.toFixed(1)}</div>
        <div style="flex:1;min-width:0"><div style="color:var(--text-primary);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${q.place||'Unknown'}</div>
        <div style="color:var(--text-muted);font-size:0.9em">${distStr} away · ${Math.round(q.depth)} km deep · ${timeAgo}</div></div>
      </div>`;
    });
  }
  html+=`<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: USGS · M2.5+ in last 24h</div>`;
  html+=`</div></details>`;
  return html;
}

function _renderVolcanoSection(){
  const vol=_hazardData.volcanoes;
  let html=`<details style="margin-bottom:8px"><summary style="font-size:0.78em;font-weight:600;color:var(--accent-cyan);cursor:pointer;padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
    <span>🌋 Volcanic Activity</span>
    <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">▸</span>
  </summary><div style="padding:4px 0">`;
  if(vol===null){html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">Loading volcano data...</div>`}
  else if(!vol||vol.length===0){html+=`<div style="font-size:0.75em;color:var(--accent-green);padding:8px;text-align:center">✅ No active volcanic events within 500 mi</div>`}
  else{
    vol.forEach(v=>{
      const distStr=S.radarMetric?Math.round(v.dist*1.60934)+' km':Math.round(v.dist)+' mi';
      const locLabel=v.country?` · ${v.country}`:'';
      const dateStr=v.date?` · Last report: ${v.date}`:'';
      const distColor=v.dist<100?'#ef4444':v.dist<200?'#f97316':'#eab308';
      html+=`<div style="padding:6px 8px;border-left:3px solid ${distColor};margin-bottom:6px;background:${distColor}08;border-radius:0 6px 6px 0;font-size:0.75em">
        <div style="font-weight:700;color:var(--text-primary)">🌋 ${v.name}</div>
        <div style="color:var(--text-secondary);font-size:0.9em;margin-top:2px">${distStr} away${locLabel}${dateStr}</div>
      </div>`;
    });
  }
  html+=`<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: NASA EONET</div>`;
  html+=`</div></details>`;
  return html;
}

function _renderPrecipOnlySection(){
  const precip=_hazardData.recentPrecip;
  if(!precip)return '';
  const pctNum=parseFloat(precip.pctNormal)||0;
  const pctColor=pctNum<50?'#ef4444':pctNum<80?'#f97316':pctNum>150?'#3b82f6':pctNum>120?'#06b6d4':'#22c55e';
  const pctLabel=pctNum<50?'Severe deficit':pctNum<80?'Below normal':pctNum>150?'Well above normal':pctNum>120?'Above normal':'Normal';
  return `<details style="margin-bottom:8px"><summary style="font-size:0.78em;font-weight:600;color:var(--accent-cyan);cursor:pointer;padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
    <span>🌧️ Precipitation</span>
    <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">▸</span>
  </summary><div style="padding:4px 0">
    <div style="padding:6px 8px;font-size:0.75em;display:flex;align-items:center;gap:10px">
      <div style="min-width:55px;text-align:center;padding:4px 8px;background:${pctColor}18;border:1px solid ${pctColor}44;border-radius:6px;color:${pctColor};font-weight:700">${precip.pctNormal}%</div>
      <div><div style="color:var(--text-primary);font-weight:600">${pctLabel}</div>
      <div style="color:var(--text-muted);font-size:0.85em">${precip.totalIn} in last 30d (normal: ${precip.normalIn} in)</div></div>
    </div>
    <div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: Open-Meteo Archive</div>
  </div></details>`;
}

function _renderFloodSection(){
  const fl=_hazardData.floods||[];
  const gauges=_hazardData.riverGauges||[];
  let html=`<details style="margin-bottom:8px"><summary style="font-size:0.78em;font-weight:600;color:var(--accent-cyan);cursor:pointer;padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
    <span>🌊 Flood Monitoring</span>
    <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">▸</span>
  </summary><div style="padding:4px 0">`;
  if(fl.length===0){html+=`<div style="font-size:0.75em;color:var(--accent-green);padding:8px;text-align:center">✅ No flood warnings, watches, or advisories active</div>`}
  else{
    fl.forEach(a=>{
      const p=a.properties||{};
      const event=p.event||'Flood Alert';
      const sev=(p.severity||'').toLowerCase();
      const sevColor=sev==='extreme'?'#ef4444':sev==='severe'?'#f97316':sev==='moderate'?'#eab308':'#06b6d4';
      const sevIcon=sev==='extreme'?'🔴':sev==='severe'?'🟠':sev==='moderate'?'🟡':'🔵';
      const desc=(p.description||'').split('\n')[0].substring(0,150);
      const expires=p.expires?new Date(p.expires):null;
      html+=`<div style="padding:6px 8px;border-left:3px solid ${sevColor};margin-bottom:6px;background:${sevColor}08;border-radius:0 6px 6px 0;font-size:0.75em">
        <div style="font-weight:700;color:var(--text-primary)">${sevIcon} ${event}</div>
        <div style="color:var(--text-secondary);font-size:0.9em;margin-top:2px">${desc}${desc.length>=150?'...':''}</div>
        ${expires?`<div style="color:var(--text-muted);font-size:0.85em;margin-top:2px;font-family:var(--font-mono)">⏱️ Expires: ${expires.toLocaleString()}</div>`:''}
      </div>`;
    });
  }
  if(gauges.length>0){
    html+=`<div style="font-size:0.7em;font-weight:600;color:var(--accent-blue);margin:8px 8px 4px;padding-top:6px;border-top:1px solid var(--border-subtle)">📊 Nearby Stream Gauges (USGS)</div>`;
    gauges.forEach(g=>{
      const distStr=S.radarMetric?Math.round(g.dist*1.60934)+' km':g.dist.toFixed(1)+' mi';
      const heightColor=g.height>15?'#ef4444':g.height>10?'#f97316':g.height>5?'#eab308':'#22c55e';
      const timeStr=g.time?new Date(g.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
      html+=`<div style="padding:4px 8px;font-size:0.72em;display:flex;align-items:center;gap:6px;border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="min-width:48px;text-align:center;padding:2px 6px;background:${heightColor}18;border:1px solid ${heightColor}44;border-radius:5px;color:${heightColor};font-weight:700;font-size:0.95em">${g.height.toFixed(1)} ft</div>
        <div style="flex:1;min-width:0"><div style="color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.name}</div>
        <div style="color:var(--text-muted);font-size:0.85em">${distStr} away${timeStr?' · '+timeStr:''}</div></div>
      </div>`;
    });
  }
  html+=`<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: NWS Active Alerts${gauges.length?' + USGS Water Services':''}</div>`;
  html+=`</div></details>`;
  return html;
}

function _renderWildfireSection(){
  const wf=_hazardData.wildfires||[];
  const fireAlerts=_hazardData.fireAlerts||[];
  let html=`<details style="margin-bottom:8px"><summary style="font-size:0.78em;font-weight:600;color:var(--accent-cyan);cursor:pointer;padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
    <span>🔥 Wildfire Activity</span>
    <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">▸</span>
  </summary><div style="padding:4px 0">`;
  if(fireAlerts.length>0){
    html+=`<div style="font-size:0.7em;font-weight:600;color:#ff6600;margin-bottom:6px;padding:0 8px">⚠️ Fire Weather Alerts (${fireAlerts.length})</div>`;
    fireAlerts.forEach(a=>{
      const p=a.properties||{};
      html+=`<div style="padding:4px 8px;border-left:3px solid #ff6600;margin-bottom:4px;background:rgba(255,102,0,0.06);border-radius:0 6px 6px 0;font-size:0.72em">
        <div style="font-weight:700;color:var(--text-primary)">🔥 ${p.event||'Fire Weather Alert'}</div>
        <div style="color:var(--text-secondary);font-size:0.9em;margin-top:2px">${(p.description||'').split('\n')[0].substring(0,120)}...</div>
      </div>`;
    });
  }
  const wfArr=Array.isArray(wf)?wf:[];
  const wfError=wf&&wf.error;
  const isUS=isUSLocation(S.lat,S.lon);
  if(wfError){html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">⚠️ Wildfire data unavailable</div>`}
  else if(wfArr.length===0&&fireAlerts.length===0){html+=`<div style="font-size:0.75em;color:var(--accent-green);padding:8px;text-align:center">✅ No active wildfires or fire weather alerts nearby</div>`}
  else if(wfArr.length>0){
    const headerLabel=isUS?`Active Fire Perimeters (${wfArr.length})`:`Active Wildfires (${wfArr.length})`;
    html+=`<div style="font-size:0.7em;font-weight:600;color:#ff6600;margin-bottom:6px;padding:0 8px">${headerLabel}</div>`;
    wfArr.forEach(f=>{
      if(f.source==='eonet'){
        const distStr=Math.round(f.dist)+' mi away';
        const locLabel=f.country?` · ${f.country}`:'';
        html+=`<div style="padding:6px 8px;border-bottom:1px solid var(--border-subtle);font-size:0.75em;display:flex;align-items:center;gap:8px">
          <span style="font-size:1.2em">🔥</span>
          <div style="flex:1"><div style="font-weight:600;color:var(--text-primary)">${f.name}</div>
          <div style="color:var(--text-muted);font-size:0.9em">${distStr}${locLabel}</div></div>
        </div>`;
      }else{
        const acresStr=f.acres?f.acres.toLocaleString()+' acres':'Size unknown';
        const containStr=f.contained!=null?Math.round(f.contained)+'% contained':'Containment unknown';
        const distStr=f.dist&&f.dist<9999?Math.round(f.dist)+' mi away':'';
        html+=`<div style="padding:6px 8px;border-bottom:1px solid var(--border-subtle);font-size:0.75em;display:flex;align-items:center;gap:8px">
          <span style="font-size:1.2em">🔥</span>
          <div style="flex:1"><div style="font-weight:600;color:var(--text-primary)">${f.name}${f.state?' <span style="color:var(--text-muted);font-weight:400;font-size:0.85em">('+f.state.replace('US-','')+')</span>':''}</div>
          <div style="color:var(--text-muted);font-size:0.9em">${acresStr} · ${containStr}${distStr?' · '+distStr:''}</div></div>
        </div>`;
      }
    });
  }
  const wfSource=isUS?'NIFC + NWS':'NASA EONET';
  html+=`<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: ${wfSource}</div>`;
  html+=`</div></details>`;
  return html;
}

function _renderDroughtSection(){
  const dr=_hazardData.drought;
  const precip=_hazardData.recentPrecip;
  const isUS=isUSLocation(S.lat,S.lon);
  let html=`<details style="margin-bottom:8px"><summary style="font-size:0.78em;font-weight:600;color:var(--accent-cyan);cursor:pointer;padding:6px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
    <span>☀️ Drought Monitor</span>
    <span style="margin-left:auto;font-size:0.85em;color:var(--text-muted)">▸</span>
  </summary><div style="padding:4px 0">`;
  if(!isUS){html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">Drought Monitor covers US locations only</div>`}
  else if(!dr){html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">Loading drought data...</div>`}
  else if(dr.error==='nodata'){
    html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">
      No drought data available for today's date.<br>
      <a href="https://droughtmonitor.unl.edu/CurrentMap/StateDroughtMonitor.aspx?${dr.state||'FL'}" target="_blank" rel="noopener" style="color:var(--accent-cyan)">View latest on US Drought Monitor →</a>
    </div>`;
  }else if(dr.error==='cors'){
    html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">
      Drought data requires direct access.<br>
      <a href="https://droughtmonitor.unl.edu/CurrentMap/StateDroughtMonitor.aspx?${dr.state||'FL'}" target="_blank" rel="noopener" style="color:var(--accent-cyan)">View US Drought Monitor →</a>
    </div>`;
  }else if(dr.error==='state'){html+=`<div style="font-size:0.75em;color:var(--text-muted);padding:8px;text-align:center">Drought data not available for this location</div>`}
  else{
    const allLevels=[
      {dm:-1,label:'No Drought',color:'#22c55e'},
      {dm:0,label:'D0 Abnormally Dry',color:'#ffe040'},
      {dm:1,label:'D1 Moderate Drought',color:'#ffaa00'},
      {dm:2,label:'D2 Severe Drought',color:'#ff6600'},
      {dm:3,label:'D3 Extreme Drought',color:'#ff0000'},
      {dm:4,label:'D4 Exceptional Drought',color:'#800000'}
    ];
    const cur=allLevels.find(l=>l.dm===dr.level)||allLevels[0];
    html+=`<div style="padding:4px 8px;font-size:0.75em">
      <div style="font-weight:600;color:var(--text-primary);margin-bottom:8px">${dr.state} — Your Location</div>
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(0,0,0,0.15);border-radius:8px;border-left:4px solid ${cur.color};margin-bottom:8px">
        <div style="width:16px;height:16px;border-radius:50%;background:${cur.color};flex-shrink:0"></div>
        <div><div style="font-weight:700;color:${cur.color};font-size:1.1em">${cur.label}</div>
        ${dr.level>=0?'<div style="color:var(--text-muted);font-size:0.85em;margin-top:2px">Drought severity at your exact location</div>':''}</div>
      </div>`;
    if(dr.layers&&dr.layers.length>0){
      html+=`<div style="font-size:0.85em;color:var(--text-muted);margin-bottom:6px">Active drought layers here:</div>`;
      dr.layers.forEach(dm=>{
        const lv=allLevels.find(l=>l.dm===dm);
        if(lv)html+=`<div style="display:flex;align-items:center;gap:6px;padding:2px 0;font-size:0.9em">
          <div style="width:10px;height:10px;border-radius:2px;background:${lv.color};flex-shrink:0"></div>
          <span style="color:var(--text-secondary)">${lv.label}</span></div>`;
      });
    }
    if(precip&&precip.pctNormal!==null){
      const pctColor=precip.pctNormal>=120?'#22c55e':precip.pctNormal>=80?'#06b6d4':precip.pctNormal>=50?'#eab308':precip.pctNormal>=25?'#f97316':'#ef4444';
      html+=`<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border-subtle);display:flex;align-items:center;gap:8px">
        <div style="font-size:0.85em;color:var(--text-secondary)">💧 30-Day Rainfall</div>
        <div style="margin-left:auto;font-weight:700;color:${pctColor};font-size:0.95em">${precip.pctNormal}% of normal</div>
      </div>
      <div style="font-size:0.8em;color:var(--text-muted);text-align:right">${precip.totalIn} in actual vs ~${precip.normalIn} in avg</div>`;
    }
    html+=`</div>`;
  }
  if(!isUS&&precip&&precip.pctNormal!==null){
    const pctColor=precip.pctNormal>=120?'#22c55e':precip.pctNormal>=80?'#06b6d4':precip.pctNormal>=50?'#eab308':precip.pctNormal>=25?'#f97316':'#ef4444';
    html+=`<div style="padding:4px 8px;font-size:0.75em">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:var(--text-secondary)">💧 30-Day Rainfall</span>
        <span style="margin-left:auto;font-weight:700;color:${pctColor}">${precip.pctNormal}% of normal</span>
      </div>
      <div style="font-size:0.85em;color:var(--text-muted);text-align:right">${precip.totalIn} in actual vs ~${precip.normalIn} in avg</div>
    </div>`;
  }
  html+=`<div style="font-size:0.6em;color:var(--text-muted);padding:6px 8px 2px;text-align:right">Data: US Drought Monitor + Open-Meteo</div>`;
  html+=`</div></details>`;
  return html;
}

function _timeAgo(ts){
  const diff=Date.now()-ts;
  const mins=Math.floor(diff/60000);
  if(mins<1)return'just now';
  if(mins<60)return mins+'m ago';
  const hrs=Math.floor(mins/60);
  if(hrs<24)return hrs+'h ago';
  const days=Math.floor(hrs/24);
  return days+'d ago';
}

function startAlertCountdowns(){
  if(S._alertCdTimer)clearInterval(S._alertCdTimer);
  function tick(){
    const now=Date.now();let anyExpired=false;
    document.querySelectorAll('[id^="alert-cd-"]').forEach(el=>{
      const exp=parseInt(el.dataset.exp);
      const rem=exp-now;
      if(rem<=0){el.textContent='Expired';el.style.color='var(--accent-red)';anyExpired=true;return}
      const h=Math.floor(rem/3600000);const m=Math.floor((rem%3600000)/60000);const s=Math.floor((rem%60000)/1000);
      el.textContent=(h?h+'h ':'')+(m<10&&h?'0':'')+m+'m '+(s<10?'0':'')+s+'s remaining';
      if(rem<3600000)el.style.color='var(--accent-orange)';
      else el.style.color='var(--text-muted)';
    });
    if(anyExpired)setTimeout(()=>renderAlerts(),1500);
  }
  tick();
  S._alertCdTimer=setInterval(tick,1000);
}

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
        }catch(e){}
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
      let line=`  ⚠ ${a.event||a.headline||'Alert'}`;
      if(a.severity)line+=` [Severity: ${a.severity}]`;
      if(a.urgency)line+=` [Urgency: ${a.urgency}]`;
      if(a.description){
        const desc=a.description.replace(/\n/g,' ').substring(0,300);
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
  const hasExtremeAlert=S.alerts&&S.alerts.some(a=>a.severity==='Extreme');
  const hasSevereAlert=S.alerts&&S.alerts.some(a=>a.severity==='Severe');
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

// ==========================================
// INIT — always show welcome, explicit consent
// ==========================================
let _deferredInstallPrompt=null;
function _initPWAInstallPrompt(){
  if(window.matchMedia('(display-mode: standalone)').matches)return;
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    _deferredInstallPrompt=e;
    const dismissed=localStorage.getItem('st_installDismissed');
    if(dismissed&&Date.now()-parseInt(dismissed)<604800000)return;
    _showInstallBanner();
  });
}
function _showInstallBanner(){
  if(document.getElementById('pwa-install-banner'))return;
  const bar=document.createElement('div');
  bar.id='pwa-install-banner';
  bar.style.cssText='position:fixed;bottom:60px;left:8px;right:8px;z-index:9998;background:linear-gradient(135deg,rgba(10,16,32,0.97),rgba(15,25,50,0.97));border:1px solid rgba(0,229,255,0.3);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.5);backdrop-filter:blur(10px);animation:slideUp 0.3s ease-out';
  bar.innerHTML=`<div style="font-size:1.6em">⚡</div>
    <div style="flex:1"><div style="font-size:0.8em;font-weight:700;color:var(--text-primary)">Install StormTracker</div>
    <div style="font-size:0.65em;color:var(--text-muted);margin-top:2px">Add to home screen for the best experience</div></div>
    <button onclick="_acceptInstall()" style="padding:6px 14px;background:rgba(0,229,255,0.15);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.4);border-radius:8px;font-size:0.75em;font-weight:700;cursor:pointer;white-space:nowrap">Install</button>
    <button onclick="_dismissInstall()" style="padding:4px 10px;background:none;border:none;color:var(--text-muted);font-size:0.7em;cursor:pointer;white-space:nowrap">Not now</button>`;
  document.body.appendChild(bar);
}
function _acceptInstall(){
  const b=document.getElementById('pwa-install-banner');
  if(b)b.remove();
  if(_deferredInstallPrompt){_deferredInstallPrompt.prompt();_deferredInstallPrompt.userChoice.then(r=>{console.log('PWA install:',r.outcome);_deferredInstallPrompt=null})}
}
function _dismissInstall(){
  const b=document.getElementById('pwa-install-banner');
  if(b)b.remove();
  localStorage.setItem('st_installDismissed',String(Date.now()));
}

let _isOffline=false;
function _initOfflineDetection(){
  _isOffline=!navigator.onLine;
  window.addEventListener('offline',()=>{_isOffline=true;_showOfflineBanner();if(S._lastWeatherData)renderWeather(S._lastWeatherData);renderHazards()});
  window.addEventListener('online',()=>{_isOffline=false;_hideOfflineBanner();toast('Back online','success');if(S.lat)fetchWeather()});
  if(_isOffline)_showOfflineBanner();
}
function _showOfflineBanner(){
  if(document.getElementById('offline-banner'))return;
  const bar=document.createElement('div');
  bar.id='offline-banner';
  bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10002;background:linear-gradient(90deg,#b45309,#92400e);color:#fbbf24;font-size:0.75em;font-weight:600;text-align:center;padding:6px 12px;display:flex;align-items:center;justify-content:center;gap:6px';
  const lastFetch=_hazardData&&_hazardData._lastFetch?_hazardData._lastFetch:0;
  const ago=lastFetch?_relativeTime(lastFetch):'';
  bar.innerHTML=`<span>📡 Offline — showing cached data${ago?' · Last updated '+ago:''}</span>`;
  document.body.appendChild(bar);
  const header=document.querySelector('.app-header');
  if(header)header.style.marginTop='30px';
}
function _hideOfflineBanner(){
  const b=document.getElementById('offline-banner');
  if(b)b.remove();
  const header=document.querySelector('.app-header');
  if(header)header.style.marginTop='';
}
function _relativeTime(ts){
  const diff=Math.floor((Date.now()-ts)/1000);
  if(diff<60)return 'just now';
  if(diff<3600)return Math.floor(diff/60)+'m ago';
  if(diff<86400)return Math.floor(diff/3600)+'h ago';
  return Math.floor(diff/86400)+'d ago';
}
function _staleDataLabel(){
  if(!_isOffline)return '';
  const ts=S._lastWeatherFetch||0;
  const ago=ts?_relativeTime(ts):'unknown';
  return `<div style="text-align:center;padding:4px 10px;margin:4px 0;background:rgba(180,83,9,0.15);border:1px solid rgba(251,191,36,0.25);border-radius:8px;font-size:0.65em;color:#fbbf24">📡 Cached data · Last updated ${ago}</div>`;
}

function _showNotifPermissionModal(){
  if(!('Notification' in window))return;
  if(Notification.permission!=='default')return;
  const seen=localStorage.getItem('st_notifPromptSeen');
  if(seen)return;
  const overlay=document.createElement('div');
  overlay.id='notif-permission-modal';
  overlay.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;z-index:10001;background:rgba(5,8,15,0.88);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center';
  overlay.innerHTML=`<div style="max-width:320px;width:90%;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:14px;padding:24px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5)">
    <div style="font-size:2em;margin-bottom:8px">🔔</div>
    <div style="font-size:1em;font-weight:700;color:var(--text-primary);margin-bottom:8px">Enable Notifications?</div>
    <div style="font-size:0.78em;color:var(--text-secondary);line-height:1.5;margin-bottom:16px">Get alerted when storms approach your location or weather conditions exceed your thresholds — even when StormTracker is in the background.</div>
    <div style="display:flex;gap:8px">
      <button onclick="_acceptNotifPermission()" style="flex:1;padding:10px;background:rgba(0,229,255,0.15);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:8px;font-size:0.85em;font-weight:700;cursor:pointer">Enable</button>
      <button onclick="_dismissNotifPermission()" style="flex:1;padding:10px;background:rgba(255,255,255,0.04);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;font-size:0.85em;font-weight:600;cursor:pointer">Maybe Later</button>
    </div>
    <div style="font-size:0.6em;color:var(--text-muted);margin-top:10px">You can change this anytime in your browser settings</div>
  </div>`;
  document.body.appendChild(overlay);
}
function _acceptNotifPermission(){
  const m=document.getElementById('notif-permission-modal');
  if(m)m.remove();
  localStorage.setItem('st_notifPromptSeen',String(Date.now()));
  Notification.requestPermission().then(p=>console.log('Notification permission:',p));
}
function _dismissNotifPermission(){
  const m=document.getElementById('notif-permission-modal');
  if(m)m.remove();
  localStorage.setItem('st_notifPromptSeen',String(Date.now()));
}

function init(){
  loadUnits();
  updateAIFab();
  checkFirstLaunch();
  _initPWAInstallPrompt();
  _initOfflineDetection();
  try{
    const saved=JSON.parse(localStorage.getItem('st_loc'));
    if(saved&&saved.lat&&saved.lon){
      if(!getHomeLocation())setHomeLocation(saved.lat,saved.lon,saved.name);
      setLoc(saved.lat,saved.lon,saved.name);return;
    }
  }catch(e){}
  document.getElementById('status-text').textContent='Enter a location to begin';
  document.getElementById('page-weather').innerHTML=`
    <div class="welcome-screen">
      <div style="font-size:3em;margin-bottom:12px">⚡</div>
      <h2>Welcome to StormTracker</h2>
      <p>Real-time storm detection powered by live radar data.<br>No API keys, no accounts, 100% free.</p>
      <button class="welcome-btn" onclick="showLocationConfirm()">🛰️ Use My Location</button>
      <button class="welcome-btn secondary" onclick="toggleLocOverlay(true)">🔍 Search Location</button>
      <div style="margin-top:20px;font-size:0.75em;color:var(--text-muted)">
        <strong>Features:</strong><br>
        Live weather &middot; Radar map &middot; Storm cell detection<br>
        METAR station data &middot; NWS alerts<br>
        Tappable unit cycling &middot; 7-day forecast
      </div>
    </div>`;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();

const LANGS=[
  {c:'en',f:'🇺🇸',n:'English'},{c:'es',f:'🇪🇸',n:'Español'},{c:'fr',f:'🇫🇷',n:'Français'},
  {c:'de',f:'🇩🇪',n:'Deutsch'},{c:'it',f:'🇮🇹',n:'Italiano'},{c:'pt',f:'🇧🇷',n:'Português'},
  {c:'ja',f:'🇯🇵',n:'日本語'},{c:'ko',f:'🇰🇷',n:'한국어'},{c:'zh',f:'🇨🇳',n:'中文'},
  {c:'ar',f:'🇸🇦',n:'العربية'},{c:'hi',f:'🇮🇳',n:'हिन्दी'},{c:'ru',f:'🇷🇺',n:'Русский'},
  {c:'tr',f:'🇹🇷',n:'Türkçe'},{c:'nl',f:'🇳🇱',n:'Nederlands'},{c:'pl',f:'🇵🇱',n:'Polski'},
  {c:'vi',f:'🇻🇳',n:'Tiếng Việt'},{c:'th',f:'🇹🇭',n:'ไทย'},{c:'sv',f:'🇸🇪',n:'Svenska'},
  {c:'id',f:'🇮🇩',n:'Bahasa'},{c:'uk',f:'🇺🇦',n:'Українська'},
  {c:'cs',f:'🇨🇿',n:'Čeština'},{c:'da',f:'🇩🇰',n:'Dansk'},{c:'fi',f:'🇫🇮',n:'Suomi'},
  {c:'el',f:'🇬🇷',n:'Ελληνικά'},{c:'he',f:'🇮🇱',n:'עברית'},{c:'hu',f:'🇭🇺',n:'Magyar'},
  {c:'no',f:'🇳🇴',n:'Norsk'},{c:'ro',f:'🇷🇴',n:'Română'},{c:'ms',f:'🇲🇾',n:'Melayu'},
  {c:'tl',f:'🇵🇭',n:'Filipino'},{c:'sw',f:'🇰🇪',n:'Kiswahili'}
];
let _curLang=localStorage.getItem('st_lang')||'en';
let _tCache=JSON.parse(localStorage.getItem('st_tcache')||'{}');
let _translating=false;

function buildLangMenu(){
  const menu=document.getElementById('lang-menu');
  menu.innerHTML=LANGS.map(l=>`<div class="lang-item${l.c===_curLang?' active':''}" onclick="selectLang('${l.c}')">
    <span class="lang-flag">${l.f}</span><span class="lang-name">${l.n}</span>${l.c===_curLang?'<span class="lang-check">✓</span>':''}
  </div>`).join('');
}
function toggleLangMenu(){
  const menu=document.getElementById('lang-menu');
  const open=menu.classList.toggle('open');
  if(open){buildLangMenu();document.addEventListener('click',closeLangMenuOutside,{once:true,capture:true})}
}
function closeLangMenuOutside(e){
  const menu=document.getElementById('lang-menu');
  const btn=document.getElementById('btn-lang');
  if(!menu.contains(e.target)&&e.target!==btn){menu.classList.remove('open')}
  else if(menu.classList.contains('open')){document.addEventListener('click',closeLangMenuOutside,{once:true,capture:true})}
}
function selectLang(code){
  document.getElementById('lang-menu').classList.remove('open');
  if(code===_curLang&&code!=='en')return;
  _curLang=code;
  localStorage.setItem('st_lang',code);
  const flag=LANGS.find(l=>l.c===code);
  document.getElementById('btn-lang').textContent=flag?flag.f:'🇺🇸';
  if(code==='en'){restoreOriginals();toast('Language: English');return}
  preseedStormVocab(code);
  translatePage(code);
}

function getTextNodes(root){
  const nodes=[];
  const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
    acceptNode(n){
      const p=n.parentElement;
      if(!p)return NodeFilter.FILTER_REJECT;
      const tag=p.tagName;
      if(['SCRIPT','STYLE','SVG','CANVAS','NOSCRIPT'].includes(tag))return NodeFilter.FILTER_REJECT;
      if(p.closest('svg'))return NodeFilter.FILTER_REJECT;
      const txt=n.textContent.trim();
      if(!txt||txt.length<2)return NodeFilter.FILTER_REJECT;
      if(/^[\d\s.,:/%°+\-→↑↓←·•\u2022]+$/.test(txt))return NodeFilter.FILTER_REJECT;
      if(/^[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\s]+$/.test(txt))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  while(walk.nextNode())nodes.push(walk.currentNode);
  return nodes;
}

async function mmTranslate(text,lang){
  const key=lang+'::'+text;
  if(_tCache[key])return _tCache[key];
  try{
    const r=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0,500))}&langpair=en|${lang}&de=stormtracker@weather.app`);
    const d=await r.json();
    if(d.responseStatus===200&&d.responseData?.translatedText){
      let t=d.responseData.translatedText;
      if(t.toUpperCase()===t&&text.toUpperCase()!==text)t=text;
      _tCache[key]=t;
      if(Object.keys(_tCache).length%20===0){
        try{localStorage.setItem('st_tcache',JSON.stringify(_tCache))}catch(e){}
      }
      return t;
    }
  }catch(e){}
  return text;
}

async function translatePage(lang){
  if(_translating)return;
  _translating=true;
  const ln=LANGS.find(l=>l.c===lang);

  const nodes=getTextNodes(document.body);
  const unique=new Map();
  const cachedNow=[];
  nodes.forEach(n=>{
    const txt=n.textContent.trim();
    if(!n._origText)n._origText=n.textContent;
    const ck=lang+'::'+txt;
    if(_tCache[ck]){
      cachedNow.push([n,txt,_tCache[ck]]);
      return;
    }
    if(!unique.has(txt))unique.set(txt,[]);
    unique.get(txt).push(n);
  });

  cachedNow.forEach(([n,txt,tr])=>{n.textContent=n.textContent.replace(txt,tr)});

  const entries=[...unique.entries()];
  if(entries.length>0){
    const bar=document.createElement('div');
    bar.className='translate-bar show';
    bar.id='translate-bar';
    bar.innerHTML=`<div class="t-spinner"></div><span>Translating to ${ln?ln.n:lang}...</span><span id="t-progress">0%</span>`;
    document.body.appendChild(bar);

    let done=0;
    const total=entries.length;
    const batchSize=4;

    for(let i=0;i<entries.length;i+=batchSize){
      const batch=entries.slice(i,i+batchSize);
      const results=await Promise.all(batch.map(([txt])=>mmTranslate(txt,lang)));
      batch.forEach(([txt,nodeList],j)=>{
        const translated=results[j];
        nodeList.forEach(n=>{
          n.textContent=n.textContent.replace(txt,translated);
        });
      });
      done+=batch.length;
      const pct=Math.round(done/total*100);
      const prog=document.getElementById('t-progress');
      if(prog)prog.textContent=pct+'%';
    }

    try{localStorage.setItem('st_tcache',JSON.stringify(_tCache))}catch(e){}
    const b=document.getElementById('translate-bar');
    if(b){b.innerHTML=`<span>✓ Translated to ${ln?ln.n:lang}</span>`;setTimeout(()=>b.remove(),2000)}
  }

  _translating=false;
  _tCooldown=Date.now();
  if(lang==='ar'||lang==='he')document.body.style.direction='rtl';
  else document.body.style.direction='ltr';
}

function tStr(s){if(_curLang==='en'||!s)return s;const k=_curLang+'::'+s;return _tCache[k]||s}

const _stormVocab=['Storm Cell','Live Radar','Peak dBZ','Rain Rate','Distance','Bearing','Moving','Status','Impact','ETA','Countdown','Arrives','Overhead · Moving away','Nearby · Not approaching','at','Extreme — Hail/Tornado','Intense — Hail Likely','Very Heavy Rain','Heavy Rain','Moderate Rain','Light Rain','Drizzle/Mist','No Impact — Nearby','Low Risk','Moderate Risk','Elevated Risk','High Risk','Extreme Risk','returns','Light','Extreme','Temp','Dew Pt','Humidity','Baro','Vis','Sky','tap to change units','tap','Updated','mi away','Gusts','Nearby Stations','Loading','Light Precipitation','7-Day Forecast','Today','Now','Feels','High / Low','Rain Chance','Precipitation','Max Wind','Sunrise','Sunset','Hourly Forecast — Next 72h','NWS Forecast','Thunderstorm','Rain','Snow','Cloudy','Partly Cloudy','Clear','Fog','Drizzle','Mostly fair'];
async function preseedStormVocab(lang){
  const need=_stormVocab.filter(w=>!_tCache[lang+'::'+w]);
  if(!need.length)return;
  for(let i=0;i<need.length;i+=4){
    const batch=need.slice(i,i+4);
    await Promise.all(batch.map(w=>mmTranslate(w,lang)));
  }
  try{localStorage.setItem('st_tcache',JSON.stringify(_tCache))}catch(e){}
}

function quickTranslate(){
  if(_curLang==='en'||_translating)return;
  const nodes=getTextNodes(document.body);
  const uncached=new Map();
  nodes.forEach(n=>{
    if(!n._origText)n._origText=n.textContent;
    const cur=n.textContent.trim();
    const orig=n._origText?.trim()||cur;
    const ckOrig=_curLang+'::'+orig;
    if(_tCache[ckOrig]){
      if(cur!==_tCache[ckOrig])n.textContent=n._origText.replace(orig,_tCache[ckOrig]);
      return;
    }
    const ckCur=_curLang+'::'+cur;
    if(_tCache[ckCur])return;
    if(!uncached.has(orig))uncached.set(orig,[]);
    uncached.get(orig).push(n);
  });
  if(uncached.size>0&&uncached.size<80) translateUncached(uncached,_curLang);
}
async function translateUncached(uncMap,lang){
  if(_translating)return;
  _translating=true;
  const entries=[...uncMap.entries()];
  for(let i=0;i<entries.length;i+=4){
    const batch=entries.slice(i,i+4);
    const results=await Promise.all(batch.map(([txt])=>mmTranslate(txt,lang)));
    batch.forEach(([txt,nodeList],j)=>{
      nodeList.forEach(n=>{n.textContent=n.textContent.replace(txt,results[j])});
    });
  }
  try{localStorage.setItem('st_tcache',JSON.stringify(_tCache))}catch(e){}
  _translating=false;
  _tCooldown=Date.now();
}

function restoreOriginals(){
  const nodes=getTextNodes(document.body);
  nodes.forEach(n=>{if(n._origText)n.textContent=n._origText});
  document.body.style.direction='ltr';
}

let _tObserver=null, _tCooldown=0;
function startTranslateObserver(){
  if(_tObserver)_tObserver.disconnect();
  _tObserver=new MutationObserver(muts=>{
    if(_curLang==='en'||_translating)return;
    let hasNew=false;
    muts.forEach(m=>{
      m.addedNodes.forEach(n=>{
        if(n.nodeType===1&&!['SCRIPT','STYLE','SVG'].includes(n.tagName)&&!n.classList?.contains('translate-bar')&&!n.classList?.contains('lang-menu'))hasNew=true;
      });
    });
    if(hasNew){
      clearTimeout(_tObserver._debounce);
      _tObserver._debounce=setTimeout(()=>{
        if(!_translating)quickTranslate();
      },1000);
    }
  });
  _tObserver.observe(document.body,{childList:true,subtree:true});
}

// ==========================================
// 2.5D ISOMETRIC STORM VIEW
// ==========================================
const ISO={
  open:false,
  el:null,
  scene:null,
  wrap:null,
  zoom:1,
  tiltX:55,
  tiltZ:0,
  _startTilt:null,
  _startTouch:null,
  _pinchDist:null,
  popup:null
};

function stormThreatScore(dbz,distance,bearing){
  const intens=Math.min(50,Math.max(0,((dbz-15)/45)*50));
  let impactScore=0;
  const etas=S._stormETAs||{};
  const mv=S.stormMovement;
  if(mv&&mv.speed>=2){
    const bearToUser=(bearing+180)%360;
    const diff=Math.abs(((mv.direction-bearToUser+180)%360)-180);
    const closing=mv.speed*Math.cos(Math.min(diff,60)*Math.PI/180);
    if(closing>0){
      const proxBonus=Math.max(0,(80-distance)/80)*20;
      const angleBonus=Math.max(0,(45-diff)/45)*25;
      const speedBonus=Math.min(5,closing/4);
      impactScore=Math.min(50,proxBonus+angleBonus+speedBonus);
    }
  }
  const etaMatch=Object.values(etas).find(e=>{
    if(!e)return false;
    if(e.impact>0&&e.distance!==undefined)return Math.abs(e.distance-distance)<2&&Math.abs((e.bearing||0)-bearing)<15;
    return false;
  });
  if(etaMatch&&etaMatch.impact>0){impactScore=Math.max(impactScore,etaMatch.impact/2)}
  return Math.min(100,Math.round(intens+impactScore));
}
function threatColor(score){
  if(score>80)return{color:'#e040fb',glow:'rgba(224,64,251,0.8)',label:'Extreme'};
  if(score>55)return{color:'#ff3355',glow:'rgba(255,51,85,0.75)',label:'Serious'};
  if(score>35)return{color:'#facc15',glow:'rgba(250,204,21,0.65)',label:'Moderate'};
  return{color:'#22c55e',glow:'rgba(34,197,94,0.5)',label:'Low'};
}
function dbzToEmoji(d){
  if(d>=56)return'🌩️';
  if(d>=46)return'⛈️';
  if(d>=31)return'🌧️';
  return'☁️';
}
function stormSVG(dbz,color,sz){
  const w=Math.round(sz*20),h=Math.round(sz*14);
  const baseC=dbz>=56?'#555':dbz>=46?'#666':dbz>=31?'#999':'#ccc';
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 40 28">`;
  svg+=`<path d="M10 22 C4 22 0 18 0 14 C0 10 3 7 7 7 C8 3 12 0 17 0 C22 0 26 3 27 7 C27 6.8 28 6.5 29 6.5 C33 6.5 36 9.5 36 13 C36 13.5 36 14 35.8 14.5 C38 15 40 17 40 20 C40 23 38 25 35 25 L10 25 C6 25 4 23 4 22 Z" fill="${baseC}" opacity="0.5"/>`;
  svg+=`<path d="M10 22 C4 22 0 18 0 14 C0 10 3 7 7 7 C8 3 12 0 17 0 C22 0 26 3 27 7 C27 6.8 28 6.5 29 6.5 C33 6.5 36 9.5 36 13 C36 13.5 36 14 35.8 14.5 C38 15 40 17 40 20 C40 23 38 25 35 25 L10 25 C6 25 4 23 4 22 Z" fill="${color}" opacity="0.6"/>`;
  if(dbz>=31){
    const drops=dbz>=56?5:dbz>=46?3:2;
    for(let i=0;i<drops;i++){
      const dx=10+i*(20/(drops-1||1));
      svg+=`<line x1="${dx}" y1="25" x2="${dx-2}" y2="28" stroke="${dbz>=46?'#6cf':'#8cf'}" stroke-width="1.2" opacity="0.7"/>`;
    }
  }
  if(dbz>=46){
    svg+=`<path d="M18 24 L20 28 L22 24 Z" fill="#ff0" opacity="0.9"/>`;
    svg+=`<line x1="20" y1="24" x2="20" y2="20" stroke="#ff0" stroke-width="1" opacity="0.7"/>`;
  }
  svg+=`</svg>`;
  return svg;
}
function dbzToHeight(d){
  if(d>=56)return 140;
  if(d>=46)return 100;
  if(d>=31)return 60;
  if(d>=20)return 30;
  return 12;
}
function dbzToSize(d){
  if(d>=56)return 2.2;
  if(d>=46)return 1.8;
  if(d>=31)return 1.5;
  return 1.2;
}
function dbzToShadow(d){
  if(d>=56)return'drop-shadow(0 6px 12px rgba(255,40,40,0.5)) drop-shadow(0 0 8px rgba(255,60,60,0.3))';
  if(d>=46)return'drop-shadow(0 5px 10px rgba(0,0,0,0.7))';
  if(d>=31)return'drop-shadow(0 4px 8px rgba(0,0,0,0.5))';
  return'drop-shadow(0 3px 5px rgba(150,150,150,0.3))';
}

function bearingToDir(b){
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(b/22.5)%16];
}

function geoToIso(stormLat,stormLng,userLat,userLng,scale){
  const R=3958.8;
  const dLat=(stormLat-userLat)*Math.PI/180;
  const dLng=(stormLng-userLng)*Math.PI/180;
  const avgLat=(stormLat+userLat)/2*Math.PI/180;
  const dx=R*dLng*Math.cos(avgLat);
  const dy=R*dLat;
  return{x:dx*scale,y:-dy*scale};
}

function show3DView(){
  if(!S.lat)return;
  let ov=document.getElementById('iso-overlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='iso-overlay';
    ov.className='iso-overlay';
    ov.innerHTML=`
      <div class="iso-header">
        <div>
          <h3>🏔️ 3D Storm Terrain</h3>
          <div class="iso-loc" id="iso-loc"></div>
        </div>
        <button class="iso-close" onclick="hide3DView()">✕ Close</button>
      </div>
      <div class="iso-scene-wrap" id="iso-scene-wrap">
        <canvas id="iso-canvas"></canvas>
        <div class="iso-legend" style="max-height:240px">
          <h4>Elevation = Intensity</h4>
          <div class="iso-legend-row"><span class="le" style="color:#22c55e">▓</span> Light (15-30 dBZ)</div>
          <div class="iso-legend-row"><span class="le" style="color:#facc15">▓</span> Moderate (31-45)</div>
          <div class="iso-legend-row"><span class="le" style="color:#ff3355">▓</span> Heavy (46-55)</div>
          <div class="iso-legend-row"><span class="le" style="color:#e040fb">▓</span> Severe (56+)</div>
          <div class="iso-legend-row"><span class="le">⚡</span> Lightning (≥40)</div>
        </div>
        <div class="iso-info" id="iso-info"></div>
        <div class="iso-info iso-fps-badge" id="iso-fps" style="top:58px"></div>
        <div class="iso-height-ctrl" id="iso-height-ctrl">
          <label>🏔️ Height</label>
          <input type="range" id="iso-height-slider" min="1" max="20" step="0.5" value="7">
          <span id="iso-height-val">7×</span>
        </div>
        <div class="iso-cam" id="iso-cam">
          <div class="iso-cam-pad">
            <div aria-hidden="true"></div>
            <div class="iso-cam-btn" data-cam="up">▲</div>
            <div aria-hidden="true"></div>
            <div class="iso-cam-btn" data-cam="left">◀</div>
            <div class="iso-cam-btn iso-cam-center" data-cam="reset">RST</div>
            <div class="iso-cam-btn" data-cam="right">▶</div>
            <div aria-hidden="true"></div>
            <div class="iso-cam-btn" data-cam="down">▼</div>
            <div aria-hidden="true"></div>
          </div>
          <div class="iso-cam-zoom">
            <div class="iso-cam-btn" data-cam="zout">−</div>
            <div class="iso-cam-btn" data-cam="zin">+</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ISO.el=ov;
    ISO.wrap=document.getElementById('iso-scene-wrap');
    ISO.canvas=document.getElementById('iso-canvas');
    ISO.ctx=ISO.canvas.getContext('2d');
    ov.addEventListener('selectstart',e=>e.preventDefault());
    ov.addEventListener('contextmenu',e=>e.preventDefault());
    ov.addEventListener('copy',e=>e.preventDefault());
    ov.addEventListener('dblclick',e=>e.preventDefault());
    ov.addEventListener('touchmove',e=>{if(!e.target.closest('.iso-height-ctrl'))e.preventDefault();},{passive:false});
    ov.addEventListener('touchstart',e=>{if(e.touches.length===1&&!e.target.closest('.iso-close,.iso-cam-btn,.iso-pop-close,.iso-height-ctrl'))e.preventDefault();},{passive:false});
    const hSlider=document.getElementById('iso-height-slider');
    if(hSlider){
      hSlider.addEventListener('input',()=>{
        ISO.heightMul=parseFloat(hSlider.value);
        document.getElementById('iso-height-val').textContent=hSlider.value+'×';
        ISO._dirty=true;
      });
    }
    setupIsoTouch();
  }
  ISO.open=true;
  ISO.zoom=1;
  ISO.tiltX=55;
  ISO.tiltZ=0;
  ISO._fps={frames:0,last:performance.now(),current:60,target:45,history:[]};
  ov.classList.add('active');
  const loc=document.getElementById('iso-loc');
  if(loc)loc.textContent=S.locName||`${S.lat.toFixed(2)}, ${S.lon.toFixed(2)}`;
  ISO._grid=buildTerrainGrid();
  ISO._dirty=true;
  isoStartLoop();
}

function hide3DView(){
  ISO.open=false;
  isoStopLoop();
  const ov=document.getElementById('iso-overlay');
  if(ov)ov.classList.remove('active');
  if(ISO.popup){ISO.popup.remove();ISO.popup=null;}
}

ISO._rafPending=false;
ISO._fps={frames:0,last:performance.now(),current:60,target:45,history:[]};
ISO._grid=null;
ISO._dirty=true;
ISO.heightMul=7;

function isoStartLoop(){
  if(ISO._loopId)return;
  function tick(){
    if(!ISO.open){ISO._loopId=0;return;}
    isoFpsTick();
    if(ISO._dirty){
      ISO._dirty=false;
      renderTerrain3D();
    }
    ISO._loopId=requestAnimationFrame(tick);
  }
  ISO._loopId=requestAnimationFrame(tick);
}
function isoStopLoop(){
  if(ISO._loopId){cancelAnimationFrame(ISO._loopId);ISO._loopId=0;}
}
function isoFpsTick(){
  const f=ISO._fps;
  f.frames++;
  const now=performance.now();
  const dt=now-f.last;
  if(dt>=500){
    f.current=Math.round(f.frames/(dt/1000));
    f.frames=0;
    f.last=now;
    f.history.push(f.current);
    if(f.history.length>6)f.history.shift();
    const badge=document.getElementById('iso-fps');
    if(badge)badge.textContent=`${f.current} fps`;
  }
}

function buildTerrainGrid(){
  const storms=S.storms||[];
  const GS=64;
  const grid=new Float32Array(GS*GS);
  const scanR=S.scanRadius||80;
  const R=3958.8;
  storms.forEach(st=>{
    if(!st.dbz||st.dbz<15)return;
    const dLat=(st.lat-S.lat)*Math.PI/180;
    const dLng=((st.lng||st.lon)-S.lon)*Math.PI/180;
    const avgLat=(st.lat+S.lat)/2*Math.PI/180;
    const dx=R*dLng*Math.cos(avgLat);
    const dy=R*dLat;
    const gx=Math.round((dx/scanR+1)*0.5*(GS-1));
    const gy=Math.round((-dy/scanR+1)*0.5*(GS-1));
    const spread=2;
    for(let oy=-spread;oy<=spread;oy++){
      for(let ox=-spread;ox<=spread;ox++){
        const ix=gx+ox,iy=gy+oy;
        if(ix<0||ix>=GS||iy<0||iy>=GS)continue;
        const d=Math.sqrt(ox*ox+oy*oy);
        const w=Math.max(0,1-d/spread);
        const idx=iy*GS+ix;
        grid[idx]=Math.max(grid[idx],st.dbz*w);
      }
    }
  });
  for(let pass=0;pass<2;pass++){
    const tmp=new Float32Array(grid);
    for(let y=1;y<GS-1;y++){
      for(let x=1;x<GS-1;x++){
        const i=y*GS+x;
        tmp[i]=(grid[i]*2+grid[i-1]+grid[i+1]+grid[i-GS]+grid[i+GS])/6;
      }
    }
    grid.set(tmp);
  }
  const info=document.getElementById('iso-info');
  if(info)info.textContent=`${storms.filter(s=>s.dbz>=15).length} storms in view`;
  return{data:grid,size:GS};
}

function terrainDbzRGB(v){
  if(v>=56)return[224,64,251];
  if(v>=46)return[255,51,85];
  if(v>=36)return[255,170,20];
  if(v>=25)return[80,220,80];
  if(v>=15)return[34,160,94];
  return[20,60,40];
}

function renderTerrain3D(){
  const c=ISO.canvas;
  const ctx=ISO.ctx;
  if(!c||!ctx)return;
  const wrap=ISO.wrap;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const W=wrap.clientWidth;
  const H=wrap.clientHeight;
  c.width=W*dpr;
  c.height=H*dpr;
  c.style.width=W+'px';
  c.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle='#060d1a';
  ctx.fillRect(0,0,W,H);

  const g=ISO._grid;
  if(!g)return;
  const GS=g.size;
  const data=g.data;

  const rotZ=ISO.tiltZ*Math.PI/180;
  const tiltX=ISO.tiltX;
  const cosR=Math.cos(rotZ),sinR=Math.sin(rotZ);
  const yScale=Math.cos(tiltX*Math.PI/180);
  const hScale=Math.sin(tiltX*Math.PI/180);
  const zoom=ISO.zoom;
  const baseScale=Math.min(W,H)*0.0065*zoom;
  const heightMul=baseScale*(ISO.heightMul||7);
  const cx=W/2, cy=H*0.55;

  const scanR=S.scanRadius||80;
  const useMetric=S.units==='metric';
  const ringMax=useMetric?Math.round(scanR*1.60934/20)*20||80:scanR;
  const ringStep=useMetric?20:(ringMax<=50?10:20);
  const unitL=useMetric?'km':'mi';
  ctx.strokeStyle='rgba(40,80,120,0.35)';
  ctx.lineWidth=0.5;
  for(let r=ringStep;r<=ringMax;r+=ringStep){
    const rPx=r*baseScale*GS/scanR;
    ctx.beginPath();
    ctx.ellipse(cx,cy,rPx,rPx*yScale,0,0,Math.PI*2);
    ctx.stroke();
    ctx.fillStyle='rgba(80,140,200,0.4)';
    ctx.font='9px Inter,sans-serif';
    ctx.fillText(r+unitL,cx+rPx+3,cy+3);
  }

  ctx.fillStyle='rgba(0,200,255,0.8)';
  ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(0,200,255,0.6)';
  ctx.font='bold 9px Inter,sans-serif';
  ctx.fillText('YOU',cx+6,cy+3);

  const nAngle=-rotZ;
  const nR=ringMax*baseScale*GS/scanR+12;
  const nx=cx+Math.sin(nAngle)*nR;
  const ny=cy-Math.cos(nAngle)*nR*yScale;
  ctx.fillStyle='rgba(255,100,100,0.8)';
  ctx.font='bold 10px Inter,sans-serif';
  ctx.textAlign='center';
  ctx.fillText('▲ N',nx,ny);
  ctx.textAlign='left';

  const half=(GS-1)/2;
  const projected=new Float32Array(GS*GS*2);
  for(let gy=0;gy<GS;gy++){
    for(let gx=0;gx<GS;gx++){
      const wx=(gx-half)*baseScale;
      const wy=(gy-half)*baseScale;
      const rx=wx*cosR-wy*sinR;
      const ry=wx*sinR+wy*cosR;
      const v=data[gy*GS+gx];
      const h=v>0?(v/65)*heightMul:0;
      const sx=cx+rx;
      const sy=cy+ry*yScale-h*hScale;
      const idx=(gy*GS+gx)*2;
      projected[idx]=sx;
      projected[idx+1]=sy;
    }
  }

  for(let gy=GS-2;gy>=0;gy--){
    for(let gx=0;gx<GS-1;gx++){
      const i00=gy*GS+gx;
      const i10=i00+1;
      const i01=i00+GS;
      const i11=i01+1;
      const v00=data[i00],v10=data[i10],v01=data[i01],v11=data[i11];
      const maxV=Math.max(v00,v10,v01,v11);
      if(maxV<5)continue;
      const avgV=(v00+v10+v01+v11)/4;

      const x0=projected[i00*2],y0=projected[i00*2+1];
      const x1=projected[i10*2],y1=projected[i10*2+1];
      const x2=projected[i11*2],y2=projected[i11*2+1];
      const x3=projected[i01*2],y3=projected[i01*2+1];

      const c1=(x1-x0)*(y3-y0)-(y1-y0)*(x3-x0);
      const rgb=terrainDbzRGB(avgV);
      const bright=0.5+avgV/130;
      const shade=c1>0?0.85:1.0;
      const alpha=Math.min(0.92,0.3+avgV/80);
      ctx.fillStyle=`rgba(${Math.round(rgb[0]*bright*shade)},${Math.round(rgb[1]*bright*shade)},${Math.round(rgb[2]*bright*shade)},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);
      ctx.closePath();ctx.fill();

      if(maxV>=20){
        ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.15)`;
        ctx.lineWidth=0.5;
        ctx.stroke();
      }
    }
  }

  const showLtng=_sonarCfg.showLightning!==false;
  if(showLtng){
    const time=Date.now();
    for(let gy=0;gy<GS;gy++){
      for(let gx=0;gx<GS;gx++){
        const v=data[gy*GS+gx];
        if(v<40)continue;
        const freq=v>=56?800:1500;
        const seed=(gx*73+gy*137)%freq;
        if((time+seed)%freq>100)continue;
        const idx=(gy*GS+gx)*2;
        const lx=projected[idx],ly=projected[idx+1];
        ctx.fillStyle='rgba(255,255,100,0.9)';
        ctx.font='bold 12px sans-serif';
        ctx.fillText('⚡',lx-6,ly-2);
      }
    }
  }

  const mv=S.stormMovement;
  if(mv&&mv.speed>=2){
    const dir=(mv.direction)*Math.PI/180;
    const aLen=40*zoom;
    const ax=cx+Math.sin(dir-rotZ)*aLen;
    const ay=cy-Math.cos(dir-rotZ)*aLen*yScale;
    ctx.strokeStyle='rgba(0,220,255,0.7)';
    ctx.lineWidth=2;
    ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ax,ay);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(0,220,255,0.8)';
    ctx.beginPath();
    const tipA=Math.atan2(ax-cx,-(ay-cy));
    ctx.moveTo(ax,ay);
    ctx.lineTo(ax-6*Math.sin(tipA-0.4),ay+6*Math.cos(tipA-0.4));
    ctx.lineTo(ax-6*Math.sin(tipA+0.4),ay+6*Math.cos(tipA+0.4));
    ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(0,220,255,0.9)';
    ctx.font='bold 9px Inter,sans-serif';
    ctx.textAlign='center';
    ctx.fillText(`STORM ${mv.speed.toFixed(0)}mph`,ax,ay-8);
    ctx.textAlign='left';
  }

  const aloftDir=S._upperWindDir;
  if(aloftDir!=null){
    const toDir=((aloftDir+180)%360)*Math.PI/180;
    const aLen=35*zoom;
    const ax=cx+Math.sin(toDir-rotZ)*aLen;
    const ay=cy-Math.cos(toDir-rotZ)*aLen*yScale;
    ctx.strokeStyle='rgba(255,0,220,0.5)';
    ctx.lineWidth=1.5;
    ctx.setLineDash([6,4]);
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ax,ay);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(255,0,220,0.6)';
    ctx.beginPath();
    const tipA=Math.atan2(ax-cx,-(ay-cy));
    ctx.moveTo(ax,ay);
    ctx.lineTo(ax-5*Math.sin(tipA-0.4),ay+5*Math.cos(tipA-0.4));
    ctx.lineTo(ax-5*Math.sin(tipA+0.4),ay+5*Math.cos(tipA+0.4));
    ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(255,0,220,0.8)';
    ctx.font='bold 9px Inter,sans-serif';
    ctx.textAlign='center';
    ctx.fillText('ALOFT',ax,ay-8);
    ctx.textAlign='left';
  }
}

function buildHeadingStrip(){
  const track=document.getElementById('iso-hstrip-track');
  if(!track)return;
  const labels={0:'N',30:'030',45:'NE',60:'060',90:'E',120:'120',135:'SE',150:'150',180:'S',210:'210',225:'SW',240:'240',270:'W',300:'300',315:'NW',330:'330'};
  const cardinals=[0,45,90,135,180,225,270,315];
  const majors=[30,60,120,150,210,240,300,330];
  let html='';
  for(let r=0;r<3;r++){
    for(let deg=0;deg<360;deg+=10){
      const d=deg;
      const isCardinal=cardinals.includes(d);
      const isMajor=majors.includes(d);
      const isNorth=d===0;
      const cls=isCardinal?'cardinal'+(isNorth?' north':''):(isMajor?'major':'');
      const lbl=labels[d]||'';
      html+=`<div class="iso-hstrip-tick ${cls}" data-deg="${d}"><span class="iso-hstrip-lbl">${lbl}</span></div>`;
    }
  }
  track.innerHTML=html;
}
function updateIsoBillboard(){
  if(!ISO.scene)return;
  isoFpsTick();
  const els=ISO._stormEls;
  const t=`translate(-50%,-100%) rotateZ(${-ISO.tiltZ}deg) rotateX(${-ISO.tiltX}deg)`;
  for(let i=0;i<els.length;i++){
    els[i].style.transform=t;
  }
  const heading=(((-ISO.tiltZ)%360)+360)%360;
  const arrows=ISO._windArrows;
  if(arrows){
    for(let i=0;i<arrows.length;i++){
      const dir=parseFloat(arrows[i].dataset.dir);
      arrows[i].style.transform=`translate(-50%,-50%) rotate(${dir-heading}deg)`;
    }
  }
  const labels=ISO._windLabels;
  if(labels){
    for(let i=0;i<labels.length;i++){
      const dir=parseFloat(labels[i].dataset.dir);
      const r=parseFloat(labels[i].dataset.radius);
      const angle=(dir-heading)*Math.PI/180;
      labels[i].style.left=Math.sin(angle)*r+'px';
      labels[i].style.top=-Math.cos(angle)*r+'px';
    }
  }
}
function updateIsoCompass(){
  const track=document.getElementById('iso-hstrip-track');
  const hdg=document.getElementById('iso-hstrip-hdg');
  if(!track)return;
  const heading=(((-ISO.tiltZ)%360)+360)%360;
  const tickW=40;
  const totalTicks=36;
  const totalW=totalTicks*tickW;
  const offset=(heading/360)*totalW;
  const stripEl=document.getElementById('iso-hstrip');
  const centerX=stripEl?stripEl.clientWidth/2:180;
  track.style.transform=`translateX(${centerX-offset-totalW}px)`;
  if(hdg)hdg.textContent=`${Math.round(heading).toString().padStart(3,'0')}°`;
}

function setupIsoTouch(){
  const w=ISO.wrap;
  let dragging=false;
  let lastX,lastY;
  const markDirty=()=>{ISO._dirty=true;};

  w.addEventListener('pointerdown',(e)=>{
    if(e.target.closest('.iso-popup,.iso-legend,.iso-info,.iso-close,.iso-cam,.iso-height-ctrl'))return;
    dragging=true;
    lastX=e.clientX;
    lastY=e.clientY;
    w.setPointerCapture(e.pointerId);
  });
  w.addEventListener('pointermove',(e)=>{
    if(!dragging)return;
    const dx=e.clientX-lastX;
    const dy=e.clientY-lastY;
    ISO.tiltZ=(ISO.tiltZ-dx*0.3)%360;
    ISO.tiltX=Math.max(15,Math.min(85,ISO.tiltX+dy*0.3));
    lastX=e.clientX;
    lastY=e.clientY;
    markDirty();
  });
  w.addEventListener('pointerup',()=>{dragging=false;});
  w.addEventListener('pointercancel',()=>{dragging=false;});

  w.addEventListener('wheel',(e)=>{
    e.preventDefault();
    ISO.zoom=Math.max(0.3,Math.min(4,ISO.zoom-(e.deltaY>0?0.1:-0.1)));
    markDirty();
  },{passive:false});

  let pinchDist=null;
  w.addEventListener('touchstart',(e)=>{
    if(e.touches.length===2){
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      pinchDist=Math.hypot(dx,dy);
    }
  });
  w.addEventListener('touchmove',(e)=>{
    if(e.touches.length===2&&pinchDist){
      e.preventDefault();
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      const newDist=Math.hypot(dx,dy);
      ISO.zoom=Math.max(0.3,Math.min(4,ISO.zoom*(newDist/pinchDist)));
      pinchDist=newDist;
      markDirty();
    }
  },{passive:false});
  w.addEventListener('touchend',()=>{pinchDist=null;});

  const camPad=document.getElementById('iso-cam');
  if(camPad){
    let camInterval=null;
    const camActions={
      up:()=>{ISO.tiltX=Math.max(15,ISO.tiltX-2);markDirty();},
      down:()=>{ISO.tiltX=Math.min(85,ISO.tiltX+2);markDirty();},
      left:()=>{ISO.tiltZ=(ISO.tiltZ+3)%360;markDirty();},
      right:()=>{ISO.tiltZ=(ISO.tiltZ-3)%360;markDirty();},
      zin:()=>{ISO.zoom=Math.min(4,ISO.zoom+0.1);markDirty();},
      zout:()=>{ISO.zoom=Math.max(0.3,ISO.zoom-0.1);markDirty();},
      reset:()=>{ISO.tiltX=55;ISO.tiltZ=0;ISO.zoom=1;markDirty();}
    };
    const startCam=(action)=>{
      if(camActions[action])camActions[action]();
      camInterval=setInterval(()=>{if(camActions[action])camActions[action]();},80);
    };
    const stopCam=()=>{if(camInterval){clearInterval(camInterval);camInterval=null;}};

    camPad.addEventListener('pointerdown',(e)=>{
      const btn=e.target.closest('[data-cam]');
      if(!btn)return;
      e.preventDefault();e.stopPropagation();
      startCam(btn.dataset.cam);
    });
    camPad.addEventListener('pointerup',stopCam);
    camPad.addEventListener('pointerleave',stopCam);
    camPad.addEventListener('pointercancel',stopCam);
  }
}

let _syncToken = localStorage.getItem('st_syncToken') || '';
let _syncEmail = localStorage.getItem('st_syncEmail') || '';
let _syncLastTime = localStorage.getItem('st_syncLastTime') || '';
let _emailAlertsOn = localStorage.getItem('st_emailAlerts') === '1';

function _syncApiUrl() { return localStorage.getItem('st_syncApiUrl') || ''; }

async function _syncFetch(path, opts = {}) {
  const base = _syncApiUrl();
  if (!base) throw new Error('Sync server URL not configured');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (_syncToken) headers['Authorization'] = 'Bearer ' + _syncToken;
  const res = await fetch(base + path, { ...opts, headers, signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function _gatherSyncSettings() {
  return {
    favorites: (function(){try{return JSON.parse(localStorage.getItem('st_favs')||'[]')}catch(e){return[]}})(),
    homeLocation: (function(){try{return JSON.parse(localStorage.getItem('st_home_location'))}catch(e){return null}})(),
    wxThresholds: (function(){try{return JSON.parse(localStorage.getItem('st_wxThresholds'))}catch(e){return{}}})(),
    stormThresholds: (function(){try{return JSON.parse(localStorage.getItem('st_stormThresholds'))}catch(e){return{}}})(),
    units: (function(){try{return JSON.parse(localStorage.getItem('st_units'))}catch(e){return null}})(),
    unitMode: localStorage.getItem('st_unitMode') || 'auto',
    customUnits: (function(){try{return JSON.parse(localStorage.getItem('st_customUnits'))}catch(e){return null}})(),
    gaugeStyle: localStorage.getItem('st_gaugeStyle') || 'neon',
    timeFormat: localStorage.getItem('st_timeFormat') || 'auto',
    sonarCfg: (function(){try{return JSON.parse(localStorage.getItem('st_sonarCfg'))}catch(e){return null}})(),
    sonarZoom: parseInt(localStorage.getItem('st_sonarZoom')) || 80,
    emailAlerts: _emailAlertsOn,
  };
}

function _applySyncSettings(s) {
  if (!s || typeof s !== 'object') return;
  if (s.favorites) { try { localStorage.setItem('st_favs', JSON.stringify(s.favorites)); } catch(e){} }
  if (s.homeLocation) { try { localStorage.setItem('st_home_location', JSON.stringify(s.homeLocation)); } catch(e){} }
  if (s.wxThresholds) { try { localStorage.setItem('st_wxThresholds', JSON.stringify(s.wxThresholds)); } catch(e){} }
  if (s.stormThresholds) { try { localStorage.setItem('st_stormThresholds', JSON.stringify(s.stormThresholds)); } catch(e){} }
  if (s.units) { try { localStorage.setItem('st_units', JSON.stringify(s.units)); } catch(e){} }
  if (s.unitMode) localStorage.setItem('st_unitMode', s.unitMode);
  if (s.customUnits) { try { localStorage.setItem('st_customUnits', JSON.stringify(s.customUnits)); } catch(e){} }
  if (s.gaugeStyle) localStorage.setItem('st_gaugeStyle', s.gaugeStyle);
  if (s.timeFormat) localStorage.setItem('st_timeFormat', s.timeFormat);
  if (s.sonarCfg) { try { localStorage.setItem('st_sonarCfg', JSON.stringify(s.sonarCfg)); } catch(e){} }
  if (s.sonarZoom) localStorage.setItem('st_sonarZoom', String(s.sonarZoom));
  if (s.emailAlerts !== undefined) {
    _emailAlertsOn = !!s.emailAlerts;
    localStorage.setItem('st_emailAlerts', _emailAlertsOn ? '1' : '0');
  }
}

function _setSyncState(token, email) {
  _syncToken = token || '';
  _syncEmail = email || '';
  localStorage.setItem('st_syncToken', _syncToken);
  localStorage.setItem('st_syncEmail', _syncEmail);
}

function _clearSyncState() {
  _syncToken = ''; _syncEmail = ''; _syncLastTime = '';
  localStorage.removeItem('st_syncToken');
  localStorage.removeItem('st_syncEmail');
  localStorage.removeItem('st_syncLastTime');
}

async function syncSignup() {
  const emailEl = document.getElementById('sync-email');
  const pinEl = document.getElementById('sync-pin');
  if (!emailEl || !pinEl) return;
  const email = emailEl.value.trim();
  const pin = pinEl.value.trim();
  if (!email || !pin) return toast('Enter email and PIN');
  if (!/^\d{4,6}$/.test(pin)) return toast('PIN must be 4-6 digits');
  try {
    const data = await _syncFetch('/api/signup', { method: 'POST', body: JSON.stringify({ email, pin }) });
    _setSyncState(data.token, data.email);
    toast('✅ Account created');
    renderSyncSection();
    syncPushSettings();
  } catch (e) {
    toast('❌ ' + (e.message || 'Signup failed'));
  }
}

async function syncLogin() {
  const emailEl = document.getElementById('sync-email');
  const pinEl = document.getElementById('sync-pin');
  if (!emailEl || !pinEl) return;
  const email = emailEl.value.trim();
  const pin = pinEl.value.trim();
  if (!email || !pin) return toast('Enter email and PIN');
  try {
    const data = await _syncFetch('/api/login', { method: 'POST', body: JSON.stringify({ email, pin }) });
    _setSyncState(data.token, data.email);
    toast('✅ Logged in');
    renderSyncSection();
    syncPullSettings();
  } catch (e) {
    toast('❌ ' + (e.message || 'Login failed'));
  }
}

async function syncLogout() {
  try { await _syncFetch('/api/logout', { method: 'POST' }); } catch(e) {}
  _clearSyncState();
  toast('Logged out');
  renderSyncSection();
}

async function syncPushSettings() {
  if (!_syncToken) return toast('Not logged in');
  try {
    const settings = _gatherSyncSettings();
    const data = await _syncFetch('/api/settings/sync', { method: 'POST', body: JSON.stringify({ settings }) });
    _syncLastTime = data.updated_at || new Date().toISOString();
    localStorage.setItem('st_syncLastTime', _syncLastTime);
    toast('☁️ Settings uploaded');
    renderSyncSection();
  } catch (e) {
    toast('❌ ' + (e.message || 'Sync failed'));
  }
}

async function syncPullSettings() {
  if (!_syncToken) return toast('Not logged in');
  try {
    const data = await _syncFetch('/api/settings');
    if (data.settings && Object.keys(data.settings).length > 0) {
      _applySyncSettings(data.settings);
      _syncLastTime = data.updated_at || '';
      localStorage.setItem('st_syncLastTime', _syncLastTime);
      toast('☁️ Settings restored');
      try { loadUnits(); syncSettingsPanel(); } catch(e) {}
    } else {
      toast('No saved settings found — uploading current settings');
      syncPushSettings();
    }
    renderSyncSection();
  } catch (e) {
    toast('❌ ' + (e.message || 'Pull failed'));
  }
}

function toggleEmailAlerts() {
  _emailAlertsOn = !_emailAlertsOn;
  localStorage.setItem('st_emailAlerts', _emailAlertsOn ? '1' : '0');
  renderSyncSection();
  if (_syncToken) syncPushSettings();
}

function setSyncApiUrl() {
  const el = document.getElementById('sync-api-url');
  if (!el) return;
  const url = el.value.trim().replace(/\/+$/, '');
  localStorage.setItem('st_syncApiUrl', url);
  toast(url ? '🔗 Sync server URL saved' : 'Sync server URL cleared');
  renderSyncSection();
}

async function syncDeleteAccount() {
  if (!confirm('Delete your sync account? This removes all synced data from the server. Local settings are not affected.')) return;
  try {
    await _syncFetch('/api/account', { method: 'DELETE' });
    _clearSyncState();
    _emailAlertsOn = false;
    localStorage.setItem('st_emailAlerts', '0');
    toast('Account deleted');
    renderSyncSection();
  } catch (e) {
    toast('❌ ' + (e.message || 'Delete failed'));
  }
}

function renderSyncSection() {
  const el = document.getElementById('sync-alerts-section');
  if (!el) return;
  const base = _syncApiUrl();
  const loggedIn = !!_syncToken && !!base;

  let html = '';

  html += '<div style="margin-bottom:8px"><div style="display:flex;align-items:center;gap:4px;margin-bottom:4px"><span style="font-size:0.65em;color:var(--text-muted)">Server URL</span></div>';
  html += `<div style="display:flex;gap:4px"><input type="text" id="sync-api-url" value="${escHtml(base)}" placeholder="https://your-worker.workers.dev" style="flex:1;font-size:0.65em;padding:4px 6px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:6px;font-family:var(--font-mono)"><button onclick="setSyncApiUrl()" style="font-size:0.6em;padding:4px 8px;background:rgba(167,139,250,0.12);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);border-radius:6px;cursor:pointer;font-weight:600;white-space:nowrap">Save</button></div></div>`;

  if (!base) {
    html += '<div style="font-size:0.6em;color:var(--text-muted);padding:8px 0">Set your Cloudflare Worker URL above to enable sync & email alerts. See worker/README.md for setup instructions.</div>';
    el.innerHTML = html;
    return;
  }

  if (!loggedIn) {
    html += '<div style="margin-bottom:6px"><input type="email" id="sync-email" placeholder="Email" style="width:100%;font-size:0.7em;padding:6px 8px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:6px;margin-bottom:4px;box-sizing:border-box">';
    html += '<input type="password" id="sync-pin" placeholder="4-6 digit PIN" inputmode="numeric" pattern="[0-9]*" maxlength="6" style="width:100%;font-size:0.7em;padding:6px 8px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:6px;box-sizing:border-box"></div>';
    html += '<div style="display:flex;gap:6px;margin-bottom:6px">';
    html += '<button onclick="syncSignup()" style="flex:1;padding:7px;font-size:0.7em;font-weight:600;background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);border-radius:6px;cursor:pointer">Sign Up</button>';
    html += '<button onclick="syncLogin()" style="flex:1;padding:7px;font-size:0.7em;font-weight:600;background:rgba(0,229,255,0.1);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:6px;cursor:pointer">Log In</button>';
    html += '</div>';
    html += '<div style="font-size:0.55em;color:var(--text-muted)">Account is optional — the app works fully without one.</div>';
  } else {
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:0.7em;color:var(--text-secondary)">📧 ${escHtml(_syncEmail)}</span><span style="font-size:0.55em;padding:2px 8px;background:rgba(0,200,100,0.15);color:#00cc66;border-radius:10px;font-weight:600">Connected</span></div>`;

    html += '<div style="display:flex;gap:4px;margin-bottom:8px">';
    html += '<button onclick="syncPushSettings()" style="flex:1;padding:6px;font-size:0.65em;font-weight:600;background:rgba(167,139,250,0.12);color:#a78bfa;border:1px solid rgba(167,139,250,0.3);border-radius:6px;cursor:pointer">⬆ Upload</button>';
    html += '<button onclick="syncPullSettings()" style="flex:1;padding:6px;font-size:0.65em;font-weight:600;background:rgba(0,229,255,0.1);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:6px;cursor:pointer">⬇ Download</button>';
    html += '</div>';

    if (_syncLastTime) {
      try {
        const d = new Date(_syncLastTime);
        html += `<div style="font-size:0.55em;color:var(--text-muted);margin-bottom:8px">Last sync: ${fmtClock(d)} · ${d.toLocaleDateString()}</div>`;
      } catch(e) {}
    }

    const alertOn = _emailAlertsOn;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border-subtle)">';
    html += '<div><span style="font-size:0.7em;color:var(--text-secondary)">📬 Email Alerts</span><div style="font-size:0.55em;color:var(--text-muted);margin-top:2px">Get emailed when thresholds are exceeded</div></div>';
    html += `<button onclick="toggleEmailAlerts()" style="font-size:0.65em;padding:4px 12px;border-radius:6px;cursor:pointer;font-weight:600;border:1px solid ${alertOn?'#00cc66':'var(--border-subtle)'};background:${alertOn?'rgba(0,200,100,0.15)':'rgba(255,255,255,0.04)'};color:${alertOn?'#00cc66':'var(--text-muted)'}">${alertOn?'ON':'OFF'}</button>`;
    html += '</div>';
    if (alertOn) {
      html += '<div style="font-size:0.55em;color:var(--text-muted);margin-bottom:8px;padding:0 4px">Alerts check your saved locations every 10 minutes against your Weather Station Alert thresholds above. 15-min cooldown per alert type.</div>';
    }

    html += '<div style="display:flex;gap:4px;margin-top:6px">';
    html += '<button onclick="syncLogout()" style="flex:1;padding:5px;font-size:0.6em;font-weight:600;background:rgba(255,255,255,0.04);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:6px;cursor:pointer">Log Out</button>';
    html += '<button onclick="syncDeleteAccount()" style="flex:1;padding:5px;font-size:0.6em;font-weight:600;background:rgba(255,51,85,0.08);color:var(--accent-red);border:1px solid rgba(255,51,85,0.3);border-radius:6px;cursor:pointer">Delete Account</button>';
    html += '</div>';
  }

  el.innerHTML = html;
}

(function initLang(){
  const flag=LANGS.find(l=>l.c===_curLang);
  document.getElementById('btn-lang').textContent=flag?flag.f:'🇺🇸';
  startTranslateObserver();
  if(_curLang!=='en'){
    preseedStormVocab(_curLang);
    setTimeout(()=>translatePage(_curLang),2000);
  }
})();