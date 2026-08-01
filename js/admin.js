/**
 * Keyboard Fantasia — Admin Dashboard Module
 * Handles Supabase authentication and CRUD operations for the Admin panel.
 */

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

  async uploadFile() {
    const fileInput = document.getElementById('admin-upload-file');
    const statusEl = document.getElementById('upload-status');
    const file = fileInput.files[0];

    if (!file) {
      statusEl.textContent = 'Please select a file first.';
      statusEl.style.color = 'var(--led-red)';
      return;
    }

    if (!window.supabaseClient) return;

    statusEl.textContent = 'Uploading...';
    statusEl.style.color = 'var(--led-cyan)';

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { data, error } = await window.supabaseClient.storage
      .from('media') // User must create this bucket in Supabase!
      .upload(filePath, file);

    if (error) {
      statusEl.textContent = `Upload Error: ${error.message} (Did you create a public 'media' bucket and configure RLS policies?)`;
      statusEl.style.color = 'var(--led-red)';
    } else {
      const { data: publicUrlData } = window.supabaseClient.storage
        .from('media')
        .getPublicUrl(filePath);
      
      statusEl.textContent = 'Upload Success! URL:';
      statusEl.style.color = 'var(--led-green)';
      
      const urlInput = document.createElement('input');
      urlInput.type = 'text';
      urlInput.value = publicUrlData.publicUrl;
      urlInput.readOnly = true;
      urlInput.style.width = '100%';
      urlInput.style.marginTop = '4px';
      
      statusEl.appendChild(document.createElement('br'));
      statusEl.appendChild(urlInput);
    }
  },

  async addSong() {
    if (!window.supabaseClient) return;

    const cassetteId = document.getElementById('admin-song-cassette').value;
    const title = document.getElementById('admin-song-title').value;
    const movie = document.getElementById('admin-song-movie').value;
    const audioUrl = document.getElementById('admin-song-audio').value;

    if (!cassetteId || !title || !audioUrl) {
      alert("Cassette ID, Title, and Audio URL are required.");
      return;
    }

    // Get max track number for this cassette
    const { data: existingTracks } = await window.supabaseClient
      .from('tracks')
      .select('track_number')
      .eq('cassette_id', cassetteId)
      .order('track_number', { ascending: false })
      .limit(1);

    const nextTrackNum = existingTracks && existingTracks.length > 0 
      ? existingTracks[0].track_number + 1 
      : 1;

    const { error } = await window.supabaseClient
      .from('tracks')
      .insert([
        {
          cassette_id: cassetteId,
          track_number: nextTrackNum,
          title: title,
          movie: movie,
          music_director: 'Pradeep N',
          audio_url: audioUrl
        }
      ]);

    if (error) {
      alert(`Error saving song: ${error.message}\n\nMake sure your Supabase 'tracks' table exists and RLS policies allow inserts for anonymous users.`);
    } else {
      alert("Song added successfully!");
      // Clear inputs
      document.getElementById('admin-song-title').value = '';
      document.getElementById('admin-song-movie').value = '';
      document.getElementById('admin-song-audio').value = '';
      this.loadSongs(); // Refresh list
    }
  },

  async loadSongs() {
    if (!window.supabaseClient) return;

    const listEl = document.getElementById('admin-song-list');
    listEl.innerHTML = '<div style="color:var(--silver);">Loading...</div>';

    const { data, error } = await window.supabaseClient
      .from('tracks')
      .select('*')
      .order('cassette_id', { ascending: true })
      .order('track_number', { ascending: true });

    if (error) {
      listEl.innerHTML = `<div style="color:var(--led-red);">Error: ${error.message}</div>`;
      return;
    }

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div style="color:var(--silver-dark);">No songs found.</div>';
      return;
    }

    listEl.innerHTML = data.map(t => `
      <div class="admin-song-item">
        <div>
          <span style="color:var(--led-cyan); margin-right:8px;">[${t.cassette_id}]</span>
          ${t.track_number}. <strong>${t.title}</strong> - ${t.movie}
        </div>
        <button class="admin-delete-btn" onclick="AdminModule.deleteSong('${t.id}')">Delete</button>
      </div>
    `).join('');
  },

  async deleteSong(id) {
    if (!confirm("Are you sure you want to delete this song?")) return;
    if (!window.supabaseClient) return;

    const { error } = await window.supabaseClient
      .from('tracks')
      .delete()
      .eq('id', id);

    if (error) {
      alert(`Error deleting: ${error.message}`);
    } else {
      this.loadSongs();
    }
  }
};

window.AdminModule = AdminModule;

// Initialization for dedicated /admin.html page
document.addEventListener('DOMContentLoaded', async () => {
  if (window.location.pathname.endsWith('admin.html')) {
    const hasSession = localStorage.getItem('admin_session') === 'true';
    if (hasSession) {
      AdminModule.openDashboard();
    } else {
      AdminModule.openLogin();
    }
  }
});
