// Login and signup, backed by Supabase Auth (email + password).
(() => {
  const form = document.getElementById("auth-form");
  if (!form) return;
  const mode = form.dataset.mode; // "login" | "signup"
  const msg = document.getElementById("auth-msg");
  const submit = form.querySelector("button[type=submit]");
  // Where to go after logging in: ?next=page.html#section (same-site relative paths only).
  const NEXT = new URLSearchParams(location.search).get("next");
  const HOME = NEXT && /^[\w][\w./-]*(#[\w-]*)?$/.test(NEXT) && !NEXT.includes("..") ? NEXT : "index.html";
  // Keep ?next on the link between the login and signup pages.
  if (NEXT) document.querySelectorAll(".auth-alt a").forEach((l) => { l.href += location.search; });

  const say = (text, kind = "error") => {
    msg.textContent = text;
    msg.className = `auth-msg is-${kind}`;
    msg.hidden = !text;
  };

  if (!SUPABASE.url || !SUPABASE.anonKey || !window.supabase) {
    say("Sign in isn't connected yet. Add your Supabase URL and anon key to supabase-config.js.", "warn");
    submit.disabled = true;
    return;
  }
  const db = window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey);
  const redirectTo = new URL(HOME, location.href).href;

  // Already signed in? Skip the form.
  db.auth.getSession().then(({ data }) => {
    if (!data.session) return;
    form.hidden = true;
    const note = document.createElement("div");
    note.className = "auth-done";
    note.innerHTML = `<p class="auth-msg is-ok"></p><div class="cta"><a class="btn" href="${HOME}">Continue</a><button class="btn btn-ghost" type="button">Log out</button></div>`;
    note.querySelector(".auth-msg").textContent = `You're already logged in as ${data.session.user.email}.`;
    note.querySelector("button").addEventListener("click", async () => { await db.auth.signOut(); location.reload(); });
    form.after(note);
    const alt = document.querySelector(".auth-alt");
    if (alt) alt.hidden = true;
  });

  const busy = (on) => {
    submit.dataset.label = submit.dataset.label || submit.textContent;
    submit.disabled = on;
    submit.textContent = on ? "Please wait..." : submit.dataset.label;
  };
  const friendly = (err) => {
    const m = (err && err.message) || "Something went wrong. Please try again.";
    if (/invalid login credentials/i.test(m)) return "That email and password don't match.";
    if (/email not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for the link.";
    if (/already registered/i.test(m)) return "An account with this email already exists. Try logging in.";
    return m;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    say("");
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return say("Enter your email and password.");
    if (mode === "signup") {
      if (password.length < 8) return say("Use at least 8 characters for your password.");
      if (password !== form.confirm.value) return say("The two passwords don't match.");
    }
    busy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await db.auth.signUp({
          email, password,
          options: { data: { full_name: form.name.value.trim() }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        // Supabase hides duplicate emails by returning a user with no identities.
        if (data.user && data.user.identities && !data.user.identities.length) throw new Error("already registered");
        if (data.session) { location.replace(HOME); return; }
        form.reset();
        say("Almost there. We sent a confirmation link to your email. Open it to finish creating your account.", "ok");
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.replace(HOME);
        return;
      }
    } catch (err) {
      say(friendly(err));
    }
    busy(false);
  });

  const forgot = document.getElementById("forgot");
  if (forgot) forgot.addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) return say("Type your email above, then press Forgot password again.");
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
    say(error ? friendly(error) : "If that email has an account, a reset link is on its way.", error ? "error" : "ok");
  });
})();
