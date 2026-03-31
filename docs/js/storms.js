// ==========================================
// RADAR-BASED STORM DETECTION
// Two-phase adaptive scan matching main app approach
// NEXRAD primary (US) + RainViewer fallback (global)
// ==========================================
function isUSLocation(lat,lon){
  return lat>=24&&lat<=50&&lon>=-125&&lon<=-66;
}
function isNWSCoverage(lat,lon){
  if(lat>=24&&lat<=50&&lon>=-125&&lon<=-66)return true;
  if(lat>=51&&lat<=72&&lon>=-180&&lon<=-129)return true;
  if(lat>=18.5&&lat<=22.5&&lon>=-161&&lon<=-154)return true;
  if(lat>=17.5&&lat<=18.7&&lon>=-67.5&&lon<=-65)return true;
  if(lat>=17&&lat<=19&&lon>=-65.5&&lon<=-64)return true;
  if(lat>=13&&lat<=14&&lon>=144&&lon<=145)return true;
  if(lat>=-15&&lat<=-14&&lon>=-171&&lon<=-170)return true;
  return false;
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
    const _wUrl='https://api.open-meteo.com/v1/forecast?'+params;
    let r;
    try{
      r=await fetch(_wUrl,{signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw new Error('HTTP '+r.status);
    }catch(e1){
      console.log('Winds aloft: first attempt failed ('+e1.message+') — retrying in 2s...');
      await new Promise(w=>setTimeout(w,2000));
      r=await fetch(_wUrl,{signal:AbortSignal.timeout(6000)});
      if(!r.ok){console.log('Winds aloft: retry also failed (HTTP '+r.status+')');return}
      console.log('Winds aloft: retry succeeded');
    }
    const d=await r.json();
    const c=d.current;
    const levels=[
      {p:1013,sk:'wind_speed_10m',dk:'wind_direction_10m',w:0.5,isSfc:true},
      {p:925,sk:'wind_speed_925hPa',dk:'wind_direction_925hPa',w:0.8},
      {p:850,sk:'wind_speed_850hPa',dk:'wind_direction_850hPa',w:1.5},
      {p:700,sk:'wind_speed_700hPa',dk:'wind_direction_700hPa',w:2.5},
      {p:500,sk:'wind_speed_500hPa',dk:'wind_direction_500hPa',w:1.5}
    ];
    const aloftSpeeds=[];
    levels.forEach(l=>{
      const spd=c[l.sk],dir=c[l.dk];
      if(spd==null||dir==null)return;
      aloftSpeeds.push({p:l.p,spd:spd*3.6,dir,rawMs:spd,isSfc:!!l.isSfc});
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
    const steering=aloftSpeeds.filter(a=>a.p<=850);
    if(!steering.length)return;
    let tx=0,ty=0;
    steering.forEach(a=>{
      const spdKt=a.rawMs*1.944;
      const movDir=(a.dir+180)%360;
      const rad=movDir*Math.PI/180;
      tx+=Math.sin(rad)*spdKt;
      ty+=Math.cos(rad)*spdKt;
    });
    const ax=tx/steering.length,ay=ty/steering.length;
    const spdKt=Math.sqrt(ax*ax+ay*ay);
    let dir=(Math.atan2(ax,ay)*180/Math.PI+360)%360;
    const spdMph=Math.round(spdKt*1.151);
    S.stormMovement={direction:Math.round(dir),speed:spdMph};
    S._windCache={lat,lon,ts:Date.now(),dir:Math.round(dir),speed:spdMph};
    console.log('[WindsAloft] Per-level: '+aloftSpeeds.map(a=>a.p+'hPa='+a.rawMs.toFixed(1)+'m/s@'+a.dir+'°').join(', '));
    console.log('[WindsAloft] Steering (850-500hPa): '+steering.map(a=>a.p+'hPa').join(',')+' Vx='+ax.toFixed(2)+' Vy='+ay.toFixed(2)+' → '+spdKt.toFixed(1)+'kt '+Math.round(dir)+'° → '+spdMph+' mph');
    if(S.map&&S._showPathArrows)buildPathArrows(S.map);
  }catch(e){console.log('Winds aloft fetch failed:',e.message)}
}

async function fetchAFD(){
  if(!S.lat||!S.lon)return;
  if(!isUSLocation(S.lat,S.lon)){console.log('[non-US] Skipped: NWS Area Forecast Discussion');S._afd=null;return;}
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
    if(humid>=70&&spread<=2)moistRat=9;else if(humid>=60&&spread<=4)moistRat=7;else if(humid>=50&&spread<=8)moistRat=5;else if(humid>=40)moistRat=2;
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
  const vecShearKmh=S._windShear.speedDiff;
  const vecShearMph=vecShearKmh*0.621371;
  let severity='Light';
  if(vecShearMph>=25)severity='Strong';else if(vecShearMph>=15)severity='Moderate';
  let impact='Minimal turbulence expected';
  if(vecShearMph>=25)impact='Significant turbulence likely — hazardous for light aircraft';
  else if(vecShearMph>=15)impact='Moderate turbulence possible — use caution';
  else if(vecShearMph>=8)impact='Light chop possible';
  const pToAlt={1013:'Surface',925:'~2,500 ft',850:'~5,000 ft',700:'~10,000 ft',500:'~18,000 ft'};
  return{
    vectorShear:fmtWind(vecShearKmh),
    severity,
    dirDiff:S._windShear.dirDiff,
    surfaceWind:`${degToDir(sfc.dir)} at ${fmtWind(sfc.spd)}`,
    upperWind:`${degToDir(upper.dir)} at ${fmtWind(upper.spd)} (${pToAlt[upper.p]||upper.p+'hPa'})`,
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
  const reqId=S._locReqId;
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
    if(reqId!==S._locReqId)return;
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
  const _cHasMv=S.stormMovement&&S.stormMovement.speed&&S.stormMovement.speed>=2;
  const _cHasAl=S._upperWindDir!=null;
  const _cMv=_cHasMv?S.stormMovement:(_cHasAl?{direction:(S._upperWindDir+180)%360,speed:S._upperWindSpd?Math.round(S._upperWindSpd*0.621371):10}:null);
  if(!_cMv||_cMv.speed<2)return{eta:null,impact:0,approaching:false};
  const cellTrack=getCellTrack(storm);
  const movDir=cellTrack?cellTrack.dir:_cMv.direction;
  const movSpd=cellTrack?cellTrack.speed:_cMv.speed;
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
  if(storm._hookEcho)pct=Math.max(pct,Math.min(100,pct+15));
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

function computeTopStorms(){
  S._topStorms=[];
  S._topStormAnalysis={inbound:[],overhead:[],nearby:[],allWithEta:[]};
  if(!S.storms||!S.storms.length)return;
  for(const s of S.storms){s._eta=calcStormETA(s)}
  S._topStormAnalysis.allWithEta=S.storms;
  const inbound=[],overhead=[],nearby=[];
  for(const s of S.storms){
    const e=s._eta;
    if(e&&e.proximity){overhead.push(s)}
    else if(s.dbz>=31&&e&&e.approaching&&e.impact>0&&e.eta!=null){inbound.push(s)}
    else{nearby.push(s)}
  }
  inbound.sort((a,b)=>b.dbz===a.dbz?(a._eta.eta-b._eta.eta):(b.dbz-a.dbz));
  S._topStorms=inbound.slice(0,12);
  const overflow=inbound.slice(12);
  S._topStormAnalysis.inbound=S._topStorms;
  S._topStormAnalysis.overhead=overhead;
  S._topStormAnalysis.nearby=nearby.concat(overflow);
}

async function scanRadarForStorms(){
  if(S._radarAnimPlaying)stopRadarAnim(S.map);
  if(!S.lat)return;
  const reqId=S._locReqId;
  if(!S._etaRescanInProgress)S._stormETAs={};
  clearViewScanCircle();
  const useNexrad=S.radarSource==='nexrad';
  showScanOverlay();
  if(reqId!==S._locReqId){hideScanOverlay();return}
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
        const rv=await fetch('https://api.rainviewer.com/public/weather-maps.json',{signal:AbortSignal.timeout(6000)}).then(r=>r.json());
        const past=rv.radar?.past||[];
        const nowcast=rv.radar?.nowcast||[];
        const allFrames=past.concat(nowcast);
        S.radarFrames=allFrames;
        S._rvTilePath=allFrames.length?allFrames[allFrames.length-1].path:null;
      }catch(e){S._rvTilePath=null}
      if(!S._rvTilePath){toast('No radar data available');S.storms=[];computeTopStorms();renderStorms();updateStormBadges();return}
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
    _clusterSonarPoints();
    S.storms=spacingFilter(rawPoints).sort((a,b)=>a.distance-b.distance);
    console.log('[SCAN] after spacingFilter: '+S.storms.length+' storms');
    detectHookEchoes(rawPoints, S.storms);
    S.scanTime=Date.now();S.lastScanMs=Date.now();S._lastScanWasHiRes=false;
    computeTopStorms();

    const srcLabel=useNexrad?'NEXRAD':'RainViewer';
    scanStep(3,`Plotting ${S.storms.length} storm points...`);
    await new Promise(r=>setTimeout(r,300));
    if(reqId!==S._locReqId){hideScanOverlay();return}
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
    setTimeout(()=>{checkStormCellAlerts()},600);
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
    html+=`<div class="flex-gap-8">`;
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
    const hailIn = r.type === 'hail' && r.magnitude ? (parseFloat(r.magnitude) / 100).toFixed(2) : r.magnitude;
    const label = r.type === 'tornado' ? 'Tornado' : r.type === 'hail' ? 'Hail (' + hailIn + '")' : 'Wind (' + r.magnitude + ' mph)';
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
    return `<div class="card mt-12"><div class="card-title"><span class="icon">🌀</span> Tropical Cyclones</div>
      <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.8em">🔄 Loading tropical data...</div></div>`;
  }
  const systems = _getFilteredSystems() || [];
  const regionPills = _STORM_REGIONS.map(r => {
    const count = r.id === 'all' ? allSystems.length : allSystems.filter(s => s._region === r.id).length;
    const isActive = S._nhcRegionFilter === r.id;
    return `<button onclick="setNHCRegionFilter('${r.id}')" style="font-size:0.6em;padding:2px 8px;border-radius:12px;border:1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-subtle)'};background:${isActive ? 'rgba(0,229,255,0.15)' : 'var(--bg-surface)'};color:${isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'};cursor:pointer;font-weight:${isActive ? '700' : '500'};white-space:nowrap">${r.label}${count ? ' (' + count + ')' : ''}</button>`;
  }).join('');
  if (!allSystems.length) {
    return `<div class="card mt-12"><div class="card-title"><span class="icon">🌀</span> Tropical Cyclones</div>
      <div style="text-align:center;padding:16px;color:var(--accent-green);font-size:0.8em">✅ No active tropical systems</div>
      <div style="font-size:0.6em;color:var(--text-muted);text-align:center;padding:0 8px 8px">Data: NHC + JTWC · ArcGIS + RSS</div></div>`;
  }
  let html = `<div class="card mt-12"><div class="card-title flex-between"><span><span class="icon">🌀</span> Tropical Cyclones (${systems.length}${S._nhcRegionFilter !== 'all' ? '/' + allSystems.length : ''})</span><label style="display:flex;align-items:center;gap:4px;font-size:0.65em;font-weight:500;color:var(--text-muted);cursor:pointer"><span>Map</span><input type="checkbox" ${S._showNHCTracks ? 'checked' : ''} onchange="toggleNHCTracks(this.checked)" class="accent-cyan-check"></label></div>`;
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
    html += `<div class="text-center-muted" style="padding:12px">No active systems in ${filterLabel}</div>`;
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
        <span class="text-13">🌀</span>
        <div class="flex-1">
          <div style="font-weight:700;font-size:0.95em;color:var(--text-primary)">${s.type} ${s.name}</div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:0.7em;color:${cat.color};font-weight:700">${cat.label}${cat.num >= 1 ? ' (Category ' + cat.num + ')' : ''}</span>
            ${status ? `<span style="font-size:0.55em;padding:1px 6px;border-radius:8px;background:${status.bg};color:${status.color};font-weight:700">${status.text}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;font-size:0.75em">
          <div class="c-muted">${distStr}</div>
          <div class="c-muted-85">${bearing}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px">
        ${s.maxWind != null ? `<div class="text-center-box"><div class="tile-label-upper" style="letter-spacing:normal">Max Wind</div><div style="font-size:0.9em;font-weight:700;color:${cat.color}">${s.maxWind} mph${s.gusts ? '<span class="text-muted-sm"> G' + s.gusts + '</span>' : ''}</div></div>` : ''}
        ${s.minPressure != null ? `<div class="text-center-box"><div class="tile-label-upper" style="letter-spacing:normal">Pressure</div><div style="font-size:0.9em;font-weight:700;color:var(--text-primary)">${s.minPressure} mb</div></div>` : ''}
        ${s.moveDir ? `<div class="text-center-box"><div class="tile-label-upper" style="letter-spacing:normal">Movement</div><div style="font-size:0.9em;font-weight:700;color:var(--text-primary)">${s.moveDir}${s.moveSpeed ? ' ' + s.moveSpeed + ' mph' : ''}</div></div>` : ''}
      </div>
      ${s.lat != null ? `<div style="font-size:0.65em;color:var(--text-muted);margin-top:4px">📍 ${Math.abs(s.lat).toFixed(1)}°${s.lat >= 0 ? 'N' : 'S'}, ${Math.abs(s.lon).toFixed(1)}°${s.lon >= 0 ? 'E' : 'W'} · ${(_STORM_REGIONS.find(r => r.id === s._region) || {}).label || s.basin}${s._source === 'jtwc' ? ' (JTWC)' : ''}${hasForecast ? ' · <span class="c-cyan">Tap for forecast track</span>' : ''}</div>` : ''}
    </div>`;
  });
  html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px 2px">
    <div class="flex-center-gap4"><span class="text-hint">Alert radius:</span>
      <select onchange="setNHCProxRadius(this.value)" style="font-size:0.6em;padding:1px 4px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px">${[100,200,300,500,750,1000].map(r=>`<option value="${r}"${r===S._nhcProxRadius?' selected':''}>${r} mi</option>`).join('')}</select></div>
    <span class="text-hint">NHC + JTWC · 15-min</span></div></div>`;
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
      ${s.minPressure ? `<div class="text-sm">🔵 Pressure: <b>${s.minPressure} mb</b></div>` : ''}
      ${s.moveDir ? `<div class="text-sm">➡️ Moving: <b>${s.moveDir} ${s.moveSpeed || ''} mph</b></div>` : ''}
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
  let html = `<div class="card mt-12"><div class="card-title"><span class="icon">🌊</span> Storm Surge & Coastal Flooding (${surgeAlerts.length})</div>`;
  surgeAlerts.forEach(a => {
    const p = a.properties || {};
    const ev = p.event || 'Storm Surge Alert';
    const desc = (p.description || '');
    const surgeMatch = desc.match(/(\d+[\.\d]*)\s*(?:to\s*(\d+[\.\d]*))?\s*(?:feet|ft)\s*(?:above|of\s+storm\s+surge)/i);
    const surgeStr = surgeMatch ? (surgeMatch[2] ? surgeMatch[1] + '-' + surgeMatch[2] + ' ft' : surgeMatch[1] + ' ft') : null;
    const inZone = isUserInAlertZone(a);
    const isSurgeWarn = ev.toLowerCase().includes('storm surge warning');
    html += `<div style="padding:8px 10px;border-left:4px solid ${isSurgeWarn ? '#3b82f6' : '#06b6d4'};background:${isSurgeWarn ? 'rgba(59,130,246,0.06)' : 'rgba(6,182,212,0.06)'};border-radius:0 8px 8px 0;margin-bottom:6px">
      <div class="flex-label-row">
        <span style="font-size:1.1em">🌊</span>
        <span style="font-weight:700;font-size:0.85em;color:${isSurgeWarn ? '#3b82f6' : '#06b6d4'}">${ev}</span>
        ${inZone ? '<span style="font-size:0.6em;background:rgba(59,130,246,0.2);color:#60a5fa;padding:1px 6px;border-radius:8px;font-weight:700;animation:tornado-pulse 2s ease-in-out infinite">YOUR AREA</span>' : ''}
      </div>
      ${surgeStr ? `<div style="font-size:0.85em;font-weight:700;color:#3b82f6;margin-bottom:4px">⬆️ Expected surge: ${surgeStr} above normal tide levels</div>` : ''}
      <div style="font-size:0.7em;color:var(--text-secondary);max-height:80px;overflow:hidden;text-overflow:ellipsis">${desc.substring(0, 300)}${desc.length > 300 ? '...' : ''}</div>
      ${p.expires ? `<div style="font-size:0.65em;color:var(--text-muted);margin-top:4px">⏱️ Expires: ${new Date(p.expires).toLocaleString()}</div>` : ''}
    </div>`;
  });
  html += `<div class="text-hint-right">Data: National Weather Service</div></div>`;
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
    <div class="flex-1">
      <div style="font-weight:700;font-size:0.85em;color:${borderColor}">${storm.type} ${storm.name} — ${cat.label}</div>
      <div class="text-secondary-sm">${reason}${status ? ' · ' + status.text : ''}</div>
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
function _threatScoreRaw(s){
  const e=s._eta;
  return Math.pow(s.dbz||0,2)*(e&&e.approaching?2:0.5)/Math.sqrt(Math.max(s.distance,0.5));
}
function stormThreatScore10(s){
  const raw=_threatScoreRaw(s);
  let scaled=Math.log10(Math.max(raw,1))/Math.log10(12100)*10;
  if(s._hookEcho)scaled=scaled*1.25;
  return Math.max(1,Math.min(10,Math.round(scaled*10)/10));
}
function _stormSortFn(a,b,key){
  if(key==='dbz')return b.dbz-a.dbz;
  if(key==='dist')return a.distance-b.distance;
  if(key==='eta'){
    const ea=a._eta&&a._eta.approaching&&a._eta.eta!=null?a._eta.eta:99999;
    const eb=b._eta&&b._eta.approaching&&b._eta.eta!=null?b._eta.eta:99999;
    return ea-eb;
  }
  if(key==='threat'){
    const sa=stormThreatScore10(a),sb=stormThreatScore10(b);
    if(Math.abs(sa-sb)<0.15)return 0;
    return sb-sa;
  }
  if(key==='impact'){
    const ia=a._eta?a._eta.impact||0:0;
    const ib=b._eta?b._eta.impact||0:0;
    return ib-ia;
  }
  return 0;
}
function _applyStormFilter(storms,f){
  let out=storms;
  if(f.minDbz>0)out=out.filter(s=>s.dbz>=f.minDbz);
  if(f.maxDist>0)out=out.filter(s=>s.distance<=f.maxDist);
  const _fHasMv=S.stormMovement&&S.stormMovement.speed&&S.stormMovement.speed>=2;
  const _fHasAl=S._upperWindDir!=null;
  const noMv=!_fHasMv&&!_fHasAl;
  if(f.approachOnly&&!noMv)out=out.filter(s=>{const e=s._eta;return e&&e.approaching&&e.eta!=null});
  S._filterApproachBypassed=f.approachOnly&&noMv;
  out.sort((a,b)=>{const r=_stormSortFn(a,b,f.sort1);return r!==0?r:_stormSortFn(a,b,f.sort2)});
  return out;
}
function _smartStormSummary(storms){
  const _hasMv=S.stormMovement&&S.stormMovement.speed&&S.stormMovement.speed>=2;
  const _hasAl=S._upperWindDir!=null;
  const mv=_hasMv?S.stormMovement:(_hasAl?{direction:(S._upperWindDir+180)%360,speed:S._upperWindSpd?Math.round(S._upperWindSpd*0.621371):10}:null);
  if(!storms.length||!mv||mv.speed<2)return'';
  const approaching=storms.filter(s=>{const e=s._eta;return e&&e.approaching&&e.eta!=null});
  if(!approaching.length)return'<div style="padding:8px 12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:8px;font-size:0.8em;color:#4ade80;margin-bottom:8px">No storms currently approaching your location.</div>';
  approaching.sort((a,b)=>a._eta.eta-b._eta.eta);
  const light=approaching.filter(s=>s.dbz<40);
  const moderate=approaching.filter(s=>s.dbz>=40&&s.dbz<50);
  const severe=approaching.filter(s=>s.dbz>=50);
  const now=Date.now();
  const fmtEtaShort=(min)=>{const s=Math.round(min*60);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return(h>0?String(h).padStart(2,'0')+'h:':'')+String(m).padStart(2,'0')+'m:'+String(sec).padStart(2,'0')+'s';};
  const fmtTime=(min)=>fmtClockShort(new Date(now+min*60000));
  const tierSpan=(min,label)=>{const tgt=now+min*60000;return`<span class="tier-eta-cd" data-tier-target="${tgt}"><b>${fmtEtaShort(min)}</b> (${fmtTime(min)})</span>`};
  let lines=[];
  if(light.length){
    const first=light[0];
    lines.push(`<span style="color:#00ffcc">🔵 Light rain</span> inbound starting in ${tierSpan(first._eta.eta)}${light.length>1?' — '+light.length+' cells':''}`);
  }
  if(moderate.length){
    const first=moderate[0];
    lines.push(`<span style="color:#ffee00">🟡 Moderate to heavy</span> cells inbound, ETA ${tierSpan(first._eta.eta)}${moderate.length>1?' — '+moderate.length+' cells':''}`);
  }
  if(severe.length){
    const first=severe[0];
    lines.push(`<span style="color:#ff0033">🔴 Severe/intense</span> cells inbound, ETA ${tierSpan(first._eta.eta)}${severe.length>1?' — '+severe.length+' cells':''}`);
  }
  return`<div style="padding:8px 12px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:8px;font-size:0.78em;line-height:1.6;margin-bottom:8px">${lines.join('<br>')}</div>`;
}
function _renderFilterBar(f){
  const sortOpts=[['threat','Threat Score'],['impact','Highest Impact'],['dbz','Strongest'],['eta','Soonest ETA'],['dist','Closest']];
  const mkOpts=(sel)=>sortOpts.map(([v,l])=>`<option value="${v}"${sel===v?' selected':''}>${l}</option>`).join('');
  return`<div class="card" style="padding:8px 10px;margin-bottom:8px">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.72em">
      <span style="font-weight:700;color:var(--text-secondary)">Sort:</span>
      <select id="sf-sort1" onchange="updateStormFilter()" oninput="updateStormFilter()" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em">${mkOpts(f.sort1)}</select>
      <span class="c-muted">then</span>
      <select id="sf-sort2" onchange="updateStormFilter()" oninput="updateStormFilter()" style="background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em">${mkOpts(f.sort2)}</select>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.72em;margin-top:6px">
      <span style="font-weight:700;color:var(--text-secondary)">Filter:</span>
      <label style="display:flex;align-items:center;gap:3px;color:var(--text-secondary)">Min dBZ
        <input id="sf-mindbz" type="number" inputmode="numeric" min="0" max="75" step="5" value="${f.minDbz||0}" oninput="updateStormFilter()" onchange="updateStormFilter()" onblur="updateStormFilter()" style="width:42px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em;text-align:center">
      </label>
      <label style="display:flex;align-items:center;gap:3px;color:var(--text-secondary)">Max dist
        <input id="sf-maxdist" type="number" inputmode="numeric" min="0" max="200" step="5" value="${f.maxDist||0}" oninput="updateStormFilter()" onchange="updateStormFilter()" onblur="updateStormFilter()" style="width:42px;background:var(--bg-card);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;padding:2px 4px;font-size:1em;text-align:center">
        <span class="c-muted">${S.radarMetric?'km':'mi'}</span>
      </label>
      <label style="display:flex;align-items:center;gap:3px;cursor:pointer;color:var(--text-secondary)">
        <input id="sf-approach" type="checkbox" ${f.approachOnly?'checked':''} onchange="updateStormFilter()"> Approaching only
      </label>
    </div>
  </div>`;
}
let _sfDebounce=null;
function updateStormFilter(){
  const f={
    sort1:document.getElementById('sf-sort1')?.value||'threat',
    sort2:document.getElementById('sf-sort2')?.value||'eta',
    minDbz:parseInt(document.getElementById('sf-mindbz')?.value)||0,
    maxDist:parseInt(document.getElementById('sf-maxdist')?.value)||0,
    approachOnly:document.getElementById('sf-approach')?.checked||false
  };
  _saveStormFilter(f);
  if(typeof updateThreatTicker==='function')updateThreatTicker();
  if(_sfDebounce)clearTimeout(_sfDebounce);
  _sfDebounce=setTimeout(()=>{
    _sfDebounce=null;
    renderStorms();
  },150);
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
  const _hasMovement=S.stormMovement&&S.stormMovement.speed&&S.stormMovement.speed>=2;
  const _hasAloft=S._upperWindDir!=null;
  const mv=_hasMovement?S.stormMovement:(_hasAloft?{direction:(S._upperWindDir+180)%360,speed:S._upperWindSpd?Math.round(S._upperWindSpd*0.621371):10}:null);
  if(mv&&mv.speed>=2){storms.forEach(s=>{s._eta=calcStormETA(s)})}else{storms.forEach(s=>{if(!s._eta)s._eta=calcStormETA(s)})}
  let inConeCount=0;
  if(mv&&mv.speed>=2){
    const uLat=S.lat,uLng=S.lon;
    storms.forEach(s=>{
      const range=Math.min(60,Math.max(s.distance*1.5,20));
      const dir=mv.direction;
      const baseWidthMi=Math.max(0,Math.min(3,(s.dbz-20)/15));
      const perpL=(dir-90+360)%360;
      const perpR=(dir+90)%360;
      let pts;
      if(baseWidthMi>0.1){
        const bL=destPoint(s.lat,s.lng,perpL,baseWidthMi);
        const bR=destPoint(s.lat,s.lng,perpR,baseWidthMi);
        const fL=destPoint(bL[0],bL[1],dir-15,range);
        const fC=destPoint(s.lat,s.lng,dir,range);
        const fR=destPoint(bR[0],bR[1],dir+15,range);
        pts=[bL,fL,fC,fR,bR];
      }else{
        const fL=destPoint(s.lat,s.lng,dir-15,range);
        const fC=destPoint(s.lat,s.lng,dir,range);
        const fR=destPoint(s.lat,s.lng,dir+15,range);
        pts=[[s.lat,s.lng],fL,fC,fR,[s.lat,s.lng]];
      }
      let inside=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const yi=pts[i][0],xi=pts[i][1],yj=pts[j][0],xj=pts[j][1];
        if(((yi>uLat)!==(yj>uLat))&&(uLng<(xj-xi)*(uLat-yi)/(yj-yi)+xi))inside=!inside;
      }
      if(inside)inConeCount++;
    });
  }
  const sf=S._stormFilter||_loadStormFilter();
  const filtered=_applyStormFilter(storms,sf);
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
      const ts10=stormThreatScore10(s);
      const tsColor=ts10>=8?'#ef4444':ts10>=6?'#f97316':ts10>=4?'#facc15':'#4ade80';
      const tsLabel=ts10>=8?'EXTREME':ts10>=6?'HIGH':ts10>=4?'MODERATE':'LOW';
      return`<div class="storm-cell-card ${pulse}" style="border-color:${isHook?'#ff1744':hex};--pulse-color:${isHook?'#ff1744':hex}${isHook?';animation:tornado-pulse 1.8s ease-in-out infinite,storm-pulse 2.5s ease-in-out infinite':''}">
        <div class="storm-header"><span style="font-weight:700">${cellIcon} ${cellName}</span>${hookBadge}<span class="storm-badge" style="background:${hex}22;color:${hex};border:1px solid ${hex}44">${tStr(cat.label)}</span></div>
        <div style="display:flex;align-items:center;gap:6px;margin:4px 0 2px;font-size:0.7em"><span style="font-weight:700;color:var(--text-secondary)">Threat:</span><span style="color:${tsColor};font-weight:700;font-size:1.1em">${ts10.toFixed(1)}</span><span style="color:${tsColor};font-size:0.85em;font-weight:600">/10 ${tsLabel}</span></div>
        <div class="storm-detail-grid">
          <div class="storm-detail"><div class="storm-detail-label">${tStr('Peak dBZ')}</div><div class="storm-detail-val" style="color:${cat.color}">${s.dbz}</div></div>
          <div class="storm-detail tappable-unit" onclick="toggleStormUnits()"><div class="storm-detail-label">${tStr('Rain Rate')}</div><div class="storm-detail-val">${cat.rain}</div><div class="tile-tap">tap</div></div>
          <div class="storm-detail tappable-unit" onclick="toggleStormUnits()"><div class="storm-detail-label">${tStr('Distance')}</div><div class="storm-detail-val"><span data-dist-mi="${s.distance}" data-closing-mph="${eta&&eta.closingSpeed?eta.closingSpeed:0}" data-target-ms="${eta&&eta._targetMs?eta._targetMs:0}">${(()=>{const cs=eta&&eta.closingSpeed?eta.closingSpeed:0;const tgt=eta&&eta._targetMs?eta._targetMs:0;if(cs>0&&tgt>Date.now()){const rh=Math.max(0,(tgt-Date.now())/3600000);return fmtStormDist(rh*cs)}return fmtStormDist(s.distance)})()}</span></div><div class="tile-tap">tap</div></div>
          <div class="storm-detail"><div class="storm-detail-label">${tStr('Bearing')}</div><div class="storm-detail-val">${degToDir(s.bearing)} (${String(Math.round(s.bearing)).padStart(3,'0')}°)</div></div>
          ${mvLine}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
          <span class="text-hint">
            ${s.lat.toFixed(3)}°N, ${Math.abs(s.lng).toFixed(3)}°${s.lng<0?'W':'E'} &middot; ${s.pixels} returns
          </span>
          <button onclick="flyToStorm(${s.lat},${s.lng})" style="font-size:0.55em;padding:2px 8px;background:rgba(0,229,255,0.08);color:var(--accent-cyan);border:1px solid rgba(0,229,255,0.25);border-radius:5px;cursor:pointer;font-weight:600;white-space:nowrap">📍 Map</button>
        </div>
      </div>`;
  }
  computeTopStorms();
  const fKeys=new Set(filtered.map(stormKey));
  const a=S._topStormAnalysis;
  const inKeySet=new Set(a.inbound.map(stormKey));
  const ohKeySet=new Set(a.overhead.map(stormKey));
  let inboundCapped=filtered.filter(s=>inKeySet.has(stormKey(s)));
  inboundCapped.sort((x,y)=>{const r=_stormSortFn(x,y,sf.sort1);return r!==0?r:_stormSortFn(x,y,sf.sort2)});
  inboundCapped=inboundCapped.slice(0,12);
  const overhead=filtered.filter(s=>ohKeySet.has(stormKey(s)));
  const nearby=filtered.filter(s=>!inKeySet.has(stormKey(s))&&!ohKeySet.has(stormKey(s)));
  let groupHtml='';
  const sections=[
    {key:'approaching',items:inboundCapped,label:'⏱️ Inbound',color:'#ef4444',open:true},
    {key:'overhead',items:overhead,label:'⚠️ Overhead / Arrived',color:'#f97316',open:false},
    {key:'nearby',items:nearby,label:'🟢 Nearby / Outbound',color:'#4ade80',open:false}
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
          <div class="flex-1" style="min-width:0">
            <div style="font-weight:600;font-size:0.8em">${dir} <span style="color:var(--text-muted);font-weight:400">${bearStr}</span></div>
            <div class="text-muted-sm">${distStr} · ${z.count} return${z.count>1?'s':''}</div>
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
  const stormCount=inboundCapped.length+overhead.length+nearby.length;
  const filteredCount=filtered.length;
  const totalCount=storms.length;
  const filterNote=filteredCount<totalCount?` <span class="c-muted-85">(showing ${filteredCount}/${totalCount})</span>`:'';
  const smartSummary=_smartStormSummary(storms);
  const noWindBanner=(!mv||mv.speed<2)?`<div style="padding:8px 12px;background:rgba(255,204,0,0.08);border:1px solid rgba(255,204,0,0.2);border-radius:8px;font-size:0.78em;line-height:1.5;margin-bottom:8px;color:#facc15">💨 Wind data unavailable or calm — ETA and approach calculations are limited.${S._filterApproachBypassed?' <strong>"Approaching only" filter bypassed</strong> — showing all storms.':''}</div>`:'';
  el.innerHTML=`${zoneAlert}
    <div class="alert-banner ${severe?'danger':'warning'}">
      <span class="alert-icon">${severe?'🚨':'⚠️'}</span>
      <div class="alert-text"><span class="alert-title">${storms.length} Cell${storms.length>1?'s':''} Detected${stormCount?' · '+stormCount+' Storm'+(stormCount>1?'s':''):''}</span>${filterNote}${inboundCapped.length?' · <span style="color:#ef4444">'+inboundCapped.length+' inbound</span>':''}${mv&&mv.speed>=2?'<br><span style="color:'+(inConeCount>0?'#ff9800':'#6b7280')+'">🎯 You are currently in '+inConeCount+' storm track cone'+(inConeCount!==1?'s':'')+'</span>':''}<br>Within ${S.radarMetric?(S.scanRadius*1.60934).toFixed(0)+' km':S.scanRadius+' mi'}${mv&&mv.speed>=2?' · Moving '+degToDir(mv.direction)+' ('+Math.round(mv.direction)+'°) at '+(S.radarMetric?Math.round(mv.speed*1.60934)+' km/h':mv.speed+' mph'):''}<br><span id="auto-scan-status" class="c-muted-sm"></span></div>
    </div>
    ${noWindBanner}${smartSummary}
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

