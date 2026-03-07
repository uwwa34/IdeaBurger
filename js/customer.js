// ═══════════════════════════════════════════════════
//  js/customer.js  — Customer + CustomerManager  v3
//  - Customer sits at TOP of table
//  - Food appears CENTER of table on serve
//  - Simple eating animation (bob spoon up/down)
// ═══════════════════════════════════════════════════

// Table layout mirror (matches kitchen.js _drawTables)
// Row 0: y = HUD_H+90,  h=60  → top-of-table y = HUD_H+90,   center y = HUD_H+120
// Row 1: y = HUD_H+180, h=60  → top-of-table y = HUD_H+180,  center y = HUD_H+210
const TABLE_DEFS = [
  { cx: 85,  tableTop: HUD_H + 90,  tableCY: HUD_H + 120 },
  { cx: 195, tableTop: HUD_H + 90,  tableCY: HUD_H + 120 },
  { cx: 305, tableTop: HUD_H + 90,  tableCY: HUD_H + 120 },
  { cx: 85,  tableTop: HUD_H + 180, tableCY: HUD_H + 210 },
  { cx: 195, tableTop: HUD_H + 180, tableCY: HUD_H + 210 },
  { cx: 305, tableTop: HUD_H + 180, tableCY: HUD_H + 210 },
];

class Customer {
  constructor(tableIdx) {
    this.tableIdx  = tableIdx;
    const td       = TABLE_DEFS[tableIdx];

    // Character sits above the table top
    this.seatX  = td.cx;
    this.seatY  = td.tableTop - 1;  // character feet at table top -28

    // Food dish shown at table center
    this.dishX  = td.cx;
    this.dishY  = td.tableCY;

    // pick random type (VIP ~12%)
    const roll = Math.random();
    this.type = roll < 0.12
      ? CUSTOMER_TYPES.find(t => t.isVIP)
      : CUSTOMER_TYPES.filter(t => !t.isVIP)[Math.floor(Math.random() * (CUSTOMER_TYPES.length - 1))];

    // pick random order from current MENU
    const menuKeys = Object.keys(MENU);
    this.order = MENU[menuKeys[Math.floor(Math.random() * menuKeys.length)]];

    // patience in frames
    const baseSec = this.order.time * this.type.patience;
    this.patience     = Math.round(baseSec * FPS);
    this.patienceLeft = this.patience;

    // star rating (3 → 0)
    this.stars = 3;
    this.shakeTimer = 0;

    // states: 'entering' | 'waiting' | 'served' | 'eating' | 'leaving' | 'angry'
    this.state = 'entering';

    // entry animation — slide in from left
    this.x = -60;
    this.y = this.seatY;

    this.money = 0;

    // floating "+฿" text
    this.floatText  = null;
    this.floatY     = 0;
    this.floatTimer = 0;

    // eating animation
    this.eatTimer    = 0;      // counts up while eating
    this.eatDuration = FPS * 4; // 4s to eat then leave
    this.eatPhase    = 0;      // 0-3 cycle for spoon bob
  }

  update() {
    // entry slide-in
    if (this.state === 'entering') {
      const done = this._moveToward(this.seatX, this.seatY, 3);
      if (done) {
        this.state = 'waiting';
      }
      return;
    }

    if (this.state === 'waiting') {
      this.patienceLeft--;

      // star loss thresholds
      const frac = this.patienceLeft / this.patience;
      if      (frac < 0.15 && this.stars > 0) { this.stars = 0; this.shakeTimer = 20; }
      else if (frac < 0.35 && this.stars > 1) { this.stars = 1; this.shakeTimer = 16; }
      else if (frac < 0.60 && this.stars > 2) { this.stars = 2; this.shakeTimer = 12; }

      if (this.shakeTimer > 0) this.shakeTimer--;

      if (this.patienceLeft <= 0) {
        this.state = 'angry';
        this.shakeTimer = 0;
      }
    }

    if (this.state === 'angry') {
      this._moveToward(-80, this.seatY, 2.5);
    }

    if (this.state === 'eating') {
      this.eatTimer++;
      this.eatPhase = Math.floor(this.eatTimer / 10) % 4;
      if (this.eatTimer >= this.eatDuration) {
        this.state = 'leaving';
      }
    }

    if (this.state === 'leaving') {
      this._moveToward(-80, this.seatY, 2.5);
    }

    // float text animation
    if (this.floatTimer > 0) {
      this.floatTimer--;
      this.floatY -= 0.6;
    }
  }

  serve() {
    if (this.state !== 'waiting') return 0;
    this.state = 'eating';

    const starBonus = this.stars * 10;
    const tip       = this.type.tip;
    const vipBonus  = this.type.isVIP ? Math.floor(this.order.price * 0.5) : 0;
    this.money = this.order.price + tip + starBonus + vipBonus;

    this.floatText  = `+฿${this.money}`;
    this.floatY     = this.seatY - 30;
    this.floatTimer = 50;

    return this.money;
  }

  isGone() {
    return (this.state === 'leaving' || this.state === 'angry') && this.x < -70;
  }

  _moveToward(tx, ty, speed) {
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 2) { this.x = tx; this.y = ty; return true; }
    this.x += (dx/dist) * speed;
    this.y += (dy/dist) * speed;
    return false;
  }

  draw(ctx) {
    if (this.state === 'entering' || this.state === 'leaving' || this.state === 'angry') {
      this._drawCharacter(ctx, this.x, this.y);
      if (this.state === 'angry') {
        ctx.font = '22px "Segoe UI Emoji"'; ctx.textAlign = 'center';
        ctx.fillText('😤', this.x, this.y - 48);
      }
      return;
    }

    // seated — character stays at seatX
    const shake = this.shakeTimer > 6 ? 2 : (this.shakeTimer > 0 ? -2 : 0);
    const cx    = this.seatX + shake;

    this._drawCharacter(ctx, cx, this.seatY);

    if (this.state === 'waiting' || this.state === 'seated') {
      this._drawOrderBubble(ctx, cx, this.seatY);
      this._drawPatienceBar(ctx, cx, this.seatY);
    }

    if (this.state === 'eating') {
      this._drawEating(ctx, cx);
    }

    // floating money text
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
    // shadow
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 20, 15, 5, 0, 0, Math.PI*2); ctx.fill(); ctx.restore();

    // body
    ctx.fillStyle = this.type.color;
    ctx.beginPath(); ctx.roundRect(cx-13, cy-8, 26, 28, 6); ctx.fill();

    // head
    ctx.fillStyle = '#FFCC99';
    ctx.beginPath(); ctx.arc(cx, cy-22, 14, 0, Math.PI*2); ctx.fill();

    // face emoji
    ctx.font = '20px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.type.emoji, cx, cy - 22);

    if (this.type.isVIP) {
      ctx.save(); ctx.shadowColor = COL.GOLD; ctx.shadowBlur = 12;
      ctx.font = '14px "Segoe UI Emoji"'; ctx.fillText('👑', cx, cy - 42); ctx.restore();
    }
  }

  _drawOrderBubble(ctx, cx, cy) {
    const bx = cx - 28, by = cy - 88, bw = 56, bh = 46;

    ctx.fillStyle = 'rgba(255,255,240,0.96)';
    ctx.strokeStyle = this.type.isVIP ? COL.GOLD : '#CCC';
    ctx.lineWidth = this.type.isVIP ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8); ctx.fill(); ctx.stroke();

    // tail
    ctx.fillStyle = 'rgba(255,255,240,0.96)';
    ctx.beginPath();
    ctx.moveTo(cx-5, by+bh); ctx.lineTo(cx+5, by+bh); ctx.lineTo(cx, by+bh+8);
    ctx.closePath(); ctx.fill();

    // food image or emoji
    if (this.order.img && this.order.img.complete && this.order.img.naturalWidth > 0) {
      ctx.drawImage(this.order.img, bx+8, by+4, 40, 30);
    } else {
      ctx.font = '22px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333';
      ctx.fillText(this.order.emoji, cx, by + 22);
    }

    // patience bar inside bubble bottom
    this._drawPatienceBar(ctx, cx, cy);
  }

  _drawPatienceBar(ctx, cx, cy) {
    const frac = this.patienceLeft / this.patience;
    const barW = 52, barH = 5;
    const bx = cx - barW/2, by = cy - 47;

    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = frac > 0.6 ? '#4CAF50' : frac > 0.3 ? '#FFC107' : '#F44336';
    ctx.fillRect(bx, by, barW * frac, barH);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5; ctx.strokeRect(bx, by, barW, barH);
  }

  _drawEating(ctx, cx) {
    // Food plate at CENTER of table
    const dy = this.dishY;

    // plate
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(this.dishX, dy, 22, 14, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.stroke();

    // food on plate (image or emoji)
    if (this.order.img && this.order.img.complete && this.order.img.naturalWidth > 0) {
      ctx.drawImage(this.order.img, this.dishX - 16, dy - 18, 32, 32);
    } else {
      ctx.font = '22px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.order.emoji, this.dishX, dy - 4);
    }

    // spoon/fork bob animation on character
    const bobY = [0, -4, -6, -4][this.eatPhase];
    ctx.font = '14px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🥄', cx + 10, this.seatY - 8 + bobY);

    // happy face override
    ctx.font = '12px "Segoe UI Emoji"';
    ctx.fillText('😋', cx - 8, this.seatY - 36);
  }
}

// ── CustomerManager ────────────────────────────────
class CustomerManager {
  constructor() {
    this.customers  = [];
    this.spawnTimer = FPS * 3;
    this.nextSpawn  = this._nextSpawnDelay();

    // 6 seats — indexed same as TABLE_DEFS
    this.seats = TABLE_DEFS.map((_, i) => ({ occupied: false }));
  }

  _nextSpawnDelay() {
    return CUSTOMER_SPAWN_MIN + Math.floor(Math.random() * (CUSTOMER_SPAWN_MAX - CUSTOMER_SPAWN_MIN));
  }

  update(shopOpen) {
    this.customers.forEach(c => c.update());
    this.customers = this.customers.filter(c => {
      if (c.isGone()) {
        this.seats[c.tableIdx].occupied = false;
        return false;
      }
      return true;
    });

    if (shopOpen) {
      this.spawnTimer++;
      if (this.spawnTimer >= this.nextSpawn) {
        this._trySpawn();
        this.spawnTimer = 0;
        this.nextSpawn  = this._nextSpawnDelay();
      }
    }
  }

  _trySpawn() {
    const free = this.seats.findIndex(s => !s.occupied);
    if (free === -1) return;
    this.seats[free].occupied = true;
    this.customers.push(new Customer(free));
  }

  draw(ctx) {
    this.customers.forEach(c => c.draw(ctx));
  }

  findWaiting(foodId) {
    return this.customers.find(c => c.state === 'waiting' && c.order.id === foodId) || null;
  }

  countAngry() {
    return this.customers.filter(c => c.state === 'angry' || (c.isGone() && c.stars === 0)).length;
  }
}
