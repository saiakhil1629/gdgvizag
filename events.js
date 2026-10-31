// Events page: everything from the chapter feed, with filters. DevFest is one of the categories.
(async () => {
  const grid = document.getElementById("ev-grid");
  const count = document.getElementById("ev-count");
  const more = document.getElementById("ev-more");
  if (!grid) return;
  const { events, source } = await FEED.events();
  if (!events.length) { count.textContent = "The events feed could not be reached. Try again in a moment."; return; }

  const params = new URLSearchParams(location.search);
  const state = { status: params.get("status") || "All", cat: params.get("cat") || "All", year: params.get("year") || "All", q: "" };
  const PAGE = 12;
  let shown = PAGE;
  const TONES = ["blue", "red", "yellow", "green"];
  const statusOf = (e) => FEED.status(e);
  const label = { live: "Live now", upcoming: "Upcoming", past: "Past" };

  // Featured: the live or next DevFest, otherwise the latest one.
  (() => {
    const host = document.getElementById("ev-featured");
    const dev = events.filter((e) => e.cat === "DevFest" && !/core committee/i.test(e.title));
    const f = FEED.focus(dev);
    const e = f.e || dev[0];
    if (!host || !e) return;
    const st = statusOf(e);
    const pic = e.banner || e.img;
    host.className = "feat";
    host.innerHTML = `${pic ? `<img src="${esc(pic)}" alt="" loading="eager">` : ""}
      <div class="feat-body"><span class="lc-pill">${st === "live" ? '<i class="dot"></i>' : ""}${st === "past" ? "Latest DevFest" : label[st]}</span>
      <h2>${esc(e.title)}</h2><p>${esc([FEED.dateLabel(e), e.venue].filter(Boolean).join(", "))}</p>
      <div class="cta"><a class="btn" href="devfest/index.html">Open the DevFest page</a><a class="btn btn-tonal" href="${esc(e.url)}" target="_blank" rel="noopener">View on GDG</a></div></div>`;
  })();

  const chip = (host, items, key) => {
    host.innerHTML = "";
    items.forEach((v) => {
      const b = el("button", "", esc(v));
      b.type = "button";
      b.dataset.v = v;
      b.addEventListener("click", () => { state[key] = v; shown = PAGE; sync(); draw(); });
      host.append(b);
    });
  };
  const years = [...new Set(events.map((e) => e.year))].sort((a, b) => b - a).map(String);
  chip(document.getElementById("ev-status"), ["All", "Live now", "Upcoming", "Past"], "status");
  chip(document.getElementById("ev-cats"), ["All", ...FEED.CATS.map((c) => c[0]), "Meetups"], "cat");
  chip(document.getElementById("ev-years"), ["All", ...years], "year");
  const statusKey = { "Live now": "live", Upcoming: "upcoming", Past: "past" };
  const sync = () => {
    ["ev-status:status", "ev-cats:cat", "ev-years:year"].forEach((p) => {
      const [id, key] = p.split(":");
      document.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state[key])));
    });
    const u = new URLSearchParams();
    ["status", "cat", "year"].forEach((k) => { if (state[k] !== "All") u.set(k, state[k]); });
    history.replaceState(null, "", u.toString() ? `?${u}` : location.pathname);
  };

  const draw = () => {
    const q = state.q.trim().toLowerCase();
    const list = events.filter((e) => {
      const st = statusOf(e);
      return (state.status === "All" || statusKey[state.status] === st)
        && (state.cat === "All" || e.cat === state.cat)
        && (state.year === "All" || String(e.year) === state.year)
        && (!q || e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q));
    });
    // live first, then upcoming (soonest first), then past (newest first)
    const rank = { live: 0, upcoming: 1, past: 2 };
    list.sort((a, b) => rank[statusOf(a)] - rank[statusOf(b)] || (statusOf(a) === "upcoming" ? a.start - b.start : b.start - a.start));
    count.textContent = `${list.length} ${list.length === 1 ? "event" : "events"}${source !== "live" ? " (saved copy, the live feed is unreachable)" : ""}`;
    grid.innerHTML = "";
    list.slice(0, shown).forEach((e, i) => {
      const st = statusOf(e);
      const t = TONES[(e.id || i) % 4];
      const a = el("a", `evc tone-${t} is-${st}`);
      a.href = e.url;
      a.target = "_blank";
      a.rel = "noopener";
      const pic = e.img || e.banner;
      a.innerHTML = `<div class="evc-pic">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy">` : `<svg viewBox="-100 -100 200 200" aria-hidden="true"><path d="${shapePath(5 + (i % 5), 0.12)}"/></svg>`}<span class="lc-pill">${st === "live" ? '<i class="dot"></i>' : ""}${label[st]}</span></div>
        <div class="evc-body"><h3>${esc(e.title)}</h3><p>${esc(FEED.dateLabel(e))}</p><p class="evc-meta">${esc([e.cat, e.venue].filter(Boolean).join(", "))}</p></div>`;
      grid.append(a);
    });
    if (!list.length) grid.innerHTML = '<p class="note">No events match. Try a different filter.</p>';
    more.hidden = list.length <= shown;
  };
  more.addEventListener("click", () => { shown += PAGE; draw(); });
  document.getElementById("ev-q").addEventListener("input", (e) => { state.q = e.target.value; shown = PAGE; draw(); });
  sync();
  draw();
})();
