import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// GANTI semua nilai ini dengan config Firebase kamu (dari langkah 3 panduan)
const firebaseConfig = {
  apiKey: "GANTI_API_KEY",
  authDomain: "GANTI_PROJECT_ID.firebaseapp.com",
  projectId: "GANTI_PROJECT_ID",
  storageBucket: "GANTI_PROJECT_ID.appspot.com",
  messagingSenderId: "GANTI_SENDER_ID",
  appId: "GANTI_APP_ID"
};

// GANTI dengan VAPID key kamu (dari langkah 4 panduan)
export const VAPID_KEY = "GANTI_VAPID_KEY";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// Minta izin notifikasi & ambil FCM token
export async function requestNotifPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      return token;
    }
    return null;
  } catch (e) {
    console.error('Notif permission error:', e);
    return null;
  }
}

// Handle notif saat app terbuka (foreground)
export function onForegroundMessage(callback) {
  return onMessage(messaging, callback);
}
