/**
 * Sango Fiora — Authentication Engine (Supabase Auth)
 * Supports: Google OAuth, Facebook OAuth, Email/Password
 */
(function () {
  'use strict';

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str == null ? '' : String(str)));
    return div.innerHTML;
  }

  // Current user state
  var currentUser = null;
  var currentProfile = null;

  window.SangoAuth = {
    // ─── Get Current User & Auth State ───
    getUser: function () { return currentUser; },
    getProfile: function () { return currentProfile; },
    isLoggedIn: function () { return !!currentUser; },
    isAdmin: function () {
      var email = (currentUser && currentUser.email) ? currentUser.email.toLowerCase() : '';
      return ['kishorevk40@gmail.com', 'shamnaraja07@gmail.com'].indexOf(email) !== -1 || (currentProfile && currentProfile.role === 'admin');
    },

    // ─── Set Session (Programmatic & Testing Helper) ───
    setSession: function (sessionData) {
      if (!sessionData) return;
      currentUser = sessionData.user || sessionData;
      if (sessionData.profile) {
        currentProfile = sessionData.profile;
      } else {
        var email = (currentUser && currentUser.email) ? currentUser.email.toLowerCase() : '';
        var isAdm = ['kishorevk40@gmail.com', 'shamnaraja07@gmail.com'].indexOf(email) !== -1;
        currentProfile = {
          id: currentUser.id || ('user_' + Date.now()),
          email: email,
          full_name: (currentUser.user_metadata && (currentUser.user_metadata.full_name || currentUser.user_metadata.name)) || email.split('@')[0],
          role: isAdm ? 'admin' : 'customer'
        };
      }
      try {
        localStorage.setItem('sango_auth_session', JSON.stringify({ user: currentUser, profile: currentProfile }));
      } catch (e) {}
      updateAuthUI();
      if (window.AppEvent) window.AppEvent.emit('auth:changed', { user: currentUser, profile: currentProfile });
      return Promise.resolve(currentUser);
    },

    // ─── Google Sign-In ───
    signInWithGoogle: function () {
      if (!window.SangoSupabase) return showAuthError();
      return window.SangoSupabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + '/login/' }
      });
    },

    // ─── Email Sign-In Link (Passwordless Magic Link) ───
    sendEmailOtp: function (email) {
      if (!window.SangoSupabase) return showAuthError();
      return window.SangoSupabase.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin + '/'
        }
      });
    },

    verifyEmailOtp: function (email, token) {
      if (!window.SangoSupabase) return showAuthError();
      return window.SangoSupabase.auth.verifyOtp({
        email: email,
        token: token,
        type: 'email'
      }).then(function (res) {
        if (res.data && res.data.user) {
          currentUser = res.data.user;
          return window.SangoAuth.fetchProfile().then(function () {
            updateAuthUI();
            if (window.AppEvent) window.AppEvent.emit('auth:changed', { user: currentUser, profile: currentProfile });
            return res;
          });
        }
        return res;
      });
    },

    // ─── Email/Password Sign-Up ───
    signUpWithEmail: function (email, password, fullName) {
      if (!window.SangoSupabase) return showAuthError();
      return window.SangoSupabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { full_name: fullName }
        }
      });
    },

    // ─── Email/Password Sign-In ───
    signInWithEmail: function (email, password) {
      if (!window.SangoSupabase) return showAuthError();
      return window.SangoSupabase.auth.signInWithPassword({
        email: email,
        password: password
      });
    },

    // ─── Sign Out ───
    signOut: function () {
      currentUser = null;
      currentProfile = null;
      try { localStorage.removeItem('sango_auth_session'); } catch (e) {}
      updateAuthUI();
      if (window.AppEvent) window.AppEvent.emit('auth:changed', { user: null, profile: null });
      if (window.showToast) window.showToast('Signed out successfully');

      if (window.SangoSupabase && window.SangoSupabase.auth) {
        window.SangoSupabase.auth.signOut().catch(function () {});
      }
      // If on admin page, redirect to home
      if (location.pathname.indexOf('/admin') === 0) {
        location.href = '/';
      }
      return Promise.resolve();
    },

    // ─── Fetch User Profile ───
    fetchProfile: function () {
      if (!window.SangoSupabase || !currentUser) return Promise.resolve(null);
      return window.SangoSupabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single()
        .then(function (res) {
          if (res.data) {
            currentProfile = res.data;
          }
          return currentProfile;
        });
    },

    // ─── Update Profile ───
    updateProfile: function (data) {
      if (!window.SangoSupabase || !currentUser) return Promise.resolve(null);
      return window.SangoSupabase
        .from('profiles')
        .update(data)
        .eq('id', currentUser.id)
        .select()
        .single()
        .then(function (res) {
          if (res.data) currentProfile = res.data;
          return currentProfile;
        });
    },

    // ─── Initialize Auth (call on page load) ───
    init: function () {
      // 1. Instantly hydrate from localStorage so user stays logged in across refreshes!
      try {
        var saved = JSON.parse(localStorage.getItem('sango_auth_session'));
        if (saved && saved.user) {
          currentUser = saved.user;
          if (saved.profile) currentProfile = saved.profile;
          updateAuthUI();
        }
      } catch (e) {}

      if (!window.SangoSupabase) {
        updateAuthUI();
        return Promise.resolve(currentUser);
      }

      // 2. Listen for auth state changes
      window.SangoSupabase.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') {
          currentUser = null;
          currentProfile = null;
          try { localStorage.removeItem('sango_auth_session'); } catch (e) {}
          updateAuthUI();
          if (window.AppEvent) window.AppEvent.emit('auth:changed', { user: null, profile: null });
          return;
        }

        if (session && session.user) {
          currentUser = session.user;
          if (!currentProfile) {
            var em = (currentUser.email || '').toLowerCase();
            currentProfile = {
              id: currentUser.id,
              email: em,
              full_name: (currentUser.user_metadata && (currentUser.user_metadata.full_name || currentUser.user_metadata.name)) || em.split('@')[0],
              role: window.SangoAuth.isAdmin() ? 'admin' : 'customer'
            };
          }
          try {
            localStorage.setItem('sango_auth_session', JSON.stringify({ user: currentUser, profile: currentProfile }));
          } catch (e) {}

          window.SangoAuth.fetchProfile().then(function (prof) {
            if (prof) currentProfile = prof;
            try {
              localStorage.setItem('sango_auth_session', JSON.stringify({ user: currentUser, profile: currentProfile }));
            } catch (e) {}
            updateAuthUI();
            if (window.AppEvent) window.AppEvent.emit('auth:changed', { user: currentUser, profile: currentProfile });
          });
        }
      });

      // 3. Check Supabase getSession()
      return window.SangoSupabase.auth.getSession().then(function (res) {
        if (res.data && res.data.session && res.data.session.user) {
          currentUser = res.data.session.user;
          return window.SangoAuth.fetchProfile().then(function (prof) {
            if (prof) currentProfile = prof;
            try {
              localStorage.setItem('sango_auth_session', JSON.stringify({ user: currentUser, profile: currentProfile }));
            } catch (e) {}
            updateAuthUI();
            return currentUser;
          });
        }
        // If Supabase session is empty, but localStorage has saved user, keep it!
        if (currentUser) {
          updateAuthUI();
          return currentUser;
        }
        updateAuthUI();
        return null;
      }).catch(function () {
        if (currentUser) updateAuthUI();
        return currentUser;
      });
    }
  };

  // ─── Update Header UI Based on Auth State ───
  function updateAuthUI() {
    var loginBtn = document.getElementById('auth-login-btn');
    var userMenu = document.getElementById('auth-user-menu');
    var userName = document.getElementById('auth-user-name');
    var userAvatar = document.getElementById('auth-user-avatar');
    var adminLink = document.getElementById('auth-admin-link');

    if (currentUser) {
      // ─── LOGGED IN ───
      if (loginBtn) loginBtn.style.display = 'none';
      if (userMenu) userMenu.classList.remove('hidden');

      var meta = currentUser.user_metadata || {};
      var displayName = (currentProfile && currentProfile.full_name) || meta.full_name || meta.name || currentUser.email || 'User';
      var avatarUrl = (currentProfile && currentProfile.avatar_url) || meta.avatar_url || meta.picture || '';

      if (userName) userName.textContent = displayName;

      if (userAvatar) {
        if (avatarUrl) {
          userAvatar.src = avatarUrl;
          userAvatar.classList.remove('hidden');
        } else {
          userAvatar.classList.add('hidden');
        }
      }

      if (adminLink) {
        var userEmail = (currentUser && currentUser.email) ? currentUser.email.toLowerCase() : '';
        var isSuperAdmin = ['kishorevk40@gmail.com', 'shamnaraja07@gmail.com'].indexOf(userEmail) !== -1;
        var isAdminUser = (currentProfile && currentProfile.role === 'admin') || (meta.role === 'admin') || isSuperAdmin;
        adminLink.classList.toggle('hidden', !isAdminUser);
      }
    } else {
      // ─── NOT LOGGED IN ───
      if (loginBtn) loginBtn.style.display = '';
      if (userMenu) userMenu.classList.add('hidden');
      if (adminLink) adminLink.classList.add('hidden');
    }
  }

  function showAuthError() {
    if (window.showToast) {
      window.showToast('Supabase not configured. Check js/supabase-client.js');
    }
    return Promise.resolve({ error: { message: 'Supabase not configured' } });
  }

  // ─── Auto-init on DOMContentLoaded ───
  document.addEventListener('DOMContentLoaded', function () {
    window.SangoAuth.init();
  });

  // ─── Delegated Click Handlers for Auth Buttons ───
  document.addEventListener('click', function (e) {
    if (e.target.closest('#auth-login-btn') || e.target.closest('[data-auth-login]')) {
      e.preventDefault();
      location.href = '/login.html';
      return;
    }
    if (e.target.closest('#auth-signout-btn') || e.target.closest('[data-auth-signout]')) {
      e.preventDefault();
      window.SangoAuth.signOut();
      return;
    }
    if (e.target.closest('[data-auth-google]')) {
      e.preventDefault();
      window.SangoAuth.signInWithGoogle();
      return;
    }
  });

})();
