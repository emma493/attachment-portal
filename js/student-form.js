import { cloudinaryConfig, db, isConfigured } from "./firebase-config.js";
import { collection, addDoc, doc, runTransaction, serverTimestamp } from "firebase/firestore";

// Flow: validate (via window.__wizard) -> upload 3 files to Cloudinary ->
// addDoc(submissions) with daily-serial reference. No emails are sent.
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

// Human-readable reference like 2026-10-03-001: daily serial from a
// Firestore counter (resets each day). Falls back to a timestamp ref if the
// counter rules aren't deployed yet, so submitting never breaks.
async function makeReference(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  try {
    const seq = await runTransaction(db, async (tx) => {
      const counterRef = doc(db, "refCounters", day);
      const snap = await tx.get(counterRef);
      const next = (snap.exists() ? (snap.data().n || 0) : 0) + 1;
      tx.set(counterRef, { n: next });
      return next;
    });
    return `${day}-${String(seq).padStart(3, "0")}`;
  } catch (err) {
    console.warn("Counter unavailable, using timestamp reference:", err?.message);
    return `${day}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  }
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

    const reference = await makeReference();
    const docRef = await addDoc(collection(db, "submissions"), {
      fullName, school, course, phone, email, company, startDate, endDate,
      reference,
      files: { schoolLetterUrl, cvUrl, ghanaCardUrl },
      status: "pending",
      adminNote: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    // NOTE: receipt emails removed per owner request — no email is sent
    // on submit. Submission is saved above; success panel follows.

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
