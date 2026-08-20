/**
 * Keyboard Fantasia — Main Application
 * Initializes all components and wires up the stereo system
 */

import { state } from './state-manager.js';
import { player, PlayerEngine } from './player-engine.js';
import { RotaryDial } from './rotary-dial.js';
import { createAudioPhysics, audioPhysics } from './webaudio.js';

// ───── Dynamic Web Audio Routing (audio + video sources) ─────
let audioCtx = null;
let globalAnalyser = null;
let masterGain = null;

function initAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();

    globalAnalyser = audioCtx.createAnalyser();
    globalAnalyser.fftSize = 64;
    globalAnalyser.smoothingTimeConstant = 0.8;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1.0;

    // Route: Analyser -> Master Gain -> Speakers
    globalAnalyser.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function setupMediaAudio(mediaElement) {
  if (!mediaElement) return globalAnalyser;

  initAudioContext();

  // The standalone audio element is already wired into webaudio.js's
  // physics engine — reuse its analyser instead of double-connecting it
  // (createMediaElementSource can only be called once per element).
  if (mediaElement === player.audio && audioPhysics?.analyser) {
    return audioPhysics.analyser;
  }

  // Attach source only once per element using a custom property reference
  if (!mediaElement._webAudioSource) {
    try {
      mediaElement.crossOrigin = 'anonymous';
      const source = audioCtx.createMediaElementSource(mediaElement);
      source.connect(globalAnalyser);
      mediaElement._webAudioSource = source;
    } catch (e) {
      console.warn('Media source routing note:', e);
    }
  }

  return globalAnalyser;
}

// Automatically bind any active video or audio tag on play
['play', 'playing'].forEach(eventName => {
  document.addEventListener(eventName, (e) => {
    const target = e.target;
    if (target && (target.tagName === 'VIDEO' || target.tagName === 'AUDIO')) {
      setupMediaAudio(target);
    }
  }, { capture: true, passive: true });
});

// Gesture listeners keep the AudioContext from being locked by the browser
// autoplay policy (context created outside a user gesture stays suspended)
['click', 'touchstart', 'keydown'].forEach(eventType => {
  document.addEventListener(eventType, () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }, { passive: true });
});

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
      const videoEl = document.getElementById('main-screen-video');
      if (videoEl) player.setVideoElement(videoEl);

      // Initialize all UI components
      this._initCassetteRack();
      this._initCassetteSwitches();
      this._initTransportControls();
      this._initVolumeDial();
      this._initMiniEQ();
      this._initProgressBar();
      this._initSongList();
      this._initPowerAndAdmin();
      this._initArtistProfile();
      this._initYouTubeLightbox();

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
          // Turning ON: Play boot video overlay
          state.set({ isBooting: true });
          const bootVideo = document.getElementById('boot-screen-video');

          const finishBoot = () => {
            if (bootVideo) {
              bootVideo.pause();
              bootVideo.onended = null;
              bootVideo.onerror = null;
              bootVideo.style.display = 'none';
            }
            state.set({ isBooting: false });
          };

          const BOOT_SOURCES = [
            'media/video/boot-video.mp4',
            'media/images/boot-video.mp4',
            'media/boot-video.mp4',
            'boot-video.mp4'
          ];

          const tryBootSource = (index) => {
            if (index >= BOOT_SOURCES.length) {
              // All sources failed — skip boot entirely
              finishBoot();
              return;
            }
            if (!bootVideo) {
              state.set({ isBooting: false });
              return;
            }

            bootVideo.src = BOOT_SOURCES[index];
            bootVideo.style.display = 'block';
            bootVideo.currentTime = 0;

            bootVideo.onended = finishBoot;
            bootVideo.onerror = () => tryBootSource(index + 1);

            bootVideo.play().then(() => {
              // Autoplay succeeded, listen for end
              bootVideo.onended = finishBoot;
            }).catch(() => {
              // Autoplay blocked or source failed, try next
              tryBootSource(index + 1);
            });
          };

          if (bootVideo) {
            tryBootSource(0);

            // Safety net in case neither onended nor onerror fires
            setTimeout(() => {
              if (state.get('isBooting')) finishBoot();
            }, 12000);
          } else {
            setTimeout(() => state.set({ isBooting: false }), 1500);
          }

          // Initialize WebAudio Physics on first user interaction (Power ON)
          if (!this.audioPhysics) {
            this.audioPhysics = createAudioPhysics(player.audio);
            this.audioPhysics.init();
          }

          // Resume ambient background video on the idle screen
          const welcomeVideo = document.getElementById('welcome-video');
          if (welcomeVideo) welcomeVideo.play().catch(() => { });
        } else {
          // If turning off, stop playback
          player.stop();

          // Halt any ambient/background media so nothing keeps running while off
          ['welcome-video', 'cassette-spin-video', 'main-screen-video'].forEach(id => {
            const vid = document.getElementById(id);
            if (vid) vid.pause();
          });

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
    const pauseBtn = document.getElementById('btn-pause');

    // Tactile press feedback: toggle .pressed during the press so the
    // key visibly displaces into the chassis (touch-safe, not only :active)
    [rewindBtn, playBtn, stopBtn, ffBtn, pauseBtn].forEach((btn) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', () => btn.classList.add('pressed'));
      btn.addEventListener('pointerup', () => btn.classList.remove('pressed'));
      btn.addEventListener('pointerleave', () => btn.classList.remove('pressed'));
      btn.addEventListener('pointercancel', () => btn.classList.remove('pressed'));
    });

    // Play
    playBtn?.addEventListener('click', () => {
      if (state.get('currentTrack')) {
        player.play();
      }
    });

    // Pause
    (stopBtn || pauseBtn)?.addEventListener('click', () => {
      player.pause();
      document.querySelectorAll('.curved-switch-btn').forEach(btn => btn.classList.remove('active'));
      (pauseBtn || stopBtn).classList.add('active');
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

    // Initialize the on-cap digital readout with the current volume state
    const textReadout = document.getElementById('volume-text');
    if (textReadout) {
      textReadout.textContent = `${Math.round(state.get('volume'))}%`;
    }

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

        // Digital readout on the dial cap (percentage)
        const textReadout = document.getElementById('volume-text');
        if (textReadout) {
          textReadout.textContent = `${Math.round(value)}%`;
          textReadout.style.color = color;
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

  // ───── Mini Retro LED Equalizer ─────

  _initMiniEQ() {
    const canvas = document.getElementById('mini-eq-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // RETRO EQUALIZER RENDER ENGINE (state-aware: OFF / IDLE / PLAYING)
    const renderEqualizer = () => {
      const numBars = 16;            // Thin retro bars
      const gap = 3;                 // Space between bars
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = Math.floor((width - (numBars - 1) * gap) / numBars);

      ctx.clearRect(0, 0, width, height);

      // 1. POWER OFF & BOOTING STATE: Canvas stays completely dark
      if (!state.get('isPoweredOn') || state.get('isBooting')) {
        ctx.clearRect(0, 0, width, height);
        requestAnimationFrame(renderEqualizer);
        return;
      }

      // 2. Auto-detect the active media element (audio OR video tag).
      //    Only the real playback sources are considered — the decorative
      //    muted videos (welcome / cassette spin) are ignored.
      const videoEl = document.getElementById('main-screen-video');
      let activeMedia = null;

      if (videoEl && !videoEl.paused && !videoEl.ended && videoEl.readyState > 2) {
        activeMedia = videoEl;
      } else if (!player.audio.paused && !player.audio.ended && player.audio.readyState > 2) {
        activeMedia = player.audio;
      }

      const isPlaying = !!activeMedia;

      // 3. Frequency Data Collection
      const dataArray = new Uint8Array(numBars);
      if (isPlaying && activeMedia) {
        const activeAnalyser = setupMediaAudio(activeMedia);
        if (activeAnalyser) {
          const rawData = new Uint8Array(activeAnalyser.frequencyBinCount);
          activeAnalyser.getByteFrequencyData(rawData);
          // Downsample frequency bins to match bar count
          const step = Math.floor(rawData.length / numBars);
          for (let i = 0; i < numBars; i++) {
            dataArray[i] = rawData[i * step];
          }
        }
      }

      // 4. DRAW BARS
      for (let i = 0; i < numBars; i++) {
        // IDLE / PAUSED: Flat 2px baseline line. PLAYING: Reactive height.
        const barHeight = isPlaying
          ? Math.max(2, Math.floor((dataArray[i] / 255) * height))
          : 2;

        const x = i * (barWidth + gap);
        const y = height - barHeight;

        // Segmented LED Segment Effect
        const segmentHeight = 3;
        const segmentGap = 1;
        const totalSegments = Math.floor(barHeight / (segmentHeight + segmentGap));

        if (totalSegments > 0) {
          for (let s = 0; s < totalSegments; s++) {
            const segY = height - ((s + 1) * (segmentHeight + segmentGap));

            // Classic VFD/Retro Color Spectrum (Green to Amber top)
            ctx.fillStyle = (s > totalSegments - 2 && totalSegments > 3)
              ? '#ff3300' // Peak Red/Amber
              : '#00ffcc'; // Vintage Neon Mint Green

            ctx.fillRect(x, segY, barWidth, segmentHeight);
          }
        } else {
          // Too short to segment — draw the baseline retro line directly
          ctx.fillStyle = '#00ffcc';
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      }

      requestAnimationFrame(renderEqualizer);
    };

    renderEqualizer();
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

    tracksContainer.innerHTML = cassette.tracks.map((t, index) => `
      <div class="song-list__track ${currentTrack && currentTrack.id === t.id ? 'is-playing' : ''}"
           data-track-id="${t.id}">
        <span class="song-list__track-num">${String(index + 1).padStart(2, '0')}</span>
        <div class="song-list__track-info">
          <div class="song-list__track-title">${t.title}</div>
          <div class="song-list__track-meta">${t.musicDirector}</div>
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

    // ── Top-Right Artist Profile Screen ──
    const profileImg = document.getElementById('artist-profile-img');

    // If the static artist image file is missing, hide the <img> so only the
    // black glass bezel remains visible. Restore it once the image loads.
    profileImg?.addEventListener('error', () => profileImg.classList.add('is-hidden'));
    profileImg?.addEventListener('load', () => profileImg.classList.remove('is-hidden'));

    // ── Artist Bio Modal (click the profile image to open) ──
    const artistBioModal = document.getElementById('artist-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    const openArtistBio = () => {
      if (!artistBioModal) return;
      artistBioModal.style.display = 'flex';
      // Small delay so the opacity transition animates in
      setTimeout(() => artistBioModal.classList.add('is-visible'), 10);
    };

    const closeArtistBio = () => {
      if (!artistBioModal) return;
      artistBioModal.classList.remove('is-visible');
      setTimeout(() => { artistBioModal.style.display = 'none'; }, 300);
    };

    // Only open while the player is powered on (screen is blank when off)
    profileImg?.addEventListener('click', () => {
      if (!state.get('isPoweredOn')) return;
      openArtistBio();
    });

    modalCloseBtn?.addEventListener('click', closeArtistBio);

    // Clicking the dimmed backdrop closes the modal
    artistBioModal?.addEventListener('click', (e) => {
      if (e.target === artistBioModal) closeArtistBio();
    });

    // Escape key closes the modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && artistBioModal?.classList.contains('is-visible')) closeArtistBio();
    });
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
      const deckLabel = document.getElementById('screen-title');
      if (deckLabel) {
        const cassette = s.activeCassette ? state.getCassette(s.activeCassette) : null;
        deckLabel.textContent = cassette ? cassette.fullLabel : 'NO CASSETTE';
      }

      // Immediately re-render song list with new tracks if song list is open
      if (s.songListOpen && s.activeCassette) {
        this._renderSongList(s.activeCassette);
      }
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
    state.on(['isBooting', 'currentTrack', 'isPoweredOn', 'isPlaying'], (s) => {
      const bootScreen = document.getElementById('boot-screen');
      const musicVideo = document.getElementById('main-screen-video');
      const thumbnail = document.getElementById('main-screen-thumbnail');
      const idleScreen = document.getElementById('idle-screen');
      const nowPlaying = document.getElementById('now-playing');
      const miniEqContainer = document.querySelector('.mini-eq-container');

      if (!s.isPoweredOn) {
        if (bootScreen) bootScreen.style.display = 'none';
        if (musicVideo) musicVideo.classList.add('hidden');
        if (thumbnail) thumbnail.style.display = 'none';
        if (idleScreen) idleScreen.style.display = 'flex';
        if (nowPlaying) nowPlaying.style.display = 'none';
        if (miniEqContainer) miniEqContainer.style.display = 'none';
        return;
      }

      if (s.isBooting) {
        if (bootScreen) bootScreen.style.display = 'flex';
        if (musicVideo) musicVideo.classList.add('hidden');
        if (thumbnail) thumbnail.style.display = 'none';
        if (idleScreen) idleScreen.style.display = 'none';
        if (nowPlaying) nowPlaying.style.display = 'none';
        if (miniEqContainer) miniEqContainer.style.display = 'none';

        // Restart boot animation
        const texts = document.querySelectorAll('.boot-text');
        texts.forEach(t => {
          t.style.animation = 'none';
          void t.offsetWidth; // trigger reflow
          t.style.animation = null;
        });
      } else {
        if (bootScreen) bootScreen.style.display = 'none';
        if (miniEqContainer) miniEqContainer.style.display = 'block';

        // Show the uploaded track video (video_url) when a track with video is playing,
        // otherwise show the track image (image_url) when a track with an image is playing
        const hasVideo = s.currentTrack && (s.currentTrack.videoFile || s.currentTrack.videoSrc);
        if (s.currentTrack && s.isPlaying) {
          if (musicVideo) musicVideo.classList.toggle('hidden', !hasVideo);
          if (thumbnail) thumbnail.style.display = hasVideo ? 'none' : 'block';
          if (idleScreen) idleScreen.style.display = 'none';
          if (nowPlaying) nowPlaying.style.display = 'flex';
        } else {
          if (musicVideo) musicVideo.classList.add('hidden');
          if (thumbnail) thumbnail.style.display = 'none';
          if (idleScreen) idleScreen.style.display = 'flex';
          if (nowPlaying) nowPlaying.style.display = 'none';
        }
      }
    });

    // Playback state — UI updates
    state.on('isPlaying', (s) => {
      const playBtn = document.getElementById('btn-play');
      const stopBtn = document.getElementById('btn-stop');
      const pauseBtn = document.getElementById('btn-pause');
      const wrapper = document.getElementById('image-player-wrapper');
      const spinVideo = document.getElementById('cassette-spin-video');

      if (s.isPlaying) {
        if (playBtn) playBtn.classList.add('is-active');
        if (stopBtn) stopBtn.classList.remove('is-active');
        if (pauseBtn) pauseBtn.classList.remove('active');
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

  // ───── YouTube Lightbox ─────

  _initYouTubeLightbox() {
    // Clicking the active video / image thumbnail opens the track's linked
    // YouTube URL in a new browser tab.
    const wrapper = document.getElementById('screen-media-wrapper');
    wrapper?.addEventListener('click', (e) => {
      // Don't trigger from the song list overlay if it somehow receives the click
      if (e.target.closest('#song-list')) return;

      const track = state.get('currentTrack');
      const url = (track && (track.youtubeVideo || track.youtubeAudio)) || null;
      if (url) window.open(url, '_blank', 'noopener');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeYouTubeLightbox();
    });
  }

  _openYouTubeLightbox(url, title) {
    const id = this._extractYouTubeId(url);
    const box = document.getElementById('youtube-lightbox');
    const frame = document.getElementById('youtube-lightbox-frame');
    const titleEl = document.getElementById('youtube-lightbox-title');

    if (!id) {
      window.open(url, '_blank');
      return;
    }
    if (!box || !frame) return;

    frame.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    if (titleEl) titleEl.textContent = title || '';
    box.style.display = 'flex';
  }

  _closeYouTubeLightbox() {
    const box = document.getElementById('youtube-lightbox');
    const frame = document.getElementById('youtube-lightbox-frame');
    if (frame) frame.src = '';
    if (box) box.style.display = 'none';
  }

  _extractYouTubeId(url) {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
}

// ==========================================
// STANDALONE PHOTO GALLERY MODULE
// ==========================================

window.currentPhotoIndex = 0;

function getActivePhotos() {
  return window.managedPhotos.filter(function (p) { return p.enabled !== false; });
}

let galleryFadeTimeout = null;

function updateGalleryDisplay() {
  var imgElem = document.getElementById('viewer-img-display');
  if (!imgElem) return;

  var activePhotos = getActivePhotos();

  if (activePhotos.length === 0) {
    if (galleryFadeTimeout) clearTimeout(galleryFadeTimeout);
    imgElem.style.transition = 'opacity 0.3s ease-in-out';
    imgElem.style.opacity = '0';
    setTimeout(function () { imgElem.src = ''; }, 300);
    return;
  }

  if (window.currentPhotoIndex >= activePhotos.length) {
    window.currentPhotoIndex = 0;
  } else if (window.currentPhotoIndex < 0) {
    window.currentPhotoIndex = activePhotos.length - 1;
  }

  var currentUrl = activePhotos[window.currentPhotoIndex].src;
  console.log('[Gallery] Showing Photo ' + (window.currentPhotoIndex + 1) + '/' + activePhotos.length + ':', currentUrl);

  if (galleryFadeTimeout) clearTimeout(galleryFadeTimeout);
  imgElem.style.transition = 'opacity 0.3s ease-in-out';
  imgElem.style.opacity = '0';

  galleryFadeTimeout = setTimeout(function () {
    imgElem.src = currentUrl;
    imgElem.style.opacity = state.get('isPoweredOn') ? '1' : '0';
    galleryFadeTimeout = null;
  }, 300);
}

// ── Automatic Slideshow (Crossfade Timer) ──
let slideshowInterval = null;
const SLIDESHOW_DELAY = 4000;

function startGallerySlideshow() {
  stopGallerySlideshow();
  slideshowInterval = setInterval(function () {
    var activePhotos = getActivePhotos();
    if (activePhotos.length > 1 && state.get('isPoweredOn')) {
      window.currentPhotoIndex += 1;
      updateGalleryDisplay();
    }
  }, SLIDESHOW_DELAY);
}

function stopGallerySlideshow() {
  if (slideshowInterval) {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }
}

function resetGallerySlideshow() {
  stopGallerySlideshow();
  startGallerySlideshow();
}

window.nextGalleryPhoto = function (direction) {
  var activePhotos = getActivePhotos();
  if (activePhotos.length === 0) return;

  window.currentPhotoIndex += direction;
  updateGalleryDisplay();
  resetGallerySlideshow();
};

// Listen for Left / Right arrow keys
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  if (e.key === 'ArrowLeft') window.nextGalleryPhoto(-1);
  if (e.key === 'ArrowRight') window.nextGalleryPhoto(1);
});

// ==========================================
// PHOTO MANAGER MODULE (Admin Panel)
// Supabase Storage-backed CRUD + Viewer Sync
// ==========================================

const PHOTO_STORAGE_BUCKET = 'PradeepN_songs_tracks';
const PHOTO_STORAGE_FOLDER = 'images';
const PHOTO_VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

window.managedPhotos = [];

// ── localStorage Toggle State Persistence ──

function _loadPhotoToggleState() {
  try {
    return JSON.parse(localStorage.getItem('kf_photo_toggle_state') || '{}');
  } catch (e) {
    return {};
  }
}

function _savePhotoToggleState(state) {
  localStorage.setItem('kf_photo_toggle_state', JSON.stringify(state));
}

// ── localStorage Cassette Assignment Persistence ──

var CASSETTE_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

function _loadCassetteAssignments() {
  try {
    return JSON.parse(localStorage.getItem('kf_photo_cassette_assign') || '{}');
  } catch (e) {
    return {};
  }
}

function _saveCassetteAssignments(assignments) {
  localStorage.setItem('kf_photo_cassette_assign', JSON.stringify(assignments));
}

function _getCassetteForPhoto(fileName) {
  var assignments = _loadCassetteAssignments();
  if (assignments[fileName]) return assignments[fileName];
  if (fileName.indexOf('/') !== -1) {
    var parts = fileName.split('/');
    if (parts.length >= 2) {
      var candidate = parts[parts.length - 2].toLowerCase();
      if (CASSETTE_IDS.indexOf(candidate) !== -1) return candidate;
    }
  }
  return 'c1';
}

function _setCassetteForPhoto(fileName, cassetteId) {
  var assignments = _loadCassetteAssignments();
  assignments[fileName] = cassetteId;
  _saveCassetteAssignments(assignments);
}

// ── Toast Notification ──

function _showToast(message) {
  var existing = document.querySelector('.kf-toast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.className = 'kf-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(function () {
    toast.classList.add('kf-toast--visible');
  });

  setTimeout(function () {
    toast.classList.remove('kf-toast--visible');
    setTimeout(function () { toast.remove(); }, 400);
  }, 2500);
}

// ── Supabase Fetch: List all images from bucket (sorted by name, filtered) ──

async function loadStoragePhotos() {
  var sb = getSupabase();
  if (!sb) {
    console.warn('[PhotoManager] Supabase not available.');
    return;
  }

  console.log('[PhotoManager] Fetching photos from Supabase Storage subfolders...');
  var allPhotos = [];
  var toggleState = _loadPhotoToggleState();

  for (var ci = 0; ci < CASSETTE_IDS.length; ci++) {
    var cId = CASSETTE_IDS[ci];
    var folderPath = PHOTO_STORAGE_FOLDER + '/' + cId;

    var result = await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .list(folderPath, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

    if (result.error) {
      console.warn('[PhotoManager] Could not list ' + folderPath + ':', result.error.message);
      continue;
    }

    var files = result.data;
    if (!files || files.length === 0) continue;

    for (var fi = 0; fi < files.length; fi++) {
      var f = files[fi];
      if (!f.name || f.name.startsWith('.')) continue;
      if (f.name === '.emptyFolderPlaceholder') continue;
      var lower = f.name.toLowerCase();
      if (!PHOTO_VALID_EXTENSIONS.some(function (ext) { return lower.endsWith(ext); })) continue;

      var fullPath = folderPath + '/' + f.name;
      var urlResult = sb.storage
        .from(PHOTO_STORAGE_BUCKET)
        .getPublicUrl(fullPath);

      var publicUrl = urlResult.data ? urlResult.data.publicUrl : '';
      var isEnabled = toggleState[f.name] !== undefined ? toggleState[f.name] : true;

      allPhotos.push({
        id: cId + '/' + f.name,
        name: f.name,
        src: publicUrl,
        enabled: isEnabled,
        cassette_id: cId
      });
    }
  }

  window.managedPhotos = allPhotos;
  console.log('[PhotoManager] Loaded ' + allPhotos.length + ' photos from storage.');
  renderPhotoList();
  syncGalleryFromManaged();
}

async function uploadManagedPhotos(fileList) {
  var sb = getSupabase();
  if (!sb) {
    console.warn('[PhotoManager] Supabase not available.');
    return;
  }

  if (!fileList || fileList.length === 0) return;

  var files = Array.from(fileList).filter(function (f) {
    return f.type.startsWith('image/');
  });

  if (files.length === 0) return;

  var statusEl = document.getElementById('photo-upload-status');
  var uploaded = 0;
  var failed = 0;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var safeName = Date.now() + '_' + file.name;
    var path = PHOTO_STORAGE_FOLDER + '/c1/' + safeName;

    if (statusEl) statusEl.textContent = 'Uploading ' + (i + 1) + '/' + files.length + ': ' + file.name + '...';

    var result = await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .upload(path, file);

    if (result.error) {
      console.error('[PhotoManager] Upload failed:', file.name, result.error);
      failed++;
    } else {
      uploaded++;
    }
  }

  if (statusEl) {
    statusEl.textContent = uploaded + ' uploaded' + (failed > 0 ? ', ' + failed + ' failed' : '');
    setTimeout(function () { statusEl.textContent = ''; }, 3000);
  }

  console.log('[PhotoManager] Upload complete: ' + uploaded + ' ok, ' + failed + ' failed.');
  await loadStoragePhotos();
}

async function uploadManagedPhotosToCassette(fileList, cassetteId) {
  var sb = getSupabase();
  if (!sb) {
    console.warn('[PhotoManager] Supabase not available.');
    return;
  }
  if (!fileList || fileList.length === 0) return;

  var files = Array.from(fileList).filter(function (f) {
    return f.type.startsWith('image/');
  });
  if (files.length === 0) return;

  var statusEl = document.getElementById('photo-upload-status');
  var uploaded = 0;
  var failed = 0;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var sanitizedId = cassetteId.toLowerCase().replace('-', '');
    var safeName = Date.now() + '_' + file.name;
    var path = PHOTO_STORAGE_FOLDER + '/' + sanitizedId + '/' + safeName;

    if (statusEl) statusEl.textContent = 'Uploading to ' + sanitizedId.toUpperCase() + ' (' + (i + 1) + '/' + files.length + '): ' + file.name + '...';

    var result = await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .upload(path, file, { upsert: true });

    if (result.error) {
      console.error('[PhotoManager] Upload failed:', file.name, result.error);
      failed++;
    } else {
      _setCassetteForPhoto(safeName, sanitizedId);
      uploaded++;
    }
  }

  if (statusEl) {
    statusEl.textContent = uploaded + ' uploaded to ' + cassetteId.toUpperCase() + (failed > 0 ? ', ' + failed + ' failed' : '');
    setTimeout(function () { statusEl.textContent = ''; }, 3000);
  }

  console.log('[PhotoManager] Upload to ' + cassetteId + ' complete: ' + uploaded + ' ok, ' + failed + ' failed.');
  await loadStoragePhotos();
}

// ── Supabase Delete: Remove file from bucket ──

async function deleteManagedPhoto(fileName) {
  if (!confirm('Delete "' + fileName + '" from storage?')) return;

  var sb = getSupabase();
  if (!sb) return;

  var currentCassette = _getCassetteForPhoto(fileName);
  var paths = [
    PHOTO_STORAGE_FOLDER + '/' + currentCassette + '/' + fileName,
    PHOTO_STORAGE_FOLDER + '/' + fileName
  ];

  var deleted = false;
  for (var i = 0; i < paths.length; i++) {
    var result = await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .remove([paths[i]]);
    if (!result.error) { deleted = true; break; }
  }

  if (!deleted) {
    console.error('[PhotoManager] Delete error:', fileName);
    alert('Failed to delete: ' + fileName);
    return;
  }

  var toggleState = _loadPhotoToggleState();
  delete toggleState[fileName];
  _savePhotoToggleState(toggleState);

  console.log('[PhotoManager] Deleted: ' + fileName);
  await loadStoragePhotos();
}

// ── Toggle Enabled/Disabled (persisted to localStorage) ──

function toggleManagedPhoto(photoId) {
  var photo = window.managedPhotos.find(function (p) { return p.id === photoId; });
  if (!photo) return;

  var wasEnabled = photo.enabled;
  photo.enabled = !photo.enabled;

  var toggleState = _loadPhotoToggleState();
  toggleState[photoId] = photo.enabled;
  _savePhotoToggleState(toggleState);

  if (wasEnabled && !photo.enabled) {
    var activePhotos = getActivePhotos();
    if (window.currentPhotoIndex >= activePhotos.length) {
      window.currentPhotoIndex = 0;
    }
  }

  renderPhotoList();
  syncGalleryFromManaged();
}
// ── Supabase Reassignment: Move file between cassette folders ──

async function reassignPhoto(fileName, newCassetteId) {
  var sb = getSupabase();
  if (!sb) { console.warn('[PhotoManager] Supabase not available.'); return; }

  var currentCassette = _getCassetteForPhoto(fileName);
  if (currentCassette === newCassetteId) return;

  var statusEl = document.getElementById('photo-upload-status');
  if (statusEl) statusEl.textContent = 'Moving ' + fileName + ' to ' + newCassetteId + '...';

  var srcPath = PHOTO_STORAGE_FOLDER + '/' + currentCassette + '/' + fileName;
  var destPath = PHOTO_STORAGE_FOLDER + '/' + newCassetteId + '/' + fileName;
  var srcPathFlat = PHOTO_STORAGE_FOLDER + '/' + fileName;

  try {
    var downloadResult = await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .download(srcPath);

    if (downloadResult.error) {
      downloadResult = await sb.storage
        .from(PHOTO_STORAGE_BUCKET)
        .download(srcPathFlat);
    }

    if (downloadResult.error) {
      console.error('[PhotoManager] Download failed:', downloadResult.error);
      if (statusEl) {
        statusEl.textContent = 'Move failed: ' + downloadResult.error.message;
        setTimeout(function () { statusEl.textContent = ''; }, 3000);
      }
      return;
    }

    var uploadResult = await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .upload(destPath, downloadResult.data, { upsert: true });

    if (uploadResult.error) {
      console.error('[PhotoManager] Upload to new path failed:', uploadResult.error);
      if (statusEl) {
        statusEl.textContent = 'Move failed: ' + uploadResult.error.message;
        setTimeout(function () { statusEl.textContent = ''; }, 3000);
      }
      return;
    }

    await sb.storage
      .from(PHOTO_STORAGE_BUCKET)
      .remove([srcPath]);

    if (srcPathFlat !== srcPath) {
      await sb.storage
        .from(PHOTO_STORAGE_BUCKET)
        .remove([srcPathFlat]);
    }

    _setCassetteForPhoto(fileName, newCassetteId);

    if (statusEl) {
      statusEl.textContent = 'Moved to ' + newCassetteId.toUpperCase();
      setTimeout(function () { statusEl.textContent = ''; }, 2500);
    }

    _showToast(fileName.substring(0, 20) + ' \u2192 ' + newCassetteId.toUpperCase());

    await loadStoragePhotos();

  } catch (err) {
    console.error('[PhotoManager] Reassignment error:', err);
    if (statusEl) {
      statusEl.textContent = 'Move failed: ' + err.message;
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    }
  }
}

// ── Gallery Sync: Push enabled photos to viewer carousel ──

function syncGalleryFromManaged() {
  updatePhotoViewer();
}

window.updatePhotoViewer = function () {
  var activePhotos = getActivePhotos();
  var viewerImg = document.getElementById('viewer-img-display');

  if (window.currentPhotoIndex >= activePhotos.length) {
    window.currentPhotoIndex = 0;
  }

  if (activePhotos.length > 0) {
    updateGalleryDisplay();
    startGallerySlideshow();
  } else {
    window.currentPhotoIndex = 0;
    stopGallerySlideshow();
    if (viewerImg) {
      if (galleryFadeTimeout) clearTimeout(galleryFadeTimeout);
      viewerImg.style.transition = 'opacity 0.3s ease-in-out';
      viewerImg.style.opacity = '0';
      setTimeout(function () { viewerImg.src = ''; }, 300);
    }
  }

  console.log('[PhotoManager] Viewer synced with ' + activePhotos.length + ' active photos.');
};

// ── UI: Badge Count ──

function updatePhotoCount() {
  var badge = document.getElementById('photo-count');
  if (!badge) return;
  var total = window.managedPhotos.length;
  badge.textContent = total + ' Photo' + (total === 1 ? '' : 's');
}

// ── UI: Render Per-Cassette Grouped Photo Cards ──

function renderPhotoList() {
  var container = document.getElementById('manage-photos-container');
  if (!container) return;

  window._photoFileInputTarget = null;

  var grouped = {};
  CASSETTE_IDS.forEach(function (cid) { grouped[cid] = []; });
  window.managedPhotos.forEach(function (photo) {
    var cid = photo.cassette_id || 'c1';
    if (!grouped[cid]) grouped[cid] = [];
    grouped[cid].push(photo);
  });

  if (window.managedPhotos.length === 0) {
    container.innerHTML = CASSETTE_IDS.map(function (cid) {
      var label = 'C-' + cid.charAt(1).toUpperCase();
      return '<div class="photo-manager-cassette-card">'
        + '<div class="photo-manager-cassette-header">'
        + '<span>' + label + '</span>'
        + '<div style="display:flex;align-items:center;gap:10px;">'
        + '<span class="cassette-track-count">0 photos</span>'
        + '<button class="btn-add-small" onclick="triggerCassetteUpload(\'' + cid + '\')">+ Add</button>'
        + '</div>'
        + '</div>'
        + '<p class="photo-manager-cassette-empty">No photos assigned to ' + label + ' yet.</p>'
        + '</div>';
    }).join('');
    updatePhotoCount();
    return;
  }

  container.innerHTML = CASSETTE_IDS.map(function (cid) {
    var label = 'C-' + cid.charAt(1).toUpperCase();
    var photos = grouped[cid] || [];
    var countLabel = photos.length + ' photo' + (photos.length === 1 ? '' : 's');

    var photosHtml;
    if (photos.length === 0) {
      photosHtml = '<p class="photo-manager-cassette-empty">No photos assigned to ' + label + ' yet.</p>';
    } else {
      photosHtml = '<div class="photo-manager-photo-list">'
        + photos.map(function (photo, localIndex) {
          var isEnabled = photo.enabled;
          var safeName = escapeHtml(photo.name);
          var displayName = safeName.length > 28 ? safeName.substring(0, 25) + '...' : safeName;
          return '<div class="photo-manager-photo-item ' + (isEnabled ? '' : 'disabled') + '" data-photo-id="' + safeName + '">'
            + '<span class="photo-index">' + (localIndex + 1) + '.</span>'
            + '<img class="photo-thumb" src="' + photo.src + '" alt="' + safeName + '" onerror="this.style.opacity=0.3">'
            + '<span class="photo-name" title="' + safeName + '">' + displayName + '</span>'
            + '<div class="photo-actions">'
            + '<button class="photo-toggle-btn ' + (isEnabled ? 'photo-enabled' : 'photo-disabled') + '" data-action="toggle-photo" data-photo-id="' + safeName + '">' + (isEnabled ? 'Enabled' : 'Disabled') + '</button>'
            + '<button class="photo-delete-btn" data-action="delete-photo" data-photo-id="' + safeName + '">Delete</button>'
            + '</div>'
            + '</div>';
        }).join('')
        + '</div>';
    }

    return '<div class="photo-manager-cassette-card">'
      + '<div class="photo-manager-cassette-header">'
      + '<span>' + label + '</span>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span class="cassette-track-count">' + countLabel + '</span>'
      + '<button class="btn-add-small" onclick="triggerCassetteUpload(\'' + cid + '\')">+ Add</button>'
      + '</div>'
      + '</div>'
      + photosHtml
      + '</div>';
  }).join('');

  container.querySelectorAll('[data-action="toggle-photo"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggleManagedPhoto(btn.getAttribute('data-photo-id'));
    });
  });

  container.querySelectorAll('[data-action="delete-photo"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteManagedPhoto(btn.getAttribute('data-photo-id'));
    });
  });

  updatePhotoCount();
}

// ── Per-Cassette Upload Trigger ──

function triggerCassetteUpload(cassetteId) {
  window._photoFileInputTarget = cassetteId;
  var fileInput = document.getElementById('photo-file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

// ── HTML Escape Helper ──

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init: Bind file input + fetch from Supabase ──

function initPhotoManager() {
  var fileInput = document.getElementById('photo-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      var targetCassette = window._photoFileInputTarget || 'c1';
      uploadManagedPhotosToCassette(fileInput.files, targetCassette);
      fileInput.value = '';
      window._photoFileInputTarget = null;
    });
  }
  loadStoragePhotos();
}

window.PhotoManager = {
  fetch: loadStoragePhotos,
  upload: uploadManagedPhotos,
  delete: deleteManagedPhoto,
  toggle: toggleManagedPhoto,
  sync: syncGalleryFromManaged,
  updateViewer: window.updatePhotoViewer,
  getPhotos: function () { return window.managedPhotos; },
  getActivePhotos: getActivePhotos
};

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    initPhotoManager();
  });
} else {
  initPhotoManager();
}

// ───── Boot ─────
document.addEventListener('DOMContentLoaded', () => {
  const app = new KeyboardFantasiaApp();
  window.app = app;

  // Global close for the YouTube lightbox (inline onclick in the HTML)
  window.closeYouTubeLightbox = () => app._closeYouTubeLightbox();

  app.init();

  // ── Help Modal ──
  const helpModal = document.getElementById('help-modal');
  const btnHelp = document.getElementById('btn-help');
  const closeHelp = document.getElementById('close-help');

  if (btnHelp && helpModal) {
    btnHelp.addEventListener('click', function () {
      helpModal.classList.add('active');
      helpModal.setAttribute('aria-hidden', 'false');
    });
  }

  if (closeHelp && helpModal) {
    closeHelp.addEventListener('click', function () {
      helpModal.classList.remove('active');
      helpModal.setAttribute('aria-hidden', 'true');
    });
  }

  if (helpModal) {
    helpModal.addEventListener('click', function (e) {
      if (e.target === helpModal) {
        helpModal.classList.remove('active');
        helpModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && helpModal && helpModal.classList.contains('active')) {
      helpModal.classList.remove('active');
      helpModal.setAttribute('aria-hidden', 'true');
    }
  });
});
// ── Mobile Phone Session Detection & Desktop Guide Modal ──

document.addEventListener('DOMContentLoaded', function () {
  var modal = document.getElementById('desktop-guide-modal');
  var isMobile = /Android|iPhone|iPod/i.test(navigator.userAgent) && window.innerWidth <= 768;

  if (!isMobile) {
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('active');
    }
    return;
  }

  document.body.classList.add('is-mobile');

  document.addEventListener('touchstart', function enableFullScreen() {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }
    document.removeEventListener('touchstart', enableFullScreen);
  }, { once: true });

  if (!modal) return;
  if (sessionStorage.getItem('desktop_prompt_dismissed')) return;

  var instructionsBox = document.getElementById('os-instructions-box');
  var dismissBtn = document.getElementById('btn-dismiss-modal');

  modal.classList.add('active');

  var ua = navigator.userAgent;
  if (/Android/i.test(ua)) {
    instructionsBox.innerHTML = '<ol>'
      + '<li>Tap the <strong>three dots (\u22EE)</strong> at the top-right of Google Chrome.</li>'
      + '<li>Check the box next to <strong>"Desktop site"</strong>.</li>'
      + '</ol>';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    instructionsBox.innerHTML = '<ol>'
      + '<li>Tap the <strong>\'aA\' icon</strong> on the left side of the Safari search bar.</li>'
      + '<li>Select <strong>"Request Desktop Website"</strong> from the menu.</li>'
      + '</ol>';
  } else {
    instructionsBox.innerHTML = '<ol>'
      + '<li>Open your browser\'s <strong>settings menu</strong>.</li>'
      + '<li>Enable <strong>"Desktop site"</strong> or <strong>"Request Desktop Website"</strong>.</li>'
      + '</ol>';
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', function () {
      modal.classList.remove('active');
      sessionStorage.setItem('desktop_prompt_dismissed', 'true');
    });
  }
});
