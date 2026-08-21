// ============================================================
// AUTH MODULE — Anonymous Guest Auto-Login + Admin Google OAuth
// Keyboard Fantasia Player
// ============================================================
//
// FLOW:
//   Guests  → Auto signed-in anonymously (no UI, no redirect)
//   Admins  → "Sign in with Google" button on index.html
//             Email must be in ADMIN_EMAILS whitelist
// ============================================================

var AuthModule = (function () {
  'use strict';

  // ── Admin whitelist ──
  // Add authorised admin Google account emails here
  var ADMIN_EMAILS = [
    'pradeep@vssc.gov.in',
    'pradeepn.vssc@gmail.com'
  ];

  var currentUser = null;
  var currentVisitorId = null;
  var visitorIP = null;
  var isAdmin = false;
  var authListeners = [];
  var _initialized = false;

  // ─────────────────────────────────────────────────────────
  // PUBLIC: init()
  //   Called on every page load.
  //   • player.html → ensure a session exists (guest or admin)
  //   • index.html  → if already authed, redirect to player
  // ─────────────────────────────────────────────────────────
  function init() {
    if (_initialized) return;
    _initialized = true;

    var isLoginPage = window.location.pathname.endsWith('index.html') ||
                      window.location.pathname === '/' ||
                      window.location.pathname.endsWith('/');
    var isPlayerPage = window.location.pathname.endsWith('player.html');

    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase not configured — running without auth');
      if (isLoginPage) window.location.href = 'player.html';
      return;
    }

    var sb = getSupabase();
    if (!sb) {
      if (isLoginPage) window.location.href = 'player.html';
      return;
    }

    // ── Observe ongoing auth changes ──
    sb.auth.onAuthStateChange(function (event, session) {
      console.log('🔐 Auth event:', event);

      if (event === 'SIGNED_IN' && session) {
        _handleSession(session, isLoginPage, isPlayerPage);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        isAdmin = false;
        // Re-sign in as guest automatically on player page
        if (isPlayerPage) _signInAsGuest();
      }
    });

    // ── Check existing session ──
    sb.auth.getSession().then(function (result) {
      var session = result.data && result.data.session;

      if (session) {
        _handleSession(session, isLoginPage, isPlayerPage);
      } else {
        // No session → sign in anonymously (guest mode)
        if (isLoginPage) {
          // On login page, just show the sign-in UI — do nothing
          return;
        }
        _signInAsGuest();
      }
    }).catch(function (err) {
      console.error('Session check failed:', err);
      if (isPlayerPage) _signInAsGuest();
    });
  }

  // ─────────────────────────────────────────────────────────
  // PRIVATE: _signInAsGuest()
  //   Uses Supabase Anonymous Sign-in so guests can read DB.
  // ─────────────────────────────────────────────────────────
  function _signInAsGuest() {
    var sb = getSupabase();
    if (!sb) {
      _fallbackGuest();
      return;
    }

    sb.auth.signInAnonymously().then(function (result) {
      if (result.error) {
        var code = result.error.status || result.error.code;
        console.warn('Guest Auth notice:', result.error.message);
        if (code === 422 || (result.error.message && result.error.message.indexOf('422') !== -1)) {
          console.warn('Anonymous sign-ins may be disabled in Supabase. Falling back to Guest Session Mode.');
        }
        _fallbackGuest();
        return;
      }

      var session = result.data && result.data.session;
      if (session) {
        currentUser = {
          id: session.user.id,
          email: null,
          name: 'Guest',
          avatar: '',
          isAnonymous: true
        };
        isAdmin = false;
        console.log('👤 Signed in as anonymous guest');
        fetchIPAndTrackVisitor();
        notifyListeners('guest', currentUser);
      }
    }).catch(function (err) {
      console.warn('Guest sign-in bypassed:', err.message || err);
      _fallbackGuest();
    });
  }

  function _fallbackGuest() {
    currentUser = { id: null, email: null, name: 'Guest', avatar: '', isAnonymous: true };
    isAdmin = false;
    notifyListeners('guest', currentUser);
  }

  // ─────────────────────────────────────────────────────────
  // PRIVATE: _handleSession(session, isLoginPage, isPlayerPage)
  //   Routes sign-in based on anonymous vs Google user.
  // ─────────────────────────────────────────────────────────
  function _handleSession(session, isLoginPage, isPlayerPage) {
    var user = session.user;
    var meta = user.user_metadata || {};

    // Anonymous users
    if (user.is_anonymous) {
      if (isLoginPage) {
        window.location.href = 'player.html';
        return;
      }
      currentUser = { id: user.id, email: null, name: 'Guest', avatar: '', isAnonymous: true };
      isAdmin = false;
      fetchIPAndTrackVisitor();
      notifyListeners('guest', currentUser);
      return;
    }

    // OAuth (Google) users — whitelist check
    var email = (user.email || meta.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      console.warn('🚫 Unauthorized login attempt:', email);
      _showAuthError('Access denied: ' + email + ' is not an authorised admin account.');
      var sb = getSupabase();
      if (sb) sb.auth.signOut();
      return;
    }

    // Authorised admin
    currentUser = {
      id: user.id,
      email: email,
      name: meta.full_name || meta.name || email,
      avatar: meta.avatar_url || meta.picture || '',
      isAnonymous: false
    };
    isAdmin = true;

    if (isLoginPage) {
      window.location.href = 'player.html';
      return;
    }

    console.log('👑 Signed in as admin:', currentUser.name);
    _showUserBadge(currentUser);
    fetchIPAndTrackVisitor();
    notifyListeners('signed_in', currentUser);
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: continueAsGuest()  (called from index.html button)
  // ─────────────────────────────────────────────────────────
  function continueAsGuest() {
    var sb = getSupabase();
    if (!sb) {
      window.location.href = 'player.html';
      return;
    }

    var btn = document.querySelector('.guest-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Entering as Guest...';
    }

    sb.auth.signInAnonymously().then(function (result) {
      if (result.error) {
        var code = result.error.status || result.error.code;
        console.warn('Guest Auth notice:', result.error.message);
        if (code === 422 || (result.error.message && result.error.message.indexOf('422') !== -1)) {
          console.warn('Anonymous sign-ins may be disabled in Supabase. Proceeding with Guest Session Mode.');
        }
      }
      window.location.href = 'player.html';
    }).catch(function (err) {
      console.warn('Guest sign-in bypassed:', err.message || err);
      window.location.href = 'player.html';
    });
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: signInWithGoogle()  (called from index.html button)
  // ─────────────────────────────────────────────────────────
  function signInWithGoogle() {
    var sb = getSupabase();
    if (!sb) return;

    var btnText = document.getElementById('google-btn-text');
    if (btnText) btnText.textContent = 'Connecting...';

    var redirectUrl = window.location.origin + '/player.html';

    sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl }
    }).then(function (result) {
      if (result.error) {
        console.error('Google sign-in error:', result.error.message);
        if (btnText) btnText.textContent = 'Sign in with Google';
        _showAuthError('Sign-in failed. Please try again.');
      }
    }).catch(function (err) {
      console.error('Sign-in exception:', err);
      if (btnText) btnText.textContent = 'Sign in with Google';
    });
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: signOut()
  // ─────────────────────────────────────────────────────────
  function signOut() {
    var sb = getSupabase();
    if (sb) {
      sb.auth.signOut().then(function () {
        window.location.href = 'index.html';
      });
    } else {
      window.location.href = 'index.html';
    }
  }

  // ─────────────────────────────────────────────────────────
  // Visitor IP tracking
  // ─────────────────────────────────────────────────────────
  function fetchIPAndTrackVisitor() {
    _fetchIP()
      .then(function (ipData) {
        visitorIP = ipData.ip || null;
        _trackVisitor(ipData);
      })
      .catch(function () {
        _trackVisitor({ ip: null });
      });
  }

  function _fetchIP() {
    return fetch('https://ipapi.co/json/')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) { return { ip: d.ip, city: d.city, country: d.country_name }; })
      .catch(function () {
        return fetch('https://api.ipify.org?format=json')
          .then(function (r) { return r.json(); })
          .then(function (d) { return { ip: d.ip, city: null, country: null }; })
          .catch(function () { return { ip: null, city: null, country: null }; });
      });
  }

  function _trackVisitor(ipData) {
    if (!isSupabaseConfigured()) return;
    var sb = getSupabase();
    if (!sb || !currentUser) return;

    sb.rpc('upsert_visitor', {
      p_auth_uid: currentUser.id || null,
      p_email: currentUser.email || null,
      p_name: currentUser.name || 'Guest',
      p_avatar_url: currentUser.avatar || null,
      p_ip_address: ipData.ip || null,
      p_user_agent: navigator.userAgent,
      p_city: ipData.city || null,
      p_country: ipData.country || null
    }).then(function (result) {
      if (result.error) {
        console.warn('Visitor tracking error:', result.error.message);
      } else {
        currentVisitorId = result.data;
        console.log('📊 Visitor tracked, ID:', currentVisitorId);
      }
    }).catch(function (err) {
      console.warn('Visitor tracking failed:', err);
    });
  }

  // ─────────────────────────────────────────────────────────
  // UI Helpers
  // ─────────────────────────────────────────────────────────
  function _showUserBadge(user) {
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

  function _showAuthError(msg) {
    var errEl = document.getElementById('auth-error');
    if (errEl) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      setTimeout(function () { errEl.style.display = 'none'; }, 6000);
    }
    console.error('Auth error:', msg);
  }

  // ─────────────────────────────────────────────────────────
  // Event System
  // ─────────────────────────────────────────────────────────
  function onAuth(callback) { authListeners.push(callback); }

  function notifyListeners(event, data) {
    authListeners.forEach(function (cb) {
      try { cb(event, data); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  // Auto-initialize on DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        init();
      });
    } else {
      init();
    }
  }

  // ─────────────────────────────────────────────────────────
  // Public Interface
  // ─────────────────────────────────────────────────────────
  return {
    init: init,
    continueAsGuest: continueAsGuest,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    onAuth: onAuth,
    isAdmin: function () { return isAdmin; },
    getCurrentUser: function () { return currentUser; },
    getVisitorId: function () { return currentVisitorId; },
    getVisitorIP: function () { return visitorIP; },
    fetchIPAndTrackVisitor: fetchIPAndTrackVisitor
  };
})();
