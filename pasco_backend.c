#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define DEFAULT_PORT 8081
#define RECV_BUF_SIZE 65536
#define TEXT_BUF_SIZE 4096
#define SMALL_BUF 256
#define MAX_SESSIONS 32

typedef enum {
    ROOM_FOYER,
    ROOM_LIBRARY,
    ROOM_DINING,
    ROOM_BASEMENT,
    ROOM_LAB,
    ROOM_HIDDEN_STUDY,
    ROOM_CHAPEL,
    ROOM_RITUAL,
    ROOM_GATE,
    ROOM_COUNT
} Room;

typedef struct {
    Room room;
    int sanity;
    int turn;
    bool running;
    bool win;

    bool visited[ROOM_COUNT];

    bool lantern;
    bool fuse;
    bool diary;
    bool chapelKey;
    bool silverDagger;
    bool masterKey;

    bool lanternAvailable;
    bool fuseAvailable;
    bool diaryAvailable;
    bool chapelKeyAvailable;
    bool daggerAvailable;

    bool generatorFixed;
    bool hiddenStudyOpen;
    bool keypadUnlocked;
    bool readDiary;
    bool bandeEncountered;
    bool bandeFreed;
    bool lunaMet;
    bool jayBanished;
    bool mirrorScareDone;
} GameState;

typedef struct {
    bool used;
    unsigned int token;
    GameState game;
} Session;

static Session g_sessions[MAX_SESSIONS];

static const char *ROOM_NAMES[ROOM_COUNT] = {
    "Grand Foyer",
    "Whispering Library",
    "Dining Hall",
    "Basement Generator Room",
    "Jay Pasco Laboratory",
    "Hidden Study",
    "Desecrated Chapel",
    "Ritual Chamber",
    "Front Gate"
};

static void trim(char *text) {
    size_t i = 0;
    size_t len = strlen(text);

    while (i < len && isspace((unsigned char)text[i])) {
        i++;
    }

    if (i > 0) {
        memmove(text, text + i, len - i + 1);
    }

    len = strlen(text);
    while (len > 0 && isspace((unsigned char)text[len - 1])) {
        text[len - 1] = '\0';
        len--;
    }
}

static void lowercase(char *text) {
    for (; *text != '\0'; ++text) {
        *text = (char)tolower((unsigned char)*text);
    }
}

static bool starts_with(const char *text, const char *prefix) {
    size_t n = strlen(prefix);
    return strncmp(text, prefix, n) == 0;
}

static bool contains(const char *text, const char *token) {
    return strstr(text, token) != NULL;
}

static void append_line(char *dst, size_t size, const char *line) {
    size_t len = strlen(dst);
    size_t remaining;

    if (size == 0 || len >= size - 1) {
        return;
    }

    if (len > 0 && dst[len - 1] != '\n') {
        dst[len++] = '\n';
        dst[len] = '\0';
    }

    remaining = size - len - 1;
    strncat(dst, line, remaining);
}

static void json_escape(const char *src, char *dst, size_t size) {
    size_t i;
    size_t j = 0;

    if (size == 0) {
        return;
    }

    for (i = 0; src[i] != '\0' && j + 1 < size; i++) {
        unsigned char c = (unsigned char)src[i];

        if (c == '"' || c == '\\') {
            if (j + 2 >= size) {
                break;
            }
            dst[j++] = '\\';
            dst[j++] = (char)c;
        } else if (c == '\n') {
            if (j + 2 >= size) {
                break;
            }
            dst[j++] = '\\';
            dst[j++] = 'n';
        } else if (c == '\r') {
            if (j + 2 >= size) {
                break;
            }
            dst[j++] = '\\';
            dst[j++] = 'r';
        } else if (c == '\t') {
            if (j + 2 >= size) {
                break;
            }
            dst[j++] = '\\';
            dst[j++] = 't';
        } else if (c >= 32) {
            dst[j++] = (char)c;
        }
    }

    dst[j] = '\0';
}

static void lose_sanity(GameState *game, int amount, const char *reason, char *out, size_t out_size) {
    char line[SMALL_BUF];

    if (amount <= 0 || !game->running) {
        return;
    }

    game->sanity -= amount;
    if (game->sanity < 0) {
        game->sanity = 0;
    }

    snprintf(line, sizeof(line), "[Sanity -%d] %s", amount, reason);
    append_line(out, out_size, line);

    if (game->sanity <= 0) {
        append_line(out, out_size, "Your mind fractures under Pasco Mansion.");
        game->running = false;
        game->win = false;
    }
}

static const char *current_objective(const GameState *game) {
    if (!game->generatorFixed) {
        return "Find fuse in Dining Hall and repair generator in Basement.";
    }
    if (!game->hiddenStudyOpen) {
        return "Inspect raven statue in Library to reveal hidden room.";
    }
    if (!game->diary || !game->chapelKey) {
        return "Collect diary and chapel key from Hidden Study.";
    }
    if (!game->bandeFreed) {
        return "Enter Chapel, take silver dagger, free Bande.";
    }
    if (!game->keypadUnlocked) {
        return "Unlock Lab keypad using code 7391.";
    }
    if (!game->jayBanished) {
        return "Perform ritual in Ritual Chamber.";
    }
    return "Go to Front Gate and use master key to escape.";
}

static void build_inventory(const GameState *game, char *out, size_t out_size) {
    out[0] = '\0';
    if (!game->lantern && !game->fuse && !game->diary && !game->chapelKey && !game->silverDagger && !game->masterKey) {
        snprintf(out, out_size, "empty");
        return;
    }

    if (game->lantern) append_line(out, out_size, "Rusty lantern");
    if (game->fuse) append_line(out, out_size, "Generator fuse");
    if (game->diary) append_line(out, out_size, "Jay diary");
    if (game->chapelKey) append_line(out, out_size, "Chapel key");
    if (game->silverDagger) append_line(out, out_size, "Silver dagger");
    if (game->masterKey) append_line(out, out_size, "Master key");
}

static Room parse_destination(const char *text, bool *ok) {
    *ok = true;

    if (contains(text, "foyer")) return ROOM_FOYER;
    if (contains(text, "library")) return ROOM_LIBRARY;
    if (contains(text, "dining")) return ROOM_DINING;
    if (contains(text, "basement") || contains(text, "cellar")) return ROOM_BASEMENT;
    if (contains(text, "lab")) return ROOM_LAB;
    if (contains(text, "study") || contains(text, "hidden")) return ROOM_HIDDEN_STUDY;
    if (contains(text, "chapel")) return ROOM_CHAPEL;
    if (contains(text, "ritual") || contains(text, "chamber")) return ROOM_RITUAL;
    if (contains(text, "gate") || contains(text, "exit")) return ROOM_GATE;

    *ok = false;
    return ROOM_FOYER;
}

static bool can_move(const GameState *game, Room target, char *reason, size_t reason_size) {
    reason[0] = '\0';

    switch (game->room) {
        case ROOM_FOYER:
            if (target == ROOM_LIBRARY || target == ROOM_DINING || target == ROOM_GATE) return true;
            if (target == ROOM_LAB) {
                if (!game->generatorFixed) {
                    snprintf(reason, reason_size, "Laboratory is sealed. No power.");
                    return false;
                }
                return true;
            }
            if (target == ROOM_CHAPEL) {
                if (!game->chapelKey) {
                    snprintf(reason, reason_size, "Chapel is locked.");
                    return false;
                }
                return true;
            }
            snprintf(reason, reason_size, "Cannot reach that from foyer.");
            return false;

        case ROOM_LIBRARY:
            if (target == ROOM_FOYER) return true;
            if (target == ROOM_HIDDEN_STUDY) {
                if (!game->hiddenStudyOpen) {
                    snprintf(reason, reason_size, "Hidden study not revealed.");
                    return false;
                }
                return true;
            }
            snprintf(reason, reason_size, "Only foyer and hidden study connect here.");
            return false;

        case ROOM_DINING:
            if (target == ROOM_FOYER) return true;
            if (target == ROOM_BASEMENT) {
                if (!game->lantern) {
                    snprintf(reason, reason_size, "Basement is too dark. Need lantern.");
                    return false;
                }
                return true;
            }
            snprintf(reason, reason_size, "Only foyer and basement connect here.");
            return false;

        case ROOM_BASEMENT:
            if (target == ROOM_DINING) return true;
            snprintf(reason, reason_size, "Only staircase to dining hall.");
            return false;

        case ROOM_LAB:
            if (target == ROOM_FOYER) return true;
            if (target == ROOM_RITUAL) {
                if (!game->keypadUnlocked) {
                    snprintf(reason, reason_size, "Ritual chamber keypad is locked.");
                    return false;
                }
                return true;
            }
            snprintf(reason, reason_size, "Lab connects only foyer and ritual chamber.");
            return false;

        case ROOM_HIDDEN_STUDY:
            if (target == ROOM_LIBRARY) return true;
            snprintf(reason, reason_size, "Only path leads back to library.");
            return false;

        case ROOM_CHAPEL:
            if (target == ROOM_FOYER) return true;
            snprintf(reason, reason_size, "Only exit is foyer.");
            return false;

        case ROOM_RITUAL:
            if (target == ROOM_LAB) return true;
            snprintf(reason, reason_size, "Sigils block all exits except lab.");
            return false;

        case ROOM_GATE:
            if (target == ROOM_FOYER) return true;
            snprintf(reason, reason_size, "Road blocked. Return to foyer.");
            return false;

        default:
            snprintf(reason, reason_size, "You freeze in place.");
            return false;
    }
}

static void append_room_exits(const GameState *game, char *out, size_t out_size) {
    out[0] = '\0';

    switch (game->room) {
        case ROOM_FOYER:
            append_line(out, out_size, "library");
            append_line(out, out_size, "dining hall");
            if (game->generatorFixed) append_line(out, out_size, "laboratory");
            if (game->chapelKey) append_line(out, out_size, "chapel");
            append_line(out, out_size, "front gate");
            break;
        case ROOM_LIBRARY:
            append_line(out, out_size, "grand foyer");
            if (game->hiddenStudyOpen) append_line(out, out_size, "hidden study");
            break;
        case ROOM_DINING:
            append_line(out, out_size, "grand foyer");
            if (game->lantern) append_line(out, out_size, "basement");
            break;
        case ROOM_BASEMENT:
            append_line(out, out_size, "dining hall");
            break;
        case ROOM_LAB:
            append_line(out, out_size, "grand foyer");
            if (game->keypadUnlocked) append_line(out, out_size, "ritual chamber");
            break;
        case ROOM_HIDDEN_STUDY:
            append_line(out, out_size, "whispering library");
            break;
        case ROOM_CHAPEL:
            append_line(out, out_size, "grand foyer");
            break;
        case ROOM_RITUAL:
            append_line(out, out_size, "laboratory");
            break;
        case ROOM_GATE:
            append_line(out, out_size, "grand foyer");
            break;
        default:
            break;
    }
}

static void on_first_visit(GameState *game, char *out, size_t out_size) {
    switch (game->room) {
        case ROOM_FOYER:
            append_line(out, out_size, "A ghost shadow crosses the balcony.");
            lose_sanity(game, 4, "The mansion reacts to your arrival.", out, out_size);
            break;
        case ROOM_LIBRARY:
            append_line(out, out_size, "A book drops open to your name.");
            lose_sanity(game, 5, "You are not the first target.", out, out_size);
            break;
        case ROOM_BASEMENT:
            append_line(out, out_size, "A hanging silhouette flashes behind you.");
            lose_sanity(game, 6, "The silhouette vanishes.", out, out_size);
            break;
        case ROOM_LAB:
            if (!game->lunaMet) {
                game->lunaMet = true;
                append_line(out, out_size, "Luna appears: Bande is possessed in chapel.");
            }
            break;
        case ROOM_HIDDEN_STUDY:
            append_line(out, out_size, "You find SUBJECT NEXT photos of yourself.");
            lose_sanity(game, 7, "Jay knew you were coming.", out, out_size);
            break;
        case ROOM_CHAPEL:
            if (!game->bandeEncountered) {
                game->bandeEncountered = true;
                append_line(out, out_size, "Bande speaks with Jay's voice.");
                lose_sanity(game, 8, "Possession is real.", out, out_size);
            }
            break;
        case ROOM_RITUAL:
            append_line(out, out_size, "Jay Pasco spirit circles you.");
            lose_sanity(game, 10, "The chamber amplifies fear.", out, out_size);
            break;
        default:
            break;
    }
}

static void enter_room(GameState *game, Room room, char *out, size_t out_size) {
    char line[SMALL_BUF];
    bool first_visit = !game->visited[room];

    game->room = room;
    snprintf(line, sizeof(line), "Entered: %s", ROOM_NAMES[room]);
    append_line(out, out_size, line);

    if (first_visit) {
        game->visited[room] = true;
        on_first_visit(game, out, out_size);
    }
}

static void maybe_random_horror(GameState *game, char *out, size_t out_size) {
    static const char *events[] = {
        "Three knocks sound behind you.",
        "A blood trail appears then evaporates.",
        "Your reflection blinks late.",
        "Wet footsteps circle your position.",
        "A glowing phone rings near broken glass."
    };

    if (!game->running || game->turn < 2) return;
    if ((rand() % 100) >= 18) return;

    append_line(out, out_size, "JUMP SCARE");
    append_line(out, out_size, events[rand() % (int)(sizeof(events) / sizeof(events[0]))]);
    lose_sanity(game, 3 + (rand() % 6), "Fear surge.", out, out_size);
}

static bool handle_move(GameState *game, const char *cmd, char *out, size_t out_size) {
    bool ok;
    char reason[SMALL_BUF];
    Room target = parse_destination(cmd, &ok);

    if (!ok) {
        append_line(out, out_size, "Unknown destination.");
        return false;
    }

    if (!can_move(game, target, reason, sizeof(reason))) {
        append_line(out, out_size, reason);
        return false;
    }

    enter_room(game, target, out, out_size);
    return true;
}

static bool handle_inspect(GameState *game, const char *cmd, char *out, size_t out_size) {
    if (game->room == ROOM_LIBRARY && (contains(cmd, "raven") || contains(cmd, "statue") || contains(cmd, "bookshelf"))) {
        if (!game->hiddenStudyOpen) {
            game->hiddenStudyOpen = true;
            append_line(out, out_size, "Raven mechanism clicks. Hidden study revealed.");
        } else {
            append_line(out, out_size, "Hidden study passage is already open.");
        }
        return true;
    }

    if (game->room == ROOM_DINING && (contains(cmd, "cabinet") || contains(cmd, "drawer") || contains(cmd, "sideboard"))) {
        if (game->lanternAvailable) append_line(out, out_size, "Found item: rusty lantern.");
        if (game->fuseAvailable) append_line(out, out_size, "Found item: generator fuse.");
        if (!game->lanternAvailable && !game->fuseAvailable) append_line(out, out_size, "Sideboard is empty.");
        return true;
    }

    append_line(out, out_size, "Nothing crucial found.");
    return true;
}

static bool handle_take(GameState *game, const char *cmd, char *out, size_t out_size) {
    if ((contains(cmd, "lantern") || contains(cmd, "light")) && game->room == ROOM_DINING) {
        if (!game->lanternAvailable) {
            append_line(out, out_size, "Lantern already taken.");
            return true;
        }
        game->lantern = true;
        game->lanternAvailable = false;
        append_line(out, out_size, "Taken: rusty lantern.");
        return true;
    }

    if (contains(cmd, "fuse") && game->room == ROOM_DINING) {
        if (!game->fuseAvailable) {
            append_line(out, out_size, "Fuse already taken.");
            return true;
        }
        game->fuse = true;
        game->fuseAvailable = false;
        append_line(out, out_size, "Taken: generator fuse.");
        return true;
    }

    if ((contains(cmd, "diary") || contains(cmd, "journal")) && game->room == ROOM_HIDDEN_STUDY) {
        if (!game->diaryAvailable) {
            append_line(out, out_size, "Diary already taken.");
            return true;
        }
        game->diary = true;
        game->diaryAvailable = false;
        append_line(out, out_size, "Taken: Jay diary.");
        return true;
    }

    if ((contains(cmd, "chapel key") || contains(cmd, "brass key") || contains(cmd, "key")) && game->room == ROOM_HIDDEN_STUDY) {
        if (!game->chapelKeyAvailable) {
            append_line(out, out_size, "Chapel key already taken.");
            return true;
        }
        game->chapelKey = true;
        game->chapelKeyAvailable = false;
        append_line(out, out_size, "Taken: chapel key.");
        return true;
    }

    if ((contains(cmd, "dagger") || contains(cmd, "silver")) && game->room == ROOM_CHAPEL) {
        if (!game->daggerAvailable) {
            append_line(out, out_size, "Silver dagger already taken.");
            return true;
        }
        game->silverDagger = true;
        game->daggerAvailable = false;
        append_line(out, out_size, "Taken: silver dagger.");
        return true;
    }

    append_line(out, out_size, "Cannot take that now.");
    return false;
}

static bool handle_use(GameState *game, const char *cmd, char *out, size_t out_size) {
    if (contains(cmd, "fuse")) {
        if (game->room != ROOM_BASEMENT) {
            append_line(out, out_size, "Use fuse at basement generator.");
            return true;
        }
        if (!game->fuse) {
            append_line(out, out_size, "You do not have fuse.");
            return true;
        }
        if (game->generatorFixed) {
            append_line(out, out_size, "Generator already running.");
            return true;
        }
        game->fuse = false;
        game->generatorFixed = true;
        append_line(out, out_size, "Generator restored. Doors unlock.");
        return true;
    }

    if (contains(cmd, "keypad") || contains(cmd, "console")) {
        if (game->room != ROOM_LAB) {
            append_line(out, out_size, "No keypad in this room.");
            return true;
        }
        if (game->keypadUnlocked) {
            append_line(out, out_size, "Keypad already unlocked.");
            return true;
        }
        if (contains(cmd, "7391")) {
            game->keypadUnlocked = true;
            append_line(out, out_size, "Access granted. Ritual chamber unsealed.");
            return true;
        }
        append_line(out, out_size, "Incorrect or missing code. Use: use keypad 7391");
        lose_sanity(game, 5, "Keypad shock.", out, out_size);
        return true;
    }

    if (contains(cmd, "diary") || contains(cmd, "journal")) {
        if (!game->diary) {
            append_line(out, out_size, "You do not have diary.");
            return true;
        }
        game->readDiary = true;
        append_line(out, out_size, "Diary read: code 7391, phrase known, silver severs possession.");
        return true;
    }

    if (contains(cmd, "dagger") || contains(cmd, "silver")) {
        if (!game->silverDagger) {
            append_line(out, out_size, "You do not have silver dagger.");
            return true;
        }
        if (game->room == ROOM_CHAPEL && !game->bandeFreed) {
            if (!game->readDiary) {
                append_line(out, out_size, "Need diary phrase before severing possession.");
                lose_sanity(game, 8, "Possession backlash.", out, out_size);
                return true;
            }
            game->bandeFreed = true;
            game->masterKey = true;
            append_line(out, out_size, "Bande freed. You received master key.");
            return true;
        }
        append_line(out, out_size, "Dagger hums, no effect here.");
        return true;
    }

    if (contains(cmd, "master key") || contains(cmd, "gate") || contains(cmd, "chain") || contains(cmd, "lock")) {
        if (game->room != ROOM_GATE) {
            append_line(out, out_size, "Use gate key at Front Gate.");
            return true;
        }
        if (!game->masterKey) {
            append_line(out, out_size, "Need master key.");
            return true;
        }
        if (!game->jayBanished) {
            append_line(out, out_size, "Bad Ending: Jay drags you back into the mansion.");
            game->running = false;
            game->win = false;
            return true;
        }
        append_line(out, out_size, "Good Ending: You escaped Pasco Mansion.");
        game->running = false;
        game->win = true;
        return true;
    }

    append_line(out, out_size, "No useful effect.");
    return false;
}

static bool perform_ritual(GameState *game, const char *cmd, char *out, size_t out_size) {
    if (game->room != ROOM_RITUAL) {
        append_line(out, out_size, "Perform ritual in Ritual Chamber.");
        return false;
    }
    if (game->jayBanished) {
        append_line(out, out_size, "Jay already banished.");
        return false;
    }
    if (!game->bandeFreed) {
        append_line(out, out_size, "Ritual rejected. Free Bande first.");
        lose_sanity(game, 15, "Unprepared ritual collapse.", out, out_size);
        return true;
    }
    if (!game->silverDagger || !game->readDiary) {
        append_line(out, out_size, "Ritual incomplete. Need diary knowledge and silver dagger.");
        lose_sanity(game, 10, "Spirit backlash.", out, out_size);
        return true;
    }

    if (contains(cmd, "aeterna") || contains(cmd, "ritual")) {
        game->jayBanished = true;
        append_line(out, out_size, "Ritual succeeds. Jay Pasco is banished.");
        return true;
    }

    append_line(out, out_size, "Ritual words failed.");
    lose_sanity(game, 8, "Failed chant.", out, out_size);
    return true;
}

static bool handle_command(GameState *game, const char *input, char *out, size_t out_size) {
    char cmd[SMALL_BUF];
    bool consumed_turn = false;

    if (!game->running) {
        append_line(out, out_size, "Session ended. Start a new game.");
        return false;
    }

    snprintf(cmd, sizeof(cmd), "%s", input);
    trim(cmd);
    lowercase(cmd);

    if (cmd[0] == '\0') {
        append_line(out, out_size, "Empty command.");
        return false;
    }

    if (strcmp(cmd, "help") == 0) {
        append_line(out, out_size, "Commands: help, look, move/go, inspect, take, use, read diary, ritual, status, inventory, quit");
        return false;
    }

    if (strcmp(cmd, "look") == 0) {
        append_line(out, out_size, ROOM_NAMES[game->room]);
        return false;
    }

    if (strcmp(cmd, "status") == 0) {
        append_line(out, out_size, current_objective(game));
        return false;
    }

    if (strcmp(cmd, "inventory") == 0 || strcmp(cmd, "inv") == 0) {
        char inv[SMALL_BUF];
        build_inventory(game, inv, sizeof(inv));
        append_line(out, out_size, inv);
        return false;
    }

    if (strcmp(cmd, "quit") == 0 || strcmp(cmd, "exit") == 0) {
        game->running = false;
        game->win = false;
        append_line(out, out_size, "Session closed.");
        return false;
    }

    if (starts_with(cmd, "move ") || starts_with(cmd, "go ")) {
        consumed_turn = handle_move(game, cmd, out, out_size);
    } else if (starts_with(cmd, "inspect ") || starts_with(cmd, "examine ")) {
        consumed_turn = handle_inspect(game, cmd, out, out_size);
    } else if (starts_with(cmd, "take ") || starts_with(cmd, "grab ") || starts_with(cmd, "pick ")) {
        consumed_turn = handle_take(game, cmd, out, out_size);
    } else if (starts_with(cmd, "use ")) {
        consumed_turn = handle_use(game, cmd, out, out_size);
    } else if (starts_with(cmd, "read") && (contains(cmd, "diary") || contains(cmd, "journal"))) {
        consumed_turn = handle_use(game, "use diary", out, out_size);
    } else if (strcmp(cmd, "ritual") == 0 || starts_with(cmd, "chant") || contains(cmd, "perform ritual")) {
        consumed_turn = perform_ritual(game, cmd, out, out_size);
    } else {
        bool ok;
        parse_destination(cmd, &ok);
        if (ok) {
            consumed_turn = handle_move(game, cmd, out, out_size);
        } else {
            append_line(out, out_size, "Unknown command.");
            return false;
        }
    }

    if (consumed_turn && game->running) {
        game->turn++;
        maybe_random_horror(game, out, out_size);
    }

    return consumed_turn;
}

static GameState init_game(char *intro, size_t intro_size) {
    GameState game;

    memset(&game, 0, sizeof(game));
    game.room = ROOM_FOYER;
    game.sanity = 100;
    game.turn = 0;
    game.running = true;
    game.win = false;

    game.lanternAvailable = true;
    game.fuseAvailable = true;
    game.diaryAvailable = true;
    game.chapelKeyAvailable = true;
    game.daggerAvailable = true;

    intro[0] = '\0';
    append_line(intro, intro_size, "Pasco Mansion session started.");
    append_line(intro, intro_size, "You are the next target.");
    enter_room(&game, ROOM_FOYER, intro, intro_size);

    return game;
}

static Session *new_session(char *intro, size_t intro_size) {
    int i;
    Session *slot = NULL;

    for (i = 0; i < MAX_SESSIONS; i++) {
        if (!g_sessions[i].used) {
            slot = &g_sessions[i];
            break;
        }
    }

    if (slot == NULL) {
        return NULL;
    }

    memset(slot, 0, sizeof(*slot));
    slot->used = true;

    do {
        slot->token = ((unsigned int)rand() << 16) ^ (unsigned int)rand();
    } while (slot->token == 0);

    slot->game = init_game(intro, intro_size);
    return slot;
}

static Session *find_session(unsigned int token) {
    int i;
    for (i = 0; i < MAX_SESSIONS; i++) {
        if (g_sessions[i].used && g_sessions[i].token == token) {
            return &g_sessions[i];
        }
    }
    return NULL;
}

static bool json_get_string(const char *body, const char *key, char *out, size_t out_size) {
    char pattern[64];
    const char *p;
    const char *colon;
    const char *start;
    const char *end;
    size_t len;

    if (out_size == 0) return false;
    out[0] = '\0';

    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    p = strstr(body, pattern);
    if (!p) return false;

    colon = strchr(p + strlen(pattern), ':');
    if (!colon) return false;

    start = colon + 1;
    while (*start != '\0' && isspace((unsigned char)*start)) start++;
    if (*start != '"') return false;

    start++;
    end = start;
    while (*end != '\0' && *end != '"') {
        if (*end == '\\' && *(end + 1) != '\0') {
            end += 2;
        } else {
            end++;
        }
    }

    if (*end != '"') return false;

    len = (size_t)(end - start);
    if (len >= out_size) len = out_size - 1;
    memcpy(out, start, len);
    out[len] = '\0';
    return true;
}

static int parse_content_length(const char *headers, size_t header_len) {
    const char *p = headers;
    const char *end = headers + header_len;

    while (p < end) {
        const char *line_end = strstr(p, "\r\n");
        size_t line_len;

        if (!line_end) break;
        line_len = (size_t)(line_end - p);

        if (line_len >= 15 && strncasecmp(p, "Content-Length:", 15) == 0) {
            const char *num = p + 15;
            while (*num == ' ' || *num == '\t') num++;
            return atoi(num);
        }

        p = line_end + 2;
    }

    return 0;
}

static void send_response(int client_fd, const char *status, const char *content_type, const char *body) {
    char header[512];
    size_t body_len = strlen(body);

    snprintf(
        header,
        sizeof(header),
        "HTTP/1.1 %s\r\n"
        "Content-Type: %s\r\n"
        "Content-Length: %zu\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "Connection: close\r\n"
        "\r\n",
        status,
        content_type,
        body_len
    );

    send(client_fd, header, strlen(header), 0);
    send(client_fd, body, body_len, 0);
}

static void send_json_state(int client_fd, bool ok, const char *session_id, const char *message, const GameState *game) {
    char room_esc[SMALL_BUF];
    char obj_esc[TEXT_BUF_SIZE];
    char msg_esc[TEXT_BUF_SIZE];
    char exits[TEXT_BUF_SIZE];
    char inv[TEXT_BUF_SIZE];
    char exits_esc[TEXT_BUF_SIZE];
    char inv_esc[TEXT_BUF_SIZE];
    char body[TEXT_BUF_SIZE * 2];

    json_escape(ROOM_NAMES[game->room], room_esc, sizeof(room_esc));
    json_escape(current_objective(game), obj_esc, sizeof(obj_esc));
    json_escape(message, msg_esc, sizeof(msg_esc));

    append_room_exits(game, exits, sizeof(exits));
    build_inventory(game, inv, sizeof(inv));

    json_escape(exits, exits_esc, sizeof(exits_esc));
    json_escape(inv, inv_esc, sizeof(inv_esc));

    snprintf(
        body,
        sizeof(body),
        "{"
        "\"ok\":%s,"
        "\"session_id\":\"%s\"," 
        "\"message\":\"%s\","
        "\"room\":\"%s\","
        "\"sanity\":%d,"
        "\"turn\":%d,"
        "\"running\":%s,"
        "\"win\":%s,"
        "\"objective\":\"%s\","
        "\"exits\":\"%s\","
        "\"inventory\":\"%s\""
        "}",
        ok ? "true" : "false",
        session_id,
        msg_esc,
        room_esc,
        game->sanity,
        game->turn,
        game->running ? "true" : "false",
        game->win ? "true" : "false",
        obj_esc,
        exits_esc,
        inv_esc
    );

    send_response(client_fd, ok ? "200 OK" : "400 Bad Request", "application/json", body);
}

static void handle_start(int client_fd) {
    char intro[TEXT_BUF_SIZE];
    char token_str[16];
    Session *session = new_session(intro, sizeof(intro));

    if (!session) {
        send_response(client_fd, "503 Service Unavailable", "application/json", "{\"ok\":false,\"message\":\"No free sessions\"}");
        return;
    }

    snprintf(token_str, sizeof(token_str), "%08X", session->token);
    send_json_state(client_fd, true, token_str, intro, &session->game);
}

static void handle_command_api(int client_fd, const char *body) {
    char session_id[32];
    char cmd[SMALL_BUF];
    char msg[TEXT_BUF_SIZE];
    unsigned int token;
    char *endptr;
    Session *session;
    char token_out[16];

    if (!json_get_string(body, "session_id", session_id, sizeof(session_id))) {
        send_response(client_fd, "400 Bad Request", "application/json", "{\"ok\":false,\"message\":\"session_id missing\"}");
        return;
    }

    if (!json_get_string(body, "command", cmd, sizeof(cmd))) {
        send_response(client_fd, "400 Bad Request", "application/json", "{\"ok\":false,\"message\":\"command missing\"}");
        return;
    }

    token = (unsigned int)strtoul(session_id, &endptr, 16);
    if (*session_id == '\0' || *endptr != '\0' || token == 0) {
        send_response(client_fd, "400 Bad Request", "application/json", "{\"ok\":false,\"message\":\"invalid session_id\"}");
        return;
    }

    session = find_session(token);
    if (!session) {
        send_response(client_fd, "404 Not Found", "application/json", "{\"ok\":false,\"message\":\"session not found\"}");
        return;
    }

    msg[0] = '\0';
    handle_command(&session->game, cmd, msg, sizeof(msg));
    if (msg[0] == '\0') {
        snprintf(msg, sizeof(msg), "Command processed.");
    }

    snprintf(token_out, sizeof(token_out), "%08X", session->token);
    send_json_state(client_fd, true, token_out, msg, &session->game);
}

static void handle_client(int client_fd) {
    char buffer[RECV_BUF_SIZE];
    size_t total = 0;
    char *header_end;
    size_t header_len = 0;
    int content_len = 0;
    char method[16];
    char path[128];
    char *body = NULL;
    int parsed;

    while (total < sizeof(buffer) - 1) {
        ssize_t n = recv(client_fd, buffer + total, sizeof(buffer) - 1 - total, 0);
        if (n <= 0) {
            break;
        }
        total += (size_t)n;
        buffer[total] = '\0';

        header_end = strstr(buffer, "\r\n\r\n");
        if (!header_end) {
            continue;
        }

        header_len = (size_t)(header_end - buffer) + 4;
        content_len = parse_content_length(buffer, header_len);

        if ((int)(total - header_len) >= content_len) {
            break;
        }
    }

    if (total == 0) {
        return;
    }

    parsed = sscanf(buffer, "%15s %127s", method, path);
    if (parsed != 2) {
        send_response(client_fd, "400 Bad Request", "text/plain", "bad request\n");
        return;
    }

    if (strcmp(method, "OPTIONS") == 0) {
        send_response(client_fd, "204 No Content", "text/plain", "");
        return;
    }

    if (header_len > 0 && (int)(total - header_len) >= 0) {
        body = buffer + header_len;
    } else {
        body = "";
    }

    if (strcmp(method, "GET") == 0 && strcmp(path, "/api/health") == 0) {
        send_response(client_fd, "200 OK", "application/json", "{\"ok\":true,\"message\":\"pasco backend c running\"}");
        return;
    }

    if (strcmp(method, "POST") == 0 && strcmp(path, "/api/start") == 0) {
        handle_start(client_fd);
        return;
    }

    if (strcmp(method, "POST") == 0 && strcmp(path, "/api/command") == 0) {
        handle_command_api(client_fd, body);
        return;
    }

    send_response(
        client_fd,
        "404 Not Found",
        "application/json",
        "{\"ok\":false,\"message\":\"Use GET /api/health, POST /api/start, POST /api/command\"}"
    );
}

int main(int argc, char **argv) {
    int server_fd;
    struct sockaddr_in addr;
    int opt = 1;
    int port = DEFAULT_PORT;

    if (argc > 1) {
        port = atoi(argv[1]);
        if (port <= 0 || port > 65535) {
            fprintf(stderr, "Invalid port: %s\n", argv[1]);
            return 1;
        }
    }

    srand((unsigned int)time(NULL));

    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket");
        return 1;
    }

    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        perror("setsockopt");
        close(server_fd);
        return 1;
    }

    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons((unsigned short)port);

    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(server_fd);
        return 1;
    }

    if (listen(server_fd, 16) < 0) {
        perror("listen");
        close(server_fd);
        return 1;
    }

    printf("Pasco C backend running on http://localhost:%d\n", port);
    printf("Endpoints: GET /api/health, POST /api/start, POST /api/command\n");

    while (1) {
        int client_fd = accept(server_fd, NULL, NULL);
        if (client_fd < 0) {
            if (errno == EINTR) {
                continue;
            }
            perror("accept");
            break;
        }

        handle_client(client_fd);
        close(client_fd);
    }

    close(server_fd);
    return 0;
}
