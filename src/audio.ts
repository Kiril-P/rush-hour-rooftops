import {
  Soundscape,
  BEAT,
  DEFAULT_MIX,
  type MixLevels,
  type MixChannel,
  CHORDS,
} from "./audio-score";
export class AudioEngine {
  context: AudioContext | null = null;
  enabled = true;
  levels: MixLevels = { ...DEFAULT_MIX };
  private scene: Soundscape | null = null;
  private step = 0;
  private next = 0;
  private paused = false;
  private rush = false;
  private activity = 0;
  private hidden = false;
  private lastCue = new Map<string, number>();
  private delivery = 0;
  start() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.scene = new Soundscape(this.context);
        this.scene.output.gain.value = this.enabled ? 0.8 : 0;
        this.scene.startAir();
        this.next = this.context.currentTime + 0.1;
        this.applyMix();
      }
      if (this.enabled && !this.hidden && this.context.state === "suspended")
        void this.context.resume().catch(() => {});
    } catch {
      /* Audio is optional when the browser denies an audio device. */
    }
  }
  setEnabled(value: boolean) {
    this.enabled = value;
    this.scene?.output.gain.setTargetAtTime(
      value ? 0.8 : 0,
      this.context!.currentTime,
      0.2,
    );
    if (value) this.start();
  }
  setLevel(channel: MixChannel, value: number) {
    this.levels[channel] = Math.max(
      0,
      Math.min(1, Number.isFinite(value) ? value : DEFAULT_MIX[channel]),
    );
    this.applyMix();
  }
  private applyMix() {
    this.scene?.setMix(this.levels, this.paused, this.rush);
  }
  visibility(hidden: boolean) {
    this.hidden = hidden;
    if (hidden) void this.context?.suspend().catch(() => {});
    else if (this.enabled) void this.context?.resume().catch(() => {});
  }
  update(paused: boolean, rush: boolean, activity: number) {
    if (paused !== this.paused || rush !== this.rush) {
      this.paused = paused;
      this.rush = rush;
      this.applyMix();
    }
    this.activity = activity;
    if (
      !this.context ||
      !this.scene ||
      this.context.state !== "running" ||
      this.hidden
    )
      return;
    const now = this.context.currentTime;
    // Never replay a backlog after a long frame or a suspended tab.
    if (this.next < now - 0.1) this.next = now + 0.05;
    while (this.next < now + 0.18) {
      this.scene.schedule(
        this.step++,
        this.next,
        this.paused,
        this.rush,
        this.activity,
      );
      this.next += BEAT / 2;
    }
  }
  note(kind: string) {
    if (
      !this.context ||
      !this.scene ||
      !this.enabled ||
      this.hidden ||
      this.context.state !== "running"
    )
      return;
    const time = this.context.currentTime,
      last = this.lastCue.get(kind) ?? -99;
    const cooldown =
      kind === "delivery"
        ? 0.32
        : kind === "build"
          ? 0.09
          : kind === "warning"
            ? 4
            : 0.45;
    if (time - last < cooldown) return;
    this.lastCue.set(kind, time);
    const chord = CHORDS[Math.floor(Math.max(0, this.step - 1) / 8) % 8];
    const notes: Record<string, number[]> = {
      build: [chord[2]],
      delivery: [chord[2] + 12],
      spawn: [69, 74],
      open: [66, 69],
      expand: [62, 69, 74],
      warning: [57, 54],
      weekly: [62, 66, 69, 74],
      rush: [57, 62, 66],
      gameover: [69, 66, 62, 59],
    };
    const cue = notes[kind];
    if (!cue) return;
    const volume =
      kind === "delivery"
        ? 0.06
        : kind === "build"
          ? 0.1
          : kind === "warning"
            ? 0.1
            : 0.09;
    cue.forEach((n, i) => {
      const midi =
        kind === "delivery" ? chord[2 + (this.delivery++ % 3)] + 12 : n;
      this.scene!.tone(
        midi,
        time + i * 0.16,
        kind === "build" ? 0.14 : 1.3,
        volume,
        "effects",
        kind === "delivery" ? Math.sin(this.delivery) * 0.25 : 0,
      );
    });
  }
  reset() {
    this.scene?.dispose();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.scene = null;
    this.step = 0;
    this.next = 0;
    this.delivery = 0;
    this.lastCue.clear();
  }
}
