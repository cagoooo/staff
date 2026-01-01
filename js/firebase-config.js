// Firebase Configuration Module
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDGGD24GfSUcPrXbgoi0OSHogXR_wfVrNA",
    authDomain: "smes-e1dc3.firebaseapp.com",
    projectId: "smes-e1dc3",
    storageBucket: "smes-e1dc3.firebasestorage.app",
    messagingSenderId: "626362737802",
    appId: "1:626362737802:web:5437ee537f575edec97973"
};

export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("Firebase connected!");
} catch (e) {
    console.error("Firebase init failed:", e);
}

export { app, auth, db };
