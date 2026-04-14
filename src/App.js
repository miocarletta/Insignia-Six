import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  limit, doc, setDoc, serverTimestamp, getDoc
} from 'firebase/firestore';
import { db, requestNotifPermission, onForegroundMessage } from './firebase';
import { playTone } from './audio';

// ── Member data ───────────────────────────────────────────────────────────────
const VALID_CODES = ['I.S-01','I.S-02','I.S-03','I.S-04','I.S-05','I.S-06'];
const MEMBER_DATA = {
  'I.S-01': { name:'Mio',   avatar:'◈', vibe:'melankolis', color:'#a8b8d0' },
  'I.S-02': { name:'Pena',  avatar:'⬡', vibe:'dingin',     color:'#7090b8' },
  'I.S-03': { name:'Vania', avatar:'◇', vibe:'elegan',     color:'#c0cce0' },
  'I.S-04': { name:'Mizu',  avatar:'⬟', vibe:'ceria',      color:'#90b8d8' },
  'I.S-05': { name:'Pulu',  avatar:'◆', vibe:'elegan',     color:'#b0bcd0' },
  'I.S-06': { name:'Al',    avatar:'⬠', vibe:'melankolis', color:'#8898b8' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts.toMillis?.() || 0;
  if (d < 60000) return 'baru saja';
  if (d < 3600000) return `${Math.floor(d/60000)}m lalu`;
  if (d < 86400000) return `${Math.floor(d/3600000)}j lalu`;
  return `${Math.floor(d/86400000)}h lalu`;
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]         = useState('login');
  const [code, setCode]             = useState('');
  const [codeError, setCodeError]   = useState('');
  const [user, setUser]             = useState(null);
  const [tab, setTab]               = useState('messages');
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [members, setMembers]       = useState({});
  const [notifs, setNotifs]         = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callActive, setCallActive] = useState(false);
  const [callSec, setCallSec]       = useState(0);
  const [glitch, setGlitch]         = useState(false);
  const [fcmToken, setFcmToken]     = useState(null);

  const messagesEndRef = useRef(null);
  const lastMsgId      = useRef(null);
  const lastCallId     = useRef(null);
  const callTimerRef   = useRef(null);
  const unsubRefs      = useRef([]);

  // Glitch effect
  useEffect(() => {
    const t = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 120);
    }, 6000 + Math.random() * 4000);
    return () => clearInterval(t);
  }, []);

  // Push notif helper
  const pushNotif = useCallback((text, fromCode) => {
    const id = Date.now() + Math.random();
    const color = MEMBER_DATA[fromCode]?.color || '#8898b8';
    setNotifs(n => [...n, { id, text, color }]);
    setTimeout(() => setNotifs(n => n.filter(x => x.id !== id)), 4500);
  }, []);

  // Login
  const handleLogin = async () => {
    const t = code.trim();
    if (!VALID_CODES.includes(t)) {
      setCodeError('Kode tidak dikenali.');
      setGlitch(true); setTimeout(() => setGlitch(false), 300);
      return;
    }
    const m = MEMBER_DATA[t];
    const userData = { code: t, ...m };
    setUser(userData);
    setScreen('app');
    setCodeError('');

    // Request FCM token for push notifications
    const token = await requestNotifPermission();
    if (token) {
      setFcmToken(token);
      // Save token to Firestore so server can send notifs to this device
      await setDoc(doc(db, 'fcm_tokens', t), {
        token, code: t, name: m.name, updatedAt: serverTimestamp()
      });
    }

    // Update online presence
    await setDoc(doc(db, 'presence', t), {
      code: t, name: m.name, avatar: m.avatar, color: m.color,
      lastSeen: serverTimestamp(), online: true
    });
  };

  // Setup Firestore listeners after login
  useEffect(() => {
    if (!user) return;

    // 1) Messages listener (realtime)
    const msgsQ = query(collection(db, 'messages'), orderBy('ts', 'desc'), limit(100));
    const unsubMsgs = onSnapshot(msgsQ, (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
      setMessages(msgs);

      // Play tone for new incoming messages
      if (msgs.length > 0) {
        const newest = msgs[msgs.length - 1];
        if (newest.id !== lastMsgId.current && newest.senderCode !== user.code) {
          if (lastMsgId.current !== null) {
            playTone(MEMBER_DATA[newest.senderCode]?.vibe || 'elegan', false);
            pushNotif(`💬 ${newest.sender}: ${newest.text.slice(0,36)}${newest.text.length>36?'…':''}`, newest.senderCode);
          }
        }
        lastMsgId.current = newest.id;
      }
    });

    // 2) Presence listener (who's online)
    const unsubPresence = onSnapshot(collection(db, 'presence'), (snap) => {
      const mems = {};
      snap.docs.forEach(d => { mems[d.id] = d.data(); });
      setMembers(mems);
    });

    // 3) Calls listener
    const unsubCalls = onSnapshot(doc(db, 'calls', 'active'), (snap) => {
      if (!snap.exists()) return;
      const c = snap.data();
      if (c.to === user.code && c.status === 'ringing' && c.id !== lastCallId.current) {
        lastCallId.current = c.id;
        setIncomingCall(c); setCallActive(false);
        playTone(MEMBER_DATA[c.fromCode]?.vibe || 'elegan', true);
        pushNotif(`📞 Panggilan dari ${c.fromName}`, c.fromCode);
      }
      if (c.status === 'ended' && lastCallId.current === c.id) {
        setIncomingCall(null); setCallActive(false);
        clearInterval(callTimerRef.current); setCallSec(0);
      }
    });

    // 4) Foreground FCM messages
    const unsubFCM = onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      pushNotif(`🔔 ${title || ''}: ${body || ''}`, '');
    });

    unsubRefs.current = [unsubMsgs, unsubPresence, unsubCalls, unsubFCM];

    // Heartbeat presence
    const heartbeat = setInterval(async () => {
      await setDoc(doc(db, 'presence', user.code), {
        code: user.code, name: user.name, avatar: user.avatar, color: user.color,
        lastSeen: serverTimestamp(), online: true
      });
    }, 10000);

    return () => {
      unsubRefs.current.forEach(u => typeof u === 'function' && u());
      clearInterval(heartbeat);
    };
  }, [user, pushNotif]);

  useEffect(() => {
    if (tab === 'messages') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || !user) return;
    const text = input.trim();
    setInput('');
    await addDoc(collection(db, 'messages'), {
      sender: user.name, senderCode: user.code,
      avatar: user.avatar, color: user.color,
      text, ts: serverTimestamp()
    });
  };

  // Call member
  const callMember = async (targetCode) => {
    if (!user) return;
    const callData = {
      id: Date.now(), fromCode: user.code, fromName: user.name,
      to: targetCode, toName: MEMBER_DATA[targetCode]?.name,
      status: 'ringing', ts: serverTimestamp()
    };
    await setDoc(doc(db, 'calls', 'active'), callData);
    pushNotif(`📞 Memanggil ${MEMBER_DATA[targetCode]?.name}…`, targetCode);
    setTimeout(async () => {
      await setDoc(doc(db, 'calls', 'active'), { ...callData, status: 'ended' });
    }, 22000);
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    setCallActive(true); setCallSec(0);
    clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => setCallSec(s => s + 1), 1000);
    await setDoc(doc(db, 'calls', 'active'), { ...incomingCall, status: 'active' });
  };
  const declineCall = async () => {
    if (!incomingCall) return;
    setIncomingCall(null); setCallActive(false);
    await setDoc(doc(db, 'calls', 'active'), { ...incomingCall, status: 'ended' });
  };
  const endCall = async () => {
    clearInterval(callTimerRef.current); setCallSec(0);
    setIncomingCall(null); setCallActive(false);
    if (incomingCall) await setDoc(doc(db, 'calls', 'active'), { ...incomingCall, status: 'ended' });
  };

  const logout = async () => {
    if (user) {
      await setDoc(doc(db, 'presence', user.code), {
        code: user.code, name: user.name, avatar: user.avatar, color: user.color,
        lastSeen: serverTimestamp(), online: false
      });
    }
    unsubRefs.current.forEach(u => typeof u === 'function' && u());
    setUser(null); setScreen('login'); setCode(''); setMessages([]);
    lastMsgId.current = null;
  };

  const fmtCallTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const onlineList  = Object.values(members).filter(m => {
    if (!m.lastSeen) return false;
    const ms = m.lastSeen.toMillis?.() || 0;
    return Date.now() - ms < 20000;
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (screen === 'login') return (
    <div style={S.loginBg}>
      <div style={S.noise} />
      <div style={{ ...S.loginBox, ...(glitch ? S.glitch : {}) }}>
        <div style={S.loginGlow} />
        <div style={S.logoRow}>
          <span style={S.logoHex}>⬡</span>
          <div>
            <div style={S.logoTitle}>INSIGNIA SIX</div>
            <div style={S.logoSub}>ENCRYPTED CHANNEL</div>
          </div>
        </div>
        <div style={S.loginDivider} />
        <div style={S.loginLabel}>KODE AKSES</div>
        <div style={S.loginInputRow}>
          <input
            style={S.loginInput}
            value={code}
            onChange={e => { setCode(e.target.value); setCodeError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="I.S-XX"
            maxLength={6}
            spellCheck={false}
            autoComplete="off"
          />
          <button style={S.loginArrow} onClick={handleLogin}>→</button>
        </div>
        {codeError && <div style={S.loginError}>{codeError}</div>}
        <div style={S.loginHint}>Kode diberikan oleh pemimpin Insignia</div>
      </div>
    </div>
  );

  // ── APP ───────────────────────────────────────────────────────────────────
  return (
    <div style={S.appRoot}>
      <div style={S.noise} />

      {/* Notifs */}
      <div style={S.notifStack}>
        {notifs.map(n => (
          <div key={n.id} style={{ ...S.notifPill, borderLeftColor: n.color }}>
            {n.text}
          </div>
        ))}
      </div>

      {/* Incoming call */}
      {incomingCall && !callActive && (
        <div style={S.callOverlay}>
          <div style={S.callBox}>
            <div style={{ fontSize:52, marginBottom:12, color:MEMBER_DATA[incomingCall.fromCode]?.color }}>
              {MEMBER_DATA[incomingCall.fromCode]?.avatar}
            </div>
            <div style={S.callName}>{incomingCall.fromName}</div>
            <div style={S.callSub}>Panggilan masuk…</div>
            <div style={S.callBtns}>
              <button style={S.callDecline} onClick={declineCall}>✕ Tolak</button>
              <button style={S.callAnswer} onClick={answerCall}>✓ Angkat</button>
            </div>
          </div>
        </div>
      )}

      {/* Active call bar */}
      {incomingCall && callActive && (
        <div style={S.activeBar}>
          <span>📞 {incomingCall.fromName} · {fmtCallTime(callSec)}</span>
          <button style={S.endBtn} onClick={endCall}>Tutup</button>
        </div>
      )}

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerL}>
          <span style={S.headerHex}>⬡</span>
          <span style={S.headerTitle}>INSIGNIA SIX</span>
          <span style={{ ...S.dot, background: onlineList.length > 0 ? '#6888b0' : '#283848', boxShadow: onlineList.length > 0 ? '0 0 6px #6888b0' : 'none' }} />
        </div>
        <div style={{ color: user?.color, fontSize:11, letterSpacing:1 }}>{user?.avatar} {user?.name}</div>
      </div>

      {/* Body */}
      <div style={S.body}>

        {/* MESSAGES */}
        {tab === 'messages' && (
          <div style={S.chatWrap}>
            <div style={S.msgList}>
              {messages.length === 0 && (
                <div style={S.emptyState}>
                  <div style={{ fontSize:38, marginBottom:12, opacity:0.3 }}>◈</div>
                  <div>Saluran aman aktif</div>
                  <div style={{ fontSize:11, opacity:0.4, marginTop:4 }}>Mulai komunikasi</div>
                </div>
              )}
              {messages.map(m => {
                const isMe = m.senderCode === user?.code;
                return (
                  <div key={m.id} style={{ display:'flex', gap:8, alignItems:'flex-end', ...(isMe ? { flexDirection:'row-reverse' } : {}) }}>
                    <div style={{ fontSize:18, width:30, textAlign:'center', flexShrink:0, color:m.color||'#7888a8' }}>{m.avatar}</div>
                    <div style={{ maxWidth:'72%', padding:'8px 12px', borderRadius:4, border:'1px solid', background:isMe?`${m.color||'#506080'}1a`:'rgba(12,18,28,0.8)', borderColor:isMe?`${m.color||'#506080'}44`:'#101820' }}>
                      {!isMe && <div style={{ fontSize:9, letterSpacing:2, marginBottom:4, color:m.color||'#7888a8' }}>{m.sender}</div>}
                      <div style={{ color:'#a0b4c8', fontSize:13, lineHeight:1.55, wordBreak:'break-word' }}>{m.text}</div>
                      <div style={{ fontSize:9, color:'#243040', marginTop:4, textAlign:'right', letterSpacing:1 }}>{fmtTime(m.ts)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div style={S.inputBar}>
              <input
                style={S.textInput}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
                placeholder="Kirim pesan terenkripsi…"
                maxLength={500}
              />
              <button style={{ ...S.sendBtn, background: user?.color || '#506080' }} onClick={sendMessage}>↑</button>
            </div>
          </div>
        )}

        {/* RADAR */}
        {tab === 'radar' && (
          <div style={S.scrollArea}>
            <div style={S.sectionTitle}>◎ RADAR INSIGNIA</div>
            <div style={S.radarCircle}>
              {[12,30,48].map(p => <div key={p} style={{ position:'absolute', inset:`${p}%`, borderRadius:'50%', border:`1px solid rgba(60,100,180,${0.06+p*0.002})` }} />)}
              <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'rgba(60,100,180,0.05)' }} />
              <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(60,100,180,0.05)' }} />
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:20, color:'#5878a8' }}>{user?.avatar}</div>
              {onlineList.filter(m => m.code !== user?.code).map((m, i, arr) => {
                const a = (i / Math.max(arr.length, 1)) * 360, r = 30 + (i % 2) * 18;
                const x = 50 + r * Math.cos((a-90)*Math.PI/180), y = 50 + r * Math.sin((a-90)*Math.PI/180);
                return (
                  <div key={m.code} style={{ position:'absolute', left:`${x}%`, top:`${y}%`, transform:'translate(-50%,-50%)', textAlign:'center', fontSize:16, color:m.color||'#7888a8' }}>
                    {m.avatar}
                    <div style={{ fontSize:8, color:'#304c68', whiteSpace:'nowrap', marginTop:1 }}>{m.name}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize:9, color:'#243040', letterSpacing:3, marginBottom:10 }}>🔵 ONLINE — {onlineList.length}</div>
            {VALID_CODES.map(c => {
              const m = members[c];
              const isOnline = m && (Date.now() - (m.lastSeen?.toMillis?.() || 0)) < 20000;
              const isMe = c === user?.code;
              return (
                <div key={c} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid #0c141e', opacity: isOnline ? 1 : 0.4 }}>
                  <span style={{ fontSize:20, color: isOnline ? MEMBER_DATA[c]?.color : '#2a3848' }}>{MEMBER_DATA[c]?.avatar}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color: isOnline ? MEMBER_DATA[c]?.color : '#3a4858', letterSpacing:1 }}>
                      {MEMBER_DATA[c]?.name}
                      {isMe && <span style={{ fontSize:8, color:'#4868a0', letterSpacing:2, border:'1px solid #2a3a58', padding:'1px 4px', borderRadius:2, marginLeft:6 }}> KAMU</span>}
                    </div>
                    <div style={{ fontSize:10, color:'#243040', letterSpacing:1, marginTop:2 }}>
                      {isOnline ? '● Online' : m ? timeAgo(m.lastSeen) : 'Belum pernah aktif'}
                    </div>
                  </div>
                  {!isMe && (
                    <button style={{ background:'none', border:`1px solid ${isOnline?MEMBER_DATA[c]?.color+'66':'#1e2a38'}`, borderRadius:3, padding:'4px 10px', cursor:'pointer', fontSize:13, color:isOnline?MEMBER_DATA[c]?.color:'#3a4858', fontFamily:"'Courier New',monospace" }}
                      onClick={() => callMember(c)}>📞</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div style={S.scrollArea}>
            <div style={S.sectionTitle}>⚙ PENGATURAN</div>
            <div style={{ display:'flex', alignItems:'center', gap:16, padding:16, background:'rgba(12,18,28,0.7)', border:`1px solid ${user?.color||'#506080'}33`, borderRadius:4, marginBottom:24 }}>
              <div style={{ fontSize:40, color:user?.color }}>{user?.avatar}</div>
              <div>
                <div style={{ fontSize:18, color:user?.color, letterSpacing:2 }}>{user?.name}</div>
                <div style={{ fontSize:10, color:'#304c68', letterSpacing:2, marginTop:4 }}>{user?.code} · {user?.vibe?.toUpperCase()}</div>
                <div style={{ fontSize:9, color:fcmToken?'#4a8a4a':'#604040', marginTop:4, letterSpacing:1 }}>
                  {fcmToken ? '● Notifikasi aktif' : '○ Notifikasi belum diizinkan'}
                </div>
              </div>
            </div>

            {!fcmToken && (
              <button style={{ width:'100%', padding:'12px 0', background:'rgba(30,50,80,0.3)', border:'1px solid #2a4060', color:'#6888b0', fontSize:11, letterSpacing:2, cursor:'pointer', fontFamily:"'Courier New',monospace", borderRadius:3, marginBottom:20 }}
                onClick={async () => {
                  const token = await requestNotifPermission();
                  if (token) {
                    setFcmToken(token);
                    await setDoc(doc(db, 'fcm_tokens', user.code), { token, code:user.code, name:user.name, updatedAt:serverTimestamp() });
                  }
                }}>
                🔔 AKTIFKAN NOTIFIKASI
              </button>
            )}

            {[
              { l:'Nada Dering', d:'Nada kustom sesuai vibes tiap anggota', on:true },
              { l:'Notifikasi Pesan', d:'Pop-up & bunyi saat pesan masuk', on:true },
              { l:'Notifikasi Panggilan', d:'Overlay saat ada panggilan masuk', on:true },
              { l:'Tampil di Radar', d:'Anggota lain melihat kamu online', on:true },
              { l:'Mode Privasi', d:'Sembunyikan status & last seen', on:false },
            ].map(({ l, d, on }) => (
              <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 0', borderBottom:'1px solid #0c141e' }}>
                <div><div style={{ fontSize:13, color:'#8898b8', letterSpacing:1 }}>{l}</div><div style={{ fontSize:10, color:'#243040', letterSpacing:0.5, marginTop:3 }}>{d}</div></div>
                <div style={{ color: on ? user?.color : '#2a3848', fontSize:18 }}>{on ? '●' : '○'}</div>
              </div>
            ))}

            <div style={{ fontSize:10, color:'#304c68', letterSpacing:4, margin:'24px 0 12px', textAlign:'center' }}>🎵 PREVIEW NADA DERING</div>
            {[
              { vibe:'melankolis', label:'Lembut & Melankolis', who:'Mio, Al' },
              { vibe:'dingin',     label:'Misterius & Dingin',  who:'Pena' },
              { vibe:'elegan',     label:'Kalem & Elegan',      who:'Vania, Pulu' },
              { vibe:'ceria',      label:'Energik & Ceria',     who:'Mizu' },
            ].map(({ vibe, label, who }) => (
              <div key={vibe} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 0', borderBottom:'1px solid #0c141e' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:'#90a8c4', letterSpacing:1 }}>{label}</div>
                  <div style={{ fontSize:10, color:'#2a3848', marginTop:2 }}>{who}</div>
                </div>
                <button style={S.playBtn} onClick={() => playTone(vibe, false)}>▶ Pesan</button>
                <button style={S.playBtn} onClick={() => playTone(vibe, true)}>📞 Call</button>
              </div>
            ))}

            <button style={S.logoutBtn} onClick={logout}>← KELUAR</button>
            <div style={{ fontSize:9, color:'#141e2a', textAlign:'center', marginTop:12, letterSpacing:2 }}>INSIGNIA SIX v6.9 · ENCRYPTED</div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={S.bottomNav}>
        {[
          { id:'messages', icon:'💬', label:'Pesan' },
          { id:'radar',    icon:'📡', label:'Radar' },
          { id:'settings', icon:'⚙',  label:'Privasi' },
        ].map(t => (
          <button key={t.id}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', padding:'6px 0', color:tab===t.id?(user?.color||'#8898b8'):'#2a3848', fontFamily:"'Courier New',monospace" }}
            onClick={() => setTab(t.id)}>
            <span style={{ fontSize:18 }}>{t.icon}</span>
            <span style={{ fontSize:9, letterSpacing:2 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const noiseUrl = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const S = {
  noise:          { position:'fixed', inset:0, backgroundImage:noiseUrl, backgroundSize:'150px', opacity:0.03, pointerEvents:'none', zIndex:998 },
  loginBg:        { minHeight:'100vh', background:'#080b10', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Courier New',monospace", position:'relative', overflow:'hidden' },
  loginBox:       { position:'relative', background:'rgba(12,18,28,0.97)', border:'1px solid #1a2840', borderRadius:6, padding:'40px 32px', width:'100%', maxWidth:340, boxShadow:'0 0 80px rgba(60,100,180,0.07)' },
  glitch:         { transform:'translate(2px,-1px) skewX(-0.3deg)', filter:'hue-rotate(6deg)' },
  loginGlow:      { position:'absolute', inset:0, borderRadius:6, background:'radial-gradient(ellipse at 50% 0%,rgba(60,100,180,0.05) 0%,transparent 70%)', pointerEvents:'none' },
  logoRow:        { display:'flex', alignItems:'center', gap:14, marginBottom:30 },
  logoHex:        { fontSize:34, color:'#5878a8', textShadow:'0 0 20px rgba(60,100,200,0.45)' },
  logoTitle:      { fontSize:18, fontWeight:'bold', color:'#b8cce0', letterSpacing:6 },
  logoSub:        { fontSize:9, color:'#243448', letterSpacing:4, marginTop:3 },
  loginDivider:   { height:1, background:'linear-gradient(90deg,transparent,#1a2840,transparent)', margin:'0 0 24px' },
  loginLabel:     { fontSize:10, color:'#304c68', letterSpacing:4, marginBottom:12 },
  loginInputRow:  { display:'flex', gap:8, marginBottom:10 },
  loginInput:     { flex:1, background:'rgba(8,12,20,0.8)', border:'1px solid #1a2840', borderRadius:3, color:'#90a8c4', padding:'11px 14px', fontSize:14, letterSpacing:3, outline:'none', fontFamily:"'Courier New',monospace", caretColor:'#5878a8' },
  loginArrow:     { background:'#304c68', border:'none', borderRadius:3, color:'#b8cce0', padding:'0 18px', fontSize:16, fontWeight:'bold', cursor:'pointer' },
  loginError:     { color:'#b06070', fontSize:11, marginBottom:8, letterSpacing:1 },
  loginHint:      { fontSize:10, color:'#182434', letterSpacing:1, textAlign:'center', marginTop:10 },
  appRoot:        { minHeight:'100vh', maxWidth:430, margin:'0 auto', background:'#080b10', fontFamily:"'Courier New',monospace", display:'flex', flexDirection:'column', position:'relative' },
  notifStack:     { position:'fixed', top:58, right:8, zIndex:9999, display:'flex', flexDirection:'column', gap:6, maxWidth:280 },
  notifPill:      { background:'rgba(12,18,28,0.97)', borderLeft:'3px solid', padding:'8px 12px', borderRadius:3, fontSize:11, color:'#90a8c4', letterSpacing:0.5, boxShadow:'0 4px 20px rgba(0,0,0,0.6)' },
  callOverlay:    { position:'fixed', inset:0, zIndex:9998, background:'rgba(4,8,14,0.93)', display:'flex', alignItems:'center', justifyContent:'center' },
  callBox:        { background:'rgba(12,18,28,0.99)', border:'1px solid #1a2840', borderRadius:8, padding:'40px 32px', textAlign:'center', width:280 },
  callName:       { fontSize:22, color:'#b8cce0', letterSpacing:3, marginBottom:6 },
  callSub:        { fontSize:11, color:'#304c68', letterSpacing:2, marginBottom:30 },
  callBtns:       { display:'flex', gap:12 },
  callDecline:    { flex:1, padding:'12px 0', background:'rgba(100,30,40,0.25)', border:'1px solid #502030', color:'#b06070', borderRadius:4, cursor:'pointer', fontFamily:"'Courier New',monospace", fontSize:12, letterSpacing:1 },
  callAnswer:     { flex:1, padding:'12px 0', background:'rgba(30,60,100,0.25)', border:'1px solid #203860', color:'#6888b0', borderRadius:4, cursor:'pointer', fontFamily:"'Courier New',monospace", fontSize:12, letterSpacing:1 },
  activeBar:      { background:'rgba(14,22,34,0.98)', borderBottom:'1px solid #1a2840', padding:'8px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'#6888b0', letterSpacing:1 },
  endBtn:         { background:'rgba(80,20,30,0.4)', border:'1px solid #502030', color:'#b06070', padding:'4px 12px', borderRadius:3, cursor:'pointer', fontFamily:"'Courier New',monospace", fontSize:11 },
  header:         { background:'rgba(8,11,16,0.98)', borderBottom:'1px solid #101820', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100 },
  headerL:        { display:'flex', alignItems:'center', gap:8 },
  headerHex:      { fontSize:18, color:'#4868a0', textShadow:'0 0 12px rgba(60,100,200,0.35)' },
  headerTitle:    { fontSize:13, fontWeight:'bold', color:'#7888a8', letterSpacing:5 },
  dot:            { width:6, height:6, borderRadius:'50%' },
  body:           { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  chatWrap:       { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  msgList:        { flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:10, scrollbarWidth:'thin', scrollbarColor:'#1a2840 transparent' },
  emptyState:     { flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#1e2e40', padding:40, textAlign:'center', fontSize:13, letterSpacing:1, marginTop:60 },
  inputBar:       { padding:'12px 16px', background:'rgba(8,11,16,0.98)', borderTop:'1px solid #101820', display:'flex', gap:8 },
  textInput:      { flex:1, background:'rgba(8,12,18,0.9)', border:'1px solid #101820', borderRadius:3, color:'#90a8c4', padding:'10px 14px', fontSize:13, outline:'none', fontFamily:"'Courier New',monospace", caretColor:'#5878a8' },
  sendBtn:        { border:'none', borderRadius:3, color:'#080b10', padding:'0 16px', fontSize:16, fontWeight:'bold', cursor:'pointer' },
  scrollArea:     { flex:1, overflowY:'auto', padding:16, scrollbarWidth:'thin', scrollbarColor:'#1a2840 transparent' },
  sectionTitle:   { fontSize:10, color:'#304c68', letterSpacing:4, marginBottom:16, textAlign:'center' },
  radarCircle:    { width:210, height:210, borderRadius:'50%', margin:'0 auto 24px', border:'1px solid #101820', position:'relative', background:'radial-gradient(circle,rgba(12,18,28,0.9) 0%,rgba(8,11,16,0.95) 100%)' },
  playBtn:        { background:'rgba(12,18,28,0.8)', border:'1px solid #1a2840', color:'#5878a8', padding:'5px 10px', borderRadius:3, cursor:'pointer', fontFamily:"'Courier New',monospace", fontSize:10, letterSpacing:1 },
  logoutBtn:      { marginTop:28, width:'100%', padding:'12px 0', background:'transparent', border:'1px solid #182030', color:'#604050', fontSize:10, letterSpacing:3, cursor:'pointer', fontFamily:"'Courier New',monospace", borderRadius:3 },
  bottomNav:      { background:'rgba(8,11,16,0.98)', borderTop:'1px solid #101820', display:'flex', padding:'8px 0 4px', position:'sticky', bottom:0 },
};
