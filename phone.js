/* Njord Weather - phone layer (app build 2).
   Runs after the wallpaper script and reuses its data (WX, PLACE, SCENE) and
   helpers. Portrait phones get a scrolling sheet of cards over the live
   scene; landscape keeps the original wide layout. Nothing here changes how
   the scene itself is drawn. */
(function(){
"use strict";
const root = document.documentElement;
const ANDROID_APP = /androidplatform\.net$/.test(location.hostname);
/* web app opened from the home screen (iPhone or Android) counts as the app */
const STANDALONE = navigator.standalone === true
  || (window.matchMedia && matchMedia("(display-mode: standalone)").matches)
  || /[?&]pwa=1\b/.test(location.search);
const APP = ANDROID_APP || STANDALONE || /[?&]app=1\b/.test(location.search);
if(!ANDROID_APP && location.protocol === "https:" && "serviceWorker" in navigator)
  navigator.serviceWorker.register("sw.js").catch(() => {});
root.classList.toggle("app", APP);
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
  '<div id="phSheet"><div class="grab"></div><div id="phAur"></div>' +
    '<section class="pc" id="phHourly"><h3>Next 24 hours <a class="jump" id="phJump">10-day &rsaquo;</a></h3><div class="sum24"></div><div class="hrs"></div></section>' +
    '<div class="grid2" id="phDetails"></div>' +
    '<section class="pc" id="phSky" style="margin-top:12px"></section>' +
    '<section class="pc" id="phDays"><h3>10-day forecast <span class="tapHint">tap a day</span></h3><div class="days"></div></section>' +
    '<section class="pc" id="phAfd" hidden></section>' +
    '<section class="pc" id="phPlaces"><h3>Places</h3><div class="chips"></div>' +
      '<button class="pbtn" id="phSave"></button>' +
      '<button class="pbtn" id="phLoc">Use my location</button>' +
      '<div class="openAt" id="phOpenAt"></div>' +
      '<div class="hintTxt">Swipe left or right on the sky to move between My location and your saved places.</div></section>' +
  '</div>';
document.body.appendChild(ph);
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
function loadPlaces(){ try { const j = JSON.parse(STORE.get(PKEY) || "[]"); return Array.isArray(j) ? j : []; } catch(e){ return []; } }
function savePlaces(list){ STORE.set(PKEY, JSON.stringify(list)); }
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
  const hs = [PLACE.lat, PLACE.lng, p.hour, p.minute, wxGen, WX_STATE, CONFIG.units, CONFIG.clock,
              SCENE && SCENE.cls && SCENE.cls.label, ALERTS.map(a => a.id).join(",")].join("|");
  if(force || hs !== heroSig){ heroSig = hs; renderHero(); }
  /* sun/moon arcs and the aurora note move on their own, slower clock */
  const ss = [PLACE.lat, PLACE.lng, p.hour, Math.floor(p.minute/10), CONFIG.clock, typeof AUR === "object" && AUR ? AUR.kpAt + "/" + AUR.ovAt : ""].join("|");
  if(WX && (force || ss !== skySig)){ skySig = ss; renderSky(); renderAurora(); }
  const ds = [PLACE.lat, PLACE.lng, p.hour, wxGen, CONFIG.units, CONFIG.clock, loadPlaces().length, STORE.get("weather.home") || "",
              SCENE ? Math.round(SCENE.phase.illum*100) : -1].join("|");
  if(!force && ds === dataSig) return;
  dataSig = ds;
  renderPlaces();
  if(!WX){
    $("phHourly").querySelector(".hrs").innerHTML = '<div class="sub" style="padding:8px 16px">Loading forecast…</div>';
    $("phHourly").querySelector(".sum24").innerHTML = "";
    $("phDays").querySelector(".days").innerHTML = "";
    $("phDetails").innerHTML = ""; $("phSky").innerHTML = "";
    return;
  }
  renderHours(); renderDetails(); renderDays(); renderSky(); renderAurora(); skySig = "";
  loadAfd();
}

/* ---- forecast discussion (app build 22) ------------------------------------
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
function renderHero(){
  const p = zonedParts(new Date(), PLACE.tz);
  const nm = placeName(PLACE);
  let h = '<div class="hti">' + esc(fmtTime(p.hour*60 + p.minute)) + '</div>' +
          '<div class="hn' + (nm.length > 22 ? ' xl' : nm.length > 14 ? ' l' : '') + '">' + (isHere(PLACE) ? '<span class="hpin" title="My location">' +
          '<svg viewBox="0 0 24 24" width="0.62em" height="0.62em" fill="currentColor"><path d="M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.6" fill="#0b1630"/></svg></span>' : '') + esc(nm) + '</div>';
  if(!WX){
    h += '<div class="hc" style="margin-top:14px">' + (WX_STATE === "offline" ? "Weather unavailable — retrying shortly" : "Loading weather…") + '</div>';
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
         '<div class="hs hwl">' + wind + '</div>';
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
  if(hi < 4) return " Light winds.";
  const lo = ws.length ? Math.min(...ws) : hi;
  const dir = d.dir != null ? d.dir : (list.find(h => h.dir != null) || {}).dir;
  const from = dir != null ? cap(compassWords(dir)) + " wind " : "Wind ";
  const range = hi - lo <= 3 ? "around " + hi : lo + " to " + hi;
  const gust = isGusty(hi, d.gust) ? ", with gusts up to " + d.gust + " " + spdUnit() : "";
  return " " + from + range + " " + spdUnit() + gust + ".";
}
function dayText(i){
  const days = WX.days, d = days[i];
  const all = hoursOn(d.date), day = all.filter(h => h.hr >= 7 && h.hr <= 19);
  const wet = all.filter(wetHour);
  let s = "";
  if(wet.length){
    const w = wmo(d.code);
    const code = w.precip && w.precip !== "fog" ? d.code
               : wet.reduce((a, h) => CODE_RANK(h.code) > CODE_RANK(a) ? h.code : a, wet[0].code);
    const c = chance(d.pop);
    s = c ? cap(precipWords(code)) + c + " " + when(wet) + "."
          : "A slight chance of " + precipWords(code) + " " + when(wet) + ".";
    const dry = day.filter(h => !wetHour(h));
    if(dry.length >= 4 && wet.length < 12) s += " Otherwise " + skyWord(dry, false) + ".";
  } else if(d.code === 45 || d.code === 48){
    s = (d.code === 48 ? "Freezing fog" : "Fog") + ", then " + skyWord(day.filter(h => wmo(h.code).sky !== "overcast" || h.code < 45), false) + ".";
  } else {
    s = cap(skyWord(day.length ? day : all, false)) + ".";
  }
  let hiTxt = " High " + d.hi + deg;
  if(i > 0){
    const diff = d.hi - days[i - 1].hi, prev = i - 1 === 0 ? "today" : i - 1 === 1 ? "tomorrow" : cardLabel(i - 1, days[i - 1].date);
    if(diff >= 8) hiTxt += ", much warmer than " + prev;
    else if(diff >= 4) hiTxt += ", warmer than " + prev;
    else if(diff <= -8) hiTxt += ", much colder than " + prev;
    else if(diff <= -4) hiTxt += ", cooler than " + prev;
  }
  s += hiTxt + ". Low " + d.lo + deg + ".";
  s += windWords(day.length ? day : all, d);
  if(d.pop != null && d.pop >= 20){
    s += " Chance of precipitation " + Math.round(d.pop) + "%.";
    s += amountWords(d, wmo(d.code).precip);
  }
  /* tonight, for today only. Once the day is over (6 pm, or after sunset
     from 3 pm) the daytime text is dropped and only tonight is shown. */
  if(i === 0 && days[1]){
    const p = zonedParts(new Date(), PLACE.tz);
    const sunDown = SCENE && SCENE.sun && SCENE.sun.alt < -0.833;
    const evening = p.hour >= 18 || (p.hour >= 15 && sunDown);
    const night = all.filter(h => h.hr >= Math.max(18, p.hour)).concat(hoursOn(days[1].date).filter(h => h.hr <= 7));
    if(night.length >= 4){
      const nWet = night.filter(wetHour), lo = Math.min(...night.map(h => h.temp));
      const maxPop = Math.max(0, ...night.map(h => h.pop || 0));
      let t = nWet.length ? cap(precipWords(nWet[0].code)) + (maxPop >= 70 ? " likely" : maxPop >= 40 ? " possible" : " in spots")
                          : cap(skyWord(night, true));
      const tn = "<b>Tonight:</b> " + t + ", low around " + lo + deg + ".";
      s = evening ? tn : s + "<br><br>" + tn;
    }
  }
  return s;
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
  $("phDetails").innerHTML = html.join("");
}
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
/* aurora: a green note at the top of the cards when it is active or expected
   tonight - the same note the desktop shows under the moon */
function renderAurora(){
  let n = null;
  try { n = auroraNote(); } catch(e){}
  $("phAur").innerHTML = n ? '<section class="pc aurCard ' + n.level + '"><span class="aurDot"></span>' + esc(n.text) + '</section>' : "";
}
function renderPlaces(){
  const list = loadPlaces(), h = here();
  /* a saved place that is where you are now folds into the My location chip
     (its x still removes it from the saved list) */
  const dup = h ? list.findIndex(p => sameTown(p, h)) : -1;
  const pin = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/></svg>';
  $("phPlaces").querySelector(".chips").innerHTML =
    '<span class="chip here' + (isHere(PLACE) ? " on" : "") + '" data-here="1">' + pin + 'My location' +
      (dup >= 0 ? ' <span class="hereName">&middot; ' + esc(placeName(list[dup])) + '</span><span class="x" data-x="' + dup + '">&times;</span>' : '') + '</span>' +
    list.map((p, i) => i === dup ? '' : '<span class="chip' + (samePlace(p, PLACE) ? " on" : "") + '" data-i="' + i + '">' +
                        esc(placeName(p)) + '<span class="x" data-x="' + i + '">&times;</span></span>').join("");
  let home = null;
  try { home = JSON.parse(STORE.get("weather.home") || "null"); } catch(e){}
  $("phOpenAt").innerHTML = home
    ? 'Opens at home: <b>' + esc(placeName(home)) + '</b><button class="linkBtn" id="phClearHome">Open at my location instead</button>'
    : 'Opens at your current location. To always open somewhere else, pick it and choose <b>Make current place home</b> in settings.';
  const ch = $("phClearHome"); if(ch) ch.addEventListener("click", clearHome);
  const saved = list.some(p => samePlace(p, PLACE));
  const btn = $("phSave");
  btn.textContent = saved ? "Saved ✓" : "Save " + placeName(PLACE);
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
  if(c && c.dataset.here){ goHere(); return; }
  if(c) goPlace(loadPlaces()[+c.dataset.i]);
});
$("phSave").addEventListener("click", () => {
  const list = loadPlaces();
  if(!list.some(p => samePlace(p, PLACE))){ list.push(Object.assign({}, PLACE)); savePlaces(list); }
  render(true);
});
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
let tx0 = 0, ty0 = 0, tt0 = 0;
top.addEventListener("touchstart", e => { const t = e.touches[0]; tx0 = t.clientX; ty0 = t.clientY; tt0 = Date.now(); }, { passive: true });
top.addEventListener("touchend", e => {
  const t = e.changedTouches[0], dx = t.clientX - tx0, dy = t.clientY - ty0;
  if(Math.abs(dx) > 60 && Math.abs(dx) > 2*Math.abs(dy) && Date.now() - tt0 < 800){
    const h = here();
    const list = (h ? [h] : []).concat(loadPlaces().filter(p => !h || !sameTown(p, h)));
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
    if(hasHome() && !manual) return;
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
if(APP && !hasHome()) setTimeout(locateHere, 300);
document.addEventListener("visibilitychange", () => {
  if(!document.hidden && APP && !hasHome() && Date.now() - lastLocate > 30*60000) locateHere();
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
  let home = null;
  try { home = JSON.parse(STORE.get("weather.home") || "null"); } catch(e){}
  if(!home){
    if(txt) txt.textContent = "Home: not set \u2014 the app opens at your current location";
    if(go) go.style.display = "none";
    clr.style.display = "none";
  } else {
    if(txt) txt.textContent = "Home: " + placeName(home) + (samePlace(home, PLACE) ? "  (showing now)" : "") + " \u2014 the app opens here";
    if(go) go.style.display = "";
    clr.style.display = "";
  }
}
try { window.syncSettings = function(){ syncSettingsWide.apply(this, arguments); syncHomeUI(); }; } catch(e){}
setTimeout(syncHomeUI, 0);
function clearHome(){
  try { window.localStorage.removeItem("weather.home"); } catch(e){}
  try { STORE.set("weather.home", ""); } catch(e){}
  try { syncSettings(); } catch(e){}
  syncHomeUI();
  render(true);
  locateHere();
}

render(true);
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
  el.textContent = "Njord Weather " + v + (b ? "  \u00b7  build " + b : "");
  el.hidden = false;
})();
