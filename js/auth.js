// ============================================================
// AUTH MODULE — Google Sign-In + IP Tracking + Visitor Logging
// Keyboard Fantasia Player
// ============================================================

var AuthModule = (function() {
  'use strict';

  var currentUser = null;
  var currentVisitorId = null;
  var visitorIP = null;
  var authListeners = [];

  // ── Public API ──

  function init() {
    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase not configured — auth features disabled');
      showPlayerDirectly();
      return;
    }

    var sb = getSupabase();
    if (!sb) { showPlayerDirectly(); return; }

    // Listen for auth state changes
    sb.auth.onAuthStateChange(function(event, session) {
      console.log('🔐 Auth event:', event);
      if (event === 'SIGNED_IN' && session) {
        handleSignedIn(session);
      } else if (event === 'SIGNED_OUT') {
        handleSignedOut();
      } else if (event === 'INITIAL_SESSION' && session) {
        handleSignedIn(session);
      } else if (event === 'INITIAL_SESSION' && !session) {
        showAuthOverlay();
      }
    });

    // Check existing session
    sb.auth.getSession().then(function(result) {
      if (result.data.session) {
        handleSignedIn(result.data.session);
      } else {
        showAuthOverlay();
      }
    }).catch(function(err) {
      console.error('Session check failed:', err);
      showAuthOverlay();
    });
  }

  // ── Google Sign-In ──

  function signInWithGoogle() {
    var sb = getSupabase();
    if (!sb) return;

    var btnText = document.getElementById('google-btn-text');
    if (btnText) btnText.textContent = 'Connecting...';

    sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    }).then(function(result) {
      if (result.error) {
        console.error('Google sign-in error:', result.error.message);
        if (btnText) btnText.textContent = 'Sign in with Google';
        showAuthError('Sign-in failed. Please try again.');
      }
      // If successful, page will redirect to Google
    }).catch(function(err) {
      console.error('Sign-in exception:', err);
      if (btnText) btnText.textContent = 'Sign in with Google';
    });
  }

  function signOut() {
    var sb = getSupabase();
    if (!sb) return;

    sb.auth.signOut().then(function() {
      currentUser = null;
      currentVisitorId = null;
      hideUserBadge();
      showAuthOverlay();
    });
  }

  const ADMIN_EMAILS = ['pradeep@vssc.gov.in', 'admin@example.com']; // Update with actual admin emails

  // ── Handle Sign-In Success ──

  function handleSignedIn(session) {
    var user = session.user;
    var meta = user.user_metadata || {};
    var email = user.email || meta.email || '';

    // Admin Whitelist Check
    if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
      console.warn('Unauthorized login attempt by:', email);
      showAuthError('Unauthorized Account: ' + email);
      var sb = getSupabase();
      if (sb) {
        sb.auth.signOut().then(function() {
          handleSignedOut();
          showAuthOverlay();
        });
      }
      return;
    }

    currentUser = {
      id: user.id,
      email: email,
      name: meta.full_name || meta.name || email || 'User',
      avatar: meta.avatar_url || meta.picture || ''
    };

    console.log('👤 Signed in as:', currentUser.name, currentUser.email);

    hideAuthOverlay();
    showUserBadge(currentUser);
    fetchIPAndTrackVisitor();
    notifyListeners('signed_in', currentUser);
  }

  function handleSignedOut() {
    currentUser = null;
    currentVisitorId = null;
    hideUserBadge();
    notifyListeners('signed_out', null);
  }

  // ── Continue as Guest ──

  function continueAsGuest() {
    currentUser = { id: null, email: null, name: 'Guest', avatar: '' };
    hideAuthOverlay();
    fetchIPAndTrackVisitor();
    notifyListeners('guest', currentUser);
  }

  // ── IP Address Detection ──

  function fetchIPAndTrackVisitor() {
    // Try multiple free IP services with fallback
    fetchIP()
      .then(function(ipData) {
        visitorIP = ipData.ip || null;
        console.log('🌐 Visitor IP:', visitorIP);
        trackVisitor(ipData);
      })
      .catch(function(err) {
        console.warn('IP detection failed:', err);
        trackVisitor({ ip: null });
      });
  }

  function fetchIP() {
    // Primary: ipapi.co (free, gives IP + geo)
    return fetch('https://ipapi.co/json/')
      .then(function(r) { 
        if (!r.ok) throw new Error('ipapi failed');
        return r.json(); 
      })
      .then(function(data) {
        return { ip: data.ip, city: data.city, country: data.country_name };
      })
      .catch(function() {
        // Fallback: ipify (free, IP only)
        return fetch('https://api.ipify.org?format=json')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            return { ip: data.ip, city: null, country: null };
          });
      });
  }

  // ── Track Visitor in Supabase ──

  function trackVisitor(ipData) {
    if (!isSupabaseConfigured()) return;
    var sb = getSupabase();
    if (!sb) return;

    sb.rpc('upsert_visitor', {
      p_auth_uid: currentUser && currentUser.id ? currentUser.id : null,
      p_email: currentUser ? currentUser.email : null,
      p_name: currentUser ? currentUser.name : null,
      p_avatar_url: currentUser ? currentUser.avatar : null,
      p_ip_address: ipData.ip || null,
      p_user_agent: navigator.userAgent,
      p_city: ipData.city || null,
      p_country: ipData.country || null
    }).then(function(result) {
      if (result.error) {
        console.warn('Visitor tracking error:', result.error.message);
      } else {
        currentVisitorId = result.data;
        console.log('📊 Visitor tracked, ID:', currentVisitorId);
      }
    }).catch(function(err) {
      console.warn('Visitor tracking failed:', err);
    });
  }

  // ── UI Helpers ──

  function showAuthOverlay() {
    var overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.classList.add('is-visible');
      overlay.style.display = 'flex';
    }
  }

  function hideAuthOverlay() {
    var overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.classList.remove('is-visible');
      // Slight delay to let transition finish
      setTimeout(function() {
        overlay.style.display = 'none';
      }, 400);
    }
  }

  function showPlayerDirectly() {
    // If Supabase isn't configured, skip auth and show player immediately
    var overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  function showUserBadge(user) {
    var badge = document.getElementById('user-badge');
    var nameEl = document.getElementById('user-badge-name');
    var avatarEl = document.getElementById('user-badge-avatar');
    var emailEl = document.getElementById('user-badge-email');

    if (!badge) return;

    if (nameEl) nameEl.textContent = user.name;
    if (emailEl) emailEl.textContent = user.email || '';
    if (avatarEl) {
      if (user.avatar) {
        avatarEl.innerHTML = '<img src="' + user.avatar + '" alt="' + user.name + '" referrerpolicy="no-referrer">';
      } else {
        avatarEl.textContent = (user.name || 'G').charAt(0).toUpperCase();
      }
    }

    badge.classList.add('is-visible');
  }

  function hideUserBadge() {
    var badge = document.getElementById('user-badge');
    if (badge) badge.classList.remove('is-visible');
  }

  function showAuthError(msg) {
    var errEl = document.getElementById('auth-error');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      setTimeout(function() { errEl.style.display = 'none'; }, 5000);
    }
  }

  // ── Event System ──

  function onAuth(callback) {
    authListeners.push(callback);
  }

  function notifyListeners(event, data) {
    authListeners.forEach(function(cb) {
      try { cb(event, data); } catch(e) { console.error('Auth listener error:', e); }
    });
  }

  // ── Public Interface ──
  return {
    init: init,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    continueAsGuest: continueAsGuest,
    onAuth: onAuth,
    getCurrentUser: function() { return currentUser; },
    getVisitorId: function() { return currentVisitorId; },
    getVisitorIP: function() { return visitorIP; }
  };

})();
