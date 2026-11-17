/* Njord Weather - home-screen widget painter (app build 29).

   The Android widget can't run this page, so the app loads it off-screen as
   index.html?widget=1&goto=<place>&L=<layout>&d=<density>, waits for the
   forecast, terrain and alerts, paints ONE still frame of the real scene,
   draws the widget's text on top, and hands the picture back as a PNG.
   Nothing here runs in the app or on the web (NJ_WIDGET is false there).

   Layouts (L): s21 (2x1), s41 (4x1), s42 (4x2), s52 (5x2). Sizes below are
   in dp; the picture is drawn at the phone's own density (d) so text stays
   sharp. */
(function(){
"use strict";
if(typeof NJ_WIDGET === "undefined" || !NJ_WIDGET) return;
const BR = window.NjordWidget || null;
const L = ["s21","s41","s42","s52"].includes(NJ_Q.get("L")) ? NJ_Q.get("L") : "s42";
const D = Math.max(1, Math.min(4, +NJ_Q.get("d") || 2));
const HERE = NJ_Q.get("here") === "1";
const T0 = Date.now(), MAX_WAIT = 28000;

/* only the scene: no clock, cards, timeline, banners or rain on the glass */
for(const f of ["drawNow","drawMoonDial","drawAuroraNote","drawWarnBanner","drawBadge","drawDays","drawDaysWide","drawTimeline"])
  try { window[f] = () => 0; } catch(e){}
CONFIG.showCards = false; CONFIG.showHourly = false; CONFIG.showMoon = false; CONFIG.rainOnGlass = false;

function done(obj){ try { BR && BR.done(JSON.stringify(obj)); } catch(e){} }
function fail(why){ done({ ok: false, why: String(why || "unknown") }); }

/* My location: the app passes the coordinates; the town name comes from the
   same lookup the app uses. Only the label and country change - the place
   itself (and so the forecast) is already set from ?goto=. */
let nameDone = !HERE;
if(HERE){
  fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en&latitude=" + PLACE.lat + "&longitude=" + PLACE.lng)
    .then(r => r.ok ? r.json() : Promise.reject(0))
    .then(j => {
      const town = String(j.city || j.locality || j.principalSubdivision || "")
        .replace(/^Township of (.+)$/i, "$1 Township").replace(/^(City|Town|Village|Borough) of /i, "");
      if(town){ PLACE.short = town; PLACE.name = town; }
      const cc = j.countryCode ? String(j.countryCode).toUpperCase() : null;
      if(cc && cc !== PLACE.cc){ PLACE.cc = cc; try { loadAlerts(); } catch(e){} }
    })
    .catch(() => {})
    .then(() => { nameDone = true; });
}

const busy = s => /loading|waiting|^none$/.test(String(s || ""));
function ready(){
  if(!WX) return false;
  if(!nameDone) return false;
  if(busy(TERRAIN_STATE) || busy(BIOME_STATE) || busy(SETTLE_STATE)) return false;
  if(typeof ALERT_STATE !== "undefined" && ALERT_STATE === "loading") return false;
  return true;
}
const iv = setInterval(() => {
  const age = Date.now() - T0;
  if(ready() || age > MAX_WAIT){
    clearInterval(iv);
    if(!WX){ fail(WX_STATE === "offline" ? "offline" : "no forecast"); return; }
    paintSoon();
  }
}, 250);

function paintSoon(){
  /* a few frames so the scene settles (clouds placed, town built, sun lit) */
  let n = 0;
  const step = () => {
    try { SCENE_AT = -1e9; frame(performance.now()/1000); } catch(e){}
    if(++n < 4) setTimeout(step, 120);
    else (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(compose).catch(e => fail(e && e.message));
  };
  step();
}

/* ---- text helpers ---------------------------------------------------------- */
const FT = "Figtree, 'Segoe UI', system-ui, sans-serif";
const pad2 = n => String(n).padStart(2, "0");
function nameOf(p){
  return String((p && (p.short || p.name)) || "").split(",")[0]
    .replace(/^Township of (.+)$/i, "$1 Township").replace(/^(City|Town|Village|Borough) of /i, "");
}
function hm(min){
  /* "7:38a" / "16:51" - the widget's short clock */
  if(min == null) return "–";
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(min/60), m = min % 60;
  if(CONFIG.clock24) return pad2(h) + ":" + pad2(m);
  return (h % 12 || 12) + ":" + pad2(m) + (h < 12 ? "a" : "p");
}
function hourLabel(h){ return CONFIG.clock24 ? pad2(h) : (h % 12 || 12) + (h < 12 ? "a" : "p"); }
const COMP = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
function windLine(withGust){
  if(WX.wind == null || WX.wind < 1) return { txt: "Calm", dir: null };
  const dir = WX.dir != null ? COMP[Math.round(norm360(WX.dir)/22.5) % 16] + " " : "";
  let t = dir + WX.wind + " " + spdUnit();
  if(withGust && isGusty(WX.wind, WX.gust)) t += " · gusts " + WX.gust;
  return { txt: t, dir: WX.dir };
}
function nowMin(){ const p = zonedParts(new Date(), PLACE.tz); return p.hour*60 + p.minute; }
function tomorrow(body){
  try { return localEvents(PLACE, new Date(Date.now() + 86400e3), body); } catch(e){ return null; }
}
/* lower-left: the sun. By day today's sunrise to sunset, otherwise the next sunrise. */
function sunText(){
  const ev = SUNEV || {}, m = nowMin();
  if(ev.alwaysUp) return "Midnight sun";
  if(ev.alwaysDown) return "Polar night";
  if(ev.rise != null && ev.set != null && m >= ev.rise && m < ev.set) return hm(ev.rise) + " – " + hm(ev.set);
  if(ev.rise != null && m < ev.rise) return "Rises " + hm(ev.rise);
  const t = tomorrow("sun");
  return t && t.rise != null ? "Rises " + hm(t.rise) : (ev.set != null ? "Set " + hm(ev.set) : "");
}
/* lower-right: the moon. By day its phase; at night when it next rises or sets. */
function moonText(wide){
  const ph = SCENE && SCENE.phase;
  const name = ph ? sentence(ph.name) + (wide ? " · " + Math.round(ph.illum*100) + "%" : "") : "";
  const ev = SUNEV || {}, m = nowMin();
  const day = ev.alwaysUp || (ev.rise != null && ev.set != null && m >= ev.rise && m < ev.set);
  if(day || !ph) return name;
  let up = false; try { up = moonSky(PLACE, new Date()).alt > 0; } catch(e){}
  const mv = MOONEV || {}, nx = tomorrow("moon") || {};
  if(up){
    if(mv.set != null && mv.set > m) return "Sets " + hm(mv.set);
    if(nx.set != null) return "Sets " + hm(nx.set);
  } else {
    if(mv.rise != null && mv.rise > m) return "Rises " + hm(mv.rise);
    if(nx.rise != null) return "Rises " + hm(nx.rise);
  }
  return name;
}
function isNightAt(min){
  const ev = SUNEV;
  if(!ev) return false;
  if(ev.alwaysUp) return false;
  if(ev.alwaysDown) return true;
  const r = ev.rise != null ? ev.rise : 360, st = ev.set != null ? ev.set : 1140;
  return min < r || min > st;
}
function nextHours(n){
  const hs = WX.hours || [];
  const p = zonedParts(new Date(), PLACE.tz);
  const key = p.year + "-" + pad2(p.month) + "-" + pad2(p.day) + "T" + pad2(p.hour);
  let i0 = hs.findIndex(h => String(h.time).slice(0, 13) === key);
  if(i0 < 0) i0 = 0;
  return hs.slice(i0 + 1, i0 + 1 + n).map(h => {
    const hr = +String(h.time).slice(11, 13);
    return { lab: hourLabel(hr), code: h.code, temp: h.temp, night: isNightAt(hr*60 + 30),
             pop: h.pop != null && h.pop >= 20 ? Math.round(h.pop/10)*10 + "%" : "" };
  });
}
function topAlert(){
  const a = (ALERTS || [])[0];
  if(!a) return null;
  const ev = String(a.event || "");
  const col = /warning$|emergency$/i.test(ev) ? "rgba(214,60,45,.94)" : /watch$/i.test(ev) ? "rgba(214,140,40,.94)" : "rgba(120,130,150,.9)";
  return { txt: "⚠ " + ev, col, more: ALERTS.length - 1 };
}

/* ---- compose --------------------------------------------------------------- */
function compose(){
  const Wd = window.innerWidth, Hd = window.innerHeight;     // dp
  const cv = document.createElement("canvas");
  cv.width = Math.round(Wd*D); cv.height = Math.round(Hd*D);
  const c = cv.getContext("2d");
  c.drawImage(canvas, 0, 0, cv.width, cv.height);
  c.scale(D, D);
  const night = SCENE && SCENE.dayness < 0.35;
  const cond = SCENE && SCENE.cls ? SCENE.cls.label : "";
  const d0 = WX.days && WX.days[0];
  const P = 14, place = nameOf(PLACE);
  let pill = null;

  const txt = (s, x, y, size, wt, align, alpha) => {
    c.save();
    c.font = (wt || 400) + " " + size + "px " + FT;
    c.textAlign = align || "left"; c.textBaseline = "alphabetic";
    c.fillStyle = "rgba(255,255,255," + (alpha == null ? 1 : alpha) + ")";
    c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 4; c.shadowOffsetY = 1;
    c.fillText(s, x, y);
    c.restore();
    c.font = (wt || 400) + " " + size + "px " + FT;
    return c.measureText(s).width;
  };
  const fit = (s, size, wt, maxW) => {
    c.font = (wt || 400) + " " + size + "px " + FT;
    if(c.measureText(s).width <= maxW) return s;
    while(s.length > 1 && c.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  };
  const glyph = (code, cx, cy, s, nt) => {
    c.save(); c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 3;
    try { paintGlyph(c, code, cx, cy, s, nt); } catch(e){}
    c.restore();
  };
  /* the refresh pill: arrow + time of this update; the app puts its tap target here */
  const refreshPill = (x, yBase) => {
    const t = (() => { const p = zonedParts(new Date(), PLACE.tz); return hm(p.hour*60 + p.minute); })();
    c.font = "500 10px " + FT;
    const w = c.measureText(t).width + 26, h = 15, y = yBase - 11.5;
    c.save(); c.fillStyle = "rgba(0,0,0,.30)";
    c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, 7.5) : c.rect(x, y, w, h); c.fill();
    c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.lineCap = "round";
    const ax = x + 9, ay = y + h/2, r = 3.6;
    c.beginPath(); c.arc(ax, ay, r, -0.2, Math.PI*1.55); c.stroke();
    c.beginPath(); c.moveTo(ax + r + 0.4, ay - 4.2); c.lineTo(ax + r + 0.4, ay - 0.6); c.lineTo(ax + r - 3, ay - 0.6); c.stroke();
    c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(t, x + 17, ay + 0.5);
    c.restore();
    pill = { x: x - 6, y: y - 8, w: w + 12, h: h + 16 };       // a little larger to tap
    return w;
  };
  const windArrow = (dir, x, y) => {
    if(dir == null) return 0;
    c.save(); c.translate(x + 5, y - 4); c.rotate((dir + 180)*Math.PI/180);
    c.strokeStyle = "#fff"; c.lineWidth = 1.5; c.lineCap = "round"; c.lineJoin = "round";
    c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 3;
    c.beginPath(); c.moveTo(0, 4.5); c.lineTo(0, -4.5); c.moveTo(-3, -1.5); c.lineTo(0, -4.5); c.lineTo(3, -1.5); c.stroke();
    c.restore();
    return 13;
  };
  const rightWind = (y, gust) => {
    const w = windLine(gust);
    c.font = "400 11.5px " + FT;
    const tw = c.measureText(w.txt).width;
    txt(w.txt, Wd - P, y, 11.5, 400, "right", .93);
    windArrow(w.dir, Wd - P - tw - 14, y);
  };
  const hiLo = d0 ? "H " + d0.hi + "° · L " + d0.lo + "°" : "";

  if(L === "s21"){
    glyph(WX.code, P + 16, Hd*0.42, 13, night);
    const tx = P + 38;
    txt(WX.temp + "°", tx, Hd*0.42 + 13, 34, 300);
    txt(fit(place, 12, 600, Wd - tx - 8), tx + 2, Hd*0.42 + 30, 12, 600);
  } else if(L === "s41"){
    const cy = Hd*0.42;
    glyph(WX.code, P + 18, cy, 14, night);
    const tw = txt(WX.temp + "°", P + 42, cy + 13, 36, 300);
    const mx = P + 42 + tw + 10;
    c.font = "600 15.5px " + FT;
    const rw = Math.max(c.measureText(hiLo).width, 90);
    const maxMid = Wd - P - rw - mx - 8;
    const nm = fit(place, 12, 600, Math.max(30, maxMid - 64));
    const nw = txt(nm, mx, cy - 3, 12, 600);
    if(maxMid > nw + 50) refreshPill(mx + nw + 7, cy - 3);
    txt(fit(cond, 12, 400, maxMid), mx, cy + 13, 12, 400, "left", .92);
    txt(hiLo, Wd - P, cy - 2, 15.5, 600, "right");
    rightWind(cy + 15, false);
  } else {
    const wide = Wd >= 360;   // 5x2 and a full-width 4x2 are about the same size on a phone
    /* top left: place, refresh, temperature, condition, alert */
    const nm = fit(place + (HERE ? " \u00b7 My location" : ""), 12, 600, Wd*0.55 - 60);
    const nw = txt(nm, P, 21, 12, 600);
    refreshPill(P + nw + 7, 21);
    txt(WX.temp + "°", P - 1, 60, 40, 300);
    txt(fit(cond, 12, 400, Wd*0.5), P, 77, 12, 400, "left", .92);
    const al = topAlert();
    if(al){
      c.font = "700 10.5px " + FT;
      const label = fit(al.txt + (al.more > 0 ? "  +" + al.more : ""), 10.5, 700, Wd*0.55);
      const w = c.measureText(label).width + 16;
      c.save(); c.fillStyle = al.col; c.beginPath();
      c.roundRect ? c.roundRect(P, 83, w, 16, 8) : c.rect(P, 83, w, 16); c.fill();
      c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(label, P + 8, 91.5); c.restore();
    }
    /* top right: icon, high / low, wind */
    glyph(WX.code, Wd - P - 18, 24, 13, night);
    txt(hiLo, Wd - P, 62, 15.5, 600, "right");
    rightWind(78, true);
    /* footer: sun and moon in the lower corners */
    const fy = Hd - 9;
    glyph(0, P + 6, fy - 4, 6.4, false);
    txt(sunText(), P + 17, fy, 11, 400, "left", .95);
    const mt = moonText(wide);
    c.font = "400 11px " + FT;
    const mw = c.measureText(mt).width;
    txt(mt, Wd - P, fy, 11, 400, "right", .95);
    try {
      const ph = SCENE.phase, R = 6.5, spr = moonSprite(R, ph.elong, false);
      const flip = (!ph.waxing) !== (PLACE.lat < 0);
      c.save(); c.translate(Wd - P - mw - 6 - R, fy - 4);
      if(flip) c.scale(-1, 1);
      c.drawImage(spr, -R, -R, 2*R, 2*R); c.restore();
    } catch(e){}
    /* the next hours, evenly across, just above the footer */
    const hrs = nextHours(Math.max(4, Math.min(7, Math.floor((Wd - 2*P)/50) + 1))), n = hrs.length;
    const top = Math.max(102, fy - 70), span = Wd - 2*P;
    hrs.forEach((h, i) => {
      const x = P + (n > 1 ? span*i/(n - 1) : span/2);
      const al = i === 0 ? "left" : i === n - 1 ? "right" : "center";
      const gx = al === "left" ? x + 9 : al === "right" ? x - 9 : x;
      txt(h.lab, gx, top + 10, 10.5, 400, "center", .95);
      glyph(h.code, gx, top + 21, 6.8, h.night);
      txt(h.temp + "°", gx, top + 39, 10.5, 600, "center");
      if(h.pop) { c.save(); c.font = "400 9.5px " + FT; c.fillStyle = "#9fd0ff"; c.textAlign = "center";
                  c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 3; c.fillText(h.pop, gx, top + 50); c.restore(); }
    });
  }
  let png = "";
  try { png = cv.toDataURL("image/png"); } catch(e){ fail("toDataURL: " + (e && e.message)); return; }
  done({
    ok: true, png, w: Wd, h: Hd, d: D, pill,
    place: { name: PLACE.name, short: PLACE.short, lat: PLACE.lat, lng: PLACE.lng, tz: PLACE.tz, cc: PLACE.cc },
    desc: place + ", " + WX.temp + "°, " + cond + (hiLo ? ", " + hiLo.replace(/·/g, "") : "")
  });
}
})();
