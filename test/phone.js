/* Njord Weather - phone layer (app build 2).
   Runs after the wallpaper script and reuses its data (WX, PLACE, SCENE) and
   helpers. Portrait phones get a scrolling sheet of cards over the live
   scene; landscape keeps the original wide layout. Nothing here changes how
   the scene itself is drawn. */
(function(){
"use strict";
/* the home-screen widget loads the page only to paint the scene (widget.js) */
if(typeof NJ_WIDGET !== "undefined" && NJ_WIDGET) return;
const root = document.documentElement;
const ANDROID_APP = /androidplatform\.net$/.test(location.hostname);
/* web app opened from the home screen (iPhone or Android) counts as the app */
const STANDALONE = navigator.standalone === true
  || (window.matchMedia && matchMedia("(display-mode: standalone)").matches)
  || /[?&]pwa=1\b/.test(location.search);
const APP = ANDROID_APP || STANDALONE || /[?&]app=1\b/.test(location.search);
if(!ANDROID_APP && location.protocol === "https:" && "serviceWorker" in navigator)
  {} /* test web build: no service worker */
root.classList.toggle("app", APP);
/* app build 37: Njord Free (the free app). The app says so through the
   bridge; ?free=1 shows the same limits in a browser for testing. */
const FREE = (() => { try { return !!(window.NjordAndroid && window.NjordAndroid.isFree && window.NjordAndroid.isFree()); } catch(e){ return false; } })()
  || /[?&]free=1\b/.test(location.search);
root.classList.toggle("njFree", FREE);
const FREE_PLACES = 2;
const LOCK_SVG = '<svg class="njLock" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const isPhone = () => window.innerWidth < 720 && window.innerHeight > window.innerWidth;
function applyMode(){ root.classList.toggle("phone", isPhone()); }
applyMode();
window.addEventListener("resize", () => { applyMode(); render(true); });

/* The scene's own corner readout is sized for a monitor; on a phone the
   header replaces it. */
const drawNowWide = window.drawNow;
try { window.drawNow = function(){ if(!isPhone()) drawNowWide(); }; } catch(e){}

/* Warnings get their own card under the temperature on a phone, so the
   desktop's canvas banner (which sat on top of the clock) is left out. */
const drawWarnWide = window.drawWarnBanner;
try { window.drawWarnBanner = function(){ if(isPhone()){ WARN_HIT = null; return 0; } return drawWarnWide(); }; } catch(e){}

/* Phones have their own keyboard: the on-screen one is for wallpaper hosts. */
try { window.openKb = function(){}; } catch(e){}
document.querySelectorAll("#set h4").forEach(h => { if(/advanced/i.test(h.textContent)) h.classList.add("adv"); });

const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const shortTime = min => fmtTime(min).replace(":00", "");
const deg = "&deg;";

/* ---- DOM ---------------------------------------------------------------- */
const ph = document.createElement("div"); ph.id = "ph";
ph.innerHTML =
  '<div id="phTop"><div id="phHero"></div></div>' +
  '<div id="phSheet"><div class="grab"></div><div id="phAur"></div><div id="phAvi"></div>' +
    '<section class="pc" id="phHourly"><h3>Next 24 hours <a class="jump" id="phJump">' + (FREE ? '7-day' : '10-day') + ' &rsaquo;</a></h3><div class="sum24"></div><div class="hrs"></div></section>' +
    '<section class="pc" id="phRadar" hidden><h3>Radar <a class="jump" id="phRadarJump">Full map &rsaquo;</a></h3>' +
      '<div class="rdMap" id="phRadarMap"><div class="rdGL"></div><span class="rdTime"></span></div><div class="rdNote" hidden></div></section>' +
    '<section class="pc" id="phGraph" hidden></section>' +
    '<div class="grid2" id="phDetails"></div>' +
    '<section class="pc" id="phSky" style="margin-top:12px"></section>' +
    '<section class="pc" id="phDays"><h3>' + (FREE ? '7-day' : '10-day') + ' forecast <span class="tapHint">tap a day</span></h3><div class="days"></div></section>' +
    '<section class="pc" id="phAfd" hidden></section>' +
  '</div>';
document.body.appendChild(ph);
/* app build 30: Places lives at the top of Settings (it was the last card) */
{
  const box = document.createElement("div"); box.id = "phPlaces";
  box.innerHTML = '<div class="chips"></div>' +
    '<button class="pbtn" id="phSave"></button>' +
    (FREE ? '<div class="njFreeNote">Njord Free keeps ' + FREE_PLACES + ' saved places. More are coming in <b>Njord</b>, the paid version.</div>' : '') +
    '<button class="pbtn" id="phLoc">Use my location</button>' +
    '<div class="hintTxt">Swipe left or right on the sky to move between My location, home and your saved places.</div>';
  const h4 = document.createElement("h4"); h4.textContent = "Places"; h4.id = "phPlacesH";
  const set = document.getElementById("set");
  if(set){ set.insertBefore(box, set.firstElementChild); set.insertBefore(h4, box); }
}
const alertSheet = document.createElement("div"); alertSheet.id = "phAlerts"; alertSheet.hidden = true;
document.body.appendChild(alertSheet);
const bar = document.createElement("div"); bar.id = "phBar";
bar.innerHTML =
  '<button id="phSearch" aria-label="Search places"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg></button>' +
  '<button id="phGear" aria-label="Settings"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>';
document.body.appendChild(bar);
/* a slim bar that slides in once the header has scrolled away, so the place
   (and the reading) stay in view while you read the cards */
const mini = document.createElement("div"); mini.id = "phMini";
document.body.appendChild(mini);

const $ = id => document.getElementById(id);

/* ---- weather icons: the scene's own line icons, painted once into images */
const ICONS = new Map();
function icon(code, night){
  const key = code + "|" + (night ? 1 : 0);
  if(ICONS.has(key)) return ICONS.get(key);
  const s = 15, box = s*2.8, px = Math.ceil(box*3);
  const cv = document.createElement("canvas"); cv.width = cv.height = px;
  const c = cv.getContext("2d"); c.scale(3, 3);
  try { paintGlyph(c, code, box/2, box/2, s, night); } catch(e){}
  const url = cv.toDataURL();
  ICONS.set(key, url);
  return url;
}
function windArrowHTML(dir, size){
  if(dir == null) return "";
  /* the arrow points the way the wind is blowing (from its compass direction) */
  return '<span class="wArr" style="font-size:' + (size || 18) + 'px;transform:rotate(' + Math.round(dir + 180) + 'deg)">&#8593;</span>';
}

/* ---- saved places --------------------------------------------------------- */
const PKEY = "njord.places";
const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lng - b.lng) < 0.01;
/* "the same town" for de-duplicating My location against saved places: the
   phone's fix is rarely the exact town-centre point a search returns */
function sameTown(a, b){
  if(!a || !b) return false;
  if(samePlace(a, b)) return true;
  let km = 999; try { km = kmBetween(a.lat, a.lng, b.lat, b.lng); } catch(e){}
  return km < 3 || (km < 12 && String(a.short || a.name).split(",")[0].trim().toLowerCase() === String(b.short || b.name).split(",")[0].trim().toLowerCase());
}
/* app build 26: saved places are de-duplicated by town, not exact
   coordinates - the same township from GPS and from search sits a few
   hundred metres apart and was saved twice. Lists saved before this are
   cleaned once on load (the first copy is kept). */
function loadPlaces(){
  let j; try { j = JSON.parse(STORE.get(PKEY) || "[]"); } catch(e){ return []; }
  if(!Array.isArray(j)) return [];
  const out = [];
  for(const p of j) if(p && !out.some(q => sameTown(q, p))) out.push(p);
  if(out.length !== j.length) savePlaces(out);
  return out;
}
function homeOf(){ try { const h = JSON.parse(STORE.get("weather.home") || "null"); return h && isFinite(h.lat) ? h : null; } catch(e){ return null; } }
function savePlaces(list){ STORE.set(PKEY, JSON.stringify(list)); try { pushPrefs(); } catch(e){} }
function goPlace(p){ if(!p) return; openDay = -1; setPlace(p); ph.scrollTo({ top: 0, behavior: "smooth" }); render(true); }

/* ---- render ----------------------------------------------------------------
   The header redraws each minute; the forecast cards only when the forecast,
   place, units or hour change, so an open day or the hourly scroll position
   are not reset under your finger. */
let heroSig = "", skySig = "", dataSig = "", lastWX = null, wxGen = 0, openDay = -1;
function render(force){
  if(!isPhone()) return;
  if(WX !== lastWX){ lastWX = WX; wxGen++; }
  const p = zonedParts(new Date(), PLACE.tz);
  const hs = [PLACE.lat, PLACE.lng, p.hour, p.minute, wxGen, WX_STATE, WX_SRC, NWS_STATE, navigator.onLine, CONFIG.units, CONFIG.clock, phRefreshing, WX_FETCHED,
              SCENE && SCENE.cls && SCENE.cls.label, ALERTS.map(a => a.id).join(",")].join("|");
  if(force || hs !== heroSig){ heroSig = hs; renderHero(); }
  /* sun/moon arcs and the aurora note move on their own, slower clock */
  const ss = [PLACE.lat, PLACE.lng, p.hour, Math.floor(p.minute/10), CONFIG.clock, typeof AUR === "object" && AUR ? AUR.kpAt + "/" + AUR.ovAt : ""].join("|");
  if(WX && (force || ss !== skySig)){ skySig = ss; renderSky(); renderAurora(); }
  try { renderAviation(); } catch(e){}
  const ds = [PLACE.lat, PLACE.lng, p.hour, wxGen, CONFIG.units, CONFIG.clock, loadPlaces().length, STORE.get("weather.home") || "",
              CONFIG.showGraph, CONFIG.cardPress, CONFIG.cardVis, OBS_PV ? OBS_PV.t : 0, CONFIG.cardUV, CONFIG.cardTide,
              SCENE ? Math.round(SCENE.phase.illum*100) : -1].join("|");
  if(!force && ds === dataSig) return;
  dataSig = ds;
  renderPlaces();
  if(!WX){
    $("phHourly").querySelector(".hrs").innerHTML = '<div class="sub" style="padding:8px 16px">Loading forecast…</div>';
    $("phHourly").querySelector(".sum24").innerHTML = "";
    $("phDays").querySelector(".days").innerHTML = "";
    $("phDetails").innerHTML = ""; $("phSky").innerHTML = ""; $("phGraph").hidden = true;
    return;
  }
  renderHours(); renderGraph(); renderDetails(); renderDays(); renderSky(); renderAurora(); skySig = "";
  loadAfd();
}

/* ---- forecast discussion (app build 24) ------------------------------------
   US only: the local National Weather Service office's Area Forecast
   Discussion - the forecasters' own write-up of what they expect and how
   sure they are. api.weather.gov/points gives the office (cwa), the product
   list gives the latest AFD's id, and the product gives its text. The text
   is cleaned up for reading: hard line breaks joined, old all-caps products
   put in sentence case, and the aviation / marine / fire / watches sections
   left out. Collapsed to the first section until tapped. */
const AFD_HDR = { headers: { "Accept": "application/geo+json" } };
const AFD_SKIP = /^(AVIATION|MARINE|FIRE WEATHER|HYDROLOGY|CLIMATE|TIDES|BEACHES|RIP CURRENTS|[A-Z]{3} WATCHES|.*WATCHES\/WARNINGS|PRELIMINARY POINT TEMPS|EQUIPMENT|PUBLIC INFORMATION)/;
let afdOpen = false, afdKey = "";
function afdJSON(url, maxAge){
  return cachedJSON(url, maxAge, u => fetch(u, AFD_HDR).then(r => r.ok ? r.json() : Promise.reject("HTTP " + r.status)));
}
function loadAfd(){
  const box = $("phAfd"), P = PLACE;
  if(String(P.cc || "").toUpperCase() !== "US"){ box.hidden = true; box.innerHTML = ""; afdKey = ""; return; }
  const key = P.lat.toFixed(3) + "," + P.lng.toFixed(3);
  if(key !== afdKey){ afdKey = key; afdOpen = false; }
  afdJSON("https://api.weather.gov/points/" + P.lat.toFixed(4) + "," + P.lng.toFixed(4), 24*3600000)
    .then(j => {
      const cwa = j && j.properties && j.properties.cwa;
      if(!cwa) throw "no office";
      return afdJSON("https://api.weather.gov/products/types/AFD/locations/" + cwa, 15*60000);
    })
    .then(j => {
      const list = (j && (j["@graph"] || j.features)) || [];
      const first = list[0] && (list[0].id || (list[0].properties && list[0].properties.id));
      if(!first) throw "no discussion";
      return afdJSON("https://api.weather.gov/products/" + first, 6*3600000);
    })
    .then(prod => {
      if(afdKey !== key) return;                     // moved on to another place meanwhile
      const a = parseAfd(prod.productText || "");
      if(!a.sections.length){ box.hidden = true; return; }
      a.at = prod.issuanceTime; a.office = a.office || prod.issuingOffice || "";
      drawAfd(box, a);
    })
    .catch(() => { if(afdKey === key){ box.hidden = true; box.innerHTML = ""; } });
}
/* AFD layout: header lines, then sections that each start with ".NAME..."
   and end with "&&"; "$$" ends the product. */
function parseAfd(txt){
  txt = txt.replace(/\r/g, "");
  const om = txt.match(/National Weather Service ([^\n]+)/i);
  const office = om ? om[1].trim() : "";
  let body = txt.split("$$")[0];
  const start = body.search(/^\.[A-Za-z][^\n]*?\.\.\./m);
  if(start < 0) return { office, sections: [] };
  body = body.slice(start);
  const sections = [];
  let pendingSub = "";
  for(const chunk of body.split(/\n&&\s*\n?/)){
    const parts = chunk.split(/^(?=\.[A-Za-z][^\n]*?\.\.\.)/m);
    for(const part of parts){
      const m = part.match(/^\.([^\n]*?)\.\.\.\s*([\s\S]*)$/);
      if(!m) continue;
      let name = m[1].trim(), sub = "";
      const sm = name.match(/^(.*?)\s*\/(.*)\/\s*$/);   // ".SHORT TERM /Tonight through Monday/..."
      if(sm){ name = sm[1]; sub = sm[2]; }
      if(AFD_SKIP.test(name.toUpperCase())) continue;
      let rest = m[2];
      const pm = rest.match(/^\s*\(([^)\n]{3,60})\)\s*/);    // ".SHORT TERM...(TONIGHT THROUGH MONDAY)"
      if(pm && !sub){ sub = pm[1]; rest = rest.slice(pm[0].length); }
      const paras = afdParas(rest);
      if(paras.length) sections.push({ name: afdTitle(name), sub: afdSub(sub), paras });
      else if(sub && sections.length === 0) pendingSub = sub;
    }
  }
  if(pendingSub && sections[0] && !sections[0].sub) sections[0].sub = afdSub(pendingSub);
  return { office: afdOffice(office), sections };
}
/* "TWIN CITIES/CHANHASSEN MN" -> "Twin Cities/Chanhassen MN" */
function afdOffice(o){
  if(o !== o.toUpperCase()) return o;
  return o.toLowerCase().replace(/(^|[\s\/-])([a-z])/g, (m, a, b) => a + b.toUpperCase())
          .replace(/\s([a-z]{2})$/i, (m, st) => " " + st.toUpperCase());
}
function afdSub(t){
  t = String(t || "").trim();
  if(!t) return "";
  if(t === t.toUpperCase()) t = afdSentence(t);
  return t;
}
function afdParas(t){
  const caps = (t.match(/[A-Z]/g) || []).length > 3*(t.match(/[a-z]/g) || []).length;
  const out = [];
  for(let blk of t.trim().split(/\n\s*\n/)){
    blk = blk.trim();
    if(!blk || /^issued at /i.test(blk) && blk.length < 60) continue;
    /* bullet lists stay one line per item; everything else is joined */
    const lines = blk.split("\n").map(l => l.trim());
    const items = [];
    for(const l of lines){
      if(/^([-*\u2022]|\d+\))\s/.test(l) || !items.length) items.push(l);
      else items[items.length - 1] += " " + l;
    }
    for(let it of items){
      it = it.replace(/\s+/g, " ").replace(/^issued at [^.]*\.\.\.\s*/i, "").trim();
      if(!it) continue;
      if(caps) it = afdSentence(it);
      out.push(it);
    }
  }
  return out;
}
function afdSentence(s){
  s = s.toLowerCase().replace(/(^|[.!?]\s+|^[-*]\s*)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  /* units, times and the usual short forms stay upper case */
  return s.replace(/\b(nws|cdt|cst|edt|est|mdt|mst|pdt|pst|akdt|akst|hst|utc|mph|kts?|vfr|mvfr|ifr|lifr|cape|pwats?|qpf|nbm|gfs|ecmwf|nam|hrrr|rap|cams|sref|gefs|eps|mcs|llj|h5|h7|h8|h85|h850|h500|caa|waa|tstms?|svr|wfo|spc|wpc|cpc|nd|sd|mn|wi|ia|ks|tx|nv|az|nm|wy|mt|ut|ky|tn|fl|ny|nj|i-\d+|\d+z)\b/gi, w => w.toUpperCase())
    .replace(/\bi\b/g, "I")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|minnesota|dakota|wisconsin|iowa|canada|manitoba|ontario|saskatchewan|red river|rockies|plains|great lakes|lake superior|lake michigan)\b/g,
             w => w.replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()));
}
function afdTitle(n){
  n = n.trim().toLowerCase();
  return n.charAt(0).toUpperCase() + n.slice(1);
}
function drawAfd(box, a){
  const when = a.at ? (() => {
    const z = zonedParts(new Date(a.at), PLACE.tz), now = zonedParts(new Date(), PLACE.tz);
    const same = z.year === now.year && z.month === now.month && z.day === now.day;
    return (same ? "" : new Date(a.at).toLocaleDateString(undefined, { weekday: "short", timeZone: PLACE.tz }) + " ") + fmtTime(z.hour*60 + z.minute);
  })() : "";
  const sec = (s, i) => '<div class="afdSec' + (i ? " more" : "") + '"><div class="afdH">' + esc(s.name) +
    (s.sub ? ' <span>' + esc(s.sub) + '</span>' : '') + '</div>' +
    s.paras.map(p => '<p' + (/^[-*\u2022]\s/.test(p) ? ' class="afdLi"' : '') + '>' + esc(p.replace(/^[-*\u2022]\s*/, "")) + '</p>').join("") + '</div>';
  box.innerHTML = '<h3>Forecast discussion <span class="tapHint">' + (afdOpen ? "tap to close" : "tap to read") + '</span></h3>' +
    '<div class="afdBy">NWS ' + esc(a.office) + (when ? ' &middot; ' + esc(when) : '') + '</div>' +
    '<div class="afd' + (afdOpen ? " open" : "") + '">' + a.sections.map(sec).join("") + '</div>';
  box.hidden = false;
  box.onclick = () => {
    afdOpen = !afdOpen;
    box.querySelector(".afd").classList.toggle("open", afdOpen);
    box.querySelector(".tapHint").textContent = afdOpen ? "tap to close" : "tap to read";
  };
}

/* "Township of Dovre" (how the phone's lookup names rural spots) reads as
   "Dovre Township"; names saved by build 2 as "Dovre Twp" are fixed too. */
function placeName(p){
  return String((p && (p.short || p.name)) || "")
    .replace(/^Township of (.+)$/i, "$1 Township").replace(/^(.+) Twp$/i, "$1 Township")
    .replace(/^(City|Town|Village|Borough) of /i, "");
}
/* ---- Updated + refresh (app build 42; Njord and the web app, not Free) ----
   When the forecast was fetched, and a tap to fetch it again now - skipping
   the 10-minute reuse, the saved station report and the aurora model. */
let phRefreshing = false, phRefreshT = 0;
function updatedLine(){
  if(FREE) return "";
  const at = WX_SRC === "cache" ? WX_SRC_AT : WX_FETCHED;
  if(!at) return "";
  const p = zonedParts(new Date(at), PLACE.tz);
  const age = Date.now() - at, day = age > 20*3600e3 ? new Date(at).toLocaleDateString([], { weekday: "short", timeZone: PLACE.tz }) + " " : "";
  return '<button class="hup' + (phRefreshing ? " spin" : "") + '" id="phUpd" aria-label="Refresh the forecast">' +
    (phRefreshing ? "Updating\u2026" : (WX_SRC === "cache" ? "Saved forecast from " : "Updated ") + esc(day + fmtTime(p.hour*60 + p.minute))) +
    '<svg viewBox="0 0 24 24" width="1.05em" height="1.05em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg></button>';
}
/* ---- source notice (app build 49) -----------------------------------------
   When the forecast service is down or behind, say so plainly - and say whose
   end it's on, so a NOAA outage doesn't read as Njord being broken.
     - forecast can't be had (and the phone is online) -> "usually NOAA's servers"
     - no network at all                                -> the connection
     - NOAA's newest forecast is over 6 hours old        -> NOAA is behind
   Worded softly (Aaran, build 49): "this usually happens when..." 
   Njord: Open-Meteo first, NOAA as backup. Free: NOAA only. */
function srcNotice(){
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  let t = "";
  if(WX_STATE === "offline" || WX_SRC === "cache"){
    const saved = WX && WX_SRC === "cache" && WX_SRC_AT
      ? " Showing the forecast saved at " + fmtTime((p => p.hour*60 + p.minute)(zonedParts(new Date(WX_SRC_AT), PLACE.tz))) + "." : "";
    if(offline) t = "No internet connection." + saved + " Njord keeps checking.";
    else t = "Forecast data is unavailable right now." + saved + " This usually happens when " +
             (FREE ? "NOAA's" : "the weather service's") + " servers aren't responding or are having an outage. Njord keeps checking.";
  } else if(WX && WX_SRC === "nws" && WX.issued && Date.now() - WX.issued > 6*3600e3){
    const p = zonedParts(new Date(WX.issued), PLACE.tz);
    const day = Date.now() - WX.issued > 20*3600e3 ? new Date(WX.issued).toLocaleDateString([], { weekday: "short", timeZone: PLACE.tz }) + " " : "";
    t = "The newest forecast NOAA has for this area is from " + day + fmtTime(p.hour*60 + p.minute) +
        ". This usually happens when NOAA's servers fall behind. Njord keeps checking.";
  } else if(!FREE && WX && WX_SRC === "om" && usPlace(PLACE) && /^failed/.test(NWS_STATE)){
    /* build 51: NOAA is Njord's forecast in the US; Open-Meteo stands in when it's down */
    t = "NOAA's forecast is unavailable right now, so this is from Njord's backup forecast source. Njord keeps checking.";
  } else if(!FREE && WX && WX_SRC === "nws" && !usPlace(PLACE)){
    t = "Our main forecast source is unavailable right now, so this is NOAA's forecast. Njord keeps checking.";
  }
  return t ? '<div class="srcNote" role="status">' + esc(t) + '</div>' : "";
}
function phRefresh(){
  if(FREE || phRefreshing) return;
  phRefreshing = true; render(true);
  try { STORE.set(wxCacheKey(), "null"); } catch(e){}
  try { JCACHE.clear(); } catch(e){}
  const before = WX_FETCHED;
  try { loadWeather(); } catch(e){}
  try { if(typeof resetAurora === "function"){ resetAurora(); loadAurora(); } } catch(e){}
  clearInterval(phRefreshT);
  const t0 = Date.now();
  phRefreshT = setInterval(() => {
    if(WX_FETCHED !== before || Date.now() - t0 > 20000){ clearInterval(phRefreshT); phRefreshing = false; render(true); }
  }, 250);
}
function renderHero(){
  const p = zonedParts(new Date(), PLACE.tz);
  const nm = placeName(PLACE);
  let h = '<div class="hti">' + esc(fmtTime(p.hour*60 + p.minute)) + '</div>' +
          '<div class="hn' + (nm.length > 22 ? ' xl' : nm.length > 14 ? ' l' : '') + '">' + (isHere(PLACE) ? '<span class="hpin" title="My location">' +
          '<svg viewBox="0 0 24 24" width="0.62em" height="0.62em" fill="currentColor"><path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.6" fill="#0b1630"/></svg></span>' : '') + esc(nm) + '</div>';
  if(!WX){
    h += '<div class="hc" style="margin-top:14px">' + (WX_STATE === "offline" ? "Weather unavailable — retrying shortly" : "Loading weather…") + '</div>' +
         (WX_STATE === "offline" ? srcNotice() : "");
  } else {
    const label = SCENE && SCENE.cls ? SCENE.cls.label : "";
    const d0 = WX.days && WX.days[0];
    let wind;
    if(WX.wind == null || WX.wind < 1) wind = "Calm";
    else wind = windArrowHTML(WX.dir, 15) + " " + WX.wind + " " + spdUnit() +
                (WX.dir != null ? " " + esc(compassAbbr(WX.dir)) : "") +
                (isGusty(WX.wind, WX.gust) ? ", gusts " + WX.gust : "");
    h += '<div class="ht">' + WX.temp + deg + '</div>' + alertPill() +
         '<div class="hc">' + esc(label) + '</div>' +
         '<div class="hs">Feels like ' + WX.feels + deg + (d0 ? '<span class="dotsep"></span>H ' + d0.hi + deg + '&ensp;L ' + d0.lo + deg : '') + '</div>' +
         '<div class="hs hwl">' + wind + '</div>' + updatedLine() + srcNotice();
  }
  $("phHero").innerHTML = h;
  mini.innerHTML = '<span class="mn">' + esc(placeName(PLACE)) + '</span>' +
    (WX ? '<span class="mt">' + WX.temp + deg + '</span><img alt="" src="' + icon(WX.code, SCENE && SCENE.dayness < 0.35) + '">' : "");
}
/* ---- weather alerts (US, National Weather Service) ------------------------- */
/* The tag follows the National Weather Service's own ladder - Warning (it is
   happening or about to), Watch (conditions are favourable), Advisory (less
   serious) - read from the alert's name. NWS also sends a separate
   "severity" (threat to life or PROPERTY, which for frost includes crops), so
   a Freeze Watch arrives marked "Severe"; that number is kept for the detail
   page only. A warning NWS marks Extreme (e.g. Tornado Warning) stays red
   with an EXTREME tag. */
function sevOf(a){
  const ev = String(a.event || "");
  if(/warning$/i.test(ev)) return a.severity === "Extreme" ? ["EXTREME","ex"] : ["WARNING","sv"];
  if(/watch$/i.test(ev)) return ["WATCH","md"];
  if(/advisory$/i.test(ev)) return ["ADVISORY","mn"];
  if(/emergency$/i.test(ev)) return ["EMERGENCY","ex"];
  return ["STATEMENT","un"];
}
function untilText(iso){
  const t = Date.parse(iso || "");
  if(!isFinite(t)) return "";
  const a = zonedParts(new Date(t), PLACE.tz), n = zonedParts(new Date(), PLACE.tz);
  const same = a.year === n.year && a.month === n.month && a.day === n.day;
  const day = same ? "" : DOW[new Date(Date.UTC(a.year, a.month - 1, a.day)).getUTCDay()] + " ";
  return "until " + day + fmtTime(a.hour*60 + a.minute);
}
function alertPill(){
  if(!ALERTS.length) return "";
  const a = ALERTS[0], sv = sevOf(a), u = untilText(a.expires);
  return '<div class="halert ' + sv[1] + '" id="phAlertPill"><span class="atag">' + sv[0] + '</span><span class="aev">' + esc(a.event) +
         (u ? ' <span class="auntil">' + esc(u) + '</span>' : "") + '</span>' +
         (ALERTS.length > 1 ? '<span class="amore">+' + (ALERTS.length - 1) + '</span>' : "") + '<span class="achev">&rsaquo;</span></div>';
}
function openAlerts(){
  if(!ALERTS.length) return;
  const para = t => esc(String(t || "").trim()).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, " ");
  alertSheet.innerHTML = '<div class="asHead"><b>Weather alerts</b><button id="phAlertClose" aria-label="Close">Done</button></div>' +
    ALERTS.map(a => {
      const sv = sevOf(a), u = untilText(a.expires);
      return '<section class="asItem ' + sv[1] + '"><div class="asTop"><span class="atag">' + sv[0] + '</span><b>' + esc(a.event) + '</b></div>' +
        (u ? '<div class="asWhen">' + esc(capFirst(u)) + '</div>' : "") +
        (a.severity ? '<div class="asWhen">NWS severity: ' + esc(a.severity) + (a.certainty ? ' &middot; certainty: ' + esc(a.certainty) : "") + '</div>' : "") +
        (a.headline ? '<p class="asHl">' + esc(a.headline) + '</p>' : "") +
        (a.description ? '<p>' + para(a.description) + '</p>' : "") +
        (a.instruction ? '<h4>What to do</h4><p>' + para(a.instruction) + '</p>' : "") +
        (a.area ? '<h4>Area</h4><p class="asArea">' + esc(a.area) + '</p>' : "") +
        '<div class="asSrc">' + esc(a.sender || "National Weather Service") + '</div></section>';
    }).join("") + '<div class="asFoot">From the National Weather Service. Njord Weather is not affiliated with NOAA or the NWS.</div>';
  alertSheet.hidden = false; mini.classList.remove("on");
  alertSheet.scrollTop = 0;
  $("phAlertClose").addEventListener("click", closeAlerts);
}
function closeAlerts(){ alertSheet.hidden = true; ph.dispatchEvent(new Event("scroll")); }

function compassAbbr(d){
  const A = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return "from " + A[Math.round(norm360(d)/22.5) % 16];
}

function nightAt(min){
  const ev = SUNEV;
  if(!ev) return false;
  if(ev.alwaysUp) return false;
  if(ev.alwaysDown) return true;
  const r = ev.rise != null ? ev.rise : 360, st = ev.set != null ? ev.set : 1140;
  return min < r || min > st;
}
/* ---- amounts under each hour -----------------------------------------------
   Rain hours show the rain, snow hours the snow depth, and hours with both
   (wet snow near freezing) show the rain with the snow under it. Freezing
   rain is marked "ice", since its water freezes on whatever it hits. */
const ICE_CODES = { 56:1, 57:1, 66:1, 67:1 };
const metricAmt = () => CONFIG.units !== "imperial";
const LIQ_MIN = () => metricAmt() ? 0.1 : 0.01;      // mm / in
const SNOW_MIN = () => metricAmt() ? 0.1 : 0.1;      // cm / in
function amounts(h){
  const ice = !!ICE_CODES[h.code];
  const liq = h.rain != null ? h.rain : null, snow = h.snow != null ? h.snow : 0;
  const hasLiq = liq != null && liq >= LIQ_MIN(), hasSnow = snow >= SNOW_MIN();
  return { ice, liq: hasLiq ? liq : 0, snow: hasSnow ? snow : 0, mixed: hasLiq && hasSnow };
}
function fmtLiq(v){
  if(metricAmt()) return (v < 10 ? v.toFixed(1) : Math.round(v)) + " mm";
  return v.toFixed(2).replace(/^0/, "") + "″";
}
function fmtSnow(v){
  if(metricAmt()) return (v < 10 ? v.toFixed(1) : Math.round(v)) + " cm";
  return v.toFixed(1) + "″";
}
const FLAKE = '<svg class="fl" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M5 .5v9M1.1 2.75l7.8 4.5M1.1 7.25l7.8-4.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
function amtLines(h){
  const a = amounts(h);
  const liq = a.liq ? '<span class="' + (a.ice ? "ice" : "rn") + '">' + fmtLiq(a.liq) + (a.ice ? " ice" : "") + "</span>" : "";
  const snow = a.snow ? '<span class="sn">' + FLAKE + fmtSnow(a.snow) + "</span>" : "";
  return a.mixed ? [liq, snow] : [liq || snow, ""];
}

function renderHours(){
  const hs = WX.hours || [];
  const p = zonedParts(new Date(), PLACE.tz);
  const key = p.year + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour);
  let i0 = hs.findIndex(h => String(h.time).slice(0, 13) === key);
  if(i0 < 0) i0 = 0;
  const win = hs.slice(i0, i0 + 25);
  /* the second amount line is there for every hour or none, so the strip
     never changes height as you scroll it */
  const two = win.some(h => amounts(h).mixed);
  const out = [];
  const ev = SUNEV || {};
  const blank = '<div class="a"></div>' + (two ? '<div class="a"></div>' : "");
  for(let i = i0; i < Math.min(hs.length, i0 + 25); i++){
    const h = hs[i], hr = +String(h.time).slice(11, 13);
    const now = i === i0;
    const pop = h.pop != null && h.pop >= 20 ? Math.round(h.pop/10)*10 + "%" : "";
    const [l1, l2] = amtLines(h);
    out.push('<div class="hr' + (now ? " now" : "") + '"><div class="t">' + (now ? "Now" : esc(shortTime(hr*60))) +
             '</div><img alt="" src="' + icon(h.code, nightAt(hr*60 + 30)) + '"><div class="v">' + h.temp + deg + '</div>' +
             '<div class="p">' + pop + '</div><div class="a">' + l1 + '</div>' + (two ? '<div class="a">' + l2 + '</div>' : "") + '</div>');
    for(const [t, label] of [[ev.rise, "Sunrise"], [ev.set, "Sunset"]]){
      if(t == null || i === i0 + 24) continue;
      if(t >= hr*60 && t < (hr + 1)*60 && (!now || t > p.hour*60 + p.minute)){
        out.push('<div class="hr sun"><div class="t">' + esc(shortTime(t)) + '</div><img alt="" src="' +
                 icon(0, false) + '"><div class="v" style="font-size:12.5px">' + label + '</div><div class="p"></div>' + blank + '</div>');
      }
    }
  }
  $("phHourly").querySelector(".hrs").innerHTML = out.join("");
  let txt = "";
  try { txt = summary24(win); } catch(e){ txt = ""; }
  $("phHourly").querySelector(".sum24").innerHTML = txt;
}

/* ---- one or two sentences over the hourly strip ----------------------------
   What falls, when, how it changes, and how much, for the next 24 hours. */
function kindOf(h){
  const w = wmo(h.code), a = amounts(h);
  if(a.ice || w.precip === "sleet") return "ice";
  if(a.mixed) return "mix";
  if(a.snow) return "snow";
  if(a.liq) return w.precip === "snow" ? "mix" : "rain";
  if(w.precip === "snow") return "snow";
  return "rain";
}
function rainWord(list){
  if(list.some(h => wmo(h.code).thunder)) return "showers and thunderstorms";
  if(list.every(h => wmo(h.code).precip === "drizzle")) return "drizzle";
  if(list.filter(h => h.code >= 80 && h.code <= 82).length > list.length/2) return "showers";
  return "rain";
}
function kindWord(k, list){
  if(k === "ice") return list.some(h => h.code === 66 || h.code === 67) ? "freezing rain" : "freezing drizzle";
  if(k === "snow") return list.some(h => h.code === 85 || h.code === 86) ? "snow showers" : "snow";
  if(k === "mix") return "a rain and snow mix";
  return rainWord(list);
}
function sumWet(h){
  const w = wmo(h.code), a = amounts(h);
  if(w.precip === "fog") return false;
  if(h.pop != null && h.pop < 30) return false;
  return !!w.precip || a.liq > 0 || a.snow > 0;
}
function snowRange(t){
  const u = metricAmt() ? " cm" : "″";
  if(metricAmt()){
    if(t < 1) return "less than a centimetre of snow";
    if(t < 3) return "1–3 cm of snow";
    const lo = Math.floor(t/2)*2; return lo + "–" + (lo + 3) + u + " of snow";
  }
  if(t < 0.5) return "a dusting of snow";
  if(t < 1) return "under an inch of snow";
  const lo = Math.floor(t); return lo + "–" + (lo + 1) + u + " of snow";
}
function liqWords(t, what){
  if(metricAmt()){
    if(t < 1) return "under 1 mm of " + what;
    return "about " + Math.round(t) + " mm of " + what;
  }
  if(t < 0.05) return "under a twentieth of an inch of " + what;
  if(t < 0.1) return "under a tenth of an inch of " + what;
  return "about " + (Math.round(t*20)/20).toFixed(2).replace(/0$/, "") + "″ of " + what;
}
function summary24(win){
  if(!win.length) return "";
  const hrOf = h => +String(h.time).slice(11, 13);
  const at = h => shortTime(hrOf(h)*60).replace(" ", "\u00a0");   // keep "11 AM" on one line
  const wet = win.filter(sumWet);
  const maxPop = Math.max(0, ...win.map(h => h.pop || 0));
  if(!wet.length){
    if(maxPop >= 20){
      const top = win.reduce((a, h) => (h.pop || 0) > (a.pop || 0) ? h : a, win[0]);
      const k = wmo(top.code).precip === "snow" ? "snow" : "showers";
      return "Mostly dry, with a slight chance of " + k + " around " + at(top) + ".";
    }
    return "No precipitation expected in the next 24 hours.";
  }
  /* split the wet hours into runs of one kind; a mixed hour between rain and
     snow is the changeover, not its own run */
  const runs = [];
  for(const h of wet){
    const k = kindOf(h), last = runs[runs.length - 1];
    if(last && last.k === k) last.hrs.push(h);
    else runs.push({ k, hrs: [h] });
  }
  const main = runs.filter(r => r.k !== "mix" || runs.length === 1);
  const first = wet[0], last = wet[wet.length - 1];
  const startsNow = first === win[0] || first === win[1];
  const runsOut = last === win[win.length - 1] || last === win[win.length - 2];
  const c = maxPop >= 70 || maxPop === 0 ? " likely" : maxPop >= 40 ? " possible" : null;
  const span = startsNow ? (runsOut ? " through the next 24 hours" : " until about " + at(last))
                         : (runsOut ? " from about " + at(first) + " on" : " from about " + at(first) + " to " + at(last));
  let s;
  const kinds = [];
  for(const r of main) if(!kinds.length || kinds[kinds.length - 1].k !== r.k) kinds.push(r);
  if(kinds.length >= 2){
    const a = kinds[0], b = kinds[1];
    const turn = runs.find(r => r.k === "mix") ? runs.find(r => r.k === "mix").hrs[0] : b.hrs[0];
    s = cap(kindWord(a.k, a.hrs)) + (startsNow ? " now" : " from about " + at(first)) +
        ", changing to " + kindWord(b.k, b.hrs) + " around " + at(turn) + ".";
  } else {
    const k = kinds[0];
    s = c ? cap(kindWord(k.k, k.hrs)) + c + span + "."
          : "A chance of " + kindWord(k.k, k.hrs) + span + ".";
  }
  /* totals */
  let rainT = 0, iceT = 0, snowT = 0, have = false;
  for(const h of win){
    if(h.rain == null && h.snow == null) continue;
    have = true;
    const a = amounts(h);
    if(a.ice) iceT += a.liq; else rainT += a.liq;
    snowT += a.snow;
  }
  if(have){
    const bits = [];
    if(rainT >= LIQ_MIN()) bits.push(liqWords(rainT, "rain"));
    if(iceT >= LIQ_MIN()) bits.push(liqWords(iceT, "ice").replace(/^about /, "up to "));
    if(snowT >= SNOW_MIN()) bits.push(snowRange(snowT));
    if(bits.length){
      let t = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(", ") + (bits.length === 2 ? ", then " : ", and ") + bits[bits.length - 1];
      s += " " + cap(t) + ".";
    }
  }
  return s;
}

/* ---- the written forecast for one day ---------------------------------------- */
const SKY_DAY = { clear:"sunny", few:"mostly sunny", scattered:"partly sunny", overcast:"cloudy" };
const SKY_NIGHT = { clear:"clear", few:"mostly clear", scattered:"partly cloudy", overcast:"cloudy" };
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function hoursOn(date){
  return (WX.hours || []).filter(h => String(h.time).slice(0, 10) === date)
    .map(h => Object.assign({ hr: +String(h.time).slice(11, 13) }, h));
}
const wetHour = h => { const w = wmo(h.code); return !!w.precip && w.precip !== "fog" && (h.pop == null || h.pop >= 30); };
function skyWord(list, night){
  const n = {};
  for(const h of list){ const s = wmo(h.code).sky; n[s] = (n[s] || 0) + 1; }
  const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0] || "overcast";
  return (night ? SKY_NIGHT : SKY_DAY)[best] || "cloudy";
}
function precipWords(code){
  const w = wmo(code);
  if(w.thunder) return code >= 96 ? "thunderstorms with hail" : "thunderstorms";
  return w.label.toLowerCase();
}
function when(wet){
  const first = wet[0].hr, last = wet[wet.length - 1].hr;
  const part = h => h < 6 ? "overnight" : h < 12 ? "the morning" : h < 17 ? "the afternoon" : h < 21 ? "the evening" : "late evening";
  if(wet.length >= 14) return "through much of the day";
  if(last < 12) return first < 6 ? "overnight into the morning" : "in the morning";
  if(first >= 12 && last < 17) return "in the afternoon";
  if(first >= 17) return "in the evening";
  if(first >= 12) return "from the afternoon on";
  return "from " + part(first) + " into " + part(last);
}
function chance(pop){ return pop == null ? " likely" : pop >= 70 ? " likely" : pop >= 40 ? " possible" : null; }
function amountWords(d, kind){
  if(d.amt == null || d.amt <= 0 || kind === "snow") return "";
  if(CONFIG.units === "imperial"){
    if(d.amt < 0.1) return " Less than a tenth of an inch expected.";
    return " Around " + (Math.round(d.amt*20)/20).toFixed(2).replace(/0$/, "") + " in. expected.";
  }
  if(d.amt < 2) return " Less than 2 mm expected.";
  return " Around " + Math.round(d.amt) + " mm expected.";
}
function windWords(list, d){
  const ws = list.map(h => h.wind).filter(v => v != null);
  const hi = d.wind != null ? d.wind : (ws.length ? Math.max(...ws) : null);
  if(hi == null) return "";
  if(windMPH(hi) < (CONFIG.units === "imperial" || windMS() ? 4 : 2.5)) return " Light winds.";
  const lo = ws.length ? Math.min(...ws) : hi;
  const dir = d.dir != null ? d.dir : (list.find(h => h.dir != null) || {}).dir;
  const from = dir != null ? cap(compassWords(dir)) + " wind " : "Wind ";
  const range = hi - lo <= (windMS() ? 1 : 3) ? "around " + hi : lo + " to " + hi;
  const gust = isGusty(hi, d.gust) ? ", with gusts up to " + d.gust + " " + spdUnit() : "";
  return " " + from + range + " " + spdUnit() + gust + ".";
}
/* "Tuesday" for the day's heading; today stays "Today" / "Tonight" */
function weekdayName(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if(!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}
function nightWhen(wet, n){
  if(wet.length >= n*0.7) return "through the night";
  if(wet.every(h => h.hr >= 18)) return "in the evening";
  if(wet.every(h => h.hr < 12)) return "after midnight";
  return "overnight";
}
/* sky and precipitation for one part (day 6 am-6 pm, or night 6 pm-6 am) */
function partSky(list, night){
  const wet = list.filter(wetHour);
  if(wet.length){
    const code = wet.reduce((a, h) => CODE_RANK(h.code) > CODE_RANK(a) ? h.code : a, wet[0].code);
    const pops = list.map(h => h.pop).filter(v => v != null);
    const c = chance(pops.length ? Math.max(...pops) : null);
    const w = night ? nightWhen(wet, list.length) : when(wet);
    let s = c ? cap(precipWords(code)) + c + " " + w + "."
              : "A slight chance of " + precipWords(code) + " " + w + ".";
    const dry = list.filter(h => !wetHour(h));
    if(dry.length >= 4 && wet.length < list.length*0.8) s += " Otherwise " + skyWord(dry, night) + ".";
    return s;
  }
  const fog = list.filter(h => h.code === 45 || h.code === 48);
  if(fog.length >= 3){
    const rest = list.filter(h => h.code !== 45 && h.code !== 48);
    return (fog.some(h => h.code === 48) ? "Freezing fog" : "Fog") +
           (rest.length >= 3 ? (night ? ", otherwise " : ", then ") + skyWord(rest, night) : "") + ".";
  }
  return cap(skyWord(list, night)) + ".";
}
/* wind, chance and amount for one part, from its hours */
function partExtras(list, fallback){
  const winds = list.filter(h => h.wind != null);
  const top = winds.length ? winds.reduce((a, h) => h.wind > a.wind ? h : a) : null;
  const gusts = list.map(h => h.gust).filter(v => v != null);
  const pd = top ? { wind: top.wind, dir: top.dir, gust: gusts.length ? Math.max(...gusts) : null } : fallback;
  let s = windWords(list, pd);
  const pops = list.map(h => h.pop).filter(v => v != null);
  const pop = pops.length ? Math.max(...pops) : fallback.pop;
  if(pop != null && pop >= 20){
    s += " Chance of precipitation " + Math.round(pop) + "%.";
    const amts = list.map(h => h.amt).filter(v => v != null);
    const wet = list.filter(wetHour);
    const kind = wet.length ? wmo(wet[0].code).precip : wmo(fallback.code).precip;
    s += amountWords({ amt: amts.length ? amts.reduce((a, b) => a + b, 0) : fallback.amt }, kind);
  }
  return s;
}
/* The written forecast for a day, in two parts like the Weather Service:
   "Tuesday: ..." (6 am-6 pm, with the high) and "Tuesday night: ..."
   (6 pm-6 am, with the low). Today drops its daytime part once the day is
   over (6 pm, or after sunset from 3 pm) and shows only tonight. */
function dayText(i){
  const days = WX.days, d = days[i];
  const all = hoursOn(d.date);
  const next = days[i + 1] ? hoursOn(days[i + 1].date) : [];
  const dayHrs = all.filter(h => h.hr >= 6 && h.hr < 18);
  let nightFrom = 18, evening = false;
  if(i === 0){
    const p = zonedParts(new Date(), PLACE.tz);
    const sunDown = SCENE && SCENE.sun && SCENE.sun.alt < -0.833;
    evening = p.hour >= 18 || (p.hour >= 15 && sunDown);
    nightFrom = Math.max(18, p.hour);
  }
  const nightHrs = all.filter(h => h.hr >= nightFrom).concat(next.filter(h => h.hr < 6));
  const dayName = i === 0 ? "Today" : weekdayName(d.date);
  const nightName = i === 0 ? "Tonight" : dayName + " night";
  const parts = [];

  if(!evening){
    let s = dayHrs.length ? partSky(dayHrs, false) : cap(wmo(d.code).label.toLowerCase()) + ".";
    let hiTxt = " High " + d.hi + deg;
    if(i > 0){
      const diff = d.hi - days[i - 1].hi, prev = i - 1 === 0 ? "today" : weekdayName(days[i - 1].date);
      if(diff >= 8) hiTxt += ", much warmer than " + prev;
      else if(diff >= 4) hiTxt += ", warmer than " + prev;
      else if(diff <= -8) hiTxt += ", much colder than " + prev;
      else if(diff <= -4) hiTxt += ", cooler than " + prev;
    }
    s += hiTxt + ".";
    s += dayHrs.length ? partExtras(dayHrs, d) : partExtras([], d);
    parts.push("<b>" + esc(dayName) + ":</b> " + s);
  }
  if(nightHrs.length >= 4){
    const lo = Math.min(...nightHrs.map(h => h.temp));
    const s = partSky(nightHrs, true) + " Low around " + lo + deg + "." +
              partExtras(nightHrs, { pop: null, amt: null, code: d.code });
    parts.push("<b>" + esc(nightName) + ":</b> " + s);
  } else if(!parts.length){
    parts.push("<b>" + esc(dayName) + ":</b> High " + d.hi + deg + ". Low " + d.lo + deg + ".");
  }
  return parts.join("<br><br>");
}

/* ---- national holidays (Nager.Date: free, no key, many countries) ----------
   One small request per country per year, saved on the phone for 30 days,
   since holiday lists don't change. Only nationwide public holidays are kept. */
const HOL = {};
function holidaysFor(cc, year){
  if(!cc) return null;
  const key = "njord.hol.v1:" + year + ":" + cc;
  if(HOL[key] !== undefined) return HOL[key];
  try {
    const c = JSON.parse(STORE.get(key) || "null");
    if(c && Date.now() - c.at < 30*86400e3){ HOL[key] = c.list; return c.list; }
  } catch(e){}
  HOL[key] = null;                                   // in flight
  fetch("https://date.nager.at/api/v3/PublicHolidays/" + year + "/" + cc)
    .then(r => r.status === 204 ? [] : r.ok ? r.json() : Promise.reject(r.status))
    .then(j => {
      const list = (Array.isArray(j) ? j : [])
        .filter(h => h.global !== false && (!h.types || h.types.indexOf("Public") >= 0))
        .map(h => ({ date: h.date, name: h.name, local: h.localName }));
      HOL[key] = list;
      STORE.set(key, JSON.stringify({ at: Date.now(), list }));
      if(WX) renderDays();
    })
    .catch(() => { HOL[key] = []; });
  return null;
}
function holidaysOn(iso){
  const cc = PLACE.cc ? String(PLACE.cc).toUpperCase() : null, y = +String(iso).slice(0, 4);
  const list = holidaysFor(cc, y) || [];
  return list.filter(h => h.date === iso);
}
function longDate(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if(!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US",
    { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function renderDays(){
  const days = (WX.days || []).slice(0, 10);
  if(!days.length){ $("phDays").querySelector(".days").innerHTML = ""; return; }
  let lo = Math.min(...days.map(d => d.lo)), hi = Math.max(...days.map(d => d.hi));
  if(WX.temp != null){ lo = Math.min(lo, WX.temp); hi = Math.max(hi, WX.temp); }
  if(hi - lo < 6){ const c = (hi + lo)/2; lo = c - 3; hi = c + 3; }
  const pct = t => ((t - lo)/(hi - lo)*100).toFixed(1);
  const col = t => rgba(tempColor(t), 1);
  $("phDays").querySelector(".days").innerHTML = days.map((d, i) => {
    const pop = d.pop != null && d.pop >= 10 ? Math.round(d.pop) + "%" : "";
    const a = pct(d.lo), b = pct(d.hi);
    const dot = i === 0 && WX.temp != null ? '<b style="left:' + pct(WX.temp) + '%"></b>' : "";
    let text = "", storm = null;
    try { text = dayText(i); } catch(e){ text = "No written forecast for this day."; }
    try { storm = CONFIG.showAurora ? stormForDay(d.date) : null; } catch(e){}
    if(storm){ const t = auroraPopupText({ i, st: storm, date: d.date }); text += '<div class="aurTxt"><b>' + esc(t.head) + '</b> ' + esc(t.body) + '</div>'; }
    const hols = holidaysOn(d.date);
    text = '<div class="fxDate">' + esc(longDate(d.date)) + '</div>' +
           (hols.length ? '<div class="fxHols">' + hols.map(h => '<div class="fxHol">' + esc(h.name) +
             (h.local && h.local !== h.name ? ' <span>(' + esc(h.local) + ')</span>' : '') + '</div>').join("") + '</div>' : '') +
           text;
    return '<div class="dwrap' + (i === openDay ? " open" : "") + '" data-d="' + i + '"><div class="dy"><div class="n">' +
           esc(cardLabel(i, d.date)) + (storm ? '<span class="aurBadge">!</span>' : '') + '</div><img alt="" src="' + icon(d.code, false) +
           '"><div class="p">' + pop + '</div><div class="lo">' + d.lo + deg + '</div>' +
           '<div class="bar"><i style="left:' + a + '%;width:' + Math.max(2, b - a).toFixed(1) + '%;background:linear-gradient(90deg,' +
           col(d.lo) + ',' + col(d.hi) + ')"></i>' + dot + '</div><div class="hi">' + d.hi + deg + '</div></div>' +
           '<div class="fx">' + text + '</div></div>';
  }).join("");
}
/* Magnus formula; good to a fraction of a degree in normal weather */
function dewPoint(t, rh){
  if(t == null || !rh) return null;
  const imp = CONFIG.units === "imperial", c = imp ? (t - 32)*5/9 : t;
  const g = Math.log(rh/100) + 17.62*c/(243.12 + c), d = 243.12*g/(17.62 - g);
  return Math.round(imp ? d*9/5 + 32 : d);
}
function card(title, big, sub){
  return '<section class="pc"><h3>' + title + '</h3><div class="big">' + big + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : "") + '</section>';
}
function renderDetails(){
  const html = [];
  html.push(card("Feels like", WX.feels + deg, "Actual " + WX.temp + deg));
  const dp = dewPoint(WX.temp, WX.humid);
  html.push(card("Humidity", (WX.humid != null ? WX.humid + "%" : "&ndash;"), dp != null ? "Dew point " + dp + deg : ""));
  if(WX.wind == null || WX.wind < 1) html.push(card("Wind", "Calm", ""));
  else {
    html.push(card("Wind", WX.wind + ' <span style="font-size:15px">' + spdUnit() + "</span>" + windArrowHTML(WX.dir, 18),
      esc(windDesc(WX.wind)) + (WX.dir != null ? ", from the " + esc(compassWords(WX.dir)) : "") +
      (isGusty(WX.wind, WX.gust) ? "<br>Gusts to " + WX.gust + " " + spdUnit() : "")));
  }
  const d0 = WX.days && WX.days[0];
  if(d0){
    const amt = d0.amt != null && d0.amt > 0 ? (CONFIG.units === "imperial" ? d0.amt.toFixed(2) + " in" : d0.amt.toFixed(1) + " mm") + " expected" : "None expected";
    html.push(card("Precipitation", (d0.pop != null ? Math.round(d0.pop) : 0) + "%", "Chance today<br>" + amt));
  }
  /* build 57: UV (EPA) and tides (NOAA CO-OPS) sit before
     pressure and visibility so Visibility's wide-last-row rule still holds; each loads on its own and
     stays hidden until it has data or when the service can't be reached */
  if(CONFIG.cardUV){ loadUV(); const c = uvCard(); if(c) html.push(c); }
  if(CONFIG.cardTide){ loadTide(); const c = tideCard(); if(c) html.push(c); }
  /* build 52: pressure and visibility, from the nearest station's latest report */
  const pv = OBS_PV, metric = CONFIG.units !== "imperial";
  if(CONFIG.cardPress && pv && pv.hpa != null){
    const val = metric ? Math.round(pv.hpa) + ' <small>hPa</small>' : (pv.hpa*0.02953).toFixed(2) + ' <small>in</small>';
    let trend = "";
    if(pv.trend != null){
      const d = pv.trend, amt = metric ? Math.abs(d).toFixed(1) + " hPa" : Math.abs(d*0.02953).toFixed(2) + " in";
      trend = Math.abs(d) < 0.6 ? "→ Steady over 3 hrs"
            : (d < 0 ? "↓ Falling" : "↑ Rising") + (Math.abs(d) >= 3 ? " fast" : "") + ", " + amt + " over 3 hrs";
      if(d <= -3) trend += "<br>Unsettled weather likely";
      else if(d >= 3) trend += "<br>Often clearing behind a storm";
    }
    html.push('<section class="pc"><h3>Pressure</h3><div class="big">' + val + '</div>' + pressSpark(pv.hist) +
              '<div class="sub">' + (trend || "No 3-hour change reported") + '</div></section>');
  }
  if(CONFIG.cardVis && pv && pv.visM != null){
    const mi = pv.visM/1609.344, km = pv.visM/1000;
    const v = metric ? (km >= 10 ? Math.round(km) : km.toFixed(1).replace(/\.0$/, "")) + ' <small>km</small>'
                     : (mi >= 9.5 ? "10+" : mi >= 3 ? Math.round(mi) : (Math.round(mi*4)/4).toString()) + ' <small>mi</small>';
    const frac = Math.max(0.03, Math.min(1, mi/10));
    const tt = zonedParts(new Date(pv.t), PLACE.tz);
    /* build 55: when it would sit alone on the last row it spans both
       columns, with the reading and bar on one line and the note under it */
    const wide = html.length % 2 === 0;
    html.push('<section class="pc pcVis' + (wide ? ' wide' : '') + '"><h3>Visibility</h3>' +
              '<div class="vrow"><div class="big">' + v + '</div>' +
              '<div class="vbar"><i style="width:' + Math.round(frac*100) + '%"></i></div></div>' +
              '<div class="sub">' + (pv.text ? esc(pv.text) + (wide ? " &middot; " : "<br>") : "") + 'Measured ' + esc(shortTime(tt.hour*60 + tt.minute)) +
              ' at ' + esc(pv.name || pv.id) + '</div></section>');
  }
  $("phDetails").innerHTML = html.join("");
}
/* the last few hours of pressure as a small line, newest at the right */
function pressSpark(h){
  if(!h || h.length < 3) return "";
  const t0 = h[0].t, t1 = h[h.length - 1].t, lo = Math.min(...h.map(x => x.hpa)), hi = Math.max(...h.map(x => x.hpa));
  const span = Math.max(hi - lo, 2), mid = (hi + lo)/2;
  const pts = h.map(x => [((x.t - t0)/Math.max(1, t1 - t0))*96 + 2, 26 - ((x.hpa - (mid - span/2))/span)*22]);
  const last = pts[pts.length - 1];
  return '<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="' + pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") +
         '" fill="none" stroke="#90c3f2" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
         '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.6" fill="#fbfcfe"/></svg>';
}

/* ---- UV and tides (app build 57) ------------------------------------------
   UV      EPA Envirofacts hourly UV Index forecast (with NWS), US only. Looked
           up by ZIP, or by city and state when the ZIP isn't known; both come
           from the reverse geocoder the app already uses.
   Tides   NOAA CO-OPS high/low predictions from the nearest prediction station
           within 40 km. The station list ships in the app (tide-stations.json,
           built in CI by tools/build_tide_stations.py). Times come back in the
           station's local time, which is the place's time zone this close. */
const EXT = { gen: 0, uv: null, uvKey: "", tide: null, tideKey: "" };
let TIDE_ST = null;
/* only the detail cards redraw when UV or tides arrive, so the hourly strip keeps its scroll */
function extDone(){ EXT.gen++; try { if(WX && isPhone()) renderDetails(); } catch(e){} }
function kmTo(lat1, lng1, lat2, lng2){
  const r = Math.PI/180, a = Math.sin((lat2 - lat1)*r/2)**2 +
            Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin((lng2 - lng1)*r/2)**2;
  return 12742*Math.asin(Math.sqrt(a));
}
const p2 = n => String(n).padStart(2, "0");
function placeYMD(){ const t = zonedParts(new Date(), PLACE.tz); return { t, ymd: t.year + p2(t.month) + p2(t.day),
                     stamp: t.year + "-" + p2(t.month) + "-" + p2(t.day) + " " + p2(t.hour) + ":" + p2(t.minute) }; }

function loadUV(){
  const k = placeKey() + "@" + placeYMD().ymd;
  if(EXT.uvKey === k) return;
  EXT.uvKey = k; EXT.uv = null;
  if(PLACE.cc && PLACE.cc !== "US") return;
  const lat = PLACE.lat.toFixed(4), lng = PLACE.lng.toFixed(4);
  cachedJSON("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en&latitude=" + lat + "&longitude=" + lng, 24*3600e3)
    .then(g => {
      if(!g || g.countryCode !== "US") return null;
      const zip = /^\d{5}/.test(g.postcode || "") ? g.postcode.slice(0, 5) : "";
      const st = g.principalSubdivisionCode ? g.principalSubdivisionCode.split("-").pop() : "";
      const city = g.city || g.locality || "";
      const base = "https://data.epa.gov/efservice/getEnvirofactsUVHOURLY/";
      const byCity = city && st ? base + "CITY/" + encodeURIComponent(city) + "/STATE/" + st + "/JSON" : "";
      const get = u => cachedJSON(u, 3*3600e3).then(rows => Array.isArray(rows) && rows.length ? rows : Promise.reject("no rows"));
      return (zip ? get(base + "ZIP/" + zip + "/JSON") : Promise.reject("no zip"))
        .catch(() => byCity ? get(byCity) : null);
    })
    .then(rows => {
      if(EXT.uvKey !== k || !rows) return;
      const M = { JAN:1, FEB:2, MAR:3, APR:4, MAY:5, JUN:6, JUL:7, AUG:8, SEP:9, OCT:10, NOV:11, DEC:12 };
      const hrs = [];
      rows.forEach(r => {
        const o = {}; Object.keys(r).forEach(x => o[x.toLowerCase()] = r[x]);
        const m = /([A-Za-z]{3})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})\s*(AM|PM)/i.exec(o.date_time || "");
        const v = parseFloat(o.uv_value);
        if(!m || !isFinite(v)) return;
        let h = +m[4] % 12; if(m[5].toUpperCase() === "PM") h += 12;
        hrs.push({ ymd: m[3] + p2(M[m[1].toUpperCase()] || 0) + p2(+m[2]), h, v });
      });
      if(hrs.length){ EXT.uv = hrs; extDone(); }
    })
    .catch(() => {});
}
function uvCard(){
  const hrs = EXT.uv; if(!hrs) return "";
  const { t, ymd } = placeYMD();
  const today = hrs.filter(x => x.ymd === ymd);
  if(!today.length) return "";
  const cat = v => v < 3 ? "Low" : v < 6 ? "Moderate" : v < 8 ? "High" : v < 11 ? "Very high" : "Extreme";
  const nowH = today.find(x => x.h === t.hour);
  const now = nowH ? nowH.v : 0;
  const peak = today.reduce((a, b) => b.v > a.v ? b : a);
  const after = t.hour > peak.h;
  const sub = peak.v < 1 ? "Low all day" :
              (after ? "Peaked at " : "Peak ") + Math.round(peak.v) + " (" + cat(peak.v).toLowerCase() + ") around " + esc(shortTime(peak.h*60)) +
              (peak.v >= 3 && !after ? "<br>Sun protection advised" : "");
  return '<section class="pc"><h3>UV index</h3><div class="big">' + Math.round(now) + ' <small>' + cat(now) + '</small></div>' +
         '<div class="sub">' + sub + '</div></section>';
}

function loadTide(){
  const k = placeKey() + "@" + placeYMD().ymd;
  if(EXT.tideKey === k) return;
  EXT.tideKey = k; EXT.tide = null;
  if(!TIDE_ST) TIDE_ST = fetch("tide-stations.json").then(r => r.ok ? r.json() : []).catch(() => { TIDE_ST = null; return []; });
  TIDE_ST.then(list => {
    let best = null, bd = 40;
    for(const s of list){ if(Math.abs(s[3] - PLACE.lat) > 0.5) continue;
      const d = kmTo(PLACE.lat, PLACE.lng, s[3], s[4]); if(d < bd){ bd = d; best = s; } }
    if(!best) return null;
    /* start yesterday so the tide just before midnight is known; 72 hours covers tomorrow */
    const y = new Date(Date.now() - 864e5), yp = zonedParts(y, PLACE.tz);
    const begin = yp.year + p2(yp.month) + p2(yp.day);
    return cachedJSON("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=NjordWeather" +
                      "&begin_date=" + begin + "&range=72&datum=MLLW&station=" + best[0] +
                      "&time_zone=lst_ldt&units=english&interval=hilo&format=json", 6*3600e3)
      .then(j => ({ st: best, km: bd, p: (j && j.predictions) || [] }));
  }).then(r => {
    if(EXT.tideKey !== k || !r || !r.p.length) return;
    EXT.tide = r; extDone();
  }).catch(() => {});
}
function tideCard(){
  const T = EXT.tide; if(!T) return "";
  const { stamp } = placeYMD();
  const ev = T.p.map(x => ({ t: x.t, v: parseFloat(x.v), hi: x.type === "H" })).filter(x => isFinite(x.v));
  const i = ev.findIndex(x => x.t > stamp);
  if(i < 0) return "";
  const metric = CONFIG.units !== "imperial";
  const ht = v => metric ? (v*0.3048).toFixed(1) + " m" : v.toFixed(1) + " ft";
  const when = x => { const today = x.t.slice(0, 10) === stamp.slice(0, 10);
    return esc(shortTime(+x.t.slice(11, 13)*60 + +x.t.slice(14, 16))) + (today ? "" : " tomorrow"); };
  const nx = ev[i], then = ev[i + 1], prev = ev[i - 1];
  const dir = prev ? (nx.hi ? "Rising" : "Falling") + " now" : "";
  return '<section class="pc"><h3>Tides</h3><div class="big">' + (nx.hi ? "High" : "Low") + ' <small>' + when(nx) + '</small></div>' +
         '<div class="sub">' + (dir ? dir + ", to " + ht(nx.v) : ht(nx.v)) +
         (then ? "<br>" + (then.hi ? "High " : "Low ") + ht(then.v) + " at " + when(then) : "") +
         '<br>' + esc(T.st[1]) + (T.km >= 2 ? ", " + Math.round(metric ? T.km : T.km/1.609) + (metric ? " km" : " mi") + " away" : "") + '</div></section>';
}

/* ---- hourly graph (app build 52) -------------------------------------------
   The next 48 hours of one thing at a time - pick it from the chips. Drag
   across the graph to read any hour. */
const GRAPH_KINDS = [
  { id: "temp",  name: "Temp",       get: h => h.temp,  unit: () => "°" },
  { id: "feels", name: "Feels like", get: h => h.feels, unit: () => "°" },
  { id: "dew",   name: "Dew point",  get: h => dewPoint(h.temp, h.humid), unit: () => "°" },
  { id: "wind",  name: "Wind",       get: h => h.wind,  get2: h => gustOf(h), unit: () => " " + spdUnit() },
  { id: "pop",   name: "Rain/snow %",     get: h => h.pop,   unit: () => "%", min: 0, max: 100, bars: true },
  { id: "amt",   name: "Rain/snow amount",     get: h => h.amt,   unit: () => CONFIG.units === "imperial" ? " in" : " mm", min: 0, bars: true },
  { id: "cloud", name: "Clouds",     get: h => h.cloud, unit: () => "%", min: 0, max: 100 },
  { id: "humid", name: "Humidity",   get: h => h.humid, unit: () => "%", min: 0, max: 100 }
];
/* build 52: gusts only when they matter - 15 mph or more (24 km/h, 7 m/s) and
   above the steady wind; NOAA's grid often carries a "gust" equal to the wind */
function gustOf(h){
  const g = h.gust; if(g == null || h.wind == null) return null;
  const min = CONFIG.units === "imperial" ? 15 : windMS() ? 7 : 24;
  return g >= min && g > h.wind ? g : null;
}
const G_COL = { temp: "#f2c46d", feels: "#f2905a", dew: "#7fd4a0", wind: "#e8eef8", pop: "#90c3f2",
                amt: "#5aa8f0", cloud: "#a9b4c6", humid: "#c59af2" };
function graphKind(){ let v = "temp"; try { v = localStorage.getItem("njord.graph") || "temp"; } catch(e){} return GRAPH_KINDS.find(k => k.id === v) || GRAPH_KINDS[0]; }
function renderGraph(){
  const el = $("phGraph");
  if(!CONFIG.showGraph || !WX || !(WX.hours || []).length){ el.hidden = true; return; }
  const hs = WX.hours, p = zonedParts(new Date(), PLACE.tz);
  const key = p.year + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour);
  let i0 = hs.findIndex(h => String(h.time).slice(0, 13) === key); if(i0 < 0) i0 = 0;
  /* build 52: every forecast hour, 48 of them across the card; swipe sideways for the rest */
  const win = hs.slice(i0, i0 + 240), K = graphKind();
  const avail = GRAPH_KINDS.filter(k => win.some(h => k.get(h) != null));
  const k = avail.includes(K) ? K : avail[0];
  if(!k){ el.hidden = true; return; }
  el.hidden = false;
  const vals = win.map(h => k.get(h)), v2 = k.get2 ? win.map(h => k.get2(h)) : null;
  const all = vals.concat(v2 || []).filter(v => v != null);
  let lo = k.min != null ? k.min : Math.min(...all), hi = k.max != null ? k.max : Math.max(...all);
  if(k.id === "amt") hi = Math.max(hi, CONFIG.units === "imperial" ? 0.1 : 2.5);
  if(hi - lo < 4 && k.max == null){ const m = (hi + lo)/2; lo = k.min != null ? Math.max(k.min, m - 2) : m - 2; hi = lo + 4; }
  const pad2 = (hi - lo)*0.08; if(k.min == null) lo -= pad2; if(k.max == null) hi += pad2;
  const PER = 288/47, W = Math.max(300, 12 + (win.length - 1)*PER), H = 120, X = i => 6 + i*PER, Y = v => 8 + (1 - (v - lo)/(hi - lo))*(H - 26);
  let g = "";
  /* midnights and 6-hourly ticks */
  win.forEach((h, i) => {
    const hr = +String(h.time).slice(11, 13);
    if(hr === 0) g += '<line x1="' + X(i) + '" y1="4" x2="' + X(i) + '" y2="' + (H - 16) + '" stroke="rgba(255,255,255,.18)"/>' +
                      '<text x="' + (X(i) + 3) + '" y="14" class="gD">' + esc(dayName(h.time)) + '</text>';
    if(hr % 6 === 0 && i > 0) g += '<text x="' + X(i) + '" y="' + (H - 3) + '" class="gT">' + esc(shortTime(hr*60)) + '</text>';
  });
  if(k.bars){
    const bw = (W - 12)/win.length*0.7;
    vals.forEach((v, i) => { if(v != null && v > 0) g += '<rect x="' + (X(i) - bw/2) + '" y="' + Y(v) + '" width="' + bw + '" height="' + (Y(lo) - Y(v)) + '" rx="1.5" fill="#90c3f2" opacity=".8"/>'; });
  } else {
    const line = arr => { let d = "", up = false; arr.forEach((v, i) => { if(v == null){ up = false; return; } d += (up ? "L" : "M") + X(i).toFixed(1) + "," + Y(v).toFixed(1); up = true; }); return d; };
    const d1 = line(vals);
    if(k.id === "temp" || k.id === "feels" || k.id === "cloud" || k.id === "humid")
      g += '<path d="' + d1 + 'L' + X(vals.length - 1) + ',' + (H - 18) + 'L' + X(0) + ',' + (H - 18) + 'Z" fill="rgba(144,195,242,.13)"/>';
    if(v2) g += '<path d="' + line(v2) + '" fill="none" stroke="#90c3f2" stroke-width="1.5" stroke-dasharray="3 3" opacity=".7"/>';
    g += '<path d="' + d1 + '" fill="none" stroke="#90c3f2" stroke-width="2.2" stroke-linejoin="round"/>';
  }
  /* high and low labels */
  const fmt = v => k.id === "amt" ? (CONFIG.units === "imperial" ? v.toFixed(2) : v.toFixed(1)) : Math.round(v);
  if(vals.some(v => v != null && (!k.bars || v > 0))){
    const nn = vals.map((v, i) => [v, i]).filter(x => x[0] != null);
    const mx = nn.reduce((a, b) => b[0] > a[0] ? b : a), mn = nn.reduce((a, b) => b[0] < a[0] ? b : a);
    /* the low's label goes under its point unless that would sit on the time labels */
    const marks = [[mx[0], mx[1], -6]];
    if(!k.bars && mn[0] !== mx[0]) marks.push([mn[0], mn[1], Y(mn[0]) + 14 > H - 20 ? -6 : 14]);
    for(const [v, i, dy] of marks){
      const lab = fmt(v) + k.unit(), half = lab.length*3 + 2;     // keep the whole label inside the card
      g += '<text x="' + Math.min(W - half, Math.max(half, X(i))) + '" y="' + (Y(v) + dy) + '" class="gV">' + esc(lab) + '</text>';
    }
  }
  el.innerHTML = '<h3>Hourly graph <span class="tapHint">tap for full screen</span></h3>' +
    '<div class="gChips">' + avail.map(x => '<button data-g="' + x.id + '" class="' + (x === k ? "on" : "") + '">' + x.name + '</button>').join("") + '</div>' +
    '<div class="gWrap"><svg class="gSvg" style="width:' + (W/300*100).toFixed(2) + '%" viewBox="0 0 ' + W + ' ' + H + '">' + g + '<line class="gCur" x1="0" y1="4" x2="0" y2="' + (H - 16) + '" stroke="#fbfcfe" stroke-width="1" visibility="hidden"/></svg>' +
    '<div class="gRead"></div></div>' +
    (k.get2 ? '<div class="sub">Solid: wind · dashed: gusts</div>' : "");
  el.querySelector(".gChips").onclick = e => {
    const b = e.target.closest("[data-g]"); if(!b) return;
    try { localStorage.setItem("njord.graph", b.dataset.g); } catch(err){}
    renderGraph();
  };
  const svg = el.querySelector(".gSvg"), cur = el.querySelector(".gCur"), rd = el.querySelector(".gRead");
  const show = ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left)/r.width*W;
    const i = Math.max(0, Math.min(win.length - 1, Math.round((x - 6)/((W - 12)/(win.length - 1)))));
    cur.setAttribute("x1", X(i)); cur.setAttribute("x2", X(i)); cur.setAttribute("visibility", "visible");
    const h = win[i], hr = +String(h.time).slice(11, 13), v = vals[i];
    rd.textContent = (i === 0 ? "Now" : dayName(h.time) + " " + shortTime(hr*60)) + " · " + (v == null ? "–" : fmt(v) + k.unit()) +
                     (v2 && v2[i] != null ? ", gusts " + v2[i] + k.unit() : "");
  };
  void show; void cur; void rd;
  svg.onclick = () => gfOpen();
}

/* ---- full-screen graph (app build 52) ---------------------------------------
   Stacked panels on one time line, each on its own scale: temperatures (with a
   freezing line), percentages, wind (with direction arrows), rain and snow bars,
   and pressure. The past 24 hours come from the nearest station's real reports
   (lighter, left of "Now"); weather alerts shade the hours they cover. Swipe to
   move, pinch to zoom from a day to the whole forecast, tap to read an hour. */
let GF_PX = 15;                                 // width of one hour (pinch changes it)
const GF_PANELS = [
  { id: "deg",  kinds: ["temp", "feels", "dew"], w: 4 },
  { id: "pct",  kinds: ["pop", "humid", "cloud"], w: 2.6 },
  { id: "wind", kinds: ["wind"], w: 2.2 },
  { id: "wet",  kinds: ["amt"], w: 2 },
  { id: "pres", kinds: ["pres"], w: 1.8 }
];
const GF_EXTRA = [ { id: "pres", name: "Pressure (past)", unit: () => CONFIG.units === "imperial" ? " in" : " hPa" } ];
G_COL.pres = "#d8c8a8"; G_COL.snow = "#f4f7fb";
function gfSel(){
  let a = null; try { a = JSON.parse(localStorage.getItem("njord.graphMulti") || "null"); } catch(e){}
  return Array.isArray(a) && a.length ? a : ["temp", "pop", "wind", "amt"];
}
/* the past 24 hours from the station that feeds the Pressure / Visibility cards */
let GF_HIST = null;
function gfHistory(){
  const id = OBS_PV && OBS_PV.id, key = id + "@" + placeKey();
  if(!id || (GF_HIST && GF_HIST.key === key && Date.now() - GF_HIST.at < 15*60000)) return;
  GF_HIST = { key, at: Date.now(), rows: [] };
  fetch("https://api.weather.gov/stations/" + id + "/observations?limit=48", OBS_HDR).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(j => {
    const metric = CONFIG.units !== "imperial", v = x => x && x.value != null ? x.value : null;
    const tC = c => c == null ? null : Math.round(metric ? c : c*9/5 + 32);
    const sp = k => k == null ? null : Math.round(CONFIG.units === "imperial" ? k/1.609344 : windMS() ? k/3.6 : k);
    GF_HIST.rows = (j.features || []).map(f => {
      const q = f.properties || {}, t = Date.parse(q.timestamp);
      const lay = (q.cloudLayers || []).map(l => LAYER_PCT[l.amount]).filter(x => x != null);
      const pa = v(q.seaLevelPressure) != null ? v(q.seaLevelPressure) : v(q.barometricPressure);
      const pr = v(q.precipitationLastHour);
      return { t, temp: tC(v(q.temperature)), dew: tC(v(q.dewpoint)), humid: v(q.relativeHumidity) != null ? Math.round(v(q.relativeHumidity)) : null,
               feels: tC(v(q.windChill) != null ? v(q.windChill) : v(q.heatIndex) != null ? v(q.heatIndex) : v(q.temperature)),
               wind: sp(v(q.windSpeed)), gust: sp(v(q.windGust)), dir: v(q.windDirection),
               cloud: lay.length ? Math.max(...lay) : null,
               amt: pr == null ? null : metric ? +(pr*1000).toFixed(1) : +(pr*39.37).toFixed(2),
               pres: pa == null ? null : metric ? Math.round(pa/100) : +(pa/100*0.02953).toFixed(2) };
    }).filter(r => isFinite(r.t) && Date.now() - r.t < 25*3600e3).reverse();
    if(gfOpenNow()){ const sc = $("gfFull").querySelector(".gfScroll"); gfDraw(!(sc.scrollLeft < 5), sc.scrollLeft < 5); }
  }).catch(() => {});
}
function gfOpen(){
  let el = $("gfFull");
  if(!el){
    if(!window.NjordAndroid) document.documentElement.classList.add("njWeb");
    el = document.createElement("div"); el.id = "gfFull";
    /* build 52: the data list slides out from the left, so the graph gets the whole screen */
    el.innerHTML = '<div class="gfTop"><button class="rdB" id="gfBack">‹ <span></span></button><span class="gfTitle">Hourly graph</span>' +
      '</div>' +
      '<button class="gfPull" id="gfData" aria-label="Choose data"><i></i></button>' +
      '<div class="gfReadWrap"><div class="gfRead"></div><button class="gfMoreArrow" type="button">▾ more</button></div><div class="gfBody"><div class="gfAxis"></div><div class="gfScroll"></div></div>' +
      '<div class="gfShade" hidden></div><div class="gfDrawer"><div class="gfDHead">Data<button id="gfDClose" aria-label="Close">✕</button></div><div class="gfChips"></div></div>';
    document.body.appendChild(el);
    $("gfBack").onclick = gfClose;
    const drawer = el.querySelector(".gfDrawer"), shade = el.querySelector(".gfShade");
    const dOpen = on => { drawer.classList.toggle("open", on); shade.hidden = !on; };
    /* the pull tab on the left edge: tap it, or drag it to the right */
    const pull = $("gfData"); let px0 = null;
    pull.onclick = () => dOpen(true);
    pull.addEventListener("touchstart", e => { px0 = e.touches[0].clientX; }, { passive: true });
    pull.addEventListener("touchmove", e => { if(px0 != null && e.touches[0].clientX - px0 > 24){ px0 = null; dOpen(true); } }, { passive: true });
    pull.addEventListener("touchend", () => { px0 = null; });
    /* and drag the open drawer back to the left to close it */
    let dx0 = null;
    drawer.addEventListener("touchstart", e => { dx0 = e.touches[0].clientX; }, { passive: true });
    drawer.addEventListener("touchmove", e => { if(dx0 != null && dx0 - e.touches[0].clientX > 40){ dx0 = null; dOpen(false); } }, { passive: true });
    $("gfDClose").onclick = shade.onclick = () => dOpen(false);
    el.gfDrawer = dOpen;
    el.querySelector(".gfChips").onclick = e => {
      const b = e.target.closest("[data-g]"); if(!b) return;
      let a = gfSel(); a = a.includes(b.dataset.g) ? a.filter(x => x !== b.dataset.g) : a.concat(b.dataset.g);
      if(!a.length) return;                      // keep at least one
      try { localStorage.setItem("njord.graphMulti", JSON.stringify(a)); } catch(err){}
      gfDraw(true);
    };
    /* build 53: + / − zoom (hour width 5-36 px), keeping the middle hour in place */
    const sc = el.querySelector(".gfScroll");
    const zoom = f => {
      const mid = sc.clientWidth/2, hour = (sc.scrollLeft + mid - 10)/GF_PX;
      GF_PX = Math.max(5, Math.min(36, GF_PX*f)); gfDraw(false);
      sc.scrollLeft = hour*GF_PX + 10 - mid;
      try { localStorage.setItem("njord.graphPx", String(GF_PX)); } catch(err){}
    };
    void zoom;                                    // build 53: buttons removed; pinch only
    /* pinch stretches the time axis only - the page itself never zooms here.
       During the pinch the drawn graph is just stretched sideways (cheap and
       smooth); when the fingers lift it is redrawn once at the new hour width. */
    let pin = null;
    const body = el.querySelector(".gfBody");      // fingers may land on the scale too
    const span = t => Math.max(40, Math.abs(t[0].clientX - t[1].clientX));
    body.addEventListener("touchstart", e => {
      if(e.touches.length !== 2) return;
      const svg = sc.querySelector("svg"); if(!svg) return;
      const mid = (e.touches[0].clientX + e.touches[1].clientX)/2 - sc.getBoundingClientRect().left;
      pin = { d: span(e.touches), px: GF_PX, k: 1, mid, at: sc.scrollLeft + mid, svg };
      svg.style.transformOrigin = pin.at + "px 0"; svg.style.willChange = "transform";
    }, { passive: true });
    body.addEventListener("touchmove", e => {
      if(!pin || e.touches.length !== 2) return;
      e.preventDefault();
      pin.k = Math.max(5/pin.px, Math.min(36/pin.px, span(e.touches)/pin.d));
      pin.svg.style.transform = "scaleX(" + pin.k.toFixed(3) + ")";
    }, { passive: false });
    const endPinch = () => {
      if(!pin) return;
      const p = pin; pin = null;
      p.svg.style.transform = ""; p.svg.style.willChange = "";
      if(Math.abs(p.k - 1) < 0.03) return;
      const hour = (p.at - 10)/p.px;
      GF_PX = p.px*p.k; gfDraw(false);
      sc.scrollLeft = hour*GF_PX + 10 - p.mid;
      try { localStorage.setItem("njord.graphPx", String(GF_PX)); } catch(err){}
    };
    body.addEventListener("touchend", e => { if(e.touches.length < 2) endPinch(); });
    body.addEventListener("touchcancel", endPinch);
    try { const px = +localStorage.getItem("njord.graphPx"); if(px >= 5 && px <= 36) GF_PX = px; } catch(e){}
  }
  el.hidden = false;
  $("gfBack").querySelector("span").textContent = PLACE.short || PLACE.name || "";
  gfHistory();
  gfDraw(false, true);
}
/* build 53: the legend / reading line is at most two lines; when there is more,
   a fade and a small arrow show it scrolls */
function gfMore(){
  const rd = $("gfFull") && $("gfFull").querySelector(".gfRead"); if(!rd) return;
  const wrap = rd.parentNode, btn = wrap.querySelector(".gfMoreArrow");
  const upd = () => {
    const over = rd.scrollHeight - rd.clientHeight > 2, end = rd.scrollHeight - rd.scrollTop - rd.clientHeight <= 4;
    rd.classList.toggle("more", over && !end); wrap.classList.toggle("more", over);
    if(btn) btn.textContent = end ? "▴ back" : "▾ more";
  };
  rd.onscroll = upd; requestAnimationFrame(upd);
  /* "more" scrolls down a step; at the end it reads "back" and returns to the top */
  if(btn) btn.onclick = () => {
    const end = rd.scrollHeight - rd.scrollTop - rd.clientHeight <= 4;
    const left = rd.scrollHeight - rd.clientHeight - rd.scrollTop;
    rd.scrollTo({ top: end ? 0 : rd.scrollTop + (left < rd.clientHeight*1.4 ? left : rd.clientHeight), behavior: "smooth" });
  };
}
function gfClose(){ const el = $("gfFull"); if(el){ el.hidden = true; if(el.gfDrawer) el.gfDrawer(false); } }
const gfOpenNow = () => { const el = $("gfFull"); return !!(el && !el.hidden); };
window.addEventListener("resize", () => { if(gfOpenNow()) gfDraw(true); });
function gfDraw(keepScroll, toNow){
  const el = $("gfFull"), hs = WX && WX.hours || [];
  const p = zonedParts(new Date(), PLACE.tz);
  const key = p.year + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour);
  let i0 = hs.findIndex(h => String(h.time).slice(0, 13) === key); if(i0 < 0) i0 = 0;
  const fc = hs.slice(i0);
  /* the past: one slot per hour for the 24 hours before now, from station reports */
  const hourMs = Date.now() - (p.minute*60 + p.second)*1000;      // start of this hour
  const past = [];
  const rows = GF_HIST && GF_HIST.rows || [];
  if(rows.length){
    for(let k = 24; k >= 1; k--){
      const t0 = hourMs - k*3600e3, inH = rows.filter(r => r.t >= t0 && r.t < t0 + 3600e3);
      const r = inH[inH.length - 1] || null, lp = zonedParts(new Date(t0 + 1800e3), PLACE.tz);
      past.push(Object.assign({ time: lp.year + "-" + pad(lp.month) + "-" + pad(lp.day) + "T" + pad(lp.hour) + ":00", past: true }, r || {},
                              { amt: inH.reduce((a, x) => x.amt != null ? (a || 0) + x.amt : a, null) }));
    }
  }
  const win = past.concat(fc), P0 = past.length;                // P0 = index of "now"
  const KINDS = GRAPH_KINDS.concat([{ id: "pres", name: "Pressure (past)", get: h => h.pres, unit: GF_EXTRA[0].unit }]);
  const avail = KINDS.filter(k => win.some(h => k.get(h) != null));
  const sel = gfSel().filter(id => avail.some(k => k.id === id));
  el.querySelector(".gfChips").innerHTML = avail.map(k => '<button data-g="' + k.id + '" class="' + (sel.includes(k.id) ? "on" : "") +
    '" style="--c:' + G_COL[k.id] + '"><i></i>' + k.name + (k.get2 ? " + gusts" : "") + '</button>').join("");
  /* the legend names the dashed gust line when there is one to see */
  const legend = KINDS.filter(k => sel.includes(k.id)).map(k => '<span style="color:' + G_COL[k.id] + '">● ' + esc(k.name) +
    (k.get2 && win.some(h => k.get2(h) != null) ? ' <span style="opacity:.75">┄ gusts</span>' : '') + '</span>').join("  ");
  const sc = el.querySelector(".gfScroll"), prevX = sc.scrollLeft;
  if(!win.length){ sc.innerHTML = ""; return; }
  const panels = GF_PANELS.filter(pn => pn.kinds.some(id => sel.includes(id)));
  const N = win.length, W = N*GF_PX + 20, total = el.querySelector(".gfBody").clientHeight || 520;
  const head = 20, foot = 22, gap = 10, usable = total - head - foot - gap*(panels.length - 1);
  const wsum = panels.reduce((a, pn) => a + pn.w, 0);
  const X = i => 10 + i*GF_PX + GF_PX/2;
  const metric = CONFIG.units !== "imperial";
  let g = "", ax = "", y = head;
  /* night shading, midnights, alert bands - full height */
  const msAt = i => hourMs + (i - P0)*3600e3;
  win.forEach((h, i) => {
    const hr = +String(h.time).slice(11, 13);
    if(nightAt(hr*60 + 30)) g += '<rect x="' + (X(i) - GF_PX/2) + '" y="' + head + '" width="' + GF_PX + '" height="' + (total - head - foot) + '" fill="rgba(0,0,0,.24)"/>';
    if(hr === 0) g += '<line x1="' + (X(i) - GF_PX/2) + '" y1="0" x2="' + (X(i) - GF_PX/2) + '" y2="' + (total - foot) + '" stroke="rgba(255,255,255,.22)"/>' +
                      '<text x="' + (X(i) - GF_PX/2 + 4) + '" y="12" class="gfDay">' + esc(dayName(h.time)) + '</text>';
  });
  const ALC = { ex: "rgba(226,70,90,.16)", sv: "rgba(240,110,70,.15)", md: "rgba(240,190,80,.13)", mn: "rgba(120,170,240,.12)", un: "rgba(160,170,190,.10)" };
  (typeof ALERTS !== "undefined" ? ALERTS : []).forEach((a, n) => {
    const on = Date.parse(a.onset) || Date.now(), ex = Date.parse(a.expires); if(!isFinite(ex)) return;
    const a0 = Math.max(0, P0 + (on - hourMs)/3600e3), a1 = Math.min(N, P0 + (ex - hourMs)/3600e3);
    if(a1 <= a0) return;
    const x0 = 10 + a0*GF_PX, x1 = 10 + a1*GF_PX, sv = sevOf(a)[1];
    g += '<rect x="' + x0 + '" y="' + head + '" width="' + (x1 - x0) + '" height="' + (total - head - foot) + '" fill="' + ALC[sv] + '"/>' +
         '<text x="' + (x0 + 4) + '" y="' + (head + 12 + n*13) + '" class="gfAl">' + esc(a.event) + '</text>';
  });
  /* "Now" */
  if(P0) g += '<rect x="0" y="' + head + '" width="' + (X(P0) - GF_PX/2) + '" height="' + (total - head - foot) + '" fill="rgba(255,255,255,.035)"/>' +
              '<text x="' + (X(P0) - GF_PX/2 - 4) + '" y="' + (head - 6) + '" class="gfPast">Past 24 h ←</text>';
  g += '<line x1="' + (X(P0) - GF_PX/2) + '" y1="' + head + '" x2="' + (X(P0) - GF_PX/2) + '" y2="' + (total - foot) + '" stroke="#78e0f2" stroke-width="1.4"/>' +
       '<text x="' + (X(P0) - GF_PX/2 + 4) + '" y="' + (head - 6) + '" class="gfNow">Now</text>';
  /* time labels: every 3 h when roomy, 6 h when zoomed out, 12 h when far out */
  const every = GF_PX >= 14 ? 3 : GF_PX >= 8 ? 6 : 12;
  win.forEach((h, i) => { const hr = +String(h.time).slice(11, 13);
    if(hr % every === 0 && hr !== 0) g += '<text x="' + X(i) + '" y="' + (total - 6) + '" class="gfT">' + esc(shortTime(hr*60)) + '</text>'; });
  const path = (vals, from, to) => { let d = "", up = false; vals.forEach((v, i) => { if(i < from || i > to || v == null){ up = false; return; }
    d += (up ? "L" : "M") + X(i).toFixed(1) + "," + v.toFixed(1); up = true; }); return d; };
  const labEvery = GF_PX >= 14 ? 6 : GF_PX >= 8 ? 12 : 24;
  for(const pn of panels){
    const ph = usable*pn.w/wsum, top = y + (pn.id === "wind" ? 20 : 6), bot = y + ph - 4;   // wind: room for the arrows
    const ks = KINDS.filter(k => pn.kinds.includes(k.id) && sel.includes(k.id));
    g += '<rect x="0" y="' + y + '" width="' + W + '" height="' + ph + '" fill="rgba(255,255,255,.025)"/>';
    let lo, hi, step;
    if(pn.id === "pct"){ lo = 0; hi = 100; step = 50; }
    else {
      const vals = []; for(const k of ks) for(const h of win){ const v = k.get(h); if(v != null) vals.push(v); if(k.get2){ const v2 = k.get2(h); if(v2 != null) vals.push(v2); } }
      if(pn.id === "wet"){ for(const h of win){ if(h.snow != null) vals.push(h.snow); } }
      lo = vals.length ? Math.min(...vals) : 0; hi = vals.length ? Math.max(...vals) : 1;
      if(pn.id === "wind" || pn.id === "wet") lo = 0;
      if(pn.id === "wet") hi = Math.max(hi, metric ? 2 : 0.1);
      /* a round step giving about three lines per panel */
      const span = hi - lo || 1, raw = span/3;
      step = [0.01,0.02,0.05,0.1,0.2,0.25,0.5,1,2,5,10,20,25,50].find(x => x >= raw) || 100;
      if(pn.id === "deg" || pn.id === "wind") step = Math.max(step, 5);
      lo = Math.floor(lo/step)*step; hi = Math.ceil(hi/step)*step; if(hi <= lo) hi = lo + step;
    }
    const Y = v => top + (1 - (v - lo)/(hi - lo))*(bot - top);
    for(let v = lo; v <= hi + 1e-9; v += step){
      g += '<line x1="0" y1="' + Y(v) + '" x2="' + W + '" y2="' + Y(v) + '" stroke="rgba(160,190,235,.10)"/>';
      /* the top line carries the panel's unit */
      const u = v + step > hi + 1e-9 ? ({ deg: "°", pct: "%", wind: " " + spdUnit(), wet: metric ? " mm" : " in", pres: metric ? "" : " in" })[pn.id] : "";
      ax += '<text x="44" y="' + (Y(v) + 4) + '" class="gfA">' + (pn.id === "pres" && !metric ? v.toFixed(2) : +v.toFixed(2)) + u + '</text>';
    }
    if(pn.id === "deg"){
      const fz = metric ? 0 : 32;
      if(fz > lo && fz < hi) g += '<line x1="0" y1="' + Y(fz) + '" x2="' + W + '" y2="' + Y(fz) + '" stroke="#90c3f2" stroke-dasharray="6 4" opacity=".55"/>' +
                                 '<text x="' + (X(P0) + 6) + '" y="' + (Y(fz) - 4) + '" class="gfFz">freezing</text>';
    }
    if(pn.id === "wind") win.forEach((h, i) => {
      if(i % Math.max(1, Math.round(26/GF_PX)) || h.dir == null) return;
      g += windGlyph(X(i), y + 10, h.dir, h.past ? .5 : 1);
    });
    if(pn.id === "wet"){
      /* rain blue, snow white (snow as snow depth), stacked; the past is lighter */
      const bw = Math.max(2, GF_PX*0.7);
      win.forEach((h, i) => {
        const sn = h.snow || 0, rn = h.rain != null ? h.rain : (sn ? 0 : h.amt || 0);
        let yb = Y(0);
        if(rn > 0){ const hh = Y(0) - Y(rn); g += '<rect x="' + (X(i) - bw/2) + '" y="' + (yb - hh) + '" width="' + bw + '" height="' + hh + '" fill="' + G_COL.amt + '" opacity="' + (h.past ? .5 : .9) + '"/>'; yb -= hh; }
        if(sn > 0){ const hh = Y(0) - Y(sn); g += '<rect x="' + (X(i) - bw/2) + '" y="' + (yb - hh) + '" width="' + bw + '" height="' + hh + '" fill="' + G_COL.snow + '" opacity="' + (h.past ? .5 : .9) + '"/>'; }
      });
      g += '<text x="' + (X(P0) + 6) + '" y="' + (top + 9) + '" class="gfKey"><tspan fill="' + G_COL.amt + '">■ rain</tspan>  <tspan fill="' + G_COL.snow + '">■ snow</tspan></text>';
    } else {
      for(const k of ks){
        const c = G_COL[k.id], vals = win.map(h => { const v = k.get(h); return v == null ? null : Y(v); });
        if(k.get2){ const v2 = win.map(h => { const v = k.get2(h); return v == null ? null : Y(v); });
          g += '<path d="' + path(v2, 0, P0) + '" fill="none" stroke="' + c + '" stroke-width="1.3" stroke-dasharray="3 3" opacity=".35"/>' +
               '<path d="' + path(v2, P0, N) + '" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-dasharray="3 3" opacity=".7"/>'; }
        g += '<path d="' + path(vals, 0, P0) + '" fill="none" stroke="' + c + '" stroke-width="1.8" opacity=".45"/>' +
             '<path d="' + path(vals, P0, N) + '" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linejoin="round"/>';
        win.forEach((h, i) => {
          const v = k.get(h); if(v == null || (i - P0) % labEvery !== Math.floor(labEvery/2)) return;
          g += '<text x="' + X(i) + '" y="' + (Y(v) - 5) + '" class="gfV" fill="' + c + '">' + (k.id === "pres" && !metric ? v.toFixed(2) : Math.round(v)) + '</text>';
        });
      }
    }
    y += ph + gap;
  }
  g += '<line class="gfCur" x1="0" y1="' + head + '" x2="0" y2="' + (total - foot) + '" stroke="#fbfcfe" visibility="hidden"/>';
  sc.innerHTML = '<svg width="' + W + '" height="' + total + '">' + g + '</svg>';
  el.querySelector(".gfAxis").innerHTML = '<svg width="48" height="' + total + '">' + ax + '</svg>';
  sc.scrollLeft = toNow ? Math.max(0, X(P0) - GF_PX/2 - 40) : keepScroll ? prevX : sc.scrollLeft;
  const cur = sc.querySelector(".gfCur"), rd = el.querySelector(".gfRead");
  sc.querySelector("svg").onclick = e => {
    const r = e.currentTarget.getBoundingClientRect(), i = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - r.left - 10)/GF_PX)));
    cur.setAttribute("x1", X(i)); cur.setAttribute("x2", X(i)); cur.setAttribute("visibility", "visible");
    const h = win[i], hr = +String(h.time).slice(11, 13);
    const parts = KINDS.filter(k => sel.includes(k.id)).map(k => {
      if(k.id === "amt"){
        const sn = h.snow || 0, rn = h.rain != null ? h.rain : (sn ? 0 : h.amt);
        if(!rn && !sn) return "";
        return '<span style="color:' + G_COL.amt + '">' + (sn ? "Snow " + sn + (metric ? " cm" : " in") + (rn ? ", rain " + rn + k.unit() : "") : "Rain " + rn + k.unit()) + '</span>';
      }
      const v = k.get(h); if(v == null) return "";
      return '<span style="color:' + G_COL[k.id] + '">' + esc(k.name) + " " + (k.id === "pres" && !metric ? v.toFixed(2) : Math.round(v)) + esc(k.unit()) +
             (k.get2 && k.get2(h) != null ? " (gusts " + k.get2(h) + ")" : "") + '</span>';
    }).filter(Boolean);
    const when = i === P0 ? "Now" : (h.past ? "Measured " : "") + dayName(h.time) + " " + shortTime(hr*60);
    rd.innerHTML = '<b>' + esc(when) + '</b> ' + (parts.join(" · ") || '<span class="sub">no report</span>'); gfMore();
  };
  rd.innerHTML = legend; gfMore();
}
/* wind arrows on the graph. Normal: a weathervane arrow (tail + open head)
   pointing where the wind is going, like TV weather and the Wind card.
   Pilot mode (planned, with Aviation): the solid wedge, pointing to where the
   wind comes FROM - a different shape so the two can't be mixed up. */
function windGlyph(x, y, dir, op){
  const pilot = CONFIG.windFrom === true;
  if(pilot) return '<g transform="translate(' + x + ',' + y + ') rotate(' + (dir % 360) + ')" opacity="' + op + '">' +
                   '<path d="M0,-7 L4.2,2.4 L0,0 L-4.2,2.4Z" fill="#7fd4a0"/></g>';
  return '<g transform="translate(' + x + ',' + y + ') rotate(' + ((dir + 180) % 360) + ')" opacity="' + op + '" fill="none" stroke="#7fd4a0" ' +
         'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M0,7 L0,-6.5"/><path d="M-3.6,-2.6 L0,-6.8 L3.6,-2.6"/></g>';
}
function dayName(t){
  const d = new Date(String(t).slice(0, 10) + "T12:00:00Z");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
}

/* ==== AURORA (app build 54) ===================================================
   A "chance of seeing it from here" for tonight, hour by hour, 0-100:
     geomagnetic reach  Kp forecast for the hour against this place's magnetic
                        latitude (the existing kpMargin rule); for the next two
                        hours nudged by the live solar wind (Bz south and fast
                        wind help) and by OVATION when it shows aurora in sight
     darkness           0 before nautical dusk, full at astronomical dark
     moon               a bright moon high up washes faint aurora out
     clouds             the forecast's cloud cover for the hour
   Data: NOAA SWPC (Kp forecast, OVATION - already loaded by the scene - and
   the 2-hour solar wind from the DSCOVR/ACE spacecraft). */
const AU = { sw: null, swAt: 0, swBusy: false, grid: null, gridAt: 0, land: null, hemi: null };
const auRows = j => {
  if(!Array.isArray(j) || j.length < 2 || !Array.isArray(j[0])) return Array.isArray(j) ? j : [];
  const h = j[0].map(x => String(x).toLowerCase());
  return j.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
};
const auT = s => Date.parse(String(s).replace(" ", "T") + (/[zZ]$/.test(String(s)) ? "" : "Z"));
function auLoadSW(){
  if(AU.swBusy || Date.now() - AU.swAt < 5*60e3) return;
  AU.swBusy = true;
  const get = u => fetch(SWPC + u, { cache: "no-store" }).then(r => r.ok ? r.json() : Promise.reject(r.status));
  Promise.all([get("products/solar-wind/mag-2-hour.json"), get("products/solar-wind/plasma-2-hour.json")]).then(([m, p]) => {
    const mag = auRows(m).map(r => ({ t: auT(r.time_tag), bz: parseFloat(r.bz_gsm), bt: parseFloat(r.bt) })).filter(r => isFinite(r.t) && isFinite(r.bz));
    const pl  = auRows(p).map(r => ({ t: auT(r.time_tag), v: parseFloat(r.speed), n: parseFloat(r.density) })).filter(r => isFinite(r.t) && isFinite(r.v));
    AU.sw = { mag, pl }; AU.swAt = Date.now();
  }).catch(() => { AU.swAt = Date.now() - 4*60e3; })          // try again in a minute
    .finally(() => { AU.swBusy = false; renderAurora(); if(auOpenNow()) auDraw(); });
}
/* the last ~15 minutes, so one odd reading doesn't swing the score */
function auSWNow(){
  const s = AU.sw; if(!s || !s.mag.length) return null;
  const tEnd = s.mag[s.mag.length - 1].t;
  if(Date.now() - tEnd > 45*60e3) return null;                   // stale
  const m = s.mag.filter(r => tEnd - r.t <= 15*60e3), p = s.pl.filter(r => tEnd - r.t <= 15*60e3);
  const avg = (a, k) => a.length ? a.reduce((x, r) => x + r[k], 0)/a.length : null;
  const v = avg(p, "v");
  return { bz: avg(m, "bz"), v, n: avg(p.filter(r => isFinite(r.n)), "n"), t: tEnd };
}
const auKey = t => { const p = zonedParts(new Date(t), PLACE.tz); return p.year + "-" + pad(p.month) + "-" + pad(p.day) + "T" + pad(p.hour); };
function auCloudAt(t){
  const k = auKey(t), h = WX && (WX.hours || []).find(x => String(x.time).slice(0, 13) === k);
  return h && h.cloud != null ? h.cloud : null;
}
const auML = () => Math.abs(magLat(PLACE.lat, PLACE.lng));
const auNeedKp = () => Math.max(0, Math.ceil((61.5 - auML())/2));   // horizonEdge(kp) <= |magnetic lat|
function auHours(){
  const P = PLACE, ml = auML(), now = Date.now(), start = Math.floor(now/3600e3)*3600e3, sw = auSWNow();
  const ov = AUR.ov && AUR.ov.best && Date.now() - AUR.ovAt < 2*3600e3 ? AUR.ov.best : null;
  const out = [];
  for(let k = 0; k < 20; k++){
    const t = start + k*3600e3 + 1800e3, d = new Date(t);
    const sun = sunSky(P, d).alt;
    const D = sun > -6 ? 0 : sun > -12 ? (-6 - sun)/6*0.6 : sun > -18 ? 0.6 + (-12 - sun)/6*0.4 : 1;
    const ms = moonSky(P, d), il = moonPhase(d).illum;
    const M = ms.alt > 0 ? 1 - 0.5*il*Math.min(1, 0.35 + ms.alt/40) : 1;
    const cl = auCloudAt(t), C = cl == null ? 1 : 1 - 0.95*cl/100;
    const kp = kpAt(t);
    let G = kp == null ? 0 : clamp((kpMargin(kp, ml) + 2)/7, 0, 1);
    if(k < 2 && sw) G = clamp(G + 0.25*clamp(-sw.bz/10, -0.6, 1) + 0.1*clamp((sw.v - 400)/300, 0, 1), 0, 1);
    /* OVATION showing aurora in sight lifts the next two hours - a faint glow
       far down on the horizon only a little */
    if(k < 2 && ov) G = Math.max(G, clamp((ov.score - 8)/30, 0, 1));
    out.push({ t, kp, sun, D, M, il, moonUp: ms.alt > 0, cl, G, clear: Math.round(100*G*D*M), score: Math.round(100*G*D*M*C) });
  }
  /* tonight: from now (or dusk) to dawn */
  const first = out.findIndex(h => h.D > 0);
  if(first < 0) return [];
  let last = first; while(last + 1 < out.length && out[last + 1].D > 0) last++;
  return out.slice(Math.max(0, first - 1), last + 2);
}
const auHr = t => { const p = zonedParts(new Date(t), PLACE.tz); return shortTime(p.hour*60 + p.minute); };
const auHrTop = t => { const p = zonedParts(new Date(t - 1800e3), PLACE.tz); return shortTime(p.hour*60); };
function auSummary(){
  if(!CONFIG.showAurora || !PLACE || auML() < 33) return null;
  const hs = auHours(), dark = hs.filter(h => h.D > 0);
  if(!dark.length) return null;
  const best = Math.max(...dark.map(h => h.score)), i = hs.findIndex(h => h.score === best);
  let a = i, b = i; const cut = Math.max(10, best*0.75);
  while(a > 0 && hs[a - 1].score >= cut) a--; while(b < hs.length - 1 && hs[b + 1].score >= cut) b++;
  const now = Date.now(), kpMax = nightKp(now, now + 18*3600e3), ml = auML(), sw = auSWNow();
  const dir = (PLACE.lat >= 0) ? "north" : "south";
  return { hs, best, w0: hs[a].t - 1800e3, w1: hs[b].t + 1800e3, kpMax, ml, sw, dir,
           overhead: kpMax != null && kpMargin(kpMax, ml) >= 5.5 };
}
function auVerdict(s){
  if(s.best >= 70) return "Good chance — look " + s.dir;
  if(s.best >= 45) return "Fair chance — look " + s.dir;
  if(s.best >= 20) return "Slight chance, low in the " + s.dir;
  return null;
}
/* next night (within ~3 days) whose Kp reaches this place */
function auNextChance(){
  if(!AUR.kp) return null;
  const ml = auML(), base = Date.now() + 12*3600e3;
  for(let n = 0; n < 3; n++){
    const from = base + n*24*3600e3, kp = nightKp(from, from + 14*3600e3);
    if(kp != null && kpMargin(kp, ml) >= 0){
      const p = zonedParts(new Date(from + 4*3600e3), PLACE.tz);
      const day = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
      return day + " night, Kp " + Math.round(kp) + " forecast";
    }
  }
  return null;
}
function auMoonSet(fromT){
  const P = PLACE;
  if(moonSky(P, new Date(fromT)).alt <= 0) return null;
  for(let t = fromT; t < fromT + 14*3600e3; t += 10*60000){
    if(sunSky(P, new Date(t)).alt > -6 && t > fromT + 3600e3) return -1;   // dawn first: up all night
    if(moonSky(P, new Date(t)).alt <= 0) return t;
  }
  return -1;                                                     // up all night
}
function auFactors(s){
  const f = [], sw = s.sw;
  if(sw){
    const bz = Math.round(sw.bz), v = Math.round(sw.v);
    if(bz <= -5) f.push(["ok", "Solar wind ✓", "Bz south " + Math.abs(bz) + " nT · " + v + " km/s"]);
    else if(bz < 0) f.push(["meh", "Solar wind fair", "Bz south " + Math.abs(bz) + " nT · " + v + " km/s"]);
    else f.push(["bad", "Solar wind quiet", "Bz north " + bz + " nT · " + v + " km/s"]);
  } else f.push(["meh", "Solar wind", "no reading right now"]);
  if(s.kpMax != null){
    const k = Math.round(s.kpMax), g = gScale(s.kpMax), m = kpMargin(s.kpMax, s.ml);
    f.push([m >= 0 ? "ok" : m >= -2 ? "meh" : "bad", "Kp " + k + " forecast", g ? "G" + g + " storm" + (m >= 0 ? " · reaches you" : "") : m >= 0 ? "reaches you" : "you need Kp " + auNeedKp()]);
  } else f.push(["meh", "Kp forecast", "not loaded yet"]);
  const dk = s.hs.filter(h => h.D > 0.5 && h.cl != null);
  if(dk.length){
    const avg = Math.round(dk.reduce((a, h) => a + h.cl, 0)/dk.length);
    let sub = avg < 20 ? "mostly clear" : avg > 80 ? "overcast" : "partly cloudy";
    const firstClear = dk.findIndex(h => h.cl < 30);
    if(dk[0].cl >= 50 && firstClear > 0) sub = "clearing after " + auHrTop(dk[firstClear].t);
    else if(dk[0].cl < 30 && dk.some(h => h.cl >= 60)) sub = "clouding over after " + auHrTop(dk.find(h => h.cl >= 60).t);
    f.push([avg < 30 ? "ok" : avg < 70 ? "meh" : "bad", "Clouds " + avg + "%", sub]);
  } else f.push(["meh", "Clouds", "no forecast"]);
  const w = s.hs.find(h => h.t >= s.w0) || s.hs[0], il = Math.round(w.il*100);
  const set = auMoonSet(Date.now());
  if(!w.moonUp) f.push(["ok", "Moon down", il + "% lit" + (set && set > 0 ? ", sets " + auHr(set) : "")]);
  else f.push([il > 60 ? "bad" : "meh", il > 60 ? "Bright moon" : "Moon up", il + "% lit" + (set === -1 ? ", up all night" : set ? ", sets " + auHr(set) : "")]);
  return f;
}
function auRing(v){
  const c = 2*Math.PI*33, col = v >= 45 ? "#6ff0b0" : v >= 20 ? "#f2c46d" : "#8796b0";
  return '<svg class="auRing" viewBox="0 0 80 80"><circle cx="40" cy="40" r="33" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/>' +
    '<circle cx="40" cy="40" r="33" fill="none" stroke="' + col + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c*v/100).toFixed(1) + ' ' + c.toFixed(1) +
    '" transform="rotate(-90 40 40)"/><text x="40" y="45" class="auRn">' + v + '</text><text x="40" y="59" class="auRs">OF 100</text></svg>';
}
function renderAurora(){
  const el = $("phAur");
  let s = null; try { s = auSummary(); } catch(e){}
  if(!s){ el.innerHTML = ""; return; }
  auLoadSW();
  const v = auVerdict(s);
  if(!v){
    const nx = auNextChance();
    el.innerHTML = '<section class="pc auCard quiet" data-au="1"><h3>Aurora tonight <span class="tapHint">details ›</span></h3>' +
      '<div class="auQuiet">Unlikely from ' + esc(placeName(PLACE)) + (s.kpMax != null ? ' · Kp ' + Math.round(s.kpMax) : '') +
      (s.sw && s.sw.bz > -2 ? ', solar wind calm' : '') + '</div>' +
      '<div class="sub">' + (nx ? "Next chance: " + esc(nx) : "No aurora expected here in the next 3 days") + '</div></section>';
  } else {
    el.innerHTML = '<section class="pc auCard" data-au="1"><h3>Aurora tonight <span class="tapHint">details ›</span></h3>' +
      '<div class="auScore">' + auRing(s.best) + '<div class="auV">' + esc(v) + '<small>Best ' + esc(auHr(s.w0)) + ' – ' + esc(auHr(s.w1)) +
      (s.overhead ? ' · may reach overhead' : '') + '</small></div></div>' +
      '<div class="auFacs">' + auFactors(s).map(x => '<div class="auFac"><b class="' + x[0] + '">' + esc(x[1]) + '</b>' + esc(x[2]) + '</div>').join("") + '</div></section>';
  }
  el.firstChild.onclick = () => auOpen();
}

/* ---- detail page ---- */
const auOpenNow = () => { const e = $("auFull"); return !!(e && !e.hidden); };
function auOpen(){
  let el = $("auFull");
  if(!el){
    el = document.createElement("div"); el.id = "auFull";
    el.innerHTML = '<div class="gfTop"><button class="rdB" id="auBack">‹ Aurora</button><span class="gfTitle auSub"></span></div><div class="auBody"></div>';
    document.body.appendChild(el);
    $("auBack").onclick = auClose;
  }
  el.hidden = false; auLoadSW(); auDraw();
}
function auClose(){ const e = $("auFull"); if(e) e.hidden = true; }
function auDraw(){
  const el = $("auFull"); if(!el) return;
  const s = auSummary();
  el.querySelector(".auSub").textContent = placeName(PLACE) + " · magnetic latitude " + Math.round(auML()) + "° · Kp " + auNeedKp() + " reaches you";
  let h = "";
  if(s){
    /* tonight hour by hour: grey = what clouds take away, green = chance with clouds */
    const hs = s.hs, n = hs.length, W = 300, H = 92, bw = W/n;
    let g = "";
    hs.forEach((x, i) => {
      const yc = H - 14 - x.clear/100*(H - 24), ys = H - 14 - x.score/100*(H - 24);
      if(x.clear > x.score) g += '<rect x="' + (i*bw + 1) + '" y="' + yc + '" width="' + (bw - 2) + '" height="' + (ys - yc) + '" rx="2" fill="#6c7c98" opacity=".7"/>';
      if(x.score > 0) g += '<rect x="' + (i*bw + 1) + '" y="' + ys + '" width="' + (bw - 2) + '" height="' + (H - 14 - ys) + '" rx="2" fill="url(#auG)"/>';
      const p = zonedParts(new Date(x.t - 1800e3), PLACE.tz);
      if(p.hour % 3 === 0) g += '<text x="' + (i*bw) + '" y="' + (H - 2) + '" class="gfT" style="text-anchor:start">' + esc(shortTime(p.hour*60)) + '</text>';
    });
    const dusk = hs.find(x => x.sun <= -12), set = auMoonSet(Date.now());
    const notes = [dusk ? "Dark from " + auHrTop(dusk.t) : "", set > 0 ? "moon sets " + auHr(set) : set === -1 ? "moon up all night" : "moon down"].filter(Boolean);
    h += '<section class="pc"><h3>Tonight hour by hour <span class="tapHint">chance of seeing it</span></h3>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="auSvg"><defs><linearGradient id="auG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ff0b0"/><stop offset="1" stop-color="#2fae7a"/></linearGradient></defs>' + g + '</svg>' +
      '<div class="auLeg"><span><b style="background:#4fd08f"></b>Good to look</span><span><b style="background:#6c7c98"></b>Clouds in the way</span></div>' +
      '<div class="sub">' + esc(notes.join(" · ")) + '</div></section>';
  }
  /* solar wind */
  const sw = auSWNow(), m = AU.sw && AU.sw.mag || [];
  if(sw && m.length){
    const W = 300, H = 96, t0 = m[0].t, t1 = m[m.length - 1].t, lim = Math.max(10, ...m.map(r => Math.abs(r.bz)));
    const X = t => (t - t0)/Math.max(1, t1 - t0)*W, Y = v => H/2 - v/lim*(H/2 - 8);
    const d = m.map((r, i) => (i ? "L" : "M") + X(r.t).toFixed(1) + "," + Y(r.bz).toFixed(1)).join("");
    const eta = sw.v ? Math.round(1.5e6/sw.v/60) : null;
    h += '<section class="pc"><h3>Solar wind now' + (eta ? ' <span class="tapHint">reaches Earth in ~' + eta + ' min</span>' : '') + '</h3>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="auSvg"><rect x="0" y="' + H/2 + '" width="' + W + '" height="' + H/2 + '" fill="rgba(111,240,176,.07)"/>' +
      '<line x1="0" y1="' + H/2 + '" x2="' + W + '" y2="' + H/2 + '" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"/>' +
      '<text x="2" y="11" class="gfT" style="text-anchor:start">Bz (nT) · last 2 h</text><text x="2" y="' + (H - 4) + '" class="gfT" style="text-anchor:start;fill:#6ff0b0">south = good</text>' +
      '<path d="' + d + '" fill="none" stroke="#6ff0b0" stroke-width="1.8"/></svg>' +
      '<div class="rows auRows"><div><span>Bz</span><b>' + (sw.bz <= 0 ? "−" : "+") + Math.abs(sw.bz).toFixed(0) + ' nT</b> ' + (sw.bz <= 0 ? "south" : "north") + '</div>' +
      '<div><span>Speed</span><b>' + Math.round(sw.v) + '</b> km/s</div>' +
      (sw.n != null ? '<div><span>Density</span><b>' + sw.n.toFixed(1) + '</b> /cm³</div>' : '') +
      '<div><span>Measured</span><b>' + esc(auHr(sw.t)) + '</b> at L1</div></div></section>';
  } else h += '<section class="pc"><h3>Solar wind now</h3><div class="sub">No reading from the spacecraft right now.</div></section>';
  /* Kp, next 3 days */
  if(AUR.kp){
    const now = Date.now(), need = auNeedKp(), bl = AUR.kp.filter(b => b.t + 3*3600e3 > now && b.t < now + 72*3600e3);
    if(bl.length){
      const W = 300, H = 84, bw = W/bl.length;
      let g = "";
      bl.forEach((b, i) => {
        const hh = clamp(b.kp/9, .04, 1)*(H - 18), col = b.kp >= need ? (b.kp >= 6 ? "#f29a3d" : "#f2c46d") : "#5b6d8c";
        g += '<rect x="' + (i*bw + 1) + '" y="' + (H - 14 - hh) + '" width="' + (bw - 2) + '" height="' + hh + '" rx="2" fill="' + col + '"/>';
        const p = zonedParts(new Date(b.t), PLACE.tz);
        if(p.hour < 3 && i) g += '<line x1="' + (i*bw) + '" y1="0" x2="' + (i*bw) + '" y2="' + (H - 12) + '" stroke="rgba(255,255,255,.2)"/>' +
          '<text x="' + (i*bw + 3) + '" y="' + (H - 2) + '" class="gfT" style="text-anchor:start">' + esc(dayName(p.year + "-" + pad(p.month) + "-" + pad(p.day))) + '</text>';
      });
      const ny = H - 14 - need/9*(H - 18);
      g += '<line x1="0" y1="' + ny + '" x2="' + W + '" y2="' + ny + '" stroke="#78e0f2" stroke-dasharray="4 3" opacity=".8"/>';
      h += '<section class="pc"><h3>Next 3 days <span class="tapHint">Kp forecast</span></h3><svg viewBox="0 0 ' + W + ' ' + H + '" class="auSvg">' + g + '</svg>' +
        '<div class="auLeg"><span><b style="background:#f2c46d"></b>Reaches you</span><span><b style="background:#f29a3d"></b>Kp 6+ storm</span><span><b style="background:#5b6d8c"></b>Below your Kp</span>' +
        '<span><b style="background:none;border-top:2px dashed #78e0f2;height:0;width:12px;border-radius:0"></b>Kp ' + need + ' line</span></div></section>';
    }
  }
  /* build 54: where's the aurora now sits at the bottom of this page */
  h += '<section class="pc" id="auGlobeIn"><h3>Where’s the aurora now <span class="tapHint auGT"></span></h3>' +
       '<div class="auHemi"><button data-h="n">Northern lights</button><button data-h="s">Southern lights</button></div>' +
       '<div class="auGBody"><div class="sub" style="padding:14px 0">Loading the map…</div></div></section>' +
       '<div class="sub auFine">Chance combines NOAA’s Kp forecast and OVATION model, the live solar wind, darkness, the moon and the cloud forecast. Aurora alerts are coming in Njord Sylv.</div>';
  el.querySelector(".auBody").innerHTML = h;
  $("auGlobeIn").querySelector(".auHemi").onclick = e => { const b = e.target.closest("[data-h]"); if(b){ AU.hemi = b.dataset.h; auGlobeDraw(); } };
  auGlobeLoad();
}

/* ---- where's the aurora now: globe from above the pole ----
   Coastlines: Natural Earth 1:110m land (public domain), shipped as land.json.
   Aurora: NOAA OVATION grid (both hemispheres). Night side from the sun's position. */
function auGlobeLoad(){
  if(!AU.hemi) AU.hemi = PLACE.lat >= 0 ? "n" : "s";
  const land = AU.land ? Promise.resolve(AU.land) : fetch("land.json").then(r => r.json()).then(j => (AU.land = j));
  const grid = AU.grid && Date.now() - AU.gridAt < 20*60e3 ? Promise.resolve(AU.grid)
    : cachedJSON(SWPC + "json/ovation_aurora_latest.json", 20*60e3).then(j => { AU.grid = j; AU.gridAt = Date.now(); return j; });
  Promise.all([land, grid.catch(() => null)]).then(() => auGlobeDraw()).catch(() => {
    const b = $("auGlobeIn"); if(b) b.querySelector(".auGBody").innerHTML = '<div class="sub">Couldn’t load the map right now.</div>';
  });
}
function auGlobeDraw(){
  const el = $("auGlobeIn"); if(!el || !AU.land) return;
  const south = AU.hemi === "s", R = 165, C = 180, d2 = Math.PI/180;
  el.querySelectorAll(".auHemi button").forEach(b => b.classList.toggle("on", b.dataset.h === AU.hemi));
  const here = (PLACE.lat < 0) === south;
  const lon0 = here ? PLACE.lng : south ? 147 : -95;
  const proj = (lat, lon) => {
    if(south){ lat = -lat; lon = -lon; }
    const l0 = south ? -lon0 : lon0, la = Math.max(lat, 0), r = R*Math.cos(la*d2), a = (lon - l0)*d2;
    return [C + r*Math.sin(a), C + r*Math.cos(a)];
  };
  const P = (lat, lon) => { const q = proj(lat, lon); return q[0].toFixed(1) + "," + q[1].toFixed(1); };
  /* land */
  let land = "";
  for(const ring of AU.land){
    let mx = -99, mn = 99; for(let i = 1; i < ring.length; i += 2){ if(ring[i] > mx) mx = ring[i]; if(ring[i] < mn) mn = ring[i]; }
    if((!south && mx < 0) || (south && mn > 0)) continue;
    let d = ""; for(let i = 0; i < ring.length; i += 2) d += (i ? "L" : "M") + P(ring[i + 1], ring[i]);
    land += d + "Z";
  }
  /* the sun: declination and the longitude where it is overhead */
  const now = new Date(), ss = sunSky({ lat: 0, lng: 0 }, now), dec = ss.dec;
  const ut = now.getUTCHours() + now.getUTCMinutes()/60, subLon = -(ut - 12)*15;
  const sunV = [Math.cos(dec*d2)*Math.cos(subLon*d2), Math.cos(dec*d2)*Math.sin(subLon*d2), Math.sin(dec*d2)];
  const cosz = (lat, lon) => Math.cos(lat*d2)*Math.cos(lon*d2)*sunV[0] + Math.cos(lat*d2)*Math.sin(lon*d2)*sunV[1] + Math.sin(lat*d2)*sunV[2];
  const cell = (la, lo, st) => { const s1 = south ? -1 : 1;
    return "M" + P(s1*la, lo) + "L" + P(s1*la, lo + st) + "L" + P(s1*(la + st), lo + st) + "L" + P(s1*(la + st), lo) + "Z"; };
  let night = "";
  for(let la = 0; la < 90; la += 3) for(let lo = -180; lo < 180; lo += 3){
    if(cosz((south ? -1 : 1)*(la + 1.5), lo + 1.5) < 0) night += cell(la, lo, 3);
  }
  /* aurora from OVATION */
  let aur = { a: "", b: "", c: "" }, here0 = null, best = 0;
  const g = AU.grid && AU.grid.coordinates;
  if(Array.isArray(g)){
    for(const c of g){
      const v = c[2], lat = c[1]; if(v < 4 || (south ? lat > 0 : lat < 0)) continue;
      const lon = c[0] > 180 ? c[0] - 360 : c[0];
      const k = v >= 30 ? "a" : v >= 12 ? "b" : "c";
      aur[k] += cell(Math.abs(lat) - .5, lon - .5, 1);
    }
    if(here){
      let bd = 1e9;
      for(const c of g){ const lon = c[0] > 180 ? c[0] - 360 : c[0];
        if(Math.abs(c[1] - PLACE.lat) > 1 || Math.abs(lon - PLACE.lng) > 1.5) continue;
        const d = Math.abs(c[1] - PLACE.lat) + Math.abs(lon - PLACE.lng); if(d < bd){ bd = d; here0 = c[2]; } }
      best = AUR.ov && AUR.ov.best ? AUR.ov.best.prob : 0;
    }
  }
  /* view line: where Kp-now aurora is just seen on the horizon */
  const kpN = kpAt(Date.now());
  let vl = "";
  if(kpN != null){
    const edge = horizonEdge(kpN), sgn = south ? -1 : 1;
    const pts = [];
    for(let lo = -180; lo <= 180; lo += 4){
      let lo2 = 10, hi = 89;
      if(Math.abs(magLat(sgn*hi, lo)) < edge || Math.abs(magLat(sgn*lo2, lo)) > edge){ pts.push(null); continue; }
      for(let it = 0; it < 22; it++){ const mid = (lo2 + hi)/2; if(Math.abs(magLat(sgn*mid, lo)) < edge) lo2 = mid; else hi = mid; }
      pts.push(P(sgn*lo2, lo));
    }
    let up = false; pts.forEach(p => { if(!p){ up = false; return; } vl += (up ? "L" : "M") + p; up = true; });
  }
  let pin = "";
  if(here){ const q = proj(PLACE.lat, PLACE.lng);
    pin = '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="5.5" fill="#fff" stroke="#0b111d" stroke-width="2"/>' +
          '<text x="' + q[0].toFixed(1) + '" y="' + (q[1] + 19).toFixed(1) + '" class="auPin">' + esc(placeName(PLACE)) + '</text>'; }
  const hemi = south ? "S" : "N";
  let rings = ""; for(const la of [30, 50, 70]){ const r = R*Math.cos(la*d2);
    rings += '<circle cx="' + C + '" cy="' + C + '" r="' + r.toFixed(1) + '"/>'; }
  const labs = [30, 50, 70].map(la => '<text x="' + (C + 3) + '" y="' + (C - R*Math.cos(la*d2) + 10).toFixed(1) + '">' + la + '°' + hemi + '</text>').join("");
  const svg = '<svg viewBox="0 0 360 360" class="auGlobeSvg"><defs><clipPath id="auClip"><circle cx="' + C + '" cy="' + C + '" r="' + R + '"/></clipPath>' +
    '<radialGradient id="auSea" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#1d3556"/><stop offset="100%" stop-color="#132a46"/></radialGradient>' +
    '<filter id="auSoft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2"/></filter></defs>' +
    '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="url(#auSea)"/><g clip-path="url(#auClip)">' +
    '<path d="' + land + '" fill="#3a5170" stroke="#5c7698" stroke-width=".5"/>' +
    '<path d="' + night + '" fill="rgba(4,8,18,.42)" filter="url(#auSoft)"/>' +
    '<g filter="url(#auSoft)"><path d="' + aur.c + '" fill="#b98cf0" fill-opacity=".35"/><path d="' + aur.b + '" fill="#a7f5c9" fill-opacity=".55"/><path d="' + aur.a + '" fill="#6ff0b0" fill-opacity=".85"/></g>' +
    '<g fill="none" stroke="rgba(200,220,245,.18)">' + rings + '</g><g class="auLat">' + labs + '</g>' +
    (vl ? '<path d="' + vl + '" fill="none" stroke="#f2c46d" stroke-width="1.8" stroke-dasharray="5 4"/>' : '') + pin + '</g>' +
    '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="rgba(160,200,255,.35)" stroke-width="1.5"/></svg>';
  const t = AU.grid && Date.parse(AU.grid["Forecast Time"] || "");
  el.querySelector(".auGT").textContent = "NOAA OVATION" + (isFinite(t) ? " · for " + auHr(t) : "");
  let info;
  if(!g) info = '<div class="sub">NOAA’s aurora model couldn’t be loaded right now.</div>';
  else if(here) info = '<h3>From ' + esc(placeName(PLACE)) + '</h3><div class="rows auRows"><div><span>Overhead</span><b>' + (here0 != null ? here0 : 0) + '%</b></div>' +
    '<div><span>Best in view</span><b>' + best + '%</b></div></div><div class="sub">North of the dashed view line, aurora can be seen low on the horizon.</div>';
  else info = '<h3>' + (south ? "Southern lights" : "Northern lights") + '</h3><div class="sub">' + (south
    ? "Aurora australis — best seen from Tasmania, southern New Zealand, Patagonia and Antarctica. Save a place there to get its chance."
    : "Aurora borealis — best seen from Alaska, Canada, Iceland, Scandinavia and northern Russia.") + '</div>';
  el.querySelector(".auGBody").innerHTML = '<div class="auGlobeCard">' + svg +
    '<div class="auLeg"><span><b style="background:#6ff0b0"></b>Likely</span><span><b style="background:#b98cf0"></b>Possible</span><span><b style="background:rgba(4,8,18,.7);border:1px solid #445"></b>Night</span>' +
    (vl ? '<span><b style="background:#f2c46d"></b>View line</span>' : '') + '</div></div><div class="auGInfo">' + info + '</div>';
}

window.phRedraw = () => { try { render(true); } catch(e){} };
window.njGraphOpen = () => gfOpen();
function moonImg(){
  try {
    const ph2 = SCENE.phase, R = 44;
    const src = moonSprite(R, ph2.elong, false);
    const flip = (!ph2.waxing) !== (PLACE.lat < 0);
    return '<img class="moonImg" alt="" src="' + src.toDataURL() + '"' + (flip ? ' style="transform:scaleX(-1)"' : "") + '>';
  } catch(e){ return ""; }
}
/* Today's path of the sun or moon across the sky, midnight to midnight:
   above the line is up, the dot is now, the dotted tick is its highest point. */
function localMidnight(){
  const now = Date.now(), p = zonedParts(new Date(now), PLACE.tz);
  return now - ((p.hour*60 + p.minute)*60 + (p.second || 0))*1000 - (now % 1000);
}
function arcSVG(body){
  const t0 = localMidnight(), N = 96, W = 300, k = 1.05, FLOOR = -22;
  const pos = body === "sun" ? sunSky : moonSky, pts = [];
  let hi = null, lo = 0;
  for(let i = 0; i <= N; i++){
    const t = t0 + i*86400e3/N, alt = pos(PLACE, new Date(t)).alt;
    pts.push([i, Math.max(FLOOR, alt)]);
    if(!hi || alt > hi.alt) hi = { i, alt, t };
    lo = Math.min(lo, Math.max(FLOOR, alt));
  }
  /* the horizon sits so the highest point just fits; below it, a short dip */
  const Y0 = Math.max(18, hi.alt*k + 10);
  for(const q of pts){ q[0] = W*q[0]/N; q[1] = Y0 - q[1]*k; }
  const H = Y0 - lo*k + 6;
  const line = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1)).join("");
  const col = body === "sun" ? "#f2c46d" : "#c9d6ee";
  const id = "clip" + body;
  const nowAlt = Math.max(FLOOR, pos(PLACE, new Date()).alt);
  const nx = W*(Date.now() - t0)/86400e3, ny = Y0 - nowAlt*k;
  const hx = W*hi.i/N, hy = Y0 - hi.alt*k;
  const top = -2;
  let svg = '<svg class="arc" viewBox="0 ' + top.toFixed(0) + ' ' + W + ' ' + (H - top).toFixed(0) + '">' +
    '<defs><clipPath id="' + id + '"><rect x="0" y="-100" width="' + W + '" height="' + (Y0 + 100) + '"/></clipPath>' +
    '<linearGradient id="g' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + col + '" stop-opacity=".30"/>' +
    '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + line + 'L' + W + ',' + Y0 + 'L0,' + Y0 + 'Z" fill="url(#g' + id + ')" clip-path="url(#' + id + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-opacity=".25" stroke-width="1.5" stroke-dasharray="3 4"/>' +
    '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2.2" clip-path="url(#' + id + ')"/>' +
    '<line x1="0" x2="' + W + '" y1="' + Y0 + '" y2="' + Y0 + '" stroke="rgba(200,214,236,.30)" stroke-width="1"/>';
  if(hi.alt > 0) svg += '<line x1="' + hx.toFixed(1) + '" x2="' + hx.toFixed(1) + '" y1="' + (hy + 6).toFixed(1) + '" y2="' + Y0 +
                        '" stroke="' + col + '" stroke-opacity=".5" stroke-dasharray="2 3"/>';
  svg += '<circle cx="' + nx.toFixed(1) + '" cy="' + ny.toFixed(1) + '" r="5.5" fill="' + col + '" stroke="#0b0f16" stroke-width="2"/></svg>';
  return { svg, high: hi };
}
function trio(a, b, c){
  return '<div class="trio"><div><span>' + a[0] + '</span><b>' + a[1] + '</b></div><div><span>' + b[0] + '</span><b>' + b[1] +
         '</b></div><div><span>' + c[0] + '</span><b>' + c[1] + '</b></div></div>';
}
function renderSky(){
  let html = "";
  const ev = SUNEV;
  try {
    const arc = arcSVG("sun");
    let note = "";
    if(ev && ev.alwaysUp) note = "Midnight sun";
    else if(ev && ev.alwaysDown) note = "Polar night";
    else if(ev && ev.rise != null && ev.set != null){ const len = ev.set - ev.rise; note = Math.floor(len/60) + " h " + Math.round(len % 60) + " min of daylight"; }
    html += '<div class="skyHead"><h3>Sun</h3><span>' + note + '</span></div>' + arc.svg +
      trio(["Sunrise", ev && ev.rise != null ? esc(fmtTime(ev.rise)) : "&ndash;"],
           ["Solar noon", arc.high.alt > 0 ? esc(fmtMs(arc.high.t)) : "&ndash;"],
           ["Sunset", ev && ev.set != null ? esc(fmtTime(ev.set)) : "&ndash;"]);
  } catch(e){}
  if(SCENE && SCENE.phase){
    try {
      const p2 = SCENE.phase, mv = MOONEV, arc = arcSVG("moon");
      const full = p2.toFull < p2.toNew, days = Math.round(full ? p2.toFull : p2.toNew);
      html += '<div class="skySep"></div><div class="skyHead"><h3>Moon</h3><span>' + (full ? "Full moon " : "New moon ") +
        (days < 1 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days") + '</span></div>' +
        '<div class="mrow">' + moonImg() + '<div><div class="big2">' + esc(sentence(p2.name)) + '</div><div class="sub">' +
        Math.round(p2.illum*100) + '% illuminated</div></div></div>' + arc.svg +
        trio(["Moonrise", mv && mv.rise != null ? esc(fmtTime(mv.rise)) : "&ndash;"],
             ["Highest", arc.high.alt > 0 ? esc(fmtMs(arc.high.t)) : "&ndash;"],
             ["Moonset", mv && mv.set != null ? esc(fmtTime(mv.set)) : "&ndash;"]);
    } catch(e){}
  }
  $("phSky").innerHTML = html;
}
/* ==== AVIATION (Njord Piloten, app build 58) ==================================
   Nearest airports with their flight category, from aviationweather.gov
   METARs through the Njord relay (aviationweather.gov blocks browser calls
   and limits requests, so the relay caches them for everyone nearby).
   For planning, not navigation. Shown only when the tier is Piloten
   (?tier=piloten previews it in a browser). */
const RELAY = "https://njord-met.aaran-74b.workers.dev";
const PILOTEN = (() => { try { const NA = window.NjordAndroid; if(NA && NA.tier && NA.tier() === "piloten") return true; } catch(e){}
  return /[?&]tier=piloten\b/.test(location.search); })();
root.classList.toggle("njPiloten", PILOTEN);
const AV = { key: "", at: 0, busy: false, list: null, err: "" };
const AV_CAT = { VFR: "#3fbf5f", MVFR: "#4a8cff", IFR: "#e0453a", LIFR: "#d23fd2" };
const avNM = km => km / 1.852;
function avLoad(force){
  if(!PILOTEN || !PLACE || AV.busy) return;
  const key = PLACE.lat.toFixed(2) + "," + PLACE.lng.toFixed(2);
  if(!force && key === AV.key && Date.now() - AV.at < 5*60e3) return;
  AV.busy = true;
  const lat = PLACE.lat, lng = PLACE.lng;
  cachedJSON(RELAY + "/metar?lat=" + lat.toFixed(2) + "&lon=" + lng.toFixed(2), force ? 0 : 3*60e3)
    .then(j => {
      AV.list = (Array.isArray(j) ? j : []).filter(m => m && m.icaoId && isFinite(m.lat) && isFinite(m.lon))
        .map(m => Object.assign({}, m, { km: kmBetween(lat, lng, m.lat, m.lon) }))
        .sort((a, b) => a.km - b.km);
      AV.err = "";
    })
    .catch(() => { AV.err = "Airport weather couldn’t be loaded right now."; })
    .finally(() => { AV.key = key; AV.at = Date.now(); AV.busy = false; renderAviation(); if(avOpenNow()) avDraw(); });
}
/* lowest broken/overcast layer (or vertical visibility), in feet */
function avCeiling(m){
  /* vertical visibility: METARs give hundreds of feet (VV002 -> 2), TAF periods give feet (VV002 -> 200) */
  if(m.vertVis != null && isFinite(m.vertVis) && +m.vertVis > 0) return { ft: m.rawOb ? +m.vertVis*100 : +m.vertVis, vv: true };
  const c = (m.clouds || []).filter(x => /^(BKN|OVC|OVX)$/.test(x.cover) && x.base != null).sort((a, b) => a.base - b.base)[0];
  return c ? { ft: c.base, cover: c.cover } : null;
}
function avWind(m){
  const s = +m.wspd || 0;
  if(!s) return "Calm";
  const d = m.wdir === "VRB" || m.wdir == null ? "Variable" : pad3(m.wdir) + "°";
  return d + " " + s + (m.wgst ? "G" + m.wgst : "") + " kt";
}
const pad3 = n => String(Math.round(+n) % 360 || 360).padStart(3, "0");
function avVis(m){
  const v = m.visib;
  if(v == null || v === "") return "";
  return (String(v).replace("+", "") === "10" || /\+$/.test(String(v)) ? "10+" : String(v)) + " SM";
}
function avSky(m){
  const c = avCeiling(m);
  if(c) return (c.vv ? "Sky obscured " : c.cover === "BKN" ? "Broken " : "Overcast ") + Number(c.ft).toLocaleString("en-US") + " ft";
  const top = (m.clouds || []).filter(x => x.base != null).sort((a, b) => a.base - b.base)[0];
  if(top) return (top.cover === "FEW" ? "Few " : "Scattered ") + Number(top.base).toLocaleString("en-US") + " ft";
  return m.cover === "CLR" || m.cover === "SKC" || m.cover === "CAVOK" ? "Clear" : "";
}
function avLine(m){ return [avWind(m), avVis(m), avSky(m), m.wxString ? wxWords(m.wxString) : ""].filter(Boolean).join(" · "); }
function avAge(m){
  const t = (m.obsTime || 0)*1000; if(!t) return "";
  const min = Math.round((Date.now() - t)/60e3);
  return min < 1 ? "now" : min < 60 ? min + " min ago" : Math.floor(min/60) + " h " + (min % 60) + " min ago";
}
function avRow(m, age){
  const cat = m.fltCat || "", col = AV_CAT[cat] || "#7d8aa3";
  return '<div class="avRow" data-id="' + esc(m.icaoId) + '"><span class="avCat" style="background:' + col + '">' + esc(cat || "—") + '</span>' +
    '<div class="avMain"><div class="avId"><span class="avNm"><b>' + esc(m.icaoId) + '</b> ' + esc(String(m.name || "").replace(/, [A-Z]{2}, [A-Z]{2}$/, "")) + '</span>' +
    '<span class="avDist">' + Math.round(avNM(m.km)) + ' NM</span></div>' +
    '<div class="avLine">' + esc(avLine(m)) + '</div>' + (age ? '<div class="avAge">' + esc(avAge(m)) + '</div>' : '') + '</div></div>';
}
function renderAviation(){
  const el = $("phAvi"); if(!el) return;
  if(!PILOTEN){ el.innerHTML = ""; return; }
  avLoad(false);
  let body;
  if(AV.list && AV.list.length) body = AV.list.slice(0, 3).map(m => avRow(m)).join("");
  else if(AV.list) body = '<div class="sub">No airport reports within about 100 km.</div>';
  else body = '<div class="sub">' + esc(AV.err || "Loading airport weather…") + '</div>';
  el.innerHTML = '<section class="pc avCard"><h3>Aviation <span class="tapHint">airports ›</span></h3>' + body + '</section>';
  el.firstChild.onclick = e => { const r = e.target.closest(".avRow[data-id]"); avOpen(); if(r) aptOpen(r.dataset.id); };
}
/* ---- Aviation page ---- */
const avOpenNow = () => { const e = $("avFull"); return !!(e && !e.hidden); };
function avOpen(){
  let el = $("avFull");
  if(!el){
    el = document.createElement("div"); el.id = "avFull";
    el.addEventListener("click", e => { const r = e.target.closest(".avRow[data-id]"); if(r) aptOpen(r.dataset.id); });
    el.innerHTML = '<div class="gfTop"><button class="rdB" id="avBack">‹ Aviation</button><span class="gfTitle avSub"></span></div><div class="avBody"></div>';
    document.body.appendChild(el);
    $("avBack").onclick = avClose;
  }
  el.hidden = false; avLoad(false); avDraw();
}
function avClose(){ const e = $("avFull"); if(e) e.hidden = true; }
function avDraw(){
  const el = $("avFull"); if(!el) return;
  el.querySelector(".avSub").textContent = "Nearest airports to " + placeName(PLACE);
  let h;
  if(AV.list && AV.list.length){
    h = '<section class="pc">' + AV.list.slice(0, 20).map(m => avRow(m, true)).join("") + '</section>';
    h += '<div class="avLeg">' + Object.keys(AV_CAT).map(k => '<span><b style="background:' + AV_CAT[k] + '"></b>' + k + '</span>').join("") + '</div>';
  } else h = '<section class="pc"><div class="sub">' + esc(AV.list ? "No airport reports within about 100 km." : AV.err || "Loading airport weather…") + '</div></section>';
  h += '<div class="sub auFine">Reports from aviationweather.gov (NOAA). Distances in nautical miles. For planning only — not for navigation.</div>';
  el.querySelector(".avBody").innerHTML = h;
}
/* ---- Airport detail (Piloten step 4): decoded METAR, TAF timeline, raw text ----
   Small fields often have no TAF (Willmar and Benson don't), so the nearest
   TAF is shown instead and says which airport it's from. */
const APT = { id: null, taf: null, tafErr: "" };
const aptOpenNow = () => { const e = $("aptFull"); return !!(e && !e.hidden); };
function aptClose(){ const e = $("aptFull"); if(e) e.hidden = true; }
function aptOpen(id){
  const m = (AV.list || []).find(x => x.icaoId === id); if(!m) return;
  let el = $("aptFull");
  if(!el){
    el = document.createElement("div"); el.id = "aptFull";
    el.innerHTML = '<div class="gfTop"><button class="rdB" id="aptBack">‹ Airports</button><span class="gfTitle aptSub"></span></div><div class="aptBody"></div>';
    document.body.appendChild(el);
    $("aptBack").onclick = aptClose;
  }
  el.hidden = false; el.scrollTop = 0;
  APT.id = id; APT.taf = null; APT.tafErr = ""; APT.rwy = null;
  aptDraw();
  rwyLoad().then(d => { if(APT.id !== id) return; APT.rwy = (d && d[id]) || []; if(aptOpenNow()) aptDraw(); });
  cachedJSON(RELAY + "/taf?lat=" + (+m.lat).toFixed(2) + "&lon=" + (+m.lon).toFixed(2), 10*60e3)
    .then(j => {
      if(APT.id !== id) return;
      const list = (Array.isArray(j) ? j : []).filter(t => t && t.icaoId && Array.isArray(t.fcsts) && t.fcsts.length);
      const own = list.find(t => t.icaoId === id);
      const near = list.map(t => Object.assign({}, t, { km: kmBetween(m.lat, m.lon, t.lat, t.lon) })).sort((a, b) => a.km - b.km)[0];
      APT.taf = own ? Object.assign({ km: 0 }, own) : near && near.km < 120 ? near : false;
    })
    .catch(() => { if(APT.id === id){ APT.taf = false; APT.tafErr = "The forecast couldn’t be loaded right now."; } })
    .finally(() => { if(APT.id === id && aptOpenNow()) aptDraw(); });
}
/* METAR / TAF weather codes in words: "-SHRA BR" -> "light rain showers, mist" */
const WX_DESC = { MI: "shallow", BC: "patches of", PR: "partial", DR: "low drifting", BL: "blowing", FZ: "freezing", TS: "thunderstorm with", SH: "showers of" };
const WX_PH = { DZ: "drizzle", RA: "rain", SN: "snow", SG: "snow grains", IC: "ice crystals", PL: "ice pellets", GR: "hail", GS: "small hail",
  UP: "unknown precipitation", BR: "mist", FG: "fog", FU: "smoke", VA: "volcanic ash", DU: "dust", SA: "sand", HZ: "haze", PY: "spray",
  PO: "dust whirls", SQ: "squalls", FC: "funnel cloud", SS: "sandstorm", DS: "duststorm" };
function wxWords(str){
  return String(str || "").trim().split(/\s+/).filter(Boolean).map(tok => {
    let t = tok, pre = "";
    if(t[0] === "-"){ pre = "light "; t = t.slice(1); } else if(t[0] === "+"){ pre = "heavy "; t = t.slice(1); }
    let vc = false; if(t.startsWith("VC")){ vc = true; t = t.slice(2); }
    if(t === "FC" && pre === "heavy ") return "tornado or waterspout";
    const parts = [];
    while(t.length >= 2){ parts.push(t.slice(0, 2)); t = t.slice(2); }
    let desc = "", ph = [];
    parts.forEach(p => { if(WX_DESC[p]) desc = p; else if(WX_PH[p]) ph.push(WX_PH[p]); });
    let w;
    if(desc === "SH") w = (ph.join(" and ") || "") + " showers";
    else if(desc === "TS") w = "thunderstorm" + (ph.length ? " with " + ph.join(" and ") : "");
    else w = (desc ? WX_DESC[desc] + " " : "") + ph.join(" and ");
    w = (pre + w).trim();
    return (vc ? w + " nearby" : w) || tok;
  }).join(", ");
}
/* FAA flight categories from ceiling (ft) and visibility (SM) */
function catOf(ceilFt, visSM){
  const c = ceilFt == null ? Infinity : ceilFt, v = visSM == null ? Infinity : visSM;
  if(c < 500 || v < 1) return "LIFR";
  if(c < 1000 || v < 3) return "IFR";
  if(c <= 3000 || v <= 5) return "MVFR";
  return "VFR";
}
const visNum = v => v == null || v === "" ? null : /\+$/.test(String(v)) ? parseFloat(v) + 0.01 : +v;
/* 0.5 -> "1/2 SM", 1.25 -> "1 1/4 SM", "6+" -> "6+ SM" */
function visTxt(v){
  if(v == null || v === "") return "";
  if(/\+$/.test(String(v))) return String(v) + " SM";
  const n = +v; if(!isFinite(n)) return String(v) + " SM";
  const w = Math.floor(n), fr = Math.round((n - w)*8)/8;
  const F = { 0.125: "1/8", 0.25: "1/4", 0.375: "3/8", 0.5: "1/2", 0.625: "5/8", 0.75: "3/4", 0.875: "7/8" }[fr];
  return (F ? (w ? w + " " : "") + F : String(Math.round(n*100)/100)) + " SM";
}
function cloudsTxt(cl, vv){
  if(vv) return "Sky obscured, vertical visibility " + Number(vv).toLocaleString("en-US") + " ft";
  const W = { FEW: "Few", SCT: "Scattered", BKN: "Broken", OVC: "Overcast", OVX: "Obscured" };
  const l = (cl || []).filter(c => c.base != null).map(c => (W[c.cover] || c.cover) + " " + Number(c.base).toLocaleString("en-US") + " ft" + (c.type === "CB" ? " (cumulonimbus)" : c.type === "TCU" ? " (towering cumulus)" : c.type ? " " + c.type : ""));
  return l.join(", ");
}
const tLocal = ms => fmtMs(ms);
function tDay(ms){
  const p = zonedParts(new Date(ms), PLACE.tz), q = zonedParts(new Date(), PLACE.tz);
  const same = p.year === q.year && p.month === q.month && p.day === q.day;
  return (same ? "" : DOW[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()] + " ") + fmtTime(p.hour*60 + p.minute);
}
/* the TAF's periods with what the pilot will actually get: change groups
   (TEMPO / PROB) fill missing items from the base period they sit in */
function tafPeriods(t){
  const base = [], temp = [];
  t.fcsts.forEach(f => {
    const g = f.fcstChange;
    const p = { from: f.timeFrom*1000, to: f.timeTo*1000, kind: g || "", prob: f.probability, f };
    if(g === "TEMPO" || g === "PROB") temp.push(p); else base.push(p);
  });
  base.sort((a, b) => a.from - b.from);
  /* BECMG keeps the earlier groups' items it doesn't mention */
  for(let i = 1; i < base.length; i++) if(base[i].kind === "BECMG"){
    const a = base[i - 1].f, b = base[i].f;
    base[i].f = Object.assign({}, a, Object.fromEntries(Object.entries(b).filter(([k, v]) => v != null && !(Array.isArray(v) && !v.length))));
  }
  const at = ms => base.filter(b => b.from <= ms).pop() || base[0];
  const fill = p => {
    const b = at(p.from).f, f = p.f;
    const pick = k => f[k] != null && !(Array.isArray(f[k]) && !f[k].length) ? f[k] : b[k];
    const clouds = f.clouds && f.clouds.length ? f.clouds : f.vertVis != null ? [] : b.clouds;
    const vv = f.vertVis != null ? f.vertVis : f.clouds && f.clouds.length ? null : b.vertVis;
    const m = { wdir: pick("wdir"), wspd: pick("wspd"), wgst: f.wspd != null ? f.wgst : b.wgst, visib: pick("visib"), clouds, vertVis: vv, wxString: f.wxString };
    const cg = (clouds || []).filter(c => /^(BKN|OVC|OVX)$/.test(c.cover) && c.base != null).sort((x, y) => x.base - y.base)[0];
    m.cat = catOf(vv ? +vv : cg ? cg.base : null, visNum(m.visib));
    return Object.assign(p, { m });
  };
  return { base: base.map(fill), temp: temp.map(fill) };
}
function periodWords(p){
  const m = p.m, bits = [];
  if(p.f.wspd != null || p.kind === "" || p.kind === "FM" || p.kind === "BECMG") bits.push("wind " + avWind(m).replace(/^Variable/, "variable").replace(/^Calm/, "calm"));
  if(p.f.visib != null || !p.kind || p.kind === "FM" || p.kind === "BECMG") if(m.visib != null) bits.push(visTxt(m.visib));
  if(p.f.wxString) bits.push(wxWords(p.f.wxString));
  const sky = cloudsTxt(m.clouds, m.vertVis) || (!p.kind || p.kind === "FM" || p.kind === "BECMG" ? "sky clear" : "");
  if(sky && (p.f.clouds && p.f.clouds.length || p.f.vertVis != null || !p.kind || p.kind === "FM" || p.kind === "BECMG")) bits.push(sky.charAt(0).toLowerCase() + sky.slice(1));
  if(p.f.wshearHgt) bits.push("wind shear at " + p.f.wshearHgt + "00 ft");
  return bits.join(", ");
}
function tafBlock(t, m){
  if(t === null) return '<div class="sub">Loading the forecast…</div>';
  if(!t) return '<div class="sub">' + esc(APT.tafErr || "No forecast (TAF) within about 120 km of this airport.") + '</div>';
  const P = tafPeriods(t), t0 = t.validTimeFrom*1000, t1 = t.validTimeTo*1000, span = Math.max(1, t1 - t0);
  const pct = ms => Math.max(0, Math.min(100, (ms - t0)/span*100));
  let h = '';
  if(t.icaoId !== m.icaoId)
    h += '<div class="aptNote">' + esc(m.icaoId) + ' has no forecast. Nearest: <b>' + esc(t.icaoId) + '</b> ' +
      esc(String(t.name || "").replace(/, [A-Z]{2}, [A-Z]{2}$/, "")) + ', ' + Math.round(avNM(t.km)) + ' NM away.</div>';
  /* the timeline: base periods on top, TEMPO / PROB underneath */
  h += '<div class="tafTL"><div class="tafRow">' + P.base.map(p => '<i style="left:' + pct(p.from) + '%;width:' + (pct(p.to) - pct(p.from)) + '%;background:' + AV_CAT[p.m.cat] + '"></i>').join("") + '</div>';
  if(P.temp.length) h += '<div class="tafRow tafTemp">' + P.temp.map(p => '<i style="left:' + pct(p.from) + '%;width:' + (pct(p.to) - pct(p.from)) + '%;background:' + AV_CAT[p.m.cat] + '"></i>').join("") + '</div>';
  const now = Date.now();
  if(now > t0 && now < t1) h += '<b class="tafNow" style="left:' + pct(now) + '%"></b>';
  /* ticks every 6 hours on the local clock */
  let ticks = '';
  for(let ms = Math.ceil(t0/3600e3)*3600e3; ms <= t1; ms += 3600e3){
    const hr = zonedParts(new Date(ms), PLACE.tz).hour;
    if(hr % 6) continue;
    const lab = CONFIG.clock24 ? String(hr).padStart(2, "0") : (hr % 12 || 12) + (hr < 12 ? "a" : "p");
    ticks += '<span style="left:' + pct(ms) + '%">' + (hr === 0 ? DOW[new Date(ms + 12*3600e3).getUTCDay()] : lab) + '</span>';
  }
  h += '<div class="tafTicks">' + ticks + '</div></div>';
  /* plain words */
  const rows = P.base.map(p => ({ p, at: p.from, lab: p === P.base[0] ? "From " + tDay(p.from) : (p.kind === "BECMG" ? "Becoming, " + tDay(p.from) + "–" + tLocal((p.f.timeBec || p.f.timeTo)*1000) : "From " + tDay(p.from)) }))
    .concat(P.temp.map(p => ({ p, at: p.from + 1, lab: (p.kind === "PROB" || p.prob ? (p.prob || 30) + "% chance" : "At times") + ", " + tDay(p.from) + "–" + tLocal(p.to) })))
    .sort((a, b) => a.at - b.at);
  h += '<div class="tafList">' + rows.map(r => '<div class="tafP' + (r.p.kind === "TEMPO" || r.p.kind === "PROB" ? ' tafPt' : '') + '"><span class="avCat" style="background:' + AV_CAT[r.p.m.cat] + '">' + r.p.m.cat + '</span><div><b>' + esc(r.lab) + '</b><br>' + esc(periodWords(r.p)) + '</div></div>').join("") + '</div>';
  h += '<div class="aptRaw">' + esc(t.rawTAF || "") + '</div>';
  h += '<div class="sub auFine">Issued ' + esc(tDay(Date.parse(t.issueTime) || t0)) + '. Times are ' + esc(placeName(PLACE)) + ' local time.</div>';
  return h;
}
/* ---- Runways (Piloten step 5): diagram + head / crosswind per runway end ----
   Runways from OurAirports (public domain), built into runways.json at compile
   time by tools/build_runways.py. Row: [le, he, len, wid, surf, lit, lat1, lon1,
   lat2, lon2, hdgT, leDisp, heDisp]. METAR wind is true, so it's compared with
   true runway headings; with no heading or ends, the runway number is used. */
let RWY = null;
function rwyLoad(){
  if(!RWY) RWY = fetch("runways.json").then(r => r.ok ? r.json() : Promise.reject(r.status)).catch(() => { RWY = null; return {}; });
  return RWY;
}
const SURF = { A: "asphalt", C: "concrete", P: "paved", T: "turf", G: "gravel", D: "dirt", W: "water", S: "snow / ice", "?": "" };
const SURF_COL = { A: "#7b8496", C: "#9aa3b2", P: "#8a93a3", T: "#4f8f4a", G: "#a08a63", D: "#8d6e4f", W: "#3f7fc7", S: "#cfd8e6", "?": "#7b8496" };
function bearing(la1, lo1, la2, lo2){
  const f1 = la1*Math.PI/180, f2 = la2*Math.PI/180, dl = (lo2 - lo1)*Math.PI/180;
  const y = Math.sin(dl)*Math.cos(f2), x = Math.cos(f1)*Math.sin(f2) - Math.sin(f1)*Math.cos(f2)*Math.cos(dl);
  return (Math.atan2(y, x)*180/Math.PI + 360) % 360;
}
/* each runway with its two ends' true headings; approx when only the number is known */
function rwyList(rows){
  return (rows || []).map(r => {
    const [le, he, len, wid, surf, lit, a1, o1, a2, o2, hdg, d1, d2] = r;
    const ends = a1 != null && a2 != null && o1 != null && o2 != null;
    let h = hdg != null ? hdg : ends ? bearing(a1, o1, a2, o2) : null, approx = false;
    if(h == null){ const n = parseInt(le, 10); if(n >= 1 && n <= 36){ h = n*10; approx = true; } }
    return { le, he, len, wid, surf, lit, a1, o1, a2, o2, d1, d2, ends, h, approx };
  });
}
/* wind components for a runway end facing heading h (true): + head, + cross from the right */
function comps(wdir, spd, h){
  const a = (wdir - h)*Math.PI/180;
  return { head: spd*Math.cos(a), cross: spd*Math.sin(a) };
}
function windFor(end, m){
  const spd = +m.wspd || 0, g = +m.wgst || 0;
  if(!spd) return { txt: "Calm", score: 0 };
  if(m.wdir === "VRB" || m.wdir == null)
    return { txt: "Variable — crosswind up to " + Math.max(spd, g) + " kt", score: 0 };
  const c = comps(+m.wdir, spd, end.h), cg = g ? comps(+m.wdir, g, end.h) : null;
  const hw = Math.round(c.head), xw = Math.round(Math.abs(c.cross));
  const bits = [hw >= 0 ? (hw ? "headwind " + hw + " kt" : "no headwind") : "tailwind " + (-hw) + " kt"];
  bits.push(xw ? "crosswind " + xw + " kt from the " + (c.cross > 0 ? "right" : "left") : "no crosswind");
  if(cg && Math.round(Math.abs(cg.cross)) > xw) bits.push("gusts " + Math.round(Math.abs(cg.cross)) + " kt across");
  return { txt: bits.join(", "), score: c.head - Math.abs(c.cross)*0.25, tail: hw < 0 };
}
function rwyDiagram(list, m){
  const L = list.filter(r => r.h != null);
  if(!L.length) return "";
  /* local flat projection around the airport, metres */
  const lat0 = +m.lat, lon0 = +m.lon, kx = 111320*Math.cos(lat0*Math.PI/180), ky = 110540;
  const segs = L.map(r => {
    let x1, y1, x2, y2;
    if(r.ends){ x1 = (r.o1 - lon0)*kx; y1 = (r.a1 - lat0)*ky; x2 = (r.o2 - lon0)*kx; y2 = (r.a2 - lat0)*ky; }
    else { const half = (r.len || 3000)*0.3048/2, t = r.h*Math.PI/180; x1 = -Math.sin(t)*half; y1 = -Math.cos(t)*half; x2 = -x1; y2 = -y1; }
    return Object.assign({ x1, y1, x2, y2 }, r);
  });
  const xs = segs.flatMap(s => [s.x1, s.x2]), ys = segs.flatMap(s => [s.y1, s.y2]);
  const cx = (Math.min(...xs) + Math.max(...xs))/2, cy = (Math.min(...ys) + Math.max(...ys))/2;
  /* fit the runways inside a circle, leaving a clear ring for the wind arrow and its label */
  const rmax = Math.max(300, ...segs.flatMap(s => [Math.hypot(s.x1 - cx, s.y1 - cy), Math.hypot(s.x2 - cx, s.y2 - cy)]));
  const S = 300, k = (S/2 - 74)/rmax;
  const P = (x, y) => [S/2 + (x - cx)*k, S/2 - (y - cy)*k];
  let g = '';
  segs.forEach(s => {
    const [X1, Y1] = P(s.x1, s.y1), [X2, Y2] = P(s.x2, s.y2);
    const w = Math.max(5, Math.min(14, (s.wid || 75)*0.3048*k*1.6));
    g += '<line x1="' + X1.toFixed(1) + '" y1="' + Y1.toFixed(1) + '" x2="' + X2.toFixed(1) + '" y2="' + Y2.toFixed(1) +
      '" stroke="' + SURF_COL[s.surf] + '" stroke-width="' + w.toFixed(1) + '" stroke-linecap="butt"/>';
    if(s.surf !== "T" && s.surf !== "W" && s.surf !== "D" && s.surf !== "G")
      g += '<line x1="' + X1.toFixed(1) + '" y1="' + Y1.toFixed(1) + '" x2="' + X2.toFixed(1) + '" y2="' + Y2.toFixed(1) +
        '" stroke="rgba(255,255,255,.55)" stroke-width="0.8" stroke-dasharray="5 4"/>';
    /* end labels just beyond each end */
    const dx = X2 - X1, dy = Y2 - Y1, d = Math.hypot(dx, dy) || 1, ux = dx/d, uy = dy/d;
    g += '<text x="' + (X1 - ux*13).toFixed(1) + '" y="' + (Y1 - uy*13 + 4).toFixed(1) + '">' + esc(s.le) + '</text>';
    if(s.he) g += '<text x="' + (X2 + ux*13).toFixed(1) + '" y="' + (Y2 + uy*13 + 4).toFixed(1) + '">' + esc(s.he) + '</text>';
  });
  /* wind: an arrow coming in from where the wind blows from */
  let wa = '';
  if(+m.wspd && m.wdir != null && m.wdir !== "VRB"){
    const t = +m.wdir*Math.PI/180, R0 = S/2 - 4, R1 = S/2 - 62;
    const ax = S/2 + Math.sin(t)*R0, ay = S/2 - Math.cos(t)*R0, bx = S/2 + Math.sin(t)*R1, by = S/2 - Math.cos(t)*R1;
    const hx = -Math.sin(t), hy = Math.cos(t), nx = Math.cos(t), ny = Math.sin(t);
    wa = '<g class="rwWind"><line x1="' + ax.toFixed(1) + '" y1="' + ay.toFixed(1) + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) + '"/>' +
      '<path d="M' + (bx + hx*2).toFixed(1) + ' ' + (by + hy*2).toFixed(1) + ' L' + (bx - hx*9 + nx*6).toFixed(1) + ' ' + (by - hy*9 + ny*6).toFixed(1) +
      ' L' + (bx - hx*9 - nx*6).toFixed(1) + ' ' + (by - hy*9 - ny*6).toFixed(1) + 'Z"/>';
    /* "270° 5 kt" above the shaft, "from the W" below, along the arrow and never upside down */
    let ang = Math.atan2(by - ay, bx - ax)*180/Math.PI;
    if(ang > 90) ang -= 180; else if(ang < -90) ang += 180;
    const mx = (ax + bx)/2, my = (ay + by)/2;
    wa += '<g transform="translate(' + mx.toFixed(1) + ' ' + my.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')">' +
      '<text class="rwWt" x="0" y="-7">' + esc(avWind(m)) + '</text>' +
      '<text class="rwWt rwWf" x="0" y="15">from the ' + compassOf(+m.wdir) + '</text></g></g>';
  }
  return '<svg class="rwSvg" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Runway diagram">' +
    '<text class="rwN" x="' + (S - 14) + '" y="18">N↑</text>' + g + wa + '</svg>';
}
function rwyBlock(rows, m){
  if(rows === null) return '<div class="sub">Loading runways…</div>';
  const list = rwyList(rows);
  if(!list.length) return '<div class="sub">No runway data for this airport.</div>';
  /* every runway end with its wind; the best one marked */
  const ends = [];
  list.forEach(r => {
    if(r.h == null) return;
    ends.push({ name: r.le, h: r.h, r });
    if(r.he) ends.push({ name: r.he, h: (r.h + 180) % 360, r });
  });
  ends.forEach(e => e.w = windFor(e, m));
  const windy = +m.wspd && m.wdir != null && m.wdir !== "VRB";
  const best = windy ? ends.reduce((a, b) => b.w.score > a.w.score ? b : a, ends[0]) : null;
  let h = rwyDiagram(list, m);
  h += '<div class="rwList">' + list.map(r => {
    const info = [r.le + (r.he ? "/" + r.he : ""), r.len ? r.len.toLocaleString("en-US") + (r.wid ? " × " + r.wid : "") + " ft" : "", SURF[r.surf], r.lit ? "lighted" : ""].filter(Boolean);
    const rows2 = ends.filter(e => e.r === r).map(e => '<div class="rwEnd' + (e === best ? ' rwBest' : '') + (e.w.tail ? ' rwTail' : '') + '"><b>' + esc(e.name) + '</b><span>' + esc(e.w.txt) + (e === best ? ' · <em>favoured</em>' : '') + '</span></div>').join("");
    return '<div class="rwRw"><div class="rwInfo">' + esc(info.join(" · ")) + (r.approx ? ' <small>(heading from the runway number)</small>' : '') + '</div>' + rows2 + '</div>';
  }).join("") + '</div>';
  h += '<div class="sub auFine">Wind from the latest METAR (true), against true runway headings. Runways: OurAirports. Not for navigation.</div>';
  return h;
}
function aptDraw(){
  const el = $("aptFull"); if(!el) return;
  const m = (AV.list || []).find(x => x.icaoId === APT.id); if(!m){ aptClose(); return; }
  el.querySelector(".aptSub").textContent = Math.round(avNM(m.km)) + " NM from " + placeName(PLACE);
  const cat = m.fltCat || "", F = CONFIG.units === "imperial";
  const cF = c => Math.round(c*9/5 + 32);
  const tmp = c => c == null ? "" : F ? cF(c) + "°F (" + Math.round(c) + "°C)" : Math.round(c) + "°C";
  const rows = [
    ["Wind", avWind(m) + (m.wdir != null && m.wdir !== "VRB" && +m.wspd ? " — from the " + compassOf(+m.wdir) : "")],
    ["Visibility", visTxt(m.visib)],
    ["Weather", wxWords(m.wxString)],
    ["Sky", cloudsTxt(m.clouds, m.vertVis != null ? +m.vertVis*100 : null) || (m.cover === "CLR" || m.cover === "SKC" ? "Clear below 12,000 ft" : m.cover === "CAVOK" ? "Ceiling and visibility OK" : "")],
    ["Temperature", tmp(m.temp)],
    ["Dew point", tmp(m.dewp) + (m.temp != null && m.dewp != null ? " · spread " + Math.round(F ? (m.temp - m.dewp)*9/5 : m.temp - m.dewp) + "°" : "")],
    ["Altimeter", m.altim ? (m.altim*0.0295300).toFixed(2) + " inHg · " + Math.round(m.altim) + " hPa" : ""],
    ["Elevation", m.elev != null ? Math.round(m.elev*3.28084).toLocaleString("en-US") + " ft" : ""]
  ].filter(r => r[1]);
  let h = '<section class="pc aptHead"><span class="avCat aptCat" style="background:' + (AV_CAT[cat] || "#7d8aa3") + '">' + esc(cat || "—") + '</span>' +
    '<div><div class="aptId">' + esc(m.icaoId) + '</div><div class="aptName">' + esc(String(m.name || "").replace(/, [A-Z]{2}, [A-Z]{2}$/, "")) + '</div></div></section>';
  h += '<section class="pc"><h3>Now <span class="tapHint">' + esc(avAge(m)) + '</span></h3><div class="aptKV">' +
    rows.map(r => '<div><span>' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>').join("") + '</div>' +
    '<div class="aptRaw">' + esc(m.rawOb || "") + '</div></section>';
  h += '<section class="pc"><h3>Runways <span class="tapHint">' + esc(avWind(m)) + '</span></h3>' + rwyBlock(APT.rwy, m) + '</section>';
  h += '<section class="pc"><h3>Forecast (TAF)</h3>' + tafBlock(APT.taf, m) + '</section>';
  h += '<div class="sub auFine">From aviationweather.gov (NOAA). For planning only — not for navigation.</div>';
  el.querySelector(".aptBody").innerHTML = h;
}
/* aurora: a green note at the top of the cards when it is active or expected
   tonight - the same note the desktop shows under the moon */
function renderPlaces(){
  const list = loadPlaces(), h = here();
  /* a saved place that is where you are now folds into the My location chip
     (its x still removes it from the saved list) */
  const dup = h ? list.findIndex(p => sameTown(p, h)) : -1;
  const pin = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/></svg>';
  /* app build 30: Home is a chip too (cleared from Settings > Open at, so no x) */
  const hm = homeOf();
  const house = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>';
  $("phPlaces").querySelector(".chips").innerHTML =
    '<span class="chip here' + (isHere(PLACE) ? " on" : "") + '" data-here="1">' + pin + 'My location' +
      (dup >= 0 ? ' <span class="hereName">&middot; ' + esc(placeName(list[dup])) + '</span><span class="x" data-x="' + dup + '">&times;</span>' : '') + '</span>' +
    (hm ? '<span class="chip home' + (sameTown(hm, PLACE) && !isHere(PLACE) ? " on" : "") + '" data-home="1">' + house + esc(placeName(hm)) + '</span>' : '') +
    list.map((p, i) => i === dup || (hm && sameTown(p, hm)) ? '' : '<span class="chip' + (sameTown(p, PLACE) ? " on" : "") + '" data-i="' + i + '">' +
                        esc(placeName(p)) + '<span class="x" data-x="' + i + '">&times;</span></span>').join("");
  const saved = list.some(p => sameTown(p, PLACE));
  const btn = $("phSave");
  const full = !saved && FREE && freeCount() >= FREE_PLACES;
  if(full) btn.innerHTML = LOCK_SVG + esc("Save " + placeName(PLACE));
  else btn.textContent = saved ? "Saved ✓" : "Save " + placeName(PLACE);
  btn.classList.toggle("locked", full);
  btn.disabled = saved;
}

/* ---- interactions ----------------------------------------------------------- */
$("phDays").addEventListener("click", e => {
  const w = e.target.closest(".dwrap");
  if(!w) return;
  const i = +w.dataset.d;
  openDay = openDay === i ? -1 : i;
  $("phDays").querySelectorAll(".dwrap").forEach(el => el.classList.toggle("open", +el.dataset.d === openDay));
});
$("phPlaces").addEventListener("click", e => {
  const x = e.target.closest("[data-x]");
  if(x){ const list = loadPlaces(); list.splice(+x.dataset.x, 1); savePlaces(list); render(true); return; }
  const c = e.target.closest(".chip");
  if(!c) return;
  /* picking a place closes Settings so you see it */
  setEl.hidden = true; gearEl.classList.remove("on");
  if(c.dataset.here) goHere();
  else if(c.dataset.home) goPlace(homeOf());
  else goPlace(loadPlaces()[+c.dataset.i]);
});
$("phSave").addEventListener("click", () => {
  const list = loadPlaces();
  /* Njord Free: at the limit nothing is saved (app build 48: a short note, no sheet) */
  if(FREE && freeCount() >= FREE_PLACES){ njNote("Njord Free keeps " + FREE_PLACES + " saved places. More are coming in Njord, the paid version."); return; }
  if(!list.some(p => sameTown(p, PLACE))){ list.push(Object.assign({}, PLACE)); savePlaces(list); }
  render(true);
});
$("phPlaces").addEventListener("click", e => { if(e.target.closest("[data-up]")){ e.stopPropagation(); openUpsell(); } }, true);
$("phLoc").addEventListener("click", () => { try { useMyLocation(); } catch(e){} });
$("phSearch").addEventListener("click", () => {
  if(!setEl.hidden){ setEl.hidden = true; gearEl.classList.remove("on"); }
  showUI(); pointerIn = true; qEl.focus();
});
$("phGear").addEventListener("click", () => {
  showUI(); pointerIn = true;
  if(setEl.hidden) gearEl.click();
});
$("phHero").addEventListener("click", e => { if(e.target.closest("#phAlertPill")){ e.stopPropagation(); openAlerts(); } });
mini.addEventListener("click", () => ph.scrollTo({ top: 0, behavior: "smooth" }));
$("phJump").addEventListener("click", e => {
  e.preventDefault();
  ph.scrollTo({ top: $("phDays").offsetTop - 12, behavior: "smooth" });
});
/* the round buttons fade once the cards scroll up under them */
ph.addEventListener("scroll", () => {
  const away = ph.scrollTop > window.innerHeight*0.3;
  bar.classList.toggle("dim", away);
  mini.classList.toggle("on", away && isPhone() && alertSheet.hidden);
}, { passive: true });

/* the sky: a tap goes to the scene (warning banner, aurora badge), a sideways
   swipe moves between saved places, and anything else scrolls the sheet */
const top = $("phTop");
$("phHero").addEventListener("click", e => { if(e.target.closest("#phUpd")){ e.stopPropagation(); phRefresh(); } });
let tx0 = 0, ty0 = 0, tt0 = 0;
top.addEventListener("touchstart", e => { const t = e.touches[0]; tx0 = t.clientX; ty0 = t.clientY; tt0 = Date.now(); }, { passive: true });
top.addEventListener("touchend", e => {
  const t = e.changedTouches[0], dx = t.clientX - tx0, dy = t.clientY - ty0;
  if(Math.abs(dx) > 60 && Math.abs(dx) > 2*Math.abs(dy) && Date.now() - tt0 < 800){
    const h = here();
    const hm = homeOf(), list = h ? [h] : [];
    if(hm && !list.some(p => sameTown(p, hm))) list.push(hm);
    for(const p of loadPlaces()) if(!list.some(q => sameTown(q, p))) list.push(p);
    if(list.length < 1) return;
    let i = list.findIndex(p => samePlace(p, PLACE));
    i = i < 0 ? 0 : (i + (dx < 0 ? 1 : -1) + list.length) % list.length;
    if(samePlace(list[i], PLACE)) return;
    if(h && i === 0) goHere(); else goPlace(list[i]);
  }
}, { passive: true });
top.addEventListener("click", e => {
  if(ui.classList.contains("on") && !busy()){ pointerIn = false; hideUI(); return; }
  canvas.dispatchEvent(new MouseEvent("click", { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
});

/* Android back button: close what is open, then scroll the sheet home */
window.njordBack = function(){
  if(aptOpenNow()){ aptClose(); return true; }
  if(avOpenNow()){ avClose(); return true; }
  if(auOpenNow()){ auClose(); return true; }
  if(gfOpenNow()){ const el = $("gfFull"); if(el.querySelector(".gfDrawer.open")) el.gfDrawer(false); else gfClose(); return true; }
  if(rdOpenNow()){ if(!$("rdLay").hidden) $("rdLay").hidden = true; else if(!$("rdSet").hidden) $("rdSet").hidden = true; else rdClose(); return true; }
  if(upsellOpen()){ closeUpsell(); return true; }
  if(!alertSheet.hidden){ closeAlerts(); return true; }
  if(typeof alertBoxOpen === "function" && alertBoxOpen()){ closeAlertBox(); return true; }
  const pop = $("aurPop"); if(pop && !pop.hidden){ closeAuroraPop(); return true; }
  if(ui.classList.contains("on")){
    qEl.blur(); qEl.value = ""; if(!setEl.hidden){ setEl.hidden = true; gearEl.classList.remove("on"); }
    pointerIn = false; ui.classList.remove("on"); resEl.innerHTML = ""; return true;
  }
  if(openDay >= 0){ openDay = -1; $("phDays").querySelectorAll(".dwrap.open").forEach(el => el.classList.remove("open")); return true; }
  if(ph.scrollTop > 10){ ph.scrollTo({ top: 0, behavior: "smooth" }); return true; }
  return false;
};

/* Where the app opens: at home if one is set, otherwise wherever the phone
   is. Checked at launch and again when coming back after half an hour away.
   Only the phone's own location is used here - no network-based guess,
   which on a VPN lands in the wrong city - and a failed or refused lookup
   simply leaves the last place showing. */
const hasHome = () => !!STORE.get("weather.home");
/* app build 29: Settings > Open at - My location, Home or Last viewed. Before
   this the rule was "home if one is set, otherwise My location", which is
   still the answer until the switch is touched. Home with no home set falls
   back to My location. */
const OKEY = "njord.openAt";
const openAt = () => njOpenAt() || (hasHome() ? "home" : "here");
const effOpenAt = () => { const v = openAt(); return v === "home" && !hasHome() ? "here" : v; };
/* "My location": the last place the phone's own location resolved to, kept so
   swiping or tapping can always bring you back to it */
const HKEY = "njord.here";
function here(){ try { return JSON.parse(STORE.get(HKEY) || "null"); } catch(e){ return null; } }
const placeFromBDCWide = window.placeFromBDC;
try {
  window.placeFromBDC = function(j, lat, lng, approx){
    placeFromBDCWide.apply(this, arguments);
    if(!approx) STORE.set(HKEY, JSON.stringify(Object.assign({}, PLACE, { at: Date.now() })));
  };
} catch(e){}
const isHere = p => { const h = here(); return !!h && sameTown(h, p); };
/* go back to "My location": the remembered spot at once, then a fresh fix */
function goHere(){
  const h = here();
  if(h && !samePlace(h, PLACE)) goPlace(h);
  locateHere(true);
}
let lastLocate = 0;
function locateHere(manual){
  if(!navigator.geolocation) return;
  lastLocate = Date.now();
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    if((effOpenAt() !== "here" || NJ_GOTO) && !manual) return;
    /* only move if we are still on (or heading to) "My location" */
    if(manual && !isHere(PLACE) && here()) return;
    if(kmBetween(lat, lng, PLACE.lat, PLACE.lng) < 2){             // already here: remember it as My location
      STORE.set(HKEY, JSON.stringify(Object.assign({}, PLACE, { at: Date.now() }))); render(true); return;
    }
    fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en&latitude=" + lat + "&longitude=" + lng)
      .then(r => r.ok ? r.json() : Promise.reject(0))
      .then(j => placeFromBDC(j, lat, lng, false))
      .catch(() => placeFromBDC({}, lat, lng, false))
      .then(() => render(true));
  }, () => {}, { enableHighAccuracy: false, timeout: 10000, maximumAge: 5*60000 });
}
if(APP && effOpenAt() === "here" && !NJ_GOTO) setTimeout(locateHere, 300);
document.addEventListener("visibilitychange", () => {
  if(!document.hidden && APP && effOpenAt() === "here" && Date.now() - lastLocate > 30*60000) locateHere();
});
/* Settings: in the app, "Home" means only a home you chose. Without one the
   panel says so (the wallpaper's built-in default home is not shown), and
   with one there is a Clear button. */
const syncSettingsWide = window.syncSettings;
function syncHomeUI(){
  if(!APP) return;
  const txt = $("homeTxt"), go = $("sHomeGo");
  let clr = $("sHomeClear");
  if(!clr){
    clr = document.createElement("button"); clr.id = "sHomeClear"; clr.textContent = "Clear home";
    clr.addEventListener("mousedown", e => e.preventDefault());
    clr.addEventListener("click", () => { clearHome(); showUI(); });
    $("sHomeSet").parentNode.appendChild(clr);
  }
  let oa = $("sOpenAt");
  if(!oa && txt){
    oa = document.createElement("div"); oa.className = "seg"; oa.id = "sOpenAt"; oa.style.marginBottom = "8px";
    oa.innerHTML = '<button data-oa="here">My location</button><button data-oa="home">Home</button><button data-oa="last">Last viewed</button>';
    oa.addEventListener("mousedown", e => e.preventDefault());
    oa.addEventListener("click", e => {
      const b = e.target.closest("[data-oa]"); if(!b) return;
      STORE.set(OKEY, b.dataset.oa); syncHomeUI(); pushPrefs(); showUI();
    });
    txt.parentNode.insertBefore(oa, txt);
    const h4 = oa.previousElementSibling;
    if(h4 && h4.tagName === "H4") h4.textContent = "Open at";
  }
  if(oa) oa.querySelectorAll("[data-oa]").forEach(b => b.classList.toggle("on", b.dataset.oa === openAt()));
  let home = null;
  try { home = JSON.parse(STORE.get("weather.home") || "null"); } catch(e){}
  if(!home){
    if(txt) txt.textContent = "Home: not set" + (openAt() === "home" ? " \u2014 opens at My location until you set one" : "") +
                              ". To set it, show a place and choose Make current place home.";
    if(go) go.style.display = "none";
    clr.style.display = "none";
  } else {
    if(txt) txt.textContent = "Home: " + placeName(home) + (samePlace(home, PLACE) ? "  (showing now)" : "");
    if(go) go.style.display = "";
    clr.style.display = "";
  }
  syncAlertsUI();
  syncDailyUI();
}
try { window.syncSettings = function(){ syncSettingsWide.apply(this, arguments); syncHomeUI(); pushPrefs(); }; } catch(e){}
setTimeout(syncHomeUI, 0);
function clearHome(){
  try { window.localStorage.removeItem("weather.home"); } catch(e){}
  try { STORE.set("weather.home", ""); } catch(e){}
  try { syncSettings(); } catch(e){}
  syncHomeUI();
  render(true);
  locateHere();
}

/* ---- Weather alerts (US) as notifications - Android app, build 29 ----------
   The settings live here; the checking is done by the app itself (a
   background job every ~15 minutes asks api.weather.gov), so it works with
   the app closed. "Alerts for": My location only, My location + selected
   places, or selected places only. Warnings and watches notify, and so do
   their updates and cancellations; advisories stay in the app. */
const NA = window.NjordAndroid || null;
const AKEY = "njord.alerts";
const pkey = p => (+p.lat).toFixed(3) + "," + (+p.lng).toFixed(3);
function alertPrefs(){
  let j = null; try { j = JSON.parse(STORE.get(AKEY) || "null"); } catch(e){}
  if(!j || typeof j !== "object") j = {};
  return { on: !!j.on, mode: FREE ? "here" : ["here","both","places"].includes(j.mode) ? j.mode : "both", sel: Array.isArray(j.sel) ? j.sel : null };
}
function homePlace(){ try { const h = JSON.parse(STORE.get("weather.home") || "null"); return h && isFinite(h.lat) ? h : null; } catch(e){ return null; } }
/* home first, then the saved places, one row per town */
function alertCandidates(){
  const out = [], h = homePlace();
  if(h) out.push(Object.assign({}, h, { isHome: true }));
  for(const p of loadPlaces()) if(!out.some(q => sameTown(q, p))) out.push(p);
  return out;
}
const usOK = p => !p.cc || String(p.cc).toUpperCase() === "US";
function selectedKeys(ap){
  /* first time: home and every saved US place */
  return ap.sel || alertCandidates().filter(usOK).map(pkey);
}
function saveAlertPrefs(ap){ STORE.set(AKEY, JSON.stringify(ap)); pushPrefs(); }
function permState(){ try { return NA && NA.permState ? JSON.parse(NA.permState()) : null; } catch(e){ return null; } }
/* everything the widget and the alert checker need, handed to the app */
function pushPrefs(){
  if(!NA || !NA.setPrefs) return;
  const ap = alertPrefs(), keys = selectedKeys(ap), cand = alertCandidates();
  const strip = p => p && ({ name: p.name, short: p.short || p.name, lat: +p.lat, lng: +p.lng, tz: p.tz || null, cc: p.cc || null });
  try {
    NA.setPrefs(JSON.stringify({
      units: unitsKey(), clock24: !!CONFIG.clock24, openAt: openAt(),
      home: strip(homePlace()), here: strip(here()), places: loadPlaces().map(strip),
      alerts: { on: ap.on, mode: ap.mode, places: cand.filter(p => keys.includes(pkey(p)) && usOK(p)).map(strip) },
      daily: FREE ? { on: false } : (() => { const dp = dailyPrefs(); return { on: dp.on, n: dp.n, times: dp.times.slice(0, dp.n), src: dp.src, place: strip(dp.place), buzz: dp.buzz }; })()
    }));
  } catch(e){}
}
function syncAlertsUI(){
  if(!NA || !setEl) return;
  let box = $("sAlerts");
  if(!box){
    const show = [...setEl.querySelectorAll("h4")].find(h => /^show$/i.test(h.textContent.trim()));
    if(!show) return;
    const h4 = document.createElement("h4"); h4.textContent = "Weather alerts (US)";
    box = document.createElement("div"); box.id = "sAlerts";
    show.parentNode.insertBefore(h4, show); show.parentNode.insertBefore(box, show);
    box.addEventListener("mousedown", e => { if(!e.target.closest("input")) e.preventDefault(); });
    box.addEventListener("click", e => {
      const ap = alertPrefs();
      if(e.target.closest("#bAlerts")){
        ap.on = !ap.on; if(!ap.sel) ap.sel = selectedKeys(ap);
        saveAlertPrefs(ap);
        try { NA.enableAlerts(ap.on, ap.mode !== "places"); } catch(err){}
      } else if(e.target.closest("[data-up]")){
        openUpsell(); return;
      } else if(e.target.closest("[data-am]")){
        ap.mode = e.target.closest("[data-am]").dataset.am; if(!ap.sel) ap.sel = selectedKeys(ap);
        saveAlertPrefs(ap);
        if(ap.on && ap.mode !== "places") try { NA.enableAlerts(true, true); } catch(err){}
      } else if(e.target.closest("[data-ak]")){
        const k = e.target.closest("[data-ak]").dataset.ak, sel = selectedKeys(ap);
        ap.sel = sel.includes(k) ? sel.filter(x => x !== k) : sel.concat([k]);
        saveAlertPrefs(ap);
      } else if(e.target.closest("[data-fix]")){
        const f = e.target.closest("[data-fix]").dataset.fix;
        try { if(f === "notify") NA.enableAlerts(true, false); else if(f === "bg") NA.requestBackgroundLocation(); else NA.openAppSettings(); } catch(err){}
      } else return;
      syncAlertsUI(); showUI();
    });
  }
  const ap = alertPrefs(), keys = selectedKeys(ap), ps = permState() || {};
  const rows = alertCandidates().map(p => {
    const ok = usOK(p), on = ok && keys.includes(pkey(p));
    return '<div class="njChk' + (ok ? "" : " off") + '"' + (ok ? ' data-ak="' + esc(pkey(p)) + '"' : "") + '><i' + (on ? ' class="on"' : "") + '>' +
      (on ? "&#10003;" : "") + '</i><span>' + esc(placeName(p)) + '</span><small>' + (p.isHome ? "Home" : ok ? "" : "No US alerts") + '</small></div>';
  }).join("") || '<div class="njDim">Save places (Places card, Save) to choose them here.</div>';
  const warn = [];
  if(ap.on && ps.notify === false) warn.push('Notifications are turned off for Njord Weather. <button data-fix="notify">Allow</button>');
  if(ap.on && ap.mode !== "places" && ps.bgLocation === false)
    warn.push('My location needs location access set to <b>Allow all the time</b>. <button data-fix="bg">Open settings</button>');
  box.innerHTML =
    '<div class="njRow"><div>Notifications</div><button id="bAlerts" class="njTog' + (ap.on ? " on" : "") + '" aria-label="Weather alert notifications"></button></div>' +
    (ap.on ?
      '<div class="njLbl">Alerts for</div>' +
      (FREE ?
        '<div class="seg njWrap"><button data-am="here" class="on">My location only</button>' +
        '<button data-up="1" class="locked">' + LOCK_SVG + 'My location + selected places</button>' +
        '<button data-up="1" class="locked">' + LOCK_SVG + 'Selected places only</button></div>' +
        '<div class="njFreeNote">Alerts for saved places are coming in <b>Njord</b>, the paid version.</div>' :
      '<div class="seg njWrap"><button data-am="here"' + (ap.mode === "here" ? ' class="on"' : "") + '>My location only</button>' +
      '<button data-am="both"' + (ap.mode === "both" ? ' class="on"' : "") + '>My location + selected places</button>' +
      '<button data-am="places"' + (ap.mode === "places" ? ' class="on"' : "") + '>Selected places only</button></div>') +
      (ap.mode !== "here" ? '<div class="njLbl">Selected places</div>' + rows : "") +
      warn.map(w => '<div class="njWarn">' + w + '</div>').join("") : "") +
    '<div class="njDim">Warnings and watches notify, and so do their updates and cancellations; advisories show in the app only. ' +
    'Checked about every 15 minutes; Android may delay checks while the phone sleeps. Not a substitute for Wireless Emergency Alerts.</div>';
}
/* the app tells the page when a permission answer comes back */
window.njordPerm = function(){ try { syncAlertsUI(); syncDailyUI(); } catch(e){} };
/* a tap on the widget or an alert while the app is already open */
window.njordGoto = function(json, alerts){
  let p = null; try { p = typeof json === "string" ? JSON.parse(json) : json; } catch(e){}
  if(!p || !isFinite(p.lat) || !isFinite(p.lng)) return;
  if(!setEl.hidden){ setEl.hidden = true; gearEl.classList.remove("on"); }
  if(!alertSheet.hidden) closeAlerts();
  if(!samePlace(p, PLACE)) goPlace(p); else ph.scrollTo({ top: 0, behavior: "smooth" });
  if(alerts) showAlertsSoon();
};
function showAlertsSoon(){
  const t0 = Date.now();
  const iv = setInterval(() => {
    if(ALERTS.length){ clearInterval(iv); openAlerts(); }
    else if(Date.now() - t0 > 15000) clearInterval(iv);
  }, 400);
}
if(NJ_GOTO && NJ_Q.get("alerts") === "1") showAlertsSoon();
setTimeout(pushPrefs, 1500);
/* ---- Daily forecast notifications - Android app, build 32 ------------------
   1-4 a day at chosen times. The app schedules them; at each time it loads
   this page off-screen with ?brief=1 and takes the written forecast below
   (the same text as the 10-day drop-downs). Morning: today. Midday: the rest
   of today and tonight. Evening: tonight and tomorrow. */
const DKEY = "njord.daily";
const DAILY_DEF = { 1: ["07:00"], 2: ["07:00", "20:30"], 3: ["07:00", "12:00", "20:30"], 4: ["07:00", "12:00", "17:00", "21:00"] };
function dailyPrefs(){
  let j = null; try { j = JSON.parse(STORE.get(DKEY) || "null"); } catch(e){}
  if(!j || typeof j !== "object") j = {};
  const n = [1,2,3,4].includes(+j.n) ? +j.n : 2;
  const times = Array.isArray(j.times) ? j.times.slice(0, 4) : [];
  for(let i = 0; i < 4; i++) if(!/^\d{2}:\d{2}$/.test(times[i] || "")) times[i] = (DAILY_DEF[4][i]);
  if(!Array.isArray(j.times)) DAILY_DEF[n].forEach((t, i) => times[i] = t);
  return { on: !!j.on, n, times, src: ["here","home","place"].includes(j.src) ? j.src : "here",
           place: j.place && isFinite(j.place.lat) ? j.place : null, buzz: j.buzz === "silent" ? "silent" : "vibrate" };
}
function saveDaily(dp){ STORE.set(DKEY, JSON.stringify(dp)); pushPrefs(); }
function fmtHM(t){
  const m = /^(\d{2}):(\d{2})$/.exec(t || ""); if(!m) return t;
  return fmtTime(+m[1]*60 + +m[2]);
}
function syncDailyUI(){
  if(!NA || !setEl || FREE) return;
  let box = $("sDaily");
  if(!box){
    const before = [...setEl.querySelectorAll("h4")].find(h => /^weather alerts/i.test(h.textContent.trim())) ||
                   [...setEl.querySelectorAll("h4")].find(h => /^show$/i.test(h.textContent.trim()));
    if(!before) return;
    const h4 = document.createElement("h4"); h4.textContent = "Daily forecast";
    box = document.createElement("div"); box.id = "sDaily";
    before.parentNode.insertBefore(h4, before); before.parentNode.insertBefore(box, before);
    box.addEventListener("mousedown", e => { if(!e.target.closest("input,select")) e.preventDefault(); });
    box.addEventListener("change", e => {
      const dp = dailyPrefs();
      const ti = e.target.closest("input[data-t]");
      if(ti && /^\d{2}:\d{2}$/.test(ti.value)){ dp.times[+ti.dataset.t] = ti.value; saveDaily(dp); syncDailyUI(); }
      const sel = e.target.closest("select");
      if(sel){ const list = loadPlaces(); dp.place = list[+sel.value] || null; saveDaily(dp); }
    });
    box.addEventListener("click", e => {
      const dp = dailyPrefs();
      if(e.target.closest("#bDaily")){
        dp.on = !dp.on; saveDaily(dp);
        try { NA.enableDaily(dp.on, dp.src === "here"); } catch(err){}
      } else if(e.target.closest("[data-dn]")){
        const n = +e.target.closest("[data-dn]").dataset.dn;
        if(n !== dp.n){ dp.n = n; DAILY_DEF[n].forEach((t, i) => dp.times[i] = t); saveDaily(dp); }
      } else if(e.target.closest("[data-ds]")){
        dp.src = e.target.closest("[data-ds]").dataset.ds;
        if(dp.src === "place" && !dp.place) dp.place = loadPlaces()[0] || null;
        saveDaily(dp);
        if(dp.on && dp.src === "here") try { NA.enableDaily(true, true); } catch(err){}
      } else if(e.target.closest("[data-db]")){
        dp.buzz = e.target.closest("[data-db]").dataset.db; saveDaily(dp);
      } else if(e.target.closest("#bDailyTest")){
        try { NA.testDaily(); } catch(err){}
        const b = e.target.closest("#bDailyTest"); b.textContent = "Sending\u2026 (up to a minute)";
        setTimeout(() => { try { b.textContent = "Send a test now"; } catch(err){} }, 20000);
        return;
      } else if(e.target.closest("[data-fix]")){
        const f = e.target.closest("[data-fix]").dataset.fix;
        try { if(f === "notify") NA.enableDaily(true, false); else NA.requestBackgroundLocation(); } catch(err){}
      } else return;
      syncDailyUI(); showUI();
    });
  }
  const dp = dailyPrefs(), ps = permState() || {};
  const what = t => { const h = +t.slice(0, 2); return h < 11 ? "Today" : h < 16 ? "Rest of today + tonight" : "Tonight + tomorrow"; };
  const places = loadPlaces();
  const warn = [];
  if(dp.on && ps.notify === false) warn.push('Notifications are turned off for Njord Weather. <button data-fix="notify">Allow</button>');
  if(dp.on && dp.src === "here" && ps.bgLocation === false)
    warn.push('My location needs location access set to <b>Allow all the time</b>; until then it uses the last place the app found. <button data-fix="bg">Open settings</button>');
  box.innerHTML =
    '<div class="njRow"><div>Forecast notifications</div><button id="bDaily" class="njTog' + (dp.on ? " on" : "") + '" aria-label="Daily forecast notifications"></button></div>' +
    (dp.on ?
      '<div class="njLbl">How many a day</div><div class="seg">' + [1,2,3,4].map(n => '<button data-dn="' + n + '"' + (n === dp.n ? ' class="on"' : "") + '>' + n + '</button>').join("") + '</div>' +
      '<div class="njLbl">Times <span class="njHint">(tap to change)</span></div><div class="njTimes">' +
        dp.times.slice(0, dp.n).map((t, i) => '<label class="njTime"><input type="time" data-t="' + i + '" value="' + t + '"><b>' + esc(fmtHM(t)) + '</b><small>' + what(t) + '</small></label>').join("") + '</div>' +
      '<div class="njLbl">For</div><div class="seg">' +
        [["here","My location"],["home","Home"],["place","A saved place"]].map(([k, l]) => '<button data-ds="' + k + '"' + (dp.src === k ? ' class="on"' : "") + '>' + l + '</button>').join("") + '</div>' +
      (dp.src === "place" ? (places.length ? '<select class="njSel">' + places.map((p, i) => '<option value="' + i + '"' + (dp.place && sameTown(p, dp.place) ? " selected" : "") + '>' + esc(placeName(p)) + '</option>').join("") + '</select>'
                                            : '<div class="njDim">No saved places yet.</div>') : "") +
      '<div class="njLbl">Alert</div><div class="seg"><button data-db="silent"' + (dp.buzz === "silent" ? ' class="on"' : "") + '>Silent</button>' +
        '<button data-db="vibrate"' + (dp.buzz === "vibrate" ? ' class="on"' : "") + '>Vibrate</button></div>' +
      warn.map(w => '<div class="njWarn">' + w + '</div>').join("") +
      '<button class="pbtn" id="bDailyTest" style="margin-top:9px;width:100%">Send a test now</button>' : "") +
    '<div class="njDim">The title is the temperature and sky at that moment; the text is the written forecast. ' +
    'Android may deliver them a few minutes late while the phone sleeps. Weather alerts are separate.</div>';
}
/* the forecast text for a notification (?brief=1, loaded by the app) */
function briefParts(i){
  const out = {};
  const plain = h => { const d = document.createElement("div"); d.innerHTML = h; return (d.textContent || "").trim(); };
  for(const seg of String(dayText(i) || "").split("<br><br>")){
    const m = /^<b>([\s\S]*?):<\/b>\s*([\s\S]*)$/.exec(seg.trim());
    if(m) out[plain(m[1])] = plain(m[2]);
  }
  return out;
}
function briefOut(){
  const p = zonedParts(new Date(), PLACE.tz);
  const win = NJ_Q.get("win") || (p.hour < 11 ? "morning" : p.hour < 16 ? "midday" : "evening");
  const p0 = briefParts(0), p1 = WX.days[1] ? briefParts(1) : {}, tom = WX.days[1] ? weekdayName(WX.days[1].date) : "";
  let lines;
  /* build 41: during the day, Today and Tonight (morning used to be Today only) */
  if(win === "morning" || win === "midday") lines = [["Today", p0.Today], ["Tonight", p0.Tonight]];
  else lines = [["Tonight", p0.Tonight], [tom, p1[tom]]];
  lines = lines.filter(l => l[1]);
  if(!lines.length){ const k = Object.keys(p0)[0]; if(k) lines = [[k, p0[k]]]; }
  const label = SCENE && SCENE.cls ? SCENE.cls.label : "";
  /* build 46: current conditions, shown above Today / Tonight */
  /* build 47: worded like the forecast under it - Sunny by day (Clear only at night),
     and "North-northwest wind 12 mph, gusts to 22" */
  let sky = label;
  if(!nightAt(localMin())) sky = { "Clear": "Sunny", "Mainly Clear": "Mostly Sunny" }[label] || label;
  let now = WX.temp + "°" + (sky ? ", " + sky : "") + ". Feels like " + WX.feels + "°.";
  if(WX.wind == null || WX.wind < 1) now += " Calm.";
  else now += " " + (WX.dir != null ? cap(compassWords(WX.dir)) + " wind " : "Wind ") + WX.wind + " " + spdUnit() +
              (isGusty(WX.wind, WX.gust) ? ", gusts to " + WX.gust : "") + ".";
  return { ok: true, win, title: WX.temp + "°" + (label ? " · " + label : ""), now, lines,
           place: { name: PLACE.name, short: PLACE.short, lat: PLACE.lat, lng: PLACE.lng, tz: PLACE.tz, cc: PLACE.cc } };
}
if(NJ_Q.get("brief") === "1"){
  const t0 = Date.now();
  const iv = setInterval(() => {
    const age = Date.now() - t0, BR = window.NjordWidget;
    if(!(WX_LIVE && WX && SCENE && SCENE.cls) && age < 30000) return;
    clearInterval(iv);
    if(!BR) return;
    if(!WX){ BR.done(JSON.stringify({ ok: false, why: WX_STATE })); return; }
    try { BR.done(JSON.stringify(briefOut())); } catch(e){ BR.done(JSON.stringify({ ok: false, why: String(e && e.message) })); }
  }, 300);
}


render(true);
/* ---- Njord Free (app build 37) ----------------------------------------------
   Saved places count with Home (a Home that isn't also a saved place counts
   as one). Anything locked shows a one-line "coming in Njord" note (app
   build 48; the Get Njord sheet is gone until Njord is on Google Play); Settings has the same list above About; places outside the US show
   a card instead of their forecast. */
const UP_LIST = ["10-day forecast", "Unlimited saved places", "Forecasts outside the US", "Alerts for your saved places",
                 "Daily forecast notifications", "Widget: any saved place, any update interval", "More radar layers"];
function freeCount(){
  const list = loadPlaces(), hm = homeOf();
  return list.length + (hm && !list.some(p => sameTown(p, hm)) ? 1 : 0);
}
function upList(){ return '<ul class="upList">' + UP_LIST.map(t => '<li>' + esc(t) + '</li>').join("") + '</ul>'; }
let upEl = null;
function upsellOpen(){ return !!(upEl && !upEl.hidden); }
/* app build 48: Njord (paid) isn't out yet, so there is no sheet to sell it.
   Anything locked shows a one-line note instead. */
function openUpsell(){
  if(!FREE) return;
  njNote("That's coming in Njord, the paid version.");
}
let noteEl = null, noteT = null;
window.njNote = (t) => njNote(t);
function njNote(t){
  if(!noteEl){ noteEl = document.createElement("div"); noteEl.id = "njNote"; document.body.appendChild(noteEl); }
  noteEl.textContent = t; noteEl.classList.add("on");
  clearTimeout(noteT); noteT = setTimeout(() => noteEl.classList.remove("on"), 2600);
}
function closeUpsell(){ if(upEl) upEl.hidden = true; }
/* no store listing yet: say so. Later this opens Njord's Google Play page. */
function getNjord(scope){ const n = scope.querySelector(".upSoon"); if(n) n.hidden = false; }
if(FREE && setEl){
  const about = [...setEl.querySelectorAll("h4")].find(h => /^about$/i.test(h.textContent.trim()));
  if(about){
    const h4 = document.createElement("h4"); h4.textContent = "Coming in Njord";
    const box = document.createElement("div"); box.id = "sGetNjord";
    box.innerHTML = '<div class="upSub">Njord, the paid version, is on its way. Everything in Njord Free, plus:</div>' + upList();
    about.parentNode.insertBefore(h4, about); about.parentNode.insertBefore(box, about);
    box.addEventListener("mousedown", e => e.preventDefault());
  }
}
/* places outside the US: Njord Free covers the US only */
let intlEl = null;
function syncIntl(){
  if(!FREE) return;
  const cc = PLACE && PLACE.cc ? String(PLACE.cc).toUpperCase() : "US";
  const out = cc !== "US";
  if(out && !intlEl){
    intlEl = document.createElement("div"); intlEl.id = "njIntl";
    intlEl.innerHTML = '<div class="upDim"></div><div class="intlCard"><h2></h2>' +
      '<p>Njord Free covers the United States. Forecasts for other countries are coming in Njord, the paid version.</p>' +
      '<button class="upLater">Back to My location</button></div>';
    document.body.appendChild(intlEl);
    intlEl.addEventListener("click", e => {
      if(e.target.closest(".upLater")){ intlEl.hidden = true; goHere(); }
    });
  }
  if(intlEl){
    if(out) intlEl.querySelector("h2").textContent = placeName(PLACE);
    intlEl.hidden = !out;
  }
}
if(FREE) setInterval(syncIntl, 700);


/* ---- Radar (app build 38; vector map in build 39) ---------------------------
   NWS radar straight from NWS's map service (opengeo.ncep.noaa.gov WMS, MRMS
   mosaics for the US), laid under the town names of a vector map that the
   phone draws itself (MapLibre GL JS + OpenFreeMap tiles from OpenStreetMap:
   free, no key) - so names stay sharp and big, the way NOAA Weather
   Unofficial looks with Google's map. A card under Next 24 hours loops the
   last 2 hours; tapping it opens a full-screen map with pan, zoom, a
   timeline, layers and a gear for the map style. Njord Free has base
   reflectivity; the other layers are greyed out. No card outside the US. */
const RD = {
  W: "https://opengeo.ncep.noaa.gov/geoserver/conus/",
  STYLES: [
    { id: "liberty", name: "Liberty", note: "colour, like a road map" },
    { id: "positron", name: "Positron", note: "light and quiet" },
    { id: "bright", name: "Bright", note: "bold colours" }
  ],
  TEXT: 1.3,                       // labels 1.3x the map's own size (chosen in the lab)
  STEP: 10 * 60e3, N: 12,
  layers: [
    { id: "bref", name: "Base reflectivity", note: "rain & snow now", wms: "conus_bref_qcd", dbz: true },
    { id: "cref", name: "Composite reflectivity", note: "strongest in the column", wms: "conus_cref_qcd", dbz: true, paid: true },
    { id: "ptyp", name: "Precipitation type", note: "rain / snow / mix", wms: "conus_pcpn_typ", paid: true },
    { id: "neet", name: "Echo tops", note: "storm height", wms: "conus_neet_v18", paid: true },
    { id: "bvel", name: "Velocity (nearest radar)", note: "coming later", soon: true }
  ],
  layer: "bref"
};
const RD_LEG = ["#04e9e7","#019ff4","#0300f4","#02fd02","#01c501","#008e00","#fdf802","#e5bc00","#fd9500","#fd0000","#d40000","#bc0000","#f800fd","#9854c6"];
function rdStyle(){ try { const v = localStorage.getItem("njord.radarStyle"); if(RD.STYLES.some(x => x.id === v)) return v; } catch(e){} return "liberty"; }
const rdStyleUrl = id => "https://tiles.openfreemap.org/styles/" + id;
function rdUS(){ const cc = PLACE && PLACE.cc ? String(PLACE.cc).toUpperCase() : "US"; return cc === "US"; }
function rdTimes(){ const end = Math.floor((Date.now() - 4 * 60e3) / RD.STEP) * RD.STEP; return Array.from({ length: RD.N }, (_, k) => end - (RD.N - 1 - k) * RD.STEP); }
const rdClock = t => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: PLACE && PLACE.tz || undefined });
/* the map library: the app carries its own copy (vendor/, added by the build);
   the web app, or a copy that is missing, loads it from unpkg */
let rdLibP = null;
function rdLib(){
  if(window.maplibregl) return Promise.resolve(true);
  if(rdLibP) return rdLibP;
  const add = (base) => new Promise((ok, no) => {
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = base + "maplibre-gl.css"; document.head.appendChild(l);
    const sc = document.createElement("script"); sc.src = base + "maplibre-gl.js"; sc.onload = () => ok(true); sc.onerror = () => { l.remove(); sc.remove(); no(); };
    document.head.appendChild(sc);
  });
  rdLibP = add("vendor/").catch(() => add("https://unpkg.com/maplibre-gl@4.7.1/dist/")).catch(() => { rdLibP = null; return false; });
  return rdLibP;
}
/* bigger labels: plain sizes and the outputs of zoom curves are multiplied */
function rdText(map, k){
  for(const L of map.getStyle().layers){
    if(L.type !== "symbol" || !L.layout || L.layout["text-size"] == null) continue;
    const o = L.layout["text-size"]; let v = o;
    if(typeof o === "number") v = o * k;
    else if(Array.isArray(o) && o[0] === "interpolate") v = o.map((x, i) => (i >= 4 && i % 2 === 0 && typeof x === "number") ? x * k : x);
    else if(Array.isArray(o) && o[0] === "step") v = o.map((x, i) => (i >= 2 && i % 2 === 0 && typeof x === "number") ? x * k : x);
    else if(o && o.stops) v = Object.assign({}, o, { stops: o.stops.map(st => [st[0], st[1] * k]) });
    try { map.setLayoutProperty(L.id, "text-size", v); } catch(e){}
  }
}
function rdWms(layer, t){
  const L = RD.layers.find(x => x.id === layer) || RD.layers[0];
  return RD.W + L.wms + "/ows?service=WMS&version=1.3.0&request=GetMap&layers=" + L.wms + "&styles=&crs=EPSG:3857&bbox={bbox-epsg-3857}" +
    "&width=512&height=512&format=image/png&transparent=true&time=" + new Date(t).toISOString();
}
/* lay the radar frames into a map, under the first label layer */
function rdFrames(map, layer, shown){
  const times = rdTimes(), st = map.getStyle(), lab = st.layers.find(l => l.type === "symbol");
  for(let k = 0; k < RD.N; k++){
    const id = "rad" + k;
    if(map.getLayer(id)) map.removeLayer(id);
    if(map.getSource(id)) map.removeSource(id);
    map.addSource(id, { type: "raster", tiles: [rdWms(layer, times[k])], tileSize: 512 });
    map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": k === shown ? 0.85 : 0,
      "raster-fade-duration": 0, "raster-opacity-transition": { duration: 0 } } }, lab ? lab.id : undefined);
  }
  return times;
}
/* -- radar status (app build 49) --
   Asks NOAA's map service which radar times it has (WMS GetCapabilities for
   the layer; its time "default" is the newest scan) every few minutes. If
   that can't be had, or radar tiles keep failing, the radar is down; if the
   newest scan is over 30 minutes old, NOAA's radar is behind. Either way a
   short note says so on the card and the full map. */
const RDS = { layer: "", at: 0, latest: 0, fails: 0, tileErr: 0, busy: false };
function rdCheck(layer){
  const L = RD.layers.find(x => x.id === layer) || RD.layers[0];
  if(RDS.busy || (RDS.layer === L.id && Date.now() - RDS.at < 3*60e3)) return;
  RDS.busy = true;
  /* build 53: give up after 20 s instead of hanging; keep the reason for the developer box */
  const ac = window.AbortController ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), 20000);
  fetch(RD.W + L.wms + "/ows?service=WMS&version=1.3.0&request=GetCapabilities", { cache: "no-store", signal: ac && ac.signal })
    .then(r => r.ok ? r.text() : Promise.reject("HTTP " + r.status))
    .then(t => {
      const m = /<Dimension[^>]*name="time"[^>]*default="([^"]+)"/i.exec(t) || /<Dimension[^>]*default="([^"]+)"[^>]*name="time"/i.exec(t);
      const ms = m ? Date.parse(m[1]) : NaN;
      if(!isFinite(ms)) throw "no time";
      RDS.latest = ms; RDS.fails = 0; RDS.tileErr = 0;
    })
    .catch(e => { RDS.fails++; RDS.why = String(e && e.name || e); })
    .finally(() => { if(tm) clearTimeout(tm); RDS.busy = false; RDS.layer = L.id; RDS.at = Date.now(); rdNoteSync(); });
}
function rdNoteText(){
  const off = navigator.onLine === false;
  if(off) return "";                                   // no connection: the app says so elsewhere
  /* build 53: radar pictures arriving in the last 10 minutes prove the radar works,
     even if NOAA's list of times couldn't be read - don't call it unavailable then */
  const tilesOk = RDS.tileOk && Date.now() - RDS.tileOk < 10*60e3 && RDS.tileErr < 3;
  if(!tilesOk && (RDS.fails >= 2 || (RDS.fails >= 1 && RDS.tileErr >= 3)))
    return "Radar is unavailable right now. This usually happens when NOAA's radar servers aren't responding or are having an outage. Njord keeps checking.";
  if(RDS.latest && Date.now() - RDS.latest > 30*60e3)
    return "The newest radar NOAA has is from " + rdClock(RDS.latest) + ". This usually happens when NOAA's radar servers fall behind. Njord keeps checking.";
  return "";
}
function rdNoteSync(){
  const t = rdNoteText();
  document.querySelectorAll(".rdNote").forEach(el => { el.textContent = t; el.hidden = !t; });
}
function rdWatch(map){
  map.on("sourcedata", e => { if(e && e.sourceId && /^rad\d/.test(e.sourceId) && e.tile && e.isSourceLoaded){ RDS.tileOk = Date.now(); RDS.tileErr = 0; } });
  map.on("error", e => { if(e && e.sourceId && /^rad\d/.test(e.sourceId)){ RDS.tileErr++; if(RDS.tileErr === 3){ RDS.at = 0; rdCheck(RD.layer); } } });
}
setInterval(rdNoteSync, 60e3);
function rdShowFrame(map, i){ for(let k = 0; k < RD.N; k++) if(map.getLayer("rad" + k)) map.setPaintProperty("rad" + k, "raster-opacity", k === i ? 0.85 : 0); }
/* -- the card -- */
const rdCard = { sec: $("phRadar"), map: null, el: $("phRadarMap"), key: "", times: [], i: 0, timer: 0, seen: false, at: 0, style: "" };
function rdCardSync(){
  const ok = isPhone() && PLACE && rdUS();
  rdCard.sec.hidden = !ok;
  if(!ok || !rdCard.seen || document.hidden) return;
  const key = PLACE.lat.toFixed(3) + "," + PLACE.lng.toFixed(3);
  const style = rdStyle();
  if(key === rdCard.key && style === rdCard.style && Date.now() - rdCard.at < RD.STEP) return;
  rdLib().then(ok2 => {
    if(!ok2){ rdCard.sec.hidden = true; return; }
    const fresh = !rdCard.map || style !== rdCard.style;
    rdCard.key = key; rdCard.at = Date.now();
    rdCheck("bref");
    const go = () => {
      rdCard.times = rdFrames(rdCard.map, "bref", RD.N - 1);
      rdCard.el.querySelector(".rdTime").textContent = "▶ " + rdClock(rdCard.times[0]) + " – " + rdClock(rdCard.times[RD.N - 1]);
      clearTimeout(rdCard.timer); rdCard.i = RD.N - 1; rdLoop();
    };
    if(!rdCard.map){
      rdCard.map = new maplibregl.Map({ container: rdCard.el.querySelector(".rdGL"), style: rdStyleUrl(style), center: [PLACE.lng, PLACE.lat], zoom: 6.6,
        interactive: false, attributionControl: false, fadeDuration: 0 });
      rdCard.pin = new maplibregl.Marker({ color: "#4fa3b5", scale: 0.7 }).setLngLat([PLACE.lng, PLACE.lat]).addTo(rdCard.map);
      rdWatch(rdCard.map);
      rdCard.map.on("style.load", () => { rdText(rdCard.map, RD.TEXT); go(); });
    } else if(fresh){
      rdCard.map.setStyle(rdStyleUrl(style));
    } else {
      rdCard.map.jumpTo({ center: [PLACE.lng, PLACE.lat] }); rdCard.pin.setLngLat([PLACE.lng, PLACE.lat]);
      if(rdCard.map.isStyleLoaded()) go();
    }
    if(fresh && rdCard.map) { rdCard.map.jumpTo({ center: [PLACE.lng, PLACE.lat] }); rdCard.pin.setLngLat([PLACE.lng, PLACE.lat]); }
    rdCard.style = style;
  });
}
function rdLoop(){
  if(!rdCard.map) return;
  rdShowFrame(rdCard.map, rdCard.i);
  const last = rdCard.i === RD.N - 1;
  rdCard.i = (rdCard.i + 1) % RD.N;
  const v = rdSpd();
  rdCard.timer = setTimeout(rdLoop, last ? v.end + 200 : v.f);
}
if(NJ_Q.get("brief") !== "1"){
  if("IntersectionObserver" in window)
    new IntersectionObserver(es => { for(const e of es){ if(e.isIntersecting){ rdCard.seen = true; rdCardSync(); } } }, { rootMargin: "200px" }).observe(rdCard.sec);
  setInterval(rdCardSync, 3e3); rdCardSync();
  document.addEventListener("visibilitychange", rdCardSync);
}
rdCard.sec.addEventListener("click", () => rdOpen());
/* -- full screen -- */
let rdEl = null, rdMap = null, rdPin = null, rdTimesF = [], rdI = 0, rdPlay = false, rdT = 0;
function rdOpen(){
  if(!PLACE) return;
  rdLib().then(ok => { if(ok) rdOpen2(); });
}
function rdOpen2(){
  if(!rdEl){
    rdEl = document.createElement("div"); rdEl.id = "rdFull"; rdEl.hidden = true;
    rdEl.innerHTML = '<div class="rdGL" id="rdMapF"></div>' +
      '<div class="rdTop"><button class="rdB" id="rdBack">‹ <span></span></button><span style="flex:1"></span>' +
      '<button class="rdB rdGear" id="rdGear" aria-label="Radar settings">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button></div>' +
      '<div class="rdLay" id="rdLay" hidden></div><div class="rdLay" id="rdSet" hidden></div>' +
      '<div class="rdZoom"><button class="rdB" data-z="1">+</button><button class="rdB" data-z="-1">−</button><button class="rdB" data-z="0" aria-label="Back to the place">◎</button></div>' +
      '<div class="rdBot"><div class="rdNote" hidden></div><div class="rdRow"><button class="rdPlay" id="rdPlay">▶</button><input type="range" id="rdSlide" min="0" max="' + (RD.N - 1) + '"><span id="rdTimeF"></span></div>' +
      '<div class="rdLayName" id="rdLayName"></div><div class="rdLeg" id="rdLeg"></div><div class="rdAttr">Radar: NOAA/NWS · Map: OpenFreeMap, © OpenStreetMap</div></div>';
    document.body.appendChild(rdEl);
    $("rdBack").onclick = rdClose;
    $("rdPlay").onclick = () => rdSetPlay(!rdPlay);
    $("rdSlide").oninput = e => { rdSetPlay(false); rdI = +e.target.value; rdFrame(); };
    rdEl.querySelector(".rdZoom").onclick = e => {
      const b = e.target.closest("[data-z]"); if(!b || !rdMap) return;
      const d = +b.dataset.z;
      if(d === 0) rdMap.easeTo({ center: [PLACE.lng, PLACE.lat], zoom: Math.max(rdMap.getZoom(), 7) });
      else d > 0 ? rdMap.zoomIn() : rdMap.zoomOut();
    };
    /* build 50: one gear panel - radar type, loop speed, map style */
    $("rdGear").onclick = () => { $("rdLay").hidden = true; const m = $("rdSet"); m.hidden = !m.hidden; if(!m.hidden) rdSetMenu(); };
    $("rdSet").onclick = e => {
      const l = e.target.closest("[data-l]");
      if(l){
        const L = RD.layers.find(x => x.id === l.dataset.l);
        if(!L || L.soon) return;
        if(L.paid && FREE){ openUpsell(); return; }
        RD.layer = L.id; rdLoadFrames(); rdSetMenu(); return;
      }
      const sp = e.target.closest("[data-sp]");
      if(sp){ try { localStorage.setItem("njord.radarSpeed", sp.dataset.sp); } catch(err){} rdSetMenu(); if(rdPlay) rdSetPlay(true); return; }
      const it = e.target.closest("[data-s]"); if(!it) return;
      try { localStorage.setItem("njord.radarStyle", it.dataset.s); } catch(err){}
      $("rdSet").hidden = true;
      rdMap.setStyle(rdStyleUrl(it.dataset.s));
      rdCardSync();
    };
  }
  rdEl.querySelector("#rdBack span").textContent = placeName(PLACE);
  $("rdLay").hidden = true; $("rdSet").hidden = true;
  rdEl.hidden = false;
  const c = [PLACE.lng, PLACE.lat];
  if(!rdMap){
    rdMap = new maplibregl.Map({ container: "rdMapF", style: rdStyleUrl(rdStyle()), center: c, zoom: 7, attributionControl: false, fadeDuration: 0, dragRotate: false, pitchWithRotate: false });
    rdWatch(rdMap);
    rdMap.touchZoomRotate.disableRotation();
    rdPin = new maplibregl.Marker({ color: "#4fa3b5" }).setLngLat(c).addTo(rdMap);
    rdMap.on("style.load", () => { rdText(rdMap, RD.TEXT); rdLoadFrames(); });
  } else {
    rdMap.resize(); rdMap.jumpTo({ center: c, zoom: 7 }); rdPin.setLngLat(c);
    if(rdMap.isStyleLoaded()) rdLoadFrames();
  }
  rdSetPlay(true);
}
function rdLoadFrames(){
  rdI = RD.N - 1;
  rdTimesF = rdFrames(rdMap, RD.layer, rdI);
  const L = RD.layers.find(x => x.id === RD.layer);
  rdCheck(RD.layer); rdNoteSync();
  $("rdLayName").textContent = L.name;
  $("rdLeg").innerHTML = L.dbz ? '<div class="rdBar">' + RD_LEG.map(c => '<i style="background:' + c + '"></i>').join("") + '</div><div class="rdLk"><span>Light</span><span>Moderate</span><span>Heavy</span><span>Severe</span></div>' : "";
  rdFrame();
}
function rdClose(){ if(rdEl){ rdEl.hidden = true; rdSetPlay(false); } }
function rdOpenNow(){ return !!(rdEl && !rdEl.hidden); }
function rdMenu(){
  $("rdLay").innerHTML = RD.layers.map(L => {
    const lock = (L.paid && FREE) || L.soon;
    return '<div data-l="' + L.id + '" class="' + (L.id === RD.layer ? "on " : "") + (lock ? "lk" : "") + '"><span>' + (L.paid && FREE ? LOCK_SVG : "") + esc(L.name) + '</span><small>' + esc(L.note) + '</small></div>';
  }).join("") + (FREE ? '<div class="rdFreeNote">More radar layers are coming in <b>Njord</b>, the paid version</div>' : "");
}
function rdSetMenu(){
  const cur = rdStyle(), spd = rdSpeed();
  $("rdSet").innerHTML =
    '<div class="rdHead">Radar type</div>' + RD.layers.map(L => {
      const lock = (L.paid && FREE) || L.soon;
      return '<div data-l="' + L.id + '" class="' + (L.id === RD.layer ? "on " : "") + (lock ? "lk" : "") + '"><span>' +
        (L.id === RD.layer ? "✓ " : "") + (L.paid && FREE ? LOCK_SVG : "") + esc(L.name) + '</span><small>' + esc(L.note) + '</small></div>';
    }).join("") + (FREE ? '<div class="rdFreeNote">More radar layers are coming in <b>Njord</b>, the paid version</div>' : "") +
    '<div class="rdHead">Loop speed</div><div class="rdSpd">' + RD_SPEEDS.map(x =>
      '<button data-sp="' + x.id + '" class="' + (x.id === spd ? "on" : "") + '">' + x.name + '</button>').join("") + '</div>' +
    '<div class="rdHead">Map style</div>' + RD.STYLES.map(x =>
    '<div data-s="' + x.id + '" class="' + (x.id === cur ? "on" : "") + '"><span>' + (x.id === cur ? "✓ " : "") + esc(x.name) + '</span><small>' + esc(x.note) + '</small></div>').join("");
}
/* build 50: radar loop speed - time on each frame, and the pause on the newest */
const RD_SPEEDS = [ { id: "slow", name: "Slow", f: 1000, end: 2600 }, { id: "normal", name: "Normal", f: 500, end: 1600 },
                    { id: "fast", name: "Fast", f: 280, end: 1100 } ];
function rdSpeed(){ try { const v = localStorage.getItem("njord.radarSpeed"); if(RD_SPEEDS.some(x => x.id === v)) return v; } catch(e){} return "normal"; }
const rdSpd = () => RD_SPEEDS.find(x => x.id === rdSpeed());
function rdFrame(){
  if(!rdMap) return;
  rdShowFrame(rdMap, rdI); $("rdSlide").value = rdI;
  $("rdTimeF").textContent = rdTimesF[rdI] ? rdClock(rdTimesF[rdI]) : "";
}
function rdSetPlay(on){
  rdPlay = on; clearTimeout(rdT);
  if(rdEl) $("rdPlay").textContent = on ? "❚❚" : "▶";
  if(on){ const tick = () => { const v = rdSpd(); rdI = (rdI + 1) % RD.N; rdFrame(); rdT = setTimeout(tick, rdI === RD.N - 1 ? v.end : v.f); }; rdT = setTimeout(tick, rdSpd().f); }
}

setInterval(() => render(false), 1000);

/* lift the loading screen once there is a forecast to show (at least a
   moment, at most a few seconds - offline it must not hang there) */
(function(){
  const el = document.getElementById("njLoad");
  if(!el) return;
  if(!APP){ el.remove(); return; }
  const t0 = Date.now();
  const lift = () => { el.style.opacity = "0"; el.style.pointerEvents = "none"; setTimeout(() => el.remove(), 600); };
  const iv = setInterval(() => {
    const age = Date.now() - t0;
    if((WX && age > 900) || age > 4500){ clearInterval(iv); lift(); }
  }, 150);
})();
})();

/* app build 17: version in Settings > About (MainActivity passes ?v=0.1.N&b=N) */
(function(){
  const q = new URLSearchParams(location.search), v = q.get("v"), b = q.get("b");
  const el = document.getElementById("appVer");
  if(!el) return;
  if(!v){ if(/androidplatform\.net$/.test(location.hostname)) return; el.textContent = "Njord Weather \u00b7 web app"; el.hidden = false; return; }
  const nm = document.documentElement.classList.contains("njFree") ? "Njord Free " : "Njord Weather ";
  el.textContent = nm + v + (b ? "  \u00b7  build " + b : "");
  el.hidden = false;
})();

/* app build 49: hidden developer switch (Njord only). Tap the build line in
   About 7 times to show it; "Run as Njord Free" restarts the app as Free, so
   the Free experience can be tested without installing the second app. */
(function(){
  const NA = window.NjordAndroid, el = document.getElementById("appVer");
  let can = false; try { can = !!(NA && NA.canSwitchEdition && NA.canSwitchEdition()); } catch(e){}
  if(!el || !can) return;
  let FREE = false; try { FREE = !!NA.isFree(); } catch(e){}    // (this block sits outside the main one)
  const njNote = window.njNote || (() => {});
  const box = document.createElement("div");
  box.id = "devBox";
  /* app build 57: pick a tier (Gratis / Sylv / Piloten) when the app knows tiers;
     the launcher icon and loading screen switch with it */
  let TIER = ""; try { TIER = NA.tier ? NA.tier() : ""; } catch(e){}
  box.innerHTML = '<div class="devH">Developer</div>' + (TIER
    ? '<label class="devRow"><span>Run as</span><select id="devTier"><option value="gratis">Njord Gratis (Free)</option>' +
      '<option value="sylv">Njord Sylv</option><option value="piloten">Njord Piloten</option></select></label>'
    : '<label class="devRow"><span>Run as Njord Free</span><input type="checkbox" id="devFree"></label>') +
    '<div class="devNote">Restarts the app' + (TIER ? ' and changes the app icon (the home screen can take a few seconds)' : '') +
    '. Widgets follow on their next update.</div>';
  const shown = (() => { try { return localStorage.getItem("njDev") === "1"; } catch(e){ return false; } })();
  box.hidden = !shown && !FREE;
  el.parentNode.insertBefore(box, el.nextSibling);
  const cb = box.querySelector("#devFree"), sel = box.querySelector("#devTier");
  if(cb){ cb.checked = FREE; cb.addEventListener("change", () => { try { NA.setDevFree(cb.checked); } catch(e){} }); }
  if(sel){ sel.value = TIER; sel.addEventListener("change", () => { try { NA.setDevTier(sel.value); } catch(e){} }); }
  let taps = 0, tT = 0;
  el.addEventListener("click", () => {
    clearTimeout(tT); tT = setTimeout(() => taps = 0, 1500);
    if(++taps >= 7 && box.hidden){
      box.hidden = false; try { localStorage.setItem("njDev", "1"); } catch(e){}
      njNote("Developer options are on.");
    }
  });
})();

