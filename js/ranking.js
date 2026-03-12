// ════════════════════════════════════════════════════════════════
//  js/ranking.js  —  My Restaurant
//
//  CLASSES:
//    RankingSystem  — static helpers for localStorage read/write
//    RankingScreen  — full-screen overlay rendered via canvas
//
//  FLOW:
//    game._goToRanking()
//      → rankScreen.show(score, details, onDone)
//         → mode='entry': player types name on virtual keyboard
//         → confirmName(): saves to localStorage, mode='board'
//         → mode='board': shows top-10 leaderboard
//         → tap bottom area / Enter → _done() → onDone() → restart()
//
//  STORAGE:
//    Key: RANKING_KEY (settings.js) = 'myRestaurant_ranking_v1'
//    Format: JSON array of { name, score, date }, max RANKING_MAX entries
//    Sorted descending by score; oldest entry at tail is dropped.
//
//  INPUT:
//    Physical keyboard: handled by _keyHandler (added/removed on show/hide)
//    Touch: handleTap(x, y) called by game.js _bindTap()
//    Virtual keyboard: QWERTY + ⌫, rendered by _drawVKB()
//
//  DEPENDENCIES (globals from settings.js):
//    WIDTH, HEIGHT, COL, RANKING_KEY, RANKING_MAX
// ════════════════════════════════════════════════════════════════

// Pure static utility — no instances needed.
class RankingSystem {
  static load() {
    try { return JSON.parse(localStorage.getItem(RANKING_KEY)) || []; }
    catch { return []; }
  }
  static save(list) {
    try { localStorage.setItem(RANKING_KEY, JSON.stringify(list)); } catch {}
  }
  // Insert a new score, re-sort, trim to RANKING_MAX, persist.
  // Returns the updated list.
  static addScore(name, score) {
    const list = RankingSystem.load();
    list.push({ name: name.trim().slice(0,12) || 'Chef', score, date: new Date().toLocaleDateString('th-TH') });
    list.sort((a,b) => b.score - a.score);
    const trimmed = list.slice(0, RANKING_MAX);
    RankingSystem.save(trimmed);
    return trimmed;
  }
  // Returns 1-based rank the given score would occupy (before save).
  static getRank(score) {
    return RankingSystem.load().filter(e => e.score > score).length + 1;
  }
}

// ════════════════════════════════════════════════════
class RankingScreen {
  constructor(canvas) {
    this.canvas      = canvas;
    this.ctx         = canvas.getContext('2d');
    this.visible     = false;
    this.mode        = 'entry';
    this.playerName  = '';
    this.playerScore = 0;
    this.ranking     = [];
    this.playerRank  = 0;
    this._cursor     = true;
    this._cursorT    = 0;
    this._onDone     = null;
    this._keyHandler = e => this._handleKey(e);
  }

  show(score, details, onDone) {
    this.playerScore  = score;
    this.playerName   = '';
    this.mode         = 'entry';
    this.visible      = true;
    this._onDone      = onDone;
    this._details     = details || {};   // { menuSales, angerCount, servedCount }
    this.playerRank   = RankingSystem.getRank(score);
    window.addEventListener('keydown', this._keyHandler);
  }

  hide() {
    this.visible = false;
    window.removeEventListener('keydown', this._keyHandler);
  }

  _handleKey(e) {
    if (this.mode === 'entry') {
      if (e.key === 'Enter')     { this._confirmName(); return; }
      if (e.key === 'Backspace') { this.playerName = this.playerName.slice(0,-1); return; }
      if (e.key.length === 1 && this.playerName.length < 12) this.playerName += e.key;
    } else {
      if (e.key === 'Enter' || e.key === ' ') this._done();
    }
  }

  handleTap(x, y) {
    if (this.mode === 'entry') {
      // Confirm button
      if (x >= WIDTH/2-80 && x <= WIDTH/2+80 && y >= 458 && y <= 502) { this._confirmName(); return; }
      this._vkbTap(x, y);
    } else {
      if (y >= HEIGHT - 90) this._done();
    }
  }

  _vkbTap(x, y) {
    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Z','X','C','V','B','N','M','⌫'],
    ];
    const startY = 308, keyH = 40, keyGap = 2;
    rows.forEach((row, ri) => {
      const keyW = Math.floor((WIDTH-20)/row.length) - keyGap;
      const rowX = (WIDTH - (keyW+keyGap)*row.length) / 2;
      row.forEach((k, ki) => {
        const kx = rowX + ki*(keyW+keyGap), ky = startY + ri*(keyH+keyGap);
        if (x>=kx && x<=kx+keyW && y>=ky && y<=ky+keyH) {
          if (k==='⌫') this.playerName = this.playerName.slice(0,-1);
          else if (this.playerName.length < 12) this.playerName += k;
        }
      });
    });
  }

  _confirmName() {
    const name = this.playerName.trim() || 'Chef';
    this.ranking = RankingSystem.addScore(name, this.playerScore);
    this.playerRank = this.ranking.findIndex(e => e.name===name && e.score===this.playerScore) + 1;
    this.mode = 'board';
  }

  _done() { this.hide(); if (this._onDone) this._onDone(); }

  draw() {
    if (!this.visible) return;
    const ctx = this.ctx;
    // Reset any inherited canvas state from game draw
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1,0,0,1,0,0);
    this._cursorT++;
    if (this._cursorT % 30 === 0) this._cursor = !this._cursor;

    // Pink background
    ctx.fillStyle = COL.PRIMARY_L;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Petal decor
    [[30,50],[120,25],[330,45],[60,680],[310,665],[195,35]].forEach(([sx,sy]) => {
      ctx.font='18px "Segoe UI Emoji"'; ctx.textAlign='center';
      ctx.fillText('🌸', sx, sy);
    });

    if (this.mode === 'entry') this._drawEntry(ctx);
    else                       this._drawBoard(ctx);
  }

  _drawEntry(ctx) {
    // Panel
    ctx.fillStyle = 'rgba(255,240,248,0.95)';
    ctx.beginPath(); ctx.roundRect(18, 55, WIDTH-36, 240, 18); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 2; ctx.stroke();

    // Title
    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 24px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏷️ ใส่ชื่อเชฟ', WIDTH/2, 90);

    ctx.fillStyle = COL.TEXT_MAIN; ctx.font = '16px "Segoe UI Emoji"';
    ctx.fillText(`คะแนน: ฿${this.playerScore.toLocaleString()}`, WIDTH/2, 122);

    ctx.fillStyle = this.playerRank <= 3 ? COL.GOLD : COL.PRIMARY;
    ctx.font = 'bold 14px "Segoe UI Emoji"';
    ctx.fillText(`อันดับ #${this.playerRank}`, WIDTH/2, 148);

    // Input box
    const bx = WIDTH/2 - 145, by = 162;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(bx, by, 290, 50, 10); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = COL.TEXT_MAIN; ctx.font = 'bold 22px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((this.playerName||'') + (this._cursor?'|':' '), WIDTH/2, by+25);

    // VKB
    this._drawVKB(ctx);

    // Confirm button
    ctx.fillStyle = COL.PRIMARY;
    ctx.beginPath(); ctx.roundRect(WIDTH/2-85, 460, 170, 44, 12); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✅ ยืนยัน', WIDTH/2, 482);
  }

  _drawVKB(ctx) {
    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['Z','X','C','V','B','N','M','⌫'],
    ];
    const startY = 308, keyH = 40, keyGap = 2;
    rows.forEach((row, ri) => {
      const keyW = Math.floor((WIDTH-20)/row.length) - keyGap;
      const rowX = (WIDTH-(keyW+keyGap)*row.length)/2;
      row.forEach((k, ki) => {
        const kx = rowX + ki*(keyW+keyGap), ky = startY + ri*(keyH+keyGap);
        const isDel = k==='⌫';
        // Key bg
        ctx.fillStyle = isDel ? 'rgba(194,24,91,0.18)' : 'rgba(244,143,177,0.22)';
        ctx.beginPath(); ctx.roundRect(kx, ky, keyW, keyH, 5); ctx.fill();
        ctx.strokeStyle = isDel ? COL.PRIMARY_D : COL.PRIMARY;
        ctx.lineWidth = 1; ctx.stroke();
        // Key label
        ctx.fillStyle = isDel ? COL.PRIMARY_D : COL.TEXT_MAIN;
        ctx.font = `${isDel?13:12}px Arial`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(k, kx+keyW/2, ky+keyH/2);
      });
    });
  }

  _drawBoard(ctx) {
    // Panel
    ctx.fillStyle = 'rgba(255,240,248,0.96)';
    ctx.beginPath(); ctx.roundRect(12, 60, WIDTH-24, HEIGHT-150, 18); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY; ctx.lineWidth = 2; ctx.stroke();

    // Title
    ctx.fillStyle = COL.PRIMARY_D; ctx.font = 'bold 20px "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏆 ยอดขายสูงสุด 🏆', WIDTH/2, 88);

    // ── Ranking list ────────────────────────────────
    const list = this.ranking.length ? this.ranking : RankingSystem.load();
    const rowH = 48, startY = 118;

    list.slice(0, RANKING_MAX).forEach((entry, i) => {
      const y = startY + i*rowH;
      const isMe = (i+1 === this.playerRank && entry.score === this.playerScore);

      if (isMe) {
        ctx.fillStyle = 'rgba(244,143,177,0.22)';
        ctx.beginPath(); ctx.roundRect(18, y+2, WIDTH-36, rowH-4, 8); ctx.fill();
        ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth=1.5; ctx.stroke();
      }

      const medals = ['🥇','🥈','🥉'];
      ctx.font = '18px "Segoe UI Emoji"'; ctx.textAlign='left';
      ctx.fillText(medals[i]||(i<9?`${i+1}.`:`${i+1}`), 20, y+rowH/2);

      ctx.fillStyle = isMe ? COL.PRIMARY_D : COL.TEXT_MAIN;
      ctx.font = `${isMe?'bold ':''}14px "Courier New"`;
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText(entry.name, 56, y+rowH/2-6);

      ctx.fillStyle = '#aaa'; ctx.font='10px Arial';
      ctx.fillText(entry.date||'', 56, y+rowH/2+9);

      ctx.fillStyle = COL.PRIMARY_D; ctx.font=`bold 15px "Courier New"`;
      ctx.textAlign='right';
      ctx.fillText(`฿${entry.score.toLocaleString()}`, WIDTH-18, y+rowH/2);
    });

    if (!list.length) {
      ctx.fillStyle = COL.PRIMARY; ctx.font='16px Arial'; ctx.textAlign='center';
      ctx.fillText('ยังไม่มีข้อมูล', WIDTH/2, 300);
    }

    // Play again
    const by = HEIGHT - 80;
    ctx.fillStyle = COL.PRIMARY;
    ctx.beginPath(); ctx.roundRect(WIDTH/2-120, by, 240, 50, 14); ctx.fill();
    ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font='bold 17px "Segoe UI Emoji"';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('🌸 เล่นอีกครั้ง', WIDTH/2, by+25);
  }
}
