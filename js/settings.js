// ════════════════════════════════════════════════════════════════
//  js/settings.js  —  My Restaurant
//  PURPOSE : Single source of truth for ALL tunable constants.
//            Change values here; nothing else needs to be edited.
//
//  SECTIONS:
//    1. Canvas / layout dimensions
//    2. Timing & speeds
//    3. Colour palette  (COL)
//    4. State machine   (STATE)
//    5. Station layout  (STATIONS, STATION_LOOKUP)
//    6. Menu / recipes  (MENU)
//    7. Customer types  (CUSTOMER_TYPES)
//    8. Purchasable items (ITEMS)
//    9. Balance constants (STAR_THRESHOLDS no longer used for UI,
//       kept so customer.js star-bonus calculation remains data-driven)
//   10. Ranking config
// ════════════════════════════════════════════════════════════════

// ── 1. Canvas & layout ───────────────────────────────────────────
const WIDTH  = 390;   // canvas logical pixels
const HEIGHT = 720;
const FPS    = 60;    // fixed-update rate (game.js loop targets this)

const HUD_H  = 60;    // header bar height
const PAD_H  = 110;   // virtual-joypad area height at bottom
const GAME_H = HEIGHT - HUD_H - PAD_H;   // 550  — playfield height

// ── 2. Timing & speeds ───────────────────────────────────────────
// Tweak these to change game difficulty without touching logic files.
const SHOP_OPEN_DURATION  = 90  * FPS;   // total round length (frames)
const CUSTOMER_SPAWN_MIN  = 5   * FPS;   // earliest next spawn (frames)
const CUSTOMER_SPAWN_MAX  = 10  * FPS;   // latest  next spawn (frames)
const PLAYER_SPEED        = 4;           // pixels per frame (unused — snap movement)

// ── 3. Colour palette ────────────────────────────────────────────
// All UI colours live here.  Reference by COL.KEY everywhere in code.
const COL = {
  WHITE       : '#ffffff',
  BLACK       : '#000000',

  // Pastel-pink brand
  PRIMARY     : '#F48FB1',   // mid pink  — borders, highlights
  PRIMARY_L   : '#FCE4EC',   // pale blush — backgrounds
  PRIMARY_D   : '#C2185B',   // deep rose  — headings, selected states
  ACCENT      : '#F8BBD9',   // soft pink
  ACCENT2     : '#FF80AB',   // hot-pink accent (lollipop, glow)

  // Warm neutrals
  CREAM       : '#FFF8F0',
  PEACH       : '#FFCCBC',
  GOLD        : '#F9A825',   // money / star colour
  GOLD_L      : '#FFF9C4',
  MINT        : '#B2EBF2',   // info notifications
  GREEN       : '#A5D6A7',   // success / cook-done
  RED         : '#EF9A9A',   // anger / error
  PURPLE      : '#CE93D8',

  // Semantic UI roles
  HUD_BG      : 'rgba(244,143,177,0.97)',
  TEXT_MAIN   : '#5D1A33',   // body text
  TEXT_GOLD   : '#E65100',
  TEXT_LIGHT  : '#FFF0F5',

  // Scene colours
  WALL_TOP    : '#F8BBD9',
  WALL_MID    : '#F48FB1',
  FLOOR_A     : '#FFF0F5',   // checkerboard tile A
  FLOOR_B     : '#F8BBD9',   // checkerboard tile B
  COUNTER_TOP : '#F06292',
  COUNTER_BODY: '#AD1457',
  TABLE       : '#FFCDD2',
  TABLE_DARK  : '#EF9A9A',
  STATION_BG  : '#FCE4EC',
  STATION_BOR : '#F48FB1',
};

// ── 4. State machine ─────────────────────────────────────────────
const STATE = {
  INTRO    : 'intro',
  PLAYING  : 'playing',
  END_GAME : 'end_game',
  SCORE    : 'score',
  RANKING  : 'ranking',
};

// ── 5. Stations ──────────────────────────────────────────────────
// STATION_Y is pushed down so the player sprite fits between the
// counter bottom and the joypad area.
//   Counter top  = HUD_H + 365
//   Station box  = y:STATION_Y (HUD_H+370), h:62  → bottom at HUD_H+432
//   Player fixedY = HUD_H+432  (set in player.js constructor)
const STATION_Y = HUD_H + 370;

const STATIONS = {
  PREP   : { id: 'prep',  img: null, emoji: '🔪', label: 'เตรียมของ', x: 20,  y: STATION_Y, w: 72, h: 62 },
  COOK   : { id: 'cook',  img: null, emoji: '🔥', label: 'ทำอาหาร',   x: 108, y: STATION_Y, w: 72, h: 62 },
  PLATE  : { id: 'plate', img: null, emoji: '🍽️', label: 'จัดจาน',    x: 196, y: STATION_Y, w: 72, h: 62 },
  SERVE  : { id: 'serve', img: null, emoji: '🛎️', label: 'เสิร์ฟ',    x: 284, y: STATION_Y, w: 72, h: 62 },
};

// O(1) lookup by string id — avoids repeated Object.values().find() in hot paths.
// Usage: STATION_LOOKUP['prep']  instead of  Object.values(STATIONS).find(s=>s.id==='prep')
const STATION_LOOKUP = Object.fromEntries(
  Object.values(STATIONS).map(s => [s.id, s])
);

// ── 6. Menu / recipes ────────────────────────────────────────────
// steps[]     : ordered station ids the player must visit
// cookTime[]  : seconds at each step (parallel index with steps[])
// time        : customer patience seconds for this dish
// price       : base earn on serve (before tip/star bonus)
const MENU = {
  burger: {
    id: 'burger',  name: 'Burger',  emoji: '🍔',
    img: null,
    steps: ['prep', 'cook', 'plate'],
    cookTime: [3, 5, 2],
    price: 60, time: 39, color: '#FFCCBC',
  },
  chicken: {
    id: 'chicken', name: 'Chicken', emoji: '🍗',
    img: null,
    steps: ['prep', 'cook', 'plate'],
    cookTime: [3, 6, 2],
    price: 55, time: 42, color: '#FFF9C4',
  },
  fries: {
    id: 'fries',   name: 'Fries',   emoji: '🍟',
    img: null,
    steps: ['prep', 'cook', 'plate'],
    cookTime: [2, 3, 1],
    price: 35, time: 29, color: '#FFF9C4',
  },
  donut: {
    id: 'donut',   name: 'Donut',   emoji: '🍩',
    img: null,
    steps: ['prep', 'plate'],   // no cooking step — skips COOK station
    cookTime: [2, 1],
    price: 30, time: 26, color: '#FCE4EC',
  },
};

// ── 7. Customer types ────────────────────────────────────────────
// patience : multiplier on dish.time  (>1 = more patient)
// tip      : flat bonus added to serve payment (฿)
// isVIP    : triggers 50% price bonus on serve
const CUSTOMER_TYPES = [
  { id: 'student', name: 'นักเรียน',        emoji: '👦', color: '#B2EBF2', patience: 1.0, tip: 0,  imgKey: 'custStudent' },
  { id: 'office',  name: 'มนุษย์เงินเดือน', emoji: '👔', color: '#C5CAE9', patience: 0.9, tip: 5,  imgKey: 'custOffice'  },
  { id: 'elder',   name: 'ผู้สูงอายุ',       emoji: '👴', color: '#DCEDC8', patience: 1.2, tip: 10, imgKey: 'custElder'   },
  { id: 'couple',  name: 'คู่รัก',           emoji: '💑', color: '#F8BBD9', patience: 0.8, tip: 5,  imgKey: 'custCouple'  },
  { id: 'tourist', name: 'นักท่องเที่ยว',    emoji: '🧳', color: '#B2DFDB', patience: 1.1, tip: 0,  imgKey: 'custTourist' },
  { id: 'vip',     name: 'VIP ⭐',           emoji: '👑', color: '#FFF9C4', patience: 0.7, tip: 30, imgKey: 'custVip', isVIP: true },
];

// ── 8. Purchasable items ─────────────────────────────────────────
// duration : active frames (FPS × seconds)
// Effect implementation lives in game.js (_updatePlaying) and
// customer.js (patience decrement gated by isPatiencePaused flag).
const ITEMS = {
  lollipop: {
    id: 'lollipop', name: 'อมยิ้ม', emoji: '🍭',
    img: null, imgKey: 'itemLollipop',
    price: 40,
    duration: 15 * FPS,   // 15 s — pauses all customer patience timers
    description: 'หยุดเวลารอลูกค้า 15 วิ',
  },
  milk: {
    id: 'milk', name: 'นมกล่อง', emoji: '🥛',
    img: null, imgKey: 'itemMilk',
    price: 50,
    duration: 30 * FPS,   // 30 s — cook timer decrements 2× per frame
    description: 'ทำอาหารเร็วขึ้น 2× 30 วิ',
  },
};

// ── 9. Balance: customer star thresholds ─────────────────────────
// customer.js uses these fractions to drop stars as patience runs out.
// Changing these values shifts how quickly quality degrades.
//   stars=2 when patienceFrac < STAR_THRESHOLDS[0]  (60%)
//   stars=1 when patienceFrac < STAR_THRESHOLDS[1]  (35%)
//   stars=0 when patienceFrac < STAR_THRESHOLDS[2]  (15%)
// Star bonus on serve: stars × ฿10  (see customer.js serve())
const STAR_THRESHOLDS = [0.60, 0.35, 0.15];

// ── 10. Ranking ──────────────────────────────────────────────────
const RANKING_KEY = 'myRestaurant_ranking_v1';   // localStorage key
const RANKING_MAX = 10;                          // max entries kept
