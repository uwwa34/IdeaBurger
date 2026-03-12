// ════════════════════════════════════════════════════════════════
//  js/kitchen.js  —  My Restaurant
//
//  PURPOSE : Draws the restaurant scene (floor, walls, tables,
//            counter, stations) and provides station-highlight
//            helpers used by game.js during gameplay.
//
//  PUBLIC API:
//    drawInside(ctx)            — full playfield draw (called every frame)
//    drawOutside(ctx)           — storefront fallback (INTRO state)
//    highlightStation(ctx, id)  — pink pulse ring around current station
//    blinkStation(ctx, id)      — green blink + 👇 arrow for "go here next"
//
//  ASSET INJECTION:
//    kitchen.bgInside = <HTMLImageElement>  (set by game.js setImages)
//    If bgInside is not loaded, a procedurally drawn fallback is used.
//
//  STATION LOOKUP:
//    Uses STATION_LOOKUP[id] (O(1)) defined in settings.js.
//    All magic pixel values here match TABLE_DEFS in customer.js
//    and the STATION_Y constant in settings.js — change in sync.
//
//  DEPENDENCIES (globals from settings.js):
//    WIDTH, HEIGHT, HUD_H, GAME_H, COL, STATIONS, STATION_LOOKUP
// ════════════════════════════════════════════════════════════════

class Kitchen {
  constructor() {
    // _lightAlpha reserved for a future dynamic lighting system
    this._lightAlpha = 0;
    this.bgInside    = null;   // injected by game.js via setImages()
  }

  // Reserved for future use (e.g. day/night cycle)
  update() {}

  drawInside(ctx) {
    // ── Use bg_inside.png if available ───────────
    if (this.bgInside && this.bgInside.complete && this.bgInside.naturalWidth > 0) {
      // Draw full background image (covers HUD_H → HEIGHT-PAD_H)
      ctx.drawImage(this.bgInside, 0, HUD_H, WIDTH, GAME_H);
      // Still draw stations on top (counters + station boxes)
      this._drawKitchenArea(ctx);
      return;
    }

    // ── Fallback: drawn background ─────────────────
    // Floor (checkerboard pastel pink)
    const tileSize = 40;
    for (let row = 0; row < Math.ceil(GAME_H / tileSize) + 1; row++) {
      for (let col = 0; col < Math.ceil(WIDTH / tileSize) + 1; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? COL.FLOOR_A : COL.FLOOR_B;
        ctx.fillRect(col * tileSize, HUD_H + row * tileSize, tileSize, tileSize);
      }
    }

    // Back wall
    ctx.fillStyle = COL.WALL_MID;
    ctx.fillRect(0, HUD_H, WIDTH, 80);
    ctx.fillStyle = COL.WALL_TOP;
    ctx.fillRect(0, HUD_H, WIDTH, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, HUD_H + 28, WIDTH, 6);

    this._drawTables(ctx);
    this._drawKitchenArea(ctx);
  }

  drawOutside(ctx) {
    // Simple pastel outside (used for intro/outro fallback)
    ctx.fillStyle = '#FCE4EC';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.6);
    sky.addColorStop(0, '#F8BBD9');
    sky.addColorStop(1, '#FCE4EC');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT * 0.6);
    // ground
    ctx.fillStyle = '#FFCCBC'; ctx.fillRect(0, HEIGHT * 0.6, WIDTH, HEIGHT * 0.4);
    // storefront
    ctx.fillStyle = '#F48FB1';
    ctx.fillRect(80, 180, 230, 220);
    ctx.fillStyle = '#FCE4EC'; ctx.fillRect(100, 160, 190, 30);
    // sign
    ctx.fillStyle = '#AD1457'; ctx.font = 'bold 16px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🍽️ My Restaurant', WIDTH/2, 175);
    // door
    ctx.fillStyle = '#AD1457'; ctx.fillRect(165, 310, 60, 90);
    ctx.fillStyle = '#FCE4EC'; ctx.fillRect(170, 315, 50, 80);
  }

  // Pink pulsing ring drawn around the station the player is currently at.
  // Signals which station is "active" without obscuring its icon.
  highlightStation(ctx, stationId) {
    const st = STATION_LOOKUP[stationId];
    if (!st) return;
    const pulse = 0.55 + Math.abs(Math.sin(Date.now() / 380)) * 0.45;
    ctx.save();
    ctx.shadowColor = COL.ACCENT2;
    ctx.shadowBlur  = 24 * pulse;
    ctx.strokeStyle = `rgba(255,128,171,${pulse})`;
    ctx.lineWidth   = 3;
    ctx.beginPath(); ctx.roundRect(st.x - 3, st.y - 3, st.w + 6, st.h + 6, 10); ctx.stroke();
    ctx.restore();
  }

  // Green blinking overlay + 👇 arrow above a station.
  // Drawn when player._stepReady=true to guide the player to the next step.
  // Blink rate: on ~400 ms / off ~400 ms (driven by sin wave on Date.now()).
  blinkStation(ctx, stationId) {
    const st = STATION_LOOKUP[stationId];
    if (!st) return;
    // Fast green blink: on ~400ms, off ~400ms
    const blink = Math.sin(Date.now() / 200);
    if (blink < 0) return;   // off phase — skip draw
    const alpha = 0.5 + blink * 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COL.GREEN;
    ctx.beginPath(); ctx.roundRect(st.x - 3, st.y - 3, st.w + 6, st.h + 6, 10); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#388E3C';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(st.x - 3, st.y - 3, st.w + 6, st.h + 6, 10); ctx.stroke();
    // Arrow indicator above
    ctx.fillStyle = '#fff';
    ctx.font = '18px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('👇', st.x + st.w/2, st.y - 4);
    ctx.restore();
  }

  _drawDecor(ctx) {
    // Wall decorations
    const pics = [
      { x: 28,  y: HUD_H + 6,  w: 52, h: 36, label: '🌸' },
      { x: 158, y: HUD_H + 4,  w: 64, h: 40, label: '🍰' },
      { x: 296, y: HUD_H + 6,  w: 52, h: 36, label: '🌷' },
    ];
    pics.forEach(p => {
      ctx.fillStyle = '#AD1457';
      ctx.fillRect(p.x-3, p.y-3, p.w+6, p.h+6);
      ctx.fillStyle = COL.CREAM;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.font = '22px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.label, p.x+p.w/2, p.y+p.h/2);
    });
  }

  _drawTables(ctx) {
    const tables = [
      { x: 30,  y: HUD_H + 140, w: 110, h: 60 },
      { x: 140, y: HUD_H + 140, w: 110, h: 60 },
      { x: 250, y: HUD_H + 140, w: 110, h: 60 },
      { x: 30,  y: HUD_H + 255, w: 110, h: 60 },
      { x: 140, y: HUD_H + 255, w: 110, h: 60 },
      { x: 250, y: HUD_H + 255, w: 110, h: 60 },
    ];
    tables.forEach(t => {
      // chair back at top
      ctx.fillStyle = COL.TABLE_DARK;
      ctx.beginPath(); ctx.roundRect(t.x+18, t.y-14, t.w-36, 18, 6); ctx.fill();
      ctx.fillStyle = COL.TABLE;
      ctx.beginPath(); ctx.roundRect(t.x+22, t.y-10, t.w-44, 12, 4); ctx.fill();

      // table shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(t.x+4, t.y+4, t.w, t.h);

      // table top
      ctx.fillStyle = COL.TABLE_DARK;
      ctx.beginPath(); ctx.roundRect(t.x, t.y, t.w, t.h, 6); ctx.fill();
      ctx.fillStyle = COL.TABLE;
      ctx.beginPath(); ctx.roundRect(t.x+4, t.y+4, t.w-8, t.h-8, 4); ctx.fill();

      // center plate mat
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(t.x+t.w/2, t.y+t.h/2, 20, 13, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    });
  }

  _drawKitchenArea(ctx) {
    const counterY = HUD_H + 365;  // just above STATION_Y
    const counterH = 40;

    // counter body
    ctx.fillStyle = COL.COUNTER_BODY;
    ctx.fillRect(0, counterY, WIDTH, counterH);
    // counter top surface
    ctx.fillStyle = COL.COUNTER_TOP;
    ctx.fillRect(0, counterY, WIDTH, 12);
    // counter shine
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, counterY, WIDTH, 4);

    // Draw stations (on counter)
    const stArr = Object.values(STATIONS);
    stArr.forEach(st => this._drawStation(ctx, st));

    // Flow arrows between stations
    for (let i = 0; i < stArr.length - 1; i++) {
      const a = stArr[i], b = stArr[i+1];
      const ax = a.x + a.w + 1, ay = a.y + a.h/2;
      const bx = b.x - 1,       by = b.y + b.h/2;
      ctx.fillStyle = 'rgba(255,128,171,0.7)';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('▶', (ax+bx)/2, (ay+by)/2);
    }
  }

  _drawStation(ctx, st) {
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(st.x+3, st.y+3, st.w, st.h);

    // base
    ctx.fillStyle = COL.STATION_BG;
    ctx.beginPath(); ctx.roundRect(st.x, st.y, st.w, st.h, 8); ctx.fill();
    ctx.strokeStyle = COL.STATION_BOR; ctx.lineWidth = 2; ctx.stroke();

    // inner surface
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.roundRect(st.x+4, st.y+4, st.w-8, st.h-12, 5); ctx.fill();

    const cx = st.x + st.w/2, cy = st.y + st.h/2 - 4;
    if (st.img && st.img.complete && st.img.naturalWidth > 0) {
      ctx.drawImage(st.img, cx-20, cy-20, 40, 40);
    } else {
      ctx.font = '28px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(st.emoji, cx, cy);
    }
    // label
    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(st.label, cx, st.y + st.h - 2);
  }
}
