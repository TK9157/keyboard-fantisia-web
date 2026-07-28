/**
 * Keyboard Fantasia — State Manager
 * Central state management with event-driven updates
 */

export class StateManager {
  constructor() {
    this.state = {
      activeCassette: null,      // 'C1' to 'C6' or null
      currentTrack: null,        // track object or null
      isPlaying: false,
      isPaused: false,
      isPoweredOn: false,        // Master power state
      isBooting: false,          // Boot animation state
      volume: 50,                // 0 to 100
      currentTime: 0,
      duration: 0,
      songListOpen: false,
      cassettesData: null,       // loaded JSON data
    };

    this._listeners = new Map();
  }

  /**
   * Get current state or a specific key
   */
  get(key) {
    if (key) return this.state[key];
    return { ...this.state };
  }

  /**
   * Update state and notify listeners
   */
  set(updates) {
    const changedKeys = [];
    for (const [key, value] of Object.entries(updates)) {
      if (this.state[key] !== value) {
        this.state[key] = value;
        changedKeys.push(key);
      }
    }

    if (changedKeys.length > 0) {
      this._notifyListeners(changedKeys);
    }
  }

  /**
   * Subscribe to state changes
   * @param {string|string[]} keys - state key(s) to watch
   * @param {function} callback - called with (newState, changedKeys)
   * @returns {function} unsubscribe function
   */
  on(keys, callback) {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    const id = Symbol();

    for (const key of keyArray) {
      if (!this._listeners.has(key)) {
        this._listeners.set(key, new Map());
      }
      this._listeners.get(key).set(id, callback);
    }

    // Return unsubscribe function
    return () => {
      for (const key of keyArray) {
        if (this._listeners.has(key)) {
          this._listeners.get(key).delete(id);
        }
      }
    };
  }

  /**
   * Notify relevant listeners of state changes
   */
  _notifyListeners(changedKeys) {
    const notified = new Set();

    for (const key of changedKeys) {
      if (this._listeners.has(key)) {
        for (const [id, callback] of this._listeners.get(key)) {
          if (!notified.has(id)) {
            notified.add(id);
            callback(this.state, changedKeys);
          }
        }
      }
    }
  }

  /**
   * Get tracks for a cassette
   */
  getTracksForCassette(cassetteId) {
    if (!this.state.cassettesData) return [];
    const cassette = this.state.cassettesData.cassettes.find(c => c.id === cassetteId);
    return cassette ? cassette.tracks : [];
  }

  /**
   * Get cassette data by ID
   */
  getCassette(cassetteId) {
    if (!this.state.cassettesData) return null;
    return this.state.cassettesData.cassettes.find(c => c.id === cassetteId);
  }

  /**
   * Get photo set for current cassette
   */
  getActivePhotoSet() {
    if (!this.state.activeCassette || !this.state.cassettesData) return [];
    const cassette = this.getCassette(this.state.activeCassette);
    if (!cassette) return [];
    return this.state.cassettesData.photoSets[cassette.photoSet] || [];
  }

  /**
   * Get next track in current cassette
   */
  getNextTrack() {
    if (!this.state.activeCassette || !this.state.currentTrack) return null;
    const tracks = this.getTracksForCassette(this.state.activeCassette);
    const currentIndex = tracks.findIndex(t => t.id === this.state.currentTrack.id);
    if (currentIndex < tracks.length - 1) {
      return tracks[currentIndex + 1];
    }
    return null; // End of cassette
  }

  /**
   * Get previous track in current cassette
   */
  getPreviousTrack() {
    if (!this.state.activeCassette || !this.state.currentTrack) return null;
    const tracks = this.getTracksForCassette(this.state.activeCassette);
    const currentIndex = tracks.findIndex(t => t.id === this.state.currentTrack.id);
    if (currentIndex > 0) {
      return tracks[currentIndex - 1];
    }
    return null;
  }
}

// Singleton instance
export const state = new StateManager();
