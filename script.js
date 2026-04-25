const TWINKLE_NOTES = [
  60,60,67,67,69,69,67, 
  65,65,64,64,62,62,60, 
  67,67,65,65,64,64,62,
  67,67,65,65,64,64,62, 
  60,60,67,67,69,69,67,
  65,65,64,64,62,62,60 
];

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToName(midi) {
  const oct = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + oct;
}

class MarkovChain {
  constructor(order = 1) {
    this.order = order;
    this.transitions = new Map(); 
  }

  train(sequence) {
    this.transitions.clear();
    for (let i = 0; i < sequence.length - this.order; i++) {
      const state = sequence.slice(i, i + this.order);
      const next = sequence[i + this.order];
      const key = JSON.stringify(state);
      if (!this.transitions.has(key)) this.transitions.set(key, {});
      const counts = this.transitions.get(key);
      counts[next] = (counts[next] || 0) + 1;
    }
  }

  getProbabilities(stateKey) {
    const counts = this.transitions.get(stateKey);
    if (!counts) return null;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const probs = {};
    for (const [note, count] of Object.entries(counts)) {
      probs[note] = count / total;
    }
    return probs;
  }

  sample(stateKey) {
    const counts = this.transitions.get(stateKey);
    if (!counts) return null;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [note, count] of Object.entries(counts)) {
      r -= count;
      if (r <= 0) return parseInt(note);
    }
    return parseInt(Object.keys(counts)[0]);
  }

  generate(length, seed = null) {
    const keys = [...this.transitions.keys()];
    if (keys.length === 0) return [];

    let state;
    if (seed && seed.length === this.order) {
      const k = JSON.stringify(seed);
      state = this.transitions.has(k) ? [...seed] : JSON.parse(keys[Math.floor(Math.random() * keys.length)]);
    } else {
      state = JSON.parse(keys[Math.floor(Math.random() * keys.length)]);
    }

    const result = [...state];
    for (let i = 0; i < length - this.order; i++) {
      const key = JSON.stringify(state);
      const next = this.sample(key);
      if (next === null) {
        const newState = JSON.parse(keys[Math.floor(Math.random() * keys.length)]);
        state = newState;
        result.push(state[0]);
      } else {
        result.push(next);
        state = [...state.slice(1), next];
      }
    }
    return result;
  }

  getTransitionMatrix() {
    const allNotes = new Set();
    for (const [key, counts] of this.transitions) {
      JSON.parse(key).forEach(n => allNotes.add(n));
      Object.keys(counts).forEach(n => allNotes.add(parseInt(n)));
    }
    return { transitions: this.transitions, allNotes: [...allNotes].sort((a,b)=>a-b) };
  }
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.stopFlag = false;
    this.activeOscillators = [];
    this._resolveStop = null;
  }

  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  midiToFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  playNote(midi, time, duration, gainVal = 0.4) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.midiToFreq(midi), time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainVal, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration * 0.9);
    osc.start(time);
    osc.stop(time + duration);
    this.activeOscillators.push(osc);
    osc.onended = () => {
      const idx = this.activeOscillators.indexOf(osc);
      if (idx !== -1) this.activeOscillators.splice(idx, 1);
    };
    return osc;
  }

  async playSequence(notes, bpm, onNoteCallback) {
    this.init();
    this.isPlaying = true;
    this.stopFlag = false;
    this.activeOscillators = [];
    const beatDur = 60 / bpm;
    const startTime = this.ctx.currentTime + 0.1;

    for (let i = 0; i < notes.length; i++) {
      const t = startTime + i * beatDur;
      this.playNote(notes[i], t, beatDur * 0.85);

      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000 - 20);
      setTimeout(() => {
        if (!this.stopFlag && onNoteCallback) onNoteCallback(i, notes[i]);
      }, delay);
    }

    const totalMs = notes.length * beatDur * 1000 + 200;
    await new Promise(resolve => {
      this._resolveStop = resolve;
      setTimeout(resolve, totalMs);
    });
    this._resolveStop = null;
    this.isPlaying = false;
  }

  stop() {
    this.stopFlag = true;
    this.isPlaying = false;
    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const osc of this.activeOscillators) {
      try {
        osc.gain && osc.gain.cancelScheduledValues && osc.gain.cancelScheduledValues(now);
        osc.stop(now);
      } catch(e) { /* already stopped */ }
    }
    this.activeOscillators = [];
    if (this._resolveStop) {
      this._resolveStop();
      this._resolveStop = null;
    }
  }
}

window.MarkovChain = MarkovChain;
window.AudioEngine = AudioEngine;
window.TWINKLE_NOTES = TWINKLE_NOTES;
window.midiToName = midiToName;