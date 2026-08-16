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

    tracksContainer.innerHTML = cassette.tracks.map(t => `
      <div class="song-list__track ${currentTrack && currentTrack.id === t.id ? 'is-playing' : ''}"
           data-track-id="${t.id}">
        <span class="song-list__track-num">${String(t.id).padStart(2, '0')}</span>
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

// Dynamic Gallery State
window.galleryPhotosList = [];
window.currentPhotoIndex = 0;

async function loadSupabaseGallery() {
  console.log('[Gallery] Initializing photo gallery directly from Supabase Storage...');
  try {
    const supabase = getSupabase();

    // 1. Fetch all files from the 'images' folder in storage bucket
    const { data: storageFiles, error: storageErr } = await supabase
      .storage
      .from('PradeepN_songs_tracks')
      .list('images', { limit: 100 });

    if (storageErr) {
      console.error('[Gallery Storage Error]:', storageErr);
      return;
    }

    if (!storageFiles || storageFiles.length === 0) {
      console.warn('[Gallery] No files found in images/ storage folder.');
      return;
    }

    const bucketBaseUrl = 'https://fgydtvjspoxhckmezykw.supabase.co/storage/v1/object/public/PradeepN_songs_tracks/images/';

    // 2. Filter for valid WEB images only (ignoring .TIF, .DS_Store, etc.)
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

    const validUrls = storageFiles
      .filter(file => {
        if (!file.name || file.name.startsWith('.')) return false;
        const lowerName = file.name.toLowerCase();
        return validExtensions.some(ext => lowerName.endsWith(ext));
      })
      .map(file => bucketBaseUrl + file.name);

    window.galleryPhotosList = [...new Set(validUrls)];

    console.log(`[Gallery Success] Loaded ${window.galleryPhotosList.length} web-compatible photos:`, window.galleryPhotosList);

    if (window.galleryPhotosList.length > 0) {
      window.currentPhotoIndex = 0;
      updateGalleryDisplay();
      startGallerySlideshow();
    } else {
      console.warn('[Gallery] Found files in storage, but none are web-supported formats (.jpg, .png, .webp).');
    }
  } catch (err) {
    console.error('[Gallery Error]:', err);
  }
}

let galleryFadeTimeout = null;

function updateGalleryDisplay() {
  const imgElem = document.getElementById('viewer-img-display');
  if (!imgElem) return;

  if (window.galleryPhotosList.length === 0) {
    console.warn("[Gallery] Cannot update display: Photo list is empty.");
    return;
  }

  // Handle bounds & looping
  if (window.currentPhotoIndex >= window.galleryPhotosList.length) {
    window.currentPhotoIndex = 0;
  } else if (window.currentPhotoIndex < 0) {
    window.currentPhotoIndex = window.galleryPhotosList.length - 1;
  }

  const currentUrl = window.galleryPhotosList[window.currentPhotoIndex];
  console.log(`[Gallery] Showing Photo ${window.currentPhotoIndex + 1}/${window.galleryPhotosList.length}:`, currentUrl);

  // Smooth crossfade: fade out → swap src → fade in
  if (galleryFadeTimeout) clearTimeout(galleryFadeTimeout);
  imgElem.style.transition = 'opacity 0.3s ease-in-out';
  imgElem.style.opacity = '0';

  galleryFadeTimeout = setTimeout(() => {
    imgElem.src = currentUrl;
    // Keep hidden while the system is powered OFF (screen blanks to black)
    imgElem.style.opacity = state.get('isPoweredOn') ? '1' : '0';
    galleryFadeTimeout = null;
  }, 300);
}

// ── Automatic Slideshow (Crossfade Timer) ──
let slideshowInterval = null;
const SLIDESHOW_DELAY = 4000; // Time per slide in milliseconds (4 seconds)

function startGallerySlideshow() {
  stopGallerySlideshow();
  slideshowInterval = setInterval(() => {
    // Only advance while powered ON and more than one photo exists
    if (window.galleryPhotosList.length > 1 && state.get('isPoweredOn')) {
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
  if (window.galleryPhotosList.length <= 1) {
    console.log("[Gallery] Clicked arrow, but only 1 unique photo exists in the database list.");
  }
  window.currentPhotoIndex += direction;
  updateGalleryDisplay();
  // Manual navigation pauses the auto-play cycle
  resetGallerySlideshow();
};

// Listen for Left / Right arrow keys
document.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  if (e.key === 'ArrowLeft') window.nextGalleryPhoto(-1);
  if (e.key === 'ArrowRight') window.nextGalleryPhoto(1);
});

// Run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSupabaseGallery);
} else {
  loadSupabaseGallery();
}

// ───── Boot ─────
document.addEventListener('DOMContentLoaded', () => {
  const app = new KeyboardFantasiaApp();
  window.app = app;

  // Global close for the YouTube lightbox (inline onclick in the HTML)
  window.closeYouTubeLightbox = () => app._closeYouTubeLightbox();

  app.init();
});
