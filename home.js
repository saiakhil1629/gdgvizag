// Home page: coast scene, live event card, journey, organizers.
// Waves: sine paths whose period divides 1440 so the drift loops without a seam.
document.querySelectorAll("svg[data-wave]").forEach((svg) => {
  const [periods, amp] = svg.dataset.wave.split(",").map(Number);
  const pts = [];
  for (let x = 0; x <= 2880; x += 20) pts.push(`${x},${(14 + amp * Math.sin((x / 1440) * periods * Math.PI * 2)).toFixed(1)}`);
  svg.querySelector("path").setAttribute("d", `M0,100L${pts.join("L")}L2880,100Z`);
});

// The coast follows the Dawn / Day / Dusk / Night control in the nav.
(() => {
  const hero = document.querySelector(".hero");
  const stars = document.querySelector(".stars");
  if (!hero) return;
  for (let i = 0; i < 60; i++) {
    const s = document.createElement("i");
    const px = 1 + Math.random() * 2;
    s.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 100).toFixed(1)}%;width:${px}px;height:${px}px;animation-delay:${(-Math.random() * 3).toFixed(1)}s`;
    stars.append(s);
  }
  const set = (t) => { hero.dataset.time = t; };
  set(document.documentElement.dataset.time || "dawn");
  document.addEventListener("timechange", (e) => set(e.detail));
})();

// Live event card
(async () => {
  const host = document.getElementById("live-card");
  if (!host) return;
  const { events } = await FEED.events();
  FEED.renderCard(host, events, { quietTitle: "No event is on right now", quietText: "New GDG Vizag events are announced on the chapter page first." });
})();

// Our journey: built from the chapter's real event history
(async () => {
  const rail = document.getElementById("jy-rail");
  if (!rail) return;
  const { events } = await FEED.events();
  if (!events.length) { rail.innerHTML = '<p class="note">The events feed could not be reached. Try again in a moment.</p>'; return; }
  const chapter = await FEED.chapter();
  const launch = events.find((e) => /launch of the gdg vizag/i.test(e.title));
  const first = launch || events[events.length - 1];
  const total = events.length;
  const members = chapter.members || 3270;
  const devfests = events.filter((e) => e.cat === "DevFest" && !/core committee/i.test(e.title)).length;
  const sinceYear = FEED.fmt(first.start, { year: "numeric" });
  document.getElementById("jy-sub").textContent = `From ${launch ? "the chapter launch on " + FEED.fmt(launch.start, { day: "numeric", month: "long", year: "numeric" }) : "our first event in " + sinceYear} to ${total} events, one at a time.`;
  document.getElementById("jy-stats").innerHTML = [
    [members.toLocaleString("en-IN"), "members"], [String(total), "events since " + sinceYear], [String(devfests), "DevFests"],
  ].map(([n, l]) => `<div class="jy-stat"><strong>${esc(n)}</strong><span>${esc(l)}</span></div>`).join("");
  const SCORE = [[/launch of the gdg/i, 100], [/dev ?fest|developers fest/i, 90], [/women|wtm|iwd/i, 70], [/i\/?o extended/i, 60], [/build ?with ?ai|prompt to product|buildathon|agentic/i, 50]];
  const score = (t) => { for (const [re, s] of SCORE) if (re.test(t)) return s; return 10; };
  const byYear = {};
  events.forEach((e) => (byYear[e.year] = byYear[e.year] || []).push(e));
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a); // newest first
  const TONES = ["blue", "red", "yellow", "green"];
  const nowYear = +FEED.fmt(new Date(), { year: "numeric" });
  rail.innerHTML = "";
  years.forEach((y, i) => {
    const list = byYear[y];
    const top = [...list].sort((a, b) => score(b.title) - score(a.title) || a.start - b.start).slice(0, 3);
    const t = TONES[i % 4];
    const a = el("a", `jy tone-${t}`);
    a.href = `events.html?year=${y}`;
    a.setAttribute("role", "listitem");
    const [n, amp] = [[8, 0.07], [5, 0.15], [6, 0.12], [4, 0.2]][i % 4];
    a.innerHTML = `<svg class="jy-art" viewBox="-100 -100 200 200" aria-hidden="true"><path d="${shapePath(n, amp)}"/></svg>
      <span class="jy-year">${y}</span>
      <span class="jy-count">${list.length} ${list.length === 1 ? "event" : "events"}${y === nowYear ? ", so far" : ""}</span>
      <ul>${top.map((e) => `<li>${esc(e.title.replace(/\s*\(.*?\)\s*$/, ""))}</li>`).join("")}</ul>`;
    rail.append(a);
  });
})();

// Organizers
(() => {
  const host = document.getElementById("people");
  if (host) FEED.renderTeam(host);
})();
