// StormTracker — Icon Pack System, Custom Icons, WMO Mapping

const _ICON_PACKS={
  basmilius:{name:'Animated',desc:'Basmilius animated SVG'},
  emoji:{name:'Emoji',desc:'Native emoji icons'},
  'flat-filled':{name:'Flat Filled',desc:'Colorful flat icons'},
  'flat-outline':{name:'Flat Outline',desc:'Outlined flat icons'},
  glossy:{name:'Glossy 3D',desc:'Shiny 3D icons (16 conditions — others use emoji fallback)'},
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
  return hasCssUnit?`<img src="${url}" style="width:${cssSize};height:${cssSize};display:inline-block;vertical-align:middle" alt="${cond}" loading="lazy">`:`<img src="${url}" width="${numSize}" height="${numSize}" alt="${cond}" class="inline-icon" loading="lazy">`;
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
  'globe-animated':['clear-day','clear-night','partly-cloudy-day','partly-cloudy-day-snow','overcast','overcast-dark','cloud-light','cloud-small','few-clouds-day-rain','few-clouds-day-snow','rain','rain-heavy','mostly-cloudy-day-rain','mostly-cloudy-day-rain-heavy','mostly-cloudy-night','mostly-cloudy-night-rain','mostly-cloudy-night-rain-heavy','mostly-cloudy-night-snow','thunderstorm','thunderstorm-rain','thunderstorm-lightning','thunderstorm-night','snow','snow-night','blizzard','fog','haze','tornado','wind','wind-chill','hurricane','heat','ice','dust-storm','fire','flood','air-quality','avalanche','rip-current','small-craft','special-weather','storm-surge','tsunami']
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
  if(pack==='basmilius'){const bm=_condToBasmilius(cond);return hasCssUnit?`<img src="${BMCDN}${bm}.svg" style="width:${cssSize};height:${cssSize};display:inline-block;vertical-align:middle" alt="" loading="lazy">`:`<img src="${BMCDN}${bm}.svg" width="${numSize}" height="${numSize}" alt="" class="inline-icon" loading="lazy">`}
  const _VIDEO_PACKS=['globe-animated'];
  if(_VIDEO_PACKS.includes(pack)){
    const best=_findBestPackIcon(pack,cond);
    if(best){
      const vidSrc=`icons/${pack}/${best}.mp4`;
      const fallbackSrc=`icons/globe/${best}.png`;
      const sizeStyle=hasCssUnit?`width:${cssSize};height:${cssSize}`:`width:${numSize}px;height:${numSize}px`;
      return`<video autoplay loop muted playsinline style="${sizeStyle};display:inline-block;vertical-align:middle;object-fit:cover;border-radius:50%" src="${vidSrc}" poster="${fallbackSrc}" onerror="this.outerHTML='<img src=&quot;${fallbackSrc}&quot; style=&quot;${sizeStyle};display:inline-block;vertical-align:middle&quot; alt=&quot;${cond}&quot;>'"></video>`;
    }
    return getWeatherIcon(cond,sz,'globe');
  }
  const best=_findBestPackIcon(pack,cond);
  const src=best?`icons/${pack}/${best}.png`:`${BMCDN}${_condToBasmilius(cond)}.svg`;
  return hasCssUnit?`<img src="${src}" style="width:${cssSize};height:${cssSize};display:inline-block;vertical-align:middle" alt="${cond}" loading="lazy">`:`<img src="${src}" width="${numSize}" height="${numSize}" alt="${cond}" class="inline-icon" loading="lazy">`;
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
  return`<img src="${BMCDN}${name}.svg" width="${s}" height="${s}" alt="" class="inline-icon" loading="lazy">`;
}
function nwsDescToCond(desc,isDay){
  if(!desc)return null;
  const sh=desc.toLowerCase();
  const map=[['thunderstorm',isDay?'thunderstorm':'thunderstorm-night'],['thunder',isDay?'thunderstorm':'thunderstorm-night'],['blizzard','blizzard'],['freezing rain','sleet'],['sleet','sleet'],['ice pellet','sleet'],['heavy snow','blizzard'],['snow shower',isDay?'partly-cloudy-day-snow':'mostly-cloudy-night-snow'],['snow','snow'],['heavy rain','rain-heavy'],['rain shower',isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain'],['showers',isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain'],['drizzle',isDay?'few-clouds-day-rain':'mostly-cloudy-night-rain'],['rain','rain'],['fog','fog'],['haze','haze'],['smoke','haze'],['dust','haze'],['mostly sunny','few-clouds-day'],['mostly clear',isDay?'few-clouds-day':'few-clouds-night'],['partly sunny','partly-cloudy-day'],['partly cloudy',isDay?'partly-cloudy-day':'partly-cloudy-night'],['mostly cloudy',isDay?'overcast':'mostly-cloudy-night'],['sunny','clear-day'],['cloudy',isDay?'overcast':'overcast-dark'],['overcast',isDay?'overcast':'overcast-dark'],['clear',isDay?'clear-day':'clear-night'],['windy','wind'],['breezy','wind'],['hot','clear-day'],['cold','snow']];
  for(const[k,c]of map){if(sh.includes(k))return c}
  return null;
}
function neonWx(code,isDay,sz){
  const cond=wmoToCondition(code,isDay);
  return getWeatherIcon(cond,parseInt(sz)||32);
}
function animEmoji(code,isDay,size,nwsDesc){
  const px=typeof size==='string'&&size.endsWith('px')?parseInt(size):size==='1.2em'?38:size==='1em'?30:parseInt(size)||28;
  if(nwsDesc){const nc=nwsDescToCond(nwsDesc,isDay);if(nc)return getWeatherIcon(nc,px)}
  return neonWx(code,isDay,px);
}
function _metarHasWxCodes(raw){if(!raw)return false;const parts=raw.split(/\s+/);for(const p of parts){if(p.match(/^[-+]?(VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?(RA|SN|DZ|GR|GS|PL|IC|PE|SG|UP|FG|BR|HZ|FU|SA|DU|VA|PO|SQ|FC|SS|DS)+$/))return true}return false}
function _validateWxString(wxStr,rawMetar){if(!wxStr)return wxStr;if(rawMetar&&_metarHasWxCodes(rawMetar))return wxStr;if(/rain|snow|drizzle|thunder|storm|fog|mist|haze|sleet|hail|freezing|shower|precip/i.test(wxStr))return '';return wxStr}
function wmoDesc(code){const m={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',56:'Freezing drizzle',57:'Dense freezing drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',66:'Freezing rain',67:'Heavy freezing rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Mod rain showers',82:'Violent rain showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'T-storm w/ hail',99:'T-storm w/ heavy hail'};return m[code]||'Unknown'}