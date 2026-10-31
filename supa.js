// Shared Supabase client (sb) plus the signed-in state of the nav: "Log in" becomes "Log out",
// and approved admins also get an "Admin" link. Load after supabase-config.js and the supabase-js script.
const sb = SUPABASE.url && SUPABASE.anonKey && window.supabase
  ? window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey)
  : null;

(async () => {
  const login = document.querySelector('#menu a[href$="login.html"]');
  if (!sb || !login) return;
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  const base = login.getAttribute("href").replace(/login\.html$/, "");
  login.textContent = "Log out";
  login.href = "#";
  login.addEventListener("click", async (e) => {
    e.preventDefault();
    await sb.auth.signOut();
    location.href = base + "index.html";
  });
  const { data: isAdmin } = await sb.rpc("is_admin");
  if (isAdmin === true) {
    const a = document.createElement("a");
    a.href = `${base}admin.html`;
    a.textContent = "Admin";
    if (/admin\.html$/.test(location.pathname)) a.setAttribute("aria-current", "page");
    login.before(a);
  }
})();
