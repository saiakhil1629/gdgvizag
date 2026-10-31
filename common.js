// Set these once DevFest Vizag 2026 is announced.
const EVENT = {
  date: null, // ISO string, e.g. "2026-12-05T09:00:00+05:30"
  venue: null, // e.g. "GITAM University, Rushikonda, Visakhapatnam"
  ticketUrl: null, // e.g. a gdg.community.dev or KonfHub link once tickets open
  cfpUrl: null, // Sessionize / Papercall link once speaker applications open
  deckUrl: null, // link to the sponsorship deck PDF
};


if (EVENT.ticketUrl) {
  document.querySelectorAll("[data-ticket]").forEach((a) => {
    a.href = EVENT.ticketUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Get tickets";
  });
}

const COLORS = ["#4285f4", "#ea4335", "#f5a800", "#34a853"];
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Shapes: r = R(1 + amp cos(n * theta)). amp 0 is a circle, higher is a scalloped cookie or flower.
const shapePath = (n, amp) => {
  const pts = [];
  for (let i = 0; i < 180; i++) {
    const t = (i / 180) * Math.PI * 2;
    const r = 88 * (1 + amp * Math.cos(n * t));
    pts.push(`${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
};

const SHAPES = [[8, 0.07], [5, 0.15], [6, 0.12], [4, 0.2]];

// Mobile menu
const btn = document.querySelector(".menu-btn");
const menu = document.getElementById("menu");
const setMenu = (open) => {
  menu.classList.toggle("open", open);
  btn.setAttribute("aria-expanded", String(open));
};
btn.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

// Event details + countdown
const venueChip = document.querySelector('[data-event="venue"]');
if (EVENT.venue && venueChip) venueChip.textContent = EVENT.venue;
const dateChip = document.querySelector('[data-event="date"]');
if (EVENT.date && dateChip) {
  const when = new Date(EVENT.date);
  dateChip.textContent =
    when.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const box = document.getElementById("countdown");
  const tick = () => {
    const ms = when - Date.now();
    if (ms <= 0) { box.hidden = true; return; }
    const parts = [["Days", 864e5], ["Hours", 36e5], ["Min", 6e4], ["Sec", 1e3]];
    let rest = ms;
    box.innerHTML = parts.map(([label, size]) => {
      const v = Math.floor(rest / size);
      rest -= v * size;
      return `<div><strong>${String(v).padStart(2, "0")}</strong><span>${label}</span></div>`;
    }).join("");
    box.hidden = false;
  };
  tick();
  setInterval(tick, 1000);
}

// Stat count-up
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!reduce && "IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const node = en.target;
      const end = +node.dataset.count;
      const suffix = node.dataset.suffix || "";
      const start = performance.now();
      const run = (now) => {
        const p = Math.min((now - start) / 1100, 1);
        node.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))).toLocaleString("en-IN") + (p === 1 ? suffix : "");
        if (p < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("[data-count]").forEach((n) => io.observe(n));
}

// Morphing shapes: only animate while on screen.
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (reduceMotion) document.documentElement.classList.add("no-motion");
const live = [];
const seen = "IntersectionObserver" in window
  ? new IntersectionObserver((es) => es.forEach((e) => { e.target._vis = e.isIntersecting; }))
  : null;
function registerShapes(root) {
  root.querySelectorAll("svg[data-n]").forEach((svg, i) => {
    const path = svg.querySelector("path");
    const n = +svg.dataset.n;
    const amp = +svg.dataset.amp;
    path.setAttribute("d", shapePath(n, amp));
    if (svg.dataset.static || reduceMotion || svg._reg) return;
    svg._reg = true;
    svg._vis = true;
    if (seen) seen.observe(svg);
    live.push({ svg, path, n, amp, speed: +svg.dataset.speed || 1, dir: i % 2 ? -1 : 1, phase: i * 1.7 });
  });
}
registerShapes(document);
if (live.length) {
  const frame = (ms) => {
    const t = ms / 1000;
    for (const s of live) {
      if (!s.svg._vis) continue;
      const a = s.amp * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      s.path.setAttribute("d", shapePath(s.n, a));
      s.path.setAttribute("transform", `rotate(${(t * 12 * s.dir * s.speed).toFixed(1)})`);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// Sound effects: tiny synth blips, off until the visitor turns them on.
const sfxBtn = document.getElementById("sfx");
let sfxOn = false;
let audio;
const NOTES = { tick: [[880, 0.04]], flip: [[660, 0.05]], match: [[784, 0.08], [1047, 0.12]], win: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.22]] };
function sfx(kind) {
  if (!sfxOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    let t = audio.currentTime;
    (NOTES[kind] || []).forEach(([freq, len]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + len);
      t += len;
    });
  } catch { /* audio unavailable */ }
}
sfxBtn.addEventListener("click", () => {
  sfxOn = !sfxOn;
  sfxBtn.setAttribute("aria-pressed", String(sfxOn));
  sfxBtn.textContent = sfxOn ? "Sound on" : "Sound off";
  sfx("match");
});


// Close any dialog by clicking its backdrop
document.querySelectorAll("dialog.dlg").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

// Time of day and theme in one control. Dawn and Day are the light theme, Dusk and Night the dark theme.
// Follows the system theme (and the clock for light mode) until the visitor picks one.
(() => {
  const TIME_KEY = "devfest-vizag-time";
  const THEME_KEY = "devfest-vizag-theme";
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll(".nav-time button")];
  const flip = document.getElementById("theme");
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const isDark = (t) => t === "dusk" || t === "night";
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
  const valid = (t) => ["dawn", "day", "dusk", "night"].includes(t);
  const byClock = () => { const h = new Date().getHours(); return h < 9 ? "dawn" : h < 16 ? "day" : "dusk"; };
  let chosen = read(TIME_KEY);
  if (!valid(chosen)) { const th = read(THEME_KEY); chosen = th === "dark" ? "night" : th === "light" ? "day" : null; }
  const auto = () => (mq.matches ? "night" : byClock());
  const apply = (t, user) => {
    root.dataset.time = t;
    root.dataset.theme = isDark(t) ? "dark" : "light";
    root.style.colorScheme = root.dataset.theme;
    buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.time === t)));
    if (flip) {
      flip.setAttribute("aria-pressed", String(isDark(t)));
      flip.setAttribute("aria-label", isDark(t) ? "Switch to light theme" : "Switch to dark theme");
    }
    if (user) { write(TIME_KEY, t); write(THEME_KEY, root.dataset.theme); }
    document.dispatchEvent(new CustomEvent("timechange", { detail: t }));
    document.dispatchEvent(new CustomEvent("themechange", { detail: root.dataset.theme }));
  };
  apply(chosen || auto(), false);
  buttons.forEach((b) => b.addEventListener("click", () => {
    chosen = b.dataset.time;
    apply(chosen, true);
    if (typeof sfx === "function") sfx("tick");
  }));
  // Plain light/dark flip: light goes to Night, dark goes back to Day.
  if (flip) flip.addEventListener("click", () => {
    chosen = isDark(root.dataset.time) ? "day" : "night";
    apply(chosen, true);
    if (typeof sfx === "function") sfx("tick");
  });
  mq.addEventListener("change", () => { if (!chosen) apply(auto(), false); });
})();
