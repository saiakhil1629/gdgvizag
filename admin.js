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
    l2g: { name: "Local2Global Hack : GDGVIZAG", sub: "5&ndash;6 November 2026 &middot; Gayatri Vidya Parishad College of Engineering, Visakhapatnam", badge: "Completed", warn: true, confirm: true, staged: true },
  };
  let cur = "p2p"; // the event whose dashboard is open
  const demoLine = (t) => [["Demo", t.demo_url], ["GitHub", t.github_url], ["Live website", t.live_url], ["Presentation", t.slides_url]]
    .filter(([, u]) => isUrl(u)).map(([n, u]) => `<p><b>${n}:</b> <a href="${s(u)}" target="_blank" rel="noopener noreferrer">${s(u)}</a></p>`).join("");
  const stageLabel = (t) => (!t.locked_at ? "Stage 1: team not locked" : !t.idea_confirmed_at ? "Stage 2: problem and idea" : !t.assets_locked_at ? "Stage 3: image and slides" : !t.submitted_at ? "Stage 4: GitHub and live site" : "All stages done");
  const BUCKET = "jury-images";
  const STAGES = ["Lock team", "Problem statement and idea", "Jury image and slides", "GitHub and live website"];
  const SHORT = ["Team lock", "Problem and idea", "Image and slides", "GitHub and site"];
  const filledStage = (t, no) => (no === 1 ? !!t.locked_at : no === 2 ? !!(t.problem_statement && t.idea) : no === 3 ? !!(t.jury_image_path && t.slides_url) : !!t.submitted_at);
  let me, isSuper = false, data = { teams: [], members: [], profiles: [], evals: [], checks: [], event: null, teamScores: [], personScores: [] };
  // Scores are kept per judge (every admin scores on their own). These turn a list of judges' rows into averages.
  const avgOf = (rows, k) => { const v = rows.map((r) => r[k]).filter((n) => n > 0); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const r1 = (n) => (n == null ? "" : Math.round(n * 10) / 10);
  const fmt = (n) => (n == null ? "-" : n.toFixed(1));
  const avgScores = (uid) => {
    const rows = data.personScores.filter((x) => x.user_id === uid);
    return { presentation_rating: avgOf(rows, "presentation_rating"), knowledge_rating: avgOf(rows, "knowledge_rating"), roleplay_rating: avgOf(rows, "roleplay_rating"), volunteer_interest: rows.some((x) => x.volunteer_interest), notes: rows.filter((x) => x.notes).map((x) => `${x.judge_email}: ${x.notes}`).join(" | ") };
  };
  const teamAvg = (id, k) => avgOf(data.teamScores.filter((x) => x.team_id === id), k);

  async function boot() {
    if (!sb) return notice("Sign in isn't connected yet.");
    const { data: ses } = await sb.auth.getSession();
    if (!ses.session) return notice('Please <a href="login.html?next=admin.html">log in</a> with an admin account.');
    me = ses.session.user;
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error) return notice(s(/function|schema cache/i.test(error.message) ? "Setup isn't finished. Run supabase/schema.sql in Supabase." : error.message), "error");
    if (ok !== true) return notice(`${s(me.email)} is not an admin account.`);
    const sup = await sb.rpc("is_super");
    isSuper = sup.data === true;
    await home();
  }

  // Landing view: one card per event. Each opens that event's dashboard.
  async function home() {
    host.innerHTML = '<p class="hk-note">Loading...</p>';
    const [r, t, ev] = await Promise.all([sb.from("registrations").select("event"), sb.from("teams").select("event, submitted_at"), sb.from("events").select("key, current_stage")]);
    const bad = [r, t, ev].find((x) => x.error);
    if (bad) return notice(s(/function|schema cache|does not exist/i.test(bad.error.message) ? `Setup isn't finished. Run the latest supabase/schema.sql in Supabase. (Database said: ${bad.error.message})` : bad.error.message), "error");
    host.innerHTML = `<div class="adm-events">${Object.entries(EVENTS).map(([key, e]) => {
      const reg = r.data.filter((x) => x.event === key).length;
      const teams = t.data.filter((x) => x.event === key);
      return `<article class="adm-event">
        <span class="hk-tag${e.warn ? " warn" : ""}">${e.badge}</span>
        <h3>${e.name}</h3>
        <p class="sub">${e.sub}</p>
        <p class="adm-event-stats"><b>${reg}</b> registered &middot; <b>${teams.length}</b> teams &middot; <b>${teams.filter((x) => x.submitted_at).length}</b> projects submitted${e.staged ? ` &middot; ${((ev.data.find((x) => x.key === key) || {}).current_stage || 1) > 4 ? "ended" : `stage <b>${(ev.data.find((x) => x.key === key) || {}).current_stage || 1}</b> of 4 open`}` : ""}</p>
        <button class="btn btn-sm" data-ev="${key}" type="button">Open dashboard</button>
      </article>`;
    }).join("")}</div>${isSuper ? '<section class="adm-admins" id="adm-admins"></section>' : ""}`;
    host.querySelectorAll("button[data-ev]").forEach((b) => b.addEventListener("click", () => { cur = b.dataset.ev; refresh(); }));
    if (isSuper) renderAdmins();
  }

  // Super admin only: add and remove normal admins by email.
  async function renderAdmins(flash, kind = "ok") {
    const box = document.getElementById("adm-admins");
    if (!box) return;
    box.innerHTML = '<p class="hk-note">Loading admins...</p>';
    const { data: rows, error } = await sb.rpc("list_admins");
    if (error) { box.innerHTML = `<p class="auth-msg is-error">${s(error.message)}</p>`; return; }
    box.innerHTML = `<h3>Admins</h3>
      <p class="hk-note">You are the super admin. A normal admin can only score teams and people. Add someone by email: they log in on this website as usual and the Admin link appears for them.</p>
      <form class="adm-addadmin" id="adm-addform"><label class="field">Email<input id="adm-addmail" type="email" placeholder="name@example.com" maxlength="200" required autocomplete="off"></label><button class="btn btn-sm" type="submit">Add admin</button></form>
      <p class="auth-msg hk-msg is-${kind}" id="adm-addmsg" role="status" aria-live="polite" ${flash ? "" : "hidden"}>${s(flash || "")}</p>
      <ul class="adm-adminlist">${rows.map((r) => `<li><span><b>${s(r.email)}</b> ${r.is_super ? '<span class="hk-tag">Super admin</span>' : '<span class="hk-tag off">Admin</span>'} <small>${r.signed_up ? "Has an account" : "Not signed up yet"}</small></span>${r.is_super ? "" : `<button type="button" class="btn btn-sm btn-ghost" data-rm="${s(r.email)}">Remove</button>`}</li>`).join("")}</ul>`;
    box.querySelector("#adm-addform").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = box.querySelector("#adm-addmail").value.trim();
      const { error: err } = await sb.rpc("add_admin", { p_email: email });
      if (err) { const m = box.querySelector("#adm-addmsg"); m.textContent = err.message; m.className = "auth-msg hk-msg is-error"; m.hidden = false; return; }
      renderAdmins(`${email.toLowerCase()} is now an admin.`);
    });
    box.querySelectorAll("button[data-rm]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`Remove ${b.dataset.rm} as an admin? They lose access to this page.`)) return;
      const { error: err } = await sb.rpc("remove_admin", { p_email: b.dataset.rm });
      if (err) { alert(err.message); return; }
      renderAdmins(`${b.dataset.rm} was removed.`);
    }));
  }

  async function refresh() {
    host.innerHTML = '<p class="hk-note">Loading...</p>';
    if (await load()) draw();
  }

  async function load() {
    const [t, m, r, p, e, c, evr, ts, ps] = await Promise.all([
      sb.from("teams").select("*").eq("event", cur).order("created_at"),
      sb.from("team_members").select("user_id, team_id, joined_at").eq("event", cur).order("joined_at"),
      sb.from("registrations").select("user_id").eq("event", cur),
      sb.from("profiles").select("*").order("created_at"),
      sb.from("evaluations").select("*").eq("event", cur),
      sb.from("team_checks").select("*"),
      sb.from("events").select("*").eq("key", cur).maybeSingle(),
      sb.from("team_scores").select("*"),
      sb.from("person_scores").select("*").eq("event", cur),
    ]);
    const bad = [t, m, r, p, e, c, evr, ts, ps].find((x) => x.error);
    if (bad) { notice(s(bad.error.message), "error"); return false; }
    const registered = new Set(r.data.map((x) => x.user_id));
    const teamIds = new Set(t.data.map((x) => x.id));
    // Staged events are scored per judge: a normal admin only receives their own rows, the super admin receives everyone's.
    // "evals" is this admin's own view of the scores, in the same shape the review rows already use.
    data = { teams: t.data, members: m.data, profiles: p.data.filter((x) => registered.has(x.user_id)), evals: EVENTS[cur].staged ? ps.data.filter((x) => x.judge_id === me.id) : e.data, checks: c.data, event: evr.data, teamScores: ts.data.filter((x) => teamIds.has(x.team_id)), personScores: ps.data };
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
      <td class="adm-eval" data-label="Review">${EVENTS[cur].staged ? rate("presentation_rating", "Presentation skills") + rate("knowledge_rating", "Deep knowledge of the idea") + rate("roleplay_rating", "Role play") : rate("idea_rating", "Idea") + rate("presentation_rating", "Presentation skills")}${volunteer}${isSuper && EVENTS[cur].staged ? `<div class="adm-pjudges">${personJudges(p.user_id)}</div>` : ""}</td>
      <td data-label="Notes"><input class="adm-notes" type="text" maxlength="2000" placeholder="Notes" value="${s(e.notes)}" aria-label="Notes for ${s(p.name)}"><span class="adm-saved" aria-live="polite"></span></td>
    </tr>`;
  };
  const table = (rows) => `<div class="adm-scroll"><table class="adm-table"><thead><tr><th>Person</th><th>Contact</th><th>Links and level</th><th>Review</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  // Stage control: the admin decides which stage is open for every team.
  function stagePanel() {
    if (!isSuper || !EVENTS[cur].staged || !data.event) return "";
    const st = data.event.current_stage;
    const nowFilled = st <= 4 ? data.teams.filter((t) => filledStage(t, st)).length : 0;
    const steps = STAGES.map((name, i) => `<li class="${i + 1 < st ? "done" : i + 1 === st ? "now" : ""}"><b>${i + 1}</b><span>${name}</span></li>`).join("");
    return `<section class="adm-stagebox" aria-labelledby="adm-stage-h"><h3 id="adm-stage-h">Stage control</h3>
      <ol class="adm-steps">${steps}</ol>
      <p id="adm-stage-now">${st > 4 ? "<b>The event has ended.</b> Nothing is open for teams." : `Stage <b>${st} of 4</b> is open for every team: ${STAGES[st - 1]}. <b>${nowFilled}</b> of <b>${data.teams.length}</b> teams have filled it.`}</p>
      <div class="adm-tools"><button class="btn btn-sm" id="adm-next" type="button" ${st > 4 ? "disabled" : ""}>${st === 4 ? "Close final submissions (end the event)" : "Move to next stage"}</button><button class="btn btn-sm btn-tonal" id="adm-prev" type="button" ${st <= 1 ? "disabled" : ""}>Go back one stage</button></div>
      <p class="adm-hint"><small>Moving on closes the current stage for every team, whether it filled it or not. A team cannot go back to a stage that closed unless you reopen it on its card.</small></p></section>`;
  }
  async function moveStage(next) {
    const st = data.event.current_stage;
    const msg = next
      ? `Move to ${st === 4 ? "the end of the event" : "stage " + (st + 1)}?\n\nThis closes stage ${st} for EVERY team, whether they filled it or not. ${st === 1 ? "Every team is locked with the members it has." : st === 2 ? "Saved drafts count as confirmed." : st === 3 ? "Saved images and links are locked." : "Teams can no longer change their links."}`
      : `Go back to stage ${st - 1}?\n\nOnly the stage number goes back. Teams that were locked stay locked (use Reopen on a team card for that).`;
    if (!confirm(msg)) return;
    const { error } = await sb.rpc(next ? "admin_next_stage" : "admin_back_stage", { p_event: cur });
    if (error) { alert(error.message); return; }
    refresh();
  }

  // All judges' scores for one team / one person (super admin only): each judge, then the average.
  function judgesHtml(t) {
    const rows = data.teamScores.filter((x) => x.team_id === t.id);
    return `<details class="adm-judges"><summary>All judges (${rows.length}). Average: Idea ${fmt(avgOf(rows, "idea_rating"))} &middot; Presentation ${fmt(avgOf(rows, "presentation_rating"))} &middot; Website ${fmt(avgOf(rows, "website_rating"))}</summary><ul>${rows.map((r) => `<li><b>${s(r.judge_email)}</b>: Idea ${r.idea_rating || "-"} &middot; Presentation ${r.presentation_rating || "-"} &middot; Website ${r.website_rating || "-"}</li>`).join("") || "<li>No scores yet.</li>"}</ul></details>`;
  }
  function personJudges(uid) {
    const rows = data.personScores.filter((x) => x.user_id === uid);
    return `<details class="adm-judges"><summary>All judges (${rows.length}). Average: Presentation ${fmt(avgOf(rows, "presentation_rating"))} &middot; Knowledge ${fmt(avgOf(rows, "knowledge_rating"))} &middot; Role play ${fmt(avgOf(rows, "roleplay_rating"))}</summary><ul>${rows.map((r) => `<li><b>${s(r.judge_email)}</b>: Presentation ${r.presentation_rating || "-"} &middot; Knowledge ${r.knowledge_rating || "-"} &middot; Role play ${r.roleplay_rating || "-"}${r.volunteer_interest ? " &middot; volunteering" : ""}</li>`).join("") || "<li>No scores yet.</li>"}</ul></details>`;
  }

  // Staged submission, as the judges see it: the team's work and this admin's own scores. The super admin also gets
  // progress, manual checks, every judge's scores and the team tools.
  function stagedBlock(t) {
    const chk = data.checks.find((x) => x.team_id === t.id) || {};
    const mine = data.teamScores.find((x) => x.team_id === t.id && x.judge_id === me.id) || {};
    const box = (k, label) => `<label class="adm-chk"><input type="checkbox" data-check="${k}" ${chk[k] ? "checked" : ""}><span>${label}</span></label>`;
    const score = (k, label) => `<div class="adm-rate" data-sk="${k}" role="radiogroup" aria-label="${label}"><span class="adm-rl">${label}</span><span class="adm-rs">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="${k}-${s(t.id)}" value="${n}" ${mine[k] === n ? "checked" : ""}><span aria-hidden="true">&#9733;</span><i class="sr">${n} ${n === 1 ? "star" : "stars"}</i></label>`).join("")}<button type="button" class="adm-clear" aria-label="Clear ${label}">Clear</button></span></div>`;
    const act = (a, label, extra = "") => `<button type="button" class="btn btn-sm btn-tonal adm-act" data-act="${a}" ${extra}>${label}</button>`;
    const st = data.event ? data.event.current_stage : 1;
    const flags = SHORT.map((name, i) => { const no = i + 1, ok = filledStage(t, no); const m = ok ? "" : no < st ? " warn" : no === st ? " warn" : " off"; return `<span class="hk-tag${m}">${no}. ${name}: ${ok ? "done" : no < st ? "missed" : no === st ? "open" : "-"}</span>`; }).join(" ");
    return `${isSuper ? `<p class="adm-flags">${flags}</p>` : ""}
      ${t.problem_statement ? `<p><b>Problem:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p>${t.idea_confirmed_at ? "" : "<p><small>Draft, not confirmed yet.</small></p>"}` : "<p><i>No problem statement yet.</i></p>"}
      ${t.jury_image_path ? `<div class="adm-img" data-path="${s(t.jury_image_path)}"><img alt="Jury image of ${s(t.name)}" hidden><small>Loading image...</small></div>` : "<p><i>No jury image yet.</i></p>"}
      ${demoLine(t)}
      <div class="adm-checkgrid${isSuper ? "" : " one"}">
        ${isSuper ? `<fieldset class="adm-checks"><legend>My manual checks</legend>
          ${box("image_ok", "Image is really from Gemini")}${box("slides_ok", "Presentation link opens")}${box("github_ok", "GitHub link works")}${box("live_ok", "Live website works")}
        </fieldset>` : ""}
        <fieldset class="adm-checks adm-score"><legend>Team score${isSuper ? " (yours)" : ""}</legend>
          ${score("idea_rating", "Idea")}${score("presentation_rating", "Presentation skills")}${score("website_rating", "Website")}
        </fieldset>
      </div>
      ${isSuper ? `<div class="adm-teamjudges">${judgesHtml(t)}</div>
      <div class="adm-tools adm-teamtools">
        ${t.assets_locked_at ? act("reopen", "Reopen image and links", 'data-stage="3"') : ""}${t.idea_confirmed_at ? act("reopen", "Reopen problem and idea", 'data-stage="2"') : ""}${t.locked_at ? act("reopen", "Reopen team lock", 'data-stage="1"') : ""}
        ${act("reset", "Reset team")}${act("remove", "Remove team")}
      </div>
      <p class="adm-hint"><small>Reset deletes the team so its people can start again. Remove also takes them off this event.</small></p>` : ""}`;
  }

  function draw() {
    const { groups, solo, ev } = index();
    const q = (document.getElementById("adm-q")?.value || "").trim().toLowerCase();
    const match = (p, t) => !q || [p.name, p.college, p.email, p.phone, t && t.name, t && t.code].some((v) => String(v || "").toLowerCase().includes(q));
    const cards = groups.map(({ team: t, people }) => {
      const shown = people.filter((p) => match(p, t));
      if (!shown.length) return "";
      const full = people.length >= MIN;
      return `<article class="adm-team" data-team="${s(t.id)}">
        <header><div><h3>${s(t.name)}</h3><small>Code ${s(t.code)}</small></div>
          <span class="hk-tag ${full ? "" : "warn"}">${people.length} member${people.length === 1 ? "" : "s"}${full ? "" : ``}</span>${EVENTS[cur].staged ? (t.lead_locked_at ? '<span class="hk-tag">Locked by lead</span>' : t.locked_at ? '<span class="hk-tag warn">Locked by admin move</span>' : '<span class="hk-tag warn">Not locked yet</span>') : t.locked_at ? '<span class="hk-tag">Team confirmed</span>' : EVENTS[cur].confirm ? '<span class="hk-tag warn">Not confirmed yet</span>' : ""}</header>
        <div class="adm-proj">${EVENTS[cur].staged ? stagedBlock(t) : t.submitted_at
          ? `<p><b>Problem:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p><p><b>Project:</b> ${isUrl(t.project_url) ? `<a href="${s(t.project_url)}" target="_blank" rel="noopener noreferrer">${s(t.project_url)}</a>` : "-"}</p>${demoLine(t)}`
          : "<p><i>No project submitted yet.</i></p>"}</div>
        ${table(shown.map((p) => person(p, p.user_id === t.lead_id, ev)).join(""))}</article>`;
    }).join("");
    const soloShown = solo.filter((p) => match(p, null));
    const soloCard = soloShown.length ? `<article class="adm-team"><header><div><h3>Not in a team</h3><small>Registered, no team yet</small></div><span class="hk-tag warn">${solo.length}</span></header>${table(soloShown.map((p) => person(p, false, ev)).join(""))}</article>` : "";
    const done = EVENTS[cur].staged ? new Set(data.personScores.filter((x) => x.volunteer_interest).map((x) => x.user_id)).size : data.evals.filter((x) => x.volunteer_interest).length;
    host.innerHTML = `<div class="adm-eventbar"><button class="btn btn-sm btn-tonal" id="adm-back" type="button">&larr; All events</button><h3>${EVENTS[cur].name} <span class="hk-tag${EVENTS[cur].warn ? " warn" : ""}">${EVENTS[cur].badge}</span></h3></div>
      ${stagePanel()}
      <div class="adm-stats">
        <div><strong>${data.profiles.length}</strong><span>Registered</span></div>
        <div><strong>${data.teams.length}</strong><span>Teams</span></div>
        <div><strong>${data.teams.filter((t) => t.submitted_at).length}</strong><span>Projects submitted</span></div>
        <div><strong>${done}</strong><span>Want to volunteer</span></div>
        <div><strong>${data.profiles.filter((x) => x.wants_startup === true).length}</strong><span>Want a startup</span></div></div>
      <div class="adm-tools"><label class="field adm-search">Search<input id="adm-q" type="search" placeholder="Name, college, team, email" value="${s(q)}"></label>
        <button class="btn btn-sm btn-tonal" id="adm-refresh" type="button">Refresh</button>${isSuper ? `<div class="adm-dl"><button class="btn btn-sm btn-tonal" id="adm-dl" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="adm-menu">Download</button><div class="adm-menu" id="adm-menu" role="menu" hidden><button type="button" role="menuitem" id="adm-csv">Export people CSV</button><button type="button" role="menuitem" id="adm-teams-csv">Download teams CSV</button><button type="button" role="menuitem" id="adm-pdf">Download PDF</button></div></div>` : ""}</div>
      ${cards + soloCard || '<p class="hk-note">Nothing to show yet.</p>'}`;
    const qi = document.getElementById("adm-q");
    qi.addEventListener("input", () => { const pos = qi.selectionStart; draw(); const n = document.getElementById("adm-q"); n.focus(); n.setSelectionRange(pos, pos); });
    document.getElementById("adm-back").addEventListener("click", home);
    document.getElementById("adm-refresh").addEventListener("click", refresh);
    if (isSuper) {
      document.getElementById("adm-csv").addEventListener("click", exportCsv);
      document.getElementById("adm-teams-csv").addEventListener("click", exportTeamsCsv);
      document.getElementById("adm-pdf").addEventListener("click", exportPdf);
      const dl = document.getElementById("adm-dl"), menu = document.getElementById("adm-menu");
      dl.addEventListener("click", () => { menu.hidden = !menu.hidden; dl.setAttribute("aria-expanded", String(!menu.hidden)); });
      menu.addEventListener("click", () => { menu.hidden = true; dl.setAttribute("aria-expanded", "false"); });
    }
    const nx = document.getElementById("adm-next"), pv = document.getElementById("adm-prev");
    if (nx) nx.addEventListener("click", () => moveStage(true));
    if (pv) pv.addEventListener("click", () => moveStage(false));
    host.querySelectorAll("tr[data-uid], .adm-score").forEach(paint);
    host.querySelectorAll(".adm-img[data-path]").forEach(async (b) => {
      const { data: d, error } = await sb.storage.from(BUCKET).createSignedUrl(b.dataset.path, 3600);
      const note = b.querySelector("small");
      if (error || !d) { note.textContent = "The image could not be loaded."; return; }
      const img = b.querySelector("img");
      img.src = d.signedUrl; img.hidden = false; note.innerHTML = `<a href="${esc(d.signedUrl)}" target="_blank" rel="noopener noreferrer">Open full size</a>`;
    });
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

  // Local2Global: each admin saves their own row; nobody overwrites anybody else's scores.
  async function savePerson(tr) {
    const out = tr.querySelector(".adm-saved");
    const row = { user_id: tr.dataset.uid, event: cur, judge_id: me.id, updated_at: new Date().toISOString() };
    const notes = tr.querySelector(".adm-notes");
    row.notes = notes ? notes.value.trim() || null : null;
    tr.querySelectorAll(".adm-rate").forEach((g) => { const c = g.querySelector("input:checked"); row[g.dataset.k] = c ? +c.value : null; });
    row.volunteer_interest = tr.querySelector('input[data-k="volunteer_interest"]').checked;
    out.textContent = "Saving...";
    const { error } = await sb.from("person_scores").upsert(row, { onConflict: "user_id,event,judge_id" });
    out.textContent = error ? "Not saved" : "Saved";
    if (error) return;
    const full = { ...row, judge_email: String(me.email || "").toLowerCase() };
    for (const list of [data.personScores, data.evals]) {
      const i = list.findIndex((x) => x.user_id === row.user_id && x.judge_id === me.id);
      if (i >= 0) list[i] = { ...list[i], ...full }; else list.push(full);
    }
    const pj = tr.querySelector(".adm-pjudges");
    if (pj) pj.innerHTML = personJudges(row.user_id);
    setTimeout(() => { if (out.textContent === "Saved") out.textContent = ""; }, 1500);
  }

  async function save(tr) {
    if (EVENTS[cur].staged) return savePerson(tr);
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
    setTimeout(() => { if (out.textContent === "Saved") out.textContent = ""; }, 1500);
  }
  host.addEventListener("change", (e) => { const tr = e.target.closest("tr[data-uid]"); if (tr && e.target.closest(".adm-eval, .adm-notes")) { paint(tr); save(tr); } });
  host.addEventListener("click", (e) => {
    const b = e.target.closest(".adm-clear");
    if (!b) return;
    const root = b.closest("tr[data-uid]") || b.closest(".adm-score");
    b.closest(".adm-rate").querySelectorAll("input").forEach((i) => { i.checked = false; });
    paint(root);
    if (root.matches("tr")) save(root); else saveScore(root.closest("[data-team]"));
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
    const head = ["Team", "Team code", "Lead name", "Lead email", "Lead phone", "Members", "Team confirmed", "Member names", "Member emails", "Colleges", "Problem statement", "Idea", "Project URL", "Demo URL", "GitHub URL", "Live website URL", "Slides URL", "Stage", "Submitted at", "Average idea rating (1-5)", "Average presentation (1-5)", "Team score: idea (1-5, average of judges)", "Team score: presentation (1-5, average of judges)", "Team score: website (1-5, average of judges)"];
    const rows = groups.map(({ team: t, people }) => {
      const lead = people.find((p) => p.user_id === t.lead_id) || {};
      const rated = (k) => people.map((p) => (ev.get(p.user_id) || {})[k]).filter((n) => n > 0);
      const ck = data.checks.find((x) => x.team_id === t.id) || {};
      return [t.name, t.code, lead.name, lead.email, lead.phone, people.length, (EVENTS[cur].staged ? t.lead_locked_at : t.locked_at) ? "Yes" : "No", people.map((p) => p.name).join("; "), people.map((p) => p.email).join("; "), [...new Set(people.map((p) => p.college))].join("; "), t.problem_statement, t.idea, t.project_url, t.demo_url, t.github_url, t.live_url, t.slides_url, stageLabel(t), t.submitted_at ? new Date(t.submitted_at).toLocaleString() : "Not submitted", avg(rated("idea_rating")), avg(rated("presentation_rating")), r1(teamAvg(t.id, "idea_rating")), r1(teamAvg(t.id, "presentation_rating")), r1(teamAvg(t.id, "website_rating"))];
    });
    download([head, ...rows], `gdg-vizag-${cur}-teams.csv`);
  }

  // Manual checks (saved per team) and the team tools: reopen a stage, reset, remove.
  // Manual checks: super admin only (the database refuses anyone else).
  async function saveChecks(card) {
    const row = { team_id: card.dataset.team, checked_by: me.id, updated_at: new Date().toISOString() };
    card.querySelectorAll("input[data-check]").forEach((x) => { row[x.dataset.check] = x.checked; });
    const { error } = await sb.from("team_checks").upsert(row, { onConflict: "team_id" });
    if (error) { alert("Not saved: " + error.message); refresh(); return; }
    const i = data.checks.findIndex((x) => x.team_id === row.team_id);
    if (i >= 0) data.checks[i] = { ...data.checks[i], ...row }; else data.checks.push(row);
  }
  // Team score: one row per judge, so two admins never overwrite each other.
  async function saveScore(card) {
    const row = { team_id: card.dataset.team, judge_id: me.id, updated_at: new Date().toISOString() };
    card.querySelectorAll(".adm-score .adm-rate").forEach((g) => { const c = g.querySelector("input:checked"); row[g.dataset.sk] = c ? +c.value : null; });
    const { error } = await sb.from("team_scores").upsert(row, { onConflict: "team_id,judge_id" });
    if (error) { alert("Not saved: " + error.message); refresh(); return; }
    const full = { ...row, judge_email: String(me.email || "").toLowerCase() };
    const i = data.teamScores.findIndex((x) => x.team_id === row.team_id && x.judge_id === me.id);
    if (i >= 0) data.teamScores[i] = { ...data.teamScores[i], ...full }; else data.teamScores.push(full);
    const jb = card.querySelector(".adm-teamjudges"), t = data.teams.find((x) => x.id === row.team_id);
    if (jb && t) jb.innerHTML = judgesHtml(t);
  }
  host.addEventListener("change", (e) => {
    const el = e.target.closest("input[data-check], .adm-score input");
    if (!el) return;
    const card = el.closest("[data-team]");
    if (el.closest(".adm-score")) { paint(el.closest(".adm-score")); saveScore(card); } else saveChecks(card);
  });
  host.addEventListener("click", async (e) => {
    const b = e.target.closest(".adm-act");
    if (!b) return;
    const card = b.closest("[data-team]");
    const t = data.teams.find((x) => x.id === card.dataset.team);
    if (!t) return;
    const act = b.dataset.act;
    let error;
    if (act === "reopen") {
      const stage = +b.dataset.stage;
      if (!confirm(`Reopen ${stage === 1 ? "the team lock" : stage === 2 ? "the problem statement and idea" : "the image and links"} for "${t.name}"? The lead can edit it again.`)) return;
      ({ error } = await sb.rpc("admin_reopen_stage", { p_team: t.id, p_stage: stage }));
    } else {
      const remove = act === "remove";
      if (!confirm(remove
        ? `REMOVE team "${t.name}"? The team and its image are deleted and its members are taken off this event.`
        : `RESET team "${t.name}"? The team and its image are deleted. Its members stay registered and can make a new team.`)) return;
      if (t.jury_image_path) await sb.storage.from(BUCKET).remove([t.jury_image_path]);
      ({ error } = await sb.rpc("admin_reset_team", { p_team: t.id, p_remove: remove }));
    }
    if (error) { alert(error.message); return; }
    refresh();
  });

  // PDF: each team (for Local2Global only the teams whose lead ticked the lock box) with its people, problem statement,
  // idea and star scores. Names in non-English scripts are replaced by "?" because the built-in PDF fonts are Latin only.
  function exportPdf() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) { alert("The PDF tool could not load. Check your internet connection and try again."); return; }
    const { groups, ev } = index();
    const staged = !!EVENTS[cur].staged;
    const list = groups.filter(({ team }) => !staged || team.lead_locked_at);
    if (!list.length) { alert(staged ? "No team has been locked by its lead yet, so there is nothing to put in the PDF." : "There are no teams yet."); return; }
    const doc = new J({ unit: "mm", format: "a4" });
    const W = 210, H = 297, M = 14, BOTTOM = H - 18;
    let y = M;
    const plain = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
    const lineH = (size) => size * 0.3528 * 1.4;
    const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
    const write = (str, size, bold, gray) => {
      doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(gray ? 105 : 20);
      const lh = lineH(size);
      doc.splitTextToSize(plain(str) || "-", W - 2 * M).forEach((ln) => { need(lh); doc.text(ln, M, y + lh * 0.75); y += lh; });
    };
    const star = (cx, cy, r, on) => {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
      const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
      segs.push([pts[0][0] - pts[9][0], pts[0][1] - pts[9][1]]);
      if (on) doc.setFillColor(247, 186, 0); else doc.setFillColor(222, 222, 222);
      doc.lines(segs, pts[0][0], pts[0][1], [1, 1], "F", true);
    };
    const starsAt = (n, x, yy) => {
      for (let i = 0; i < 5; i++) star(x + 2.2 + i * 5, yy, 2.1, i < Math.round(n || 0));
      if (n) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(105); doc.text(Number.isInteger(n) ? String(n) : n.toFixed(1), x + 27, yy + 1); }
    };
    const cols = staged
      ? [["Presentation skills", "presentation_rating", 62], ["Knowledge of the idea", "knowledge_rating", 98], ["Role play", "roleplay_rating", 142]]
      : [["Idea", "idea_rating", 62], ["Presentation skills", "presentation_rating", 110]];

    write(EVENTS[cur].name, 18, true);
    write(`Teams with their people. Made on ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST.${staged ? " Only teams locked by their lead are included. Scores are the average of every admin who scored." : ""}`, 9, false, true);
    y += 5;
    list.forEach(({ team: t, people }, i) => {
      need(70);
      if (i > 0) { doc.setDrawColor(210); doc.line(M, y, W - M, y); y += 5; }
      const lead = people.find((p) => p.user_id === t.lead_id);
      write(t.name, 15, true);
      write(`Team code ${t.code}${lead ? ", lead: " + lead.name : ""}`, 9, false, true);
      y += 2;
      write("Problem statement", 9, true);
      write(t.problem_statement || "Not submitted", 10, false);
      y += 1.5;
      write("Idea", 9, true);
      write(t.idea || "Not submitted", 10, false);
      y += 2;
      if (staged) {
        const ck = { idea_rating: teamAvg(t.id, "idea_rating"), presentation_rating: teamAvg(t.id, "presentation_rating"), website_rating: teamAvg(t.id, "website_rating") };
        need(14);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20);
        doc.text("Team score", M, y + 3); y += 5;
        [["Idea", ck.idea_rating], ["Presentation skills", ck.presentation_rating], ["Website", ck.website_rating]].forEach(([label, n], k) => {
          doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(105);
          doc.text(label, M + k * 60, y + 3);
          starsAt(n, M + k * 60, y + 7.2);
        });
        y += 12;
      }
      write("People", 9, true);
      need(8);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(105);
      cols.forEach(([label, , x]) => doc.text(label, M + x, y + 3));
      y += 5;
      people.forEach((p) => {
        need(8);
        const e = staged ? avgScores(p.user_id) : ev.get(p.user_id) || {};
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
        doc.text(doc.splitTextToSize(plain(p.name) + (p.user_id === t.lead_id ? " (lead)" : ""), 58)[0], M, y + 4);
        cols.forEach(([, k, x]) => starsAt(e[k], M + x, y + 3));
        y += 7;
      });
      y += 4;
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`${plain(EVENTS[cur].name)} - page ${i} of ${pages}`, W / 2, H - 8, { align: "center" });
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(doc.output("blob"));
    a.download = `gdg-vizag-${cur}-teams-and-people.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    const { groups, solo, ev } = index();
    const cell = (v) => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const head = ["Team", "Team code", "Role", "Name", "College", "Phone", "Email", "GitHub", "LinkedIn", "Coding level (0-5)", "Wants to build a startup", "Best project", "Team problem", "Team idea", "Team project URL", "Team demo URL", "Idea rating (1-5)", "Presentation skills (1-5)", "Deep knowledge of the idea (1-5)", "Role play (1-5)", "Volunteering interest", "Notes"];
    const rows = [];
    const add = (t, p, lead) => { const e = EVENTS[cur].staged ? avgScores(p.user_id) : ev.get(p.user_id) || {}; rows.push([t ? t.name : "(no team)", t ? t.code : "", t ? (lead ? "Lead" : "Member") : "", p.name, p.college, p.phone, p.email, p.github_url, p.linkedin_url, p.coding_level, p.wants_startup === true ? "Yes" : p.wants_startup === false ? "No" : "", p.best_project_url, t ? t.problem_statement : "", t ? t.idea : "", t ? t.project_url : "", t ? t.demo_url : "", r1(e.idea_rating), r1(e.presentation_rating), r1(e.knowledge_rating), r1(e.roleplay_rating), e.volunteer_interest ? "Yes" : "", e.notes || ""]); };
    groups.forEach(({ team: t, people }) => people.forEach((p) => add(t, p, p.user_id === t.lead_id)));
    solo.forEach((p) => add(null, p, false));
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `gdg-vizag-${cur}-registrations.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const closeMenu = () => { const m = document.getElementById("adm-menu"), b = document.getElementById("adm-dl"); if (m && !m.hidden) { m.hidden = true; b.setAttribute("aria-expanded", "false"); } };
  document.addEventListener("click", (e) => { if (!e.target.closest(".adm-dl")) closeMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); const b = document.getElementById("adm-dl"); if (b) b.focus(); } });

  boot();
})();
