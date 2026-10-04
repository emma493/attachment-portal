// Wizard UI — classic script, zero imports, runs on file:// and http.
// Owns: paging, per-step validation, error summary, review screen,
// advanced file picker, success-again. Submit/upload stays in student-form.js
// (module) which reuses these helpers via window.__wizard.
(function () {
  "use strict";

  // Keep in sync with js/firebase-config.js (duplicated here so this file
  // has no module imports and works even when the Firebase CDN is blocked).
  var MAX_FILE_MB = 5;
  var ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];

  var form = document.getElementById("submission-form");
  var status = document.getElementById("form-status");
  if (!form) return;

  var steps = Array.from(document.querySelectorAll(".wizard-step"));
  var stepCount = document.getElementById("step-count");
  var backBtn = document.getElementById("step-back");
  var nextBtn = document.getElementById("step-next");
  var submitBtnWizard = document.getElementById("step-submit");
  var progressBtns = Array.from(document.querySelectorAll(".wizard-progress [data-goto]"));
  var reviewList = document.getElementById("review-list");
  var TOTAL = steps.length || 1;
  var FILE_LABELS = { schoolLetter: "School letter", cv: "CV", ghanaCard: "Ghana Card" };
  var currentStep = 0;
  var maxVisited = 0;

  function field(name) {
    var el = form.elements.namedItem(name);
    var v = el && "value" in el ? el.value : "";
    return v ? v.toString().trim() : "";
  }
  function fileOf(name) {
    var el = form.elements.namedItem(name);
    return el && el.files && el.files[0] ? el.files[0] : null;
  }
  var errorSummary = document.getElementById("error-summary");
  var errorList = document.getElementById("error-list");
  var STEP_OF = {
    fullName: 0, phone: 0, email: 0,
    school: 1, course: 1, company: 1, startDate: 1, endDate: 1,
    schoolLetter: 2, cv: 2, ghanaCard: 2, consent: 3,
  };

  function clearErrors() {
    if (errorSummary) errorSummary.hidden = true;
    if (errorList) errorList.innerHTML = "";
    document.querySelectorAll(".field.has-error, .file-picker.has-error").forEach(function (w) { w.classList.remove("has-error"); });
    document.querySelectorAll(".field-error").forEach(function (p) { p.hidden = true; p.textContent = ""; });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
    if (status) { status.textContent = ""; status.className = ""; }
  }

  function showErrors(errors) {
    clearErrors();
    if (!errors.length) return true;
    errors.forEach(function (e) {
      if (e.field === "consent") {
        var cMsg = document.getElementById("err-consent");
        if (cMsg) { cMsg.textContent = e.msg; cMsg.hidden = false; }
        if (errorList) {
          var liC = document.createElement("li");
          var aC = document.createElement("a");
          aC.href = "#consent-check";
          aC.textContent = e.msg;
          liC.appendChild(aC);
          errorList.appendChild(liC);
        }
        var cc = document.getElementById("consent-check");
        if (cc && "setAttribute" in cc) cc.setAttribute("aria-invalid", "true");
        return;
      }
      var wrap = document.getElementById("f-" + e.field);
      var msgEl = document.getElementById("err-" + e.field);
      if (wrap) wrap.classList.add("has-error");
      if (msgEl) { msgEl.textContent = e.msg; msgEl.hidden = false; }
      var input = form.elements.namedItem(e.field);
      if (input && "setAttribute" in input) input.setAttribute("aria-invalid", "true");
      if (errorList) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = "#f-" + e.field;
        a.textContent = e.msg;
        li.appendChild(a);
        errorList.appendChild(li);
      }
    });
    var firstStep = STEP_OF[errors[0].field];
    if (typeof firstStep === "number" && firstStep !== currentStep) showStep(firstStep);
    if (errorSummary) {
      errorSummary.hidden = false;
      if (errorSummary.focus) errorSummary.focus({ preventScroll: true });
      errorSummary.scrollIntoView();
    }
    if (status) { status.textContent = "Fix the problems above, then continue."; status.className = "error"; }
    return false;
  }

  function validEmail(v) {
    return /^\S+@\S+\.\S+$/.test(v);
  }
  function validGhanaPhone(phone) {
    var digits = phone.replace(/[\s-]/g, "");
    return /^(0\d{9}|\+233\d{9}|233\d{9})$/.test(digits);
  }
  function validFile(f) {
    if (!f) return false;
    if (ALLOWED_TYPES.indexOf(f.type) === -1) return false;
    if (f.size > MAX_FILE_MB * 1024 * 1024) return false;
    return true;
  }

  function stepErrors(n) {
    var errs = [];
    if (n === 0) {
      if (field("fullName").length < 2) errs.push({ field: "fullName", msg: "Enter your full name" });
      if (!validGhanaPhone(field("phone"))) errs.push({ field: "phone", msg: "Enter a valid Ghana phone, like 0241234567" });
      if (!validEmail(field("email"))) errs.push({ field: "email", msg: "Enter a valid email address" });
    }
    if (n === 1) {
      if (!field("school")) errs.push({ field: "school", msg: "Enter your school" });
      if (!field("course")) errs.push({ field: "course", msg: "Enter your course" });
      if (field("company").length < 2) errs.push({ field: "company", msg: "Type the company name" });
      if (!field("startDate")) errs.push({ field: "startDate", msg: "Pick a start date" });
      if (!field("endDate")) errs.push({ field: "endDate", msg: "Pick an end date" });
      else if (field("startDate") && new Date(field("endDate")) <= new Date(field("startDate")))
        errs.push({ field: "endDate", msg: "End date must be after start date" });
    }
    if (n === 2) {
      ["schoolLetter", "ghanaCard"].forEach(function (key) {
        if (!validFile(fileOf(key))) errs.push({ field: key, msg: FILE_LABELS[key] + " must be PDF, JPG or PNG under " + MAX_FILE_MB + "MB" });
      });
      var cvFile = fileOf("cv");
      if (cvFile && !validFile(cvFile)) errs.push({ field: "cv", msg: FILE_LABELS.cv + " must be PDF, JPG or PNG under " + MAX_FILE_MB + "MB" });
    }
    if (n === 3) {
      var consent = document.getElementById("consent-check");
      if (consent && !consent.checked) errs.push({ field: "consent", msg: "Tick the confirmation box to submit" });
    }
    return errs;
  }

  function fmtDate(iso) {
    // Prefer the datepicker's formatter when loaded; fall back to raw value.
    if (window.__datepicker && window.__datepicker.friendly) {
      return window.__datepicker.friendly(iso) || iso;
    }
    return iso;
  }

  function renderReview() {
    if (!reviewList) return;
    var personal = [
      ["Full name", field("fullName")],
      ["Phone", field("phone")],
      ["Email", field("email")],
    ];
    var school = [
      ["School", field("school")],
      ["Course", field("course")],
      ["Company", field("company")],
      ["Start date", fmtDate(field("startDate"))],
      ["End date", fmtDate(field("endDate"))],
    ];
    var docs = Object.keys(FILE_LABELS).map(function (key) {
      var f = fileOf(key);
      if (f) return [FILE_LABELS[key], f.name + " (" + (f.size / 1048576).toFixed(2) + " MB)"];
      return [FILE_LABELS[key], key === "cv" ? "Not provided (optional)" : "Missing"];
    });
    function group(title, rows, step) {
      var inner = rows.map(function (r) {
        return "<div><dt>" + escapeHtml(r[0]) + "</dt><dd>" + escapeHtml(r[1] || "—") + "</dd></div>";
      }).join("");
      return '<section class="review-group"><h3>' + escapeHtml(title) +
        '<button type="button" data-edit="' + step + '">Edit</button></h3>' +
        '<div class="review-rows">' + inner + "</div></section>";
    }
    reviewList.innerHTML = group("Personal", personal, 0) + group("School & placement", school, 1) + group("Documents", docs, 2);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function updateDuration() {
    var hint = document.getElementById("duration-hint");
    if (!hint) return;
    var s = field("startDate"), e = field("endDate");
    if (s && e && new Date(e) > new Date(s)) {
      var days = Math.round((new Date(e) - new Date(s)) / 86400000);
      var weeks = Math.round(days / 7 * 10) / 10;
      hint.hidden = false;
      hint.textContent = "Duration: " + days + " days (~" + weeks + " weeks).";
    } else if (s || e) {
      hint.hidden = false;
      hint.textContent = "Pick both dates — end must be after start.";
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }

  function showStep(n) {
    currentStep = Math.max(0, Math.min(TOTAL - 1, n));
    maxVisited = Math.max(maxVisited, currentStep);
    steps.forEach(function (s, i) { s.hidden = i !== currentStep; });
    var NAMES = ["Personal", "School", "Documents", "Review"];
    var ETAS = ["~2 min left", "~2 min left", "~1 min left", "Almost done"];
    if (stepCount) stepCount.textContent = "Step " + (currentStep + 1) + " of " + TOTAL + " — " + (NAMES[currentStep] || "");
    var eta = document.getElementById("step-eta");
    if (eta) eta.textContent = ETAS[currentStep] || "";
    var fill = document.getElementById("progress-fill");
    if (fill) fill.style.width = ((currentStep + 1) / TOTAL * 100) + "%";
    var navMeta = document.getElementById("nav-meta-text");
    if (navMeta) navMeta.textContent = "Step " + (currentStep + 1) + " of " + TOTAL + " · " + (ETAS[currentStep] || "");
    progressBtns.forEach(function (b) {
      var t = Number(b.dataset.goto);
      var li = b.closest("li");
      if (t === currentStep) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      if (li) {
        li.classList.toggle("done", t < currentStep);
        li.classList.toggle("locked", t > maxVisited);
      }
    });
    var last = currentStep === TOTAL - 1;
    if (backBtn) backBtn.hidden = currentStep === 0;
    if (nextBtn) nextBtn.hidden = last;
    if (submitBtnWizard) submitBtnWizard.hidden = !last;
    if (last) renderReview();
    updateDuration();
    var h = steps[currentStep].querySelector("h2");
    if (h && h.focus) h.focus({ preventScroll: true });
    steps[currentStep].scrollIntoView({ block: "start" });
  }
  function getStep() { return currentStep; }
  function getTotal() { return TOTAL; }

  // Review Edit buttons (delegated — review is re-rendered)
  if (reviewList) reviewList.addEventListener("click", function (e) {
    var b = e.target.closest("[data-edit]");
    if (!b) return;
    clearErrors();
    showStep(Number(b.getAttribute("data-edit")));
  });

  // Live valid ticks + duration updates on typing
  form.addEventListener("input", function (e) {
    var input = e.target;
    if (!input || !input.name) return;
    var wrap = document.getElementById("f-" + input.name);
    if (!wrap) return;
    var v = (input.value || "").trim();
    var ok = v.length > 0;
    if (input.name === "email") ok = /^\S+@\S+\.\S+$/.test(v);
    if (input.name === "phone") ok = /^(0\d{9}|\+233\d{9}|233\d{9})$/.test(v.replace(/[\s-]/g, ""));
    if (input.name === "fullName" || input.name === "company") ok = v.length >= 2;
    wrap.classList.toggle("has-valid", ok);
    if (ok) {
      var msg = document.getElementById("err-" + input.name);
      if (msg && !msg.hidden && msg.textContent) { /* keep until Continue */ }
    }
    saveDraftSoon();
  });
  form.addEventListener("change", function () { updateDuration(); saveDraftSoon(); });

  if (backBtn) backBtn.addEventListener("click", function () {
    clearErrors();
    showStep(currentStep - 1);
  });
  if (nextBtn) nextBtn.addEventListener("click", function () {
    if (showErrors(stepErrors(currentStep))) showStep(currentStep + 1);
  });
  progressBtns.forEach(function (b) { b.addEventListener("click", function () {
    var t = Number(b.dataset.goto);
    if (t <= maxVisited) {
      clearErrors();
      showStep(t);
    } else {
      var fallback = (steps[currentStep].querySelector("input, select") || {}).name || "fullName";
      showErrors([{ field: fallback, msg: "Finish this step first" }]);
    }
  }); });
  if (steps.length) showStep(0);

  if (errorList) errorList.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    var fname = a && a.getAttribute("href") ? a.getAttribute("href").replace("#f-", "") : "";
    var st = fname ? STEP_OF[fname] : undefined;
    if (typeof st === "number" && st !== currentStep) {
      e.preventDefault();
      showStep(st);
      requestAnimationFrame(function () {
        var t = document.getElementById("f-" + fname);
        if (t) t.scrollIntoView();
      });
    }
  });

  var againBtn = document.getElementById("success-again");
  if (againBtn) againBtn.addEventListener("click", function () {
    var panel = document.getElementById("success-panel");
    if (panel) panel.hidden = true;
    form.hidden = false;
    clearErrors();
    showStep(0);
  });

  // --- Advanced file picker: instant local preview, View, Remove, drag & drop ---
  var objectUrls = new Map();
  function revokeUrl(name) {
    var u = objectUrls.get(name);
    if (u) { URL.revokeObjectURL(u); objectUrls.delete(name); }
  }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  }
  function renderPreview(picker) {
    var name = picker.dataset.field;
    var input = picker.querySelector('input[type="file"]');
    var empty = picker.querySelector(".fp-empty");
    var preview = picker.querySelector(".fp-preview");
    var img = picker.querySelector("img.fp-thumb");
    var badge = picker.querySelector(".fp-badge");
    var metaName = picker.querySelector(".fp-meta strong");
    var view = picker.querySelector(".fp-view");
    var file = input && input.files ? input.files[0] : null;
    revokeUrl(name);
    if (!file) {
      if (empty) empty.hidden = false;
      if (preview) preview.hidden = true;
      return;
    }
    var url = URL.createObjectURL(file);
    objectUrls.set(name, url);
    var isImage = file.type.indexOf("image/") === 0;
    if (img) {
      if (isImage) { img.src = url; img.alt = FILE_LABELS[name] + " preview"; img.hidden = false; }
      else { img.removeAttribute("src"); img.hidden = true; }
    }
    if (badge) badge.hidden = isImage;
    if (metaName) metaName.textContent = file.name + " · " + fmtSize(file.size);
    if (view) view.href = url;
    if (empty) empty.hidden = true;
    if (preview) preview.hidden = false;
    picker.classList.remove("has-error");
    var msgEl = document.getElementById("err-" + name);
    if (msgEl) { msgEl.hidden = true; msgEl.textContent = ""; }
  }
  function clearPicker(picker) {
    var input = picker.querySelector('input[type="file"]');
    if (input) input.value = "";
    renderPreview(picker);
  }
  function clearAllPickers() {
    document.querySelectorAll(".file-picker").forEach(clearPicker);
  }

  document.querySelectorAll(".file-picker").forEach(function (picker) {
    var name = picker.dataset.field;
    var zone = picker.querySelector(".fp-zone");
    var input = picker.querySelector('input[type="file"]');
    var view = picker.querySelector(".fp-view");
    var remove = picker.querySelector(".fp-remove");
    if (input) input.addEventListener("change", function () {
      var f = input.files ? input.files[0] : null;
      if (f && ALLOWED_TYPES.indexOf(f.type) === -1) {
        input.value = "";
        renderPreview(picker);
        showErrors([{ field: name, msg: FILE_LABELS[name] + " must be PDF, JPG or PNG (that file is " + (f.type || "an unsupported type") + ")" }]);
        return;
      }
      if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
        input.value = "";
        renderPreview(picker);
        showErrors([{ field: name, msg: FILE_LABELS[name] + " is " + fmtSize(f.size) + " — max is " + MAX_FILE_MB + "MB" }]);
        return;
      }
      renderPreview(picker);
      clearErrors();
    });
    if (view) {
      view.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
      view.addEventListener("click", function () { window.open(view.href, "_blank", "noopener"); });
    }
    if (remove) {
      remove.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); clearPicker(picker); });
      remove.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); });
    }
    ["dragenter", "dragover"].forEach(function (ev) { if (zone) zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("dragover"); }); });
    ["dragleave", "drop"].forEach(function (ev) { if (zone) zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("dragover"); }); });
    if (zone) zone.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
      if (f && input) {
        try {
          var dt = new DataTransfer();
          dt.items.add(f);
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (err) {
          showErrors([{ field: name, msg: FILE_LABELS[name] + ": your browser blocked drag & drop — tap to choose the file instead" }]);
        }
      }
    });
  });

  // Fallback: if the Firebase module (submit) never loads — e.g. file://,
  // blocked CDN, no network — explain on submit instead of dead silence.
  form.addEventListener("submit", function (e) {
    if (window.__submitReady) return; // module submit will handle it
    // Enter key on an early step: advance instead of submitting
    if (getStep() < getTotal() - 1) {
      e.preventDefault();
      if (showErrors(stepErrors(getStep()))) showStep(getStep() + 1);
      return;
    }
    // On the last step without the module: can't upload/save.
    e.preventDefault();
    var st = document.getElementById("form-status");
    if (st) {
      st.textContent = "This page was opened as a file (file://), so submitting is disabled. Serve it over http (e.g. VS Code Live Server or `npx serve`) or use the hosted Netlify URL to submit.";
      st.className = "error";
    }
  });

  // "What is this?" helper — swap sub-copy with the tip on click
  document.querySelectorAll(".fp-what").forEach(function (btn) {
    var tip = btn.getAttribute("data-tip") || "";
    btn.setAttribute("title", tip);
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var picker = btn.closest(".file-picker");
      var sub = picker ? picker.querySelector(".fp-sub") : null;
      if (!sub) return;
      if (sub.dataset.orig === undefined) sub.dataset.orig = sub.textContent;
      var showing = sub.dataset.showing === "1";
      sub.textContent = showing ? sub.dataset.orig : tip;
      sub.dataset.showing = showing ? "0" : "1";
      btn.textContent = showing ? "What is this?" : "Got it";
    });
  });

  // --- Save draft to localStorage (text fields only, never files) ---
  var DRAFT_KEY = "dvla-draft-v1";
  var draftTimer = null;
  function collectDraft() {
    return {
      fullName: field("fullName"), phone: field("phone"), email: field("email"),
      school: field("school"), course: field("course"), company: field("company"),
      startDate: field("startDate"), endDate: field("endDate"),
      step: getStep(), at: Date.now(),
    };
  }
  function saveDraftSoon() {
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try {
        var d = collectDraft();
        if (d.fullName || d.phone || d.email || d.school) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
          var chip = document.getElementById("draft-chip");
          if (chip) chip.hidden = false;
        }
      } catch (err) { /* private mode */ }
    }, 600);
  }
  function restoreDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      ["fullName", "phone", "email", "school", "course", "company"].forEach(function (n) {
        var el = form.elements.namedItem(n);
        if (el && d[n]) el.value = d[n];
      });
      if (d.startDate || d.endDate) {
        var setVal = function (name, iso) {
          var h = form.elements.namedItem(name);
          if (h) h.value = iso || "";
          var trigger = document.querySelector('.dp-trigger[data-target="' + name + '"]');
          var label = trigger ? trigger.querySelector(".dp-value") : null;
          if (label && window.__datepicker && window.__datepicker.friendly) {
            if (iso) { label.textContent = window.__datepicker.friendly(iso); label.classList.remove("is-placeholder"); }
            else { label.textContent = "Pick a date"; label.classList.add("is-placeholder"); }
          }
        };
        setVal("startDate", d.startDate); setVal("endDate", d.endDate);
      }
      updateDuration();
      return true;
    } catch (err) { return false; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (err) { /* noop */ }
    var chip = document.getElementById("draft-chip");
    if (chip) chip.hidden = true;
  }
  var saveBtn = document.getElementById("save-draft");
  if (saveBtn) saveBtn.addEventListener("click", function () {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
      var chip = document.getElementById("draft-chip");
      if (chip) chip.hidden = false;
      if (status) { status.textContent = "Draft saved on this device."; status.className = "ok"; setTimeout(function () { if (status.className === "ok") { status.textContent = ""; status.className = ""; } }, 2500); }
    } catch (err) { /* noop */ }
  });
  var resumeBtn = document.getElementById("resume-draft");
  if (resumeBtn) resumeBtn.addEventListener("click", function () {
    if (restoreDraft() && status) { status.textContent = "Draft restored."; status.className = "ok"; }
  });
  var clearDraftBtn = document.getElementById("clear-draft");
  if (clearDraftBtn) clearDraftBtn.addEventListener("click", clearDraft);
  try {
    if (localStorage.getItem(DRAFT_KEY)) {
      var chip0 = document.getElementById("draft-chip");
      if (chip0) chip0.hidden = false;
      restoreDraft();
    }
  } catch (err) { /* noop */ }

  // Copy reference button
  var copyBtn = document.getElementById("copy-ref");
  if (copyBtn) copyBtn.addEventListener("click", function () {
    var ref = document.getElementById("success-ref");
    var txt = ref ? ref.textContent : "";
    function done() { copyBtn.textContent = "Copied!"; setTimeout(function () { copyBtn.textContent = "Copy"; }, 2000); }
    if (navigator.clipboard && txt) navigator.clipboard.writeText(txt).then(done, done);
    else {
      try {
        var ta = document.createElement("textarea");
        ta.value = txt; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta);
      } catch (err) { /* noop */ }
      done();
    }
  });

  window.__wizard = {
    field: field, fileOf: fileOf, stepErrors: stepErrors,
    showErrors: showErrors, clearErrors: clearErrors,
    showStep: showStep, getStep: getStep, getTotal: getTotal,
    clearAllPickers: clearAllPickers, MAX_FILE_MB: MAX_FILE_MB,
    updateDuration: updateDuration, clearDraft: clearDraft, restoreDraft: restoreDraft,
  };
  window.__wizardReady = true;
})();
