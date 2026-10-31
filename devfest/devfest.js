// DevFest overview page: showpiece About effects, live editions list, DevFests across India.
// About: words light up as you scroll
(() => {
  const root = document.getElementById("reveal");
  if (!root) return;
  const words = [];
  const wrap = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((tok) => {
          if (!tok.trim()) { frag.append(tok); return; }
          const s = el("span", "w");
          s.textContent = tok;
          words.push(s);
          frag.append(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) wrap(n);
    });
  };
  wrap(root);
  if (reduceMotion) return;
  let queued = false;
  const update = () => {
    queued = false;
    const r = root.getBoundingClientRect();
    const vh = innerHeight;
    const p = Math.min(1, Math.max(0, (vh * 0.82 - r.top) / (r.height + vh * 0.25)));
    const on = Math.round(p * words.length);
    words.forEach((w, i) => w.classList.toggle("on", i < on));
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  update();
})();

// About: terminal types itself once
(() => {
  const out = document.getElementById("term-out");
  if (!out) return;
  const LINES = [
    [["p", "$ "], ["", "gemini create devfest-vizag-app"]],
    [["o", "Scaffolding your first AI agent..."]],
    [["ok", "Agent ready."]],
    [["p", "$ "], ["", "flutter run"]],
    [["o", "Launching on your laptop..."]],
    [["ok", "App is running. Nice work!"]],
  ];
  const render = (upTo, chars, caret) => {
    out.innerHTML = LINES.slice(0, upTo + 1).map((segs, li) => {
      let left = li === upTo ? chars : Infinity;
      return segs.map(([cls, text]) => {
        const t = text.slice(0, Math.max(0, left));
        left -= text.length;
        return `<span class="${cls}">${esc(t)}</span>`;
      }).join("");
    }).join("\n") + (caret ? '<span class="caret"></span>' : "");
  };
  if (reduceMotion) { render(LINES.length - 1, Infinity, false); return; }
  render(0, 0, true);
  let started = false;
  const run = () => {
    let line = 0, ch = 0;
    const total = (i) => LINES[i].reduce((n, [, t]) => n + t.length, 0);
    const step = () => {
      render(line, ch, true);
      if (ch < total(line)) { ch++; setTimeout(step, line % 3 === 0 ? 55 : 22); return; }
      if (line < LINES.length - 1) { line++; ch = 0; setTimeout(step, 450); return; }
      render(line, Infinity, true);
    };
    step();
  };
  new IntersectionObserver((es, o) => {
    if (started || !es[0].isIntersecting) return;
    started = true; o.disconnect(); run();
  }, { threshold: 0.4 }).observe(out);
})();

// About: edition ribbon along a wavy coastline
(() => {
  const host = document.getElementById("years");
  if (!host) return;
  const YEARS = [
    ["2018", "Where it started"], ["2019", "Second year"], ["2020", "Online edition"], ["2021", "Community edition"],
    ["2022", "1,159 RSVPs"], ["2023", "700+ RSVPs"], ["2024", "Two days, 1,000+ expected"], ["2025", "Code labs on Agentic AI"],
  ];
  const COL = ["#4285f4", "#ea4335", "#fbbc04", "#34a853"];
  const W = 1000, H = 190;
  const yAt = (i) => H / 2 + 34 * Math.sin(i * 1.05);
  const xAt = (i) => ((i + 0.5) / YEARS.length) * W;
  let d = "";
  for (let x = 0; x <= W; x += 10) {
    const i = (x / W) * YEARS.length - 0.5;
    d += `${x ? "L" : "M"}${x},${(H / 2 + 34 * Math.sin(i * 1.05)).toFixed(1)}`;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<path class="line" d="${d}" vector-effect="non-scaling-stroke"/>`;
  host.append(svg);
  YEARS.forEach(([y, note], i) => {
    const item = el("div", "yr");
    item.setAttribute("role", "listitem");
    item.tabIndex = 0;
    item.style.left = `${(xAt(i) / W) * 100}%`;
    item.style.top = `${(yAt(i) / H) * 100}%`;
    const n = [8, 5, 6, 4, 7, 9, 3, 10][i];
    const amp = [0.07, 0.16, 0.12, 0.2, 0.1, 0.07, 0.2, 0.06][i];
    item.innerHTML = `<svg viewBox="-100 -100 200 200" aria-hidden="true"><path d="${shapePath(n, amp)}" fill="${COL[i % 4]}"/></svg><b>${y}</b><small>${esc(note)}</small>`;
    host.append(item);
  });
})();

// Ask DevFest: answers come from a built-in FAQ, not a live model.
(() => {
  const log = document.getElementById("ask-log");
  const form = document.getElementById("ask-form");
  const input = document.getElementById("ask-in");
  const chips = document.getElementById("ask-chips");
  if (!log || !form) return;
  const KB = [
    { k: ["bring", "carry", "laptop", "charger", "pack", "code lab", "codelab"], a: "Bring a laptop and charger for the code labs, plus your ticket or QR code for check-in." },
    { k: ["register", "ticket", "sign up", "signup", "rsvp", "seat"], a: "Tickets open on the GDG Vizag chapter page (gdg.community.dev/gdg-vizag). Press Get notified to jump there." },
    { k: ["certificate", "swag", "t-shirt", "tshirt", "sticker", "goodies", "merch", "giveaway"], a: "Certificates and swag aren't confirmed for 2026. Details are posted on the event page when tickets open." },
    { k: ["when", "date", "where", "venue", "location", "gitam", "address"], a: () => {
      const n = window.DEVFEST_NEXT;
      return n ? `${n.title} is on ${FEED.dateLabel(n)} at ${FEED.timeLabel(n.start)}${n.venue ? `, ${n.venue}` : ""}.` : "The next DevFest isn't announced yet. Past editions were at GITAM University, Rushikonda, in November or December.";
    } },
    { k: ["free", "price", "cost", "fee", "paid", "how much"], a: "Each chapter sets its own pricing. Vizag has run free and paid editions. 2026 pricing arrives with ticket launch." },
    { k: ["speak", "cfp", "talk", "proposal", "submit"], a: "Call for speakers opens before the event. See the Community page, or the chapter page." },
    { k: ["sponsor", "partner", "deck"], a: "Sponsors: open Become a sponsor on the Community page. It lists how to reach the organizers." },
    { k: ["student", "beginner", "who can", "attend", "level"], a: "Students, developers, founders and freelancers are all welcome. All skill levels." },
    { k: ["food", "lunch", "eat"], a: "Past editions included a networking lunch. 2026 catering isn't announced yet." },
  ];
  const answer = (q) => {
    const s = q.toLowerCase();
    let best = null, score = 0;
    KB.forEach((e) => { const n = e.k.filter((w) => s.includes(w)).length; if (n > score) { score = n; best = e; } });
    return best ? (typeof best.a === "function" ? best.a() : best.a) : "I only know DevFest Vizag basics. Try asking about tickets, what to bring, the date, swag or speaking.";
  };
  let busy = false;
  const ask = (q) => {
    q = q.trim();
    if (!q || busy) return;
    busy = true;
    const line = document.createElement("div");
    line.innerHTML = `<span class="q"><span class="p" style="color:#34a853">$ </span>ask "${esc(q)}"</span>`;
    const ans = document.createElement("span");
    ans.className = "a";
    line.append(ans);
    log.append(line);
    const text = answer(q);
    let i = 0;
    const type = () => {
      ans.textContent = text.slice(0, (i += reduceMotion ? text.length : 3));
      log.scrollTop = log.scrollHeight;
      if (i < text.length) setTimeout(type, 16); else busy = false;
    };
    setTimeout(type, reduceMotion ? 0 : 250);
    sfx("tick");
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); input.value = ""; });
  ["What should I bring to the code lab?", "Where can I register?", "Are there certificates or swag?", "Is it free?"].forEach((q) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = q;
    b.addEventListener("click", () => ask(q));
    chips.append(b);
  });
})();

// DevFests across India
const CITIES = [
  ["Chennai", "Oct 17, 2026 · IITM Research Park", "https://devfest.gdgchennai.in"],
  ["Hyderabad", "Oct 12, 2025 · Novotel Convention Centre", "https://gdg.community.dev/events/details/google-gdg-hyderabad-presents-devfest-2025/"],
  ["New Delhi", "Oct 12, 2025", "https://gdg.community.dev/events/details/google-gdg-new-delhi-presents-devfest-new-delhi-2025"],
  ["Ranchi", "Oct 11, 2025 · BIT Mesra", "https://gdg.community.dev/events/details/google-gdg-ranchi-presents-devfest-2025-1"],
  ["Guwahati", "Nov 22–23, 2025 · Gauhati University", "https://gdg.community.dev/events/details/google-gdg-guwahati-presents-calling-all-tech-enthusiasts-devfest-2025-is-coming-to-guwahati/"],
  ["Pune", "Nov 30, 2025 · JW Marriott", "https://gdg.community.dev/events/details/google-gdg-pune-presents-devfest-pune-2025/"],
  ["Indore", "Dec 20, 2025 · Indore Marriott", "https://gdg.community.dev/events/details/google-gdg-on-campus-ujjain-engineering-college-ujjain-india-presents-devfest-indore-2025/"],
  ["Kolkata", "Dec 21, 2025 · Vedic Village", "https://gdg.community.dev/events/details/google-gdg-kolkata-presents-devfest-kolkata-2025/"],
  ["Jaipur", "Dec 27, 2025", "https://gdg.community.dev/events/details/google-gdg-on-campus-the-lnm-institute-of-information-technology-jaipur-india-presents-devfest-jaipur-2025/"],
];
const TONES = ["blue", "red", "yellow", "green"];
const cityList = document.getElementById("city-list");
CITIES.forEach(([city, info, url], i) => {
  const li = el("li");
  const tone = TONES[i % 4];
  li.innerHTML = `<a href="${url}" target="_blank" rel="noopener" style="--c-bg:var(--${tone}-c);--c-on:var(--on-${tone}-c)"><b>${esc(city)}</b><span>${esc(info)}</span></a>`;
  cityList.appendChild(li);
});

// Status card and editions come from the live chapter feed.
(async () => {
  const { events } = await FEED.events();
  const devfests = events.filter((e) => e.cat === "DevFest" && !/core committee/i.test(e.title));
  const card = document.getElementById("df-card");
  if (card) FEED.renderCard(card, devfests, { quietTitle: "The next DevFest Vizag isn't announced yet", quietText: "Dates and tickets are posted on the GDG Vizag chapter page first." });
  const list = document.getElementById("edition-list");
  if (!list) return;
  list.innerHTML = "";
  const TONES = ["green", "yellow", "red", "blue"];
  devfests.forEach((e, i) => {
    const t = TONES[i % 4];
    const a = el("a", "ed");
    a.href = e.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.setProperty("--c-bg", `var(--${t}-c)`);
    a.style.setProperty("--c-on", `var(--on-${t}-c)`);
    const st = FEED.status(e);
    a.innerHTML = `<span class="y">${e.year}</span><div><h3>${esc(e.title)}</h3><p>${esc([st === "upcoming" ? "Upcoming" : st === "live" ? "Live now" : "", FEED.dateLabel(e), e.venue].filter(Boolean).join(", "))}</p></div><span class="go">Event page</span>`;
    list.append(a);
  });
  if (!devfests.length) list.innerHTML = '<p class="note">No DevFest events found in the feed.</p>';
})();
