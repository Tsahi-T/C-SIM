/* =========================================================
   C-SIM — hud.js
   תצוגה עילית (HUD) בסגנון מטוס קרב: סרגלי מהירות וגובה,
   סרט כיוון, סולם פיץ', סמן וקטור טיסה, מחווני מערכת ואזהרות.
   ========================================================= */
"use strict";

var HUD = {
  canvas: null, ctx: null, W: 0, H: 0,
  color: "rgba(80, 255, 130, 0.9)",
  colorDim: "rgba(80, 255, 130, 0.45)",
  colorWarn: "rgba(255, 80, 60, 0.95)"
};

HUD.init = function () {
  HUD.canvas = document.getElementById("hudCanvas");
  HUD.ctx = HUD.canvas.getContext("2d");
  HUD.resize();
  window.addEventListener("resize", HUD.resize);
};

HUD.resize = function () {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  HUD.W = window.innerWidth; HUD.H = window.innerHeight;
  HUD.canvas.width = HUD.W * dpr;
  HUD.canvas.height = HUD.H * dpr;
  HUD.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

HUD.draw = function (ac, timeScale, camMode) {
  var c = HUD.ctx, W = HUD.W, H = HUD.H;
  c.clearRect(0, 0, W, H);
  if (camMode === 2) return;   // מצלמת מסלול — בלי HUD

  var cx = W / 2, cy = H / 2;
  var small = W < 760;
  var f = small ? 0.72 : 1;

  c.font = (13 * f | 0) + "px Consolas, monospace";
  c.strokeStyle = HUD.color;
  c.fillStyle = HUD.color;
  c.lineWidth = 1.5;

  var spdKts = ac.speedKts();
  var altFt = ac.alt * 3.28084;
  var hdg = ac.getHeading();
  var pitch = ac.getPitchDeg();
  var roll = ac.getRollDeg();

  /* ---- סולם פיץ' + אופק ---- */
  var pxPerDeg = H / 70;
  c.save();
  c.translate(cx, cy);
  c.rotate(roll * U.DEG);
  c.beginPath();
  c.rect(-W * 0.28, -H * 0.32, W * 0.56, H * 0.64);
  c.clip();

  for (var a = -90; a <= 90; a += 5) {
    var y = (pitch - a) * pxPerDeg;
    if (Math.abs(y) > H * 0.34) continue;
    var wLine = a === 0 ? 260 * f : (a % 10 === 0 ? 120 * f : 60 * f);
    c.globalAlpha = a === 0 ? 0.95 : 0.7;
    c.beginPath();
    if (a >= 0) {
      c.moveTo(-wLine, y); c.lineTo(-30 * f, y);
      c.moveTo(30 * f, y); c.lineTo(wLine, y);
    } else {
      // קווים מקווקווים מתחת לאופק
      c.setLineDash([12, 8]);
      c.moveTo(-wLine, y); c.lineTo(-30 * f, y);
      c.moveTo(30 * f, y); c.lineTo(wLine, y);
    }
    c.stroke();
    c.setLineDash([]);
    if (a !== 0 && a % 10 === 0) {
      c.fillText(a, -wLine - 26 * f, y + 4);
      c.fillText(a, wLine + 8 * f, y + 4);
    }
  }
  c.globalAlpha = 1;
  c.restore();

  /* ---- סמן מרכז (boresight) ---- */
  c.beginPath();
  c.moveTo(cx - 18, cy); c.lineTo(cx - 6, cy);
  c.moveTo(cx + 6, cy); c.lineTo(cx + 18, cy);
  c.moveTo(cx, cy - 5); c.lineTo(cx, cy - 1);
  c.stroke();

  /* ---- סמן וקטור טיסה (FPM) ---- */
  if (ac.speed() > 15) {
    var vdir = ac.vel.clone().normalize();
    var fpPitch = Math.asin(U.clamp(vdir.y, -1, 1)) * U.RAD;
    var fpHdg = (Math.atan2(vdir.x, -vdir.z) * U.RAD + 360) % 360;
    var dH = ((fpHdg - hdg + 540) % 360) - 180;
    var fx = cx + dH * pxPerDeg * 0.9;
    var fy = cy + (pitch - fpPitch) * pxPerDeg;
    fx = U.clamp(fx, cx - W * 0.2, cx + W * 0.2);
    fy = U.clamp(fy, cy - H * 0.26, cy + H * 0.26);
    c.beginPath();
    c.arc(fx, fy, 8, 0, Math.PI * 2);
    c.moveTo(fx - 16, fy); c.lineTo(fx - 8, fy);
    c.moveTo(fx + 8, fy); c.lineTo(fx + 16, fy);
    c.moveTo(fx, fy - 8); c.lineTo(fx, fy - 14);
    c.stroke();
  }

  /* ---- סרט כיוון (למעלה) ---- */
  var tapeY = 34;
  c.fillStyle = "rgba(0, 14, 6, 0.28)";
  c.fillRect(cx - 160 * f, 26, 320 * f, 26);
  c.fillStyle = HUD.color;
  c.save();
  c.beginPath();
  c.rect(cx - 160 * f, 8, 320 * f, 44);
  c.clip();
  for (var d = -60; d <= 60; d += 5) {
    var hh = Math.round((hdg + d) / 5) * 5;
    var hNorm = ((hh % 360) + 360) % 360;
    var x = cx + (hh - hdg) * 2.6 * f;
    var major = hNorm % 30 === 0;
    c.beginPath();
    c.moveTo(x, tapeY + 6); c.lineTo(x, tapeY + (major ? 14 : 10));
    c.stroke();
    if (major) {
      var lbl = hNorm === 0 ? "N" : hNorm === 90 ? "E" : hNorm === 180 ? "S" : hNorm === 270 ? "W" : (hNorm / 10 | 0);
      c.textAlign = "center";
      c.fillText(lbl, x, tapeY);
    }
  }
  c.restore();
  c.textAlign = "center";
  c.strokeRect(cx - 26, 46, 52, 20);
  c.fillText(("00" + Math.round(hdg) % 360).slice(-3) + "°", cx, 60);

  /* ---- סרגל מהירות (שמאל) ---- */
  var tapeX = W * (small ? 0.06 : 0.16);
  HUD.tape(c, tapeX, cy, spdKts, 10, 2.2, false, f);
  c.textAlign = "left";
  c.fillText("KTS", tapeX - 20 * f, cy - 78 * f);
  c.fillText("M " + ac.mach().toFixed(2), tapeX - 20 * f, cy + 96 * f);
  c.fillText("THR " + Math.round(ac.throttle * 100) + "%" + (ac.afterburner ? " AB" : ""), tapeX - 20 * f, cy + 114 * f);
  if (ac.afterburner) {
    c.fillStyle = "rgba(255,180,60,0.95)";
    c.fillText("◆◆", tapeX + 46 * f, cy + 114 * f);
    c.fillStyle = HUD.color;
  }

  /* ---- סרגל גובה (ימין) ---- */
  var altX = W * (small ? 0.94 : 0.84);
  HUD.tape(c, altX, cy, altFt, 500, 0.09, true, f);
  c.textAlign = "right";
  c.fillText("FT", altX + 20 * f, cy - 78 * f);
  var vsFpm = Math.round(ac.vs * 196.85 / 10) * 10;
  c.fillText("VS " + (vsFpm > 0 ? "+" : "") + vsFpm, altX + 20 * f, cy + 96 * f);
  c.fillText("AGL " + Math.max(0, Math.round((ac.alt - ac.groundElev) * 3.28084)), altX + 20 * f, cy + 114 * f);

  /* ---- שורת נתונים תחתונה ---- */
  c.textAlign = "center";
  var gTxt = "G " + ac.gAccum.toFixed(1);
  var status = [];
  status.push(gTxt);
  status.push("AOA " + ac.aoa.toFixed(0) + "°");
  if (ac.gearDown) status.push("GEAR ▼");
  if (ac.flaps) status.push("FLAPS");
  if (ac.brakes && ac.onGround) status.push("BRAKES");
  if (timeScale > 1) status.push("TIME ×" + timeScale);
  c.fillText(status.join("   "), cx, H - 26);

  // שורת מיקום — לטינית בלבד כדי למנוע היפוך RTL בקנבס
  c.fillText(U.fmtCoord(ac.lat, ac.lon) + "   DST " + Math.round(ac.distanceFlownKm) + " KM", cx, H - 8);

  /* ---- אזהרות ---- */
  c.font = "bold " + (22 * f | 0) + "px Consolas, monospace";
  c.fillStyle = HUD.colorWarn;
  var wy = cy + H * 0.18;
  var blink = (Date.now() % 600) < 350;
  if (ac.stalled && blink) { c.fillText("STALL", cx, wy); wy += 28; }
  var agl = ac.alt - ac.groundElev;
  if (!ac.onGround && agl < 150 && ac.vs < -20 && blink) { c.fillText("PULL UP", cx, wy); wy += 28; }
  if (ac.gearDown && ac.speed() > CFG.PLANE.GEAR_MAX_SPEED && !ac.onGround && blink) {
    c.fillText("GEAR OVERSPEED", cx, wy);
  }
  if (ac.crashed) {
    c.font = "bold 40px Consolas, monospace";
    c.fillText("CRASH", cx, cy - 60);
    c.font = "20px Consolas, monospace";
    c.fillStyle = HUD.color;
    c.fillText("R — אתחול בבסיס נבטים", cx, cy - 28);
  }
};

/* סרגל אנכי גולל (מהירות/גובה) */
HUD.tape = function (c, x, cy, value, step, pxPerUnit, rightSide, f) {
  var halfH = 90 * f;
  // רקע שקוף עדין לקריאות
  c.fillStyle = "rgba(0, 14, 6, 0.28)";
  c.fillRect(x - (rightSide ? 12 : 52) * f, cy - halfH, 64 * f, halfH * 2);
  c.fillStyle = HUD.color;
  c.save();
  c.beginPath();
  c.rect(x - 60 * f, cy - halfH, 120 * f, halfH * 2);
  c.clip();
  c.textAlign = rightSide ? "left" : "right";
  var start = Math.floor((value - halfH / pxPerUnit) / step) * step;
  var end = value + halfH / pxPerUnit;
  for (var v = start; v <= end; v += step) {
    if (v < 0) continue;
    var y = cy + (value - v) * pxPerUnit;
    c.globalAlpha = 0.75;
    c.beginPath();
    var tick = rightSide ? -8 : 8;
    c.moveTo(x, y); c.lineTo(x + tick, y);
    c.stroke();
    c.fillText(Math.round(v), x + (rightSide ? -12 : 12), y + 4);
    c.globalAlpha = 1;
  }
  c.restore();
  // תיבת ערך נוכחי — עם רקע אטום כדי שלא תתערבב עם הסרגל
  c.textAlign = "center";
  var bw = 62 * f;
  var prevFill = c.fillStyle;
  c.fillStyle = "rgba(0, 12, 4, 0.85)";
  c.fillRect(x - bw / 2, cy - 11, bw, 22);
  c.fillStyle = prevFill;
  c.strokeRect(x - bw / 2, cy - 11, bw, 22);
  c.fillText(Math.round(value), x, cy + 5);
};
