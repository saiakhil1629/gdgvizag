// Keeps the DevFest pages in step with the chapter feed: if a DevFest is live or upcoming,
// its date and venue unlock the agenda calendar export and the Ask DevFest answers.
(async () => {
  const { events } = await FEED.events();
  const devfests = events.filter((e) => e.cat === "DevFest" && !/core committee/i.test(e.title));
  const { e } = FEED.focus(devfests);
  if (e) {
    EVENT.date = `${FEED.dayKey(e.start)}T09:00:00+05:30`;
    if (e.venue) EVENT.venue = e.venue;
    window.DEVFEST_NEXT = e;
  }
  document.dispatchEvent(new CustomEvent("devfest-ready"));
})();
