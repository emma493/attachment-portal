import { db, auth, isConfigured } from "./firebase-config.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, query, where, orderBy, getDocs,
  doc, updateDoc, addDoc, serverTimestamp,
} from "firebase/firestore";

const loginForm = document.getElementById("login-form");
const loginSection = document.getElementById("login-section");
const dashSection = document.getElementById("dashboard-section");
const listEl = document.getElementById("submissions-list");
const detailEl = document.getElementById("submission-detail");
const statusFilter = document.getElementById("status-filter");
const searchInput = document.getElementById("search");

let allDocs = [];

function showDashboard(user) {
  loginSection.hidden = true;
  dashSection.hidden = false;
  loadSubmissions();
}

async function loadSubmissions() {
  if (!db) { listEl.textContent = "Missing Firebase config."; return; }
  listEl.textContent = "Loading…";
  const status = statusFilter?.value || "";
  let q = query(collection(db, "submissions"), orderBy("createdAt", "desc"));
  if (status) q = query(collection(db, "submissions"), where("status", "==", status), orderBy("createdAt", "desc"));
  try {
    const snap = await getDocs(q);
    allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // orderBy may need composite index with where — fall back to unordered
    console.warn("Ordered query failed, retrying unordered:", err.message);
    const fallbackQ = status
      ? query(collection(db, "submissions"), where("status", "==", status))
      : collection(db, "submissions");
    const snap = await getDocs(fallbackQ);
    allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  renderList();
}

function renderList() {
  const term = (searchInput?.value || "").toLowerCase();
  const filtered = allDocs.filter((s) =>
    !term ||
    s.fullName?.toLowerCase().includes(term) ||
    s.school?.toLowerCase().includes(term) ||
    s.company?.toLowerCase().includes(term)
  );
  if (!filtered.length) { listEl.innerHTML = "<p>No submissions found.</p>"; return; }
  listEl.innerHTML = "";
  for (const s of filtered) {
    const btn = document.createElement("button");
    btn.className = "row-item";
    btn.innerHTML = `<strong>${s.fullName || "—"}</strong> <span>${s.school || ""} → ${s.company || ""}</span> <em>${s.status || "pending"}</em>`;
    btn.addEventListener("click", () => renderDetail(s.id));
    listEl.appendChild(btn);
  }
}

function renderDetail(id) {
  const s = allDocs.find((x) => x.id === id);
  if (!s) return;
  detailEl.innerHTML = `
    <h3>${s.fullName}</h3>
    <p>${s.email} · ${s.phone}</p>
    <p>${s.school} — ${s.course}</p>
    <p>Company: <strong>${s.company}</strong> (${s.startDate} → ${s.endDate})</p>
    <p>Status: <strong>${s.status}</strong></p>
    <p>
      <a href="${s.files?.schoolLetterUrl || "#"}" target="_blank" rel="noopener">School letter</a> ·
      <a href="${s.files?.cvUrl || "#"}" target="_blank" rel="noopener">CV</a> ·
      <a href="${s.files?.ghanaCardUrl || "#"}" target="_blank" rel="noopener">Ghana Card</a>
    </p>
    <label>Admin note <textarea id="admin-note" rows="3">${s.adminNote || ""}</textarea></label>
    <div class="actions">
      <button id="approve-btn">Approve</button>
      <button id="reject-btn">Reject</button>
    </div>`;
  document.getElementById("approve-btn").addEventListener("click", () => decide(s, "approved"));
  document.getElementById("reject-btn").addEventListener("click", () => decide(s, "rejected"));
}

async function decide(s, nextStatus) {
  const note = document.getElementById("admin-note")?.value || "";
  await updateDoc(doc(db, "submissions", s.id), {
    status: nextStatus, adminNote: note, updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, "mailQueue"), {
    to: s.email, template: nextStatus, submissionId: s.id,
    status: "queued", attempts: 0, createdAt: serverTimestamp(),
  }).catch(() => {});
  fetch("/.netlify/functions/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: s.email,
      subject: nextStatus === "approved"
        ? "Your attachment application was approved"
        : "Update on your attachment application",
      html: nextStatus === "approved"
        ? `<p>Hi ${s.fullName},</p><p>Your application to <strong>${s.company}</strong> was <strong>approved</strong>.</p><p>${note}</p>`
        : `<p>Hi ${s.fullName},</p><p>Your application to <strong>${s.company}</strong> was <strong>not approved</strong> at this time.</p><p>${note}</p>`,
      submissionId: s.id,
    }),
  }).catch(() => {});
  s.status = nextStatus; s.adminNote = note;
  renderList(); renderDetail(s.id);
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isConfigured || !auth) {
    alert("Missing Firebase config — paste keys in js/firebase-config.js first.");
    return;
  }
  const fd = new FormData(loginForm);
  try {
    await signInWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
  } catch (err) {
    alert(`Login failed: ${err.message}`);
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) showDashboard(user);
});

statusFilter?.addEventListener("change", renderList);
searchInput?.addEventListener("input", renderList);
