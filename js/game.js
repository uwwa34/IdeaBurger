// ═══════════════════════════════════════════════════
//  js/game.js  —  My Restaurant  v5
// ═══════════════════════════════════════════════════

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.state  = STATE.INTRO;   // ← start with intro
    this.running = true;
    this.lastTime    = 0;
    this.accumulator = 0;
    this.stepMs      = 1000 / FPS;

    this.images = {};
    this._sounds = {};

    this.kitchen    = new Kitchen();
    this.player     = new Player(null);
    this.custMgr    = new CustomerManager();
    this.hud        = new HUD();
    this.joypad     = new VirtualJoypad(canvas);
    this.rankScreen = new RankingScreen(canvas);

    // ── INTRO state ──────────────────────────────
    this.introPhase     = 0;   // 0=walk-in, 1-3=messages, 4=fade-out
    this.introTimer     = 0;
    this.introTextAlpha = 0;
    this.introMessages  = [
      'ยินดีต้อนรับสู่\nMy Restaurant! 🌸',
      'วันนี้เราจะทำอาหาร\nให้อร่อยที่สุด! 🍳',
      'เพื่อลูกค้าทุกคน\nเลย! ♥',
    ];

    // ── END / SCORE ──────────────────────────────
    this.endPhase     = 0;
    this.endTimer     = 0;
    this.scoreTimer   = 0;
    this.scoreReady   = false;

    // ── Gameplay ─────────────────────────────────
    this.menuSelecting   = false;
    this.menuSelectIdx   = 0;
    this.itemShopOpen    = false;
    this._menuCardBounds = null;
    this._itemCardBounds = null;
    this._tabBounds      = null;
    this.notifications   = [];
    this.angerCount      = 0;
    this.servedCount     = 0;
    this.menuSales       = {};
    this.serveQueue      = [];   // up to 2 completed dishes waiting at SERVE
    this._ambientParts   = [];   // ambient floating particles for active items

    this._bindKeys();
    this._bindTap(canvas);
  }

  // ─── Asset injection ───────────────────────────
  setImages(images) {
    this.images = images;
    this.player.sprite = images.player || null;

    // Menu images
    const imgMap = {
      burger: images.menuBurger, chicken: images.menuChicken,
      fries:  images.menuFries,  donut:   images.menuDonut,
    };
    for (const [id, img] of Object.entries(imgMap)) {
      if (MENU[id] && img) MENU[id].img = img;
    }

    // Station images
    const stMap = {
      prep: images.stationPrep, cook: images.stationCook,
      plate: images.stationPlate, serve: images.stationServe,
    };
    for (const [id, img] of Object.entries(stMap)) {
      if (STATIONS[id.toUpperCase()] && img) STATIONS[id.toUpperCase()].img = img;
    }

    // Background inside
    this.kitchen.bgInside = images.bgInside || null;

    // Customer type sprites
    CUSTOMER_TYPES.forEach(ct => {
      if (ct.imgKey && images[ct.imgKey]) ct.img = images[ct.imgKey];
    });

    // Item images
    Object.values(ITEMS).forEach(item => {
      if (item.imgKey && images[item.imgKey]) item.img = images[item.imgKey];
    });
  }

  setSounds(sounds) {
    this._sounds = sounds;
    // Start BGM immediately (browsers need user gesture first; will retry on first tap)
    this._startBGM();
  }

  _startBGM() {
    const bgm = this._sounds['bgm'];
    if (!bgm) return;
    bgm.loop   = true;
    bgm.volume = 0.35;
    window._bgmEl = bgm;  // expose for global audio unlock

    const doPlay = () => {
      if (bgm.paused) bgm.play().catch(() => {});
    };

    // Try immediately (works on iOS after first interaction during loading)
    const p = bgm.play();
    if (p instanceof Promise) {
      p.catch(() => {
        // Autoplay blocked — wait for ANY user interaction then play
        const evs = ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'];
        const unlock = () => {
          doPlay();
          evs.forEach(ev => document.removeEventListener(ev, unlock));
        };
        evs.forEach(ev => document.addEventListener(ev, unlock, { once: false, passive: true }));
      });
    }
  }

  _stopBGM() {
    try {
      const bgm = this._sounds['bgm'];
      if (bgm) { bgm.pause(); bgm.currentTime = 0; }
    } catch(e) {}
  }

  _playSound(key) {
    try {
      const snd = this._sounds[key];
      if (!snd) return;
      // Synth SFX objects expose cloneNode() that returns a play-once wrapper
      // HTMLAudioElement: clone to allow overlapping playback
      if (typeof snd.cloneNode === 'function') {
        snd.cloneNode().play();
      } else if (typeof snd.play === 'function') {
        snd.play().catch(() => {});
      }
    } catch(e) {}
  }

  // ─── Start ────────────────────────────────────
  start() {
    // Player starts off-screen for walk-in intro
    this.player.x = -this.player.w - 20;
    this.player.y = this.player.fixedY;
    this.hud.shopTimer = SHOP_OPEN_DURATION;
    requestAnimationFrame(t => this._loop(t));
  }

  // ─── Loop ─────────────────────────────────────
  _loop(ts) {
    if (!this.running) return;
    const dt = Math.min(ts - this.lastTime, 50);
    this.lastTime = ts;
    this.accumulator += dt;
    while (this.accumulator >= this.stepMs) { this._update(); this.accumulator -= this.stepMs; }
    this._draw();
    requestAnimationFrame(t => this._loop(t));
  }

  // ─── Update dispatcher ────────────────────────
  _update() {
    switch (this.state) {
      case STATE.INTRO:    this._updateIntro();   break;
      case STATE.PLAYING:  this._updatePlaying(); break;
      case STATE.END_GAME: this._updateEnd();     break;
      case STATE.SCORE:    this._updateScore();   break;
    }
    this.notifications = this.notifications.filter(n => {
      n.timer--; n.y -= 0.4; return n.timer > 0;
    });
  }

  // ─── INTRO update ─────────────────────────────
  // Phase 0 : player zooms in from tiny→full at screen center (≈80 frames)
  // Phase 1-3: speech bubbles with text (each ≈145 frames, tap/A to skip)
  // Phase 4 : white flash fade → enter playing
  _updateIntro() {
    this.introTimer++;

    if (this.introPhase === 0) {
      // Zoom completes at frame 80
      if (this.introTimer >= 80) {
        this.player.moving = false;
        this.introPhase = 1; this.introTimer = 0;
      }
    } else if (this.introPhase >= 1 && this.introPhase <= 3) {
      this.introTextAlpha = this.introTimer < 20 ? this.introTimer/20
        : this.introTimer > 120 ? Math.max(0, 1-(this.introTimer-120)/20) : 1;
      if (this.introTimer > 145) { this.introPhase++; this.introTimer = 0; }
    } else if (this.introPhase === 4) {
      if (this.introTimer > 45) this._enterPlaying();
    }
  }

  _enterPlaying() {
    const prep = STATIONS.PREP;
    this.player.x = prep.x + prep.w/2 - this.player.w/2;
    this.player.y = this.player.fixedY;
    this.player.moving = false;
    this.player.atStation = 'prep';
    this.state = STATE.PLAYING;
  }

  // ─── PLAYING update ───────────────────────────
  _updatePlaying() {
    this.hud.update();
    this.hud.updateItems();
    // Sync global flags for item effects
    window._lollipopActive = this.hud.hasItem('lollipop');

    if (!this.menuSelecting) {
      // Joypad L/R: one-shot snap per press, same as keyboard
      if (this.joypad.consumeLeft())  this._keyboardMove(-1);
      if (this.joypad.consumeRight()) this._keyboardMove(1);
      this.player.update(0, 0);  // keep player at fixedY
    }

    // Station proximity
    this.player.atStation = null;
    for (const st of Object.values(STATIONS)) {
      if (this.player.overlapsStation(st)) { this.player.atStation = st.id; break; }
    }

    // Cook timer → step ready (or auto-complete last step)
    // Milk: cook twice as fast — decrement timer extra once per frame
    if (this.hud.hasItem('milk') && this.player.busy && this.player.cookTimer > 0) {
      this.player.cookTimer--;
    }

    if (this.player.busy && this.player.cookTimer <= 0 && !this.player._stepReady) {
      const nextStepIdx = this.player.cookStep + 1;
      const isLastStep  = nextStepIdx >= (this.player.activeMenu?.steps.length || 0);

      if (isLastStep) {
        // Last step done: auto-complete immediately (no A needed)
        this.player._stepReady = true;    // must be true before startNextStep()
        this.player.busy = false;
        this.player.cookTimer = 0;
        this.player.startNextStep();      // sets holding = menu.id, busy=false
        const menuName = MENU[this.player.holding]?.name || '';
        this._addNotification('🍽️ ' + menuName + ' พร้อมแล้ว! ไปเสิร์ฟ 🛎️', COL.GREEN);
        this._playSound('serve');
      } else {
        // Middle step done: mark ready, player walks to next station
        this.player._stepReady = true;
        const nextId = this.player.activeMenu?.steps[nextStepIdx];
        const nextSt = Object.values(STATIONS).find(s => s.id === nextId);
        this._addNotification('✅ เสร็จ! ไปที่ ' + (nextSt?.label || nextId), COL.GREEN);
      }
    }

    // Menu joypad navigation
    if (this.menuSelecting) {
      const foodCount = this.player.activeMenu ? 0 : Object.keys(MENU).length;
      const totalCards = foodCount + Object.keys(ITEMS).length;
      if (this.joypad.consumeLeft())  this.menuSelectIdx = Math.max(0, this.menuSelectIdx - 1);
      if (this.joypad.consumeRight()) this.menuSelectIdx = Math.min(totalCards - 1, this.menuSelectIdx + 1);
    }

    // ACT / BOMB
    if (this.joypad.consumeAct())  this._handleAct();
    if (this.joypad.consumeBomb()) this._handleCancel();

    // Ambient item particles
    if (this.hud.hasItem('lollipop') && Math.random() < 0.4) {
      this._ambientParts.push({
        x: Math.random() * WIDTH, y: HEIGHT - PAD_H,
        vx: (Math.random()-0.5)*1.2, vy: -1.5 - Math.random()*1.5,
        life: 80, maxLife: 80, col: '#FF80AB', r: 4 + Math.random()*4, spin: Math.random()*6,
        emoji: Math.random() < 0.3 ? '🍭' : null,
      });
    }
    if (this.hud.hasItem('milk') && Math.random() < 0.35) {
      this._ambientParts.push({
        x: this.player.x + this.player.w/2 + (Math.random()-0.5)*30,
        y: this.player.y,
        vx: (Math.random()-0.5)*2, vy: -2 - Math.random()*2,
        life: 50, maxLife: 50, col: '#B3E5FC', r: 3 + Math.random()*3, spin: 0,
        emoji: Math.random() < 0.25 ? '⚡' : null,
      });
    }
    this._ambientParts = this._ambientParts.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy -= 0.02; p.life--; return p.life > 0;
    });

    // Customers
    this.custMgr.update(true);

    // Auto-serve: match queued dishes to newly-waiting customers
    for (let qi = this.serveQueue.length - 1; qi >= 0; qi--) {
      const queued = this.serveQueue[qi];
      const cust = this.custMgr.findWaiting(queued.menuId);
      if (cust) {
        const money = cust.serve();
        this.hud.addMoney(money);
        this.servedCount++;
        const sid = queued.menuId;
        if (!this.menuSales[sid]) this.menuSales[sid] = { count: 0, revenue: 0 };
        this.menuSales[sid].count++;
        this.menuSales[sid].revenue += money;
        this._addNotification(`🔔 ${queued.emoji} เสิร์ฟอัตโนมัติ +฿${money}!`, COL.GOLD);
        this._playSound('coin');
        this.serveQueue.splice(qi, 1);
      }
    }

    // Detect newly-gone-angry customers (edge: state just became 'angry' or gone with stars=0)
    const nowAngry = this.custMgr.countNewAngry();
    if (nowAngry > 0) {
      this.angerCount += nowAngry;
      this._addNotification('😤 ลูกค้าโกรธ!', COL.RED);
      this._playSound('anger');
    }

    if (this.hud.isShopClosed()) {
      this.player.clearFood();
      this.state = STATE.END_GAME; this.endPhase = 0; this.endTimer = 0;
    }
  }

  _handleCancel() {
    if (this.menuSelecting) {
      this.menuSelecting = false;
      this.itemShopOpen  = false;
      this._addNotification('ยกเลิก', '#aaa');
      return;
    }
    // Cancel mid-cook OR drop food already holding
    if (this.player.activeMenu || this.player.holding) {
      this.player.clearFood();
      this._addNotification('❌ ยกเลิกการทำอาหาร', COL.RED);
    }
  }

  // ─── ACT (A button) ───────────────────────────
  _handleAct() {
    // ── While menu is open: confirm selection ────
    if (this.menuSelecting) {
      const foodList = Object.values(MENU).slice(0, 4);
      const itemList = Object.values(ITEMS);
      // If cooking or holding: only items are selectable
      if (this.player.activeMenu || this.player.holding) {
        const item = itemList[this.menuSelectIdx];
        if (item) this._buyItem(item.id);
      } else {
        // Idle: food first, then items
        if (this.menuSelectIdx < foodList.length) {
          this._startCooking(foodList[this.menuSelectIdx].id);
        } else {
          const item = itemList[this.menuSelectIdx - foodList.length];
          if (item) this._buyItem(item.id);
        }
      }
      return;
    }

    const st = this.player.atStation;

    // ── Holding food but at PREP → allow item shop ─
    if (this.player.holding && st === 'prep') {
      this.menuSelecting = true;
      this.menuSelectIdx = Object.keys(MENU).length; // start cursor on item section
      return;
    }

    // ── Holding food → try serve ─────────────────
    if (this.player.holding) {
      if (st === 'serve') {
        const cust = this.custMgr.findWaiting(this.player.holding);
        if (cust) {
          const money = cust.serve();
          this.hud.addMoney(money);
          this.servedCount++;
          // Track per-menu sales
          const sid = this.player.holding;
          if (!this.menuSales[sid]) this.menuSales[sid] = { count: 0, revenue: 0 };
          this.menuSales[sid].count++;
          this.menuSales[sid].revenue += money;
          this._addNotification(`🎉 +฿${money}!`, COL.GOLD);
          this._playSound('coin');
          this.player.clearFood();
        } else if (this.serveQueue.length < 2) {
          // No waiting customer — put food in serve queue (max 2)
          const m = MENU[this.player.holding];
          this.serveQueue.push({ menuId: m.id, emoji: m.emoji, img: m.img });
          this._addNotification(`📥 วาง ${m.emoji} ไว้รอ (${this.serveQueue.length}/2)`, COL.MINT);
          this._playSound('serve');
          this.player.clearFood();
        } else {
          this._addNotification('คิวเต็มแล้ว! (2/2)', COL.RED);
          this._playSound('error');
        }
      } else {
        this._addNotification('ไปที่ 🛎️ เสิร์ฟ!', COL.PRIMARY);
        this._playSound('error');
      }
      return;
    }

    // ── Has active recipe: allow buying items at PREP ──
    if (this.player.activeMenu && st === 'prep') {
      this.menuSelecting = true;
      this.menuSelectIdx = 0;
      return;
    }

    // ── Has active recipe (middle steps) ──────────
    if (this.player.activeMenu) {
      const reqId = this.player.activeMenu.steps[this.player.cookStep];

      // Timer still running → wait
      if (this.player.busy && this.player.cookTimer > 0) {
        const sec = Math.ceil(this.player.cookTimer / FPS);
        this._addNotification('⏳ รออีก ' + sec + 's...', '#aaa');
        return;
      }

      // Step done (_stepReady = true) → player must walk to next station and press A
      if (this.player._stepReady) {
        const nextIdx = this.player.cookStep + 1;
        const nextId  = this.player.activeMenu.steps[nextIdx];
        if (st === nextId) {
          this.player.startNextStep();  // advances step, starts next timer
          const nextStLabel = Object.values(STATIONS).find(s => s.id === nextId)?.label || nextId;
          this._addNotification('▶ เริ่ม ' + nextStLabel, COL.PRIMARY);
        } else {
          this._playSound('error');
          const nextSt = Object.values(STATIONS).find(s => s.id === nextId);
          this._addNotification('ไปที่ ' + (nextSt?.label || nextId) + ' ก่อน!', COL.RED);
        }
        return;
      }

      // Idle (shouldn't happen normally — timer=0 but startNextStep not called yet)
      if (st !== reqId) {
        this._playSound('error');
        this._addNotification('ยืนผิดจุด! 🔔', COL.RED);
      }
      return;
    }

    // ── Idle: open overlay at PREP ───────────────
    if (st === 'prep') {
      this.menuSelecting = true;
      this.menuSelectIdx = 0;
    } else if (st) {
      this._addNotification('ไปที่ 🔪 เตรียมของ เพื่อเลือกเมนู/ไอเทม', COL.PRIMARY);
      this._playSound('error');
    } else {
      this._addNotification('เดินไปที่สถานีก่อน!', '#aaa');
    }
  }

  // ─── Start cooking ────────────────────────────
  // ─── Buy item ────────────────────────────────
  _buyItem(itemId) {
    const item = ITEMS[itemId];
    if (!item) return;
    if (this.hud.money < item.price) {
      this._addNotification('เงินไม่พอ! 💸', COL.RED);
      this._playSound('error');
      return;
    }
    this.hud.money -= item.price;
    this.hud.activateItem(itemId);
    this.menuSelecting = false;
    this.itemShopOpen  = false;
    // Big flash notification
    this._addNotification(`✨ ${item.emoji} ${item.name.toUpperCase()} ACTIVATED! ✨`, COL.GOLD, true);
    this._addNotification(item.description, item.id === 'lollipop' ? '#FF80AB' : '#81D4FA');
    this._playSound('cheer');
  }

  _startCooking(menuId) {
    const menu = MENU[menuId];
    if (!menu) return;
    this.menuSelecting = false;
    this.player.startCook(menu);
    // Timer starts immediately (player is at PREP already)
    this._addNotification(`🍳 เริ่มทำ ${menu.name}!`, COL.PRIMARY);
  }

  // ─── END GAME ─────────────────────────────────
  _updateEnd() {
    this.endTimer++;
    if (this.endPhase === 0 && this.endTimer > 200) {
      this.endPhase = 1; this.endTimer = 0;
    } else if (this.endPhase === 1 && this.endTimer > 60) {
      this.state = STATE.SCORE; this.scoreTimer = 0;
    }
  }

  _updateScore() {
    this.scoreTimer++;
    if (this.scoreTimer > 90) this.scoreReady = true;
  }

  // ─── DRAW dispatcher ──────────────────────────
  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    switch (this.state) {
      case STATE.INTRO:    this._drawIntro(ctx);   break;
      case STATE.PLAYING:  this._drawPlaying(ctx); break;
      case STATE.END_GAME: this._drawEndGame(ctx); break;
      case STATE.SCORE:    this._drawScore(ctx);   break;
    }
    if (this.rankScreen.visible) this.rankScreen.draw();
  }

  // ─── Draw INTRO ───────────────────────────────
  // Phase 0 : player zooms in from tiny→full center (walk toward camera)
  // Phase 1-3: speech bubbles + player at full size
  // Phase 4 : pink flash → gameplay
  _drawIntro(ctx) {
    // ── bg_outside background ──────────────────
    const bg = this.images.bgOutside;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
    } else {
      this.kitchen.drawOutside(ctx);
    }

    const cx     = WIDTH  / 2;
    const feetY  = HEIGHT * 0.74;   // where feet land when fully zoomed

    if (this.introPhase === 0) {
      // Zoom: ease-out from 0.10 → 1.0 over 80 frames
      const t    = Math.min(this.introTimer / 80, 1);
      const ease = 1 - Math.pow(1 - t, 2.8);
      const scale = 0.10 + ease * 0.90;

      const dw = this.player.w * scale;
      const dh = this.player.h * scale;
      const dx = cx - dw / 2;
      const dy = feetY - dh;

      // Walking sway: horizontal + vertical bob
      const walkT = Math.min(t * 4, 1);
      const sway  = Math.sin(this.introTimer * 0.30) * 7  * walkT;
      const bobV  = Math.abs(Math.sin(this.introTimer * 0.30)) * 5 * walkT;

      // Shadow
      ctx.fillStyle = `rgba(0,0,0,${0.12 * scale})`;
      ctx.beginPath();
      ctx.ellipse(cx + sway * 0.3, feetY + 5, dw * 0.44, 6 * scale, 0, 0, Math.PI*2);
      ctx.fill();

      // Player
      ctx.save();
      if (this.player.sprite && this.player.sprite.complete && this.player.sprite.naturalWidth > 0) {
        ctx.drawImage(this.player.sprite, dx + sway, dy - bobV, dw, dh);
      } else {
        ctx.translate(cx + sway, feetY - bobV);
        ctx.scale(scale, scale);
        ctx.translate(-this.player.w/2, -this.player.h);
        this.player._drawFallback(ctx, 0);
      }
      ctx.restore();
    }

    if (this.introPhase >= 1 && this.introPhase <= 3) {
      const dw = this.player.w;
      const dh = this.player.h;
      const dx = cx - dw / 2;
      const dy = feetY - dh;

      // Gentle idle sway in phase 1-3
      const sway = Math.sin(this.introTimer * 0.05) * 3;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath();
      ctx.ellipse(cx, feetY + 5, dw * 0.43, 6, 0, 0, Math.PI*2);
      ctx.fill();

      // Player
      ctx.save();
      if (this.player.sprite && this.player.sprite.complete && this.player.sprite.naturalWidth > 0) {
        ctx.drawImage(this.player.sprite, dx + sway, dy, dw, dh);
      } else {
        ctx.save();
        ctx.translate(sway, 0);
        this.player._drawFallback(ctx, 0);
        ctx.restore();
      }
      ctx.restore();

      // Speech bubble above player
      ctx.save(); ctx.globalAlpha = this.introTextAlpha;
      const bw = WIDTH - 52, bh = 90;
      const bx = 26, bubbleY = dy - bh - 18;

      ctx.fillStyle = 'rgba(255,240,248,0.97)';
      ctx.beginPath(); ctx.roundRect(bx, bubbleY, bw, bh, 16); ctx.fill();
      ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 2; ctx.stroke();

      // Tail pointing down
      const tailX = cx;
      ctx.fillStyle = 'rgba(255,240,248,0.97)';
      ctx.beginPath();
      ctx.moveTo(tailX - 12, bubbleY + bh - 1);
      ctx.lineTo(tailX + 12, bubbleY + bh - 1);
      ctx.lineTo(tailX, bubbleY + bh + 15);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tailX - 12, bubbleY + bh - 1);
      ctx.lineTo(tailX, bubbleY + bh + 15);
      ctx.lineTo(tailX + 12, bubbleY + bh - 1);
      ctx.stroke();

      ctx.fillStyle = COL.TEXT_MAIN; ctx.font = 'bold 18px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = this.introMessages[this.introPhase-1].split('\n');
      const lineStartY = bubbleY + (bh - lines.length * 28) / 2 + 14;
      lines.forEach((line, i) => ctx.fillText(line, WIDTH/2, lineStartY + i * 28));

      ctx.fillStyle = COL.PRIMARY; ctx.font = '11px Arial';
      ctx.fillText('แตะหรือกด A เพื่อข้าม ▶', WIDTH/2, bubbleY + bh - 10);
      ctx.restore();
    }

    // Phase 4: pink fade-to-white → cut to gameplay
    if (this.introPhase === 4) {
      const fa = Math.min(1, this.introTimer / 30);
      ctx.fillStyle = `rgba(255,228,236,${fa})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
  }

  // ─── Draw PLAYING ─────────────────────────────
  _drawPlaying(ctx) {
    this.kitchen.drawInside(ctx);

    // ── Lollipop screen tint: soft pink freeze overlay ──────────
    if (this.hud.hasItem('lollipop')) {
      const pulse = 0.04 + Math.abs(Math.sin(Date.now()/800)) * 0.04;
      ctx.save(); ctx.globalAlpha = pulse;
      ctx.fillStyle = '#FF80AB';
      ctx.fillRect(0, HUD_H, WIDTH, GAME_H);
      ctx.restore();
      // Snowflake-style ❄ icons drifting down (frozen time)
      // drawn via ambient particles below
    }

    // ── Milk speed-lines overlay ─────────────────────────────────
    if (this.hud.hasItem('milk')) {
      const t = Date.now();
      ctx.save(); ctx.globalAlpha = 0.12 + Math.abs(Math.sin(t/200)) * 0.08;
      ctx.strokeStyle = '#81D4FA'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const lx = ((t/4 + i*65) % (WIDTH + 60)) - 30;
        ctx.beginPath(); ctx.moveTo(lx, HUD_H); ctx.lineTo(lx - 40, HEIGHT - PAD_H); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Ambient item particles (drawn over kitchen, under UI) ────
    this._ambientParts.forEach(p => {
      const a = p.life / p.maxLife;
      ctx.save(); ctx.globalAlpha = a * 0.85;
      if (p.emoji) {
        ctx.font = '14px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, p.x, p.y);
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    });

    this.custMgr.draw(ctx);

    if (this.player.atStation) this.kitchen.highlightStation(ctx, this.player.atStation);
    // Blink next required station when step is ready
    if (this.player._stepReady && this.player.activeMenu) {
      const nextIdx = this.player.cookStep + 1;
      const nextId  = this.player.activeMenu.steps[nextIdx];
      if (nextId) this.kitchen.blinkStation(ctx, nextId);
    }

    this.player.draw(ctx, true);

    // Recipe step guide in joypad area
    if (this.player.activeMenu && !this.menuSelecting) this._drawRecipeGuide(ctx);

    // Menu overlay (covers kitchen zone only)
    this._drawServeQueue(ctx);

    if (this.menuSelecting) this._drawMenuSelect(ctx);

    this.hud.drawHUD(ctx);
    this.joypad.draw(ctx);
    this._drawNotifications(ctx);
  }

  // ─── Draw END ─────────────────────────────────
  _drawEndGame(ctx) {
    this.kitchen.drawInside(ctx);
    this.player.draw(ctx, false);
    this.hud.drawHUD(ctx);
    const a = Math.min(1, this.endTimer/40);
    ctx.save(); ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = COL.PRIMARY_L;
    ctx.beginPath(); ctx.roundRect(24, HEIGHT/2-90, WIDTH-48, 120, 16); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = a;
    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 22px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ร้านปิดแล้วนะ 🔒', WIDTH/2, HEIGHT/2-48);
    ctx.fillStyle = COL.TEXT_MAIN; ctx.font = '16px "Segoe UI Emoji"';
    ctx.fillText('ขอบคุณที่มาอุดหนุน 🙏', WIDTH/2, HEIGHT/2-16);
    ctx.fillText('แล้วมาใหม่นะคะ 🌸', WIDTH/2, HEIGHT/2+14);
    ctx.restore();
  }

  // ─── Draw SCORE ───────────────────────────────
  _drawScore(ctx) {
    // Pink blush bg
    ctx.fillStyle = COL.PRIMARY_L; ctx.fillRect(0,0,WIDTH,HEIGHT);
    // Petal decorations
    const petals = [[40,60],[90,30],[180,100],[290,45],[345,80],[60,210],[310,190],[150,30]];
    petals.forEach(([sx,sy]) => {
      ctx.font = '22px "Segoe UI Emoji"'; ctx.textAlign='center';
      ctx.fillText('🌸', sx, sy);
    });

    // Title
    const ta = Math.min(1, this.scoreTimer/30);
    ctx.save(); ctx.globalAlpha = ta;
    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 26px "Segoe UI Emoji"';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🍽️ สรุปผลประกอบการ', WIDTH/2, 78);
    ctx.restore();

    // Score card
    const cardY = 108;
    const cardH = 4 * 44 + 24 + 20;
    if (this.scoreTimer > 20) {
      const ca = Math.min(1, (this.scoreTimer-20)/40);
      ctx.save(); ctx.globalAlpha = ca;

      // ── Card ──────────────────────────────────────

      ctx.fillStyle = 'rgba(255,240,248,0.97)';
      ctx.beginPath(); ctx.roundRect(22, cardY, WIDTH-44, cardH, 18); ctx.fill();
      ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 2; ctx.stroke();

      // ── Summary rows ──────────────────────────────
      const summaryItems = [
        { label:'💰 รายได้รวม',    val:'฿' + this.hud.money.toLocaleString() },
        { label:'🍳 เสิร์ฟสำเร็จ', val: this.servedCount + ' จาน' },
        { label:'😤 ลูกค้าโกรธ',   val: this.angerCount  + ' คน' },

      ];
      summaryItems.forEach((row, i) => {
        const delay = 40 + i*18;
        const ra = this.scoreTimer > delay ? Math.min(1,(this.scoreTimer-delay)/18) : 0;
        if (!ra) return;
        ctx.save(); ctx.globalAlpha = ra * ca;
        const ry = cardY + 20 + i * 44;
        if (i > 0) {
          ctx.strokeStyle = 'rgba(244,143,177,0.25)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(36, ry-4); ctx.lineTo(WIDTH-36, ry-4); ctx.stroke();
        }
        ctx.fillStyle = COL.TEXT_MAIN; ctx.font = '13px "Segoe UI Emoji"';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(row.label, 38, ry + 14);
        ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 18px "Segoe UI Emoji"';
        ctx.textAlign = 'right'; ctx.fillText(row.val, WIDTH-36, ry + 16);
        ctx.restore();
      });

      // ── Menu icon strip (images from /assets/, no text labels) ──
      const iconDelay = 40 + summaryItems.length * 18 + 10;
      const iconAlpha = this.scoreTimer > iconDelay ? Math.min(1,(this.scoreTimer-iconDelay)/20) : 0;
      if (iconAlpha > 0) {
        const secY = cardY + 4 * 44 + 24;
        ctx.save(); ctx.globalAlpha = iconAlpha * ca;
        ctx.strokeStyle = 'rgba(244,143,177,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(36, secY); ctx.lineTo(WIDTH-36, secY); ctx.stroke();

        const soldItems = Object.entries(this.menuSales).filter(([,s])=>s.count>0);
        const iconSize = 44, gap = 12;
        const totalW = soldItems.length * iconSize + (soldItems.length-1) * gap;
        const startX = (WIDTH - totalW) / 2;
        const iconY  = secY + 6;

        soldItems.forEach(([id, s], i) => {
          const m = MENU[id];
          const ix = startX + i * (iconSize + gap);
          // bg pill
          ctx.fillStyle = 'rgba(244,143,177,0.18)';
          ctx.beginPath(); ctx.roundRect(ix, iconY, iconSize, iconSize, 8); ctx.fill();
          // image or emoji fallback
          if (m?.img && m.img.complete && m.img.naturalWidth > 0) {
            ctx.drawImage(m.img, ix+4, iconY+4, iconSize-8, iconSize-14);
          } else {
            ctx.font = '26px "Segoe UI Emoji"';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(m?.emoji||'🍽️', ix + iconSize/2, iconY + iconSize/2 - 4);
          }
          // count badge
          ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText('×' + s.count, ix + iconSize/2, iconY + iconSize - 1);
        });
        ctx.restore();
      }

      ctx.restore();
    }

    const btnY = Math.min(540, cardY + cardH + 30);

    if (this.scoreReady) {
      const ba = Math.min(1,(this.scoreTimer-90)/20);
      const pulse = 0.65 + Math.sin(Date.now()/400)*0.35;
      ctx.save(); ctx.globalAlpha = ba*pulse;
      ctx.fillStyle = COL.PRIMARY; ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(WIDTH/2-130, btnY, 260, 50, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='bold 17px "Segoe UI Emoji"';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('📝 บันทึกยอดขาย', WIDTH/2, btnY+25);
      ctx.restore();
    }
  }

  // ─── Menu Select overlay ─────────────────────
  // Layout (idle):    food 2×2 rows top, items 2×1 row bottom, divider line
  // Layout (cooking): items 2×1 centered only
  // Joypad ◀▶: no wrap. A = confirm. B = cancel.
  _drawMenuSelect(ctx) {
    ctx.fillStyle = 'rgba(252,228,236,0.96)';
    ctx.fillRect(0, HUD_H, WIDTH, GAME_H);

    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 14px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const _overlayTitle = (this.player.activeMenu || this.player.holding) ? '🛍️ ซื้อไอเทม' : '🍽️ เมนู + 🛍️ ไอเทม';
    ctx.fillText(_overlayTitle, WIDTH/2, HUD_H + 8);
    ctx.fillStyle = COL.PRIMARY; ctx.font = '10px Arial';
    ctx.fillText('◀▶ เลือก   A ยืนยัน   B ยกเลิก', WIDTH/2, HUD_H + 26);

    const contentY = HUD_H + 46;

    const menuItems = Object.values(MENU).slice(0, 4);
    const itemList  = Object.values(ITEMS);
    const showFood  = !this.player.activeMenu && !this.player.holding;

    // Card sizes
    const fCols = 2, fW = 142, fH = 115, fGap = 10;
    const fStartX = (WIDTH - (fCols * fW + (fCols-1) * fGap)) / 2;

    const iCols = 2, iW = 142, iH = 90, iGap = 10;
    const iStartX = (WIDTH - (iCols * iW + (iCols-1) * iGap)) / 2;

    const iSectionY = contentY + (showFood ? (fH * 2 + fGap + 14) : 0);

    this._menuCardBounds = [];
    this._itemCardBounds = [];

    // ── Food section (idle only) ─────────────────
    if (showFood) {
      menuItems.forEach((menu, i) => {
        const col = i % fCols, row = Math.floor(i / fCols);
        const x = fStartX + col * (fW + fGap);
        const y = contentY + row * (fH + fGap);
        const sel = (i === this.menuSelectIdx);

        ctx.fillStyle = sel ? 'rgba(244,143,177,0.38)' : 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.roundRect(x, y, fW, fH, 12); ctx.fill();
        ctx.strokeStyle = sel ? COL.PRIMARY_D : COL.PRIMARY;
        ctx.lineWidth = sel ? 3 : 1.5; ctx.stroke();
        if (sel) {
          ctx.save(); ctx.globalAlpha = 0.3 + Math.abs(Math.sin(Date.now()/300))*0.4;
          ctx.shadowColor = COL.PRIMARY_D; ctx.shadowBlur = 14;
          ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.roundRect(x, y, fW, fH, 12); ctx.stroke(); ctx.restore();
        }
        if (menu.img && menu.img.complete && menu.img.naturalWidth > 0) {
          ctx.drawImage(menu.img, x+12, y+6, fW-24, fH-32);
        } else {
          ctx.font='46px "Segoe UI Emoji"'; ctx.textAlign='center'; ctx.textBaseline='middle';
          ctx.fillText(menu.emoji, x+fW/2, y+fH/2 - 10);
        }
        ctx.fillStyle = sel ? COL.PRIMARY_D : COL.TEXT_MAIN;
        ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('฿'+menu.price, x+fW/2, y+fH-3);
        this._menuCardBounds.push({ id: menu.id, x, y, w: fW, h: fH });
      });

      // Divider + label
      const divY = iSectionY - 8;
      ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(20, divY); ctx.lineTo(WIDTH-20, divY); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('── ไอเทม ──', WIDTH/2, divY);
    }

    // ── Item section ─────────────────────────────
    itemList.forEach((item, i) => {
      const col = i % iCols;
      const x = iStartX + col * (iW + iGap);
      const y = iSectionY + (this.player.activeMenu ? Math.floor(i/iCols)*(iH+iGap) : 0);
      const globalIdx = (showFood ? menuItems.length : 0) + i;
      const sel = (globalIdx === this.menuSelectIdx);
      const canAfford = this.hud.money >= item.price;

      ctx.fillStyle = sel ? 'rgba(244,143,177,0.38)' : (canAfford ? 'rgba(255,255,255,0.95)' : 'rgba(220,220,220,0.7)');
      ctx.beginPath(); ctx.roundRect(x, y, iW, iH, 10); ctx.fill();
      ctx.strokeStyle = sel ? COL.PRIMARY_D : (canAfford ? COL.PRIMARY : '#ccc');
      ctx.lineWidth = sel ? 3 : 1.5; ctx.stroke();
      if (sel) {
        ctx.save(); ctx.globalAlpha = 0.3 + Math.abs(Math.sin(Date.now()/300))*0.4;
        ctx.shadowColor = COL.PRIMARY_D; ctx.shadowBlur = 14;
        ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(x, y, iW, iH, 10); ctx.stroke(); ctx.restore();
      }
      // icon (left half)
      const iconSz = iH - 14;
      if (item.img && item.img.complete && item.img.naturalWidth > 0) {
        ctx.drawImage(item.img, x+6, y+7, iconSz, iconSz);
      } else {
        ctx.font = Math.floor(iconSz*0.72)+'px "Segoe UI Emoji"';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(item.emoji, x+6+iconSz/2, y+iH/2);
      }
      // text (right half)
      const tx = x + iconSz + 12;
      ctx.fillStyle = COL.TEXT_MAIN; ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(item.name, tx, y+8);
      ctx.fillStyle = '#888'; ctx.font = '9px Arial';
      // word-wrap description
      const words = item.description.split(' '); let line = '', ly = y+22;
      for (const w of words) {
        if ((line+w).length > 12) { ctx.fillText(line.trim(), tx, ly); line = w+' '; ly += 11; }
        else line += w+' ';
      }
      ctx.fillText(line.trim(), tx, ly);
      ctx.fillStyle = canAfford ? COL.PRIMARY_D : '#bbb';
      ctx.font = 'bold 12px Arial'; ctx.textBaseline = 'bottom';
      ctx.fillText('฿'+item.price, tx, y+iH-3);
      if (this.hud.hasItem(item.id)) {
        ctx.fillStyle = COL.GREEN; ctx.font = 'bold 9px Arial';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('✓ ใช้อยู่', x+iW-6, y+iH-3);
      }
      this._itemCardBounds.push({ id: item.id, x, y, w: iW, h: iH });
    });
  }


  // ─── Serve queue display (at SERVE station) ───
  _drawServeQueue(ctx) {
    if (this.serveQueue.length === 0) return;
    const st = Object.values(STATIONS).find(s => s.id === 'serve');
    const cx = st.x + st.w / 2;
    const qy = st.y - 10;
    this.serveQueue.forEach((q, i) => {
      const ix = cx - 20 + i * 36;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.roundRect(ix - 14, qy - 28, 28, 28, 6); ctx.fill();
      ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 1.5; ctx.stroke();
      if (q.img && q.img.complete && q.img.naturalWidth > 0) {
        ctx.drawImage(q.img, ix - 12, qy - 26, 24, 24);
      } else {
        ctx.font = '18px "Segoe UI Emoji"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(q.emoji, ix, qy - 14);
      }
    });
    // slot indicator
    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`${this.serveQueue.length}/2`, cx, qy - 2);
  }

  // ─── Recipe guide in joypad area ──────────────
  _drawRecipeGuide(ctx) {
    if (!this.player.activeMenu) return;
    const menu = this.player.activeMenu;
    const step = this.player.cookStep;
    if (step >= menu.steps.length) return;

    const gy = HEIGHT - PAD_H + 10;
    const cx = WIDTH / 2;

    // Step breadcrumb
    ctx.fillStyle = COL.TEXT_MAIN; ctx.font = '11px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const crumb = menu.steps.map((s,i) => {
      const st = Object.values(STATIONS).find(x => x.id === s);
      const em = st?.emoji || s;
      if (i < step) return '✓';
      if (i === step) return `[${em}]`;
      return em;
    }).join(' → ');
    ctx.fillText(crumb, cx, gy);

    // Status hint
    const reqSt = Object.values(STATIONS).find(s => s.id === menu.steps[step]);
    ctx.font = '10px Arial'; ctx.fillStyle = COL.TEXT_MAIN;
    let hint = '';
    if (this.player._stepReady) {
      const nextIdx = step + 1;
      const nextId  = menu.steps[nextIdx];
      const nextSt  = Object.values(STATIONS).find(s => s.id === nextId);
      hint = nextSt ? `ไปที่ ${nextSt.label} แล้วกด A` : `กด A ที่ ${reqSt?.label}`;
    } else if (this.player.busy) {
      hint = `⏳ ${Math.ceil(this.player.cookTimer/FPS)}s ที่ ${reqSt?.label}`;
    } else {
      hint = `ยืนที่ ${reqSt?.label} แล้วกด A`;
    }
    ctx.fillText(hint, cx, gy + 16);
  }

  // ─── Notifications ─────────────────────────────
  _drawNotifications(ctx) {
    this.notifications.forEach(n => {
      const alpha = Math.min(1, n.timer / 20);
      ctx.save(); ctx.globalAlpha = alpha;
      if (n.big) {
        // ── Big activate banner ───────────────────
        const bw = 310, bh = 38;
        const bx = WIDTH/2 - bw/2, by = n.y - bh/2;
        // glow
        ctx.shadowColor = n.color; ctx.shadowBlur = 18;
        ctx.fillStyle = '#1a0a2e';
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 12); ctx.fill();
        ctx.strokeStyle = n.color; ctx.lineWidth = 2; ctx.stroke();
        ctx.shadowBlur = 0;
        // shimmer
        const shimX = bx + ((Date.now()/6) % (bw+40)) - 20;
        ctx.save(); ctx.globalAlpha *= 0.25; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(Math.max(bx,shimX), by+2, 24, bh-4, 6); ctx.fill(); ctx.restore();
        ctx.fillStyle = n.color;
        ctx.font = 'bold 14px "Segoe UI Emoji"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.text, WIDTH/2, n.y);
      } else {
        // ── Normal notification ───────────────────
        ctx.fillStyle = 'rgba(252,228,236,0.92)';
        ctx.beginPath(); ctx.roundRect(WIDTH/2-135, n.y-14, 270, 29, 9); ctx.fill();
        ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = n.color || COL.TEXT_MAIN;
        ctx.font = 'bold 12px "Segoe UI Emoji"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.text, WIDTH/2, n.y);
      }
      ctx.restore();
    });
  }

  _addNotification(text, color = COL.TEXT_MAIN, big = false) {
    this.notifications.forEach(n => n.y -= (big ? 44 : 32));
    this.notifications.push({ text, color, timer: big ? 130 : 100, y: HEIGHT - PAD_H - 22, big });
    if (this.notifications.length > 4) this.notifications.shift();
  }

  // ─── Outside BG fallback ──────────────────────
  _drawOutsideBg(ctx) {
    const bg = this.images.bgOutside;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
    } else {
      this.kitchen.drawOutside(ctx);
    }
  }

  // ─── Input ────────────────────────────────────
  _bindKeys() {
    this._keys = {};
    window.addEventListener('keydown', e => {
      if (this._keys[e.key]) return;
      this._keys[e.key] = true;

      // Intro skip
      if (this.state === STATE.INTRO && this.introPhase >= 1 && this.introPhase <= 3) {
        if (e.key === ' ' || e.key === 'z' || e.key === 'Z' || e.key === 'Enter') {
          this.introTimer = 999; return;
        }
      }

      if (this.state === STATE.PLAYING) {
        if (e.key === ' ' || e.key === 'z' || e.key === 'Z') {
          e.preventDefault(); this.joypad._shootPressed = true;
        }
        if (e.key === 'x' || e.key === 'X') this.joypad._bombPressed = true;
        if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          if (this.menuSelecting) {
            const _fc3 = (this.player.activeMenu || this.player.holding) ? 0 : Object.keys(MENU).length;
            const _tc3 = _fc3 + Object.keys(ITEMS).length;
            this.menuSelectIdx = Math.max(0, this.menuSelectIdx - 1);
          } else {
            this._keyboardMove(-1);
          }
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          if (this.menuSelecting) {
            const _fc4 = (this.player.activeMenu || this.player.holding) ? 0 : Object.keys(MENU).length;
            const _tc4 = _fc4 + Object.keys(ITEMS).length;
            this.menuSelectIdx = Math.min(_tc4 - 1, this.menuSelectIdx + 1);
          } else {
            this._keyboardMove(1);
          }
        }
      }
      if (e.key === 'Enter' && this.state === STATE.SCORE && this.scoreReady) {
        this._goToRanking();
      }
    });
    window.addEventListener('keyup', e => { this._keys[e.key] = false; });
  }

  _bindTap(canvas) {
    const toCanvas = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      return [(cx-r.left)*WIDTH/r.width, (cy-r.top)*HEIGHT/r.height];
    };

    const onTap = (x, y) => {
      if (this.rankScreen.visible) { this.rankScreen.handleTap(x,y); return; }

      // Intro tap → skip message
      if (this.state === STATE.INTRO && this.introPhase >= 1 && this.introPhase <= 3) {
        this.introTimer = 999; return;
      }

      // Menu/item overlay tap (kitchen zone only)
      if (this.state === STATE.PLAYING && this.menuSelecting && y < HEIGHT - PAD_H) {
        // Food cards
        if (this._menuCardBounds) {
          for (const card of this._menuCardBounds) {
            if (x >= card.x && x <= card.x+card.w && y >= card.y && y <= card.y+card.h) {
              this._startCooking(card.id); return;
            }
          }
        }
        // Item cards
        if (this._itemCardBounds) {
          for (const card of this._itemCardBounds) {
            if (x >= card.x && x <= card.x+card.w && y >= card.y && y <= card.y+card.h) {
              this._buyItem(card.id); return;
            }
          }
        }
        return;
      }

      if (this.state === STATE.SCORE && this.scoreReady) {
        // btnY = Math.min(540, cardY + cardH + 30) = min(540, 108+220+30) = 358
        const _btnY = Math.min(540, 108 + (4*44+24+20) + 30);
        if (y >= _btnY && y <= _btnY + 50 && x >= WIDTH/2-130 && x <= WIDTH/2+130) {
          this._goToRanking();
        }
      }
    };

    canvas.addEventListener('click', e => {
      const [x,y] = toCanvas(e.clientX, e.clientY); onTap(x,y);
    });
    canvas.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      const [x,y] = toCanvas(t.clientX, t.clientY); onTap(x,y);
    });
  }

  _keyboardMove(dir) {
    const stations = Object.values(STATIONS);
    let curIdx = stations.findIndex(st => this.player.atStation === st.id);
    if (curIdx === -1) {
      const px = this.player.x + this.player.w/2;
      let minD = Infinity;
      stations.forEach((st,i) => { const d = Math.abs(px-(st.x+st.w/2)); if (d<minD){minD=d;curIdx=i;} });
    }
    const next = Math.max(0, Math.min(stations.length-1, curIdx+dir));
    if (next === curIdx) return;
    const target = stations[next];
    this.player.x = target.x + target.w/2 - this.player.w/2;
    this.player.atStation = target.id;
    this.player.dir = dir > 0 ? 'right' : 'left';
    this.player.moving = true;
    setTimeout(() => { this.player.moving = false; }, 120);
  }

  _goToRanking() {
    this.state = STATE.RANKING;
    this.rankScreen.show(
      this.hud.money,
      { menuSales: this.menuSales, angerCount: this.angerCount, servedCount: this.servedCount },
      () => this.restart()
    );
  }

  restart() {
    this.state = STATE.INTRO;
    this.introPhase = 0; this.introTimer = 0; this.introTextAlpha = 0;
    this.endPhase = 0; this.endTimer = 0;
    this.scoreTimer = 0; this.scoreReady = false;
    this.angerCount = 0; this.servedCount = 0; this.menuSales = {};
    this.menuSelecting = false; this.menuSelectIdx = 0; this.itemShopOpen = false;
    this._menuCardBounds = null; this._itemCardBounds = null; this._tabBounds = null;
    this.notifications = [];
    this.serveQueue    = [];
    this._ambientParts = [];
    window._lollipopActive = false;

    this.player = new Player(this.images.player || null);
    this.player.x = -this.player.w - 20;
    this.player.y = this.player.fixedY;

    this.custMgr = new CustomerManager();
    this.hud = new HUD();
    this.hud.shopTimer = SHOP_OPEN_DURATION;
  }
}
