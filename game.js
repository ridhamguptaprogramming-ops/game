const ROOMS = {
  FOYER: 'foyer',
  LIBRARY: 'library',
  DINING: 'dining',
  BASEMENT: 'basement',
  LAB: 'lab',
  STUDY: 'study',
  CHAPEL: 'chapel',
  RITUAL: 'ritual',
  GATE: 'gate'
};

const ROOM_NAMES = {
  [ROOMS.FOYER]: 'Grand Foyer',
  [ROOMS.LIBRARY]: 'Whispering Library',
  [ROOMS.DINING]: 'Dining Hall',
  [ROOMS.BASEMENT]: 'Basement Generator Room',
  [ROOMS.LAB]: "Jay Pasco's Laboratory",
  [ROOMS.STUDY]: 'Hidden Study',
  [ROOMS.CHAPEL]: 'Desecrated Chapel',
  [ROOMS.RITUAL]: 'Ritual Chamber',
  [ROOMS.GATE]: 'Front Gate'
};

const ROOM_MOODS = {
  [ROOMS.FOYER]: 'Dark abandoned house at night, thick fog, ringing phone',
  [ROOMS.LIBRARY]: 'Broken windows, ritual marks, eerie moving shadows',
  [ROOMS.DINING]: 'Suspense haze over shattered furniture and blood traces',
  [ROOMS.BASEMENT]: 'Cold metallic darkness with unstable cinematic flicker',
  [ROOMS.LAB]: 'Haunted science chamber with harsh ghost-lit reflections',
  [ROOMS.STUDY]: 'Hidden archive of fear, glass splinters, and whispers',
  [ROOMS.CHAPEL]: 'Possession altar under crimson horror lighting',
  [ROOMS.RITUAL]: 'Ultra-tense ritual void with violent spectral glow',
  [ROOMS.GATE]: 'Moonlit exit bars swallowed by fog'
};

const RANDOM_HORROR_EVENTS = [
  '[SFX] A glowing phone rings on the floor beside broken glass.',
  'A child-sized shadow sprints across the wall and disappears into the floor.',
  '[SFX] Three knocks sound directly behind your ear. No one is there.',
  'The lights die. In the dark, somebody whispers your full name.',
  'A blood trail appears under your boots, then evaporates into smoke.',
  'The house exhales. Every door clicks shut at once.',
  'Your reflection blinks one second too late in broken glass nearby.',
  '[SFX] Wet footsteps circle you, stopping when you try to count them.',
  'A hanging portrait turns itself around, revealing your own terrified face.'
];

const ui = {
  log: document.getElementById('log'),
  form: document.getElementById('commandForm'),
  input: document.getElementById('commandInput'),
  restartBtn: document.getElementById('restartBtn'),
  playerModeBtn: document.getElementById('playerModeBtn'),
  audioBtn: document.getElementById('audioBtn'),
  quickButtons: Array.from(document.querySelectorAll('.chip')),
  location: document.getElementById('uiLocation'),
  sanity: document.getElementById('uiSanity'),
  sanityFill: document.getElementById('sanityFill'),
  objective: document.getElementById('uiObjective'),
  inventory: document.getElementById('uiInventory'),
  scene: document.getElementById('scene3d'),
  cameraRig: document.getElementById('cameraRig'),
  sceneRoom: document.getElementById('sceneRoom'),
  sceneMood: document.getElementById('sceneMood'),
  sceneTarget: document.getElementById('sceneTarget'),
  scareText: document.getElementById('scareText')
};

let state;
let ambientAudio;
let sceneScareTimer;

function initState() {
  return {
    room: ROOMS.FOYER,
    sanity: 100,
    turn: 0,
    running: true,
    win: false,
    awaitingPrompt: null,
    playerMode: false,
    viewYaw: 0,
    viewPitch: 0,
    selectedExit: 0,
    moveHistory: [],

    visited: {
      [ROOMS.FOYER]: false,
      [ROOMS.LIBRARY]: false,
      [ROOMS.DINING]: false,
      [ROOMS.BASEMENT]: false,
      [ROOMS.LAB]: false,
      [ROOMS.STUDY]: false,
      [ROOMS.CHAPEL]: false,
      [ROOMS.RITUAL]: false,
      [ROOMS.GATE]: false
    },

    lantern: false,
    fuse: false,
    diary: false,
    chapelKey: false,
    silverDagger: false,
    masterKey: false,

    lanternAvailable: true,
    fuseAvailable: true,
    diaryAvailable: true,
    chapelKeyAvailable: true,
    daggerAvailable: true,

    generatorFixed: false,
    hiddenStudyOpen: false,
    keypadUnlocked: false,
    readDiary: false,
    bandeEncountered: false,
    bandeFreed: false,
    lunaMet: false,
    jayBanished: false,
    mirrorScareDone: false
  };
}

function normalize(text) {
  return String(text || '').trim().toLowerCase();
}

function contains(text, token) {
  return text.includes(token);
}

function printLine(text, klass = 'system') {
  const row = document.createElement('div');
  row.className = `line ${klass}`;
  row.textContent = text;
  ui.log.appendChild(row);
  ui.log.scrollTop = ui.log.scrollHeight;
}

function printBlock(text, klass = 'system') {
  String(text)
    .split('\n')
    .forEach((line) => {
      if (line.length === 0) {
        printLine(' ', klass);
      } else if (line.startsWith('[SFX]')) {
        printLine(line, 'sfx');
      } else {
        printLine(line, klass);
      }
    });
}

function currentObjective() {
  if (!state.generatorFixed) {
    return 'Find the fuse in the Dining Hall, then repair the generator in the Basement.';
  }
  if (!state.hiddenStudyOpen) {
    return 'Search the Library for a hidden mechanism behind the ritual symbols.';
  }
  if (!state.diary || !state.chapelKey) {
    return "Loot the Hidden Study for Jay's diary and the Chapel key.";
  }
  if (!state.bandeFreed) {
    return 'Enter the Chapel, claim the silver dagger, and free Bande from possession.';
  }
  if (!state.keypadUnlocked) {
    return "Use the Laboratory keypad code from Jay's diary (4 digits).";
  }
  if (!state.jayBanished) {
    return 'Perform the banishment ritual in the Ritual Chamber.';
  }
  return 'Reach the Front Gate and use the master key to escape Pasco Mansion.';
}

function inventoryItems() {
  const items = [];
  if (state.lantern) items.push('Rusty lantern');
  if (state.fuse) items.push('Heavy generator fuse');
  if (state.diary) items.push("Jay Pasco's blood-stained diary");
  if (state.chapelKey) items.push('Brass chapel key');
  if (state.silverDagger) items.push('Silver ritual dagger');
  if (state.masterKey) items.push('Iron master key (Front Gate)');
  return items;
}

function getAvailableExits() {
  const roomOrder = [
    ROOMS.LIBRARY,
    ROOMS.DINING,
    ROOMS.BASEMENT,
    ROOMS.LAB,
    ROOMS.STUDY,
    ROOMS.CHAPEL,
    ROOMS.RITUAL,
    ROOMS.GATE,
    ROOMS.FOYER
  ];

  return roomOrder
    .filter((roomId) => roomId !== state.room && canMove(roomId).ok)
    .map((roomId) => ({ roomId, label: ROOM_NAMES[roomId] }));
}

function updatePlayerTargetLabel() {
  if (!ui.sceneTarget) {
    return;
  }

  const exits = getAvailableExits();
  if (!state.playerMode) {
    ui.sceneTarget.textContent = 'Target Exit: -';
    return;
  }

  if (exits.length === 0) {
    ui.sceneTarget.textContent = 'Target Exit: none';
    return;
  }

  if (state.selectedExit >= exits.length) {
    state.selectedExit = 0;
  }

  ui.sceneTarget.textContent = `Target Exit: ${exits[state.selectedExit].label}`;
}

function applyPlayerLook() {
  if (!ui.cameraRig) {
    return;
  }

  if (!state.playerMode) {
    ui.cameraRig.style.transform = '';
    return;
  }

  ui.cameraRig.style.transform = `translateZ(-170px) rotateX(${1 + state.viewPitch}deg) rotateY(${state.viewYaw}deg)`;
}

function cycleTargetExit(direction) {
  const exits = getAvailableExits();
  if (exits.length === 0) {
    updatePlayerTargetLabel();
    return;
  }

  state.selectedExit = (state.selectedExit + direction + exits.length) % exits.length;
  updatePlayerTargetLabel();
}

function moveThroughTargetExit() {
  const exits = getAvailableExits();
  if (exits.length === 0) {
    printLine('No reachable exit in this room right now.', 'warn');
    return;
  }

  if (state.selectedExit >= exits.length) {
    state.selectedExit = 0;
  }

  const target = exits[state.selectedExit].roomId;
  const fromRoom = state.room;
  const moved = tryMove(target);
  if (moved) {
    state.moveHistory.push(fromRoom);
    updatePlayerTargetLabel();
  }
}

function moveBackInHistory() {
  if (state.moveHistory.length === 0) {
    printLine('No previous room in player history.', 'warn');
    return;
  }

  const previous = state.moveHistory.pop();
  const moved = tryMove(previous);
  if (!moved) {
    printLine('Backtrack blocked by the mansion layout.', 'warn');
  }
}

function togglePlayerMode() {
  state.playerMode = !state.playerMode;

  if (state.playerMode) {
    state.selectedExit = 0;
    ui.input.blur();
    if (ui.playerModeBtn) {
      ui.playerModeBtn.textContent = 'Exit 3D Player Mode';
    }
    if (ui.scene) {
      ui.scene.classList.add('player-mode');
    }
    printBlock(
      '[Player Mode ON]\\n' +
        'Controls: A/D change target exit, W or Enter move, S backtrack.\\n' +
        'Arrow keys or mouse move to look around.'
    );
  } else {
    if (ui.playerModeBtn) {
      ui.playerModeBtn.textContent = 'Enable 3D Player Mode';
    }
    if (ui.scene) {
      ui.scene.classList.remove('player-mode');
    }
    if (document.pointerLockElement === ui.scene) {
      document.exitPointerLock();
    }
    ui.input.focus();
    printLine('[Player Mode OFF]');
  }

  updatePlayerTargetLabel();
  applyPlayerLook();
}

function updateScene() {
  if (!ui.scene) {
    return;
  }

  Object.values(ROOMS).forEach((roomKey) => {
    ui.scene.classList.remove(`room-${roomKey}`);
  });

  ui.scene.classList.add(`room-${state.room}`);
  ui.scene.classList.toggle('power-on', state.generatorFixed);
  ui.scene.classList.toggle('banished', state.jayBanished);
  ui.scene.classList.toggle('player-mode', state.playerMode);

  if (ui.sceneRoom) {
    ui.sceneRoom.textContent = ROOM_NAMES[state.room];
  }
  if (ui.sceneMood) {
    ui.sceneMood.textContent = ROOM_MOODS[state.room];
  }

  updatePlayerTargetLabel();
  applyPlayerLook();
}

function scenePulse(message) {
  if (!ui.scene) {
    return;
  }

  if (ui.scareText && message) {
    ui.scareText.textContent = String(message).slice(0, 64);
  }

  ui.scene.classList.add('scene-scare');
  window.clearTimeout(sceneScareTimer);
  sceneScareTimer = window.setTimeout(() => {
    ui.scene.classList.remove('scene-scare');
  }, 720);
}

function updateSidebar() {
  ui.location.textContent = ROOM_NAMES[state.room];
  ui.sanity.textContent = `${state.sanity}/100`;
  ui.sanityFill.style.width = `${Math.max(0, state.sanity)}%`;
  ui.objective.textContent = currentObjective();

  ui.inventory.innerHTML = '';
  const items = inventoryItems();
  if (items.length === 0) {
    const li = document.createElement('li');
    li.textContent = '(empty)';
    ui.inventory.appendChild(li);
  } else {
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      ui.inventory.appendChild(li);
    });
  }

  document.body.classList.toggle('low-sanity', state.sanity <= 35);
  updateScene();
}

function loseSanity(amount, reason) {
  if (amount <= 0 || !state.running) {
    return;
  }

  state.sanity = Math.max(0, state.sanity - amount);
  printLine(`[Sanity -${amount}] ${reason}`, 'blood');

  if (state.sanity <= 0) {
    printBlock(
      "Your vision fractures into static shadows. Jay Pasco's whisper crawls inside your skull.\n" +
        'You drop to your knees as Pasco Mansion claims its next mind.',
      'end'
    );
    endGame(false);
  }

  updateSidebar();
}

function describeRoom(roomId) {
  printLine(`[${ROOM_NAMES[roomId]}]`, 'warn');

  switch (roomId) {
    case ROOMS.FOYER:
      printBlock(
        'Flickering chandelier light jerks across peeled wallpaper and blood-smudged portraits.\n' +
          'Fog leaks under the front door while broken furniture forms black silhouettes in the corners.'
      );
      break;
    case ROOMS.LIBRARY:
      printBlock(
        'Towering shelves lean like corpses. Blood stains soak the carpet beneath a wall of ritual symbols.\n' +
          'A stone raven statue watches from the center bookshelf, its beak pointed at your throat.'
      );
      break;
    case ROOMS.DINING:
      printBlock(
        'The dining hall is a graveyard of shattered chairs and snapped table legs.\n' +
          'Cold fog crawls across cracked tiles as metal groans echo from somewhere below.'
      );
      break;
    case ROOMS.BASEMENT:
      printBlock(
        'Pipes sweat black water in the basement. The generator sits dead, wrapped in cables like veins.\n' +
          'Each breath tastes of rust and ozone; your lantern beam trembles in the fog.'
      );
      break;
    case ROOMS.LAB:
      printBlock(
        "Beakers, scalpels, and ruined monitors clutter Jay Pasco's laboratory.\n" +
          'A steel door marked with occult equations leads to a keypad-protected chamber.'
      );
      break;
    case ROOMS.STUDY:
      printBlock(
        'A narrow hidden room lined with anatomical sketches, ritual diagrams, and dried blood handprints.\n' +
          'An iron desk holds a diary and a tarnished brass key under a skull-shaped lamp.'
      );
      break;
    case ROOMS.CHAPEL:
      printBlock(
        'The chapel altar is carved with symbols cut into old blood.\n' +
          'Bande hangs near the pews, jerking against chains while a second voice speaks through him.'
      );
      break;
    case ROOMS.RITUAL:
      printBlock(
        'Candles burn without flame around a giant sigil. The air vibrates with whispers and static.\n' +
          "Jay Pasco's shadow drifts above the floor, not fully human, not fully dead."
      );
      break;
    case ROOMS.GATE:
      printBlock(
        'The front gate is wrapped in rusted chains and ritual wire. Night fog hides the road beyond.\n' +
          'Something inside the mansion watches your back every second you remain here.'
      );
      break;
    default:
      break;
  }
}

function printExits(roomId) {
  const exits = [];

  switch (roomId) {
    case ROOMS.FOYER:
      exits.push('library');
      exits.push('dining hall');
      exits.push(`laboratory${state.generatorFixed ? '' : ' (locked: no power)'}`);
      exits.push(`chapel${state.chapelKey ? '' : ' (locked)'}`);
      exits.push('front gate');
      break;
    case ROOMS.LIBRARY:
      exits.push('grand foyer');
      exits.push(`hidden study${state.hiddenStudyOpen ? '' : ' (hidden)'}`);
      break;
    case ROOMS.DINING:
      exits.push('grand foyer');
      exits.push('basement');
      break;
    case ROOMS.BASEMENT:
      exits.push('dining hall');
      break;
    case ROOMS.LAB:
      exits.push('grand foyer');
      exits.push(`ritual chamber${state.keypadUnlocked ? '' : ' (sealed by keypad)'}`);
      break;
    case ROOMS.STUDY:
      exits.push('whispering library');
      break;
    case ROOMS.CHAPEL:
      exits.push('grand foyer');
      break;
    case ROOMS.RITUAL:
      exits.push('laboratory');
      break;
    case ROOMS.GATE:
      exits.push('grand foyer');
      break;
    default:
      break;
  }

  printLine('Exits from here:', 'warn');
  exits.forEach((entry) => printLine(`- ${entry}`));
}

function onFirstVisit(roomId) {
  switch (roomId) {
    case ROOMS.FOYER:
      printBlock('A ghost shadow crosses the second-floor balcony, then vanishes.');
      loseSanity(4, 'The mansion reacts to your arrival.');
      scenePulse('Ghost shadow detected');
      break;
    case ROOMS.LIBRARY:
      printBlock('A book falls by itself. Inside, one page repeats your name in wet ink.');
      loseSanity(5, 'You are not the first target here.');
      break;
    case ROOMS.DINING:
      printBlock('[SFX] Glass crunches under your boots. Something drags across the ceiling above you.', 'sfx');
      break;
    case ROOMS.BASEMENT:
      printBlock('The basement lights flash once, revealing a hanging silhouette behind you.');
      loseSanity(6, 'When you turn, the silhouette is gone.');
      scenePulse('Something moved behind you');
      break;
    case ROOMS.LAB:
      if (!state.lunaMet) {
        state.lunaMet = true;
        printBlock(
          'Luna steps out from behind a cabinet, shaking but alert.\n' +
            '"Don\'t scream. Jay Pasco is everywhere. Bande is possessed in the chapel."\n' +
            '"There is a hidden room in the library. Start there if you want to live."'
        );
      }
      break;
    case ROOMS.STUDY:
      printBlock('You discover surgical photos labeled: SUBJECT NEXT. The photo is you.');
      loseSanity(7, 'Jay Pasco knew you were coming.');
      break;
    case ROOMS.CHAPEL:
      if (!state.bandeEncountered) {
        state.bandeEncountered = true;
        printBlock(
          "Bande's eyes snap open: one normal, one pitch black.\n" +
            "His mouth stretches into an impossible grin as he whispers in Jay Pasco's voice."
        );
        loseSanity(8, 'Possession is real. And close.');
        scenePulse('Bande is possessed');
      }
      break;
    case ROOMS.RITUAL:
      printBlock("Jay Pasco's spirit circles you.\n\"You were selected before you stepped inside, Player.\"");
      loseSanity(10, 'The ritual chamber amplifies fear.');
      scenePulse('Jay Pasco manifests');
      break;
    case ROOMS.GATE:
      printBlock('The chain lock trembles as if breathing. Escape is near, but not guaranteed.');
      break;
    default:
      break;
  }
}

function enterRoom(roomId, withTransition = true) {
  state.room = roomId;

  if (withTransition) {
    printLine(`You move into ${ROOM_NAMES[roomId]}...`, 'player');
  }

  describeRoom(roomId);

  if (!state.visited[roomId]) {
    state.visited[roomId] = true;
    onFirstVisit(roomId);
  }

  if (state.running) {
    printExits(roomId);
  }

  updateSidebar();
}

function parseDestination(command) {
  if (contains(command, 'foyer')) return ROOMS.FOYER;
  if (contains(command, 'library')) return ROOMS.LIBRARY;
  if (contains(command, 'dining')) return ROOMS.DINING;
  if (contains(command, 'basement') || contains(command, 'cellar')) return ROOMS.BASEMENT;
  if (contains(command, 'lab')) return ROOMS.LAB;
  if (contains(command, 'study') || contains(command, 'hidden')) return ROOMS.STUDY;
  if (contains(command, 'chapel')) return ROOMS.CHAPEL;
  if (contains(command, 'ritual') || contains(command, 'chamber')) return ROOMS.RITUAL;
  if (contains(command, 'gate') || contains(command, 'exit')) return ROOMS.GATE;
  return null;
}

function canMove(target) {
  const room = state.room;

  if (room === ROOMS.FOYER) {
    if ([ROOMS.LIBRARY, ROOMS.DINING, ROOMS.GATE].includes(target)) {
      return { ok: true };
    }
    if (target === ROOMS.LAB) {
      if (!state.generatorFixed) {
        return { ok: false, reason: 'The laboratory door is electronically sealed. No power.' };
      }
      return { ok: true };
    }
    if (target === ROOMS.CHAPEL) {
      if (!state.chapelKey) {
        return { ok: false, reason: 'The chapel door is locked with a brass mechanism.' };
      }
      return { ok: true };
    }
    return { ok: false, reason: 'You cannot reach that from the foyer.' };
  }

  if (room === ROOMS.LIBRARY) {
    if (target === ROOMS.FOYER) return { ok: true };
    if (target === ROOMS.STUDY) {
      if (!state.hiddenStudyOpen) {
        return { ok: false, reason: 'You only see a wall of shelves. No obvious passage.' };
      }
      return { ok: true };
    }
    return { ok: false, reason: 'Only the foyer and hidden study connect to this room.' };
  }

  if (room === ROOMS.DINING) {
    if (target === ROOMS.FOYER) return { ok: true };
    if (target === ROOMS.BASEMENT) {
      if (!state.lantern) {
        return { ok: false, reason: 'The basement is pitch black. You need a light source.' };
      }
      return { ok: true };
    }
    return { ok: false, reason: 'You can only go to the foyer or basement from here.' };
  }

  if (room === ROOMS.BASEMENT) {
    if (target === ROOMS.DINING) return { ok: true };
    return { ok: false, reason: 'The only staircase leads back to the dining hall.' };
  }

  if (room === ROOMS.LAB) {
    if (target === ROOMS.FOYER) return { ok: true };
    if (target === ROOMS.RITUAL) {
      if (!state.keypadUnlocked) {
        return { ok: false, reason: 'The ritual chamber remains sealed by a keypad lock.' };
      }
      return { ok: true };
    }
    return { ok: false, reason: 'The lab connects only to the foyer and ritual chamber.' };
  }

  if (room === ROOMS.STUDY) {
    if (target === ROOMS.LIBRARY) return { ok: true };
    return { ok: false, reason: 'A single narrow passage leads back to the library.' };
  }

  if (room === ROOMS.CHAPEL) {
    if (target === ROOMS.FOYER) return { ok: true };
    return { ok: false, reason: 'The chapel has one exit: back to the foyer.' };
  }

  if (room === ROOMS.RITUAL) {
    if (target === ROOMS.LAB) return { ok: true };
    return { ok: false, reason: 'The sigils trap you unless you retreat to the lab.' };
  }

  if (room === ROOMS.GATE) {
    if (target === ROOMS.FOYER) return { ok: true };
    return { ok: false, reason: 'The foggy road is blocked. You can only return to the foyer.' };
  }

  return { ok: false, reason: 'You freeze in place.' };
}

function tryMove(target) {
  const result = canMove(target);
  if (!result.ok) {
    printLine(result.reason, 'warn');
    return false;
  }

  enterRoom(target, true);
  return true;
}

function readDiary() {
  if (!state.diary) {
    printLine("You do not have Jay Pasco's diary.", 'warn');
    return false;
  }

  printBlock(
    'You open the blood-stained diary. Many pages are fused with dried crimson wax.\n' +
      'One surviving entry reads:\n' +
      '"Bande is unstable. Luna resists. The Player arrives soon."\n' +
      '"Lab seal code: 7391."\n' +
      '"Banishment phrase: Aeterna Noctis Vinculum Frangere."\n' +
      '"Only silver can sever possession."'
  );

  state.readDiary = true;
  return true;
}

function flashScare() {
  document.body.classList.add('scare');
  setTimeout(() => {
    document.body.classList.remove('scare');
  }, 760);
}

function triggerRandomHorror() {
  if (!state.running || state.turn < 2) return;
  if (Math.random() >= 0.22) return;

  printLine('--- JUMP SCARE ---', 'blood');
  const event = RANDOM_HORROR_EVENTS[Math.floor(Math.random() * RANDOM_HORROR_EVENTS.length)];
  printLine(event, event.startsWith('[SFX]') ? 'sfx' : 'blood');
  scenePulse(event.startsWith('[SFX]') ? 'Unseen presence nearby' : event.replace('.', ''));
  loseSanity(3 + Math.floor(Math.random() * 7), 'The mansion feeds on fear.');
  flashScare();
}

function handleInspect(command) {
  if (state.room === ROOMS.FOYER) {
    if (contains(command, 'mirror')) {
      if (!state.mirrorScareDone) {
        state.mirrorScareDone = true;
        printBlock(
          "The cracked mirror shows Jay Pasco standing behind you with a surgeon's mask.\n" +
            'You spin around. Empty corridor. When you face the mirror again, only your face remains.'
        );
        loseSanity(9, 'Your reflection cannot be trusted.');
      } else {
        printLine('The mirror is fractured into hundreds of tiny eyes.');
      }
      return true;
    }
    if (contains(command, 'blood') || contains(command, 'floor') || contains(command, 'trail')) {
      printLine('The blood trail is old, smeared toward the library, and interrupted by bare footprints.');
      return true;
    }
    if (contains(command, 'light') || contains(command, 'chandelier')) {
      printLine('The chandelier pulses like a heartbeat, then flickers to near-darkness.');
      return true;
    }
    printLine('Dust, fog, and old grief hang in the foyer. Something keeps watching from above.');
    return true;
  }

  if (state.room === ROOMS.LIBRARY) {
    if (contains(command, 'raven') || contains(command, 'statue') || contains(command, 'bookshelf')) {
      if (!state.hiddenStudyOpen) {
        state.hiddenStudyOpen = true;
        printBlock("You twist the raven's head. A hidden shelf slides aside with a bone-like crack.\nA narrow passage opens: the Hidden Study.");
      } else {
        printLine('The secret passage behind the raven statue remains open.');
      }
      return true;
    }
    if (contains(command, 'symbol') || contains(command, 'ritual') || contains(command, 'wall')) {
      printBlock('The symbols are drawn with blood and lab ink. One line repeats:\n"Science proved the soul. Fear controls it."');
      return true;
    }
    if (contains(command, 'blood') || contains(command, 'stain')) {
      printLine('In the blood stains, somebody scratched one word with a fingernail: LUNA.');
      return true;
    }
    printLine('Every shelf creaks as if breathing. A hidden mechanism might be nearby.');
    return true;
  }

  if (state.room === ROOMS.DINING) {
    if (contains(command, 'cabinet') || contains(command, 'drawer') || contains(command, 'sideboard')) {
      if (state.lanternAvailable || state.fuseAvailable) {
        printLine('Inside the sideboard you see:');
        if (state.lanternAvailable) printLine('- a rusty lantern');
        if (state.fuseAvailable) printLine('- a heavy generator fuse');
      } else {
        printLine('The sideboard is empty except for broken plates and mold.');
      }
      return true;
    }
    if (contains(command, 'table') || contains(command, 'chair') || contains(command, 'furniture')) {
      printLine('The furniture is smashed as if dozens of people panicked at once.');
      return true;
    }
    printLine('The room smells of damp wood and old copper. Basement noises pulse beneath the floor.');
    return true;
  }

  if (state.room === ROOMS.BASEMENT) {
    if (contains(command, 'generator') || contains(command, 'fuse') || contains(command, 'panel')) {
      if (!state.generatorFixed) {
        printLine('The generator is missing a core fuse. It might restore power to locked doors.');
      } else {
        printLine('The repaired generator rattles violently, feeding unstable power through the mansion.');
      }
      return true;
    }
    printLine('Moist walls glisten in your lantern beam. Shadows keep shifting in the pipework.');
    return true;
  }

  if (state.room === ROOMS.LAB) {
    if (contains(command, 'keypad') || contains(command, 'console')) {
      if (state.keypadUnlocked) {
        printLine('The keypad reads: ACCESS GRANTED. The ritual chamber is open.');
      } else {
        printLine('A numeric keypad blocks the ritual chamber. Use `use keypad` to enter code.');
      }
      return true;
    }
    if (contains(command, 'luna')) {
      if (state.lunaMet) {
        printLine('Luna clutches a flashlight and old notes, forcing herself to stay calm.');
      } else {
        printLine('No one answers.');
      }
      return true;
    }
    printLine('Chemical jars are labeled with names, not formulas. One label reads: BANDE.');
    return true;
  }

  if (state.room === ROOMS.STUDY) {
    if (contains(command, 'desk') || contains(command, 'locker') || contains(command, 'lamp')) {
      if (state.diaryAvailable || state.chapelKeyAvailable) {
        printLine('On the desk you can take:');
        if (state.diaryAvailable) printLine("- Jay Pasco's diary");
        if (state.chapelKeyAvailable) printLine('- brass chapel key');
      } else {
        printLine('The desk has been cleared. Only ash and dried wax remain.');
      }
      return true;
    }
    if (contains(command, 'symbol') || contains(command, 'diagram') || contains(command, 'wall')) {
      printLine('One diagram shows a human silhouette split into two: mind and host.');
      printLine('Beside it: "Sever with silver. Bind with phrase."');
      return true;
    }
    printLine('The hidden study feels colder than the rest of the mansion, as if buried underground.');
    return true;
  }

  if (state.room === ROOMS.CHAPEL) {
    if (contains(command, 'altar') || contains(command, 'reliquary') || contains(command, 'cross')) {
      if (state.daggerAvailable) {
        printLine('Inside the cracked reliquary lies a silver ritual dagger.');
      } else {
        printLine('The reliquary is empty, lined with fresh blood fingerprints.');
      }
      return true;
    }
    if (contains(command, 'bande')) {
      if (!state.bandeFreed) {
        printLine("Bande convulses against the chains. His voice overlays with Jay Pasco's:");
        printLine('"Player... your body will be my final experiment."', 'blood');
      } else {
        printLine('Bande is weak but conscious, breathing hard and trying not to look at the shadows.');
      }
      return true;
    }
    if (contains(command, 'symbol') || contains(command, 'stained') || contains(command, 'glass')) {
      printLine('A stained-glass panel depicts the phrase: AETERNA NOCTIS VINCULUM FRANGERE.');
      return true;
    }
    printLine('Candles relight themselves whenever you look away from the altar.');
    return true;
  }

  if (state.room === ROOMS.RITUAL) {
    if (contains(command, 'jay') || contains(command, 'spirit') || contains(command, 'shadow')) {
      if (!state.jayBanished) {
        printLine('Jay Pasco\'s spirit distorts your voice: "I improved death. I perfected fear."', 'blood');
      } else {
        printLine('Only burned sigils remain where Jay Pasco once hovered.');
      }
      return true;
    }
    if (contains(command, 'circle') || contains(command, 'sigil') || contains(command, 'symbol')) {
      printLine('The circle is incomplete without a proper chant. This is where the final ritual happens.');
      return true;
    }
    printLine("The chamber hums through your bones. You are standing at the center of Jay's obsession.");
    return true;
  }

  if (state.room === ROOMS.GATE) {
    if (contains(command, 'lock') || contains(command, 'chain') || contains(command, 'gate')) {
      if (!state.masterKey) {
        printLine('The chain lock has one keyway: large, old, and unforgiving. You need the master key.');
      } else {
        printLine('The master key fits this lock. If Jay still exists, opening it could be fatal.');
      }
      return true;
    }
    printLine('Beyond the bars, the road is silent. No wind. No animals. Only waiting darkness.');
    return true;
  }

  return false;
}

function handleTake(command) {
  if ((contains(command, 'lantern') || contains(command, 'light')) && state.room === ROOMS.DINING) {
    if (!state.lanternAvailable) {
      printLine('You already took the lantern.', 'warn');
      return true;
    }
    state.lantern = true;
    state.lanternAvailable = false;
    printLine('You take the rusty lantern. Its beam is weak, but better than darkness.');
    updateSidebar();
    return true;
  }

  if (contains(command, 'fuse') && state.room === ROOMS.DINING) {
    if (!state.fuseAvailable) {
      printLine('The fuse is already gone.', 'warn');
      return true;
    }
    state.fuse = true;
    state.fuseAvailable = false;
    printLine('You pocket the heavy generator fuse.');
    updateSidebar();
    return true;
  }

  if ((contains(command, 'diary') || contains(command, 'journal')) && state.room === ROOMS.STUDY) {
    if (!state.diaryAvailable) {
      printLine('You already took the diary.', 'warn');
      return true;
    }
    state.diary = true;
    state.diaryAvailable = false;
    printLine("You take Jay Pasco's diary. The cover is warm, as if alive.");
    updateSidebar();
    return true;
  }

  if ((contains(command, 'chapel key') || contains(command, 'brass key') || contains(command, 'key')) && state.room === ROOMS.STUDY) {
    if (!state.chapelKeyAvailable) {
      printLine('The brass key is already gone.', 'warn');
      return true;
    }
    state.chapelKey = true;
    state.chapelKeyAvailable = false;
    printLine('You take the brass chapel key.');
    updateSidebar();
    return true;
  }

  if ((contains(command, 'dagger') || contains(command, 'silver')) && state.room === ROOMS.CHAPEL) {
    if (!state.daggerAvailable) {
      printLine('You already took the silver dagger.', 'warn');
      return true;
    }
    state.silverDagger = true;
    state.daggerAvailable = false;
    printLine('You grip the silver dagger. Its blade is etched with anti-possession sigils.');
    updateSidebar();
    return true;
  }

  printLine('You cannot take that right now.', 'warn');
  return false;
}

function handleTalk(command) {
  if (contains(command, 'luna')) {
    if (!state.lunaMet) {
      printLine('No answer. Only static and distant breathing.');
      return true;
    }
    if (state.room !== ROOMS.LAB) {
      printLine('Luna is not here. Her last whisper echoes from the lab.');
      return true;
    }

    if (!state.hiddenStudyOpen) {
      printLine('Luna: "Check the library raven statue. There\'s a hidden room behind it."');
    } else if (!state.diary || !state.chapelKey) {
      printLine('Luna: "Take the diary and chapel key from that hidden study. We need both."');
    } else if (!state.bandeFreed) {
      printLine('Luna: "Bande is still in the chapel. Use silver and the phrase from the diary."');
    } else if (!state.keypadUnlocked) {
      printLine('Luna: "The diary code opens this keypad. Enter 7391."');
    } else if (!state.jayBanished) {
      printLine('Luna: "I\'ll hold the door. Go perform the ritual now."');
    } else {
      printLine('Luna: "You did it. Don\'t stop. Escape through the front gate."');
    }
    return true;
  }

  if (contains(command, 'bande')) {
    if (state.room !== ROOMS.CHAPEL) {
      printLine('Bande is not here.');
      return true;
    }
    if (!state.bandeFreed) {
      printLine('Bande\'s possessed voice hisses: "Your fear tastes familiar."', 'blood');
      loseSanity(5, 'The voice is layered with something inhuman.');
    } else {
      printLine('Bande: "I can hear Jay even now. End him in the ritual chamber, then run."');
    }
    return true;
  }

  printLine('You speak into the dark. The mansion answers with distant laughter.');
  return true;
}

function handleListen() {
  switch (state.room) {
    case ROOMS.FOYER:
      printLine('[SFX] Floorboards pop above you. Something drags slowly across the balcony.', 'sfx');
      break;
    case ROOMS.LIBRARY:
      printLine('[SFX] Pages turn by themselves, one shelf at a time.', 'sfx');
      break;
    case ROOMS.DINING:
      printLine('[SFX] Metal clanks below. The basement generator clicks like teeth.', 'sfx');
      break;
    case ROOMS.BASEMENT:
      printLine('[SFX] Steam hisses through pipes like whispering voices.', 'sfx');
      break;
    case ROOMS.LAB:
      printLine('[SFX] Broken monitors emit pulses of static and distorted breathing.', 'sfx');
      break;
    case ROOMS.STUDY:
      printLine('[SFX] Wet scratching from inside the walls spells your name in rhythm.', 'sfx');
      break;
    case ROOMS.CHAPEL:
      printLine('[SFX] Bande mutters prayers backward while chains creak under strain.', 'sfx');
      break;
    case ROOMS.RITUAL:
      printLine('[SFX] Dozens of voices chant beneath human hearing. You still understand every word.', 'sfx');
      loseSanity(3, "The chamber's chant invades your thoughts.");
      break;
    case ROOMS.GATE:
      printLine('[SFX] Silence. Then one breath directly behind your neck.', 'sfx');
      break;
    default:
      break;
  }
  return true;
}

function startPrompt(type) {
  state.awaitingPrompt = type;
  if (type === 'keypad') {
    printLine('Enter 4-digit code:', 'warn');
    ui.input.placeholder = 'Enter code...';
  } else if (type === 'ritual') {
    printLine('Type the banishment phrase:', 'warn');
    ui.input.placeholder = 'Type ritual phrase...';
  }
}

function clearPrompt() {
  state.awaitingPrompt = null;
  ui.input.placeholder = 'Type a command... (help)';
}

function handlePromptInput(command) {
  if (state.awaitingPrompt === 'keypad') {
    clearPrompt();
    if (command === '7391') {
      state.keypadUnlocked = true;
      printLine('ACCESS GRANTED. The ritual chamber seal opens with a metallic scream.', 'warn');
      updateSidebar();
    } else {
      printLine('ACCESS DENIED. A shock pulse jumps through the keypad into your hands.', 'blood');
      loseSanity(8, 'Wrong code.');
    }
    return true;
  }

  if (state.awaitingPrompt === 'ritual') {
    clearPrompt();
    const ok = contains(command, 'aeterna') && contains(command, 'noctis') && contains(command, 'vinculum') && contains(command, 'frangere');
    if (ok) {
      state.jayBanished = true;
      printBlock(
        "The sigils ignite white. Jay Pasco's form tears apart into shards of static and ash.\n" +
          'Luna\'s voice cracks over the roar: "Now! Get to the gate!"',
        'end'
      );
      updateSidebar();
    } else {
      printLine('The wrong words twist the room sideways. Jay Pasco grins through your own reflection.', 'blood');
      loseSanity(16, 'The failed chant backfires.');
    }
    return true;
  }

  return false;
}

function handleUse(command) {
  if (contains(command, 'fuse')) {
    if (state.room !== ROOMS.BASEMENT) {
      printLine('You need to be at the basement generator to use that fuse.', 'warn');
      return true;
    }
    if (!state.fuse) {
      printLine('You do not have a fuse.', 'warn');
      return true;
    }
    if (state.generatorFixed) {
      printLine('The generator is already running.');
      return true;
    }

    state.fuse = false;
    state.generatorFixed = true;
    printBlock('You lock the fuse into place and slam the switch.\n[SFX] The generator erupts to life. Distant doors unlock across Pasco Mansion.');
    updateSidebar();
    return true;
  }

  if (contains(command, 'keypad') || contains(command, 'console')) {
    if (state.room !== ROOMS.LAB) {
      printLine('There is no keypad here.', 'warn');
      return true;
    }
    if (state.keypadUnlocked) {
      printLine('The ritual chamber door is already unlocked.');
      return true;
    }

    startPrompt('keypad');
    return true;
  }

  if (contains(command, 'diary') || contains(command, 'journal')) {
    readDiary();
    return true;
  }

  if (contains(command, 'lantern')) {
    if (!state.lantern) {
      printLine('You do not have a lantern.', 'warn');
      return true;
    }
    printLine('You raise the lantern. Ghost shadows recoil, but they do not leave.');
    return true;
  }

  if (contains(command, 'dagger') || contains(command, 'silver')) {
    if (!state.silverDagger) {
      printLine('You do not have the silver dagger.', 'warn');
      return true;
    }

    if (state.room === ROOMS.CHAPEL && !state.bandeFreed) {
      if (!state.readDiary) {
        printLine('You lunge with the dagger, but the possession surges back. You need the diary phrase.', 'warn');
        loseSanity(10, 'The spirit counters your attempt.');
        return true;
      }

      state.bandeFreed = true;
      if (!state.masterKey) {
        state.masterKey = true;
      }

      printBlock(
        'You press the silver blade to Bande\'s chains and shout the banishment phrase.\n' +
          'A black vapor tears from his mouth and screams into the ceiling.\n' +
          'Bande collapses, human again, and pushes an iron key into your hand.\n' +
          'Bande: "Front gate. Master key. End Jay first or he follows you out."'
      );
      updateSidebar();
      return true;
    }

    printLine('The dagger hums, but there is nothing immediate to sever here.');
    return true;
  }

  if (contains(command, 'ritual') || command.startsWith('chant')) {
    return performRitual();
  }

  if (contains(command, 'master key') || contains(command, 'gate') || contains(command, 'chain') || contains(command, 'lock')) {
    if (state.room !== ROOMS.GATE) {
      printLine('You can only use a gate key at the Front Gate.', 'warn');
      return true;
    }

    if (!state.masterKey) {
      printLine('You pull uselessly at the chain. You need the master key.', 'warn');
      return true;
    }

    if (!state.jayBanished) {
      printBlock(
        "The lock opens half a turn. Jay Pasco manifests behind the bars and grabs your shadow.\n" +
          "You feel your heartbeat stop as he drags you backward into the mansion's fog.\n" +
          'Bad Ending: The Next Subject.',
        'end'
      );
      endGame(false);
      return true;
    }

    printBlock(
      'The master key turns. Chains collapse to the ground.\n' +
        'Luna and Bande stumble out behind you as dawn light cuts through the fog.\n' +
        'Good Ending: You escaped Pasco Mansion.',
      'end'
    );
    endGame(true);
    return true;
  }

  printLine('You try, but nothing useful happens.', 'warn');
  return false;
}

function performRitual() {
  if (state.room !== ROOMS.RITUAL) {
    printLine('You need to be inside the Ritual Chamber to attempt that.', 'warn');
    return false;
  }

  if (state.jayBanished) {
    printLine('The sigils are cold. Jay Pasco has already been banished.');
    return false;
  }

  if (!state.bandeFreed) {
    printBlock('Jay Pasco laughs as Bande screams through the walls.\nWithout freeing Bande, the ritual circle rejects you.', 'blood');
    loseSanity(18, 'The chamber consumes your unprepared mind.');
    return true;
  }

  if (!state.silverDagger || !state.readDiary) {
    printLine('Your ritual is incomplete: you need the silver dagger and the diary phrase.', 'warn');
    loseSanity(12, 'The spirit tears at your memory.');
    return true;
  }

  printLine('You carve the outer circle and begin the chant.');
  startPrompt('ritual');
  return true;
}

function printHelp() {
  printBlock(
    'Available commands:\n' +
      '- help\n' +
      '- look\n' +
      '- move <location> (or go <location>)\n' +
      '- inspect <object>\n' +
      '- take <item>\n' +
      '- use <item>\n' +
      '- talk <luna|bande>\n' +
      '- read diary\n' +
      '- listen\n' +
      '- map\n' +
      '- inventory\n' +
      '- status\n' +
      '- ritual\n' +
      '- quit'
  );
}

function printMap() {
  printBlock(
    'Pasco Mansion Layout:\n' +
      'Front Gate\n' +
      '   |\n' +
      'Grand Foyer -- Whispering Library -- Hidden Study\n' +
      '   |\n' +
      "Dining Hall  Jay's Laboratory -- Ritual Chamber\n" +
      '   |\n' +
      'Basement Generator Room\n\n' +
      'The Desecrated Chapel is accessed from the Grand Foyer (key required).'
  );
}

function printStatus() {
  printBlock(
    'Status:\n' +
      `Location : ${ROOM_NAMES[state.room]}\n` +
      `Sanity   : ${state.sanity}/100\n` +
      `Turns    : ${state.turn}\n` +
      `Objective: ${currentObjective()}`
  );
}

function printInventory() {
  const items = inventoryItems();
  if (items.length === 0) {
    printLine('Inventory: (empty)');
    return;
  }
  printLine('Inventory:', 'warn');
  items.forEach((item) => printLine(`- ${item}`));
}

function handleCommand(rawInput) {
  if (!state.running) return;

  const command = normalize(rawInput);
  if (!command) return;

  printLine(`> ${command}`, 'player');

  let consumedTurn = false;

  if (state.awaitingPrompt) {
    consumedTurn = handlePromptInput(command);
  } else if (command === 'help') {
    printHelp();
  } else if (command === 'status') {
    printStatus();
  } else if (command === 'inventory' || command === 'inv') {
    printInventory();
  } else if (command === 'map') {
    printMap();
  } else if (command === 'look') {
    describeRoom(state.room);
    printExits(state.room);
  } else if (command === 'quit' || command === 'exit') {
    printLine('You step away from Pasco Mansion... for now.', 'end');
    endGame(false);
  } else if (command.startsWith('move ') || command.startsWith('go ')) {
    const target = parseDestination(command);
    if (!target) {
      printLine('Move where? Try: library, dining hall, basement, laboratory, hidden study, chapel, ritual chamber, front gate.', 'warn');
    } else {
      consumedTurn = tryMove(target);
    }
  } else if (command.startsWith('inspect ') || command.startsWith('examine ')) {
    consumedTurn = handleInspect(command);
  } else if (command.startsWith('take ') || command.startsWith('grab ') || command.startsWith('pick ')) {
    consumedTurn = handleTake(command);
  } else if (command.startsWith('use ')) {
    consumedTurn = handleUse(command);
  } else if (command.startsWith('talk ') || command.startsWith('speak ')) {
    consumedTurn = handleTalk(command);
  } else if (command.startsWith('listen')) {
    consumedTurn = handleListen();
  } else if (command.startsWith('read') && (contains(command, 'diary') || contains(command, 'journal'))) {
    consumedTurn = readDiary();
  } else if (command === 'ritual' || contains(command, 'perform ritual') || command.startsWith('chant')) {
    consumedTurn = performRitual();
  } else {
    const directTarget = parseDestination(command);
    if (directTarget) {
      consumedTurn = tryMove(directTarget);
    } else {
      printLine('Unknown command. Type `help` to see available commands.', 'warn');
    }
  }

  if (state.running && consumedTurn) {
    state.turn += 1;
    triggerRandomHorror();
  }

  updateSidebar();
}

function endGame(win) {
  state.running = false;
  state.win = Boolean(win);
  clearPrompt();

  if (state.win) {
    scenePulse('Dawn breaks beyond the gate');
    printLine('You survived the night at Pasco Mansion.', 'end');
  } else {
    scenePulse('Pasco Mansion consumed you');
    printLine('Session ended. Pasco Mansion still remembers you.', 'end');
  }

  ui.input.disabled = true;
}

function intro() {
  ui.log.innerHTML = '';

  printLine('============================================================', 'warn');
  printLine('                PASCO MANSION: SHADOW PROTOCOL             ', 'warn');
  printLine('============================================================', 'warn');

  printBlock(
    'Rain lashes against the abandoned mansion known as Pasco Mansion.\n' +
      'Inside: flickering lights, broken furniture, crawling fog, and sounds no building should make.\n\n' +
      'Characters:\n' +
      '- You: the Player, Jay Pasco\'s next target.\n' +
      '- Luna: terrified but brilliant, still fighting to survive.\n' +
      '- Bande: your friend, now possessed and trapped in ritual chains.\n' +
      '- Jay Pasco: dead scientist, alive as a malignant spirit.\n\n' +
      'Goal: Escape alive. Uncover the mystery. Break the possession. Banish Jay Pasco.\n' +
      'Type `help` for commands. Stay calm. Fear is part of the system.'
  );
}

function restartGame() {
  if (document.pointerLockElement === ui.scene) {
    document.exitPointerLock();
  }

  state = initState();
  ui.input.disabled = false;
  ui.input.value = '';
  if (ui.playerModeBtn) {
    ui.playerModeBtn.textContent = 'Enable 3D Player Mode';
  }
  clearPrompt();
  intro();
  enterRoom(ROOMS.FOYER, false);
  ui.input.focus();
}

function createAmbientAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }

  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);

  const droneA = ctx.createOscillator();
  droneA.type = 'sawtooth';
  droneA.frequency.value = 42;
  const droneAGain = ctx.createGain();
  droneAGain.gain.value = 0.015;
  droneA.connect(droneAGain).connect(master);

  const droneB = ctx.createOscillator();
  droneB.type = 'triangle';
  droneB.frequency.value = 73;
  droneB.detune.value = -12;
  const droneBGain = ctx.createGain();
  droneBGain.gain.value = 0.01;
  droneB.connect(droneBGain).connect(master);

  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * 0.24;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 420;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.008;

  noise.connect(noiseFilter).connect(noiseGain).connect(master);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.17;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 70;
  lfo.connect(lfoGain).connect(noiseFilter.frequency);

  droneA.start();
  droneB.start();
  noise.start();
  lfo.start();

  let tick = null;
  tick = window.setInterval(() => {
    if (ctx.state !== 'running') return;

    const pulse = ctx.createOscillator();
    pulse.type = Math.random() > 0.5 ? 'square' : 'triangle';
    pulse.frequency.value = 150 + Math.random() * 80;

    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.0001;

    pulse.connect(pulseGain).connect(master);
    pulse.start();

    const now = ctx.currentTime;
    pulseGain.gain.exponentialRampToValueAtTime(0.007, now + 0.03);
    pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    pulse.stop(now + 0.18);
  }, 3200 + Math.random() * 1500);

  return {
    ctx,
    stop() {
      window.clearInterval(tick);
      [droneA, droneB, noise, lfo].forEach((node) => {
        try {
          node.stop();
        } catch (err) {
          /* no-op */
        }
      });
      ctx.close();
    }
  };
}

async function toggleAudio() {
  if (!ambientAudio) {
    ambientAudio = createAmbientAudio();
    if (!ambientAudio) {
      printLine('Ambient audio is not supported in this browser.', 'warn');
      return;
    }
    if (ambientAudio.ctx.state === 'suspended') {
      await ambientAudio.ctx.resume();
    }
    ui.audioBtn.textContent = 'Mute Ambient Audio';
    printLine('[SFX] Low industrial drone creeps through the mansion walls.', 'sfx');
    return;
  }

  if (ambientAudio.ctx.state === 'running') {
    await ambientAudio.ctx.suspend();
    ui.audioBtn.textContent = 'Enable Ambient Audio';
    printLine('[SFX] The drone fades into suffocating silence.', 'sfx');
  } else {
    await ambientAudio.ctx.resume();
    ui.audioBtn.textContent = 'Mute Ambient Audio';
    printLine('[SFX] Disturbing ambient noise returns.', 'sfx');
  }
}

function handlePlayerKeydown(event) {
  if (!state.playerMode || !state.running) {
    return;
  }

  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (activeTag === 'INPUT' && event.key !== 'Escape') {
    return;
  }

  const key = event.key.toLowerCase();
  const lookStep = 5;

  if (key === 'a') {
    cycleTargetExit(-1);
    event.preventDefault();
    return;
  }
  if (key === 'd') {
    cycleTargetExit(1);
    event.preventDefault();
    return;
  }
  if (key === 'w' || key === 'enter' || key === 'f') {
    moveThroughTargetExit();
    event.preventDefault();
    return;
  }
  if (key === 's' || key === 'backspace') {
    moveBackInHistory();
    event.preventDefault();
    return;
  }
  if (key === 'arrowleft' || key === 'q') {
    state.viewYaw -= lookStep;
    if (state.viewYaw < -180) state.viewYaw += 360;
    applyPlayerLook();
    event.preventDefault();
    return;
  }
  if (key === 'arrowright' || key === 'e') {
    state.viewYaw += lookStep;
    if (state.viewYaw > 180) state.viewYaw -= 360;
    applyPlayerLook();
    event.preventDefault();
    return;
  }
  if (key === 'arrowup') {
    state.viewPitch = Math.min(12, state.viewPitch + 1.5);
    applyPlayerLook();
    event.preventDefault();
    return;
  }
  if (key === 'arrowdown') {
    state.viewPitch = Math.max(-12, state.viewPitch - 1.5);
    applyPlayerLook();
    event.preventDefault();
    return;
  }
  if (key === 'escape' && document.pointerLockElement === ui.scene) {
    document.exitPointerLock();
    event.preventDefault();
  }
}

function handlePlayerMouseLook(event) {
  if (!state.playerMode || document.pointerLockElement !== ui.scene) {
    return;
  }

  state.viewYaw += event.movementX * 0.09;
  state.viewPitch -= event.movementY * 0.06;

  if (state.viewYaw > 180) state.viewYaw -= 360;
  if (state.viewYaw < -180) state.viewYaw += 360;
  state.viewPitch = Math.max(-12, Math.min(12, state.viewPitch));

  applyPlayerLook();
}

ui.form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!state.running) return;

  const cmd = ui.input.value;
  ui.input.value = '';
  handleCommand(cmd);
});

ui.quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!state.running) return;
    const cmd = button.getAttribute('data-cmd') || '';
    handleCommand(cmd);
  });
});

ui.restartBtn.addEventListener('click', restartGame);
ui.audioBtn.addEventListener('click', () => {
  toggleAudio().catch(() => {
    printLine('Audio permission failed. Try clicking again.', 'warn');
  });
});
if (ui.playerModeBtn) {
  ui.playerModeBtn.addEventListener('click', togglePlayerMode);
}
if (ui.scene) {
  ui.scene.addEventListener('click', () => {
    if (state.playerMode && ui.scene.requestPointerLock) {
      ui.scene.requestPointerLock();
    }
  });
}
document.addEventListener('keydown', handlePlayerKeydown);
document.addEventListener('mousemove', handlePlayerMouseLook);

restartGame();
