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

    statusEl.textContent = 'Upload Success!';
    statusEl.style.color = 'var(--led-green)';

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
    const ytVidEl = document.getElementById('youtube-video-url');
    const ytAudEl = document.getElementById('youtube-audio-url');
    const youtubeVideoUrl = ytVidEl ? ytVidEl.value.trim() : '';
    const youtubeAudioUrl = ytAudEl ? ytAudEl.value.trim() : '';

    if (!cassetteId) {
      alert('Cassette ID is required.');
      return;
    }
    if (!cleanedTitle) {
      alert('Title is required.');
      return;
    }
    if (!audioUrl && !videoUrl && !imageUrl && !youtubeVideoUrl && !youtubeAudioUrl) {
      alert('Please upload or provide at least one media URL (Audio, Video, Image, or YouTube).');
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
      title: cleanedTitle,
      is_active: true
    };

    if (audioUrl) payload.audio_url = audioUrl;
    if (videoUrl) payload.video_url = videoUrl;
    if (imageUrl) payload.image_url = imageUrl;
    if (youtubeVideoUrl) payload.youtube_video_url = youtubeVideoUrl;
    if (youtubeAudioUrl) payload.youtube_audio_url = youtubeAudioUrl;

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
      if (ytVidEl) ytVidEl.value = '';
      if (ytAudEl) ytAudEl.value = '';
      this.loadSongs(); // Refresh list
    }
  },

  async uploadThumbnailFile(fileInput) {
    return this.uploadSongThumbnail(fileInput);
  },

  async uploadSongThumbnail(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const statusElem = document.getElementById('thumbnail-upload-status');
    const urlHiddenInput = document.getElementById('song-thumbnail-url');

    if (statusElem) statusElem.innerHTML = '<span style="color:orange;">Uploading thumbnail...</span>';

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client is not initialized.');

      const fileExt = file.name.split('.').pop();
      const fileName = `thumb_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `images/${fileName}`;

      // Upload thumbnail to storage bucket
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      if (urlHiddenInput) urlHiddenInput.value = publicUrlData.publicUrl;
      if (statusElem) statusElem.innerHTML = '<span style="color:#00ffcc;">✓ Thumbnail attached</span>';
    } catch (err) {
      console.error('Song Thumbnail Upload Error:', err);
      if (statusElem) statusElem.innerHTML = '<span style="color:red;">❌ Upload failed</span>';
    }
  },

  async uploadAdminFile(fileInput, folderName) {
    const cfgMap = {
      audio:  { status: 'audio-upload-status', target: 'audio-url-input' },
      images: { status: 'thumb-upload-status', target: 'image-url-input' },
      video:  { status: 'video-upload-status', target: 'video-url-input' }
    };
    const cfg = cfgMap[folderName];
    if (!cfg) return;

    const statusEl = document.getElementById(cfg.status);
    const file = fileInput.files[0];

    if (!file) {
      if (statusEl) {
        statusEl.textContent = 'Please select a file first.';
        statusEl.style.color = 'var(--led-red)';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = 'Uploading...';
      statusEl.style.color = '#ffcc00';
    }

    const publicUrl = await this.uploadFileToSupabase(file, folderName);

    if (!publicUrl) {
      if (statusEl) {
        statusEl.textContent = 'Upload failed - see alert above.';
        statusEl.style.color = 'var(--led-red)';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = 'Upload Success!';
      statusEl.style.color = 'var(--led-green)';
    }

    const target = document.getElementById(cfg.target);
    if (target) {
      target.value = publicUrl;
    }
  },

  async saveCassetteTrack() {
    const cassetteEl = document.getElementById('cassette-select');
    const titleEl = document.getElementById('song-title');
    if (!cassetteEl || !titleEl) {
      alert('Form elements not found. This form only exists on the Admin Panel (admin.html).');
      return;
    }

    const cassetteId = cassetteEl.value.trim().replace('-', '');
    const title = titleEl.value.trim();
    const audioUrl = document.getElementById('audio-url-input')?.value;
    const videoUrl = document.getElementById('video-url-input')?.value;
    const imageUrl = document.getElementById('song-thumbnail-url')?.value;
    const youtubeUrl = document.getElementById('youtube-url-input')?.value;

    if (!title || !cassetteId) {
      alert('Please enter a track title and select a cassette.');
      return;
    }

    const sb = getSupabase();
    if (!sb) {
      alert('Supabase client is not initialized. Check that js/supabase-config.js loaded and initSupabase() ran.');
      return;
    }

    // Get max track number for this cassette (keeps playback ordering correct)
    const { data: existingTracks } = await sb
      .from('tracks')
      .select('track_number')
      .eq('cassette_id', cassetteId)
      .order('track_number', { ascending: false })
      .limit(1);

    const nextTrackNum = existingTracks && existingTracks.length > 0
      ? existingTracks[0].track_number + 1
      : 1;

    const payload = {
      cassette_id: cassetteId,
      track_number: nextTrackNum,
      title: title,
      audio_url: audioUrl || null,
      video_url: videoUrl || null,
      image_url: imageUrl || null,
      youtube_video_url: youtubeUrl || null,
      is_active: true
    };

    try {
      const { error } = await sb
        .from('tracks')
        .upsert(payload, { onConflict: 'cassette_id,track_number' });

      if (error) throw error;

      alert(`✓ Successfully saved track with custom thumbnail to Cassette ${cassetteId}!`);
    } catch (err) {
      console.error('Error saving track:', err);
      alert('Error saving track: ' + err.message);
      return;
    }

    // Reset form
    titleEl.value = '';
    const audioUrlEl = document.getElementById('audio-url-input');
    const videoUrlEl = document.getElementById('video-url-input');
    if (audioUrlEl) audioUrlEl.value = '';
    if (videoUrlEl) videoUrlEl.value = '';
    const ytEl = document.getElementById('youtube-url-input');
    if (ytEl) ytEl.value = '';
    const thumbUrlEl = document.getElementById('song-thumbnail-url');
    if (thumbUrlEl) thumbUrlEl.value = '';
    const fileIds = ['upload-audio-file', 'upload-video-file', 'upload-image-file', 'song-thumbnail-file'];
    fileIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const statusDefaults = {
      'status-audio': 'Audio',
      'status-video': 'Video'
    };
    Object.keys(statusDefaults).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `${statusDefaults[id]}: <span style="color:#888;">Not uploaded</span>`;
    });
    const thumbStatusEl = document.getElementById('thumbnail-upload-status');
    if (thumbStatusEl) {
      thumbStatusEl.innerHTML = 'No thumbnail selected';
    }
    this.loadSongs(); // Refresh list
  },

  async uploadStorageFile(type) {
    let fileInputId, statusElemId, targetUrlInputId;

    if (type === 'audio') {
      fileInputId = 'upload-audio-file';
      statusElemId = 'status-audio';
      targetUrlInputId = 'audio-url-input';
    } else if (type === 'video') {
      fileInputId = 'upload-video-file';
      statusElemId = 'status-video';
      targetUrlInputId = 'video-url-input';
    } else if (type === 'images') {
      fileInputId = 'upload-image-file';
      statusElemId = 'thumbnail-upload-status';
      targetUrlInputId = 'song-thumbnail-url';
    } else {
      return;
    }

    const fileInput = document.getElementById(fileInputId);
    const statusElem = document.getElementById(statusElemId);
    const targetUrlInput = document.getElementById(targetUrlInputId);

    const file = fileInput?.files[0];
    if (!file) {
      alert(`Please select a ${type} file first.`);
      return;
    }

    if (statusElem) statusElem.innerHTML = `${type}: <span style="color:orange;">Uploading...</span>`;

    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase client is not initialized.');

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${type}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      if (targetUrlInput) targetUrlInput.value = publicUrl;
      if (statusElem) statusElem.innerHTML = `${type}: <span style="color:#00ffcc;">✓ Ready (${file.name})</span>`;

    } catch (err) {
      console.error(`Upload error for ${type}:`, err);
      if (statusElem) statusElem.innerHTML = `${type}: <span style="color:red;">❌ Upload failed</span>`;
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
                  const isEnabled = song.is_active !== false && song.enabled !== false;

                  return `
                    <div class="song-item ${isEnabled ? 'enabled' : 'disabled'}">
                      <span class="song-title"><strong>${autoNumber}.</strong> ${safeTitle}</span>
                      <div class="song-actions">
                        <button class="toggle-btn ${isEnabled ? 'btn-enabled' : 'btn-disabled'}" data-action="toggle" data-id="${this.escapeHtml(song.id)}">${isEnabled ? 'Enabled' : 'Disabled'}</button>
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

    // Attach Enable/Disable toggle event listeners
    listEl.querySelectorAll('[data-action="toggle"]').forEach(toggleBtn => {
      toggleBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const item = toggleBtn.closest('.song-item');
        const songId = toggleBtn.getAttribute('data-id');
        const song = songs.find(s => String(s.id) === String(songId));
        if (!song) return;

        const currentStatus = song.is_active !== false && song.enabled !== false;
        const newStatus = !currentStatus;

        song.is_active = newStatus;
        song.enabled = newStatus;

        if (newStatus) {
          item.classList.remove('disabled');
          item.classList.add('enabled');
          toggleBtn.classList.remove('btn-disabled');
          toggleBtn.classList.add('btn-enabled');
          toggleBtn.textContent = 'Enabled';
        } else {
          item.classList.remove('enabled');
          item.classList.add('disabled');
          toggleBtn.classList.remove('btn-enabled');
          toggleBtn.classList.add('btn-disabled');
          toggleBtn.textContent = 'Disabled';
        }

        const sb = getSupabase();
        if (sb) {
          const { error } = await sb
            .from('tracks')
            .update({ is_active: newStatus })
            .eq('id', songId);

          if (error) {
            console.error('Error updating track status:', error);
            alert(`Failed to update song status: ${error.message}`);
            song.is_active = currentStatus;
            song.enabled = currentStatus;
            this.loadSongs();
          }
        }
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
window.uploadAdminFile = (fileInput, folderName) => AdminModule.uploadAdminFile(fileInput, folderName);
window.uploadThumbnailFile = (fileInput) => AdminModule.uploadThumbnailFile(fileInput);
window.uploadSongThumbnail = (fileInput) => AdminModule.uploadSongThumbnail(fileInput);
window.uploadStorageFile = (folderName) => AdminModule.uploadStorageFile(folderName);
window.saveCassetteTrack = () => AdminModule.saveCassetteTrack();

// ============================================================
// PHOTO MANAGER — Standalone for admin.html
// ============================================================

const PHOTO_STORAGE_BUCKET = 'PradeepN_songs_tracks';
const PHOTO_STORAGE_FOLDER = 'images';
const PHOTO_VALID_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

window.managedPhotos = [];

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

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadStoragePhotos() {
  var sb = getSupabase();
  if (!sb) {
    console.warn('[PhotoManager] Supabase not available.');
    return;
  }

  console.log('[PhotoManager] Fetching photos from Supabase Storage...');
  var result = await sb.storage
    .from(PHOTO_STORAGE_BUCKET)
    .list(PHOTO_STORAGE_FOLDER, { limit: 100, sortBy: { column: 'name', order: 'asc' } });

  var files = result.data;
  var storageErr = result.error;

  if (storageErr) {
    console.error('[PhotoManager] Storage list error:', storageErr);
    var listEl = document.getElementById('photo-list');
    if (listEl) listEl.innerHTML = '<li class="photo-empty-msg">Error loading photos: ' + storageErr.message + '</li>';
    return;
  }

  if (!files || files.length === 0) {
    console.warn('[PhotoManager] No files found in images/ storage folder.');
    window.managedPhotos = [];
    renderPhotoList();
    return;
  }

  var toggleState = _loadPhotoToggleState();

  window.managedPhotos = files
    .filter(function (f) {
      if (!f.name || f.name.startsWith('.')) return false;
      if (f.name === '.emptyFolderPlaceholder') return false;
      var lower = f.name.toLowerCase();
      return PHOTO_VALID_EXTENSIONS.some(function (ext) { return lower.endsWith(ext); });
    })
    .map(function (f) {
      var urlResult = sb.storage
        .from(PHOTO_STORAGE_BUCKET)
        .getPublicUrl(PHOTO_STORAGE_FOLDER + '/' + f.name);

      var publicUrl = urlResult.data ? urlResult.data.publicUrl : '';
      var isEnabled = toggleState[f.name] !== undefined ? toggleState[f.name] : true;

      return {
        id: f.name,
        name: f.name,
        src: publicUrl,
        enabled: isEnabled
      };
    });

  console.log('[PhotoManager] Loaded ' + window.managedPhotos.length + ' photos from storage.');
  renderPhotoList();
}

async function uploadManagedPhotos(fileList) {
  var sb = getSupabase();
  if (!sb) return;
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
    var path = PHOTO_STORAGE_FOLDER + '/' + safeName;

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

async function deleteManagedPhoto(fileName) {
  if (!confirm('Delete "' + fileName + '" from storage?')) return;

  var sb = getSupabase();
  if (!sb) return;

  var result = await sb.storage
    .from(PHOTO_STORAGE_BUCKET)
    .remove([PHOTO_STORAGE_FOLDER + '/' + fileName]);

  if (result.error) {
    console.error('[PhotoManager] Delete error:', fileName, result.error);
    alert('Failed to delete: ' + result.error.message);
    return;
  }

  var toggleState = _loadPhotoToggleState();
  delete toggleState[fileName];
  _savePhotoToggleState(toggleState);

  console.log('[PhotoManager] Deleted: ' + fileName);
  await loadStoragePhotos();
}

function toggleManagedPhoto(photoId) {
  var photo = window.managedPhotos.find(function (p) { return p.id === photoId; });
  if (!photo) return;

  photo.enabled = !photo.enabled;

  var toggleState = _loadPhotoToggleState();
  toggleState[photoId] = photo.enabled;
  _savePhotoToggleState(toggleState);

  renderPhotoList();
}

function updatePhotoCount() {
  var badge = document.getElementById('photo-count');
  if (!badge) return;
  var total = window.managedPhotos.length;
  badge.textContent = total + ' Photo' + (total === 1 ? '' : 's');
}

function renderPhotoList() {
  var listEl = document.getElementById('photo-list');
  if (!listEl) return;

  if (window.managedPhotos.length === 0) {
    listEl.innerHTML = '<li class="photo-empty-msg">No photos in storage yet.</li>';
    updatePhotoCount();
    return;
  }

  listEl.innerHTML = window.managedPhotos.map(function (photo, index) {
    var isEnabled = photo.enabled;
    var safeName = _escapeHtml(photo.name);
    var displayName = safeName.length > 32 ? safeName.substring(0, 29) + '...' : safeName;
    return '<li class="photo-item ' + (isEnabled ? '' : 'disabled') + '" data-photo-id="' + safeName + '">'
      + '<span class="photo-index">' + (index + 1) + '.</span>'
      + '<img class="photo-thumb" src="' + photo.src + '" alt="' + safeName + '" onerror="this.style.opacity=0.3">'
      + '<span class="photo-name" title="' + safeName + '">' + displayName + '</span>'
      + '<div class="photo-actions">'
      + '<button class="photo-toggle-btn ' + (isEnabled ? 'photo-enabled' : 'photo-disabled') + '" data-action="toggle-photo" data-photo-id="' + safeName + '">' + (isEnabled ? 'Enabled' : 'Disabled') + '</button>'
      + '<button class="photo-delete-btn" data-action="delete-photo" data-photo-id="' + safeName + '">Delete</button>'
      + '</div>'
      + '</li>';
  }).join('');

  listEl.querySelectorAll('[data-action="toggle-photo"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggleManagedPhoto(btn.getAttribute('data-photo-id'));
    });
  });

  listEl.querySelectorAll('[data-action="delete-photo"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      deleteManagedPhoto(btn.getAttribute('data-photo-id'));
    });
  });

  updatePhotoCount();
}

function initPhotoManager() {
  var fileInput = document.getElementById('photo-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', function () {
      uploadManagedPhotos(fileInput.files);
      fileInput.value = '';
    });
  }
  loadStoragePhotos();
}

window.PhotoManager = {
  fetch: loadStoragePhotos,
  upload: uploadManagedPhotos,
  delete: deleteManagedPhoto,
  toggle: toggleManagedPhoto,
  getPhotos: function () { return window.managedPhotos; }
};

// Initialization for dedicated /admin.html page
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  if (window.location.pathname.endsWith('admin.html')) {
    const hasSession = localStorage.getItem('admin_session') === 'true';
    if (hasSession) {
      AdminModule.openDashboard();
      initPhotoManager();
    } else {
      AdminModule.openLogin();
    }
  }
});
