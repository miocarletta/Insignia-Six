function getAudioCtx() {
  if (!window._ictx) window._ictx = new (window.AudioContext || window.webkitAudioContext)();
  return window._ictx;
}

export function playTone(vibe, isCall = false) {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const master = ctx.createGain();
    master.gain.setValueAtTime(isCall ? 0.28 : 0.18, ctx.currentTime);
    master.connect(ctx.destination);
    const t = ctx.currentTime;

    const schedules = {
      melankolis: () => {
        [[293.66,0],[349.23,0.22],[440,0.44],[349.23,0.66]].forEach(([f,d]) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t+d);
          g.gain.linearRampToValueAtTime(0.6, t+d+0.06);
          g.gain.exponentialRampToValueAtTime(0.001, t+d+(isCall?0.9:0.6));
          o.connect(g); g.connect(master);
          o.start(t+d); o.stop(t+d+(isCall?1.0:0.7));
        });
      },
      dingin: () => {
        [80,160,240].forEach((f,i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = i===0 ? 'sawtooth' : 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(i===0?0.5:0.2, t+0.15);
          g.gain.linearRampToValueAtTime(0, t+(isCall?1.2:0.8));
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t+(isCall?1.3:0.9));
        });
      },
      elegan: () => {
        [[880,0],[1108,0.18],[1318,0.36]].forEach(([f,d]) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t+d);
          g.gain.linearRampToValueAtTime(0.45, t+d+0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t+d+(isCall?1.1:0.7));
          o.connect(g); g.connect(master);
          o.start(t+d); o.stop(t+d+(isCall?1.2:0.8));
        });
      },
      ceria: () => {
        [[523,0],[659,0.1],[784,0.2],[1047,0.3],[784,0.4],[659,0.5]].forEach(([f,d]) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          g.gain.setValueAtTime(0, t+d);
          g.gain.linearRampToValueAtTime(0.5, t+d+0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t+d+(isCall?0.55:0.35));
          o.connect(g); g.connect(master);
          o.start(t+d); o.stop(t+d+(isCall?0.6:0.4));
        });
      },
    };

    schedules[vibe]?.();
    if (isCall) {
      setTimeout(() => schedules[vibe]?.(), 1500);
      setTimeout(() => schedules[vibe]?.(), 3000);
    }
  } catch(e) {}
}
