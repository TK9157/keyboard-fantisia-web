/**
 * Keyboard Fantasia — WebAudio Physics Engine
 * Connects the PlayerEngine's <audio> node to an AnalyserNode to extract
 * FFT frequency data and drive physical UI animations.
 */

export class WebAudioPhysics {
  constructor(audioElement) {
    this.audioElement = audioElement;
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.animationId = null;

    this.isInitialized = false;
  }

  /**
   * MUST be called on a user interaction (e.g. clicking Power button)
   */
  init() {
    if (this.isInitialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // 128 frequency bins
      
      this.source = this.audioContext.createMediaElementSource(this.audioElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      
      this.isInitialized = true;
      console.log("🔊 WebAudio Physics Engine Initialized");
      
      this._loop();
    } catch (e) {
      console.error("Failed to initialize WebAudio:", e);
    }
  }
  
  _loop() {
    if (!this.isInitialized) return;
    
    this.analyser.getByteFrequencyData(this.dataArray);
    
    // 1. Calculate Bass for Woofer Physics (bins 0-10 roughly 0-1000Hz)
    let bassSum = 0;
    const bassBins = 10;
    for (let i = 0; i < bassBins; i++) {
      bassSum += this.dataArray[i];
    }
    const bassAvg = bassSum / bassBins;
    
    // Map bass 0-255 to a scale factor 1.0 - 1.15
    const bassScale = 1 + (bassAvg / 255) * 0.15;
    
    // Write to CSS variable so woofers scale physically
    document.documentElement.style.setProperty('--bass-scale', bassScale);

    this.animationId = requestAnimationFrame(() => this._loop());
  }
}

// Will be initialized in app.js
export let audioPhysics = null;

export function createAudioPhysics(audioElement) {
  audioPhysics = new WebAudioPhysics(audioElement);
  return audioPhysics;
}
