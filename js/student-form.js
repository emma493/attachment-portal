import { firebaseConfig, cloudinaryConfig, MAX_FILE_MB, ALLOWED_TYPES } from "./firebase-config.js";

// TODO: wire Firebase SDK (Firestore addDoc) + Cloudinary unsigned upload + Brevo mailQueue.
// Flow: validate -> upload 3 files to Cloudinary -> addDoc(submissions) -> POST /.netlify/functions/send-email
const form = document.getElementById("submission-form");
const status = document.getElementById("form-status");

function validFile(f) {
  if (!f) return false;
  if (!ALLOWED_TYPES.includes(f.type)) return false;
  if (f.size > MAX_FILE_MB * 1024 * 1024) return false;
  return true;
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(form);
  if (new Date(data.get("endDate")) <= new Date(data.get("startDate"))) {
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
  status.textContent = `TODO: upload to Cloudinary (${cloudinaryConfig.cloudName}) then save to Firestore (${firebaseConfig.projectId}).`;
});
