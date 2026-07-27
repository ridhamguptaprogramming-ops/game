# BattleZone – Multiplayer Battle Royale Prototype

A real-time multiplayer Battle Royale prototype built with HTML5 Canvas raycasting engine, Node.js/Express backend, and Socket.io WebSocket multiplayer.

## Features

### Phase 1: Single-Player (Complete)
- **5 Weapons**: Pistol, Shotgun, Sniper, Assault Rifle (AR), SMG
- **Grenades**: Frag, Smoke, Flashbang, Molotov
- **Weapon Attachments**: Scope, Red Dot, Suppressor, Extended Mag, Foregrip, Compensator, Laser Sight, Choke
- **Inventory System**: Backpack (Lv.0-3), Armor (Lv.1-3 with damage reduction), Healing Items
- **Vehicles**: Jeep, Bike, Car, Buggy with fuel system, speed, health
- **AI Bots**: 22 bots with patrol, loot, combat, cover, and healing behaviors
- **Shrinking Safe Zone**: Dynamic circle with damage scaling
- **Game Modes**: Solo, Duo, Squad, Team Deathmatch, Practice
- **3D Raycasting Engine**: Textured walls, sprites, weapon rendering
- **Audio Engine**: Procedural music, sound effects, zone warnings
- **2D/3D Tactical Maps**: Leaflet + Three.js
- **Touch Controls**: Mobile joystick + action buttons
- **Minimap**: Real-time radar with player, bots, vehicles, zone

### Phase 2: Backend (Complete)
- **REST API**: Express.js with JWT authentication
- **User System**: Register, Login, Profile management
- **Match Recording**: XP, coins, stats tracking
- **Leaderboard**: Kills, wins, K/D ratio, XP
- **Friends System**: Requests, accept, list
- **Inventory API**: Save/load player inventory
- **JSON File Database**: Simple persistent storage

### Phase 3: Multiplayer (Complete)
- **WebSocket Server**: Socket.io real-time communication
- **Room System**: Create/join/leave public/private rooms
- **Player Sync**: Position, angle, health, weapon state
- **Combat Sync**: Shooting, damage, death events
- **Chat System**: In-room text chat
- **Team System**: Duo/Squad team assignment
- **Ready/Start**: Lobby with countdown

## Project Structure

```
BattleZone/
├── index.html          # Main game client (single + multiplayer)
├── game.js             # Pasco Mansion horror game (separate)
├── pasco_backend.c     # C backend for Pasco Mansion (separate)
├── SECURITY.md
├── TODO.md
├── README.md
├── assets/
│   ├── Erangel.png
│   ├── Karakin.jpg
│   └── pubgmap.png
└── backend/
    ├── package.json
    ├── server.js        # Express + Socket.io backend
    └── data/            # JSON databases (auto-created)
        ├── users.json
        ├── matches.json
        ├── leaderboard.json
        └── rooms.json
```

## Quick Start

### 1. Single-Player Mode
Open `index.html` in a modern browser:
```
open index.html
```
Or serve with any HTTP server:
```
npx serve .
```

### 2. Start Backend Server
```bash
cd backend
npm install
npm start
```
Server runs on `http://localhost:3001`

### 3. Multiplayer Mode
1. Start the backend server (above)
2. Open `index.html` in TWO browser tabs
3. Click "Guest Login" or register
4. One player creates a room, the other joins
5. Both click "Ready" or host starts the game

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | No | Server health check |
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login user |
| GET | `/api/profile` | Yes | Get user profile |
| PUT | `/api/profile` | Yes | Update profile |
| POST | `/api/matches/submit` | Yes | Submit match result |
| GET | `/api/leaderboard` | No | Get leaderboard |
| GET | `/api/matches/history` | Yes | Get match history |
| GET | `/api/stats` | Yes | Get player stats |
| GET | `/api/friends` | Yes | Get friends list |
| POST | `/api/friends/request` | Yes | Send friend request |
| POST | `/api/friends/accept` | Yes | Accept friend request |
| GET | `/api/inventory` | Yes | Get inventory |
| PUT | `/api/inventory` | Yes | Update inventory |
| GET | `/api/rooms` | No | List game rooms |
| GET | `/api/online` | No | Online player count |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `auth` | Client→Server | Authenticate with JWT |
| `auth_success` | Server→Client | Auth successful |
| `create_room` | Client→Server | Create game room |
| `join_room` | Client→Server | Join existing room |
| `leave_room` | Client→Server | Leave current room |
| `room_update` | Server→Client | Room state update |
| `toggle_ready` | Client→Server | Toggle ready status |
| `start_game` | Client→Server | Host starts game |
| `game_started` | Server→Client | Game is live |
| `player_move` | Client→Server | Player position update |
| `player_moved` | Server→Client | Other player position |
| `player_shoot` | Client→Server | Player shot |
| `enemy_shot` | Server→Client | Enemy shot notification |
| `player_hit` | Client→Server | Player hit another |
| `player_damaged` | Server→Client | Damage event |
| `player_death` | Client→Server | Player died |
| `player_died` | Server→Client | Death notification |
| `game_finished` | Client→Server | Game ended |
| `game_ended` | Server→Client | Game results |
| `room_chat` | Bidirectional | In-room chat message |

## Game Controls

| Key | Action |
|-----|--------|
| W A S D | Move |
| Mouse | Look around |
| Left Click | Shoot |
| Space | Jump |
| C / Ctrl | Crouch |
| Shift | Sprint |
| R | Reload |
| 1-5 | Switch weapon |
| G | Throw grenade |
| F | Enter/Exit vehicle |
| I | Toggle inventory |
| TAB | Toggle map |
| M | Toggle audio / Switch map view |

## Tech Stack

- **Game Engine**: HTML5 Canvas, 3D Raycasting
- **Backend**: Node.js, Express.js, Socket.io
- **Database**: JSON file-based (Supabase-compatible schema)
- **Auth**: JWT (JSON Web Tokens)
- **Maps**: Leaflet (2D), Three.js (3D)
- **Audio**: Web Audio API

## Future Enhancements

- Supabase PostgreSQL integration
- 100-player matches
- Large open world map
- Dynamic weather & day/night cycle
- Helicopters, boats
- Battle pass & daily missions
- Character customization & skins
- Anti-cheat system
- Replay system
- Mobile app version

## License

MIT

