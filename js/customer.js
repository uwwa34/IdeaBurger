// ════════════════════════════════════════════════════════════════
//  js/customer.js  —  My Restaurant
//
//  CLASSES:
//    Customer        — one diner; handles AI, animation, drawing
//    CustomerManager — spawn pool, seat management, aggregate ops
//
//  DEPENDENCIES (globals from settings.js):
//    HUD_H, FPS, WIDTH, COL, MENU, CUSTOMER_TYPES, STAR_THRESHOLDS
//
//  NOTE: Customer.update() receives isPatiencePaused (boolean) from
//  CustomerManager.update(), which in turn is passed from game.js
//  each frame.  This avoids the old window._lollipopActive global.
// ════════════════════════════════════════════════════════════════

// Table layout — must match kitchen.js _drawTables() pixel positions.
// Row 0 centres: y = HUD_H+140  (tableCY = HUD_H+170)
// Row 1 centres: y = HUD_H+255  (tableCY = HUD_H+285)
const TABLE_DEFS = [
  { cx: 85,  tableTop: HUD_H + 140, tableCY: HUD_H + 170 },
  { cx: 195, tableTop: HUD_H + 140, tableCY: HUD_H + 170 },
  { cx: 305, tableTop: HUD_H + 140, tableCY: HUD_H + 170 },
  { cx: 85,  tableTop: HUD_H + 255, tableCY: HUD_H + 285 },
  { cx: 195, tableTop: HUD_H + 255, tableCY: HUD_H + 285 },
  { cx: 305, tableTop: HUD_H + 255, tableCY: HUD_H + 285 },
];

// ────────────────────────────────────────────────────────────────
class Customer {
  // tableIdx : 0-5, matching TABLE_DEFS index
  constructor(tableIdx) {
    this.tableIdx  = tableIdx;
    const td       = TABLE_DEFS[tableIdx];

    // Sprite is drawn with feet at tableTop
    this.seatX  = td.cx;
    this.seatY  = td.tableTop;

    // Served food dish shown at table centre
    this.dishX  = td.cx;
    this.dishY  = td.tableCY;

    // ── Randomise type ───────────────────────
    // VIP appears ~12% of the time
    const roll = Math.random();
    this.type = roll < 0.12
      ? CUSTOMER_TYPES.find(t => t.isVIP)
      : CUSTOMER_TYPES.filter(t => !t.isVIP)[
          Math.floor(Math.random() * (CUSTOMER_TYPES.length - 1))
        ];

    // ── Randomise order ──────────────────────
    const menuKeys = Object.keys(MENU);
    this.order = MENU[menuKeys[Math.floor(Math.random() * menuKeys.length)]];

    // ── Patience ─────────────────────────────
    // Base seconds = dish.time × type multiplier; converted to frames
    const baseSec     = this.order.time * this.type.patience;
    this.patience     = Math.round(baseSec * FPS);
    this.patienceLeft = this.patience;

    // Star quality (3 → 0) affects earn bonus — see serve()
    this.stars      = 3;
    this.shakeTimer = 0;   // frames of camera-shake left when losing a star

    // ── State machine ─────────────────────────
    // 'entering' → 'waiting' → 'eating' → 'leaving'
    //                        ↘ 'angry'  → (off-screen, removed)
    this.state = 'entering';

    // Entry slide-in from left edge
    this.x = -60;
    this.y = this.seatY;
    this.walkTimer = 0;   // used for walking sway animation

    // Earn tracking
    this.money = 0;

    // Floating "+฿XX" text that rises after a successful serve
    this.floatText  = null;
    this.floatY     = 0;
    this.floatTimer = 0;

    // Eating animation
    this.eatTimer    = 0;
    this.eatDuration = FPS * 4;   // 4 s before leaving after eating
    this.eatPhase    = 0;         // 0-3 cycle for spoon-bob keyframes

    // Anger edge-detection flag (set by CustomerManager to avoid double-counting)
    this._angerCounted = false;
  }

  // isPatiencePaused — true while lollipop item is active (passed from game.js)
  update(isPatiencePaused) {
    if (this.state === 'entering') {
      const done = this._moveToward(this.seatX, this.seatY, 3);
      if (done) this.state = 'waiting';
      return;
    }

    if (this.state === 'waiting') {
      // Only count down when NOT paused by the lollipop item
      if (!isPatiencePaused) this.patienceLeft--;

      // Star degradation uses STAR_THRESHOLDS from settings.js
      // (index 0 = 60%, index 1 = 35%, index 2 = 15%)
      const frac = this.patienceLeft / this.patience;
      if      (frac < STAR_THRESHOLDS[2] && this.stars > 0) { this.stars = 0; this.shakeTimer = 20; }
      else if (frac < STAR_THRESHOLDS[1] && this.stars > 1) { this.stars = 1; this.shakeTimer = 16; }
      else if (frac < STAR_THRESHOLDS[0] && this.stars > 2) { this.stars = 2; this.shakeTimer = 12; }

      if (this.shakeTimer > 0) this.shakeTimer--;

      if (this.patienceLeft <= 0) {
        this.state      = 'angry';
        this.shakeTimer = 0;
      }
    }

    if (this.state === 'angry')   this._moveToward(-80, this.seatY, 2.5);

    if (this.state === 'eating') {
      this.eatTimer++;
      this.eatPhase = Math.floor(this.eatTimer / 10) % 4;
      if (this.eatTimer >= this.eatDuration) this.state = 'leaving';
    }

    if (this.state === 'leaving') this._moveToward(-80, this.seatY, 2.5);

    // Float text rises each frame it is alive
    if (this.floatTimer > 0) {
      this.floatTimer--;
      this.floatY -= 0.6;
    }
  }

  // Called by game.js when player delivers the correct dish.
  // Returns the total money earned (price + tip + star bonus + vip bonus).
  serve() {
    if (this.state !== 'waiting') return 0;
    this.state = 'eating';

    const starBonus = this.stars * 10;         // ฿0 / ฿10 / ฿20 / ฿30
    const tip       = this.type.tip;
    const vipBonus  = this.type.isVIP ? Math.floor(this.order.price * 0.5) : 0;
    this.money      = this.order.price + tip + starBonus + vipBonus;

    this.floatText  = `+฿${this.money}`;
    this.floatY     = this.seatY - 30;
    this.floatTimer = 50;

    return this.money;
  }

  // Returns true once the customer has fully left the screen
  isGone() {
    return (this.state === 'leaving' || this.state === 'angry') && this.x < -70;
  }

  // ─── Private helpers ─────────────────────────
  _moveToward(tx, ty, speed) {
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) { this.x = tx; this.y = ty; return true; }
    this.x += (dx / dist) * speed;
    this.y += (dy / dist) * speed;
    return false;
  }

  // ─── Drawing ─────────────────────────────────
  draw(ctx) {
    // Walking / leaving / angry states: draw at current (animated) x
    if (this.state === 'entering' || this.state === 'leaving' || this.state === 'angry') {
      this._drawCharacter(ctx, this.x, this.y);
      if (this.state === 'angry') {
        ctx.font = '22px "Segoe UI Emoji"'; ctx.textAlign = 'center';
        ctx.fillText('😤', this.x, this.y - 48);
      }
      return;
    }

    // Seated: jitter on star-loss, otherwise fixed at seatX
    const shake = this.shakeTimer > 6 ? 2 : (this.shakeTimer > 0 ? -2 : 0);
    const cx    = this.seatX + shake;

    this._drawCharacter(ctx, cx, this.seatY);

    if (this.state === 'waiting') {
      this._drawOrderBubble(ctx, cx, this.seatY);
      // Note: patience bar is drawn inside _drawOrderBubble
    }

    if (this.state === 'eating') this._drawEating(ctx, cx);

    // Floating earn text
    if (this.floatTimer > 0 && this.floatText) {
      const alpha = Math.min(1, this.floatTimer / 20);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = COL.GOLD;
      ctx.font = 'bold 18px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.floatText, cx, this.floatY);
      ctx.restore();
    }
  }

  _drawCharacter(ctx, cx, cy) {
    const img       = this.type.img;
    const isWalking = (this.state === 'entering' || this.state === 'leaving');

    if (isWalking) this.walkTimer++;

    const spriteW = 44, spriteH = 56;

    // Ground shadow
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();

    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      if (isWalking) {
        const sway = Math.sin(this.walkTimer * 0.30) * 5;
        const bobV = Math.abs(Math.sin(this.walkTimer * 0.30)) * 3;
        if (this.state === 'leaving') {
          ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0);
        }
        ctx.drawImage(img, cx - spriteW / 2 + sway, cy - spriteH + bobV, spriteW, spriteH);
      } else {
        const idleSway = Math.sin(Date.now() * 0.001 + this.tableIdx) * 1.5;
        ctx.drawImage(img, cx - spriteW / 2 + idleSway, cy - spriteH, spriteW, spriteH);
      }
      if (this.type.isVIP) {
        ctx.save(); ctx.shadowColor = COL.GOLD; ctx.shadowBlur = 12;
        ctx.font = '14px "Segoe UI Emoji"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('👑', cx, cy - spriteH - 10);
        ctx.restore();
      }
      ctx.restore();
    } else {
      // ── Fallback drawn character ──────────────
      const sway  = isWalking ? Math.sin(this.walkTimer * 0.30) * 4 : 0;
      const bobV  = isWalking ? Math.abs(Math.sin(this.walkTimer * 0.30)) * 3 : 0;
      const drawCx = cx + sway;

      ctx.fillStyle = this.type.color;
      ctx.beginPath(); ctx.roundRect(drawCx - 13, cy - 8 - bobV, 26, 28, 6); ctx.fill();
      ctx.fillStyle = '#FFCC99';
      ctx.beginPath(); ctx.arc(drawCx, cy - 22 - bobV, 14, 0, Math.PI * 2); ctx.fill();
      ctx.font = '20px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.type.emoji, drawCx, cy - 22 - bobV);
      if (this.type.isVIP) {
        ctx.save(); ctx.shadowColor = COL.GOLD; ctx.shadowBlur = 12;
        ctx.font = '14px "Segoe UI Emoji"';
        ctx.fillText('👑', drawCx, cy - 42 - bobV);
        ctx.restore();
      }
    }
  }

  _drawOrderBubble(ctx, cx, cy) {
    const bx = cx - 28, by = cy - 88, bw = 56, bh = 46;

    ctx.fillStyle   = 'rgba(255,255,240,0.96)';
    ctx.strokeStyle = this.type.isVIP ? COL.GOLD : '#CCC';
    ctx.lineWidth   = this.type.isVIP ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();

    // Speech-bubble tail
    ctx.fillStyle = 'rgba(255,255,240,0.96)';
    ctx.beginPath();
    ctx.moveTo(cx - 5, by + bh);
    ctx.lineTo(cx + 5, by + bh);
    ctx.lineTo(cx,     by + bh + 8);
    ctx.closePath(); ctx.fill();

    // Food icon
    if (this.order.img && this.order.img.complete && this.order.img.naturalWidth > 0) {
      ctx.drawImage(this.order.img, bx + 8, by + 4, 40, 30);
    } else {
      ctx.font = '22px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333';
      ctx.fillText(this.order.emoji, cx, by + 22);
    }

    // Patience bar inside bubble bottom
    this._drawPatienceBar(ctx, cx, cy);
  }

  _drawPatienceBar(ctx, cx, cy) {
    const frac = this.patienceLeft / this.patience;
    const barW = 52, barH = 5;
    const bx = cx - barW / 2, by = cy - 47;

    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = frac > 0.6 ? '#4CAF50' : frac > 0.3 ? '#FFC107' : '#F44336';
    ctx.fillRect(bx, by, barW * frac, barH);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5; ctx.strokeRect(bx, by, barW, barH);
  }

  _drawEating(ctx, cx) {
    const dy = this.dishY;

    // Plate
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(this.dishX, dy, 22, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.stroke();

    // Food on plate
    if (this.order.img && this.order.img.complete && this.order.img.naturalWidth > 0) {
      ctx.drawImage(this.order.img, this.dishX - 16, dy - 18, 32, 32);
    } else {
      ctx.font = '22px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.order.emoji, this.dishX, dy - 4);
    }

    // Spoon bob (4-frame cycle)
    const bobY = [0, -4, -6, -4][this.eatPhase];
    ctx.font = '14px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🥄', cx + 10, this.seatY - 8 + bobY);

    // Happy emoji
    ctx.font = '12px "Segoe UI Emoji"';
    ctx.fillText('😋', cx - 8, this.seatY - 36);
  }
}

// ════════════════════════════════════════════════════════════════
class CustomerManager {
  constructor() {
    this.customers  = [];
    this.spawnTimer = FPS * 3;             // initial delay before first customer
    this.nextSpawn  = this._nextSpawnDelay();

    // Seat occupancy — indexed parallel to TABLE_DEFS (6 seats)
    this.seats = TABLE_DEFS.map(() => ({ occupied: false }));

    // Pending anger count for edge-detection (reset each frame by countNewAngry)
    this._pendingAnger = 0;
  }

  // Called every game frame.
  // shopOpen         — false during end-game to stop spawning
  // isPatiencePaused — true while lollipop item is active; passed down to each Customer
  update(shopOpen, isPatiencePaused) {
    this.customers.forEach(c => c.update(isPatiencePaused));

    // Edge-detect angry departures BEFORE removing them from the array
    for (const c of this.customers) {
      if (!c._angerCounted && c.isGone() && c.stars === 0) {
        c._angerCounted = true;
        this._pendingAnger++;
      }
    }

    // Clean up gone customers, free their seats
    this.customers = this.customers.filter(c => {
      if (c.isGone()) { this.seats[c.tableIdx].occupied = false; return false; }
      return true;
    });

    // Spawn logic
    if (shopOpen) {
      this.spawnTimer++;
      if (this.spawnTimer >= this.nextSpawn) {
        this._trySpawn();
        this.spawnTimer = 0;
        this.nextSpawn  = this._nextSpawnDelay();
      }
    }
  }

  draw(ctx) { this.customers.forEach(c => c.draw(ctx)); }

  // Returns the first waiting customer whose order matches foodId, or null
  findWaiting(foodId) {
    return this.customers.find(c => c.state === 'waiting' && c.order.id === foodId) || null;
  }

  // Returns number of customers who became angry THIS frame (edge detection).
  // Resets the counter — call exactly once per frame.
  countNewAngry() {
    let n = this._pendingAnger;
    this._pendingAnger = 0;
    for (const c of this.customers) {
      if (!c._angerCounted && c.state === 'angry') {
        c._angerCounted = true;
        n++;
      }
    }
    return n;
  }

  // ─── Private ────────────────────────────────
  _nextSpawnDelay() {
    return CUSTOMER_SPAWN_MIN +
      Math.floor(Math.random() * (CUSTOMER_SPAWN_MAX - CUSTOMER_SPAWN_MIN));
  }

  _trySpawn() {
    const free = this.seats.findIndex(s => !s.occupied);
    if (free === -1) return;   // all 6 seats full
    this.seats[free].occupied = true;
    this.customers.push(new Customer(free));
  }
}
