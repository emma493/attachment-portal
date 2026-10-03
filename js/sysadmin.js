import { db, auth, isConfigured } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  collection, query, orderBy, getDocs,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

// Single-admin model: exactly one staff account exists. The page shows the
// sign-up form ONCE (while config/setup is unclaimed); afterwards only the
// login form is ever shown. A second UID can never read submissions —
// firestore.rules restricts submissions read/update to admins/{uid} owners
// and only the first UID can claim config/setup.

const SETUP_REF = () => doc(db, "config", "setup");
const adminDocRef = (uid) => doc(db, "admins", uid);

const authH = document.getElementById("auth-h");
const authSub = document.getElementById("auth-sub");
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const loginError = document.getElementById("login-error");
const loginSubmit = document.getElementById("login-submit");
const signupError = document.getElementById("signup-error");
const signupSubmit = document.getElementById("signup-submit");
const dashSection = document.getElementById("dashboard-section");
const adminUser = document.getElementById("admin-user");
const sideUser = document.getElementById("side-user");
const signOutBtn = document.getElementById("signout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const listEl = document.getElementById("submissions-list");
const attentionList = document.getElementById("attention-list");
const attentionHint = document.getElementById("attention-hint");
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
const viewTitle = document.getElementById("view-title");
const secEmail = document.getElementById("sec-email");
const liveLine = document.getElementById("live-line");
const adminShell = document.getElementById("admin-shell");
const railToggle = document.getElementById("rail-toggle");
const signOutBtnM = document.getElementById("signout-btn-m");
const passwordForm = document.getElementById("password-form");
const passwordError = document.getElementById("password-error");
const passwordOk = document.getElementById("password-ok");
const passwordSubmit = document.getElementById("password-submit");

let allDocs = [];
let selectedId = null;
let loading = false;
let setupDone = null; // null = unknown yet
let currentView = "overview";
let authReady = false;

const VIEW_TITLES = { overview: "Overview", submissions: "Submissions", security: "Security" };

// ---------- small helpers ----------

function setStatus(msg, kind = "") {
  if (!adminStatus) return;
  adminStatus.textContent = msg;
  adminStatus.className = kind;
}

function showFieldError(el, msg) {
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}

function hideAll() {
  loginSection.hidden = true;
  dashSection.hidden = true;
}

function showAuth(mode) {
  // mode: "login" | "signup" — exactly one is ever visible.
  hideAll();
  loginSection.hidden = false;
  const signup = mode === "signup";
  signupForm.hidden = !signup;
  loginForm.hidden = signup;
  if (authH) authH.textContent = signup ? "Create the staff account" : "Staff sign in";
  if (authSub) authSub.textContent = signup
    ? "This is shown once. After this account exists, only Sign in is shown."
    : "Sign in with the staff account.";
  if (viewTitle) viewTitle.textContent = signup ? "Staff setup" : "Staff access";
  setMenuEnabled(false);
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

// ---------- side menu / views ----------

function setMenuEnabled(on) {
  document.querySelectorAll("button[data-view]").forEach((b) => {
    b.disabled = !on;
  });
  if (signOutBtn) signOutBtn.hidden = !on;
  if (signOutBtnM) signOutBtnM.hidden = !on;
}

function showView(name) {
  if (!VIEW_TITLES[name]) name = "overview";
  currentView = name;
  document.querySelectorAll("button[data-view]").forEach((b) => {
    const active = b.dataset.view === name;
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  document.querySelectorAll(".admin-view[data-view]").forEach((v) => {
    v.hidden = v.dataset.view !== name;
  });
  if (viewTitle && !dashSection.hidden) viewTitle.textContent = VIEW_TITLES[name];
  try {
    const h = "#/" + name;
    if (location.hash !== h) history.replaceState(null, "", h);
  } catch { /* ignore */ }
}

document.querySelectorAll("button[data-view]").forEach((b) => {
  b.addEventListener("click", () => {
    if (dashSection.hidden) return; // menu is inert until signed in
    showView(b.dataset.view);
  });
});

// Collapsible rail (desktop) — persisted per browser.
const RAIL_KEY = "dvla-rail-collapsed";
function applyRail(collapsed) {
  adminShell?.classList.toggle("rail-collapsed", !!collapsed);
  railToggle?.setAttribute("aria-expanded", String(!collapsed));
  railToggle?.setAttribute("aria-label", collapsed ? "Expand menu" : "Collapse menu");
  railToggle?.setAttribute("title", collapsed ? "Expand menu" : "Collapse menu");
}
try {
  applyRail(localStorage.getItem(RAIL_KEY) === "1");
} catch { /* private mode */ }
railToggle?.addEventListener("click", () => {
  const collapsed = !adminShell?.classList.contains("rail-collapsed");
  applyRail(collapsed);
  try { localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
});

// ---------- setup gate (signup once, then login only) ----------

async function readSetup() {
  try {
    const snap = await getDoc(SETUP_REF());
    if (snap.exists() && snap.data()?.setupDone === true) return { done: true, data: snap.data() };
    return { done: false, data: null };
  } catch (err) {
    console.warn("Setup read failed:", err?.message);
    return null; // offline / misconfigured — caller shows login + offline note
  }
}

async function initAuthView() {
  if (!isConfigured || !auth || !db) {
    showAuth("login");
    showFieldError(loginError, "Portal not connected — missing Firebase config.");
    return;
  }
  const setup = await readSetup();
  if (setup === null) {
    // Setup state unreadable (offline, or new firestore.rules not published
    // yet). Stay silent here — Auth itself may still work, and any real
    // failure is reported inline on submit instead of flashing a false alarm.
    showAuth("login");
    return;
  }
  setupDone = setup.done;
  showAuth(setup.done ? "login" : "signup");
}

// ---------- admin claim + dashboard ----------

async function ensureAdminDoc(user) {
  try {
    await setDoc(adminDocRef(user.uid), {
      email: user.email || "",
      createdAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn("Admin doc write failed:", err?.message);
    throw err;
  }
}

async function claimSetupIfFirst(user) {
  // Called for a signed-in user when no setup doc exists: this user IS the
  // single admin. Order matters for the rules: admins/{uid} first (allowed
  // while setup is unclaimed), then config/setup.
  const setup = await readSetup();
  if (setup && setup.done) return setup.data;
  await ensureAdminDoc(user);
  try {
    await setDoc(SETUP_REF(), {
      setupDone: true,
      adminUid: user.uid,
      adminEmail: user.email || "",
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("Setup claim failed:", err?.message);
    throw err;
  }
  setupDone = true;
  return (await readSetup())?.data || null;
}

async function isOurAdmin(user) {
  const setup = await readSetup();
  if (!setup || !setup.done) return { first: true };
  if (setup.data?.adminUid === user.uid) return { first: false, ok: true };
  return { first: false, ok: false };
}

function showDashboard(user) {
  hideAll();
  // Never carry stale auth errors into a successful session.
  showFieldError(loginError, "");
  showFieldError(signupError, "");
  dashSection.hidden = false;
  document.body.classList.add("authed");
  if (adminUser) adminUser.textContent = user?.email ? `Signed in as ${user.email}` : "";
  if (sideUser) sideUser.textContent = user?.email || "Signed in";
  if (liveLine) liveLine.hidden = false;
  if (secEmail) secEmail.textContent = user?.email || "—";
  setMenuEnabled(true);
  const hashView = (location.hash || "").replace("#/", "");
  showView(VIEW_TITLES[hashView] ? hashView : currentView);
  loadSubmissions();
}

function showLogin() {
  setMenuEnabled(false);
  document.body.classList.remove("authed");
  if (liveLine) liveLine.hidden = true;
  allDocs = [];
  selectedId = null;
  showAuth(setupDone ? "login" : "signup");
}

async function rejectStray(user) {
  try { await signOut(auth); } catch { /* ignore */ }
  showLogin();
  showFieldError(loginError, "This is not the staff account. Only the one staff account can access this dashboard.");
}

// ---------- login ----------

function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Wrong email or password.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts — try again later.";
  if (code.includes("network")) return "Network error — check your connection and try again.";
  return err?.message || "Login failed.";
}

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showFieldError(loginError, "");
  if (!isConfigured || !auth || !db) {
    showFieldError(loginError, "Portal not connected — missing Firebase config.");
    return;
  }
  const fd = new FormData(loginForm);
  const email = (fd.get("email") || "").toString().trim();
  const password = (fd.get("password") || "").toString();
  if (!email || !password) {
    showFieldError(loginError, "Enter your email and password.");
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // Success → onAuthStateChanged routes to the dashboard.
  } catch (err) {
    showFieldError(loginError, friendlyAuthError(err));
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Log in";
  }
});

// ---------- first-run signup (shown once, ever) ----------

function showSignupError(msg) {
  showFieldError(signupError, msg);
}

signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showSignupError("");
  if (setupDone) {
    showSignupError("Staff sign-up is closed — this portal allows exactly one staff account. Use Sign in.");
    return;
  }
  if (!isConfigured || !auth || !db) {
    showSignupError("Portal not connected — missing Firebase config.");
    return;
  }
  // Re-check server state: a second browser may have claimed setup already.
  const setup = await readSetup();
  if (setup && setup.done) {
    setupDone = true;
    showAuth("login");
    showSignupError("");
    showFieldError(loginError, "The staff account already exists — sign in instead.");
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
    // onAuthStateChanged routes the new staff account to the dashboard
    // (and claims the one-time setup if this is the first account).
  } catch (err) {
    const code = err?.code || "";
    if (code.includes("email-already-in-use")) {
      showSignupError("That email already has an account — use Sign in instead.");
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

// ---------- auth state routing ----------

if (!isConfigured || !auth) {
  showAuth("login");
  showFieldError(loginError, "Portal not connected — missing Firebase config.");
} else {
  initAuthView();
  onAuthStateChanged(auth, async (user) => {
    authReady = true;
    if (!user) {
      showLogin();
      return;
    }
    const gate = await isOurAdmin(user);
    if (gate.first) {
      // No setup claimed yet: this signed-in user IS the single admin.
      // (Claim the admin doc too, so rules stay consistent.)
      try {
        await ensureAdminDoc(user);
        await claimSetupIfFirst(user);
        showDashboard(user);
      } catch {
        showFieldError(loginError, "Could not claim the staff account — check Firestore rules are deployed.");
        try { await signOut(auth); } catch { /* ignore */ }
        showLogin();
      }
      return;
    }
    if (!gate.ok) {
      await rejectStray(user);
      return;
    }
    try { await ensureAdminDoc(user); } catch { /* best effort */ }
    showDashboard(user);
  });
}

signOutBtn?.addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth).catch(() => {});
});
signOutBtnM?.addEventListener("click", async () => {
  if (!auth) return;
  await signOut(auth).catch(() => {});
});

// ---------- password change ----------

passwordForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showFieldError(passwordError, "");
  if (passwordOk) passwordOk.hidden = true;
  const user = auth?.currentUser;
  const pw = (new FormData(passwordForm).get("password") || "").toString();
  if (!user) return;
  if (pw.length < 6) {
    showFieldError(passwordError, "Password must be at least 6 characters.");
    return;
  }
  passwordSubmit.disabled = true;
  try {
    await updatePassword(user, pw);
    passwordForm.reset();
    if (passwordOk) {
      passwordOk.textContent = "Password updated.";
      passwordOk.hidden = false;
    }
  } catch (err) {
    if ((err?.code || "").includes("requires-recent-login")) {
      showFieldError(passwordError, "For security, sign out and sign in again, then retry.");
    } else {
      showFieldError(passwordError, err?.message || "Could not update password.");
    }
  } finally {
    passwordSubmit.disabled = false;
  }
});

// ---------- submissions (kept) ----------

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
    return [s.fullName, s.school, s.company, s.email, s.phone, s.reference]
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
  if (listEl) listEl.textContent = "Loading…";
  try {
    let docs = [];
    try {
      const snap = await getDocs(query(collection(db, "submissions"), orderBy("createdAt", "desc")));
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn("Ordered query failed, retrying unordered:", err?.message);
      const snap = await getDocs(collection(db, "submissions"));
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => createdMillis(b) - createdMillis(a));
    }
    allDocs = docs;
    if (selectedId && !allDocs.some((s) => s.id === selectedId)) selectedId = null;
    updateStats();
    renderList();
    renderAttention();
    setStatus("");
  } catch (err) {
    console.error(err);
    const msg = /permission|denied|insufficient/i.test(err?.message || "")
      ? "Access denied — deploy the updated firestore.rules so the staff account can read submissions."
      : `Could not load submissions: ${err?.message || err}`;
    setStatus(msg, "error");
    if (listEl) listEl.textContent = "Could not load submissions.";
  } finally {
    loading = false;
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderList() {
  if (!listEl) return;
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
    btn.addEventListener("click", () => {
      renderDetail(s.id);
      document.getElementById("detail-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    listEl.appendChild(btn);
  }
}

function renderAttention() {
  if (!attentionList) return;
  attentionList.innerHTML = "";
  const pending = allDocs
    .filter((s) => (s.status || "pending") === "pending")
    .sort((a, b) => createdMillis(a) - createdMillis(b))
    .slice(0, 5);
  if (attentionHint) {
    attentionHint.textContent = pending.length
      ? "Oldest pending applications first."
      : (allDocs.length ? "Nothing pending — all caught up." : "Applications will appear here once students submit.");
  }
  for (const s of pending) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row-item";
    const name = document.createElement("strong");
    name.textContent = s.fullName || "—";
    const meta = document.createElement("span");
    meta.textContent = `${s.reference || ""} · ${s.school || ""}`;
    btn.append(name, meta);
    btn.addEventListener("click", () => {
      showView("submissions");
      renderDetail(s.id);
    });
    attentionList.appendChild(btn);
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
  if (!s || !detailEl) return;
  selectedId = id;
  renderList();
  if (detailCard) detailCard.hidden = false;
  detailEl.innerHTML = "";

  const h = document.createElement("h3");
  h.textContent = s.fullName || "Unnamed applicant";

  const ref = document.createElement("p");
  ref.className = "hint";
  ref.textContent = `Ref ${s.reference || s.id} · Submitted ${fmtDate(s)}`;

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
  noteLabel.textContent = "Admin note";
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
    s.status = nextStatus;
    s.adminNote = note;
    updateStats();
    renderList();
    renderAttention();
    renderDetail(s.id);
    setStatus(`Application ${nextStatus}.`, "ok");
  } catch (err) {
    console.error(err);
    setStatus(`Save failed: ${err?.message || err}`, "error");
    approveBtn.disabled = false;
    rejectBtn.disabled = false;
  }
}

refreshBtn?.addEventListener("click", () => loadSubmissions());
statusFilter?.addEventListener("change", renderList);
searchInput?.addEventListener("input", renderList);
