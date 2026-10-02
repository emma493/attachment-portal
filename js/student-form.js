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
function fail(msg) {
  status.textContent = msg;
  status.className = "error";
  return false;
}
function validEmail(v) {
  return /^\S+@\S+\.\S+$/.test(v);
}

function validateStep(n) {
  if (n === 0) {
    if (field("fullName").length < 2) return fail("Step 1: enter your full name.");
    if (!validGhanaPhone(field("phone"))) return fail("Step 1: enter a valid Ghana phone (e.g. 0241234567).");
    if (!validEmail(field("email"))) return fail("Step 1: enter a valid email address.");
  }
  if (n === 1) {
    if (!field("school")) return fail("Step 2: enter your school.");
    if (!field("course")) return fail("Step 2: enter your course.");
    if (field("company").length < 2) return fail("Step 2: type the company name.");
    if (!field("startDate") || !field("endDate")) return fail("Step 2: pick start and end dates.");
    if (new Date(field("endDate")) <= new Date(field("startDate"))) return fail("Step 2: end date must be after start date.");
  }
  if (n === 2) {
    for (const key of Object.keys(FILE_LABELS)) {
      if (!validFile(fileOf(key))) return fail(`Step 3: ${FILE_LABELS[key]} must be PDF/JPG/PNG under ${MAX_FILE_MB}MB.`);
    }
  }
  status.textContent = "";
  status.className = "";
  return true;
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
  status.textContent = "";
  status.className = "";
  showStep(currentStep - 1);
});
nextBtn?.addEventListener("click", () => {
  if (validateStep(currentStep)) showStep(currentStep + 1);
});
progressBtns.forEach((b) => b.addEventListener("click", () => {
  const t = Number(b.dataset.goto);
  if (t <= maxVisited) {
    status.textContent = "";
    status.className = "";
    showStep(t);
  } else {
    fail("Finish this step first.");
  }
}));
if (steps.length) showStep(0);

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  // Enter key on an early step: advance instead of submitting
  if (currentStep < TOTAL - 1) {
    if (validateStep(currentStep)) showStep(currentStep + 1);
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

  if (!fullName || !phone || !email || !school || !course || !company || !startDate || !endDate) {
    status.textContent = "Please fill in all required fields.";
    status.className = "error";
    return;
  }
  if (!validGhanaPhone(phone)) {
    status.textContent = "Enter a valid Ghana phone (e.g. 0241234567).";
    status.className = "error";
    return;
  }
  if (new Date(endDate) <= new Date(startDate)) {
    status.textContent = "End date must be after start date.";
    status.className = "error";
    return;
  }
  for (const key of ["schoolLetter", "cv", "ghanaCard"]) {
    if (!validFile(data.get(key))) {
      status.textContent = `${key}: must be PDF/JPG/PNG under ${MAX_FILE_MB}MB.`;
      status.className = "error";
      return;
    }
  }

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
    status.textContent = `Submitted! Reference: ${docRef.id}. Check your email for confirmation.`;
    status.className = "success";
    form.reset();
  } catch (err) {
    console.error(err);
    status.textContent = `Submit failed: ${err.message}. Try again.`;
    status.className = "error";
  } finally {
    submitBtn.disabled = false;
    if (progress) setTimeout(() => { progress.hidden = true; progress.value = 0; }, 1500);
  }
});
