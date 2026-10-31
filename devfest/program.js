const SPEAKERS_2023 = [
  { name: "Pawan Kumar", role: "Lead Engineer, Frontier", talk: "App Evolution with LLM", panel: true },
  { name: "Bhavik Makwana", role: "FlutterFlow, GDE Flutter & Dart", talk: "Flutter makes Animations Easy", panel: true },
  { name: "Krishnamohan Chivukula", role: "Co-Founder & CTO, Gurujada", talk: "Surviving as Developer in AI World" },
  { name: "Manas Malla", role: "Google Product Expert, Android" },
  { name: "Santhosh Nimmani", role: "DevOps Lead, TEDx Speaker" },
  { name: "Jaldeep Asodariya", role: "Senior Mobile Engineer, HighLevel", panel: true },
  { name: "Sasi Teja Kamsu", role: "Engineer, Confluent" },
  { name: "Sampath Balivada", role: "Software Engineer, PayPal" },
  { name: "Usha Ramani", role: "Co-Founder, Gurujada" },
  { name: "Abhishek Mankuskar", role: "Founder, Social Winter of Code" },
  { name: "Madhu Vadlamani", role: "Data Analytics, Miracle Systems" },
  { name: "Mohammad Yasin", role: "SDE, Board Infinity" },
];

// Speakers
const grid = document.getElementById("speaker-grid");
const spkDlg = document.getElementById("spk-dlg");
SPEAKERS_2023.forEach((s, i) => {
  const [n, amp] = SHAPES[i % 4];
  const card = el("button", "spk");
  card.type = "button";
  card.setAttribute("aria-label", `${s.name}, ${s.role}. Open details`);
  card.innerHTML = `<svg class="avatar" viewBox="-100 -100 200 200" style="--c:${COLORS[i % 4]}" aria-hidden="true"><path d="${shapePath(n, amp)}"/><text y="19">${esc(initials(s.name))}</text></svg><h3>${esc(s.name)}</h3><p>${esc(s.role)}</p>`;
  card.addEventListener("click", () => {
    const links = s.links ? Object.entries(s.links).map(([k, v]) => `<a class="btn btn-sm btn-tonal" href="${esc(v)}" target="_blank" rel="noopener">${esc(k)}</a>`).join("") : "";
    document.getElementById("spk-body").innerHTML = `
      <h3 id="spk-title">${esc(s.name)}</h3>
      <p>${esc(s.role)}</p>
      <div class="badges"><span>DevFest Vizag 2023 speaker</span>${s.panel ? "<span>Panelist</span>" : ""}${s.level ? `<span>${esc(s.level)}</span>` : ""}</div>
      <div class="talk"><b>${s.talk ? "Talk" : "Talk details"}</b><span>${s.talk ? esc(s.talk) : "Not published for this speaker."}</span></div>
      ${links ? `<div class="cta">${links}</div>` : '<p class="note">Talk level and social links appear here once speakers are announced.</p>'}`;
    spkDlg.showModal();
  });
  grid.appendChild(card);
});

// My DevFest agenda
const SESSIONS = [
  { id: "reg", s: "09:00", e: "10:00", title: "Registration and welcome", track: "All", note: "Check in and pick up your badge." },
  { id: "key", s: "10:00", e: "10:45", title: "Opening keynote", track: "All", note: "Welcome from the organizers and the year ahead." },
  { id: "ai1", s: "11:00", e: "11:45", title: "AI and agents session", track: "AI and agents", note: "Gemini and agentic apps, from demo to production." },
  { id: "web1", s: "11:00", e: "11:45", title: "Web session", track: "Web", note: "Modern web platform, performance and Firebase." },
  { id: "mob1", s: "11:45", e: "12:30", title: "Mobile session", track: "Mobile", note: "Flutter and Android craft." },
  { id: "cld1", s: "11:45", e: "12:30", title: "Cloud session", track: "Cloud", note: "Google Cloud and DevOps that scale." },
  { id: "pan", s: "12:30", e: "14:00", title: "Careers panel and networking lunch", track: "Careers", note: "Speakers and builders on getting hired." },
  { id: "lab1", s: "14:00", e: "15:30", title: "Code lab: Agentic AI", track: "AI and agents", note: "Hands-on, bring your laptop." },
  { id: "lab2", s: "14:00", e: "15:30", title: "Code lab: Cloud skills boost", track: "Cloud", note: "Hands-on, bring your laptop." },
  { id: "stp", s: "15:45", e: "16:30", title: "Startup stories", track: "Startups", note: "Founders on shipping and growth." },
  { id: "end", s: "16:30", e: "17:30", title: "Wrap-up and group photo", track: "All", note: "Closing, swag and photos." },
];
(() => {
  const list = document.getElementById("agenda");
  const filterHost = document.getElementById("track-filters");
  const msg = document.getElementById("agenda-note");
  if (!list) return;
  const KEY = "devfest-vizag-stars";
  let stars = new Set();
  try { stars = new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...stars])); } catch { /* storage blocked */ } };
  const tracks = ["All tracks", "Starred", "AI and agents", "Web", "Cloud", "Mobile", "Startups", "Careers"];
  let filter = "All tracks";
  const fmt = (t) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8Z"/></svg>';

  list.innerHTML = SESSIONS.map((x) => `
    <li data-id="${x.id}" data-track="${esc(x.track)}">
      <span class="when">${fmt(x.s)}</span>
      <div><h3>${esc(x.title)}</h3><p>${esc(x.note)}</p><span class="tag">${esc(x.track)}</span></div>
      <button class="star" type="button" aria-pressed="false" aria-label="Star ${esc(x.title)}">${STAR}</button>
    </li>`).join("");

  const apply = () => {
    list.querySelectorAll("li").forEach((li) => {
      const t = li.dataset.track;
      const starred = stars.has(li.dataset.id);
      const show = filter === "All tracks" || (filter === "Starred" ? starred : t === filter || t === "All");
      li.hidden = !show;
      const b = li.querySelector(".star");
      b.setAttribute("aria-pressed", String(starred));
    });
    filterHost.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === filter)));
    const sc = document.getElementById("star-count");
    if (sc) sc.textContent = `${stars.size} starred`;
  };
  tracks.forEach((f) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.f = f;
    b.textContent = f;
    b.addEventListener("click", () => { filter = f; apply(); sfx("tick"); });
    filterHost.append(b);
  });
  list.addEventListener("click", (e) => {
    const b = e.target.closest(".star");
    if (!b) return;
    const id = b.closest("li").dataset.id;
    stars.has(id) ? stars.delete(id) : stars.add(id);
    save(); apply(); sfx("flip");
  });
  apply();

  // Calendar needs a real date, so it unlocks when EVENT.date is set.
  const day = () => (EVENT.date ? EVENT.date.slice(0, 10) : null);
  const utc = (d, t) => new Date(`${d}T${t}:00+05:30`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const chosen = () => SESSIONS.filter((x) => stars.has(x.id));
  const needDate = () => { msg.innerHTML = `<span id="star-count">${stars.size} starred</span> Calendar export unlocks once the date is announced.`; };
  window.devfestAgenda = { chosen, utc };

  document.getElementById("cal-google").addEventListener("click", () => {
    const d = day();
    if (!d) return needDate();
    const q = new URLSearchParams({ action: "TEMPLATE", text: "DevFest Vizag 2026", dates: `${utc(d, "09:00")}/${utc(d, "17:30")}`, details: "Google Developer Groups Vizag. Talks, code labs and community.", location: EVENT.venue || "Visakhapatnam, Andhra Pradesh" });
    window.open(`https://calendar.google.com/calendar/render?${q}`, "_blank", "noopener");
  });
  document.getElementById("cal-ics").addEventListener("click", () => {
    const d = day();
    if (!d) return needDate();
    const picks = chosen();
    if (!picks.length) { msg.innerHTML = `<span id="star-count">0 starred</span> Star at least one session first.`; return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GDG Vizag//DevFest Vizag 2026//EN"];
    picks.forEach((x) => lines.push("BEGIN:VEVENT", `UID:${x.id}-${d}@devfest-vizag`, `DTSTAMP:${stamp}`, `DTSTART:${utc(d, x.s)}`, `DTEND:${utc(d, x.e)}`, `SUMMARY:${x.title}`, `DESCRIPTION:${x.note}`, `LOCATION:${EVENT.venue || "Visakhapatnam"}`, "END:VEVENT"));
    lines.push("END:VCALENDAR");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
    a.download = "my-devfest-vizag-agenda.ics";
    a.click();
  });
})();
