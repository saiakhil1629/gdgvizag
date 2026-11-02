// Admin dashboard: registrations grouped by team, with a review checklist per person.
(() => {
  const host = document.getElementById("adm");
  if (!host) return;
  const s = (v) => esc(String(v == null ? "" : v));
  const isUrl = (u) => /^https?:\/\//i.test(u || "");
  const link = (u) => (isUrl(u) ? `<a href="${s(u)}" target="_blank" rel="noopener noreferrer">Open</a>` : "");
  const notice = (html, kind = "warn") => { host.innerHTML = `<p class="auth-msg is-${kind}">${html}</p>`; };
  const MIN = 1;
  // One entry per event. Each has its own teams, registrations and reviews in the database (matched on "event").
  const EVENTS = {
    p2p: { name: "Prompt to Product", sub: "A 5-Day AI &amp; Developer Experience &middot; Ratan Tata Innovation Hub, Visakhapatnam", badge: "Completed", warn: false },
    l2g: { name: "Local2Global Hack : GDGVIZAG", sub: "5&ndash;6 November 2026 &middot; Gayatri Vidya Parishad College of Engineering, Visakhapatnam", badge: "Upcoming", warn: true },
  };
  let cur = "p2p"; // the event whose dashboard is open
  const demoLine = (t) => (isUrl(t.demo_url) ? `<p><b>Demo:</b> <a href="${s(t.demo_url)}" target="_blank" rel="noopener noreferrer">${s(t.demo_url)}</a></p>` : "");
  let me, data = { teams: [], members: [], profiles: [], evals: [] };

  async function boot() {
    if (!sb) return notice("Sign in isn't connected yet.");
    const { data: ses } = await sb.auth.getSession();
    if (!ses.session) return notice('Please <a href="login.html?next=admin.html">log in</a> with an admin account.');
    me = ses.session.user;
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error) return notice(s(/function|schema cache/i.test(error.message) ? "Setup isn't finished. Run supabase/schema.sql in Supabase." : error.message), "error");
    if (ok !== true) return notice(`${s(me.email)} is not an admin account.`);
    await home();
  }

  // Landing view: one card per event. Each opens that event's dashboard.
  async function home() {
    host.innerHTML = '<p class="hk-note">Loading...</p>';
    const [r, t] = await Promise.all([sb.from("registrations").select("event"), sb.from("teams").select("event, submitted_at")]);
    const bad = [r, t].find((x) => x.error);
    if (bad) return notice(s(/function|schema cache|does not exist/i.test(bad.error.message) ? "Setup isn't finished. Run supabase/schema.sql in Supabase." : bad.error.message), "error");
    host.innerHTML = `<div class="adm-events">${Object.entries(EVENTS).map(([key, e]) => {
      const reg = r.data.filter((x) => x.event === key).length;
      const teams = t.data.filter((x) => x.event === key);
      return `<article class="adm-event">
        <span class="hk-tag${e.warn ? " warn" : ""}">${e.badge}</span>
        <h3>${e.name}</h3>
        <p class="sub">${e.sub}</p>
        <p class="adm-event-stats"><b>${reg}</b> registered &middot; <b>${teams.length}</b> teams &middot; <b>${teams.filter((x) => x.submitted_at).length}</b> projects submitted</p>
        <button class="btn btn-sm" data-ev="${key}" type="button">Open dashboard</button>
      </article>`;
    }).join("")}</div>`;
    host.querySelectorAll("button[data-ev]").forEach((b) => b.addEventListener("click", () => { cur = b.dataset.ev; refresh(); }));
  }

  async function refresh() {
    host.innerHTML = '<p class="hk-note">Loading...</p>';
    if (await load()) draw();
  }

  async function load() {
    const [t, m, r, p, e] = await Promise.all([
      sb.from("teams").select("*").eq("event", cur).order("created_at"),
      sb.from("team_members").select("user_id, team_id, joined_at").eq("event", cur).order("joined_at"),
      sb.from("registrations").select("user_id").eq("event", cur),
      sb.from("profiles").select("*").order("created_at"),
      sb.from("evaluations").select("*").eq("event", cur),
    ]);
    const bad = [t, m, r, p, e].find((x) => x.error);
    if (bad) { notice(s(bad.error.message), "error"); return false; }
    const registered = new Set(r.data.map((x) => x.user_id));
    data = { teams: t.data, members: m.data, profiles: p.data.filter((x) => registered.has(x.user_id)), evals: e.data };
    return true;
  }

  const index = () => {
    const prof = new Map(data.profiles.map((x) => [x.user_id, x]));
    const ev = new Map(data.evals.map((x) => [x.user_id, x]));
    const inTeam = new Map(data.members.map((x) => [x.user_id, x.team_id]));
    const groups = data.teams.map((t) => ({
      team: t,
      people: data.members.filter((x) => x.team_id === t.id).map((x) => prof.get(x.user_id)).filter(Boolean)
        .sort((x, y) => (y.user_id === t.lead_id) - (x.user_id === t.lead_id)), // lead first, then members in join order
    }));
    const solo = data.profiles.filter((x) => !inTeam.has(x.user_id));
    return { groups, solo, ev };
  };

  const stars = (n) => (n == null ? "-" : `<span class="adm-stars" title="${n} of 5">${"&#9733;".repeat(n)}<span>${"&#9733;".repeat(5 - n)}</span></span> <small>${n}/5</small>`);
  const person = (p, lead, ev) => {
    const e = ev.get(p.user_id) || {};
    const rate = (k, label) => `<div class="adm-rate" data-k="${k}" role="radiogroup" aria-label="${label}"><span class="adm-rl">${label}</span><span class="adm-rs">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${k}-${s(p.user_id)}" value="${n}" ${e[k] === n ? "checked" : ""}><span aria-hidden="true">&#9733;</span><i class="sr">${n} ${n === 1 ? "star" : "stars"}</i></label>`).join("")}<button type="button" class="adm-clear" aria-label="Clear ${label}">Clear</button></span></div>`;
    const volunteer = `<label class="adm-chk"><input type="checkbox" data-k="volunteer_interest" ${e.volunteer_interest ? "checked" : ""}><span>GDG volunteering interest</span></label>`;
    return `<tr data-uid="${s(p.user_id)}"${lead ? ' class="adm-lead"' : ""}>
      <td><b>${s(p.name)}</b>${lead ? ' <span class="hk-tag">Lead</span>' : ""}<small>${s(p.college)}</small></td>
      <td data-label="Contact"><a href="mailto:${s(p.email)}">${s(p.email)}</a><small>${s(p.phone)}</small></td>
      <td class="adm-links" data-label="Links and level">${[["GitHub", p.github_url], ["LinkedIn", p.linkedin_url], ["Best project", p.best_project_url]].filter(([, u]) => isUrl(u)).map(([n, u]) => `<a href="${s(u)}" target="_blank" rel="noopener noreferrer">${n}</a>`).join("")}<span>${stars(p.coding_level)}</span><span class="adm-startup ${p.wants_startup === true ? "yes" : ""}">Startup: ${p.wants_startup === true ? "Yes" : p.wants_startup === false ? "No" : "-"}</span></td>
      <td class="adm-eval" data-label="Review">${rate("idea_rating", "Idea")}${rate("presentation_rating", "Presentation skills")}${volunteer}</td>
      <td data-label="Notes"><input class="adm-notes" type="text" maxlength="2000" placeholder="Notes" value="${s(e.notes)}" aria-label="Notes for ${s(p.name)}"><span class="adm-saved" aria-live="polite"></span></td>
    </tr>`;
  };
  const table = (rows) => `<div class="adm-scroll"><table class="adm-table"><thead><tr><th>Person</th><th>Contact</th><th>Links and level</th><th>Review</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  // Top 10 teams: average idea stars of the team's reviewed members, then presentation stars, then most reviewers.
  function topTeams() {
    const { groups, ev } = index();
    const avg = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
    return groups.map(({ team, people }) => {
      const ideas = people.map((p) => (ev.get(p.user_id) || {}).idea_rating).filter((n) => n > 0);
      const pres = people.map((p) => (ev.get(p.user_id) || {}).presentation_rating).filter((n) => n > 0);
      return { team, people, ideaAvg: avg(ideas), presAvg: avg(pres), raters: ideas.length };
    }).filter((x) => x.raters)
      .sort((a, b) => b.ideaAvg - a.ideaAvg || b.presAvg - a.presAvg || b.raters - a.raters || String(a.team.name).localeCompare(String(b.team.name)))
      .slice(0, 10);
  }
  function topHtml() {
    const top = topTeams();
    const star = (n) => `<span class="adm-stars" title="${n.toFixed(1)} of 5">${"&#9733;".repeat(Math.round(n))}<span>${"&#9733;".repeat(5 - Math.round(n))}</span></span> <small>${n.toFixed(1)}</small>`;
    if (!top.length) return '<p class="hk-note">Rate a few ideas below and the best teams will appear here.</p>';
    return `<ol class="adm-top">${top.map((x, i) => {
      const t = x.team, lead = x.people.find((p) => p.user_id === t.lead_id);
      return `<li><span class="adm-rank">${i + 1}</span><div class="adm-top-body"><h4>${s(t.name)} <small>Code ${s(t.code)}</small></h4>
        <p>${star(x.ideaAvg)} <small>idea, from ${x.raters} review${x.raters === 1 ? "" : "s"}</small>${x.presAvg ? ` &middot; ${star(x.presAvg)} <small>presentation</small>` : ""}</p>
        ${t.submitted_at ? `<p><b>Idea:</b> ${s(t.idea)}</p>${isUrl(t.project_url) ? `<p><a href="${s(t.project_url)}" target="_blank" rel="noopener noreferrer">${s(t.project_url)}</a></p>` : ""}${demoLine(t)}` : "<p><i>No project submitted yet.</i></p>"}
        <small>${x.people.length} member${x.people.length === 1 ? "" : "s"}${lead ? `, lead ${s(lead.name)}` : ""}</small></div></li>`;
    }).join("")}</ol>`;
  }

  function draw() {
    const { groups, solo, ev } = index();
    const q = (document.getElementById("adm-q")?.value || "").trim().toLowerCase();
    const match = (p, t) => !q || [p.name, p.college, p.email, p.phone, t && t.name, t && t.code].some((v) => String(v || "").toLowerCase().includes(q));
    const cards = groups.map(({ team: t, people }) => {
      const shown = people.filter((p) => match(p, t));
      if (!shown.length) return "";
      const full = people.length >= MIN;
      return `<article class="adm-team">
        <header><div><h3>${s(t.name)}</h3><small>Code ${s(t.code)}</small></div>
          <span class="hk-tag ${full ? "" : "warn"}">${people.length} member${people.length === 1 ? "" : "s"}${full ? "" : ``}</span></header>
        <div class="adm-proj">${t.submitted_at
          ? `<p><b>Problem:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p><p><b>Project:</b> ${isUrl(t.project_url) ? `<a href="${s(t.project_url)}" target="_blank" rel="noopener noreferrer">${s(t.project_url)}</a>` : "-"}</p>${demoLine(t)}`
          : "<p><i>No project submitted yet.</i></p>"}</div>
        ${table(shown.map((p) => person(p, p.user_id === t.lead_id, ev)).join(""))}</article>`;
    }).join("");
    const soloShown = solo.filter((p) => match(p, null));
    const soloCard = soloShown.length ? `<article class="adm-team"><header><div><h3>Not in a team</h3><small>Registered, no team yet</small></div><span class="hk-tag warn">${solo.length}</span></header>${table(soloShown.map((p) => person(p, false, ev)).join(""))}</article>` : "";
    const done = data.evals.filter((x) => x.volunteer_interest).length;
    host.innerHTML = `<div class="adm-eventbar"><button class="btn btn-sm btn-tonal" id="adm-back" type="button">&larr; All events</button><h3>${EVENTS[cur].name} <span class="hk-tag${EVENTS[cur].warn ? " warn" : ""}">${EVENTS[cur].badge}</span></h3></div>
      <div class="adm-stats">
        <div><strong>${data.profiles.length}</strong><span>Registered</span></div>
        <div><strong>${data.teams.length}</strong><span>Teams</span></div>
        <div><strong>${data.teams.filter((t) => t.submitted_at).length}</strong><span>Projects submitted</span></div>
        <div><strong>${done}</strong><span>Want to volunteer</span></div>
        <div><strong>${data.profiles.filter((x) => x.wants_startup === true).length}</strong><span>Want a startup</span></div></div>
      <section class="adm-topbox" aria-labelledby="adm-top-h"><h3 id="adm-top-h">Top 10 teams</h3><p class="hk-note">Ranked by the average idea stars you give each team's members.</p><div id="adm-top">${topHtml()}</div></section>
      <div class="adm-tools"><label class="field adm-search">Search<input id="adm-q" type="search" placeholder="Name, college, team, email" value="${s(q)}"></label>
        <button class="btn btn-sm btn-tonal" id="adm-refresh" type="button">Refresh</button><button class="btn btn-sm btn-tonal" id="adm-csv" type="button">Export people CSV</button><button class="btn btn-sm btn-tonal" id="adm-teams-csv" type="button">Download teams CSV</button></div>
      ${cards + soloCard || '<p class="hk-note">Nothing to show yet.</p>'}`;
    const qi = document.getElementById("adm-q");
    qi.addEventListener("input", () => { const pos = qi.selectionStart; draw(); const n = document.getElementById("adm-q"); n.focus(); n.setSelectionRange(pos, pos); });
    document.getElementById("adm-back").addEventListener("click", home);
    document.getElementById("adm-refresh").addEventListener("click", refresh);
    document.getElementById("adm-csv").addEventListener("click", exportCsv);
    document.getElementById("adm-teams-csv").addEventListener("click", exportTeamsCsv);
    host.querySelectorAll("tr[data-uid]").forEach(paint);
  }

  // Light up the stars up to the chosen one, and show Clear only when something is chosen.
  function paint(tr) {
    tr.querySelectorAll(".adm-rate").forEach((g) => {
      const c = g.querySelector("input:checked");
      const v = c ? +c.value : 0;
      g.querySelectorAll("label").forEach((l) => l.classList.toggle("on", +l.querySelector("input").value <= v));
      g.querySelector(".adm-clear").hidden = !v;
    });
  }

  async function save(tr) {
    const out = tr.querySelector(".adm-saved");
    const row = { user_id: tr.dataset.uid, event: cur, notes: tr.querySelector(".adm-notes").value.trim() || null, updated_by: me.id, updated_at: new Date().toISOString() };
    tr.querySelectorAll(".adm-rate").forEach((g) => { const c = g.querySelector("input:checked"); row[g.dataset.k] = c ? +c.value : null; });
    row.volunteer_interest = tr.querySelector('input[data-k="volunteer_interest"]').checked;
    out.textContent = "Saving...";
    const { error } = await sb.from("evaluations").upsert(row, { onConflict: "user_id,event" });
    out.textContent = error ? "Not saved" : "Saved";
    if (error) return;
    const i = data.evals.findIndex((x) => x.user_id === row.user_id);
    if (i >= 0) data.evals[i] = { ...data.evals[i], ...row }; else data.evals.push(row);
    const tb = document.getElementById("adm-top");
    if (tb) tb.innerHTML = topHtml();
    setTimeout(() => { if (out.textContent === "Saved") out.textContent = ""; }, 1500);
  }
  host.addEventListener("change", (e) => { const tr = e.target.closest("tr[data-uid]"); if (tr && e.target.closest(".adm-eval, .adm-notes")) { paint(tr); save(tr); } });
  host.addEventListener("click", (e) => {
    const b = e.target.closest(".adm-clear");
    if (!b) return;
    const tr = b.closest("tr[data-uid]");
    b.closest(".adm-rate").querySelectorAll("input").forEach((i) => { i.checked = false; });
    paint(tr);
    save(tr);
  });

  const download = (rows, name) => {
    const cell = (v) => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // One row per team: team details, members, and the submitted problem statement, idea and project URL.
  function exportTeamsCsv() {
    const { groups, ev } = index();
    const avg = (xs) => (xs.length ? (xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(1) : "");
    const head = ["Team", "Team code", "Lead name", "Lead email", "Lead phone", "Members", "Member names", "Member emails", "Colleges", "Problem statement", "Idea", "Project URL", "Demo URL", "Submitted at", "Average idea rating (1-5)", "Average presentation (1-5)"];
    const rows = groups.map(({ team: t, people }) => {
      const lead = people.find((p) => p.user_id === t.lead_id) || {};
      const rated = (k) => people.map((p) => (ev.get(p.user_id) || {})[k]).filter((n) => n > 0);
      return [t.name, t.code, lead.name, lead.email, lead.phone, people.length, people.map((p) => p.name).join("; "), people.map((p) => p.email).join("; "), [...new Set(people.map((p) => p.college))].join("; "), t.problem_statement, t.idea, t.project_url, t.demo_url, t.submitted_at ? new Date(t.submitted_at).toLocaleString() : "Not submitted", avg(rated("idea_rating")), avg(rated("presentation_rating"))];
    });
    download([head, ...rows], `gdg-vizag-${cur}-teams.csv`);
  }

  function exportCsv() {
    const { groups, solo, ev } = index();
    const cell = (v) => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const head = ["Team", "Team code", "Role", "Name", "College", "Phone", "Email", "GitHub", "LinkedIn", "Coding level (0-5)", "Wants to build a startup", "Best project", "Team problem", "Team idea", "Team project URL", "Team demo URL", "Idea rating (1-5)", "Presentation skills (1-5)", "Volunteering interest", "Notes"];
    const rows = [];
    const add = (t, p, lead) => { const e = ev.get(p.user_id) || {}; rows.push([t ? t.name : "(no team)", t ? t.code : "", t ? (lead ? "Lead" : "Member") : "", p.name, p.college, p.phone, p.email, p.github_url, p.linkedin_url, p.coding_level, p.wants_startup === true ? "Yes" : p.wants_startup === false ? "No" : "", p.best_project_url, t ? t.problem_statement : "", t ? t.idea : "", t ? t.project_url : "", t ? t.demo_url : "", e.idea_rating || "", e.presentation_rating || "", e.volunteer_interest ? "Yes" : "", e.notes || ""]); };
    groups.forEach(({ team: t, people }) => people.forEach((p) => add(t, p, p.user_id === t.lead_id)));
    solo.forEach((p) => add(null, p, false));
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `gdg-vizag-${cur}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  boot();
})();
