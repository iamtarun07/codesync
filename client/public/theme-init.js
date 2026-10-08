// Applied before first paint so the app never flashes the wrong theme.
// Dark is the default — this design is dark-first. A separate file (not an
// inline script) so the Content-Security-Policy can forbid inline scripts.
(function () {
  var stored = null;
  try {
    stored = localStorage.getItem('codesync-theme');
  } catch {
    /* storage blocked — keep the default */
  }
  document.documentElement.classList.toggle('dark', stored !== 'light');
})();
