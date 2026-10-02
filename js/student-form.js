import { cloudinaryConfig, MAX_FILE_MB, ALLOWED_TYPES, db, isConfigured } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Flow: validate -> upload 3 files to Cloudinary -> addDoc(submissions) -> POST /.netlify/functions/send-email
const form = document.getElementById("submission-form");
const status = document.getElementById("form-status");
const progress = document.getElementById("upload-progress");

function validFile(f) {
  if (!f) return false;
  if (!ALLOWED_TYPES.includes(f.type)) return false;
  if (f.size > MAX_FILE_MB * 1024 * 1024) return false;
  return true;
}

function validGhanaPhone(phone) {
  // Accept 0241234567, +233241234567, 233241234567
  const digits = phone.replace(/[\s-]/g, "");
  return /^(0\d{9}|\+233\d{9}|233\d{9})$/.test(digits);
}

async function uploadToCloudinary(file) {
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", cloudinaryConfig.uploadPreset);
  fd.append("folder", "submissions/");
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
  const json = await res.json();
  return json.secure_url;
}

// --- Multi-step wizard (progressive enhancement: <noscript> style in
// index.html reveals all steps when JS is off) ---
const steps = Array.from(document.querySelectorAll(".wizard-step"));
const stepCount = document.getElementById("step-count");
const backBtn = document.getElementById("step-back");
const nextBtn = document.getElementById("step-next");
const submitBtnWizard = document.getElementById("step-submit");
const progressBtns = Array.from(document.querySelectorAll(".wizard-progress [data-goto]"));
const reviewList = document.getElementById("review-list");
const TOTAL = steps.length || 1;
const FILE_LABELS = { schoolLetter: "School letter", cv: "CV", ghanaCard: "Ghana Card" };
let currentStep = 0;
let maxVisited = 0;

function field(name) {
  const el = form?.elements.namedItem(name);
  const v = el && "value" in el ? el.value : "";
  return v ? v.toString().trim() : "";
}
function fileOf(name) {
  const el = form?.elements.namedItem(name);
  return el && el.files && el.files[0] ? el.files[0] : null;
}
const errorSummary = document.getElementById("error-summary");
const errorList = document.getElementById("error-list");
// Which step each field lives on (for jumping to the first problem)
const STEP_OF = {
  fullName: 0, phone: 0, email: 0,
  school: 1, course: 1, company: 1, startDate: 1, endDate: 1,
  schoolLetter: 2, cv: 2, ghanaCard: 2,
};

function clearErrors() {
  if (errorSummary) errorSummary.hidden = true;
  if (errorList) errorList.innerHTML = "";
  document.querySelectorAll(".field.has-error, .file-picker.has-error").forEach((w) => w.classList.remove("has-error"));
  document.querySelectorAll(".field-error").forEach((p) => { p.hidden = true; p.textContent = ""; });
  form?.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  status.textContent = "";
  status.className = "";
}

// errors are { field, msg }; inline messages use short text (no "Step N:" prefix)
function showErrors(errors) {
  clearErrors();
  if (!errors.length) return true;
  errors.forEach(({ field, msg }) => {
    const wrap = document.getElementById(`f-${field}`);
    const msgEl = document.getElementById(`err-${field}`);
    if (wrap) wrap.classList.add("has-error");
    if (msgEl) { msgEl.textContent = msg; msgEl.hidden = false; }
    const input = form?.elements.namedItem(field);
    if (input && "setAttribute" in input) input.setAttribute("aria-invalid", "true");
    if (errorList) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#f-${field}`;
      a.textContent = msg;
      li.appendChild(a);
      errorList.appendChild(li);
    }
  });
  // Jump to the step holding the first problem, then present the summary
  const firstStep = STEP_OF[errors[0].field];
  if (typeof firstStep === "number" && firstStep !== currentStep) showStep(firstStep);
  if (errorSummary) {
    errorSummary.hidden = false;
    errorSummary.focus({ preventScroll: true });
    errorSummary.scrollIntoView();
  }
  status.textContent = "Fix the problems above, then continue.";
  status.className = "error";
  return false;
}

function validEmail(v) {
  return /^\S+@\S+\.\S+$/.test(v);
}

// Collect this step's problems (empty array = valid)
function stepErrors(n) {
  const errs = [];
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
    for (const key of Object.keys(FILE_LABELS)) {
      if (!validFile(fileOf(key))) errs.push({ field: key, msg: `${FILE_LABELS[key]} must be PDF, JPG or PNG under ${MAX_FILE_MB}MB` });
    }
  }
  return errs;
}

function renderReview() {
  if (!reviewList) return;
  const rows = [
    ["Full name", field("fullName")],
    ["Phone", field("phone")],
    ["Email", field("email")],
    ["School", field("school")],
    ["Course", field("course")],
    ["Company", field("company")],
    ["Start date", field("startDate")],
    ["End date", field("endDate")],
  ];
  for (const key of Object.keys(FILE_LABELS)) {
    const f = fileOf(key);
    rows.push([FILE_LABELS[key], f ? `${f.name} (${(f.size / 1048576).toFixed(2)} MB)` : "Missing"]);
  }
  reviewList.innerHTML = rows.map(() => "<div><dt></dt><dd></dd></div>").join("");
  reviewList.querySelectorAll("div").forEach((div, i) => {
    div.firstElementChild.textContent = rows[i][0];
    div.lastElementChild.textContent = rows[i][1];
  });
}

function showStep(n) {
  currentStep = Math.max(0, Math.min(TOTAL - 1, n));
  maxVisited = Math.max(maxVisited, currentStep);
  steps.forEach((s, i) => { s.hidden = i !== currentStep; });
  if (stepCount) stepCount.textContent = `Step ${currentStep + 1} of ${TOTAL}`;
  progressBtns.forEach((b) => {
    const t = Number(b.dataset.goto);
    const li = b.closest("li");
    if (t === currentStep) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
    if (li) {
      li.classList.toggle("done", t < currentStep);
      li.classList.toggle("locked", t > maxVisited);
    }
  });
  const last = currentStep === TOTAL - 1;
  if (backBtn) backBtn.hidden = currentStep === 0;
  if (nextBtn) nextBtn.hidden = last;
  if (submitBtnWizard) submitBtnWizard.hidden = !last;
  if (last) renderReview();
  const h = steps[currentStep].querySelector("h2");
  if (h) h.focus({ preventScroll: true });
  steps[currentStep].scrollIntoView();
}

backBtn?.addEventListener("click", () => {
  clearErrors();
  showStep(currentStep - 1);
});
nextBtn?.addEventListener("click", () => {
  if (showErrors(stepErrors(currentStep))) showStep(currentStep + 1);
});
progressBtns.forEach((b) => b.addEventListener("click", () => {
  const t = Number(b.dataset.goto);
  if (t <= maxVisited) {
    clearErrors();
    showStep(t);
  } else {
    showErrors([{ field: steps[currentStep].querySelector("input, select")?.name || "fullName", msg: "Finish this step first" }]);
  }
}));
if (steps.length) showStep(0);

// Summary links: jump to the error's step first so the anchor target is visible
errorList?.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  const fname = a?.getAttribute("href")?.replace("#f-", "");
  const st = fname ? STEP_OF[fname] : undefined;
  if (typeof st === "number" && st !== currentStep) {
    e.preventDefault();
    showStep(st);
    requestAnimationFrame(() => document.getElementById(`f-${fname}`)?.scrollIntoView());
  }
});

document.getElementById("success-again")?.addEventListener("click", () => {
  const panel = document.getElementById("success-panel");
  if (panel) panel.hidden = true;
  form.hidden = false;
  clearErrors();
  showStep(0);
});

// --- Advanced file picker: instant local preview, View, Remove, drag & drop ---
const objectUrls = new Map();
function revokeUrl(name) {
  const u = objectUrls.get(name);
  if (u) { URL.revokeObjectURL(u); objectUrls.delete(name); }
}
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}
function renderPreview(picker) {
  const name = picker.dataset.field;
  const input = picker.querySelector('input[type="file"]');
  const empty = picker.querySelector(".fp-empty");
  const preview = picker.querySelector(".fp-preview");
  const img = picker.querySelector("img.fp-thumb");
  const badge = picker.querySelector(".fp-badge");
  const metaName = picker.querySelector(".fp-meta strong");
  const view = picker.querySelector(".fp-view");
  const file = input?.files?.[0];
  revokeUrl(name);
  if (!file) {
    if (empty) empty.hidden = false;
    if (preview) preview.hidden = true;
    return;
  }
  const url = URL.createObjectURL(file);
  objectUrls.set(name, url);
  const isImage = file.type.startsWith("image/");
  if (img) {
    if (isImage) { img.src = url; img.alt = `${FILE_LABELS[name]} preview`; img.hidden = false; }
    else { img.removeAttribute("src"); img.hidden = true; }
  }
  if (badge) badge.hidden = isImage;
  if (metaName) metaName.textContent = `${file.name} · ${fmtSize(file.size)}`;
  if (view) view.href = url;
  if (empty) empty.hidden = true;
  if (preview) preview.hidden = false;
  // Clear any previous error on this picker now a file is chosen
  picker.classList.remove("has-error");
  const msgEl = document.getElementById(`err-${name}`);
  if (msgEl) { msgEl.hidden = true; msgEl.textContent = ""; }
}
function clearPicker(picker) {
  const input = picker.querySelector('input[type="file"]');
  if (input) input.value = "";
  renderPreview(picker);
}

document.querySelectorAll(".file-picker").forEach((picker) => {
  const name = picker.dataset.field;
  const zone = picker.querySelector(".fp-zone");
  const input = picker.querySelector('input[type="file"]');
  const view = picker.querySelector(".fp-view");
  const remove = picker.querySelector(".fp-remove");
  input?.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f && !ALLOWED_TYPES.includes(f.type)) {
      input.value = "";
      renderPreview(picker);
      showErrors([{ field: name, msg: `${FILE_LABELS[name]} must be PDF, JPG or PNG (that file is ${f.type || "an unsupported type"})` }]);
      return;
    }
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      input.value = "";
      renderPreview(picker);
      showErrors([{ field: name, msg: `${FILE_LABELS[name]} is ${fmtSize(f.size)} — max is ${MAX_FILE_MB}MB` }]);
      return;
    }
    renderPreview(picker);
    clearErrors();
  });
  view?.addEventListener("click", (e) => e.preventDefault() || e.stopPropagation());
  // Label clicks also open the dialog; prevent that when using View/Remove
  view?.addEventListener("click", () => window.open(view.href, "_blank", "noopener"));
  remove?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); clearPicker(picker); });
  remove?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); });
  // Drag & drop onto the zone
  ["dragenter", "dragover"].forEach((ev) => zone?.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => zone?.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("dragover"); }));
  zone?.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (f && input) {
      try {
        const dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        showErrors([{ field: name, msg: `${FILE_LABELS[name]}: your browser blocked drag & drop — tap to choose the file instead` }]);
      }
    }
  });
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  // Enter key on an early step: advance instead of submitting
  if (currentStep < TOTAL - 1) {
    if (showErrors(stepErrors(currentStep))) showStep(currentStep + 1);
    return;
  }
  const data = new FormData(form);
  const fullName = (data.get("fullName") || "").toString().trim();
  const phone = (data.get("phone") || "").toString().trim();
  const email = (data.get("email") || "").toString().trim();
  const school = (data.get("school") || "").toString().trim();
  const course = (data.get("course") || "").toString().trim();
  const company = (data.get("company") || "").toString().trim();
  const startDate = (data.get("startDate") || "").toString();
  const endDate = (data.get("endDate") || "").toString();

  if (!isConfigured || !db) {
    status.textContent = "Portal not connected yet — missing Firebase config. Ask admin to paste keys in js/firebase-config.js.";
    status.className = "error";
    return;
  }

  // Defense in depth: re-check every step, jump to the first problem
  if (!showErrors([...stepErrors(0), ...stepErrors(1), ...stepErrors(2)])) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  status.textContent = "Uploading documents…";
  status.className = "";
  if (progress) { progress.hidden = false; progress.value = 10; }

  try {
    const [schoolLetterUrl, cvUrl, ghanaCardUrl] = await Promise.all([
      uploadToCloudinary(data.get("schoolLetter")),
      uploadToCloudinary(data.get("cv")),
      uploadToCloudinary(data.get("ghanaCard")),
    ]);
    if (progress) progress.value = 70;
    status.textContent = "Saving application…";

    const docRef = await addDoc(collection(db, "submissions"), {
      fullName, school, course, phone, email, company, startDate, endDate,
      files: { schoolLetterUrl, cvUrl, ghanaCardUrl },
      status: "pending",
      adminNote: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // Queue receipt email (best-effort — submission already saved)
    await addDoc(collection(db, "mailQueue"), {
      to: email,
      template: "receipt",
      submissionId: docRef.id,
      status: "queued",
      attempts: 0,
      createdAt: serverTimestamp(),
    }).catch(() => {});
    fetch("/.netlify/functions/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: email,
        subject: "We received your attachment application",
        html: `<p>Hi ${fullName},</p><p>We received your application to <strong>${company}</strong>. Reference: <code>${docRef.id}</code>. We will email you once reviewed.</p>`,
        submissionId: docRef.id,
      }),
    }).catch(() => {});

    if (progress) progress.value = 100;
    document.querySelectorAll(".file-picker").forEach(clearPicker);
    form.reset();
    clearErrors();
    if (progress) progress.hidden = true;
    const panel = document.getElementById("success-panel");
    const ref = document.getElementById("success-ref");
    if (ref) ref.textContent = docRef.id;
    form.hidden = true;
    if (panel) { panel.hidden = false; panel.scrollIntoView(); }
  } catch (err) {
    console.error(err);
    status.textContent = `Submit failed: ${err.message}. Try again.`;
    status.className = "error";
  } finally {
    submitBtn.disabled = false;
    if (progress) setTimeout(() => { progress.hidden = true; progress.value = 0; }, 1500);
  }
});
