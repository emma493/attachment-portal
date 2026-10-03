import { db, auth, isConfigured } from "./firebase-config.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, query, orderBy, getDocs,
  doc, updateDoc, addDoc, serverTimestamp,
} from "firebase/firestore";

// SECURITY NOTE: this page allows anyone who finds /sysadmin to create a
// staff account, and any signed-in user can read submissions (see
// firestore.rules). After creating YOUR account, disable sign-up by setting
// ALLOW_STAFF_SIGNUP = false below and redeploying. For stronger protection,
// restrict firestore.rules to your UID(s) afterwards.

const ALLOW_STAFF_SIGNUP = true;

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const loginSection = document.getElementById("login-section");
const dashSection = document.getElementById("dashboard-section");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const signupError = document.getElementById("signup-error");
const signupSubmit = document.getElementById("signup-submit");
const adminUser = document.getElementById("admin-user");
const signOutBtn = document.getElementById("signout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const listEl = document.getElementById("submissions-list");
const detailCard = document.getElementById("detail-card");
const detailEl = document.getElementById("submission-detail");
const statusFilter = document.getElementById("status-filter");
const searchInput = document.getElementById("search");
const adminStatus = document.getElementById("admin-status");
const listCount = document.getElementById("list-count");
const statTotal = document.getElementById("stat-total");
const statPending = document.getElementById("stat-pending");
const statApproved = document.getElementById("stat-approved");
const statRejected = document.getElementById("stat-rejected");

let allDocs = [];
let selectedId = null;
let loading = false;

function setStatus(msg, kind = "") {
  if (!adminStatus) return;
  adminStatus.textContent = msg;
  adminStatus.className = kind;
}

function showLoginError(msg) {
  if (!loginError) return;
  loginError.textContent = msg;
  loginError.hidden = !msg;
}

// Only allow safe https links (Cloudinary secure_urls). Blocks javascript:/data:.
function safeUrl(url) {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (/^https:\/\//i.test(u)) return u;
  return null;
}

function createdMillis(s) {
  const c = s.createdAt;
  try {
    if (c && typeof c.toDate === "function") return c.toDate().getTime();
    if (typeof c === "string") return new Date(c).getTime() || 0;
  } catch { /* ignore */ }
  return 0;
}

function fmtDate(s) {
  const c = s.createdAt;
  try {
    if (c && typeof c.toDate === "function") {
      return c.toDate().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    }
    if (typeof c === "string" && c) return new Date(c).toLocaleString("en-GB");
  } catch { /* ignore */ }
  return "—";
}

function showDashboard(user) {
  loginSection.hidden = true;
  dashSection.hidden = false;
  if (adminUser) adminUser.textContent = user?.email ? `Signed in as ${user.email}` : "";
  loadSubmissions();
}

function showLogin() {
  dashSection.hidden = true;
  loginSection.hidden = false;
  allDocs = [];
  selectedId = null;
}

function updateStats() {
  const total = allDocs.length;
  const pending = allDocs.filter((s) => (s.status || "pending") === "pending").length;
  const approved = allDocs.filter((s) => s.status === "approved").length;
  const rejected = allDocs.filter((s) => s.status === "rejected").length;
  if (statTotal) statTotal.textContent = String(total);
  if (statPending) statPending.textContent = String(pending);
  if (statApproved) statApproved.textContent = String(approved);
  if (statRejected) statRejected.textContent = String(rejected);
}

function filteredDocs() {
  const status = statusFilter?.value || "";
  const term = (searchInput?.value || "").trim().toLowerCase();
  return allDocs.filter((s) => {
    if (status && (s.status || "pending") !== status) return false;
    if (!term) return true;
    return [s.fullName, s.school, s.company, s.email, s.phone]
      .some((v) => (v || "").toString().toLowerCase().includes(term));
  });
}

function pillClass(status) {
  const s = status || "pending";
  return `pill pill-${s}`;
}

async function loadSubmissions() {
  if (!db) {
    setStatus("Missing Firebase config — cannot load submissions.", "error");
    return;
  }
  if (loading) return;
  loading = true;
  if (refreshBtn) refreshBtn.disabled = true;
  setStatus("Loading submissions…");
  listEl.textContent = "Loading…";
  try {
    let docs = [];
    try {
      const snap = await getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc")));
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      // Missing composite index / legacy docs without createdAt — fall back
      console.warn("Ordered query failed, retrying unordered:", err?.message);
      const snap = await getDocs(collection(db, "submissions"));
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => createdMillis(b) - createdMillis(a));
    }
    allDocs = docs;
    if (selectedId && !allDocs.some((s) => s.id === selectedId)) selectedId = null;
    updateStats();
    renderList();
    setStatus("");
  } catch (err) {
    console.error(err);
    const msg = /permission|denied|insufficient/i.test(err?.message || "")
      ? "Access denied — your account cannot read submissions. Check Firestore rules / admin access."
      : `Could not load submissions: ${err?.message || err}`;
    setStatus(msg, "error");
    listEl.textContent = "Could not load submissions.";
  } finally {
    loading = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderList() {
  const rows = filteredDocs();
  if (listCount) listCount.textContent = rows.length === allDocs.length
    ? `${allDocs.length} submission${allDocs.length === 1 ? "" : "s"}`
    : `${rows.length} of ${allDocs.length} shown`;
  if (!rows.length) {
    listEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = allDocs.length ? "No submissions match this filter." : "No submissions yet.";
    listEl.appendChild(p);
    return;
  }
  listEl.innerHTML = "";
  for (const s of rows) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-item" + (s.id === selectedId ? " selected" : "");
    if (s.id === selectedId) btn.setAttribute("aria-current", "true");

    const name = document.createElement("strong");
    name.textContent = s.fullName || "—";
    const meta = document.createElement("span");
    meta.textContent = `${s.school || ""} → ${s.company || ""}`;
    const pill = document.createElement("em");
    pill.className = pillClass(s.status);
    pill.textContent = s.status || "pending";

    btn.append(name, meta, pill);
    btn.addEventListener("click", () => renderDetail(s.id));
    listEl.appendChild(btn);
  }
}

function fileNameFromUrl(url) {
  try {
    const name = new URL(url).pathname.split("/").pop() || "";
    return decodeURIComponent(name) || "document";
  } catch {
    return "document";
  }
}

// Cross-origin `download` attributes are ignored by browsers, so Download
// fetches the file and saves it locally. Falls back to a new tab on failure.
async function downloadFile(url, filename, btn) {
  const safe = safeUrl(url);
  if (!safe) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparing…";
  try {
    const res = await fetch(safe, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  } catch (err) {
    console.warn("Direct download failed, opening in new tab:", err?.message);
    window.open(safe, "_blank", "noopener");
    setStatus("Could not download directly — opened in a new tab instead.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function docItem(label, url) {
  const li = document.createElement("li");
  li.className = "doc-item";
  const name = document.createElement("div");
  name.className = "doc-name";
  const strong = document.createElement("strong");
  strong.textContent = label;
  name.appendChild(strong);
  const sub = document.createElement("small");
  const safe = safeUrl(url);
  if (safe) {
    sub.textContent = fileNameFromUrl(safe);
  } else {
    sub.className = "hint";
    sub.textContent = "Missing";
  }
  name.appendChild(sub);
  li.appendChild(name);
  if (safe) {
    const actions = document.createElement("div");
    actions.className = "doc-actions";
    const view = document.createElement("a");
    view.className = "doc-btn doc-view";
    view.href = safe;
    view.target = "_blank";
    view.rel = "noopener";
    view.textContent = "View";
    const down = document.createElement("button");
    down.type = "button";
    down.className = "doc-btn doc-dl";
    down.textContent = "Download";
    down.addEventListener("click", () => downloadFile(safe, fileNameFromUrl(safe), down));
    actions.append(view, down);
    li.appendChild(actions);
  }
  return li;
}

function detailRow(label, value) {
  const wrap = document.createElement("div");
  wrap.className = "detail-row";
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value || "—";
  wrap.append(dt, dd);
  return wrap;
}

function renderDetail(id) {
  const s = allDocs.find((x) => x.id === id);
  if (!s) return;
  selectedId = id;
  renderList(); // update highlight
  detailCard.hidden = false;
  detailEl.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = s.fullName || "Unnamed applicant";

  const ref = document.createElement("p");
  ref.className = "hint";
  ref.textContent = `Ref ${s.id} · Submitted ${fmtDate(s)}`;

  const dl = document.createElement("dl");
  dl.className = "detail-grid";
  dl.append(
    detailRow("Email", s.email),
    detailRow("Phone", s.phone),
    detailRow("School", s.school),
    detailRow("Course", s.course),
    detailRow("Company", s.company),
    detailRow("Dates", `${s.startDate || "—"} → ${s.endDate || "—"}`),
    detailRow("Status", s.status || "pending"),
  );

  const filesTitle = document.createElement("h4");
  filesTitle.className = "docs-h";
  filesTitle.textContent = "Documents";
  const filesList = document.createElement("ul");
  filesList.className = "doc-list";
  filesList.append(
    docItem("School letter", s.files?.schoolLetterUrl),
    docItem("CV", s.files?.cvUrl),
    docItem("Ghana Card", s.files?.ghanaCardUrl),
  );

  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Admin note (included in decision email)";
  const note = document.createElement("textarea");
  note.id = "admin-note";
  note.rows = 3;
  note.value = s.adminNote || "";
  noteLabel.appendChild(note);

  const actions = document.createElement("div");
  actions.className = "actions";
  const approveBtn = document.createElement("button");
  approveBtn.type = "button";
  approveBtn.id = "approve-btn";
  approveBtn.textContent = "Approve";
  const rejectBtn = document.createElement("button");
  rejectBtn.type = "button";
  rejectBtn.id = "reject-btn";
  rejectBtn.textContent = "Reject";
  actions.append(approveBtn, rejectBtn);

  detailEl.append(h, ref, dl, filesTitle, filesList, noteLabel, actions);

  approveBtn.addEventListener("click", () => decide(s, "approved", approveBtn, rejectBtn));
  rejectBtn.addEventListener("click", () => {
    if (!window.confirm(`Reject application from ${s.fullName || "this applicant"}?`)) return;
    decide(s, "rejected", approveBtn, rejectBtn);
  });

  detailCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function decide(s, nextStatus, approveBtn, rejectBtn) {
  const note = document.getElementById("admin-note")?.value || "";
  approveBtn.disabled = true;
  rejectBtn.disabled = true;
  setStatus(`Saving ${nextStatus}…`);
  try {
    await updateDoc(doc(db, "submissions", s.id), {
      status: nextStatus, adminNote: note, updatedAt: serverTimestamp(),
    });
    // Queue + trigger decision email (best-effort — status already saved)
    await addDoc(collection(db, "mailQueue"), {
      to: s.email, template: nextStatus, submissionId: s.id,
      status: "queued", attempts: 0, createdAt: serverTimestamp(),
    }).catch(() => {});
    // Decision email: awaited so failures are visible (status already saved).
    let emailFailed = false;
    try {
      const mailRes = await fetch("/.netlify/functions/send-email", {
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
      });
      if (!mailRes.ok) {
        emailFailed = true;
        console.error("Decision email failed:", mailRes.status, await mailRes.text().catch(() => ""));
      }
    } catch (mailErr) {
      emailFailed = true;
      console.error("Decision email failed:", mailErr);
    }

    s.status = nextStatus;
    s.adminNote = note;
    updateStats();
    renderList();
    renderDetail(s.id);
    setStatus(
      emailFailed
        ? `Application ${nextStatus}, but the decision email failed to send.`
        : `Application ${nextStatus}.`,
      emailFailed ? "error" : "ok",
    );
  } catch (err) {
    console.error(err);
    setStatus(`Save failed: ${err?.message || err}`, "error");
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Wrong email or password.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts — try again later.";
  if (code.includes("network")) return "Network error — check your connection and try again.";
  return err?.message || "Login failed.";
}

function showSignupError(msg) {
  if (!signupError) return;
  signupError.textContent = msg;
  signupError.hidden = !msg;
}

// Tab switching is also wired in js/nav.js (classic script) so the tabs work
// even if this module fails to load. NOTE: this function must stay
// self-contained — delegating to window.__adminTab here caused infinite
// recursion when both scripts loaded (each one pointed at the other).
function showTab(which) {
  const login = which !== "signup";
  loginForm.hidden = !login;
  signupForm.hidden = login;
  tabLogin?.classList.toggle("active", login);
  tabSignup?.classList.toggle("active", !login);
  tabLogin?.setAttribute("aria-selected", String(login));
  tabSignup?.setAttribute("aria-selected", String(!login));
}

if (!window.__adminTabsWired) {
  window.__adminTabsWired = true;
  tabLogin?.addEventListener("click", () => showTab("login"));
  tabSignup?.addEventListener("click", () => showTab("signup"));
}
window.__sysadminReady = true;

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showLoginError("");
  if (!isConfigured || !auth || !db) {
    showLoginError("Portal not connected — missing Firebase config.");
    return;
  }
  const fd = new FormData(loginForm);
  const email = (fd.get("email") || "").toString().trim();
  const password = (fd.get("password") || "").toString();
  if (!email || !password) {
    showLoginError("Enter your email and password.");
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showLoginError(friendlyAuthError(err));
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Log in";
  }
});

signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showSignupError("");
  if (!ALLOW_STAFF_SIGNUP) {
    showSignupError("Staff sign-up is disabled. Ask an existing admin to create your account.");
    return;
  }
  if (!isConfigured || !auth || !db) {
    showSignupError("Portal not connected — missing Firebase config.");
    return;
  }
  const fd = new FormData(signupForm);
  const email = (fd.get("email") || "").toString().trim();
  const password = (fd.get("password") || "").toString();
  const confirm = (fd.get("confirm") || "").toString();
  if (!email || !password) {
    showSignupError("Enter an email and password.");
    return;
  }
  if (password.length < 6) {
    showSignupError("Password must be at least 6 characters.");
    return;
  }
  if (password !== confirm) {
    showSignupError("Passwords do not match.");
    return;
  }
  signupSubmit.disabled = true;
  signupSubmit.textContent = "Creating account…";
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will open the dashboard.
  } catch (err) {
    const code = err?.code || "";
    if (code.includes("email-already-in-use")) {
      showSignupError("That email already has an account — use Sign in instead.");
      showTab("login");
    } else if (code.includes("invalid-email")) {
      showSignupError("Enter a valid email address.");
    } else if (code.includes("weak-password")) {
      showSignupError("Password is too weak — use at least 6 characters.");
    } else {
      showSignupError(err?.message || "Sign-up failed.");
    }
  } finally {
    signupSubmit.disabled = false;
    signupSubmit.textContent = "Create staff account";
  }
});

signOutBtn?.addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth).catch(() => {});
});

refreshBtn?.addEventListener("click", () => loadSubmissions());
statusFilter?.addEventListener("change", renderList);
searchInput?.addEventListener("input", renderList);

if (!ALLOW_STAFF_SIGNUP) {
  tabSignup.hidden = true;
  showTab("login");
}
if (!isConfigured || !auth) {
  showLoginError("Portal not connected — missing Firebase config.");
} else {
  onAuthStateChanged(auth, (user) => {
    if (user) showDashboard(user);
    else showLogin();
  });
}
