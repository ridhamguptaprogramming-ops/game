// ============================================================
//  BATTLEZONE BACKEND SERVER
//  Node.js + Express + Socket.io + JWT Auth + Supabase-compatible
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// ---- Config ----
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'battlezone-secret-key-2024';
const DB_PATH = path.join(__dirname, 'data');

// ---- Ensure data directory ----
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });

// ---- Simple JSON File Database ----
class JSONDB {
  constructor(name) {
    this.name = name;
    this.filePath = path.join(DB_PATH, `${name}.json`);
    this.data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (e) { console.error(`DB load error (${this.name}):`, e.message); }
    return this._default();
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) { console.error(`DB save error (${this.name}):`, e.message); }
  }

  _default() {
    if (this.name === 'users') return [];
    if (this.name === 'matches') return [];
    if (this.name === 'leaderboard') return [];
    if (this.name === 'rooms') return {};
    return {};
  }

  find(predicate) { return this.data.find(predicate); }
  filter(predicate) { return this.data.filter(predicate); }
  push(item) { this.data.push(item); this._save(); return item; }
  update(predicate, updates) {
    const idx = this.data.findIndex(predicate);
    if (idx >= 0) { this.data[idx] = { ...this.data[idx], ...updates }; this._save(); return this.data[idx]; }
    return null;
  }
  remove(predicate) {
    const idx = this.data.findIndex(predicate);
    if (idx >= 0) { const item = this.data.splice(idx,1)[0]; this._save(); return item; }
    return null;
  }
  all() { return this.data; }
  set(key, val) { this.data[key] = val; this._save(); }
  get(key) { return this.data[key]; }
}

// ---- Initialize Databases ----
const usersDB = new JSONDB('users');
const matchesDB = new JSONDB('matches');
const leaderboardDB = new JSONDB('leaderboard');
const roomsDB = new JSONDB('rooms');

// ---- Express Setup ----
const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json());

// ---- Auth Middleware ----
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'No token provided' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }
}

// ---- API: Health ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'BattleZone backend running', version: '1.0.0', time: new Date().toISOString() });
});

// ---- API: Register ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Username, email, and password required' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ ok: false, message: 'Username must be 3-20 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
    }

    // Check existing
    if (usersDB.find(u => u.username === username)) {
      return res.status(409).json({ ok: false, message: 'Username already taken' });
    }
    if (usersDB.find(u => u.email === email)) {
      return res.status(409).json({ ok: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      level: 1,
      xp: 0,
      coins: 0,
      kills: 0,
      wins: 0,
      matches: 0,
      damage: 0,
      accuracy: 0,
      avatar: 'default',
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      // Game stats
      totalKills: 0,
      totalDeaths: 0,
      totalWins: 0,
      totalMatches: 0,
      totalDamage: 0,
      totalTimePlayed: 0,
      // Inventory
      inventory: {
        weapon: 'pistol',
        armor: 0,
        backpack: 0,
        healingItems: { med_kit: 2, bandage: 5, energy_drink: 3 },
        attachments: [],
        cosmetics: []
      },
      // Friends
      friends: [],
      friendRequests: []
    };

    usersDB.push(user);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      ok: true,
      message: 'Registration successful',
      token,
      user: sanitizeUser(user)
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---- API: Login ----
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Username and password required' });
    }

    const user = usersDB.find(u => u.username === username || u.email === username);
    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    user.lastLogin = new Date().toISOString();
    usersDB.update(u => u.id === user.id, { lastLogin: user.lastLogin });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      ok: true,
      message: 'Login successful',
      token,
