/**
 * Keyboard Fantasia — State Manager
 * Central state management with event-driven updates.
 * Fetches cassette/track data from Supabase (guest session is auto-established
 * by auth.js before this runs). Falls back to local cassettes.json.
 */

export class StateManager {
  constructor() {
    this.state = {
      activeCassette: null,    // 'C1'–'C6' or null
      currentTrack: null,      // track object or null
      isPlaying: false,
      isPaused: false,
      isPoweredOn: false,      // Master power state
      isBooting: false,        // Boot animation state
      volume: 50,              // 0–100
      currentTime: 0,
      duration: 0,
      songListOpen: false,
      cassettesData: null,     // Loaded data (Supabase or JSON fallback)
      dataLoaded: false,       // True once data has been fetched
    };

    this._listeners = new Map();
  }

  // ─────────────────────────────────────────────────────────
  // Get current state (full or keyed)
  // ─────────────────────────────────────────────────────────
  get(key) {
    if (key) return this.state[key];
    return { ...this.state };
  }

  // ─────────────────────────────────────────────────────────
  // Update state and notify listeners
  // ─────────────────────────────────────────────────────────
  set(updates) {
    const changedKeys = [];
    for (const [key, value] of Object.entries(updates)) {
      if (this.state[key] !== value) {
        this.state[key] = value;
        changedKeys.push(key);
      }
    }
    if (changedKeys.length > 0) this._notifyListeners(changedKeys);
  }

  // ─────────────────────────────────────────────────────────
  // Subscribe to state changes
  // @param {string|string[]} keys
  // @param {function}        callback(newState, changedKeys)
  // @returns {function} unsubscribe
  // ─────────────────────────────────────────────────────────
  on(keys, callback) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const id = Symbol();
    for (const key of keyArray) {
      if (!this._listeners.has(key)) this._listeners.set(key, new Map());
      this._listeners.get(key).set(id, callback);
    }
    return () => {
      for (const key of keyArray) {
        if (this._listeners.has(key)) this._listeners.get(key).delete(id);
      }
    };
  }

  _notifyListeners(changedKeys) {
    const notified = new Set();
    for (const key of changedKeys) {
      if (this._listeners.has(key)) {
        for (const [id, cb] of this._listeners.get(key)) {
          if (!notified.has(id)) {
            notified.add(id);
            cb(this.state, changedKeys);
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Data Loading — Supabase first, local JSON fallback
  // ─────────────────────────────────────────────────────────

  /**
   * Load all cassette + track data.
   * Safe to call for anonymous (guest) sessions — Supabase anon key
   * has SELECT permission on cassettes and tracks via RLS policy.
   */
  async loadCassettesData() {
    // 1. Try Supabase
    if (
      typeof DataService !== 'undefined' &&
      typeof DataService.fetchAllData === 'function' &&
      typeof isSupabaseConfigured === 'function' &&
      isSupabaseConfigured()
    ) {
      try {
        const data = await DataService.fetchAllData();
        if (data && data.cassettes && data.cassettes.length > 0) {
          console.log('📀 Supabase data loaded:', data.cassettes.length, 'cassettes');
          this.set({ cassettesData: data, dataLoaded: true });
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch failed, falling back to local JSON:', err);
      }
    }

    // 2. Fallback to local cassettes.json
    try {
      console.log('📁 Loading local fallback data (cassettes.json)…');
      const response = await fetch('data/cassettes.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      this.set({ cassettesData: data, dataLoaded: true });
      console.log('📁 Local data loaded:', data.cassettes.length, 'cassettes');
      return data;
    } catch (err) {
      console.error('❌ Failed to load cassette data:', err);
      this.set({ dataLoaded: true }); // mark done even on failure
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Data Accessors
  // ─────────────────────────────────────────────────────────

  getCassette(cassetteId) {
    if (!this.state.cassettesData) return null;
    return this.state.cassettesData.cassettes.find(c => c.id === cassetteId) || null;
  }

  getTracksForCassette(cassetteId) {
    const c = this.getCassette(cassetteId);
    return c ? c.tracks : [];
  }

  getActivePhotoSet() {
    if (!this.state.activeCassette || !this.state.cassettesData) return [];
    const c = this.getCassette(this.state.activeCassette);
    if (!c) return [];
    return (this.state.cassettesData.photoSets || {})[c.photoSet] || [];
  }

  getNextTrack() {
    if (!this.state.activeCassette || !this.state.currentTrack) return null;
    const tracks = this.getTracksForCassette(this.state.activeCassette);
    const idx = tracks.findIndex(t => t.id === this.state.currentTrack.id);
    return idx < tracks.length - 1 ? tracks[idx + 1] : null;
  }

  getPreviousTrack() {
    if (!this.state.activeCassette || !this.state.currentTrack) return null;
    const tracks = this.getTracksForCassette(this.state.activeCassette);
    const idx = tracks.findIndex(t => t.id === this.state.currentTrack.id);
    return idx > 0 ? tracks[idx - 1] : null;
  }
}

// Singleton instance
export const state = new StateManager();
