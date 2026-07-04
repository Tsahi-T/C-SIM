/* =========================================================
   C-SIM — minimap.js
   מיני-מפה + מפת עולם מלאה עם "ערפל גילוי": המפה נבנית
   ומתגלה ככל שטסים. נתיב הטיסה נשמר ומצויר.
   ========================================================= */
"use strict";

var MAP = {
  mini: null, miniCtx: null,
  world: null, worldCtx: null,
  explored: null,             // Uint8Array של תאי 1°x1°
  trail: [],                  // נקודות נתיב [lat, lon]
  _trailT: 0,
  zoomKm: 120                 // רוחב המיני-מפה בק"מ
};

MAP.init = function () {
  MAP.mini = document.getElementById("minimap");
  MAP.miniCtx = MAP.mini.getContext("2d");
  MAP.world = document.getElementById("worldMap");
  MAP.worldCtx = MAP.world.getContext("2d");

  MAP.explored = new Uint8Array(360 * 180);
  try {
    var saved = localStorage.getItem("csim_explored");
    if (saved) {
      var arr = JSON.parse(saved);
      for (var i = 0; i < arr.length; i++) MAP.explored[arr[i]] = 1;
    }
    var tr = localStorage.getItem("csim_trail");
    if (tr) MAP.trail = JSON.parse(tr);
  } catch (e) {}

  // לחיצה על מפת העולם — קביעת/הסרת נקודת ניווט
  MAP.world.addEventListener("click", function (e) {
    var r = MAP.world.getBoundingClientRect();
    var lon = (e.clientX - r.left) / r.width * 360 - 180;
    var lat = 90 - (e.clientY - r.top) / r.height * 180;
    if (APP.waypoint && U.distKm(lat, lon, APP.waypoint.lat, APP.waypoint.lon) < 300) {
      APP.waypoint = null;           // לחיצה על נקודה קיימת מבטלת אותה
      APP.alertInfo("נקודת ניווט בוטלה", 1500);
    } else {
      APP.waypoint = { lat: lat, lon: lon };
      var nc = GEO.nearestCountry(lat, lon);
      APP.alertInfo("נקודת ניווט: " + (nc.country ? nc.country.name : U.fmtCoord(lat, lon)), 2000);
    }
    MAP.drawWorld(APP.aircraft);
  });
};

/* סימון תא כנחקר + שמירה תקופתית. רדיוס הגילוי גדל עם הגובה */
MAP.markExplored = function (lat, lon, dt, alt) {
  var xi = U.clamp(Math.floor(lon + 180), 0, 359);
  var yi = U.clamp(Math.floor(lat + 90), 0, 179);
  var R = U.clamp(1 + Math.floor((alt || 0) / 3000), 1, 4);
  for (var dy = -R; dy <= R; dy++) {
    for (var dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + 1) continue;
      var x = (xi + dx + 360) % 360, y = U.clamp(yi + dy, 0, 179);
      MAP.explored[y * 360 + x] = 1;
    }
  }
  // נתיב
  MAP._trailT += dt;
  if (MAP._trailT > 2) {
    MAP._trailT = 0;
    MAP.trail.push([Math.round(lat * 100) / 100, Math.round(lon * 100) / 100]);
    if (MAP.trail.length > 3000) MAP.trail.splice(0, 500);
    // שמירה
    try {
      var idx = [];
      for (var i = 0; i < MAP.explored.length; i++) if (MAP.explored[i]) idx.push(i);
      localStorage.setItem("csim_explored", JSON.stringify(idx));
      localStorage.setItem("csim_trail", JSON.stringify(MAP.trail));
    } catch (e) {}
  }
};

MAP.exploredPct = function () {
  var n = 0;
  for (var i = 0; i < MAP.explored.length; i++) n += MAP.explored[i];
  return (n / MAP.explored.length * 100);
};

/* ---------- מיני-מפה עגולה, מסתובבת עם כיוון הטיסה (heading-up) ---------- */
MAP.drawMini = function (ac) {
  var c = MAP.miniCtx, S = MAP.mini.width;
  var src = WORLD.mapCanvas;
  var hdg = ac.getHeading();
  c.clearRect(0, 0, S, S);

  // גזירת אזור מהמפה העולמית
  var kmW = MAP.zoomKm * (1 + ac.alt / 4000);        // זום אאוט עם הגובה
  var degH = kmW / 111.32;
  var degW = degH / Math.max(Math.cos(ac.lat * U.DEG), 0.2);
  var sx = (ac.lon + 180) / 360 * src.width - (degW / 360 * src.width) / 2;
  var sy = (90 - ac.lat) / 180 * src.height - (degH / 180 * src.height) / 2;
  var sw = degW / 360 * src.width, sh = degH / 180 * src.height;

  c.save();
  // מסכה עגולה + סיבוב כך שכיוון הטיסה תמיד למעלה
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  c.clip();
  c.translate(S / 2, S / 2);
  c.rotate(-hdg * U.DEG);
  c.translate(-S / 2, -S / 2);
  c.imageSmoothingEnabled = true;
  // ציור מוגדל מעט כדי שהפינות לא ייחשפו בסיבוב
  var pad = S * 0.21;
  c.drawImage(src, sx - sw * 0.21, sy - sh * 0.21, sw * 1.42, sh * 1.42,
              -pad, -pad, S + pad * 2, S + pad * 2);

  function toXY(lat, lon) {
    return [
      S / 2 + U.dLon(ac.lon, lon) / degW * S,
      S / 2 - (lat - ac.lat) / degH * S
    ];
  }

  // נתיב אחרון
  c.strokeStyle = "rgba(120,220,255,0.7)";
  c.lineWidth = 1.5;
  c.beginPath();
  var started = false;
  for (var i = Math.max(0, MAP.trail.length - 300); i < MAP.trail.length; i++) {
    var p = toXY(MAP.trail[i][0], MAP.trail[i][1]);
    if (p[0] < -50 || p[0] > S + 50 || p[1] < -50 || p[1] > S + 50) { started = false; continue; }
    if (!started) { c.moveTo(p[0], p[1]); started = true; }
    else c.lineTo(p[0], p[1]);
  }
  c.stroke();

  // ערים
  c.font = "10px 'Segoe UI'";
  c.textAlign = "center";
  var lists = [GEO.ISRAEL_CITIES, GEO.WORLD_CITIES];
  for (var L = 0; L < lists.length; L++) {
    for (var i = 0; i < lists[L].length; i++) {
      var ct = lists[L][i];
      if (Math.abs(ct.lat - ac.lat) > degH || Math.abs(U.dLon(ac.lon, ct.lon)) > degW) continue;
      var p = toXY(ct.lat, ct.lon);
      c.fillStyle = "#ffd97a";
      c.beginPath(); c.arc(p[0], p[1], 2.2, 0, Math.PI * 2); c.fill();
      if (kmW < 400 || ct.size >= 4) {
        c.fillStyle = "#fff";
        c.fillText(ct.name, p[0], p[1] - 4);
      }
    }
  }

  // שדות תעופה
  c.fillStyle = "#7ce0ff";
  for (var i = 0; i < GEO.AIRPORTS.length; i++) {
    var apt = GEO.AIRPORTS[i];
    if (Math.abs(apt.lat - ac.lat) > degH || Math.abs(U.dLon(ac.lon, apt.lon)) > degW) continue;
    var p = toXY(apt.lat, apt.lon);
    c.fillRect(p[0] - 2.5, p[1] - 2.5, 5, 5);
  }

  // נקודת ניווט
  if (window.APP && APP.waypoint) {
    var wp = toXY(APP.waypoint.lat, APP.waypoint.lon);
    c.fillStyle = "#ffd34d";
    c.strokeStyle = "#5c4400";
    c.beginPath();
    c.moveTo(wp[0], wp[1] - 6); c.lineTo(wp[0] + 5, wp[1]);
    c.lineTo(wp[0], wp[1] + 6); c.lineTo(wp[0] - 5, wp[1]);
    c.closePath(); c.fill(); c.stroke();
  }
  c.restore();   // סוף הסיבוב — מכאן והלאה מסך קבוע

  // המטוס — תמיד במרכז, מצביע למעלה
  c.save();
  c.translate(S / 2, S / 2);
  c.fillStyle = "#40ff80";
  c.strokeStyle = "#0a3018";
  c.beginPath();
  c.moveTo(0, -8); c.lineTo(5.5, 7); c.lineTo(0, 3.5); c.lineTo(-5.5, 7);
  c.closePath();
  c.fill(); c.stroke();
  c.restore();

  // סמן צפון על השפה
  var na = (-90 - hdg) * U.DEG;
  var nx = S / 2 + Math.cos(na) * (S / 2 - 11);
  var ny = S / 2 + Math.sin(na) * (S / 2 - 11);
  c.fillStyle = "#ff8855";
  c.font = "bold 12px 'Segoe UI'";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("N", nx, ny);
  c.textBaseline = "alphabetic";

  // טבעת מסגרת + טווח
  c.strokeStyle = "rgba(120,200,255,0.45)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "rgba(180,220,255,0.8)";
  c.font = "10px 'Segoe UI'";
  c.fillText(Math.round(kmW) + " KM", S / 2, S - 6);
};

/* ---------- מפת עולם מלאה + ערפל גילוי ---------- */
MAP.drawWorld = function (ac) {
  var cv = MAP.world;
  var box = cv.parentElement;
  var w = box.clientWidth - 24, h = box.clientHeight - 50;
  // יחס 2:1 של מפה אקווירקטנגולרית
  if (w / h > 2) w = h * 2; else h = w / 2;
  if (cv.width !== Math.floor(w) || cv.height !== Math.floor(h)) {
    cv.width = Math.floor(w); cv.height = Math.floor(h);
  }
  var c = MAP.worldCtx;
  var W = cv.width, H = cv.height;

  c.drawImage(WORLD.mapCanvas, 0, 0, W, H);

  function toXY(lat, lon) {
    return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
  }

  // ערפל גילוי — מסכה במשבצות 1°x1°, מצוירת חלק בהגדלה
  if (!MAP._fogCv) {
    MAP._fogCv = document.createElement("canvas");
    MAP._fogCv.width = 360; MAP._fogCv.height = 180;
  }
  var fc = MAP._fogCv.getContext("2d");
  fc.clearRect(0, 0, 360, 180);
  fc.fillStyle = "rgba(3, 9, 17, 0.55)";
  for (var y = 0; y < 180; y++) {
    for (var x = 0; x < 360; x++) {
      if (!MAP.explored[y * 360 + x]) fc.fillRect(x, y, 1, 1);
    }
  }
  c.imageSmoothingEnabled = true;
  c.drawImage(MAP._fogCv, 0, 0, W, H);

  // רשת קווי אורך/רוחב כל 30°
  c.strokeStyle = "rgba(140, 190, 230, 0.14)";
  c.lineWidth = 1;
  for (var gl = -150; gl <= 150; gl += 30) {
    var gx = (gl + 180) / 360 * W;
    c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke();
  }
  for (var gb = -60; gb <= 60; gb += 30) {
    var gy = (90 - gb) / 180 * H;
    c.strokeStyle = gb === 0 ? "rgba(140,190,230,0.28)" : "rgba(140,190,230,0.14)";
    c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
  }

  // נתיב מלא
  c.strokeStyle = "rgba(120,220,255,0.8)";
  c.lineWidth = 1.2;
  c.beginPath();
  var prev = null;
  for (var i = 0; i < MAP.trail.length; i++) {
    var p = toXY(MAP.trail[i][0], MAP.trail[i][1]);
    if (prev && Math.abs(p[0] - prev[0]) > W / 2) { prev = null; } // קפיצת קו תאריך
    if (!prev) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]);
    prev = p;
  }
  c.stroke();

  // שמות מדינות — תמיד (לימודי); בהיר יותר באזורים שנחקרו
  c.font = Math.max(9, H / 55) + "px 'Segoe UI'";
  c.textAlign = "center";
  for (var i = 0; i < GEO.COUNTRIES.length; i++) {
    var co = GEO.COUNTRIES[i];
    var xi = U.clamp(Math.floor(co.lon + 180), 0, 359);
    var yi = U.clamp(Math.floor(co.lat + 90), 0, 179);
    var seen = MAP.explored[yi * 360 + xi];
    var p = toXY(co.lat, co.lon);
    c.fillStyle = seen ? "rgba(255,255,255,0.9)" : "rgba(200,220,240,0.35)";
    c.fillText(co.name, p[0], p[1]);
  }
  // ערים שנחקרו
  for (var L = 0; L < 2; L++) {
    var lst = L === 0 ? GEO.ISRAEL_CITIES : GEO.WORLD_CITIES;
    for (var i = 0; i < lst.length; i++) {
      var ct = lst[i];
      if (L === 0 && ct.size < 4 && H < 400) continue;
      var xi = U.clamp(Math.floor(ct.lon + 180), 0, 359);
      var yi = U.clamp(Math.floor(ct.lat + 90), 0, 179);
      if (!MAP.explored[yi * 360 + xi]) continue;
      var p = toXY(ct.lat, ct.lon);
      c.fillStyle = "#ffd97a";
      c.beginPath(); c.arc(p[0], p[1], 1.6, 0, Math.PI * 2); c.fill();
    }
  }

  // נקודת ניווט + קו מהמטוס אליה
  if (window.APP && APP.waypoint) {
    var wpp = toXY(APP.waypoint.lat, APP.waypoint.lon);
    var app = toXY(ac.lat, ac.lon);
    c.strokeStyle = "rgba(255,211,77,0.6)";
    c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(app[0], app[1]); c.lineTo(wpp[0], wpp[1]); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "#ffd34d"; c.strokeStyle = "#5c4400";
    c.beginPath();
    c.moveTo(wpp[0], wpp[1] - 7); c.lineTo(wpp[0] + 6, wpp[1]);
    c.lineTo(wpp[0], wpp[1] + 7); c.lineTo(wpp[0] - 6, wpp[1]);
    c.closePath(); c.fill(); c.stroke();
  }

  // מיקום המטוס
  var pp = toXY(ac.lat, ac.lon);
  c.save();
  c.translate(pp[0], pp[1]);
  c.rotate(ac.getHeading() * U.DEG);
  c.fillStyle = "#40ff80";
  c.beginPath();
  c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6);
  c.closePath(); c.fill();
  c.restore();

  document.getElementById("exploredPct").textContent = MAP.exploredPct().toFixed(1) + "%";
};
