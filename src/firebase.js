import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "API_KEY_KAMU",
  authDomain: "insignia-six.firebaseapp.com",
  projectId: "insignia-six",
  storageBucket: "insignia-six.appspot.com",
  messagingSenderId: "854049425936",
  appId: "APP_ID_KAMU"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
