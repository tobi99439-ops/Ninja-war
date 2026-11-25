// Procedural Web Audio API sound effects + Battle Music for Naruto Shippuden 3D

export type MusicTheme = 'title' | 'battle' | 'silent';

export interface MusicTrack {
  id: string;
  nameAr: string;
  url: string;
}

export const BATTLE_MUSIC_TRACKS: MusicTrack[] = [
  {
    id: 'hidan',
    nameAr: 'ثيم هيدان (Hidan Theme)',
    url: '/assets/aistudio/Hidan_Theme_Song_88afddde.mp3',
  },
  {
    id: 'girei',
    nameAr: 'ثيم باين - غيري (Pain / Girei Theme)',
    url: '/assets/aistudio/Naruto_Shippuden_-_Girei__Pains_Theme_Song__02109998.mp3',
  },
];

const GEDO_VOICE_URL = 'https://files.catbox.moe/4trh2x.mp3';
const TOBI_KATON_VOICE_URL = 'https://files.catbox.moe/jqcd7r.mp3';
const TOBI_KAMUI_VOICE_URL = 'https://files.catbox.moe/bf3kx3.mp3';
const MADARA_KATON_VOICE_URL = 'https://files.catbox.moe/ghfvxa.mp3';

// Balanced level: soft enough not to overpower combat SFX, yet clearly audible in battle
const BATTLE_MUSIC_GAIN = 0.28;

class ShinobiSoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private appBackgrounded = false;
  private cachedNoiseBuffer: AudioBuffer | null = null;

  // Interactive background music state (menus stay silent; Hidan theme plays in battle)
  private musicTheme: MusicTheme = 'silent';

  // Battle track (MP3) routed through Web Audio gain + gentle high-frequency smoothing
  private battleAudio: HTMLAudioElement | null = null;
  private battleMediaNode: MediaElementAudioSourceNode | null = null;
  private battleGainNode: GainNode | null = null;

  private gedoVoiceAudio: HTMLAudioElement | null = null;
  private katonVoiceAudio: HTMLAudioElement | null = null;
  private kamuiVoiceAudio: HTMLAudioElement | null = null;
  private madaraKatonVoiceAudio: HTMLAudioElement | null = null;

  constructor() {
    this.bindLifecycleListeners();
  }

  private bindLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const onVisibility = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        this.handleAppBackground();
      } else {
        this.handleAppForeground();
      }
    };
    const onPauseNow = () => this.handleAppBackground();
    const onFocus = () => {
      if (!document.hidden && document.visibilityState !== 'hidden') {
        this.handleAppForeground();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPauseNow);
    window.addEventListener('beforeunload', onPauseNow);
    window.addEventListener('unload', onPauseNow);
    window.addEventListener('blur', onPauseNow);
    window.addEventListener('focus', onFocus);
    document.addEventListener('freeze', onPauseNow);
    document.addEventListener('resume', onFocus);

    // Direct native bridge hooks for Android APK WebView (onPause / onStop / onDestroy / onResume)
    const win = window as unknown as {
      __shinobiPauseAudio?: () => void;
      __shinobiResumeAudio?: () => void;
    };
    win.__shinobiPauseAudio = () => this.handleAppBackground();
    win.__shinobiResumeAudio = () => this.handleAppForeground();
  }

  private pauseAllVoiceElements(muteWhilePaused: boolean): void {
    const voices = [
      this.gedoVoiceAudio,
      this.katonVoiceAudio,
      this.kamuiVoiceAudio,
      this.madaraKatonVoiceAudio,
    ];
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      if (!v) continue;
      if (muteWhilePaused) v.muted = true;
      if (!v.paused) {
        try {
          v.pause();
        } catch {
          // Ignore pause errors during teardown
        }
      }
    }
  }

  /** Immediately silences and suspends ALL music, voices, and WebAudio when leaving app/tab. */
  public handleAppBackground(): void {
    this.appBackgrounded = true;

    if (this.battleAudio) {
      this.battleAudio.muted = true;
      try {
        this.battleAudio.pause();
      } catch {
        // Ignore media pause error
      }
    }
    this.pauseAllVoiceElements(true);

    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.battleGainNode) {
        this.battleGainNode.gain.cancelScheduledValues(now);
        this.battleGainNode.gain.setValueAtTime(0.0001, now);
      }
      if (this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => {});
      }
    }
  }

  /** Cleanly restores music/audio when the user returns to the foreground (if not muted). */
  public handleAppForeground(): void {
    if (!this.appBackgrounded) return;
    this.appBackgrounded = false;

    const voices = [
      this.gedoVoiceAudio,
      this.katonVoiceAudio,
      this.kamuiVoiceAudio,
      this.madaraKatonVoiceAudio,
    ];
    for (let i = 0; i < voices.length; i++) {
      if (voices[i]) voices[i]!.muted = this.muted;
    }
    if (this.battleAudio) {
      this.battleAudio.muted = this.muted;
    }

    if (this.muted) return;

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (this.musicTheme === 'battle') {
      this.startBattleTrack();
    }
  }

  private getReusableNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.cachedNoiseBuffer && this.cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
      return this.cachedNoiseBuffer;
    }
    // Pre-generate 1.0s normalized white noise buffer once to avoid main-thread allocation spikes on skill cast
    const len = Math.max(8192, Math.floor(ctx.sampleRate * 1.0));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.cachedNoiseBuffer = buf;
    return buf;
  }

  private ensureContext(allowWhenMuted = false): AudioContext | null {
    if (this.appBackgrounded) return null;
    if (this.muted && !allowWhenMuted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted && !this.appBackgrounded) {
      void this.ctx.resume().catch(() => {});
    }
    return this.muted || this.appBackgrounded ? null : this.ctx;
  }

  private activeTrackIndex: number = (() => {
    try {
      const saved = window.localStorage.getItem('naruto_obito_music_track_idx');
      const parsed = saved !== null ? parseInt(saved, 10) : 0;
      return Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(BATTLE_MUSIC_TRACKS.length - 1, parsed));
    } catch {
      return 0;
    }
  })();

  public getAvailableTracks(): MusicTrack[] {
    return BATTLE_MUSIC_TRACKS;
  }

  public getActiveTrackIndex(): number {
    return this.activeTrackIndex;
  }

  public setActiveTrackIndex(index: number): void {
    const nextIdx = Math.max(0, Math.min(BATTLE_MUSIC_TRACKS.length - 1, index));
    if (this.activeTrackIndex === nextIdx && this.battleAudio) return;
    this.activeTrackIndex = nextIdx;
    try {
      window.localStorage.setItem('naruto_obito_music_track_idx', String(nextIdx));
    } catch {}

    if (this.battleAudio) {
      try {
        this.battleAudio.pause();
      } catch {}
      this.battleAudio = null;
      this.battleMediaNode = null;
      this.battleGainNode = null;
    }

    if (this.musicTheme === 'battle' && !this.muted && !this.appBackgrounded) {
      this.startBattleTrack();
    }
  }

  public nextTrack(): number {
    const nextIdx = (this.activeTrackIndex + 1) % BATTLE_MUSIC_TRACKS.length;
    this.setActiveTrackIndex(nextIdx);
    return nextIdx;
  }

  private ensureBattleAudio(ctx: AudioContext): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

    const tracks = BATTLE_MUSIC_TRACKS;
    const activeIdx = Math.max(0, Math.min(tracks.length - 1, this.activeTrackIndex));
    const trackUrl = tracks[activeIdx].url;

    if (!this.battleAudio) {
      const audio = new Audio(trackUrl);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 1.0;
      audio.muted = this.muted || this.appBackgrounded;
      this.battleAudio = audio;
    } else if (!this.battleAudio.src.includes(trackUrl)) {
      try {
        this.battleAudio.pause();
      } catch {}
      const audio = new Audio(trackUrl);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 1.0;
      audio.muted = this.muted || this.appBackgrounded;
      this.battleAudio = audio;
      this.battleMediaNode = null;
      this.battleGainNode = null;
    }

    if (!this.battleMediaNode && !this.battleGainNode) {
      try {
        const source = ctx.createMediaElementSource(this.battleAudio);
        const toneFilter = ctx.createBiquadFilter();
        toneFilter.type = 'highshelf';
        toneFilter.frequency.value = 4200;
        toneFilter.gain.value = -2.5; // Smooth harsh upper frequencies so battle mix stays calm & clear

        const gain = ctx.createGain();
        gain.gain.value = 0.0001;

        source.connect(toneFilter);
        toneFilter.connect(gain);
        gain.connect(ctx.destination);

        this.battleMediaNode = source;
        this.battleGainNode = gain;
      } catch {
        // Fallback: direct HTMLAudioElement volume control if MediaElementSource is unavailable
        this.battleAudio.volume = this.muted ? 0 : BATTLE_MUSIC_GAIN;
      }
    }

    return this.battleAudio;
  }

  private startBattleTrack(): void {
    if (this.muted || this.appBackgrounded) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const audio = this.ensureBattleAudio(ctx);
    if (!audio) return;
    audio.muted = false;

    const now = ctx.currentTime;
    if (this.battleGainNode) {
      this.battleGainNode.gain.cancelScheduledValues(now);
      this.battleGainNode.gain.setTargetAtTime(BATTLE_MUSIC_GAIN, now, 0.35);
      audio.volume = 1.0;
    } else {
      audio.volume = BATTLE_MUSIC_GAIN;
    }

    if (audio.paused) {
      void audio.play().catch(() => {});
    }
  }

  private pauseBattleTrack(resetTime = false): void {
    if (!this.battleAudio) return;
    if (this.ctx && this.battleGainNode) {
      const now = this.ctx.currentTime;
      this.battleGainNode.gain.cancelScheduledValues(now);
      this.battleGainNode.gain.setValueAtTime(0.0001, now);
    }
    this.battleAudio.pause();
    if (resetTime) {
      try {
        this.battleAudio.currentTime = 0;
      } catch {
        // Ignore if metadata not loaded yet
      }
    }
  }

  public resetBattleTrack(): void {
    if (this.battleAudio) {
      try {
        this.battleAudio.currentTime = 0;
      } catch {
        // Ignore if metadata not loaded yet
      }
    }
  }

  public preloadGedoVoice(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.gedoVoiceAudio) {
      const voice = new Audio(GEDO_VOICE_URL);
      voice.preload = 'auto';
      voice.volume = 1.0;
      this.gedoVoiceAudio = voice;
    }
    return this.gedoVoiceAudio;
  }

  public playGedoVoice(): void {
    if (this.muted || this.appBackgrounded) return;
    const voice = this.preloadGedoVoice();
    if (!voice) return;

    voice.muted = false;
    voice.volume = 1.0;
    try {
      voice.currentTime = 0;
    } catch {
      // Ignore if media metadata not yet loaded
    }

    if (this.ctx && this.battleGainNode && this.musicTheme === 'battle') {
      const now = this.ctx.currentTime;
      this.battleGainNode.gain.cancelScheduledValues(now);
      this.battleGainNode.gain.setTargetAtTime(0.1, now, 0.06);
      this.battleGainNode.gain.setTargetAtTime(BATTLE_MUSIC_GAIN, now + 3.8, 0.45);
    }

    void voice.play().catch(() => {});
  }

  public preloadKatonVoice(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.katonVoiceAudio) {
      const voice = new Audio(TOBI_KATON_VOICE_URL);
      voice.preload = 'auto';
      voice.volume = 1.0;
      this.katonVoiceAudio = voice;
    }
    return this.katonVoiceAudio;
  }

  public playKatonVoice(): void {
    if (this.muted || this.appBackgrounded) return;
    const voice = this.preloadKatonVoice();
    if (!voice) return;

    voice.muted = false;
    voice.volume = 1.0;
    try {
      voice.currentTime = 0;
    } catch {
      // Ignore if media metadata not yet loaded
    }

    if (this.ctx && this.battleGainNode && this.musicTheme === 'battle') {
      const now = this.ctx.currentTime;
      this.battleGainNode.gain.cancelScheduledValues(now);
      this.battleGainNode.gain.setTargetAtTime(0.12, now, 0.05);
      this.battleGainNode.gain.setTargetAtTime(BATTLE_MUSIC_GAIN, now + 2.2, 0.4);
    }

    void voice.play().catch(() => {});
  }

  public preloadKamuiVoice(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.kamuiVoiceAudio) {
      const voice = new Audio(TOBI_KAMUI_VOICE_URL);
      voice.preload = 'auto';
      voice.volume = 1.0;
      this.kamuiVoiceAudio = voice;
    }
    return this.kamuiVoiceAudio;
  }

  public playKamuiVoice(): void {
    if (this.muted || this.appBackgrounded) return;
    const voice = this.preloadKamuiVoice();
    if (!voice) return;

    voice.muted = false;
    voice.volume = 1.0;
    try {
      voice.currentTime = 0;
    } catch {
      // Ignore if media metadata not yet loaded
    }

    if (this.ctx && this.battleGainNode && this.musicTheme === 'battle') {
      const now = this.ctx.currentTime;
      this.battleGainNode.gain.cancelScheduledValues(now);
      this.battleGainNode.gain.setTargetAtTime(0.12, now, 0.05);
      this.battleGainNode.gain.setTargetAtTime(BATTLE_MUSIC_GAIN, now + 2.4, 0.4);
    }

    void voice.play().catch(() => {});
  }

  public preloadMadaraKatonVoice(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.madaraKatonVoiceAudio) {
      const voice = new Audio(MADARA_KATON_VOICE_URL);
      voice.preload = 'auto';
      voice.volume = 1.0;
      this.madaraKatonVoiceAudio = voice;
    }
    return this.madaraKatonVoiceAudio;
  }

  public playMadaraKatonVoice(): void {
    if (this.muted || this.appBackgrounded) return;
    const voice = this.preloadMadaraKatonVoice();
    if (!voice) return;

    voice.muted = false;
    voice.volume = 1.0;
    try {
      voice.currentTime = 0;
    } catch {
      // Ignore if media metadata not yet loaded
    }

    if (this.ctx && this.battleGainNode && this.musicTheme === 'battle') {
      const now = this.ctx.currentTime;
      this.battleGainNode.gain.cancelScheduledValues(now);
      this.battleGainNode.gain.setTargetAtTime(0.10, now, 0.05);
      this.battleGainNode.gain.setTargetAtTime(BATTLE_MUSIC_GAIN, now + 2.6, 0.4);
    }

    void voice.play().catch(() => {});
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Preload battle audio & character voices quietly on first user gesture for zero-latency playback
    this.ensureBattleAudio(ctx);
    this.preloadGedoVoice();
    this.preloadKatonVoice();
    this.preloadKamuiVoice();
    this.preloadMadaraKatonVoice();

    if (this.musicTheme === 'battle') {
      this.startBattleTrack();
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.battleAudio) {
      this.battleAudio.muted = muted;
    }
    if (muted) {
      this.pauseBattleTrack(false);
      if (this.gedoVoiceAudio && !this.gedoVoiceAudio.paused) {
        this.gedoVoiceAudio.pause();
      }
      if (this.katonVoiceAudio && !this.katonVoiceAudio.paused) {
        this.katonVoiceAudio.pause();
      }
      if (this.kamuiVoiceAudio && !this.kamuiVoiceAudio.paused) {
        this.kamuiVoiceAudio.pause();
      }
      if (this.madaraKatonVoiceAudio && !this.madaraKatonVoiceAudio.paused) {
        this.madaraKatonVoiceAudio.pause();
      }
    } else if (this.musicTheme === 'battle') {
      this.ensureContext();
      this.startBattleTrack();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public getMusicTheme(): MusicTheme {
    return this.musicTheme;
  }

  public setMusicTheme(theme: MusicTheme): void {
    const isPlayingBattle =
      theme === 'battle' && Boolean(this.battleAudio && !this.battleAudio.paused);
    if (this.musicTheme === theme && (theme !== 'battle' || isPlayingBattle)) {
      return;
    }

    const prevTheme = this.musicTheme;
    this.musicTheme = theme;

    // Start screen & Character Select remain silent per user preference; Hidan plays in battle only
    if (theme === 'silent' || theme === 'title') {
      this.pauseBattleTrack(theme === 'title' || prevTheme === 'battle');
      return;
    }

    if (prevTheme !== 'battle') {
      this.resetBattleTrack();
    }
    if (!this.muted) {
      this.startBattleTrack();
    }
  }

  public playMeleeSwing(_step: number) {
    // Combat strike synth SFX disabled per user preference (character voices & music remain active)
  }

  public playHitImpact(_heavy = false) {
    // Damage / hit impact synth SFX disabled per user preference (character voices & music remain active)
  }

  public playFumaShuriken() {
    // Technique synth SFX disabled per user preference (character voices & music remain active)
  }

  public playKamuiWarp() {
    // Technique synth SFX disabled per user preference (character Kamui voice remains active)
  }

  public playKatonFire() {
    // Technique synth SFX disabled per user preference (character Katon voices remain active)
  }

  public playRinneganPush() {
    // Technique synth SFX disabled per user preference (character voices & music remain active)
  }

  public playJump() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playWaveClear() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [330, 440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playGedoSummon() {
    // Technique synth SFX disabled per user preference (Obito's Kuchiyose no Jutsu voice remains active)
  }

  public playGedoLightning() {
    // Technique synth SFX disabled per user preference (character voices & music remain active)
  }

  public playRaikiriLightning() {
    // Technique synth SFX disabled per user preference (character voices & music remain active)
  }

  public playSuitonWater() {
    // Technique synth SFX disabled per user preference (character voices & music remain active)
  }

  /** Radiant Naruto Ultimate Ninja Storm chakra surge played when pressing Start on the Title Screen */
  public playChakraStart() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const dur = 0.72;
    const noise = ctx.createBufferSource();
    noise.buffer = this.getReusableNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now);
    filter.frequency.exponentialRampToValueAtTime(2450, now + 0.24);
    filter.frequency.exponentialRampToValueAtTime(880, now + dur);
    filter.Q.value = 1.8;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.01, now);
    noiseGain.gain.linearRampToValueAtTime(0.28, now + 0.14);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now, 0, dur);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(118, now);
    sub.frequency.exponentialRampToValueAtTime(52, now + 0.36);
    subGain.gain.setValueAtTime(0.26, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.44);

    const freqs = [587.33, 880.0, 1174.66, 1479.98];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const startAt = now + idx * 0.032;
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * 0.96, startAt);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.01, startAt + 0.16);
      osc.frequency.exponentialRampToValueAtTime(freq, startAt + 0.78);

      const peak = 0.095 - idx * 0.014;
      oscGain.gain.setValueAtTime(0.0001, startAt);
      oscGain.gain.linearRampToValueAtTime(peak, startAt + 0.055);
      oscGain.gain.exponentialRampToValueAtTime(0.0008, startAt + 0.82);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + 0.85);
    });
  }
}

export const soundEngine = new ShinobiSoundEngine();
