"use strict";

const GCFG_GAME = {
  GRAVITY:           0.85,   // heavier = shorter jump
  JUMP_FORCE:       -16.0,   // less force = lower jump
  DASH_DURATION:     400,
  DASH_SPEED_BONUS:  4.0,
  GROUND_Y_RATIO:    0.78,
  PLAYER_X_RATIO:    0.15,
  PLAYER_W:          70,
  PLAYER_H:          58,
  BASE_SPEED:        9.0,
  MAX_SPEED:         20.0,
  SPEED_INC:         0.0004,
  OBS_MIN_GAP:       60,    // min frames between spawns (~1 sec)
  OBS_MAX_GAP:       240,   // max frames between spawns (~4 sec)
  SHAKE_FRAMES:      8,
  DEATH_PARTICLES:   28,
  AUTO_RESTART_MS:   1200,
};

class Particle {
  constructor(x, y, rgb) {
    this.x = x; this.y = y;
    this.vx = (Math.random()-0.5)*10;
    this.vy = (Math.random()-1.8)*7;
    this.life = 1.0;
    this.decay = 0.02 + Math.random()*0.025;
    this.size  = 4 + Math.random()*7;
    this.rgb   = rgb||[255,180,70];
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.vy+=0.32; this.life-=this.decay; }
  get alive() { return this.life>0; }
}

class Dust {
  constructor(x,y) {
    this.x=x; this.y=y;
    this.vx=-1-Math.random()*2; this.vy=-Math.random()*1.5;
    this.life=1.0; this.decay=0.05+Math.random()*0.03; this.size=5+Math.random()*7;
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.vy+=0.05; this.life-=this.decay; }
  get alive() { return this.life>0; }
}

class Obstacle {
  constructor(x, groundY, type) {
    this.type=type; this.groundY=groundY; this.passed=false;
    this.animT=Math.random()*Math.PI*2;
    switch(type) {
      case "dog":     this.w=52; this.h=38; break;
      case "goat":    this.w=50; this.h=56; break;
      case "cat":     this.w=36; this.h=32; break;
      case "chicken": this.w=28; this.h=36; break;
      case "cart":    this.w=100; this.h=60; break;
      default:        this.w=40; this.h=40;
    }
    this.x=x; this.y=groundY-this.h;
  }
  move(speed) { this.x-=speed; this.animT+=0.12; }
  get offscreen() { return this.x+this.w<0; }
  get cartTopY() { return this.y; }
}

class Player {
  constructor(x, groundY) {
    this.groundY=groundY; this.x=x;
    this.y=groundY-GCFG_GAME.PLAYER_H;
    this.vy=0; this.grounded=true; this.dashing=false;
    this.dashTimer=0; this.jumpCount=0;
    this.scaleX=1.0; this.scaleY=1.0; this.legPhase=0; this.onCart=false;
  }
  get w()       { return GCFG_GAME.PLAYER_W; }
  get h()       { return GCFG_GAME.PLAYER_H; }
  get hitboxY() { return this.y; }

  jump() {
    // Only single jump — no double jump
    if(this.jumpCount>=2) return;
    this.vy=GCFG_GAME.JUMP_FORCE;
    this.grounded=false; this.onCart=false;
    this.jumpCount++;
    this.scaleY=0.6; this.scaleX=1.4;
  }

  dash() { this.dashing=true; this.dashTimer=GCFG_GAME.DASH_DURATION; }

  update(dt, obstacles) {
    if(this.dashing){
      this.dashTimer-=dt;
      if(this.dashTimer<=0){this.dashing=false;this.dashTimer=0;}
    }

    if(!this.grounded) {
      this.vy+=GCFG_GAME.GRAVITY; this.y+=this.vy;
      this.onCart=false;

      // Check landing on cart top
      for(const o of obstacles) {
        if(o.type==="cart") {
          const horseLeft  = this.x+this.w*0.2;
          const horseRight = this.x+this.w*0.8;
          const onX = horseRight>o.x && horseLeft<o.x+o.w;
          const falling  = this.vy>=0;
          const nearTop  = this.y+this.h>=o.cartTopY-8 && this.y+this.h<=o.cartTopY+25;
          if(onX&&falling&&nearTop){
            this.y=o.cartTopY-GCFG_GAME.PLAYER_H;
            this.vy=0; this.grounded=true; this.onCart=true; this.jumpCount=0;
            this.scaleY=1.3; this.scaleX=0.75;
          }
        }
      }

      // Land on ground
      const floor=this.groundY-GCFG_GAME.PLAYER_H;
      if(!this.onCart&&this.y>=floor){
        this.y=floor; this.vy=0; this.grounded=true; this.jumpCount=0;
        this.scaleY=1.35; this.scaleX=0.7;
      }
    } else {
      if(this.onCart){
        let still=false;
        for(const o of obstacles){
          if(o.type==="cart"){
            const onX=this.x+this.w*0.5>o.x&&this.x+this.w*0.5<o.x+o.w;
            if(onX){this.y=o.cartTopY-GCFG_GAME.PLAYER_H;still=true;}
          }
        }
        if(!still){this.grounded=false;this.onCart=false;}
      } else {
        this.y=this.groundY-GCFG_GAME.PLAYER_H;
      }
    }

    this.scaleX+=(1-this.scaleX)*0.2;
    this.scaleY+=(1-this.scaleY)*0.2;
    this.legPhase+=this.dashing?0.55:0.45;
  }

  hits(ox,oy,ow,oh){
    const S=10;
    const px=this.x+S, py=this.hitboxY+S, pw=this.w-S*2, ph=this.h-S*2;
    return(px<ox+ow-S&&px+pw>ox+S&&py<oy+oh-S&&py+ph>oy+S);
  }
}

window.Game = (function(){
  let _p=null, player=null;
  let obstacles=[], particles=[], dusts=[];
  let score=0, hiScore=0, speed=GCFG_GAME.BASE_SPEED;
  let gameState="start", groundY=0, shakeFrames=0, totalFrames=0, deathTime=0;
  let bgLayers=[], clouds=[], titleT=0;
  let obstacleCounter=0;
  let nextSpawnFrames=0; // countdown in frames before next spawn

  function init(p5ref){
    _p=p5ref;
    groundY=Math.floor(_p.height*GCFG_GAME.GROUND_Y_RATIO);
    _buildBg(); _resetRound();
  }

  function resize(){
    groundY=Math.floor(_p.height*GCFG_GAME.GROUND_Y_RATIO);
    if(player) player.groundY=groundY;
    _buildBg();
  }

  function handleGesture(g){
    switch(g){
      case "JUMP":   if(gameState==="playing") player.jump(); break;
      case "DASH":   if(gameState==="playing") player.dash(); break;
      case "START":  if(gameState==="start"||gameState==="dead") _startRound(); break;
      case "PAUSE":  if(gameState==="playing") gameState="paused"; break;
      case "RESUME": if(gameState==="paused")  gameState="playing"; break;
    }
  }

  function update(dt){
    titleT+=0.022;
    if(gameState==="dead"&&deathTime>0&&performance.now()-deathTime>GCFG_GAME.AUTO_RESTART_MS){
      _startRound(); return;
    }
    if(gameState!=="playing") return;
    totalFrames++; score++;
    speed=Math.min(GCFG_GAME.MAX_SPEED, GCFG_GAME.BASE_SPEED+score*GCFG_GAME.SPEED_INC);
    const eff=speed+(player.dashing?GCFG_GAME.DASH_SPEED_BONUS:0);

    player.update(dt*1000, obstacles);
    _spawnIfNeeded();

    for(let i=obstacles.length-1;i>=0;i--){
      const o=obstacles[i]; o.move(eff);
      if(!o.passed&&o.x+o.w<player.x) o.passed=true;

      if(o.type==="cart"&&player.onCart){
        if(o.offscreen) obstacles.splice(i,1);
        continue;
      }
      if(o.type==="cart"){
        const hittingSide=player.hitboxY+player.h*0.5>o.y+10;
        if(hittingSide&&player.hits(o.x,o.y,o.w,o.h)){_die();break;}
        if(o.offscreen) obstacles.splice(i,1);
        continue;
      }
      if(player.hits(o.x,o.y,o.w,o.h)){_die();break;}
      if(o.offscreen) obstacles.splice(i,1);
    }

    // Dust puffs when running
    if(player.grounded&&totalFrames%5===0)
      dusts.push(new Dust(player.x+5, groundY));
    if(player.dashing&&totalFrames%3===0)
      particles.push(new Particle(player.x, player.y+player.h*0.5, [255,200,80]));

    particles=particles.filter(p=>{p.update();return p.alive;});
    dusts=dusts.filter(d=>{d.update();return d.alive;});

    clouds.forEach(c=>{
      c.x-=c.spd*(eff/GCFG_GAME.BASE_SPEED);
      if(c.x+c.w<0){c.x=_p.width+Math.random()*200;c.y=30+Math.random()*groundY*0.38;}
    });
    bgLayers.forEach(L=>{L.offset=(L.offset+L.speed*eff)%_p.width;});
    if(shakeFrames>0) shakeFrames--;
  }

  function draw(){
    const p=_p;
    let sx=0,sy=0;
    if(shakeFrames>0){sx=(Math.random()-0.5)*10;sy=(Math.random()-0.5)*8;}
    p.push(); p.translate(sx,sy);
    _drawSky(p); _drawSun(p); _drawClouds(p); _drawBgLayers(p); _drawGround(p);
    dusts.forEach(d=>_drawDust(p,d));
    obstacles.forEach(o=>_drawObstacle(p,o));
    if(player) _drawHorse(p,player);
    particles.forEach(pt=>_drawParticle(p,pt));
    p.pop();
    _drawUI(p);
  }

  function getState(){ return gameState; }

  function _buildBg(){
    const W=_p.width;
    bgLayers=[
      {speed:0.6, alpha:0.7,  amp:0.12, freq:0.004, seed:10, offset:0},
      {speed:1.0, alpha:0.85, amp:0.08, freq:0.007, seed:40, offset:0},
    ].map(L=>{
      const pts=[];
      for(let i=0;i<=120;i++){
        const t=i/120, xf=t*W*2;
        const ny=Math.sin(xf*L.freq+L.seed)*0.6+Math.sin(xf*L.freq*2.5+L.seed)*0.4;
        pts.push({x:xf,ny});
      }
      return {...L,pts};
    });
    clouds=[];
    for(let i=0;i<6;i++)
      clouds.push({
        x:   Math.random()*W,
        y:   30+Math.random()*groundY*0.38,
        w:   80+Math.random()*120,
        h:   28+Math.random()*30,
        spd: 1.5+Math.random()*1.2,
      });
  }

  function _resetRound(){
    player=new Player(Math.floor(_p.width*GCFG_GAME.PLAYER_X_RATIO), groundY);
    obstacles=[]; particles=[]; dusts=[];
    score=0; speed=GCFG_GAME.BASE_SPEED;
    shakeFrames=0; totalFrames=0; deathTime=0; obstacleCounter=0;
    // First obstacle arrives in ~40 frames (~0.7 sec)
    nextSpawnFrames=40;
  }

  function _startRound(){ hiScore=Math.max(hiScore,score); _resetRound(); gameState="playing"; }

  function _die(){
    gameState="dead"; hiScore=Math.max(hiScore,score);
    shakeFrames=GCFG_GAME.SHAKE_FRAMES; deathTime=performance.now();
    const cx=player.x+player.w/2, cy=player.hitboxY+player.h/2;
    for(let i=0;i<GCFG_GAME.DEATH_PARTICLES;i++){
      particles.push(new Particle(cx,cy,[220,140,60]));
      particles.push(new Particle(cx,cy,[255,220,100]));
    }
  }

  function _spawnIfNeeded(){
    nextSpawnFrames--;
    if(nextSpawnFrames>0) return;

    // Random delay: 1 to 4 seconds at 60fps = 60 to 240 frames
    nextSpawnFrames = 60 + Math.floor(Math.random()*180);

    const sx=_p.width+50;
    obstacleCounter++;

    // Cart every 3rd obstacle, random animals otherwise
    let type;
    if(obstacleCounter%3===0){
      type="cart";
    } else {
      const animals=["dog","goat","cat","chicken"];
      type=animals[Math.floor(Math.random()*animals.length)];
    }

    obstacles.push(new Obstacle(sx, groundY, type));

    // 40% chance of a second obstacle close behind (not after cart)
    if(type!=="cart"&&Math.random()<0.4){
      const t2=["dog","cat","chicken","goat"][Math.floor(Math.random()*4)];
      // Place second one randomly 80-160px behind first
      obstacles.push(new Obstacle(sx+80+Math.random()*80, groundY, t2));
    }
  }

  // ── DRAWING ─────────────────────────────────────────────────

  function _drawSky(p){
    const ctx=p.drawingContext;
    const g=ctx.createLinearGradient(0,0,0,groundY);
    g.addColorStop(0,"#87CEEB");
    g.addColorStop(0.6,"#FDD09A");
    g.addColorStop(1,"#F4A460");
    ctx.fillStyle=g; ctx.fillRect(0,0,p.width,groundY);
  }

  function _drawSun(p){
    const sx=p.width*0.82, sy=p.height*0.14;
    p.noStroke();
    for(let r=60;r>0;r-=10){p.fill(255,220,100,18);p.ellipse(sx,sy,r*2,r*2);}
    p.fill(255,240,80); p.ellipse(sx,sy,50,50);
    p.fill(255,255,200); p.ellipse(sx,sy,28,28);
  }

  function _drawClouds(p){
    p.noStroke();
    clouds.forEach(c=>{
      p.fill(255,255,255,200);
      p.ellipse(c.x,c.y,c.w,c.h);
      p.ellipse(c.x+c.w*0.25,c.y-c.h*0.25,c.w*0.6,c.h*0.7);
      p.ellipse(c.x-c.w*0.2,c.y-c.h*0.15,c.w*0.5,c.h*0.6);
    });
  }

  function _drawBgLayers(p){
    const cols=["#5a8a3c","#4a7a2c"];
    bgLayers.forEach((L,li)=>{
      p.fill(cols[li]||"#4a7a2c"); p.noStroke();
      for(let rep=-1;rep<=1;rep++){
        const bx=-L.offset+rep*p.width;
        p.beginShape(); p.vertex(bx,groundY);
        L.pts.forEach(pt=>{
          p.vertex(bx+pt.x*0.5, groundY-L.amp*p.height-pt.ny*L.amp*p.height*0.5);
        });
        p.vertex(bx+p.width,groundY); p.endShape(p.CLOSE);
      }
    });
  }

  function _drawGround(p){
    p.noStroke(); p.fill(139,100,50);
    p.rect(0,groundY,p.width,p.height-groundY);
    p.fill(80,150,50); p.rect(0,groundY,p.width,10);
    p.stroke(60,120,30); p.strokeWeight(2);
    p.line(0,groundY,p.width,groundY); p.noStroke();
    // Fast-moving ground dots to sell speed
    const gOff=(totalFrames*speed*0.5)%60;
    p.fill(120,85,40,100);
    for(let x=-gOff;x<p.width;x+=60) p.ellipse(x+20,groundY+8,14,5);
  }

  function _drawHorse(p,h){
    const cx=h.x+h.w/2, cy=h.hitboxY+h.h/2;
    p.push(); p.translate(cx,cy); p.scale(h.scaleX,h.scaleY);

    const leg=Math.sin(h.legPhase), leg2=Math.sin(h.legPhase+Math.PI);
    const bW=52, bH=26;

    // Shadow
    p.noStroke(); p.fill(0,0,0,25);
    p.ellipse(0,bH*0.5+4,bW*0.9,9);

    // Dash trail
    if(h.dashing){
      for(let t=1;t<=3;t++){
        p.fill(255,200,50,55);
        p.rect(-bW/2-t*18,-bH/2,bW,bH,6);
      }
    }

    // Tail
    const tw=Math.sin(h.legPhase*0.7)*8;
    p.stroke(80,50,20); p.strokeWeight(4); p.noFill();
    p.beginShape();
    p.curveVertex(-bW/2-5,-5);
    p.curveVertex(-bW/2-10,0+tw);
    p.curveVertex(-bW/2-18,8+tw);
    p.curveVertex(-bW/2-14,16+tw);
    p.endShape(); p.noStroke();

    // Body
    p.fill(h.dashing?200:175,125,65);
    p.rect(-bW/2,-bH/2,bW,bH,10);

    // Neck
    p.fill(170,120,60);
    p.beginShape();
    p.vertex(bW/2-10,-bH/2);
    p.vertex(bW/2+10,-bH/2-18);
    p.vertex(bW/2+22,-bH/2-14);
    p.vertex(bW/2+8,-bH/2+4);
    p.endShape(p.CLOSE);

    // Head
    p.fill(175,125,65); p.ellipse(bW/2+20,-bH/2-18,26,20);
    p.fill(30); p.ellipse(bW/2+26,-bH/2-20,5,5);
    p.fill(255); p.ellipse(bW/2+27,-bH/2-21,2,2);
    p.fill(140,90,50); p.ellipse(bW/2+30,-bH/2-15,4,3);

    // Mane
    p.fill(80,50,20);
    for(let i=0;i<4;i++){
      const mw=Math.sin(h.legPhase+i)*3;
      p.ellipse(bW/2+8-i*5,-bH/2-10+mw,8,14);
    }

    // Ear
    p.fill(190,140,80);
    p.triangle(bW/2+14,-bH/2-26,bW/2+10,-bH/2-34,bW/2+20,-bH/2-30);

    // Legs — wide swing for galloping look
    p.stroke(150,100,55); p.strokeWeight(6); p.strokeCap(p.ROUND);
    const lH=22;
    p.line(bW/2-8,  bH/2, bW/2-10+leg*12,  bH/2+lH);
    p.line(bW/2-18, bH/2, bW/2-20+leg2*12, bH/2+lH);
    p.line(-bW/2+10,bH/2,-bW/2+8+leg2*12,  bH/2+lH);
    p.line(-bW/2+20,bH/2,-bW/2+18+leg*12,  bH/2+lH);

    // Hooves
    p.noStroke(); p.fill(60,40,20);
    p.ellipse(bW/2-10+leg*12,  bH/2+lH+3,10,6);
    p.ellipse(bW/2-20+leg2*12, bH/2+lH+3,10,6);
    p.ellipse(-bW/2+8+leg2*12, bH/2+lH+3,10,6);
    p.ellipse(-bW/2+18+leg*12, bH/2+lH+3,10,6);

    p.pop();
  }

  function _drawObstacle(p,o){
    p.push(); p.translate(o.x,o.y);
    const bob=Math.sin(o.animT)*1.5;
    p.translate(o.w/2,o.h/2+bob);
    switch(o.type){
      case "dog":     _drawDog(p,o.w,o.h,o.animT);     break;
      case "goat":    _drawGoat(p,o.w,o.h,o.animT);    break;
      case "cat":     _drawCat(p,o.w,o.h,o.animT);     break;
      case "chicken": _drawChicken(p,o.w,o.h,o.animT); break;
      case "cart":    _drawCart(p,o.w,o.h,o.animT);    break;
    }
    p.pop();

    // Bouncing arrow above cart
    if(o.type==="cart"){
      const ax=o.x+o.w/2;
      const ay=o.y-22+Math.sin(o.animT*2)*5;
      p.noStroke(); p.fill(255,220,50,220);
      p.textSize(14); p.textAlign(p.CENTER,p.CENTER);
      p.textFont("Rajdhani, monospace");
      p.text("▲ JUMP ON",ax,ay);
    }
  }

  function _drawDog(p,w,h,t){
    p.noStroke();
    p.fill(160,110,60); p.rect(-w/2,-h/2+6,w,h-10,8);
    p.fill(150,100,55); p.ellipse(w/2-2,-h/2+2,w*0.45,w*0.42);
    p.fill(130,85,40); p.ellipse(w/2+4,-h/2-4,12,16);
    p.fill(30); p.ellipse(w/2+4,-h/2,5,5);
    p.fill(200,150,110); p.ellipse(w/2+10,-h/2+4,10,7);
    p.fill(60,30,10); p.ellipse(w/2+13,-h/2+3,4,3);
    p.stroke(140,95,50); p.strokeWeight(4); p.noFill();
    p.line(-w/2,-h/2+10,-w/2-10,-h/2+10-Math.sin(t*2)*15);
    p.stroke(140,95,50); p.strokeWeight(5);
    const lk=Math.sin(t)*4;
    p.line(-w/2+8,h/2-4,-w/2+8+lk,h/2+8);
    p.line(-w/2+18,h/2-4,-w/2+18-lk,h/2+8);
    p.line(w/2-8,h/2-4,w/2-8-lk,h/2+8);
    p.line(w/2-18,h/2-4,w/2-18+lk,h/2+8);
    p.noStroke();
  }

  function _drawGoat(p,w,h,t){
    p.noStroke();
    p.fill(200,195,185); p.rect(-w/2,-h/2+8,w,h-14,8);
    p.fill(195,188,178); p.ellipse(w/2+2,-h/2,w*0.38,w*0.40);
    p.fill(180,160,100);
    p.triangle(w/2-2,-h/2-8,w/2+4,-h/2-20,w/2+8,-h/2-6);
    p.triangle(w/2+6,-h/2-8,w/2+12,-h/2-18,w/2+14,-h/2-5);
    p.fill(30); p.ellipse(w/2+8,-h/2-2,5,4);
    p.fill(220,215,205); p.ellipse(w/2+12,-h/2+10,8,12);
    p.stroke(180,175,165); p.strokeWeight(5);
    const lk=Math.sin(t)*4;
    p.line(-w/2+8,h/2-4,-w/2+8+lk,h/2+10);
    p.line(-w/2+18,h/2-4,-w/2+18-lk,h/2+10);
    p.line(w/2-8,h/2-4,w/2-8-lk,h/2+10);
    p.line(w/2-18,h/2-4,w/2-18+lk,h/2+10);
    p.noStroke(); p.fill(240,200,200); p.ellipse(0,h/2-2,18,10);
  }

  function _drawCat(p,w,h,t){
    p.noStroke();
    p.fill(100,100,110); p.ellipse(0,2,w*0.8,h*0.75);
    p.fill(105,105,115); p.ellipse(w/2-4,-h/2+6,w*0.55,w*0.52);
    p.fill(95,95,105);
    p.triangle(w/2-12,-h/2-2,w/2-6,-h/2-16,w/2-2,-h/2-2);
    p.triangle(w/2+2,-h/2-2,w/2+8,-h/2-14,w/2+12,-h/2-2);
    p.fill(60,200,80); p.ellipse(w/2-2,-h/2+4,7,7);
    p.fill(10); p.ellipse(w/2-2,-h/2+4,3,6);
    p.stroke(90,90,100); p.strokeWeight(4); p.noFill();
    const tc=Math.sin(t)*10;
    p.beginShape();
    p.curveVertex(-w/2+2,h/2-4);
    p.curveVertex(-w/2-8,0);
    p.curveVertex(-w/2-14,-h/4+tc);
    p.curveVertex(-w/2-8,-h/2+tc);
    p.endShape();
    p.noStroke(); p.fill(95,95,108);
    p.ellipse(-w/4,h/2-2,10,14);
    p.ellipse(w/4,h/2-2,10,14);
  }

  function _drawChicken(p,w,h,t){
    p.noStroke();
    p.fill(240,235,220); p.ellipse(0,2,w*0.85,h*0.72);
    const hb=Math.sin(t*3)*3;
    p.fill(238,232,215); p.ellipse(w/2-2,-h/2+6+hb,w*0.45,w*0.45);
    p.fill(220,50,50);
    p.ellipse(w/2-2,-h/2-2+hb,8,8);
    p.ellipse(w/2+3,-h/2-4+hb,6,7);
    p.fill(255,180,40);
    p.triangle(w/2+10,-h/2+8+hb,w/2+18,-h/2+10+hb,w/2+10,-h/2+14+hb);
    p.fill(30); p.ellipse(w/2+4,-h/2+7+hb,5,5);
    p.fill(220,60,60); p.ellipse(w/2+10,-h/2+15+hb,7,9);
    p.fill(220,215,195); p.ellipse(-4,2,w*0.55,h*0.4);
    p.stroke(200,160,40); p.strokeWeight(3);
    p.line(-w/4,h/2-2,-w/4-4,h/2+8);
    p.line(-w/4,h/2-2,-w/4+4,h/2+8);
    p.line(w/4,h/2-2,w/4-4,h/2+8);
    p.line(w/4,h/2-2,w/4+4,h/2+8);
    p.noStroke();
  }

  function _drawCart(p,w,h,t){
    p.noStroke();
    const wr=20, wy=h/2-2;
    for(const wx of[-w/2+wr+4, w/2-wr-4]){
      p.fill(80,50,20); p.ellipse(wx,wy,wr*2,wr*2);
      p.fill(60,35,10); p.ellipse(wx,wy,wr*1.4,wr*1.4);
      p.stroke(80,50,20); p.strokeWeight(2.5);
      for(let s=0;s<6;s++){
        const a=t+(s/6)*Math.PI*2;
        p.line(wx,wy,wx+Math.cos(a)*wr*0.85,wy+Math.sin(a)*wr*0.85);
      }
      p.noStroke(); p.fill(120,80,30); p.ellipse(wx,wy,9,9);
    }
    p.noStroke(); p.fill(160,110,55);
    p.rect(-w/2+6,-h/2,w-12,h-wr-2,4);
    p.stroke(130,90,40); p.strokeWeight(1.5);
    for(let px2=-w/2+14;px2<w/2-10;px2+=14)
      p.line(px2,-h/2+2,px2,h/2-wr-4);
    p.stroke(120,80,30); p.strokeWeight(3); p.noFill();
    p.rect(-w/2+6,-h/2,w-12,h-wr-2,4);
    // Bright yellow top = landing platform
    p.stroke(255,220,50); p.strokeWeight(5);
    p.line(-w/2+8,-h/2+2,w/2-8,-h/2+2);
    p.stroke(80,50,20); p.strokeWeight(3);
    p.line(-w/2+wr+4,wy,w/2-wr-4,wy);
    p.stroke(100,65,25); p.strokeWeight(4);
    p.line(w/2-6,-h/2+12,w/2+22,-h/2+20);
    p.line(w/2-6,h/2-wr-4,w/2+22,h/2-wr);
    p.noStroke();
  }

  function _drawDust(p,d){
    p.noStroke(); p.fill(180,150,110,d.life*110);
    p.ellipse(d.x,d.y,d.size*d.life,d.size*d.life*0.5);
  }

  function _drawParticle(p,pt){
    p.noStroke(); p.fill(pt.rgb[0],pt.rgb[1],pt.rgb[2],pt.life*220);
    p.ellipse(pt.x,pt.y,pt.size*pt.life,pt.size*pt.life);
  }

  // ── UI ──────────────────────────────────────────────────────

  function _drawUI(p){
    switch(gameState){
      case "start":   _drawStart(p);               break;
      case "playing": _drawHUD(p);                 break;
      case "paused":  _drawHUD(p); _drawPause(p);  break;
      case "dead":    _drawHUD(p); _drawDead(p);   break;
    }
  }

  function _drawHUD(p){
    p.textFont("Orbitron, monospace"); p.noStroke();
    p.textSize(22); p.textAlign(p.RIGHT,p.TOP);
    p.fill(60,40,10); p.text(_pad(score,6),p.width-18,16);
    p.textSize(10); p.fill(100,70,30);
    p.text("BEST "+_pad(hiScore,6),p.width-18,44);
    p.textAlign(p.LEFT,p.TOP); p.fill(60,120,40); p.textSize(10);
    p.text("SPD "+speed.toFixed(1),16,16);

    // Gesture pill
    const g=GestureEngine.state.gesture;
    const MAP={swipe_up:"↑ JUMP",JUMP:"↑ JUMP",DASH:"→ DASH",
               swipe_right:"→ DASH",open_palm:"✋ START",
               PAUSE:"⏸ PAUSE",RESUME:"▶ GO"};
    const lbl=MAP[g]||"·";
    const pw=130,ph=26,px2=p.width/2-65,py=p.height-46;
    p.fill(0,0,0,80); p.rect(px2,py,pw,ph,13);
    p.fill(g&&g!=="none"&&g!=="neutral"?60:100,
           g==="swipe_up"||g==="JUMP"?180:80,30,230);
    p.textSize(12); p.textAlign(p.CENTER,p.CENTER);
    p.textFont("Rajdhani, monospace");
    p.text(lbl,p.width/2,py+ph/2+1);

    if(window._pendingLoad){
      p.fill(80,50,20,210); p.textSize(12);
      p.textFont("Orbitron, monospace");
      p.textAlign(p.CENTER,p.CENTER);
      p.text(window._pendingLoad,p.width/2,p.height-26);
    }
  }

  function _drawStart(p){
    p.fill(0,0,0,75); p.rect(0,0,p.width,p.height);
    const cy=p.height*0.28, pulse=Math.sin(titleT);
    p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER,p.CENTER);
    p.fill(p.lerpColor(p.color(180,120,30),p.color(240,190,60),(pulse+1)/2));
    p.textSize(70); p.text("HORSE",p.width/2,cy);
    p.fill(80,140,50); p.text("RUNNER",p.width/2,cy+72);
    p.fill(100,70,30,180); p.textSize(14); p.textFont("Rajdhani, monospace");
    p.text("↑ SWIPE UP = JUMP  ·  → SWIPE RIGHT = DASH",p.width/2,cy+138);
    p.text("✋✋ TWO PALMS = PAUSE  ·  ✊✊ TWO FISTS = RESUME",p.width/2,cy+162);
    _drawPalmRing(p,p.height*0.72);
  }

  function _drawPalmRing(p,y){
    const prog=GestureEngine.state.palmProgress||0, r=30;
    p.noFill(); p.stroke(180,140,60,60); p.strokeWeight(3);
    p.ellipse(p.width/2,y,r*2,r*2);
    if(prog>0){
      const ctx=p.drawingContext;
      ctx.strokeStyle="rgba(60,160,60,0.9)"; ctx.lineWidth=4;
      ctx.beginPath();
      ctx.arc(p.width/2,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*prog);
      ctx.stroke();
    }
    p.noStroke(); p.fill(180,120,30);
    p.textSize(20); p.textAlign(p.CENTER,p.CENTER);
    p.text("✋",p.width/2,y);
    p.fill(80,60,20,200); p.textSize(11);
    p.textFont("Orbitron, monospace");
    p.text("HOLD OPEN PALM TO START",p.width/2,y+46);
    p.fill(120,100,60,140); p.textSize(10);
    p.text("( or press SPACE / ENTER )",p.width/2,y+62);
  }

  function _drawPause(p){
    p.fill(0,0,0,130); p.rect(0,0,p.width,p.height);
    p.fill(220,170,50); p.textSize(56);
    p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER,p.CENTER);
    p.text("PAUSED ⏸",p.width/2,p.height/2-20);
    p.fill(100,70,30,180); p.textSize(13);
    p.textFont("Rajdhani, monospace");
    p.text("SHOW TWO FISTS ✊✊ TO RESUME  ·  PRESS P",p.width/2,p.height/2+38);
  }

  function _drawDead(p){
    p.fill(0,0,0,150); p.rect(0,0,p.width,p.height);
    const ctx=p.drawingContext;
    ctx.shadowColor="#cc4400"; ctx.shadowBlur=30;
    p.fill(200,80,20); p.textSize(72);
    p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER,p.CENTER);
    p.text("WHOA! 🐴",p.width/2,p.height*0.36);
    ctx.shadowBlur=0;
    p.fill(180,130,40); p.textSize(24);
    p.text("SCORE  "+_pad(score,6),p.width/2,p.height*0.36+80);
    p.fill(120,90,40,180); p.textSize(14);
    p.text("BEST   "+_pad(hiScore,6),p.width/2,p.height*0.36+114);
    const elapsed=performance.now()-deathTime;
    const rem=Math.max(0,GCFG_GAME.AUTO_RESTART_MS-elapsed);
    const pct=1-rem/GCFG_GAME.AUTO_RESTART_MS;
    p.fill(100,70,30,180); p.textSize(12);
    p.textFont("Rajdhani, monospace");
    p.text("RESTARTING IN "+(rem/1000).toFixed(1)+"s …",p.width/2,p.height*0.36+155);
    const bx=p.width/2-100, by=p.height*0.36+172;
    p.fill(60,40,10,120); p.rect(bx,by,200,8,4);
    p.fill(180,140,40); p.rect(bx,by,200*pct,8,4);
  }

  function _pad(n,len){return String(Math.floor(n)).padStart(len,"0");}

  return {init,resize,update,draw,handleGesture,getState};
})();
