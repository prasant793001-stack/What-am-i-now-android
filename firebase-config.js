// Paste the values from Firebase console → Project settings → Your apps → Web app → "SDK setup and configuration" (Config).
// These keys are safe to put on GitHub: access is controlled by the Firestore rules in firestore.rules.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

// Optional: Google Calendar phone alarms. Paste the OAuth "Client ID" from Google Cloud (README step 5).
export const googleClientId = "PASTE_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";
