/* =========================================================
   C-SIM — aircraft.js
   מודל תלת-ממד של מטוס קרב מפרימיטיבים + מודל טיסה.
   מערכת צירים: קדימה = ‎-Z, למעלה = +Y, ימין = +X.
   ========================================================= */
"use strict";

/* ---------- בניית המודל התלת-ממדי ---------- */

// "לופט" — בניית גוף מחתכי רוחב לאורך ציר Z (הטכניקה של גוף מטוס אמיתי)
function loftGeometry(profile, sections) {
  var N = profile.length, S = sections.length;
  var positions = new Float32Array(N * S * 3);
  var k = 0;
  for (var s = 0; s < S; s++) {
    var sec = sections[s];
    for (var i = 0; i < N; i++) {
      positions[k++] = profile[i][0] * sec.sx;
      positions[k++] = profile[i][1] * sec.sy + sec.y;
      positions[k++] = sec.z;
    }
  }
  var indices = [];
  for (var s = 0; s < S - 1; s++) {
    for (var i = 0; i < N; i++) {
      var a = s * N + i, b = s * N + (i + 1) % N;
      var c = (s + 1) * N + i, d = (s + 1) * N + (i + 1) % N;
      indices.push(a, b, d, a, d, c);
    }
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// טקסטורת סמל חיל האוויר (מגן דוד בעיגול) לכנפיים
function makeRoundelTexture() {
  var cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  var c = cv.getContext("2d");
  c.clearRect(0, 0, 128, 128);
  c.beginPath(); c.arc(64, 64, 56, 0, Math.PI * 2);
  c.fillStyle = "#ffffff"; c.fill();
  c.lineWidth = 6; c.strokeStyle = "#0038b8"; c.stroke();
  c.lineWidth = 7; c.lineJoin = "round";
  c.beginPath();  // משולש עליון
  c.moveTo(64, 22); c.lineTo(100, 84); c.lineTo(28, 84); c.closePath(); c.stroke();
  c.beginPath();  // משולש תחתון
  c.moveTo(64, 106); c.lineTo(28, 44); c.lineTo(100, 44); c.closePath(); c.stroke();
  var tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function buildJet() {
  var g = new THREE.Group();
  // אפור מטוס קרב רך עם ברק מתכתי עדין
  var body = new THREE.MeshPhongMaterial({ color: 0x5d6269, specular: 0x24272c, shininess: 24 });
  var dark = new THREE.MeshPhongMaterial({ color: 0x33373d, specular: 0x1a1d22, shininess: 20 });
  var black = new THREE.MeshPhongMaterial({ color: 0x17181c, specular: 0x111111, shininess: 12 });
  // חופה כהה מבריקה — עדין, בלי צבע בולט
  var glass = new THREE.MeshPhongMaterial({
    color: 0x222a36, specular: 0xaabbcc, shininess: 150
  });

  /* --- הגוף: לופט עם קווי chine — חתך מעוין של מטוס חמקן --- */
  var profile = [
    [1.00, 0.00], [0.90, 0.24], [0.66, 0.44], [0.36, 0.56], [0, 0.62],
    [-0.36, 0.56], [-0.66, 0.44], [-0.90, 0.24], [-1.00, 0.00],
    [-0.86, -0.20], [-0.52, -0.36], [0, -0.42], [0.52, -0.36], [0.86, -0.20]
  ];
  var sections = [
    { z: -9.35, sx: 0.02, sy: 0.02, y: 0.08 },
    { z: -8.60, sx: 0.24, sy: 0.26, y: 0.08 },
    { z: -7.40, sx: 0.48, sy: 0.48, y: 0.10 },
    { z: -6.00, sx: 0.82, sy: 0.76, y: 0.13 },
    { z: -4.40, sx: 1.20, sy: 1.05, y: 0.14 },
    { z: -2.60, sx: 1.52, sy: 1.28, y: 0.09 },
    { z: -0.60, sx: 1.66, sy: 1.38, y: 0.02 },
    { z: 1.60, sx: 1.64, sy: 1.36, y: 0.00 },
    { z: 3.80, sx: 1.48, sy: 1.24, y: 0.00 },
    { z: 5.80, sx: 1.12, sy: 1.00, y: 0.02 },
    { z: 7.20, sx: 0.82, sy: 0.82, y: 0.02 },
    { z: 8.20, sx: 0.58, sy: 0.62, y: 0.02 }
  ];
  var fus = new THREE.Mesh(loftGeometry(profile, sections), body);
  g.add(fus);

  // סגירת הזנב מאחורי הנחיר
  var tailCap = new THREE.Mesh(new THREE.CircleGeometry(0.68, 16), dark);
  tailCap.position.set(0, 0.02, 8.21);
  g.add(tailCap);

  // חטוטרת גב (spine) מאחורי החופה — נמוכה ומתמזגת
  var spine = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), body);
  spine.scale.set(0.48, 0.26, 2.4);
  spine.position.set(0, 0.62, -1.3);
  g.add(spine);

  /* --- חופה: טיפת דמעה מוארכת, כהה ומבריקה --- */
  var canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), glass);
  canopy.scale.set(0.48, 0.5, 1.75);
  canopy.position.set(0, 0.62, -4.7);
  g.add(canopy);
  // מסגרת קשת דקה
  var bow = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.028, 6, 16, Math.PI), dark);
  bow.rotation.y = Math.PI / 2;
  bow.rotation.z = Math.PI / 2;
  bow.position.set(0, 0.62, -4.0);
  g.add(bow);

  /* --- כניסות אוויר עדינות בצידי הגוף --- */
  for (var side = -1; side <= 1; side += 2) {
    var bump = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), body);
    bump.scale.set(0.45, 0.42, 1.15);
    bump.position.set(side * 1.1, -0.08, -3.0);
    g.add(bump);
    var mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), black);
    mouth.position.set(side * 1.32, -0.05, -3.35);
    mouth.rotation.y = side * 0.6;
    g.add(mouth);
  }

  /* --- כנפיים עם קצוות מעוגלים (bevel) וסחיפה של 33° --- */
  function wingMesh(mirror) {
    var s = new THREE.Shape();
    s.moveTo(0, 2.7);          // שורש, מקדימה
    s.lineTo(3.9, 0.25);       // קצה מוביל סחוף
    s.lineTo(3.9, -1.05);      // מיתר קצה
    s.lineTo(0, -2.7);         // שורש, מאחורה
    s.lineTo(0, 2.7);
    var geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.13, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.09, bevelSegments: 1
    });
    geo.rotateX(Math.PI / 2);
    var m = new THREE.Mesh(geo, body);
    if (mirror) m.scale.x = -1;
    m.position.set(mirror ? -1.5 : 1.5, 0.0, 0.55);
    return m;
  }
  g.add(wingMesh(false));
  g.add(wingMesh(true));

  // עיטורים קטנים ועדינים על הכנפיים
  var roundelTex = makeRoundelTexture();
  for (var side = -1; side <= 1; side += 2) {
    var dec = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1),
      new THREE.MeshLambertMaterial({
        map: roundelTex, transparent: true, opacity: 0.85,
        polygonOffset: true, polygonOffsetFactor: -4
      }));
    dec.rotation.x = -Math.PI / 2;
    dec.position.set(side * 3.5, 0.21, 0.75);
    g.add(dec);
  }

  /* --- מייצבים אופקיים --- */
  function stab(mirror) {
    var s = new THREE.Shape();
    s.moveTo(0, 1.25); s.lineTo(2.15, 0.05); s.lineTo(2.15, -0.75); s.lineTo(0, -1.25); s.lineTo(0, 1.25);
    var geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.09, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.06, bevelSegments: 1
    });
    geo.rotateX(Math.PI / 2);
    var m = new THREE.Mesh(geo, body);
    if (mirror) m.scale.x = -1;
    m.position.set(mirror ? -0.95 : 0.95, -0.02, 6.5);
    return m;
  }
  g.add(stab(false));
  g.add(stab(true));

  /* --- זנבות אנכיים מוטים החוצה --- */
  function tail(mirror) {
    var s = new THREE.Shape();
    s.moveTo(0, 1.55); s.lineTo(2.45, 0.15); s.lineTo(2.45, -0.85); s.lineTo(0, -1.5); s.lineTo(0, 1.55);
    var geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.05, bevelSegments: 1
    });
    geo.rotateY(Math.PI / 2);
    var m = new THREE.Mesh(geo, body);
    m.position.set(mirror ? -1.05 : 1.05, 0.5, 5.1);
    m.rotation.z = (mirror ? -1 : 1) * 0.42;   // כ-24° הטיה
    return m;
  }
  g.add(tail(false));
  g.add(tail(true));

  /* --- דלתות תא חימוש פנימי (קווים בגחון) --- */
  for (var side = -1; side <= 1; side += 2) {
    var bay = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.02, 2.9),
      new THREE.MeshPhongMaterial({ color: 0x54595f, shininess: 22 }));
    bay.position.set(side * 0.68, -0.585, 0.8);
    g.add(bay);
  }

  /* --- נחיר מנוע קצר ומעודן + זוהר --- */
  var nozzleMat = new THREE.MeshPhongMaterial({ color: 0x3b3d40, specular: 0x555555, shininess: 45 });
  var nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.7, 16), nozzleMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.02, 8.45);
  g.add(nozzle);
  var nozzleInner = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.45, 16),
    new THREE.MeshPhongMaterial({ color: 0x232022, shininess: 8 }));
  nozzleInner.rotation.x = Math.PI / 2;
  nozzleInner.position.set(0, 0.02, 8.7);
  g.add(nozzleInner);
  // דיסקת זוהר — מתחממת עם המצערת
  var glowMat = new THREE.MeshBasicMaterial({ color: 0xff5511, transparent: true, opacity: 0 });
  var nozzleGlow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), glowMat);
  nozzleGlow.position.set(0, 0.02, 8.94);
  g.add(nozzleGlow);

  /* --- להבת מבער עדינה: מעטפת שקופה + ליבה + יהלומי הלם קטנים --- */
  var flame = new THREE.Group();
  var flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.9, 12),
    new THREE.MeshBasicMaterial({ color: 0xff7a30, transparent: true, opacity: 0.38, depthWrite: false }));
  flameOuter.rotation.x = Math.PI / 2;
  flameOuter.position.z = 1.45;
  flame.add(flameOuter);
  var flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.9, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.7, depthWrite: false }));
  flameCore.rotation.x = Math.PI / 2;
  flameCore.position.z = 0.95;
  flame.add(flameCore);
  for (var di = 0; di < 3; di++) {
    var dia = new THREE.Mesh(new THREE.SphereGeometry(0.11 - di * 0.02, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.5, depthWrite: false }));
    dia.scale.set(1, 1, 1.7);
    dia.position.z = 0.7 + di * 0.7;
    flame.add(dia);
  }
  // הילת זוהר מרוככת
  var glowCv = document.createElement("canvas");
  glowCv.width = glowCv.height = 64;
  var gc = glowCv.getContext("2d");
  var grd = gc.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,180,90,0.55)");
  grd.addColorStop(0.5, "rgba(255,120,40,0.18)");
  grd.addColorStop(1, "rgba(255,90,20,0)");
  gc.fillStyle = grd; gc.fillRect(0, 0, 64, 64);
  var glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowCv), transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glowSprite.scale.set(2.0, 2.0, 1);
  glowSprite.position.z = 0.5;
  flame.add(glowSprite);
  flame.position.set(0, 0.02, 8.95);
  flame.visible = false;
  g.add(flame);

  /* --- כן נסע מפורט: בוכנה, מוט תמיכה, דלתות --- */
  var gearGroup = new THREE.Group();
  var metal = new THREE.MeshPhongMaterial({ color: 0xb8bcc2, specular: 0x888888, shininess: 60 });
  var tire = new THREE.MeshPhongMaterial({ color: 0x181a1c, shininess: 5 });
  var hub = new THREE.MeshPhongMaterial({ color: 0x8f939a, shininess: 50 });

  function leg(x, z, front) {
    var lg = new THREE.Group();
    var len = front ? 1.7 : 1.5;
    // בוכנה ראשית
    var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, len, 8), metal);
    strut.position.y = -len / 2;
    lg.add(strut);
    // מוט תמיכה אלכסוני
    var brace = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len * 0.85, 6), metal);
    brace.position.set(0, -len * 0.45, front ? 0.42 : -0.4);
    brace.rotation.x = front ? -0.5 : 0.5;
    lg.add(brace);
    // גלגל(ים) עם צלחת
    var wr = front ? 0.28 : 0.42, ww = front ? 0.18 : 0.3;
    var wheel = new THREE.Mesh(new THREE.CylinderGeometry(wr, wr, ww, 16), tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -len;
    lg.add(wheel);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.55, wr * 0.55, ww + 0.03, 12), hub);
    cap.rotation.z = Math.PI / 2;
    cap.position.y = -len;
    lg.add(cap);
    // דלת כן נסע צמודה
    var door = new THREE.Mesh(new THREE.BoxGeometry(0.05, len * 0.9, front ? 0.55 : 0.85), body);
    door.position.set(front ? 0.28 : (x > 0 ? 0.34 : -0.34), -len * 0.45, 0);
    door.rotation.y = front ? 0 : (x > 0 ? -0.15 : 0.15);
    lg.add(door);
    // פנס נחיתה על רגל האף
    if (front) {
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff8dd }));
      lamp.position.set(0, -len * 0.65, -0.12);
      lg.add(lamp);
    }
    lg.position.set(x, -0.45, z);
    return lg;
  }
  gearGroup.add(leg(0, -5.4, true));
  gearGroup.add(leg(-1.6, 1.2, false));
  gearGroup.add(leg(1.6, 1.2, false));
  g.add(gearGroup);

  /* --- אורות ניווט קטנים --- */
  var navL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3333 }));
  navL.position.set(-5.35, 0.05, 0.55); g.add(navL);
  var navR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x33ff55 }));
  navR.position.set(5.35, 0.05, 0.55); g.add(navR);
  var strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, 0.85, 3.6); g.add(strobe);

  // המטוס מטיל צל (הלהבה, הזוהר והאורות לא)
  g.traverse(function (o) {
    if (o.isMesh && o.material && !o.material.transparent &&
        o.material.type !== "MeshBasicMaterial") {
      o.castShadow = true;
    }
  });

  return { group: g, flame: flame, gearGroup: gearGroup, strobe: strobe, nozzleGlow: glowMat };
}

/* ---------- מודל טיסה ---------- */
function Aircraft() {
  var P = CFG.PLANE;
  var model = buildJet();
  this.model = model;
  this.group = model.group;

  // מצב גיאוגרפי (מדויק, מספרי double)
  this.lat = CFG.START.LAT;
  this.lon = CFG.START.LON;
  this.alt = 0;                 // גובה מעל פני הים (מ')
  this.groundElev = 0;

  // אוריינטציה ומהירות במערכת מקומית: X=מזרח, Y=מעלה, Z=דרום
  this.quat = new THREE.Quaternion();
  this.setHeading(CFG.START.HEADING);
  this.vel = new THREE.Vector3(0, 0, 0);

  this.throttle = 0;            // 0-1
  this.afterburner = false;
  this.gearDown = true;
  this.flaps = true;
  this.brakes = true;
  this.onGround = true;
  this.crashed = false;
  this.gAccum = 1;
  this.vs = 0;                  // מהירות אנכית מ/ש
  this.aoa = 0;
  this.stalled = false;
  this.distanceFlownKm = 0;

  this._fwd = new THREE.Vector3();
  this._up = new THREE.Vector3();
  this._right = new THREE.Vector3();
  this._tmp = new THREE.Vector3();
  this._prevVy = 0;
}

Aircraft.prototype.setHeading = function (deg) {
  // heading 0 = צפון (-Z), גדל עם כיוון השעון
  this.quat.setFromEuler(new THREE.Euler(0, -deg * U.DEG, 0, "YXZ"));
};

Aircraft.prototype.getHeading = function () {
  this._fwd.set(0, 0, -1).applyQuaternion(this.quat);
  var h = Math.atan2(this._fwd.x, -this._fwd.z) * U.RAD;
  return (h + 360) % 360;
};

Aircraft.prototype.getPitchDeg = function () {
  this._fwd.set(0, 0, -1).applyQuaternion(this.quat);
  return Math.asin(U.clamp(this._fwd.y, -1, 1)) * U.RAD;
};

Aircraft.prototype.getRollDeg = function () {
  this._right.set(1, 0, 0).applyQuaternion(this.quat);
  this._fwd.set(0, 0, -1).applyQuaternion(this.quat);
  var flatRight = this._tmp.set(-this._fwd.z, 0, this._fwd.x).normalize();
  var upW = new THREE.Vector3(0, 1, 0);
  var roll = Math.atan2(this._right.dot(upW), this._right.dot(flatRight));
  return -roll * U.RAD;
};

Aircraft.prototype.speed = function () { return this.vel.length(); };
Aircraft.prototype.speedKts = function () { return this.vel.length() * 1.94384; };
Aircraft.prototype.mach = function () {
  var a = 340 - 0.004 * Math.min(this.alt, 11000); // מהירות הקול יורדת עם הגובה
  return this.vel.length() / a;
};

/*
  update — צעד פיזיקה אחד.
  ctl: { pitch, roll, yaw ∈ [-1,1], throttleDelta }
  groundElev: גובה קרקע במיקום הנוכחי
  timeScale: קצב האצת הזמן הנוכחי (מ-CFG.TIME_SCALES). תנועה/מרחק מתקדמים
  לפי dt המלא (מואץ), אבל היגוי (פיץ'/רול/יאו) משתמש ב"attDt" — dt מוקטן
  בהתאם לקצב ההאצה — כדי שהמטוס יגיב לבקרה בקצב זמן-אמת קבוע ולא "יתפרע"
  כשמאיצים את הזמן (אחרת קלט הגה קצר הופך לעשרות שניות של סיבוב מצטבר).
  מחזיר אירועים: { touchdown, crash, gearWarning }
*/
Aircraft.prototype.update = function (dt, ctl, groundElev, timeScale) {
  if (this.crashed) return {};
  var P = CFG.PLANE;
  var ev = {};
  this.groundElev = groundElev;
  var attDt = (timeScale && timeScale > 1) ? dt / timeScale : dt;

  // מצערת (בקצב זמן-אמת, שלא תקפוץ בהאצת זמן)
  this.throttle = U.clamp(this.throttle + ctl.throttleDelta * attDt * 0.8, 0, 1);

  // וקטורי גוף
  var fwd = this._fwd.set(0, 0, -1).applyQuaternion(this.quat);
  var up = this._up.set(0, 1, 0).applyQuaternion(this.quat);
  var right = this._right.set(1, 0, 0).applyQuaternion(this.quat);

  var v = this.vel.length();
  var rho = 1.225 * Math.exp(-Math.max(this.alt, 0) / 8500);
  var q = 0.5 * rho * v * v;

  // זווית התקפה — הזווית בין וקטור המהירות לחרטום במישור האנכי של הגוף
  var aoa = 0;
  if (v > 5) {
    var vdir = this._tmp.copy(this.vel).normalize();
    aoa = Math.atan2(-vdir.dot(up), vdir.dot(fwd));
  }
  this.aoa = aoa * U.RAD;

  // עילוי
  var stallAoA = 0.32; // ~18°
  var cl = 0.25 + 4.2 * aoa;
  if (this.flaps) cl += 0.45;
  this.stalled = false;
  if (Math.abs(aoa) > stallAoA && !this.onGround && v > P.STALL_SPEED_FLAPS * 0.5) {
    cl *= Math.max(0.35, 1 - (Math.abs(aoa) - stallAoA) * 3);
    this.stalled = true;
  }
  cl = U.clamp(cl, -1.2, 2.2);
  var lift = q * P.WING_AREA * cl;

  // גרר
  var cd = 0.024 + 0.08 * cl * cl;
  if (this.gearDown) cd += 0.025;
  if (this.flaps) cd += 0.02;
  if (v > 300) cd += (v - 300) * 0.0004;  // גרר גלי מעל טרנסוני
  var drag = q * P.WING_AREA * cd;

  // דחף
  var maxT = this.afterburner ? P.THRUST_AB : P.THRUST_MIL;
  var thrust = this.throttle * maxT * (0.4 + 0.6 * rho / 1.225);

  // כוחות -> תאוצה
  var acc = new THREE.Vector3(0, -9.81, 0);
  acc.addScaledVector(fwd, thrust / P.MASS);
  acc.addScaledVector(up, lift / P.MASS);
  if (v > 0.1) {
    acc.addScaledVector(this._tmp.copy(this.vel).normalize(), -drag / P.MASS);
  }

  // G — רכיב העילוי ביחס למשקל
  this.gAccum = U.lerp(this.gAccum, 1 + (lift / P.MASS - 9.81 * up.y + 9.81) / 9.81 - 1, 0.1);
  var gForce = lift / (P.MASS * 9.81);

  /* --- קרקע --- */
  var agl = this.alt - groundElev;
  var gearH = this.gearDown ? 2.1 : 0.9;

  if (this.onGround) {
    // על הקרקע: חיכוך, היגוי בגלגל קדמי, בלמים
    acc.y = Math.max(acc.y, 0);
    var rollFric = this.brakes ? 2.2 : 0.12;
    if (v > 0.2) {
      acc.addScaledVector(this._tmp.copy(this.vel).normalize(), -rollFric - v * 0.002);
    } else if (this.throttle < 0.05) {
      this.vel.set(0, 0, 0);
    }
    // היגוי על הקרקע
    if (v > 0.5) {
      var steer = ctl.yaw * U.clamp(14 / (v + 4), 0.15, 1.2);
      var yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -steer * attDt);
      this.quat.premultiply(yawQ);
      // המהירות עוקבת אחרי הכיוון בגלגול על הקרקע
      var newFwd = this._tmp.set(0, 0, -1).applyQuaternion(this.quat);
      var spd = this.vel.length();
      this.vel.lerp(newFwd.multiplyScalar(spd), U.clamp(dt * 4, 0, 1));
    }
    // רוטציה — הרמת אף מעל מהירות ניתוק
    if (ctl.pitch < -0.05 && v > P.STALL_SPEED_FLAPS * 0.95) {
      var rotQ = new THREE.Quaternion().setFromAxisAngle(right, -ctl.pitch * attDt * 0.8);
      this.quat.premultiply(rotQ);
    } else {
      // הצמדת האף לקרקע
      var pitchNow = this.getPitchDeg();
      if (pitchNow > 0 && lift < P.MASS * 9.81 * 0.9) {
        var dnQ = new THREE.Quaternion().setFromAxisAngle(right, -U.clamp(pitchNow, 0, 12) * U.DEG * attDt * 2);
        this.quat.premultiply(dnQ);
      }
    }
    // המראה
    if (lift > P.MASS * 9.81 * 1.02 && this.getPitchDeg() > 1) {
      this.onGround = false;
    }
  } else {
    /* --- באוויר: הגאים --- */
    var eff = U.clamp(v / 140, 0.15, 1); // אפקטיביות הגאים תלוית מהירות
    var pitchRate = ctl.pitch * P.PITCH_RATE * eff;
    var rollRate = ctl.roll * P.ROLL_RATE * eff;
    var yawRate = ctl.yaw * P.YAW_RATE * eff;
    if (this.stalled) { pitchRate *= 0.4; rollRate *= 0.35; }
    // הגבלת G בסיסית (מערכת בקרת הטיסה מגבילה ל-9G)
    if (gForce > 8.5 && pitchRate < 0) pitchRate *= 0.15;

    var dq = new THREE.Quaternion();
    dq.setFromAxisAngle(right, -pitchRate * attDt); this.quat.premultiply(dq);
    dq.setFromAxisAngle(fwd, -rollRate * attDt); this.quat.premultiply(dq);
    dq.setFromAxisAngle(up, -yawRate * attDt); this.quat.premultiply(dq);

    // יציבות אווירודינמית — האף עוקב אחרי וקטור המהירות (פנייה מתואמת:
    // מטים כנף, העילוי מסובב את המסלול, והאף מתיישר איתו במקום "להחליק")
    if (v > 30 && !this.stalled) {
      var vdir2 = this._tmp.copy(this.vel).normalize();
      var look = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), vdir2, up);
      var target = new THREE.Quaternion().setFromRotationMatrix(look);
      this.quat.slerp(target, U.clamp(attDt * 0.6, 0, 0.15));
    }

    // טייס-אוטומטי עדין בהאצת זמן: כשמרפים מההגה, המטוס מתייצב לטיסה
    // ישרה ואופקית (רול ופיץ' חוזרים לאפס). בלי זה, בהאצה גם נטייה זעירה
    // "מתפוצצת" לאיבוד גובה כי המרחק/גובה מתקדמים מואץ — וזו הייתה סיבת
    // ההתרסקות המיידית. פעיל רק כשלא נוגעים בהגה, כך שאינו מפריע לתמרון.
    if (timeScale > 1) {
      var lvlRate = U.clamp(0.35 + (timeScale - 1) * 0.12, 0, 4); // רד/ש
      if (Math.abs(ctl.roll) < 0.05) {
        var rollErrDeg = this.getRollDeg();
        if (Math.abs(rollErrDeg) > 0.3) {
          var lvlStep = Math.min(Math.abs(rollErrDeg) * U.DEG, lvlRate * attDt);
          var lvlQ = new THREE.Quaternion().setFromAxisAngle(fwd, -Math.sign(rollErrDeg) * lvlStep);
          this.quat.premultiply(lvlQ);
        }
      }
      if (Math.abs(ctl.pitch) < 0.05) {
        var pitchErrDeg = this.getPitchDeg();
        if (Math.abs(pitchErrDeg) > 0.5) {
          var pStep = Math.min(Math.abs(pitchErrDeg) * U.DEG, lvlRate * 0.6 * attDt);
          var pQ = new THREE.Quaternion().setFromAxisAngle(right, -Math.sign(pitchErrDeg) * pStep);
          this.quat.premultiply(pQ);
        }
      }
    }
  }
  this.quat.normalize();

  // אינטגרציה
  this._prevVy = this.vel.y;
  this.vel.addScaledVector(acc, dt);
  // הגבלת מהירות מקסימלית (גרר טרנסוני כבר מטפל, זה בטיחות)
  var vmax = P.MAX_SPEED * 1.15;
  if (this.vel.length() > vmax) this.vel.setLength(vmax);

  this.vs = this.vel.y;
  this.alt += this.vel.y * dt;

  // עדכון lat/lon — כאן קורית ה"מעגליות" של הגלובוס
  var mDeg = CFG.M_PER_DEG_LAT * CFG.WORLD_SCALE;
  var vNorth = -this.vel.z, vEast = this.vel.x;
  this.lat += (vNorth * dt) / mDeg;
  this.lon = U.wrapLon(this.lon + (vEast * dt) / (U.mPerDegLon(this.lat) * CFG.WORLD_SCALE));
  // מעבר מעל הקוטב — היפוך צד
  if (this.lat > 89.5) { this.lat = 179 - this.lat; this.lon = U.wrapLon(this.lon + 180); }
  if (this.lat < -89.5) { this.lat = -179 - this.lat; this.lon = U.wrapLon(this.lon + 180); }
  this.distanceFlownKm += v * dt / 1000;

  /* --- נגיעה בקרקע --- */
  if (!this.onGround && this.alt <= groundElev + gearH) {
    var sink = -this.vel.y;
    var rollDeg = Math.abs(this.getRollDeg());
    var pitchDeg = this.getPitchDeg();
    if (!this.gearDown || sink > 8 || rollDeg > 15 || pitchDeg < -8 || v > 130) {
      this.crashed = true;
      ev.crash = true;
    } else {
      this.onGround = true;
      ev.touchdown = { sink: sink, speed: v };
      this.alt = groundElev + gearH;
      this.vel.y = 0;
    }
  }
  if (this.onGround) {
    this.alt = groundElev + gearH;
    if (this.vel.y < 0) this.vel.y = 0;
  }

  // אזהרת מהירות גלגלים
  if (this.gearDown && v > P.GEAR_MAX_SPEED && !this.onGround) ev.gearWarning = true;

  // עדכון המודל הוויזואלי
  this.model.flame.visible = this.afterburner && this.throttle > 0.4;
  if (this.model.flame.visible) {
    this.model.flame.scale.setScalar(0.85 + Math.random() * 0.3);
  }
  // זוהר הנחיר מתחמם עם המצערת — עדין
  this.model.nozzleGlow.opacity = this.throttle * 0.22 + (this.model.flame.visible ? 0.4 : 0);
  this.model.gearGroup.visible = this.gearDown;
  this.model.strobe.visible = (Date.now() % 1000) < 80;

  return ev;
};

Aircraft.prototype.reset = function () {
  this.lat = CFG.START.LAT;
  this.lon = CFG.START.LON;
  this.alt = 0;
  this.setHeading(CFG.START.HEADING);
  this.vel.set(0, 0, 0);
  this.throttle = 0;
  this.afterburner = false;
  this.gearDown = true;
  this.flaps = true;
  this.brakes = true;
  this.onGround = true;
  this.crashed = false;
  this.distanceFlownKm = 0;
};
