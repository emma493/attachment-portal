import { cloudinaryConfig, db, isConfigured } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

// Flow: validate (via window.__wizard) -> upload 3 files to Cloudinary ->
// addDoc(submissions) -> POST /.netlify/functions/send-email
// Wizard paging/validation lives in js/wizard.js (classic script) so Continue
// works even when this module fails to load (file://, blocked CDN).
const form = document.getElementById("submission-form");
const status = document.getElementById("form-status");
const progress = document.getElementById("upload-progress");

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

function wizard() {
  return window.__wizard || null;
}

// Human-readable reference: digits only, built from local date + time
// (YYYYMMDDHHMMSSmmm). Milliseconds keep same-second submissions unique.
function makeReference(now = new Date()) {
  const p = (n, len = 2) => String(n).padStart(len, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${p(now.getMilliseconds(), 3)}`;
}

window.__submitReady = true;

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const w = wizard();
  // Enter key on an early step: advance instead of submitting
  if (w && w.getStep() < w.getTotal() - 1) {
    if (w.showErrors(w.stepErrors(w.getStep()))) w.showStep(w.getStep() + 1);
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
  if (w && !w.showErrors([...w.stepErrors(0), ...w.stepErrors(1), ...w.stepErrors(2)])) return;

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

    const reference = makeReference();
    const docRef = await addDoc(collection(db, "submissions"), {
      fullName, school, course, phone, email, company, startDate, endDate,
      reference,
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
    // Receipt email: awaited (not fire-and-forget) so failures are visible
    // instead of silently lost. Submission is already saved at this point.
    let emailFailed = false;
    try {
      const mailRes = await fetch("/.netlify/functions/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: "We received your attachment application",
          html: `<p>Hi ${fullName},</p><p>We received your application to <strong>${company}</strong>. Reference: <code>${reference}</code>. We will email you once reviewed.</p>`,
          submissionId: docRef.id,
        }),
      });
      if (!mailRes.ok) {
        emailFailed = true;
        console.error("Receipt email failed:", mailRes.status, await mailRes.text().catch(() => ""));
      }
    } catch (mailErr) {
      emailFailed = true;
      console.error("Receipt email failed:", mailErr);
    }

    if (progress) progress.value = 100;
    if (w) w.clearAllPickers();
    form.reset();
    if (w) w.clearErrors();
    if (progress) progress.hidden = true;
    const panel = document.getElementById("success-panel");
    const ref = document.getElementById("success-ref");
    if (ref) ref.textContent = reference;
    form.hidden = true;
    if (panel) {
      panel.hidden = false;
      if (emailFailed) {
        const warn = document.createElement("p");
        warn.className = "field-error";
        warn.textContent = "Application saved, but the confirmation email could not be sent. Save your reference number above — we will still review your application.";
        panel.appendChild(warn);
      }
      panel.scrollIntoView();
    }
  } catch (err) {
    console.error(err);
    status.textContent = `Submit failed: ${err.message}. Try again.`;
    status.className = "error";
  } finally {
    submitBtn.disabled = false;
    if (progress) setTimeout(() => { progress.hidden = true; progress.value = 0; }, 1500);
  }
});
