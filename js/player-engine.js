/**
 * Keyboard Fantasia — Audio Player Engine
 * Manages audio and video playback with Web Audio API
 */

import { state } from './state-manager.js';

// Default thumbnail shown on the main display when a track has no uploaded image
const DEFAULT_FALLBACK_IMAGE = "https://fgydtvjspoxhckmezykw.supabase.co/storage/v1/object/public/PradeepN_songs_tracks/images/1786732024687_vmjp68.jpg";

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

    // When true, the <video> element is the exclusive audio source
    // and the standalone <audio> element is kept silent.
    this._isVideoSource = false;

    this._bindEvents();
  }

  /**
   * Link the video element from the DOM
   */
  setVideoElement(el) {
    this.videoElement = el;

    // When the video is the exclusive audio source, drive track duration
    // and auto-advance from the video element.
    el.addEventListener('loadedmetadata', () => {
      if (this._isVideoSource) state.set({ duration: el.duration });
    });

    el.addEventListener('ended', () => {
      if (this._isVideoSource) {
        this._hideMusicVideo();
        this.skipToNext();
      }
    });
  }

  /**
   * Show and play the music video in the central screen, in sync with audio
   */
  _showMusicVideo(src, poster) {
    if (!this.videoElement) return;
    const musicVideo = this.videoElement;
    musicVideo.muted = false; // Video audio is the exclusive audio output
    musicVideo.loop = false;  // Allow 'ended' to fire so we advance to next track
    musicVideo.playsInline = true;
    if (poster) {
      musicVideo.setAttribute('poster', poster);
    } else {
      musicVideo.removeAttribute('poster');
    }
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
    if (!track) return;

    // Stop current playback
    this.stop();

    // Update state
    state.set({ currentTrack: track });

    // Video tracks rely exclusively on the <video> element's audio output.
    // The standalone <audio> element is paused/cleared so there is no dual audio.
    const videoSrc = track.videoFile || track.videoSrc;
    this._isVideoSource = !!videoSrc;

    if (videoSrc) {
      // Silence + clear the standalone audio element completely
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.removeAttribute('src');
      this.audio.load();

      // Play the video (unmuted) in the center screen
      this._showMusicVideo(videoSrc, track.imageFile || null);
      this._hideThumbnail();
    } else {
      // Audio-only: the standalone audio element drives playback,
      // with the track image shown on the center screen
      this.audio.src = track.audioFile;

      this._hideMusicVideo();
      this._showThumbnail(track.imageFile || DEFAULT_FALLBACK_IMAGE);
    }

    // Play
    this.play();
  }

  /**
   * Play / resume
   */
  play() {
    // When the video is the exclusive audio source, don't play the
    // standalone <audio> element.
    if (!this._isVideoSource) {
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Audio play failed:', err.message);
        });
      }
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

    this._isVideoSource = false;

    state.set({
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
    });

    this._stopProgressTracking();
    this._stopSeeking();
  }

  /**
   * Whether the <video> element is the current audio source
   */
  _useVideoSource() {
    return this._isVideoSource && this.videoElement;
  }

  /**
   * Current playback position from whichever element is the active source
   */
  _getCurrentTime() {
    return this._useVideoSource() ? this.videoElement.currentTime : this.audio.currentTime;
  }

  /**
   * Set the playback position on whichever element is the active source
   */
  _setCurrentTime(t) {
    if (this._useVideoSource()) {
      this.videoElement.currentTime = t;
    } else {
      this.audio.currentTime = t;
    }
  }

  /**
   * Track duration from whichever element is the active source
   */
  _getDuration() {
    return this._useVideoSource() ? this.videoElement.duration : this.audio.duration;
  }

  /**
   * Fast forward — hold to seek
   */
  startFastForward() {
    if (!state.get('currentTrack')) return;
    this._isSeekingFwd = true;
    this._seekInterval = setInterval(() => {
      if (this._getCurrentTime() + 5 < this._getDuration()) {
        this._setCurrentTime(this._getCurrentTime() + 5);
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
      if (this._getCurrentTime() - 5 > 0) {
        this._setCurrentTime(this._getCurrentTime() - 5);
      } else {
        this._setCurrentTime(0);
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
    if (this._getCurrentTime() > 3) {
      this._setCurrentTime(0);
      return;
    }

    const prevTrack = state.getPreviousTrack();
    if (prevTrack) {
      this.playTrack(prevTrack);
    } else {
      this._setCurrentTime(0);
    }
  }

  /**
   * Set volume (0-100)
   */
  setVolume(vol) {
    const clamped = Math.max(0, Math.min(100, vol));
    this.audio.volume = clamped / 100;
    if (this.videoElement) this.videoElement.volume = clamped / 100;
    state.set({ volume: clamped });
  }

  /**
   * Seek to position (0-1)
   */
  seekTo(fraction) {
    if (!this._getDuration()) return;
    this._setCurrentTime(fraction * this._getDuration());
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
      state.set({ currentTime: this._getCurrentTime() });
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
