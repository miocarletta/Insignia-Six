// Firebase Service Worker untuk push notification background
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// GANTI dengan config Firebase kamu (dari langkah 3 panduan)
firebase.initializeApp({
  apiKey: "GANTI_API_KEY",
  authDomain: "GANTI_PROJECT_ID.firebaseapp.com",
  projectId: "GANTI_PROJECT_ID",
  storageBucket: "GANTI_PROJECT_ID.appspot.com",
  messagingSenderId: "GANTI_SENDER_ID",
  appId: "GANTI_APP_ID"
});

const messaging = firebase.messaging();

// Handle notifikasi saat app di background / HP terkunci
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification;
  self.registration.showNotification(title || 'Insignia Six', {
    body: body || 'Pesan baru masuk',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'insignia-notif',
    renotify: true,
    data: payload.data,
  });
});
