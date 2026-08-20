import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, where, orderBy, serverTimestamp } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";

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
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence for robust syncing
try {
  enableMultiTabIndexedDbPersistence(db);
} catch (err) {
  console.warn("Failed to enable offline persistence", err);
}

const signInWithGoogle = () => {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export { auth, db, signInWithGoogle };
