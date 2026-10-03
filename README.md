# Attachment / Internship Submission Portal

Students submit online. Admin reviews and approves/rejects.

## Stack
- Frontend: static HTML/JS on **Netlify** (`index.html`, `sysadmin.html`)
- Database + Auth: **Firebase Spark free** (Firestore + Auth)
- Files: **Cloudinary free** unsigned upload (PDF/JPG/PNG, 5MB max)
- Emails: **Brevo** (300/day free) via Netlify Function

## Connect to Netlify
1. Push this folder to GitHub:
   `gh repo create attachment-portal --public --source=. --push`
   or push manually and import in Netlify.
2. Netlify > Add new site > Import from GitHub > select repo.
   - Build command: (empty)
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
3. Netlify > Site settings > Environment variables — copy from `.env.example`:
   `VITE_FIREBASE_*`, `VITE_CLOUDINARY_*`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`.
4. Deploy. Student form = `/`, admin = `/sysadmin` (no public link).

## Cloudinary setup (required for PDFs)
1. Create free account, create unsigned upload preset:
   folder `submissions/`, allowed formats `pdf,jpg,jpeg,png`.
2. Console > Settings > Security > check **Allow delivery of PDF and ZIP files**.

## Next steps
- Fill Firebase config in `js/firebase-config.js` (or env injection).
- Admin login: create user in Firebase Console > Authentication.
- See `memory/attachment-portal-requirements.md` for full spec.
