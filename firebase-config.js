// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

// Your web app's Firebase configuration
// (estas chaves são públicas por natureza; quem protege os dados são as regras em firestore.rules)
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

// Quem criou o grupo entra com e-mail e senha; os demais recebem um login
// anônimo e invisível (um ID por aparelho, sem pedir nada).
export const auth = getAuth(app);
auth.languageCode = 'pt';

export const authReady = new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
        stop();
        if (user) {
            resolve(user);
            return;
        }
        signInAnonymously(auth)
            .then(result => resolve(result.user))
            .catch((error) => {
                console.error('Falha no login anônimo do Firebase:', error);
                reject(error);
            });
    });
});
