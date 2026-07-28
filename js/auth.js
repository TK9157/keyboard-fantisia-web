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
    var isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
    var isPlayerPage = window.location.pathname.endsWith('player.html');
    
    // Supabase fallback
    if (!isSupabaseConfigured()) {
      console.warn('⚠️ Supabase not configured — auth features disabled');
      if (isLoginPage) window.location.href = 'player.html';
      return;
    }

    var sb = getSupabase();
    if (!sb) { 
      if (isLoginPage) window.location.href = 'player.html';
      return; 
    }

    var isGuest = sessionStorage.getItem('kb_guest') === 'true';

    // Check existing session
    sb.auth.getSession().then(function(result) {
      if (result.data.session) {
        if (isLoginPage) {
          window.location.href = 'player.html';
        } else {
          handleSignedIn(result.data.session);
        }
      } else if (isGuest) {
        if (isLoginPage) {
          window.location.href = 'player.html';
        } else {
          currentUser = { id: null, email: null, name: 'Guest', avatar: '' };
          fetchIPAndTrackVisitor();
          notifyListeners('guest', currentUser);
        }
      } else {
        if (isPlayerPage) {
          window.location.href = 'index.html';
        }
      }
    }).catch(function(err) {
      console.error('Session check failed:', err);
      if (isPlayerPage) window.location.href = 'index.html';
    });

    // Listen for auth state changes
    sb.auth.onAuthStateChange(function(event, session) {
      console.log('🔐 Auth event:', event);
      if (event === 'SIGNED_IN' && session) {
        if (isLoginPage) {
          window.location.href = 'player.html';
        } else {
          handleSignedIn(session);
        }
      } else if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('kb_guest');
        if (!isLoginPage) window.location.href = 'index.html';
      }
    });
  }

  // ── Google Sign-In ──

  function signInWithGoogle() {
    var sb = getSupabase();
    if (!sb) return;

    var btnText = document.getElementById('google-btn-text');
    if (btnText) btnText.textContent = 'Connecting...';

    var redirectUrl = window.location.origin + window.location.pathname;
    redirectUrl = redirectUrl.replace('index.html', 'player.html');
    if (!redirectUrl.endsWith('player.html')) {
        if (redirectUrl.endsWith('/')) redirectUrl += 'player.html';
        else redirectUrl += '/player.html';
    }

    sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    }).then(function(result) {
      if (result.error) {
        console.error('Google sign-in error:', result.error.message);
        if (btnText) btnText.textContent = 'Sign in with Google';
        showAuthError('Sign-in failed. Please try again.');
      }
    }).catch(function(err) {
      console.error('Sign-in exception:', err);
      if (btnText) btnText.textContent = 'Sign in with Google';
    });
  }

  function signOut() {
    sessionStorage.removeItem('kb_guest');
    var sb = getSupabase();
    if (sb) {
      sb.auth.signOut().then(function() {
        window.location.href = 'index.html';
      });
    } else {
      window.location.href = 'index.html';
    }
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
          window.location.href = 'index.html';
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

    showUserBadge(currentUser);
    fetchIPAndTrackVisitor();
    notifyListeners('signed_in', currentUser);
  }

  // ── Continue as Guest ──

  function continueAsGuest() {
    sessionStorage.setItem('kb_guest', 'true');
    window.location.href = 'player.html';
  }

  // ── IP Address Detection ──

  function fetchIPAndTrackVisitor() {
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
    return fetch('https://ipapi.co/json/')
      .then(function(r) { 
        if (!r.ok) throw new Error('ipapi failed');
        return r.json(); 
      })
      .then(function(data) {
        return { ip: data.ip, city: data.city, country: data.country_name };
      })
      .catch(function() {
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
