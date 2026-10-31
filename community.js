// Community page: organizers and the sponsor / call for speakers actions.
(() => {
  const host = document.getElementById("people");
  if (host) FEED.renderTeam(host);
})();

// Call for speakers and sponsor micro-actions
(() => {
  const cfp = document.getElementById("cfp-link");
  if (EVENT.cfpUrl) {
    cfp.href = EVENT.cfpUrl;
    document.getElementById("cfp-text").textContent = "Applications are open. Share what you've built.";
    document.getElementById("cfp-go").textContent = "Submit a talk";
  }
  const dlg = document.getElementById("sponsor-dlg");
  document.getElementById("sponsor-open").addEventListener("click", () => {
    if (EVENT.deckUrl) {
      const a = document.getElementById("deck-link");
      a.href = EVENT.deckUrl;
      a.textContent = "Download the sponsorship deck";
      document.getElementById("deck-note").textContent = "Questions? Reach the organizers through the chapter page.";
    }
    dlg.showModal();
  });
  document.querySelectorAll("dialog.dlg").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
})();
