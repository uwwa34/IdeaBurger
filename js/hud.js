// ═══════════════════════════════════════════════════
//  js/hud.js  —  HUD + VirtualJoypad  (Pink Theme)
//  Joypad: LEFT | RIGHT | B (cancel) | A (act)
// ═══════════════════════════════════════════════════

class HUD {
  constructor() {
    this.money       = 0;
    this.shopTimer   = SHOP_OPEN_DURATION;
    this.starRating  = 3;
    this.moneyFlash  = 0;
    this._coins      = [];
  }

  addMoney(amount) {
    this.money     += amount;
    this.moneyFlash = 30;
    for (let i = 0; i < 4; i++) {
      this._coins.push({
        x: 50 + Math.random()*40, y: 32,
        vx: (Math.random()-0.5)*3, vy: -2-Math.random()*2, life: 40,
      });
    }
  }

  update() {
    if (this.shopTimer > 0) this.shopTimer--;
    if (this.moneyFlash > 0) this.moneyFlash--;
    this._coins = this._coins.filter(p => {
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life--; return p.life>0;
    });
  }

  drawHUD(ctx) {
    // HUD bg — pink
    ctx.fillStyle = COL.HUD_BG;
    ctx.fillRect(0, 0, WIDTH, HUD_H);
    // bottom border
    ctx.strokeStyle = COL.PRIMARY_D; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,HUD_H); ctx.lineTo(WIDTH,HUD_H); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,HUD_H-3); ctx.lineTo(WIDTH,HUD_H-3); ctx.stroke();

    // Money
    const mc = this.moneyFlash > 0 ? '#fff' : COL.TEXT_MAIN;
    ctx.fillStyle = mc; ctx.font = 'bold 20px "Segoe UI Emoji"';
    ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText('💰', 8, 30);
    ctx.font = 'bold 18px "Courier New"'; ctx.fillStyle = COL.TEXT_MAIN;
    ctx.fillText(`฿${this.money.toLocaleString()}`, 34, 30);

    // Timer
    const sec = Math.ceil(this.shopTimer/FPS);
    const tc  = sec<30?'#fff':sec<60?'#FFF59D':COL.TEXT_MAIN;
    ctx.fillStyle = tc; ctx.textAlign='right';
    ctx.font = 'bold 14px "Segoe UI Emoji"'; ctx.fillText('⏰', WIDTH-78, 20);
    ctx.font = 'bold 17px "Courier New"';
    const mm = Math.floor(sec/60), ss = sec%60;
    ctx.fillText(`${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`, WIDTH-8, 30);

    // Timer bar
    const frac = this.shopTimer/SHOP_OPEN_DURATION;
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0,HUD_H-6,WIDTH,6);
    ctx.fillStyle = frac>0.4?COL.GREEN:frac>0.2?COL.GOLD:'#EF5350';
    ctx.fillRect(0,HUD_H-6,WIDTH*frac,6);

    // Stars
    for (let i=0;i<3;i++) {
      ctx.font='14px "Segoe UI Emoji"'; ctx.textAlign='center';
      ctx.fillText(i<this.starRating?'⭐':'☆', WIDTH/2-14+i*14, 30);
    }

    // Coin particles
    this._coins.forEach(p => {
      ctx.save(); ctx.globalAlpha=p.life/40;
      ctx.font='13px "Segoe UI Emoji"'; ctx.textAlign='center';
      ctx.fillText('🌸', p.x, p.y); ctx.restore();
    });
  }

  isShopClosed() { return this.shopTimer<=0; }
  updateStarRating(n) {
    this.starRating = n>=6?0:n>=4?1:n>=2?2:3;
  }
}

// ════════════════════════════════════════════════════
//  VirtualJoypad — original 4-button style (pink)
// ════════════════════════════════════════════════════
class VirtualJoypad {
  constructor(canvas) {
    const BTN   = 68;
    const BTN_Y = HEIGHT - PAD_H + Math.floor((PAD_H - BTN)/2) - 6;

    this.rects = {
      left  : { x: 18,                      y: BTN_Y, w: BTN, h: BTN },
      right : { x: 18+BTN+12,               y: BTN_Y, w: BTN, h: BTN },
      bomb  : { x: WIDTH-18-BTN*2-12,        y: BTN_Y, w: BTN, h: BTN },
      shoot : { x: WIDTH-18-BTN,             y: BTN_Y, w: BTN, h: BTN },
    };

    this.state = { left:false, right:false, bomb:false, shoot:false };
    this._touchMap = {};
    this._shootPressed = false;
    this._bombPressed  = false;
    this.dx = 0; this.dy = 0;

    this._bind(canvas);
  }

  _hitTest(px,py) {
    for (const [name,r] of Object.entries(this.rects)) {
      if (px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h) return name;
    }
    return null;
  }

  _press(id,name) {
    if (!name) return;
    const wasOff = !this.state[name];
    this.state[name]=true; this._touchMap[id]=name;
    if (wasOff) {
      if (name==='shoot') this._shootPressed=true;
      if (name==='bomb')  this._bombPressed=true;
    }
  }

  _release(id) {
    const name=this._touchMap[id];
    if (name){this.state[name]=false; delete this._touchMap[id];}
  }

  _xy(canvas,cx,cy) {
    const r=canvas.getBoundingClientRect();
    return [(cx-r.left)*WIDTH/r.width,(cy-r.top)*HEIGHT/r.height];
  }

  _bind(canvas) {
    canvas.addEventListener('touchstart',e=>{
      e.preventDefault();
      for (const t of e.changedTouches){
        const [x,y]=this._xy(canvas,t.clientX,t.clientY);
        this._press(t.identifier,this._hitTest(x,y));
      }
    },{passive:false});
    canvas.addEventListener('touchend',e=>{
      e.preventDefault();
      for (const t of e.changedTouches) this._release(t.identifier);
    },{passive:false});
    canvas.addEventListener('touchmove',e=>{
      e.preventDefault();
      for (const t of e.changedTouches){
        const [x,y]=this._xy(canvas,t.clientX,t.clientY);
        const prev=this._touchMap[t.identifier];
        const cur=this._hitTest(x,y);
        if (prev!==cur){
          if(prev)this.state[prev]=false;
          if(cur){this.state[cur]=true;this._touchMap[t.identifier]=cur;}
          else delete this._touchMap[t.identifier];
        }
      }
    },{passive:false});
    canvas.addEventListener('mousedown',e=>{
      const [x,y]=this._xy(canvas,e.clientX,e.clientY);
      this._press('mouse',this._hitTest(x,y));
    });
    canvas.addEventListener('mouseup',()=>this._release('mouse'));
  }

  getDx() {
    if (this.dx!==0) return this.dx;
    if (this.state.left&&!this.state.right) return -1;
    if (this.state.right&&!this.state.left)  return  1;
    return 0;
  }

  consumeAct()  { const v=this._shootPressed; this._shootPressed=false; return v; }
  consumeBomb() { const v=this._bombPressed;  this._bombPressed=false;  return v; }

  draw(ctx) {
    // pad bg
    ctx.fillStyle = 'rgba(252,228,236,0.95)';
    ctx.fillRect(0,HEIGHT-PAD_H,WIDTH,PAD_H);
    ctx.strokeStyle=COL.PRIMARY; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(0,HEIGHT-PAD_H); ctx.lineTo(WIDTH,HEIGHT-PAD_H); ctx.stroke();

    const defs=[
      {key:'left',  label:'◀',sub:'LEFT',  round:false,bCol:'rgba(244,143,177,0.9)',pCol:'rgba(244,143,177,0.5)'},
      {key:'right', label:'▶',sub:'RIGHT', round:false,bCol:'rgba(244,143,177,0.9)',pCol:'rgba(244,143,177,0.5)'},
      {key:'bomb',  label:'B',sub:'CANCEL',round:true, bCol:'rgba(206,147,216,0.9)',pCol:'rgba(206,147,216,0.5)'},
      {key:'shoot', label:'A',sub:'ACT',   round:true, bCol:'rgba(240,98,146,0.9)', pCol:'rgba(240,98,146,0.5)'},
    ];

    defs.forEach(d=>{
      const r=this.rects[d.key], pressed=this.state[d.key];
      const radius=d.round?r.w/2:14;
      ctx.save();
      ctx.beginPath(); this._roundRect(ctx,r.x,r.y,r.w,r.h,radius);
      if(pressed){ctx.fillStyle=d.pCol;ctx.fill();}
      ctx.strokeStyle=d.bCol; ctx.lineWidth=2.5; ctx.stroke();
      ctx.fillStyle=pressed?COL.PRIMARY_D:d.bCol;
      ctx.font='bold 22px Arial'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(d.label,r.x+r.w/2,r.y+r.h/2-6);
      ctx.fillStyle='rgba(173,20,87,0.7)'; ctx.font='10px Arial';
      ctx.fillText(d.sub,r.x+r.w/2,r.y+r.h-11);
      ctx.restore();
    });
  }

  _roundRect(ctx,x,y,w,h,r){
    ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }
}
