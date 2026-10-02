import { firebaseConfig } from "./firebase-config.js";

// TODO: wire Firebase Auth (signInWithEmailAndPassword) + Firestore queries:
// where('status'), search by fullName/school/company client-side for v1,
// updateDoc status -> approved/rejected + enqueue decision email.
const loginForm = document.getElementById("login-form");
loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("login-section").hidden = true;
  document.getElementById("dashboard-section").hidden = false;
  document.getElementById("submissions-list").textContent =
    `TODO: list submissions from project ${firebaseConfig.projectId}.`;
});
