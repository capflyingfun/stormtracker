// ==========================================
// WEATHER (Open-Meteo)
// ==========================================
let _lightningFlashState=null;

// Blend two Open-Meteo model responses into one.
// gfs = GFS (global baseline, what NWS uses)
// hrrr = HRRR (high-res CONUS, hourly updates) — may be null outside US
// For precipitation: take the max (more conservative — HRRR tends to underestimate).
// For all other numeric arrays: simple average where both have valid data.
function _blendOMModels(gfs,hrrr){
  if(!gfs&&!hrrr)return null;
  if(!gfs)return hrrr;
  if(!hrrr)return gfs;
  // Deep copy GFS as the base structure
  const out=JSON.parse(JSON.stringify(gfs));
  out._modelBlend='GFS+HRRR';

  // --- Current ---
  const curAvg=['temperature_2m','apparent_temperature','precipitation',
    'relative_humidity_2m','cloud_cover','pressure_msl',
    'wind_speed_10m','wind_gusts_10m','wind_direction_10m'];
  curAvg.forEach(v=>{
    if(gfs.current?.[v]!=null&&hrrr.current?.[v]!=null)
      out.current[v]=+(((gfs.current[v]+hrrr.current[v])/2).toFixed(4));
  });
  // Precip: max for safety
  if(gfs.current?.precipitation!=null&&hrrr.current?.precipitation!=null)
    out.current.precipitation=Math.max(gfs.current.precipitation,hrrr.current.precipitation);

  // --- Hourly ---
  const hrAvg=['temperature_2m','apparent_temperature','relative_humidity_2m',
    'dew_point_2m','weather_code','wind_speed_10m','wind_gusts_10m',
    'wind_direction_10m','pressure_msl','cloud_cover','visibility',
    'cape','lifted_index','convective_inhibition','uv_index','freezing_level_height'];
  const gLen=gfs.hourly?.time?.length||0;
  const hLen=hrrr.hourly?.time?.length||0;
  hrAvg.forEach(v=>{
    const ga=gfs.hourly?.[v],ha=hrrr.hourly?.[v];
    if(!ga&&!ha)return;
    if(!ha){out.hourly[v]=ga;return;}
    if(!ga){out.hourly[v]=ha;return;}
    out.hourly[v]=ga.map((g,i)=>{
      const h=ha[i];
      if(g==null&&h==null)return null;
      if(g==null)return h;
      if(h==null)return g;
      return +((g+h)/2).toFixed(4);
    });
  });
  // Hourly precip: max
  if(gfs.hourly?.precipitation&&hrrr.hourly?.precipitation){
    out.hourly.precipitation=gfs.hourly.precipitation.map((g,i)=>{
      const h=hrrr.hourly.precipitation[i];
      return Math.max(g??0,h??0);
    });
  }

  // --- Daily ---
  const dayAvg=['temperature_2m_max','temperature_2m_min','wind_speed_10m_max'];
  dayAvg.forEach(v=>{
    const ga=gfs.daily?.[v],ha=hrrr.daily?.[v];
    if(!ga||!ha){out.daily[v]=ga||ha;return;}
    out.daily[v]=ga.map((g,i)=>{
      const h=ha[i];
      if(g==null&&h==null)return null;
      if(g==null)return h;
      if(h==null)return g;
      return +((g+h)/2).toFixed(4);
    });
  });
  // Daily precip sum: max
  if(gfs.daily?.precipitation_sum&&hrrr.daily?.precipitation_sum){
    out.daily.precipitation_sum=gfs.daily.precipitation_sum.map((g,i)=>{
      const h=hrrr.daily.precipitation_sum[i];
      return Math.max(g??0,h??0);
    });
  }
  // Daily precip probability: max
  if(gfs.daily?.precipitation_probability_max&&hrrr.daily?.precipitation_probability_max){
    out.daily.precipitation_probability_max=gfs.daily.precipitation_probability_max.map((g,i)=>{
      const h=hrrr.daily.precipitation_probability_max[i];
      return Math.max(g??0,h??0);
    });
  }

  return out;
}
async function _fetchOMModels(omBase,isUS){
  const _getJSON=url=>fetch(url,{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
  const [_gfsRes,_hrrrRes]=await Promise.allSettled([
    _getJSON(omBase+'&models=gfs_seamless'),
    isUS?_getJSON(omBase+'&models=hrrr_conus'):Promise.resolve(null)
  ]);
  const g=_gfsRes.status==='fulfilled'?_gfsRes.value:null;
  const h=_hrrrRes.status==='fulfilled'?_hrrrRes.value:null;
  return{gfs:g,hrrr:h,blended:_blendOMModels(g,h)||g||h};
}
async function fetchWeather(){
  const reqId=S._locReqId;
  const el=document.getElementById('page-weather');
  if(_isOffline&&S._lastWeatherData){renderWeather(S._lastWeatherData);return}
  showSkel(el,6);
  if(typeof _bootStep==='function')_bootStep('wx','Fetching weather…');
  try{
    const _omBase=`https://api.open-meteo.com/v1/forecast?latitude=${S.lat}&longitude=${S.lon}`
      +`&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day`
      +`&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility,is_day,cape,lifted_index,convective_inhibition,uv_index,freezing_level_height`
      +`&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max`
      +`&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto&forecast_days=7&past_days=2`;
    const _isUSLoc=isUSLocation(S.lat,S.lon);
    let _om=await _fetchOMModels(_omBase,_isUSLoc);
    if(!_om.blended){
      console.log('OM models: first attempt failed — retrying in 3s...');
      if(reqId!==S._locReqId)return;
      await new Promise(r=>setTimeout(r,3000));
      if(reqId!==S._locReqId)return;
      _om=await _fetchOMModels(_omBase,_isUSLoc);
      if(!_om.blended){
        console.log('OM models: second attempt failed — retrying in 5s...');
        if(reqId!==S._locReqId)return;
        await new Promise(r=>setTimeout(r,5000));
        if(reqId!==S._locReqId)return;
        _om=await _fetchOMModels(_omBase,_isUSLoc);
        if(!_om.blended)throw new Error('All model fetches failed (after 2 retries)');
        console.log('OM models: retry 2 succeeded');
      } else { console.log('OM models: retry 1 succeeded'); }
    }
    const _gfsData=_om.gfs,_hrrrData=_om.hrrr;
    const omData=_om.blended;
    console.log('OM models: '+(_gfsData?'GFS✓':'GFS✗')+' '+(_hrrrData?'HRRR✓':'HRRR✗')+(_isUSLoc?'':' (non-US, HRRR skipped)'));
    if(reqId!==S._locReqId)return;
    S.forecast=omData;
    try{
      const isUS=isUSLocation(S.lat,S.lon);
      const fetches=[fetchAWCNearest()];
      if(isUS)fetches.push(fetchNWSCurrent(),fetchNWSForecast());
      else console.log('[non-US] Skipped: NWS current obs, NWS forecast (AWC METAR: reduced timeout/retry)');
      const results=await Promise.allSettled(fetches);
      const awcCur=results[0].status==='fulfilled'?results[0].value:null;
      if(!isUS&&!awcCur)console.log('[non-US] AWC METAR: no nearby station found');
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
      const _hasPrecipWx=blend.wxString&&/rain|snow|drizzle|thunder|storm|fog|mist|haze|sleet|hail|freezing|shower/i.test(blend.wxString);
      if(_hasPrecipWx) omData.current._nwsDesc=blend.wxString;
      omData.current._nwsStation=blend.station||null;
      if(blend.cloudPct!=null){
        const _omCC=omData.current.cloud_cover;
        omData.current.cloud_cover=blend.cloudPct;
        omData.current._cloudSrc='METAR';
        console.log('Cloud cover from METAR: '+_omCC+'% → '+blend.cloudPct+'% ('+blend.station+')');
      }
      const _modelTag=omData._modelBlend?` [${omData._modelBlend}]`:'';
      omData.current._source=blend.sourceLabel+_modelTag;
      omData.current._sourceCount=sources.length;
      console.log('Weather blend: '+sources.map(s=>s.src).join(' + ')+' → '+blend.sourceLabel+_modelTag);
      if(nwsFc&&nwsFc.length){
        omData._nwsForecast=nwsFc;
        console.log('Weather: NWS forecast loaded ('+nwsFc.length+' periods)');
      }
    }catch(e){console.log('Multi-source blend failed:',e.message)}
    if(reqId!==S._locReqId)return;
    if(omData.current._cloudSrc!=='METAR'&&omData.hourly&&omData.hourly.cloud_cover&&omData.hourly.time){
      const _cTime=omData.current.time;
      if(!_cTime) console.log('Cloud sync skipped: no current.time');
      const _nowISO=(_cTime||'').slice(0,13);
      const _hrIdx=omData.hourly.time.findIndex(t=>t&&t.startsWith(_nowISO));
      if(_hrIdx>=0){
        const _hrCC=omData.hourly.cloud_cover[_hrIdx];
        const _prevCC=omData.current.cloud_cover;
        if(_hrCC!==_prevCC){
          console.log('Cloud cover synced to hourly NOW: '+_prevCC+'% → '+_hrCC+'%');
          omData.current.cloud_cover=_hrCC;
        }
      }
    }
    const _finalCC=omData.current.cloud_cover;
    if(!omData.current._nwsDesc){
      omData.current._nwsDesc=cloudCategory(_finalCC);
    }
    S.weather=omData.current;S._lastWeatherFetch=Date.now();S._lastWeatherData=omData;_resetMinMax();renderWeather(omData);if(typeof updateThreatTicker==='function')updateThreatTicker();if(_curLang!=='en')setTimeout(quickTranslate,300);setTimeout(checkWeatherThresholds,500);if(typeof V3D!=='undefined'&&V3D.active&&typeof refreshSky3D==='function')refreshSky3D();
    if(typeof _bootStepDone==='function')_bootStepDone('wx','Weather data received');
  }catch(e){
    if(reqId!==S._locReqId)return;
    if(typeof hideLoadingScreen==='function')hideLoadingScreen();
    if(typeof _bootStepFail==='function')_bootStepFail('wx','Weather fetch failed');
    if(_isOffline&&S._lastWeatherData){
      renderWeather(S._lastWeatherData);
    } else {
      el.innerHTML=`<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load weather data.</p><button onclick="fetchWeather()" style="margin-top:8px;padding:6px 18px;border-radius:8px;background:var(--accent-blue,#3b82f6);color:#fff;border:none;cursor:pointer;font-size:0.85em">Retry</button></div>`;
    }
  }
}
async function _fetchAWCOnce(){
  const _isUS=isNWSCoverage(S.lat,S.lon);
  const _bboxLevels=_isUS?[1.0,2.0,3.5]:[1.5,3.0];
  const _timeout=_isUS?8000:4000;
  let data=[];
  for(const deg of _bboxLevels){
    const url=`https://aviationweather.gov/api/data/metar?ids=&format=json&taf=false&hours=3&bbox=${(S.lat-deg).toFixed(2)},${(S.lon-deg).toFixed(2)},${(S.lat+deg).toFixed(2)},${(S.lon+deg).toFixed(2)}`;
    console.log('AWC fetch (±'+deg+'°):',url);
    const r=await fetch(url,{signal:AbortSignal.timeout(_timeout)});
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
  const _cloudPct=_metarCloudPct(nearest);
  if(_cloudPct!=null)console.log('AWC cloud cover:',_cloudPct+'% from',_metarCloudSummary(nearest));
  return{
    icao:nearest.icaoId,temp:nearest.temp,dewp:nearest.dewp,
    windKmh:nearest.wspd!=null?nearest.wspd*1.852:null,
    windDir:nearest.wdir!=null&&nearest.wdir!=='VRB'?Number(nearest.wdir):null,
    gustKmh:nearest.wgst!=null?nearest.wgst*1.852:null,
    presPa:nearest.altim!=null?nearest.altim*100:null,
    visMeter:nearest.visib!=null?(String(nearest.visib).includes('+')?16093:Number(nearest.visib)>100?Number(nearest.visib):Number(nearest.visib)*1609.34):null,
    wxString:nearest.wxString||'',cloudPct:_cloudPct,dist:nearest._dist
  };
}
function _metarCloudPct(m){
  const layers=m.clouds||(m.cldCvg1?[{cover:m.cldCvg1},{cover:m.cldCvg2},{cover:m.cldCvg3}]:null);
  if(!layers||!layers.length)return null;
  const map={SKC:0,CLR:0,NCD:0,NSC:0,CAVOK:0,FEW:18,SCT:44,BKN:75,OVC:100,VV:100};
  let max=null;
  for(const l of layers){
    const code=(l&&(l.cover||l.coverage||l))||'';
    const v=map[String(code).toUpperCase()];
    if(v!=null&&(max==null||v>max))max=v;
  }
  return max;
}
function _metarCloudSummary(m){
  const layers=m.clouds||[];
  return layers.map(l=>(l.cover||'')+(l.base!=null?l.base:'')).join(' ')||'(no layers)';
}
function _heroBandFromZone(zone){
  if(!zone||!zone.length)return null;
  const z=zone[0];
  const dbz=z.maxDbz!=null?z.maxDbz:(z.cls==='trace'?0:z.min);
  if(dbz<5)return null;
  return Object.assign({},dbzColor(dbz),{maxDbz:dbz});
}
function refreshHeroFromZone(){
  if(!S._lastWeatherData)return;
  const _zone=typeof checkUserInZone==='function'?checkUserInZone():null;
  const _ov=_heroBandFromZone(_zone);
  if(_ov&&S._lastZoneOv===_ov.cls)return;
  if(!_ov&&S._lastZoneOv==null)return;
  S._lastZoneOv=_ov?_ov.cls:null;
  try{renderWeather(S._lastWeatherData)}catch(e){console.log('hero refresh failed:',e.message)}
}
async function fetchAWCNearest(){
  try{
    const r=await _fetchAWCOnce();
    if(r)return r;
    if(!isNWSCoverage(S.lat,S.lon)){console.log('AWC: no nearby station (non-US, skipping retry)');return null}
    console.log('AWC retry in 2s...');
    await new Promise(ok=>setTimeout(ok,2000));
    return await _fetchAWCOnce();
  }catch(e){
    if(!isNWSCoverage(S.lat,S.lon)){console.log('AWC nearest failed (non-US, skipping retry):',e.message);return null}
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
    cloudPct:first('cloudPct'),
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
      visMeter:p.visibility?.value,wxString:_validateWxString(p.textDescription||'',p.rawMessage||''),
      feelsC:p.windChill?.value??p.heatIndex?.value??null,
      station:icao
    };
  }catch(e){return null}
}
async function _nwsForecastOnce(ptTimeout,fcTimeout){
  const ptRes=await fetch(`https://api.weather.gov/points/${S.lat.toFixed(4)},${S.lon.toFixed(4)}`,{...NWS_HDR,signal:AbortSignal.timeout(ptTimeout)});
  if(!ptRes.ok)return null;
  const pt=await ptRes.json();
  const fcUrl=pt.properties?.forecast;
  if(!fcUrl)return null;
  const fcRes=await fetch(fcUrl,{...NWS_HDR,signal:AbortSignal.timeout(fcTimeout)});
  if(!fcRes.ok)return null;
  const fc=await fcRes.json();
  return(fc.properties?.periods||[]).slice(0,14).map(p=>{
    const apiPop=p.probabilityOfPrecipitation?.value;
    const m=(p.detailedForecast||'').match(/[Cc]hance of precipitation is\s+(\d+)\s*%/);
    const textPop=m?Number(m[1]):null;
    return{
      name:p.name,temp:p.temperature,unit:p.temperatureUnit,
      wind:p.windSpeed,windDir:p.windDirection,
      short:p.shortForecast,detail:p.detailedForecast,
      precip:textPop!=null?textPop:(apiPop||0),
      isDaytime:p.isDaytime,icon:p.icon
    };
  });
}
async function fetchNWSForecast(){
  try{
    const r=await _nwsForecastOnce(7000,8000);
    if(r&&r.length)return r;
  }catch(e){console.log('NWS forecast: first attempt failed, retrying...',e.message)}
  try{
    await new Promise(r=>setTimeout(r,1500));
    const r=await _nwsForecastOnce(9000,10000);
    if(r&&r.length)return r;
  }catch(e){console.log('NWS forecast: retry failed',e.message)}
  return null;
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
  if(typeof hideLoadingScreen==='function')hideLoadingScreen();
  if(typeof checkFirstLaunch==='function')setTimeout(checkFirstLaunch,1500);
  if(typeof initDesktopMode==='function'&&window.innerWidth>=1024)setTimeout(initDesktopMode,200);
  const el=document.getElementById('page-weather');
  const c=data.current,isDay=c.is_day===1;
  const tempC=c.temperature_2m,feelsC=c.apparent_temperature;
  const icon=wmoIcon(c.weather_code,isDay),desc=wmoDesc(c.weather_code,isDay);
  const wxNavBtn=document.querySelector('[data-page="weather"] .nav-icon');
  if(wxNavBtn)wxNavBtn.innerHTML=neonWx(c.weather_code,isDay,20);
  const _stormZone=typeof checkUserInZone==='function'?checkUserInZone():null;
  const _zoneOverride=_heroBandFromZone(_stormZone);
  const _zoneDbzToWmo={sprinkles:51,drizzle:53,trace:3,light:61,moderate:63,heavy:65,intense:65,severe:95,extreme:99};
  const _heroDesc=_zoneOverride?_zoneOverride.label:(c._nwsDesc||desc);
  const _heroWCode=_zoneOverride?(_zoneDbzToWmo[_zoneOverride.cls]||63):c.weather_code;
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

  const _nowMs=Date.now();
  const _hIdx=hourly.time?hourly.time.findIndex(t=>new Date(t).getTime()>=_nowMs):-1;
  const _h1=_hIdx>=0&&_hIdx+1<(hourly.time||[]).length?_hIdx+1:-1;
  function _ta(nowV,nextV,thresh){
    if(nowV==null||nextV==null)return'';
    const d=nextV-nowV;
    if(Math.abs(d)<=thresh)return' <span style="color:var(--text-muted);font-size:0.6em">→</span>';
    if(d>0)return' <span style="color:#39ff14;font-size:0.6em;text-shadow:0 0 6px rgba(57,255,20,0.6)">⤴</span>';
    return' <span style="color:#ff3355;font-size:0.6em;text-shadow:0 0 6px rgba(255,51,85,0.6)">⤵</span>';
  }
  function _taC(nowV,nextV,thresh){
    if(nowV==null||nextV==null)return'';
    const d=nextV-nowV;
    if(Math.abs(d)<=thresh)return' <span style="color:var(--text-muted);font-size:0.6em">→</span>';
    if(d>0)return' <span style="color:#00FFFF;font-size:0.6em;text-shadow:0 0 6px rgba(0,255,255,0.5)">⤴</span>';
    return' <span style="color:#00FFFF;font-size:0.6em;text-shadow:0 0 6px rgba(0,255,255,0.5)">⤵</span>';
  }
  function _hv(key){return _hIdx>=0&&hourly[key]?hourly[key][_hIdx]:null}
  function _hv1(key){return _h1>=0&&hourly[key]?hourly[key][_h1]:null}

  const sections={
    wind:`<div class="weather-section" data-sec="wind"><div class="sec-header"><span class="card-title m-0"><span class="icon">💨</span> Wind</span>${secBtns('wind')}</div>
      <div class="wind-gauge-full">${gaugeHtml}</div>
      <div class="wind-stats-2x2">
        <div class="wind-stat-cell"><div class="wind-stat-label">Speed</div><div class="wind-stat-val">${windNum} ${windUnit}</div></div>
        <div class="wind-stat-cell"><div class="wind-stat-label">Direction</div><div class="wind-stat-val">${degToDir(wd)} ${wd.toFixed(0)}°</div></div>
        <div class="wind-stat-cell"><div class="wind-stat-label">Gusts</div><div class="wind-stat-val">${hasGust?kmhTo(c.wind_gusts_10m,S.windUnit)+' '+windUnit:'--'}</div></div>
        <div class="wind-stat-cell"><div class="wind-stat-label">Beaufort</div><div class="wind-stat-val" style="color:${_BFT_CLR[bf]}">F${bf} ${_BFT_NAME[bf]}</div></div>
      </div></div>`,
    trends:`<div class="weather-section" data-sec="trends"><div class="sec-header"><span class="card-title m-0"><span class="icon">📈</span> 48h Trends</span>${secBtns('trends')}</div>
      ${renderTrendCharts(hourly)}</div>`,
    hourly:`<div class="weather-section" data-sec="hourly"><div class="sec-header"><span class="card-title m-0"><span class="icon">🕐</span> 72h Hourly Forecast</span>${secBtns('hourly')}</div>
      ${renderHourlyForecast(hourly,daily)}</div>`,
    forecast:`<div class="weather-section" data-sec="forecast"><div class="sec-header"><span></span>${secBtns('forecast')}</div>${data._nwsForecast?renderNWSForecast(data._nwsForecast):renderDailyForecast(daily,data.timezone)}</div>`
  };
  const order=getSecOrder();

  el.innerHTML=`
    <div id="rain-clock"></div>
    <div id="rain-forecast-bars"></div>
    <div class="weather-hero">
      <div class="hero-icon-showcase">${animEmoji(_heroWCode,isDay,'340px',_heroDesc)}</div>
      <div class="hero-temp-line" style="font-size:2.8em;font-weight:800;line-height:1;background:linear-gradient(180deg,var(--text-primary) 0%,var(--text-secondary) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin:6px 0 2px">${fmtTempShort(tempC)}<span style="-webkit-text-fill-color:initial;background:none">${_taC(_hv('temperature_2m'),_hv1('temperature_2m'),1)}</span></div>
      <div class="hero-desc-line" style="font-size:0.85em;color:${_zoneOverride?_zoneOverride.color:'var(--text-secondary)'};margin-bottom:2px">${_heroDesc}${_zoneOverride?'<span style="display:inline-block;margin-left:6px;font-size:0.65em;font-weight:700;padding:1px 6px;border-radius:4px;background:rgba(255,60,60,0.15);color:'+_zoneOverride.color+';border:1px solid '+_zoneOverride.color+'40;vertical-align:middle;letter-spacing:0.04em">LIVE RADAR</span>':''}</div>
      ${c._source?`<div class="hero-source-line" style="font-size:0.55em;color:var(--accent-cyan);opacity:0.7;margin-bottom:4px">${c._source}${c._sourceCount>1?' (×'+c._sourceCount+' avg)':''}</div>`:''}
      <div class="hero-stats-grid">
        <div class="hero-stat-cell"><div class="hero-side-label">Feels Like</div><div class="hero-side-val">${fmtTemp(feelsC)}${_taC(_hv('apparent_temperature'),_hv1('apparent_temperature'),1)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Humidity</div><div class="hero-side-val">${Math.min(100,c.relative_humidity_2m)}%${_taC(_hv('relative_humidity_2m'),_hv1('relative_humidity_2m'),3)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">☁️ Clouds</div><div class="hero-side-val">${c.cloud_cover}%${_taC(_hv('cloud_cover'),_hv1('cloud_cover'),10)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Pressure</div><div class="hero-side-val">${fmtPres(c.pressure_msl)}${_ta(_hv('pressure_msl'),_hv1('pressure_msl'),0.5)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">Precip</div><div class="hero-side-val">${fmtPrecip(c.precipitation||0)}${_taC(_hv('precipitation'),_hv1('precipitation'),0.1)}</div></div>
        <div class="hero-stat-cell"><div class="hero-side-label">🌡️ Dew Pt</div><div class="hero-side-val">${fmtTemp(dewC)}${_taC(_hv('dew_point_2m'),_hv1('dew_point_2m'),1)}</div></div>
        ${(()=>{
  const _uv=_hv('uv_index');
  const _uvColor=_uv==null?'var(--text-muted)':_uv<=2?'#4caf50':_uv<=5?'#ffeb3b':_uv<=7?'#ff9800':_uv<=10?'#f44336':'#ce93d8';
  const _uvLabel=_uv==null?'--':_uv<=2?'Low':_uv<=5?'Moderate':_uv<=7?'High':_uv<=10?'Very High':'Extreme';
  const _flM=_hv('freezing_level_height');
  const _flFt=_flM!=null?Math.round(_flM*3.281):null;
  return`<div class="hero-stat-cell"><div class="hero-side-label">☀️ UV Index</div><div class="hero-side-val" style="color:${_uvColor}">${_uv!=null?_uv.toFixed(1):'--'}${_taC(_uv,_hv1('uv_index'),0.5)}</div><div style="font-size:0.38em;color:${_uvColor};margin-top:1px">${_uvLabel}</div></div>`
    +`<div class="hero-stat-cell"><div class="hero-side-label">❄️ Freeze Level</div><div class="hero-side-val">${_flFt!=null?fmtAlt(_flFt):'--'}${_taC(_hv('freezing_level_height'),_hv1('freezing_level_height'),100)}</div><div style="font-size:0.38em;color:var(--text-muted);margin-top:1px">${_flFt!=null?'MSL · ice/snow line':''}</div></div>`;
})()}
        <div class="hero-stat-cell"><div class="hero-side-label">Spread</div><div class="hero-side-val">${fmtTempDiff(tempC-dewC)}</div><div style="font-size:0.42em;color:var(--text-muted);margin-top:1px;line-height:1.2">${getSpreadLabel(tempC-dewC)}</div>${(()=>{
  const _spread=tempC-dewC;
  const _estB=adjustCloudBaseForUser(calcCloudBase(_spread));
  const _s0=_hIdx>=0&&hourly.temperature_2m&&hourly.dew_point_2m?hourly.temperature_2m[_hIdx]-hourly.dew_point_2m[_hIdx]:null;
  const _s1=_h1>=0&&hourly.temperature_2m&&hourly.dew_point_2m?hourly.temperature_2m[_h1]-hourly.dew_point_2m[_h1]:null;
  const _arrow=_ta(_s0,_s1,0.5);
  return`<div id="weather-spread-cb" data-spread="${_spread}" style="font-size:0.38em;color:var(--accent-cyan);margin-top:1px;line-height:1.1">Est. base ~${fmtAlt(_estB)} AGL ${_arrow}</div>`;
})()}</div>
        ${(()=>{const spread=tempC-dewC;const windKt=c.wind_speed_10m!=null?(c.wind_speed_10m/1.852):null;const fog=getFogRisk(spread,windKt,isDay,c.cloud_cover);const stab=getStabilityLabel(spread,Math.min(100,c.relative_humidity_2m),tempC);const inv=detectInversion(spread,windKt,isDay,c.cloud_cover);return`<div class="hero-stat-cell"><div class="hero-side-label">🌫️ Fog Risk</div><div class="hero-side-val" style="font-size:0.85em;color:${fog.color}">${fog.level}</div><div style="font-size:0.38em;color:var(--text-muted);margin-top:1px;line-height:1.2">${fog.desc}</div></div><div class="hero-stat-cell"><div class="hero-side-label">🌡️ Stability</div><div class="hero-side-val" style="font-size:0.75em;color:${stab.color}">${stab.label}</div><div style="font-size:0.38em;color:var(--text-muted);margin-top:1px;line-height:1.2">${stab.desc}</div></div>${inv.detected?`<div class="hero-stat-cell" style="grid-column:1/-1"><div style="font-size:0.5em;color:var(--accent-orange);text-align:center;padding:2px 6px;background:rgba(255,152,0,0.1);border-radius:4px">⚠️ ${inv.text}</div></div>`:''}`})()}
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 0">
        <span style="position:relative;display:inline-flex;align-items:center">${(()=>{const bm={'☀️':0,'🌤️':1,'⛅':2,'🌥️':3,'☁️':3,'🌦️':51,'🌧️':61,'⛈️':95};const bc2=bm[baro.icon]!=null?bm[baro.icon]:3;return neonWx(bc2,true,36)})()}<span style="position:absolute;bottom:-2px;right:-4px;font-size:8px;background:rgba(0,180,255,0.25);color:var(--accent-cyan);border-radius:3px;padding:0 3px;line-height:1.4;font-weight:700;letter-spacing:0.03em;border:1px solid rgba(0,229,255,0.3)">FCST</span></span>
        <span style="font-size:0.75em;font-weight:600;color:var(--text-secondary)">${baro.prediction}</span>
        <span class="baro-trend ${baro.trend}" style="font-size:0.6em;color:${baro.trend==='rising'?'var(--accent-green)':baro.trend==='falling'?'var(--accent-red)':'var(--text-muted)'};text-shadow:0 0 6px ${baro.trend==='rising'?'rgba(0,255,136,0.4)':baro.trend==='falling'?'rgba(255,51,85,0.4)':'none'}">${trendArrow} ${(()=>{const isI=S.presUnit===0;if(isI){const v=Math.abs(baro.trendMb/33.8639);return(baro.trendMb>=0?'+':'-')+(v<0.05?v.toFixed(3):v.toFixed(2))+' inHg'}return(baro.trendMb>=0?'+':'')+baro.trendMb.toFixed(1)+' mb'})()}</span>
      </div>
    </div>
    ${_staleDataLabel()}
    <div class="card" style="margin-top:8px;padding:8px" id="mini-sonar-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="card-title m-0"><span class="icon">📡</span> Radar Sonar</span>
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
  if(typeof renderRainClock==='function')renderRainClock();
  if(typeof renderRainForecastBars==='function')renderRainForecastBars();
}
function _updateTropicalUI(){
  const el=document.getElementById('wx-tropical-section');
  if(!el)return;
  el.innerHTML=_renderTropicalSection();
}
function _renderTropicalHazardSection(){
  const nhc=_getFilteredSystems();
  if(!nhc||!nhc.length)return '<div id="hz-tropical"></div>';
  const nearStorms=nhc.filter(s=>s.dist!=null&&s.dist<=S._nhcProxRadius);
  if(!nearStorms.length)return '<div id="hz-tropical"></div>';
  let html=`<div id="hz-tropical" style="border-top:1px solid var(--border-subtle);padding-top:10px;margin-top:8px"><div style="font-size:0.8em;font-weight:700;color:#9333EA;margin-bottom:6px">🌀 Tropical Cyclones Nearby</div>`;
  nearStorms.forEach(s=>{
    const cat=s.category||_saffirSimpson(s.maxWind);
    const distStr=s.dist!=null?Math.round(s.dist)+' mi':'?';
    html+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:${cat.color}0a;border-left:3px solid ${cat.color};border-radius:0 6px 6px 0;margin-bottom:4px">
      <span class="text-1">🌀</span>
      <div class="flex-1"><div style="font-size:0.75em;font-weight:700;color:var(--text-primary)">${s.type} ${s.name}</div><div style="font-size:0.6em;color:${cat.color};font-weight:600">${cat.label} · ${distStr}</div></div>
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
  let allLightningDots=[];
  if(S._rawScanPts&&S._rawScanPts.length){
    const useRaw=viewR<=40;
    const dots=[];
    if(useRaw){
      const src=S._sonarClusteredPts&&S._sonarClusteredPts.length?S._sonarClusteredPts:S._rawScanPts;
      for(const p of src){
        const distMi=haversine(S.lat,S.lon,p.lat,p.lng);
        if(distMi>viewR)continue;
        const bear=(bearingDeg(S.lat,S.lon,p.lat,p.lng)+360)%360;
        const aMid=(bear-90)*Math.PI/180;
        const rMid=maxR*(distMi/viewR);
        if(rMid<=0)continue;
        dots.push({x:cx+Math.cos(aMid)*rMid,y:cy+Math.sin(aMid)*rMid,dbz:p.dbz,dist:rMid,angDeg:bear,count:p.count||1});
        if(p.dbz>maxDbz)maxDbz=p.dbz;
        zoneCount++;
      }
    }else{
      const cells=hexGridBin(S._rawScanPts,S.lat,S.lon,scanR);
      for(const[k,c]of cells){
        if(c.dist>viewR)continue;
        const aMid=(c.bearing-90)*Math.PI/180;
        const rMid=maxR*(c.dist/viewR);
        if(rMid<=0)continue;
        dots.push({x:cx+Math.cos(aMid)*rMid,y:cy+Math.sin(aMid)*rMid,dbz:c.maxDbz,dist:rMid,angDeg:c.bearing});
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
    allLightningDots=[];
    for(const d of dots){
      if(d.dbz<dbzFloor)continue;
      if(d.dbz>=48&&cfg.showLightning)allLightningDots.push(d);
      const frac=Math.min(1,d.dist/maxR);
      const dbzCls=_dbzEntry(d.dbz).cls;
      const dbzSc=_getDbzScale(dbzCls);
      const cntSc=useRaw?Math.min(1.8,1+Math.log2(d.count||1)*0.15):1;
      const dotR=(useRaw?rawDotR*(0.8+0.4*frac):(minDot+(maxDot-minDot)*frac))*dbzSc*cntSc;
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
        ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=6;
        ctx.fillStyle='rgba(255,23,68,0.8)';ctx.fillText('ROTATION',hx,hy+Math.max(10,size*0.03));
        ctx.font=`${Math.max(14,size*0.05)}px sans-serif`;
        ctx.shadowColor='rgba(255,23,68,0.9)';ctx.shadowBlur=10;
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
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=6;
      ctx.fillStyle=`rgba(0,220,255,${0.5*gB})`;ctx.font=`${Math.max(8,size*0.028)}px Inter,sans-serif`;
      ctx.textAlign='center';ctx.fillText(label,cx,cy-r+10);ctx.restore();
    }
    ctx.beginPath();ctx.moveTo(cx,cy-maxR);ctx.lineTo(cx,cy+maxR);ctx.strokeStyle=`rgba(0,220,255,${0.1*gB})`;ctx.lineWidth=0.5;ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx-maxR,cy);ctx.lineTo(cx+maxR,cy);ctx.stroke();
    const dirs=[['N',0],['S',180],['E',90],['W',270]];
    ctx.save();ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=6;
    ctx.fillStyle=`rgba(0,220,255,${0.6*gB})`;ctx.font=`bold ${Math.max(9,size*0.035)}px Inter,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const[l,deg]of dirs){
      const a=(deg-90)*Math.PI/180;
      const lx=cx+Math.cos(a)*(maxR+12),ly=cy+Math.sin(a)*(maxR+12);
      ctx.fillText(l,lx,ly);
    }
    ctx.restore();
  }
  try{
    const topInbound=(S._topStorms||[]).filter(s=>s.distance<=viewR);
    const _hasMv=S.stormMovement&&S.stormMovement.speed&&S.stormMovement.speed>=2;
    const _hasAl=S._upperWindDir!=null;
    const mv=_hasMv?Object.assign({},S.stormMovement)
            :(_hasAl?{direction:(S._upperWindDir+180)%360,speed:S._upperWindSpd?Math.round(S._upperWindSpd*0.621371):10,_fromAloft:true}
                    :null);
    if(_sonarCfg.showStormArrows&&mv){
      const mvRad=(mv.direction-90)*Math.PI/180;
      if(_hasMv&&topInbound.length>0){
        const shown=topInbound.slice(0,12);
        for(const st of shown){
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
      const isAir=!!mv._fromAloft;
      const neonC=isAir?'#ffe14d':pathArrowNeonColor(maxDbz);
      const arrLen=maxR*0.6;
      const ax=cx+Math.cos(mvRad)*arrLen,ay=cy+Math.sin(mvRad)*arrLen;
      const la=mvRad-Math.PI+0.4,ra=mvRad-Math.PI-0.4;
      ctx.save();ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=6;
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax+Math.cos(la)*12,ay+Math.sin(la)*12);ctx.moveTo(ax,ay);ctx.lineTo(ax+Math.cos(ra)*12,ay+Math.sin(ra)*12);
      ctx.strokeStyle=neonC;ctx.lineWidth=2.5;ctx.stroke();
      ctx.beginPath();ctx.moveTo(cx+Math.cos(mvRad)*15,cy+Math.sin(mvRad)*15);ctx.lineTo(ax,ay);
      ctx.strokeStyle=hexToRgba(neonC,isAir?0.7:0.5);ctx.lineWidth=1.5;
      if(isAir)ctx.setLineDash([5,3]); else ctx.setLineDash([4,3]);
      ctx.stroke();ctx.setLineDash([]);
      const slx=ax+Math.cos(mvRad)*10,sly=ay+Math.sin(mvRad)*10;
      ctx.fillStyle=hexToRgba(neonC,0.9);ctx.font=`bold ${Math.max(9,size*0.028)}px Inter,sans-serif`;
      ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=6;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(isAir?'AIR':'STORM',slx,sly);
      ctx.restore();
      const spdUnit=S.radarMetric?Math.round(mv.speed*1.60934)+'km/h':Math.round(mv.speed)+'mph';
      const chipTxt=`${isAir?'air':'storm'} → ${degToDir(mv.direction)} ${spdUnit}`;
      ctx.save();ctx.font=`${Math.max(8,size*0.022)}px Inter,sans-serif`;
      ctx.textAlign='left';ctx.textBaseline='top';
      ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=4;
      ctx.fillStyle=hexToRgba(neonC,0.85);ctx.fillText(chipTxt,8,8);
      ctx.restore();
    }
    if(_sonarCfg.showRelMotion&&typeof calcStormETAForBriefing==='function'&&topInbound.length){
      const shown=topInbound.slice(0,6);
      ctx.save();
      ctx.shadowColor='rgba(0,0,0,0.9)';ctx.shadowBlur=4;
      ctx.font=`${Math.max(8,size*0.022)}px Inter,sans-serif`;
      for(const st of shown){
        let b;try{b=calcStormETAForBriefing(st)}catch(e){continue}
        if(!b||b.classification==='unknown')continue;
        const sc=stormClass(b.classification);
        const col=sc.color;
        const stAng=((st.bearing||0)-90)*Math.PI/180;
        const dist=st.distance||0;
        const r=Math.min(maxR-6,maxR*(dist/viewR));
        const sx=cx+Math.cos(stAng)*r,sy=cy+Math.sin(stAng)*r;
        if(b.closingMph>0){
          const closeFrac=Math.min(1,Math.abs(b.closingMph)/30);
          const lineEnd=Math.max(8,closeFrac*r*0.85);
          const ux=(cx-sx),uy=(cy-sy);
          const um=Math.sqrt(ux*ux+uy*uy)||1;
          const ex=sx+(ux/um)*lineEnd,ey=sy+(uy/um)*lineEnd;
          ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);
          ctx.strokeStyle=col;ctx.lineWidth=1.6;ctx.setLineDash([3,2]);ctx.stroke();ctx.setLineDash([]);
          const head=5,ang=Math.atan2(ey-sy,ex-sx);
          ctx.beginPath();
          ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(ang-0.5)*head,ey-Math.sin(ang-0.5)*head);
          ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(ang+0.5)*head,ey-Math.sin(ang+0.5)*head);
          ctx.strokeStyle=col;ctx.lineWidth=1.6;ctx.stroke();
          const pctStr=(sc.showPct&&b.coneConfidence!=null)?` ${Math.round(b.coneConfidence*100)}%`:'';
          const lbl=b.classification==='direct'?`${sc.badge}${pctStr} ≈${b.closingMph}mph`
                   :b.classification==='near_miss'?`${sc.badge}${pctStr}`
                   :b.classification==='passing'?sc.badge:'';
          if(lbl){
            ctx.fillStyle=col;ctx.textAlign='left';ctx.textBaseline='middle';
            ctx.fillText(lbl,ex+4,ey);
          }
        }
        if(b.perpMissMi!=null&&b.perpMissMi>0&&b.classification!=='direct'){
          const missR=Math.min(maxR-4,maxR*(b.perpMissMi/viewR));
          if(b.sideBearing!=null&&missR>3){
            const sAng=(b.sideBearing-90)*Math.PI/180;
            const tx=cx+Math.cos(sAng)*missR,ty=cy+Math.sin(sAng)*missR;
            const perp=sAng+Math.PI/2;const tickL=5;
            ctx.beginPath();
            ctx.moveTo(tx+Math.cos(perp)*tickL,ty+Math.sin(perp)*tickL);
            ctx.lineTo(tx-Math.cos(perp)*tickL,ty-Math.sin(perp)*tickL);
            ctx.strokeStyle=col;ctx.lineWidth=1.8;ctx.stroke();
            const missMi=S.radarMetric?(b.perpMissMi*1.60934).toFixed(1)+' km':b.perpMissMi.toFixed(0)+' mi';
            const missLbl=`miss ${missMi} ${degToDir(b.sideBearing)}`;
            ctx.fillStyle=col;ctx.textAlign='left';ctx.textBaseline='middle';
            ctx.fillText(missLbl,tx+tickL+3,ty);
          }
        }
      }
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
      ctx.shadowColor='rgba(0,0,0,0.95)';ctx.shadowBlur=6;
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
  if(_sonarCfg.showLightning&&allLightningDots.length){
    const clR=Math.max(15,size*0.06);
    const lGroups=[];
    for(const d of allLightningDots){
      let merged=false;
      for(const g of lGroups){
        const dx=d.x-g.sx/g.n,dy=d.y-g.sy/g.n;
        if(dx*dx+dy*dy<clR*clR){g.sx+=d.x;g.sy+=d.y;g.n++;g.dots.push(d);merged=true;break}
      }
      if(!merged)lGroups.push({sx:d.x,sy:d.y,n:1,dots:[d]});
    }
    const now=performance.now();
    if(!_lightningFlashState)_lightningFlashState=[];
    while(_lightningFlashState.length<lGroups.length)_lightningFlashState.push({on:true,nextToggle:now+100+Math.random()*700});
    _lightningFlashState.length=lGroups.length;
    ctx.save();
    const boltSz=Math.max(10,size*0.035);
    ctx.font=`${boltSz}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor='rgba(255,255,0,0.8)';ctx.shadowBlur=6;
    for(let gi=0;gi<lGroups.length;gi++){
      const g=lGroups[gi];
      const gx=g.sx/g.n,gy=g.sy/g.n;
      const fs=_lightningFlashState[gi];
      if(now>=fs.nextToggle){
        fs.on=!fs.on;
        fs.nextToggle=now+(fs.on?(150+Math.random()*250):(1500+Math.random()*1500));
      }
      if(!fs.on)continue;
      const flashAlpha=0.7+Math.random()*0.3;
      ctx.fillStyle=`rgba(255,255,50,${flashAlpha})`;ctx.fillText('⚡',gx,gy);
      if(g.n>1){
        ctx.save();ctx.shadowBlur=0;
        ctx.font=`bold ${Math.max(7,boltSz*0.55)}px Inter,sans-serif`;
        ctx.fillStyle=`rgba(255,255,50,${Math.min(1,flashAlpha+0.05)})`;ctx.strokeStyle='rgba(0,0,0,0.6)';ctx.lineWidth=2;
        const tx=gx+boltSz*0.45,ty=gy-boltSz*0.35;
        ctx.strokeText(String(g.n),tx,ty);ctx.fillText(String(g.n),tx,ty);
        ctx.restore();
        ctx.font=`${boltSz}px sans-serif`;
      }
    }
    ctx.restore();
  }else{_lightningFlashState=null}
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
let _windBase={spd:0,dir:0,gust:0};
let _windCurSim={spd:0,dir:0,gust:0};
let _windFloor=0;
let _windCeil=0;
let _windLerpFrom={spd:0,dir:0};
let _windLerpTo={spd:0,dir:0};
let _windLerpT0=0;
let _WIND_LERP_DUR=5000;
let _windTrend=0;
let _windSweepRaf=null;
let _windSweepPaused=false;
let _windSweepAfterRender=false;
function _pickWindTarget(){
  const tSec=Date.now()/1000;
  const n=_wn.noise(tSec*0.2,0);
  const u=(n+1)/2;
  const range=_windCeil-_windFloor;
  if(!Number.isFinite(range)||range<=0)return{spd:_windFloor||0,dir:_windBase.dir||0};
  const ws=Number(_windBase.spd)||0;
  let center=Math.max(0.01,Math.min(0.99,(ws-_windFloor)/range));
  const fc=_getForecastWind();
  if(fc&&Number.isFinite(fc.spd)&&ws>0){
    const trendRatio=Math.max(-0.5,Math.min(0.5,(fc.spd-ws)/ws));
    _windTrend=trendRatio;
    const shift=trendRatio*0.3;
    center=Math.max(0.01,Math.min(0.99,center+shift));
  }else{_windTrend=0;}
  const dn=_wn.noise(tSec*0.2,100);
  const dir=((_windBase.dir+dn*5)%360+360)%360;
  if(Math.random()<0.08){
    const gustSpd=_windCeil-(Math.random()*range*0.08);
    return{spd:Math.max(_windFloor,Math.min(_windCeil,gustSpd)),dir};
  }
  const d=u-center;
  const exp=1.8;
  let biased;
  if(d<0){
    const nd=Math.min(1,Math.abs(d)/center);
    biased=center-Math.pow(nd,exp)*center;
  }else{
    const nd=Math.min(1,d/(1-center));
    biased=center+Math.pow(nd,exp)*(1-center);
  }
  if(!Number.isFinite(biased))biased=center;
  const spd=_windFloor+Math.max(0,Math.min(1,biased))*range;
  return{spd,dir};
}
function _updateWindRange(){
  const ws=Number(_windBase.spd)||0;
  const wg=Number(_windBase.gust)||ws;
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
  _updateWindRange();
  const initGust=Number(S.weather.wind_gusts_10m)||_windBase.spd;
  const now=Date.now();
  _gustSamples=[{t:now,v:initGust}];
  _windCurSim={spd:_windBase.spd,dir:_windBase.dir,gust:initGust};
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
  _WIND_LERP_DUR=_getSimInterval();
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
    _gustSamples.push({t:now,v:simSpd});
    const gw=_getGustWindow();
    while(_gustSamples.length&&now-_gustSamples[0].t>gw)_gustSamples.shift();
    const displayGust=_gustSamples.length>0?Math.max(..._gustSamples.map(s=>s.v)):0;
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
        if(gustEl)gustEl.textContent=displayGust>0?'G'+fmtWind(displayGust)+' ('+_fmtWindowLabel(_getGustWindow())+')':'';
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
          const gs2=displayGust>0?'G'+fmtWind(displayGust)+' ('+_fmtWindowLabel(_getGustWindow())+')':'';
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

function _tempToColor(tempC){
  var f=S.tempUnit===0?(tempC*9/5+32):tempC;
  if(f<=32)return'#4FC3F7';
  if(f<=50)return'#29B6F6';
  if(f<=60)return'#26C6DA';
  if(f<=68)return'#66BB6A';
  if(f<=75)return'#FFA726';
  if(f<=85)return'#FF7043';
  if(f<=95)return'#EF5350';
  return'#E53935';
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
  let temps=[];
  for(let n=0;n<hours;n++){temps.push(h.temperature_2m[startIdx+n])}
  const minT=Math.min(...temps),maxT=Math.max(...temps);
  const range=maxT-minT||1;
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
      items+=`<div class="hbar-day-label">${label}</div>`;
    }
    const hrStr=fmtHrLabel(dt);
    const tempC=h.temperature_2m[i];
    const precip=h.precipitation_probability?h.precipitation_probability[i]:0;
    const precipMm=h.precipitation?h.precipitation[i]:0;
    const precipShow=precip>0?precip+'%':(precipMm>0?fmtPrecip(precipMm):'');
    const wCode=h.weather_code?h.weather_code[i]:0;
    const isD=h.is_day?h.is_day[i]===1:!isNight(t);
    const pct=20+((tempC-minT)/range)*80;
    const col=_tempToColor(tempC);
    items+=`<div class="hbar-col${!isD?' hbar-night':''}">
      <div class="hbar-temp">${fmtTempShort(tempC)}</div>
      <div class="hbar-icon">${animEmoji(wCode,isD,'1.2em')}</div>
      <div class="hbar-bar-wrap"><div class="hbar-bar" style="height:${pct}%;background:${col}"></div></div>
      ${precipShow?`<div class="hbar-precip">💧<br>${precipShow}</div>`:`<div class="hbar-precip-empty"></div>`}
      <div class="hbar-time">${n===0?tStr('Now'):hrStr}</div>
    </div>`;
  }
  return`<div class="card"><div class="card-title"><span class="icon">🕐</span> Hourly Forecast — Next 72h</div>
    <div class="hbar-scroll">${items}</div></div>`;
}
function _fmtSecondary(c){return S.tempUnit===0?'('+c.toFixed(0)+'°C)':'('+cToF(c)+'°F)'}
function _nwsCondToIcon(short,isDaytime){
  const nwsCondMap={'sunny':'clear-day','clear':'clear-night','mostly sunny':'few-clouds-day','mostly clear':'few-clouds-night','partly sunny':'partly-cloudy-day','partly cloudy':'partly-cloudy-night','mostly cloudy':'overcast','cloudy':'overcast','overcast':'overcast',
    'rain':'rain','showers':'few-clouds-day-rain','chance rain':'few-clouds-day-rain','slight chance rain':'few-clouds-day-rain','thunderstorms':'thunderstorm','chance thunderstorms':'thunderstorm','snow':'snow','chance snow':'partly-cloudy-day-snow','fog':'fog','haze':'haze','windy':'overcast','hot':'clear-day','cold':'snow'};
  const sh=(short||'').toLowerCase();let cond=isDaytime?'partly-cloudy-day':'partly-cloudy-night';
  for(const[k,c]of Object.entries(nwsCondMap)){if(sh.includes(k)){cond=c;break}}
  return cond;
}
function _isSevere(short){const s=(short||'').toLowerCase();return s.includes('severe')||s.includes('tornado')||s.includes('thunderstorm')||s.includes('t-storm')||s.includes('hurricane')||s.includes('tropical')}
function _wxTags(short){const tags=[];const s=(short||'').toLowerCase();if(s.includes('thunderstorm')||s.includes('t-storm'))tags.push('Thunderstorm');if(s.includes('tornado'))tags.push('Tornado');if(s.includes('hail'))tags.push('Hail');if(s.includes('snow'))tags.push('Snow');if(s.includes('ice')||s.includes('freezing'))tags.push('Ice');if(s.includes('flood'))tags.push('Flooding');return tags}

function _renderFcPeriodCol(p,label,icon,isNight){
  if(!p)return'';
  const tempC=p.unit==='F'?(p.temp-32)*5/9:p.temp;
  const tempMain=fmtTempShort(tempC);
  const tempSec=_fmtSecondary(tempC);
  const cond=_nwsCondToIcon(p.short,!isNight);
  const em=getWeatherIcon(cond,'1.2em');
  const rain=p.precip||0;
  return`<div class="fc-col">
    <div class="fc-col-label">${icon} ${label}</div>
    <div class="fc-col-icon">${em}</div>
    <div class="fc-col-temp">${tempMain} <span class="fc-sec">${tempSec}</span></div>
    <div class="fc-col-desc">${p.short}</div>
    <div class="fc-col-wind">Wind: ${p.wind} ${p.windDir}</div>
    ${rain>0?`<div class="fc-col-rain">💧 ${rain}%</div>`:''}
  </div>`;
}

function renderDailyForecast(d,tz){
  if(!d||!d.time)return'';
  let safeTz;
  try{Intl.DateTimeFormat('en',{timeZone:tz});safeTz=tz}catch(e){safeTz=undefined}
  let todayStr;
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:safeTz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    todayStr=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value+'-'+parts.find(p=>p.type==='day').value;
  }catch(e){
    const n=new Date();todayStr=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
  }
  let todayIdx=d.time.indexOf(todayStr);
  if(todayIdx<0){todayIdx=d.time.findIndex(t=>t>=todayStr);if(todayIdx<0)todayIdx=0}
  const futureTime=d.time.slice(todayIdx);
  const allLos=[],allHis=[];
  futureTime.forEach((t,vi)=>{const oi=todayIdx+vi;allLos.push(d.temperature_2m_min[oi]);allHis.push(d.temperature_2m_max[oi])});
  const weekMin=Math.min(...allLos),weekMax=Math.max(...allHis);
  const weekRange=weekMax-weekMin||1;
  const initShow=5;
  const rows=futureTime.map((t,vi)=>{
    const oi=todayIdx+vi;
    const [yy,mm,dd]=t.split('-').map(Number);
    const dt=new Date(Date.UTC(yy,mm-1,dd,12,0,0));
    const dayAbbr=t===todayStr?tStr('Today'):dt.toLocaleDateString(_curLang||'en',{weekday:'short',timeZone:'UTC'});
    const dateNum=dd;
    const hiC=d.temperature_2m_max[oi],loC=d.temperature_2m_min[oi];
    const rain=d.precipitation_probability_max?d.precipitation_probability_max[oi]:0;
    const code=d.weather_code[oi];
    const severe=(code>=95);
    const emDay=animEmoji(code,true,'1.4em');
    const loCol=_tempToColor(loC),hiCol=_tempToColor(hiC);
    const leftPct=0;
    const widthPct=100;
    const hidden=vi>=initShow?' style="display:none" data-fc-extra':'';
    return`<div class="dbar-row" onclick="toggleDailyDetail(this,${oi})"${hidden}>
      <div class="dbar-day"><span class="dbar-day-name">${dayAbbr}</span><span class="dbar-day-date">${dateNum}</span></div>
      <div class="dbar-icon">${emDay}${severe?'<span class="dbar-severe">⚠</span>':''}</div>
      <div class="dbar-rain">${rain>0?'💧'+rain+'%':''}</div>
      <div class="dbar-lo">${fmtTempShort(loC)}</div>
      <div class="dbar-track"><div class="dbar-range" style="left:${leftPct}%;width:${Math.max(widthPct,4)}%;background:linear-gradient(90deg,${loCol},${hiCol})"></div></div>
      <div class="dbar-hi">${fmtTempShort(hiC)}</div>
    </div><div id="fc-detail-${oi}" style="display:none"></div>`;
  }).join('');
  const showMore=futureTime.length>initShow?`<div class="fc-show-more" id="fc-show-more" onclick="toggleFcMore()">Show More ▾</div>`:'';
  return`<div class="card"><div class="card-title"><span class="icon">📊</span> ${tStr('This Week')}</div>${rows}${showMore}</div>`;
}
function toggleFcMore(){
  const extras=document.querySelectorAll('[data-fc-extra]');
  const btn=document.getElementById('fc-show-more');
  if(!extras.length)return;
  const hidden=extras[0].style.display==='none';
  extras.forEach(el=>{el.style.display=hidden?'':'none';if(!hidden){const nb=el.nextElementSibling;if(nb&&nb.id&&nb.id.startsWith('fc-detail-'))nb.style.display='none';el.classList.remove('dbar-row-active')}});
  if(btn)btn.innerHTML=hidden?'Show Less ▴':'Show More ▾';
}
function toggleNwsFcMore(){
  const extras=document.querySelectorAll('[data-nws-extra]');
  const btn=document.getElementById('nws-show-more');
  if(!extras.length)return;
  const hidden=extras[0].style.display==='none';
  extras.forEach(el=>el.style.display=hidden?'':'none');
  if(btn)btn.innerHTML=hidden?'Show Less ▴':'Show More ▾';
}
function toggleDailyDetail(el,idx){
  const d=S.forecast&&S.forecast.daily;if(!d)return;
  const box=document.getElementById('fc-detail-'+idx);
  if(!box)return;
  if(box.style.display!=='none'){box.style.display='none';el.classList.remove('dbar-row-active');return}
  const rain=d.precipitation_probability_max?d.precipitation_probability_max[idx]:0;
  const precip=d.precipitation_sum?d.precipitation_sum[idx]:0;
  const wind=d.wind_speed_10m_max?d.wind_speed_10m_max[idx]:0;
  const sunrise=d.sunrise?fmtClockShort(new Date(d.sunrise[idx])):'—';
  const sunset=d.sunset?fmtClockShort(new Date(d.sunset[idx])):'—';
  const hiC=d.temperature_2m_max[idx],loC=d.temperature_2m_min[idx];
  box.innerHTML=`<div class="forecast-detail">
    <div class="fd-row"><span>🌡️ ${tStr('High / Low')}</span><span class="fw600"><span style="color:var(--accent-red)">${fmtTemp(hiC)}</span> / <span class="c-cyan">${fmtTemp(loC)}</span></span></div>
    <div class="fd-row"><span>💧 ${tStr('Rain Chance')}</span><span class="fw600">${rain}%</span></div>
    <div class="fd-row"><span>🌧️ ${tStr('Precipitation')}</span><span class="fw600">${fmtPrecip(precip)}</span></div>
    <div class="fd-row"><span>💨 ${tStr('Max Wind')}</span><span class="fw600">${fmtWind(wind)}</span></div>
    <div class="fd-row"><span>🌅 ${tStr('Sunrise')}</span><span class="fw600">${sunrise}</span></div>
    <div class="fd-row"><span>🌇 ${tStr('Sunset')}</span><span class="fw600">${sunset}</span></div>
  </div>`;
  box.style.display='';
  el.classList.add('dbar-row-active');
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
  const initShow=4;
  const cards=dayPairs.map((pair,pi)=>{
    const p=pair.day||pair.night;
    const dayName=p.name.replace(/ Night$/,'').replace(/This /,'');
    const dayShort=pair.day?pair.day.short:'';
    const nightShort=pair.night?pair.night.short:'';
    const combined=dayShort+' '+nightShort;
    const severe=_isSevere(combined);
    const tags=_wxTags(combined);
    const hidden=pi>=initShow?' style="display:none" data-nws-extra':'';
    return`<div class="fc-day-card"${hidden}>
      <div class="fc-day-header">
        <span class="fc-day-name">${dayName}</span>
        ${severe?'<span class="fc-severe-badge">⚠ POSSIBLE SEVERE</span>':''}
      </div>
      ${tags.length?'<div class="fc-tags">'+tags.map(t=>'<span class="fc-tag">'+getWeatherIcon('thunderstorm','0.75em')+' '+t+'</span>').join('')+'</div>':''}
      <div class="fc-cols">
        ${_renderFcPeriodCol(pair.day,'Day','☀️',false)}
        ${_renderFcPeriodCol(pair.night,'Night','🌙',true)}
      </div>
      <div class="fc-detail-toggle" onclick="toggleNWSDetail(this,${pair.idx})">Show Details</div>
      <div class="fc-detail-body" id="nws-detail-${pair.idx}" style="display:none"></div>
    </div>`;
  }).join('');
  const showMore=dayPairs.length>initShow?`<div class="fc-show-more" id="nws-show-more" onclick="toggleNwsFcMore()">Show More ▾</div>`:'';
  return`<div class="card"><div class="card-title"><span class="icon">📊</span> NWS Forecast</div>${cards}${showMore}
    <div style="text-align:right;font-size:0.55em;color:var(--text-muted);margin-top:4px;padding-right:4px">Source: National Weather Service</div></div>`;
}
function toggleNWSDetail(el,idx){
  const periods=S._nwsPeriods;if(!periods)return;
  const box=document.getElementById('nws-detail-'+idx);
  if(!box)return;
  if(box.style.display!=='none'){box.style.display='none';el.textContent='Show Details';return}
  const p=periods[idx];
  const tempC=p.unit==='F'?(p.temp-32)*5/9:p.temp;
  const n=periods[idx+1]&&periods[idx+1].isDaytime===false?periods[idx+1]:null;
  const nightDetail=n?`<div style="font-size:0.8em;color:var(--text-secondary);margin-top:8px;line-height:1.4;border-top:1px solid var(--border-subtle);padding-top:8px"><b>${n.name}:</b> ${n.detail}</div>`:'';
  box.innerHTML=`<div class="forecast-detail">
    <div class="fd-row"><span>🌡️ Temperature</span><span class="fw600">${fmtTemp(tempC)}</span></div>
    <div class="fd-row"><span>💨 Wind</span><span class="fw600">${p.wind} ${p.windDir}</span></div>
    ${p.precip>0?`<div class="fd-row"><span>💧 Rain Chance</span><span class="fw600">${p.precip}%</span></div>`:''}
    <div style="font-size:0.8em;color:var(--text-secondary);margin-top:8px;line-height:1.4;border-top:1px solid var(--border-subtle);padding-top:8px">${p.detail}</div>
    ${nightDetail}
  </div>`;
  box.style.display='';
  el.textContent='Hide Details';
}

// No-op — arrow is now driven purely by forecast spread trend at render time.
function updateWeatherCloudBaseColor(){}


// ===== Rain Clock (RainAware-style 0-180 min circular precip dial) =====
function _nextRainHourFromForecast(){
  const h=S._hourlyData;
  if(!h||!h.time||!h.precipitation)return null;
  const now=Date.now();
  let startIdx=h.time.findIndex(t=>new Date(t).getTime()>=now-1800000);
  if(startIdx<0)return null;
  const end=Math.min(startIdx+36,h.time.length);
  for(let i=startIdx;i<end;i++){
    if((h.precipitation[i]||0)>=0.1){
      const t=new Date(h.time[i]).getTime();
      return{mins:Math.max(0,Math.round((t-now)/60000)),mm:h.precipitation[i],time:t};
    }
  }
  return null;
}

function _rainClockProject(){
  const out={ready:false,minutes:new Array(181).fill(0),windows:[],nearest:null,stale:false,motionUnknown:false,noLoc:false,empty:false};
  if(S.lat==null||S.lon==null){out.noLoc=true;return out}
  const pts=S._rawScanPts||[];
  if(pts.length===0){out.empty=true;return out}
  if(S.scanTime&&(Date.now()-S.scanTime)>15*60000){out.stale=true;return out}
  const mv=S.stormMovement;
  const RADIUS_MI=1.5;
  const MIN_DBZ=20;
  let vx=0,vy=0,haveMv=false;
  if(mv&&mv.speed>1&&mv.direction!=null){
    const th=mv.direction*Math.PI/180;
    vx=mv.speed*Math.sin(th);
    vy=mv.speed*Math.cos(th);
    haveMv=true;
  }
  out.motionUnknown=!haveMv;
  const MI_PER_DEG_LAT=69.0;
  const MI_PER_DEG_LON=69.0*Math.cos(S.lat*Math.PI/180);
  let nearestDist=Infinity,nearestBearing=null;
  for(const p of pts){
    if(p.dbz<MIN_DBZ)continue;
    const d=p.dist!=null?p.dist:haversine(S.lat,S.lon,p.lat,p.lng);
    if(d<nearestDist){nearestDist=d;nearestBearing=bearingDeg(S.lat,S.lon,p.lat,p.lng)}
  }
  if(nearestDist<Infinity&&nearestBearing!=null){out.nearest={mi:nearestDist,dir:degToDir(nearestBearing)}}
  const v2_mph2=vx*vx+vy*vy;
  const v2_per_min2=v2_mph2/3600;
  const contribs=[];
  for(const p of pts){
    if(p.dbz<MIN_DBZ)continue;
    const dx=(p.lng-S.lon)*MI_PER_DEG_LON;
    const dy=(p.lat-S.lat)*MI_PER_DEG_LAT;
    const dist0=Math.sqrt(dx*dx+dy*dy);
    if(!haveMv||v2_per_min2<1e-6){
      if(dist0<=RADIUS_MI){
        if(p.dbz>out.minutes[0])out.minutes[0]=p.dbz;
        contribs.push({lat:p.lat,lng:p.lng,dbz:p.dbz,dist:dist0,bearing:bearingDeg(S.lat,S.lon,p.lat,p.lng),tIn:0,tOut:0});
      }
      continue;
    }
    const tStar=-(dx*vx+dy*vy)/v2_mph2*60;
    const cx=dx+vx*tStar/60,cy=dy+vy*tStar/60;
    const dmin2=cx*cx+cy*cy;
    if(dmin2>RADIUS_MI*RADIUS_MI)continue;
    const hw=Math.sqrt((RADIUS_MI*RADIUS_MI-dmin2)/v2_per_min2);
    const tIn=Math.max(0,Math.floor(tStar-hw));
    const tOut=Math.min(180,Math.ceil(tStar+hw));
    if(tIn>180||tOut<0)continue;
    for(let t=tIn;t<=tOut;t++){if(p.dbz>out.minutes[t])out.minutes[t]=p.dbz}
    contribs.push({lat:p.lat,lng:p.lng,dbz:p.dbz,dist:dist0,bearing:bearingDeg(S.lat,S.lon,p.lat,p.lng),tIn,tOut});
  }
  let cur=null;
  for(let t=0;t<=180;t++){
    const v=out.minutes[t];
    if(v>=MIN_DBZ){
      if(!cur)cur={startMin:t,endMin:t,peakDbz:v};
      else{cur.endMin=t;if(v>cur.peakDbz)cur.peakDbz=v}
    }else if(cur){out.windows.push(cur);cur=null}
  }
  if(cur)out.windows.push(cur);
  for(const w of out.windows){
    const matched=contribs.filter(c=>c.tIn<=w.endMin&&c.tOut>=w.startMin);
    const clusters=[];
    for(const c of matched){
      let placed=false;
      for(const cl of clusters){
        if(haversine(c.lat,c.lng,cl.lat,cl.lng)<=2.5){
          if(c.dbz>cl.dbz){cl.dbz=c.dbz;cl.lat=c.lat;cl.lng=c.lng;cl.dist=c.dist;cl.bearing=c.bearing}
          cl.count++;
          if(c.tIn<cl.tIn)cl.tIn=c.tIn;
          if(c.tOut>cl.tOut)cl.tOut=c.tOut;
          placed=true;break;
        }
      }
      if(!placed)clusters.push({lat:c.lat,lng:c.lng,dbz:c.dbz,dist:c.dist,bearing:c.bearing,tIn:c.tIn,tOut:c.tOut,count:1});
    }
    clusters.sort((a,b)=>b.dbz-a.dbz);
    w.cells=clusters.slice(0,5);
  }
  out.ready=true;
  return out;
}

function renderRainClock(){
  const el=document.getElementById('rain-clock');
  if(!el)return;
  const data=_rainClockProject();
  S._rainClockData=data;
  const SIZE=280,CX=140,CY=140,R_OUTER=128,R_TICK_IN=112,R_TICK_OUT=126,R_LABEL=98,R_ARC=80,R_ARC_W=14;
  const now=Date.now();
  let ticks='';
  for(let i=0;i<60;i++){
    const ang=(i/60)*2*Math.PI-Math.PI/2;
    const major=i%5===0;
    const r1=major?R_TICK_IN-2:R_TICK_IN+4;
    const x1=CX+r1*Math.cos(ang),y1=CY+r1*Math.sin(ang);
    const x2=CX+R_TICK_OUT*Math.cos(ang),y2=CY+R_TICK_OUT*Math.sin(ang);
    ticks+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${major?'#9fb3c8':'#3a4a5e'}" stroke-width="${major?2:1}"/>`;
  }
  const labArr=['Now','15','30','45','60','75','90','105','120','135','150','165'];
  let labels='';
  for(let i=0;i<12;i++){
    const ang=(i/12)*2*Math.PI-Math.PI/2;
    const x=CX+R_LABEL*Math.cos(ang),y=CY+R_LABEL*Math.sin(ang);
    labels+=`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="#cfd8e3" font-size="10" font-weight="600" text-anchor="middle" dominant-baseline="middle">${labArr[i]}</text>`;
  }
  function arcPath(startMin,endMin,radius){
    const a0=(startMin/180)*2*Math.PI-Math.PI/2;
    const a1=(endMin/180)*2*Math.PI-Math.PI/2;
    const large=(a1-a0)>Math.PI?1:0;
    const x0=CX+radius*Math.cos(a0),y0=CY+radius*Math.sin(a0);
    const x1=CX+radius*Math.cos(a1),y1=CY+radius*Math.sin(a1);
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  let arcs='';
  if(data.ready){
    data.windows.forEach((w,wi)=>{
      const s=Math.max(0,w.startMin),e=Math.min(180,Math.max(w.startMin+1,w.endMin));
      if(e<=s)return;
      const color=(typeof dbzHex==='function')?dbzHex(w.peakDbz):'#39ff14';
      const hasCells=w.cells&&w.cells.length;
      const cursor=hasCells?'pointer':'default';
      const handler=hasCells?` onclick="_rainClockSelectWindow(${wi})" style="cursor:${cursor}"`:'';
      arcs+=`<path d="${arcPath(s,e,R_ARC)}" stroke="${color}" stroke-width="${R_ARC_W}" fill="none" stroke-linecap="round" opacity="0.92"${handler}><title>${hasCells?'Tap for details · '+w.cells.length+' cell'+(w.cells.length!==1?'s':''):''}</title></path>`;
    });
  }
  const nextRain=_nextRainHourFromForecast();
  let centerLines=[];
  if(data.noLoc)centerLines=['Location','needed'];
  else if(data.stale)centerLines=['Radar stale','run a scan'];
  else if(data.empty){
    if(nextRain&&nextRain.mins<=360)centerLines=['Possible rain at',fmtClock(new Date(nextRain.time))];
    else if(nextRain)centerLines=['No threat of rain','next 3 hours'];
    else centerLines=['No rain expected','for hours'];
  }
  else if(data.windows.length===0){
    if(nextRain&&nextRain.mins<=360)centerLines=['Possible rain at',fmtClock(new Date(nextRain.time))];
    else if(nextRain)centerLines=['No threat of rain','next 3 hours'];
    else centerLines=['No rain expected','for hours'];
  }
  else{
    const w=data.windows[0];
    if(w.startMin===0){
      const endClock=fmtClock(new Date(now+w.endMin*60000));
      centerLines=['Rain until',endClock];
    }else{
      const startClock=fmtClock(new Date(now+w.startMin*60000));
      centerLines=['Rain starting at',startClock];
    }
  }
  let center='';
  const cy0=CY-((centerLines.length-1)*9)-4;
  centerLines.forEach((line,i)=>{
    const fs=i===0?13:16;
    const fw=i===0?600:700;
    const col=i===0?'#9fb3c8':'#e6edf3';
    center+=`<text x="${CX}" y="${cy0+i*18}" fill="${col}" font-size="${fs}" font-weight="${fw}" text-anchor="middle" dominant-baseline="middle">${line}</text>`;
  });
  const gradId='rc-grad-'+Math.floor(Math.random()*1e6).toString(36);
  const legend=`
    <defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#39ff14"/><stop offset="40%" stop-color="#ffeb3b"/>
      <stop offset="75%" stop-color="#ff9800"/><stop offset="100%" stop-color="#ff3355"/>
    </linearGradient></defs>
    <rect x="${CX-36}" y="${CY+34}" width="72" height="5" rx="2.5" fill="url(#${gradId})"/>
    <text x="${CX-40}" y="${CY+48}" fill="#9fb3c8" font-size="8" text-anchor="end">Light</text>
    <text x="${CX+40}" y="${CY+48}" fill="#9fb3c8" font-size="8" text-anchor="start">Heavy</text>`;
  let header='';
  if(data.ready&&data.windows.length){
    const w=data.windows[0];
    if(w.startMin===0){
      const endClock=fmtClock(new Date(now+w.endMin*60000));
      header=`<div style="font-size:0.72em;color:var(--text-secondary);text-align:center;margin-bottom:6px"><span style="color:var(--accent-cyan);font-weight:700">Rain End Time:</span> ${endClock}</div>`;
    }else{
      const startClock=fmtClock(new Date(now+w.startMin*60000));
      header=`<div style="font-size:0.72em;color:var(--text-secondary);text-align:center;margin-bottom:6px"><span style="color:var(--accent-cyan);font-weight:700">Rain Start Time:</span> ${startClock}</div>`;
    }
  }
  let sub='';
  if(data.nearest){
    sub=`<div style="font-size:0.7em;color:var(--text-secondary);text-align:center;margin-top:6px"><span style="color:var(--text-muted)">Nearest Precipitation:</span> <strong>${data.nearest.mi.toFixed(0)} mi</strong> to the ${data.nearest.dir}</div>`;
  }
  let foot='';
  if(data.motionUnknown&&!data.empty&&!data.stale&&!data.noLoc&&(S._rawScanPts||[]).length){
    foot=`<div style="font-size:0.6em;color:var(--text-muted);text-align:center;margin-top:4px;font-style:italic">Motion unknown — projection limited</div>`;
  }
  const hasClickable=data.ready&&data.windows.some(w=>w.cells&&w.cells.length);
  const hint=hasClickable?`<div style="font-size:0.6em;color:var(--text-muted);text-align:center;margin-top:2px;font-style:italic">Tap a colored arc to see which storms cause it</div>`:'';
  el.innerHTML=`
    <div class="card" style="padding:10px 8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="card-title m-0"><span class="icon">🌧️</span> Rain Clock · 3h</span>
        <span style="font-size:0.55em;color:var(--text-muted);letter-spacing:0.04em">RADAR ADVECTION</span>
      </div>
      ${header}
      <div style="display:flex;justify-content:center">
        <svg viewBox="0 0 ${SIZE} ${SIZE}" width="100%" style="max-width:300px;height:auto" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="rgba(10,16,32,0.55)" stroke="#1e2a3c" stroke-width="1"/>
          ${ticks}${labels}${arcs}${center}${legend}
        </svg>
      </div>
      ${sub}${foot}${hint}
      <div id="rain-clock-detail" style="margin-top:8px"></div>
    </div>`;
  if(S._rainClockSelectedIdx!=null&&data.ready&&data.windows[S._rainClockSelectedIdx]){
    _rainClockRenderDetail(S._rainClockSelectedIdx);
  }
}

function _rainClockSelectWindow(idx){
  const data=S._rainClockData;
  if(!data||!data.windows||!data.windows[idx])return;
  S._rainClockSelectedIdx=(S._rainClockSelectedIdx===idx)?null:idx;
  if(S._rainClockSelectedIdx==null){
    const panel=document.getElementById('rain-clock-detail');
    if(panel)panel.innerHTML='';
    return;
  }
  _rainClockRenderDetail(S._rainClockSelectedIdx);
}

function _rainClockRenderDetail(idx){
  const panel=document.getElementById('rain-clock-detail');
  if(!panel)return;
  const data=S._rainClockData;
  if(!data||!data.windows||!data.windows[idx]){panel.innerHTML='';return}
  const w=data.windows[idx];
  const now=Date.now();
  const startClock=fmtClock(new Date(now+w.startMin*60000));
  const endClock=fmtClock(new Date(now+w.endMin*60000));
  const etaTxt=w.startMin===0?`now → ${endClock}`:`${startClock} → ${endClock}`;
  const cells=w.cells||[];
  let rows='';
  if(!cells.length){
    rows=`<div style="font-size:0.7em;color:var(--text-muted);padding:4px 6px">No contributing cells identified for this window.</div>`;
  } else {
    cells.forEach(c=>{
      const color=(typeof dbzHex==='function')?dbzHex(c.dbz):'#39ff14';
      const dir=degToDir(c.bearing);
      const distMi=c.dist;
      const distStr=S.radarMetric?(distMi*1.609).toFixed(1)+' km':distMi.toFixed(1)+' mi';
      const cellEta=c.tIn===0?'overhead':`+${c.tIn}-${c.tOut} min`;
      const safeLat=c.lat.toFixed(5),safeLng=c.lng.toFixed(5);
      rows+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.05)">
        <span style="width:10px;height:24px;background:${color};border-radius:3px;flex-shrink:0"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.78em;color:var(--text-primary);font-weight:600">${c.dbz} dBZ · ${distStr} ${dir}</div>
          <div style="font-size:0.65em;color:var(--text-muted)">ETA ${cellEta}${c.count>1?' · '+c.count+' pixels':''}</div>
        </div>
        <button onclick="_rainClockViewCellOnRadar(${safeLat},${safeLng})" style="font-size:0.65em;padding:4px 8px;border-radius:6px;background:var(--accent-blue,#3b82f6);color:#fff;border:none;cursor:pointer;flex-shrink:0">View on radar</button>
      </div>`;
    });
  }
  panel.innerHTML=`
    <div style="background:rgba(10,16,32,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:0.72em;color:var(--accent-cyan);font-weight:700">Rain window · ${etaTxt}</span>
        <span onclick="_rainClockSelectWindow(${idx})" style="font-size:0.7em;color:var(--text-muted);cursor:pointer;padding:0 4px">✕</span>
      </div>
      <div style="font-size:0.65em;color:var(--text-muted);margin-bottom:6px">Peak ${w.peakDbz} dBZ · ${cells.length} cell${cells.length!==1?'s':''} contributing</div>
      ${rows}
    </div>`;
}

function _rainClockViewCellOnRadar(lat,lng){
  if(typeof switchPage==='function')switchPage('radar');
  const tryPan=()=>{
    if(S.map){
      try{S.map.setView([lat,lng],10,{animate:true,duration:0.5})}catch(e){}
      return true;
    }
    return false;
  };
  if(!tryPan()){
    let n=0;
    const iv=setInterval(()=>{if(tryPan()||++n>=10)clearInterval(iv)},250);
  }
}

let _rainClockLastDraw=0;
function refreshRainClock(force){
  const n=Date.now();
  if(!force&&n-_rainClockLastDraw<10000)return;
  _rainClockLastDraw=n;
  try{renderRainClock()}catch(e){console.log('rain clock failed:',e.message)}
  try{renderRainForecastBars()}catch(e){console.log('rain bars failed:',e.message)}
}

function _precipMmToDbz(mmPerHr){
  if(mmPerHr==null||mmPerHr<=0)return 0;
  return 10*Math.log10(200*Math.pow(mmPerHr,1.6));
}
function renderRainForecastBars(){
  const el=document.getElementById('rain-forecast-bars');
  if(!el)return;
  const h=S._hourlyData;
  if(!h||!h.time||!h.precipitation||!h.time.length){
    el.innerHTML='';return;
  }
  const now=Date.now();
  let startIdx=h.time.findIndex(t=>{const ts=new Date(t).getTime();return ts>=now-1800000});
  if(startIdx<0)startIdx=0;
  const HOURS=36;
  const slots=[];
  for(let i=0;i<HOURS;i++){
    const idx=startIdx+i;
    if(idx>=h.time.length)break;
    const mm=h.precipitation[idx]||0;
    slots.push({t:new Date(h.time[idx]).getTime(),mm});
  }
  if(!slots.length){el.innerHTML='';return;}
  const total=slots.reduce((a,s)=>a+s.mm,0);
  const maxMm=Math.max(0.05,...slots.map(s=>s.mm));
  const W=300,H=110,padL=8,padR=8,padT=14,padB=22;
  const innerW=W-padL-padR,innerH=H-padT-padB;
  const barW=innerW/slots.length;
  let bars='';
  for(let i=0;i<slots.length;i++){
    const s=slots[i];
    const hPx=s.mm>0?Math.max(2,(s.mm/maxMm)*innerH):0;
    if(hPx<=0)continue;
    const x=padL+i*barW;
    const y=padT+innerH-hPx;
    const dbz=_precipMmToDbz(s.mm);
    const col=(typeof dbzHex==='function')?dbzHex(dbz):'#39ff14';
    bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1,barW-0.5).toFixed(1)}" height="${hPx.toFixed(1)}" fill="${col}" opacity="0.92" rx="1"/>`;
  }
  const baseY=padT+innerH;
  let axisLine=`<line x1="${padL}" y1="${baseY}" x2="${W-padR}" y2="${baseY}" stroke="#3a4a5e" stroke-width="1"/>`;
  const tickHours=[0,6,12,24,36];
  let xTicks='';
  for(const th of tickHours){
    if(th>slots.length)continue;
    const x=padL+th*barW;
    let lbl;
    if(th===0)lbl='Now';
    else if(th<slots.length)lbl=fmtClock(new Date(slots[th].t));
    else lbl=fmtClock(new Date(slots[slots.length-1].t+3600000));
    xTicks+=`<line x1="${x.toFixed(1)}" y1="${baseY}" x2="${x.toFixed(1)}" y2="${baseY+3}" stroke="#5a6a7e" stroke-width="1"/>`;
    xTicks+=`<text x="${x.toFixed(1)}" y="${(baseY+13).toFixed(1)}" fill="#9fb3c8" font-size="8" text-anchor="${th===36?'end':'middle'}">${lbl}</text>`;
  }
  const maxLbl=(typeof fmtPrecip==='function')?fmtPrecip(maxMm):(maxMm.toFixed(2)+' mm');
  const totalLbl=(typeof fmtPrecip==='function')?fmtPrecip(total):(total.toFixed(2)+' mm');
  const peakBadge=`<text x="${W-padR}" y="10" fill="#9fb3c8" font-size="8" text-anchor="end">peak ${maxLbl}/hr</text>`;
  const empty=total<=0.01;
  el.innerHTML=`
    <div class="card" style="padding:8px 8px 6px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="card-title m-0" style="font-size:0.78em"><span class="icon">📊</span> Total Precipitation Next 36 hrs</span>
        <span style="font-size:0.6em;color:var(--text-muted)">total ${totalLbl}</span>
      </div>
      ${empty?`<div style="font-size:0.7em;color:var(--text-secondary);text-align:center;padding:18px 6px">No measurable rain in the next 36 hours.</div>`:`
      <div style="display:flex;justify-content:center">
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:340px;height:auto" xmlns="http://www.w3.org/2000/svg">
          ${peakBadge}${bars}${axisLine}${xTicks}
        </svg>
      </div>`}
    </div>`;
}
