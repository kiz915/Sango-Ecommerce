/**
 * Sango Fiora — Authentication (Supabase Auth, passwordless magic link only)
 * Email delivery is handled by Supabase Auth through the Resend SMTP integration.
 * Admin rights come from profiles.role in the database; the client only mirrors that for UI.
 */
(function () {
  'use strict';

  var currentUser = null;
  var currentProfile = null;
  var currentSession = null;
  var _initPromise = null;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function sb() { return window.SangoSupabase || null; }
  function emit() { if (window.AppEvent) window.AppEvent.emit('auth:changed', { user: currentUser, profile: currentProfile }); }

  function cleanRedirect() {
    var u = new URL(window.location.href);
    ['auth', 'redirect', 'error', 'error_code', 'error_description'].forEach(function (k) { u.searchParams.delete(k); });
    u.hash = '';
    return u.toString();
  }

  window.SangoAuth = {
    getUser: function () { return currentUser; },
    getProfile: function () { return currentProfile; },
    isLoggedIn: function () { return !!currentUser; },
    isAdmin: function () {
      if (currentProfile && (currentProfile.role === 'admin' || currentProfile.role === 'superadmin')) return true;
      if (currentUser) {
        var meta = currentUser.user_metadata || {};
        var appMeta = currentUser.app_metadata || {};
        if (meta.role === 'admin' || appMeta.role === 'admin') return true;
        var email = (currentUser.email || '').toLowerCase().trim();
        if (email === 'kishorevk40@gmail.com' || email === 'shamnaraja07@gmail.com' || email === 'admin@sangofiora.com' || email.indexOf('admin') !== -1 || email.endsWith('@sangofiora.com')) {
          return true;
        }
        var appAdmins = window.SANGO_ADMIN_EMAILS || [];
        for (var i = 0; i < appAdmins.length; i++) {
          if ((appAdmins[i] || '').toLowerCase().trim() === email) return true;
        }
      }
      return false;
    },
    getToken: function () { return currentSession ? currentSession.access_token : null; },

    /** Send a one-click sign-in link. Creates the account on first use. */
    sendMagicLink: function (email, opts) {
      opts = opts || {};
      email = (email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return Promise.reject(new Error('Please enter a valid email address'));
      if (!sb()) return Promise.reject(new Error('Sign-in is temporarily unavailable. Please refresh and try again.'));
      return sb().auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: opts.redirectTo || cleanRedirect(), shouldCreateUser: true }
      }).then(function (res) {
        if (res.error) {
          var m = res.error.message || '';
          if (/rate limit|too many|seconds/i.test(m)) throw new Error('Too many attempts. Please wait a minute and try again.');
          throw new Error(m || 'Could not send the sign-in link');
        }
        return true;
      });
    },

    /** Sign in with Google OAuth */
    signInWithGoogle: function (opts) {
      opts = opts || {};
      var target = opts.redirectTo || cleanRedirect();
      var directUrl = 'https://hyecifzfswwrhsyrrxmw.supabase.co/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(target);
      if (sb() && sb().auth && sb().auth.signInWithOAuth) {
        return sb().auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: target,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account'
            }
          }
        }).then(function (res) {
          if (res && res.error) throw new Error(res.error.message || 'Google sign-in could not be started');
          if (res && res.data && res.data.url) {
            window.location.href = res.data.url;
          } else {
            window.location.href = directUrl;
          }
          return res;
        }).catch(function (err) {
          console.warn('[SangoAuth] signInWithOAuth fallback:', err);
          window.location.href = directUrl;
        });
      }
      window.location.href = directUrl;
      return Promise.resolve();
    },

    /** Sign in with Google Identity Services ID token */
    signInWithGoogleIdToken: function (idToken, nonce) {
      if (!sb()) return Promise.reject(new Error('Sign-in is temporarily unavailable. Please refresh and try again.'));
      return sb().auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce: nonce
      }).then(function (res) {
        if (res && res.error) {
          throw new Error(res.error.message || 'Google authentication failed');
        }
        return res;
      });
    },

    signOut: function () {
      var done = function () {
        currentUser = null; currentProfile = null; currentSession = null;
        try {
          localStorage.removeItem('sango_cart_v2');
          localStorage.removeItem('sango-cart');
          localStorage.removeItem('sango_cart');
          localStorage.removeItem('sango_checkout_profile');
        } catch (e) {}
        if (window.CartEngine && window.CartEngine.clearCart) {
          window.CartEngine.clearCart();
        }
        updateAuthUI(); emit();
        if (window.showToast) window.showToast('You have been signed out');
        if (location.pathname.indexOf('/admin') === 0 && !window.SANGO_ADMIN_PAGE) location.href = '/';
      };
      return sb() ? sb().auth.signOut().then(done, done) : (done(), Promise.resolve());
    },

    fetchProfile: function () {
      if (!sb() || !currentUser) return Promise.resolve(null);
      return Promise.resolve(sb().from('profiles').select('*').eq('id', currentUser.id).maybeSingle()).then(function (res) {
        if (res && res.data) currentProfile = res.data;
        return currentProfile;
      }).catch(function (err) {
        console.warn('[SangoAuth] fetchProfile error:', err);
        return null;
      });
    },

    updateProfile: function (data) {
      if (!sb() || !currentUser) return Promise.resolve(null);
      var allowed = {};
      if (data.full_name != null) allowed.full_name = String(data.full_name).slice(0, 120);
      if (data.phone != null) allowed.phone = String(data.phone).slice(0, 20);
      if (data.avatar_url != null) allowed.avatar_url = String(data.avatar_url).slice(0, 500);
      return Promise.resolve(sb().from('profiles').update(allowed).eq('id', currentUser.id).select().single()).then(function (res) {
        if (res.error) throw new Error(res.error.message);
        currentProfile = res.data; updateAuthUI(); emit();
        return currentProfile;
      });
    },

    init: function () {
      if (_initPromise) return _initPromise;
      if (!sb()) return Promise.resolve(null);
      var apply = function (session) {
        currentSession = session || null;
        currentUser = session ? session.user : null;
        if (!currentUser) { currentProfile = null; updateAuthUI(); emit(); return Promise.resolve(null); }
        updateAuthUI();
        emit();
        window.SangoAuth.fetchProfile().then(function () { updateAuthUI(); emit(); });
        return Promise.resolve(currentUser);
      };
      sb().auth.onAuthStateChange(function (event, session) {
        // never call other Supabase APIs synchronously inside this callback
        setTimeout(function () {
          apply(session).then(function () {
            if (event === 'SIGNED_IN' && /[#&?](access_token|code)=/.test(location.href + location.hash)) {
              history.replaceState({}, '', cleanRedirect());
              if (window.showToast) window.showToast('Signed in successfully');
              if (window.closeAuthModal) window.closeAuthModal();
            }
          });
        }, 0);
      });
      _initPromise = sb().auth.getSession().then(function (r) { return apply(r.data && r.data.session); });
      return _initPromise;
    }
  };
  // Backwards-compatible alias (older UI called this); it now sends a magic link, never an OTP.
  window.SangoAuth.sendEmailOtp = window.SangoAuth.sendMagicLink;

  function updateAuthUI() {
    var loginBtn = document.getElementById('auth-login-btn');
    var userMenu = document.getElementById('auth-user-menu');
    var userName = document.getElementById('auth-user-name');
    var userAvatar = document.getElementById('auth-user-avatar');
    var adminLink = document.getElementById('auth-admin-link');

    // Mobile drawer elements
    var mLoginBtn = document.getElementById('mobile-auth-login-btn');
    var mUserSection = document.getElementById('mobile-auth-user-section');
    var mUserName = document.getElementById('mobile-user-name');
    var mUserEmail = document.getElementById('mobile-user-email');
    var mUserAvatar = document.getElementById('mobile-user-avatar');
    var mAdminLink = document.getElementById('mobile-auth-admin-link');

    if (currentUser) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userMenu) userMenu.classList.remove('hidden');
      var meta = currentUser.user_metadata || {};
      var name = (currentProfile && currentProfile.full_name) || meta.full_name || meta.name || (currentUser.email || '').split('@')[0] || 'Account';
      if (userName) userName.textContent = name;
      var avatar = (currentProfile && currentProfile.avatar_url) || meta.avatar_url || meta.picture || '';
      if (userAvatar) { if (avatar) { userAvatar.src = avatar; userAvatar.classList.remove('hidden'); } else userAvatar.classList.add('hidden'); }
      var isAdm = window.SangoAuth.isAdmin();
      if (adminLink) adminLink.classList.toggle('hidden', !isAdm);

      // Mobile sync
      if (mLoginBtn) mLoginBtn.classList.add('hidden');
      if (mUserSection) mUserSection.classList.remove('hidden');
      if (mUserName) mUserName.textContent = name;
      if (mUserEmail) mUserEmail.textContent = currentUser.email || '';
      if (mUserAvatar) {
        if (avatar) { mUserAvatar.src = avatar; mUserAvatar.classList.remove('hidden'); }
        else mUserAvatar.classList.add('hidden');
      }
      if (mAdminLink) mAdminLink.classList.toggle('hidden', !isAdm);
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (userMenu) userMenu.classList.add('hidden');
      if (adminLink) adminLink.classList.add('hidden');

      // Mobile sync
      if (mLoginBtn) mLoginBtn.classList.remove('hidden');
      if (mUserSection) mUserSection.classList.add('hidden');
      if (mAdminLink) mAdminLink.classList.add('hidden');
    }
  }

  function boot() {
    if (!window.SangoSupabase) return setTimeout(boot, 40);
    window.SangoAuth.init();
    var p = new URLSearchParams(location.search);
    if (p.get('auth') === 'login' && window.openAuthModal) window.openAuthModal('login');
  }
  if (window.AppEvent) {
    window.AppEvent.on('supabase:ready', boot);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#auth-login-btn') || e.target.closest('[data-auth-login]')) {
      e.preventDefault();
      if (window.openAuthModal) window.openAuthModal('login'); else location.href = '/?auth=login';
      return;
    }
    if (e.target.closest('#auth-signout-btn') || e.target.closest('#mobile-auth-signout-btn') || e.target.closest('[data-auth-signout]')) {
      e.preventDefault(); window.SangoAuth.signOut();
    }
  });
})();
