// Firebase init for the "Beetle Studio" project. The apiKey below is a
// public client identifier (not a secret) - access is enforced via
// Firestore security rules, not by hiding this value.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAIcfek98hnSfJZquIOBjcmDBSKAvMjX1w',
  authDomain: 'beetle-studio.firebaseapp.com',
  projectId: 'beetle-studio',
  storageBucket: 'beetle-studio.firebasestorage.app',
  messagingSenderId: '405417987229',
  appId: '1:405417987229:web:dea5803249830b90c19874',
  measurementId: 'G-ME2PE6WXLN',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
