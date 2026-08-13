/**
 * Keyboard Fantasia — Admin Dashboard Module
 * Handles Supabase authentication and CRUD operations for the Admin panel.
 */

const BUCKET_NAME = 'PradeepN_songs_tracks';

const AdminModule = {
  async login() {
    const username = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-error');

    if (!username || !password) {
      errorEl.textContent = 'Please enter username and password.';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';

    if (username === 'admin' && password === 'admin@123') {
      errorEl.style.display = 'none';
      
      // Set a local session flag
      localStorage.setItem('admin_session', 'true');

      // Success UI transition
      const loginOverlay = document.getElementById('admin-login-overlay');
      if (loginOverlay) {
        loginOverlay.classList.remove('is-visible');
        setTimeout(() => {
          loginOverlay.style.display = 'none';
        }, 500);
      }
      
      if (!window.location.pathname.endsWith('admin.html')) {
        window.location.href = 'admin.html';
      } else {
        this.openDashboard();
      }
    } else {
      errorEl.textContent = 'Invalid username or password.';
      errorEl.style.display = 'block';
    }
  },

  openLogin() {
    document.getElementById('admin-login-overlay').style.display = 'flex';
    // Small delay to allow display:flex to apply before adding transition class
    setTimeout(() => {
      document.getElementById('admin-login-overlay').classList.add('is-visible');
    }, 10);
  },

  openDashboard() {
    document.getElementById('admin-dashboard').classList.add('is-open');
    this.loadSongs();
  },

  async closeDashboard() {
    localStorage.removeItem('admin_session');
    document.getElementById('admin-dashboard').classList.remove('is-open');
    if (window.location.pathname.endsWith('admin.html')) {
      this.openLogin();
    }
  },

  async uploadAudio() {
    return this._uploadFile('audio-file-input', 'upload-audio-status', 'audio', 'audio-url-input');
  },

  async uploadVideo() {
    return this._uploadFile('video-file-input', 'upload-video-status', 'video', 'video-url-input');
  },

  async uploadImage() {
    return this._uploadFile('image-file-input', 'upload-image-status', 'images', 'image-url-input');
  },

  async uploadFileToSupabase(file, folderName) {
    if (!file) return null;

    const sb = getSupabase();
    if (!sb) {
      console.error('Supabase client is not initialized. Check that js/supabase-config.js loaded and initSupabase() ran.');
      alert('Supabase client is not initialized. Check that js/supabase-config.js loaded and initSupabase() ran.');
      return null;
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${folderName}/${fileName}`;

    const { data, error } = await sb.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (error) {
      console.error(`Upload error in folder '${folderName}':`, error);
      alert(`Upload Failed: ${error.message}`);
      return null;
    }

    const { data: publicUrlData } = sb.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  },

  async _uploadFile(inputId, statusId, folderName, targetInputId) {
    const fileInput = document.getElementById(inputId);
    const statusEl = document.getElementById(statusId);
    const file = fileInput.files[0];

    if (!file) {
      statusEl.textContent = 'Please select a file first.';
      statusEl.style.color = 'var(--led-red)';
      return;
    }

    const publicUrl = await this.uploadFileToSupabase(file, folderName);

    if (!publicUrl) {
      statusEl.textContent = 'Upload failed - see alert above.';
      statusEl.style.color = 'var(--led-red)';
      return;
    }

    statusEl.textContent = 'Upload Success! URL:';
    statusEl.style.color = 'var(--led-green)';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = publicUrl;
    urlInput.readOnly = true;
    urlInput.style.width = '100%';
    urlInput.style.marginTop = '4px';

    statusEl.appendChild(document.createElement('br'));
    statusEl.appendChild(urlInput);

    const target = document.getElementById(targetInputId);
    if (target) {
      target.value = publicUrl;
    }
  },

  async addSong() {
    const sb = getSupabase();
    if (!sb) {
      alert('Supabase client is not initialized. Check that js/supabase-config.js loaded and initSupabase() ran.');
      return;
    }

    const cassetteId = document.getElementById('cassette-id-input').value.trim();
    const rawTitle = document.getElementById('title-input').value.trim();
    const cleanedTitle = this.cleanSongTitle(rawTitle);
    const audioUrl = document.getElementById('audio-url-input').value.trim();
    const videoUrl = document.getElementById('video-url-input').value.trim();
    const imageUrl = document.getElementById('image-url-input').value.trim();

    if (!cassetteId) {
      alert('Cassette ID is required.');
      return;
    }
    if (!cleanedTitle) {
      alert('Title is required.');
      return;
    }
    if (!audioUrl && !videoUrl && !imageUrl) {
      alert('Please upload or provide at least one media URL (Audio, Video, or Image).');
      return;
    }

    // Get max track number for this cassette
    const { data: existingTracks } = await sb
      .from('tracks')
      .select('track_number')
      .eq('cassette_id', cassetteId)
      .order('track_number', { ascending: false })
      .limit(1);

    const nextTrackNum = existingTracks && existingTracks.length > 0 
      ? existingTracks[0].track_number + 1 
      : 1;

    // Build payload with only the columns that exist in the tracks schema
    const payload = {
      cassette_id: cassetteId,
      track_number: nextTrackNum,
      title: cleanedTitle
    };

    if (audioUrl) payload.audio_url = audioUrl;
    if (videoUrl) payload.video_url = videoUrl;
    if (imageUrl) payload.image_url = imageUrl;

    const { error } = await sb
      .from('tracks')
      .upsert(payload, { onConflict: 'cassette_id,track_number' });

    if (error) {
      alert(`Error saving song: ${error.message}\n\nMake sure your Supabase 'tracks' table exists and RLS policies allow inserts for anonymous users.`);
    } else {
      alert(`Song successfully saved to Cassette ${cassetteId}!`);
      document.getElementById('title-input').value = '';
      document.getElementById('audio-url-input').value = '';
      document.getElementById('video-url-input').value = '';
      document.getElementById('image-url-input').value = '';
      this.loadSongs(); // Refresh list
    }
  },

  async loadSongs() {
    const sb = getSupabase();
    if (!sb) return;

    const listEl = document.getElementById('admin-song-list');
    listEl.innerHTML = '<div style="color:var(--silver);">Loading...</div>';

    const { data, error } = await sb
      .from('tracks')
      .select('*')
      .order('cassette_id', { ascending: true })
      .order('track_number', { ascending: true });

    if (error) {
      listEl.innerHTML = `<div style="color:var(--led-red);">Error loading songs: ${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div style="color:var(--silver-dark);">No songs found.</div>';
      return;
    }

    this.renderGroupedSongs(listEl, data);
  },

  renderGroupedSongs(listEl, songs) {
    const cassetteCategories = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

    // Group tracks by cassette_id
    const grouped = {};
    cassetteCategories.forEach(id => grouped[id] = []);

    songs.forEach(song => {
      const id = song.cassette_id ? String(song.cassette_id).toUpperCase().trim() : 'C1';
      if (grouped[id]) {
        grouped[id].push(song);
      } else {
        grouped['C1'].push(song);
      }
    });

    // Render Category Blocks with dynamic 1-based auto-numbering
    listEl.innerHTML = cassetteCategories.map(cassetteId => {
      const cassetteSongs = grouped[cassetteId] || [];

      return `
        <div class="cassette-category-block">
          <h4 class="cassette-header">
            <span>Cassette ${cassetteId}</span>
            <span class="cassette-track-count">${cassetteSongs.length} Track${cassetteSongs.length === 1 ? '' : 's'}</span>
          </h4>
          <div class="song-items-list">
            ${cassetteSongs.length === 0
              ? `<p class="cassette-empty">No songs assigned to ${cassetteId}</p>`
              : cassetteSongs.map((song, index) => {
                  const autoNumber = index + 1;
                  const displayTitle = this.cleanSongTitle(song.title);
                  const safeTitle = this.escapeHtml(displayTitle);

                  return `
                    <div class="song-item">
                      <span class="song-title"><strong>${autoNumber}.</strong> ${safeTitle}</span>
                      <div class="song-actions">
                        <button class="admin-delete-btn delete-btn" data-id="${this.escapeHtml(song.id)}" data-title="${safeTitle}">Delete</button>
                      </div>
                    </div>
                  `;
                }).join('')
            }
          </div>
        </div>
      `;
    }).join('');

    // Attach delete button event listeners
    listEl.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.deleteSong(btn.getAttribute('data-id'), btn.getAttribute('data-title'));
      });
    });
  },

  escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  cleanSongTitle(title) {
    if (!title) return '';
    return String(title).replace(/^\d+[\.\-\s]+\s*/, '').trim();
  },

  async deleteSong(id, title) {
    const displayTitle = title || 'this song';
    if (!confirm(`Are you sure you want to delete "${displayTitle}"?`)) return;
    const sb = getSupabase();
    if (!sb) return;

    const { error } = await sb
      .from('tracks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Delete error:', error);
      alert(`Failed to delete song: ${error.message}`);
      return;
    }

    alert(`"${displayTitle}" removed successfully!`);
    this.loadSongs();
  }
};

window.AdminModule = AdminModule;

// Initialization for dedicated /admin.html page
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  if (window.location.pathname.endsWith('admin.html')) {
    const hasSession = localStorage.getItem('admin_session') === 'true';
    if (hasSession) {
      AdminModule.openDashboard();
    } else {
      AdminModule.openLogin();
    }
  }
});
