import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfbXYAfQtjM6htcEqRBTBRRo3HGggW8j4", 
  authDomain: "insignia-six.firebaseapp.com",
  projectId: "insignia-six",
  storageBucket: "insignia-six.appspot.com",
  messagingSenderId: "854049425936",
  appId: "1:854049425936:web:7d6fda9b81e0b2de64d895"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
