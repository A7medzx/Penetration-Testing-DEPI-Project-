const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const multer = require('multer');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1'; // Enforce strict local-only binding
const ROOT = __dirname;
const DATA_DIR = process.env.LINKUP_DATA_DIR ? path.resolve(process.env.LINKUP_DATA_DIR) : path.join(ROOT, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(path.join(DATA_DIR, 'lab.sqlite'));

app.disable('x-powered-by');
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: false, limit: '500kb' }));

// -------------------------------------------------------------
// Database Schema Initialization
// -------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    cover_url TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT 'Alexandria, Egypt',
    website TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    media_url TEXT NOT NULL DEFAULT '',
    likes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS post_likes (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS saved_posts (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS post_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    author_id INTEGER,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    is_virtual INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    followed_id INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followed_id)
  );

  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    media_url TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lab_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const commentColumns = db.prepare('PRAGMA table_info(post_comments)').all();
if (!commentColumns.some(column => column.name === 'is_virtual')) {
  db.exec('ALTER TABLE post_comments ADD COLUMN is_virtual INTEGER NOT NULL DEFAULT 0');
}

// -------------------------------------------------------------
// Mock Data Seeding (Fictional Profiles, Posts, Comments, Stories)
// -------------------------------------------------------------
const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

if (userCount === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, password, role, email, display_name, bio, avatar_url, cover_url, location, website, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    1,
    'admin',
    'admin123',
    'admin',
    'morgan@linkup.invalid',
    'Morgan Lane',
    'Community host · photography enthusiast & specialty coffee lover ☕📷',
    '/assets/workspace-morning.png',
    '/assets/alexandria-evening.png',
    'Alexandria, Egypt',
    'https://morganlane.invalid',
    'CONFIDENTIAL: System Administrator with elevated lab privileges. Master API key: LU-ADMIN-SECRET-KEY-9941'
  );

  insertUser.run(
    2,
    'alice',
    'alice123',
    'member',
    'alice@linkup.invalid',
    'Alice Chen',
    'UI/UX Designer, neighborhood walks, and tiny succulent collector 🌿✨',
    '/assets/alice-profile.png',
    '/assets/cafe-friends.png',
    'Giza, Egypt',
    'https://alicechen.invalid',
    'Active community designer. Mutual friend with Bob and Nour.'
  );

  insertUser.run(
    3,
    'bob',
    'bob123',
    'member',
    'bob@linkup.invalid',
    'Bob Rivera',
    'Specialty coffee explorer · weekend camper & retro games collector ☕🎮',
    '/assets/bob-profile.png',
    '/assets/workspace-morning.png',
    'Cairo, Egypt',
    'https://bobrivera.invalid',
    'Standard community member. Organizes the monthly coffee meetup.'
  );

  insertUser.run(
    4,
    'nour',
    'nour123',
    'member',
    'nour@linkup.invalid',
    'Nour Hassan',
    'Architectural photographer, old novel enthusiast, sunset chaser 🌅📚',
    '/assets/alexandria-evening.png',
    '/assets/cafe-friends.png',
    'Alexandria, Egypt',
    'https://nourhassan.invalid',
    'Frequent contributor to local architecture circles.'
  );

  insertUser.run(
    5,
    'omar',
    'omar123',
    'member',
    'omar@linkup.invalid',
    'Omar Saleh',
    'Trying every artisanal bakery in town 🥐 · Amateur baker & food blogger',
    '/assets/workspace-morning.png',
    '/assets/alexandria-evening.png',
    'Mansoura, Egypt',
    'https://omarbakes.invalid',
    'Food circle curator. Reviews local pastry shops.'
  );

  insertUser.run(
    6,
    'maya',
    'maya123',
    'member',
    'maya@linkup.invalid',
    'Maya Farouk',
    'Historic street walks, vinyl records, and curated acoustic playlists 🎶🏛️',
    '/assets/alice-profile.png',
    '/assets/bob-profile.png',
    'Cairo, Egypt',
    'https://mayafarouk.invalid',
    'Arts & music community moderator.'
  );
}

// Seed curated social posts
const postCount = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count;

if (postCount === 0) {
  const insertPost = db.prepare(`
    INSERT INTO posts (id, author_id, body, link, media_url, likes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  insertPost.run(
    1,
    4,
    'Alexandria Corniche at golden hour. The Mediterranean breeze and this warm dusk light make the entire week melt away. Took the scenic walk along the historic promenade 🌅🌊',
    '',
    '/assets/alexandria-evening.png',
    42,
    '-3 hours'
  );

  insertPost.run(
    2,
    2,
    'Spent the entire afternoon catching up over pour-overs and iced lattes. Forgot to look at my phone for four straight hours — honestly the best kind of reset! ☕💛',
    '',
    '/assets/cafe-friends.png',
    28,
    '-5 hours'
  );

  insertPost.run(
    3,
    1,
    'Sunday morning setup: organized desk, fresh pour-over coffee, and soft ambient jazz. Ready to dive into this week’s creative projects 🌿💻',
    '',
    '/assets/workspace-morning.png',
    35,
    '-8 hours'
  );

  insertPost.run(
    4,
    5,
    'Found this little hidden gem bakery tucked behind the old tram line. Flakiest almond croissants and pistachio brioche I have ever tasted! Definitely bookmarked for our weekend group meetup 🥐✨',
    'https://places.invalid/artisan-bakery',
    '',
    19,
    '-14 hours'
  );

  insertPost.run(
    5,
    3,
    'Morning coffee ritual before heading out. Trying a natural processed Ethiopian roast with notes of bergamot and jasmine ☕',
    '',
    '/assets/bob-profile.png',
    15,
    '-1 day'
  );

  insertPost.run(
    6,
    6,
    'Wandering the historic Downtown streets with my camera. Every neoclassical balcony and ornate doorway tells a story. What is your favorite historic street corner? 📷🏛️',
    '',
    '/assets/alexandria-evening.png',
    31,
    '-1 day'
  );

  // Seed post comments
  const insertComment = db.prepare(`
    INSERT INTO post_comments (post_id, author_id, author, body, created_at)
    VALUES (?, ?, ?, ?, datetime('now', ?))
  `);

  insertComment.run(1, 2, 'Alice Chen', 'That golden reflection on the water is stunning Nour! Where was this shot taken?', '-2 hours');
  insertComment.run(1, 3, 'Bob Rivera', 'Classic Alex vibe. We should definitely organize a photowalk there soon! 📷', '-1 hour');
  insertComment.run(2, 4, 'Nour Hassan', 'Nothing beats good coffee and genuine conversations. Remind me to join next time!', '-4 hours');
  insertComment.run(3, 2, 'Alice Chen', 'Love the plant on the side! What species is that succulent?', '-7 hours');
  insertComment.run(4, 3, 'Bob Rivera', 'Save a table for 4 next Sunday morning, count me in! 🥐', '-12 hours');

  // Seed follows
  const insertFollow = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followed_id) VALUES (?, ?)');
  insertFollow.run(2, 1); // Alice follows Morgan
  insertFollow.run(2, 3); // Alice follows Bob
  insertFollow.run(2, 4); // Alice follows Nour
  insertFollow.run(3, 2); // Bob follows Alice
  insertFollow.run(4, 2); // Nour follows Alice
  insertFollow.run(5, 2); // Omar follows Alice

  // Seed likes
  const insertLike = db.prepare('INSERT OR IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)');
  insertLike.run(2, 1);
  insertLike.run(2, 3);
  insertLike.run(3, 1);
  insertLike.run(4, 2);

  // Seed saved posts
  const insertSave = db.prepare('INSERT OR IGNORE INTO saved_posts (user_id, post_id) VALUES (?, ?)');
  insertSave.run(2, 4); // Alice saved Omar's bakery post
  insertSave.run(2, 1); // Alice saved Nour's sunset post
}

// Seed 24-hour Stories
const activeStories = db.prepare("SELECT COUNT(*) AS count FROM stories WHERE datetime(expires_at) > datetime('now')").get().count;
if (activeStories === 0) {
  const insertStory = db.prepare(`
    INSERT INTO stories (author_id, body, media_url, expires_at)
    VALUES (?, ?, ?, datetime('now', '+24 hours'))
  `);

  insertStory.run(4, 'Golden hour over the Mediterranean 🌅', '/assets/alexandria-evening.png');
  insertStory.run(2, 'Sunday brunch with the crew ☕💛', '/assets/cafe-friends.png');
  insertStory.run(1, 'Organized desk, peaceful mind 🌿', '/assets/workspace-morning.png');
  insertStory.run(3, 'Tasting notes: bergamot & honey ☕', '/assets/bob-profile.png');
}

// -------------------------------------------------------------
// In-Memory Containment Stores (No Host Disk / OS / Outbound Calls)
// -------------------------------------------------------------
const mockUploads = new Map();

// Virtual file catalog for path traversal and LFI exercises (strictly in-memory)
const mockVirtualFiles = {
  '/public/welcome.txt': 'Welcome to LinkUp Community Cloud File Storage!\nAll assets here are stored in our secure virtual file catalog.',
  '/public/guidelines.txt': 'LinkUp Community Guidelines:\n1. Be kind and respectful.\n2. Share inspiring local stories.\n3. Keep community data safe.',
  '/private/flag.txt': 'DEPI_FLAG{v1rtu4l_p4th_tr4v3rs4l_c0nf1rm3d_7894}',
  '/private/config.ini': '[linkup_internal]\nenvironment = production_mock\ndatabase = /data/lab.sqlite\nmaster_salt = 5f4dcc3b5aa765d61d8327deb882cf99\nadmin_contact = morgan@linkup.invalid',
  '/templates/about.html': '<div class="theme-box"><h3>About LinkUp</h3><p>LinkUp is a fictional, privacy-first local social community built for friendship and photography.</p></div>',
  '/templates/help.html': '<div class="theme-box"><h3>Community Help</h3><p>Need assistance? Contact our local community ambassadors or explore your feed settings.</p></div>',
  '/templates/dark.html': '<style>:root{--bg:#18191a;--paper:#242526;--ink:#e4e6eb;--line:#3a3b3c;}</style><div class="theme-box"><p>Previewing LinkUp Dark Mode Accent Theme</p></div>',
  '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\nlinkup:x:1000:1000:LinkUp Service User:/home/linkup:/bin/bash\nmorgan:x:1001:1001:Morgan Lane (Admin):/home/morgan:/bin/bash\nalice:x:1002:1002:Alice Chen:/home/alice:/bin/bash\nbob:x:1003:1003:Bob Rivera:/home/bob:/bin/bash\nnour:x:1004:1004:Nour Hassan:/home/nour:/bin/bash',
  '/etc/shadow-mock': 'root:$6$mock$991aZf8k1Xp:19000:0:99999:7:::\nlinkup:$6$salt$kL2.9dF1aZb:19000:0:99999:7:::\nmorgan:$6$adm$4Xp7bN9c3Lm:19000:0:99999:7:::'
};

// In-process mock upstream service for SSRF containment (strictly internal, no outbound network)
const mockUpstream = {
  '/status': {
    service: 'LinkUp In-Process Microservice Cluster',
    status: 'healthy',
    environment: 'staging-mock',
    uptime: '14 days, 6 hours',
    active_connections: 128
  },
  '/private/notes': {
    service: 'Internal Community Ops Desk',
    confidential_note: 'Internal memo: Infrastructure security audit scheduled for next month. Admin token LU-INT-TOKEN-8832 is rotated weekly.',
    author: 'morgan@linkup.invalid'
  },
  '/metadata/instance': {
    service: 'Mock Cloud Metadata Engine',
    instance_id: 'i-0a8b9c4d1e2f3g4h5',
    region: 'me-central-1a',
    security_credentials: {
      RoleName: 'LinkUp-Social-S3-Access-Role',
      AccessKeyId: 'ASIA-MOCK-LINKUP-KEY-9932',
      SecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      Token: 'MOCK-SESSION-TOKEN-FOR-TRAINING-PURPOSES-ONLY'
    }
  },
  '/api/cloud-credentials': {
    service: 'Secret Vault Simulator',
    vault_status: 'unlocked',
    api_secrets: {
      AWS_BUCKET: 'linkup-user-media-storage-vault',
      SENDGRID_KEY: 'SG.mock_token_key_for_welcome_emails_only'
    }
  }
};

// -------------------------------------------------------------
// Authentication & Session Helpers
// Intentionally weak session handling: predictable cookie 'lab_session=lab-user-{id}'
// Missing HttpOnly and Secure flags for testing script-accessibility & XSS session theft
// -------------------------------------------------------------
function parseCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function currentUser(req) {
  const token = parseCookie(req, 'lab_session');
  if (!token) return null;
  const match = /^lab-user-(\d+)$/.exec(token);
  if (!match) return null;
  const userId = Number(match[1]);
  return db.prepare('SELECT id, username, display_name, email, role, avatar_url, cover_url, bio, location, website FROM users WHERE id = ?').get(userId) || null;
}

function requireLogin(req, res, next) {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in (e.g., alice / alice123).' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  req.user = user;
  next();
}

// -------------------------------------------------------------
// Serve Static Frontend Assets
// -------------------------------------------------------------
app.use(express.static(path.join(ROOT, 'public')));

// -------------------------------------------------------------
// Core Social API Endpoints
// -------------------------------------------------------------

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'LinkUp Social Security Lab',
    host: HOST,
    port: PORT,
    contained: true,
    message: 'Localhost practice lab running in strictly contained mock mode.'
  });
});

// Home Feed with modes: 'for-you', 'following', 'saved'
app.get('/api/feed', (req, res) => {
  const viewer = currentUser(req) || db.prepare("SELECT id, username, display_name, avatar_url, role FROM users WHERE username = 'alice'").get();
  const mode = String(req.query.mode || 'for-you');

  let query = `
    SELECT
      p.id, p.author_id, p.body, p.link, p.media_url, p.likes, p.created_at,
      u.username, u.display_name, u.avatar_url, u.role, u.location,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
      EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = ?) AS saved,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p
    JOIN users u ON u.id = p.author_id
  `;

  const params = [viewer.id, viewer.id];

  if (mode === 'following') {
    query += ` WHERE p.author_id = ? OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followed_id = p.author_id)`;
    params.push(viewer.id, viewer.id);
  } else if (mode === 'saved') {
    query += ` WHERE EXISTS(SELECT 1 FROM saved_posts s WHERE s.user_id = ? AND s.post_id = p.id)`;
    params.push(viewer.id);
  }

  query += ` ORDER BY p.id DESC`;

  try {
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Post (Vulnerable to Stored XSS - body is stored as provided and rendered raw)
app.post('/api/posts', (req, res) => {
  const author = currentUser(req) || db.prepare("SELECT id, username, display_name, avatar_url, role FROM users WHERE username = 'alice'").get();
  const body = String(req.body.body || '').trim();
  const link = String(req.body.link || '').trim().slice(0, 500);
  const mediaUrl = String(req.body.mediaUrl || '').trim().slice(0, 500);

  if (!body && !mediaUrl) {
    return res.status(400).json({ error: 'Post must contain text or a photo.' });
  }

  try {
    const stmt = db.prepare('INSERT INTO posts (author_id, body, link, media_url, likes) VALUES (?, ?, ?, ?, 0)');
    const result = stmt.run(author.id, body, link, mediaUrl);
    const newPostId = Number(result.lastInsertRowid);

    const post = db.prepare(`
      SELECT p.id, p.author_id, p.body, p.link, p.media_url, p.likes, p.created_at,
             u.username, u.display_name, u.avatar_url, u.role
      FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.id = ?
    `).get(newPostId);

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like / Unlike Post
app.post('/api/posts/:id/like', (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT id, likes FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const viewer = currentUser(req) || db.prepare("SELECT id FROM users WHERE username = 'alice'").get();
  const existing = db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(viewer.id, postId);

  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(viewer.id, postId);
    db.prepare('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(postId);
  } else {
    db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(viewer.id, postId);
    db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
  }

  const updatedLikes = db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId).likes;
  res.json({ liked: !existing, likes: updatedLikes });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT id, username, display_name, avatar_url FROM users ORDER BY display_name COLLATE NOCASE").all());
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const postId = Number(req.params.id);
  if (!Number.isInteger(postId)) return res.status(400).json({ error: 'Invalid post id.' });
  if (!db.prepare('SELECT id FROM posts WHERE id = ?').get(postId)) return res.status(404).json({ error: 'Post not found.' });
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM post_comments WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM saved_posts WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM posts WHERE id = ?').run(postId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json({ success: true });
});

app.post('/api/admin/posts/:id/comments', requireAdmin, (req, res) => {
  const postId = Number(req.params.id), userId = Number(req.body.userId);
  const body = String(req.body.body || '').trim().slice(0, 1000);
  if (!db.prepare('SELECT id FROM posts WHERE id = ?').get(postId)) return res.status(404).json({ error: 'Post not found.' });
  const author = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(userId);
  if (!author) return res.status(400).json({ error: 'Choose a valid application user.' });
  if (!body) return res.status(400).json({ error: 'Comment cannot be empty.' });
  const result = db.prepare('INSERT INTO post_comments (post_id, author_id, author, body, is_virtual) VALUES (?, ?, ?, ?, 1)')
    .run(postId, author.id, author.display_name, body);
  res.status(201).json({ id: Number(result.lastInsertRowid), success: true });
});

app.delete('/api/admin/comments/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM post_comments WHERE id = ?').run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: 'Comment not found.' });
  res.json({ success: true });
});

app.post('/api/admin/posts/:id/likes', requireAdmin, (req, res) => {
  const postId = Number(req.params.id), userId = Number(req.body.userId);
  if (!db.prepare('SELECT id FROM posts WHERE id = ?').get(postId)) return res.status(404).json({ error: 'Post not found.' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) return res.status(400).json({ error: 'Choose a valid application user.' });
  if (db.prepare('SELECT 1 FROM post_likes WHERE user_id = ? AND post_id = ?').get(userId, postId)) {
    return res.status(409).json({ error: 'That user already likes this post.' });
  }
  db.prepare('INSERT INTO post_likes (user_id, post_id) VALUES (?, ?)').run(userId, postId);
  db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
  res.json({ success: true, likes: db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId).likes });
});

// Save / Unsave Post
app.post('/api/posts/:id/save', (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const viewer = currentUser(req) || db.prepare("SELECT id FROM users WHERE username = 'alice'").get();
  const existing = db.prepare('SELECT 1 FROM saved_posts WHERE user_id = ? AND post_id = ?').get(viewer.id, postId);

  if (existing) {
    db.prepare('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?').run(viewer.id, postId);
  } else {
    db.prepare('INSERT INTO saved_posts (user_id, post_id) VALUES (?, ?)').run(viewer.id, postId);
  }

  res.json({ saved: !existing });
});

// Get Comments for Post
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = Number(req.params.id);
  const comments = db.prepare(`
    SELECT c.id, c.post_id, c.author_id, c.author, c.body, c.created_at, c.is_virtual,
           u.avatar_url, u.username
    FROM post_comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.post_id = ?
    ORDER BY c.id ASC
  `).all(postId);
  res.json(comments);
});

// Delete Post (Admin can delete ANY post; users can delete their own)
app.delete('/api/posts/:id', (req, res) => {
  const viewer = currentUser(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required to delete posts.' });
  }

  const postId = Number(req.params.id);
  const post = db.prepare('SELECT id, author_id FROM posts WHERE id = ?').get(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  if (viewer.role !== 'admin' && post.author_id !== viewer.id) {
    return res.status(403).json({ error: 'Permission denied: Only administrators or the post author can delete this post.' });
  }

  db.prepare('DELETE FROM post_comments WHERE post_id = ?').run(postId);
  db.prepare('DELETE FROM post_likes WHERE post_id = ?').run(postId);
  db.prepare('DELETE FROM saved_posts WHERE post_id = ?').run(postId);
  db.prepare('DELETE FROM posts WHERE id = ?').run(postId);

  res.json({ success: true, message: `Post #${postId} has been removed.`, postId });
});

// Admin Privileged Action: Add likes from application users
app.post('/api/posts/:id/admin-likes', (req, res) => {
  const viewer = currentUser(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (viewer.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied: Administrator privileges required.' });
  }

  const postId = Number(req.params.id);
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found.' });
  }

  // Pick fictional application users to like the post
  const users = db.prepare("SELECT id, display_name FROM users WHERE role != 'admin' LIMIT 5").all();
  const insertLike = db.prepare('INSERT OR IGNORE INTO post_likes (user_id, post_id) VALUES (?, ?)');

  let added = 0;
  for (const u of users) {
    const r = insertLike.run(u.id, postId);
    if (r.changes > 0) added++;
  }

  db.prepare('UPDATE posts SET likes = (SELECT COUNT(*) FROM post_likes WHERE post_id = ?) WHERE id = ?').run(postId, postId);
  const updatedLikes = db.prepare('SELECT likes FROM posts WHERE id = ?').get(postId).likes;

  res.json({
    success: true,
    added,
    likes: updatedLikes,
    likers: users.map(u => u.display_name),
    message: `Added likes from ${added} community members.`
  });
});

// Delete Comment (Admin can delete ANY comment; users can delete their own)
app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const viewer = currentUser(req);
  if (!viewer) {
    return res.status(401).json({ error: 'Authentication required to delete comments.' });
  }

  const commentId = Number(req.params.commentId);
  const comment = db.prepare('SELECT id, post_id, author_id FROM post_comments WHERE id = ?').get(commentId);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found.' });
  }

  if (viewer.role !== 'admin' && comment.author_id !== viewer.id) {
    return res.status(403).json({ error: 'Permission denied: Only administrators or the author can delete this comment.' });
  }

  db.prepare('DELETE FROM post_comments WHERE id = ?').run(commentId);
  res.json({ success: true, message: `Comment #${commentId} removed.`, commentId });
});

// Add Comment to Post (Supports virtual moderator persona for admin)
app.post('/api/posts/:id/comments', (req, res) => {
  const postId = Number(req.params.id);
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post not found.' });

  const viewer = currentUser(req);
  let authorName = viewer ? viewer.display_name : String(req.body.author || 'Guest Member').slice(0, 80);
  let authorId = viewer ? viewer.id : null;
  let avatarUrl = viewer ? viewer.avatar_url : '/assets/cafe-friends.png';

  // Admin persona override (e.g. "Community Moderation Team", "Official Host")
  if (viewer && viewer.role === 'admin' && req.body.persona) {
    authorName = String(req.body.persona).slice(0, 80);
  }

  const body = String(req.body.body || '').trim();

  if (!body) {
    return res.status(400).json({ error: 'Comment body cannot be empty.' });
  }

  const result = db.prepare('INSERT INTO post_comments (post_id, author_id, author, body) VALUES (?, ?, ?, ?)').run(postId, authorId, authorName, body);
  res.status(201).json({
    id: Number(result.lastInsertRowid),
    post_id: postId,
    author: authorName,
    body: body,
    avatar_url: avatarUrl
  });
});


// Follow / Unfollow User
app.post('/api/users/:id/follow', (req, res) => {
  const targetId = Number(req.params.id);
  const target = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const viewer = currentUser(req) || db.prepare("SELECT id FROM users WHERE username = 'alice'").get();
  if (viewer.id === targetId) {
    return res.status(400).json({ error: 'You cannot follow yourself.' });
  }

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?').get(viewer.id, targetId);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?').run(viewer.id, targetId);
  } else {
    db.prepare('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)').run(viewer.id, targetId);
  }

  res.json({ following: !existing, targetId, targetName: target.display_name });
});

// 24-Hour Stories
app.get('/api/stories', (_req, res) => {
  const stories = db.prepare(`
    SELECT s.id, s.author_id, s.body, s.media_url, s.created_at,
           u.username, u.display_name, u.avatar_url
    FROM stories s
    JOIN users u ON u.id = s.author_id
    WHERE datetime(s.expires_at) > datetime('now')
    ORDER BY s.id DESC
  `).all();
  res.json(stories);
});

app.post('/api/stories', (req, res) => {
  const viewer = currentUser(req) || db.prepare("SELECT id FROM users WHERE username = 'alice'").get();
  const body = String(req.body.body || '').trim().slice(0, 400);
  const mediaUrl = String(req.body.mediaUrl || '/assets/cafe-friends.png').trim().slice(0, 500);

  if (!body && !mediaUrl) {
    return res.status(400).json({ error: 'Story requires a caption or photo.' });
  }

  db.prepare(`
    INSERT INTO stories (author_id, body, media_url, expires_at)
    VALUES (?, ?, ?, datetime('now', '+24 hours'))
  `).run(viewer.id, body, mediaUrl);

  res.status(201).json({ success: true, message: 'Story published for 24 hours.' });
});

// -------------------------------------------------------------
// Vulnerability 1: Error-Based SQL Injection (Global Search)
// Reachable through the top navigation search bar.
// Directly interpolates query into SQL; exposes raw SQLite errors and allows UNION / boolean extraction.
// -------------------------------------------------------------
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '');
  try {
    // Intentionally unsafe string interpolation:
    const userQuery = `SELECT id, username, display_name, email, role, avatar_url, bio, note FROM users WHERE username LIKE '%${q}%' OR display_name LIKE '%${q}%' OR bio LIKE '%${q}%'`;
    const users = db.prepare(userQuery).all();

    const postQuery = `SELECT p.id, p.body, p.media_url, p.author_id, u.display_name, u.username FROM posts p JOIN users u ON u.id = p.author_id WHERE p.body LIKE '%${q}%'`;
    const posts = db.prepare(postQuery).all();

    res.json({ query: q, users, posts });
  } catch (err) {
    // Expose raw database error for error-based SQL injection practice
    res.status(500).json({
      error: `SQLite Error: ${err.message}`,
      hint: 'Syntax error in interpolated SQL statement. Try classic payloads like: \' OR \'1\'=\'1\' --'
    });
  }
});

// Dedicated SQL Lab endpoint for direct testing
app.get('/api/labs/sql', (req, res) => {
  const username = String(req.query.username || 'alice');
  try {
    const rawSql = `SELECT id, username, display_name, email, role, note FROM users WHERE username = '${username}'`;
    const rows = db.prepare(rawSql).all();
    res.json({ query: rawSql, rows });
  } catch (err) {
    res.status(500).json({ error: `SQLite Error: ${err.message}` });
  }
});

// -------------------------------------------------------------
// Vulnerability 2: Reflected XSS
// Reachable through the "Open public search results ↗" link in the search popover.
// Reflects unescaped user query directly into server-rendered HTML.
// -------------------------------------------------------------
app.get('/lab/reflected', (req, res) => {
  const query = String(req.query.q || '');
  res.type('html').send(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>LinkUp Public Search: ${query}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #f0f2f5; margin: 0; padding: 40px; color: #1c1e21; }
    .card { max-width: 650px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    h1 { font-size: 24px; color: #1877f2; margin-top: 0; }
    .query-box { background: #e7f3ff; padding: 14px 18px; border-radius: 8px; font-size: 15px; margin: 20px 0; border-left: 4px solid #1877f2; }
    a { color: #1877f2; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>LinkUp Public Search Results</h1>
    <p>Viewing public community search results matching your query:</p>
    <div class="query-box">You searched for: <strong>${query}</strong></div>
    <p><a href="/">← Return to LinkUp Feed</a></p>
  </div>
</body>
</html>
  `);
});

// -------------------------------------------------------------
// Vulnerability 3: Stored XSS Lab Endpoints
// Dedicated comment feed that renders stored input raw
// -------------------------------------------------------------
app.get('/api/labs/comments', (_req, res) => {
  const rows = db.prepare('SELECT id, author, body, created_at FROM comments ORDER BY id DESC').all();
  res.json(rows);
});

app.post('/api/labs/comments', (req, res) => {
  const author = String(req.body.author || 'Guest').slice(0, 80);
  const body = String(req.body.body || '').slice(0, 3000);
  if (!body) return res.status(400).json({ error: 'Comment body required.' });
  const result = db.prepare('INSERT INTO comments (author, body) VALUES (?, ?)').run(author, body);
  res.status(201).json({ id: Number(result.lastInsertRowid), author, body });
});

app.delete('/api/labs/comments', (_req, res) => {
  db.exec('DELETE FROM comments');
  res.json({ success: true, message: 'Lab comments cleared.' });
});

// -------------------------------------------------------------
// Vulnerability 4: Open Redirect
// Reachable through the Creator Studio "Open shared invite" feature.
// Redirects without destination validation.
// -------------------------------------------------------------
app.get('/go', (req, res) => {
  const destination = String(req.query.to || '/');
  // Intentionally unvalidated open redirect:
  res.redirect(destination);
});

// -------------------------------------------------------------
// Vulnerability 5: SSRF via In-Process Mock Service (Strictly Contained)
// Reachable through post composer "Preview link" button and Creator Studio.
// Strictly confined to http://mock.internal/* — never performs outbound requests.
// -------------------------------------------------------------
app.get('/api/labs/ssrf', (req, res) => {
  const target = String(req.query.url || 'http://mock.internal/status');
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'http:' || parsed.hostname !== 'mock.internal') {
      return res.status(403).json({
        error: 'Safety Boundary Enforced: Only simulated internal mock endpoints at http://mock.internal/* are accessible.',
        allowed_prefix: 'http://mock.internal/',
        sample_targets: ['http://mock.internal/status', 'http://mock.internal/private/notes', 'http://mock.internal/metadata/instance']
      });
    }

    const response = mockUpstream[parsed.pathname];
    if (!response) {
      return res.status(404).json({
        error: 'Mock internal path not found.',
        requested: parsed.pathname,
        available_paths: Object.keys(mockUpstream)
      });
    }

    res.json({
      requestedUrl: target,
      status: 200,
      upstream: response
    });
  } catch (err) {
    res.status(400).json({ error: `Invalid URL: ${err.message}` });
  }
});

// -------------------------------------------------------------
// Vulnerability 6: File Upload (In-Memory Only, Contained)
// Reachable via Post Composer "Photo / file" attachment and Story Creator.
// Accepts arbitrary extensions; holds strictly in memory Map (never disk).
// Safe rasters serve as images; others as text/plain.
// -------------------------------------------------------------
app.post('/api/labs/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please select a file to upload.' });
  }

  const name = String(req.file.originalname || 'upload.bin').slice(0, 180);
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const contentType = String(req.file.mimetype || 'application/octet-stream').slice(0, 100);

  // Store in RAM Map
  mockUploads.set(id, {
    name,
    buffer: req.file.buffer,
    contentType,
    size: req.file.size,
    uploaded_at: new Date().toISOString()
  });

  res.status(201).json({
    id,
    name,
    size: req.file.size,
    contentType,
    url: `/api/labs/upload/${id}`,
    accepted: true,
    message: 'File stored in volatile memory. No disk write performed.'
  });
});

app.get('/api/labs/upload', (_req, res) => {
  const list = [...mockUploads.entries()].map(([id, item]) => ({
    id,
    name: item.name,
    size: item.size,
    contentType: item.contentType,
    url: `/api/labs/upload/${id}`
  }));
  res.json(list);
});

app.get('/api/labs/upload/:id', (req, res) => {
  const file = mockUploads.get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Upload not found or expired from memory.' });

  const safeRasters = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(safeRasters.has(file.contentType) ? file.contentType : 'text/plain').send(file.buffer);
});

// -------------------------------------------------------------
// Vulnerability 7 & 8: Path Traversal & LFI via Virtual Catalog
// Reachable through Creator Studio "Export Archive" and "Theme Preview".
// Resolves inside mockVirtualFiles dictionary; never touches host filesystem.
// -------------------------------------------------------------
app.get('/api/labs/files', (req, res) => {
  const requested = String(req.query.path || 'welcome.txt');
  const normalized = path.posix.normalize(`/public/${requested}`);
  const content = mockVirtualFiles[normalized];

  if (content === undefined) {
    return res.status(404).json({
      error: 'Mock file not found in virtual catalog.',
      requested,
      resolved: normalized,
      hint: 'Try path traversal such as ../../etc/passwd or ../../private/flag.txt'
    });
  }

  res.json({
    requested,
    resolved: normalized,
    content
  });
});

app.get('/api/labs/include', (req, res) => {
  const page = String(req.query.page || 'about.html');
  const normalized = path.posix.normalize(`/templates/${page}`);
  const content = mockVirtualFiles[normalized];

  if (content === undefined) {
    return res.status(404).send(`<h3>404 Not Found</h3><p>Template "${escapeHtml(normalized)}" not found in virtual catalog.</p>`);
  }

  res.type('html').send(content);
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// -------------------------------------------------------------
// Vulnerability 9: Simulated OS Command Injection
// Reachable via Creator Studio "Media optimization preview".
// Parses shell separators (; & | &&) and mocks command responses without spawning child processes.
// -------------------------------------------------------------
app.get('/api/labs/command', (req, res) => {
  const input = String(req.query.name || 'avatar.jpg');
  const parts = input.split(/[;&|]/).map(s => s.trim()).filter(Boolean);
  const output = [];

  for (const part of parts) {
    if (/^(whoami|id)$/i.test(part)) {
      output.push('uid=1000(linkup) gid=1000(linkup) groups=1000(linkup),4(adm)');
    } else if (/^uname(\s+-a)?$/i.test(part)) {
      output.push('Linux linkup-sec-lab 6.6.0-mock-virtual #1 SMP PREEMPT x86_64 GNU/Linux');
    } else if (/^cat\s+(\/)?etc\/passwd$/i.test(part)) {
      output.push(mockVirtualFiles['/etc/passwd']);
    } else if (/^cat\s+(\/)?private\/flag\.txt$/i.test(part)) {
      output.push(mockVirtualFiles['/private/flag.txt']);
    } else if (/^ls(\s+-[a-zA-Z]+)?$/i.test(part)) {
      output.push('app.js\ndata\nnode_modules\npackage.json\npublic\nserver.js');
    } else {
      output.push(`[optimizer] Processing asset "${part}": compressed 2.4MB -> 420KB (-82%)`);
    }
  }

  res.json({
    input,
    simulated: true,
    output,
    note: 'Command execution is safely simulated in-memory; no actual operating-system shell was spawned.'
  });
});

// -------------------------------------------------------------
// Additional intentional exercises inspired by the supplied report.
// All records and identities here are synthetic and local to this lab.
// -------------------------------------------------------------
app.get('/api/labs/auth-sqli', (req, res) => {
  const username = String(req.query.username || 'alice');
  const password = String(req.query.password || '');
  try {
    // Intentionally unsafe lab-only credential query for SQLi practice.
    const sql = `SELECT id, username, display_name, role FROM users WHERE username = '${username}' AND password = '${password}'`;
    const user = db.prepare(sql).get();
    if (!user) return res.status(401).json({ authenticated: false, error: 'Invalid lab credentials.' });
    res.json({ authenticated: true, user, session: `lab-user-${user.id}` });
  } catch (err) {
    res.status(500).json({ error: `SQLite Error: ${err.message}` });
  }
});

// Deliberately changes state with a cookie-authenticated GET and has no CSRF token.
app.get('/api/labs/csrf/profile', requireLogin, (req, res) => {
  const bio = String(req.query.bio || 'CSRF-LAB-CHANGE').slice(0, 300);
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.user.id);
  res.json({ success: true, userId: req.user.id, bio, note: 'Intentional CSRF exercise: state-changing GET with no anti-CSRF token.' });
});

// A deliberately weak JWT exercise: base64url payload is trusted without signature validation.
app.get('/api/labs/jwt/issue', (req, res) => {
  const username = String(req.query.username || 'alice').trim().toLowerCase();
  const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'Synthetic lab user not found.' });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, username: user.username, role: user.role, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  res.json({ token, note: 'Training token only. The verifier below intentionally ignores signatures.' });
});

app.get('/api/labs/jwt/me', (req, res) => {
  const auth = String(req.get('authorization') || '');
  const token = auth.replace(/^Bearer\s+/i, '');
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return res.status(401).json({ error: 'Bearer token required.' });
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(Number(payload.sub));
    if (!user) return res.status(401).json({ error: 'Token subject not found.' });
    res.json({ user, role: payload.role, tokenSubject: payload.sub, note: 'JWT signature and expiry are intentionally not validated.' });
  } catch (_err) {
    res.status(400).json({ error: 'Malformed training token.' });
  }
});

app.get('/api/labs/shop/products', (_req, res) => {
  res.json([
    { id: 'mug', name: 'LinkUp Lab Mug', listedPrice: 12.00 },
    { id: 'notebook', name: 'LinkUp Lab Notebook', listedPrice: 8.50 }
  ]);
});

app.post('/api/labs/shop/checkout', requireLogin, (req, res) => {
  const productId = String(req.body.productId || 'mug').slice(0, 40);
  // Intentionally trust caller-supplied quantity and unit price; no payment is processed.
  const quantity = Number(req.body.quantity);
  const unitPrice = Number(req.body.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return res.status(400).json({ error: 'Quantity and unitPrice must be numeric.' });
  }
  const total = Math.round(quantity * unitPrice * 100) / 100;
  const result = db.prepare('INSERT INTO lab_orders (user_id, product_id, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, productId, quantity, unitPrice, total);
  res.status(201).json({ orderId: Number(result.lastInsertRowid), userId: req.user.id, productId, quantity, unitPrice, total, simulated: true, note: 'No payment or external service is involved.' });
});

app.get('/api/labs/shop/orders/:id', (req, res) => {
  const order = db.prepare('SELECT id, user_id, product_id, quantity, unit_price, total, created_at FROM lab_orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Lab order not found.' });
  // Intentional IDOR exercise on synthetic order records.
  res.json(order);
});

app.delete('/api/labs/shop/orders/:id', (req, res) => {
  const result = db.prepare('DELETE FROM lab_orders WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true, changes: result.changes });
});

// -------------------------------------------------------------
// Vulnerability 10: IDOR / BOLA (Insecure Direct Object Reference)
// Reachable via profile modals and /api/users/:id.
// Returns complete sensitive user details (emails, notes, roles) without access control.
// -------------------------------------------------------------
app.get('/api/users', (_req, res) => {
  const users = db.prepare('SELECT id, username, display_name, email, role, avatar_url, bio, location, website FROM users').all();
  res.json(users);
});

app.get('/api/users/:id', (req, res) => {
  const targetId = Number(req.params.id);
  const user = db.prepare(`
    SELECT id, username, display_name, email, role, avatar_url, cover_url, bio, location, website, note, created_at,
           (SELECT COUNT(*) FROM posts WHERE author_id = users.id) AS post_count,
           (SELECT COUNT(*) FROM follows WHERE followed_id = users.id) AS follower_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = users.id) AS following_count
    FROM users
    WHERE id = ?
  `).get(targetId);

  if (!user) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  // IDOR vulnerability: Returns private internal notes and administrative metadata without authorization check
  res.json(user);
});

app.get('/api/users/:id/posts', (req, res) => {
  const targetId = Number(req.params.id);
  const posts = db.prepare(`
    SELECT p.id, p.author_id, p.body, p.link, p.media_url, p.likes, p.created_at,
           u.username, u.display_name, u.avatar_url, u.role,
           (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.id) AS comment_count
    FROM posts p JOIN users u ON u.id = p.author_id
    WHERE p.author_id = ?
    ORDER BY p.id DESC
  `).all(targetId);
  res.json(posts);
});

// -------------------------------------------------------------
// Vulnerability 11: Weak Authentication & Session Handling
// Passwords stored in plain text; predictable sequential session cookie: 'lab-user-{id}'
// Missing HttpOnly/Secure flags; script-accessible for XSS-based hijacking.
// -------------------------------------------------------------
app.post('/api/auth/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase().slice(0, 30);
  const displayName = String(req.body.displayName || '').trim().slice(0, 60);
  const password = String(req.body.password || '').slice(0, 100);
  const email = String(req.body.email || `${username}@linkup.invalid`).trim().slice(0, 100);
  const bio = String(req.body.bio || 'New member of LinkUp!').trim().slice(0, 300);
  const avatarUrl = String(req.body.avatarUrl || '/assets/alice-profile.png').trim().slice(0, 200);

  if (!/^[a-z0-9_.-]{3,30}$/i.test(username) || password.length < 3 || !displayName) {
    return res.status(400).json({ error: 'Please choose an alphanumeric username (3–30 characters), a display name, and a password (at least 3 characters).' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO users (username, password, role, email, display_name, bio, avatar_url, cover_url, location, note)
      VALUES (?, ?, 'member', ?, ?, ?, ?, '/assets/alexandria-evening.png', 'Alexandria, Egypt', 'New registered member account.')
    `);
    const result = stmt.run(username, password, email, displayName, bio, avatarUrl);
    const userId = Number(result.lastInsertRowid);

    // Predictable session cookie, missing HttpOnly and Secure flags
    res.setHeader('Set-Cookie', `lab_session=lab-user-${userId}; Path=/; SameSite=Lax`);
    res.status(201).json({
      user: { id: userId, username, display_name: displayName, role: 'member', email, avatar_url: avatarUrl, bio },
      session: `lab-user-${userId}`
    });
  } catch (err) {
    res.status(409).json({ error: 'That username is already taken. Please choose another username.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const loginInput = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!loginInput || !password) {
    return res.status(400).json({ error: 'Please enter both your username and password.' });
  }

  // Case-insensitive match on either username or email
  const user = db.prepare(`
    SELECT id, username, display_name, email, role, avatar_url, cover_url, bio
    FROM users
    WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND password = ?
  `).get(loginInput, loginInput, password);

  if (!user) {
    return res.status(401).json({
      error: 'Invalid username or password. Check your credentials or try a demo account (e.g. alice / alice123).'
    });
  }

  // Set predictable, script-readable cookie
  res.setHeader('Set-Cookie', `lab_session=lab-user-${user.id}; Path=/; SameSite=Lax`);
  res.json({
    user,
    session: `lab-user-${user.id}`
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'lab_session=; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'No active session.' });
  }
  res.json({ user });
});

app.get('/api/profile', requireLogin, (req, res) => {
  res.json(req.user);
});

app.put('/api/profile', requireLogin, (req, res) => {
  const displayName = String(req.body.displayName || '').trim().slice(0, 60);
  const bio = String(req.body.bio || '').trim().slice(0, 300);
  const location = String(req.body.location || '').trim().slice(0, 100);
  const website = String(req.body.website || '').trim().slice(0, 200);

  if (!displayName) {
    return res.status(400).json({ error: 'Display name cannot be empty.' });
  }

  db.prepare('UPDATE users SET display_name = ?, bio = ?, location = ?, website = ? WHERE id = ?')
    .run(displayName, bio, location, website, req.user.id);

  const updated = db.prepare('SELECT id, username, display_name, email, role, avatar_url, cover_url, bio, location, website FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

// Social graph state (who the viewer follows)
app.get('/api/social/state', (req, res) => {
  const viewer = currentUser(req) || db.prepare("SELECT id FROM users WHERE username = 'alice'").get();
  const followingIds = db.prepare('SELECT followed_id FROM follows WHERE follower_id = ?').all(viewer.id).map(r => r.followed_id);
  res.json({
    userId: viewer.id,
    followingIds
  });
});

// -------------------------------------------------------------
// Bind Exclusively to 127.0.0.1
// -------------------------------------------------------------
app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`LinkUp Social Security Lab active on http://${HOST}:${PORT}`);
  console.log(`Safety Boundary: Bound strictly to 127.0.0.1 (Localhost only)`);
  console.log(`Demo accounts: alice/alice123, bob/bob123, admin/admin123`);
  console.log(`All mock services (SSRF, Files, Commands) remain contained.`);
  console.log(`=======================================================`);
});
