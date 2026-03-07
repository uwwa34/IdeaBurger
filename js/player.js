// ═══════════════════════════════════════════════════
//  js/player.js  —  My Restaurant  v5
//  - Full-body sprite (no sheet crop), 80×114px on screen
//  - Progress bar drawn above player head
//  - Bar rules: at-correct-station=empty track, busy=green fill, done=full+blink
// ═══════════════════════════════════════════════════

class Player {
  constructor(spriteImg) {
    this.sprite = spriteImg || null;

    this.x = WIDTH / 2;
    this.y = HEIGHT + 60;
    this.w = 80;   // larger
    this.h = 114;  // maintain 200:284 aspect ≈ 80:114

    this.speed  = PLAYER_SPEED;
    this.dir    = 'down';
    this.moving = false;

    this.bobTimer  = 0;
    this.bobOffset = 0;

    // fixedY = top of player body
    // Counter top at STATION_Y = HUD_H+370, station h=62
    // Player feet just below counter front: HUD_H+370+62+4 = HUD_H+436
    // fixedY = feet_y - h = HUD_H+436 - 114 = HUD_H+322
    // We want player BELOW station visually, so set fixedY so feet = STATION_Y+66
    this.fixedY = HUD_H + 370 + 66 - this.h;  // = HUD_H+322

    // Cooking state
    this.holding    = null;
    this.cookStep   = 0;
    this.cookTimer  = 0;
    this.cookTotal  = 0;
    this.activeMenu = null;
    this.atStation  = null;
    this.busy       = false;
    this._stepReady = false;
  }

  update(dx, dy) {
    this.y = this.fixedY;
    if (dx !== 0) {
      const minX = 4, maxX = WIDTH - this.w - 4;
      this.x = Math.max(minX, Math.min(maxX, this.x + dx * this.speed));
      this.dir    = dx > 0 ? 'right' : 'left';
      this.moving = true;
    } else {
      this.moving = false;
    }

    if (this.moving) {
      this.bobTimer += 0.2;
      this.bobOffset = Math.sin(this.bobTimer) * 3;
    } else {
      this.bobOffset *= 0.75;
      if (Math.abs(this.bobOffset) < 0.1) this.bobOffset = 0;
    }

    if (this.busy && this.cookTimer > 0) this.cookTimer--;
  }

  moveTo(tx, ty) {
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 3) { this.x = tx; this.y = ty; this.moving = false; return true; }
    this.x += (dx/dist) * 3;
    this.y += (dy/dist) * 3;
    this.moving = true;
    this.bobTimer += 0.18;
    this.bobOffset = Math.sin(this.bobTimer) * 3;
    return false;
  }

  startCook(menu) {
    this.activeMenu = menu;
    this.cookStep   = 0;
    this.cookTimer  = menu.cookTime[0] * FPS;
    this.cookTotal  = menu.cookTime[0] * FPS;
    this.busy       = true;
    this.holding    = null;
    this._stepReady = false;
  }

  // Call when player presses A at the NEXT required station after step is ready
  startNextStep() {
    if (!this.activeMenu || !this._stepReady) return false;
    this._stepReady = false;
    this.cookStep++;
    if (this.cookStep >= this.activeMenu.steps.length) {
      // All done — holding food
      this.holding   = this.activeMenu.id;
      this.busy      = false;
      this.atStation = null;
      return true;  // finished
    }
    this.cookTimer = this.activeMenu.cookTime[this.cookStep] * FPS;
    this.cookTotal = this.activeMenu.cookTime[this.cookStep] * FPS;
    this.busy = true;
    return false;
  }

  clearFood() {
    this.holding    = null;
    this.activeMenu = null;
    this.cookStep   = 0;
    this.cookTimer  = 0;
    this.cookTotal  = 0;
    this.busy       = false;
    this.atStation  = null;
    this._stepReady = false;
  }

  overlapsStation(st) {
    const px  = this.x + this.w/2;
    const stCx = st.x + st.w/2;
    const dx  = Math.abs(px - stCx);
    const fy  = this.y + this.h;   // feet y
    return dx < st.w/2 + 20 && fy >= st.y - 10 && fy <= st.y + st.h + 50;
  }

  // ─── Draw ─────────────────────────────────────
  draw(ctx, showFood = true) {
    const bob = this.bobOffset;
    const drawY = this.y + bob;

    // Shadow ellipse under feet
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    ctx.ellipse(this.x + this.w/2, this.y + this.h + 3, this.w/2 - 6, 5, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // ── Draw sprite or fallback ────────────────
    ctx.save();
    // Flip when moving left
    if (this.dir === 'left' && this.moving) {
      ctx.translate(this.x + this.w/2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(this.x + this.w/2), 0);
    }

    if (this.sprite && this.sprite.complete && this.sprite.naturalWidth > 0) {
      ctx.drawImage(this.sprite, this.x, drawY, this.w, this.h);
    } else {
      this._drawFallback(ctx, bob);
    }
    ctx.restore();

    // Held food (above head)
    if (showFood && this.holding) this._drawHolding(ctx, bob);

    // Progress bar above head
    if (this.activeMenu && this.cookStep < this.activeMenu.steps.length) {
      this._drawProgressBar(ctx, bob);
    }
  }

  _drawFallback(ctx, bob) {
    const cx = this.x + this.w/2, y = this.y + bob;
    // Legs
    ctx.fillStyle = '#AD1457';
    ctx.fillRect(cx-11, y+72, 11, 24); ctx.fillRect(cx+1, y+72, 11, 24);
    ctx.fillStyle = '#880E4F';
    ctx.fillRect(cx-14, y+92, 14, 8); ctx.fillRect(cx, y+92, 14, 8);
    // Skirt
    ctx.fillStyle = '#4A148C';
    ctx.beginPath(); ctx.moveTo(cx-20,y+56); ctx.lineTo(cx+20,y+56);
    ctx.lineTo(cx+26,y+74); ctx.lineTo(cx-26,y+74); ctx.closePath(); ctx.fill();
    // Body
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(cx-18, y+20, 36, 38, 7); ctx.fill();
    ctx.fillStyle = COL.PRIMARY;
    ctx.beginPath(); ctx.roundRect(cx-12, y+24, 24, 32, 5); ctx.fill();
    for (let i=0;i<3;i++){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(cx,y+30+i*8,2.5,0,Math.PI*2);ctx.fill();}
    // Head
    ctx.fillStyle = '#FFDDC1';
    ctx.beginPath(); ctx.ellipse(cx, y-2, 20, 22, 0, 0, Math.PI*2); ctx.fill();
    // Hair
    ctx.fillStyle = '#5D4037';
    ctx.beginPath(); ctx.ellipse(cx, y-16, 20, 12, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx-18, y-6, 6, 10, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+18, y-6, 6, 10,  0.3, 0, Math.PI*2); ctx.fill();
    // Chef hat
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx-17, y-34, 34, 16);
    ctx.beginPath(); ctx.ellipse(cx, y-34, 19, 7, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y-18, 19, 7, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, y-44, 14, 13, 0, 0, Math.PI*2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#4E342E';
    ctx.beginPath(); ctx.arc(cx-7, y-4, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+7, y-4, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.arc(cx-5.5, y-5.5, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx+8.5, y-5.5, 1.2, 0, Math.PI*2); ctx.fill();
    // Smile
    ctx.strokeStyle='#E91E63'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx, y+4, 6, 0.2, Math.PI-0.2); ctx.stroke();
    // Cheeks
    ctx.save(); ctx.globalAlpha=0.38; ctx.fillStyle='#FF8A80';
    ctx.beginPath(); ctx.ellipse(cx-12,y+2,6,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+12,y+2,6,4,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  _drawHolding(ctx, bob) {
    const menu = MENU[this.holding]; if (!menu) return;
    const cx = this.x + this.w/2, py = this.y + bob - 16;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx, py+6, 18, 11, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 1.5; ctx.stroke();
    if (menu.img && menu.img.complete && menu.img.naturalWidth > 0) {
      ctx.drawImage(menu.img, cx-15, py-18, 30, 30);
    } else {
      ctx.font = '22px "Segoe UI Emoji"'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(menu.emoji, cx, py-4);
    }
  }

  // ─── Progress bar (above head) ────────────────
  // • at required station + timer running → green fills
  // • at required station + _stepReady    → full green pulsing blink
  // • at required station + idle (waiting first press) → empty track
  // • NOT at required station → no bar
  _drawProgressBar(ctx, bob) {
    if (!this.activeMenu) return;
    const step = this.cookStep;
    if (step >= this.activeMenu.steps.length) return;

    const reqStId = this.activeMenu.steps[step];
    if (this.atStation !== reqStId) return;   // not at right station → hide

    const cx  = this.x + this.w/2;
    const bw  = this.w + 10;
    const bh  = 10;
    const bx  = cx - bw/2;
    const by  = this.y + bob - 22;   // just above head

    // Track bg (shows as "empty" state)
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();

    if (this._stepReady) {
      // Full green blinking
      const pulse = 0.35 + Math.abs(Math.sin(Date.now() / 260)) * 0.65;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.fillStyle = COL.GREEN;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();
      ctx.restore();
      // "▶ next" hint
      const hintPulse = 0.5 + Math.abs(Math.sin(Date.now()/300)) * 0.5;
      ctx.save(); ctx.globalAlpha = hintPulse;
      ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('ไปจุดต่อไป →', cx, by - 2);
      ctx.restore();
    } else if (this.busy && this.cookTotal > 0) {
      // Filling green
      const frac = 1 - this.cookTimer / this.cookTotal;
      if (frac > 0) {
        ctx.fillStyle = COL.GREEN;
        ctx.beginPath(); ctx.roundRect(bx, by, bw * frac, bh, 5); ctx.fill();
      }
    }
    // else: idle at station → just empty track shown above

    // Border
    ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.stroke();
  }
}
