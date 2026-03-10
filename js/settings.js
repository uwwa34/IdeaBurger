// ═══════════════════════════════════════════════════
//  settings.js  —  My Restaurant  (easy-tune config)
// ═══════════════════════════════════════════════════

const WIDTH  = 390;
const HEIGHT = 720;
const FPS    = 60;

const HUD_H  = 60;
const PAD_H  = 110;
const GAME_H = HEIGHT - HUD_H - PAD_H;   // 550

// ────────────────────────────────────────────────────
//  ⏱️  EASY TUNE
// ────────────────────────────────────────────────────
const SHOP_OPEN_DURATION = 150 * FPS;
const CUSTOMER_SPAWN_MIN = 5 * FPS;
const CUSTOMER_SPAWN_MAX = 10 * FPS;
const PLAYER_SPEED = 4;

// ── Pastel Pink Palette ───────────────────────────
const COL = {
  WHITE       : '#ffffff',
  BLACK       : '#000000',
  // Pastel pinks & warm creams
  PRIMARY     : '#F48FB1',   // mid pink
  PRIMARY_L   : '#FCE4EC',   // pale blush
  PRIMARY_D   : '#C2185B',   // deep rose
  ACCENT      : '#F8BBD9',   // soft pink
  ACCENT2     : '#FF80AB',   // hot pink accent
  CREAM       : '#FFF8F0',   // warm cream
  PEACH       : '#FFCCBC',   // peach
  GOLD        : '#F9A825',   // warm gold
  GOLD_L      : '#FFF9C4',   // light gold
  MINT        : '#B2EBF2',   // mint accent
  GREEN       : '#A5D6A7',   // soft green
  RED         : '#EF9A9A',   // soft red
  PURPLE      : '#CE93D8',   // lavender
  // UI
  HUD_BG      : 'rgba(244,143,177,0.97)',  // pink hud
  TEXT_MAIN   : '#5D1A33',   // dark rose text
  TEXT_GOLD   : '#E65100',   // orange-red text
  TEXT_LIGHT  : '#FFF0F5',
  WALL_TOP    : '#F8BBD9',   // pink wall
  WALL_MID    : '#F48FB1',
  FLOOR_A     : '#FFF0F5',   // light pink floor tile
  FLOOR_B     : '#F8BBD9',   // darker pink tile
  COUNTER_TOP : '#F06292',   // rose counter
  COUNTER_BODY: '#AD1457',   // dark rose counter body
  TABLE       : '#FFCDD2',   // light pink table
  TABLE_DARK  : '#EF9A9A',   // table edge
  STATION_BG  : '#FCE4EC',
  STATION_BOR : '#F48FB1',
};

const STATE = {
  INTRO    : 'intro',
  PLAYING  : 'playing',
  END_GAME : 'end_game',
  SCORE    : 'score',
  RANKING  : 'ranking',
};

// ── Stations: STATION_Y pushed down so player fits below ──
const STATION_Y = HUD_H + 370;
const STATIONS = {
  PREP   : { id: 'prep',  img: null, emoji: '🔪', label: 'เตรียมของ', x: 20,  y: STATION_Y, w: 72, h: 62 },
  COOK   : { id: 'cook',  img: null, emoji: '🔥', label: 'ทำอาหาร',   x: 108, y: STATION_Y, w: 72, h: 62 },
  PLATE  : { id: 'plate', img: null, emoji: '🍽️', label: 'จัดจาน',    x: 196, y: STATION_Y, w: 72, h: 62 },
  SERVE  : { id: 'serve', img: null, emoji: '🛎️', label: 'เสิร์ฟ',    x: 284, y: STATION_Y, w: 72, h: 62 },
};

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
    steps: ['prep', 'plate'],
    cookTime: [2, 1],
    price: 30, time: 26, color: '#FCE4EC',
  },
};

const CUSTOMER_TYPES = [
  { id: 'student', name: 'นักเรียน',        emoji: '👦', color: '#B2EBF2', patience: 1.0, tip: 0,  imgKey: 'custStudent' },
  { id: 'office',  name: 'มนุษย์เงินเดือน', emoji: '👔', color: '#C5CAE9', patience: 0.9, tip: 5,  imgKey: 'custOffice'  },
  { id: 'elder',   name: 'ผู้สูงอายุ',       emoji: '👴', color: '#DCEDC8', patience: 1.2, tip: 10, imgKey: 'custElder'   },
  { id: 'couple',  name: 'คู่รัก',           emoji: '💑', color: '#F8BBD9', patience: 0.8, tip: 5,  imgKey: 'custCouple'  },
  { id: 'tourist', name: 'นักท่องเที่ยว',    emoji: '🧳', color: '#B2DFDB', patience: 1.1, tip: 0,  imgKey: 'custTourist' },
  { id: 'vip',     name: 'VIP ⭐',           emoji: '👑', color: '#FFF9C4', patience: 0.7, tip: 30, imgKey: 'custVip', isVIP: true },
];


// ── Items ───────────────────────────────────────────
const ITEMS = {
  lollipop: {
    id: 'lollipop', name: 'อมยิ้ม', emoji: '🍭',
    img: null, imgKey: 'itemLollipop',
    price: 40,
    duration: 20 * 60,   // 15 sec freeze customer timers
    description: 'หยุดเวลารอลูกค้า 20 วิ',
  },
  milk: {
    id: 'milk', name: 'นมกล่อง', emoji: '🥛',
    img: null, imgKey: 'itemMilk',
    price: 50,
    duration: 30 * 60,   // 20 sec half cook times
    description: 'ทำอาหารเร็วขึ้น เป็นเวลา 30 วิ',
  },
};
const STAR_THRESHOLDS = [0.4, 0.65, 0.85];
const RANKING_KEY = 'myRestaurant_ranking_v1';
const RANKING_MAX = 10;

const IMG = {
  BG_OUTSIDE    : 'assets/images/bg_outside.png',
  BG_INSIDE     : 'assets/images/bg_inside.png',
  PLAYER        : 'assets/images/player.png',
  MENU_BURGER   : 'assets/images/menu_burger.png',
  MENU_CHICKEN  : 'assets/images/menu_chicken.png',
  MENU_FRIES    : 'assets/images/menu_fries.png',
  MENU_DONUT    : 'assets/images/menu_donut.png',
};

const SND = {
  BGM   : 'assets/sounds/bgm.mp3',
  COIN  : 'assets/sounds/coin.wav',
  SERVE : 'assets/sounds/serve.wav',
  ANGER : 'assets/sounds/anger.wav',
  CHEER : 'assets/sounds/cheer.wav',
  ERROR : 'assets/sounds/error.wav',  // wrong station buzz
};
