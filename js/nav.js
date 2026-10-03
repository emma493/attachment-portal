// Shared mobile drawer nav (index.html + sysadmin.html). No dependencies.
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

// Staff Sign in / Sign up tabs (sysadmin.html). Classic script on purpose:
// the Firebase module can fail to boot (offline, blocked CDN, file://),
// and the tabs must still switch. Whichever script runs first wires the
// buttons (guarded by window.__adminTabsWired); both share window.__adminTab.
(function () {
  var tabLogin = document.getElementById("tab-login");
  var tabSignup = document.getElementById("tab-signup");
  var loginForm = document.getElementById("login-form");
  var signupForm = document.getElementById("signup-form");

  if (tabLogin && tabSignup) {
    const show = function (which) {
      var login = which !== "signup";
      if (loginForm) loginForm.hidden = !login;
      if (signupForm) signupForm.hidden = login;
      tabLogin.classList.toggle("active", login);
      tabSignup.classList.toggle("active", !login);
      tabLogin.setAttribute("aria-selected", String(login));
      tabSignup.setAttribute("aria-selected", String(!login));
    };
    if (!window.__adminTab) window.__adminTab = show;

    if (!window.__adminTabsWired) {
      window.__adminTabsWired = true;
      tabLogin.addEventListener("click", function () { show("login"); });
      tabSignup.addEventListener("click", function () { show("signup"); });
    }
  }

  // Fallback: if the Firebase module never boots (offline, blocked CDN,
  // file://), stop the forms from doing a dead page reload and explain
  // inline on the form itself.
  function offlineGuard(formId, errId) {
    var form = document.getElementById(formId);
    if (!form || form.__offlineGuard) return;
    form.__offlineGuard = true;
    form.addEventListener("submit", function (e) {
      if (!window.__sysadminReady) {
        e.preventDefault();
        var err = document.getElementById(errId);
        if (err) {
          err.textContent = "Sign-in isn't available right now — check your connection and reload the page.";
          err.hidden = false;
        }
      }
    });
  }
  offlineGuard("login-form", "login-error");
  offlineGuard("signup-form", "signup-error");
})();
