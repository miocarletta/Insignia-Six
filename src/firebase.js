import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "PASTE_API_KEY_ASLI_DISINI", 
  authDomain: "insignia-six.firebaseapp.com",
  projectId: "insignia-six",
  storageBucket: "insignia-six.appspot.com",
  messagingSenderId: "854049425936",
  appId: "PASTE_APP_ID_ASLI_DISINI"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
