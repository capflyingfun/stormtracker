// =====================================================
// StormTracker — Integrated 3D Tab (THREE.js)
// Reads storm data from main app globals (S.storms, S.lat, S.lon, etc.)
// Renders volumetric storm clouds, rain, lightning, wind, terrain
// =====================================================
var V3D = {
  ready: false,
  active: false,
  renderer: null,
  camera: null,
  scene: null,
  controls: null,
  raycaster: null,
  mouse: null,
  clock: null,
  skyDome: null,
  skyMat: null,
  stormGroup: null,
  windGroup: null,
  coneGroup: null,
  compassGroup: null,
  ambientLight: null,
  sunLight: null,
  stormMeshes: [],
  windSystems: [],
  groundMesh: null,
  terrainMesh: null,
  terrainElevData: null,
  ringLabels: [],
  compassTape: null,
  compassHdg: null,
  ppd: 3,
  frame: 0,
  rafId: null,
  metric: false,
  _labelsVisible: localStorage.getItem('v3d_labels') !== 'off'
};

function toggle3DLabels() {
  V3D._labelsVisible = !V3D._labelsVisible;
  localStorage.setItem('v3d_labels', V3D._labelsVisible ? 'on' : 'off');
  var btn = document.getElementById('v3d-label-toggle');
  if (btn) btn.style.borderColor = V3D._labelsVisible ? 'rgba(0,200,255,0.25)' : 'rgba(255,100,100,0.35)';
  V3D.stormMeshes.forEach(function (sm) {
    if (sm.label) { sm.label.visible = V3D._labelsVisible; }
  });
}

function toRad3D(d) { return d * Math.PI / 180; }
function haversineMi3D(la1, lo1, la2, lo2) {
  var R = 3958.8;
  var a = Math.sin(toRad3D(la2 - la1) / 2) * Math.sin(toRad3D(la2 - la1) / 2) +
    Math.cos(toRad3D(la1)) * Math.cos(toRad3D(la2)) * Math.sin(toRad3D(lo2 - lo1) / 2) * Math.sin(toRad3D(lo2 - lo1) / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function haversineKm3D(la1, lo1, la2, lo2) { return haversineMi3D(la1, lo1, la2, lo2) * 1.60934; }
function fmtDist3D(mi) { return V3D.metric ? Math.round(mi * 1.60934) + ' km' : Math.round(mi) + ' mi'; }
function fmtSpeed3D(mph) { return V3D.metric ? Math.round(mph * 1.60934) + ' km/h' : Math.round(mph) + ' mph'; }
function bearingDeg3D(la1, lo1, la2, lo2) {
  var dLo = toRad3D(lo2 - lo1);
  return ((Math.atan2(Math.sin(dLo) * Math.cos(toRad3D(la2)),
    Math.cos(toRad3D(la1)) * Math.sin(toRad3D(la2)) - Math.sin(toRad3D(la1)) * Math.cos(toRad3D(la2)) * Math.cos(dLo)) * 180 / Math.PI) + 360) % 360;
}
var DIRS16_3D = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function dir16_3D(deg) { return DIRS16_3D[Math.round(deg / 22.5) % 16]; }

function geoToScene3D(lat, lon) {
  var R = 6371, dLa = toRad3D(lat - S.lat), dLo = toRad3D(lon - S.lon), avgLa = toRad3D((lat + S.lat) / 2);
  return { x: dLo * R * Math.cos(avgLa), z: -dLa * R };
}

function dbzCat3D(dbz) {
  if (dbz >= 55) return { name: 'Extreme', col: '#dd00ff' };
  if (dbz >= 45) return { name: 'Severe', col: '#ff3300' };
  if (dbz >= 35) return { name: 'Heavy', col: '#ffee00' };
  if (dbz >= 30) return { name: 'Moderate', col: '#00cc44' };
  if (dbz >= 20) return { name: 'Light', col: '#00aaff' };
  return { name: 'Trace', col: '#0055aa' };
}
function dbzHex3D(dbz) { return dbzCat3D(dbz).col; }
function dbzInt3D(dbz) { return Math.max(0.3, Math.min(2.5, (dbz - 15) / 30)); }

function loadImgCors3D(url) {
  return new Promise(function (res) {
    var img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = function () { res(img); }; img.onerror = function () { res(null); }; img.src = url;
  });
}

function sampleTerrainHeight3D(sx, sz) {
  if (!V3D.terrainElevData) return 0;
  var td = V3D.terrainElevData;
  var nx = (sx - td.centerX + td.sceneW / 2) / td.sceneW;
  var nz = (sz - td.centerZ + td.sceneD / 2) / td.sceneD;
  nx = Math.max(0, Math.min(1, nx)); nz = Math.max(0, Math.min(1, nz));
  var gx = nx * (td.w - 1), gz = nz * (td.h - 1);
  var gxi = Math.floor(gx), gzi = Math.floor(gz);
  var gxf = gx - gxi, gzf = gz - gzi;
  gxi = Math.max(0, Math.min(td.w - 2, gxi)); gzi = Math.max(0, Math.min(td.h - 2, gzi));
  var e00 = td.elev[gzi * td.w + gxi] || 0;
  var e10 = td.elev[gzi * td.w + (gxi + 1)] || 0;
  var e01 = td.elev[(gzi + 1) * td.w + gxi] || 0;
  var e11 = td.elev[(gzi + 1) * td.w + (gxi + 1)] || 0;
  var e = e00 * (1 - gxf) * (1 - gzf) + e10 * gxf * (1 - gzf) + e01 * (1 - gxf) * gzf + e11 * gxf * gzf;
  return Math.max(0, (e - td.minE) * td.elevScale);
}

// =====================================================
// SCENE INIT
// =====================================================
function init3DScene() {
  if (V3D.ready) return;
  var container = document.getElementById('view3d-container');
  if (!container) return;

  var cv = document.createElement('canvas');
  cv.id = 'view3d-canvas';
  cv.style.cssText = 'display:block;width:100%;height:100%';
  container.appendChild(cv);

  V3D.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false, powerPreference: 'high-performance' });
  V3D.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  var w = container.clientWidth, h = container.clientHeight;
  V3D.renderer.setSize(w, h);
  V3D.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  V3D.renderer.toneMappingExposure = 1.4;

  V3D.scene = new THREE.Scene();
  V3D.scene.fog = new THREE.FogExp2(0x70aae8, 0.0012);

  V3D.camera = new THREE.PerspectiveCamera(72, w / h, 0.001, 1000);
  V3D.camera.position.set(0, 0.0015, 0); V3D.camera.lookAt(0, 0.5, -15);

  V3D.controls = new THREE.OrbitControls(V3D.camera, V3D.renderer.domElement);
  V3D.controls.enableDamping = true; V3D.controls.dampingFactor = 0.07;
  V3D.controls.screenSpacePanning = false;
  V3D.controls.minDistance = 0.002; V3D.controls.maxDistance = 250;
  V3D.controls.maxPolarAngle = Math.PI * 0.502;
  V3D.controls.target.set(0, 0.4, -6); V3D.controls.update();

  V3D.raycaster = new THREE.Raycaster();
  V3D.mouse = new THREE.Vector2();
  V3D.clock = new THREE.Clock();

  V3D.ambientLight = new THREE.AmbientLight(0x8ab4e0, 1.2); V3D.scene.add(V3D.ambientLight);
  V3D.sunLight = new THREE.DirectionalLight(0xfff4d6, 1.5); V3D.sunLight.position.set(60, 90, 60); V3D.scene.add(V3D.sunLight);
  var fill = new THREE.DirectionalLight(0x4466bb, 0.4); fill.position.set(-40, 30, -40); V3D.scene.add(fill);

  V3D.stormGroup = new THREE.Group(); V3D.scene.add(V3D.stormGroup);
  V3D.windGroup = new THREE.Group(); V3D.scene.add(V3D.windGroup);
  V3D.coneGroup = new THREE.Group(); V3D.scene.add(V3D.coneGroup);
  V3D.compassGroup = new THREE.Group(); V3D.scene.add(V3D.compassGroup);

  buildGround3D(); buildSky3D(); buildCompass3D(); buildUserMarker3D(); buildCompassTape3D();
  updateRingLabels3D();

  window.addEventListener('resize', onResize3D);
  cv.addEventListener('click', onClick3D);
  cv.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (e.changedTouches.length) onClick3D({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
  }, { passive: false });

  V3D.ready = true;
}

function onResize3D() {
  if (!V3D.ready || !V3D.active) return;
  var container = document.getElementById('view3d-container');
  if (!container) return;
  var w = container.clientWidth, h = container.clientHeight;
  V3D.camera.aspect = w / h;
  V3D.camera.updateProjectionMatrix();
  V3D.renderer.setSize(w, h);
}

// =====================================================
// GROUND
// =====================================================
function buildGround3D() {
  var sz = 512, cv2 = document.createElement('canvas'); cv2.width = sz; cv2.height = sz;
  var c2 = cv2.getContext('2d');
  c2.fillStyle = '#07111e'; c2.fillRect(0, 0, sz, sz);
  c2.strokeStyle = 'rgba(0,160,230,0.07)'; c2.lineWidth = 1;
  for (var i = 0; i <= 16; i++) { var p = i * (sz / 16); c2.beginPath(); c2.moveTo(p, 0); c2.lineTo(p, sz); c2.stroke(); c2.beginPath(); c2.moveTo(0, p); c2.lineTo(sz, p); c2.stroke(); }
  var g = c2.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2.2);
  g.addColorStop(0, 'rgba(0,160,230,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c2.fillStyle = g; c2.fillRect(0, 0, sz, sz);
  var tex = new THREE.CanvasTexture(cv2);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(50, 50);
  V3D.groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshBasicMaterial({ map: tex }));
  V3D.groundMesh.rotation.x = -Math.PI / 2; V3D.groundMesh.position.y = 0; V3D.scene.add(V3D.groundMesh);
}

// =====================================================
// TERRAIN HEIGHTMAP
// =====================================================
async function fetchElevationGrid3D(lat, lon, radiusKm, gridW, gridH) {
  var z = 9;
  var n = Math.pow(2, z);
  var tsz = 256;
  var R = 6371;
  var dLat = radiusKm / R * (180 / Math.PI);
  var dLon = dLat / Math.cos(toRad3D(lat));
  var latMin = lat - dLat, latMax = lat + dLat;
  var lonMin = lon - dLon, lonMax = lon + dLon;

  function lonToTileF(lo, z) { return (lo + 180) / 360 * Math.pow(2, z); }
  function latToTileF(la, z) { var lr = toRad3D(la); return (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * Math.pow(2, z); }

  var txMin = Math.floor(lonToTileF(lonMin, z));
  var txMax = Math.floor(lonToTileF(lonMax, z));
  var tyMin = Math.floor(latToTileF(latMax, z));
  var tyMax = Math.floor(latToTileF(latMin, z));

  var tilesX = txMax - txMin + 1, tilesY = tyMax - tyMin + 1;
  var canvW = tilesX * tsz, canvH = tilesY * tsz;
  var cv2 = document.createElement('canvas'); cv2.width = canvW; cv2.height = canvH;
  var ctx2 = cv2.getContext('2d', { willReadFrequently: true });
  ctx2.fillStyle = 'rgb(1,134,160)';
  ctx2.fillRect(0, 0, canvW, canvH);

  var tileJobs = [];
  for (var ty = tyMin; ty <= tyMax; ty++) {
    for (var tx = txMin; tx <= txMax; tx++) {
      (function (ttx, tty) {
        var url = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + ttx + '/' + tty + '.png';
        tileJobs.push(loadImgCors3D(url).then(function (img) {
          if (!img) return;
          var dx = (ttx - txMin) * tsz, dy = (tty - tyMin) * tsz;
          ctx2.drawImage(img, dx, dy, tsz, tsz);
        }));
      })(tx, ty);
    }
  }
  try { await Promise.all(tileJobs); } catch (e) { }

  var pixelData = ctx2.getImageData(0, 0, canvW, canvH).data;
  function latLonToCanvPx(la, lo) {
    var fx = lonToTileF(lo, z), fy = latToTileF(la, z);
    var px = (fx - txMin) * tsz, py = (fy - tyMin) * tsz;
    return { px: Math.floor(Math.max(0, Math.min(canvW - 1, px))), py: Math.floor(Math.max(0, Math.min(canvH - 1, py))) };
  }

  var elev = new Float32Array(gridW * gridH);
  var minE = Infinity, maxE = -Infinity;
  for (var gy = 0; gy < gridH; gy++) {
    for (var gx = 0; gx < gridW; gx++) {
      var t = gy / (gridH - 1), s2 = gx / (gridW - 1);
      var sLat = latMax - (t * (latMax - latMin));
      var sLon = lonMin + (s2 * (lonMax - lonMin));
      var px2 = latLonToCanvPx(sLat, sLon);
      var pi = (px2.py * canvW + px2.px) * 4;
      var R2 = pixelData[pi], G = pixelData[pi + 1], B = pixelData[pi + 2];
      var e = (R2 * 256 + G + B / 256) - 32768;
      elev[gy * gridW + gx] = e;
      if (e < minE) minE = e; if (e > maxE) maxE = e;
    }
  }
  if (!isFinite(minE)) minE = 0; if (!isFinite(maxE)) maxE = 0;
  return { elev: elev, minE: minE, maxE: maxE, latMin: latMin, latMax: latMax, lonMin: lonMin, lonMax: lonMax };
}

function buildTerrainMesh3D(elevData, mapTex, plW, plD, planeCX, planeCZ) {
  if (V3D.terrainMesh) { V3D.scene.remove(V3D.terrainMesh); if (V3D.terrainMesh.geometry) V3D.terrainMesh.geometry.dispose(); if (V3D.terrainMesh.material) V3D.terrainMesh.material.dispose(); V3D.terrainMesh = null; }
  var gridW = elevData.elev.length > 0 ? Math.round(Math.sqrt(elevData.elev.length)) : 64;
  var gridH = Math.round(elevData.elev.length / gridW);
  var segsX = gridW - 1, segsZ = gridH - 1;
  var geo = new THREE.PlaneGeometry(plW, plD, segsX, segsZ);
  geo.rotateX(-Math.PI / 2);
  var pos = geo.attributes.position.array;
  var elevScale = 0.001;
  var maxDispKm = 8;
  for (var i = 0; i < segsZ + 1; i++) {
    for (var j = 0; j < segsX + 1; j++) {
      var vi = (i * (segsX + 1) + j);
      var e = elevData.elev[i * gridW + j] || 0;
      var h = (e - elevData.minE) * elevScale;
      h = Math.min(h, maxDispKm);
      pos[vi * 3 + 1] = h;
    }
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  V3D.terrainElevData = {
    elev: elevData.elev, w: gridW, h: gridH,
    minE: elevData.minE, maxE: elevData.maxE, elevScale: elevScale,
    sceneW: plW, sceneD: plD, centerX: planeCX, centerZ: planeCZ,
    latMin: elevData.latMin, latMax: elevData.latMax, lonMin: elevData.lonMin, lonMax: elevData.lonMax
  };
  var mat = new THREE.MeshBasicMaterial({ map: mapTex });
  V3D.terrainMesh = new THREE.Mesh(geo, mat);
  V3D.terrainMesh.position.set(planeCX, 0, planeCZ);
  V3D.scene.add(V3D.terrainMesh);
}

async function buildMapGround3D(lat, lon) {
  var z = 7, n = Math.pow(2, z), tsz = 256, canvSz = 1280;
  var fullPx = n * tsz;
  var lr = toRad3D(lat);
  var userGPx = (lon + 180) / 360 * fullPx;
  var userGPy = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * fullPx;
  var cx = Math.floor(userGPx / tsz), cy = Math.floor(userGPy / tsz);
  var originGPx = userGPx - canvSz / 2, originGPy = userGPy - canvSz / 2;
  var cv2 = document.createElement('canvas'); cv2.width = cv2.height = canvSz;
  var ctx2 = cv2.getContext('2d');
  ctx2.fillStyle = '#07111e'; ctx2.fillRect(0, 0, canvSz, canvSz);
  var R2 = 2, jobs = [];
  for (var dy = -R2; dy <= R2; dy++) {
    for (var dx = -R2; dx <= R2; dx++) {
      (function (ddx, ddy) {
        var rawTx = cx + ddx, rawTy = cy + ddy;
        var tx = ((rawTx % n) + n) % n, ty = Math.max(0, Math.min(n - 1, rawTy));
        var drawX = rawTx * tsz - originGPx, drawY = rawTy * tsz - originGPy;
        var srv = ['a', 'b', 'c'][(Math.abs(tx) + Math.abs(ty)) % 3];
        var url = 'https://' + srv + '.basemaps.cartocdn.com/dark_all/' + z + '/' + tx + '/' + ty + '.png';
        jobs.push(loadImgCors3D(url).then(function (img) {
          if (!img) return;
          ctx2.drawImage(img, drawX, drawY, tsz, tsz);
        }));
      })(dx, dy);
    }
  }
  await Promise.all(jobs);
  function pxToLon(px) { return px / fullPx * 360 - 180; }
  function pxToLat(py) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * py / fullPx))) * 180 / Math.PI; }
  var nwLat = pxToLat(originGPy), nwLon = pxToLon(originGPx);
  var seLat = pxToLat(originGPy + canvSz), seLon = pxToLon(originGPx + canvSz);
  var nwS = geoToScene3D(nwLat, nwLon), seS = geoToScene3D(seLat, seLon);
  var plW = seS.x - nwS.x, plD = seS.z - nwS.z;
  var planeCX = 0, planeCZ = 0;
  var tex = new THREE.CanvasTexture(cv2);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  if (V3D.groundMesh) { V3D.scene.remove(V3D.groundMesh); if (V3D.groundMesh.geometry) V3D.groundMesh.geometry.dispose(); if (V3D.groundMesh.material) V3D.groundMesh.material.dispose(); V3D.groundMesh = null; }

  try {
    var elevData = await fetchElevationGrid3D(lat, lon, 80, 128, 128);
    buildTerrainMesh3D(elevData, tex, plW, plD, planeCX, planeCZ);
  } catch (e) {
    console.warn('3D terrain elevation failed, using flat ground:', e);
    if (V3D.terrainMesh) { V3D.scene.remove(V3D.terrainMesh); if (V3D.terrainMesh.geometry) V3D.terrainMesh.geometry.dispose(); if (V3D.terrainMesh.material) V3D.terrainMesh.material.dispose(); V3D.terrainMesh = null; }
    V3D.terrainElevData = null;
    var newPlane = new THREE.Mesh(new THREE.PlaneGeometry(plW, plD), new THREE.MeshBasicMaterial({ map: tex }));
    newPlane.rotation.x = -Math.PI / 2; newPlane.position.set(planeCX, 0, planeCZ);
    V3D.groundMesh = newPlane; V3D.scene.add(V3D.groundMesh);
  }
}

// =====================================================
// SKY DOME
// =====================================================
function buildSky3D() {
  var geo = new THREE.SphereGeometry(750, 32, 16);
  V3D.skyMat = new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(0x020612) }, uHorizon: { value: new THREE.Color(0x0a1d3a) }, uGround: { value: new THREE.Color(0x040a12) }, uExp: { value: 0.55 } },
    vertexShader: 'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 uTop,uHorizon,uGround;uniform float uExp;varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 sky=mix(uHorizon,uTop,pow(clamp(h,0.,1.),uExp));gl_FragColor=vec4(mix(uGround,sky,step(0.,h)),1.);}',
    side: THREE.BackSide, depthWrite: false
  });
  V3D.skyDome = new THREE.Mesh(geo, V3D.skyMat); V3D.scene.add(V3D.skyDome);
}

function refreshSky3D() {
  var now = Date.now() / 1000;
  var rise = 0, set = 0;
  try {
    var wd = S._lastWeatherData;
    if (wd && wd.daily && wd.daily.sunrise && wd.daily.sunrise[0]) rise = new Date(wd.daily.sunrise[0]).getTime() / 1000;
    if (wd && wd.daily && wd.daily.sunset && wd.daily.sunset[0]) set = new Date(wd.daily.sunset[0]).getTime() / 1000;
  } catch (e) { }
  if (!rise || !set) {
    var h = new Date().getHours();
    var today = new Date(); today.setHours(6, 30, 0, 0); rise = today.getTime() / 1000;
    var today2 = new Date(); today2.setHours(19, 30, 0, 0); set = today2.getTime() / 1000;
  }
  var cloud = Math.min(1, (S.weather && S.weather.cloud_cover || 0) / 100);
  var topC = new THREE.Color(), horizC = new THREE.Color(), groundC = new THREE.Color(0x060d18);
  if (now < rise - 3600 || now > set + 3600) {
    topC.setHex(0x010408); horizC.setHex(0x050e20); groundC.setHex(0x030608);
    V3D.sunLight.intensity = 0.08; V3D.sunLight.color.setHex(0x3355aa); V3D.ambientLight.intensity = 0.4;
  } else if (now < rise + 2400) {
    var d = Math.max(0, Math.min(1, (now - rise + 3600) / 5000));
    topC.lerpColors(new THREE.Color(0x020510), new THREE.Color(0x2060b8), d);
    horizC.lerpColors(new THREE.Color(0xaa3818), new THREE.Color(0x6090c8), d);
    groundC.lerpColors(new THREE.Color(0x030608), new THREE.Color(0x0a1525), d);
    V3D.sunLight.intensity = 0.2 + d * 1.2; V3D.sunLight.color.setHex(0xffaa66); V3D.ambientLight.intensity = 0.5 + d * 0.9;
  } else if (now < set - 2400) {
    topC.setHex(0x1a6edd); horizC.setHex(0x70aae8);
    groundC.setHex(0x0e1e30);
    V3D.sunLight.intensity = Math.max(0.6, 1.8 - cloud * 0.7); V3D.sunLight.color.setHex(0xfff4d6);
    V3D.ambientLight.intensity = Math.max(0.8, 1.6 - cloud * 0.5);
    V3D.ambientLight.color.setHex(0x8ab4e0);
  } else {
    var d = Math.max(0, Math.min(1, 1 - (now - (set - 2400)) / 4200));
    topC.lerpColors(new THREE.Color(0x020510), new THREE.Color(0x2060b8), d);
    horizC.lerpColors(new THREE.Color(0xaa3818), new THREE.Color(0x6090c8), d);
    groundC.lerpColors(new THREE.Color(0x030608), new THREE.Color(0x0a1525), d);
    V3D.sunLight.intensity = 0.2 + d * 1.2; V3D.sunLight.color.setHex(0xff8040); V3D.ambientLight.intensity = 0.5 + d * 0.9;
  }
  if (cloud > 0.3) { topC.lerp(new THREE.Color(0x3a4858), cloud * 0.5); horizC.lerp(new THREE.Color(0x506878), cloud * 0.4); }
  V3D.skyMat.uniforms.uTop.value.copy(topC); V3D.skyMat.uniforms.uHorizon.value.copy(horizC);
  V3D.skyMat.uniforms.uGround.value.copy(groundC); V3D.scene.fog.color.copy(horizC);
}

// =====================================================
// COMPASS + USER MARKER
// =====================================================
function makeSprite3D(text, color, scale) {
  var cv2 = document.createElement('canvas'); cv2.width = 128; cv2.height = 64;
  var cx = cv2.getContext('2d'); cx.clearRect(0, 0, 128, 64);
  cx.font = 'bold 38px Segoe UI,Arial,sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.shadowColor = 'rgba(0,0,0,0.9)'; cx.shadowBlur = 10;
  cx.fillStyle = color || 'rgba(255,255,255,0.5)'; cx.fillText(text, 64, 32);
  var tex = new THREE.CanvasTexture(cv2);
  var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set((scale || 1) * 4.5, (scale || 1) * 2.2, 1);
  return spr;
}

function updateSpriteText3D(spr, text, color) {
  var cv2 = document.createElement('canvas'); cv2.width = 128; cv2.height = 64;
  var cx = cv2.getContext('2d'); cx.clearRect(0, 0, 128, 64);
  cx.font = 'bold 38px Segoe UI,Arial,sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.shadowColor = 'rgba(0,0,0,0.9)'; cx.shadowBlur = 10;
  cx.fillStyle = color || 'rgba(0,200,255,0.90)'; cx.fillText(text, 64, 32);
  if (spr.material.map) spr.material.map.dispose();
  spr.material.map = new THREE.CanvasTexture(cv2);
  spr.material.needsUpdate = true;
}

function updateRingLabels3D() {
  V3D.ringLabels.forEach(function (r) {
    var txt = V3D.metric ? r.km + ' km' : Math.round(r.km * 0.621371) + ' mi';
    updateSpriteText3D(r.spr, txt);
  });
}

function buildCompassTape3D() {
  var tape = document.getElementById('v3d-compass-tape');
  V3D.compassTape = tape;
  V3D.compassHdg = document.getElementById('v3d-compass-hdg');
  var CARD = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  var html = '';
  for (var rep = 0; rep < 3; rep++) {
    var base = rep * 360;
    for (var d = 0; d < 360; d += 5) {
      var px = (base + d) * V3D.ppd;
      var isCard = CARD[d] !== undefined;
      var isMajor = d % 10 === 0;
      html += '<div class="ct-tick' + (isMajor ? ' major' : '') + '" style="left:' + px + 'px"></div>';
      if (isCard) html += '<div class="ct-lbl' + (d % 90 !== 0 ? ' inter' : '') + '" style="left:' + px + 'px">' + CARD[d] + '</div>';
      else if (d % 30 === 0) html += '<div class="ct-lbl inter" style="left:' + px + 'px">' + d + '°</div>';
    }
  }
  tape.innerHTML = html;
  tape.style.width = (1080 * V3D.ppd) + 'px';
}

function updateCompass3D() {
  if (!V3D.compassTape || !V3D.camera || !V3D.controls) return;
  var dx = V3D.controls.target.x - V3D.camera.position.x, dz = V3D.controls.target.z - V3D.camera.position.z;
  var hdg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  var container = document.getElementById('view3d-container');
  var center = container ? container.clientWidth / 2 : window.innerWidth / 2;
  var offset = center - (hdg + 360) * V3D.ppd;
  V3D.compassTape.style.transform = 'translateX(' + offset + 'px)';
  V3D.compassHdg.textContent = Math.round(hdg) + '°';
}

function buildCompass3D() {
  var R = 90;
  [{ t: 'N', b: 0, m: 1 }, { t: 'NE', b: 45, m: 0 }, { t: 'E', b: 90, m: 1 }, { t: 'SE', b: 135, m: 0 },
  { t: 'S', b: 180, m: 1 }, { t: 'SW', b: 225, m: 0 }, { t: 'W', b: 270, m: 1 }, { t: 'NW', b: 315, m: 0 }].forEach(function (d) {
    var ar = toRad3D(d.b);
    var spr = makeSprite3D(d.t, d.m ? 'rgba(0,229,255,0.85)' : 'rgba(255,255,255,0.3)', d.m ? 1 : 0.6);
    spr.position.set(R * Math.sin(ar), d.m ? 1.8 : 0.9, -R * Math.cos(ar)); V3D.compassGroup.add(spr);
  });
  var RING_KM = [25, 50, 100];
  V3D.ringLabels = [];
  RING_KM.forEach(function (km, i) {
    var pts = []; for (var a = 0; a <= 64; a++) { var ar = a / 64 * Math.PI * 2; pts.push(new THREE.Vector3(km * Math.sin(ar), 0.02, -km * Math.cos(ar))); }
    V3D.scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x4a9ad0, transparent: true, opacity: 0.8 - i * 0.1 })));
    var lspr = makeSprite3D(km + ' km', 'rgba(60,200,255,0.95)', 0.55); lspr.position.set(0, 0.5, -km); V3D.scene.add(lspr);
    V3D.ringLabels.push({ spr: lspr, km: km });
  });
}

function buildUserMarker3D() {
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.083, 0.143, 48),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; V3D.scene.add(ring);
  var dot = new THREE.Mesh(new THREE.CircleGeometry(0.045, 32),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  dot.rotation.x = -Math.PI / 2; dot.position.y = 0.003; V3D.scene.add(dot);
  var pgeo = new THREE.RingGeometry(0.083, 0.18, 48);
  var pmat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  var pulse = new THREE.Mesh(pgeo, pmat); pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.0035; V3D.scene.add(pulse);
  var gloCv = document.createElement('canvas'); gloCv.width = gloCv.height = 64;
  var gloCx = gloCv.getContext('2d');
  var gloG = gloCx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gloG.addColorStop(0, 'rgba(0,220,255,0.35)'); gloG.addColorStop(0.5, 'rgba(0,180,255,0.12)'); gloG.addColorStop(1, 'rgba(0,0,0,0)');
  gloCx.fillStyle = gloG; gloCx.fillRect(0, 0, 64, 64);
  var gloSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gloCv), transparent: true, depthWrite: false }));
  gloSpr.scale.set(0.7, 0.7, 1); gloSpr.position.set(0, 0.02, 0); V3D.scene.add(gloSpr);
  var t = 0;
  V3D._markerRAF = null;
  function tick() { if (!V3D.active) { V3D._markerRAF = null; return; } V3D._markerRAF = requestAnimationFrame(tick); t += 0.018; pulse.scale.setScalar(1 + 0.55 * Math.abs(Math.sin(t))); pmat.opacity = 0.28 * (1.1 - Math.abs(Math.sin(t)) * 0.4); }
  V3D._startMarkerPulse = tick;
  tick();
}

// =====================================================
// STORM CLOUDS
// =====================================================
function disposeObj3D(obj) {
  if (!obj) return;
  if (obj.children && obj.children.length) {
    while (obj.children.length > 0) { var ch = obj.children[0]; disposeObj3D(ch); obj.remove(ch); }
  }
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) {
    if (Array.isArray(obj.material)) obj.material.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
    else { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
  }
}
function clearGroup3D(grp) {
  while (grp.children.length > 0) { var c = grp.children[0]; disposeObj3D(c); grp.remove(c); }
}
function clearStorms3D() {
  V3D.stormMeshes.forEach(function (sm) { if (sm.ltTimer) clearInterval(sm.ltTimer); });
  V3D.stormMeshes = [];
  clearGroup3D(V3D.stormGroup);
  clearGroup3D(V3D.coneGroup);
}

function makeCloudGroup3D(dbz, hookEcho, windDir) {
  var grp = new THREE.Group();
  var baseR = Math.max(1.2, Math.min(6, (dbz - 10) / 7));
  var cat = dbzCat3D(dbz);
  var base = new THREE.Color(cat.col);
  var white = new THREE.Color(1, 1, 1);
  var dark = new THREE.Color(0.18, 0.18, 0.22);
  var severe = dbz >= 50, heavy = dbz >= 40, moderate = dbz >= 35;
  var SEG = 6;
  if (severe) {
    var bR = baseR * 1.1;
    var bottomCol = base.clone().lerp(dark, 0.4);
    var b1 = new THREE.Mesh(new THREE.SphereGeometry(bR, SEG, SEG), new THREE.MeshBasicMaterial({ color: bottomCol, transparent: true, opacity: 0.78 }));
    b1.scale.set(1.3, 0.55, 1.2); grp.add(b1);
    var midCol = base.clone().lerp(white, 0.15);
    var b2 = new THREE.Mesh(new THREE.SphereGeometry(bR * 0.9, SEG, SEG), new THREE.MeshBasicMaterial({ color: midCol, transparent: true, opacity: 0.72 }));
    b2.scale.set(1.1, 0.7, 1.0); b2.position.y = bR * 0.8; grp.add(b2);
    var topCol = base.clone().lerp(white, 0.3);
    var b3 = new THREE.Mesh(new THREE.SphereGeometry(bR * 0.75, SEG, SEG), new THREE.MeshBasicMaterial({ color: topCol, transparent: true, opacity: 0.65 }));
    b3.scale.set(0.9, 0.8, 0.85); b3.position.y = bR * 1.5; grp.add(b3);
    var anvilCol = base.clone().lerp(white, 0.35);
    var anvil = new THREE.Mesh(new THREE.SphereGeometry(bR * 1.6, SEG, SEG), new THREE.MeshBasicMaterial({ color: anvilCol, transparent: true, opacity: 0.4 }));
    anvil.scale.set(1.8, 0.18, 1.5); anvil.position.y = bR * 2.0; grp.add(anvil);
  } else if (heavy) {
    var bR = baseR * 0.95;
    var bottomCol = base.clone().lerp(dark, 0.3);
    var b1 = new THREE.Mesh(new THREE.SphereGeometry(bR, SEG, SEG), new THREE.MeshBasicMaterial({ color: bottomCol, transparent: true, opacity: 0.72 }));
    b1.scale.set(1.2, 0.5, 1.1); grp.add(b1);
    var topCol = base.clone().lerp(white, 0.2);
    var b2 = new THREE.Mesh(new THREE.SphereGeometry(bR * 0.8, SEG, SEG), new THREE.MeshBasicMaterial({ color: topCol, transparent: true, opacity: 0.65 }));
    b2.scale.set(1.0, 0.65, 0.9); b2.position.y = bR * 0.7; grp.add(b2);
  } else if (moderate) {
    var bR = baseR * 0.85;
    var col = base.clone().lerp(white, 0.1);
    var b1 = new THREE.Mesh(new THREE.SphereGeometry(bR, SEG, SEG), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.65 }));
    b1.scale.set(1.1, 0.5, 1.0); grp.add(b1);
    var topCol = base.clone().lerp(white, 0.25);
    var b2 = new THREE.Mesh(new THREE.SphereGeometry(bR * 0.6, SEG, SEG), new THREE.MeshBasicMaterial({ color: topCol, transparent: true, opacity: 0.55 }));
    b2.scale.set(0.9, 0.55, 0.85); b2.position.y = bR * 0.55; grp.add(b2);
  } else {
    var bR = baseR * 0.7;
    var col = base.clone().lerp(white, 0.15);
    var b1 = new THREE.Mesh(new THREE.SphereGeometry(bR, SEG, SEG), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 }));
    b1.scale.set(1.0, 0.45, 0.9); grp.add(b1);
  }
  return { grp: grp, r: baseR };
}

function makeRain3D(dbz, r, terrainBaseH) {
  var n = Math.min(120, 30 + dbz * 2), pos = new Float32Array(n * 3), vel = new Float32Array(n);
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, d = Math.random() * r * 1.3;
    pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = -Math.random() * r * 2; pos[i * 3 + 2] = Math.sin(a) * d;
    vel[i] = 0.018 + Math.random() * 0.035;
  }
  var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x88aacc, size: 0.09, transparent: true, opacity: 0.45, sizeAttenuation: true, depthWrite: false }));
  pts.userData = { vel: vel, r: r, floorOffset: terrainBaseH || 0 }; return pts;
}

function animRain3D(rain, windDir) {
  if (!rain) return;
  var pos = rain.geometry.attributes.position.array, vel = rain.userData.vel, r = rain.userData.r;
  var localFloor = (rain.userData.floorOffset || 0) - rain.position.y;
  var resetThreshold = Math.max(-r * 2.8, localFloor - 0.01);
  var wd = toRad3D(windDir || 0), dx = Math.sin(wd) * 0.0015, dz = -Math.cos(wd) * 0.0015;
  for (var i = 0; i < vel.length; i++) {
    pos[i * 3] += dx; pos[i * 3 + 1] -= vel[i]; pos[i * 3 + 2] += dz;
    if (pos[i * 3 + 1] < resetThreshold) {
      var a = Math.random() * Math.PI * 2, d = Math.random() * r;
      pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = r * 0.4 + Math.random() * r * 0.4; pos[i * 3 + 2] = Math.sin(a) * d;
    }
  }
  rain.geometry.attributes.position.needsUpdate = true;
}

function addApproachCone3D(cell, sp) {
  if (!S.stormMovement || S.stormMovement.speed < 2) return;
  var mv = S.stormMovement;
  var dkm = haversineKm3D(S.lat, S.lon, cell.lat, cell.lon);
  var distMi = dkm * 0.621371;
  var bearU = (cell.bearing + 180) % 360;
  var diff = Math.abs(((mv.direction - bearU + 180) % 360) - 180);
  var baseWidthMi = Math.max(0, Math.min(3, (cell.dbz - 20) / 15));
  var widthAngle = distMi > 0.5 ? Math.atan2(baseWidthMi, distMi) * 180 / Math.PI : 15;
  var CONE_HALF = 15 + widthAngle;
  if (diff > CONE_HALF) return;
  var closingSpeed = mv.speed * Math.cos(Math.min(diff, 60) * Math.PI / 180);
  if (closingSpeed <= 1) return;
  var etaMin = Math.round(distMi / closingSpeed * 60);

  var mRad = toRad3D(mv.direction);
  var rangeKm = Math.min(60, Math.max(distMi * 1.5, 20)) * 1.609;
  var halfWidthKm = baseWidthMi * 1.609 / 2;
  var col = new THREE.Color(dbzHex3D(cell.dbz));
  var Y = sampleTerrainHeight3D(sp.x, sp.z) + 0.02;

  var movX = Math.sin(mRad), movZ = -Math.cos(mRad);
  var perpLX = -Math.cos(mRad), perpLZ = -Math.sin(mRad);
  var perpRX = Math.cos(mRad), perpRZ = Math.sin(mRad);

  var bLx, bLz, bRx, bRz;
  if (halfWidthKm > 0.05) {
    bLx = sp.x + perpLX * halfWidthKm; bLz = sp.z + perpLZ * halfWidthKm;
    bRx = sp.x + perpRX * halfWidthKm; bRz = sp.z + perpRZ * halfWidthKm;
  } else { bLx = sp.x; bLz = sp.z; bRx = sp.x; bRz = sp.z; }
  var mL = mRad - 15 * Math.PI / 180, mR = mRad + 15 * Math.PI / 180;
  var fLx = bLx + Math.sin(mL) * rangeKm, fLz = bLz - Math.cos(mL) * rangeKm;
  var fCx = sp.x + movX * rangeKm, fCz = sp.z + movZ * rangeKm;
  var fRx = bRx + Math.sin(mR) * rangeKm, fRz = bRz - Math.cos(mR) * rangeKm;

  var fillVerts = new Float32Array([
    bLx, Y, bLz, fLx, Y, fLz, fCx, Y, fCz,
    bLx, Y, bLz, fCx, Y, fCz, fRx, Y, fRz,
    bLx, Y, bLz, fRx, Y, fRz, bRx, Y, bRz
  ]);
  var fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillVerts, 3));
  var fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  V3D.coneGroup.add(fill);

  var outVerts = new Float32Array([bLx, Y, bLz, fLx, Y, fLz, fCx, Y, fCz, fRx, Y, fRz, bRx, Y, bRz]);
  var outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute('position', new THREE.BufferAttribute(outVerts, 3));
  var outline = new THREE.LineLoop(outGeo, new THREE.LineDashedMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, dashSize: 1.5, gapSize: 1.0, scale: 1 }));
  outline.computeLineDistances();
  V3D.coneGroup.add(outline);

  if (etaMin > 0 && etaMin < 180) {
    var eSpr = makeSprite3D('ETA ' + etaMin + 'min', 'rgba(255,200,55,0.92)', 0.5);
    eSpr.position.set(sp.x, dkm * 0.12 + 3.5, sp.z); V3D.coneGroup.add(eSpr);
  }
}

function getCloudBase3D() {
  if (S._cloudBaseFt) return Math.max(2.5, S._cloudBaseFt / 3281 * 10);
  try {
    var wd = S._lastWeatherData;
    if (wd && wd.hourly && wd.hourly.temperature_2m && wd.hourly.dew_point_2m) {
      var hr = new Date().getHours();
      var t = wd.hourly.temperature_2m[hr], dp = wd.hourly.dew_point_2m[hr];
      if (t != null && dp != null) {
        var cbFt = Math.max(500, Math.round((t - dp) * 400));
        return Math.max(2.5, cbFt / 3281 * 10);
      }
    }
  } catch (e) { }
  return 1.5;
}

function sonarZones3D() {
  var storms = S.storms;
  if (!storms || !storms.length) return [];
  var out = [];
  for (var i = 0; i < storms.length; i++) {
    var s = storms[i];
    if (s.lat == null || (s.lng == null && s.lon == null)) continue;
    var lng = s.lng != null ? s.lng : s.lon;
    out.push({ lat: s.lat, lon: lng, lng: lng, dbz: s.dbz, distance: s.distance, bearing: s.bearing, count: s.pixels || 1, hookEcho: !!s._hookEcho });
  }
  out.sort(function (a, b) { return b.dbz - a.dbz; });
  return out;
}

function rebuildStorms3D() {
  clearStorms3D();
  var storms = sonarZones3D();
  if (!storms.length) return;
  var surfWind = S.weather ? S.weather.wind_direction_10m || S.weather.windDirection || 0 : 0;
  var showLabels = V3D._labelsVisible !== false;
  storms.forEach(function (cell) {
    var lon = cell.lon || cell.lng;
    var lat = cell.lat;
    var sp = geoToScene3D(lat, lon);
    var dkm = haversineKm3D(S.lat, S.lon, lat, lon);
    var cloudBase = getCloudBase3D();
    var cl = makeCloudGroup3D(cell.dbz, cell.hookEcho, surfWind);
    var alt = cloudBase + cl.r;
    cl.grp.position.set(sp.x, alt, sp.z); cl.grp.userData.cell = cell; V3D.stormGroup.add(cl.grp);

    var pt = null;
    if (cell.dbz >= 40) {
      var glowCol = new THREE.Color(dbzHex3D(cell.dbz));
      pt = new THREE.PointLight(glowCol, dbzInt3D(cell.dbz) * 1.3, dkm * 0.14 + 9);
      pt.position.set(sp.x, alt + cl.r * 0.3, sp.z); V3D.stormGroup.add(pt);
    }

    if (cell.dbz >= 30) {
      var hHex = dbzHex3D(cell.dbz);
      var hR = parseInt(hHex.slice(1, 3), 16), hG = parseInt(hHex.slice(3, 5), 16), hB = parseInt(hHex.slice(5, 7), 16);
      var haloCv = document.createElement('canvas'); haloCv.width = haloCv.height = 64;
      var haloCx = haloCv.getContext('2d');
      var haloG = haloCx.createRadialGradient(32, 32, 0, 32, 32, 32);
      haloG.addColorStop(0, 'rgba(' + hR + ',' + hG + ',' + hB + ',0.45)');
      haloG.addColorStop(0.5, 'rgba(' + hR + ',' + hG + ',' + hB + ',0.08)');
      haloG.addColorStop(1, 'rgba(0,0,0,0)');
      haloCx.fillStyle = haloG; haloCx.fillRect(0, 0, 64, 64);
      var haloTex = new THREE.CanvasTexture(haloCv);
      var haloSz = cl.r * 3;
      var haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(haloSz * 2, haloSz * 2),
        new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      var haloBaseH = sampleTerrainHeight3D(sp.x, sp.z);
      haloMesh.rotation.x = -Math.PI / 2; haloMesh.position.set(sp.x, haloBaseH + 0.015, sp.z); V3D.stormGroup.add(haloMesh);
    }

    var rain = null;
    if (cell.dbz >= 33) {
      var terrainBase = sampleTerrainHeight3D(sp.x, sp.z);
      rain = makeRain3D(cell.dbz, cl.r, terrainBase); rain.position.set(sp.x, alt, sp.z); V3D.stormGroup.add(rain);
    }

    var ltTimer = null;
    if (cell.dbz >= 45) {
      var sx = sp.x, sz2 = sp.z, altR = alt + cl.r, rr = cl.r;
      ltTimer = setInterval(function () {
        if (!V3D.active) return;
        if (Math.random() < 0.2) {
          var fl = new THREE.PointLight(0xddeeff, 7, rr * 3);
          fl.position.set(sx + (Math.random() - .5) * rr, altR + Math.random() * rr, sz2 + (Math.random() - .5) * rr);
          V3D.stormGroup.add(fl);
          setTimeout(function () { V3D.stormGroup.remove(fl); }, 50 + Math.random() * 60);
        }
      }, 900 + Math.random() * 2500);
    }

    var lspr = null;
    if (cell.dbz >= 35) {
      var cloudTop = alt + cl.r * 2.2;
      lspr = makeSprite3D(Math.round(cell.dbz) + ' dBZ', dbzCat3D(cell.dbz).col, 0.35);
      lspr.position.set(sp.x, cloudTop + 0.4, sp.z); lspr.visible = showLabels; V3D.stormGroup.add(lspr);
    }

    var cellForCone = { lat: lat, lon: lon, dbz: cell.dbz, distance: cell.distance, bearing: cell.bearing || bearingDeg3D(S.lat, S.lon, lat, lon) };
    V3D.stormMeshes.push({ mesh: cl.grp, cell: cellForCone, lights: pt ? [pt] : [], rain: rain, ltTimer: ltTimer, label: lspr });
    if (cell.dbz >= 35) addApproachCone3D(cellForCone, sp);
  });
}

// =====================================================
// WIND PARTICLES
// =====================================================
function rebuildWind3D() {
  while (V3D.windGroup.children.length > 0) V3D.windGroup.remove(V3D.windGroup.children[0]);
  V3D.windSystems = [];
  var aloftData = S._aloftData || [];
  if (!aloftData.length) return;
  var R = 130;
  aloftData.forEach(function (lv, i) {
    var n = 500; var pos = new Float32Array(n * 3);
    for (var j = 0; j < n; j++) {
      pos[j * 3] = (Math.random() - .5) * R * 2;
      pos[j * 3 + 1] = lv.altKm + Math.random() * lv.altKm * 0.2;
      pos[j * 3 + 2] = (Math.random() - .5) * R * 2;
    }
    var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: lv.sfc ? 0x6688bb : 0x4477aa,
      size: lv.sfc ? 0.14 : 0.18 + i * 0.035,
      transparent: true, opacity: lv.sfc ? 0.10 : 0.15,
      sizeAttenuation: true, depthWrite: false
    });
    var pts = new THREE.Points(geo, mat); V3D.windGroup.add(pts);
    V3D.windSystems.push({ pts: pts, spdMs: lv.spdMs, dir: lv.dir, R: R });
  });
}

function animWind3D() {
  V3D.windSystems.forEach(function (ws) {
    var pos = ws.pts.geometry.attributes.position.array;
    var n = pos.length / 3, dr = toRad3D(ws.dir), spd = ws.spdMs * 0.0006;
    var dx = Math.sin(dr) * spd, dz = -Math.cos(dr) * spd;
    for (var i = 0; i < n; i++) {
      pos[i * 3] += dx; pos[i * 3 + 2] += dz;
      if (pos[i * 3] > ws.R) pos[i * 3] -= ws.R * 2; if (pos[i * 3] < -ws.R) pos[i * 3] += ws.R * 2;
      if (pos[i * 3 + 2] > ws.R) pos[i * 3 + 2] -= ws.R * 2; if (pos[i * 3 + 2] < -ws.R) pos[i * 3 + 2] += ws.R * 2;
    }
    ws.pts.geometry.attributes.position.needsUpdate = true;
  });
}

// =====================================================
// HUD
// =====================================================
function refreshHUD3D() {
  var el = function (id) { return document.getElementById(id); };
  el('v3d-loc-name').textContent = S.locName || '\u2014';
  el('v3d-loc-coords').textContent = S.lat ? S.lat.toFixed(4) + '\u00b0, ' + S.lon.toFixed(4) + '\u00b0' : '\u2014';
  var stormsScanned = !!S.scanTime;
  var zones = sonarZones3D();
  var cnt = zones.length;
  el('v3d-storm-count').textContent = !stormsScanned ? 'Not scanned' : cnt ? cnt + ' zone' + (cnt !== 1 ? 's' : '') : 'Clear';
  var noscanEl = document.getElementById('v3d-noscan-msg');
  if (noscanEl) noscanEl.style.display = stormsScanned ? 'none' : 'block';
  if (!stormsScanned) {
    el('v3d-nearest-threat').textContent = 'Go to Radar tab to scan';
    el('v3d-nearest-threat').style.color = 'rgba(255,200,50,0.7)';
  } else {
    var sig = zones.filter(function (s) { return s.dbz >= 35; });
    if (sig.length) {
      var n = sig[0];
      el('v3d-nearest-threat').textContent = Math.round(n.dbz) + ' dBZ \u00b7 ' + fmtDist3D(n.distance) + ' ' + dir16_3D(n.bearing);
      el('v3d-nearest-threat').style.color = dbzHex3D(n.dbz);
    } else {
      el('v3d-nearest-threat').textContent = cnt ? 'No severe zones' : 'No active zones';
      el('v3d-nearest-threat').style.color = 'rgba(255,255,255,0.45)';
    }
  }
  if (S.stormMovement && S.stormMovement.speed > 1.5) {
    var sm = S.stormMovement;
    el('v3d-steering-info').textContent = dir16_3D(sm.direction) + ' ' + fmtSpeed3D(sm.speed) + ' (' + sm.direction + '\u00b0)';
  } else {
    el('v3d-steering-info').textContent = 'Calm / No data';
  }
  var w = S.weather;
  if (w) {
    var wsKmh = (w.wind_speed_10m || w.windSpeed || 0), wsMph = wsKmh * 0.621371;
    el('v3d-wind-info').textContent = dir16_3D(w.wind_direction_10m || w.windDirection || 0) + ' ' + fmtSpeed3D(wsMph);
  }
  var cbFt3D = S._cloudBaseFt || 0;
  if (!cbFt3D) {
    try {
      var wd = S._lastWeatherData;
      if (wd && wd.hourly && wd.hourly.temperature_2m && wd.hourly.dew_point_2m) {
        var hr = new Date().getHours();
        cbFt3D = Math.max(500, Math.round((wd.hourly.temperature_2m[hr] - wd.hourly.dew_point_2m[hr]) * 400));
      }
    } catch (e) { }
  }
  if (cbFt3D) {
    var cbTxt = V3D.metric ? Math.round(cbFt3D * 0.3048) + ' m' : cbFt3D.toLocaleString() + ' ft';
    el('v3d-cloud-base-info').textContent = cbTxt + ' AGL';
  }
}

// =====================================================
// STORM POPUP (3D)
// =====================================================
function openPopup3D(cell, cx, cy) {
  var popup = document.getElementById('v3d-popup');
  if (!popup) return;
  var cat = dbzCat3D(cell.dbz);
  document.getElementById('v3d-pop-cat').textContent = cat.name; document.getElementById('v3d-pop-cat').style.color = cat.col;
  document.getElementById('v3d-pop-dbz').textContent = Math.round(cell.dbz) + ' dBZ'; document.getElementById('v3d-pop-dbz').style.color = cat.col;
  var rows = '<div class="pop-row"><span class="pop-k">Distance</span><span class="pop-v">' + fmtDist3D(cell.distance) + '</span></div>';
  rows += '<div class="pop-row"><span class="pop-k">Direction</span><span class="pop-v">' + dir16_3D(cell.bearing) + ' (' + Math.round(cell.bearing) + '\u00b0)</span></div>';
  if (S.stormMovement && S.stormMovement.speed > 1.5) {
    var mv = S.stormMovement;
    rows += '<div class="pop-row"><span class="pop-k">Steering</span><span class="pop-v">' + dir16_3D(mv.direction) + ' ' + fmtSpeed3D(mv.speed) + '</span></div>';
  }
  rows += '<div class="pop-row"><span class="pop-k">Lat / Lon</span><span class="pop-v">' + cell.lat.toFixed(3) + '\u00b0, ' + (cell.lon || cell.lng).toFixed(3) + '\u00b0</span></div>';
  document.getElementById('v3d-pop-rows').innerHTML = rows;
  popup.style.left = Math.min(cx, window.innerWidth - 230) + 'px';
  popup.style.top = Math.min(cy, window.innerHeight - 200) + 'px';
  popup.style.display = 'block';
}

function onClick3D(e) {
  if (!V3D.ready) return;
  var rect = V3D.renderer.domElement.getBoundingClientRect();
  V3D.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  V3D.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  V3D.raycaster.setFromCamera(V3D.mouse, V3D.camera);
  var meshList = []; V3D.stormMeshes.forEach(function (sm) { sm.mesh.traverse(function (c) { if (c.isMesh) meshList.push(c); }); });
  var hits = V3D.raycaster.intersectObjects(meshList, false);
  if (hits.length) {
    var hitObj = hits[0].object, found = null;
    V3D.stormMeshes.forEach(function (sm) { sm.mesh.traverse(function (c) { if (c === hitObj) found = sm; }); });
    if (found) openPopup3D(found.cell, e.clientX, e.clientY);
  } else {
    var popup = document.getElementById('v3d-popup');
    if (popup) popup.style.display = 'none';
  }
}

// =====================================================
// RENDER LOOP
// =====================================================
function loop3D() {
  if (!V3D.active) { V3D.rafId = null; return; }
  V3D.rafId = requestAnimationFrame(loop3D);
  V3D.frame++;
  V3D.controls.update();
  var surfWind = S.weather ? S.weather.wind_direction_10m || S.weather.windDirection || 0 : 0;
  V3D.stormMeshes.forEach(function (sm) { animRain3D(sm.rain, surfWind); sm.mesh.position.y += Math.sin(V3D.frame * 0.015 + sm.mesh.id) * 0.0002; });
  if (V3D.frame % 2 === 0) animWind3D();
  if (V3D.frame % 3600 === 0) refreshSky3D();
  if (V3D.frame % 2 === 0) updateCompass3D();
  V3D.renderer.render(V3D.scene, V3D.camera);
}

// =====================================================
// PUBLIC API — called by switchPage / core.js
// =====================================================
var _v3dLocKey = '';
var _v3dLoading = false;

async function activate3DView() {
  if (typeof THREE === 'undefined') {
    console.warn('THREE.js not loaded — 3D view unavailable');
    var errEl = document.getElementById('v3d-engine-error');
    if (errEl) errEl.style.display = 'flex';
    return;
  }
  var errEl2 = document.getElementById('v3d-engine-error');
  if (errEl2) errEl2.style.display = 'none';
  if (!S.lat) {
    var msg = document.getElementById('v3d-empty-msg');
    if (msg) msg.style.display = 'flex';
    return;
  }
  var msg2 = document.getElementById('v3d-empty-msg');
  if (msg2) msg2.style.display = 'none';

  V3D.active = true;
  if (V3D._startMarkerPulse && !V3D._markerRAF) V3D._startMarkerPulse();
  var lblBtn = document.getElementById('v3d-label-toggle');
  if (lblBtn) lblBtn.style.borderColor = V3D._labelsVisible ? 'rgba(0,200,255,0.25)' : 'rgba(255,100,100,0.35)';

  if (!V3D.ready) {
    var loadEl = document.getElementById('v3d-loading');
    if (loadEl) loadEl.style.display = 'flex';
    init3DScene();
    var locKey = S.lat + ',' + S.lon;
    _v3dLocKey = locKey;
    _v3dLoading = true;
    await buildMapGround3D(S.lat, S.lon);
    _v3dLoading = false;
    refreshSky3D();
    rebuildStorms3D();
    rebuildWind3D();
    refreshHUD3D();
    if (loadEl) loadEl.style.display = 'none';
    loop3D();
    return;
  }

  var locKey = S.lat + ',' + S.lon;
  if (locKey !== _v3dLocKey && !_v3dLoading) {
    _v3dLocKey = locKey;
    _v3dLoading = true;
    var loadEl = document.getElementById('v3d-loading');
    if (loadEl) loadEl.style.display = 'flex';
    await buildMapGround3D(S.lat, S.lon);
    _v3dLoading = false;
    if (loadEl) loadEl.style.display = 'none';
  }

  refreshSky3D();
  rebuildStorms3D();
  rebuildWind3D();
  refreshHUD3D();
  onResize3D();
  if (!V3D.rafId) loop3D();
}

function deactivate3DView() {
  V3D.active = false;
  if (V3D._markerRAF) { cancelAnimationFrame(V3D._markerRAF); V3D._markerRAF = null; }
  V3D.stormMeshes.forEach(function (sm) { if (sm.ltTimer) { clearInterval(sm.ltTimer); sm.ltTimer = null; } });
  var popup = document.getElementById('v3d-popup');
  if (popup) popup.style.display = 'none';
}
