/**
 * Keyboard Fantasia — Audio Player Engine
 * Manages audio and video playback with Web Audio API
 */

import { state } from './state-manager.js';

export class PlayerEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';

    this.videoElement = null;      // set by VideoDisplay component
    this._progressInterval = null;
    this._isSeekingFwd = false;
    this._isSeekingRwd = false;
    this._seekInterval = null;

    this._bindEvents();
  }

  /**
   * Link the video element from the DOM
   */
  setVideoElement(el) {
    this.videoElement = el;
  }

  /**
   * Show and play the music video in the central screen, in sync with audio
   */
  _showMusicVideo(src) {
    if (!this.videoElement) return;
    const musicVideo = this.videoElement;
    musicVideo.muted = true;
    musicVideo.loop = true;
    musicVideo.playsInline = true;
    console.log("Loading video source:", src);
    musicVideo.src = src;
    musicVideo.load();
    musicVideo.classList.remove('hidden');
    musicVideo.play().catch(err => console.error("Video playback failed:", err));
  }

  /**
   * Hide the music video and stop/reset its playback
   */
  _hideMusicVideo() {
    if (!this.videoElement) return;
    this.videoElement.pause();
    this.videoElement.currentTime = 0;
    this.videoElement.removeAttribute('src');
    this.videoElement.load();
    this.videoElement.classList.add('hidden');
  }

  /**
   * Show a track image thumbnail in the central screen
   */
  _showThumbnail(src) {
    const thumb = document.getElementById('main-screen-thumbnail');
    if (thumb) {
      thumb.src = src;
      thumb.style.display = 'block';
    }
    if (this.videoElement) this.videoElement.classList.add('hidden');
  }

  /**
   * Hide the central screen image thumbnail
   */
  _hideThumbnail() {
    const thumb = document.getElementById('main-screen-thumbnail');
    if (thumb) thumb.style.display = 'none';
  }

  /**
   * Play a specific track
   */
  playTrack(track) {
    // Stop current playback
    this.stop();

    // Update state
    state.set({ currentTrack: track });

    // Set audio source
    this.audio.src = track.audioFile;

    // Play the uploaded track video (video_url → videoFile) in the center screen,
    // otherwise show the track image (image_url → imageFile) if available
    const videoSrc = track.videoFile || track.videoSrc;
    if (videoSrc) {
      this._showMusicVideo(videoSrc);
      this._hideThumbnail();
    } else if (track.imageFile) {
      this._hideMusicVideo();
      this._showThumbnail(track.imageFile);
    } else {
      this._hideMusicVideo();
      this._hideThumbnail();
    }

    // Play
    this.play();
  }

  /**
   * Play / resume
   */
  play() {
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Audio play failed:', err.message);
      });
    }

    if (this.videoElement && this.videoElement.src) {
      this.videoElement.play().catch(() => {});
    }

    state.set({ isPlaying: true, isPaused: false });
    this._startProgressTracking();
  }

  /**
   * Pause
   */
  pause() {
    this.audio.pause();
    if (this.videoElement) this.videoElement.pause();

    state.set({ isPlaying: false, isPaused: true });
    this._stopProgressTracking();
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause() {
    if (state.get('isPlaying')) {
      this.pause();
    } else if (state.get('currentTrack')) {
      this.play();
    }
  }

  /**
   * Stop playback
   */
  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.currentTime = 0;
    }

    state.set({
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
    });

    this._stopProgressTracking();
    this._stopSeeking();
  }

  /**
   * Fast forward — hold to seek
   */
  startFastForward() {
    if (!state.get('currentTrack')) return;
    this._isSeekingFwd = true;
    this._seekInterval = setInterval(() => {
      if (this.audio.currentTime + 5 < this.audio.duration) {
        this.audio.currentTime += 5;
        if (this.videoElement) this.videoElement.currentTime = this.audio.currentTime;
      } else {
        this.skipToNext();
      }
    }, 300);
  }

  /**
   * Rewind — hold to seek
   */
  startRewind() {
    if (!state.get('currentTrack')) return;
    this._isSeekingRwd = true;
    this._seekInterval = setInterval(() => {
      if (this.audio.currentTime - 5 > 0) {
        this.audio.currentTime -= 5;
        if (this.videoElement) this.videoElement.currentTime = this.audio.currentTime;
      } else {
        this.audio.currentTime = 0;
        if (this.videoElement) this.videoElement.currentTime = 0;
      }
    }, 300);
  }

  /**
   * Stop seeking
   */
  _stopSeeking() {
    this._isSeekingFwd = false;
    this._isSeekingRwd = false;
    if (this._seekInterval) {
      clearInterval(this._seekInterval);
      this._seekInterval = null;
    }
  }

  /**
   * Stop fast forward / rewind
   */
  stopFastForward() { this._stopSeeking(); }
  stopRewind() { this._stopSeeking(); }

  /**
   * Skip to next track
   */
  skipToNext() {
    const nextTrack = state.getNextTrack();
    if (nextTrack) {
      this.playTrack(nextTrack);
    } else {
      this.stop();
      state.set({ currentTrack: null });
    }
  }

  /**
   * Skip to previous track
   */
  skipToPrevious() {
    // If we're more than 3 seconds in, restart current track
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      if (this.videoElement) this.videoElement.currentTime = 0;
      return;
    }

    const prevTrack = state.getPreviousTrack();
    if (prevTrack) {
      this.playTrack(prevTrack);
    } else {
      this.audio.currentTime = 0;
      if (this.videoElement) this.videoElement.currentTime = 0;
    }
  }

  /**
   * Set volume (0-100)
   */
  setVolume(vol) {
    const clamped = Math.max(0, Math.min(100, vol));
    this.audio.volume = clamped / 100;
    state.set({ volume: clamped });
  }

  /**
   * Seek to position (0-1)
   */
  seekTo(fraction) {
    if (!this.audio.duration) return;
    const time = fraction * this.audio.duration;
    this.audio.currentTime = time;
    if (this.videoElement) this.videoElement.currentTime = time;
  }

  /**
   * Bind audio element events
   */
  _bindEvents() {
    this.audio.addEventListener('loadedmetadata', () => {
      state.set({ duration: this.audio.duration });
    });

    this.audio.addEventListener('pause', () => {
      if (this.videoElement && !this.videoElement.paused) {
        this.videoElement.pause();
      }
    });

    this.audio.addEventListener('ended', () => {
      this._hideMusicVideo();
      this.skipToNext();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio error:', e);
    });
  }

  /**
   * Progress tracking interval
   */
  _startProgressTracking() {
    this._stopProgressTracking();
    this._progressInterval = setInterval(() => {
      state.set({ currentTime: this.audio.currentTime });
    }, 250);
  }

  _stopProgressTracking() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
  }

  /**
   * Format time as M:SS
   */
  static formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Singleton
export const player = new PlayerEngine();
