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
};
const TEMP_UNITS = ['°F','°C'];
const WIND_UNITS = ['mph','kts','km/h','m/s'];
const PRES_UNITS = ['inHg','mb','mmHg','kPa'];
const VIS_UNITS = ['mi','km'];
const PRECIP_UNITS = ['in','mm','cm'];

function toast(msg,dur){const c=document.getElementById('toast-container');const el=document.createElement('div');el.className='toast';el.textContent=msg;c.appendChild(el);setTimeout(()=>{el.classList.add('out');setTimeout(()=>el.remove(),250)},dur||3000)}
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
  reRenderActive();
}
function loadUnits(){
  try{const u=JSON.parse(localStorage.getItem('st_units'));if(u){S.tempUnit=u.t||0;S.windUnit=u.w||0;S.presUnit=u.p||0;S.visUnit=u.v||0;S.precipUnit=u.pr||0}}catch(e){}
}

function reRenderActive(){
  if(S.activePage==='weather'&&S.forecast) renderWeather(S.forecast);
  if(S.activePage==='station'&&S.station) renderStation();
  if(S.activePage==='storms') renderStorms();
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

function stormCat(dbz){
  const m=S.radarMetric;
  if(dbz>=65)return{label:'Hail very likely, large hail',cls:'extreme',color:'#ff80ab',rain:m?'>42 cm/hr':'>16.6 in/hr'};
  if(dbz>=60)return{label:'Very heavy rain, hail likely',cls:'extreme',color:'#e040fb',rain:m?'20 cm/hr':'8 in/hr'};
  if(dbz>=55)return{label:'Very heavy rain, hail possible',cls:'intense',color:'#d32f2f',rain:m?'10 cm/hr':'4 in/hr'};
  if(dbz>=50)return{label:'Heavy rain, small hail possible',cls:'intense',color:'#ef5350',rain:m?'4.8 cm/hr':'1.9 in/hr'};
  if(dbz>=45)return{label:'Heavy rain',cls:'heavy',color:'#f9a825',rain:m?'2.3 cm/hr':'0.92 in/hr'};
  if(dbz>=40)return{label:'Moderate to heavy rain',cls:'heavy',color:'#fdd835',rain:m?'1.1 cm/hr':'0.45 in/hr'};
  if(dbz>=35)return{label:'Moderate rain',cls:'moderate',color:'#66bb6a',rain:m?'5.6 mm/hr':'0.22 in/hr'};
  if(dbz>=30)return{label:'Light to moderate rain',cls:'moderate',color:'#2e7d32',rain:m?'2.7 mm/hr':'0.10 in/hr'};
  if(dbz>=25)return{label:'Light rain',cls:'light',color:'#1565c0',rain:m?'1.3 mm/hr':'0.05 in/hr'};
  if(dbz>=20)return{label:'Light rain',cls:'light',color:'#42a5f5',rain:m?'0.6 mm/hr':'0.02 in/hr'};
  return{label:'Drizzle/Mist',cls:'light',color:'#90caf9',rain:'trace'};
}
function dbzHex(dbz){return dbz>=66?'#ff80ab':dbz>=61?'#e040fb':dbz>=56?'#d32f2f':dbz>=51?'#ef5350':dbz>=46?'#f9a825':dbz>=41?'#fdd835':dbz>=36?'#2e7d32':dbz>=31?'#66bb6a':dbz>=26?'#1565c0':dbz>=20?'#42a5f5':'#90caf9'}
function fmtStormDist(mi){return S.radarMetric?(mi*1.60934).toFixed(1)+' km':mi.toFixed(1)+' mi'}
function fmtCountdown(totalSec){
  if(totalSec<=0)return'NOW';
  const h=Math.floor(totalSec/3600),m=Math.floor((totalSec%3600)/60),s=totalSec%60;
  if(h>0)return h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s;
  return m+':'+(s<10?'0':'')+s;
}
function fmtArrivalTime(etaMin){
  const d=new Date(Date.now()+etaMin*60000);
  return d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',hour12:true});
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
function calcDewC(tc,rh){const a=17.27,b=237.7,g=(a*tc)/(b+tc)+Math.log(rh/100);return(b*g)/(a-g)}

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
const RV_PAL=[
  {dbz:10,r:40,g:40,b:255},{dbz:10,r:30,g:30,b:220},
  {dbz:15,r:20,g:100,b:245},{dbz:15,r:0,g:80,b:220},
  {dbz:20,r:0,g:150,b:255},{dbz:20,r:0,g:130,b:230},
  {dbz:25,r:0,g:190,b:0},{dbz:25,r:0,g:170,b:0},{dbz:25,r:0,g:210,b:0},
  {dbz:30,r:0,g:230,b:0},{dbz:30,r:0,g:255,b:0},{dbz:30,r:50,g:255,b:0},
  {dbz:35,r:255,g:255,b:0},{dbz:35,r:230,g:230,b:0},{dbz:35,r:200,g:200,b:0},
  {dbz:40,r:255,g:190,b:0},{dbz:40,r:255,g:170,b:0},{dbz:40,r:255,g:150,b:0},
  {dbz:45,r:255,g:100,b:0},{dbz:45,r:255,g:80,b:0},{dbz:45,r:230,g:70,b:0},
  {dbz:50,r:255,g:0,b:0},{dbz:50,r:230,g:0,b:0},{dbz:50,r:200,g:0,b:0},
  {dbz:55,r:180,g:0,b:0},{dbz:55,r:150,g:0,b:0},{dbz:55,r:140,g:0,b:50},
  {dbz:60,r:200,g:0,b:200},{dbz:60,r:180,g:0,b:180},{dbz:60,r:170,g:0,b:170},
  {dbz:65,r:255,g:100,b:255},{dbz:65,r:230,g:80,b:230},
  {dbz:70,r:255,g:200,b:255},{dbz:70,r:255,g:170,b:255}
];
function rvToDbz(r,g,b,a){
  if(a<30)return 0;
  if(r+g+b<40)return 0;
  if(r>220&&g>220&&b>220)return 0;
  let best=0,bestD=1e9;
  for(const p of RV_PAL){
    const d=(r-p.r)**2+(g-p.g)**2+(b-p.b)**2;
    if(d<bestD){bestD=d;best=p.dbz}
  }
  if(bestD>5000)return 0;
  return best;
}

// ==========================================
// NAVIGATION
// ==========================================
document.querySelectorAll('.nav-item').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const page=btn.dataset.page;
    switchPage(page);
    if(page==='radar'&&S.lat)initRadar();
    if(page==='station'&&S.lat&&!S.station)fetchStation();
    if(page==='alerts'&&S.lat)fetchAlerts();
    if(page==='storms'&&S.lat)renderStorms();
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
  if(page==='radar'&&S.map)setTimeout(()=>S.map.invalidateSize(),100);
  if(_curLang!=='en'){setTimeout(()=>quickTranslate(),200);setTimeout(()=>quickTranslate(),800)}
}
function updateStormBadges(){
  const n=S.storms.length;
  const hdr=document.getElementById('header-storm-count');
  const nav=document.getElementById('nav-storm-badge');
  if(hdr){
    hdr.textContent=`🌪️ ${n}`;
    hdr.style.background=n?'#22c55e':'#6b7280';
  }
  if(nav){
    nav.textContent=n.toString();
    nav.style.background=n?'#ef4444':'#6b7280';
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
  const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=1`);
  return res.json();
}
async function fetchSuggestions(q){
  try{
    let data=await nomSearch(cleanQ(q),5);
    if(!data.length){
      const simple=q.replace(/^\d+\s*/,'').replace(/\./g,'').trim();
      if(simple!==cleanQ(q))data=await nomSearch(simple,5);
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
  const place=addr.city||addr.town||addr.village||addr.hamlet||addr.county||'';
  if(place)parts.push(place);
  const region=addr.state||addr.country||'';
  if(region)parts.push(region);
  return parts.length?parts.join(', '):(fallback||'Unknown');
}
function selectSuggestion(r){
  hideSuggestions();
  const lat=parseFloat(r.lat),lon=parseFloat(r.lon);
  const name=fmtLocName(r.address||{},r.display_name.split(',').slice(0,2).join(',').trim());
  document.getElementById('location-input').value=name;
  toggleLocOverlay(false);
  setLoc(lat,lon,name);
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
      pos=>reverseGeo(pos.coords.latitude,pos.coords.longitude),
      err=>{
        const msgs={1:'Location permission denied',2:'Location unavailable — your browser may block GPS',3:'Location request timed out'};
        toast((msgs[err.code]||'Could not get location')+' — try searching instead');
      },
      {enableHighAccuracy:false,timeout:15000,maximumAge:60000}
    );
  });
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
}

async function searchLoc(){
  const q=document.getElementById('location-input').value.trim();
  if(!q)return;
  toast('Searching...');
  try{
    let data=await nomSearch(cleanQ(q),1);
    if(!data.length){
      const simple=q.replace(/^\d+\s*/,'').replace(/\./g,'').trim();
      if(simple!==cleanQ(q))data=await nomSearch(simple,1);
    }
    if(data.length){
      const r=data[0];
      const typed=cleanQ(q);
      const addr=r.address||{};
      const hasStreet=addr.house_number&&addr.road;
      let name;
      if(!hasStreet&&/^\d+\s/.test(q)){
        const streetPart=q.split(',')[0].replace(/\./g,'').trim();
        const place=addr.city||addr.town||addr.village||addr.county||'';
        const region=addr.state||addr.country||'';
        name=[streetPart,place,region].filter(Boolean).join(', ');
      }else{
        name=fmtLocName(addr,r.display_name.split(',').slice(0,2).join(',').trim());
      }
      setLoc(parseFloat(r.lat),parseFloat(r.lon),name);
    }
    else toast('Location not found');
  }catch(e){toast('Search failed')}
}

async function reverseGeo(lat,lon){
  try{
    const res=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data=await res.json();const addr=data.address||{};
    const name=fmtLocName(addr,`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    setLoc(lat,lon,name);
  }catch(e){setLoc(lat,lon)}
}

function setLoc(lat,lon,name,fromTravel){
  if(!fromTravel && S.travelMode) stopTravelMode();
  S.lat=lat;S.lon=lon;
  S.locName=name||`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  document.getElementById('location-input').value=S.locName;
  document.getElementById('status-dot').classList.add('live');
  document.getElementById('status-text').textContent='Live · '+S.locName;
  S.station=null;S.stationId=null;S.stormMovement=null;
  S.radarSource=isUSLocation(lat,lon)?'nexrad':'rainviewer';
  if(S.map){
    S.stormMarkers.forEach(m=>S.map.removeLayer(m));S.stormMarkers=[];
    clearStormCone();
  }
  S.storms=[];
  try{localStorage.setItem('st_loc',JSON.stringify({lat,lon,name:S.locName}))}catch(e){}
  if(S.map){
    S.map.setView([lat,lon],S.map.getZoom());
    if(S._userMarker)S._userMarker.setLatLng([lat,lon]);
    if(S._rangeCircle)S._rangeCircle.setLatLng([lat,lon]);
    showRadarLayer(S.map);
  }
  fetchWeather();
  fetchAlerts();
  scanRadarForStorms();
  scheduleHourlyRefresh();
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
function renderFavorites(){
  const el=document.getElementById('fav-list');
  if(!el)return;
  const favs=getFavorites();
  if(!favs.length){el.innerHTML='<div style="font-size:0.7em;color:#555;text-align:center;padding:4px">No favorites saved</div>';return}
  el.innerHTML=favs.map((f,i)=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin:2px 0;background:rgba(255,255,255,0.03);border-radius:6px;cursor:pointer" onclick="loadFavorite(${i})">
    <span style="font-size:0.8em">⭐</span>
    <span style="flex:1;font-size:0.75em;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
    <button onclick="event.stopPropagation();renameFavorite(${i})" style="background:none;border:none;color:var(--accent-cyan);font-size:0.7em;cursor:pointer;padding:2px 4px" title="Rename">✏️</button>
    <button onclick="event.stopPropagation();removeFavorite(${i})" style="background:none;border:none;color:#f44;font-size:0.7em;cursor:pointer;padding:2px 4px">✕</button>
  </div>`).join('');
}

function startMapPick(){
  toggleLocOverlay(false);
  if(!S.lat){S.lat=39.8;S.lon=-98.5;S.locName=''}
  if(!S.map){switchPage('radar');toast('Pan to your location and tap Confirm');setTimeout(()=>{if(S.map)startMapPick();else toast('Map loading...')},1200);return}
  switchPage('radar');
  S._mapPickMode=true;
  let banner=document.getElementById('map-pick-banner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='map-pick-banner';
    banner.style.cssText='position:absolute;top:0;left:0;right:0;z-index:600;background:rgba(0,229,255,0.15);backdrop-filter:blur(10px);border-bottom:1px solid var(--accent-cyan);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;font-size:0.8em';
    banner.innerHTML=`<span style="color:var(--accent-cyan);font-weight:600">📌 Pan map to desired location, then tap Confirm</span>
      <div style="display:flex;gap:6px">
        <button id="map-pick-confirm" style="padding:4px 12px;background:var(--accent-green);color:#000;border:none;border-radius:6px;font-weight:700;font-size:0.9em;cursor:pointer">✓ Confirm</button>
        <button id="map-pick-cancel" style="padding:4px 12px;background:rgba(255,51,85,0.2);color:var(--accent-red);border:1px solid var(--accent-red);border-radius:6px;font-weight:600;font-size:0.9em;cursor:pointer">✕</button>
      </div>`;
    document.querySelector('.map-container')?.appendChild(banner);
    document.getElementById('map-pick-confirm').addEventListener('click',confirmMapPick);
    document.getElementById('map-pick-cancel').addEventListener('click',cancelMapPick);
  }
  banner.style.display='flex';
  if(!S._mapPickPin){
    S._mapPickPin=L.marker(S.map.getCenter(),{icon:L.divIcon({className:'',html:'<div style="font-size:24px;text-align:center;margin-top:-20px">📍</div>',iconSize:[30,40],iconAnchor:[15,40]})}).addTo(S.map);
  }else{
    S._mapPickPin.setLatLng(S.map.getCenter());
    S._mapPickPin.addTo(S.map);
  }
  S.map.on('move',onMapPickMove);
}
function onMapPickMove(){
  if(S._mapPickPin&&S.map)S._mapPickPin.setLatLng(S.map.getCenter());
}
async function confirmMapPick(){
  const center=S.map.getCenter();
  const lat=center.lat,lon=center.lng;
  cancelMapPick();
  let name=`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    const d=await r.json();
    if(d.address){
      const a=d.address;
      name=a.city||a.town||a.village||a.hamlet||a.county||name;
      if(a.state)name+=', '+a.state;
    }
  }catch(e){}
  setLoc(lat,lon,name);
  toast('📌 Location set: '+name);
}
function cancelMapPick(){
  S._mapPickMode=false;
  const banner=document.getElementById('map-pick-banner');
  if(banner)banner.style.display='none';
  if(S._mapPickPin&&S.map){S.map.removeLayer(S._mapPickPin);S._mapPickPin=null}
  if(S.map)S.map.off('move',onMapPickMove);
}

function scheduleHourlyRefresh(){
  if(S._hourlyTimer)clearTimeout(S._hourlyTimer);
  const now=new Date();
  const next=new Date(now);
  next.setMinutes(0,0,0);
  next.setHours(next.getHours()+1);
  const ms=next.getTime()-now.getTime();
  S._hourlyTimer=setTimeout(()=>{
    fetchWeather();
    fetchAlerts();
    scheduleHourlyRefresh();
  },ms);
}

// ==========================================
// TRAVEL MODE (Live GPS Tracking)
// ==========================================
function toggleTravelMode(){
  if(S.travelMode) return stopTravelMode();
  if(!navigator.geolocation) return toast('GPS not available on this device');
  S.travelMode=true;
  S.travelLastUpdate=0;
  const ind=document.getElementById('travel-indicator');
  ind.classList.add('show');
  document.getElementById('travel-status').textContent='🧭 Acquiring GPS...';
  const btn=document.getElementById('travel-btn');
  btn.textContent='⏹ Stop Travel Mode';
  btn.classList.add('active');
  document.getElementById('status-text').textContent='🧭 Travel Mode · Tracking...';
  if(S.map && !S.travelMarker){
    S.travelMarker=L.circleMarker([S.lat||0,S.lon||0],{radius:8,fillColor:'#00e5ff',fillOpacity:0.9,color:'#fff',weight:2,className:'travel-gps-dot'}).addTo(S.map);
  }
  S.travelWatchId=navigator.geolocation.watchPosition(
    pos=>onTravelPosition(pos),
    err=>{document.getElementById('travel-status').textContent='🧭 GPS error — retrying...'},
    {enableHighAccuracy:true, maximumAge:5000, timeout:15000}
  );
  toast('🧭 Travel Mode ON — GPS tracking active');
}
function stopTravelMode(){
  S.travelMode=false;
  if(S.travelWatchId!==null){navigator.geolocation.clearWatch(S.travelWatchId);S.travelWatchId=null}
  document.getElementById('travel-indicator').classList.remove('show');
  const btn=document.getElementById('travel-btn');
  btn.textContent='🧭 Travel Mode — Follow GPS Live';
  btn.classList.remove('active');
  if(S.travelMarker&&S.map){S.map.removeLayer(S.travelMarker);S.travelMarker=null}
  if(S.lat) document.getElementById('status-text').textContent='Live · '+S.locName;
  toast('Travel Mode OFF');
}
function onTravelPosition(pos){
  if(!S.travelMode) return;
  const lat=pos.coords.latitude, lon=pos.coords.longitude;
  const acc=pos.coords.accuracy;
  const now=Date.now();
  const dist=S.lat?haversine(S.lat,S.lon,lat,lon):999;
  const spd=pos.coords.speed;
  const spdTxt=spd!==null&&spd>=0?(S.windUnit===0?((spd*2.237).toFixed(0)+' mph'):(S.windUnit===2?((spd*3.6).toFixed(0)+' km/h'):((spd*1.944).toFixed(0)+' kts'))):'—';
  document.getElementById('travel-status').textContent='🧭 '+spdTxt+' · ±'+(acc<1000?(acc.toFixed(0)+'m'):((acc/1000).toFixed(1)+'km'));
  if(S.travelMarker)S.travelMarker.setLatLng([lat,lon]);
  if(S.map)S.map.panTo([lat,lon],{animate:true,duration:0.5});
  const minInterval=30000;
  const minDist=0.15;
  if(dist>minDist && (now-S.travelLastUpdate)>minInterval){
    S.travelLastUpdate=now;
    reverseGeocode(lat,lon).then(name=>{
      setLoc(lat,lon,name,true);
      document.getElementById('status-text').textContent='🧭 Travel Mode · '+S.locName;
    });
  } else {
    S.lat=lat;S.lon=lon;
    if(S._userMarker)S._userMarker.setLatLng([lat,lon]);
    if(S._rangeCircle)S._rangeCircle.setLatLng([lat,lon]);
  }
}
function reverseGeocode(lat,lon){
  return fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,{headers:{'Accept-Language':'en'}})
    .then(r=>r.json()).then(d=>{
      if(d&&d.address) return fmtLocName(d.address, d.display_name);
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }).catch(()=>`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
}

// ==========================================
// WEATHER (Open-Meteo)
// ==========================================
async function fetchWeather(){
  const el=document.getElementById('page-weather');showSkel(el,6);
  try{
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}`
      +`&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day`
      +`&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,is_day`
      +`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max`
      +`&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto&forecast_days=7&past_days=1`;
    const res=await fetch(url);const data=await res.json();
    S.weather=data.current;S.forecast=data;renderWeather(data);if(_curLang!=='en')setTimeout(quickTranslate,300);
  }catch(e){el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load weather data.</p></div>`}
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
  const dewC=calcDewC(tempC,c.relative_humidity_2m);
  const hourly=data.hourly||{},daily=data.daily||{};
  const baro=getBaroPrediction(c,hourly);
  S._baroTrendMb=baro.trendMb;S._baroTrend=baro.trend;
  const trendArrow=baro.trend==='rising'?'↑':baro.trend==='falling'?'↓':'→';
  const windStr=fmtWind(c.wind_speed_10m);
  const gustStr=c.wind_gusts_10m?'G'+fmtWind(c.wind_gusts_10m):'';

  const sections={
    trends:`<div class="weather-section" data-sec="trends"><div class="sec-header"><span class="card-title" style="margin:0"><span class="icon">📈</span> 24h Trends</span>${secBtns('trends')}</div>
      ${renderHourlyPrecip(hourly)}
      <div style="margin-top:12px"></div>
      ${renderPressureTrend(hourly)}</div>`,
    forecast:`<div class="weather-section" data-sec="forecast"><div class="sec-header"><span></span>${secBtns('forecast')}</div>${renderDailyForecast(daily)}</div>`
  };
  const order=getSecOrder();

  const wd=c.wind_direction_10m||0;
  const windSpd=c.wind_speed_10m||0;
  const cx=50,cy=50,r=42,ri=36;
  const neonCyan='rgba(0,220,255,';const neonOrange='rgba(255,160,0,';
  let gaugeSvg='';
  gaugeSvg+=`<defs>
    <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="glow2"><feGaussianBlur stdDeviation="2.5" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(0,220,255,0.1)"/><stop offset="50%" stop-color="rgba(0,220,255,0.6)"/><stop offset="85%" stop-color="${neonOrange}0.8)"/><stop offset="100%" stop-color="rgba(255,80,50,0.9)"/></linearGradient>
  </defs>`;
  gaugeSvg+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${neonCyan}0.12)" stroke-width="0.8"/>`;
  gaugeSvg+=`<circle cx="${cx}" cy="${cy}" r="${ri}" fill="none" stroke="${neonCyan}0.08)" stroke-width="0.5"/>`;
  gaugeSvg+=`<circle cx="${cx}" cy="${cy}" r="${ri*0.55}" fill="none" stroke="${neonCyan}0.05)" stroke-width="0.3"/>`;
  const windDisp=parseFloat(kmhTo(windSpd,S.windUnit));
  const gustRaw=c.wind_gusts_10m||windSpd;
  const gustDisp=parseFloat(kmhTo(gustRaw,S.windUnit));
  const peakDisp=Math.max(windDisp,gustDisp);
  const scales=[10,15,20,30,40,50,75,100,130,160,200];
  let maxArcSpd=scales[scales.length-1];
  for(const s of scales){if(peakDisp<=s*0.8){maxArcSpd=s;break}}
  const windArc=Math.min(windDisp/maxArcSpd,1)*340;
  const gustArc=Math.min(gustDisp/maxArcSpd,1)*340;
  const arcR=r+2.5;
  const startA=-170;
  function arcPath(fromDeg,toDeg,radius){
    const sa=(startA+fromDeg)*Math.PI/180,ea=(startA+toDeg)*Math.PI/180;
    const x1=cx+Math.cos(sa)*radius,y1=cy+Math.sin(sa)*radius;
    const x2=cx+Math.cos(ea)*radius,y2=cy+Math.sin(ea)*radius;
    const lg=(toDeg-fromDeg)>180?1:0;
    return`M${x1.toFixed(1)},${y1.toFixed(1)} A${radius},${radius} 0 ${lg} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  if(gustArc>windArc+2){
    gaugeSvg+=`<path d="${arcPath(windArc,gustArc,arcR)}" fill="none" stroke="${neonOrange}0.7)" stroke-width="3.5" stroke-linecap="round" filter="url(#glow)"/>`;
  }
  if(windArc>0){
    gaugeSvg+=`<path d="${arcPath(0,windArc,arcR)}" fill="none" stroke="${neonCyan}0.8)" stroke-width="3.5" stroke-linecap="round" filter="url(#glow)"/>`;
  }
  const spdTicks=[];
  const spdStep=maxArcSpd<=15?5:maxArcSpd<=30?5:maxArcSpd<=50?10:maxArcSpd<=100?20:maxArcSpd<=160?25:50;
  for(let s=0;s<=maxArcSpd;s+=spdStep)spdTicks.push(s);
  const spdArcStart=-170;
  spdTicks.forEach(spd=>{
    const frac=spd/maxArcSpd;
    const deg=spdArcStart+frac*340;
    const a=deg*Math.PI/180;
    const x1=cx+Math.cos(a)*(arcR+1),y1=cy+Math.sin(a)*(arcR+1);
    const x2=cx+Math.cos(a)*(arcR+4),y2=cy+Math.sin(a)*(arcR+4);
    gaugeSvg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${neonCyan}0.5)" stroke-width="1"/>`;
    const lx=cx+Math.cos(a)*(arcR+8),ly=cy+Math.sin(a)*(arcR+8);
    gaugeSvg+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${neonCyan}0.6)" font-size="3.5" font-weight="700" text-anchor="middle" dominant-baseline="central">${spd}</text>`;
  });
  for(let s=0;s<maxArcSpd;s+=spdStep/5||1){
    if(spdTicks.includes(s))continue;
    const frac=s/maxArcSpd;
    const deg=spdArcStart+frac*340;
    const a=deg*Math.PI/180;
    const x1=cx+Math.cos(a)*(arcR+1),y1=cy+Math.sin(a)*(arcR+1);
    const x2=cx+Math.cos(a)*(arcR+2.5),y2=cy+Math.sin(a)*(arcR+2.5);
    gaugeSvg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${neonCyan}0.15)" stroke-width="0.4"/>`;
  }
  const compassTicks=[0,30,60,90,120,150,180,210,240,270,300,330];
  compassTicks.forEach(deg=>{
    const a=(deg-90)*Math.PI/180;
    const isMajor=deg%90===0;
    const x1=cx+Math.cos(a)*r,y1=cy+Math.sin(a)*r;
    const len=isMajor?5:3;
    const x2=cx+Math.cos(a)*(r-len),y2=cy+Math.sin(a)*(r-len);
    gaugeSvg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${neonCyan}${isMajor?'0.45':'0.15'})" stroke-width="${isMajor?1.2:0.5}"/>`;
    if(!isMajor){
      const lx=cx+Math.cos(a)*(r-8),ly=cy+Math.sin(a)*(r-8);
      gaugeSvg+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" fill="${neonCyan}0.2)" font-size="3.5" text-anchor="middle" dominant-baseline="central">${deg||360}</text>`;
    }
  });
  for(let d=0;d<360;d+=10){if(d%30===0)continue;
    const a=(d-90)*Math.PI/180;
    const x1=cx+Math.cos(a)*r,y1=cy+Math.sin(a)*r;
    const x2=cx+Math.cos(a)*(r-1.5),y2=cy+Math.sin(a)*(r-1.5);
    gaugeSvg+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${neonCyan}0.08)" stroke-width="0.4"/>`;
  }
  const ptrAng=(wd-90)*Math.PI/180;
  const pTip=r-1,pBase=10;
  const px=cx+Math.cos(ptrAng)*pTip,py=cy+Math.sin(ptrAng)*pTip;
  const pLx=cx+Math.cos(ptrAng-0.2)*pBase,pLy=cy+Math.sin(ptrAng-0.2)*pBase;
  const pRx=cx+Math.cos(ptrAng+0.2)*pBase,pRy=cy+Math.sin(ptrAng+0.2)*pBase;
  const pBx=cx+Math.cos(ptrAng+Math.PI)*5,pBy=cy+Math.sin(ptrAng+Math.PI)*5;
  const neonRed='rgba(255,70,70,';
  gaugeSvg+=`<polygon points="${px.toFixed(1)},${py.toFixed(1)} ${pLx.toFixed(1)},${pLy.toFixed(1)} ${pBx.toFixed(1)},${pBy.toFixed(1)} ${pRx.toFixed(1)},${pRy.toFixed(1)}" fill="${neonRed}0.85)" stroke="${neonRed}1)" stroke-width="0.3"/>`;
  gaugeSvg+=`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2" fill="#fff" stroke="${neonRed}1)" stroke-width="0.5"/>`;
  gaugeSvg+=`<circle cx="${cx}" cy="${cy}" r="3" fill="${neonRed}0.3)" stroke="${neonRed}0.5)" stroke-width="0.5"/>`;
  const dotCount=Math.max(3,Math.min(16,Math.round(windDisp/2)));
  for(let i=0;i<dotCount;i++){
    const ang=(wd-90+i*5-dotCount*2.5)*Math.PI/180;
    const dr=ri-1;
    const dx=cx+Math.cos(ang)*dr,dy=cy+Math.sin(ang)*dr;
    const opacity=0.2+0.6*(i/dotCount);
    const dotR=1+i*0.05;
    gaugeSvg+=`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${dotR.toFixed(1)}" fill="${neonRed}${opacity.toFixed(2)})"/>`;
  }

  el.innerHTML=`
    <div class="weather-hero">
      <div class="hero-compass-layout" onclick="cycleUnit('windUnit')">
        <div class="hero-side">
          <div class="hero-side-item" onclick="event.stopPropagation();cycleUnit('tempUnit')" style="cursor:pointer">
            <div style="font-size:1.6em;margin-bottom:2px">${animEmoji(c.weather_code,isDay,'1em')}</div>
            <div style="font-size:1.8em;font-weight:800;color:var(--text-primary);line-height:1">${fmtTempShort(tempC)}</div>
            <div style="font-size:0.65em;color:var(--text-secondary);margin-top:2px">${desc}</div>
          </div>
          <div class="hero-side-item" onclick="event.stopPropagation();cycleUnit('tempUnit')" style="cursor:pointer">
            <div class="hero-side-label">Feels Like</div>
            <div class="hero-side-val">${fmtTemp(feelsC)}</div>
          </div>
          <div class="hero-side-item">
            <div class="hero-side-label">Humidity</div>
            <div class="hero-side-val">${c.relative_humidity_2m}%</div>
          </div>
          <div class="hero-side-item">
            <div class="hero-side-label">☁️ Clouds</div>
            <div class="hero-side-val">${c.cloud_cover}%</div>
          </div>
        </div>
        <div class="wind-rose" style="cursor:pointer">
          <svg viewBox="-12 -12 124 124">
            ${gaugeSvg}
          </svg>
          <div class="wind-rose-labels"><span class="wr-n">N</span><span class="wr-s">S</span><span class="wr-e">E</span><span class="wr-w">W</span></div>
          <div class="wind-rose-center">
            <div class="wrc-speed">${windStr}</div>
            <div class="wrc-dir">${degToDir(wd)} ${wd}°</div>
            ${gustStr?`<div class="wrc-gust">${gustStr}</div>`:''}
          </div>
        </div>
        <div class="hero-side">
          <div class="hero-side-item" onclick="event.stopPropagation();cycleUnit('presUnit')" style="cursor:pointer">
            <div class="hero-side-label">Pressure</div>
            <div class="hero-side-val">${fmtPres(c.pressure_msl)}</div>
          </div>
          <div class="hero-side-item" onclick="event.stopPropagation();cycleUnit('precipUnit')" style="cursor:pointer">
            <div class="hero-side-label">Precip</div>
            <div class="hero-side-val">${fmtPrecip(c.precipitation||0)}</div>
          </div>
          <div class="hero-side-item" onclick="event.stopPropagation();cycleUnit('tempUnit')" style="cursor:pointer">
            <div class="hero-side-label">🌡️ Dew Pt</div>
            <div class="hero-side-val">${fmtTemp(dewC)}</div>
          </div>
          <div class="hero-side-item" onclick="event.stopPropagation();cycleUnit('tempUnit')" style="cursor:pointer">
            <div class="hero-side-label">Spread</div>
            <div class="hero-side-val">${fmtTemp(tempC-dewC)}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 0">
        ${(()=>{const bc={0:0,1:1,2:2,3:3};const bm={'☀️':0,'🌤️':1,'⛅':2,'🌥️':3,'☁️':3,'🌦️':51,'🌧️':61,'⛈️':95};const bc2=bm[baro.icon]!=null?bm[baro.icon]:3;return neonWx(bc2,true,28)})()}
        <span style="font-size:0.75em;font-weight:600;color:var(--text-secondary)">${baro.prediction}</span>
        <span class="baro-trend ${baro.trend}" style="font-size:0.6em;color:${baro.trend==='rising'?'var(--accent-green)':baro.trend==='falling'?'var(--accent-red)':'var(--text-muted)'};text-shadow:0 0 6px ${baro.trend==='rising'?'rgba(0,255,136,0.4)':baro.trend==='falling'?'rgba(255,51,85,0.4)':'none'}">${trendArrow} ${(()=>{const isI=S.presUnit===0;if(isI){const v=Math.abs(baro.trendMb/33.8639);return(baro.trendMb>=0?'+':'-')+(v<0.05?v.toFixed(3):v.toFixed(2))+' inHg'}return(baro.trendMb>=0?'+':'')+baro.trendMb.toFixed(1)+' mb'})()}</span>
      </div>
    </div>
    ${order.map(k=>sections[k]||'').join('')}`;
  setTimeout(initPrecipTaps,0);
}
function secBtns(key){return`<div class="sec-btns"><button onclick="moveSection('${key}',-1)" title="Move up">▲</button><button onclick="moveSection('${key}',1)" title="Move down">▼</button></div>`}
function getSecOrder(){try{const o=JSON.parse(localStorage.getItem('st_sec_order'));if(o&&o.length===2)return o}catch(e){}return['trends','forecast']}
function moveSection(key,dir){
  const order=getSecOrder();const i=order.indexOf(key);
  if(i<0)return;const ni=i+dir;
  if(ni<0||ni>=order.length)return;
  [order[i],order[ni]]=[order[ni],order[i]];
  try{localStorage.setItem('st_sec_order',JSON.stringify(order))}catch(e){}
  if(S.forecast)renderWeather(S.forecast);
}

function renderHourlyPrecip(h){
  if(!h||!h.precipitation)return'';
  const nowMs=Date.now();
  const si=h.time.findIndex(t=>new Date(t).getTime()>=nowMs);
  if(si<0)return'';
  const precips=h.precipitation.slice(si,si+24);
  const times=h.time.slice(si,si+24);
  if(precips.length<4)return'';
  const fmtHr=d=>{const hr=d.getHours(),ap=hr>=12?'PM':'AM';return(hr%12||12)+ap};
  const tLabels=[];
  const n=precips.length;
  const labelCount=5;
  for(let li=0;li<labelCount;li++){
    const idx=Math.round(li*(n-1)/(labelCount-1));
    const t=times[idx]?new Date(times[idx]):null;
    tLabels.push(t?fmtHr(t):'');
  }
  const rawMax=Math.max(...precips);
  const maxMm=rawMax<0.5?1:rawMax<2?2:rawMax<5?5:rawMax<10?10:rawMax<25?25:rawMax<50?50:Math.ceil(rawMax/10)*10;
  const isIn=S.precipUnit===0;
  const gridLines=4;
  let gridHtml='';
  for(let g=0;g<=gridLines;g++){
    const val=maxMm*(g/gridLines);
    const pct=(1-g/gridLines)*100;
    const label=isIn?(val/25.4).toFixed(val>5?1:2):val.toFixed(val<1?2:1);
    const unit=isIn?'in':'mm';
    gridHtml+=`<div class="precip-grid-line" style="top:${pct}%">${g>0?`<span>${label} ${unit}</span>`:''}</div>`;
  }
  const maxVal=isIn?(rawMax/25.4).toFixed(2)+' in':rawMax.toFixed(1)+' mm';
  return`<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div class="card-title" style="margin:0"><span class="icon">🌧️</span> 24h Precipitation</div>
      <div class="precip-max-label">Max: ${maxVal}/hr</div>
    </div>
    <div class="precip-chart-wrap">
      <div class="precip-chart-area">
        ${gridHtml}
        ${rawMax>0?(()=>{const mxi=precips.indexOf(rawMax);let mxL=mxi/precips.length*100;if(mxL>75)mxL=75;const mxB=Math.min(92,rawMax/maxMm*100+3);return`<div class="chart-marker hi" style="left:${mxL.toFixed(1)}%;bottom:${mxB.toFixed(1)}%">▲ ${maxVal}</div>`})():''}
        <div class="hourly-chart">${precips.map((p,i)=>{
          const ht=maxMm>0?Math.max(1,(p/maxMm)*100):1;
          const color=p>=5?'var(--accent-red)':p>=2?'var(--accent-orange)':p>=0.5?'var(--accent-blue)':'var(--bg-elevated)';
          return`<div class="hourly-bar" data-idx="${i}" style="height:${ht}%;background:${color}"><div class="bar-tip">${fmtPrecip(p)}</div></div>`;
        }).join('')}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.55em;color:var(--text-muted);margin-top:4px">${tLabels.map(l=>`<span>${l}</span>`).join('')}</div></div>`;
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

function getLast24(timeArr,valArr){
  const nowMs=Date.now();
  const all=timeArr.map((t,i)=>({t:new Date(t).getTime(),v:valArr[i],ts:t})).filter(p=>p.t<=nowMs);
  const cutoff=nowMs-24*3600000;
  const past=all.filter(p=>p.t>=cutoff);
  return past.length>=4?past:all.slice(-24);
}
function renderPressureTrend(h){
  if(!h||!h.pressure_msl||!h.time)return'';
  const nowMs=Date.now();
  const allPts=h.time.map((t,i)=>({t:new Date(t).getTime(),p:h.pressure_msl[i],ts:t}));
  const past3=allPts.filter(p=>p.t<=nowMs&&p.t>=nowMs-3*3600000);
  const futureStart=allPts.findIndex(p=>p.t>=nowMs);
  const future24=futureStart>=0?allPts.slice(futureStart,futureStart+24):[];
  if(past3.length<1&&future24.length<4)return'';
  const curP=S.weather?S.weather.pressure_msl:(past3.length?past3[past3.length-1].p:future24[0].p);
  const nowPt={t:nowMs,p:curP,ts:new Date().toISOString(),isNow:true};
  const combined=[];
  past3.forEach(p=>combined.push({...p,isPast:true}));
  if(!past3.length||past3[past3.length-1].t<nowMs-120000)combined.push(nowPt);
  future24.forEach(p=>combined.push({...p,isFuture:true}));
  if(combined.length<4)return'';
  const pastCount=combined.filter(p=>p.isPast||p.isNow).length;
  const pres=combined.map(p=>p.p);
  const times=combined.map(p=>p.ts);
  const fmtHr=d=>{const hr=d.getHours(),ap=hr>=12?'PM':'AM';return(hr%12||12)+ap};
  const tLabels=[];
  const labelCount=5;
  for(let li=0;li<labelCount;li++){
    const idx=Math.round(li*(combined.length-1)/(labelCount-1));
    if(combined[idx].isNow){tLabels.push('Now')}
    else{const t=new Date(combined[idx].ts);tLabels.push(fmtHr(t))}
  }
  const mn=Math.min(...pres),mx=Math.max(...pres);
  const range=mx-mn||1;
  const padMn=mn-range*0.1,padMx=mx+range*0.1,padRange=padMx-padMn||1;
  const isInHg=S.presUnit===0;
  const gridLines=4;
  let gridHtml='';
  for(let g=0;g<=gridLines;g++){
    const val=padMn+(padMx-padMn)*(1-g/gridLines);
    const pct=(g/gridLines)*100;
    const label=isInHg?(val/33.8639).toFixed(2)+' inHg':val.toFixed(1)+' mb';
    gridHtml+=`<div class="precip-grid-line" style="top:${pct}%">${g>0&&g<gridLines?`<span>${label}</span>`:''}</div>`;
  }
  const trendMb=S._baroTrendMb||0;
  const trendClass=S._baroTrend||'steady';
  const trendDir=trendClass==='rising'?'Rising':trendClass==='falling'?'Falling':'Steady';
  const trendCol=trendClass==='rising'?'var(--accent-green)':trendClass==='falling'?'var(--accent-red)':'var(--text-muted)';
  function fmtPresTrend(mb){
    if(isInHg){const v=Math.abs(mb/33.8639);return(mb>=0?'+':'-')+(v<0.05?v.toFixed(3):v.toFixed(2))+' inHg'}
    return(mb>=0?'+':'')+mb.toFixed(1)+' mb';
  }
  const hiIdx=pres.indexOf(mx),loIdx=pres.indexOf(mn);
  const hiLabel=isInHg?'▲ '+(mx/33.8639).toFixed(2):'▲ '+mx.toFixed(1);
  const loLabel=isInHg?'▼ '+(mn/33.8639).toFixed(2):'▼ '+mn.toFixed(1);
  let hiLeft=parseFloat((hiIdx/pres.length*100).toFixed(1));
  let loLeft=parseFloat((loIdx/pres.length*100).toFixed(1));
  let hiBot=parseFloat(((mx-padMn)/padRange*100+3).toFixed(1));
  let loBot=Math.max(0,parseFloat(((mn-padMn)/padRange*100-8).toFixed(1)));
  if(Math.abs(hiLeft-loLeft)<15&&Math.abs(hiBot-loBot)<15){
    if(hiLeft>50)hiLeft=Math.min(85,hiLeft+8);else loLeft=Math.max(0,loLeft-8);
    if(hiBot-loBot<12)loBot=Math.max(0,loBot-6);
  }
  if(hiLeft>75)hiLeft=75;if(loLeft>75)loLeft=75;
  const nowLinePos=pastCount>0?((pastCount-1)/(combined.length-1)*100).toFixed(1):0;
  return`<div class="card" style="margin-top:0">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="card-title" style="margin:0"><span class="icon">📊</span> Pressure Trend</div>
      <div style="font-size:0.7em;font-weight:600;color:${trendCol}">${trendDir} (${fmtPresTrend(trendMb)})</div>
    </div>
    <div class="precip-chart-wrap">
      <div class="precip-chart-area" style="position:relative">
        ${gridHtml}
        <div style="position:absolute;left:${nowLinePos}%;top:0;bottom:0;width:2px;background:var(--accent-cyan);opacity:0.6;z-index:5"></div>
        <div style="position:absolute;left:calc(${nowLinePos}% - 12px);top:-14px;font-size:0.5em;font-weight:700;color:var(--accent-cyan);z-index:6">NOW</div>
        <div class="chart-marker hi" style="left:${hiLeft}%;bottom:${hiBot}%">${hiLabel}</div>
        <div class="chart-marker lo" style="left:${loLeft}%;bottom:${loBot}%">${loLabel}</div>
        <div class="hourly-chart pres-chart">${combined.map((pt,i)=>{
          const ht=Math.max(2,((pt.p-padMn)/padRange)*100);
          const isPast=pt.isPast||pt.isNow;
          const col=isPast?'rgba(0,229,255,0.6)':'rgba(0,229,255,0.25)';
          const label=isInHg?(pt.p/33.8639).toFixed(2)+' inHg':pt.p.toFixed(1)+' mb';
          return`<div class="hourly-bar" data-idx="${i}" style="height:${ht}%;background:${col}"><div class="bar-tip">${label}${isPast?' (past)':' (fcst)'}</div></div>`;
        }).join('')}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.55em;color:var(--text-muted);margin-top:4px">${tLabels.map(l=>`<span>${l}</span>`).join('')}</div></div>`;
}

function renderDailyForecast(d){
  if(!d||!d.time)return'';
  return`<div class="card"><div class="card-title"><span class="icon">📊</span> 7-Day Forecast</div>
    <div class="forecast-scroll">${d.time.map((t,i)=>{
      const dt=new Date(t+'T12:00'),day=i===0?'Today':dt.toLocaleDateString('en',{weekday:'short'});
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
  const dayName=idx===0?'Today':dt.toLocaleDateString('en',{weekday:'long',month:'short',day:'numeric'});
  const hi=fmtTemp(d.temperature_2m_max[idx]),lo=fmtTemp(d.temperature_2m_min[idx]);
  const rain=d.precipitation_probability_max?d.precipitation_probability_max[idx]:0;
  const precip=d.precipitation_sum?d.precipitation_sum[idx]:0;
  const wind=d.wind_speed_10m_max?d.wind_speed_10m_max[idx]:0;
  const sunrise=d.sunrise?new Date(d.sunrise[idx]).toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'}):'—';
  const sunset=d.sunset?new Date(d.sunset[idx]).toLocaleTimeString('en',{hour:'numeric',minute:'2-digit'}):'—';
  const hiC=d.temperature_2m_max[idx],loC=d.temperature_2m_min[idx];
  const tempStr=fmtTemp(hiC)+' / '+fmtTemp(loC);
  const precipStr=fmtPrecip(precip);
  const windStr=fmtWind(wind);
  box.innerHTML=`<div class="forecast-detail">
    <div style="font-weight:700;margin-bottom:6px">${animEmoji(d.weather_code[idx],true,'1.2em')} ${dayName} — ${wmoDesc(d.weather_code[idx])}</div>
    <div class="fd-row"><span>🌡️ High / Low</span><span style="font-weight:600"><span style="color:var(--accent-red)">${fmtTemp(hiC)}</span> / <span style="color:var(--accent-cyan)">${fmtTemp(loC)}</span></span></div>
    <div class="fd-row"><span>💧 Rain Chance</span><span style="font-weight:600">${rain}%</span></div>
    <div class="fd-row"><span>🌧️ Precipitation</span><span style="font-weight:600">${precipStr}</span></div>
    <div class="fd-row"><span>💨 Max Wind</span><span style="font-weight:600">${windStr}</span></div>
    <div class="fd-row"><span>🌅 Sunrise</span><span style="font-weight:600">${sunrise}</span></div>
    <div class="fd-row"><span>🌇 Sunset</span><span style="font-weight:600">${sunset}</span></div>
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
      <div class="radar-time-label" id="radar-time">Loading...</div>
      <div class="map-controls">
        <div class="map-ctrl-btn" id="radar-scan" title="Re-center & scan">📍</div>
        <div class="map-ctrl-btn" id="radar-scan-view" title="Scan current view">🔍</div>
        <div class="map-ctrl-btn" id="radar-scan-hires" title="Hi-Res 15mi scan" style="font-size:0.5em;font-weight:700;line-height:1;color:var(--accent-cyan)">HiRes</div>
        <div class="map-ctrl-btn" id="radar-toggle-src" title="Toggle radar source" style="font-size:0.55em;font-weight:700;line-height:1">SRC</div>
        <div class="map-ctrl-btn" id="radar-toggle-units" title="Toggle mi/km" style="font-size:0.55em;font-weight:700;line-height:1">MI</div>
        <div class="map-ctrl-btn" id="radar-toggle-airports" title="Toggle airports" style="font-size:0.75em">✈️</div>
        <div class="map-ctrl-btn" id="radar-clear-cone" title="Clear track" style="font-size:0.7em;display:none" onclick="clearStormCone()">✕</div>
      </div>
      <div class="map-legend">
        <span>dBZ</span>
        <div class="legend-bar">
          <span style="background:#00ff00"></span><span style="background:#ffff00"></span>
          <span style="background:#ff8800"></span><span style="background:#ff0000"></span>
          <span style="background:#cc00cc"></span>
        </div>
        <span>Light → Extreme</span>
      </div>
      <div class="scan-overlay" id="scan-overlay">
        <div class="scan-countdown" id="scan-countdown"></div>
        <div class="scan-step" id="scan-step1"><div class="step-icon">1</div><span id="scan-step1-text">Gathering winds aloft...</span></div>
        <div class="scan-step" id="scan-step2"><div class="step-icon">2</div><span id="scan-step2-text">Scanning radar tiles...</span></div>
        <div class="scan-step" id="scan-step3"><div class="step-icon">3</div><span id="scan-step3-text">Plotting storm points...</span></div>
      </div>
    </div>
    <div id="radar-source-label" style="font-size:0.7em;color:var(--text-muted);text-align:center;margin-top:6px"></div>`;
  setTimeout(async()=>{
    if(S.map){S.map.remove();S.map=null}
    const map=L.map('radar-map',{zoomControl:false,attributionControl:false,maxZoom:11,maxBoundsViscosity:1.0,bounceAtZoomLimits:false,zoomSnap:0.5,zoomDelta:0.5}).setView([S.lat,S.lon],8);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:11}).addTo(map);
    S._rangeCircle=L.circle([S.lat,S.lon],{radius:S.scanRadius*1609.34,color:'#3b82f6',fillOpacity:0.05,weight:1,dashArray:'6 4'}).addTo(map);
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
    try{
      const rv=await fetch('https://api.rainviewer.com/public/weather-maps.json').then(r=>r.json());
      S.radarFrames=(rv.radar?.past||[]).concat(rv.radar?.nowcast||[]);
      if(S.radarFrames.length){
        const last=S.radarFrames[S.radarFrames.length-1];
        S._rvTilePath=last.path;
      }
    }catch(e){}
    showRadarLayer(map);
    document.getElementById('radar-scan').addEventListener('click',()=>{
      clearViewScanCircle();
      map.setView([S.lat,S.lon],8,{animate:true,duration:0.5});
      scanRadarForStorms();
    });
    document.getElementById('radar-scan-view').addEventListener('click',()=>{scanRadarForView()});
    document.getElementById('radar-scan-hires').addEventListener('click',()=>{scanRadarHiRes(map)});
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
    plotStormMarkers(map);
  },100);
}

function showRadarLayer(map){
  if(S.radarLayer){map.removeLayer(S.radarLayer);S.radarLayer=null}
  if(S.nexradLayer){map.removeLayer(S.nexradLayer);S.nexradLayer=null}
  const lbl=document.getElementById('radar-source-label');
  const btn=document.getElementById('radar-toggle-src');
  if(S.radarSource==='nexrad'){
    S.radarLayer=L.tileLayer(`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?t=${Date.now()}`,{opacity:0.7,maxZoom:11,maxNativeZoom:8}).addTo(map);
    if(btn){btn.textContent='NEX';btn.style.background='var(--accent-blue)'}
    if(lbl)lbl.textContent='NEXRAD (US) \u00B7 📍 Scan location \u00B7 🔍 Scan view';
    const t=new Date();
    const el=document.getElementById('radar-time');
    if(el)el.textContent=t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  }else{
    if(S.radarFrames.length){
      S.radarIdx=S.radarFrames.length-1;
      const frame=S.radarFrames[S.radarIdx];
      S.radarLayer=L.tileLayer(`https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/6/1_1.png`,{opacity:0.7,maxZoom:11,maxNativeZoom:7}).addTo(map);
      const t=new Date(frame.time*1000);
      const el=document.getElementById('radar-time');
      if(el)el.textContent=t.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    }
    if(btn){btn.textContent='RV';btn.style.background=''}
    if(lbl)lbl.textContent='RainViewer \u00B7 Updated every 10 min \u00B7 📍 Scan location \u00B7 🔍 Scan view';
  }
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
  S.storms=[];
  S.stormMarkers.forEach(m=>map.removeLayer(m));
  S.stormMarkers=[];
  renderStorms();
  showRadarLayer(map);
  scanRadarForStorms();
}

function showScanOverlay(skipIfNoMap){
  if(skipIfNoMap&&!S.map)return;
  const ov=document.getElementById('scan-overlay');if(!ov)return;
  ov.classList.add('show');
  ['scan-step1','scan-step2','scan-step3'].forEach(id=>{
    const el=document.getElementById(id);el.className='scan-step';
  });
  document.getElementById('scan-step1').classList.add('active');
  document.getElementById('scan-countdown').textContent='';
  let sec=5;
  document.getElementById('scan-countdown').textContent=sec+'s';
  if(window._scanCountdownTimer)clearInterval(window._scanCountdownTimer);
  window._scanCountdownTimer=setInterval(()=>{
    sec--;
    const el=document.getElementById('scan-countdown');
    if(el&&sec>0)el.textContent=sec+'s';
    else if(el)el.textContent='';
    if(sec<=0)clearInterval(window._scanCountdownTimer);
  },1000);
}
function scanStep(step,text){
  const prev=document.getElementById('scan-step'+(step-1));
  if(prev){prev.classList.remove('active');prev.classList.add('done');prev.querySelector('.step-icon').textContent='✓'}
  const cur=document.getElementById('scan-step'+step);
  if(cur){cur.classList.add('active');const sp=document.getElementById('scan-step'+step+'-text');if(sp&&text)sp.textContent=text}
  const cd=document.getElementById('scan-countdown');
  if(cd&&step>=2)cd.textContent='';
}
function hideScanOverlay(){
  const s3=document.getElementById('scan-step3');
  if(s3){s3.classList.remove('active');s3.classList.add('done');s3.querySelector('.step-icon').textContent='✓'}
  if(window._scanCountdownTimer)clearInterval(window._scanCountdownTimer);
  setTimeout(()=>{const ov=document.getElementById('scan-overlay');if(ov)ov.classList.remove('show')},600);
}

S._airportMarkers=[];
S._airportsVisible=false;
S._airportDataCache=null;

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
    const r=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,NWS_HDR);
    const pt=await r.json();
    const stUrl=pt.properties?.observationStations;
    if(!stUrl)throw new Error('No stations');
    const sr=await fetch(stUrl,NWS_HDR);
    const sd=await sr.json();
    const features=sd.features||[];
    const stations=features.slice(0,15).map(f=>({
      icao:f.properties.stationIdentifier,
      name:f.properties.name||'',
      lat:f.geometry.coordinates[1],
      lon:f.geometry.coordinates[0],
      dist:haversine(S.lat,S.lon,f.geometry.coordinates[1],f.geometry.coordinates[0]),
    }));
    S._airportDataCache=stations;
    plotAirportMarkers(map,stations);
  }catch(e){
    console.error('Airport fetch:',e);
    toast('Could not load airports');
    S._airportsVisible=false;
    btn.style.background='';btn.style.borderColor='';
  }
}

async function plotAirportMarkers(map,stations){
  clearAirportMarkers(map);
  for(const st of stations){
    try{
      const obsUrl=`https://api.weather.gov/stations/${st.icao}/observations/latest`;
      const or=await fetch(obsUrl,NWS_HDR);
      if(!or.ok)continue;
      const od=await or.json();
      const p=od.properties||{};
      const tc=p.temperature?.value;
      const wKmh=p.windSpeed?.value;
      const wDir=p.windDirection?.value;
      const visMi=p.visibility?.value!=null?(p.visibility.value/1609.34):null;
      const fltCat=getFltCat(visMi,{clouds:(p.cloudLayers||[]).map(l=>({amount:l.amount,base:l.base}))});
      const fltColor=fltCat==='VFR'?'#22c55e':fltCat==='MVFR'?'#3b82f6':fltCat==='IFR'?'#ef4444':'#d946ef';

      const icon=L.divIcon({
        className:'',
        html:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto">
          <div style="background:${fltColor};color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,0.6)">${st.icao}</div>
          <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid ${fltColor}"></div>
        </div>`,
        iconSize:[40,20],iconAnchor:[20,20]
      });

      const tempStr=tc!=null?fmtTemp(tc):'--';
      const windStr=wKmh!=null?(fmtWind(wKmh)+' '+(wDir!=null?degToDir(wDir):'VRB')):'Calm';
      const visStr=visMi!=null?fmtVis(visMi):'--';
      const skyStr=formatClouds({clouds:(p.cloudLayers||[]).map(l=>({amount:l.amount,base:l.base}))});

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
    }catch(e){}
  }
}

function clearAirportMarkers(map){
  S._airportMarkers.forEach(m=>{try{map.removeLayer(m)}catch(e){}});
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
  S._viewScanCircle=L.circle([lat,lng],{radius:radiusMi*1609.34,color:'#00e5ff',fillColor:'#00e5ff',fillOpacity:0.04,weight:1.5,dashArray:'8 4'}).addTo(map);
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

    const colorFn=nexradToDbz;
    const minDbz=30;
    const tilePromises=[];
    const savedLat=S.lat,savedLon=S.lon;
    S.lat=cLat;S.lon=cLng;
    for(let tx=minTX;tx<=maxTX;tx++){
      for(let ty=minTY;ty<=maxTY;ty++){
        const url=useNexrad
          ?`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tx}/${ty}.png`
          :`https://tilecache.rainviewer.com${S._rvTilePath}/256/${zoom}/${tx}/${ty}/6/1_1.png`;
        tilePromises.push(scanTileForPoints(url,tx,ty,zoom,colorFn,minDbz,radius));
      }
    }
    const tileResults=await Promise.all(tilePromises);
    const rawPoints=tileResults.flat();
    S.lat=savedLat;S.lon=savedLon;

    S.storms=spacingFilter(rawPoints).sort((a,b)=>a.distance-b.distance);
    S.scanTime=Date.now();S.lastScanMs=Date.now();
    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Plotting ${S.storms.length.toLocaleString()} storm points...`);
    await new Promise(r=>setTimeout(r,300));
    renderStorms();updateStormBadges();
    if(S.map){
      plotStormMarkers(S.map);
      showViewScanCircle(S.map,cLat,cLng,radius,S.storms.length);
    }
    hideScanOverlay();
    toast(`${S.storms.length.toLocaleString()} cells in ${radius} mi radius (${srcLabel})`);
    scheduleAutoScan();
  }catch(e){hideScanOverlay();toast('View scan failed: '+e.message);console.error('ViewScan error:',e)}
}

async function scanRadarHiRes(map,fromHome){
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

    const colorFn=nexradToDbz;
    const minDbz=20;
    const tilePromises=[];
    const savedLat=S.lat,savedLon=S.lon;
    S.lat=cLat;S.lon=cLng;
    for(let tx=minTX;tx<=maxTX;tx++){
      for(let ty=minTY;ty<=maxTY;ty++){
        const url=useNexrad
          ?`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${hiZoom}/${tx}/${ty}.png`
          :`https://tilecache.rainviewer.com${S._rvTilePath}/256/${hiZoom}/${tx}/${ty}/6/1_1.png`;
        tilePromises.push(scanTileForPoints(url,tx,ty,hiZoom,colorFn,minDbz,HIRES_RADIUS,1));
      }
    }
    const tileResults=await Promise.all(tilePromises);
    const rawPoints=tileResults.flat();
    S.lat=savedLat;S.lon=savedLon;

    S.storms=spacingFilter(rawPoints,true).sort((a,b)=>a.distance-b.distance);
    S.scanTime=Date.now();S.lastScanMs=Date.now();S._lastScanWasHiRes=true;
    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Hi-Res: ${S.storms.length.toLocaleString()} points in ${HIRES_RADIUS} mi`);
    await new Promise(r=>setTimeout(r,300));
    renderStorms();updateStormBadges();
    plotStormMarkers(map);
    showViewScanCircle(map,cLat,cLng,HIRES_RADIUS,S.storms.length);
    map.setView([cLat,cLng],11,{animate:true,duration:0.5});
    hideScanOverlay();
    toast(`Hi-Res: ${S.storms.length.toLocaleString()} cells in ${HIRES_RADIUS} mi (${srcLabel})`);
    scheduleAutoScan();
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
  clearStormCone();
  const mv=S.stormMovement;
  if(!mv||mv.speed<2)return;
  const range=Math.min(60,Math.max(storm.distance*1.5,20));
  const color=storm.dbz>=55?'#cc00cc':storm.dbz>=45?'#ef4444':storm.dbz>=40?'#f97316':storm.dbz>=35?'#eab308':storm.dbz>=25?'#22c55e':'#06b6d4';
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
  const btn=document.getElementById('radar-clear-cone');
  if(btn)btn.style.display='flex';
}
function clearStormCone(){
  if(S._activeCone&&S.map){S.map.removeLayer(S._activeCone);S._activeCone=null}
  const btn=document.getElementById('radar-clear-cone');
  if(btn)btn.style.display='none';
}
function zoomScale(map){
  const z=map.getZoom();
  return z>=10?1.4:z>=9?1.2:z>=8?1.0:z>=7?0.7:z>=6?0.45:z>=5?0.3:0.2;
}

function plotStormMarkers(map){
  S.stormMarkers.forEach(m=>map.removeLayer(m));S.stormMarkers=[];
  clearStormCone();
  const mv=S.stormMovement;
  const sc=zoomScale(map);
  S.storms.forEach(storm=>{
    const cat=stormCat(storm.dbz);
    const color=storm.dbz>=55?'#cc00cc':storm.dbz>=45?'#ef4444':storm.dbz>=40?'#f97316':storm.dbz>=35?'#eab308':storm.dbz>=25?'#22c55e':'#06b6d4';
    const r=Math.max(4,Math.round(Math.max(10,storm.dbz/4)*sc));
    const eta=calcStormETA(storm);
    const popupId='pop_'+Math.random().toString(36).slice(2,8);
    let mvHtml='';
    if(mv&&mv.speed>=2){
      const spdStr=S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph';
      const imp=impactLabel(eta?eta.impact:0);
      mvHtml=`<div style="font-size:0.75em;color:#8cf;margin-top:6px;padding-top:6px;border-top:1px solid #333">→ ${degToDir(mv.direction)} ${tStr('at')} ${spdStr}</div>`;
      if(eta&&eta.proximity){
        mvHtml+=`<div style="font-size:0.75em;color:#f97316;margin-top:2px;font-weight:700">⚠️ ${tStr('Overhead · Moving away')}</div>`;
        mvHtml+=`<div style="font-size:0.85em;font-weight:700;color:${imp.color};margin-top:2px">${eta.impact}% ${tStr(imp.text)}</div>`;
      }else if(eta&&eta.approaching&&eta.impact>0){
        const arrTime=eta.eta!=null?fmtArrivalTime(eta.eta):'--';
        const etaSec=eta.eta!=null?eta.eta*60:0;
        const targetMs=Date.now()+etaSec*1000;
        mvHtml+=`<div style="margin-top:4px;padding:4px 8px;background:rgba(0,0,0,0.3);border-radius:6px;border:1px solid ${imp.color}44">
          <div style="font-size:0.7em;color:#aaa">⏱ ${tStr('Countdown')}</div>
          <div style="font-size:1.1em;font-weight:700;color:${imp.color};font-family:monospace" class="popup-countdown" data-target="${Math.round(targetMs)}">${fmtCountdown(Math.round(etaSec))}</div>
          <div style="font-size:0.7em;color:#bbb;margin-top:2px">${tStr('Arrives')} ~${arrTime}</div>
        </div>`;
        mvHtml+=`<div style="font-size:0.85em;font-weight:700;color:${imp.color};margin-top:4px">${eta.impact}% ${tStr(imp.text)}</div>`;
      }else{
        mvHtml+=`<div style="font-size:0.7em;color:#6b7;margin-top:2px">${tStr('Nearby · Not approaching')}</div>`;
      }
    }
    const popupHtml=`<div style="text-align:center;font-family:system-ui;min-width:155px">
      <div style="font-size:1.3em;font-weight:700;color:${color}">${storm.dbz} dBZ</div>
      <div style="font-size:0.8em;margin:2px 0">${tStr(cat.label)}</div>
      <div style="font-size:0.7em;color:#aaa">${cat.rain||''}</div>
      <div style="font-size:0.8em;color:#ccc;margin-top:4px">${fmtStormDist(storm.distance)} ${degToDir(storm.bearing)}</div>
      ${mvHtml}
      <div style="font-size:0.65em;color:#777;margin-top:6px">${storm.lat.toFixed(3)}°, ${Math.abs(storm.lng).toFixed(3)}° · ${storm.pixels} returns</div>
    </div>`;
    const popupOpts={closeButton:false,className:'storm-popup'};
    const stormRef=storm;
    if(mv&&mv.speed>=2){
      const sz=Math.max(10,Math.round(Math.max(24,storm.dbz/2)*sc));
      const arrow=L.marker([storm.lat,storm.lng],{icon:L.divIcon({className:'storm-arrow-icon',html:stormArrowSvg(mv.direction,color,sz),iconSize:[sz,sz],iconAnchor:[sz/2,sz/2]})}).addTo(map);
      arrow.bindPopup(popupHtml,popupOpts);
      arrow.on('click',()=>showStormCone(map,stormRef));
      S.stormMarkers.push(arrow);
    }else{
      const marker=L.circleMarker([storm.lat,storm.lng],{radius:r,color:color,fillColor:color,fillOpacity:0.6,weight:2}).addTo(map);
      marker.bindPopup(popupHtml,popupOpts);
      marker.on('click',()=>showStormCone(map,stormRef));
      S.stormMarkers.push(marker);
    }
    if(eta&&eta.impact>=90){
      const ringSize=Math.max(36,storm.dbz/1.5);
      const ring=L.marker([storm.lat,storm.lng],{interactive:false,icon:L.divIcon({className:'',html:`<div class="storm-ring" style="width:${ringSize}px;height:${ringSize}px;border:3px solid ${color};box-shadow:0 0 8px ${color}"></div>`,iconSize:[ringSize,ringSize],iconAnchor:[ringSize/2,ringSize/2]})}).addTo(map);
      S.stormMarkers.push(ring);
    }
    if(storm.dbz>=40){
      const lightning=L.marker([storm.lat,storm.lng],{interactive:false,icon:L.divIcon({className:'storm-lightning-icon',html:`<div style="font-size:18px;text-shadow:0 0 6px #fff">⚡</div>`,iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map);
      S.stormMarkers.push(lightning);
    }
  });
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
  let o=8,w=0,h=0,bd=0,ct=0;
  const idats=[];
  while(o<v.byteLength){
    const len=v.getUint32(o);
    const t=String.fromCharCode(v.getUint8(o+4),v.getUint8(o+5),v.getUint8(o+6),v.getUint8(o+7));
    if(t==='IHDR'){w=v.getUint32(o+8);h=v.getUint32(o+12);bd=v.getUint8(o+16);ct=v.getUint8(o+17)}
    else if(t==='IDAT')idats.push(new Uint8Array(buf,o+8,len));
    else if(t==='IEND')break;
    o+=12+len;
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
  const rgba=new Uint8Array(w*h*4);
  const prev=new Uint8Array(stride);
  for(let y=0;y<h;y++){
    const fi=y*(stride+1);
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
    levels.forEach(l=>{
      const spd=c[l.sk],dir=c[l.dk];
      if(spd==null||dir==null)return;
      const spdKt=spd*1.944;
      const movDir=(dir+180)%360;
      const rad=movDir*Math.PI/180;
      tx+=Math.sin(rad)*spdKt*l.w;
      ty+=Math.cos(rad)*spdKt*l.w;
      tw+=l.w;
    });
    if(tw===0)return;
    const ax=tx/tw,ay=ty/tw;
    const spd=Math.sqrt(ax*ax+ay*ay);
    let dir=(Math.atan2(ax,ay)*180/Math.PI+360)%360;
    const spdMph=Math.round(spd*1.151*0.7);
    S.stormMovement={direction:Math.round(dir),speed:spdMph};
    console.log('Winds aloft → storm movement: '+Math.round(dir)+'° at '+spdMph+' mph');
  }catch(e){console.log('Winds aloft fetch failed:',e.message)}
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
function calcStormETA(storm){
  if(!S.stormMovement||S.stormMovement.speed<2)return{eta:null,impact:0,approaching:false};
  const movDir=S.stormMovement.direction;
  const baseWidthMi=Math.max(0,Math.min(3,(storm.dbz-20)/15));
  const widthAngle=storm.distance>0.5?Math.atan2(baseWidthMi,storm.distance)*180/Math.PI:15;
  const CONE_HALF=15+widthAngle;
  const bearingToUser=(storm.bearing+180)%360;
  const diff=Math.abs(((movDir-bearingToUser+180)%360)-180);
  const inCone=diff<=CONE_HALF;
  const closingSpeed=S.stormMovement.speed*Math.cos(Math.min(diff,60)*Math.PI/180);
  const proxRange=Math.max(1.5,baseWidthMi+0.5);
  if(!inCone||closingSpeed<=1){
    if(storm.distance<=proxRange){
      const proxPct=Math.round(Math.min(90,Math.max(0,(proxRange-storm.distance)/proxRange*60+storm.dbz/2.5)));
      return{eta:null,impact:proxPct,approaching:false,closingSpeed:0,proximity:true};
    }
    return{eta:null,impact:0,approaching:false};
  }
  if(storm.distance<=proxRange){
    const proxPct=Math.round(Math.min(95,Math.max(0,(proxRange-storm.distance)/proxRange*60+storm.dbz/2.5+20)));
    return{eta:null,impact:proxPct,approaching:false,closingSpeed:0,proximity:true};
  }
  const etaHrs=storm.distance/closingSpeed;
  const etaMin=Math.round(etaHrs*60*100)/100;
  const distScore=Math.max(0,1-storm.distance/80);
  const spdScore=Math.min(1,S.stormMovement.speed/20);
  const intScore=Math.min(1,(storm.dbz-15)/40);
  const widthScore=Math.min(1,baseWidthMi/3);
  const directMult=directImpactPct(diff);
  const baseScore=directMult*50+distScore*15+spdScore*8+intScore*15+widthScore*12;
  const closeBoost=storm.distance<20?Math.round((20-storm.distance)/20*25):0;
  let pct=Math.round(Math.min(100,baseScore+closeBoost));
  if(storm.distance<=5&&diff<=15)pct=Math.max(pct,92);
  else if(storm.distance<=10&&diff<=15)pct=Math.max(pct,82);
  else if(storm.distance<=20&&diff<=12)pct=Math.max(pct,72);
  if(storm.distance<=proxRange)pct=Math.max(pct,Math.round(75+(proxRange-storm.distance)/proxRange*20));
  return{eta:etaMin,impact:pct,approaching:pct>0,closingSpeed:Math.round(closingSpeed*100)/100,angleDiff:Math.round(diff)};
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
  if(!S.lat)return;
  if(!S._etaRescanInProgress)S._stormETAs={};
  clearViewScanCircle();
  const useNexrad=S.radarSource==='nexrad';
  showScanOverlay();
  await fetchWindsAloft();
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

    const colorFn=nexradToDbz;
    const minDbz=30;
    const tilePromises=[];
    for(let tx=minTX;tx<=maxTX;tx++){
      for(let ty=minTY;ty<=maxTY;ty++){
        const url=useNexrad
          ?`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/${zoom}/${tx}/${ty}.png`
          :`https://tilecache.rainviewer.com${S._rvTilePath}/256/${zoom}/${tx}/${ty}/6/1_1.png`;
        tilePromises.push(scanTileForPoints(url,tx,ty,zoom,colorFn,minDbz,S.scanRadius));
      }
    }
    const tileResults=await Promise.all(tilePromises);
    const rawPoints=tileResults.flat();

    S.storms=spacingFilter(rawPoints).sort((a,b)=>a.distance-b.distance);
    S.scanTime=Date.now();S.lastScanMs=Date.now();S._lastScanWasHiRes=false;

    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Plotting ${S.storms.length} storm points...`);
    await new Promise(r=>setTimeout(r,300));
    renderStorms();updateStormBadges();
    if(S.map)plotStormMarkers(S.map);
    hideScanOverlay();
    toast(`${S.storms.length} cell${S.storms.length!==1?'s':''} found (${srcLabel})`);
    scheduleAutoScan();
    const severeNearby=S.storms.some(s=>s.dbz>=50&&s.distance<=15);
    if(severeNearby&&S.map&&!S._autoHiResActive){
      S._autoHiResActive=true;
      toast('⚠️ Severe cell within 15 mi — launching Hi-Res scan...');
      setTimeout(async()=>{
        S.map.setView([S.lat,S.lon],11,{animate:true,duration:0.5});
        await scanRadarHiRes(S.map,true);
        S._autoHiResActive=false;
      },1500);
    }else if(!severeNearby){
      S._autoHiResActive=false;
    }
  }catch(e){hideScanOverlay();toast('Radar scan failed: '+e.message);console.error('Scan error:',e)}
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
    if(p.dbz>=35)return true;
    if(hiRes&&p.dbz>=20)return true;
    const radius=p.dbz>=30?5:8;
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
    const minSpacing=hiRes?(p.dbz>=45?0.3:p.dbz>=35?0.4:0.5):(p.dbz>=45?1.5:p.dbz>=35?2.0:3.0);
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
// STORMS DISPLAY
// ==========================================
function renderStorms(){
  const el=document.getElementById('page-storms');
  if(!S.lat){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📍</div><p>Set your location to scan for storms.</p></div>`;return}
  const storms=S.storms;
  if(!storms.length){
    el.innerHTML=`
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
        mvLine=`<div class="storm-detail tappable-unit" onclick="toggleStormUnits()"><div class="storm-detail-label">${tStr('Moving')}</div><div class="storm-detail-val">${degToDir(mv.direction)} ${spdStr}</div><div class="tile-tap">tap</div></div>`;
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
      const cellIcon=s.dbz>=65?'‼️':s.dbz>=56?'🚨':s.dbz>=45?'⚠️':s.dbz>=40?'🟡':s.dbz>=30?'🟢':'🔵';
      const cellName=s.dbz>=55?tStr('Severe Cell'):s.dbz>=40?tStr('Storm Cell'):tStr('Rain Cell');
      return`<div class="storm-cell-card ${pulse}" style="border-color:${hex};--pulse-color:${hex}">
        <div class="storm-header"><span style="font-weight:700">${cellIcon} ${cellName}</span><span class="storm-badge" style="background:${hex}22;color:${hex};border:1px solid ${hex}44">${tStr(cat.label)}</span></div>
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
  const approaching=stormsWithEta.filter(s=>isApproaching(s)).sort((a,b)=>{
    const ea=a._eta&&a._eta.eta!=null?a._eta.eta:99999;
    const eb=b._eta&&b._eta.eta!=null?b._eta.eta:99999;
    return ea-eb;
  });
  const overhead=stormsWithEta.filter(s=>isOverhead(s)).sort((a,b)=>a.distance-b.distance);
  const nearby=stormsWithEta.filter(s=>isNearby(s)).sort((a,b)=>b.dbz-a.dbz||a.distance-b.distance);
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
  const stormCount=approaching.length+overhead.length+nearby.length;
  el.innerHTML=`
    <div class="alert-banner ${severe?'danger':'warning'}">
      <span class="alert-icon">${severe?'🚨':'⚠️'}</span>
      <div class="alert-text"><span class="alert-title">${storms.length} Cell${storms.length>1?'s':''} Detected${stormCount?' · '+stormCount+' Storm'+(stormCount>1?'s':''):''}</span>${approaching.length?' · <span style="color:#ef4444">'+approaching.length+' approaching</span>':''}<br>Within ${S.radarMetric?(S.scanRadius*1.60934).toFixed(0)+' km':S.scanRadius+' mi'}${mv&&mv.speed>=2?' · Moving '+degToDir(mv.direction)+' at '+(S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph'):''}<br><span id="auto-scan-status" style="font-size:0.8em;color:var(--text-muted)"></span></div>
    </div>
    <div class="card"><div class="card-title"><span class="icon">🌪️</span> Active Storm Cells</div>
      ${groupHtml}
    </div>
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
// AWC API does NOT have CORS headers (blocked in browser)
// ==========================================
const NWS_HDR={headers:{'User-Agent':'StormTracker/1.50','Accept':'application/geo+json'}};

async function fetchStation(){
  const el=document.getElementById('page-station');showSkel(el,5);
  try{
    const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,NWS_HDR);
    if(!ptRes.ok)throw new Error('NWS points returned '+ptRes.status);
    const ptData=await ptRes.json();
    const stationsUrl=ptData.properties?.observationStations;
    if(!stationsUrl)throw new Error('No observation stations URL');
    const stRes=await fetch(stationsUrl,NWS_HDR);
    if(!stRes.ok)throw new Error('NWS stations returned '+stRes.status);
    const stData=await stRes.json();
    const features=stData.features||stData.observationStations||[];
    if(!features.length){el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>No weather stations found nearby.</p></div>`;return}
    S.nearbyStations=features.slice(0,10).map(f=>({
      icao:f.properties.stationIdentifier,
      name:f.properties.name||'',
      lat:f.geometry.coordinates[1],
      lon:f.geometry.coordinates[0],
      dist:haversine(S.lat,S.lon,f.geometry.coordinates[1],f.geometry.coordinates[0]),
    })).sort((a,b)=>a.dist-b.dist);
    await loadStationObs(S.nearbyStations[0].icao);
  }catch(e){
    console.error('Station fetch error:',e);
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>Station data unavailable.<br><span style="font-size:0.8em;color:var(--text-muted)">${e.message||''}</span></p></div>`;
  }
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
    el.innerHTML=`<div class="empty-state"><div class="empty-icon">📡</div><p>Could not load observations for ${icao}.</p></div>`;
  }
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
  const obLabel=s.obsTime?new Date(s.obsTime).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';

  const skyTxt=formatClouds(s);
  const wxDesc=s.wxString||skyTxt;
  const feelsLike=tempC!=null?calcFeelsLike(tempC,windKmh,rh):null;

  const homeIcao=S.nearbyStations?.length?S.nearbyStations[0].icao:null;
  const isHome=!homeIcao||S.stationId===homeIcao;

  el.innerHTML=`
    <div class="card" style="padding-bottom:8px">
      ${!isHome?`<div style="margin-bottom:8px"><button onclick="switchStation('${homeIcao}')" style="padding:4px 10px;background:rgba(0,229,255,0.1);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.3);border-radius:6px;font-size:0.75em;cursor:pointer;font-weight:600">← Back to ${homeIcao}</button></div>`:''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        ${stationNeonIcon(wxDesc,32)}
        <div style="flex:1">
          <div style="font-weight:700;font-size:0.95em">${S.stationId} — ${stationName}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:2px;flex-wrap:wrap">
            <span class="flt-cat flt-${fltCls}" style="font-size:0.7em;padding:1px 8px">${fltCat==='VFR'?'●':'◉'} ${fltCat}</span>
            <span style="font-size:0.65em;color:var(--text-muted)">${dist} mi away</span>
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
        <div style="cursor:pointer;text-align:left" onclick="cycleUnit('windUnit')">
          <div style="font-size:1.4em;font-weight:700">${windKmh!=null?fmtWind(windKmh):'Calm'}</div>
          <div style="font-size:0.8em;color:var(--text-muted)">${wDir!=null?degToDir(wDir)+' wind':'Calm'}</div>
          ${gustKmh?`<div style="font-size:0.8em;color:var(--accent-orange);font-weight:600">Gusts ${fmtWind(gustKmh)}</div>`:''}
          <div class="tile-tap" style="margin-top:2px">tap to change units</div>
        </div>
      </div>

      <div class="station-grid" style="grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:10px">
        <div class="station-tile" onclick="cycleUnit('tempUnit')" style="padding:10px">
          <div style="font-size:0.6em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Temperature</div>
          <div class="station-val" style="font-size:1.3em">${tempC!=null?fmtTemp(tempC):'--'}</div>
          ${feelsLike!=null&&Math.abs(feelsLike-tempC)>1?`<div style="font-size:0.65em;color:var(--text-muted)">Feels ${fmtTemp(feelsLike)}</div>`:''}
        </div>
        <div class="station-tile" onclick="cycleUnit('tempUnit')" style="padding:10px">
          <div style="font-size:0.6em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Dew Point</div>
          <div class="station-val" style="font-size:1.3em">${dpC!=null?fmtTemp(dpC):'--'}</div>
          <div style="font-size:0.65em;color:var(--text-muted)">${rh!=null?rh+'% RH':''}</div>
        </div>
      </div>

      <div class="station-grid" style="grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        <div class="station-tile" onclick="cycleUnit('presUnit')" style="padding:8px 6px">
          <div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Pressure</div>
          <div class="station-val" style="font-size:1em">${presMb!=null?fmtPres(presMb):'--'}</div>
          <div class="tile-tap">tap</div>
        </div>
        <div class="station-tile" onclick="cycleUnit('visUnit')" style="padding:8px 6px">
          <div style="font-size:0.55em;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Visibility</div>
          <div class="station-val" style="font-size:1em">${visSM!=null?fmtVis(visSM):'--'}</div>
          <div class="tile-tap">tap</div>
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

async function switchStation(icao){
  toast('Loading '+icao+'...');
  if(!S.nearbyStations||!S.nearbyStations.length){
    try{
      const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,NWS_HDR);
      const ptData=await ptRes.json();
      const stUrl=ptData.properties?.observationStations;
      if(stUrl){
        const stRes=await fetch(stUrl,NWS_HDR);
        const stData=await stRes.json();
        const features=stData.features||[];
        S.nearbyStations=features.slice(0,10).map(f=>({
          icao:f.properties.stationIdentifier,name:f.properties.name||'',
          lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],
          dist:haversine(S.lat,S.lon,f.geometry.coordinates[1],f.geometry.coordinates[0]),
        })).sort((a,b)=>a.dist-b.dist);
      }
    }catch(e){}
  }
  S.stationId=icao;
  await loadStationObs(icao);
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
    if(/^(VRB|\d{3})\d{2,3}(G\d{2,3})?KT$/.test(p)){
      const m=p.match(/^(VRB|\d{3})(\d{2,3})(G(\d{2,3}))?KT$/);
      if(m){
        const dir=m[1]==='VRB'?'Variable':m[1]+'°';
        const spd=parseInt(m[2]);const gust=m[4]?parseInt(m[4]):null;
        let wStr=`${dir} at ${spd} knots`;
        if(gust)wStr+=`, gusting ${gust} knots`;
        if(spd===0&&!gust)wStr='Calm';
        const sev=gust&&gust>=35?'color:var(--accent-red);font-weight:700':spd>=25?'color:var(--accent-orange)':'';
        rows.push(c(sev||'#22c55e','Wind',wStr,gust>=50?'⚠️ DANGEROUS':''));
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
  const alerts=S.alerts;
  if(!alerts.length){
    el.innerHTML=`<div class="alert-banner safe"><span class="alert-icon">✅</span><div class="alert-text"><span class="alert-title">No Active Alerts</span><br>No NWS warnings or watches for your area.</div></div>
      <div style="font-size:0.7em;color:var(--text-muted);text-align:center;padding:10px">NWS alerts cover US locations only.</div>`;
    return;
  }
  const now=Date.now();
  S.alerts=alerts.filter(a=>{const e=a.properties?.expires;return !e||new Date(e).getTime()>now});
  updateAlertBadge();
  if(!S.alerts.length){
    el.innerHTML=`<div class="alert-banner safe"><span class="alert-icon">✅</span><div class="alert-text"><span class="alert-title">No Active Alerts</span><br>No NWS warnings or watches for your area.</div></div>
      <div style="font-size:0.7em;color:var(--text-muted);text-align:center;padding:10px">NWS alerts cover US locations only.</div>`;
    return;
  }
  el.innerHTML=`<div class="card"><div class="card-title"><span class="icon">⚠️</span> NWS Alerts (${S.alerts.length})</div>
    ${S.alerts.map((a,i)=>{
      const p=a.properties||{};const event=p.event||'Alert';const sev=(p.severity||'').toLowerCase();
      const cls=(sev==='extreme'||sev==='severe')?'':sev==='moderate'?'watch':'advisory';
      const desc=(p.description||'').replace(/\n/g,'<br>');
      const sevIcon=sev==='extreme'?'🔴':sev==='severe'?'🟠':sev==='moderate'?'🟡':'🔵';
      return`<div class="nws-alert ${cls}"><div class="nws-alert-title">${sevIcon} ${event}</div><div class="nws-alert-detail" style="white-space:pre-wrap;word-break:break-word">${desc}</div>${p.expires?`<div class="nws-alert-expires">⏱️ <span id="alert-cd-${i}" data-exp="${new Date(p.expires).getTime()}"></span></div>`:''}</div>`;
    }).join('')}</div>`;
  startAlertCountdowns();
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
// INIT — always show welcome, explicit consent
// ==========================================
function init(){
  loadUnits();
  try{
    const saved=JSON.parse(localStorage.getItem('st_loc'));
    if(saved&&saved.lat&&saved.lon){setLoc(saved.lat,saved.lon,saved.name);return}
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
  document.getElementById('btn-lang').textContent=flag?flag.f:'🌐';
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

const _stormVocab=['Storm Cell','Live Radar','Peak dBZ','Rain Rate','Distance','Bearing','Moving','Status','Impact','ETA','Countdown','Arrives','Overhead · Moving away','Nearby · Not approaching','at','Extreme — Hail/Tornado','Intense — Hail Likely','Very Heavy Rain','Heavy Rain','Moderate Rain','Light Rain','Drizzle/Mist','No Impact — Nearby','Low Risk','Moderate Risk','Elevated Risk','High Risk','Extreme Risk','returns','Light','Extreme','Temp','Dew Pt','Humidity','Baro','Vis','Sky','tap to change units','tap','Updated','mi away','Gusts','Nearby Stations','Loading','Light Precipitation'];
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

(function initLang(){
  const flag=LANGS.find(l=>l.c===_curLang);
  if(flag&&_curLang!=='en')document.getElementById('btn-lang').textContent=flag.f;
  startTranslateObserver();
  if(_curLang!=='en'){
    preseedStormVocab(_curLang);
    setTimeout(()=>translatePage(_curLang),2000);
  }
})();