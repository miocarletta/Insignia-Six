import { useState, useEffect, useRef, useCallback } from "react";

const VALID_CODES = ["I.S-01","I.S-02","I.S-03","I.S-04","I.S-05","I.S-06"];
const MEMBERS = {
  "I.S-01": { name:"Mio",   avatar:"◈", vibe:"melankolis", color:"#a8b8d0" },
  "I.S-02": { name:"Pena",  avatar:"⬡", vibe:"dingin",     color:"#7090b8" },
  "I.S-03": { name:"Vania", avatar:"◇", vibe:"elegan",     color:"#c0cce0" },
  "I.S-04": { name:"Mizu",  avatar:"⬟", vibe:"ceria",      color:"#90b8d8" },
  "I.S-05": { name:"Pulu",  avatar:"◆", vibe:"elegan",     color:"#b0bcd0" },
  "I.S-06": { name:"Al",    avatar:"⬠", vibe:"melankolis", color:"#8898b8" },
};

// ── AUDIO ─────────────────────────────────────────────────────────────────────
let _ctx = null;
function getACtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  return _ctx;
}
function unlockAudio() {
  try { const c = getACtx(); if (c.state === "suspended") c.resume(); } catch(e) {}
}
function playTone(vibe = "elegan", isCall = false) {
  try {
    const ctx = getACtx();
    if (ctx.state === "suspended") ctx.resume();
    const vol = ctx.createGain();
    vol.gain.setValueAtTime(isCall ? 0.22 : 0.14, ctx.currentTime);
    vol.connect(ctx.destination);
    const T = ctx.currentTime;
    const go = () => {
      if (vibe === "melankolis") {
        [[293.66,0],[349.23,0.22],[440,0.44],[349.23,0.66]].forEach(([f,d])=>{
          const o=ctx.createOscillator(),g=ctx.createGain(); o.type="sine"; o.frequency.value=f;
          g.gain.setValueAtTime(0,T+d); g.gain.linearRampToValueAtTime(0.7,T+d+0.07); g.gain.exponentialRampToValueAtTime(0.001,T+d+0.85);
          o.connect(g); g.connect(vol); o.start(T+d); o.stop(T+d+0.9);
        });
      } else if (vibe === "dingin") {
        [70,140,210].forEach((f,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain(); o.type=i===0?"sawtooth":"sine"; o.frequency.value=f;
          g.gain.setValueAtTime(0,T); g.gain.linearRampToValueAtTime(i===0?0.5:0.18,T+0.15); g.gain.linearRampToValueAtTime(0,T+1.1);
          o.connect(g); g.connect(vol); o.start(T); o.stop(T+1.15);
        });
      } else if (vibe === "elegan") {
        [[880,0],[1108,0.18],[1318,0.38]].forEach(([f,d])=>{
          const o=ctx.createOscillator(),g=ctx.createGain(); o.type="sine"; o.frequency.value=f;
          g.gain.setValueAtTime(0,T+d); g.gain.linearRampToValueAtTime(0.5,T+d+0.03); g.gain.exponentialRampToValueAtTime(0.001,T+d+0.8);
          o.connect(g); g.connect(vol); o.start(T+d); o.stop(T+d+0.85);
        });
      } else if (vibe === "ceria") {
        [[523,0],[659,0.1],[784,0.2],[1047,0.32],[784,0.42],[659,0.52]].forEach(([f,d])=>{
          const o=ctx.createOscillator(),g=ctx.createGain(); o.type="triangle"; o.frequency.value=f;
          g.gain.setValueAtTime(0,T+d); g.gain.linearRampToValueAtTime(0.55,T+d+0.04); g.gain.exponentialRampToValueAtTime(0.001,T+d+0.38);
          o.connect(g); g.connect(vol); o.start(T+d); o.stop(T+d+0.42);
        });
      }
    };
    go();
    if (isCall) { setTimeout(go, 1500); setTimeout(go, 3000); }
  } catch(e) {}
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
async function sGet(k) { try { const r=await window.storage.get(k,true); return r?JSON.parse(r.value):null; } catch(e){return null;} }
async function sSet(k,v) { try { await window.storage.set(k,JSON.stringify(v),true); } catch(e){} }

function fmtTime(ts) { return new Date(ts).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}); }
function timeAgo(ts) {
  const d=Date.now()-ts;
  if(d<60000) return "baru saja";
  if(d<3600000) return `${Math.floor(d/60000)}m lalu`;
  return `${Math.floor(d/3600000)}j lalu`;
}
function dmKey(a,b) { return [a,b].sort().join("__"); }

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,  setScreen]  = useState("login");
  const [code,    setCode]    = useState("");
  const [err,     setErr]     = useState("");
  const [user,    setUser]    = useState(null);
  const [tab,     setTab]     = useState("public");
  const [dmWith,  setDmWith]  = useState(null);
  const [pubMsgs, setPubMsgs] = useState([]);
  const [dmMsgs,  setDmMsgs]  = useState([]);
  const [input,   setInput]   = useState("");
  const [presence,setPresence]= useState({});
  const [notifs,  setNotifs]  = useState([]);
  const [inCall,  setInCall]  = useState(null);
  const [callOn,  setCallOn]  = useState(false);
  const [callSec, setCallSec] = useState(0);
  const [notifOk, setNotifOk] = useState(false);
  const [unread,  setUnread]  = useState({});
  const [glitch,  setGlitch]  = useState(false);

  const endRef      = useRef(null);
  const pollRef     = useRef(null);
  const callTmrRef  = useRef(null);
  const prevPubLen  = useRef(0);
  const prevDmLen   = useRef(0);
  const lastCallId  = useRef(null);
  const audioUnlocked = useRef(false);

  useEffect(()=>{
    const t=setInterval(()=>{setGlitch(true);setTimeout(()=>setGlitch(false),130);},7000);
    return ()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    if("Notification" in window) setNotifOk(Notification.permission==="granted");
  },[]);

  const ua = useCallback(()=>{
    if(!audioUnlocked.current){ unlockAudio(); audioUnlocked.current=true; }
  },[]);

  const toast = useCallback((text, fromCode)=>{
    const id=Date.now()+Math.random();
    setNotifs(n=>[...n,{id,text,color:MEMBERS[fromCode]?.color||"#7888a8"}]);
    setTimeout(()=>setNotifs(n=>n.filter(x=>x.id!==id)),4200);
    if(notifOk && document.hidden){
      try{ new Notification(text,{icon:"/icon-192.png",vibrate:[200,100,200]}); }catch(e){}
    }
  },[notifOk]);

  const reqNotif = useCallback(async()=>{
    ua();
    try{
      const p=await Notification.requestPermission();
      const ok=p==="granted";
      setNotifOk(ok);
      toast(ok?"✅ Notifikasi berhasil diaktifkan!":"⚠️ Izin notifikasi ditolak. Aktifkan manual di pengaturan browser.",user?.code);
    }catch(e){ toast("⚠️ Browser tidak mendukung notifikasi",user?.code); }
  },[ua,toast,user]);

  // sync
  const sync = useCallback(async()=>{
    if(!user) return;
    // heartbeat
    const pres=(await sGet("is_pres"))||{};
    pres[user.code]={lastSeen:Date.now()};
    await sSet("is_pres",pres);
    setPresence({...pres});

    // public
    const pub=(await sGet("is_pub"))||[];
    if(pub.length>prevPubLen.current && prevPubLen.current>0){
      pub.slice(prevPubLen.current).forEach(m=>{
        if(m.senderCode!==user.code){
          playTone(MEMBERS[m.senderCode]?.vibe||"elegan",false);
          toast(`💬 ${m.sender}: ${m.text.slice(0,38)}${m.text.length>38?"…":""}`,m.senderCode);
        }
      });
    }
    prevPubLen.current=pub.length;
    setPubMsgs(pub.slice(-100));

    // active DM
    if(dmWith){
      const k="is_dm_"+dmKey(user.code,dmWith);
      const dms=(await sGet(k))||[];
      if(dms.length>prevDmLen.current && prevDmLen.current>0){
        dms.slice(prevDmLen.current).forEach(m=>{
          if(m.senderCode!==user.code){
            playTone(MEMBERS[m.senderCode]?.vibe||"elegan",false);
            toast(`🔒 ${m.sender}: ${m.text.slice(0,38)}`,m.senderCode);
          }
        });
      }
      prevDmLen.current=dms.length;
      setDmMsgs(dms.slice(-100));
    }

    // unread badges
    const newUr={};
    for(const c of VALID_CODES){
      if(c===user.code) continue;
      const k="is_dm_"+dmKey(user.code,c);
      const dms=(await sGet(k))||[];
      const rk="is_rd_"+dmKey(user.code,c)+"_"+user.code;
      const read=(await sGet(rk))||0;
      const incoming=dms.filter(m=>m.senderCode!==user.code).length;
      if(incoming>read) newUr[c]=incoming-read;
    }
    setUnread(newUr);

    // call
    const call=await sGet("is_call");
    if(call && call.to===user.code && call.status==="ringing" && call.id!==lastCallId.current){
      lastCallId.current=call.id;
      setInCall(call); setCallOn(false);
      playTone(MEMBERS[call.fromCode]?.vibe||"elegan",true);
      toast(`📞 Panggilan dari ${call.fromName}`,call.fromCode);
    }
    if(call && call.status==="ended" && call.id===lastCallId.current){
      setInCall(null); setCallOn(false);
      clearInterval(callTmrRef.current); setCallSec(0);
    }
  },[user,dmWith,toast]);

  useEffect(()=>{
    if(user){ sync(); pollRef.current=setInterval(sync,2000); return()=>clearInterval(pollRef.current); }
  },[user,sync]);

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[pubMsgs,dmMsgs,tab,dmWith]);

  const login=async()=>{
    ua();
    const t=code.trim();
    if(!VALID_CODES.includes(t)){setErr("Kode tidak dikenali.");setGlitch(true);setTimeout(()=>setGlitch(false),300);return;}
    const m=MEMBERS[t];
    setUser({code:t,...m}); setScreen("app"); setErr("");
    prevPubLen.current=0; prevDmLen.current=0;
  };

  const logout=async()=>{
    ua();
    clearInterval(pollRef.current);
    const pres=(await sGet("is_pres"))||{};
    delete pres[user.code];
    await sSet("is_pres",pres);
    setUser(null); setScreen("login"); setCode(""); setErr("");
    setPubMsgs([]); setDmMsgs([]); setPresence({}); setInCall(null); setUnread({});
    prevPubLen.current=0; prevDmLen.current=0; lastCallId.current=null;
  };

  const sendMsg=async()=>{
    if(!input.trim()||!user) return; ua();
    const msg={id:Date.now()+Math.random(),sender:user.name,senderCode:user.code,avatar:user.avatar,color:user.color,text:input.trim(),ts:Date.now()};
    setInput("");
    if(tab==="public"){
      const pub=(await sGet("is_pub"))||[];
      const upd=[...pub,msg].slice(-100);
      await sSet("is_pub",upd);
      prevPubLen.current=upd.length; setPubMsgs(upd);
    } else if(tab==="dm"&&dmWith){
      const k="is_dm_"+dmKey(user.code,dmWith);
      const dms=(await sGet(k))||[];
      const upd=[...dms,msg].slice(-100);
      await sSet(k,upd);
      prevDmLen.current=upd.length; setDmMsgs(upd);
      const rk="is_rd_"+dmKey(user.code,dmWith)+"_"+user.code;
      await sSet(rk,upd.filter(m=>m.senderCode!==user.code).length);
    }
  };

  const openDm=async(c)=>{
    ua(); setDmWith(c); setTab("dm"); prevDmLen.current=0;
    const k="is_dm_"+dmKey(user.code,c);
    const dms=(await sGet(k))||[];
    setDmMsgs(dms); prevDmLen.current=dms.length;
    const rk="is_rd_"+dmKey(user.code,c)+"_"+user.code;
    await sSet(rk,dms.filter(m=>m.senderCode!==user.code).length);
    setUnread(u=>{const n={...u};delete n[c];return n;});
  };

  const callM=async(tc)=>{
    ua();
    const c={id:Date.now(),fromCode:user.code,fromName:user.name,to:tc,toName:MEMBERS[tc]?.name,status:"ringing",ts:Date.now()};
    await sSet("is_call",c);
    toast(`📞 Memanggil ${MEMBERS[tc]?.name}…`,tc);
    setTimeout(async()=>await sSet("is_call",{...c,status:"ended"}),22000);
  };
  const answerCall=async()=>{
    if(!inCall) return; ua();
    setCallOn(true); setCallSec(0);
    clearInterval(callTmrRef.current);
    callTmrRef.current=setInterval(()=>setCallSec(s=>s+1),1000);
    await sSet("is_call",{...inCall,status:"active"});
  };
  const declineCall=async()=>{ if(!inCall) return; setInCall(null); setCallOn(false); await sSet("is_call",{...inCall,status:"ended"}); };
  const endCall=async()=>{ clearInterval(callTmrRef.current); setCallSec(0); setInCall(null); setCallOn(false); if(inCall) await sSet("is_call",{...inCall,status:"ended"}); };

  const fmt=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const online=Object.entries(presence).filter(([,v])=>Date.now()-v.lastSeen<14000).map(([k])=>k);
  const totalUr=Object.values(unread).reduce((a,b)=>a+b,0);

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if(screen==="login") return (
    <div style={S.bg} onClick={ua}>
      <div style={S.noise}/>
      <div style={{...S.card,...(glitch?S.glitch:{})}}>
        <div style={S.glow}/>
        <div style={S.logoRow}>
          <span style={S.hex}>⬡</span>
          <div><div style={S.logoTxt}>INSIGNIA SIX</div><div style={S.logoSub}>ENCRYPTED CHANNEL</div></div>
        </div>
        <div style={S.divider}/>
        <div style={S.lbl}>KODE AKSES</div>
        <div style={S.inputRow}>
          <input style={S.inp} value={code} onChange={e=>{setCode(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&login()} placeholder="I.S-XX" maxLength={6} spellCheck={false} autoComplete="off"/>
          <button style={S.arw} onClick={login}>→</button>
        </div>
        {err&&<div style={S.errTxt}>{err}</div>}
        <div style={S.hint}>Kode diberikan oleh pemimpin Insignia</div>
      </div>
    </div>
  );

  // ── APP ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.root} onClick={ua}>
      <div style={S.noise}/>

      {/* Toasts */}
      <div style={S.toasts}>
        {notifs.map(n=><div key={n.id} style={{...S.toast,borderLeftColor:n.color}}>{n.text}</div>)}
      </div>

      {/* Incoming call */}
      {inCall&&!callOn&&(
        <div style={S.overlay}>
          <div style={S.callCard}>
            <div style={{fontSize:52,color:MEMBERS[inCall.fromCode]?.color,marginBottom:10}}>{MEMBERS[inCall.fromCode]?.avatar}</div>
            <div style={{fontSize:20,color:"#b8cce0",letterSpacing:3,marginBottom:6}}>{inCall.fromName}</div>
            <div style={{fontSize:11,color:"#304c68",letterSpacing:2,marginBottom:26}}>Panggilan masuk…</div>
            <div style={{display:"flex",gap:10}}>
              <button style={S.decBtn} onClick={declineCall}>✕ Tolak</button>
              <button style={S.ansBtn} onClick={answerCall}>✓ Angkat</button>
            </div>
          </div>
        </div>
      )}

      {/* Active call */}
      {inCall&&callOn&&(
        <div style={S.callBar}>
          <span>📞 {inCall.fromName} · {fmt(callSec)}</span>
          <button style={S.endBtn} onClick={endCall}>Tutup</button>
        </div>
      )}

      {/* Header */}
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={S.hdrHex}>⬡</span>
          <span style={S.hdrTitle}>INSIGNIA SIX</span>
          <span style={{width:6,height:6,borderRadius:"50%",background:online.length>0?"#6888b0":"#283848",boxShadow:online.length>0?"0 0 6px #6888b0":"none"}}/>
        </div>
        <div style={{fontSize:11,color:user?.color,letterSpacing:1}}>{user?.avatar} {user?.name}</div>
      </div>

      {/* Sub nav */}
      <div style={S.subnav}>
        {[
          {id:"public",  icon:"🌐", label:"Publik"},
          {id:"dm",      icon:"🔒", label:`DM${totalUr>0?` (${totalUr})`:""}` },
          {id:"radar",   icon:"📡", label:"Radar"},
          {id:"settings",icon:"⚙",  label:"Privasi"},
        ].map(t=>(
          <button key={t.id}
            style={{...S.snBtn,...(tab===t.id?{...S.snOn,borderBottomColor:user?.color||"#6888b0"}:{})}}
            onClick={()=>{ua();if(t.id==="dm"&&!dmWith){const c=VALID_CODES.find(x=>x!==user?.code);if(c)openDm(c);}else setTab(t.id);}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={S.body}>

        {/* PUBLIC */}
        {tab==="public"&&(
          <div style={S.chatWrap}>
            <div style={S.chanHdr}>
              <span style={{color:"#304c68",fontSize:10,letterSpacing:3}}>◈ SALURAN UMUM</span>
              <span style={{fontSize:10,color:"#243040"}}>{online.length} online</span>
            </div>
            <div style={S.msgList}>
              {pubMsgs.length===0&&<Empty icon="◈" text="Saluran aman aktif" sub="Mulai komunikasi bersama"/>}
              {pubMsgs.map(m=><Bubble key={m.id} m={m} isMe={m.senderCode===user?.code}/>)}
              <div ref={endRef}/>
            </div>
            <InputBar input={input} setInput={setInput} send={sendMsg} color={user?.color} ua={ua}/>
          </div>
        )}

        {/* DM */}
        {tab==="dm"&&(
          <div style={S.chatWrap}>
            <div style={{display:"flex",overflowX:"auto",gap:6,padding:"8px 12px",borderBottom:"1px solid #0c141e",scrollbarWidth:"none",flexShrink:0}}>
              {VALID_CODES.filter(c=>c!==user?.code).map(c=>(
                <button key={c} onClick={()=>openDm(c)}
                  style={{...S.dmPill,...(dmWith===c?{borderColor:MEMBERS[c]?.color,color:MEMBERS[c]?.color,background:"rgba(20,30,50,0.7)"}:{})}}>
                  {MEMBERS[c]?.avatar} {MEMBERS[c]?.name}
                  {unread[c]>0&&<span style={S.badge}>{unread[c]}</span>}
                </button>
              ))}
            </div>
            {dmWith&&(
              <>
                <div style={S.chanHdr}>
                  <span style={{color:MEMBERS[dmWith]?.color,fontSize:11,letterSpacing:2}}>{MEMBERS[dmWith]?.avatar} {MEMBERS[dmWith]?.name}</span>
                  <button style={{...S.smCallBtn,borderColor:MEMBERS[dmWith]?.color+"55",color:MEMBERS[dmWith]?.color}} onClick={()=>callM(dmWith)}>📞 Panggil</button>
                </div>
                <div style={S.msgList}>
                  {dmMsgs.length===0&&<Empty icon="🔒" text={`Chat pribadi dengan ${MEMBERS[dmWith]?.name}`} sub="Hanya kalian berdua yang bisa melihat"/>}
                  {dmMsgs.map(m=><Bubble key={m.id} m={m} isMe={m.senderCode===user?.code}/>)}
                  <div ref={endRef}/>
                </div>
                <InputBar input={input} setInput={setInput} send={sendMsg} color={MEMBERS[dmWith]?.color} ua={ua}/>
              </>
            )}
          </div>
        )}

        {/* RADAR */}
        {tab==="radar"&&(
          <div style={S.scroll}>
            <div style={S.secTtl}>◎ RADAR INSIGNIA</div>
            <div style={S.radar}>
              {[12,30,48].map(p=><div key={p} style={{position:"absolute",inset:`${p}%`,borderRadius:"50%",border:`1px solid rgba(80,120,200,${0.04+p*0.002})`}}/>)}
              <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:"rgba(80,120,200,0.04)"}}/>
              <div style={{position:"absolute",left:"50%",top:0,bottom:0,width:1,background:"rgba(80,120,200,0.04)"}}/>
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:20,color:user?.color,textShadow:`0 0 10px ${user?.color}88`}}>{user?.avatar}</div>
              {online.filter(c=>c!==user?.code).map((c,i,arr)=>{
                const a=(i/Math.max(arr.length,1))*360,r=28+(i%2)*18;
                const x=50+r*Math.cos((a-90)*Math.PI/180),y=50+r*Math.sin((a-90)*Math.PI/180);
                return <div key={c} style={{position:"absolute",left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)",textAlign:"center",fontSize:16,color:MEMBERS[c]?.color,textShadow:`0 0 8px ${MEMBERS[c]?.color}66`}}>
                  {MEMBERS[c]?.avatar}
                  <div style={{fontSize:7,color:"#304c68",whiteSpace:"nowrap",marginTop:1}}>{MEMBERS[c]?.name}</div>
                </div>;
              })}
            </div>
            <div style={{fontSize:9,color:"#243040",letterSpacing:3,marginBottom:10}}>🔵 ONLINE — {online.length}</div>
            {VALID_CODES.map(c=>{
              const isOn=online.includes(c),isMe=c===user?.code;
              const ls=presence[c]?.lastSeen;
              return (
                <div key={c} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #0c141e",opacity:isOn?1:0.4}}>
                  <span style={{fontSize:20,color:isOn?MEMBERS[c]?.color:"#2a3848"}}>{MEMBERS[c]?.avatar}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:isOn?MEMBERS[c]?.color:"#3a4858",letterSpacing:1}}>
                      {MEMBERS[c]?.name}{isMe&&<span style={S.youTag}> KAMU</span>}
                    </div>
                    <div style={{fontSize:10,color:"#243040",marginTop:2}}>{isOn?"● Online":ls?timeAgo(ls):"Belum pernah aktif"}</div>
                  </div>
                  {!isMe&&(
                    <div style={{display:"flex",gap:6}}>
                      <button style={{...S.iconBtn,borderColor:MEMBERS[c]?.color+"44",color:MEMBERS[c]?.color+"99"}} onClick={()=>openDm(c)}>💬</button>
                      <button style={{...S.iconBtn,borderColor:MEMBERS[c]?.color+"44",color:MEMBERS[c]?.color+"99"}} onClick={()=>callM(c)}>📞</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SETTINGS */}
        {tab==="settings"&&(
          <div style={S.scroll}>
            <div style={S.secTtl}>⚙ PENGATURAN</div>
            <div style={{display:"flex",alignItems:"center",gap:16,padding:16,background:"rgba(12,18,28,0.7)",border:`1px solid ${user?.color}33`,borderRadius:4,marginBottom:18}}>
              <div style={{fontSize:38,color:user?.color}}>{user?.avatar}</div>
              <div>
                <div style={{fontSize:18,color:user?.color,letterSpacing:2}}>{user?.name}</div>
                <div style={{fontSize:10,color:"#304c68",letterSpacing:2,marginTop:4}}>{user?.code} · {user?.vibe?.toUpperCase()}</div>
                <div style={{fontSize:9,color:notifOk?"#5a9a6a":"#8a5050",marginTop:4,letterSpacing:1}}>{notifOk?"● Notifikasi aktif":"○ Notifikasi belum aktif"}</div>
              </div>
            </div>

            <button style={{...S.notifBtn,...(notifOk?{borderColor:"#2a5a3a",color:"#5a9a6a"}:{})}} onClick={reqNotif}>
              {notifOk?"🔔 Notifikasi Aktif ✓":"🔔 AKTIFKAN NOTIFIKASI"}
            </button>

            {[
              {l:"Nada Dering",d:"Nada kustom sesuai vibes tiap anggota",on:true},
              {l:"Notifikasi Pesan",d:"Pop-up & bunyi saat pesan masuk",on:true},
              {l:"Notifikasi Panggilan",d:"Overlay saat ada panggilan masuk",on:true},
              {l:"Tampil di Radar",d:"Anggota lain melihat kamu online",on:true},
              {l:"Mode Privasi",d:"Sembunyikan status & last seen",on:false},
            ].map(({l,d,on})=>(
              <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #0c141e"}}>
                <div><div style={{fontSize:13,color:"#8898b8",letterSpacing:1}}>{l}</div><div style={{fontSize:10,color:"#243040",marginTop:3}}>{d}</div></div>
                <div style={{color:on?user?.color:"#2a3848",fontSize:18}}>{on?"●":"○"}</div>
              </div>
            ))}

            <div style={{fontSize:10,color:"#304c68",letterSpacing:4,margin:"22px 0 12px",textAlign:"center"}}>🎵 PREVIEW NADA DERING</div>
            <div style={{fontSize:10,color:"#243040",textAlign:"center",marginBottom:12,letterSpacing:1}}>⚠ Tap tombol play dulu agar suara aktif</div>
            {[
              {vibe:"melankolis",label:"Lembut & Melankolis",who:"Mio, Al"},
              {vibe:"dingin",label:"Misterius & Dingin",who:"Pena"},
              {vibe:"elegan",label:"Kalem & Elegan",who:"Vania, Pulu"},
              {vibe:"ceria",label:"Energik & Ceria",who:"Mizu"},
            ].map(({vibe,label,who})=>(
              <div key={vibe} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #0c141e"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:"#90a8c4",letterSpacing:1}}>{label}</div>
                  <div style={{fontSize:10,color:"#2a3848",marginTop:2}}>{who}</div>
                </div>
                <button style={S.prevBtn} onClick={()=>{ua();playTone(vibe,false);}}>▶ Pesan</button>
                <button style={S.prevBtn} onClick={()=>{ua();playTone(vibe,true);}}>📞 Call</button>
              </div>
            ))}

            <button style={S.logoutBtn} onClick={logout}>← KELUAR</button>
            <div style={{fontSize:9,color:"#141e2a",textAlign:"center",marginTop:10,letterSpacing:2}}>INSIGNIA SIX v6.9 · ENCRYPTED</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({m,isMe}){
  return(
    <div style={{display:"flex",gap:8,alignItems:"flex-end",...(isMe?{flexDirection:"row-reverse"}:{})}}>
      <div style={{fontSize:17,width:28,textAlign:"center",flexShrink:0,color:m.color||"#7888a8"}}>{m.avatar}</div>
      <div style={{maxWidth:"74%",padding:"8px 12px",borderRadius:4,border:"1px solid",
        background:isMe?`${m.color||"#506080"}1c`:"rgba(12,18,28,0.85)",
        borderColor:isMe?`${m.color||"#506080"}44`:"#0f1820"}}>
        {!isMe&&<div style={{fontSize:9,letterSpacing:2,marginBottom:4,color:m.color||"#7888a8"}}>{m.sender}</div>}
        <div style={{color:"#a0b4c8",fontSize:13,lineHeight:1.55,wordBreak:"break-word"}}>{m.text}</div>
        <div style={{fontSize:9,color:"#243040",marginTop:4,textAlign:"right",letterSpacing:1}}>{fmtTime(m.ts)}</div>
      </div>
    </div>
  );
}

function Empty({icon,text,sub}){
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      color:"#1e2e40",padding:40,textAlign:"center",fontSize:13,letterSpacing:1,marginTop:40}}>
      <div style={{fontSize:34,marginBottom:10,opacity:0.2}}>{icon}</div>
      {text}
      {sub&&<div style={{fontSize:11,opacity:0.35,marginTop:4}}>{sub}</div>}
    </div>
  );
}

function InputBar({input,setInput,send,color,ua}){
  return(
    <div style={{padding:"10px 14px",background:"rgba(8,11,16,0.98)",borderTop:"1px solid #0f1820",display:"flex",gap:8,flexShrink:0}}>
      <input
        style={{flex:1,background:"rgba(8,12,18,0.9)",border:"1px solid #0f1820",borderRadius:3,
          color:"#90a8c4",padding:"10px 14px",fontSize:13,outline:"none",
          fontFamily:"'Courier New',monospace",caretColor:color||"#5878a8"}}
        value={input}
        onChange={e=>setInput(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ua();send();}}}
        onFocus={ua}
        placeholder="Kirim pesan terenkripsi…"
        maxLength={500}
      />
      <button
        style={{background:color||"#506080",border:"none",borderRadius:3,color:"#080b10",
          padding:"0 16px",fontSize:16,fontWeight:"bold",cursor:"pointer",minWidth:44}}
        onClick={()=>{ua();send();}}>↑</button>
    </div>
  );
}

const noiseUrl=`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const S={
  noise:    {position:"fixed",inset:0,backgroundImage:noiseUrl,backgroundSize:"150px",opacity:0.03,pointerEvents:"none",zIndex:997},
  bg:       {minHeight:"100vh",background:"#080b10",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Courier New',monospace",position:"relative",overflow:"hidden"},
  card:     {position:"relative",background:"rgba(12,18,28,0.97)",border:"1px solid #1a2840",borderRadius:6,padding:"36px 28px",width:"100%",maxWidth:320,boxShadow:"0 0 80px rgba(60,100,180,0.07)"},
  glitch:   {transform:"translate(2px,-1px) skewX(-0.3deg)",filter:"hue-rotate(6deg)"},
  glow:     {position:"absolute",inset:0,borderRadius:6,background:"radial-gradient(ellipse at 50% 0%,rgba(60,100,180,0.05) 0%,transparent 70%)",pointerEvents:"none"},
  logoRow:  {display:"flex",alignItems:"center",gap:14,marginBottom:26},
  hex:      {fontSize:32,color:"#5878a8",textShadow:"0 0 20px rgba(60,100,200,0.4)"},
  logoTxt:  {fontSize:17,fontWeight:"bold",color:"#b8cce0",letterSpacing:6},
  logoSub:  {fontSize:9,color:"#243448",letterSpacing:4,marginTop:3},
  divider:  {height:1,background:"linear-gradient(90deg,transparent,#1a2840,transparent)",margin:"0 0 20px"},
  lbl:      {fontSize:10,color:"#304c68",letterSpacing:4,marginBottom:10},
  inputRow: {display:"flex",gap:8,marginBottom:10},
  inp:      {flex:1,background:"rgba(8,12,20,0.8)",border:"1px solid #1a2840",borderRadius:3,color:"#90a8c4",padding:"11px 14px",fontSize:14,letterSpacing:3,outline:"none",fontFamily:"'Courier New',monospace",caretColor:"#5878a8"},
  arw:      {background:"#304c68",border:"none",borderRadius:3,color:"#b8cce0",padding:"0 18px",fontSize:16,fontWeight:"bold",cursor:"pointer"},
  errTxt:   {color:"#b06070",fontSize:11,marginBottom:8,letterSpacing:1},
  hint:     {fontSize:10,color:"#182434",letterSpacing:1,textAlign:"center",marginTop:8},
  root:     {minHeight:"100vh",maxWidth:430,margin:"0 auto",background:"#080b10",fontFamily:"'Courier New',monospace",display:"flex",flexDirection:"column",position:"relative"},
  toasts:   {position:"fixed",top:96,right:8,zIndex:9999,display:"flex",flexDirection:"column",gap:5,maxWidth:260},
  toast:    {background:"rgba(12,18,28,0.97)",borderLeft:"3px solid",padding:"7px 11px",borderRadius:3,fontSize:11,color:"#90a8c4",letterSpacing:0.5,boxShadow:"0 4px 16px rgba(0,0,0,0.6)"},
  overlay:  {position:"fixed",inset:0,zIndex:9998,background:"rgba(4,8,14,0.94)",display:"flex",alignItems:"center",justifyContent:"center"},
  callCard: {background:"rgba(12,18,28,0.99)",border:"1px solid #1a2840",borderRadius:8,padding:"36px 28px",textAlign:"center",width:260},
  decBtn:   {flex:1,padding:"11px 0",background:"rgba(100,30,40,0.25)",border:"1px solid #502030",color:"#b06070",borderRadius:4,cursor:"pointer",fontFamily:"'Courier New',monospace",fontSize:12,letterSpacing:1},
  ansBtn:   {flex:1,padding:"11px 0",background:"rgba(30,60,100,0.25)",border:"1px solid #203860",color:"#6888b0",borderRadius:4,cursor:"pointer",fontFamily:"'Courier New',monospace",fontSize:12,letterSpacing:1},
  callBar:  {background:"rgba(14,22,34,0.98)",borderBottom:"1px solid #1a2840",padding:"7px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,color:"#6888b0",letterSpacing:1},
  endBtn:   {background:"rgba(80,20,30,0.4)",border:"1px solid #502030",color:"#b06070",padding:"4px 10px",borderRadius:3,cursor:"pointer",fontFamily:"'Courier New',monospace",fontSize:11},
  hdr:      {background:"rgba(8,11,16,0.98)",borderBottom:"1px solid #0f1820",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:100},
  hdrHex:   {fontSize:17,color:"#4868a0",textShadow:"0 0 12px rgba(60,100,200,0.3)"},
  hdrTitle: {fontSize:12,fontWeight:"bold",color:"#7888a8",letterSpacing:5},
  subnav:   {display:"flex",background:"rgba(8,11,16,0.97)",borderBottom:"1px solid #0f1820",overflowX:"auto",scrollbarWidth:"none",flexShrink:0},
  snBtn:    {flex:1,padding:"9px 4px",background:"none",border:"none",borderBottom:"2px solid transparent",color:"#2a3848",fontSize:10,letterSpacing:0.5,cursor:"pointer",fontFamily:"'Courier New',monospace",whiteSpace:"nowrap"},
  snOn:     {color:"#90a8c4",borderBottom:"2px solid"},
  badge:    {background:"#b06070",color:"#fff",fontSize:8,padding:"1px 5px",borderRadius:8,marginLeft:4,fontWeight:"bold"},
  body:     {flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  chatWrap: {flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  chanHdr:  {padding:"7px 14px",background:"rgba(10,14,20,0.95)",borderBottom:"1px solid #0c141e",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0},
  msgList:  {flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:10,scrollbarWidth:"thin",scrollbarColor:"#1a2840 transparent"},
  scroll:   {flex:1,overflowY:"auto",padding:16,scrollbarWidth:"thin",scrollbarColor:"#1a2840 transparent"},
  secTtl:   {fontSize:10,color:"#304c68",letterSpacing:4,marginBottom:16,textAlign:"center"},
  radar:    {width:200,height:200,borderRadius:"50%",margin:"0 auto 20px",border:"1px solid #0f1820",position:"relative",background:"radial-gradient(circle,rgba(12,18,28,0.9) 0%,rgba(8,11,16,0.95) 100%)"},
  youTag:   {fontSize:8,color:"#4868a0",letterSpacing:2,border:"1px solid #2a3a58",padding:"1px 4px",borderRadius:2,marginLeft:6},
  iconBtn:  {background:"none",border:"1px solid",borderRadius:3,padding:"4px 9px",cursor:"pointer",fontSize:13,fontFamily:"'Courier New',monospace"},
  dmPill:   {background:"rgba(12,18,28,0.7)",border:"1px solid #1a2840",borderRadius:20,padding:"5px 12px",color:"#304c68",fontSize:11,cursor:"pointer",fontFamily:"'Courier New',monospace",whiteSpace:"nowrap",flexShrink:0,letterSpacing:1},
  smCallBtn:{background:"none",border:"1px solid",borderRadius:3,padding:"3px 10px",cursor:"pointer",fontSize:11,fontFamily:"'Courier New',monospace",letterSpacing:1},
  notifBtn: {width:"100%",padding:"12px 0",background:"rgba(24,36,60,0.4)",border:"1px solid #243860",color:"#6888b0",fontSize:11,letterSpacing:2,cursor:"pointer",fontFamily:"'Courier New',monospace",borderRadius:3,marginBottom:16},
  prevBtn:  {background:"rgba(12,18,28,0.8)",border:"1px solid #1a2840",color:"#5878a8",padding:"5px 9px",borderRadius:3,cursor:"pointer",fontFamily:"'Courier New',monospace",fontSize:10,letterSpacing:1},
  logoutBtn:{marginTop:24,width:"100%",padding:"12px 0",background:"transparent",border:"1px solid #1e2838",color:"#704050",fontSize:10,letterSpacing:3,cursor:"pointer",fontFamily:"'Courier New',monospace",borderRadius:3},
};
