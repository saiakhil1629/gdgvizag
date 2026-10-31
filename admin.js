// Admin dashboard: registrations grouped by team, with a review checklist per person.
(() => {
  const host = document.getElementById("adm");
  if (!host) return;
  const s = (v) => esc(String(v == null ? "" : v));
  const isUrl = (u) => /^https?:\/\//i.test(u || "");
  const link = (u) => (isUrl(u) ? `<a href="${s(u)}" target="_blank" rel="noopener noreferrer">Open</a>` : "");
  const notice = (html, kind = "warn") => { host.innerHTML = `<p class="auth-msg is-${kind}">${html}</p>`; };
  const MIN = 3;
  let me, data = { teams: [], members: [], profiles: [], evals: [] };

  async function boot() {
    if (!sb) return notice("Sign in isn't connected yet.");
    const { data: ses } = await sb.auth.getSession();
    if (!ses.session) return notice('Please <a href="login.html?next=admin.html">log in</a> with an admin account.');
    me = ses.session.user;
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error) return notice(s(/function|schema cache/i.test(error.message) ? "Setup isn't finished. Run supabase/schema.sql in Supabase." : error.message), "error");
    if (ok !== true) return notice(`${s(me.email)} is not an admin account.`);
    await refresh();
  }

  async function refresh() {
    host.innerHTML = '<p class="hk-note">Loading...</p>';
    const [t, m, p, e] = await Promise.all([
      sb.from("teams").select("*").order("created_at"),
      sb.from("team_members").select("user_id, team_id, joined_at").order("joined_at"),
      sb.from("profiles").select("*").order("created_at"),
      sb.from("evaluations").select("*"),
    ]);
    const bad = [t, m, p, e].find((r) => r.error);
    if (bad) return notice(s(bad.error.message), "error");
    data = { teams: t.data, members: m.data, profiles: p.data, evals: e.data };
    draw();
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
      <td><a href="mailto:${s(p.email)}">${s(p.email)}</a><small>${s(p.phone)}</small></td>
      <td class="adm-links">${[["GitHub", p.github_url], ["LinkedIn", p.linkedin_url], ["Best project", p.best_project_url]].filter(([, u]) => isUrl(u)).map(([n, u]) => `<a href="${s(u)}" target="_blank" rel="noopener noreferrer">${n}</a>`).join("")}<span>${stars(p.coding_level)}</span></td>
      <td class="adm-eval">${rate("idea_rating", "Idea")}${rate("presentation_rating", "Presentation skills")}${volunteer}</td>
      <td><input class="adm-notes" type="text" maxlength="2000" placeholder="Notes" value="${s(e.notes)}" aria-label="Notes for ${s(p.name)}"><span class="adm-saved" aria-live="polite"></span></td>
    </tr>`;
  };
  const table = (rows) => `<div class="adm-scroll"><table class="adm-table"><thead><tr><th>Person</th><th>Contact</th><th>Links and level</th><th>Review</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;

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
          <span class="hk-tag ${full ? "" : "warn"}">${people.length} member${people.length === 1 ? "" : "s"}${full ? "" : ` (needs ${MIN}+)`}</span></header>
        <div class="adm-proj">${t.submitted_at
          ? `<p><b>Problem:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p><p><b>Project:</b> ${isUrl(t.project_url) ? `<a href="${s(t.project_url)}" target="_blank" rel="noopener noreferrer">${s(t.project_url)}</a>` : "-"}</p>`
          : "<p><i>No project submitted yet.</i></p>"}</div>
        ${table(shown.map((p) => person(p, p.user_id === t.lead_id, ev)).join(""))}</article>`;
    }).join("");
    const soloShown = solo.filter((p) => match(p, null));
    const soloCard = soloShown.length ? `<article class="adm-team"><header><div><h3>Not in a team</h3><small>Registered, no team yet</small></div><span class="hk-tag warn">${solo.length}</span></header>${table(soloShown.map((p) => person(p, false, ev)).join(""))}</article>` : "";
    const done = data.evals.filter((x) => x.volunteer_interest).length;
    host.innerHTML = `<div class="adm-stats">
        <div><strong>${data.profiles.length}</strong><span>Registered</span></div>
        <div><strong>${data.teams.length}</strong><span>Teams</span></div>
        <div><strong>${data.teams.filter((t) => t.submitted_at).length}</strong><span>Projects submitted</span></div>
        <div><strong>${done}</strong><span>Want to volunteer</span></div></div>
      <div class="adm-tools"><label class="field adm-search">Search<input id="adm-q" type="search" placeholder="Name, college, team, email" value="${s(q)}"></label>
        <button class="btn btn-sm btn-tonal" id="adm-refresh" type="button">Refresh</button><button class="btn btn-sm btn-tonal" id="adm-csv" type="button">Export CSV</button></div>
      ${cards + soloCard || '<p class="hk-note">Nothing to show yet.</p>'}`;
    const qi = document.getElementById("adm-q");
    qi.addEventListener("input", () => { const pos = qi.selectionStart; draw(); const n = document.getElementById("adm-q"); n.focus(); n.setSelectionRange(pos, pos); });
    document.getElementById("adm-refresh").addEventListener("click", refresh);
    document.getElementById("adm-csv").addEventListener("click", exportCsv);
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
    const row = { user_id: tr.dataset.uid, notes: tr.querySelector(".adm-notes").value.trim() || null, updated_by: me.id, updated_at: new Date().toISOString() };
    tr.querySelectorAll(".adm-rate").forEach((g) => { const c = g.querySelector("input:checked"); row[g.dataset.k] = c ? +c.value : null; });
    row.volunteer_interest = tr.querySelector('input[data-k="volunteer_interest"]').checked;
    out.textContent = "Saving...";
    const { error } = await sb.from("evaluations").upsert(row, { onConflict: "user_id" });
    out.textContent = error ? "Not saved" : "Saved";
    if (error) return;
    const i = data.evals.findIndex((x) => x.user_id === row.user_id);
    if (i >= 0) data.evals[i] = { ...data.evals[i], ...row }; else data.evals.push(row);
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

  function exportCsv() {
    const { groups, solo, ev } = index();
    const cell = (v) => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const head = ["Team", "Team code", "Role", "Name", "College", "Phone", "Email", "GitHub", "LinkedIn", "Coding level (0-5)", "Best project", "Team problem", "Team idea", "Team project URL", "Idea rating (1-5)", "Presentation skills (1-5)", "Volunteering interest", "Notes"];
    const rows = [];
    const add = (t, p, lead) => { const e = ev.get(p.user_id) || {}; rows.push([t ? t.name : "(no team)", t ? t.code : "", t ? (lead ? "Lead" : "Member") : "", p.name, p.college, p.phone, p.email, p.github_url, p.linkedin_url, p.coding_level, p.best_project_url, t ? t.problem_statement : "", t ? t.idea : "", t ? t.project_url : "", e.idea_rating || "", e.presentation_rating || "", e.volunteer_interest ? "Yes" : "", e.notes || ""]); };
    groups.forEach(({ team: t, people }) => people.forEach((p) => add(t, p, p.user_id === t.lead_id)));
    solo.forEach((p) => add(null, p, false));
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = "gdg-vizag-registrations.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  boot();
})();
