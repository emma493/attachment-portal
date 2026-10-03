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
    schoolLetter: 2, cv: 2, ghanaCard: 2,
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
      Object.keys(FILE_LABELS).forEach(function (key) {
        if (!validFile(fileOf(key))) errs.push({ field: key, msg: FILE_LABELS[key] + " must be PDF, JPG or PNG under " + MAX_FILE_MB + "MB" });
      });
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
    var rows = [
      ["Full name", field("fullName")],
      ["Phone", field("phone")],
      ["Email", field("email")],
      ["School", field("school")],
      ["Course", field("course")],
      ["Company", field("company")],
      ["Start date", fmtDate(field("startDate"))],
      ["End date", fmtDate(field("endDate"))],
    ];
    Object.keys(FILE_LABELS).forEach(function (key) {
      var f = fileOf(key);
      rows.push([FILE_LABELS[key], f ? f.name + " (" + (f.size / 1048576).toFixed(2) + " MB)" : "Missing"]);
    });
    reviewList.innerHTML = rows.map(function () { return "<div><dt></dt><dd></dd></div>"; }).join("");
    reviewList.querySelectorAll("div").forEach(function (div, i) {
      div.firstElementChild.textContent = rows[i][0];
      div.lastElementChild.textContent = rows[i][1];
    });
  }

  function showStep(n) {
    currentStep = Math.max(0, Math.min(TOTAL - 1, n));
    maxVisited = Math.max(maxVisited, currentStep);
    steps.forEach(function (s, i) { s.hidden = i !== currentStep; });
    if (stepCount) stepCount.textContent = "Step " + (currentStep + 1) + " of " + TOTAL;
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
    var h = steps[currentStep].querySelector("h2");
    if (h && h.focus) h.focus({ preventScroll: true });
    steps[currentStep].scrollIntoView();
  }
  function getStep() { return currentStep; }
  function getTotal() { return TOTAL; }

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

  window.__wizard = {
    field: field, fileOf: fileOf, stepErrors: stepErrors,
    showErrors: showErrors, clearErrors: clearErrors,
    showStep: showStep, getStep: getStep, getTotal: getTotal,
    clearAllPickers: clearAllPickers, MAX_FILE_MB: MAX_FILE_MB,
  };
  window.__wizardReady = true;
})();
