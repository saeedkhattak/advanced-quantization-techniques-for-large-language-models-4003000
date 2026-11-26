(() => {
  const NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  const isBlack = n => [1,3,6,8,10].includes(n % 12);
  const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
  const freq = n => 440 * Math.pow(2, (n - 69) / 12);
  const hex = v => v.toString(16).toUpperCase().padStart(2, "0");
  const COMPUTER_KEYS = ["a","w","s","e","d","f","t","g","y","h","u","j","k","o","l","p",";","'"];

  let base = 48;            // C3
  const SPAN = 24;          // two octaves + top C
  let sustain = false;
  let soundId = "piano";

  // ---------- Audio ----------
  let ctx = null, master = null;
  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0.32;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const SOUNDS = {
    piano: { label: "Piano", desc: "bright and percussive",
      oscs: [["triangle",1,1],["sine",2,0.35],["sine",3,0.1]], a: 0.004, decay: 2.2, sustainLvl: 0.0, r: 0.35, filter: 5200 },
    organ: { label: "Organ", desc: "steady, no fade",
      oscs: [["sine",1,1],["sine",2,0.6],["sine",3,0.35],["sine",4,0.2]], a: 0.01, decay: 0.05, sustainLvl: 0.8, r: 0.06, filter: 8000 },
    synth: { label: "Synth", desc: "buzzy electronic lead",
      oscs: [["sawtooth",1,0.6,-7],["sawtooth",1,0.6,7]], a: 0.01, decay: 0.4, sustainLvl: 0.7, r: 0.2, filter: 2600, sweep: true },
    pad: { label: "Pad", desc: "soft, slow swell",
      oscs: [["sawtooth",1,0.5,-10],["sawtooth",1,0.5,10],["triangle",0.5,0.5]], a: 0.45, decay: 0.6, sustainLvl: 0.85, r: 1.3, filter: 1300 },
    bass: { label: "Bass", desc: "deep, one octave lower",
      oscs: [["square",0.5,0.7],["sine",0.5,0.8]], a: 0.005, decay: 0.3, sustainLvl: 0.6, r: 0.1, filter: 750 },
    bell: { label: "Bell", desc: "chiming, long ring",
      oscs: [["sine",1,1],["sine",3.5,0.4],["sine",5.4,0.15]], a: 0.002, decay: 3.2, sustainLvl: 0.0, r: 1.2, filter: 9000 },
    drive: { hidden: true, label: "Drive bass", desc: "", oscs: [["sawtooth",1,0.5],["square",1,0.35],["sine",1,0.7]], a: 0.004, decay: 0.15, sustainLvl: 0.6, r: 0.06, filter: 650 },
    rabab: { group: "world", label: "Rabab", desc: "Afghan and Pashto lute: bright, plucked strings", ks: true, ksDur: 1.6, ksDecay: 0.995, bright: 0.85, body: [900, 6, 1.2], a: 0.002, decay: 0.01, sustainLvl: 1, r: 0.25, filter: 6500, gain: 1.1 },
    sitar: { group: "world", label: "Sitar", desc: "Indian long-neck lute: buzzy, ringing strings", ks: true, ksDur: 2.6, ksDecay: 0.998, bright: 0.9, buzz: 3, body: [2600, 7, 2], a: 0.002, decay: 0.01, sustainLvl: 1, r: 0.5, filter: 8000, gain: 0.8 },
    bansuri: { group: "world", label: "Bansuri", desc: "South Asian bamboo flute: soft and breathy", oscs: [["sine",1,1],["triangle",2,0.08]], vibrato: [5, 14, 0.25], breath: 0.25, a: 0.07, decay: 0.2, sustainLvl: 0.8, r: 0.15, filter: 3200 },
    guzheng: { group: "world", label: "Guzheng", desc: "Chinese zither: bright pluck with a wobble", ks: true, ksDur: 2.2, ksDecay: 0.997, bright: 0.7, body: [1500, 3, 1], vibrato: [5.5, 18, 0.35], a: 0.002, decay: 0.01, sustainLvl: 1, r: 0.4, filter: 7000 },
  };

  const voices = new Map(); // note -> voice
  // Shared noise (used for breath, drums)
  let noiseBuf = null;
  function getNoise() {
    const c = audio();
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return noiseBuf;
  }
  // Plucked strings (rabab, sitar, guzheng) use the Karplus-Strong method: a burst of noise
  // fed round a tiny delay loop. It naturally sounds like a plucked string fading out.
  const ksCache = new Map();
  function ksBuffer(note, id, s) {
    const key = id + ":" + note;
    if (ksCache.has(key)) return ksCache.get(key);
    const c = audio(), sr = c.sampleRate, f = freq(note), N = Math.max(2, Math.round(sr / f));
    const len = Math.floor(sr * s.ksDur), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < N && i < len; i++) { prev += s.bright * ((Math.random() * 2 - 1) - prev); d[i] = prev; }
    for (let i = N; i < len; i++) d[i] = s.ksDecay * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : 0));
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
    const out = { buf, ratio: f / (sr / (N + 0.5)) };
    if (ksCache.size > 90) ksCache.delete(ksCache.keys().next().value);
    ksCache.set(key, out);
    return out;
  }
  function startVoice(note, vel, snd) {
    const id = snd || soundId, c = audio(), s = SOUNDS[id], t = c.currentTime;
    const peak = Math.pow(vel / 127, 1.4) * 0.5 * (s.gain || 1);
    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + s.a);
    const sustainVal = Math.max(peak * s.sustainLvl, 0.0001);
    env.gain.exponentialRampToValueAtTime(sustainVal, t + s.a + s.decay);
    const filt = c.createBiquadFilter(); filt.type = "lowpass";
    filt.frequency.setValueAtTime(s.sweep ? s.filter * 2.2 : s.filter, t);
    if (s.sweep) filt.frequency.exponentialRampToValueAtTime(s.filter, t + 0.35);
    filt.connect(env); env.connect(master);
    let head = filt;
    if (s.body) { const pk = c.createBiquadFilter(); pk.type = "peaking"; [pk.frequency.value, pk.gain.value, pk.Q.value] = s.body; pk.connect(head); head = pk; }
    if (s.buzz) { const ws = c.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(s.buzz * x) / Math.tanh(s.buzz); } ws.curve = curve; ws.connect(head); head = ws; }
    const stops = [], pitchParams = [];
    if (s.ks) {
      const { buf, ratio } = ksBuffer(note, id, s), src = c.createBufferSource();
      src.buffer = buf; src.playbackRate.value = ratio; src.connect(head); src.start(t);
      stops.push(src); pitchParams.push(src.detune);
    } else {
      s.oscs.forEach(([type, mult, lvl, cents]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq(note) * mult; if (cents) o.detune.value = cents;
        g.gain.value = lvl; o.connect(g); g.connect(head); o.start(t); stops.push(o); pitchParams.push(o.detune);
      });
    }
    if (s.vibrato) {
      const [rate, cents, delay] = s.vibrato, lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = rate; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + delay * 0.5); lg.gain.linearRampToValueAtTime(cents, t + delay);
      lfo.connect(lg); pitchParams.forEach(p => { if (p) lg.connect(p); }); lfo.start(t); stops.push(lfo);
    }
    if (s.breath) {
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = getNoise(); n.loop = true; bp.type = "bandpass"; bp.frequency.value = freq(note); bp.Q.value = 1.5; ng.gain.value = s.breath;
      n.connect(bp); bp.connect(ng); ng.connect(head); n.start(t, Math.random() * 0.5); stops.push(n);
    }
    return { env, oscs: stops, r: s.r };
  }
  function stopVoice(v) {
    const t = ctx.currentTime;
    v.env.gain.cancelScheduledValues(t);
    v.env.gain.setValueAtTime(Math.max(v.env.gain.value, 0.0001), t);
    v.env.gain.exponentialRampToValueAtTime(0.0001, t + v.r);
    v.oscs.forEach(o => o.stop(t + v.r + 0.05));
  }

  // ---------- Note state ----------
  // Each sounding voice is keyed by note + sound, so two instruments can play the same key at once.
  const held = new Map();      // voice key -> note
  const sustained = new Set(); // voice keys released while sustain is on
  let recording = null, recStart = 0, lastTake = null;
  const vkey = (note, snd) => note + "|" + (snd || "user");
  const isHeld = note => [...held.values()].includes(note);
  const heldNotes = () => [...new Set(held.values())];

  function noteOn(note, vel, fromPlayback, snd) {
    const k = vkey(note, snd);
    if (voices.has(k)) stopVoice(voices.get(k));
    voices.set(k, startVoice(note, vel, snd));
    held.set(k, note); sustained.delete(k);
    setKey(note, true);
    logMsg("on", note, vel);
    if (recording && !fromPlayback) recording.push({ t: performance.now() - recStart, on: true, note, vel });
    updateScreen(note, vel);
  }
  function noteOff(note, fromPlayback, snd) {
    const k = vkey(note, snd);
    if (!held.has(k)) return;
    held.delete(k);
    if (!isHeld(note)) setKey(note, false);
    logMsg("off", note, 0);
    if (recording && !fromPlayback) recording.push({ t: performance.now() - recStart, on: false, note });
    if (sustain) sustained.add(k);
    else if (voices.has(k)) { stopVoice(voices.get(k)); voices.delete(k); }
    updateScreen();
  }
  function releaseAll(fromPlayback) {
    [...held.entries()].forEach(([k, n]) => { const s = k.split("|")[1]; noteOff(n, fromPlayback, s === "user" ? undefined : s); });
  }
  function setSustain(on) {
    if (on === sustain) return;
    sustain = on;
    sustainBtn.setAttribute("aria-pressed", String(on));
    logCC(on);
    if (!on) { sustained.forEach(k => { if (voices.has(k) && !held.has(k)) { stopVoice(voices.get(k)); voices.delete(k); } }); sustained.clear(); }
  }

  // ---------- Keyboard UI ----------
  const kb = document.getElementById("kb");
  const keyEls = new Map();
  function buildKeys() {
    kb.innerHTML = ""; keyEls.clear();
    const notes = []; for (let n = base; n <= base + SPAN; n++) notes.push(n);
    const whites = notes.filter(n => !isBlack(n));
    const w = 100 / whites.length;
    let wi = 0;
    notes.forEach(n => {
      const el = document.createElement("div");
      el.className = "key " + (isBlack(n) ? "black" : "white");
      el.dataset.note = n;
      const ck = COMPUTER_KEYS[n - base];
      el.innerHTML = `<span class="kl">${ck ? `<b>${ck === ";" ? ";" : ck === "'" ? "'" : ck}</b>` : ""}${isBlack(n) ? "" : noteName(n)}</span>`;
      if (isBlack(n)) { el.style.left = (wi * w - w * 0.3) + "%"; el.style.width = (w * 0.6) + "%"; }
      else wi++;
      if (isHeld(n)) el.classList.add("on");
      kb.appendChild(el); keyEls.set(n, el);
    });
    document.getElementById("octLbl").textContent = noteName(base) + "–" + noteName(base + SPAN);
  }
  function setKey(n, on) { const el = keyEls.get(n); if (el) el.classList.toggle("on", on); }

  const pointers = new Map(); // pointerId -> note
  function keyAt(x, y) { const el = document.elementFromPoint(x, y); return el && el.closest && el.closest(".key"); }
  function velFrom(el, y) { const r = el.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (y - r.top) / r.height)); return Math.round(35 + f * 92); }
  kb.addEventListener("pointerdown", e => {
    const el = keyAt(e.clientX, e.clientY); if (!el) return;
    e.preventDefault();
    const n = +el.dataset.note; pointers.set(e.pointerId, n); noteOn(n, velFrom(el, e.clientY));
  });
  window.addEventListener("pointermove", e => {
    if (!pointers.has(e.pointerId)) return;
    const el = keyAt(e.clientX, e.clientY); const cur = pointers.get(e.pointerId);
    const n = el && kb.contains(el) ? +el.dataset.note : null;
    if (n === cur) return;
    if (cur != null) noteOff(cur);
    pointers.set(e.pointerId, n);
    if (n != null) noteOn(n, velFrom(el, e.clientY));
  });
  const endPointer = e => { if (!pointers.has(e.pointerId)) return; const n = pointers.get(e.pointerId); pointers.delete(e.pointerId); if (n != null) noteOff(n); };
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);

  const downKeys = new Set();
  window.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) { if (e.key === " ") e.preventDefault(); else return; }
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); if (!e.repeat) setSustain(true); return; }
    if (e.repeat) return;
    if (k === "z") return shiftOct(-12);
    if (k === "x") return shiftOct(12);
    const i = COMPUTER_KEYS.indexOf(k);
    if (i >= 0) { e.preventDefault(); const n = base + i; downKeys.add(k + ":" + n); noteOn(n, 100); }
  });
  window.addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    if (k === " ") { setSustain(false); return; }
    [...downKeys].filter(d => d.startsWith(k + ":")).forEach(d => { downKeys.delete(d); noteOff(+d.split(":")[1]); });
  });
  window.addEventListener("blur", () => { releaseAll(false); downKeys.clear(); pointers.clear(); setSustain(false); });

  function shiftOct(d) {
    const nb = base + d; if (nb < 24 || nb > 72) return;
    releaseAll(false); downKeys.clear();
    base = nb; buildKeys();
    octDown.disabled = base <= 24; octUp.disabled = base >= 72;
  }
  const octDown = document.getElementById("octDown"), octUp = document.getElementById("octUp");
  octDown.onclick = () => shiftOct(-12); octUp.onclick = () => shiftOct(12);
  const sustainBtn = document.getElementById("sustainBtn");
  sustainBtn.onclick = () => setSustain(!sustain);

  // Sound buttons
  const soundsEl = document.getElementById("sounds"), worldEl = document.getElementById("worldSounds");
  Object.entries(SOUNDS).filter(([, s]) => !s.hidden).forEach(([id, s]) => {
    const b = document.createElement("button"); b.id = "snd-" + id; b.textContent = s.label; b.title = s.desc;
    b.setAttribute("aria-pressed", String(id === soundId));
    b.onclick = () => { soundId = id; document.querySelectorAll("#sounds button, #worldSounds button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); showInfo("Sound", s.label, s.desc); };
    (s.group === "world" ? worldEl : soundsEl).appendChild(b);
  });

  // ---------- Screen + chord names ----------
  const scrLbl = document.getElementById("scrLbl"), scrBig = document.getElementById("scrBig"), scrSub = document.getElementById("scrSub");
  function showInfo(l, b, s) { scrLbl.textContent = l; scrBig.textContent = b; scrSub.textContent = s; }
  const CHORDS = [
    [[0,4,7], "major", "bright, happy"], [[0,3,7], "minor", "sad, serious"],
    [[0,3,6], "diminished", "tense, spooky"], [[0,4,8], "augmented", "dreamy, unsettled"],
    [[0,2,7], "sus2", "open, floating"], [[0,5,7], "sus4", "waiting to resolve"],
    [[0,4,7,10], "7", "bluesy, wants to move"], [[0,4,7,11], "major 7", "soft, jazzy"],
    [[0,3,7,10], "minor 7", "mellow, smooth"], [[0,7], "5 (power chord)", "strong, rock guitar"],
  ];
  const INTERVALS = ["unison","minor 2nd","major 2nd","minor 3rd","major 3rd","perfect 4th","tritone","perfect 5th","minor 6th","major 6th","minor 7th","major 7th"];
  function chordName(notes) {
    const pcs = [...new Set(notes.map(n => n % 12))];
    if (pcs.length < 2) return null;
    const low = notes[0] % 12, roots = [low, ...pcs.filter(p => p !== low)];
    for (const root of roots) {
      const iv = pcs.map(p => (p - root + 12) % 12).sort((a, b) => a - b).join(",");
      for (const [t, name, feel] of CHORDS) if (t.join(",") === iv) return { text: NAMES[root] + " " + name, feel };
    }
    if (notes.length === 2) { const d = Math.abs(notes[1] - notes[0]) % 12; return { text: INTERVALS[d], feel: "the gap between two notes" }; }
    let best = null;
    for (const root of roots) {
      const set = new Set(pcs.map(p => (p - root + 12) % 12));
      for (const [t, name, feel] of CHORDS) if (t.length >= 3 && t.every(x => set.has(x)) && (!best || t.length > best.len)) best = { len: t.length, text: NAMES[root] + " " + name, feel: feel + " (with a tune on top)" };
    }
    return best || { text: pcs.length + " notes", feel: "no common chord name for this mix" };
  }
  function updateScreen(lastNote, vel) {
    const notes = heldNotes().sort((a, b) => a - b);
    if (!notes.length) return;
    const ch = chordName(notes);
    if (ch) showInfo("Chord", ch.text, notes.map(noteName).join(" + ") + " · " + ch.feel);
    else if (lastNote != null) showInfo("Note", noteName(lastNote), "MIDI key " + lastNote + " · " + freq(lastNote).toFixed(1) + " Hz · velocity " + vel);
  }

  // ---------- MIDI log ----------
  const log = document.getElementById("log");
  function pushLog(html) {
    const empty = log.querySelector(".empty"); if (empty) empty.remove();
    const li = document.createElement("li"); li.innerHTML = html; log.prepend(li);
    while (log.children.length > 8) log.lastChild.remove();
  }
  function logMsg(kind, note, vel) {
    const on = kind === "on";
    pushLog(`<span class="${on ? "t-on" : ""}">${on ? "Note On" : "Note Off"}</span><span>${noteName(note)} · ${note}</span><span>${on ? "velocity " + vel : "released"} <span class="bytes">[${hex(on ? 0x90 : 0x80)} ${hex(note)} ${hex(vel)}]</span></span>`);
  }
  function logCC(on) {
    pushLog(`<span class="t-on">Pedal</span><span>Sustain</span><span>${on ? "pressed" : "lifted"} <span class="bytes">[B0 40 ${on ? "7F" : "00"}]</span></span>`);
  }

  // ---------- Record / play ----------
  const recBtn = document.getElementById("recBtn"), playBtn = document.getElementById("playBtn");
  let playTimers = [];
  recBtn.onclick = () => {
    if (recording) {
      releaseAll(false);
      lastTake = recording; recording = null;
      recBtn.setAttribute("aria-pressed", "false"); recBtn.lastChild.textContent = "Record";
      playBtn.disabled = !lastTake.length;
      showInfo("Recorded", lastTake.filter(e => e.on).length + " notes", "Press Play back to hear it.");
    } else {
      stopPlayback(); audio();
      recording = []; recStart = performance.now();
      recBtn.setAttribute("aria-pressed", "true"); recBtn.lastChild.textContent = "Stop";
      showInfo("Recording", "● REC", "Play something, then press Stop.");
    }
  };
  function stopPlayback() { playTimers.forEach(clearTimeout); playTimers = []; releaseAll(true); playBtn.textContent = "Play back"; }
  playBtn.onclick = () => {
    if (playTimers.length) return stopPlayback();
    if (!lastTake || !lastTake.length) return;
    audio(); playBtn.textContent = "Stop";
    lastTake.forEach(ev => playTimers.push(setTimeout(() => ev.drum ? hitPad(ev.drum, ev.vel, true) : ev.on ? noteOn(ev.note, ev.vel, true) : noteOff(ev.note, true), ev.t)));
    const end = lastTake[lastTake.length - 1].t + 400;
    playTimers.push(setTimeout(() => { playTimers = []; releaseAll(true); playBtn.textContent = "Play back"; }, end));
  };

  // ---------- Drum pads ----------
  // Drums send MIDI on channel 10 (status byte 99). "gm" is the drum's General MIDI number.
  const PADS = [
    { id: "kick", label: "Kick", gm: 36, tip: "Big bass drum: the 'boom' of pop and dance music" },
    { id: "snare", label: "Snare", gm: 38, tip: "Sharp crack, usually on beats 2 and 4" },
    { id: "hat", label: "Hi-hat", gm: 42, tip: "Short 'tss' cymbal that keeps time" },
    { id: "clap", label: "Clap", gm: 39, tip: "Hand clap" },
    { id: "dholBoom", label: "Dhol dhum", gm: 64, tip: "Dhol, big side: the deep 'dhum', played with a thick curved stick" },
    { id: "dholTak", label: "Dhol tak", gm: 63, tip: "Dhol, small side: the sharp 'tak', played with a thin cane" },
    { id: "tablaGe", label: "Tabla ge", gm: 61, tip: "Tabla, big drum (bayan): low 'ge' that bends upward" },
    { id: "tablaNa", label: "Tabla na", gm: 60, tip: "Tabla, small drum (dayan): ringing 'na'" },
  ];
  const PAD_BY_ID = Object.fromEntries(PADS.map(p => [p.id, p]));
  function drum(kind, vel) {
    const c = audio(), t = c.currentTime;
    const tone = (f0, f1, glide, dur, lvl, type) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = type || "sine";
      o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
      g.gain.setValueAtTime(lvl * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    };
    const noise = (ftype, ff, q, dur, lvl) => {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = getNoise(); f.type = ftype; f.frequency.value = ff; f.Q.value = q;
      g.gain.setValueAtTime(lvl * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    };
    switch (kind) {
      case "kick": tone(150, 45, 0.12, 0.3, 0.9); break;
      case "snare": tone(190, 150, 0.05, 0.12, 0.35, "triangle"); noise("bandpass", 1800, 0.8, 0.18, 0.6); break;
      case "hat": noise("highpass", 7000, 0.7, 0.05, 0.2); break;
      case "clap": noise("bandpass", 1500, 0.9, 0.18, 0.55); break;
      case "dholBoom": tone(110, 58, 0.25, 0.55, 1.0); noise("lowpass", 300, 0.7, 0.08, 0.5); break;
      case "dholTak": noise("highpass", 2500, 1, 0.06, 0.6); tone(420, 380, 0.05, 0.08, 0.3, "triangle"); break;
      case "tablaNa": tone(530, 525, 0.1, 0.4, 0.45); tone(1060, 1060, 0, 0.22, 0.15); tone(1590, 1590, 0, 0.12, 0.08); noise("bandpass", 4000, 2, 0.015, 0.4); break;
      case "tablaGe": tone(92, 128, 0.28, 0.6, 0.85); noise("lowpass", 500, 0.7, 0.04, 0.3); break;
    }
  }
  const padsEl = document.getElementById("pads"), padEls = {}, padTimers = {};
  function hitPad(kind, vel, fromPlayback) {
    drum(kind, vel);
    const el = padEls[kind];
    if (el) { el.classList.add("hit"); clearTimeout(padTimers[kind]); padTimers[kind] = setTimeout(() => el.classList.remove("hit"), 110); }
    if (!fromPlayback) {
      const p = PAD_BY_ID[kind], v = Math.max(1, Math.min(127, Math.round(vel * 127)));
      pushLog(`<span class="t-on">Drum hit</span><span>${p.label}</span><span>velocity ${v} <span class="bytes">[99 ${hex(p.gm)} ${hex(v)}]</span></span>`);
      if (recording) recording.push({ t: performance.now() - recStart, drum: kind, vel });
    }
  }
  PADS.forEach((p, i) => {
    const b = document.createElement("button"); b.className = "pad"; b.id = "pad-" + p.id; b.title = p.tip;
    b.innerHTML = `<span>${p.label}</span><kbd>${i + 1}</kbd>`;
    b.addEventListener("pointerdown", e => { e.preventDefault(); hitPad(p.id, 0.9); });
    b.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); hitPad(p.id, 0.9); } });
    padsEl.appendChild(b); padEls[p.id] = b;
  });
  window.addEventListener("keydown", e => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = "12345678".indexOf(e.key);
    if (i >= 0) { e.preventDefault(); hitPad(PADS[i].id, 0.9); }
  });

  // ---------- Songs ----------
  // A song is a list of sections; each section has "parts" (players). Each part has a role, a style and its own sound.
  const noteNum = n => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); if (!m) throw new Error("Bad note " + n); return (+m[3] + 1) * 12 + { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); };
  const mel = s => s.trim() ? s.trim().split(/\s+/).map(t => { const [n, d] = t.split("/"); return [n === "r" ? null : noteNum(n), +d]; }) : [];
  const RIFF = "A4/0.5 r/0.5 C5/0.5 A4/0.5 r/0.5 G4/0.5 A4/0.5 r/0.5  E4/0.5 r/0.5 A4/0.5 E4/0.5 r/0.5 G4/0.5 A4/0.5 r/0.5  " +
               "D4/0.5 r/0.5 G4/0.5 B4/0.5 r/0.5 A4/0.5 G4/0.5 r/0.5  E4/0.5 G4/0.5 C5/1 B4/0.5 G4/0.5 E4/1";
  const GOLD_CHORUS = "C5/1.5 A4/0.5 C5/2  C5/1 B4/0.5 A4/2.5  B4/1.5 G4/0.5 B4/1 C5/1  G4/4  " +
                      "C5/1.5 A4/0.5 C5/1 C5/1  C5/0.5 B4/0.5 A4/1 G4/1 A4/1  B4/1 C5/1 B4/1 A4/1  C5/3 r/1";
  const P_MOTIF = "G4/1 C5/1 B4/1 G4/1  D4/2 G4/2  E4/1 A4/1 C5/2  A4/2 F4/2";
  const P_VERSE = "E4/1 G4/1 C5/1.5 G4/0.5  B4/1 A4/0.5 G4/1.5 r/1  A4/1 C5/1 B4/0.5 A4/0.5 E4/1  F4/1.5 G4/0.5 A4/2  " +
                  "E4/1 G4/1 C5/1 B4/0.5 C5/0.5  D4/1 G4/1 B4/2  C5/1.5 B4/0.5 A4/1 G4/1  A4/3 r/1";
  const P_BUILD = "A4/0.5 A4/0.5 C5/1 A4/1 F4/1  B4/0.5 B4/0.5 C5/1 B4/1 G4/1  C5/0.5 C5/0.5 C5/1 B4/1 A4/1  B4/1 C5/1 G4/1 B4/1";
  const P_CHORUS = "C5/1.5 B4/0.5 C5/1 G4/1  B4/1.5 A4/0.5 B4/1 G4/1  A4/1 C5/1 E4/1 A4/1  A4/2 G4/1 F4/1  " +
                   "C5/1.5 B4/0.5 C5/1 G4/1  B4/1.5 C5/0.5 B4/1 G4/1  A4/1 B4/1 C5/1 E4/1  F4/1 G4/1 A4/2";
  const CHORUS_PARTS = [
    { role: "chords", style: "arp", snd: "organ", vel: 78 },
    { role: "chords", style: "whole", snd: "pad", vel: 62 },
    { role: "bass", style: "eighths", snd: "bass" },
    { role: "melody", snd: "synth", text: P_CHORUS, vel: 108 },
    { role: "melody", snd: "bell", text: P_CHORUS, vel: 66, shift: 12 },
  ];
  // Khyber Sunrise uses a scale like Raag Bhairav / Hijaz on D: D Eb F# G A Bb C# D
  const K_INTRO = "A4/2 Bb4/1 A4/1  G4/1.5 F#4/0.5 G4/1 A4/1  Bb4/2 A4/1 G4/0.5 F#4/0.5  Eb4/1 D4/3";
  const K_THEME_A = "D4/0.5 F#4/0.5 A4/0.5 F#4/0.5 G4/0.5 A4/0.5 Bb4/1  A4/0.5 G4/0.5 F#4/0.5 G4/0.5 A4/1 r/1  " +
                    "Bb4/0.5 A4/0.5 G4/0.5 A4/0.5 Bb4/0.5 C#5/0.5 D5/1  C#5/0.5 Bb4/0.5 A4/0.5 G4/0.5 F#4/0.5 Eb4/0.5 D4/1  " +
                    "D4/0.5 F#4/0.5 A4/0.5 F#4/0.5 G4/0.5 A4/0.5 Bb4/1  D5/0.5 C#5/0.5 Bb4/0.5 A4/0.5 Bb4/1 A4/1  " +
                    "G4/0.5 A4/0.5 Bb4/0.5 A4/0.5 G4/0.5 F#4/0.5 G4/1  F#4/0.5 Eb4/0.5 D4/1 D4/1 r/1";
  const K_THEME_B = "D5/2 C#5/1 D5/1  A4/3 r/1  Bb4/1.5 A4/0.5 G4/1 Bb4/1  A4/4  " +
                    "D5/1.5 C#5/0.5 Bb4/1 A4/1  G4/1 A4/1 Bb4/1 C#5/1  D5/1.5 C#5/0.5 Bb4/0.5 A4/0.5 G4/1  F#4/1 Eb4/1 D4/2";
  // Drum patterns for one bar: [beat, pad, loudness]
  const DRUM_PATTERNS = {
    chaal: [[0,"dholBoom",1],[0.75,"dholTak",0.7],[1,"dholTak",0.9],[1.5,"dholBoom",0.9],[2,"dholTak",0.9],[2.5,"dholBoom",0.6],[3,"dholTak",0.9],[3.5,"dholTak",0.7],[3.75,"dholTak",0.5]],
    tabla: [[0.5,"tablaNa",0.6],[1.5,"tablaNa",0.6],[2,"tablaGe",0.8],[2.5,"tablaNa",0.6],[3.25,"tablaGe",0.6],[3.5,"tablaNa",0.7],[3.75,"tablaNa",0.5]],
    kick2: [[0,"kick",0.9],[2,"kick",0.8]],
    dholEnd: [[0,"dholBoom",1],[0,"dholTak",1]],
    // Bar 1: fast tabla roll. Bar 2: a "tihai", one phrase played three times, landing on the next downbeat.
    tablaSolo: b => b % 2 === 0
      ? Array.from({ length: 16 }, (_, k) => [k * 0.25, [0, 6, 12].includes(k) ? "tablaGe" : "tablaNa", k % 4 === 0 ? 1 : 0.55])
      : [[0,"tablaGe",1],[0.5,"tablaNa",0.7], ...[1,2,3].flatMap(x => [[x,"tablaNa",0.9],[x + 0.25,"tablaNa",0.7],[x + 0.5,"tablaGe",1]])],
  };
  function drumWho(d) {
    if (!d || d === "none") return [];
    if (!Array.isArray(d)) return ["drums"];
    const w = new Set();
    d.forEach(n => w.add(n.startsWith("tabla") ? "tabla" : n.startsWith("dhol") || n === "chaal" ? "dhol" : "drums"));
    return [...w];
  }
  const SONGS = {
    rain: { title: "Rain on the Window", bpm: 92, blurb: "Gentle and a little sad. Plays in the sound you pick. About 1 minute.",
      chords: { Am: [52,57,60], F: [53,57,60], C: [48,52,55], G: [50,55,59] }, prog: ["Am","F","C","G"],
      sections: [
        { name: "Intro", bars: 4, left: "arp" },
        { name: "Verse", bars: 8, left: "block", vel: 98, melody:
          "E4/1 A4/1 G4/0.5 E4/0.5 D4/1  F4/1.5 E4/0.5 F4/1 A4/1  G4/2 E4/1 G4/1  D4/3 r/1 " +
          "E4/1 A4/1 B4/1 C5/1  A4/1.5 G4/0.5 F4/1 A4/1  G4/1 E4/1 G4/1 C5/1  B4/3 r/1" },
        { name: "Chorus", bars: 8, left: "arp", vel: 114, melody:
          "C5/1.5 B4/0.5 A4/1 E4/1  F4/1 A4/1 C5/1.5 A4/0.5  G4/1.5 E4/0.5 G4/1 C5/1  B4/1.5 A4/0.5 G4/2 " +
          "C5/1.5 B4/0.5 A4/1 E4/1  F4/1 A4/1 C5/2  G4/1 C5/1 B4/1 G4/1  B4/1 C5/0.5 B4/0.5 A4/2" },
        { name: "Outro", bars: 4, left: "whole", vel: 88, prog: ["Am","F","G","Am"], melody: "E4/2 A4/2  A4/2 G4/1 F4/1  B4/2 G4/2  A4/6" },
      ] },
    golden: { title: "Golden Hour Run", bpm: 112, blurb: "Bright and danceable, with drums and bass. Tune plays in the sound you pick. About 75 seconds.",
      chords: { F: [53,57,60], Am: [52,57,60], G: [50,55,59], C: [48,52,55] }, bass: { F: 41, Am: 45, G: 43, C: 36 }, prog: ["F","Am","G","C"],
      sections: [
        { name: "Intro", bars: 4, left: "stab", vel: 100, drums: "hat", melody: RIFF },
        { name: "Verse", bars: 8, left: "stab", vel: 96, drums: "four", bass: true, melody:
          "A4/1 G4/0.5 F4/1.5 r/1  E4/0.5 F4/0.5 G4/1 A4/1 r/1  B4/1 A4/0.5 G4/1.5 r/1  E4/1 G4/1 E4/1 D4/1  " +
          "A4/1 C5/0.5 A4/1.5 r/1  G4/0.5 A4/0.5 C5/1 B4/1 r/1  B4/1 C5/0.5 B4/1 A4/0.5 G4/1  G4/3 r/1" },
        { name: "Chorus", bars: 8, left: "arp", vel: 116, drums: "full", bass: true, melody: GOLD_CHORUS },
        { name: "Riff", bars: 4, left: "stab", vel: 108, drums: "full", bass: true, melody: RIFF },
        { name: "Last chorus", bars: 8, left: "arp", vel: 120, drums: "full", bass: true, melody: GOLD_CHORUS },
        { name: "Outro", bars: 4, left: "whole", vel: 92, drums: "soft", melody: "A4/4 G4/4 B4/4 C5/6" },
      ] },
    parade: { title: "City Lights Parade", bpm: 100, blurb: "A whole band: all six sounds, joining in one by one. About 90 seconds.",
      chords: { C: [48,52,55], G: [50,55,59], Am: [52,57,60], F: [53,57,60] }, bass: { C: 48, G: 55, Am: 57, F: 53 }, prog: ["C","G","Am","F"],
      sections: [
        { name: "Intro", bars: 4, drums: "none", parts: [
          { role: "chords", style: "whole", snd: "pad", vel: 80 },
          { role: "melody", snd: "bell", text: P_MOTIF, vel: 92 } ] },
        { name: "Verse", bars: 8, drums: "half", parts: [
          { role: "chords", style: "whole", snd: "pad", vel: 62 },
          { role: "chords", style: "block", snd: "piano", vel: 78 },
          { role: "bass", style: "pulse", snd: "bass" },
          { role: "melody", snd: "piano", text: P_VERSE, vel: 102 } ] },
        { name: "Build-up", bars: 4, drums: "four", prog: ["F","G","Am","G"], parts: [
          { role: "chords", style: "stab", snd: "organ", vel: 88 },
          { role: "bass", style: "eighths", snd: "bass" },
          { role: "melody", snd: "piano", text: P_BUILD, vel: 110 } ] },
        { name: "Chorus", bars: 8, drums: "full", parts: CHORUS_PARTS },
        { name: "Breakdown", bars: 4, drums: "none", parts: [
          { role: "chords", style: "whole", snd: "pad", vel: 80 },
          { role: "melody", snd: "bell", text: P_MOTIF, vel: 88 } ] },
        { name: "Final chorus", bars: 8, drums: "full", parts: [ ...CHORUS_PARTS,
          { role: "chords", style: "block", snd: "piano", vel: 66 } ] },
        { name: "Outro", bars: 2, drums: "soft", prog: ["F","C"], parts: [
          { role: "chords", style: "whole", snd: "piano", vel: 86 },
          { role: "chords", style: "whole", snd: "pad", vel: 70 },
          { role: "bass", style: "whole", snd: "bass" },
          { role: "melody", snd: "bell", text: "A4/4 C5/6", vel: 92 } ] },
      ] },
    khyber: { title: "Khyber Sunrise", bpm: 108, blurb: "Pashto and Punjabi folk-dance feel: dhol, tabla, rabab, sitar, bansuri and guzheng. About 75 seconds.",
      chords: { D: [50,57,62], G: [55,58,62] }, prog: ["D","D","G","D"],
      sections: [
        { name: "Sunrise", bars: 4, drums: "none", parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 70 },
          { role: "melody", snd: "bansuri", text: K_INTRO, vel: 96 } ] },
        { name: "Dhol enters", bars: 4, drums: ["chaal"], parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 55 },
          { role: "chords", style: "arp", snd: "rabab", vel: 85 } ] },
        { name: "Rabab tune", bars: 8, drums: ["chaal", "tabla"], parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 55 },
          { role: "melody", snd: "rabab", text: K_THEME_A, vel: 112 } ] },
        { name: "Flute tune", bars: 8, drums: ["chaal", "tabla"], parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 50 },
          { role: "chords", style: "arp", snd: "guzheng", vel: 68, shift: 12 },
          { role: "chords", style: "stab", snd: "rabab", vel: 60 },
          { role: "melody", snd: "bansuri", text: K_THEME_B, vel: 104 } ] },
        { name: "Tabla solo", bars: 2, drums: ["tablaSolo"], parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 60 } ] },
        { name: "Finale", bars: 8, drums: ["chaal", "tabla", "kick2"], parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 55 },
          { role: "chords", style: "arp", snd: "guzheng", vel: 62 },
          { role: "melody", snd: "rabab", text: K_THEME_A, vel: 116 },
          { role: "melody", snd: "bansuri", text: K_THEME_A, vel: 78, shift: 12 } ] },
        { name: "Ending", bars: 2, drums: ["dholEnd"], prog: ["D","D"], parts: [
          { role: "chords", style: "whole", snd: "sitar", vel: 75 },
          { role: "chords", style: "whole", snd: "guzheng", vel: 70 },
          { role: "melody", snd: "bansuri", text: "A4/4 D5/6", vel: 96 } ] },
      ] },
  };

  // Older songs describe parts in shorthand; turn that into the same "parts" list.
  function partsOf(sec) {
    if (sec.parts) return sec.parts;
    const p = [];
    if (sec.left) p.push({ role: "chords", style: sec.left });
    if (sec.melody) p.push({ role: "melody", text: sec.melody, vel: sec.vel });
    if (sec.bass) p.push({ role: "bass", style: "eighths", snd: "drive" });
    return p;
  }
  function buildSong(def) {
    const BEAT = 60000 / def.bpm, ev = [], marks = []; let bar = 0;
    const V = v => Math.max(1, Math.min(127, Math.round(v)));
    const add = (beat, note, dur, vel, snd) => ev.push({ t: beat * BEAT, on: true, note, vel: V(vel), snd }, { t: (beat + dur * 0.92) * BEAT, on: false, note, snd });
    const hit = (beat, kind, vel) => ev.push({ t: beat * BEAT, drum: kind, vel: vel || 1 });
    def.sections.forEach((sec, si) => {
      const parts = partsOf(sec), finalSec = si === def.sections.length - 1;
      marks.push({ bar, name: sec.name, snds: [...new Set(parts.map(p => p.snd || "user"))], drums: drumWho(sec.drums) });
      for (let b = 0; b < sec.bars; b++) {
        const name = (sec.prog || def.prog)[b % 4], s = (bar + b) * 4, last = finalSec && b === sec.bars - 1;
        parts.forEach(p => {
          const sh = p.shift || 0, snd = p.snd, m = (p.vel || 100) / 100;
          if (p.role === "chords") {
            const ch = def.chords[name].map(n => n + sh);
            if (p.style === "arp") [0,1,2,1,0,1,2,1].forEach((i, k) => add(s + k * 0.5, ch[i], 0.5, (k % 4 === 0 ? 84 : 66) * m, snd));
            else if (p.style === "block") { ch.forEach(n => add(s, n, 2, 76 * m, snd)); ch.forEach(n => add(s + 2, n, 2, 62 * m, snd)); }
            else if (p.style === "stab") [0, 1.5, 2, 3.5].forEach((o, k) => ch.forEach(n => add(s + o, n, 0.4, (k % 2 ? 66 : 80) * m, snd)));
            else ch.forEach(n => add(s, n, last ? 6 : 4, 72 * m, snd));
          } else if (p.role === "bass") {
            const n = def.bass[name] + sh;
            if (p.style === "eighths") for (let k = 0; k < 8; k++) add(s + k * 0.5, n, 0.45, k % 2 ? 70 : 95, snd);
            else if (p.style === "pulse") { add(s, n, 1.5, 95, snd); add(s + 1.5, n, 0.5, 70, snd); add(s + 2, n, 2, 88, snd); }
            else add(s, n, last ? 6 : 4, 90, snd);
          }
        });
        const d = sec.drums;
        if (d === "four" || d === "full") for (let k = 0; k < 4; k++) hit(s + k, "kick");
        if (d === "half") { hit(s, "kick"); hit(s + 2, "kick", 0.85); }
        if (d === "hat" || d === "half" || d === "four" || d === "full") for (let k = 0; k < 8; k++) hit(s + k * 0.5, "hat", k % 2 ? 1 : 0.5);
        if (d === "full") { hit(s + 1, "clap"); hit(s + 3, "clap"); }
        if (d === "soft") hit(s, "kick", 0.8);
        if (Array.isArray(d)) d.forEach(nm => { const pat = DRUM_PATTERNS[nm]; (typeof pat === "function" ? pat(b) : pat).forEach(([o, k, v]) => hit(s + o, k, v)); });
      }
      parts.filter(p => p.role === "melody").forEach(p => {
        let beat = bar * 4;
        mel(p.text).forEach(([n, dur]) => { if (n != null) add(beat, n + (p.shift || 0), dur, p.vel || 100, p.snd); beat += dur; });
      });
      bar += sec.bars;
    });
    ev.sort((a, b) => a.t - b.t || (a.on === false ? -1 : b.on === false ? 1 : 0));
    return { ev, marks, totalBars: bar, beat: BEAT, end: (bar * 4 + 3) * BEAT };
  }

  const songsEl = document.getElementById("songs"), songStatus = document.getElementById("songStatus"), songBtns = {};
  const IDLE = "Pick a song. The keys light up as it plays.";
  let songTimers = [], playingId = null;
  function markSounds(snds) { Object.keys(SOUNDS).forEach(id => { const b = document.getElementById("snd-" + id); if (b) b.classList.toggle("in-song", snds.includes(id)); }); }
  function stopSong(msg) {
    songTimers.forEach(clearTimeout); songTimers = []; playingId = null;
    releaseAll(true); markSounds([]);
    Object.entries(songBtns).forEach(([id, b]) => { b.textContent = "▶ " + SONGS[id].title; b.setAttribute("aria-pressed", "false"); });
    songStatus.textContent = msg || IDLE;
  }
  function playSong(id) {
    const was = playingId; stopSong();
    if (was === id) return;
    stopPlayback(); audio();
    if (base !== 48) { releaseAll(false); base = 48; buildKeys(); octDown.disabled = false; octUp.disabled = false; }
    const def = SONGS[id], song = buildSong(def), t0 = 250;
    playingId = id; songBtns[id].textContent = "■ Stop"; songBtns[id].setAttribute("aria-pressed", "true");
    songStatus.textContent = def.blurb;
    song.ev.forEach(e => songTimers.push(setTimeout(() => e.drum ? hitPad(e.drum, e.vel, true) : e.on ? noteOn(e.note, e.vel, true, e.snd) : noteOff(e.note, true, e.snd), t0 + e.t)));
    for (let b = 0; b < song.totalBars; b++) {
      const sec = [...song.marks].reverse().find(m => m.bar <= b);
      const who = sec.snds.map(s => s === "user" ? "your sound" : s === "drive" ? "bass" : SOUNDS[s].label.toLowerCase());
      who.push(...sec.drums);
      songTimers.push(setTimeout(() => {
        songStatus.textContent = def.title + ": " + sec.name + " · bar " + (b + 1) + " of " + song.totalBars + " · playing: " + [...new Set(who)].join(", ");
        markSounds(sec.snds);
      }, t0 + b * 4 * song.beat));
    }
    songTimers.push(setTimeout(() => stopSong("Finished. Play it again, or try another song."), t0 + song.end));
  }
  Object.keys(SONGS).forEach(id => {
    const b = document.createElement("button"); b.id = "song-" + id; b.setAttribute("aria-pressed", "false");
    b.title = SONGS[id].blurb; b.textContent = "▶ " + SONGS[id].title; b.onclick = () => playSong(id);
    songsEl.appendChild(b); songBtns[id] = b;
  });

  // ---------- Optional real MIDI keyboard ----------
  const midiStatus = document.getElementById("midiStatus");
  document.getElementById("midiBtn").onclick = () => {
    if (!navigator.requestMIDIAccess) { midiStatus.textContent = "This browser can't talk to MIDI devices. Chrome or Edge on a computer can."; return; }
    navigator.requestMIDIAccess().then(access => {
      const ins = [...access.inputs.values()];
      if (!ins.length) { midiStatus.textContent = "No MIDI keyboard found. Plug one in by USB and press the button again."; return; }
      ins.forEach(i => i.onmidimessage = m => {
        const [st, d1, d2] = m.data, cmd = st & 0xf0;
        if (cmd === 0x90 && d2 > 0) noteOn(d1, d2);
        else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) noteOff(d1);
        else if (cmd === 0xb0 && d1 === 64) setSustain(d2 >= 64);
      });
      midiStatus.textContent = "Connected: " + ins.map(i => i.name).join(", ");
    }).catch(() => { midiStatus.textContent = "The browser didn't allow this page to use MIDI devices, so only the on-screen keys work here."; });
  };

  buildKeys();
})();
