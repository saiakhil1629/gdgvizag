// Live events from gdg.community.dev (the feed the chapter page itself uses).
// If the feed is unreachable we fall back to the last cached copy, then to feed-snapshot.js.
const FEED = (() => {
  const SELF_SRC = (document.currentScript && document.currentScript.src) || "";
  const API = "https://gdg.community.dev/api";
  const CHAPTER_ID = 318;
  const SLUG = "gdg-vizag";
  const CHAPTER_URL = "https://gdg.community.dev/gdg-vizag/";
  const FIELDS = "id,title,start_date,end_date,venue_name,event_type_title,cropped_picture_url,cropped_banner_url,url,cohost_registration_url,description_short,tags";
  const TZ = "Asia/Kolkata";
  const CACHE_KEY = "gdgv-feed-v1";
  const TEAM_ORDER = ["Usha Ramani Vemuru", "Satish K", "Sampath Balivada"]; // shown first, in this order
  const TEAM_FALLBACK = [{ name: "Usha Ramani Vemuru", title: "Co-Founder" }, { name: "Satish K", title: "Managing Director" }, { name: "Sampath Balivada", title: "Software Engineer" }];
  // Organizers who are not on the chapter page yet: { name: "Full Name", title: "Role", avatar: "photos/name.jpg" }
  const EXTRA_TEAM = [];

  const query = (status, order) => `${API}/event_slim/for_chapter/${CHAPTER_ID}/?page_size=500&status=${status}&include_cohosted_events=true&visible_on_parent_chapter_only=true&order=${order}&fields=${FIELDS}`;
  const getJson = async (url, ms = 8000) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  };
  const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; } };
  const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
  const loadSnapshot = () => new Promise((resolve) => {
    if (window.FEED_SNAPSHOT) return resolve(window.FEED_SNAPSHOT);
    const s = document.createElement("script");
    s.src = SELF_SRC ? SELF_SRC.replace(/feed\.js.*$/, "feed-snapshot.js") : "feed-snapshot.js";
    s.onload = () => resolve(window.FEED_SNAPSHOT || null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });

  const CATS = [
    ["DevFest", /dev ?fest|developers fest/i],
    ["Women Techmakers", /women|wtm|iwd/i],
    ["I/O Extended", /i\/?o extended|google i\/o/i],
    ["Study Jams", /study jam|compose camp|flutter forward|flutter interact|android study|cloud study|onboard|summit/i],
    ["Build with AI", /build ?with ?ai|buildathon|prompt to product|agentic|google cloud ai|ready, set, ml|\bai\b/i],
    ["Workshops and talks", /workshop|hands-on|session|talk|open.?source|jax|zero to hero|lab|wonder of wonders|startup|silicon/i],
  ];
  const category = (title) => { for (const [name, re] of CATS) if (re.test(title)) return name; return "Meetups"; };

  const norm = (r) => {
    const start = new Date(r.start_date);
    const end = r.end_date ? new Date(r.end_date) : new Date(start.getTime() + 3 * 36e5);
    return {
      id: r.id, title: (r.title || "").replace(/\s+/g, " ").trim(), start, end,
      venue: r.venue_name && r.venue_name !== "." ? r.venue_name.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim() : "",
      type: r.event_type_title || "", img: r.cropped_picture_url || "", banner: r.cropped_banner_url || "",
      url: r.cohost_registration_url || r.url, page: r.url, desc: (r.description_short || "").trim(),
      cat: category(r.title || ""), year: +new Date(start).toLocaleString("en-CA", { timeZone: TZ, year: "numeric" }),
    };
  };

  let eventsPromise = null;
  const events = () => eventsPromise || (eventsPromise = (async () => {
    let source = "live", live, done;
    try {
      [live, done] = (await Promise.all([getJson(query("Live", "start_date")), getJson(query("Completed", "-start_date"))])).map((d) => d.results);
      writeCache({ live, done, at: Date.now() });
    } catch {
      const c = readCache();
      if (c) { live = c.live; done = c.done; source = "cache"; }
      else {
        const snap = await loadSnapshot();
        if (!snap) return { events: [], source: "none" };
        live = snap.live; done = snap.done; source = "snapshot";
      }
    }
    const seen = new Set();
    const all = [...live, ...done].map(norm).filter((e) => !isNaN(e.start) && !seen.has(e.id) && seen.add(e.id));
    // Events without their own poster share a default picture (an image used by 2+ events); treat those as having none.
    const freq = {};
    all.forEach((e) => [e.img, e.banner].forEach((u) => { if (u) freq[u] = (freq[u] || 0) + 1; }));
    all.forEach((e) => { if (freq[e.img] >= 2) e.img = ""; if (freq[e.banner] >= 2) e.banner = ""; });
    all.sort((a, b) => b.start - a.start);
    return { events: all, source };
  })());

  const status = (e, now = new Date()) => (now < e.start ? "upcoming" : now <= e.end ? "live" : "past");
  const fmt = (d, o) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, ...o }).format(d);
  const dayKey = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayNum = (key) => Date.parse(key + "T00:00:00Z") / 864e5;
  const spanDays = (e) => dayNum(dayKey(e.end)) - dayNum(dayKey(e.start)) + 1;
  const dateLabel = (e) => {
    const part = (d, o) => fmt(d, o);
    const same = dayKey(e.start) === dayKey(e.end);
    const y = part(e.end, { year: "numeric" });
    if (same) return `${part(e.start, { weekday: "short" })}, ${part(e.start, { day: "numeric" })} ${part(e.start, { month: "short" })} ${y}`;
    const sm = part(e.start, { month: "short" }), em = part(e.end, { month: "short" });
    return sm === em ? `${part(e.start, { day: "numeric" })}\u2013${part(e.end, { day: "numeric" })} ${em} ${y}` : `${part(e.start, { day: "numeric" })} ${sm} \u2013 ${part(e.end, { day: "numeric" })} ${em} ${y}`;
  };
  const timeLabel = (d) => `${fmt(d, { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()} IST`;
  const dayOf = (e, now = new Date()) => Math.min(spanDays(e), Math.max(1, dayNum(dayKey(now)) - dayNum(dayKey(e.start)) + 1));
  const countdown = (ms) => {
    const m = Math.max(0, Math.floor(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    if (d >= 1) return `${d} ${d === 1 ? "day" : "days"}${h ? ` ${h} hr` : ""}`;
    if (h >= 1) return `${h} hr ${mi} min`;
    return `${Math.max(1, mi)} min`;
  };
  const focus = (list, now = new Date()) => {
    const live = list.filter((e) => status(e, now) === "live").sort((a, b) => a.start - b.start)[0];
    if (live) return { state: "live", e: live };
    const next = list.filter((e) => status(e, now) === "upcoming").sort((a, b) => a.start - b.start)[0];
    return next ? { state: "upcoming", e: next } : { state: "none", e: null };
  };


  // The "Live now / Up next" card. Re-checks every 30 seconds so it flips by itself.
  const renderCard = (host, list, opt = {}) => {
    const draw = () => {
      const now = new Date();
      const { state, e } = focus(list, now);
      host.className = `live-card is-${state}`;
      if (state === "none") {
        host.innerHTML = `<span class="lc-pill">Nothing scheduled</span><div class="lc-body"><b>${esc(opt.quietTitle || "No upcoming events right now")}</b><span>${esc(opt.quietText || "New events are announced on the chapter page first.")}</span></div><div class="lc-actions"><a class="btn btn-sm" href="${CHAPTER_URL}" target="_blank" rel="noopener">Join to get notified</a></div>`;
        return;
      }
      const multi = spanDays(e) > 1;
      const pill = state === "live"
        ? `<span class="lc-pill"><i class="dot"></i>Live now${multi ? `, day ${dayOf(e, now)} of ${spanDays(e)}` : ""}</span>`
        : `<span class="lc-pill">Up next, in ${countdown(e.start - now)}</span>`;
      const when = state === "live" ? `Until ${fmt(e.end, { weekday: "short", day: "numeric", month: "short" })}, ${timeLabel(e.end)}` : `${dateLabel(e)}, ${timeLabel(e.start)}`;
      host.innerHTML = `${pill}<div class="lc-body"><b>${esc(e.title)}</b><span>${esc([when, e.venue, e.type].filter(Boolean).join(", "))}</span></div><div class="lc-actions"><a class="btn btn-sm" href="${esc(e.url)}" target="_blank" rel="noopener">${state === "live" ? "Join now" : "Register"}</a>${opt.moreHref ? `<a class="btn btn-sm btn-tonal" href="${opt.moreHref}">${esc(opt.moreLabel || "Details")}</a>` : ""}</div>`;
    };
    draw();
    return setInterval(draw, 30000);
  };

  let teamPromise = null;
  const team = () => teamPromise || (teamPromise = (async () => {
    let rows = null;
    try {
      rows = (await getJson(`${API}/chapter_slim/${SLUG}/team/`)).map((m) => ({ name: `${m.user.first_name} ${m.user.last_name}`.trim(), title: m.title || "", avatar: (m.user.avatar || {}).url || "" }));
    } catch {
      const snap = window.FEED_SNAPSHOT || await loadSnapshot();
      if (snap && snap.team) rows = snap.team.map((m) => ({ name: `${m.first_name} ${m.last_name}`.trim(), title: m.title || "", avatar: m.avatar || "" }));
    }
    const listed = TEAM_ORDER.map((n) => (rows || []).find((m) => m.name === n) || TEAM_FALLBACK.find((m) => m.name === n));
    const others = (rows || []).filter((m) => !TEAM_ORDER.includes(m.name)); // any other organizer on the chapter page
    return [...listed, ...others, ...EXTRA_TEAM].filter(Boolean);
  })());

  let chapterPromise = null;
  const chapter = () => chapterPromise || (chapterPromise = (async () => {
    try { const c = await getJson(`${API}/chapter_slim/${SLUG}/`); return { members: c.members_count, logo: c.cropped_logo_url }; }
    catch { const s = window.FEED_SNAPSHOT || await loadSnapshot(); return { members: s && s.chapter ? s.chapter.members_count : 3270, logo: s && s.chapter ? s.chapter.logo : "" }; }
  })());

  const renderTeam = async (host) => {
    const people = await team();
    host.innerHTML = "";
    people.forEach((p, i) => {
      const [n, amp] = [[8, 0.07], [5, 0.15], [6, 0.12]][i % 3];
      const d = shapePath(n, amp);
      const card = el("article", `person tone-${["blue", "green", "yellow"][i % 3]}`);
      const art = p.avatar
        ? `<svg class="person-art" viewBox="-110 -110 220 220" role="img" aria-label="${esc(p.name)}"><clipPath id="pc${i}"><path d="${d}"/></clipPath><path d="${d}" transform="scale(1.07)" fill="var(--c-shape)"/><image href="${esc(p.avatar)}" x="-100" y="-100" width="200" height="200" preserveAspectRatio="xMidYMid slice" clip-path="url(#pc${i})"/></svg>`
        : `<svg class="person-art" viewBox="-110 -110 220 220" role="img" aria-label="${esc(p.name)}"><path d="${d}" fill="var(--c-shape)"/><text y="22" text-anchor="middle" font-size="64" font-weight="800" fill="#fff">${esc(initials(p.name))}</text></svg>`;
      card.innerHTML = `${art}<div><h3>${esc(p.name)}</h3><p>${esc(p.title)}</p><span class="role">Organizer, GDG Vizag</span></div>`;
      host.append(card);
    });
  };

  const live = async () => {
    const { events: all } = await events();
    return focus(all);
  };
  // Mark the Events nav link while something is live.
  events().then(({ events: all }) => {
    if (all.some((e) => status(e) === "live")) document.querySelectorAll('.menu a[href$="events.html"]').forEach((a) => a.classList.add("is-live"));
  });

  return { events, status, focus, live, team, chapter, renderTeam, renderCard, dayKey, fmt, dateLabel, timeLabel, countdown, dayOf, spanDays, category, CATS, CHAPTER_URL, TZ };
})();
