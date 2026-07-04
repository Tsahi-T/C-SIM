/* =========================================================
   C-SIM — world.js
   מנוע העולם: קרקע דינמית בצ'אנקים, ביומים, ערים, בניינים,
   כבישים, שדות חקלאיים, כפרים, אגמים, שדות תעופה, עננים,
   תוויות שמות, ומפת עולם מצוירת (משמשת גם את המיני-מפה).
   הכול דטרמיניסטי לפי seed — אשליה של עולם אינסופי.
   ========================================================= */
"use strict";

var WORLD = {
  scene: null,
  chunks: {},          // key -> chunk record
  buildQueue: [],
  labels: {},          // תוויות ערים פעילות
  airports: [],        // אובייקטים קבועים של שדות תעופה
  clouds: null,
  farDisc: null,
  mapCanvas: null,     // מפת עולם מצוירת (גם למיני-מפה)
  sun: null,
  _landCache: {}
};

var GAME_M_DEG = CFG.M_PER_DEG_LAT * CFG.WORLD_SCALE;

/* ============ גובה קרקע וביומים ============ */

// גורם עירוניות: 0..1 לפי קרבה לערים מוגדרות
WORLD.cityFactor = function (lat, lon) {
  var best = 0, bestCity = null;
  var lists = [GEO.ISRAEL_CITIES, GEO.WORLD_CITIES];
  for (var L = 0; L < lists.length; L++) {
    var arr = lists[L];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (Math.abs(c.lat - lat) > 0.6) continue;
      var d = U.distKm(lat, lon, c.lat, c.lon);
      var r = c.size * (L === 0 ? 2.0 : 2.6);   // רדיוס עיר בק"מ
      var f = 1 - d / r;
      if (f > best) { best = f; bestCity = c; }
    }
  }
  return { f: U.clamp(best, 0, 1), city: bestCity };
};

// בדיקת יבשה עם קאש (pointInPoly יקר יחסית)
WORLD.isLandC = function (lat, lon) {
  var k = (Math.round(lat * 200) + "_" + Math.round(lon * 200));
  var c = WORLD._landCache[k];
  if (c !== undefined) return c;
  var v = GEO.isLand(lat, lon);
  WORLD._landCache[k] = v;
  return v;
};

// גובה בסיס — תבליט בלבד, ללא שיטוח עירוני
WORLD.baseElev = function (lat, lon) {

  var e;
  if (GEO.inIsrael(lat, lon)) {
    // ישראל: מישור חוף, הרי יהודה/גליל, בקע הירדן, נגב
    var coastDist = (lon - 34.4) * 100;                  // ק"מ בערך מהחוף
    var hills = U.clamp((lon - 34.85) * 3.2, 0, 1);      // עלייה להרים
    var rift = Math.exp(-Math.pow((lon - 35.52) * 9, 2)); // בקע הירדן
    var north = U.clamp((lat - 30.2) / 2.2, 0, 1);       // הרים גבוהים יותר בצפון ובמרכז
    e = 15 + hills * (450 + 420 * U.fbm(lat * 30, lon * 30, 4)) * (0.45 + 0.55 * north);
    e -= rift * (e + 250);                               // צניחה לבקע
    var lakeNear = GEO.inLake(lat, U.clamp(lon, 35.35, 35.65));
    if (lat < 30.9 && lon < 35.0) {                      // נגב מערבי
      e = 80 + 220 * U.fbm(lat * 22, lon * 22, 3);
    }
    e += 25 * U.fbm(lat * 90, lon * 90, 2);
  } else {
    // עולם: גבעות לפי רעש, הרים באזורי "אמפליטודה" רועשים
    var mount = Math.pow(U.fbm(lat * 1.6 + 7, lon * 1.6 + 3, 3), 2.2);
    e = 30 + 240 * U.fbm(lat * 12, lon * 12, 4) + mount * 2400 * U.fbm(lat * 25, lon * 25, 4);
  }

  return Math.max(e, -428);
};

WORLD._cityElevCache = {};

// גובה קרקע גולמי: תבליט + שיטוח עירוני יחסי לגובה מרכז העיר
WORLD.rawElev = function (lat, lon) {
  if (!WORLD.isLandC(lat, lon)) return 0;
  var lake = GEO.inLake(lat, lon);
  if (lake) return lake.waterLevel;
  var e = WORLD.baseElev(lat, lon);
  var cf = WORLD.cityFactor(lat, lon);
  if (cf.f > 0 && cf.city) {
    var ce = WORLD._cityElevCache[cf.city.name];
    if (ce === undefined) {
      ce = WORLD.baseElev(cf.city.lat, cf.city.lon);
      WORLD._cityElevCache[cf.city.name] = ce;
    }
    e = U.lerp(e, ce, cf.f * 0.8);   // העיר יושבת על רמה בגובה המקומי
  }
  return e;
};

// גובה קרקע סופי — כולל שיטוח ליד שדות תעופה
WORLD.elev = function (lat, lon) {
  var e = WORLD.rawElev(lat, lon);
  for (var i = 0; i < GEO.AIRPORTS.length; i++) {
    var ap = GEO.AIRPORTS[i];
    if (Math.abs(ap.lat - lat) > 0.06) continue;
    var d = U.distKm(lat, lon, ap.lat, ap.lon);
    if (d < 3.5) {
      var t = U.clamp(1 - d / 3.5, 0, 1);
      e = U.lerp(e, ap.elev, Math.pow(t, 0.6));
    }
  }
  return e;
};

// טמפרטורה/לחות לביום — לפי קו רוחב + רעש
WORLD.biome = function (lat, lon, e) {
  var absLat = Math.abs(lat);
  var temp = 1 - absLat / 90 + 0.08 * (U.noise2(lat * 3, lon * 3) - 0.5);
  temp -= e / 9000;
  var moist = U.fbm(lat * 4 + 50, lon * 4 + 20, 3);
  if (GEO.inIsrael(lat, lon)) {
    moist = lat > 31.3 ? 0.55 : 0.25;                    // צפון ירוק, נגב צחיח
  }
  if (temp < 0.22) return "SNOW";
  if (temp < 0.34) return "TUNDRA";
  if (moist < 0.3) return "DESERT";
  if (moist > 0.62 && temp > 0.5) return "FOREST";
  return "GRASS";
};

WORLD.groundElevAt = function (lat, lon) {
  if (!WORLD.isLandC(lat, lon)) return 0;
  var lake = GEO.inLake(lat, lon);
  if (lake) return lake.waterLevel;
  return WORLD.elev(lat, lon);
};

/* ============ אתחול הסצנה ============ */

WORLD.init = function (scene) {
  WORLD.scene = scene;

  // גובה בסיס לכל שדה תעופה (לשיטוח עקבי)
  for (var i = 0; i < GEO.AIRPORTS.length; i++) {
    var ap = GEO.AIRPORTS[i];
    ap.elev = 0;
    ap.elev = WORLD.rawElev(ap.lat, ap.lon);
  }

  // תאורה
  var hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5e594a, 1.05);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff2dd, 0.95);
  sun.position.set(600, 1000, -400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 400;
  sun.shadow.camera.far = 2500;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  WORLD.sun = sun;

  scene.background = new THREE.Color(CFG.SKY_HORIZON);
  scene.fog = new THREE.Fog(CFG.SKY_HORIZON, 3000, CFG.VIEW_DISTANCE);

  WORLD.buildSky();

  // דיסקת אוקיינוס קרובה (מתחת לצ'אנקים) — עם ברק שמש עדין
  var ocean = new THREE.Mesh(
    new THREE.CircleGeometry(CFG.VIEW_DISTANCE * 1.4, 48),
    new THREE.MeshPhongMaterial({ color: CFG.COLORS.OCEAN, specular: 0x445566, shininess: 80 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -2;
  ocean.receiveShadow = true;
  scene.add(ocean);
  WORLD.ocean = ocean;

  WORLD.buildGroundTexture();
  WORLD.buildWorldTexture();
  WORLD.buildFarDisc();
  WORLD.buildClouds();
  WORLD.buildAirports();
};

/* ---------- כיפת שמיים עם גרדיאנט + שמש ---------- */
WORLD.buildSky = function () {
  var R = 800000;
  var geo = new THREE.SphereGeometry(R, 24, 16);
  var pos = geo.attributes.position;
  var colors = new Float32Array(pos.count * 3);
  var top = new THREE.Color(CFG.SKY_TOP);
  var hor = new THREE.Color(CFG.SKY_HORIZON);
  var low = new THREE.Color(0x8fa6ba);       // אובך מתחת לאופק
  var c = new THREE.Color();
  for (var i = 0; i < pos.count; i++) {
    var t = pos.getY(i) / R;
    if (t >= 0) c.copy(hor).lerp(top, Math.pow(t, 0.55));
    else c.copy(hor).lerp(low, U.clamp(-t * 4, 0, 1));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  var dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false
  }));
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  WORLD.scene.add(dome);

  // שמש — ספרייט זוהר בכיוון מקור האור
  var cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  var g2 = cv.getContext("2d");
  var grd = g2.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, "rgba(255,252,240,1)");
  grd.addColorStop(0.18, "rgba(255,246,214,0.9)");
  grd.addColorStop(0.5, "rgba(255,238,190,0.25)");
  grd.addColorStop(1, "rgba(255,235,180,0)");
  g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
  var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, fog: false,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
  var dir = new THREE.Vector3(600, 1000, -400).normalize();
  sunSprite.position.copy(dir.multiplyScalar(R * 0.9));
  sunSprite.scale.set(R * 0.14, R * 0.14, 1);
  sunSprite.renderOrder = -9;
  WORLD.scene.add(sunSprite);
};

/* ---------- טקסטורת פירוט לקרקע — רעש עדין שנותן תחושת תנועה ---------- */
WORLD.buildGroundTexture = function () {
  var cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  var c = cv.getContext("2d");
  c.fillStyle = "#fff";
  c.fillRect(0, 0, 128, 128);
  var img = c.getImageData(0, 0, 128, 128);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = 244 + Math.floor(Math.random() * 12);   // רעש בהירות עדין
    d[i] = d[i + 1] = d[i + 2] = n;
  }
  c.putImageData(img, 0, 0);
  // כתמים אקראיים כהים מעט (שיחים/סלעים מרומזים)
  for (var s = 0; s < 90; s++) {
    c.fillStyle = "rgba(60,60,45," + (0.05 + Math.random() * 0.1) + ")";
    var r = 0.6 + Math.random() * 1.8;
    c.beginPath();
    c.arc(Math.random() * 128, Math.random() * 128, r, 0, Math.PI * 2);
    c.fill();
  }
  var tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  WORLD.groundTex = tex;
};

/* ---------- ציור מפת העולם לקנבס (משותף למיני-מפה ולדיסק הרחוק) ---------- */
WORLD.buildWorldTexture = function () {
  var cv = document.createElement("canvas");
  cv.width = 2048; cv.height = 1024;
  var ctx = cv.getContext("2d");

  function px(lon, lat) {
    return [(lon + 180) / 360 * cv.width, (90 - lat) / 180 * cv.height];
  }

  // אוקיינוס — גרדיאנט עומק מהקטבים לקו המשווה
  var og = ctx.createLinearGradient(0, 0, 0, cv.height);
  og.addColorStop(0, "#14405f");
  og.addColorStop(0.35, "#1d5c8f");
  og.addColorStop(0.5, "#226899");
  og.addColorStop(0.65, "#1d5c8f");
  og.addColorStop(1, "#14405f");
  ctx.fillStyle = og;
  ctx.fillRect(0, 0, cv.width, cv.height);

  // יבשות — צבע לפי קו רוחב (חול/ירוק/שלג)
  for (var i = 0; i < GEO.CONTINENTS.length; i++) {
    var poly = GEO.CONTINENTS[i].poly;
    var latAvg = 0;
    for (var j = 0; j < poly.length; j++) latAvg += poly[j][1];
    latAvg /= poly.length;

    var grad = ctx.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, "#e8eef2");
    grad.addColorStop(0.2, "#7a9a68");
    grad.addColorStop(0.38, "#8aa060");
    grad.addColorStop(0.45, "#c2a06a");   // רצועת מדבריות
    grad.addColorStop(0.52, "#6f9a55");
    grad.addColorStop(0.75, "#7a9a68");
    grad.addColorStop(1, "#e8eef2");
    ctx.fillStyle = grad;

    ctx.beginPath();
    var p0 = px(poly[0][0], poly[0][1]);
    ctx.moveTo(p0[0], p0[1]);
    for (var j = 1; j < poly.length; j++) {
      var p = px(poly[j][0], poly[j][1]);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fill();
    // קו חוף עדין
    ctx.strokeStyle = "rgba(16, 36, 54, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // אנטארקטיקה
  ctx.fillStyle = "#e8eef2";
  ctx.fillRect(0, (90 + 69) / 180 * cv.height, cv.width, cv.height);

  // טקסטורת נקודות עדינה ליבשות (מרקם) — קריאת פיקסלים אחת בלבד
  var snap = ctx.getImageData(0, 0, cv.width, cv.height).data;
  for (var sp = 0; sp < 6000; sp++) {
    var sx = (Math.random() * cv.width) | 0, sy = (Math.random() * cv.height) | 0;
    var pi = (sy * cv.width + sx) * 4;
    if (snap[pi + 2] > snap[pi + 1]) continue;   // כחול = ים, לדלג
    ctx.fillStyle = "rgba(40,50,30," + (0.04 + Math.random() * 0.08) + ")";
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }

  // אגמים
  ctx.fillStyle = "#2a5a84";
  for (var i = 0; i < GEO.LAKES.length; i++) {
    var poly = GEO.LAKES[i].poly;
    ctx.beginPath();
    var p0 = px(poly[0][0], poly[0][1]);
    ctx.moveTo(p0[0], p0[1]);
    for (var j = 1; j < poly.length; j++) {
      var p = px(poly[j][0], poly[j][1]);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  WORLD.mapCanvas = cv;
};

/* ---------- דיסק רחוק: מציג את מפת העולם האמיתית מגובה ---------- */
WORLD.buildFarDisc = function () {
  var R = 700000;   // 700 ק"מ
  var geo = new THREE.CircleGeometry(R, 48, 0, Math.PI * 2);
  // שקיפות הדרגתית במרכז — הדיסק נמוג היכן שהצ'אנקים המפורטים מכסים,
  // כך שאין "טבעת תפר" חדה בין הקרוב לרחוק
  var pos = geo.attributes.position;
  var rgba = new Float32Array(pos.count * 4);
  for (var i = 0; i < pos.count; i++) {
    var r = Math.sqrt(pos.getX(i) * pos.getX(i) + pos.getY(i) * pos.getY(i));
    var a = U.clamp((r - 40000) / 70000, 0, 1);
    rgba[i * 4] = 1; rgba[i * 4 + 1] = 1; rgba[i * 4 + 2] = 1; rgba[i * 4 + 3] = a;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
  var tex = new THREE.CanvasTexture(WORLD.mapCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  var mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, vertexColors: true
  });
  var disc = new THREE.Mesh(geo, mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -40;
  disc.renderOrder = -2;
  WORLD.scene.add(disc);
  WORLD.farDisc = disc;
  WORLD._farGeoPos = geo.attributes.position;
  WORLD._farUV = geo.attributes.uv;
};

// עדכון UV של הדיסק הרחוק כך שכל ורטקס יקבל את צבע המפה בנקודה הגיאוגרפית שלו
WORLD.updateFarDisc = function (lat, lon, alt) {
  var disc = WORLD.farDisc;
  // שקיפות: נכנס בהדרגה מעל 2500 מ'
  var op = U.clamp((alt - 2500) / 4000, 0, 0.95);
  disc.material.opacity = op;
  if (op <= 0) { disc.visible = false; return; }
  disc.visible = true;

  var pos = WORLD._farGeoPos, uv = WORLD._farUV;
  var mLat = GAME_M_DEG, mLon = U.mPerDegLon(lat) * CFG.WORLD_SCALE;
  for (var i = 0; i < pos.count; i++) {
    // הדיסק מסובב: x המקומי = מזרח, y המקומי (לפני סיבוב) = צפון
    var vLon = lon + pos.getX(i) / mLon;
    var vLat = lat + pos.getY(i) / mLat;
    vLat = U.clamp(vLat, -89.9, 89.9);
    uv.setXY(i, (vLon + 180) / 360, (vLat + 90) / 180);
  }
  uv.needsUpdate = true;
};

/* ---------- עננים ---------- */
WORLD.buildClouds = function () {
  var cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  var c = cv.getContext("2d");
  var grd = c.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  c.fillStyle = grd;
  c.fillRect(0, 0, 128, 128);
  var tex = new THREE.CanvasTexture(cv);
  var group = new THREE.Group();
  var N = 48, BOX = 70000;
  for (var i = 0; i < N; i++) {
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.35 + Math.random() * 0.35, fog: true, depthWrite: false });
    var s = new THREE.Sprite(mat);
    var sc = 1800 + Math.random() * 4200;
    s.scale.set(sc, sc * (0.28 + Math.random() * 0.15), 1);
    s.position.set((Math.random() - 0.5) * BOX, 2000 + Math.random() * 2600, (Math.random() - 0.5) * BOX);
    group.add(s);
  }
  group.userData.BOX = BOX;
  WORLD.scene.add(group);
  WORLD.clouds = group;
};

// עטיפת עננים סביב המטוס — אשליה של שדה עננים אינסופי
WORLD.updateClouds = function (moveX, moveZ) {
  var g = WORLD.clouds, BOX = g.userData.BOX, H = BOX / 2;
  for (var i = 0; i < g.children.length; i++) {
    var p = g.children[i].position;
    p.x -= moveX; p.z -= moveZ;
    if (p.x > H) p.x -= BOX; if (p.x < -H) p.x += BOX;
    if (p.z > H) p.z -= BOX; if (p.z < -H) p.z += BOX;
  }
};

/* ---------- שדות תעופה: מסלול + מגדל ---------- */
WORLD.buildAirports = function () {
  var runwayMat = new THREE.MeshLambertMaterial({ color: CFG.COLORS.RUNWAY });
  var stripeMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  for (var i = 0; i < GEO.AIRPORTS.length; i++) {
    var ap = GEO.AIRPORTS[i];
    var g = new THREE.Group();

    var L = 2900, W = 45;
    var rw = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, L), runwayMat);
    rw.position.y = 0.3;
    rw.receiveShadow = true;
    g.add(rw);
    // קו אמצע מקווקו
    for (var s = -L / 2 + 100; s < L / 2 - 100; s += 200) {
      var st = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 60), stripeMat);
      st.position.set(0, 0.75, s);
      g.add(st);
    }
    // סימוני סף
    for (var t = -1; t <= 1; t += 2) {
      for (var k = -4; k <= 4; k++) {
        var th = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 40), stripeMat);
        th.position.set(k * 4.2, 0.75, t * (L / 2 - 60));
        g.add(th);
      }
    }
    // מסלול הסעה ורחבה
    var apron = new THREE.Mesh(new THREE.BoxGeometry(220, 0.4, 160), runwayMat);
    apron.position.set(W / 2 + 150, 0.2, L * 0.25);
    apron.receiveShadow = true;
    g.add(apron);
    var taxi = new THREE.Mesh(new THREE.BoxGeometry(150, 0.4, 20), runwayMat);
    taxi.position.set(W / 2 + 75, 0.2, L * 0.25);
    g.add(taxi);

    // מגדל פיקוח
    var tower = new THREE.Group();
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 26, 8),
      new THREE.MeshLambertMaterial({ color: 0xb9b9ae }));
    shaft.position.y = 13;
    tower.add(shaft);
    var cab = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 6, 8),
      new THREE.MeshLambertMaterial({ color: 0x3d5a6e }));
    cab.position.y = 29;
    tower.add(cab);
    tower.position.set(W / 2 + 180, 0, L * 0.25 + 100);
    g.add(tower);

    // האנגרים
    for (var h = 0; h < 3; h++) {
      var hang = new THREE.Mesh(new THREE.BoxGeometry(38, 12, 30),
        new THREE.MeshLambertMaterial({ color: 0x8a8d84 }));
      hang.position.set(W / 2 + 120 + h * 46, 6, L * 0.25 - 70);
      g.add(hang);
    }

    g.rotation.y = -ap.heading * U.DEG;
    WORLD.scene.add(g);
    WORLD.airports.push({ ap: ap, group: g });
  }
};

/* ============ מערכת הצ'אנקים ============ */

var CHUNK_DEG = CFG.CHUNK_DEG;
var N_LON = Math.round(360 / CHUNK_DEG);

function chunkKey(li, gi) {
  gi = ((gi % N_LON) + N_LON) % N_LON;
  return li + "_" + gi;
}

/* בניית צ'אנק בודד — קרקע + תוכן */
WORLD.buildChunk = function (li, gi, detail) {
  var latC = (li + 0.5) * CHUNK_DEG;
  var lonC = U.wrapLon((gi + 0.5) * CHUNK_DEG);
  var mLon = U.mPerDegLon(latC) * CFG.WORLD_SCALE;
  var w = CHUNK_DEG * mLon;          // רוחב פיזי (מ')
  var h = CHUNK_DEG * GAME_M_DEG;    // גובה פיזי

  var group = new THREE.Group();
  var seed = ((li * 73856093) ^ (gi * 19349663)) >>> 0;
  var rand = U.rng(seed);

  /* --- אריח קרקע עם צבעי ורטקסים --- */
  var SEG = detail ? 10 : 6;
  var geo = new THREE.PlaneGeometry(w, h, SEG, SEG);
  geo.rotateX(-Math.PI / 2);   // עכשיו x=מזרח, z=דרום (חיובי), y=גובה
  var pos = geo.attributes.position;
  var colors = new Float32Array(pos.count * 3);
  var col = new THREE.Color();
  var anyLand = false, allWater = true;

  for (var i = 0; i < pos.count; i++) {
    var vx = pos.getX(i), vz = pos.getZ(i);
    var vLat = latC - vz / GAME_M_DEG;
    var vLon = U.wrapLon(lonC + vx / mLon);
    var land = WORLD.isLandC(vLat, vLon);
    var lake = land ? GEO.inLake(vLat, vLon) : null;
    var e;
    if (!land) {
      e = 0; col.setHex(CFG.COLORS.OCEAN);
    } else if (lake) {
      e = lake.waterLevel; col.setHex(0x2a5a84);
      anyLand = true;
    } else {
      anyLand = true; allWater = false;
      e = WORLD.elev(vLat, vLon);
      var b = WORLD.biome(vLat, vLon, e);
      var cf = WORLD.cityFactor(vLat, vLon);
      if (cf.f > 0.3) {
        col.setHex(CFG.COLORS.URBAN);
        col.offsetHSL(0, 0, (U.hash2(i, seed & 1023) - 0.5) * 0.06);
      } else if (b === "DESERT") {
        col.setHex(CFG.COLORS.DESERT);
        col.offsetHSL(0, 0, (U.fbm(vLat * 300, vLon * 300, 2) - 0.5) * 0.12);
      } else if (b === "SNOW") {
        col.setHex(CFG.COLORS.SNOW);
      } else if (b === "TUNDRA") {
        col.setHex(CFG.COLORS.TUNDRA);
      } else {
        // שדות חקלאיים — טלאים לפי רשת
        var fx = Math.floor(vLat * 220), fy = Math.floor(vLon * 180);
        var fh = U.hash2(fx, fy);
        var flatish = e < 400;
        if (flatish && fh < 0.55 && b !== "FOREST") {
          col.setHex(fh < 0.2 ? CFG.COLORS.FIELD_A : (fh < 0.38 ? CFG.COLORS.FIELD_B : CFG.COLORS.FIELD_C));
        } else if (b === "FOREST") {
          col.setHex(CFG.COLORS.FOREST);
          col.offsetHSL(0, 0, (U.fbm(vLat * 250, vLon * 250, 2) - 0.5) * 0.1);
        } else {
          col.setHex(CFG.COLORS.GRASS);
          col.offsetHSL(0, 0.05, (U.fbm(vLat * 250, vLon * 250, 2) - 0.5) * 0.12);
        }
        // פסגות מושלגות
        if (e > 2200) col.setHex(CFG.COLORS.SNOW);
      }
      // חוף חולי
      if (e < 12 && !lake) col.lerp(new THREE.Color(CFG.COLORS.SAND), U.clamp(1 - e / 12, 0, 0.7));
    }
    pos.setY(i, e);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // מתיחת UV כך שטקסטורת הפירוט חוזרת כל ~55 מ' — נותן לקרקע מרקם ותנועה
  var uv = geo.attributes.uv;
  for (var ui = 0; ui < uv.count; ui++) {
    uv.setXY(ui, uv.getX(ui) * (w / 55), uv.getY(ui) * (h / 55));
  }
  var groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: WORLD.groundTex });
  var ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  /* --- תוכן מפורט (רק בצ'אנקים קרובים על יבשה) --- */
  if (detail && anyLand) {
    WORLD.populateChunk(group, latC, lonC, w, h, mLon, rand, seed);
  }

  var rec = {
    li: li, gi: gi, latC: latC, lonC: lonC,
    group: group, detail: detail
  };
  WORLD.scene.add(group);
  WORLD.chunks[chunkKey(li, gi)] = rec;
  return rec;
};

/* מילוי צ'אנק: בניינים, בתים, עצים, כבישים, כפרים */
WORLD.populateChunk = function (group, latC, lonC, w, h, mLon, rand, seed) {
  var cfC = WORLD.cityFactor(latC, lonC);
  var eC = WORLD.elev(latC, lonC);
  var bC = WORLD.biome(latC, lonC, eC);

  var boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);   // עוגן בבסיס

  function localPos(dLatDeg, dLonDeg) {
    return { x: dLonDeg * mLon, z: -dLatDeg * GAME_M_DEG };
  }

  /* --- אזור עירוני: בניינים ברשת --- */
  if (cfC.f > 0.22) {
    var city = cfC.city;
    var gridAng = (U.hash2(Math.round(city.lat * 100), Math.round(city.lon * 100)) - 0.5) * 1.2;
    var downtown = cfC.f > 0.72;
    var n = Math.floor(20 + cfC.f * 90);
    var bmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var inst = new THREE.InstancedMesh(boxGeo, bmat, n);
    var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
    var colInst = new THREE.Color();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), gridAng);

    // רשת רחובות: מיקומים מיושרים
    var cell = 90 + rand() * 40;
    for (var i = 0; i < n; i++) {
      var gx = (Math.floor(rand() * (w / cell)) + 0.5) * cell - w / 2 + (rand() - 0.5) * 20;
      var gz = (Math.floor(rand() * (h / cell)) + 0.5) * cell - h / 2 + (rand() - 0.5) * 20;
      var vLat = latC - gz / GAME_M_DEG, vLon = lonC + gx / mLon;
      if (!WORLD.isLandC(vLat, vLon) || GEO.inLake(vLat, vLon)) { i--; n--; continue; }
      var localCf = WORLD.cityFactor(vLat, vLon).f;
      if (localCf < 0.2) continue;
      var e = WORLD.elev(vLat, vLon);
      var tall = downtown && rand() < 0.35;
      var bh = tall ? 40 + rand() * 130 : 8 + rand() * 22 + localCf * 14;
      var bw = tall ? 18 + rand() * 14 : 12 + rand() * 18;
      sc.set(bw, bh, tall ? 18 + rand() * 14 : 12 + rand() * 20);
      pv.set(gx, e - 0.5, gz);
      m4.compose(pv, q, sc);
      inst.setMatrixAt(i, m4);
      var shade = 0.55 + rand() * 0.35;
      colInst.setRGB(shade, shade * (tall ? 0.97 : 0.93), shade * (tall ? 1.02 : 0.85));
      inst.setColorAt(i, colInst);
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);

    // רחובות — פסים כהים
    var roadMat = new THREE.MeshLambertMaterial({ color: CFG.COLORS.ROAD });
    var nR = 3 + Math.floor(cfC.f * 4);
    for (var r = 0; r < nR; r++) {
      var horiz = r % 2 === 0;
      var off = (rand() - 0.5) * (horiz ? h : w) * 0.8;
      var road = new THREE.Mesh(new THREE.BoxGeometry(horiz ? w * 0.95 : 9, 0.5, horiz ? 9 : h * 0.95), roadMat);
      var rLat = horiz ? latC - off / GAME_M_DEG : latC;
      var rLon = horiz ? lonC : lonC + off / mLon;
      road.position.set(horiz ? 0 : off, WORLD.elev(rLat, rLon) + 0.4, horiz ? off : 0);
      road.rotation.y = gridAng;
      group.add(road);
    }
  }
  /* --- אזור כפרי --- */
  else if (bC !== "SNOW" && bC !== "TUNDRA" && eC < 1500) {
    // כפר קטן? (הסתברות דטרמיניסטית)
    var villageChance = GEO.inIsrael(latC, lonC) ? 0.30 : 0.12;
    if (rand() < villageChance) {
      var vn = 8 + Math.floor(rand() * 16);
      var vmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      var vinst = new THREE.InstancedMesh(boxGeo, vmat, vn);
      var vm4 = new THREE.Matrix4(), vq = new THREE.Quaternion(), vsc = new THREE.Vector3(), vp = new THREE.Vector3();
      var vcol = new THREE.Color();
      var vx0 = (rand() - 0.5) * w * 0.5, vz0 = (rand() - 0.5) * h * 0.5;
      for (var i = 0; i < vn; i++) {
        var dx = vx0 + (rand() - 0.5) * 400, dz = vz0 + (rand() - 0.5) * 400;
        var vLat = latC - dz / GAME_M_DEG, vLon = lonC + dx / mLon;
        if (!WORLD.isLandC(vLat, vLon) || GEO.inLake(vLat, vLon)) continue;
        var e = WORLD.elev(vLat, vLon);
        vq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
        vsc.set(8 + rand() * 8, 4 + rand() * 5, 8 + rand() * 10);
        vp.set(dx, e - 0.4, dz);
        vm4.compose(vp, vq, vsc);
        vinst.setMatrixAt(i, vm4);
        vcol.setRGB(0.75 + rand() * 0.2, 0.7 + rand() * 0.15, 0.6 + rand() * 0.15);
        vinst.setColorAt(i, vcol);
      }
      vinst.instanceMatrix.needsUpdate = true;
      group.add(vinst);
    }

    // עצים — ביער ובאזורים ירוקים
    var treeDensity = bC === "FOREST" ? 70 : (bC === "GRASS" ? 18 : 3);
    if (treeDensity > 0) {
      var tGeo = new THREE.ConeGeometry(4, 12, 5);
      tGeo.translate(0, 6, 0);
      var tMat = new THREE.MeshLambertMaterial({ color: 0x2e5a2a });
      var tn = treeDensity;
      var tinst = new THREE.InstancedMesh(tGeo, tMat, tn);
      var tm4 = new THREE.Matrix4(), tq = new THREE.Quaternion(), tsc = new THREE.Vector3(), tp = new THREE.Vector3();
      var tcol = new THREE.Color();
      var placed = 0;
      for (var i = 0; i < tn * 2 && placed < tn; i++) {
        var dx = (rand() - 0.5) * w, dz = (rand() - 0.5) * h;
        var vLat = latC - dz / GAME_M_DEG, vLon = lonC + dx / mLon;
        if (!WORLD.isLandC(vLat, vLon) || GEO.inLake(vLat, vLon)) continue;
        var e = WORLD.elev(vLat, vLon);
        if (e > 1800) continue;
        var s = 0.7 + rand() * 1.1;
        tsc.set(s, s, s);
        tp.set(dx, e, dz);
        tm4.compose(tp, tq, tsc);
        tinst.setMatrixAt(placed, tm4);
        tcol.setHSL(0.32 + rand() * 0.05, 0.5, 0.22 + rand() * 0.12);
        tinst.setColorAt(placed, tcol);
        placed++;
      }
      tinst.count = placed;
      tinst.instanceMatrix.needsUpdate = true;
      group.add(tinst);
    }
  }

  /* --- כבישים בין-עירוניים בישראל --- */
  if (GEO.inIsrael(latC, lonC)) {
    var roadMat2 = new THREE.MeshLambertMaterial({ color: CFG.COLORS.ROAD });
    var half = CHUNK_DEG / 2 + 0.01;
    for (var hw = 0; hw < GEO.HIGHWAYS.length; hw++) {
      var line = GEO.HIGHWAYS[hw];
      for (var s = 0; s < line.length - 1; s++) {
        var a = line[s], b = line[s + 1];
        // האם הקטע חוצה את הצ'אנק? בדיקת חפיפת מלבנים
        var minLat = Math.min(a[0], b[0]), maxLat = Math.max(a[0], b[0]);
        var minLon = Math.min(a[1], b[1]), maxLon = Math.max(a[1], b[1]);
        if (maxLat < latC - half || minLat > latC + half) continue;
        if (maxLon < lonC - half || minLon > lonC + half) continue;
        // דגימת הקטע ובניית מקטעי כביש בתוך הצ'אנק
        var segLenKm = U.distKm(a[0], a[1], b[0], b[1]);
        var steps = Math.max(2, Math.ceil(segLenKm / 0.9));
        for (var st = 0; st < steps; st++) {
          var t0 = st / steps, t1 = (st + 1) / steps;
          var la0 = a[0] + (b[0] - a[0]) * t0, lo0 = a[1] + (b[1] - a[1]) * t0;
          var la1 = a[0] + (b[0] - a[0]) * t1, lo1 = a[1] + (b[1] - a[1]) * t1;
          var mid = [(la0 + la1) / 2, (lo0 + lo1) / 2];
          if (Math.abs(mid[0] - latC) > half || Math.abs(mid[1] - lonC) > half) continue;
          var x0 = (lo0 - lonC) * mLon, z0 = -(la0 - latC) * GAME_M_DEG;
          var x1 = (lo1 - lonC) * mLon, z1 = -(la1 - latC) * GAME_M_DEG;
          var len = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
          if (len < 5) continue;
          var seg = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, len + 12), roadMat2);
          var em = WORLD.elev(mid[0], mid[1]);
          seg.position.set((x0 + x1) / 2, em + 0.8, (z0 + z1) / 2);
          seg.rotation.y = Math.atan2(x1 - x0, z1 - z0) + Math.PI;
          group.add(seg);
        }
      }
    }
  }
};

/* פירוק צ'אנק ושחרור זיכרון */
WORLD.disposeChunk = function (key) {
  var rec = WORLD.chunks[key];
  if (!rec) return;
  WORLD.scene.remove(rec.group);
  rec.group.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
      else o.material.dispose();
    }
  });
  delete WORLD.chunks[key];
};

/* ============ עדכון פר-פריים ============ */

WORLD.update = function (lat, lon, alt, dt, moveX, moveZ) {
  var li0 = Math.floor(lat / CHUNK_DEG);
  var gi0 = Math.floor(lon / CHUNK_DEG);

  // רדיוס נדרש — גדל מעט עם הגובה
  var extra = U.clamp(Math.floor(alt / 4000), 0, 3);
  var gR = CFG.GROUND_RADIUS + extra;
  var dR = CFG.DETAIL_RADIUS;

  // סימון צ'אנקים נדרשים
  var needed = {};
  for (var dl = -gR; dl <= gR; dl++) {
    for (var dg = -gR; dg <= gR; dg++) {
      if (dl * dl + dg * dg > gR * gR + 2) continue;
      var li = li0 + dl, gi = gi0 + dg;
      if (li * CHUNK_DEG > 89 || li * CHUNK_DEG < -89) continue;
      var key = chunkKey(li, gi);
      var wantDetail = (Math.abs(dl) <= dR && Math.abs(dg) <= dR);
      needed[key] = { li: li, gi: gi, detail: wantDetail };
    }
  }

  // הסרת צ'אנקים רחוקים / שדרוג רמת פירוט
  for (var key in WORLD.chunks) {
    var rec = WORLD.chunks[key];
    if (!needed[key]) { WORLD.disposeChunk(key); continue; }
    if (needed[key].detail && !rec.detail) {
      WORLD.disposeChunk(key);   // ייבנה מחדש עם פירוט
    }
  }

  // תור בנייה — קרובים קודם
  WORLD.buildQueue.length = 0;
  for (var key in needed) {
    if (!WORLD.chunks[key]) {
      var n = needed[key];
      var d2 = (n.li - li0) * (n.li - li0) + (n.gi - gi0) * (n.gi - gi0);
      WORLD.buildQueue.push({ li: n.li, gi: n.gi, detail: n.detail, d2: d2 });
    }
  }
  WORLD.buildQueue.sort(function (a, b) { return a.d2 - b.d2; });
  var built = 0;
  for (var i = 0; i < WORLD.buildQueue.length && built < CFG.MAX_CHUNKS_PER_FRAME; i++) {
    var b = WORLD.buildQueue[i];
    WORLD.buildChunk(b.li, b.gi, b.detail);
    built++;
  }

  // מיקום כל הצ'אנקים יחסית למטוס
  var mLonHere = U.mPerDegLon(lat) * CFG.WORLD_SCALE;
  for (var key in WORLD.chunks) {
    var rec = WORLD.chunks[key];
    rec.group.position.x = U.dLon(lon, rec.lonC) * mLonHere;
    rec.group.position.z = -(rec.latC - lat) * GAME_M_DEG;
  }

  // שדות תעופה
  for (var i = 0; i < WORLD.airports.length; i++) {
    var a = WORLD.airports[i];
    a.group.position.x = U.dLon(lon, a.ap.lon) * mLonHere;
    a.group.position.z = -(a.ap.lat - lat) * GAME_M_DEG;
    a.group.position.y = a.ap.elev;
    var distX = Math.abs(a.group.position.x), distZ = Math.abs(a.group.position.z);
    a.group.visible = distX < 150000 && distZ < 150000;
  }

  WORLD.updateClouds(moveX, moveZ);
  WORLD.updateFarDisc(lat, lon, alt);
  WORLD.updateLabels(lat, lon, alt);

  // ערפל תלוי גובה — למעלה רואים רחוק יותר
  var viewDist = CFG.VIEW_DISTANCE + alt * 14;
  WORLD.scene.fog.far = viewDist;
  WORLD.scene.fog.near = viewDist * 0.35;
  WORLD.ocean.geometry.boundingSphere = null;
  var oceanScale = Math.max(1, viewDist * 1.4 / (CFG.VIEW_DISTANCE * 1.4));
  WORLD.ocean.scale.setScalar(oceanScale);
};

/* ============ תוויות שמות בתלת-ממד ============ */

WORLD.makeLabelSprite = function (text, big) {
  var cv = document.createElement("canvas");
  var fs = big ? 44 : 34;
  cv.width = 512; cv.height = 96;
  var c = cv.getContext("2d");
  c.font = "bold " + fs + "px 'Segoe UI', Arial";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = "rgba(0,0,0,0.9)"; c.shadowBlur = 8;
  c.fillStyle = big ? "#ffe9a0" : "#e6f4ff";
  c.fillText(text, 256, 48);
  var tex = new THREE.CanvasTexture(cv);
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
  var sp = new THREE.Sprite(mat);
  sp.renderOrder = 10;
  return sp;
};

WORLD.updateLabels = function (lat, lon, alt) {
  var showKm = 25 + alt / 90;    // מגובה רואים תוויות רחוקות יותר
  var mLonHere = U.mPerDegLon(lat) * CFG.WORLD_SCALE;
  var active = {};

  function place(list, isCountry) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var d = U.distKm(lat, lon, c.lat, c.lon);
      var lim = isCountry ? U.clamp(alt / 12, 80, 1200) : showKm * (c.size ? (0.5 + c.size * 0.22) : 1);
      if (d > lim) continue;
      var key = (isCountry ? "C:" : "T:") + c.name;
      active[key] = true;
      var rec = WORLD.labels[key];
      if (!rec) {
        var sp = WORLD.makeLabelSprite(c.name, isCountry);
        WORLD.scene.add(sp);
        rec = WORLD.labels[key] = { sprite: sp, data: c };
      }
      var x = U.dLon(lon, c.lon) * mLonHere;
      var z = -(c.lat - lat) * GAME_M_DEG;
      var ey = isCountry ? alt * 0.35 + 500 : WORLD.groundElevAt(c.lat, c.lon) + 250 + (c.size || 1) * 60;
      rec.sprite.position.set(x, ey, z);
      var scl = U.clamp(d * 1000 * 0.08, 350, 34000) * (isCountry ? 2.2 : 1);
      rec.sprite.scale.set(scl, scl * 0.19, 1);
    }
  }

  place(GEO.ISRAEL_CITIES, false);
  place(GEO.WORLD_CITIES, false);
  place(GEO.COUNTRIES, true);

  for (var key in WORLD.labels) {
    if (!active[key]) {
      var rec = WORLD.labels[key];
      WORLD.scene.remove(rec.sprite);
      rec.sprite.material.map.dispose();
      rec.sprite.material.dispose();
      delete WORLD.labels[key];
    }
  }
};

/* ============ שם מיקום נוכחי (לימודי) ============ */

WORLD.oceanName = function (lat, lon) {
  if (lat > 30 && lat < 46 && lon > -6 && lon < 37) return "הים התיכון";
  if (lat > 12 && lat < 30 && lon > 32 && lon < 44) return "ים סוף";
  if (lat > 24 && lat < 30.5 && lon > 47 && lon < 57) return "המפרץ הפרסי";
  if (lat > 41 && lat < 47.5 && lon > 27 && lon < 42) return "הים השחור";
  if (lat > -40 && lat < 26 && lon > 38 && lon < 115) return "האוקיינוס ההודי";
  if (lon > -75 && lon < 20 && lat > -60) return "האוקיינוס האטלנטי";
  if (lon > 115 || lon < -75) return "האוקיינוס השקט";
  if (lat < -60) return "האוקיינוס הדרומי";
  return "הים";
};

WORLD.locationName = function (lat, lon) {
  var city = GEO.nearestCity(lat, lon, 25);
  var nc = GEO.nearestCountry(lat, lon);
  var land = WORLD.isLandC(lat, lon);
  var lake = GEO.inLake(lat, lon);
  if (lake) return "מעל " + lake.name;
  if (!land) {
    var oc = WORLD.oceanName(lat, lon);
    if (nc.distKm < 350) return oc + " — ליד " + nc.country.name;
    return oc;
  }
  if (city && nc.country) return city.city.name + ", " + nc.country.name;
  if (nc.country) return nc.country.name;
  return U.fmtCoord(lat, lon);
};
