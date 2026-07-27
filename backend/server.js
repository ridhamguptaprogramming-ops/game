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
      user: sanitizeUser(user)
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---- API: Get Profile ----
app.get('/api/profile', authMiddleware, (req, res) => {
  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
  res.json({ ok: true, user: sanitizeUser(user) });
});

// ---- API: Update Profile ----
app.put('/api/profile', authMiddleware, (req, res) => {
  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

  const updates = {};
  if (req.body.avatar) updates.avatar = req.body.avatar;
  if (req.body.displayName) updates.displayName = req.body.displayName;

  const updated = usersDB.update(u => u.id === req.user.id, updates);
  res.json({ ok: true, user: sanitizeUser(updated) });
});

// ---- API: Submit Match Result ----
app.post('/api/matches/submit', authMiddleware, (req, res) => {
  try {
    const user = usersDB.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

    const { kills, deaths, damage, won, mode, duration } = req.body;
    if (kills === undefined) return res.status(400).json({ ok: false, message: 'Missing match data' });

    // Update user stats
    const matchRecord = {
      id: uuidv4(),
      userId: req.user.id,
      username: user.username,
      kills: kills || 0,
      deaths: deaths || 0,
      damage: damage || 0,
      won: Boolean(won),
      mode: mode || 'solo',
      duration: duration || 0,
      timestamp: new Date().toISOString()
    };
    matchesDB.push(matchRecord);

    // Calculate XP
    const xpEarned = (kills || 0) * 20 + (won ? 100 : 10) + Math.floor((duration || 0) / 60);
    const coinsEarned = (kills || 0) * 5 + (won ? 50 : 5);

    const statsUpdate = {
      kills: (user.kills || 0) + (kills || 0),
      wins: (user.wins || 0) + (won ? 1 : 0),
      matches: (user.matches || 0) + 1,
      totalKills: (user.totalKills || 0) + (kills || 0),
      totalDeaths: (user.totalDeaths || 0) + (deaths || 0),
      totalDamage: (user.totalDamage || 0) + (damage || 0),
      totalTimePlayed: (user.totalTimePlayed || 0) + (duration || 0),
      totalWins: (user.totalWins || 0) + (won ? 1 : 0),
      totalMatches: (user.totalMatches || 0) + 1,
      xp: (user.xp || 0) + xpEarned,
      coins: (user.coins || 0) + coinsEarned,
      level: Math.floor(((user.xp || 0) + xpEarned) / 300) + 1
    };

    const updated = usersDB.update(u => u.id === req.user.id, statsUpdate);

    // Update leaderboard
    updateLeaderboard(req.user.id, updated);

    res.json({
      ok: true,
      message: 'Match recorded',
      xpEarned,
      coinsEarned,
      level: updated.level,
      user: sanitizeUser(updated)
    });
  } catch (e) {
    console.error('Match submit error:', e);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// ---- API: Get Leaderboard ----
app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const sort = req.query.sort || 'kills'; // kills, wins, kd, xp

  let leaderboard = leaderboardDB.all();
  if (leaderboard.length === 0) {
    // Build from users
    leaderboard = usersDB.all().map(u => ({
      id: u.id,
      username: u.username,
      kills: u.totalKills || u.kills || 0,
      wins: u.totalWins || u.wins || 0,
      matches: u.totalMatches || u.matches || 0,
      kd: ((u.totalKills || 0) / Math.max(1, (u.totalDeaths || 1))).toFixed(2),
      xp: u.xp || 0,
      level: u.level || 1,
      avatar: u.avatar || 'default',
      lastActive: u.lastLogin || u.createdAt
    }));
    leaderboard = leaderboard.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
    leaderboardDB.data = leaderboard;
    leaderboardDB._save();
  }

  const result = leaderboard.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    ...entry
  }));

  res.json({ ok: true, leaderboard: result, total: leaderboard.length });
});

// ---- API: Get Match History ----
app.get('/api/matches/history', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const history = matchesDB.filter(m => m.userId === req.user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  res.json({ ok: true, history });
});

// ---- API: Get Stats ----
app.get('/api/stats', authMiddleware, (req, res) => {
  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

  const recentMatches = matchesDB.filter(m => m.userId === req.user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  res.json({
    ok: true,
    stats: {
      level: user.level || 1,
      xp: user.xp || 0,
      xpToNext: ((user.level || 1) * 300) - (user.xp || 0),
      kills: user.totalKills || user.kills || 0,
      wins: user.totalWins || user.wins || 0,
      matches: user.totalMatches || user.matches || 0,
      deaths: user.totalDeaths || 0,
      damage: user.totalDamage || 0,
      kd: ((user.totalKills || 0) / Math.max(1, (user.totalDeaths || 1))).toFixed(2),
      winRate: user.totalMatches > 0 ? ((user.totalWins || 0) / user.totalMatches * 100).toFixed(1) : '0.0',
      timePlayed: user.totalTimePlayed || 0,
      coins: user.coins || 0,
      recentMatches
    }
  });
});

// ---- API: Friends ----
app.get('/api/friends', authMiddleware, (req, res) => {
  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

  const friendList = (user.friends || []).map(friendId => {
    const friend = usersDB.find(u => u.id === friendId);
    return friend ? { id: friend.id, username: friend.username, avatar: friend.avatar, online: false } : null;
  }).filter(Boolean);

  const requests = (user.friendRequests || []).map(reqId => {
    const reqUser = usersDB.find(u => u.id === reqId);
    return reqUser ? { id: reqUser.id, username: reqUser.username, avatar: reqUser.avatar } : null;
  }).filter(Boolean);

  res.json({ ok: true, friends: friendList, requests });
});

app.post('/api/friends/request', authMiddleware, (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ ok: false, message: 'Username required' });

  const target = usersDB.find(u => u.username === username);
  if (!target) return res.status(404).json({ ok: false, message: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ ok: false, message: 'Cannot add yourself' });

  const user = usersDB.find(u => u.id === req.user.id);
  if ((user.friends || []).includes(target.id)) return res.status(409).json({ ok: false, message: 'Already friends' });
  if ((target.friendRequests || []).includes(req.user.id)) return res.status(409).json({ ok: false, message: 'Request already sent' });

  usersDB.update(u => u.id === target.id, {
    friendRequests: [...(target.friendRequests || []), req.user.id]
  });

  res.json({ ok: true, message: `Friend request sent to ${username}` });
});

app.post('/api/friends/accept', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, message: 'User ID required' });

  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

  if (!(user.friendRequests || []).includes(userId)) {
    return res.status(400).json({ ok: false, message: 'No request from this user' });
  }

  usersDB.update(u => u.id === req.user.id, {
    friends: [...(user.friends || []), userId],
    friendRequests: (user.friendRequests || []).filter(id => id !== userId)
  });

  const friend = usersDB.find(u => u.id === userId);
  if (friend) {
    usersDB.update(u => u.id === userId, {
      friends: [...(friend.friends || []), req.user.id]
    });
  }

  res.json({ ok: true, message: 'Friend request accepted' });
});

// ---- API: Inventory ----
app.get('/api/inventory', authMiddleware, (req, res) => {
  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });
  res.json({ ok: true, inventory: user.inventory || {} });
});

app.put('/api/inventory', authMiddleware, (req, res) => {
  const user = usersDB.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

  usersDB.update(u => u.id === req.user.id, { inventory: req.body.inventory });
  res.json({ ok: true, message: 'Inventory updated' });
});

// ---- Helper Functions ----
function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function updateLeaderboard(userId, user) {
  const existing = leaderboardDB.find(e => e.id === userId);
  const entry = {
    id: userId,
    username: user.username,
    kills: user.totalKills || user.kills || 0,
    wins: user.totalWins || user.wins || 0,
    matches: user.totalMatches || user.matches || 0,
    kd: ((user.totalKills || 0) / Math.max(1, (user.totalDeaths || 1))).toFixed(2),
    xp: user.xp || 0,
    level: user.level || 1,
    avatar: user.avatar || 'default',
    lastActive: new Date().toISOString()
  };

  if (existing) {
    leaderboardDB.update(e => e.id === userId, entry);
  } else {
    leaderboardDB.push(entry);
  }

  // Sort
  leaderboardDB.data.sort((a, b) => (b.kills || 0) - (a.kills || 0));
  leaderboardDB._save();
}

// ---- HTTP Server ----
const server = http.createServer(app);

// ---- Socket.io Setup ----
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ---- WebSocket State ----
const connectedPlayers = new Map(); // socketId -> { userId, username, room, inGame, team, ready }
const gameRooms = new Map(); // roomId -> { name, mode, players[], hostId, state, settings }

// ---- Socket.io Events ----
io.on('connection', (socket) => {
  console.log(`[WS] New connection: ${socket.id}`);

  // Auth
  socket.on('auth', (data) => {
    try {
      const { token } = data;
      if (!token) {
        socket.emit('auth_error', { message: 'Token required' });
        return;
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = usersDB.find(u => u.id === decoded.id);
      if (!user) {
        socket.emit('auth_error', { message: 'User not found' });
        return;
      }

      connectedPlayers.set(socket.id, {
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        room: null,
        inGame: false,
        team: null,
        ready: false
      });

      socket.emit('auth_success', {
        user: sanitizeUser(user),
        onlineCount: connectedPlayers.size
      });

      // Update online status
      io.emit('players_online', { count: connectedPlayers.size });
      console.log(`[WS] Authenticated: ${user.username}`);
    } catch (e) {
      socket.emit('auth_error', { message: 'Invalid token' });
    }
  });

  // Guest auth (for testing without registration)
  socket.on('guest_auth', (data) => {
    const username = data?.username || `Guest_${Math.random().toString(36).substr(2, 6)}`;
    const userId = `guest_${uuidv4()}`;

    connectedPlayers.set(socket.id, {
      socketId: socket.id,
      userId,
      username,
      room: null,
      inGame: false,
      team: null,
      ready: false,
      guest: true
    });

    socket.emit('auth_success', {
      user: {
        id: userId,
        username,
        level: 1,
        avatar: 'default',
        guest: true
      },
      onlineCount: connectedPlayers.size
    });

    io.emit('players_online', { count: connectedPlayers.size });
  });

  // Create Room
  socket.on('create_room', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return socket.emit('error', { message: 'Not authenticated' });

    const roomId = `room_${uuidv4().substr(0, 8)}`;
    const room = {
      id: roomId,
      name: data?.name || `${player.username}'s Room`,
      mode: data?.mode || 'solo',
      map: data?.map || 'erangel',
      maxPlayers: data?.mode === 'squad' ? 4 : data?.mode === 'duo' ? 2 : 1,
      players: [{ ...player, ready: false }],
      hostId: player.userId,
      state: 'lobby', // lobby, countdown, playing, finished
      settings: data?.settings || {
        bots: true,
        botCount: data?.mode === 'solo' ? 22 : data?.mode === 'duo' ? 20 : 18,
        friendlyFire: false,
        teamDamage: false
      }
    };

    gameRooms.set(roomId, room);
    player.room = roomId;
    socket.join(roomId);
    socket.emit('room_created', { room });
    io.to(roomId).emit('room_update', { room });
    io.emit('room_list', getPublicRooms());
    console.log(`[WS] Room created: ${roomId} by ${player.username}`);
  });

  // Join Room
  socket.on('join_room', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return socket.emit('error', { message: 'Not authenticated' });

    const { roomId } = data;
    if (!roomId) return socket.emit('error', { message: 'Room ID required' });

    const room = gameRooms.get(roomId);
    if (!room) return socket.emit('error', { message: 'Room not found' });
    if (room.players.length >= room.maxPlayers + 2) return socket.emit('error', { message: 'Room is full' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already started' });

    // Leave current room if any
    if (player.room && player.room !== roomId) {
      leaveRoom(socket, player);
    }

    room.players.push({ ...player, ready: false });
    player.room = roomId;
    socket.join(roomId);
    socket.emit('room_joined', { room });
    io.to(roomId).emit('room_update', { room });
    io.emit('room_list', getPublicRooms());
    console.log(`[WS] ${player.username} joined room ${roomId}`);
  });

  // Leave Room
  socket.on('leave_room', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    leaveRoom(socket, player);
  });

  // Room Chat
  socket.on('room_chat', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    io.to(player.room).emit('room_chat', {
      userId: player.userId,
      username: player.username,
      message: data?.message || '',
      timestamp: Date.now()
    });
  });

  // Toggle Ready
  socket.on('toggle_ready', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    const room = gameRooms.get(player.room);
    if (!room) return;

    const p = room.players.find(p => p.userId === player.userId);
    if (p) {
      p.ready = !p.ready;
      io.to(player.room).emit('room_update', { room });

      // Check if all ready
      const allReady = room.players.length >= 1 && room.players.every(p => p.ready);
      if (allReady && room.players.length >= room.maxPlayers) {
        startGame(socket, player.room);
      }
    }
  });

  // Start Game (host)
  socket.on('start_game', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;
    startGame(socket, player.room);
  });

  // Player position update (in-game)
  socket.on('player_move', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    const room = gameRooms.get(player.room);
    if (!room || room.state !== 'playing') return;

    // Broadcast to room (except sender)
    socket.to(player.room).emit('player_moved', {
      userId: player.userId,
      x: data.x,
      y: data.y,
      angle: data.angle,
      health: data.health,
      weapon: data.weapon,
      action: data.action // shoot, reload, jump, etc.
    });
  });

  // Player shoot
  socket.on('player_shoot', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    socket.to(player.room).emit('enemy_shot', {
      userId: player.userId,
      angle: data.angle,
      weapon: data.weapon,
      timestamp: Date.now()
    });
  });

  // Player hit
  socket.on('player_hit', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    // Damage another player
    const room = gameRooms.get(player.room);
    if (!room) return;

    const target = room.players.find(p => p.userId === data.targetId);
    if (target) {
      // Check team damage
      if (!room.settings.teamDamage && player.team && target.team && player.team === target.team) return;

      io.to(player.room).emit('player_damaged', {
        attackerId: player.userId,
        targetId: data.targetId,
        damage: data.damage,
        health: data.health,
        killed: data.killed
      });
    }
  });

  // Player death
  socket.on('player_death', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    io.to(player.room).emit('player_died', {
      userId: player.userId,
      killerId: data.killerId,
      username: player.username,
      killerName: data.killerName
    });
  });

  // Game finished
  socket.on('game_finished', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    const room = gameRooms.get(player.room);
    if (room) {
      room.state = 'finished';
      io.to(player.room).emit('game_ended', {
        winnerId: data.winnerId,
        winnerName: data.winnerName,
        stats: data.stats
      });
    }
  });

  // Spectate
  socket.on('spectate', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.room) return;

    const room = gameRooms.get(player.room);
    if (!room) return;

    if (data?.targetId) {
      socket.to(player.room).emit('spectate_view', {
        spectatorId: player.userId,
        targetId: data.targetId
      });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const player = connectedPlayers.get(socket.id);
    if (player) {
      console.log(`[WS] Disconnected: ${player.username} (${socket.id})`);
      leaveRoom(socket, player);
      connectedPlayers.delete(socket.id);
      io.emit('players_online', { count: connectedPlayers.size });
    }
  });
});

// ---- WebSocket Helper Functions ----
function leaveRoom(socket, player) {
  if (!player.room) return;

  const room = gameRooms.get(player.room);
  if (room) {
    room.players = room.players.filter(p => p.userId !== player.userId);
    if (room.players.length === 0) {
      gameRooms.delete(player.room);
    } else {
      // If host left, assign new host
      if (room.hostId === player.userId && room.players.length > 0) {
        room.hostId = room.players[0].userId;
      }
      io.to(player.room).emit('room_update', { room });
      // If game is live, notify
      if (room.state === 'playing') {
        io.to(player.room).emit('player_left', { userId: player.userId, username: player.username });
      }
    }
  }

  socket.leave(player.room);
  socket.emit('room_left');
  player.room = null;
  io.emit('room_list', getPublicRooms());
}

function getPublicRooms() {
  const rooms = [];
  for (const [id, room] of gameRooms) {
    if (room.state !== 'playing' || true) { // Show all rooms
      rooms.push({
        id,
        name: room.name,
        mode: room.mode,
        players: room.players.length,
        maxPlayers: room.maxPlayers,
        state: room.state,
        hostId: room.hostId
      });
    }
  }
  return rooms;
}

function startGame(socket, roomId) {
  const room = gameRooms.get(roomId);
  if (!room) return;

  room.state = 'countdown';
  io.to(roomId).emit('countdown', { seconds: 5 });

  setTimeout(() => {
    room.state = 'playing';
    const playerList = room.players.map(p => ({
      userId: p.userId,
      username: p.username,
      team: p.team || null
    }));

    // Assign teams
    if (room.mode === 'duo') {
      // Simple team assignment
      playerList.forEach((p, i) => { p.team = i % 2; });
    } else if (room.mode === 'squad') {
      playerList.forEach((p, i) => { p.team = Math.floor(i / 2); });
    }

    io.to(roomId).emit('game_started', {
      roomId,
      mode: room.mode,
      players: playerList,
      settings: room.settings
    });

    console.log(`[WS] Game started in room ${roomId} (${room.mode})`);
  }, 5000);
}

// ---- API: Room listing ----
app.get('/api/rooms', (req, res) => {
  res.json({ ok: true, rooms: getPublicRooms() });
});

// ---- API: Online count ----
app.get('/api/online', (req, res) => {
  res.json({ ok: true, count: connectedPlayers.size });
});

// ---- Start Server ----
server.listen(PORT, () => {
  console.log(`============================================`);
  console.log(`  BATTLEZONE BACKEND SERVER`);
  console.log(`  HTTP API:    http://localhost:${PORT}/api`);
  console.log(`  WebSocket:   ws://localhost:${PORT}`);
  console.log(`  Players DB:  ${usersDB.all().length} registered`);
  console.log(`  Matches DB:  ${matchesDB.all().length} recorded`);
  console.log(`============================================`);
});

