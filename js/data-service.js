// ============================================================
// DATA SERVICE — Fetch cassettes & tracks from Supabase
// Keyboard Fantasia Player
// ============================================================

var DataService = (function() {
  'use strict';

  var cachedCassettes = null;
  var cachedTracks = {};

  // ── Fetch all cassettes ──
  function fetchCassettes() {
    if (!isSupabaseConfigured()) {
      console.log('📀 Using local fallback data (Supabase not configured)');
      return Promise.resolve(null); // signal to use fallback
    }

    if (cachedCassettes) {
      return Promise.resolve(cachedCassettes);
    }

    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);

    return sb
      .from('cassettes')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(function(result) {
        if (result.error) {
          console.error('Failed to fetch cassettes:', result.error.message);
          return null;
        }
        cachedCassettes = result.data;
        console.log('📀 Loaded', cachedCassettes.length, 'cassettes from Supabase');
        return cachedCassettes;
      })
      .catch(function(err) {
        console.error('Cassettes fetch exception:', err);
        return null;
      });
  }

  // ── Fetch tracks for a specific cassette ──
  function fetchTracks(cassetteId) {
    if (!isSupabaseConfigured()) return Promise.resolve(null);
    
    if (cachedTracks[cassetteId]) {
      return Promise.resolve(cachedTracks[cassetteId]);
    }

    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);

    return sb
      .from('tracks')
      .select('*')
      .eq('cassette_id', cassetteId)
      .order('track_number', { ascending: true })
      .then(function(result) {
        if (result.error) {
          console.error('Failed to fetch tracks:', result.error.message);
          return null;
        }
        // Transform to match the existing data format used by the player
        var tracks = result.data.map(function(t) {
          return {
            id: t.track_number,
            dbId: t.id,
            title: t.title,
            movie: t.movie || '',
            musicDirector: t.music_director || '',
            audioFile: resolveMediaUrl(t.audio_url),
            videoFile: resolveMediaUrl(t.video_url),
            videoSrc: t.video_src || null
          };
        });
        cachedTracks[cassetteId] = tracks;
        return tracks;
      })
      .catch(function(err) {
        console.error('Tracks fetch exception:', err);
        return null;
      });
  }

  // ── Fetch all cassettes with their tracks ──
  function fetchAllData() {
    if (!isSupabaseConfigured()) return Promise.resolve(null);

    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);

    return Promise.all([
      sb.from('cassettes').select('*').order('sort_order', { ascending: true }),
      sb.from('tracks').select('*').order('track_number', { ascending: true })
    ]).then(function(results) {
      var cassetteResult = results[0];
      var trackResult = results[1];

      if (cassetteResult.error || trackResult.error) {
        console.error('Data fetch error:', cassetteResult.error || trackResult.error);
        return null;
      }

      // Transform to the format expected by the player's CASSETTE_DATA structure
      var cassettes = cassetteResult.data.map(function(c) {
        var cassetteTracks = trackResult.data
          .filter(function(t) { return t.cassette_id === c.id; })
          .map(function(t) {
            return {
              id: t.track_number,
              dbId: t.id,
              title: t.title,
              movie: t.movie || '',
              musicDirector: t.music_director || '',
              audioFile: resolveMediaUrl(t.audio_url),
              videoFile: resolveMediaUrl(t.video_url),
              videoSrc: t.video_src || null
            };
          });

        return {
          id: c.id,
          label: c.label,
          fullLabel: c.full_label,
          color: c.color,
          photoSet: c.photo_set,
          tracks: cassetteTracks
        };
      });

      console.log('📀 Loaded', cassettes.length, 'cassettes with',
        trackResult.data.length, 'total tracks from Supabase');

      return {
        cassettes: cassettes,
        photoSets: { S1: [], S2: [], S3: [], S4: [], S5: [], S6: [] },
        branding: {
          title: 'Keyboard Fantasia',
          artistName: 'Pradeep N',
          designation: 'Engineer, VSSC',
          tagline: 'Keyboard Fantasia by Pradeep N, Engineer, VSSC',
          artistPhoto: 'media/photos/pradeep_n.jpg'
        }
      };
    }).catch(function(err) {
      console.error('fetchAllData exception:', err);
      return null;
    });
  }

  // ── Resolve media URL ──
  // If URL starts with 'media/' it's a local file, otherwise it's a full URL
  // Supabase Storage URLs are full https:// URLs
  function resolveMediaUrl(url) {
    if (!url) return '';
    
    // Already a full URL (Supabase Storage or external)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // Local relative path — use as-is
    return url;
  }

  // ── Log a play event ──
  function logPlay(track, cassetteId) {
    if (!isSupabaseConfigured()) return;

    var sb = getSupabase();
    if (!sb) return;

    var visitorId = AuthModule.getVisitorId();

    sb.from('play_logs').insert({
      visitor_id: visitorId || null,
      track_id: track.dbId || null,
      cassette_id: cassetteId || null,
      track_title: track.title || ''
    }).then(function(result) {
      if (result.error) {
        console.warn('Play log error:', result.error.message);
      } else {
        console.log('🎵 Play logged:', track.title);
      }
    }).catch(function(err) {
      console.warn('Play log failed:', err);
    });
  }

  // ── Clear cache ──
  function clearCache() {
    cachedCassettes = null;
    cachedTracks = {};
  }

  return {
    fetchCassettes: fetchCassettes,
    fetchTracks: fetchTracks,
    fetchAllData: fetchAllData,
    logPlay: logPlay,
    clearCache: clearCache,
    resolveMediaUrl: resolveMediaUrl
  };

})();
