// Shared mobile drawer nav (index.html + admin.html). No dependencies.
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("main-nav");
  var scrim = document.querySelector(".nav-scrim");
  if (!toggle || !nav) return;

  function open() {
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
    if (scrim) scrim.hidden = false;
  }
  function close() {
    document.body.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    if (scrim) scrim.hidden = true;
    toggle.focus({ preventScroll: true });
  }
  function isOpen() {
    return document.body.classList.contains("nav-open");
  }

  toggle.addEventListener("click", function () {
    if (isOpen()) close();
    else open();
  });
  if (scrim) scrim.addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) close();
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a") && isOpen()) close();
  });
})();
