/**
 * LinkUp Social Network — Client-Side Application
 * Polished Facebook-inspired interactions, real-time social actions,
 * case-insensitive login/signup with in-modal error feedback,
 * clean profile view with zero artificial labels,
 * and dedicated Creator Studio & Security Dev Tools modal.
 */

// Application State
const state = {
  currentUser: null,
  currentFilter: 'for-you',
  followingIds: new Set(),
  activeStoryTimer: null,
  toastTimeout: null,
  selectedPostFile: null,
  lastSearch: '',
  adminUsers: []
};

// DOM Selector Helper
const $ = (id) => document.getElementById(id);

// -------------------------------------------------------------
// Utilities & Helpers
// -------------------------------------------------------------
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = typeof data === 'object' && data.error ? data.error : (typeof data === 'string' ? data : 'API Request Failed');
    throw new Error(errorMsg);
  }
  return data;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
}

function timeAgo(dateString) {
  if (!dateString) return 'recently';
  const now = new Date();
  const past = new Date(dateString.replace(' ', 'T') + 'Z');
  const seconds = Math.max(1, Math.floor((now - past) / 1000));

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// -------------------------------------------------------------
// Authentication & Session Synchronization
// -------------------------------------------------------------
async function syncSession() {
  try {
    const data = await api('/api/auth/me');
    state.currentUser = data.user;
  } catch {
    state.currentUser = null;
  }

  const guestActions = $('topbar-guest-actions');
  const userActions = $('topbar-user-actions');
  const composerCard = $('composer-card');
  const guestCard = $('guest-welcome-card');
  const sidebarUser = $('sidebar-user-section');

  if (state.currentUser) {
    const u = state.currentUser;
    if (guestActions) guestActions.classList.add('hidden');
    if (userActions) userActions.classList.remove('hidden');
    if (composerCard) composerCard.classList.remove('hidden');
    if (guestCard) guestCard.classList.add('hidden');

    $('header-avatar-img').src = u.avatar_url || '/assets/alice-profile.png';
    $('dropdown-avatar-img').src = u.avatar_url || '/assets/alice-profile.png';
    $('dropdown-user-name').textContent = u.display_name;
    $('dropdown-user-handle').textContent = `@${u.username} · View Profile`;

    sidebarUser.innerHTML = `
      <button class="user-profile-tile" data-action="my-profile" title="View your profile">
        <img class="tile-avatar" src="${escapeHtml(u.avatar_url || '/assets/alice-profile.png')}" alt="">
        <div class="tile-info">
          <strong>${escapeHtml(u.display_name)}</strong>
          <span>@${escapeHtml(u.username)}</span>
        </div>
      </button>
    `;

    $('composer-avatar').src = u.avatar_url || '/assets/alice-profile.png';
    $('story-creator-preview').src = u.avatar_url || '/assets/alice-profile.png';
    $('post-body').placeholder = `What's on your mind, ${u.display_name.split(' ')[0]}?`;
    if (u.role === 'admin') {
      try { state.adminUsers = await api('/api/admin/users'); } catch { state.adminUsers = []; }
    } else state.adminUsers = [];
  } else {
    // Guest state
    if (guestActions) guestActions.classList.remove('hidden');
    if (userActions) userActions.classList.add('hidden');
    if (composerCard) composerCard.classList.add('hidden');
    if (guestCard) guestCard.classList.remove('hidden');

    sidebarUser.innerHTML = `
      <div class="widget-card" style="padding:14px; text-align:center; background:#fff; border:1px solid #e4e6eb; border-radius:8px;">
        <p style="font-size:13px; font-weight:700; color:#050505; margin-bottom:4px;">Welcome to LinkUp</p>
        <p style="font-size:12px; color:#65676b; margin-bottom:10px;">Sign in or create an account to share updates.</p>
        <button class="btn-primary" style="width:100%; font-size:12px; padding:7px; margin-bottom:6px;" data-action="open-login">Log In</button>
        <button class="btn-green-large" style="width:100%; font-size:12px; padding:7px;" data-action="open-signup">Sign Up</button>
      </div>
    `;

    $('story-creator-preview').src = '/assets/alice-profile.png';
  }

  // Fetch social follow graph
  try {
    const social = await api('/api/social/state');
    state.followingIds = new Set(social.followingIds || []);
  } catch {
    state.followingIds = new Set();
  }

  loadSuggestedFriends();
}

// -------------------------------------------------------------
// Feed & Post Rendering
// -------------------------------------------------------------
async function loadFeed() {
  const feedList = $('feed-list');
  try {
    const posts = await api(`/api/feed?mode=${encodeURIComponent(state.currentFilter)}`);

    if (!posts || posts.length === 0) {
      const msg = state.currentFilter === 'saved'
        ? 'No saved posts yet. Click "Save" on any post in your feed to bookmark it here.'
        : state.currentFilter === 'following'
        ? 'No updates from people you follow. Explore suggestions to follow new members.'
        : 'No posts available. Be the first to share an update!';
      feedList.innerHTML = `<div class="widget-card" style="text-align:center; padding:30px; color:#65676b;">${msg}</div>`;
      return;
    }

    feedList.innerHTML = posts.map(renderPostCard).join('');
  } catch (err) {
    feedList.innerHTML = `<div class="widget-card" style="color:#fa383e; padding:20px;">Could not load feed: ${escapeHtml(err.message)}</div>`;
  }
}

function renderPostCard(post) {
  const isLiked = Boolean(post.liked);
  const isSaved = Boolean(post.saved);
  const roleClass = post.role === 'admin' ? 'role-admin' : 'role-member';
  const roleLabel = post.role === 'admin' ? 'Community Host' : 'Member';

  // NOTE: Stored XSS practice: post.body is rendered directly without escaping.
  const bodyHtml = post.body ? String(post.body).replace(/\n/g, '<br>') : '';

  return `
    <article class="post-card" id="post-${post.id}" data-post-id="${post.id}">
      <div class="post-header-row">
        <img class="post-author-avatar" src="${escapeHtml(post.avatar_url || '/assets/workspace-morning.png')}" alt="${escapeHtml(post.display_name)}" data-action="view-profile" data-user-id="${post.author_id}">
        <div class="post-meta-col">
          <button class="post-author-name-btn" data-action="view-profile" data-user-id="${post.author_id}">
            ${escapeHtml(post.display_name)}
            <span class="role-tag ${roleClass}">${roleLabel}</span>
          </button>
          <span class="post-timestamp">${timeAgo(post.created_at)}${post.location ? ` · 📍 ${escapeHtml(post.location)}` : ''}</span>
        </div>
        ${state.currentUser?.role === 'admin' ? `<button class="post-menu-btn admin-delete-post" data-action="admin-delete-post" data-post-id="${post.id}" title="Delete post">Delete</button>` : '<button class="post-menu-btn" data-action="post-options" title="Post options">···</button>'}
      </div>

      <!-- Intentionally unescaped body for Stored XSS training -->
      <div class="post-body-content">${bodyHtml}</div>

      ${post.media_url ? `
        <div class="post-media-container">
          <img class="post-media-img" src="${escapeHtml(post.media_url)}" alt="Post attachment" loading="lazy">
        </div>
      ` : ''}

      ${post.link ? `
        <div class="post-link-preview">
          <div class="link-preview-bar">🔗 <a href="${escapeHtml(post.link)}" target="_blank" rel="noopener">${escapeHtml(post.link)}</a></div>
        </div>
      ` : ''}

      <div class="post-stats-row">
        <div class="likes-counter">
          <span class="like-badge-mini">👍</span>
          <span id="likes-count-${post.id}">${post.likes}</span> likes
        </div>
        <div>
          <span>${post.comment_count} comments</span>
        </div>
      </div>

      <div class="post-actions-toolbar">
        <button class="btn-post-action ${isLiked ? 'liked' : ''}" data-action="toggle-like" data-post-id="${post.id}">
          <span>${isLiked ? '👍 Liked' : '👍 Like'}</span>
        </button>
        <button class="btn-post-action" data-action="toggle-comments" data-post-id="${post.id}">
          <span>💬 Comment</span>
        </button>
        <button class="btn-post-action ${isSaved ? 'saved' : ''}" data-action="toggle-save" data-post-id="${post.id}">
          <span>${isSaved ? '🔖 Saved' : '🔖 Save'}</span>
        </button>
        <button class="btn-post-action" data-action="share-post" data-post-id="${post.id}">
          <span>↗ Share</span>
        </button>
      </div>

      ${state.currentUser?.role === 'admin' ? `
        <div class="admin-tools">
          <strong>Admin tools</strong>
          <div class="admin-tool-row">
            <select aria-label="Choose account for simulated activity" id="admin-user-${post.id}">
              ${state.adminUsers.map(user => `<option value="${user.id}">${escapeHtml(user.display_name)} (@${escapeHtml(user.username)})</option>`).join('')}
            </select>
            <button type="button" data-action="admin-add-like" data-post-id="${post.id}">Add like</button>
          </div>
          <form class="admin-comment-form" data-post-id="${post.id}">
            <input name="adminCommentBody" maxlength="1000" placeholder="Add a virtual comment as this account" required>
            <button type="submit">Add comment</button>
          </form>
        </div>
      ` : ''}

      <div id="comments-container-${post.id}" class="post-comments-container hidden"></div>
    </article>
  `;
}

// -------------------------------------------------------------
// Likes, Saves, Comments, and Sharing
// -------------------------------------------------------------
async function toggleLike(postId) {
  if (!state.currentUser) {
    showToast('Please log in to like posts.');
    openLoginModal();
    return;
  }
  try {
    const data = await api(`/api/posts/${postId}/like`, { method: 'POST' });
    const countEl = $(`likes-count-${postId}`);
    if (countEl) countEl.textContent = data.likes;

    const btn = document.querySelector(`.btn-post-action[data-action="toggle-like"][data-post-id="${postId}"]`);
    if (btn) {
      btn.classList.toggle('liked', data.liked);
      btn.innerHTML = `<span>${data.liked ? '👍 Liked' : '👍 Like'}</span>`;
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function toggleSave(postId) {
  if (!state.currentUser) {
    showToast('Please log in to bookmark posts.');
    openLoginModal();
    return;
  }
  try {
    const data = await api(`/api/posts/${postId}/save`, { method: 'POST' });
    const btn = document.querySelector(`.btn-post-action[data-action="toggle-save"][data-post-id="${postId}"]`);
    if (btn) {
      btn.classList.toggle('saved', data.saved);
      btn.innerHTML = `<span>${data.saved ? '🔖 Saved' : '🔖 Save'}</span>`;
    }
    showToast(data.saved ? 'Post saved to bookmarks.' : 'Post removed from saved bookmarks.');
    if (state.currentFilter === 'saved') loadFeed();
  } catch (err) {
    showToast(err.message);
  }
}

async function toggleComments(postId) {
  const container = $(`comments-container-${postId}`);
  if (!container) return;

  if (!container.classList.contains('hidden')) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = '<div style="font-size:12px; color:#65676b;">Loading comments...</div>';

  try {
    const comments = await api(`/api/posts/${postId}/comments`);
    renderComments(postId, comments);
  } catch (err) {
    container.innerHTML = `<div style="color:#fa383e; font-size:12px;">Failed to load comments: ${escapeHtml(err.message)}</div>`;
  }
}

function renderComments(postId, comments) {
  const container = $(`comments-container-${postId}`);

  const listHtml = comments.map(c => `
    <div class="comment-bubble-row">
      <img class="comment-avatar" src="${escapeHtml(c.avatar_url || '/assets/cafe-friends.png')}" alt="">
      <div class="comment-bubble">
        <strong class="comment-author-name">${escapeHtml(c.author)}${c.is_virtual ? ' <span class="virtual-comment-label">· virtual</span>' : ''}</strong>
        <!-- Stored XSS practice: c.body rendered directly -->
        <div>${c.body}</div>
      </div>
      ${state.currentUser?.role === 'admin' ? `<button class="admin-delete-comment" type="button" data-action="admin-delete-comment" data-comment-id="${c.id}" data-post-id="${postId}" aria-label="Delete comment">Delete</button>` : ''}
    </div>
  `).join('');

  container.innerHTML = `
    ${listHtml}
    <form class="comment-composer-form" data-post-id="${postId}">
      <input type="text" name="commentBody" placeholder="Write a comment..." autocomplete="off" required>
      <button type="submit">Reply</button>
    </form>
  `;
}

async function submitComment(postId, body) {
  try {
    await api(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });
    const comments = await api(`/api/posts/${postId}/comments`);
    renderComments(postId, comments);
    showToast('Comment posted.');
  } catch (err) {
    showToast(err.message);
  }
}

async function adminAddLike(postId) {
  const userId = $(`admin-user-${postId}`)?.value;
  try {
    const data = await api(`/api/admin/posts/${postId}/likes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
    $(`likes-count-${postId}`).textContent = data.likes;
    showToast('Like added for that account.');
  } catch (err) { showToast(err.message); }
}

async function adminAddComment(postId, body) {
  const userId = $(`admin-user-${postId}`)?.value;
  try {
    await api(`/api/admin/posts/${postId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, body }) });
    const comments = await api(`/api/posts/${postId}/comments`);
    renderComments(postId, comments);
    const count = $(`post-${postId}`)?.querySelector('.post-stats-row > div:last-child span');
    if (count) count.textContent = `${comments.length} comments`;
    showToast('Virtual comment added.');
  } catch (err) { showToast(err.message); }
}

async function adminDeletePost(postId) {
  if (!confirm('Delete this post and its comments, likes, and saves?')) return;
  try {
    await api(`/api/admin/posts/${postId}`, { method: 'DELETE' });
    $(`post-${postId}`)?.remove();
    showToast('Post deleted.');
  } catch (err) { showToast(err.message); }
}

async function adminDeleteComment(postId, commentId) {
  try {
    await api(`/api/admin/comments/${commentId}`, { method: 'DELETE' });
    const comments = await api(`/api/posts/${postId}/comments`);
    renderComments(postId, comments);
    const count = $(`post-${postId}`)?.querySelector('.post-stats-row > div:last-child span');
    if (count) count.textContent = `${comments.length} comments`;
    showToast('Comment deleted.');
  } catch (err) { showToast(err.message); }
}

// -------------------------------------------------------------
// 24-Hour Stories Carousel & Viewer
// -------------------------------------------------------------
async function loadStories() {
  const stream = $('story-list');
  try {
    const stories = await api('/api/stories');
    if (!stories || stories.length === 0) {
      stream.innerHTML = '';
      return;
    }

    stream.innerHTML = stories.map(s => `
      <div class="story-card" data-action="view-story" data-story-id="${s.id}" data-caption="${escapeHtml(s.body)}" data-media="${escapeHtml(s.media_url || '/assets/alexandria-evening.png')}" data-author="${escapeHtml(s.display_name)}" data-avatar="${escapeHtml(s.avatar_url || '/assets/alice-profile.png')}">
        <img class="story-bg-img" src="${escapeHtml(s.media_url || '/assets/alexandria-evening.png')}" alt="Story background">
        <div class="story-avatar-badge">
          <img src="${escapeHtml(s.avatar_url || '/assets/alice-profile.png')}" alt="${escapeHtml(s.display_name)}">
        </div>
        <span class="story-author-name">${escapeHtml(s.display_name.split(' ')[0])}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Could not load stories:', err);
  }
}

function openStoryViewer(data) {
  $('story-view-avatar').src = data.avatar;
  $('story-view-name').textContent = data.author;
  $('story-view-img').src = data.media;
  $('story-view-caption').textContent = data.caption;

  const modal = $('story-viewer-dialog');
  modal.showModal();

  const bar = $('story-progress-fill');
  bar.style.width = '0%';
  let progress = 0;
  clearInterval(state.activeStoryTimer);
  state.activeStoryTimer = setInterval(() => {
    progress += 2;
    bar.style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(state.activeStoryTimer);
      modal.close();
    }
  }, 100);
}

function closeStoryViewer() {
  clearInterval(state.activeStoryTimer);
  $('story-viewer-dialog').close();
}

// -------------------------------------------------------------
// Suggested Friends & Follow System
// -------------------------------------------------------------
async function loadSuggestedFriends() {
  const list = $('suggested-users-list');
  try {
    const users = await api('/api/users');
    const myId = state.currentUser ? state.currentUser.id : 0;

    const suggestions = users.filter(u => u.id !== myId).slice(0, 5);

    list.innerHTML = suggestions.map(u => {
      const isFollowing = state.followingIds.has(u.id);
      return `
        <div class="suggested-user-row">
          <img class="suggested-user-avatar" src="${escapeHtml(u.avatar_url || '/assets/cafe-friends.png')}" alt="${escapeHtml(u.display_name)}" data-action="view-profile" data-user-id="${u.id}">
          <div class="suggested-user-info">
            <span class="suggested-user-name" data-action="view-profile" data-user-id="${u.id}">${escapeHtml(u.display_name)}</span>
            <span class="suggested-user-meta">${escapeHtml(u.role === 'admin' ? 'Community Host' : (u.location || 'Member'))}</span>
          </div>
          <button class="btn-follow-toggle ${isFollowing ? 'following' : ''}" data-action="toggle-follow" data-user-id="${u.id}">
            ${isFollowing ? '✓ Following' : '+ Follow'}
          </button>
        </div>
      `;
    }).join('');
  } catch (err) {
    list.innerHTML = `<small style="color:#fa383e;">Could not load suggestions</small>`;
  }
}

async function toggleFollow(userId) {
  if (!state.currentUser) {
    showToast('Please log in to follow community members.');
    openLoginModal();
    return;
  }
  try {
    const data = await api(`/api/users/${userId}/follow`, { method: 'POST' });
    if (data.following) {
      state.followingIds.add(Number(userId));
      showToast(`You are now following ${data.targetName}.`);
    } else {
      state.followingIds.delete(Number(userId));
      showToast(`Unfollowed ${data.targetName}.`);
    }
    loadSuggestedFriends();
    if (state.currentFilter === 'following') loadFeed();
  } catch (err) {
    showToast(err.message);
  }
}

// -------------------------------------------------------------
// Profile & Timeline Modal (Clean Real-App Social Layout)
// NO artificial vulnerability labels are injected into the UI.
// -------------------------------------------------------------
async function openProfile(userId) {
  try {
    const [profile, posts] = await Promise.all([
      api(`/api/users/${encodeURIComponent(userId)}`),
      api(`/api/users/${encodeURIComponent(userId)}/posts`)
    ]);

    const isOwn = state.currentUser && state.currentUser.id === profile.id;

    $('profile-banner').style.backgroundImage = `url('${profile.cover_url || '/assets/alexandria-evening.png'}')`;
    $('profile-avatar-img').src = profile.avatar_url || '/assets/alice-profile.png';
    $('profile-display-name').textContent = profile.display_name;
    $('profile-role-badge').textContent = profile.role === 'admin' ? 'Community Host' : 'Member';
    $('profile-role-badge').className = `role-badge ${profile.role === 'admin' ? 'role-admin' : 'role-member'}`;
    $('profile-username').textContent = `@${profile.username}`;
    $('profile-counts').textContent = `${profile.post_count || 0} posts · ${profile.follower_count || 0} followers · ${profile.following_count || 0} following`;

    // Bio rendered cleanly without any artificial note tags
    $('profile-bio').textContent = profile.bio || 'No bio shared yet.';
    $('profile-location').textContent = `📍 ${profile.location || 'Alexandria, Egypt'}`;
    $('profile-email').textContent = `✉️ ${profile.email}`;
    $('profile-website').textContent = profile.website ? `🌐 ${profile.website}` : '';

    const actionsArea = $('profile-actions-area');
    if (isOwn) {
      actionsArea.innerHTML = `<button class="btn-primary" data-action="toggle-edit-profile">Edit Profile</button>`;
    } else {
      const isFollowing = state.followingIds.has(profile.id);
      actionsArea.innerHTML = `
        <button class="btn-follow-toggle ${isFollowing ? 'following' : ''}" data-action="toggle-follow" data-user-id="${profile.id}">
          ${isFollowing ? '✓ Following' : '+ Follow'}
        </button>
      `;
    }

    // Populate timeline posts
    const postsList = $('profile-posts-list');
    if (!posts || posts.length === 0) {
      postsList.innerHTML = `<p style="color:#65676b; text-align:center; padding:30px 20px;">No posts on timeline yet.</p>`;
    } else {
      postsList.innerHTML = posts.map(renderPostCard).join('');
    }

    $('profile-edit-box').classList.add('hidden');
    $('profile-dialog').showModal();
  } catch (err) {
    showToast(`Could not open profile: ${err.message}`);
  }
}

// -------------------------------------------------------------
// Search (SQL Injection & Reflected XSS)
// -------------------------------------------------------------
async function performSearch(query) {
  state.lastSearch = query;
  const popover = $('search-results');
  popover.classList.remove('hidden');

  if (!query.trim()) {
    popover.innerHTML = '<div style="color:#65676b; font-size:12px;">Type a name, handle, or topic to search...</div>';
    return;
  }

  try {
    const data = await api(`/api/search?q=${encodeURIComponent(query)}`);

    let html = '';

    if (data.users && data.users.length > 0) {
      html += `
        <div class="search-result-group">
          <h5>People (${data.users.length})</h5>
          ${data.users.map(u => `
            <button class="search-user-item" data-action="view-profile" data-user-id="${u.id}">
              <img src="${escapeHtml(u.avatar_url || '/assets/cafe-friends.png')}" alt="">
              <div>
                <strong>${escapeHtml(u.display_name)}</strong>
                <span style="font-size:11px; color:#65676b;">@${escapeHtml(u.username)}</span>
              </div>
            </button>
          `).join('')}
        </div>
      `;
    }

    if (data.posts && data.posts.length > 0) {
      html += `
        <div class="search-result-group">
          <h5>Posts (${data.posts.length})</h5>
          ${data.posts.map(p => `
            <button class="search-post-item" data-action="jump-to-post" data-post-id="${p.id}">
              <strong>${escapeHtml(p.display_name)}:</strong>
              ${escapeHtml(p.body.slice(0, 60))}...
            </button>
          `).join('')}
        </div>
      `;
    }

    if (!html) {
      html = '<div style="color:#65676b; font-size:12px; padding:6px 0;">No people or posts found matching query.</div>';
    }

    // Reflected XSS Link
    html += `
      <a class="search-reflected-link" href="/lab/reflected?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">
        Open public search results ↗
      </a>
    `;

    popover.innerHTML = html;
  } catch (err) {
    popover.innerHTML = `
      <div style="background:#fee2e2; color:#b91c1c; padding:8px 10px; border-radius:6px; font-size:12px; margin-bottom:8px;">
        <strong>Database Query Error:</strong><br>
        <code>${escapeHtml(err.message)}</code>
      </div>
      <a class="search-reflected-link" href="/lab/reflected?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">
        Open public search results ↗
      </a>
    `;
  }
}

// -------------------------------------------------------------
// Modal Display Helpers
// -------------------------------------------------------------
function openLoginModal() {
  const errBox = $('login-error-msg');
  if (errBox) {
    errBox.textContent = '';
    errBox.classList.add('hidden');
  }
  $('account-dropdown')?.classList.add('hidden');
  $('signup-dialog')?.close();
  $('login-dialog').showModal();
}

function openSignupModal() {
  const errBox = $('signup-error-msg');
  if (errBox) {
    errBox.textContent = '';
    errBox.classList.add('hidden');
  }
  $('account-dropdown')?.classList.add('hidden');
  $('login-dialog')?.close();
  $('signup-dialog').showModal();
}

function openCreatorModal() {
  $('account-dropdown')?.classList.add('hidden');
  $('creator-dialog').showModal();
}

// -------------------------------------------------------------
// Event Delegation & Interactive Actions
// -------------------------------------------------------------
document.addEventListener('click', async (e) => {
  // Autofill preset buttons in Creator Studio
  const presetBtn = e.target.closest('[data-fill]');
  if (presetBtn) {
    const targetInputId = presetBtn.dataset.fill;
    const val = presetBtn.dataset.val;
    const inp = $(targetInputId);
    if (inp) {
      inp.value = val;
      inp.focus();
    }
    return;
  }

  // Discovery circles or trending hashtag clicks
  const searchTag = e.target.closest('[data-search]');
  if (searchTag) {
    e.preventDefault();
    const q = searchTag.dataset.search;
    $('search-input').value = q;
    performSearch(q);
    return;
  }

  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  try {
    // Navigation actions
    if (action === 'nav-home') {
      state.currentFilter = 'for-you';
      updateNavHighlight(target);
      loadFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action === 'nav-discover' || action === 'view-all-users') {
      $('discover-widget').scrollIntoView({ behavior: 'smooth' });
      $('search-input').focus();
      return;
    }

    if (action === 'nav-saved') {
      state.currentFilter = 'saved';
      updateNavHighlight(target);
      loadFeed();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (action === 'open-creator') {
      openCreatorModal();
      return;
    }

    if (action === 'close-creator') {
      $('creator-dialog').close();
      return;
    }

    // Feed filter tabs
    if (action === 'filter-for-you') {
      state.currentFilter = 'for-you';
      updateFilterTabs(target);
      loadFeed();
      return;
    }
    if (action === 'filter-following') {
      state.currentFilter = 'following';
      updateFilterTabs(target);
      loadFeed();
      return;
    }
    if (action === 'filter-saved') {
      state.currentFilter = 'saved';
      updateFilterTabs(target);
      loadFeed();
      return;
    }
    if (action === 'refresh-feed') {
      loadFeed();
      showToast('Feed refreshed.');
      return;
    }

    // Post actions
    if (action === 'toggle-like') {
      toggleLike(target.dataset.postId);
      return;
    }
    if (action === 'admin-delete-post') { adminDeletePost(target.dataset.postId); return; }
    if (action === 'admin-add-like') { adminAddLike(target.dataset.postId); return; }
    if (action === 'admin-delete-comment') { adminDeleteComment(target.dataset.postId, target.dataset.commentId); return; }
    if (action === 'toggle-save') {
      toggleSave(target.dataset.postId);
      return;
    }
    if (action === 'toggle-comments') {
      toggleComments(target.dataset.postId);
      return;
    }
    if (action === 'share-post') {
      const url = `${location.origin}/#post-${target.dataset.postId}`;
      await navigator.clipboard.writeText(url);
      showToast('Post permalink copied to clipboard!');
      return;
    }

    // Profile modal actions
    if (action === 'view-profile') {
      openProfile(target.dataset.userId);
      return;
    }
    if (action === 'my-profile') {
      if (!state.currentUser) {
        openLoginModal();
        return;
      }
      openProfile(state.currentUser.id);
      return;
    }
    if (action === 'close-profile') {
      $('profile-dialog').close();
      return;
    }
    if (action === 'toggle-edit-profile') {
      const box = $('profile-edit-box');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden') && state.currentUser) {
        $('edit-name').value = state.currentUser.display_name || '';
        $('edit-loc').value = state.currentUser.location || '';
        $('edit-web').value = state.currentUser.website || '';
        $('edit-bio-input').value = state.currentUser.bio || '';
      }
      return;
    }
    if (action === 'cancel-profile-edit') {
      $('profile-edit-box').classList.add('hidden');
      return;
    }
    if (action === 'save-profile-btn') {
      const updated = await api('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: $('edit-name').value,
          bio: $('edit-bio-input').value,
          location: $('edit-loc').value,
          website: $('edit-web').value
        })
      });
      state.currentUser = updated;
      showToast('Profile updated.');
      openProfile(updated.id);
      syncSession();
      return;
    }

    // Follow toggle
    if (action === 'toggle-follow') {
      toggleFollow(target.dataset.userId);
      return;
    }

    // Story viewer & creator
    if (action === 'view-story') {
      openStoryViewer(target.dataset);
      return;
    }
    if (action === 'close-story-viewer') {
      closeStoryViewer();
      return;
    }
    if (action === 'story-create') {
      if (!state.currentUser) {
        showToast('Please log in to share a story.');
        openLoginModal();
        return;
      }
      $('story-creator-dialog').showModal();
      return;
    }
    if (action === 'close-story-creator') {
      $('story-creator-dialog').close();
      return;
    }
    if (action === 'publish-story-btn') {
      const body = $('story-caption-input').value.trim();
      let mediaUrl = '/assets/alexandria-evening.png';
      const fileInput = $('story-file-input');

      if (fileInput.files && fileInput.files[0]) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const upload = await api('/api/labs/upload', { method: 'POST', body: formData });
        mediaUrl = upload.url;
      }

      await api('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, mediaUrl })
      });

      $('story-caption-input').value = '';
      fileInput.value = '';
      $('story-creator-dialog').close();
      loadStories();
      showToast('Your story is live for 24 hours!');
      return;
    }

    // Post creation
    if (action === 'post-submit') {
      if (!state.currentUser) {
        showToast('Please log in to share an update.');
        openLoginModal();
        return;
      }

      const body = $('post-body').value.trim();
      const link = $('post-link').value.trim();
      let mediaUrl = '';

      if (state.selectedPostFile) {
        const formData = new FormData();
        formData.append('file', state.selectedPostFile);
        const upload = await api('/api/labs/upload', { method: 'POST', body: formData });
        mediaUrl = upload.url;
      }

      if (!body && !mediaUrl) {
        showToast('Please enter some text or attach an image.');
        return;
      }

      await api('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, link, mediaUrl })
      });

      $('post-body').value = '';
      $('post-link').value = '';
      $('link-preview-box').classList.add('hidden');
      clearPostFile();
      showToast('Post shared with the community!');
      loadFeed();
      return;
    }

    // SSRF Link Preview in Post Composer
    if (action === 'preview-link') {
      const url = $('post-link').value.trim() || 'http://mock.internal/status';
      const box = $('link-preview-box');
      box.classList.remove('hidden');
      box.textContent = 'Fetching preview via internal service...';

      try {
        const data = await api(`/api/labs/ssrf?url=${encodeURIComponent(url)}`);
        box.innerHTML = `<strong>${escapeHtml(data.upstream.service || 'Service')}</strong><br><code>${escapeHtml(JSON.stringify(data.upstream, null, 2))}</code>`;
      } catch (err) {
        box.innerHTML = `<span style="color:#fa383e;">Preview failed: ${escapeHtml(err.message)}</span>`;
      }
      return;
    }

    // Search submit
    if (action === 'search') {
      performSearch($('search-input').value);
      return;
    }

    // Jump to post in feed
    if (action === 'jump-to-post') {
      $('search-results').classList.add('hidden');
      const card = $(`post-${target.dataset.postId}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.boxShadow = '0 0 0 3px var(--fb-blue)';
        setTimeout(() => card.style.boxShadow = '', 2000);
      } else {
        showToast('Post is on another feed tab.');
      }
      return;
    }

    // Login & Signup Dialogs
    if (action === 'open-login') {
      openLoginModal();
      return;
    }
    if (action === 'close-login') {
      $('login-dialog').close();
      return;
    }
    if (action === 'open-signup') {
      openSignupModal();
      return;
    }
    if (action === 'close-signup') {
      $('signup-dialog').close();
      return;
    }
    if (action === 'open-signup-from-login') {
      openSignupModal();
      return;
    }
    if (action === 'open-login-from-signup') {
      openLoginModal();
      return;
    }
    if (action === 'toggle-account-menu') {
      $('account-dropdown').classList.toggle('hidden');
      return;
    }
    if (action === 'logout-action') {
      await api('/api/auth/logout', { method: 'POST' });
      state.currentUser = null;
      $('account-dropdown')?.classList.add('hidden');
      $('login-dialog')?.close();
      $('signup-dialog')?.close();
      await syncSession();
      await loadFeed();
      showToast('You are now signed out.');
      return;
    }
    if (action === 'quick-login') {
      const u = target.dataset.user;
      const p = target.dataset.pass;
      try {
        const res = await api('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, password: p })
        });
        state.currentUser = res.user;
        $('login-dialog')?.close();
        $('account-dropdown')?.classList.add('hidden');
        await syncSession();
        await loadFeed();
        showToast(`Logged in as ${res.user.display_name}.`);
      } catch (err) {
        const errBox = $('login-error-msg');
        if (errBox) {
          errBox.textContent = err.message;
          errBox.classList.remove('hidden');
        }
      }
      return;
    }

    // Quick composer helpers
    if (action === 'add-feeling') {
      $('post-body').value += ' 😊 feeling inspired';
      $('post-body').focus();
      return;
    }
    if (action === 'add-location') {
      $('post-body').value += ' 📍 Alexandria Corniche';
      $('post-body').focus();
      return;
    }

    // Creator Studio Modal Handlers
    if (action === 'modal-lab-redirect') {
      const destination = $('modal-redirect-input').value;
      window.open(`/go?to=${encodeURIComponent(destination)}`, '_blank', 'noopener');
      return;
    }
    if (action === 'modal-lab-ssrf') {
      const url = $('modal-ssrf-input').value;
      const out = $('modal-ssrf-output');
      out.textContent = 'Requesting in-process mock service...';
      try {
        const res = await api(`/api/labs/ssrf?url=${encodeURIComponent(url)}`);
        out.textContent = JSON.stringify(res, null, 2);
      } catch (err) {
        out.textContent = err.message;
      }
      return;
    }
    if (action === 'modal-lab-traversal') {
      const p = $('modal-traversal-input').value;
      const out = $('modal-traversal-output');
      out.textContent = 'Reading virtual path...';
      try {
        const res = await api(`/api/labs/files?path=${encodeURIComponent(p)}`);
        out.textContent = JSON.stringify(res, null, 2);
      } catch (err) {
        out.textContent = err.message;
      }
      return;
    }
    if (action === 'modal-lab-include') {
      const page = $('modal-include-input').value;
      const out = $('modal-include-output');
      out.textContent = 'Loading fragment...';
      try {
        const rawHtml = await api(`/api/labs/include?page=${encodeURIComponent(page)}`);
        out.innerHTML = rawHtml;
      } catch (err) {
        out.textContent = err.message;
      }
      return;
    }
    if (action === 'modal-lab-command') {
      const name = $('modal-command-input').value;
      const out = $('modal-command-output');
      out.textContent = 'Simulating command parsing...';
      try {
        const res = await api(`/api/labs/command?name=${encodeURIComponent(name)}`);
        out.textContent = JSON.stringify(res, null, 2);
      } catch (err) {
        out.textContent = err.message;
      }
      return;
    }

    if (action === 'messages') {
      showToast('All your LinkUp messages are up to date.');
      return;
    }
    if (action === 'notifications') {
      showToast('You have 3 unread community notifications.');
      return;
    }

  } catch (err) {
    showToast(err.message);
  }
});

// File attachment listener for post composer
$('post-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  state.selectedPostFile = file;
  $('composer-file-name').textContent = `Attachment: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  $('composer-file-preview').classList.remove('hidden');
});

$('composer-file-remove').addEventListener('click', () => {
  clearPostFile();
});

function clearPostFile() {
  state.selectedPostFile = null;
  $('post-file').value = '';
  $('composer-file-preview').classList.add('hidden');
}

// Form Submissions
document.addEventListener('submit', async (e) => {
  const adminCommentForm = e.target.closest('.admin-comment-form');
  if (adminCommentForm) {
    e.preventDefault();
    const input = adminCommentForm.querySelector('input[name="adminCommentBody"]');
    const body = input.value.trim();
    if (body) {
      input.value = '';
      await adminAddComment(adminCommentForm.dataset.postId, body);
      $(`comments-container-${adminCommentForm.dataset.postId}`)?.classList.remove('hidden');
    }
    return;
  }
  // Comment Form Submission
  const commentForm = e.target.closest('.comment-composer-form');
  if (commentForm) {
    e.preventDefault();
    const postId = commentForm.dataset.postId;
    const input = commentForm.querySelector('input[name="commentBody"]');
    const body = input.value.trim();
    if (body) {
      input.value = '';
      await submitComment(postId, body);
    }
    return;
  }

  // Log In Form Submission
  if (e.target.id === 'login-form') {
    e.preventDefault();
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const errBox = $('login-error-msg');

    if (errBox) {
      errBox.textContent = '';
      errBox.classList.add('hidden');
    }

    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      state.currentUser = res.user;
      $('login-dialog').close();
      $('login-username').value = '';
      $('login-password').value = '';
      await syncSession();
      await loadFeed();
      showToast(`Welcome back, ${res.user.display_name}!`);
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
      showToast(err.message);
    }
    return;
  }

  // Sign Up Form Submission
  if (e.target.id === 'signup-form') {
    e.preventDefault();
    const displayName = $('signup-name').value.trim();
    const username = $('signup-username').value.trim();
    const password = $('signup-password').value;
    const email = $('signup-email').value.trim();
    const bio = $('signup-bio').value.trim();
    const avatarUrl = document.querySelector('input[name="signupAvatar"]:checked')?.value || '/assets/alice-profile.png';
    const errBox = $('signup-error-msg');

    if (errBox) {
      errBox.textContent = '';
      errBox.classList.add('hidden');
    }

    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          username,
          password,
          email,
          bio,
          avatarUrl
        })
      });

      state.currentUser = res.user;
      $('signup-dialog').close();
      $('signup-name').value = '';
      $('signup-username').value = '';
      $('signup-password').value = '';
      $('signup-email').value = '';
      $('signup-bio').value = '';
      await syncSession();
      await loadFeed();
      showToast(`Welcome to LinkUp, ${res.user.display_name}! Account created.`);
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      }
      showToast(err.message);
    }
    return;
  }
});

// Search Input Auto-Debounce
let searchDebounce;
$('search-input').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    performSearch(e.target.value);
  }, 250);
});

$('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch(e.target.value);
  }
});

// Close popovers on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    $('search-results').classList.add('hidden');
  }
  if (!e.target.closest('.account-menu-wrap')) {
    $('account-dropdown')?.classList.add('hidden');
  }
});

function updateNavHighlight(target) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.side-link').forEach(s => s.classList.remove('active'));
  target.classList.add('active');
}

function updateFilterTabs(target) {
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  target.classList.add('active');
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
(async function init() {
  await syncSession();
  await loadStories();
  await loadFeed();
})();
