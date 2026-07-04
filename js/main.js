/* =========================================================
   C-SIM — main.js
   חיבור הכול: רנדרר, מצלמות, לולאת משחק, סאונד מנוע, ממשק.
   ========================================================= */
"use strict";

var APP = {
  renderer: null, scene: null, camera: null,
  aircraft: null,
  camMode: 0,               // 0 עוקבת, 1 תא טייס, 2 מגדל
  timeScaleIdx: 0,
  paused: false,
  clockMin: 10 * 60,        // שעון משחק — מתחילים ב-10:00
  audio: null,
  _camPos: new THREE.Vector3(),
  _lastLat: 0, _lastLon: 0,
  _locTimer: 0
};

/* ---------- אתחול ---------- */
APP.init = function () {
  var loadbar = document.getElementById("loadbar");
  var loadmsg = document.getElementById("loadmsg");
  function prog(p, msg) { loadbar.style.width = p + "%"; loadmsg.textContent = msg; }

  prog(10, "מכין מנוע גרפי...");
  APP.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("scene"), antialias: true });
  APP.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  APP.renderer.setSize(window.innerWidth, window.innerHeight);

  APP.scene = new THREE.Scene();
  APP.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 2500000);

  prog(30, "בונה את העולם...");
  WORLD.init(APP.scene);

  prog(55, "מרכיב את המטוס...");
  APP.aircraft = new Aircraft();
  APP.scene.add(APP.aircraft.group);

  prog(70, "מכייל מערכות...");
  HUD.init();
  MAP.init();
  CTL.init(APP.onToggle);

  window.addEventListener("resize", function () {
    APP.camera.aspect = window.innerWidth / window.innerHeight;
    APP.camera.updateProjectionMatrix();
    APP.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // הפעלת סאונד בלחיצה ראשונה (מדיניות דפדפן)
  var startAudio = function () {
    APP.initAudio();
    window.removeEventListener("pointerdown", startAudio);
    window.removeEventListener("keydown", startAudio);
  };
  window.addEventListener("pointerdown", startAudio);
  window.addEventListener("keydown", startAudio);

  // המטוס מתחיל על הקרקע בגובה הבסיס
  var ge = WORLD.groundElevAt(APP.aircraft.lat, APP.aircraft.lon);
  APP.aircraft.alt = ge + 2.1;
  APP.aircraft.groundElev = ge;
  APP._lastLat = APP.aircraft.lat;
  APP._lastLon = APP.aircraft.lon;

  prog(90, "ממריאים בקרוב מנבטים...");
  setTimeout(function () {
    prog(100, "מוכן!");
    document.getElementById("loading").classList.add("fade");
    if (!CTL.isMobile) {
      APP.alertInfo("ברוך הבא לבסיס נבטים! לחץ H להוראות טיסה", 6000);
    } else {
      APP.alertInfo("סטיק מימין, מצערת משמאל. טיסה נעימה!", 6000);
    }
  }, 600);

  APP.lastT = performance.now();
  requestAnimationFrame(APP.loop);
};

/* ---------- סאונד מנוע ---------- */
APP.initAudio = function () {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    // רעש "חום" למנוע סילון
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;

    var band = ctx.createBiquadFilter();
    band.type = "bandpass"; band.frequency.value = 300; band.Q.value = 0.6;
    var gain = ctx.createGain();
    gain.gain.value = 0;

    src.connect(band); band.connect(gain); gain.connect(ctx.destination);
    src.start();
    APP.audio = { ctx: ctx, gain: gain, band: band };
  } catch (e) { /* אין סאונד — לא קריטי */ }
};

APP.updateAudio = function (ac) {
  if (!APP.audio) return;
  var t = ac.throttle;
  var target = APP.paused ? 0 : (0.03 + t * 0.16 + (ac.afterburner ? 0.10 : 0));
  APP.audio.gain.gain.linearRampToValueAtTime(target, APP.audio.ctx.currentTime + 0.15);
  APP.audio.band.frequency.linearRampToValueAtTime(
    180 + t * 700 + ac.speed() * 0.8, APP.audio.ctx.currentTime + 0.15);
};

/* ---------- אירועי מקשים/כפתורים ---------- */
APP.onToggle = function (name) {
  var ac = APP.aircraft;
  switch (name) {
    case "gear":
      ac.gearDown = !ac.gearDown;
      APP.alertInfo(ac.gearDown ? "גלגלים יוצאים" : "גלגלים נאספים", 1500);
      break;
    case "flaps":
      ac.flaps = !ac.flaps;
      APP.alertInfo(ac.flaps ? "מדפים בחוץ" : "מדפים בפנים", 1500);
      break;
    case "brakes":
      ac.brakes = !ac.brakes;
      if (ac.onGround) APP.alertInfo(ac.brakes ? "בלמים נעולים" : "בלמים משוחררים", 1500);
      break;
    case "afterburner":
      ac.afterburner = !ac.afterburner;
      break;
    case "camera":
      APP.camMode = (APP.camMode + 1) % 3;
      APP.alertInfo(["מצלמה עוקבת", "תא הטייס", "מבט מסלול"][APP.camMode], 1200);
      break;
    case "map":
      document.getElementById("worldMapBox").classList.toggle("hidden");
      break;
    case "help":
      document.getElementById("helpBox").classList.toggle("hidden");
      break;
    case "pause":
      APP.paused = !APP.paused;
      document.getElementById("pausedBox").classList.toggle("hidden", !APP.paused);
      break;
    case "timescale":
      APP.timeScaleIdx = (APP.timeScaleIdx + 1) % CFG.TIME_SCALES.length;
      APP.alertInfo("מהירות זמן ×" + CFG.TIME_SCALES[APP.timeScaleIdx], 1500);
      break;
    case "reset":
      if (APP.aircraft.crashed || APP.aircraft.onGround) {
        APP.aircraft.reset();
        var ge = WORLD.groundElevAt(APP.aircraft.lat, APP.aircraft.lon);
        APP.aircraft.alt = ge + 2.1;
        APP.alertInfo("אתחול בבסיס נבטים", 2000);
      }
      break;
  }
  CTL.reflectState(ac);
};

/* ---------- התראות ---------- */
APP.alertInfo = function (text, ms) {
  var box = document.getElementById("alerts");
  var el = document.createElement("div");
  el.className = "alert info";
  el.textContent = text;
  box.appendChild(el);
  setTimeout(function () { box.removeChild(el); }, ms || 2000);
};

/* ---------- מצלמות ---------- */
APP.updateCamera = function (ac, dt) {
  var cam = APP.camera;
  var planeY = ac.alt;

  if (APP.camMode === 1) {
    // תא הטייס
    var off = new THREE.Vector3(0, 1.05, -4.4).applyQuaternion(ac.quat);
    cam.position.set(off.x, planeY + off.y, off.z);
    cam.quaternion.copy(ac.quat);
    ac.group.visible = false;
  } else if (APP.camMode === 2) {
    // מבט ממגדל שדה התעופה הקרוב
    ac.group.visible = true;
    var best = null, bestD = 1e18;
    for (var i = 0; i < WORLD.airports.length; i++) {
      var a = WORLD.airports[i].group.position;
      var d = a.x * a.x + a.z * a.z;
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best && bestD < 40000 * 40000) {
      cam.position.set(best.x, best.y + 35, best.z);
    } else {
      cam.position.set(200, planeY + 100, 200);
    }
    cam.lookAt(0, planeY, 0);
  } else {
    // עוקבת — מאחורי המטוס עם החלקה
    ac.group.visible = true;
    var back = new THREE.Vector3(0, 5, 26).applyQuaternion(ac.quat);
    var target = new THREE.Vector3(back.x, planeY + back.y, back.z);
    var k = 1 - Math.pow(0.001, dt);
    APP._camPos.lerp(target, k);
    // לא לרדת מתחת לקרקע
    var camGround = ac.groundElev + 2.5;
    if (APP._camPos.y < camGround) APP._camPos.y = camGround;
    cam.position.copy(APP._camPos);
    var lookAhead = new THREE.Vector3(0, 0, -20).applyQuaternion(ac.quat);
    cam.lookAt(lookAhead.x, planeY + lookAhead.y, lookAhead.z);
  }
};

/* ---------- לולאת המשחק ---------- */
APP.loop = function (now) {
  requestAnimationFrame(APP.loop);
  var dtReal = Math.min((now - APP.lastT) / 1000, 0.1);
  APP.lastT = now;

  var ac = APP.aircraft;
  var timeScale = CFG.TIME_SCALES[APP.timeScaleIdx];

  if (!APP.paused && !ac.crashed) {
    var ctl = CTL.poll();

    // מצערת במובייל — יעד ישיר מהמחוון
    if (CTL.isMobile && CTL.touch.throttle >= 0) {
      ac.throttle = U.lerp(ac.throttle, CTL.touch.throttle, 0.15);
    }

    // פיזיקה בתתי-צעדים (יציבות בהאצת זמן)
    var dt = dtReal * timeScale;
    var ge = WORLD.groundElevAt(ac.lat, ac.lon);
    var steps = Math.ceil(dt / 0.033);
    var sub = dt / steps;
    var ev = {};
    for (var s = 0; s < steps; s++) {
      var e = ac.update(sub, ctl, ge);
      if (e.crash) ev.crash = true;
      if (e.touchdown) ev.touchdown = e.touchdown;
    }

    if (ev.crash) {
      APP.alertInfo("התרסקות! לחץ R לאתחול", 5000);
    }
    if (ev.touchdown) {
      var q = ev.touchdown.sink < 2 ? "נחיתה חלקה מאוד!" :
              ev.touchdown.sink < 4 ? "נחיתה טובה" : "נחיתה קשה";
      APP.alertInfo(q + " (" + ev.touchdown.sink.toFixed(1) + ' מ/ש)', 3500);
    }

    // עדכון אוריינטציה ויזואלית
    ac.group.quaternion.copy(ac.quat);
    ac.group.position.set(0, ac.alt, 0);

    // תנועת העולם (לעננים)
    var mLon = U.mPerDegLon(ac.lat) * CFG.WORLD_SCALE;
    var moveX = U.dLon(APP._lastLon, ac.lon) * mLon;
    var moveZ = -(ac.lat - APP._lastLat) * CFG.M_PER_DEG_LAT * CFG.WORLD_SCALE;
    APP._lastLat = ac.lat; APP._lastLon = ac.lon;

    WORLD.update(ac.lat, ac.lon, ac.alt, dt, moveX, moveZ);
    MAP.markExplored(ac.lat, ac.lon, dtReal);

    // שעון משחק
    APP.clockMin += dt / 60;
    if (APP.clockMin >= 24 * 60) APP.clockMin -= 24 * 60;
  }

  APP.updateCamera(ac, dtReal);
  APP.updateAudio(ac);

  // ממשק — לא כל פריים לחלקים כבדים
  APP._locTimer -= dtReal;
  if (APP._locTimer <= 0) {
    APP._locTimer = 1.0;
    document.getElementById("locName").textContent = WORLD.locationName(ac.lat, ac.lon);
    var hh = Math.floor(APP.clockMin / 60), mm = Math.floor(APP.clockMin % 60);
    document.getElementById("clock").textContent =
      (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
    if (!document.getElementById("worldMapBox").classList.contains("hidden")) {
      MAP.drawWorld(ac);
    }
  }

  HUD.draw(ac, timeScale, APP.camMode);
  MAP.drawMini(ac);
  CTL.reflectState(ac);

  APP.renderer.render(APP.scene, APP.camera);
};

/* ---------- הפעלה ---------- */
window.addEventListener("load", APP.init);
