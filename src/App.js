import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase'; 
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [users, setUsers] = useState([]);
  const audioRef = useRef(new Audio('/notif.mp3'));

  const enableAudio = () => {
    audioRef.current.play().then(() => {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }).catch(() => {});
  };

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    const unsubChat = onSnapshot(q, (snapshot) => {
      const newMsgs = snapshot.docs.map(d => d.data());
      if (newMsgs.length > messages.length && messages.length > 0) {
        audioRef.current.play().catch(() => {});
      }
      setMessages(newMsgs);
    });

    const unsubUsers = onSnapshot(collection(db, "presence"), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubChat(); unsubUsers(); };
  }, [messages.length]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    await addDoc(collection(db, "messages"), {
      text: input,
      sender: "Mio",
      timestamp: serverTimestamp()
    });
    setInput('');
  };

  return (
    <div className="main-container" onClick={enableAudio}>
      <div className="radar-section">
        {users.map(u => (
          <div key={u.id} className={`user-dot ${u.online ? 'active' : ''}`}>
            {u.name}
          </div>
        ))}
      </div>
      <div className="chat-section">
        {messages.map((m, i) => (
          <div key={i} className="msg-bubble">
            <span className="sender">{m.sender}:</span> {m.text}
          </div>
        ))}
      </div>
      <form className="input-area" onSubmit={sendMessage}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          placeholder="Type..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}

export default App;
