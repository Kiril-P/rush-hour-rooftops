/** Original, gently varying score: 76 BPM, D major / B minor, eight-bar phrases.
 * Shared by the live engine and offline audio verification. No downloaded assets. */
export const BEAT = 60 / 76;
export const CHORDS = [
  [50, 57, 61, 64, 69],
  [50, 57, 61, 66, 69],
  [47, 54, 57, 61, 66],
  [47, 54, 57, 62, 66],
  [43, 50, 54, 57, 62],
  [43, 50, 54, 59, 62],
  [45, 52, 57, 59, 64],
  [45, 52, 55, 59, 64],
];
const melody = [
  [78, -1, 76, -1, 73, -1, 69, -1],
  [73, -1, -1, 76, 78, -1, -1, -1],
  [78, -1, 73, -1, 71, -1, 69, -1],
  [66, -1, -1, 69, 73, -1, -1, -1],
  [74, -1, 73, -1, 71, -1, 69, -1],
  [71, -1, -1, 74, 78, -1, -1, -1],
  [76, -1, 73, -1, 71, -1, 69, -1],
  [73, -1, 71, -1, 69, -1, -1, -1],
];
export type MixChannel = "music" | "ambience" | "effects";
export type MixLevels = Record<MixChannel, number>;
export const DEFAULT_MIX: MixLevels = {
  music: 0.72,
  ambience: 0.55,
  effects: 0.7,
};
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export class Soundscape {
  readonly output: GainNode;
  readonly buses: Record<MixChannel, GainNode>;
  private reverb: ConvolverNode;
  private randomState = 19473;
  private wind: AudioBufferSourceNode | null = null;
  constructor(readonly context: BaseAudioContext) {
    const c = context;
    this.output = c.createGain();
    this.output.gain.value = 0.8;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.008;
    limiter.release.value = 0.25;
    this.output.connect(limiter).connect(c.destination);
    this.buses = {
      music: c.createGain(),
      ambience: c.createGain(),
      effects: c.createGain(),
    };
    for (const key of Object.keys(this.buses) as MixChannel[]) {
      this.buses[key].gain.value = 0;
      this.buses[key].connect(this.output);
    }
    this.reverb = c.createConvolver();
    const impulse = c.createBuffer(2, c.sampleRate * 2.7, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < data.length; i++)
        data[i] = this.random() * Math.pow(1 - i / data.length, 3.2) * 0.55;
    }
    this.reverb.buffer = impulse;
    const wet = c.createGain();
    wet.gain.value = 0.22;
    this.reverb.connect(wet).connect(this.output);
    this.buses.music.connect(this.reverb);
    this.buses.effects.connect(this.reverb);
    this.setMix(DEFAULT_MIX, false, false);
  }
  private random() {
    this.randomState =
      (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 2147483648 - 1;
  }
  setMix(levels: MixLevels, paused: boolean, rush: boolean) {
    const t = this.context.currentTime;
    this.buses.music.gain.setTargetAtTime(
      levels.music * (paused ? 0.85 : rush ? 1.65 : 1.5),
      t,
      0.6,
    );
    this.buses.ambience.gain.setTargetAtTime(levels.ambience * 0.6, t, 0.6);
    this.buses.effects.gain.setTargetAtTime(levels.effects * 0.8, t, 0.12);
  }
  tone(
    midi: number,
    time: number,
    duration: number,
    volume: number,
    channel: MixChannel = "music",
    pan = 0,
    soft = false,
  ) {
    const c = this.context,
      o = c.createOscillator(),
      gain = c.createGain(),
      filter = c.createBiquadFilter(),
      stereo = c.createStereoPanner();
    o.type = soft ? "triangle" : "sine";
    o.frequency.value = hz(midi);
    filter.type = "lowpass";
    filter.frequency.value = soft ? 950 : 3200;
    stereo.pan.value = pan;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + (soft ? 0.35 : 0.009));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    o.connect(filter)
      .connect(gain)
      .connect(stereo)
      .connect(this.buses[channel]);
    o.start(time);
    o.stop(time + duration + 0.04);
    o.onended = () => {
      o.disconnect();
      filter.disconnect();
      gain.disconnect();
      stereo.disconnect();
    };
  }
  startAir() {
    if (this.wind) return;
    const c = this.context,
      buffer = c.createBuffer(2, c.sampleRate * 12, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = (last + this.random() * 0.025) / 1.025;
        data[i] =
          Math.min(
            1,
            i / (c.sampleRate * 0.05),
            (data.length - 1 - i) / (c.sampleRate * 0.05),
          ) *
          last *
          3 *
          (0.7 + 0.3 * Math.sin((i / data.length) * Math.PI * 2) ** 2);
      }
    }
    this.wind = c.createBufferSource();
    this.wind.buffer = buffer;
    this.wind.loop = true;
    const low = c.createBiquadFilter(),
      high = c.createBiquadFilter(),
      gain = c.createGain();
    low.type = "lowpass";
    low.frequency.value = 1100;
    high.type = "highpass";
    high.frequency.value = 180;
    gain.gain.value = 0.26;
    this.wind
      .connect(low)
      .connect(high)
      .connect(gain)
      .connect(this.buses.ambience);
    this.wind.start();
  }
  private birds(time: number, pan: number) {
    const c = this.context;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(),
        g = c.createGain(),
        p = c.createStereoPanner(),
        t = time + i * 0.23;
      o.frequency.setValueAtTime(1450 + i * 120, t);
      o.frequency.exponentialRampToValueAtTime(2250, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(1750, t + 0.16);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.buses.ambience);
      o.start(t);
      o.stop(t + 0.2);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
        p.disconnect();
      };
    }
  }
  schedule(
    step: number,
    time: number,
    paused = false,
    rush = false,
    activity = 0,
  ) {
    const bar = Math.floor(step / 8),
      slot = step % 8,
      chord = CHORDS[bar % 8],
      phrase = Math.floor(bar / 8);
    if (slot === 0) {
      chord
        .slice(1, 4)
        .forEach((note, i) =>
          this.tone(
            note,
            time + i * 0.06,
            BEAT * 5,
            0.026,
            "music",
            (i - 1) * 0.5,
            true,
          ),
        );
      this.tone(chord[0] - 12, time, BEAT * 3.8, 0.038, "music", 0, true);
    }
    if (!paused) {
      // Felt-key arpeggio leaves air around a sparse, singable upper melody.
      if (slot % 2 === 0)
        this.tone(
          chord[1 + ((slot / 2 + phrase) % 4)],
          time,
          1.5,
          0.06,
          "music",
          slot % 4 === 0 ? -0.25 : 0.25,
        );
      const note = melody[bar % 8][slot];
      if (note >= 0 && (phrase % 3 !== 2 || slot === 0 || slot === 4)) {
        this.tone(note, time + 0.025, 2.4, 0.044, "music", 0.15);
        this.tone(note + 12, time + 0.03, 1.1, 0.006, "music", -0.2);
      }
      if (rush && slot % 2 === 1)
        this.tone(chord[1] + 12, time, 0.65, 0.018, "music", -0.35);
    }
    // Sparse distant wind chimes and a low, rounded cable-motor hum.
    if (step % 64 === 30) this.birds(time, phrase % 2 ? -0.75 : 0.75);
    if (step % 32 === 18)
      this.tone(chord[4] + 12, time, 3.1, 0.022, "ambience", 0.65);
    if (slot === 2 && activity > 0)
      this.tone(
        38,
        time,
        2.2,
        Math.min(0.016, activity * 0.001),
        "ambience",
        -0.4,
        true,
      );
  }
  dispose() {
    try {
      this.wind?.stop();
    } catch {
      /* Already stopped. */
    }
    this.wind = null;
  }
}
