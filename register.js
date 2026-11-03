// Community page: event registration. Details, then Team Lead (creates a team code) or Team Member (joins with a code).
// One flow serves every event listed in EVENTS below. Event rules (deadline, college check, demo link) come from the
// "events" table in Supabase, so they can be changed without touching this file.
(() => {
  const MIN = 1;
  const s = (v) => esc(String(v == null ? "" : v));
  const isUrl = (u) => /^https?:\/\//i.test(u || "");
  const IST = { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" };

  const EVENTS = [
    { event: "p2p", root: "hackathon", panel: "hk-panel", open: "hk-open", meta: "hk-meta", feed: /prompt to product/i,
      openLabel: "Register for this event", closeLabel: "Hide registration" },
    { event: "l2g", root: "local2global", panel: "l2g-panel", open: "l2g-open",
      openLabel: "Build your team and submit here", closeLabel: "Hide team builder" },
  ];

  function setup(cfg) {
    const root = document.getElementById(cfg.root);
    if (!root) return;
    const panel = document.getElementById(cfg.panel);
    const openBtn = document.getElementById(cfg.open);
    if (!panel || !openBtn) return;
    const EVENT = cfg.event;
    const here = `community.html#${cfg.root}`;

    // Fill the event card from the live feed when the event is there.
    if (cfg.feed) FEED.events().then(({ events }) => {
      const e = events.find((x) => cfg.feed.test(x.title));
      if (!e) return;
      const meta = document.getElementById(cfg.meta);
      if (meta) meta.textContent = [FEED.dateLabel(e), e.venue].filter(Boolean).join(" · ");
    });

    let state = { session: null, profile: null, registered: false, cfg: null, team: null, roster: [], role: null, editing: false };

    const setMsg = (text, kind = "error") => {
      const m = panel.querySelector(".hk-top-msg") || panel.querySelector(".hk-msg");
      if (!m) return;
      m.textContent = text || "";
      m.className = `auth-msg hk-msg${m.classList.contains("hk-top-msg") ? " hk-top-msg" : ""} is-${kind}`;
      m.hidden = !text;
    };
    const friendly = (err) => {
      const m = (err && err.message) || "Something went wrong. Please try again.";
      if (err && (err.code === "PGRST205" || err.code === "42P01" || err.code === "42703" || /schema cache|does not exist/i.test(m)))
        return "Registration isn't set up yet. The admin needs to run supabase/schema.sql in Supabase.";
      if (/duplicate key/i.test(m)) return "That is already saved.";
      return m;
    };
    const busy = (btn, on, label) => { btn.disabled = on; if (label) btn.textContent = on ? "Please wait..." : label; };
    const rule = () => state.cfg || {};
    const maxTeam = () => rule().max_team || 6;
    const eventName = () => rule().name || "this event";
    const closes = () => (rule().submissions_close ? new Date(rule().submissions_close) : null);
    const isClosed = () => !!closes() && Date.now() > closes().getTime();
    const closesText = () => `${closes().toLocaleString("en-IN", IST)} IST`;

    async function load() {
      panel.innerHTML = '<p class="hk-note">Loading...</p>';
      if (!sb) { panel.innerHTML = '<p class="auth-msg is-warn">Sign in isn\'t connected yet.</p>'; return; }
      const { data } = await sb.auth.getSession();
      state.session = data.session;
      if (!state.session) return render();
      const uid = state.session.user.id;
      const [ev, prof, reg] = await Promise.all([
        sb.from("events").select("*").eq("key", EVENT).maybeSingle(),
        sb.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
        sb.from("registrations").select("event").eq("user_id", uid).eq("event", EVENT).maybeSingle(),
      ]);
      const bad = [ev, prof, reg].find((r) => r.error);
      if (bad) { panel.innerHTML = `<p class="auth-msg is-error">${s(friendly(bad.error))}</p>`; return; }
      state.cfg = ev.data;
      state.profile = prof.data;
      state.registered = !!reg.data;
      state.team = null; state.roster = [];
      if (state.profile && state.registered) {
        const mem = await sb.from("team_members").select("team_id").eq("user_id", uid).eq("event", EVENT).maybeSingle();
        if (mem.data) {
          const [t, r] = await Promise.all([
            sb.from("teams").select("*").eq("id", mem.data.team_id).maybeSingle(),
            sb.rpc("my_team_roster", { p_event: EVENT }),
          ]);
          state.team = t.data;
          state.roster = r.data || [];
        }
      }
      render();
    }

    function render() {
      if (!state.session) return renderLogin();
      if (!state.profile || !state.registered || state.editing) renderProfile();
      else if (!state.team) renderRole();
      else if (rule().flow === "staged") renderStaged();
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
      const only = rule().college_label ? `<p class="hk-note hk-only">${s(eventName())} is for <b>${s(rule().college_label)}</b> students only. Enter your college name in full, for example "Gayatri Vidya Parishad College of Engineering".</p>` : "";
      panel.innerHTML = `<form class="hk-step" id="hk-profile">
        <p class="hk-stepno">Step 1 of 2</p><h3>Your details</h3>${only}
        <div class="hk-grid">
          <label class="field">Full name<input name="name" type="text" autocomplete="name" minlength="2" maxlength="100" required value="${s(p.name)}"></label>
          <label class="field">College<input name="college" type="text" minlength="2" maxlength="150" required value="${s(p.college)}"></label>
          <label class="field">Phone<input name="phone" type="tel" autocomplete="tel" pattern="[0-9+() \\-]{7,20}" title="7 to 20 digits" required value="${s(p.phone)}"></label>
          <label class="field">Email<input name="email" type="email" autocomplete="email" maxlength="200" required value="${s(email)}"></label>
        </div>
        <div class="hk-grid">
          <label class="field">GitHub profile link<input name="github" type="url" placeholder="https://github.com/your-name" maxlength="300" pattern="https?://(www\\.)?github\\.com/.+" title="A link like https://github.com/your-name" required value="${s(p.github_url)}"></label>
          <label class="field">LinkedIn profile link<input name="linkedin" type="url" placeholder="https://www.linkedin.com/in/your-name" maxlength="300" pattern="https?://([a-z]{2,3}\\.)?linkedin\\.com/.+" title="A link like https://www.linkedin.com/in/your-name" required value="${s(p.linkedin_url)}"></label>
        </div>
        <label class="field">Your own project URL (your best project), optional<input name="best" type="url" placeholder="https://" maxlength="500" value="${s(p.best_project_url)}"></label>
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
        <div class="cta"><button class="btn" type="submit">${state.profile && state.registered ? "Save details" : "Save and continue"}</button>${state.profile && state.registered ? '<button class="btn btn-ghost" type="button" id="hk-cancel">Cancel</button>' : ""}</div>
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
        const college = f.college.value.trim();
        // Same rule the database enforces, checked first so a wrong college is never saved over the profile.
        const pat = rule().college_pattern;
        let re = null;
        try { re = pat ? new RegExp(pat, "i") : null; } catch { re = null; }
        if (re && !re.test(college)) {
          return setMsg(`${eventName()} is for ${rule().college_label || "selected college"} students only. Enter your college name in full, for example "Gayatri Vidya Parishad College of Engineering".`);
        }
        busy(btn, true, label);
        const row = {
          user_id: state.session.user.id, name: f.name.value.trim(), college,
          phone: f.phone.value.trim(), email: f.email.value.trim(), best_project_url: f.best.value.trim() || null,
          github_url: f.github.value.trim(), linkedin_url: f.linkedin.value.trim(), coding_level: +f.level.value, wants_startup: f.startup.value === "yes",
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await sb.from("profiles").upsert(row, { onConflict: "user_id" }).select().single();
        if (error) { setMsg(friendly(error)); busy(btn, false, label); return; }
        const reg = await sb.rpc("register_for_event", { p_event: EVENT });
        if (reg.error) { setMsg(friendly(reg.error)); busy(btn, false, label); return; }
        state.profile = data; state.registered = true; state.editing = false;
        render();
      });
    }

    function renderRole() {
      const lead = state.role === "lead", member = state.role === "member";
      panel.innerHTML = `<div class="hk-step">
        <p class="hk-stepno">Step 2 of 2</p><h3>Build your team</h3>
        <p>Hi ${s(state.profile.name)}. Teams can have ${rule().confirm_team ? `1 to ${maxTeam()}` : `up to ${maxTeam()}`} members. Pick your role.</p>
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
      if (create) run(create, "create_team", (f) => ({ p_name: f.team.value, p_event: EVENT }));
      if (join) run(join, "join_team", (f) => ({ p_code: f.code.value }));
    }

    function renderTeam() {
      const t = state.team, n = state.roster.length;
      const isLead = t.lead_id === state.session.user.id;
      const ready = n >= MIN;
      const closed = isClosed();
      const needsDemo = !!rule().needs_demo;
      const needsConfirm = !!rule().confirm_team;
      const locked = !!t.locked_at;
      const status = `${n} of ${maxTeam()} members`;
      const people = state.roster.map((m) => `<li><span class="hk-av">${s((m.name || "?").trim()[0] || "?")}</span><div><b>${s(m.name)}${m.is_me ? " (you)" : ""}</b><small>${s(m.college)}</small></div>${m.is_lead ? '<span class="hk-tag">Lead</span>' : ""}</li>`).join("");
      const submitted = !!t.submitted_at;
      const off = ready && !closed && (!needsConfirm || locked) ? "" : "disabled";
      const confirmBox = needsConfirm
        ? (isLead
          ? `<label class="hk-confirm"><input type="checkbox" id="hk-lock" ${locked ? "checked" : ""} ${closed ? "disabled" : ""}><span><b>My team is final</b> (${n} ${n === 1 ? "member" : "members"}). Tick this to lock the team: nobody can join or leave after that. Untick it if you still need to change the team.</span></label>`
          : `<p class="hk-note">${locked ? "Your team lead has confirmed the team." : "Waiting for your team lead to confirm the team."}</p>`)
        : "";
      const deadline = closes() ? `<p class="${closed ? "auth-msg is-warn" : "hk-note"}">${closed ? `Submissions closed on ${s(closesText())}.` : `Submissions close on <b>${s(closesText())}</b>.`}</p>` : "";
      const links = (x) => [["Project", x.project_url], ["Demo", x.demo_url]].filter(([, u]) => isUrl(u)).map(([l, u]) => `<p><b>${l}:</b> <a href="${s(u)}" target="_blank" rel="noopener noreferrer">${s(u)}</a></p>`).join("");
      const project = isLead
        ? `<form id="hk-project"><h4>Project submission</h4>${deadline}
            ${needsConfirm && !locked ? '<p class="auth-msg is-warn">Tick "My team is final" above before you submit.</p>' : ""}
            ${ready ? "" : `<p class="auth-msg is-warn">Your team needs ${MIN - n} more ${MIN - n === 1 ? "member" : "members"} before you can submit. Share your team code.</p>`}
            <label class="field">Problem statement<textarea name="problem" rows="3" maxlength="2000" required ${off}>${s(t.problem_statement)}</textarea></label>
            <label class="field">Your idea<textarea name="idea" rows="4" maxlength="3000" required ${off}>${s(t.idea)}</textarea></label>
            <label class="field">Project URL (deployed or demo)<input name="url" type="url" placeholder="https://" maxlength="500" required ${off} value="${s(t.project_url)}"></label>
            ${needsDemo ? `<label class="field">Demo link (a video or a live demo)<input name="demo" type="url" placeholder="https://" maxlength="500" required ${off} value="${s(t.demo_url)}"></label>` : ""}
            <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>
            <button class="btn" type="submit" ${off}>${submitted ? "Update submission" : "Submit project"}</button></form>`
        : `<div><h4>Project submission</h4>${deadline}${submitted
            ? `<p><b>Problem:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p>${links(t)}`
            : "<p>Your team lead hasn't submitted the project yet.</p>"}</div>`;
      panel.innerHTML = `<div class="hk-step">
        <p class="hk-stepno">${isLead ? "You are the Team Lead" : "You are a Team Member"}</p>
        <h3>${s(t.name)}</h3>
        <div class="hk-code"><span>Team code</span><b id="hk-code">${s(t.code)}</b><button type="button" class="btn btn-sm btn-tonal" id="hk-copy">Copy</button></div>
        <p class="hk-note">${s(status)}${locked ? " · Team confirmed" : ""}${submitted ? " · Project submitted" : ""}</p>
        <ul class="hk-people">${people}</ul>
        ${confirmBox}
        <div class="hk-project">${project}</div>
        <div class="cta hk-actions"><button type="button" class="btn btn-sm btn-tonal" id="hk-refresh">Refresh team</button><button type="button" class="btn btn-sm btn-ghost" id="hk-edit">Edit my details</button><button type="button" class="btn btn-sm btn-ghost" id="hk-leave" ${locked ? 'disabled title="Your team is confirmed"' : ""}>Leave team</button></div>
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
        const { error } = await sb.rpc("leave_team", { p_event: EVENT });
        if (error) return setMsg(friendly(error));
        load();
      });
      const lk = panel.querySelector("#hk-lock");
      if (lk) lk.addEventListener("change", async () => {
        lk.disabled = true;
        const { error } = await sb.rpc("lock_team", { p_locked: lk.checked, p_event: EVENT });
        await load();
        if (error) setMsg(friendly(error));
      });
      const pf = panel.querySelector("#hk-project");
      if (pf) pf.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = pf.querySelector("button[type=submit]");
        const label = btn.textContent;
        busy(btn, true, label);
        const { error } = await sb.rpc("submit_project", {
          p_problem: pf.problem.value, p_idea: pf.idea.value, p_url: pf.url.value, p_event: EVENT, p_demo: pf.demo ? pf.demo.value : null,
        });
        if (error) { setMsg(friendly(error)); busy(btn, false, label); return; }
        await load();
        setMsg("Project saved.", "ok");
      });
    }

    // ---- Step-by-step submission (events whose flow is "staged"): 1 team lock, 2 problem + idea, 3 image + slides, 4 GitHub + live site.
    const RX = {
      gemini: /^https:\/\/(gemini\.google\.com|g\.co)\/.+/i,
      slides: /^https:\/\/docs\.google\.com\/presentation\/d\/[A-Za-z0-9_-]+/i,
      github: /^https:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/i,
      live: /^https?:\/\/.+/i,
    };
    const BUCKET = "jury-images", MAX_IMG = 15 * 1024 * 1024, IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
    const msgIn = (scope, text, kind = "error") => {
      const m = scope && scope.querySelector(".hk-msg");
      if (!m) return;
      m.textContent = text || "";
      m.className = `auth-msg hk-msg is-${kind}`;
      m.hidden = !text;
    };
    const flash = (sel, text, kind = "ok") => msgIn(panel.querySelector(sel), text, kind);
    const linkTo = (u) => (isUrl(u) ? `<a href="${s(u)}" target="_blank" rel="noopener noreferrer">${s(u)}</a>` : "-");

    function renderStaged() {
      const t = state.team, n = state.roster.length;
      const isLead = t.lead_id === state.session.user.id;
      const closed = isClosed();
      const dis = closed ? "disabled" : "";
      const locked = !!t.locked_at, ideaDone = !!t.idea_confirmed_at, assetsDone = !!t.assets_locked_at, finalDone = !!t.submitted_at;
      const assetsSaved = !!(t.jury_image_path && t.gemini_chat_url && t.slides_url);
      const stage = !locked ? 1 : !ideaDone ? 2 : !assetsDone ? 3 : 4;
      const stuck = !!t.problem_statement || ideaDone; // once the idea is saved the team lock can no longer be undone
      const tag = (done, open) => (done ? '<span class="hk-tag">Done</span>' : open ? '<span class="hk-tag warn">In progress</span>' : '<span class="hk-tag off">Waiting</span>');
      const people = state.roster.map((m) => `<li><span class="hk-av">${s((m.name || "?").trim()[0] || "?")}</span><div><b>${s(m.name)}${m.is_me ? " (you)" : ""}</b><small>${s(m.college)}</small></div>${m.is_lead ? '<span class="hk-tag">Lead</span>' : ""}</li>`).join("");
      const deadline = closes() ? `<p class="${closed ? "auth-msg is-warn" : "hk-note"}">${closed ? `Submissions closed on ${s(closesText())}.` : `Everything closes on <b>${s(closesText())}</b>.`}</p>` : "";
      const stageBox = (no, title, done, open, body) => `<section class="hk-stage${done ? " done" : open ? " now" : ""}"><header><h4>Stage ${no}. ${title}</h4>${tag(done, open)}</header>${body}</section>`;

      // Stage 1: team lock
      const s1 = stageBox(1, "Lock your team", locked, !locked, isLead
        ? `<label class="hk-confirm"><input type="checkbox" id="hk-lock" ${locked ? "checked" : ""} ${closed || (locked && stuck) ? "disabled" : ""}><span><b>Team lock</b> (${n} ${n === 1 ? "member" : "members"}). Fill your team with 1 to ${maxTeam()} members, then tick this box. Nobody can join or leave after that.${locked && stuck ? " Your team is locked for good now. Ask an admin if you must change it." : ""}</span></label>`
        : `<p class="hk-note">${locked ? "Your team lead has locked the team." : "Waiting for your team lead to lock the team."}</p>`);

      // Stage 2: problem statement and idea
      const readIdea = `<p><b>Problem statement:</b> ${s(t.problem_statement)}</p><p><b>Idea:</b> ${s(t.idea)}</p>`;
      const s2 = stageBox(2, "Problem statement and idea", ideaDone, locked && !ideaDone, !locked ? '<p class="hk-note">Opens when your team is locked.</p>'
        : ideaDone ? `${readIdea}<p class="hk-note">Confirmed. It cannot be changed now.</p>`
        : isLead ? `<form id="hk-idea">
            <label class="field">Problem statement<textarea name="problem" rows="3" maxlength="2000" required ${dis}>${s(t.problem_statement)}</textarea></label>
            <label class="field">Your idea<textarea name="idea" rows="4" maxlength="3000" required ${dis}>${s(t.idea)}</textarea></label>
            <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>
            <div class="cta"><button class="btn btn-tonal" type="submit" ${dis}>Save draft</button><button class="btn" type="button" id="hk-idea-confirm" ${dis}>Confirm problem statement and idea</button></div>
            <small>After you confirm, the text cannot be changed and stage 3 opens.</small></form>`
        : (t.problem_statement ? `${readIdea}<p class="hk-note">Your team lead has not confirmed it yet.</p>` : "<p>Your team lead is writing the problem statement and idea.</p>"));

      // Stage 3: jury image + Gemini chat link + Google Slides link
      const preview = `<div class="hk-img" id="hk-imgbox" ${t.jury_image_path ? "" : "hidden"}><img id="hk-preview" alt="Jury image of the problem statement and idea" hidden><small id="hk-preview-note">Loading image...</small></div>`;
      const readAssets = `${preview}<p><b>Gemini chat:</b> ${linkTo(t.gemini_chat_url)}</p><p><b>Google Slides:</b> ${linkTo(t.slides_url)}</p>`;
      const s3 = stageBox(3, "Jury image and slides", assetsDone, ideaDone && !assetsDone, !ideaDone ? '<p class="hk-note">Opens when the problem statement and idea are confirmed.</p>'
        : assetsDone ? `${readAssets}<p class="hk-note">Locked.</p>`
        : isLead ? `<form id="hk-assets">
            <p>Make <b>one image</b> that shows your problem statement and your idea, using <b>Gemini</b>. This is the image the jury will see.</p>
            <label class="field">Image (PNG, JPG or WebP, up to 15 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" ${dis}></label>
            ${preview}
            <label class="field">Link to the Gemini chat that made the image<input name="gemini" type="url" placeholder="https://gemini.google.com/share/..." maxlength="500" required ${dis} value="${s(t.gemini_chat_url)}"></label>
            <small>In Gemini open the chat, press Share, and copy the link.</small>
            <label class="field">Google Slides link (view link)<input name="slides" type="url" placeholder="https://docs.google.com/presentation/d/..." maxlength="500" required ${dis} value="${s(t.slides_url)}"></label>
            <small>In Google Slides press Share, set General access to "Anyone with the link" (Viewer), then copy the link.</small>
            <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>
            <div class="cta"><button class="btn btn-tonal" type="submit" ${dis}>Submit image and links</button><button class="btn" type="button" id="hk-assets-lock" ${assetsSaved && !closed ? "" : "disabled"}>Lock this stage</button></div>
            <small>Lock opens after you have submitted. Locking moves your team to stage 4.</small></form>`
        : (assetsSaved ? `${readAssets}<p class="hk-note">Your team lead has not locked this stage yet.</p>` : "<p>Your team lead is preparing the image and slides.</p>"));

      // Stage 4: GitHub + live website
      const warn = '<p class="auth-msg is-warn">Both links must open properly. A team whose link does not work will be removed.</p>';
      const s4 = stageBox(4, "GitHub and live website", finalDone, assetsDone && !finalDone, !assetsDone ? '<p class="hk-note">Opens when stage 3 is locked.</p>'
        : isLead ? `<form id="hk-final">${warn}
            <label class="field">GitHub repository link<input name="github" type="url" placeholder="https://github.com/your-name/your-repo" maxlength="500" required ${dis} value="${s(t.github_url)}"></label>
            <label class="field">Live website link<input name="live" type="url" placeholder="https://" maxlength="500" required ${dis} value="${s(t.live_url)}"></label>
            <p class="auth-msg hk-msg" role="status" aria-live="polite" hidden></p>
            <button class="btn" type="submit" ${dis}>${finalDone ? "Update links" : "Submit links"}</button></form>`
        : `${warn}${finalDone ? `<p><b>GitHub:</b> ${linkTo(t.github_url)}</p><p><b>Live website:</b> ${linkTo(t.live_url)}</p>` : "<p>Your team lead has not submitted the links yet.</p>"}`);

      panel.innerHTML = `<div class="hk-step">
        <p class="hk-stepno">${isLead ? "You are the Team Lead" : "You are a Team Member"}</p>
        <h3>${s(t.name)}</h3>
        <div class="hk-code"><span>Team code</span><b id="hk-code">${s(t.code)}</b><button type="button" class="btn btn-sm btn-tonal" id="hk-copy">Copy</button></div>
        <p class="hk-note">${n} of ${maxTeam()} members &middot; ${finalDone ? "All stages done" : `Stage ${stage} of 4`}</p>
        <ul class="hk-people">${people}</ul>
        ${deadline}
        <div class="hk-stages">${s1}${s2}${s3}${s4}</div>
        <div class="cta hk-actions"><button type="button" class="btn btn-sm btn-tonal" id="hk-refresh">Refresh team</button><button type="button" class="btn btn-sm btn-ghost" id="hk-edit">Edit my details</button><button type="button" class="btn btn-sm btn-ghost" id="hk-leave" ${locked ? 'disabled title="Your team is locked"' : ""}>Leave team</button></div>
        <p class="auth-msg hk-msg hk-top-msg" role="status" aria-live="polite" hidden></p>
      </div>`;

      panel.querySelector("#hk-copy").addEventListener("click", async (e) => {
        try { await navigator.clipboard.writeText(t.code); e.target.textContent = "Copied"; } catch { e.target.textContent = t.code; }
        setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
      });
      panel.querySelector("#hk-refresh").addEventListener("click", load);
      panel.querySelector("#hk-edit").addEventListener("click", () => { state.editing = true; render(); });
      panel.querySelector("#hk-leave").addEventListener("click", async () => {
        if (!confirm("Leave this team?")) return;
        const { error } = await sb.rpc("leave_team", { p_event: EVENT });
        if (error) return setMsg(friendly(error));
        load();
      });

      // The saved image is private, so it is shown through a short-lived signed link.
      const showImage = async () => {
        const img = panel.querySelector("#hk-preview"), note = panel.querySelector("#hk-preview-note");
        if (!img || !t.jury_image_path) return;
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(t.jury_image_path, 3600);
        if (error || !data) { note.textContent = "The image could not be loaded."; return; }
        img.src = data.signedUrl; img.hidden = false; note.hidden = true;
      };
      showImage();

      const lk = panel.querySelector("#hk-lock");
      if (lk) lk.addEventListener("change", async () => {
        lk.disabled = true;
        const { error } = await sb.rpc("lock_team", { p_locked: lk.checked, p_event: EVENT });
        await load();
        if (error) setMsg(friendly(error));
      });

      const idea = panel.querySelector("#hk-idea");
      if (idea) {
        const saveIdea = () => sb.rpc("save_idea", { p_problem: idea.problem.value, p_idea: idea.idea.value, p_event: EVENT });
        idea.addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = idea.querySelector("button[type=submit]"), label = btn.textContent;
          busy(btn, true, label);
          const { error } = await saveIdea();
          if (error) { msgIn(idea, friendly(error)); busy(btn, false, label); return; }
          await load();
          flash("#hk-idea", "Draft saved. Confirm it when you are happy with it.");
        });
        idea.querySelector("#hk-idea-confirm").addEventListener("click", async (e) => {
          const btn = e.currentTarget, label = btn.textContent;
          if (!idea.reportValidity()) return;
          if (!confirm("Confirm your problem statement and idea? You cannot change them after this.")) return;
          busy(btn, true, label);
          const saved = await saveIdea();
          if (saved.error) { msgIn(idea, friendly(saved.error)); busy(btn, false, label); return; }
          const { error } = await sb.rpc("confirm_idea", { p_event: EVENT });
          if (error) { msgIn(idea, friendly(error)); busy(btn, false, label); return; }
          await load();
        });
      }

      const assets = panel.querySelector("#hk-assets");
      if (assets) {
        const file = assets.querySelector("input[name=image]");
        const showLocal = (f) => {
          const box = assets.querySelector("#hk-imgbox"), img = assets.querySelector("#hk-preview"), note = assets.querySelector("#hk-preview-note");
          box.hidden = false; img.src = URL.createObjectURL(f); img.hidden = false; note.hidden = true;
        };
        file.addEventListener("change", async () => {
          const f = file.files && file.files[0];
          if (!f) return;
          const stop = (m) => { file.value = ""; msgIn(assets, m); };
          if (!IMG_TYPES.includes(f.type)) return stop("Use a PNG, JPG or WebP image.");
          if (f.size > MAX_IMG) return stop(`That image is ${(f.size / 1048576).toFixed(1)} MB. The limit is 15 MB.`);
          try { const bmp = await createImageBitmap(f); if (bmp.close) bmp.close(); } catch { return stop("That file is not a readable image."); }
          msgIn(assets, "Uploading the image...", "ok");
          const { error } = await sb.storage.from(BUCKET).upload(`${t.id}/jury-image`, f, { upsert: true, contentType: f.type });
          if (error) return stop(/size|exceed/i.test(error.message) ? "That image is too big. The limit is 15 MB." : friendly(error));
          state.uploadedFor = t.id;
          showLocal(f);
          msgIn(assets, "Image uploaded. Add the two links below and press Submit.", "ok");
        });
        assets.addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = assets.querySelector("button[type=submit]"), label = btn.textContent;
          if (!t.jury_image_path && state.uploadedFor !== t.id) return msgIn(assets, "Upload your image first.");
          if (!RX.gemini.test(assets.gemini.value.trim())) return msgIn(assets, "Paste the share link of the Gemini chat (it starts with https://gemini.google.com/).");
          if (!RX.slides.test(assets.slides.value.trim())) return msgIn(assets, "Paste a Google Slides link (it starts with https://docs.google.com/presentation/d/).");
          busy(btn, true, label);
          const { error } = await sb.rpc("save_assets", { p_image_path: `${t.id}/jury-image`, p_gemini: assets.gemini.value, p_slides: assets.slides.value, p_event: EVENT });
          if (error) { msgIn(assets, friendly(error)); busy(btn, false, label); return; }
          await load();
          flash("#hk-assets", "Submitted. Press Lock this stage when you are sure.");
        });
        assets.querySelector("#hk-assets-lock").addEventListener("click", async (e) => {
          const btn = e.currentTarget, label = btn.textContent;
          if (!confirm("Lock the image and links? You cannot change them after this.")) return;
          busy(btn, true, label);
          const { error } = await sb.rpc("lock_assets", { p_event: EVENT });
          if (error) { msgIn(assets, friendly(error)); busy(btn, false, label); return; }
          await load();
        });
      }

      const fin = panel.querySelector("#hk-final");
      if (fin) fin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = fin.querySelector("button[type=submit]"), label = btn.textContent;
        if (!RX.github.test(fin.github.value.trim())) return msgIn(fin, "The GitHub link must look like https://github.com/your-name/your-repo");
        if (!RX.live.test(fin.live.value.trim())) return msgIn(fin, "The live website link must start with https://");
        busy(btn, true, label);
        const { error } = await sb.rpc("save_final_links", { p_github: fin.github.value, p_live: fin.live.value, p_event: EVENT });
        if (error) { msgIn(fin, friendly(error)); busy(btn, false, label); return; }
        await load();
        flash("#hk-final", "Links submitted. Keep both working until the jury has checked them.");
      });
    }

    const reveal = () => panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    const open = async () => {
      panel.hidden = false;
      openBtn.setAttribute("aria-expanded", "true");
      openBtn.textContent = cfg.closeLabel;
      if (!panel.dataset.loaded) { panel.dataset.loaded = "1"; await load(); }
      reveal();
    };
    openBtn.addEventListener("click", () => {
      if (panel.hidden) open();
      else { panel.hidden = true; openBtn.setAttribute("aria-expanded", "false"); openBtn.textContent = cfg.openLabel; }
    });
    // Coming back from login, or following a #hackathon / #local2global link, opens the flow straight away.
    if (location.hash === `#${cfg.root}`) open();
  }

  EVENTS.forEach(setup);
})();
