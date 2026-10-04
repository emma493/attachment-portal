// Firebase web config — from Firebase Console > Project settings > Your apps.
// Project: inter-72954 (production). API key is public for web SDK (enforced by
// Firebase Auth / Firestore rules, not by hiding the key).
// Override in production via Netlify snippet:
// window.__FIREBASE_CONFIG__ = {...}; window.__CLOUDINARY_CONFIG__ = {...};
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";

const envConfig =
  (typeof window !== "undefined" && window.__FIREBASE_CONFIG__) || {};
const envCloudinary =
  (typeof window !== "undefined" && window.__CLOUDINARY_CONFIG__) || {};

export const firebaseConfig = {
  apiKey: envConfig.apiKey || "AIzaSyA8kh61kiL2FhSy2OlXHk_ffGekcMjd9RM",
  authDomain: envConfig.authDomain || "inter-72954.firebaseapp.com",
  projectId: envConfig.projectId || "inter-72954",
  storageBucket: envConfig.storageBucket || "inter-72954.firebasestorage.app",
  messagingSenderId: envConfig.messagingSenderId || "699016490794",
  appId: envConfig.appId || "1:699016490794:web:587f76d218caad1bffb853",
  measurementId: envConfig.measurementId || "G-3J7DB6CTMN",
};
export const cloudinaryConfig = {
  cloudName: envCloudinary.cloudName || "gpsslmw7",
  uploadPreset: envCloudinary.uploadPreset || "submissions",
  // NOTE: never put api_key / api_secret here — frontend uses unsigned
  // preset only. Secrets belong in Netlify env for Functions, if ever needed.
};
export const MAX_FILE_MB = 5;
export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];

const isConfigured = firebaseConfig.apiKey !== "PASTE_ME";

let app = null;
let db = null;
let auth = null;
let analytics = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // Analytics is optional — only in browser, only if supported
  analyticsSupported()
    .then((ok) => {
      if (ok) {
        try {
          analytics = getAnalytics(app);
        } catch (e) {
          console.warn("[firebase-config] analytics init skipped:", e?.message);
        }
      }
    })
    .catch(() => {});
} else {
  console.warn(
    "[firebase-config] Firebase not configured — paste keys in js/firebase-config.js " +
      "or inject window.__FIREBASE_CONFIG__ via Netlify snippet."
  );
}

export { app, db, auth, analytics, isConfigured };
