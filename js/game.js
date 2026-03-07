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
    this.menuSelectIdx   = 0;   // highlighted menu card index (joypad nav)
    this._menuCardBounds = null;
    this.notifications   = [];
    this.angerCount      = 0;
    this.servedCount     = 0;

    this._bindKeys();
    this._bindTap(canvas);
  }

  // ─── Asset injection ───────────────────────────
  setImages(images) {
    this.images = images;
    this.player.sprite = images.player || null;
    const imgMap = {
      burger: images.menuBurger, chicken: images.menuChicken,
      fries:  images.menuFries,  donut:   images.menuDonut,
    };
    for (const [id, img] of Object.entries(imgMap)) {
      if (MENU[id] && img) MENU[id].img = img;
    }
    const stMap = {
      prep: images.stationPrep, cook: images.stationCook,
      plate: images.stationPlate, serve: images.stationServe,
    };
    for (const [id, img] of Object.entries(stMap)) {
      if (STATIONS[id.toUpperCase()] && img) STATIONS[id.toUpperCase()].img = img;
    }
  }

  setSounds(sounds) {
    this._sounds = sounds;
    // Start BGM immediately (browsers need user gesture first; will retry on first tap)
    this._startBGM();
  }

  _startBGM() {
    try {
      const bgm = this._sounds['bgm'];
      if (!bgm) return;
      bgm.loop   = true;
      bgm.volume = 0.35;
      const p = bgm.play();
      if (p && typeof p.catch === 'function') p.catch(() => {
        // Autoplay blocked — resume on first user interaction
        const resume = () => { bgm.play().catch(()=>{}); document.removeEventListener('pointerdown', resume); };
        document.addEventListener('pointerdown', resume, { once: true });
      });
    } catch(e) {}
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
      if (typeof snd.cloneNode === 'function') {
        const c = snd.cloneNode(true);
        c.volume = snd.volume || 0.55;
        c.play().catch(() => {});
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

    if (!this.menuSelecting) {
      this.player.update(this.joypad.getDx(), 0);
    }

    // Station proximity
    this.player.atStation = null;
    for (const st of Object.values(STATIONS)) {
      if (this.player.overlapsStation(st)) { this.player.atStation = st.id; break; }
    }

    // Cook timer → step ready
    if (this.player.busy && this.player.cookTimer <= 0 && !this.player._stepReady) {
      this.player._stepReady = true;
      const nextStepIdx = this.player.cookStep + 1;
      const nextId = this.player.activeMenu?.steps[nextStepIdx];
      const nextSt = nextId ? Object.values(STATIONS).find(s => s.id === nextId) : null;
      if (nextSt) {
        this._addNotification(`✅ เสร็จแล้ว! ไปที่ ${nextSt.label}`, COL.GREEN);
      } else {
        // Last step done
        this._addNotification('✅ เสร็จ! ไปที่ เสิร์ฟ 🛎️', COL.GREEN);
      }
    }

    // Menu joypad navigation
    if (this.menuSelecting) {
      const menuItems = Object.values(MENU);
      if (this.joypad.getDx() !== 0) {
        // Only trigger once per direction press
        if (!this._menuNavCD || this._menuNavCD <= 0) {
          this.menuSelectIdx = (this.menuSelectIdx + (this.joypad.getDx() > 0 ? 1 : -1) + menuItems.length) % menuItems.length;
          this._menuNavCD = 15;
        }
      }
      if (this._menuNavCD > 0) this._menuNavCD--;
    }

    // ACT / BOMB
    if (this.joypad.consumeAct())  this._handleAct();
    if (this.joypad.consumeBomb()) this._handleCancel();

    // Customers
    this.custMgr.update(true);
    const nowAngry = this.custMgr.countAngry();
    if (nowAngry > this.angerCount) {
      this.angerCount = nowAngry;
      this.hud.updateStarRating(this.angerCount);
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
      this._addNotification('ยกเลิก', '#aaa');
      return;
    }
    if (this.player.activeMenu) {
      this.player.clearFood();
      this._addNotification('❌ ยกเลิกการทำอาหาร', COL.RED);
    }
  }

  // ─── ACT (A button) ───────────────────────────
  _handleAct() {
    // ── While menu is open: confirm selection ────
    if (this.menuSelecting) {
      const items = Object.values(MENU);
      this._startCooking(items[this.menuSelectIdx]?.id);
      return;
    }

    const st = this.player.atStation;

    // ── Holding food → try serve ─────────────────
    if (this.player.holding) {
      if (st === 'serve') {
        const cust = this.custMgr.findWaiting(this.player.holding);
        if (cust) {
          const money = cust.serve();
          this.hud.addMoney(money);
          this.servedCount++;
          this._addNotification(`🎉 +฿${money}!`, COL.GOLD);
          this._playSound('coin');
          this.player.clearFood();
        } else {
          this._addNotification('ไม่มีลูกค้าสั่งเมนูนี้!', COL.RED);
          this._playSound('error');
        }
      } else {
        this._addNotification('ไปที่ 🛎️ เสิร์ฟ!', COL.PRIMARY);
        this._playSound('error');
      }
      return;
    }

    // ── Has active recipe ────────────────────────
    if (this.player.activeMenu) {
      const reqId = this.player.activeMenu.steps[this.player.cookStep];

      // Timer still running → wait
      if (this.player.busy && this.player.cookTimer > 0) {
        const sec = Math.ceil(this.player.cookTimer / FPS);
        this._addNotification(`⏳ รออีก ${sec}s...`, '#aaa');
        return;
      }

      // Step done → must be at NEXT station
      if (this.player._stepReady) {
        const nextIdx = this.player.cookStep + 1;
        const nextId  = this.player.activeMenu.steps[nextIdx];
        const isLastStep = (nextIdx >= this.player.activeMenu.steps.length);

        if (isLastStep) {
          // Last step completed → food is ready
          if (st === reqId || !nextId) {
            const done = this.player.startNextStep();
            this._addNotification(`✅ ${MENU[this.player.holding]?.name} พร้อมเสิร์ฟ!`, COL.GREEN);
            this._playSound('serve');
          } else {
            this._playSound('error');
            this._addNotification('ยืนผิดจุด! 🔔', COL.RED);
          }
        } else {
          // Must walk to next station and press A there
          if (st === nextId) {
            this.player.startNextStep();  // advances cookStep, starts new timer
            this._addNotification(`▶ เริ่มขั้นตอน ${Object.values(STATIONS).find(s=>s.id===nextId)?.label}`, COL.PRIMARY);
          } else {
            this._playSound('error');
            const nextSt = Object.values(STATIONS).find(s => s.id === nextId);
            this._addNotification(`ไปที่ ${nextSt?.label} ก่อน!`, COL.RED);
          }
        }
        return;
      }

      // Idle at wrong station
      if (st !== reqId) {
        this._playSound('error');
        this._addNotification('ยืนผิดจุด! 🔔', COL.RED);
      } else {
        const sec = Math.ceil(this.player.cookTimer / FPS);
        this._addNotification(`⏳ รออีก ${sec}s...`, '#aaa');
      }
      return;
    }

    // ── Idle: open menu only at PREP ─────────────
    if (st === 'prep') {
      this.menuSelecting  = true;
      this.menuSelectIdx  = 0;
      this._menuNavCD     = 0;
    } else if (st) {
      this._addNotification('ไปที่ 🔪 เตรียมของ เพื่อเลือกเมนู', COL.PRIMARY);
      this._playSound('error');
    } else {
      this._addNotification('เดินไปที่สถานีก่อน!', '#aaa');
    }
  }

  // ─── Start cooking ────────────────────────────
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
    this.custMgr.draw(ctx);

    if (this.player.atStation) this.kitchen.highlightStation(ctx, this.player.atStation);

    this.player.draw(ctx, true);

    // Recipe step guide in joypad area
    if (this.player.activeMenu && !this.menuSelecting) this._drawRecipeGuide(ctx);

    // Menu overlay (covers kitchen zone only)
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
    if (this.scoreTimer > 20) {
      const ca = Math.min(1, (this.scoreTimer-20)/40);
      ctx.save(); ctx.globalAlpha = ca;
      ctx.fillStyle = 'rgba(255,240,248,0.96)';
      ctx.beginPath(); ctx.roundRect(28, 110, WIDTH-56, 280, 18); ctx.fill();
      ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 2; ctx.stroke();

      const rows = [
        { label:'💰 รายได้รวม',    val:`฿${this.hud.money.toLocaleString()}` },
        { label:'🍳 เสิร์ฟสำเร็จ', val:`${this.servedCount} จาน` },
        { label:'😤 ลูกค้าโกรธ',   val:`${this.angerCount} คน` },
        { label:'⭐ ระดับร้าน',     val:'⭐'.repeat(Math.max(0,this.hud.starRating))||'☆☆☆' },
      ];
      rows.forEach((row,i) => {
        const delay = 40+i*20;
        const ra = this.scoreTimer > delay ? Math.min(1,(this.scoreTimer-delay)/20) : 0;
        if (!ra) return;
        ctx.save(); ctx.globalAlpha = ra*ca;
        const ry = 148 + i*60;
        if (i>0) {
          ctx.strokeStyle='rgba(244,143,177,0.3)'; ctx.lineWidth=1;
          ctx.beginPath(); ctx.moveTo(44,ry-8); ctx.lineTo(WIDTH-44,ry-8); ctx.stroke();
        }
        ctx.fillStyle = COL.TEXT_MAIN; ctx.font='14px "Segoe UI Emoji"';
        ctx.textAlign='left'; ctx.fillText(row.label, 46, ry+12);
        ctx.fillStyle = COL.PRIMARY_D; ctx.font='bold 20px "Segoe UI Emoji"';
        ctx.textAlign='right'; ctx.fillText(row.val, WIDTH-46, ry+16);
        ctx.restore();
      });
      ctx.restore();
    }

    if (this.scoreReady) {
      const ba = Math.min(1,(this.scoreTimer-90)/20);
      const pulse = 0.65 + Math.sin(Date.now()/400)*0.35;
      ctx.save(); ctx.globalAlpha = ba*pulse;
      ctx.fillStyle = COL.PRIMARY; ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth=2;
      ctx.beginPath(); ctx.roundRect(WIDTH/2-130, 430, 260, 54, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='bold 17px "Segoe UI Emoji"';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('📝 บันทึกคะแนน', WIDTH/2, 457);
      ctx.restore();
    }
  }

  // ─── Menu Select overlay ──────────────────────
  // 2×2 grid over kitchen area. Joypad L/R navigates, A confirms, B cancels.
  _drawMenuSelect(ctx) {
    ctx.fillStyle = 'rgba(252,228,236,0.95)';
    ctx.fillRect(0, HUD_H, WIDTH, GAME_H);

    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 16px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('🍽️ เลือกเมนู', WIDTH/2, HUD_H + 10);
    ctx.fillStyle = COL.TEXT_MAIN; ctx.font = '11px Arial';
    ctx.fillText('◀ ▶ เลือก  |  A ยืนยัน  |  B ยกเลิก', WIDTH/2, HUD_H + 30);

    const items = Object.values(MENU);
    const cols = 2, itemW = 132, itemH = 132, gap = 10;
    const totalW = cols * itemW + (cols-1) * gap;
    const startX = (WIDTH - totalW) / 2;
    const startY = HUD_H + 52;

    // Recompute bounds each frame for tap detection
    this._menuCardBounds = items.slice(0,4).map((menu,i) => ({
      id: menu.id,
      x: startX + (i%cols)*(itemW+gap),
      y: startY + Math.floor(i/cols)*(itemH+gap),
      w: itemW, h: itemH,
    }));

    items.slice(0,4).forEach((menu, i) => {
      const cb   = this._menuCardBounds[i];
      const sel  = (i === this.menuSelectIdx);

      // Card background
      ctx.fillStyle = sel ? 'rgba(244,143,177,0.35)' : 'rgba(255,255,255,0.90)';
      ctx.beginPath(); ctx.roundRect(cb.x, cb.y, cb.w, cb.h, 14); ctx.fill();
      ctx.strokeStyle = sel ? COL.PRIMARY_D : COL.PRIMARY;
      ctx.lineWidth   = sel ? 3 : 1.5; ctx.stroke();

      // Selection glow
      if (sel) {
        const pulse = 0.3 + Math.abs(Math.sin(Date.now()/300))*0.4;
        ctx.save(); ctx.globalAlpha = pulse;
        ctx.shadowColor = COL.PRIMARY_D; ctx.shadowBlur = 18;
        ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(cb.x, cb.y, cb.w, cb.h, 14); ctx.stroke();
        ctx.restore();
      }

      // Food emoji or image
      if (menu.img && menu.img.complete && menu.img.naturalWidth > 0) {
        ctx.drawImage(menu.img, cb.x+16, cb.y+8, cb.w-32, cb.h-36);
      } else {
        ctx.font = '58px "Segoe UI Emoji"';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(menu.emoji, cb.x + cb.w/2, cb.y + cb.h/2 - 12);
      }

      // Price
      ctx.fillStyle = sel ? COL.PRIMARY_D : COL.TEXT_MAIN;
      ctx.font = `bold 13px Arial`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`฿${menu.price}`, cb.x + cb.w/2, cb.y + cb.h - 4);
    });
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
      const alpha = Math.min(1, n.timer/20);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(252,228,236,0.92)';
      ctx.beginPath(); ctx.roundRect(WIDTH/2-135, n.y-14, 270, 29, 9); ctx.fill();
      ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = n.color || COL.TEXT_MAIN;
      ctx.font = 'bold 12px "Segoe UI Emoji"';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.text, WIDTH/2, n.y);
      ctx.restore();
    });
  }

  _addNotification(text, color = COL.TEXT_MAIN) {
    this.notifications.forEach(n => n.y -= 32);
    this.notifications.push({ text, color, timer: 100, y: HEIGHT - PAD_H - 22 });
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
            this.menuSelectIdx = (this.menuSelectIdx - 1 + Object.keys(MENU).length) % Object.keys(MENU).length;
          } else {
            this._keyboardMove(-1);
          }
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          if (this.menuSelecting) {
            this.menuSelectIdx = (this.menuSelectIdx + 1) % Object.keys(MENU).length;
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

      // Menu card tap (kitchen zone only)
      if (this.state === STATE.PLAYING && this.menuSelecting && y < HEIGHT - PAD_H) {
        if (this._menuCardBounds) {
          for (const card of this._menuCardBounds) {
            if (x >= card.x && x <= card.x+card.w && y >= card.y && y <= card.y+card.h) {
              this._startCooking(card.id); return;
            }
          }
        }
        return;
      }

      if (this.state === STATE.SCORE && this.scoreReady && y > 420) this._goToRanking();
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
    this.rankScreen.show(this.hud.money, () => this.restart());
  }

  restart() {
    this.state = STATE.INTRO;
    this.introPhase = 0; this.introTimer = 0; this.introTextAlpha = 0;
    this.endPhase = 0; this.endTimer = 0;
    this.scoreTimer = 0; this.scoreReady = false;
    this.angerCount = 0; this.servedCount = 0;
    this.menuSelecting = false; this.menuSelectIdx = 0;
    this._menuCardBounds = null; this.notifications = [];

    this.player = new Player(this.images.player || null);
    this.player.x = -this.player.w - 20;
    this.player.y = this.player.fixedY;

    this.custMgr = new CustomerManager();
    this.hud = new HUD();
    this.hud.shopTimer = SHOP_OPEN_DURATION;
  }
}
