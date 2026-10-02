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

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
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
