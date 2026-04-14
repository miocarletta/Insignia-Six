import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyDfbXYAfQtjM6htcEqR",
  authDomain: "insignia-six.firebaseapp.com",
  projectId: "insignia-six",
  storageBucket: "insignia-six.firebasestorage.app",
  messagingSenderId: "854049425936",
  appId: "1:854049425936:web:aba18be6396f9a0d20d767",
  measurementId: "G-QGD1Z4C8EL"
};

export const VAPID_KEY = "BCymawSIDV-GGgBnZyjADKE77P-w51OKigOOqx_3ICNY4OqYqeC6E-8vv4yAQkmaVbHeLrU9rriLLEGSda1bDFo";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

export async function requestNotifPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      return token;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function onForegroundMessage(callback) {
  return onMessage(messaging, callback);
}
