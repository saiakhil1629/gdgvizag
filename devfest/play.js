// Badge maker
const THEMES = {
  "AI and agents": { bg: "#d3e3fd", fg: "#041e49", shape: "#4285f4" },
  Web: { bg: "#fad2cf", fg: "#410e0b", shape: "#ea4335" },
  Cloud: { bg: "#ffe08a", fg: "#3b2f00", shape: "#fbbc04" },
  Mobile: { bg: "#c4eed0", fg: "#072711", shape: "#34a853" },
  Startups: { bg: "#4285f4", fg: "#ffffff", shape: "#fbbc04" },
  Careers: { bg: "#191c20", fg: "#ffffff", shape: "#34a853" },
};
const FRAMES = { Cookie: [8, 0.07], Flower: [5, 0.16], Clover: [4, 0.2], Circle: [4, 0] };
const FORMATS = {
  "Square (LinkedIn, X)": { w: 800, h: 800, out: [1080, 1080], cy: 388, sc: 2.02, hx: 64, hy: 96, ny: 676, ry: 722, fy: 768, name: 60, file: "square" },
  "Story (Instagram, WhatsApp)": { w: 450, h: 800, out: [1080, 1920], cy: 390, sc: 1.66, hx: 40, hy: 150, ny: 636, ry: 676, fy: 720, name: 40, file: "story" },
};
const ROLES = ["Student", "Developer", "Designer", "Founder", "Curious"];
const badge = { name: "", role: "Developer", topic: "AI and agents", frame: "Cookie", fmt: "Square (LinkedIn, X)", photo: "" };

const radios = (host, group, items, key) => {
  items.forEach((label) => {
    const l = el("label");
    l.innerHTML = `<input type="radio" name="${group}" value="${esc(label)}"${badge[key] === label ? " checked" : ""}><span>${esc(label)}</span>`;
    l.querySelector("input").addEventListener("change", () => { badge[key] = label; drawBadge(); sfx("tick"); });
    host.appendChild(l);
  });
};
radios(document.getElementById("b-fmt"), "fmt", Object.keys(FORMATS), "fmt");
radios(document.getElementById("b-frame"), "frame", Object.keys(FRAMES), "frame");
radios(document.getElementById("b-role"), "role", ROLES, "role");
radios(document.getElementById("b-topic"), "topic", Object.keys(THEMES), "topic");

const badgeSvg = document.getElementById("badge-svg");
const note = document.getElementById("b-note");
const FONT = "'Google Sans Flex','Outfit',system-ui,sans-serif";

function drawBadge() {
  const t = THEMES[badge.topic];
  const f = FORMATS[badge.fmt];
  const [n, amp] = FRAMES[badge.frame];
  const name = badge.name.trim() || "Your name";
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const cx = f.w / 2;
  const size = Math.max(f.name * 0.55, f.name - Math.max(0, name.length - 10) * (f.name / 30));
  const inkOnShape = t.shape === "#fbbc04" ? "#3b2f00" : "#ffffff";
  const d = shapePath(n, amp);
  const hero = badge.photo
    ? `<path d="${d}" transform="scale(1.1)" fill="${t.shape}"/>
       <clipPath id="bclip"><path d="${d}"/></clipPath>
       <image href="${badge.photo}" x="-100" y="-100" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#bclip)"/>
       <path d="${d}" fill="none" stroke="#fff" stroke-width="2.4"/>`
    : `<path d="${d}" fill="${t.shape}"/><text y="20" text-anchor="middle" font-family="${FONT}" font-size="58" font-weight="800" fill="${inkOnShape}">${esc(ini)}</text>`;
  const tall = f.h > f.w;
  badgeSvg.setAttribute("viewBox", `0 0 ${f.w} ${f.h}`);
  badgeSvg.innerHTML = `
    <rect width="${f.w}" height="${f.h}" rx="${tall ? 36 : 48}" fill="${t.bg}"/>
    <g transform="translate(${f.hx} ${f.hy - 24}) scale(${tall ? 0.8 : 1.1})" fill="none" stroke="${t.fg}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2 2 16l16 14"/><path d="m34 2 16 14-16 14"/></g>
    <text x="${f.hx + (tall ? 50 : 76)}" y="${f.hy}" font-family="${FONT}" font-size="${tall ? 24 : 34}" font-weight="800" fill="${t.fg}">DevFest Vizag 2026</text>
    <g transform="translate(${cx} ${f.cy}) scale(${f.sc})">${hero}</g>
    <text x="${cx}" y="${f.ny}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="800" letter-spacing="-2" fill="${t.fg}">${esc(name)}</text>
    <text x="${cx}" y="${f.ry}" text-anchor="middle" font-family="${FONT}" font-size="${tall ? 22 : 28}" font-weight="500" fill="${t.fg}" opacity=".85">${esc(badge.role)} into ${esc(badge.topic)}</text>
    <text x="${cx}" y="${f.fy}" text-anchor="middle" font-family="${FONT}" font-size="${tall ? 15 : 19}" font-weight="600" fill="${t.fg}" opacity=".65">Google Developer Groups Vizag  #DevFestVizag</text>`;
}
document.getElementById("b-name").addEventListener("input", (e) => { badge.name = e.target.value; drawBadge(); });

// Photo: crop to a square in the browser, nothing is uploaded.
const clearBtn = document.getElementById("b-clear");
const loadPhoto = (file) => {
  if (!file) return;
  if (!file.type.startsWith("image/")) { note.textContent = "Choose an image file (JPG, PNG or HEIC)."; return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const s = Math.min(img.width, img.height);
    const c = document.createElement("canvas");
    c.width = c.height = 720;
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 720, 720);
    badge.photo = c.toDataURL("image/jpeg", 0.9);
    URL.revokeObjectURL(url);
    clearBtn.hidden = false;
    note.textContent = "Photo added. It stays on your device.";
    drawBadge();
  };
  img.onerror = () => { URL.revokeObjectURL(url); note.textContent = "Could not read that photo. Try a JPG or PNG."; };
  img.src = url;
};
document.getElementById("b-photo").addEventListener("click", () => document.getElementById("b-file").click());
document.getElementById("b-selfie").addEventListener("click", () => document.getElementById("b-cam").click());
document.getElementById("b-file").addEventListener("change", (e) => { loadPhoto(e.target.files[0]); e.target.value = ""; });
document.getElementById("b-cam").addEventListener("change", (e) => { loadPhoto(e.target.files[0]); e.target.value = ""; });
clearBtn.addEventListener("click", () => { badge.photo = ""; clearBtn.hidden = true; note.textContent = "Photo removed."; drawBadge(); });
drawBadge();

const badgeBlob = () => new Promise((resolve, reject) => {
  const f = FORMATS[badge.fmt];
  const xml = new XMLSerializer().serializeToString(badgeSvg);
  const ns = xml.includes('xmlns="http://www.w3.org/2000/svg"') ? "" : ' xmlns="http://www.w3.org/2000/svg"';
  const url = URL.createObjectURL(new Blob([xml.replace("<svg", `<svg${ns} width="${f.w}" height="${f.h}"`)], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    [c.width, c.height] = f.out;
    c.getContext("2d").drawImage(img, 0, 0, f.out[0], f.out[1]);
    URL.revokeObjectURL(url);
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/png");
  };
  img.onerror = () => reject(new Error("render failed"));
  img.src = url;
});
const caption = () => "I'm joining DevFest Vizag 2026 with Google Developer Groups Vizag! #DevFest #DevFestVizag";
const fileName = () => `devfest-vizag-badge-${FORMATS[badge.fmt].file}.png`;

document.getElementById("b-dl").addEventListener("click", async () => {
  try {
    const blob = await badgeBlob();
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    a.click();
    note.textContent = `Badge downloaded (${FORMATS[badge.fmt].out.join(" x ")} px).`;
    sfx("win");
  } catch { note.textContent = "Could not create the image. Take a screenshot of the preview instead."; }
});
document.getElementById("b-share").addEventListener("click", async () => {
  try {
    const blob = await badgeBlob();
    const file = new File([blob], fileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: caption() });
      return;
    }
    await navigator.clipboard.writeText(caption());
    note.textContent = "Caption copied. Download the badge and post them together.";
  } catch (err) {
    if (err && err.name === "AbortError") return;
    note.textContent = "Sharing is not available here. Download the badge and post it yourself.";
  }
});

// Shape-match game
const PAIRS = [
  ["#4285f4", 8, 0.07], ["#ea4335", 5, 0.16], ["#fbbc04", 6, 0.12], ["#34a853", 4, 0.2],
  ["#4285f4", 3, 0.18], ["#ea4335", 10, 0.06], ["#fbbc04", 7, 0.1], ["#34a853", 9, 0.08],
];
const board = document.getElementById("board");
const gMoves = document.getElementById("g-moves");
const gTime = document.getElementById("g-time");
const gBest = document.getElementById("g-best");
const gMsg = document.getElementById("g-msg");
const BEST_KEY = "devfest-vizag-best";
const readBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* storage blocked */ } };
let state;
const showBest = () => { const b = readBest(); gBest.textContent = b ? `Best: ${b} ${b === 1 ? "move" : "moves"}` : "Best: none yet"; };

function newGame() {
  clearInterval(state && state.timer);
  const deck = [...PAIRS, ...PAIRS].map((p, i) => ({ p, k: i })).sort(() => Math.random() - 0.5);
  state = { open: [], moves: 0, found: 0, secs: 0, timer: null, lock: false };
  gMoves.textContent = "0 moves"; gTime.textContent = "0s"; gMsg.textContent = ""; showBest();
  board.innerHTML = "";
  deck.forEach(({ p }, i) => {
    const b = el("button", "tile3");
    b.type = "button";
    b.dataset.i = i;
    b.setAttribute("aria-label", `Card ${i + 1}, face down`);
    b.innerHTML = `<span class="back"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 14 8 32l18 18"/><path d="m38 14 18 18-18 18"/></svg></span><span class="face"><svg viewBox="-100 -100 200 200" aria-hidden="true"><path d="${shapePath(p[1], p[2])}" fill="${p[0]}"/></svg></span>`;
    b.addEventListener("click", () => flip(b, p));
    board.appendChild(b);
  });
}
function flip(btn, p) {
  if (state.lock || btn.classList.contains("open") || btn.classList.contains("done")) return;
  if (!state.timer) state.timer = setInterval(() => { gTime.textContent = `${++state.secs}s`; }, 1000);
  btn.classList.add("open");
  sfx("flip");
  btn.setAttribute("aria-label", `Card ${+btn.dataset.i + 1}, shape ${p[1]}-lobed, ${p[0]}`);
  state.open.push([btn, p]);
  if (state.open.length < 2) return;
  state.moves++;
  gMoves.textContent = `${state.moves} ${state.moves === 1 ? "move" : "moves"}`;
  const [[a, pa], [b, pb]] = state.open;
  state.open = [];
  if (pa === pb) {
    [a, b].forEach((x) => { x.classList.replace("open", "done"); x.setAttribute("aria-label", "Matched"); });
    sfx("match");
    if (++state.found === PAIRS.length) {
      clearInterval(state.timer);
      const best = readBest();
      const record = !best || state.moves < best;
      if (record) writeBest(state.moves);
      showBest();
      sfx("win");
      gMsg.textContent = `All matched in ${state.moves} moves and ${state.secs}s.${record ? " New best!" : ""} Press New game to play again.`;
    }
    return;
  }
  state.lock = true;
  setTimeout(() => {
    [a, b].forEach((x) => { x.classList.remove("open"); x.setAttribute("aria-label", `Card ${+x.dataset.i + 1}, face down`); });
    state.lock = false;
  }, 800);
}
document.getElementById("g-reset").addEventListener("click", newGame);
newGame();
