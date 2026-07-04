/* =========================================================
   C-SIM — aircraft.js
   מודל תלת-ממד של F-35I ("אדיר") מפרימיטיבים + מודל טיסה.
   מערכת צירים: קדימה = ‎-Z, למעלה = +Y, ימין = +X.
   ========================================================= */
"use strict";

/* ---------- בניית המודל התלת-ממדי ---------- */
function buildF35() {
  var g = new THREE.Group();
  var gray = new THREE.MeshLambertMaterial({ color: 0x5a616b });
  var dark = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  var glass = new THREE.MeshLambertMaterial({ color: 0x6a5a1e, transparent: true, opacity: 0.85 });
  var black = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });

  // גוף מרכזי — קופסה מחודדת בעזרת סקייל של ורטקסים
  var fusGeo = new THREE.BoxGeometry(2.2, 1.35, 15.7, 1, 1, 6);
  var pos = fusGeo.attributes.position;
  for (var i = 0; i < pos.count; i++) {
    var z = pos.getZ(i), x = pos.getX(i), y = pos.getY(i);
    var t = (z + 7.85) / 15.7;             // 0 באף, 1 בזנב
    var w = 1.0;
    if (t < 0.25) w = 0.25 + 3.0 * t;      // חידוד האף
    else if (t > 0.8) w = 1.0 - (t - 0.8) * 1.2;
    pos.setX(i, x * w);
    pos.setY(i, y * (t < 0.2 ? 0.45 + 2.7 * t : 1.0));
  }
  fusGeo.computeVertexNormals();
  var fus = new THREE.Mesh(fusGeo, gray);
  g.add(fus);

  // חרטום מחודד
  var nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 10), gray);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.05, -9.0);
  g.add(nose);

  // חופה
  var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8), glass);
  canopy.scale.set(0.8, 0.75, 2.2);
  canopy.position.set(0, 0.75, -4.6);
  g.add(canopy);

  // כניסות אוויר משני הצדדים
  var intakeGeo = new THREE.BoxGeometry(0.75, 0.9, 3.2);
  var inL = new THREE.Mesh(intakeGeo, dark); inL.position.set(-1.35, -0.15, -2.2); g.add(inL);
  var inR = new THREE.Mesh(intakeGeo, dark); inR.position.set(1.35, -0.15, -2.2); g.add(inR);

  // כנפיים — צורת טרפז
  function wingMesh(mirror) {
    var s = new THREE.Shape();
    s.moveTo(0, 2.6);         // שורש קדמי (x=span, y=חיובי קדימה)
    s.lineTo(5.2, -0.4);      // קצה קדמי
    s.lineTo(5.2, -1.5);      // קצה אחורי
    s.lineTo(0, -2.6);        // שורש אחורי
    s.lineTo(0, 2.6);
    var geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false });
    geo.rotateX(Math.PI / 2); // מישור אופקי, y-shape -> -z
    var m = new THREE.Mesh(geo, gray);
    if (mirror) m.scale.x = -1;
    m.position.set(mirror ? -1.0 : 1.0, -0.1, 0.6);
    return m;
  }
  g.add(wingMesh(false));
  g.add(wingMesh(true));

  // מייצבים אופקיים אחוריים
  function stab(mirror) {
    var s = new THREE.Shape();
    s.moveTo(0, 1.2); s.lineTo(2.6, -0.3); s.lineTo(2.6, -0.9); s.lineTo(0, -1.2); s.lineTo(0, 1.2);
    var geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    var m = new THREE.Mesh(geo, gray);
    if (mirror) m.scale.x = -1;
    m.position.set(mirror ? -0.9 : 0.9, -0.05, 6.6);
    return m;
  }
  g.add(stab(false));
  g.add(stab(true));

  // זנבות אנכיים מוטים (מאפיין בולט של F-35)
  function tail(mirror) {
    var s = new THREE.Shape();
    s.moveTo(0, 1.6); s.lineTo(2.6, 0.2); s.lineTo(2.6, -0.8); s.lineTo(0, -1.4); s.lineTo(0, 1.6);
    var geo = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);   // מישור אנכי לאורך הגוף
    var m = new THREE.Mesh(geo, gray);
    m.position.set(mirror ? -0.95 : 0.95, 0.5, 5.2);
    m.rotation.z = (mirror ? -1 : 1) * 0.35;  // הטיה החוצה
    return m;
  }
  g.add(tail(false));
  g.add(tail(true));

  // נחיר מנוע
  var nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 1.4, 12), black);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0, 8.1);
  g.add(nozzle);

  // להבת מבער אחורי
  var flameMat = new THREE.MeshBasicMaterial({ color: 0xff7722, transparent: true, opacity: 0.85 });
  var flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 10), flameMat);
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0, 10.4);
  flame.visible = false;
  g.add(flame);

  // כן נסע — שלוש רגליים
  var gearGroup = new THREE.Group();
  function leg(x, z, front) {
    var lg = new THREE.Group();
    var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, front ? 1.7 : 1.5, 6), dark);
    strut.position.y = -(front ? 0.85 : 0.75);
    lg.add(strut);
    var wheel = new THREE.Mesh(new THREE.CylinderGeometry(front ? 0.3 : 0.42, front ? 0.3 : 0.42, 0.25, 12), black);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -(front ? 1.7 : 1.5);
    lg.add(wheel);
    lg.position.set(x, -0.6, z);
    return lg;
  }
  gearGroup.add(leg(0, -5.6, true));
  gearGroup.add(leg(-1.5, 1.2, false));
  gearGroup.add(leg(1.5, 1.2, false));
  g.add(gearGroup);

  // אורות ניווט
  var navL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navL.position.set(-6.0, -0.05, 0.3); g.add(navL);
  var navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x22ff44 }));
  navR.position.set(6.0, -0.05, 0.3); g.add(navR);
  var strobe = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, 1.05, 5.0); g.add(strobe);

  return { group: g, flame: flame, gearGroup: gearGroup, strobe: strobe };
}

/* ---------- מודל טיסה ---------- */
function Aircraft() {
  var P = CFG.PLANE;
  var model = buildF35();
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
  מחזיר אירועים: { touchdown, crash, gearWarning }
*/
Aircraft.prototype.update = function (dt, ctl, groundElev) {
  if (this.crashed) return {};
  var P = CFG.PLANE;
  var ev = {};
  this.groundElev = groundElev;

  // מצערת
  this.throttle = U.clamp(this.throttle + ctl.throttleDelta * dt * 0.5, 0, 1);

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
      var yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -steer * dt);
      this.quat.premultiply(yawQ);
      // המהירות עוקבת אחרי הכיוון בגלגול על הקרקע
      var newFwd = this._tmp.set(0, 0, -1).applyQuaternion(this.quat);
      var spd = this.vel.length();
      this.vel.lerp(newFwd.multiplyScalar(spd), U.clamp(dt * 4, 0, 1));
    }
    // רוטציה — הרמת אף מעל מהירות ניתוק
    if (ctl.pitch < -0.05 && v > P.STALL_SPEED_FLAPS * 0.95) {
      var rotQ = new THREE.Quaternion().setFromAxisAngle(right, -ctl.pitch * dt * 0.8);
      this.quat.premultiply(rotQ);
    } else {
      // הצמדת האף לקרקע
      var pitchNow = this.getPitchDeg();
      if (pitchNow > 0 && lift < P.MASS * 9.81 * 0.9) {
        var dnQ = new THREE.Quaternion().setFromAxisAngle(right, -U.clamp(pitchNow, 0, 12) * U.DEG * dt * 2);
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
    // הגבלת G בסיסית (FCS של F-35 מגביל ל-9G)
    if (gForce > 8.5 && pitchRate < 0) pitchRate *= 0.15;

    var dq = new THREE.Quaternion();
    dq.setFromAxisAngle(right, -pitchRate * dt); this.quat.premultiply(dq);
    dq.setFromAxisAngle(fwd, -rollRate * dt); this.quat.premultiply(dq);
    dq.setFromAxisAngle(up, -yawRate * dt); this.quat.premultiply(dq);

    // יציבות טבעית קלה — האף נוטה לכיוון וקטור המהירות
    if (v > 30 && !this.stalled) {
      var vdir2 = this._tmp.copy(this.vel).normalize();
      var cur = new THREE.Quaternion().copy(this.quat);
      var look = new THREE.Matrix4().lookAt(new THREE.Vector3(0,0,0), vdir2, up);
      var target = new THREE.Quaternion().setFromRotationMatrix(look);
      this.quat.slerp(target, U.clamp(dt * 0.15, 0, 0.05));
      // שמירת הרול המקורי - slerp קטן, השפעה מזערית
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
