// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCumfQU-IUeAL7r9-gh6XeUFMQ7TZPyz_Y",
  authDomain: "cardapiocasa-8ed83.firebaseapp.com",
  projectId: "cardapiocasa-8ed83",
  storageBucket: "cardapiocasa-8ed83.firebasestorage.app",
  messagingSenderId: "719201147169",
  appId: "1:719201147169:web:6338dd0a67970b02920660"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore and export it
export const db = getFirestore(app);
