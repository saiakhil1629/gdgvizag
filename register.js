// Community page: event registration. Details, then Team Lead (creates a team code) or Team Member (joins with a code).
// The lead can submit the team project at any time. Teams hold up to MAX members.
(() => {
  const MIN = 1, MAX = 6;
  const root = document.getElementById("hackathon");
  if (!root) return;
  const panel = document.getElementById("hk-panel");
  const openBtn = document.getElementById("hk-open");
  const here = "community.html#hackathon";
  const s = (v) => esc(String(v == null ? "" : v));
  const isUrl = (u) => /^https?:\/\//i.test(u || "");

  // Fill the event card from the live feed when the event is there.
  FEED.events().then(({ events }) => {
    const e = events.find((x) => /prompt to product/i.test(x.title));
    if (!e) return;
    const meta = document.getElementById("hk-meta");
    meta.textContent = [FEED.dateLabel(e), e.venue].filter(Boolean).join(" · ");
  });

  let state = { session: null, profile: null, team: null, roster: [], role: null, editing: false };

  const setMsg = (text, kind = "error") => {
    const m = panel.querySelector(".hk-msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = `auth-msg hk-msg is-${kind}`;
    m.hidden = !text;
  };
  const friendly = (err) => {
    const m = (err && err.message) || "Something went wrong. Please try again.";
    if (err && (err.code === "PGRST205" || err.code === "42P01" || /schema cache|does not exist/i.test(m)))
      return "Registration isn't set up yet. The admin needs to run supabase/schema.sql in Supabase.";
    if (/duplicate key/i.test(m)) return "That is already saved.";
    return m;
  };
  const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = on ? "Please wait..." : label; };

  async function load() {
    panel.innerHTML = '<p class="hk-note">Loading...</p>';
    if (!sb) { panel.innerHTML = '<p class="auth-msg is-warn">Sign in isn\'t connected yet.</p>'; return; }
    const { data } = await sb.auth.getSession();
    state.session = data.session;
    if (!state.session) return render();
    const uid = state.session.user.id;
    const prof = await sb.from("profiles").select("*").eq("user_id", uid).maybeSingle();
    if (prof.error) { panel.innerHTML = `<p class="auth-msg is-error">${s(friendly(prof.error))}</p>`; return; }
    state.profile = prof.data;
    state.team = null; state.roster = [];
    if (state.profile) {
      const mem = await sb.from("team_members").select("team_id").eq("user_id", uid).maybeSingle();
      if (mem.data) {
        const [t, r] = await Promise.all([
          sb.from("teams").select("*").eq("id", mem.data.team_id).maybeSingle(),
          sb.rpc("my_team_roster"),
        ]);
        state.team = t.data;
        state.roster = r.data || [];
      }
    }
    render();
  }

  function render() {
    if (!state.session) return renderLogin();
    if (!state.profile || state.editing) renderProfile();
    else if (!state.team) renderRole();
    else renderTeam();
    const who = document.createElement("p");
    who.className = "hk-who";
    who.textContent = `Logged in as ${state.session.user.email}`;
    panel.prepend(who);
  }

  function renderLogin() {
    const next = encodeURIComponent(here);
    panel.innerHTML = `<div class="hk-step"><h3>Log in to register</h3>
      <p>You need a GDG Vizag account to register for this event.</p>
      <div class="cta"><a class="btn" href="login.html?next=${next}">Log in</a><a class="btn btn-tonal" href="signup.html?next=${next}">Create an account</a></div></div>`;
  }

  function renderProfile() {
    const p = state.profile || {};
    const email = p.email || state.session.user.email || "";
    panel.innerHTML = `<form class="hk-step" id="hk-profile">
      <p class="hk-stepno">Step 1 of 2</p><h3>Your details</h3>
      <div class="hk-grid">
        <label class="field">Full name<input name="name" type="text" autocomplete="name" minlength="2" maxlength="100" required value="${s(p.name)}"></label>
        <label class="field">College<input name="college" type="text" minlength="2" maxlength="150" required value="${s(p.college)}"></label>
        <label class="field">Phone<input name="phone" type="tel" autocomplete="tel" pattern="[0-9+() \\-]{7,20}" title="7 to 20 digits" required value="${s(p.phone)}"></label>
        <label class="field">Email<input name="email" type="email" autocomplete="email" maxlength="200" required value="${s(email)}"></label>
      </div>
      <div class="hk-grid">
        <label class="field">GitHub profile link<input name="github" type="url" placeholder="https://github.com/your-name" maxlength="300" pattern="https?://(www\.)?github\.com/.+" title="A link like https://github.com/your-name" required value="${s(p.github_url)}"></label>
        <label class="field">LinkedIn profile link<input name="linkedin" type="url" placeholder="https://www.linkedin.com/in/your-name" maxlength="300" pattern="https?://([a-z]{2,3}\.)?linkedin\.com/.+" title="A link like https://www.linkedin.com/in/your-name" required value="${s(p.linkedin_url)}"></label>
      </div>
      <label class="field">Your own project URL (your best project)<input name="best" type="url" placeholder="https://" maxlength="500" required value="${s(p.best_project_url)}"></label>
      <fieldset class="choice hk-startup"><legend>Do you want to turn your idea into a startup?</legend>
        <label><input type="radio" name="startup" value="yes" required ${p.wants_startup === true ? "checked" : ""}><span>Yes</span></label>
        <label><input type="radio" name="startup" value="no" required ${p.wants_startup === false ? "checked" : ""}><span>No</span></label>
      </fieldset>
      <fieldset class="hk-level"><legend>Your coding level, from 0 to 5 stars</legend>
        <div class="hk-stars" role="radiogroup" aria-label="Coding level">
          ${[0, 1, 2, 3, 4, 5].map((n) => `<label class="hk-star${n === 0 ? " zero" : ""}"><input type="radio" name="level" value="${n}" required ${p.coding_level === n ? "checked" : ""}><span aria-hidden="true">${n === 0 ? "0" : "&#9733;"}</span><i class="sr">${n} ${n === 1 ? "star" : "stars"}</i></label>`).join("")}
        </div>
        <small class="hk-levelnote" id="hk-levelnote"></small>
      </fieldset>
      <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>
      <div class="cta"><button class="btn" type="submit">${state.profile ? "Save details" : "Save and continue"}</button>${state.profile ? '<button class="btn btn-ghost" type="button" id="hk-cancel">Cancel</button>' : ""}</div>
    </form>`;
    const f = panel.querySelector("#hk-profile");
    const LEVELS = ["Just starting out", "Beginner", "Learning fast", "Comfortable", "Strong", "Expert"];
    const paintStars = () => {
      const v = f.querySelector("input[name=level]:checked");
      const n = v ? +v.value : -1;
      f.querySelectorAll(".hk-star").forEach((l) => { const k = +l.querySelector("input").value; l.classList.toggle("on", k > 0 && k <= n); l.classList.toggle("pick", k === n); });
      f.querySelector("#hk-levelnote").textContent = n < 0 ? "Pick how you rate yourself. Be honest, there are no wrong answers." : `${n} of 5: ${LEVELS[n]}`;
    };
    f.querySelectorAll("input[name=level]").forEach((i) => i.addEventListener("change", paintStars));
    paintStars();
    const c = panel.querySelector("#hk-cancel");
    if (c) c.addEventListener("click", () => { state.editing = false; render(); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button[type=submit]");
      const label = btn.textContent;
      busy(btn, true, label);
      const row = {
        user_id: state.session.user.id, name: f.name.value.trim(), college: f.college.value.trim(),
        phone: f.phone.value.trim(), email: f.email.value.trim(), best_project_url: f.best.value.trim(),
        github_url: f.github.value.trim(), linkedin_url: f.linkedin.value.trim(), coding_level: +f.level.value, wants_startup: f.startup.value === "yes",
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await sb.from("profiles").upsert(row, { onConflict: "user_id" }).select().single();
      if (error) { setMsg(friendly(error)); busy(btn, false, label); return; }
      state.profile = data; state.editing = false;
      render();
    });
  }

  function renderRole() {
    const lead = state.role === "lead", member = state.role === "member";
    panel.innerHTML = `<div class="hk-step">
      <p class="hk-stepno">Step 2 of 2</p><h3>Build your team</h3>
      <p>Hi ${s(state.profile.name)}. Teams can have up to ${MAX} members. Pick your role.</p>
      <div class="hk-roles" role="group" aria-label="Your role">
        <button type="button" class="hk-role${lead ? " on" : ""}" data-role="lead" aria-pressed="${lead}"><b>Team Lead</b><span>Create a team and get a code to share.</span></button>
        <button type="button" class="hk-role${member ? " on" : ""}" data-role="member" aria-pressed="${member}"><b>Team Member</b><span>Join a team with the code from your lead.</span></button>
      </div>
      ${lead ? `<form class="hk-step hk-sub" id="hk-create"><label class="field">Team name<input name="team" type="text" minlength="2" maxlength="60" required></label>
        <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p><button class="btn" type="submit">Create team</button></form>` : ""}
      ${member ? `<form class="hk-step hk-sub" id="hk-join"><label class="field">Team code<input name="code" type="text" placeholder="GDG-XXXXXX" maxlength="20" autocapitalize="characters" autocomplete="off" required></label>
        <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p><button class="btn" type="submit">Join the team</button></form>` : ""}
      ${!lead && !member ? '<p class="auth-msg hk-msg" hidden></p>' : ""}
      <p><button type="button" class="auth-link hk-edit" id="hk-edit">Edit my details</button></p>
    </div>`;
    panel.querySelectorAll(".hk-role").forEach((b) => b.addEventListener("click", () => { state.role = b.dataset.role; renderRole(); }));
    panel.querySelector("#hk-edit").addEventListener("click", () => { state.editing = true; render(); });
    const create = panel.querySelector("#hk-create"), join = panel.querySelector("#hk-join");
    const run = (form, rpc, args) => form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = form.querySelector("button[type=submit]");
      const label = btn.textContent;
      busy(btn, true, label);
      const { error } = await sb.rpc(rpc, args(form));
      if (error) { setMsg(friendly(error)); busy(btn, false, label); return; }
      state.role = null;
      load();
    });
    if (create) run(create, "create_team", (f) => ({ p_name: f.team.value }));
    if (join) run(join, "join_team", (f) => ({ p_code: f.code.value }));
  }

  function renderTeam() {
    const t = state.team, n = state.roster.length;
    const isLead = t.lead_id === state.session.user.id;
    const ready = n >= MIN;
    const status = ready ? `${n} of ${MAX} members` : `${n} of ${MAX} members. You need at least ${MIN}.`;
    const people = state.roster.map((m) => `<li><span class="hk-av">${s((m.name || "?").trim()[0] || "?")}</span><div><b>${s(m.name)}${m.is_me ? " (you)" : ""}</b><small>${s(m.college)}</small></div>${m.is_lead ? '<span class="hk-tag">Lead</span>' : ""}</li>`).join("");
    const submitted = !!t.submitted_at;
    const project = isLead
      ? `<form id="hk-project"><h4>Project submission</h4>
          ${ready ? "" : `<p class="auth-msg is-warn">Your team needs ${MIN - n} more ${MIN - n === 1 ? "member" : "members"} before you can submit. Share your team code.</p>`}
          <label class="field">Problem statement<textarea name="problem" rows="3" maxlength="2000" required ${ready ? "" : "disabled"}>${s(t.problem_statement)}</textarea></label>
          <label class="field">Your idea<textarea name="idea" rows="4" maxlength="3000" required ${ready ? "" : "disabled"}>${s(t.idea)}</textarea></label>
          <label class="field">Project URL (deployed or demo)<input name="url" type="url" placeholder="https://" maxlength="500" required ${ready ? "" : "disabled"} value="${s(t.project_url)}"></label>
          <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>
          <button class="btn" type="submit" ${ready ? "" : "disabled"}>${submitted ? "Update submission" : "Submit project"}</button></form>`
      : `<div><h4>Project submission</h4>${submitted
          ? `<p><b>Problem:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p>${isUrl(t.project_url) ? `<p><a href="${s(t.project_url)}" target="_blank" rel="noopener noreferrer">${s(t.project_url)}</a></p>` : ""}`
          : "<p>Your team lead hasn't submitted the project yet.</p>"}</div>`;
    panel.innerHTML = `<div class="hk-step">
      <p class="hk-stepno">${isLead ? "You are the Team Lead" : "You are a Team Member"}</p>
      <h3>${s(t.name)}</h3>
      <div class="hk-code"><span>Team code</span><b id="hk-code">${s(t.code)}</b><button type="button" class="btn btn-sm btn-tonal" id="hk-copy">Copy</button></div>
      <p class="hk-note">${s(status)}${submitted ? " · Project submitted" : ""}</p>
      <ul class="hk-people">${people}</ul>
      <div class="hk-project">${project}</div>
      <div class="cta hk-actions"><button type="button" class="btn btn-sm btn-tonal" id="hk-refresh">Refresh team</button><button type="button" class="btn btn-sm btn-ghost" id="hk-edit">Edit my details</button><button type="button" class="btn btn-sm btn-ghost" id="hk-leave">Leave team</button></div>
      ${isLead ? "" : '<p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>'}
    </div>`;
    panel.querySelector("#hk-copy").addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(t.code); e.target.textContent = "Copied"; } catch { e.target.textContent = t.code; }
      setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
    });
    panel.querySelector("#hk-refresh").addEventListener("click", load);
    panel.querySelector("#hk-edit").addEventListener("click", () => { state.editing = true; render(); });
    panel.querySelector("#hk-leave").addEventListener("click", async () => {
      if (!confirm("Leave this team?")) return;
      const { error } = await sb.rpc("leave_team");
      if (error) return setMsg(friendly(error));
      load();
    });
    const pf = panel.querySelector("#hk-project");
    if (pf) pf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = pf.querySelector("button[type=submit]");
      const label = btn.textContent;
      busy(btn, true, label);
      const { error } = await sb.rpc("submit_project", { p_problem: pf.problem.value, p_idea: pf.idea.value, p_url: pf.url.value });
      if (error) { setMsg(friendly(error)); busy(btn, false, label); return; }
      await load();
      setMsg("Project saved.", "ok");
    });
  }

  const reveal = () => panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  const open = async () => {
    panel.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    openBtn.textContent = "Hide registration";
    if (!panel.dataset.loaded) { panel.dataset.loaded = "1"; await load(); }
    reveal();
  };
  openBtn.addEventListener("click", () => {
    if (panel.hidden) open();
    else { panel.hidden = true; openBtn.setAttribute("aria-expanded", "false"); openBtn.textContent = "Register for this event"; }
  });
  // Coming back from login, or following a #hackathon link, opens the flow straight away.
  if (location.hash === "#hackathon") open();
})();
