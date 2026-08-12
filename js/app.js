/**
 * Keyboard Fantasia — Main Application
 * Initializes all components and wires up the stereo system
 */

import { state } from './state-manager.js';
import { player, PlayerEngine } from './player-engine.js';
import { RotaryDial } from './rotary-dial.js';
import { createAudioPhysics } from './webaudio.js';

class KeyboardFantasiaApp {
  constructor() {
    this.rotaryDial = null;
    this._photoScrollAnimation = null;
    this.audioPhysics = null;
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Load cassette data: Supabase (guest/anon session) → local JSON fallback
      // auth.js has already signed in the user anonymously before this runs
      await state.loadCassettesData();

      // Set initial volume
      player.setVolume(0);

      // Link video element
      const videoEl = document.getElementById('video-player');
      if (videoEl) player.setVideoElement(videoEl);

      // Initialize all UI components
      this._initCassetteRack();
      this._initCassetteSwitches();
      this._initTransportControls();
      this._initVolumeDial();
      this._initProgressBar();
      this._initSongList();
      this._initPowerAndAdmin();
      this._initArtistProfile();

      // Subscribe to state changes
      this._bindStateListeners();

      console.log('🎹 Keyboard Fantasia initialized');
    } catch (err) {
      console.error('Failed to initialize:', err);
    }
  }

  // ───── Cassette Rack ─────

  _initCassetteRack() {
    // The cassette rack is no longer present in the image-mapped layout
  }

  // ───── Power & Admin ─────
  
  _initPowerAndAdmin() {
    // Power Button
    const powerBtn = document.getElementById('power-btn');
    if (powerBtn) {
      powerBtn.addEventListener('click', () => {
        const isCurrentlyOn = state.get('isPoweredOn');
        const isBooting = state.get('isBooting');

        // Ignore clicks during boot
        if (isBooting) return;

        state.set({ isPoweredOn: !isCurrentlyOn });
        
        if (!isCurrentlyOn) {
          // Turning ON: Trigger boot animation
          state.set({ isBooting: true });
          setTimeout(() => {
            state.set({ isBooting: false });
          }, 1500);

          // Initialize WebAudio Physics on first user interaction (Power ON)
          if (!this.audioPhysics) {
            this.audioPhysics = createAudioPhysics(player.audio);
            this.audioPhysics.init();
          }
        } else {
          // If turning off, stop playback
          player.stop();
          state.set({ currentTrack: null, activeCassette: null, songListOpen: false });
          if (this.rotaryDial) {
            this.rotaryDial.setValue(0);
            this.rotaryDial.onValueChange(0);
          }
        }
      });
    }

    // Ctrl+Shift+A for Admin Dashboard
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        if (window.AdminModule) {
          window.AdminModule.openLogin();
        }
      }
    });
  }

  // ───── Cassette Switches ─────

  _initCassetteSwitches() {
    // Pill hitboxes on the center console
    const container = document.getElementById('cassette-switches');
    if (container) {
      container.addEventListener('click', (e) => {
        const sw = e.target.closest('.cassette-switch');
        if (!sw) return;
        this._selectCassette(sw.dataset.cassette);
      });
    }

    // Cassette image rack at the top of the player
    const rack = document.getElementById('cassette-rack');
    if (rack) {
      rack.addEventListener('click', (e) => {
        const item = e.target.closest('.cassette-rack-item');
        if (!item) return;
        this._selectCassette(item.dataset.cassette);
      });
    }
  }

  _selectCassette(cassetteId) {
    const isPoweredOn = state.get('isPoweredOn');
    if (!isPoweredOn) {
      // Auto power-on when clicking any cassette switch or rack item
      state.set({ isPoweredOn: true, isBooting: true });
      setTimeout(() => {
        state.set({ isBooting: false });
      }, 1200);

      if (!this.audioPhysics) {
        this.audioPhysics = createAudioPhysics(player.audio);
        this.audioPhysics.init();
      }
    }

    const current = state.get('activeCassette');

    // Single-click guarantee: If already active, ensure tracklist queue opens immediately
    if (current === cassetteId) {
      state.set({ songListOpen: true });
      return;
    }

    // Stop current playback when switching cassettes and open tracklist queue
    player.stop();
    state.set({
      activeCassette: cassetteId,
      currentTrack: null,
      songListOpen: true,
    });
  }

  // ───── Transport Controls ─────

  _initTransportControls() {
    const rewindBtn = document.getElementById('btn-rewind');
    const playBtn = document.getElementById('btn-play');
    const stopBtn = document.getElementById('btn-stop');
    const ffBtn = document.getElementById('btn-ff');

    // Play/Pause toggle
    playBtn?.addEventListener('click', () => player.togglePlayPause());

    // Stop
    stopBtn?.addEventListener('click', () => {
      player.stop();
      state.set({ currentTrack: null });
    });

    // Rewind — click for prev, hold for seek
    let rewindTimer = null;
    rewindBtn?.addEventListener('pointerdown', () => {
      rewindTimer = setTimeout(() => {
        player.startRewind();
        rewindTimer = null;
      }, 400);
    });
    rewindBtn?.addEventListener('pointerup', () => {
      if (rewindTimer) {
        clearTimeout(rewindTimer);
        rewindTimer = null;
        player.skipToPrevious();
      } else {
        player.stopRewind();
      }
    });
    rewindBtn?.addEventListener('pointerleave', () => {
      if (rewindTimer) {
        clearTimeout(rewindTimer);
        rewindTimer = null;
      }
      player.stopRewind();
    });

    // Fast Forward — click for next, hold for seek
    let ffTimer = null;
    ffBtn?.addEventListener('pointerdown', () => {
      ffTimer = setTimeout(() => {
        player.startFastForward();
        ffTimer = null;
      }, 400);
    });
    ffBtn?.addEventListener('pointerup', () => {
      if (ffTimer) {
        clearTimeout(ffTimer);
        ffTimer = null;
        player.skipToNext();
      } else {
        player.stopFastForward();
      }
    });
    ffBtn?.addEventListener('pointerleave', () => {
      if (ffTimer) {
        clearTimeout(ffTimer);
        ffTimer = null;
      }
      player.stopFastForward();
    });
  }

  // ───── Volume Dial ─────

  _initVolumeDial() {
    const dialBody = document.getElementById('dial-body');
    const dialContainer = document.getElementById('volume-dial');

    if (!dialBody || !dialContainer) return;

    this.rotaryDial = new RotaryDial(
      dialBody,
      dialContainer,
      (value) => {
        player.setVolume(value);
        // Calculate dynamic color (Green -> Violet)
        // Hue 120 is Green, Hue 270 is Violet
        const hue = 120 + ((value / 100) * 150);
        const color = `hsl(${hue}, 80%, 45%)`; // Decreased color intensity

        const label = document.getElementById('volume-label');
        if (label) label.textContent = `VOL ${Math.round(value)}`;
        
        const valDisp = document.getElementById('volume-value');
        if (valDisp) {
          valDisp.textContent = Math.round(value);
          valDisp.style.color = color;
        }

        // Update Volume SVG fill
        const fill = document.getElementById('volume-fill');
        if (fill) {
          const maxOffset = 282.74;
          const minOffset = 47.12;
          const offset = maxOffset - ((value / 100) * (maxOffset - minOffset));
          fill.style.strokeDashoffset = offset;
          fill.style.stroke = color;
          fill.style.filter = `drop-shadow(0 0 2px ${color})`;
        }
      },
      0
    );
  }

  // ───── Progress Bar ─────

  _initProgressBar() {
    const bar = document.getElementById('progress-bar');
    if (!bar) return;

    bar.addEventListener('click', (e) => {
      const rect = bar.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      player.seekTo(fraction);
    });
  }

  // ───── Song List ─────

  _initSongList() {
    const closeBtn = document.getElementById('song-list-close');
    closeBtn?.addEventListener('click', () => {
      state.set({ songListOpen: false });
    });

    const tracksContainer = document.getElementById('song-list-tracks');
    tracksContainer?.addEventListener('click', (e) => {
      const trackEl = e.target.closest('.song-list__track');
      if (!trackEl) return;

      const cassetteId = state.get('activeCassette');
      const trackId = parseInt(trackEl.dataset.trackId);
      const tracks = state.getTracksForCassette(cassetteId);
      const track = tracks.find(t => t.id === trackId);

      if (track) {
        player.playTrack(track);
        // Keep song list open so user can see what's playing
      }
    });
  }

  _renderSongList(cassetteId) {
    const overlay = document.getElementById('song-list');
    const titleEl = document.getElementById('song-list-title');
    const tracksContainer = document.getElementById('song-list-tracks');

    if (!overlay || !tracksContainer) return;

    if (!cassetteId) {
      overlay.classList.remove('is-open');
      return;
    }

    const cassette = state.getCassette(cassetteId);
    if (!cassette) return;

    titleEl.textContent = cassette.fullLabel;

    const currentTrack = state.get('currentTrack');

    tracksContainer.innerHTML = cassette.tracks.map(t => `
      <div class="song-list__track ${currentTrack && currentTrack.id === t.id ? 'is-playing' : ''}"
           data-track-id="${t.id}">
        <span class="song-list__track-num">${String(t.id).padStart(2, '0')}</span>
        <div class="song-list__track-info">
          <div class="song-list__track-title">${t.title}</div>
          <div class="song-list__track-meta">${t.movie} • ${t.musicDirector}</div>
        </div>
        <div class="song-list__track-playing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `).join('');

    overlay.classList.add('is-open');
  }

  // ───── Artist Profile ─────

  _initArtistProfile() {
    const leftTweeter = document.querySelector('.woofer-overlay.left');
    const artistModal = document.getElementById('artist-profile-modal');
    if (leftTweeter && artistModal) {
      leftTweeter.addEventListener('click', () => {
        artistModal.style.display = 'flex';
        // Add small delay before adding is-visible to allow display to apply
        setTimeout(() => artistModal.classList.add('is-visible'), 10);
      });
    }
  }

  // ───── Photo Scroll ─────

  _updatePhotoScroll() {
    // Photo scroll is removed in the image-based layout
  }

  // ───── State Listeners ─────

  _bindStateListeners() {
    // Master Power State
    state.on('isPoweredOn', (s) => {
      const wrapper = document.getElementById('image-player-wrapper');
      const powerBtn = document.getElementById('power-btn');
      
      if (wrapper) {
        if (s.isPoweredOn) {
          wrapper.classList.remove('is-off');
          powerBtn?.classList.remove('power-flash');
          
          if (!state.get('activeCassette')) {
            document.querySelectorAll('.cassette-switch').forEach(sw => sw.classList.add('cassette-flash'));
          }
        } else {
          wrapper.classList.add('is-off');
          powerBtn?.classList.add('power-flash');
          
          document.querySelectorAll('.cassette-switch').forEach(sw => sw.classList.remove('cassette-flash'));
        }
      }
    });

    // Active cassette changes — update switches, rack items, song list, photos
    state.on('activeCassette', (s) => {
      // Update pill hitboxes
      document.querySelectorAll('.cassette-switch').forEach(sw => {
        sw.classList.toggle('is-active', sw.dataset.cassette === s.activeCassette);
        if (s.activeCassette) {
          sw.classList.remove('cassette-flash');
        } else if (state.get('isPoweredOn')) {
          sw.classList.add('cassette-flash');
        }
      });

      // Update cassette rack image thumbnails
      document.querySelectorAll('.cassette-rack-item').forEach(item => {
        item.classList.toggle('is-active', item.dataset.cassette === s.activeCassette);
      });

      // Update cassette deck label
      const deckLabel = document.getElementById('deck-label');
      if (deckLabel) {
        const cassette = s.activeCassette ? state.getCassette(s.activeCassette) : null;
        deckLabel.textContent = cassette ? cassette.fullLabel : 'NO CASSETTE';
      }

      // Immediately re-render song list with new tracks if song list is open
      if (s.songListOpen && s.activeCassette) {
        this._renderSongList(s.activeCassette);
      }

      // Update photos
      this._updatePhotoScroll();
    });

    // Song list open/close
    state.on('songListOpen', (s) => {
      if (s.songListOpen && s.activeCassette) {
        this._renderSongList(s.activeCassette);
      } else {
        const overlay = document.getElementById('song-list');
        overlay?.classList.remove('is-open');
      }
    });

    // Track changes
    state.on('currentTrack', (s) => {
      // Re-render song list to update playing indicator
      if (s.songListOpen && s.activeCassette) {
        this._renderSongList(s.activeCassette);
      }

      // Update now-playing text metadata
      const npTitle = document.getElementById('np-title');
      const npMovie = document.getElementById('np-movie');
      const npDirector = document.getElementById('np-director');

      if (s.currentTrack) {
        npTitle && (npTitle.textContent = s.currentTrack.title);
        npMovie && (npMovie.textContent = s.currentTrack.movie);
        npDirector && (npDirector.textContent = `♪ ${s.currentTrack.musicDirector}`);
      }
    });

    // Screen visibility logic (Boot vs Idle vs Playing)
    state.on(['isBooting', 'currentTrack', 'isPoweredOn'], (s) => {
      const bootScreen = document.getElementById('boot-screen');
      const videoPlayer = document.getElementById('video-player');
      const idleScreen = document.getElementById('idle-screen');
      const nowPlaying = document.getElementById('now-playing');

      if (!s.isPoweredOn) {
        if (bootScreen) bootScreen.style.display = 'none';
        if (videoPlayer) videoPlayer.style.display = 'none';
        if (idleScreen) idleScreen.style.display = 'flex';
        if (nowPlaying) nowPlaying.style.display = 'none';
        return;
      }

      if (s.isBooting) {
        if (bootScreen) bootScreen.style.display = 'flex';
        if (videoPlayer) videoPlayer.style.display = 'none';
        if (idleScreen) idleScreen.style.display = 'none';
        if (nowPlaying) nowPlaying.style.display = 'none';
        
        // Restart boot animation
        const texts = document.querySelectorAll('.boot-text');
        texts.forEach(t => {
          t.style.animation = 'none';
          void t.offsetWidth; // trigger reflow
          t.style.animation = null;
        });
      } else {
        if (bootScreen) bootScreen.style.display = 'none';
        
        if (s.currentTrack) {
          if (videoPlayer) videoPlayer.style.display = 'block';
          if (idleScreen) idleScreen.style.display = 'none';
          if (nowPlaying) nowPlaying.style.display = 'flex';
        } else {
          if (videoPlayer) videoPlayer.style.display = 'none';
          if (idleScreen) idleScreen.style.display = 'flex';
          if (nowPlaying) nowPlaying.style.display = 'none';
        }
      }
    });

    // Playback state — UI updates
    state.on('isPlaying', (s) => {
      const playBtn = document.getElementById('btn-play');
      const stopBtn = document.getElementById('btn-stop');
      const wrapper = document.getElementById('image-player-wrapper');
      const spinVideo = document.getElementById('cassette-spin-video');
      
      if (s.isPlaying) {
        if (playBtn) playBtn.classList.add('is-active');
        if (stopBtn) stopBtn.classList.remove('is-active');
        if (wrapper) wrapper.classList.add('is-playing');
        if (spinVideo) {
          spinVideo.style.display = 'block';
          spinVideo.play().catch(e => console.log('Spin video play error:', e));
        }
      } else {
        if (playBtn) playBtn.classList.remove('is-active');
        if (s.isPaused === false && stopBtn) stopBtn.classList.add('is-active');
        if (wrapper) wrapper.classList.remove('is-playing');
        if (spinVideo) {
          spinVideo.pause();
          spinVideo.style.display = 'none';
        }
      }
    });

    // Playback state — update transport buttons, reels, woofers
    state.on(['isPlaying', 'isPaused'], (s) => {
      const playBtn = document.getElementById('btn-play');
      const playIcon = document.getElementById('play-icon');

      if (s.isPlaying) {
        playBtn?.classList.add('is-active');
        if (playIcon) playIcon.textContent = '⏸';
      } else {
        playBtn?.classList.remove('is-active');
        if (playIcon) playIcon.textContent = '▶';
      }

      // Tape reels
      document.querySelectorAll('.cassette-deck__reel').forEach(reel => {
        reel.classList.toggle('is-spinning', s.isPlaying);
      });

      // Woofer pulse
      document.querySelectorAll('.speaker__woofer-cone').forEach(cone => {
        cone.classList.toggle('is-pulsing', s.isPlaying);
      });

      // Photo scroll
      const filmEl = document.getElementById('photo-scroll-film');
      filmEl?.classList.toggle('is-playing', s.isPlaying);
    });

    // Progress bar update
    state.on(['currentTime', 'duration'], (s) => {
      const fill = document.getElementById('progress-fill');
      const handle = document.getElementById('progress-handle');
      const timeDisplay = document.getElementById('np-time');

      if (s.duration > 0) {
        const pct = (s.currentTime / s.duration) * 100;
        if (fill) fill.style.width = `${pct}%`;
        if (handle) handle.style.left = `${pct}%`;
      }

      if (timeDisplay) {
        timeDisplay.textContent = `${PlayerEngine.formatTime(s.currentTime)} / ${PlayerEngine.formatTime(s.duration)}`;
      }
    });
  }
}

// ───── Boot ─────
document.addEventListener('DOMContentLoaded', () => {
  const app = new KeyboardFantasiaApp();
  app.init();
});
