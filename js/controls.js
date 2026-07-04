/* =========================================================
   C-SIM — controls.js
   קלט: מקלדת במחשב, ג'ויסטיק וירטואלי + מחוון מצערת במובייל.
   ========================================================= */
"use strict";

var CTL = {
  keys: {},
  // מצב רציף שנקרא ע"י לולאת הפיזיקה
  pitch: 0, roll: 0, yaw: 0, throttleDelta: 0,
  // קלט מגע
  touch: { stickX: 0, stickY: 0, throttle: -1, yaw: 0 },
  isMobile: false,
  onToggle: null            // callback(name) לאירועי מקש בודד
};

CTL.init = function (onToggle) {
  CTL.onToggle = onToggle;
  CTL.isMobile = U.isMobile();

  window.addEventListener("keydown", function (e) {
    if (e.repeat) { e.preventDefault(); return; }
    CTL.keys[e.code] = true;
    var map = {
      "KeyG": "gear", "KeyF": "flaps", "KeyB": "brakes", "Tab": "afterburner",
      "KeyC": "camera", "KeyM": "map", "KeyH": "help", "KeyP": "pause",
      "KeyT": "timescale", "KeyR": "reset"
    };
    if (map[e.code]) { CTL.onToggle(map[e.code]); e.preventDefault(); }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { CTL.keys[e.code] = false; });
  window.addEventListener("blur", function () { CTL.keys = {}; });

  if (CTL.isMobile) {
    document.body.classList.add("mobile");
    document.getElementById("mobileUI").classList.remove("hidden");
    CTL.initTouch();
  }
};

/* קריאת מצב רציף — נקרא כל פריים */
CTL.poll = function () {
  var k = CTL.keys;
  var pitch = 0, roll = 0, yaw = 0, thr = 0;

  if (k["ArrowUp"] || k["KeyW"]) pitch += 1;      // אף למטה (דחיפת סטיק)
  if (k["ArrowDown"] || k["KeyS"]) pitch -= 1;    // אף למעלה (משיכה)
  if (k["ArrowLeft"] || k["KeyA"]) roll -= 1;
  if (k["ArrowRight"] || k["KeyD"]) roll += 1;
  if (k["KeyQ"]) yaw -= 1;
  if (k["KeyE"]) yaw += 1;
  if (k["ShiftLeft"] || k["ShiftRight"]) thr += 1;
  if (k["ControlLeft"] || k["ControlRight"]) thr -= 1;

  // מגע גובר על מקלדת כשפעיל
  if (CTL.isMobile) {
    if (Math.abs(CTL.touch.stickX) > 0.02 || Math.abs(CTL.touch.stickY) > 0.02) {
      roll = CTL.touch.stickX;
      pitch = -CTL.touch.stickY;   // דחיפה למעלה בסטיק = אף למטה
    }
    yaw += CTL.touch.yaw;
  }

  // החלקה
  CTL.pitch = U.lerp(CTL.pitch, U.clamp(pitch, -1, 1), 0.25);
  CTL.roll = U.lerp(CTL.roll, U.clamp(roll, -1, 1), 0.3);
  CTL.yaw = U.lerp(CTL.yaw, U.clamp(yaw, -1, 1), 0.25);
  CTL.throttleDelta = thr;
  return CTL;
};

/* ---------- מגע ---------- */
CTL.initTouch = function () {
  var zone = document.getElementById("stickZone");
  var knob = document.getElementById("stickKnob");
  var stickId = null;

  function setKnob(nx, ny) {
    knob.style.left = (50 + nx * 34) + "%";
    knob.style.top = (50 + ny * 34) + "%";
  }

  zone.addEventListener("touchstart", function (e) {
    stickId = e.changedTouches[0].identifier;
    e.preventDefault();
  }, { passive: false });

  zone.addEventListener("touchmove", function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier !== stickId) continue;
      var r = zone.getBoundingClientRect();
      var nx = U.clamp((t.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      var ny = U.clamp((t.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
      CTL.touch.stickX = nx;
      CTL.touch.stickY = -ny;
      setKnob(nx, ny);
    }
    e.preventDefault();
  }, { passive: false });

  function stickEnd(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === stickId) {
        stickId = null;
        CTL.touch.stickX = CTL.touch.stickY = 0;
        setKnob(0, 0);
      }
    }
  }
  zone.addEventListener("touchend", stickEnd);
  zone.addEventListener("touchcancel", stickEnd);

  /* מצערת */
  var tz = document.getElementById("throttleZone");
  var track = document.getElementById("throttleTrack");
  var fill = document.getElementById("throttleFill");
  var tknob = document.getElementById("throttleKnob");

  function setThrottleFromTouch(clientY) {
    var r = track.getBoundingClientRect();
    var v = U.clamp(1 - (clientY - r.top) / r.height, 0, 1);
    CTL.touch.throttle = v;
  }
  tz.addEventListener("touchstart", function (e) {
    setThrottleFromTouch(e.changedTouches[0].clientY); e.preventDefault();
  }, { passive: false });
  tz.addEventListener("touchmove", function (e) {
    setThrottleFromTouch(e.changedTouches[0].clientY); e.preventDefault();
  }, { passive: false });

  CTL.updateThrottleUI = function (v) {
    fill.style.height = (v * 100) + "%";
    tknob.style.bottom = "calc(" + (v * 100) + "% - 7px)";
  };

  /* כפתורים */
  function btn(id, name, hold) {
    var el = document.getElementById(id);
    if (hold) {
      el.addEventListener("touchstart", function (e) { CTL.touch.yaw = hold; e.preventDefault(); }, { passive: false });
      el.addEventListener("touchend", function () { CTL.touch.yaw = 0; });
    } else {
      el.addEventListener("touchstart", function (e) { CTL.onToggle(name); e.preventDefault(); }, { passive: false });
    }
  }
  btn("mbGear", "gear");
  btn("mbBrake", "brakes");
  btn("mbAB", "afterburner");
  btn("mbCam", "camera");
  btn("mbMap", "map");
  btn("mbRudL", null, -1);
  btn("mbRudR", null, 1);
};

/* עדכון חיווי כפתורים במובייל */
CTL.reflectState = function (ac) {
  if (!CTL.isMobile) return;
  document.getElementById("mbGear").classList.toggle("on", ac.gearDown);
  document.getElementById("mbBrake").classList.toggle("on", ac.brakes);
  document.getElementById("mbAB").classList.toggle("on", ac.afterburner);
  if (CTL.updateThrottleUI) CTL.updateThrottleUI(ac.throttle);
};
