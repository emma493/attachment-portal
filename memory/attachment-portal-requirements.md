# Attachment / Internship Submission Portal — Requirements & Preferences

Last updated: 2026-10-02
Status: Locked for v1 build

## 1. Goal
Students submit attachment/internship applications online (no paper travel).
Flow: Student opens site -> fills form -> uploads letters, CV, ID -> submits
-> Admin sees it in dashboard -> Approves / Rejects -> Student gets email.

## 2. Hosting & Stack (locked)
- Website: Netlify (static frontend: student form + /sysadmin, no public link)
- Rest: Firebase Spark free account (no card, no Blaze)
- Database: Cloud Firestore (Spark free: 1GB stored, 50k reads/day, 20k writes/day)
- Auth: Firebase Auth email/password (admin login only, students anonymous)
- Files: Cloudinary free (NOT Firebase Storage — Storage buckets + Cloud Functions
  + Trigger Email extension require Blaze since Feb 2026)
- Emails: Brevo via Netlify Function (NOT Resend — Resend free is 100/day)

## 3. Frontend Form (student view `/`)
Fields:
- Full Name (required, text)
- School (required, text)
- Course (required, text)
- Phone (required, validate Ghana format)
- Email (required, email format)
- Company applying to: FREE-TEXT input typed manually by student.
  No dropdown, no validation against list. min 2 / max 100 chars.
  Stored as `company: string`. Admin searches/filters by fuzzy match.
- Start Date / End Date (required, date, end > start)
- Uploads (required, PDF/JPG/JPEG/PNG, 5MB max each, client-side validated):
  1. Letter from school
  2. CV
  3. Ghana Card
- Submit button with upload progress + success screen

Submit flow:
1. Validate client-side (required, email/phone, file type/size, end > start)
2. Upload 3 files to Cloudinary unsigned preset -> get secure_urls
3. Create Firestore doc `submissions/{autoId}` with metadata + file URLs
   + `status: "pending"` + timestamps
4. Enqueue receipt email via `mailQueue` -> Netlify Function -> Brevo

## 4. Database (Firestore)
Collection: `submissions`
```
{
  fullName: string,
  school: string,
  course: string,
  phone: string,
  email: string,
  reference: string,        // daily serial YYYY-MM-DD-NNN (fallback: YYYY-MM-DD-HHMMSS), shown to student
  company: string,          // manually typed
  startDate: string (ISO),
  endDate: string (ISO),
  files: {
    schoolLetterUrl: string,
    cvUrl: string,
    ghanaCardUrl: string
  },
  status: "pending" | "approved" | "rejected",
  adminNote: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
Collections for mail:
- mailQueue/{id} { to, template, submissionId, status: queued/sent/failed, attempts }
- mailLog/{id} { to, template, status, providerResponse, createdAt }
```

## 5. File Storage (Cloudinary free)
- Unsigned upload preset, folder `submissions/`
- Allowed formats: `pdf,jpg,jpeg,png`
- App cap: 5MB per file (Cloudinary hard cap: 10MB raw)
- Direct browser upload: POST https://api.cloudinary.com/v1_1/<CLOUD_NAME>/auto/upload
- REQUIRED setting: Cloudinary Console > Settings > Security >
  check `Allow delivery of PDF and ZIP files` (free accounts block PDFs by default)
- Privacy (v1): URLs are long/un-guessable, no public listing.
  Anyone WITH the URL can open it. Acceptable for v1.
  v2 (if needed): signed/authenticated URLs via Netlify Function signer.
  Note: Ghana Card is sensitive ID — do not expose URLs publicly.

## 6. Emails (Brevo — locked)
- Provider: Brevo free = 300 emails/day (~9,000/month), no card required
- 1 submission = 2 emails (receipt + decision) => covers ~150 submissions/day
- Sending path: Firestore `mailQueue` -> Netlify Function `send-email.js`
  -> Brevo API (key in Netlify env, never in frontend) with retry + backoff
  -> write result to `mailLog`
- Templates: (a) "We received your form", (b) Approved, (c) Rejected (+ admin note)
- Reliability: use custom sending domain (e.g. noreply@yourdomain.com)
  + Brevo SPF/DKIM/DMARC from day 1. Gmail sender = spam-prone fallback only.
- Swappable: `EMAIL_PROVIDER=brevo` env var. Future scale to SES ($0.10/1k)
  or Brevo/Mailjet Starter ($9/mo, no daily cap) without rewrite.
- Rejected: Gmail SMTP (500/day but spam-prone, blocks, no tracking).

## 7. Admin Dashboard (`/sysadmin` — hidden, no public link)
- Firebase Auth email/password login (allowlist only)
- List all submissions: filter pending/approved/rejected,
  search name/school/company, sort by date
- Detail view: all fields + View/Download buttons (Cloudinary URLs)
- Actions: Approve / Reject + optional note -> updates `status`
  -> enqueues decision email to student

## 8. Security Rules (to implement)
- Firestore: public can CREATE submission only (validated fields, status forced
  to pending); only admin UID(s) can READ/LIST/UPDATE. No public list.
- Cloudinary preset: locked to `submissions/` folder, file types + max size.
  Treat preset name as sensitive.

## 9. Theme (DVLA Ghana UI — locked 2026-10-02, revised to mirror dvla.gov.gh)
- dvla.gov.gh is bot-walled (scraping blocked); favicon.ico there returns
  challenge HTML and online.dvla.gov.gh/favicon.ico is 0 bytes.
- Logo + favicon: genuine DVLA emblem from Ghana.gov MDA registry
  (https://govgh-uat.s3.eu-west-1.amazonaws.com/images/mda/indexjpg_1585776545.jpeg),
  saved as `assets/dvla-logo.jpg`, linked as icon + apple-touch-icon on both pages.
- UI language copied from dvla.gov.gh / ghana.gov.gh: thin navy utility strip
  (Call Center 030 276 2449), white sticky header with logo left + UPPERCASE nav
  with 6px gold (#FFD147) hover underline, navy hero band, service-card steps row,
  form grouped in white cards with navy h2 + gold underline, navy footer with
  Services/Contact columns + © 2026 DVLA base bar.
- Tokens: navy #0B2A5B, navy-dark #071C40, gold #FFD147, ink #1A1A1A,
  red #CE1126 (errors only), green #107625 (success only).
- Type: Source Sans 3 (Ghana gov standard). Both pages share css/style.css.
- NOTE 2026-10-02: user wired Firebase (project attachment-portal-f4285) directly
  in js/* + admin importmap; index.html importmap restored after UI rewrite —
  do NOT full-rewrite index.html without preserving the importmap block.
- Wizard (2026-10-02, user request — most users on mobile): form is 4 steps
  (1 Personal: name/phone/email, 2 School & placement, 3 Documents, 4 Review &
  Submit). Single <form>, panels hidden per step, per-step validation reusing
  Ghana-phone/date/file checks, Enter key advances instead of submitting early,
  review screen lists values + file names/sizes (XSS-safe textContent),
  no-JS fallback shows all steps. Controller in js/student-form.js; submit/
  Cloudinary/Firestore logic untouched.
- Mobile nav (2026-10-02): ≤720px the long nav bar becomes a hamburger opening
  a closable right-side drawer (overlay scrim, ✕/Esc/scrim-tap to close, focus
  returns to toggle), shared js/nav.js on both pages. Mobile polish: 16px inputs
  (no iOS zoom), ≥48px sticky Back/Continue bar with safe-area inset, stacked
  review rows, 100dvh drawer.
- Wizard paging fix + premium pass (2026-10-02, user: "can't be sold for $0.01"):
  BUG FOUND — `.card { display:grid }` overrode `[hidden]`, so all steps showed
  at once. Fixed with explicit `.wizard-step[hidden] { display:none }`.
  Research applied (GOV.UK Design System validation/error-summary/file-upload,
  PatternFly multi-file-upload, 2026 form-UX consensus: numbered steps + honest
  progress, easy opener first, uploads delayed, inline errors + summary, never
  color-alone): error-summary box with anchor links at form top, per-field
  inline errors + red input borders + aria-invalid, step ledes stating each
  step's purpose, advanced file pickers (tap/drag dropzone, instant local
  preview — image thumbnails via object URLs, PDF badge — View in new tab,
  Remove, per-file size/type messages, drag-drop fallback), post-submit success
  panel with reference + "submit another". Submit/Cloudinary/Firestore logic
  untouched; file input names unchanged.

## 10. Open Items (need from user)
- [ ] Firebase project exists or `firebase init` from scratch?
- [ ] Brevo sender address + custom domain (or Gmail for now)?
- [ ] Admin login email(s)?
- [ ] Rough peak submissions/month (to confirm Brevo free is enough)?
- [ ] Cloudinary account created + cloud name + unsigned preset name?
