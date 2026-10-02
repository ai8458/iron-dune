export class BattleAudio {
  constructor() { this.enabled = false; this.context = null; }
  init() {
    if (this.context) { this.context.resume().catch(() => {}); return; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain(); this.master.gain.value = this.enabled ? .45 : 0; this.master.connect(this.context.destination);
    this.engine = this.context.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 35;
    this.engineFilter = this.context.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 100;
    this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0;
    this.engine.connect(this.engineFilter); this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
  }
  setEnabled(value) { this.enabled = value; this.init(); this.master?.gain.setTargetAtTime(value ? .45 : 0, this.context.currentTime, .04); }
  update(speed, active) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(30 + Math.abs(speed) * 3.1, now, .1);
    this.engineFilter.frequency.setTargetAtTime(100 + Math.abs(speed) * 12, now, .1);
    this.engineGain.gain.setTargetAtTime(active ? .038 + Math.abs(speed) * .0014 : 0, now, .12);
  }
  tone(freq, endFreq, duration, volume, type = 'sine') {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime, oscillator = this.context.createOscillator(), gain = this.context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(freq, now); oscillator.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(this.master); oscillator.start(); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  noise(duration, volume, frequency) {
    if (!this.context || !this.enabled) return;
    const context = this.context, buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const source = context.createBufferSource(); source.buffer = buffer;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = frequency;
    const gain = context.createGain(); gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  fire(distant = false) { this.tone(115, 27, .6, distant ? .12 : .42, 'triangle'); this.noise(distant ? .25 : .7, distant ? .18 : .6, 1000); }
  hit() { this.tone(700, 200, .14, .09, 'square'); this.noise(.2, .28, 1500); }
  explosion() { this.tone(85, 20, .9, .35); this.noise(1.2, .45, 800); }
  ready() { this.tone(600, 900, .12, .05); }
}
