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
/* app build 30: Android lays its own live clock over the top centre when this is on */
const CLOCK = NJ_Q.get("clock") !== "0";
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
  /* app build 30: shade the sky behind the top text and the ground behind the
     hours, so white text reads on a pale overcast sky too */
  {
    const W2 = cv.width, H2 = cv.height;
    let g = c.createLinearGradient(0, 0, 0, H2*0.62);
    g.addColorStop(0, "rgba(8,12,22,.55)"); g.addColorStop(0.55, "rgba(8,12,22,.28)"); g.addColorStop(1, "rgba(8,12,22,0)");
    c.fillStyle = g; c.fillRect(0, 0, W2, H2*0.62);
    g = c.createLinearGradient(0, H2*0.48, 0, H2);
    g.addColorStop(0, "rgba(8,12,22,0)"); g.addColorStop(0.4, "rgba(8,12,22,.45)"); g.addColorStop(1, "rgba(8,12,22,.7)");
    c.fillStyle = g; c.fillRect(0, H2*0.48, W2, H2*0.52);
  }
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
    c.shadowColor = "rgba(0,0,0,.75)"; c.shadowBlur = 6; c.shadowOffsetY = 1;
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
    /* clear and mainly clear: the widget's own sun, or a crescent moon the same
       size at night (the app's glyphs are much smaller at this scale) */
    if(code === 0 || code === 1){ if(nt) moonMark(cx, cy, s/5); else sunMark(cx, cy, s/5); return; }
    c.save(); c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = 3;
    try { paintGlyph(c, code, cx, cy, s, nt); } catch(e){}
    c.restore();
  };
  /* "Updated: 12:09p" and a refresh arrow; the app puts its tap target over it */
  const updatedLine = (x, yBase, size) => {
    const t = (() => { const p = zonedParts(new Date(), PLACE.tz); return hm(p.hour*60 + p.minute); })();
    const uw = txt("Updated: " + t, x, yBase, size, 400, "left", .85);
    /* a circular arrow: open at the top right, arrowhead pointing on round
       (build 30's hooked line read as a "G") */
    const cx = x + uw + 10, cy = yBase - 3.5, r = 4, a0 = -Math.PI*0.42, a1 = a0 + Math.PI*1.62;
    c.save(); c.strokeStyle = c.fillStyle = "rgba(255,255,255,.92)"; c.lineWidth = 1.4; c.lineCap = "round";
    c.shadowColor = "rgba(0,0,0,.75)"; c.shadowBlur = 5;
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
    const ex = cx + r*Math.cos(a1), ey = cy + r*Math.sin(a1), tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1);
    c.beginPath(); c.moveTo(ex + tx*2.4, ey + ty*2.4);
    c.lineTo(ex - tx*1.1 + nx*2.3, ey - ty*1.1 + ny*2.3); c.lineTo(ex - tx*1.1 - nx*2.3, ey - ty*1.1 - ny*2.3);
    c.closePath(); c.fill();
    c.restore();
    /* the tap target sits on the arrow (56 x 40 dp, as in the layout file); build 34's
       started at "Updated" and stopped short of the arrow */
    pill = { x: cx - 32, y: cy - 20, w: 56, h: 40 };
  };
  /* the footer's sun: a disc with short rays, as big as the moon on the right
     (the app's own weather glyph read as a flower at this size). Widget only. */
  const sunMark = (cx, cy, k) => {
    k = k || 1;
    c.save(); c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 4;
    c.fillStyle = "#ffd36a"; c.strokeStyle = "#ffd36a"; c.lineWidth = 1.3*Math.sqrt(k); c.lineCap = "round";
    c.beginPath(); c.arc(cx, cy, 3.6*k, 0, Math.PI*2); c.fill();
    c.beginPath();
    for(let i = 0; i < 8; i++){
      const a = i*Math.PI/4, ca = Math.cos(a), sa = Math.sin(a);
      c.moveTo(cx + ca*5*k, cy + sa*5*k); c.lineTo(cx + ca*6.6*k, cy + sa*6.6*k);
    }
    c.stroke(); c.restore();
  };
  const moonMark = (cx, cy, k) => {
    k = k || 1;
    const R = 5.4*k, pad = 4, n = Math.ceil((R + pad)*2*D);
    const m = document.createElement("canvas"); m.width = m.height = n;
    const g = m.getContext("2d"); g.scale(D, D);
    const o = R + pad;
    g.fillStyle = "#ece6d2"; g.beginPath(); g.arc(o, o, R, 0, Math.PI*2); g.fill();
    g.globalCompositeOperation = "destination-out";
    g.beginPath(); g.arc(o + R*0.55, o - R*0.38, R*0.86, 0, Math.PI*2); g.fill();
    c.save(); c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 4;
    c.drawImage(m, cx - o, cy - o, 2*o, 2*o); c.restore();
  };
  const pin = (cx, cy) => {
    c.save(); c.fillStyle = "#fff"; c.shadowColor = "rgba(0,0,0,.75)"; c.shadowBlur = 5;
    c.beginPath(); c.arc(cx, cy - 1.2, 3.8, Math.PI*0.8, Math.PI*2.2); c.lineTo(cx, cy + 5); c.closePath(); c.fill();
    c.shadowBlur = 0; c.globalCompositeOperation = "destination-out";
    c.beginPath(); c.arc(cx, cy - 1.3, 1.4, 0, Math.PI*2); c.fill();
    c.restore();
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
    /* right: high · low and the wind, centred top to bottom; an alert's chip goes
       under the wind and the three are centred together (build 35) */
    const al = topAlert();
    let chipW = 0, label = "";
    if(al){
      c.font = "700 10.5px " + FT;
      label = fit(al.txt + (al.more > 0 ? "  +" + al.more : ""), 10.5, 700, Wd*0.42);
      chipW = c.measureText(label).width + 16;
    }
    const mid = maxMid;
    const mpx = HERE ? mx + 11 : mx;
    if(HERE) pin(mx + 4, cy - 13.5);
    txt(fit(place, 12, 600, Math.max(30, mid - (mpx - mx))), mpx, cy - 9, 12, 600);
    txt(fit(cond, 12, 400, mid), mx, cy + 5, 12, 400, "left", .92);
    if(mid > 100) updatedLine(mx, cy + 19, 10);
    const blockH = 16 + 5 + 12 + (al ? 6 + 16 : 0);
    /* centred; with an alert, low enough that the chip clears the "Updated" line */
    const top = al ? Math.max(Hd/2 - blockH/2, cy + 24 - 39) : Hd/2 - blockH/2;
    txt(hiLo, Wd - P, top + 13, 15.5, 600, "right");
    rightWind(top + 31, false);
    if(al){
      const ax = Wd - P - chipW, ay = top + 39;
      c.save(); c.fillStyle = al.col; c.beginPath();
      c.roundRect ? c.roundRect(ax, ay, chipW, 16, 8) : c.rect(ax, ay, chipW, 16); c.fill();
      c.fillStyle = "#fff"; c.font = "700 10.5px " + FT; c.textBaseline = "middle"; c.fillText(label, ax + 8, ay + 8.5); c.restore();
    }
  } else {
    const wide = Wd >= 360;   // 5x2 and a full-width 4x2 are about the same size on a phone
    /* top left: place, refresh, temperature, condition, alert */
    /* My location: a small pin before the name (the app's My location chip uses
       the same mark) instead of " · My location", which the clock cut off */
    const px = HERE ? P + 11 : P;
    if(HERE) pin(P + 4, 16.5);
    const nm = fit(place, 12, 600, (CLOCK ? Wd*0.6 - P : Wd*0.55 - 40) - (px - P));
    txt(nm, px, 21, 12, 600);
    txt(WX.temp + "°", P - 1, 60, 40, 300);
    txt(fit(cond, 12, 400, Wd*0.5), P, 77, 12, 400, "left", .92);
    updatedLine(P, 93, 10.5);
    const al = topAlert();
    if(al){
      c.font = "700 10.5px " + FT;
      const label = fit(al.txt + (al.more > 0 ? "  +" + al.more : ""), 10.5, 700, Wd*0.45);
      const w = c.measureText(label).width + 16;
      c.save(); c.fillStyle = al.col; c.beginPath();
      /* top right, in place of the weather icon (the condition is written on the left) */
      const ax = Wd - P - w; c.roundRect ? c.roundRect(ax, 6, w, 17, 8.5) : c.rect(ax, 6, w, 17); c.fill();
      c.fillStyle = "#fff"; c.textBaseline = "middle"; c.fillText(label, ax + 8, 15); c.restore();
    }
    /* top right: icon, high / low, wind */
    if(!al) glyph(WX.code, Wd - P - 18, 24, 13, night);
    /* high over low, then the wind on the same line as "Updated" */
    if(d0){ txt("H " + d0.hi + "°", Wd - P, 60, 15.5, 600, "right"); txt("L " + d0.lo + "°", Wd - P, 78, 15.5, 600, "right"); }
    rightWind(93, true);
    /* footer: sun and moon in the lower corners */
    const fy = Hd - 9;
    sunMark(P + 6.5, fy - 4);
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
    const top = Math.max(100, fy - 92), span = Wd - 2*P;
    hrs.forEach((h, i) => {
      const x = P + (n > 1 ? span*i/(n - 1) : span/2);
      const al = i === 0 ? "left" : i === n - 1 ? "right" : "center";
      const gx = al === "left" ? x + 12 : al === "right" ? x - 12 : x;
      txt(h.lab, gx, top + 13, 14, 400, "center", .95);
      glyph(h.code, gx, top + 31, 9.6, h.night);
      txt(h.temp + "°", gx, top + 58, 16, 600, "center");
      if(h.pop) { c.save(); c.font = "500 12.5px " + FT; c.fillStyle = "#9fd0ff"; c.textAlign = "center";
                  c.shadowColor = "rgba(0,0,0,.5)"; c.shadowBlur = 3; c.fillText(h.pop, gx, top + 73); c.restore(); }
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
