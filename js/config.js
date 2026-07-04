/* =========================================================
   C-SIM — config.js
   קבועים גלובליים, קנה מידה, ופונקציות עזר משותפות.
   ========================================================= */
"use strict";

var CFG = {
  // --- עולם ---
  // קנה מידה של כדור הארץ. 1.0 = גודל אמיתי (היקף ~40,075 ק"מ).
  // אפשר להקטין (למשל 0.25) כדי שהעולם יהיה קומפקטי יותר.
  WORLD_SCALE: 1.0,
  M_PER_DEG_LAT: 111320,        // מטרים למעלת רוחב

  // רשת צ'אנקים במעלות (0.04° ≈ 4.4 ק"מ בקו רוחב)
  CHUNK_DEG: 0.04,
  DETAIL_RADIUS: 2,             // רדיוס צ'אנקים בפירוט מלא (בניינים)
  GROUND_RADIUS: 7,             // רדיוס צ'אנקים של קרקע בלבד
  MAX_CHUNKS_PER_FRAME: 3,      // כמה צ'אנקים לבנות בפריים (מניעת תקיעות)

  // --- מטוס F-35 ---
  PLANE: {
    MASS: 22000,                // ק"ג (משקל המראה טיפוסי)
    THRUST_MIL: 125000,         // ניוטון — עוצמה צבאית מלאה
    THRUST_AB: 191000,          // ניוטון — עם מבער אחורי
    WING_AREA: 42.7,            // מ"ר
    MAX_SPEED: 550,             // מ/ש (~מאך 1.6)
    STALL_SPEED_CLEAN: 80,      // מ/ש הזדקרות ללא מדפים
    STALL_SPEED_FLAPS: 62,      // מ/ש עם מדפים
    PITCH_RATE: 1.5,            // רד/ש מקסימום
    ROLL_RATE: 3.4,             // רד/ש
    YAW_RATE: 0.5,              // רד/ש
    GEAR_MAX_SPEED: 130,        // מ/ש — מעל זה נזק לגלגלים (התראה)
    SERVICE_CEILING: 15000      // מ' — תקרת שירות
  },

  // --- נקודת התחלה: בסיס חיל האוויר נבטים (בית ה-F-35I "אדיר") ---
  START: {
    LAT: 31.205,
    LON: 34.722,
    HEADING: 330,               // מעלות — כיוון המסלול
    NAME: "בסיס נבטים"
  },

  // --- זמן ---
  TIME_SCALES: [1, 5, 20, 50],

  // --- גרפיקה ---
  FOG_NEAR_FACTOR: 0.45,
  VIEW_DISTANCE: 30000,         // מ' מרחק ראייה בסיסי
  SKY_TOP: 0x1c4a8c,
  SKY_HORIZON: 0xa8cfe8,

  COLORS: {
    OCEAN: 0x1a4a72,
    SAND: 0xc9b487,
    GRASS: 0x6f8f4e,
    FOREST: 0x3f6b38,
    DESERT: 0xc8a76a,
    TUNDRA: 0x9aa78f,
    SNOW: 0xe8eef2,
    URBAN: 0x8f8f8a,
    FIELD_A: 0x8faa50,
    FIELD_B: 0xb5a465,
    FIELD_C: 0x7c9a5e,
    ROAD: 0x3c3c40,
    RUNWAY: 0x2e2e33
  }
};

/* ---------- פונקציות עזר ---------- */

var U = {
  DEG: Math.PI / 180,
  RAD: 180 / Math.PI,

  clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp: function (a, b, t) { return a + (b - a) * t; },

  // עטיפת קו אורך לטווח [-180,180]
  wrapLon: function (lon) {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
  },

  // הפרש קווי אורך הקצר ביותר (מעגליות העולם)
  dLon: function (from, to) {
    var d = to - from;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  },

  // מטרים למעלת אורך בקו רוחב נתון
  mPerDegLon: function (lat) {
    var c = Math.cos(lat * Math.PI / 180);
    return CFG.M_PER_DEG_LAT * Math.max(c, 0.05);
  },

  // האש דטרמיניסטי של שני מספרים שלמים -> [0,1)
  hash2: function (ix, iy) {
    var h = ix * 374761393 + iy * 668265263;
    h = (h ^ (h >> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  },

  // מחולל אקראי דטרמיניסטי (mulberry32)
  rng: function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // רעש ערכי חלק דו-ממדי (value noise) על בסיס hash2
  noise2: function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    var a = U.hash2(xi, yi), b = U.hash2(xi + 1, yi);
    var c = U.hash2(xi, yi + 1), d = U.hash2(xi + 1, yi + 1);
    return U.lerp(U.lerp(a, b, sx), U.lerp(c, d, sx), sy);
  },

  // רעש מרובה אוקטבות
  fbm: function (x, y, oct) {
    var v = 0, amp = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      v += amp * U.noise2(x * f, y * f);
      amp *= 0.5; f *= 2;
    }
    return v;
  },

  // בדיקת נקודה בתוך פוליגון [lon,lat]
  pointInPoly: function (lon, lat, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1];
      var xj = poly[j][0], yj = poly[j][1];
      if (((yi > lat) !== (yj > lat)) &&
          (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  },

  // מרחק גאודזי מקורב בק"מ (מספיק לתוויות)
  distKm: function (lat1, lon1, lat2, lon2) {
    var dLat = (lat2 - lat1) * CFG.M_PER_DEG_LAT / 1000;
    var dLng = U.dLon(lon1, lon2) * U.mPerDegLon((lat1 + lat2) / 2) / 1000;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  },

  fmtCoord: function (lat, lon) {
    var ns = lat >= 0 ? "N" : "S", ew = lon >= 0 ? "E" : "W";
    return Math.abs(lat).toFixed(3) + "°" + ns + " " + Math.abs(lon).toFixed(3) + "°" + ew;
  },

  isMobile: function () {
    return ("ontouchstart" in window) &&
           /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  }
};
