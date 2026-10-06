
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from "firebase/firestore";
import { getAuth, signInWithPopup, signOut as firebaseSignOut, GoogleAuthProvider } from "firebase/auth";

// Automatically loaded from firebase-applet-config.json
const firebaseConfig = {
  projectId: "silly-464018",
  appId: "1:758827907059:web:09504bb48db004e73f0486",
  apiKey: "AIzaSyBiFHQNHpQSu0mSB6IA1xbk52avhyvdurk",
  authDomain: "silly-464018.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-d8dc480e-411f-46a3-a886-c00dd14a31f3",
  storageBucket: "silly-464018.firebasestorage.app",
  messagingSenderId: "758827907059",
  measurementId: "",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Offline persistence (shared across tabs) so drafts survive flaky connections.
// Falls back to an in-memory cache where IndexedDB is unavailable (e.g. private mode).
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    }, firebaseConfig.firestoreDatabaseId);
  } catch (err) {
    console.warn("Failed to enable offline persistence", err);
    return initializeFirestore(app, { localCache: memoryLocalCache() }, firebaseConfig.firestoreDatabaseId);
  }
}
const db = createDb();

const signInWithGoogle = () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

const signOut = () => firebaseSignOut(auth);

export { auth, db, signInWithGoogle, signOut };
