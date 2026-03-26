"use strict";

const GCFG_GAME = {
  GRAVITY:           0.85,
  JUMP_FORCE:       -16.0,
  DASH_DURATION:     400,
  DASH_SPEED_BONUS:  4.0,
  GROUND_Y_RATIO:    0.78,
  PLAYER_X_RATIO:    0.15,
  PLAYER_W:          70,
  PLAYER_H:          58,
  BASE_SPEED:        5.8,
  MAX_SPEED:         13.0,
  SPEED_INC:         0.0004,
  SHAKE_FRAMES:      8,
  DEATH_PARTICLES:   28,
  AUTO_RESTART_MS:   1200,
  THEME_CHANGE_SEC:  30,
};

const THEMES = [
  {
    name:      "FOREST",
    skyTop:    "#0a1a0a",
    skyBot:    "#1a3a1a",
    hill1:     "#0f2a0f",
    hill2:     "#081808",
    ground:    "#1a0f05",
    grass:     "#1a4a1a",
    obstacles: ["tree","rock","log","bush","pothole"],
    weights:   [28,24,18,15,15],
  },
  {
    name:      "COUNTRYSIDE",
    skyTop:    "#87CEEB",
    skyBot:    "#F4A460",
    hill1:     "#5a8a3c",
    hill2:     "#4a7a2c",
    ground:    "#8B6432",
    grass:     "#509632",
    obstacles: ["dog","goat","cat","chicken","cart"],
    weights:   [25,20,20,20,15],
  },
];

class Particle {
  constructor(x,y,rgb){
    this.x=x; this.y=y;
    this.vx=(Math.random()-0.5)*10;
    this.vy=(Math.random()-1.8)*7;
    this.life=1.0; this.decay=0.02+Math.random()*0.025;
    this.size=4+Math.random()*7; this.rgb=rgb||[255,180,70];
  }
  update(){ this.x+=this.vx; this.y+=this.vy; this.vy+=0.32; this.life-=this.decay; }
  get alive(){ return this.life>0; }
}

class Dust {
  constructor(x,y,rgb){
    this.x=x; this.y=y;
    this.vx=-1-Math.random()*2; this.vy=-Math.random()*1.5;
    this.life=1.0; this.decay=0.05+Math.random()*0.03;
    this.size=5+Math.random()*7; this.rgb=rgb||[180,150,110];
  }
  update(){ this.x+=this.vx; this.y+=this.vy; this.vy+=0.05; this.life-=this.decay; }
  get alive(){ return this.life>0; }
}

class Obstacle {
  constructor(x,groundY,type){
    this.type=type; this.groundY=groundY; this.passed=false;
    this.animT=Math.random()*Math.PI*2; this.seed=Math.random();
    switch(type){
      case "tree":    this.w=44; this.h=90;  break;
      case "rock":    this.w=55; this.h=40;  break;
      case "log":     this.w=70; this.h=30;  break;
      case "bush":    this.w=55; this.h=38;  break;
      case "pothole": this.w=70; this.h=18;  break;
      case "dog":     this.w=52; this.h=38;  break;
      case "goat":    this.w=50; this.h=56;  break;
      case "cat":     this.w=36; this.h=32;  break;
      case "chicken": this.w=28; this.h=36;  break;
      case "cart":    this.w=100;this.h=60;  break;
      default:        this.w=40; this.h=40;
    }
    this.x=x; this.y=groundY-this.h;
  }
  move(speed){ this.x-=speed; this.animT+=0.10; }
  get offscreen(){ return this.x+this.w<0; }
  get cartTopY(){ return this.y; }
}

class Player {
  constructor(x,groundY){
    this.groundY=groundY; this.x=x;
    this.y=groundY-GCFG_GAME.PLAYER_H;
    this.vy=0; this.grounded=true; this.dashing=false;
    this.dashTimer=0; this.jumpCount=0;
    this.scaleX=1.0; this.scaleY=1.0;
    this.legPhase=0; this.onCart=false; this.breathe=0;
  }
  get w(){ return GCFG_GAME.PLAYER_W; }
  get h(){ return GCFG_GAME.PLAYER_H; }
  get hitboxY(){ return this.y; }

  jump(){
    if(this.jumpCount>=2) return;
    this.vy=GCFG_GAME.JUMP_FORCE;
    this.grounded=false; this.onCart=false;
    this.jumpCount++;
    this.scaleY=0.6; this.scaleX=1.4;
  }

  dash(){ this.dashing=true; this.dashTimer=GCFG_GAME.DASH_DURATION; }

  update(dt,obstacles){
    if(this.dashing){
      this.dashTimer-=dt;
      if(this.dashTimer<=0){this.dashing=false;this.dashTimer=0;}
    }
    this.breathe+=0.04;

    if(!this.grounded){
      this.vy+=GCFG_GAME.GRAVITY; this.y+=this.vy;
      this.onCart=false;
      for(const o of obstacles){
        if(o.type==="cart"){
          const hL=this.x+this.w*0.2, hR=this.x+this.w*0.8;
          const onX=hR>o.x&&hL<o.x+o.w;
          const falling=this.vy>=0;
          const nearTop=this.y+this.h>=o.cartTopY-8&&this.y+this.h<=o.cartTopY+25;
          if(onX&&falling&&nearTop){
            this.y=o.cartTopY-GCFG_GAME.PLAYER_H;
            this.vy=0; this.grounded=true; this.onCart=true; this.jumpCount=0;
            this.scaleY=1.3; this.scaleX=0.75;
          }
        }
      }
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
    this.scaleX+=(1-this.scaleX)*0.18;
    this.scaleY+=(1-this.scaleY)*0.18;
    this.legPhase+=this.dashing?0.55:0.45;
  }

  hits(ox,oy,ow,oh){
    const S=10;
    const px=this.x+S,py=this.hitboxY+S,pw=this.w-S*2,ph=this.h-S*2;
    return(px<ox+ow-S&&px+pw>ox+S&&py<oy+oh-S&&py+ph>oy+S);
  }
}

window.Game=(function(){
  let _p=null, player=null;
  let obstacles=[], particles=[], dusts=[];
  let score=0, hiScore=0, speed=GCFG_GAME.BASE_SPEED;
  let gameState="start", groundY=0, shakeFrames=0, totalFrames=0, deathTime=0;
  let bgLayers=[], clouds=[], stars=[], farmProps=[], bgTrees=[];
  let bgCaves=[], bgForestTrees=[];
  let titleT=0, obstacleCounter=0, nextSpawnFrames=0;
  let themeIndex=0, themeTimer=0, themeFade=0, themeFading=false;

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
    speed=Math.min(GCFG_GAME.MAX_SPEED,GCFG_GAME.BASE_SPEED+score*GCFG_GAME.SPEED_INC);
    const eff=speed+(player.dashing?GCFG_GAME.DASH_SPEED_BONUS:0);

    themeTimer+=dt;
    if(themeTimer>=GCFG_GAME.THEME_CHANGE_SEC&&!themeFading){
      themeFading=true; themeFade=0;
    }
    if(themeFading){
      themeFade+=dt*0.8;
      if(themeFade>=1){
        themeFade=1; themeFading=false;
        themeIndex=(themeIndex+1)%THEMES.length;
        themeTimer=0; themeFade=0;
        obstacles=[]; obstacleCounter=0; nextSpawnFrames=30;
        _buildBg();
      }
    }

    player.update(dt*1000,obstacles);
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

    const dustRgb=themeIndex===0?[60,80,40]:[180,150,110];
    if(player.grounded&&totalFrames%5===0)
      dusts.push(new Dust(player.x+5,groundY,dustRgb));
    if(player.dashing&&totalFrames%3===0)
      particles.push(new Particle(player.x,player.y+player.h*0.5,[255,200,80]));

    particles=particles.filter(p=>{p.update();return p.alive;});
    dusts=dusts.filter(d=>{d.update();return d.alive;});

    clouds.forEach(c=>{
      c.x-=c.spd*(eff/GCFG_GAME.BASE_SPEED);
      if(c.x+c.w<0){c.x=_p.width+Math.random()*300;c.y=20+Math.random()*groundY*0.35;}
    });
    bgLayers.forEach(L=>{L.offset=(L.offset+L.speed*eff)%_p.width;});
    farmProps.forEach(f=>{
      f.offset=(f.offset+f.speed*eff)%(_p.width+400);
    });
    bgForestTrees.forEach(t=>{
      t.offset=(t.offset+t.speed*eff)%(_p.width+800);
    });
    bgCaves.forEach(c=>{
      c.offset=(c.offset+c.speed*eff)%(_p.width+600);
    });
    stars.forEach(s=>{
      s.x-=0.15*(eff/GCFG_GAME.BASE_SPEED);
      if(s.x<0) s.x+=_p.width;
    });

    if(shakeFrames>0) shakeFrames--;
  }

  function draw(){
    const p=_p;
    let sx=0,sy=0;
    if(shakeFrames>0){sx=(Math.random()-0.5)*10;sy=(Math.random()-0.5)*8;}
    p.push(); p.translate(sx,sy);

    _drawSky(p);
    if(themeIndex===0||themeFading) _drawForestBg(p,themeIndex===0?1:1-themeFade);
    if(themeIndex===1||themeFading) _drawCountrysideBg(p,themeIndex===1?1:themeFade);
    _drawGround(p);

    dusts.forEach(d=>_drawDust(p,d));
    obstacles.forEach(o=>_drawObstacle(p,o));
    if(player) _drawHorse(p,player);
    particles.forEach(pt=>_drawParticle(p,pt));

    if(themeFading){
      p.fill(0,0,0,themeFade*180);
      p.rect(0,0,p.width,p.height);
    }

    p.pop();
    _drawUI(p);
  }

  function getState(){ return gameState; }

  // ── Build background ───────────────────────────────────────

  function _buildBg(){
    const W=_p.width;

    bgLayers=[
      {speed:0.5,amp:0.14,freq:0.003,seed:10,offset:0},
      {speed:0.9,amp:0.09,freq:0.006,seed:55,offset:0},
    ].map(L=>{
      const pts=[];
      for(let i=0;i<=150;i++){
        const t=i/150,xf=t*W*2;
        const ny=Math.sin(xf*L.freq+L.seed)*0.55+Math.sin(xf*L.freq*2.4+L.seed)*0.45;
        pts.push({x:xf,ny});
      }
      return {...L,pts};
    });

    clouds=[];
    for(let i=0;i<7;i++)
      clouds.push({
        x:Math.random()*W, y:20+Math.random()*groundY*0.4,
        w:90+Math.random()*140, h:30+Math.random()*35,
        spd:0.8+Math.random()*0.8, alpha:120+Math.random()*80,
      });

    // 220 stars with twinkling phase
    stars=[];
    for(let i=0;i<220;i++)
      stars.push({
        x:     Math.random()*W,
        y:     Math.random()*_p.height*0.58,
        r:     Math.random()*1.8+0.2,
        twink: Math.random()*Math.PI*2,
      });

    // Farm props — 4 total, spaced across virtual scroll lane
    farmProps=[];
    const farmTypes=["barn","fence","haystack","windmill"];
    for(let i=0;i<4;i++){
      farmProps.push({
        type:   farmTypes[i%farmTypes.length],
        offset: (i/4)*(_p.width+400),
        baseY:  groundY,
        speed:  0.9,
        seed:   Math.random(),
      });
    }

    bgTrees=[];

    // Background dark forest trees — 2 depth layers
    bgForestTrees=[];
    for(let i=0;i<18;i++){
      bgForestTrees.push({
        offset: (i/18)*(_p.width+800),
        baseY:  groundY,
        h:      70+Math.random()*90,
        w:      32+Math.random()*28,
        speed:  i%3===0?0.35:0.55,
        layer:  i%3===0?0:1,
        seed:   Math.random(),
        col:    i%4===0?[12,35,12]:i%4===1?[18,48,20]:i%4===2?[10,28,14]:[22,55,18],
      });
    }

    // Background caves
    bgCaves=[];
    for(let i=0;i<5;i++){
      bgCaves.push({
        offset: (i/5)*(_p.width+600),
        baseY:  groundY,
        w:      80+Math.random()*60,
        h:      55+Math.random()*40,
        speed:  0.45,
        seed:   Math.random(),
      });
    }
  }

  function _resetRound(){
    player=new Player(Math.floor(_p.width*GCFG_GAME.PLAYER_X_RATIO),groundY);
    obstacles=[]; particles=[]; dusts=[];
    score=0; speed=GCFG_GAME.BASE_SPEED;
    shakeFrames=0; totalFrames=0; deathTime=0;
    obstacleCounter=0; nextSpawnFrames=50;
    themeIndex=0; themeTimer=0; themeFade=0; themeFading=false;
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
    nextSpawnFrames=60+Math.floor(Math.random()*180);
    const sx=_p.width+50;
    obstacleCounter++;
    const theme=THEMES[themeIndex];
    const type=_wr(theme.obstacles,theme.weights);
    obstacles.push(new Obstacle(sx,groundY,type));
    if(type!=="cart"&&type!=="pothole"&&Math.random()<0.35){
      const t2=theme.obstacles[Math.floor(Math.random()*theme.obstacles.length)];
      obstacles.push(new Obstacle(sx+85+Math.random()*70,groundY,t2));
    }
    if(type==="cart"&&Math.random()<0.45){
      const small=["dog","cat","chicken"][Math.floor(Math.random()*3)];
      obstacles.push(new Obstacle(sx+130,groundY,small));
    }
  }

  function _wr(arr,w){
    const t=w.reduce((a,b)=>a+b,0); let r=Math.random()*t;
    for(let i=0;i<arr.length;i++){r-=w[i];if(r<=0)return arr[i];}
    return arr[arr.length-1];
  }

  // ── Sky ────────────────────────────────────────────────────

  function _drawSky(p){
    const th=THEMES[themeIndex];
    const ctx=p.drawingContext;
    const g=ctx.createLinearGradient(0,0,0,groundY);
    if(themeFading){
      const next=THEMES[(themeIndex+1)%THEMES.length];
      g.addColorStop(0,_lerpHex(th.skyTop,next.skyTop,themeFade));
      g.addColorStop(1,_lerpHex(th.skyBot||th.skyTop,next.skyBot||next.skyTop,themeFade));
    } else {
      g.addColorStop(0,th.skyTop);
      g.addColorStop(1,th.skyBot||th.skyTop);
    }
    ctx.fillStyle=g; ctx.fillRect(0,0,p.width,p.height);
  }

  // ── Forest background ──────────────────────────────────────

  function _drawForestBg(p,alpha){
    const a=alpha;
    const W=_p.width;

    // Stars with twinkling
    p.noStroke();
    stars.forEach(s=>{
      const tw=0.55+0.45*Math.sin(s.twink+totalFrames*0.04);
      p.fill(220,230,255,a*tw*200);
      p.ellipse(s.x,s.y,s.r*2,s.r*2);
      if(s.r>1.4){
        p.fill(220,230,255,a*tw*60);
        p.ellipse(s.x,s.y,s.r*5,s.r*1.2);
        p.ellipse(s.x,s.y,s.r*1.2,s.r*5);
      }
    });

    // Moon + halo
    for(let r=80;r>50;r-=8){ p.fill(240,240,180,a*12); p.ellipse(W*0.15,_p.height*0.11,r,r); }
    p.fill(245,245,210,a*220); p.ellipse(W*0.15,_p.height*0.11,50,50);
    p.fill(30,50,30,a*220);    p.ellipse(W*0.15-9,_p.height*0.11-5,42,42);

    // Mist
    const ctx=p.drawingContext;
    const mg=ctx.createLinearGradient(0,groundY*0.5,0,groundY);
    mg.addColorStop(0,`rgba(15,40,15,0)`);
    mg.addColorStop(1,`rgba(15,40,15,${a*0.5})`);
    ctx.fillStyle=mg; ctx.fillRect(0,0,W,p.height);

    // Silhouette hills
    bgLayers.forEach((L,li)=>{
      const col=li===0?[10,32,10]:[8,24,8];
      p.fill(col[0],col[1],col[2],a*255); p.noStroke();
      for(let rep=-1;rep<=1;rep++){
        const bx=-L.offset+rep*W;
        p.beginShape(); p.vertex(bx,groundY);
        L.pts.forEach(pt=>{
          p.vertex(bx+pt.x*0.5,groundY-L.amp*p.height-pt.ny*L.amp*p.height*0.5);
        });
        p.vertex(bx+W,groundY); p.endShape(p.CLOSE);
      }
    });

    // Far background forest trees
    bgForestTrees.filter(t=>t.layer===0).forEach(t=>{
      const x=(W+800-t.offset)%(W+800)-100;
      _drawBgForestTree(p,x,t.baseY,t.w*0.7,t.h*0.75,t.col,a*0.55,t.seed);
    });

    // Caves in hillside
    bgCaves.forEach(c=>{
      const x=(W+600-c.offset)%(W+600)-80;
      _drawBgCave(p,x,c.baseY,c.w,c.h,a,c.seed);
    });

    // Nearer background forest trees
    bgForestTrees.filter(t=>t.layer===1).forEach(t=>{
      const x=(W+800-t.offset)%(W+800)-100;
      _drawBgForestTree(p,x,t.baseY,t.w,t.h,t.col,a*0.72,t.seed);
    });

    // Ground mist
    const mistG=ctx.createLinearGradient(0,groundY-30,0,groundY+15);
    mistG.addColorStop(0,`rgba(80,140,80,${a*0.12})`);
    mistG.addColorStop(1,`rgba(80,140,80,0)`);
    ctx.fillStyle=mistG; ctx.fillRect(0,0,W,p.height);
  }

  function _drawBgForestTree(p,x,y,w,h,col,alpha,seed){
    p.noStroke();
    const a=alpha*255;
    // Trunk
    p.fill(col[0]*0.6,col[1]*0.4,col[2]*0.3,a);
    p.rect(x+w*0.44,y-h*0.32,w*0.12,h*0.35,2);
    // Canopy layers
    p.fill(col[0]*0.7,col[1]*0.8,col[2]*0.7,a*0.85);
    p.triangle(x+w*0.5,y-h, x-w*0.1,y-h*0.32, x+w*1.1,y-h*0.32);
    p.fill(col[0],col[1],col[2],a*0.9);
    p.triangle(x+w*0.5,y-h*0.88, x,y-h*0.22, x+w,y-h*0.22);
    p.fill(
      Math.min(col[0]+8,255),
      Math.min(col[1]+18,255),
      Math.min(col[2]+8,255), a
    );
    p.triangle(x+w*0.5,y-h*0.72, x+w*0.1,y-h*0.12, x+w*0.9,y-h*0.12);
    // Firefly
    if(seed>0.75){
      p.fill(200,255,150,a*0.7*Math.abs(Math.sin(totalFrames*0.04+seed*10)));
      p.ellipse(x+w*0.3+seed*w*0.4,y-h*0.25,4,4);
    }
  }

  function _drawBgCave(p,x,y,w,h,alpha,seed){
    p.noStroke();
    const a=alpha*255;
    const caveY=y-4;
    // Rocky hill face
    p.fill(18,38,18,a*0.8);
    p.beginShape();
    p.vertex(x-10,caveY);
    p.vertex(x-5,caveY-h*0.5-20);
    p.vertex(x+w*0.3,caveY-h-10);
    p.vertex(x+w*0.7,caveY-h-5);
    p.vertex(x+w+5,caveY-h*0.4-15);
    p.vertex(x+w+10,caveY);
    p.endShape(p.CLOSE);
    // Cave mouth
    p.fill(5,8,5,a);
    p.arc(x+w/2,caveY,w*0.72,h*1.1,p.PI,0,p.CHORD);
    // Interior
    p.fill(20,35,18,a*0.6);
    p.arc(x+w/2,caveY,w*0.52,h*0.8,p.PI,0,p.CHORD);
    // Left rock
    p.fill(35,55,28,a*0.9);
    p.beginShape();
    p.vertex(x+w*0.14,caveY); p.vertex(x+w*0.08,caveY-h*0.25);
    p.vertex(x+w*0.22,caveY-h*0.35); p.vertex(x+w*0.28,caveY-h*0.18);
    p.vertex(x+w*0.20,caveY);
    p.endShape(p.CLOSE);
    // Right rock
    p.beginShape();
    p.vertex(x+w*0.80,caveY); p.vertex(x+w*0.72,caveY-h*0.18);
    p.vertex(x+w*0.78,caveY-h*0.38); p.vertex(x+w*0.92,caveY-h*0.28);
    p.vertex(x+w*0.86,caveY);
    p.endShape(p.CLOSE);
    // Stalactites
    p.fill(25,48,22,a*0.85);
    for(let i=0;i<4;i++){
      const sx=x+w*0.22+i*w*0.16;
      const sh=8+seed*6+i*3;
      const sy=caveY-h*0.72+Math.sin(seed*5+i)*4;
      p.triangle(sx-4,sy,sx+4,sy,sx,sy+sh);
    }
    // Interior glow
    const grd=p.drawingContext.createRadialGradient(
      x+w/2,caveY-h*0.2,0, x+w/2,caveY-h*0.2,w*0.3
    );
    grd.addColorStop(0,`rgba(60,120,50,${alpha*0.18})`);
    grd.addColorStop(1,`rgba(60,120,50,0)`);
    p.drawingContext.fillStyle=grd;
    p.drawingContext.fillRect(x,caveY-h,w,h);
    // Mossy rocks
    p.noStroke();
    p.fill(28,58,24,a*0.9);
    p.ellipse(x+w*0.15,caveY-3,18,10);
    p.ellipse(x+w*0.82,caveY-4,14,8);
    p.fill(35,75,28,a*0.7);
    p.ellipse(x+w*0.12,caveY-6,8,6);
    p.ellipse(x+w*0.86,caveY-5,6,5);
  }

  // ── Countryside background ─────────────────────────────────

  function _drawCountrysideBg(p,alpha){
    const a=alpha;

    // Sun
    const sx=p.width*0.82, sy=p.height*0.13;
    p.noStroke();
    for(let r=70;r>0;r-=12){p.fill(255,220,100,a*20);p.ellipse(sx,sy,r*2,r*2);}
    p.fill(255,240,80,a*255); p.ellipse(sx,sy,52,52);
    p.fill(255,255,200,a*255); p.ellipse(sx,sy,30,30);

    // Clouds
    clouds.forEach(c=>{
      p.fill(255,255,255,a*c.alpha);
      p.ellipse(c.x,c.y,c.w,c.h);
      p.ellipse(c.x+c.w*0.25,c.y-c.h*0.25,c.w*0.6,c.h*0.7);
      p.ellipse(c.x-c.w*0.2,c.y-c.h*0.15,c.w*0.5,c.h*0.6);
    });

    // Rolling hills
    const hillCols=["#5a8a3c","#4a7a2c"];
    bgLayers.forEach((L,li)=>{
      p.fill(
        p.red(p.color(hillCols[li])),
        p.green(p.color(hillCols[li])),
        p.blue(p.color(hillCols[li])),a*255
      );
      p.noStroke();
      for(let rep=-1;rep<=1;rep++){
        const bx=-L.offset+rep*p.width;
        p.beginShape(); p.vertex(bx,groundY);
        L.pts.forEach(pt=>{
          p.vertex(bx+pt.x*0.5,groundY-L.amp*p.height-pt.ny*L.amp*p.height*0.5);
        });
        p.vertex(bx+p.width,groundY); p.endShape(p.CLOSE);
      }
    });

    // Farm props
    farmProps.forEach(f=>{
      const x=(_p.width+400-f.offset)%(_p.width+400)-100;
      _drawFarmProp(p,x,f.baseY,f.type,f.seed,a);
    });
  }

  function _drawFarmProp(p,x,y,type,seed,alpha){
    p.noStroke();
    const a=alpha*255;
    switch(type){
      case "barn":
        p.fill(160,40,30,a); p.rect(x,y-55,42,42);
        p.fill(120,25,20,a);
        p.triangle(x-4,y-55,x+21,y-80,x+46,y-55);
        p.fill(80,30,10,a); p.rect(x+16,y-24,12,24);
        p.fill(200,180,100,a*0.8); p.rect(x+5,y-48,10,10);
        p.fill(200,180,100,a*0.8); p.rect(x+27,y-48,10,10);
        break;
      case "fence":
        p.fill(200,175,125,a);
        for(let i=0;i<5;i++) p.rect(x+i*16,y-24,4,24,2);
        p.rect(x,y-20,76,5,2); p.rect(x,y-11,76,5,2);
        break;
      case "haystack":
        p.fill(0,0,0,a*0.15); p.ellipse(x+22,y-3,50,10);
        p.fill(200,165,55,a); p.ellipse(x+22,y-14,50,28);
        p.fill(215,180,65,a); p.ellipse(x+22,y-22,34,22);
        p.fill(230,200,80,a); p.ellipse(x+22,y-28,18,14);
        p.stroke(180,145,40,a*0.7); p.strokeWeight(1.5);
        for(let i=0;i<5;i++) p.line(x+8+i*7,y-8,x+6+i*7+Math.sin(i)*4,y-28);
        p.noStroke();
        break;
      case "windmill":
        p.fill(210,200,180,a);
        p.beginShape();
        p.vertex(x+12,y); p.vertex(x+30,y);
        p.vertex(x+26,y-62); p.vertex(x+16,y-62);
        p.endShape(p.CLOSE);
        p.fill(100,60,20,a); p.rect(x+17,y-20,8,20,2);
        p.fill(160,80,30,a);
        p.triangle(x+10,y-62,x+21,y-76,x+32,y-62);
        const angle=seed*Math.PI*2+(performance.now()*0.0015);
        for(let b=0;b<4;b++){
          const ba=angle+b*Math.PI/2;
          const bx2=x+21+Math.cos(ba)*22;
          const by2=y-68+Math.sin(ba)*22;
          p.fill(220,210,190,a);
          p.beginShape();
          p.vertex(x+21,y-68);
          p.vertex(x+21+Math.cos(ba-0.3)*8,y-68+Math.sin(ba-0.3)*8);
          p.vertex(bx2,by2);
          p.vertex(x+21+Math.cos(ba+0.3)*8,y-68+Math.sin(ba+0.3)*8);
          p.endShape(p.CLOSE);
        }
        p.fill(160,80,30,a); p.ellipse(x+21,y-68,8,8);
        break;
    }
  }

  // ── Ground ─────────────────────────────────────────────────

  function _drawGround(p){
    const th=THEMES[themeIndex];
    p.noStroke();
    p.fill(p.color(th.ground));
    p.rect(0,groundY,p.width,p.height-groundY);
    p.fill(p.color(th.grass));
    p.rect(0,groundY,p.width,12);
    p.stroke(p.color(th.grass)); p.strokeWeight(2);
    p.line(0,groundY,p.width,groundY); p.noStroke();
    const gOff=(totalFrames*speed*0.5)%70;
    if(themeIndex===0){
      p.fill(30,60,20,80);
      for(let x=-gOff;x<p.width;x+=70){
        p.ellipse(x+15,groundY+7,20,6);
        p.ellipse(x+45,groundY+10,12,4);
      }
    } else {
      p.fill(120,85,40,90);
      for(let x=-gOff;x<p.width;x+=70) p.ellipse(x+25,groundY+8,16,5);
    }
  }

  // ── Horse ──────────────────────────────────────────────────

  function _drawHorse(p,h){
    const cx=h.x+h.w/2, cy=h.hitboxY+h.h/2;
    p.push(); p.translate(cx,cy); p.scale(h.scaleX,h.scaleY);

    const leg=Math.sin(h.legPhase), leg2=Math.sin(h.legPhase+Math.PI);
    const leg3=Math.sin(h.legPhase+Math.PI*0.5), leg4=Math.sin(h.legPhase+Math.PI*1.5);
    const bW=54, bH=27;
    const breathe=Math.sin(h.breathe)*0.8;

    // Shadow
    p.noStroke(); p.fill(0,0,0,30);
    p.ellipse(0,bH*0.5+6,bW*1.1,10);

    // Dash afterimage
    if(h.dashing){
      for(let t=1;t<=4;t++){
        p.fill(255,180,40,40-t*8);
        p.rect(-bW/2-t*16,-bH/2,bW,bH,8);
      }
    }

    // Rear legs
    p.stroke(120,75,35); p.strokeWeight(7); p.strokeCap(p.ROUND);
    const lH=24;
    p.line(-bW/2+12,bH/2-4,-bW/2+8+leg3*10,bH/2+10);
    p.line(-bW/2+22,bH/2-4,-bW/2+18+leg4*10,bH/2+10);
    p.line(-bW/2+8+leg3*10,bH/2+10,-bW/2+6+leg3*12,bH/2+lH);
    p.line(-bW/2+18+leg4*10,bH/2+10,-bW/2+16+leg4*12,bH/2+lH);
    p.noStroke(); p.fill(45,28,12);
    p.ellipse(-bW/2+6+leg3*12,bH/2+lH+3,12,6);
    p.ellipse(-bW/2+16+leg4*12,bH/2+lH+3,12,6);

    // Tail
    const tw=Math.sin(h.legPhase*0.6)*10;
    p.stroke(70,42,12); p.strokeWeight(5); p.noFill();
    p.beginShape();
    p.curveVertex(-bW/2,0);
    p.curveVertex(-bW/2-8,4+tw*0.3);
    p.curveVertex(-bW/2-16,12+tw);
    p.curveVertex(-bW/2-20,22+tw);
    p.curveVertex(-bW/2-16,30+tw*0.7);
    p.endShape();
    p.stroke(85,52,18); p.strokeWeight(3);
    p.line(-bW/2-16,12+tw,-bW/2-24,20+tw*1.2);
    p.line(-bW/2-18,18+tw,-bW/2-26,28+tw*0.9);
    p.noStroke();

    // Body
    const bodyCol=h.dashing?[195,128,58]:[168,108,48];
    p.fill(bodyCol[0],bodyCol[1],bodyCol[2]);
    p.beginShape();
    p.vertex(-bW/2+4,-bH/2+4);
    p.vertex(bW/2-8,-bH/2);
    p.vertex(bW/2-2,-bH/2+bH*0.4);
    p.vertex(bW/2-6,bH/2);
    p.vertex(-bW/2+2,bH/2);
    p.vertex(-bW/2,-bH/2+4-2);
    p.endShape(p.CLOSE);
    p.fill(140,88,35,120); p.ellipse(0,bH/2-3,bW*0.7,10);
    p.fill(190,130,60,100); p.ellipse(bW/2-12,-bH/4,16,22);
    p.stroke(140,88,35,80); p.strokeWeight(1.5); p.noFill();
    p.beginShape();
    p.curveVertex(-bW/4,-bH/3);
    p.curveVertex(0,-bH/4+breathe);
    p.curveVertex(bW/4,-bH/3);
    p.endShape();
    p.noStroke();

    // Neck
    p.fill(160,103,44);
    p.beginShape();
    p.vertex(bW/2-12,-bH/2+2);
    p.vertex(bW/2+4,-bH/2-22);
    p.vertex(bW/2+18,-bH/2-18);
    p.vertex(bW/2+20,-bH/2-8);
    p.vertex(bW/2+6,bH/2-bH*0.6);
    p.endShape(p.CLOSE);
    p.fill(145,93,38,120); p.ellipse(bW/2+8,-bH/2-10,10,26);

    // Head
    p.fill(165,108,46);
    p.beginShape();
    p.vertex(bW/2+8,-bH/2-28);
    p.vertex(bW/2+22,-bH/2-24);
    p.vertex(bW/2+36,-bH/2-18);
    p.vertex(bW/2+38,-bH/2-10);
    p.vertex(bW/2+36,-bH/2-4);
    p.vertex(bW/2+22,-bH/2-6);
    p.vertex(bW/2+10,-bH/2-14);
    p.endShape(p.CLOSE);
    p.fill(200,165,120); p.ellipse(bW/2+34,-bH/2-9,14,12);
    p.fill(80,45,15);
    p.ellipse(bW/2+37,-bH/2-10,4,3);
    p.ellipse(bW/2+36,-bH/2-6,3,2.5);

    // Eye
    p.fill(15,10,5); p.ellipse(bW/2+20,-bH/2-22,8,7);
    p.fill(255,255,255,180); p.ellipse(bW/2+22,-bH/2-24,2.5,2.5);
    p.fill(155,98,40);
    p.arc(bW/2+20,-bH/2-22,8,7,p.PI,0);

    // Ear
    p.fill(175,118,50);
    p.beginShape();
    p.vertex(bW/2+10,-bH/2-28);
    p.vertex(bW/2+14,-bH/2-40);
    p.vertex(bW/2+20,-bH/2-36);
    p.vertex(bW/2+16,-bH/2-26);
    p.endShape(p.CLOSE);
    p.fill(220,150,130,180);
    p.triangle(bW/2+12,-bH/2-30,bW/2+15,-bH/2-38,bW/2+18,-bH/2-29);

    // Mane
    p.fill(70,40,10);
    p.beginShape();
    p.vertex(bW/2+10,-bH/2-28);
    p.vertex(bW/2+8,-bH/2-22);
    for(let i=0;i<5;i++){
      const mw=Math.sin(h.legPhase*0.8+i)*4;
      p.vertex(bW/2+6-i*4,-bH/2-8-i*3+mw);
    }
    p.vertex(bW/2-8,-bH/2+2);
    p.endShape();
    p.stroke(85,50,15); p.strokeWeight(2);
    for(let i=0;i<3;i++){
      const mw=Math.sin(h.legPhase*0.8+i*1.2)*4;
      p.line(bW/2+4-i*5,-bH/2-14+i*2,bW/2-2-i*5,-bH/2-2+i*2+mw);
    }
    p.noStroke();

    // Front legs
    p.stroke(130,82,38); p.strokeWeight(7); p.strokeCap(p.ROUND);
    p.line(bW/2-10,bH/2-4,bW/2-12+leg*11,bH/2+10);
    p.line(bW/2-20,bH/2-4,bW/2-22+leg2*11,bH/2+10);
    p.noStroke(); p.fill(120,75,32);
    p.ellipse(bW/2-12+leg*11,bH/2+10,9,8);
    p.ellipse(bW/2-22+leg2*11,bH/2+10,9,8);
    p.stroke(125,78,35); p.strokeWeight(6);
    p.line(bW/2-12+leg*11,bH/2+10,bW/2-10+leg*13,bH/2+lH);
    p.line(bW/2-22+leg2*11,bH/2+10,bW/2-20+leg2*13,bH/2+lH);
    p.noStroke(); p.fill(40,25,10);
    p.ellipse(bW/2-10+leg*13,bH/2+lH+3,13,7);
    p.ellipse(bW/2-20+leg2*13,bH/2+lH+3,13,7);
    p.fill(70,50,25,120);
    p.ellipse(bW/2-10+leg*13,bH/2+lH+1,8,3);
    p.ellipse(bW/2-20+leg2*13,bH/2+lH+1,8,3);

    // Double jump ring
    if(!h.grounded&&h.jumpCount===2){
      p.noFill(); p.stroke(255,220,80,180); p.strokeWeight(2);
      p.ellipse(0,-bH/4,bW*2.2,bW*2.2);
      p.stroke(255,220,80,80); p.strokeWeight(1);
      p.ellipse(0,-bH/4,bW*2.6,bW*2.6);
      p.noStroke();
    }

    p.pop();
  }

  // ── Obstacle dispatcher ────────────────────────────────────

  function _drawObstacle(p,o){
    p.push(); p.translate(o.x,o.y);
    const bob=Math.sin(o.animT)*1.2;
    switch(o.type){
      case "tree":    _drawTree(p,o.w,o.h,o.animT,o.seed);    break;
      case "rock":    _drawRock(p,o.w,o.h,o.seed);            break;
      case "log":     _drawLog(p,o.w,o.h,o.animT);            break;
      case "bush":    _drawBush(p,o.w,o.h,o.animT);           break;
      case "pothole": _drawPothole(p,o.w,o.h,o.animT);        break;
      case "dog":     p.translate(o.w/2,o.h/2+bob); _drawDog(p,o.w,o.h,o.animT);     break;
      case "goat":    p.translate(o.w/2,o.h/2+bob); _drawGoat(p,o.w,o.h,o.animT);    break;
      case "cat":     p.translate(o.w/2,o.h/2+bob); _drawCat(p,o.w,o.h,o.animT);     break;
      case "chicken": p.translate(o.w/2,o.h/2+bob); _drawChicken(p,o.w,o.h,o.animT); break;
      case "cart":    p.translate(o.w/2,o.h/2);     _drawCart(p,o.w,o.h,o.animT);    break;
    }
    p.pop();
    if(o.type==="cart"){
      const ax=o.x+o.w/2;
      const ay=o.y-22+Math.sin(o.animT*2)*5;
      p.noStroke(); p.fill(255,220,50,200);
      p.textSize(13); p.textAlign(p.CENTER,p.CENTER);
      p.textFont("Rajdhani, monospace");
      p.text("▲ JUMP ON",ax,ay);
    }
  }

  // ── Forest obstacle: Cherry blossom tree ───────────────────

  function _drawTree(p,w,h,t,seed){
    p.noStroke();
    const trunkW=w*0.22, trunkH=h*0.38;
    const trunkX=w/2-trunkW/2;
    p.fill(90,55,22);
    p.rect(trunkX,h-trunkH,trunkW,trunkH,3);
    p.stroke(70,42,14,180); p.strokeWeight(1);
    p.line(trunkX+3,h-trunkH+5,trunkX+3,h-8);
    p.line(trunkX+trunkW-3,h-trunkH+8,trunkX+trunkW-3,h-5);
    p.noStroke();
    // Branch arms
    p.stroke(80,48,18,200); p.strokeWeight(3); p.noFill();
    const sway=Math.sin(t*0.5)*2;
    p.line(w*0.5,h-trunkH,w*0.28+sway,h*0.42);
    p.line(w*0.5,h-trunkH,w*0.72+sway,h*0.40);
    p.line(w*0.5,h-trunkH,w*0.5+sway*0.5,h*0.25);
    p.noStroke();
    // Blossom clusters — hot pink, visible on dark bg
    const clusters=[
      {cx:0.50,cy:0.15,r:0.48,col:[255,160,185]},
      {cx:0.25,cy:0.35,r:0.36,col:[255,130,165]},
      {cx:0.75,cy:0.30,r:0.38,col:[255,150,178]},
      {cx:0.40,cy:0.05,r:0.30,col:[255,200,215]},
      {cx:0.62,cy:0.08,r:0.28,col:[240,120,158]},
      {cx:0.35,cy:0.48,r:0.24,col:[255,175,195]},
      {cx:0.68,cy:0.44,r:0.26,col:[255,140,172]},
    ];
    clusters.forEach(cl=>{
      p.fill(cl.col[0],cl.col[1],cl.col[2],230);
      p.ellipse(w*cl.cx+sway*0.5,h*cl.cy,cl.r*w,cl.r*w*0.88);
    });
    // Bright highlights
    p.fill(255,230,240,180);
    p.ellipse(w*0.44+sway,h*0.10,w*0.24,w*0.2);
    p.ellipse(w*0.62+sway,h*0.14,w*0.18,w*0.16);
    // Glow
    p.fill(255,180,200,40);
    p.ellipse(w*0.5+sway,h*0.22,w*1.1,w*0.9);
    // Fallen petals
    p.fill(255,182,200,180);
    for(let i=0;i<5;i++){
      p.ellipse(
        w*(0.15+i*0.17)+Math.sin(seed*8+i*t*0.05)*4,
        h*0.92+Math.cos(i)*3, 6,3
      );
    }
  }

  // ── Forest obstacle: Rock ──────────────────────────────────

  function _drawRock(p,w,h,seed){
    p.noStroke();
    p.fill(100,95,88);
    p.beginShape();
    p.vertex(w*0.1,h); p.vertex(0,h*0.5); p.vertex(w*0.15,h*0.1);
    p.vertex(w*0.45,0); p.vertex(w*0.8,h*0.05);
    p.vertex(w,h*0.35); p.vertex(w*0.9,h);
    p.endShape(p.CLOSE);
    if(seed>0.5){
      p.fill(88,84,78);
      p.beginShape();
      p.vertex(w*0.55,h); p.vertex(w*0.5,h*0.55);
      p.vertex(w*0.65,h*0.35); p.vertex(w*0.9,h*0.4);
      p.vertex(w,h*0.65); p.vertex(w*0.95,h);
      p.endShape(p.CLOSE);
    }
    p.fill(130,125,118,160);
    p.beginShape();
    p.vertex(w*0.2,h*0.15); p.vertex(w*0.45,h*0.05);
    p.vertex(w*0.7,h*0.15); p.vertex(w*0.5,h*0.3);
    p.endShape(p.CLOSE);
    p.fill(40,80,30,140); p.ellipse(w*0.3,h*0.25,w*0.25,h*0.15);
    p.stroke(70,65,60,180); p.strokeWeight(1.5);
    p.line(w*0.4,h*0.1,w*0.35,h*0.45);
    p.noStroke();
  }

  // ── Forest obstacle: Log ───────────────────────────────────

  function _drawLog(p,w,h,t){
    p.noStroke();
    p.fill(100,62,22); p.rect(0,h*0.3,w,h*0.55,6);
    p.fill(85,50,16); p.ellipse(w*0.08,h*0.57,h*0.55,h*0.55);
    p.noFill(); p.stroke(110,68,25); p.strokeWeight(1.5);
    p.ellipse(w*0.08,h*0.57,h*0.35,h*0.35);
    p.ellipse(w*0.08,h*0.57,h*0.18,h*0.18);
    p.noStroke();
    p.stroke(80,48,15,160); p.strokeWeight(1);
    for(let i=0;i<4;i++) p.line(w*0.25+i*w*0.18,h*0.3,w*0.22+i*w*0.18,h*0.85);
    p.noStroke();
    p.fill(50,110,30); p.ellipse(w*0.5,h*0.3,w*0.6,8);
    p.fill(35,90,20);
    for(let i=0;i<6;i++){
      const gx=w*0.22+i*w*0.11;
      p.triangle(gx,h*0.3,gx-4,h*0.14,gx+4,h*0.14);
    }
  }

  // ── Forest obstacle: Bush ──────────────────────────────────

  function _drawBush(p,w,h,t){
    const sway=Math.sin(t*0.6)*1.5;
    p.noStroke();
    p.fill(25,75,18); p.ellipse(w*0.2+sway*0.3,h*0.55,w*0.5,h*0.7);
    p.ellipse(w*0.75+sway*0.3,h*0.6,w*0.45,h*0.6);
    p.fill(38,100,28); p.ellipse(w*0.5+sway,h*0.45,w*0.7,h*0.8);
    p.ellipse(w*0.2+sway*0.5,h*0.55,w*0.5,h*0.65);
    p.ellipse(w*0.8+sway*0.5,h*0.55,w*0.45,h*0.6);
    p.fill(52,128,35); p.ellipse(w*0.45+sway*1.2,h*0.4,w*0.5,h*0.6);
    p.fill(180,30,30);
    p.ellipse(w*0.3+sway,h*0.38,6,6);
    p.ellipse(w*0.6+sway,h*0.32,5,5);
    p.ellipse(w*0.5+sway,h*0.5,5,5);
  }

  // ── Forest obstacle: Pothole ───────────────────────────────

  function _drawPothole(p,w,h,t){
    p.noStroke();
    // Dark hole
    p.fill(8,15,8);
    p.ellipse(w/2,h*0.6,w,h*1.1);
    p.fill(3,6,3);
    p.ellipse(w/2,h*0.65,w*0.72,h*0.75);
    // Rocky rim
    p.fill(35,55,25);
    p.beginShape();
    p.vertex(0,h*0.4); p.vertex(w*0.08,h*0.1);
    p.vertex(w*0.22,h*0.05); p.vertex(w*0.3,h*0.25);
    p.vertex(w*0.15,h*0.45);
    p.endShape(p.CLOSE);
    p.beginShape();
    p.vertex(w,h*0.4); p.vertex(w*0.92,h*0.1);
    p.vertex(w*0.78,h*0.05); p.vertex(w*0.7,h*0.25);
    p.vertex(w*0.85,h*0.45);
    p.endShape(p.CLOSE);
    p.beginShape();
    p.vertex(w*0.25,0); p.vertex(w*0.5,h*0.05);
    p.vertex(w*0.75,0); p.vertex(w*0.65,h*0.22);
    p.vertex(w*0.35,h*0.22);
    p.endShape(p.CLOSE);
    // Rim highlight
    p.fill(55,88,40,180);
    p.ellipse(w*0.3,h*0.15,w*0.18,h*0.12);
    p.ellipse(w*0.72,h*0.12,w*0.14,h*0.10);
    // Danger glow
    const glow=0.5+0.5*Math.sin(t*2);
    p.fill(180,160,20,glow*60);
    p.ellipse(w/2,h*0.4,w*1.1,h*0.5);
    // Small rocks
    p.fill(42,68,30);
    p.ellipse(w*0.08,h*0.75,10,6);
    p.ellipse(w*0.88,h*0.72,8,5);
    p.ellipse(w*0.5,h*0.06,7,5);
  }

  // ── Countryside obstacles ──────────────────────────────────

  function _drawDog(p,w,h,t){
    p.noStroke();
    p.fill(160,110,60); p.rect(-w/2,-h/2+6,w,h-10,8);
    p.fill(150,100,55); p.ellipse(w/2-2,-h/2+2,w*0.45,w*0.42);
    p.fill(130,85,40); p.ellipse(w/2+4,-h/2-4,12,16);
    p.fill(30); p.ellipse(w/2+4,-h/2,5,5);
    p.fill(255,255,255,200); p.ellipse(w/2+5,-h/2-1,2,2);
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
    p.fill(255,255,255,180); p.ellipse(w/2+9,-h/2-3,2,2);
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
    p.fill(255,255,255,200); p.ellipse(w/2-1,-h/2+3,2,2);
    p.stroke(90,90,100); p.strokeWeight(4); p.noFill();
    const tc=Math.sin(t)*10;
    p.beginShape();
    p.curveVertex(-w/2+2,h/2-4); p.curveVertex(-w/2-8,0);
    p.curveVertex(-w/2-14,-h/4+tc); p.curveVertex(-w/2-8,-h/2+tc);
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
    p.fill(255,255,255,180); p.ellipse(w/2+5,-h/2+6+hb,2,2);
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
    for(const wx of[-w/2+wr+4,w/2-wr-4]){
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
    p.stroke(255,220,50); p.strokeWeight(5);
    p.line(-w/2+8,-h/2+2,w/2-8,-h/2+2);
    p.stroke(80,50,20); p.strokeWeight(3);
    p.line(-w/2+wr+4,wy,w/2-wr-4,wy);
    p.stroke(100,65,25); p.strokeWeight(4);
    p.line(w/2-6,-h/2+12,w/2+22,-h/2+20);
    p.line(w/2-6,h/2-wr-4,w/2+22,h/2-wr);
    p.noStroke();
  }

  // ── Particles ──────────────────────────────────────────────

  function _drawDust(p,d){
    p.noStroke(); p.fill(d.rgb[0],d.rgb[1],d.rgb[2],d.life*100);
    p.ellipse(d.x,d.y,d.size*d.life,d.size*d.life*0.5);
  }

  function _drawParticle(p,pt){
    p.noStroke(); p.fill(pt.rgb[0],pt.rgb[1],pt.rgb[2],pt.life*220);
    p.ellipse(pt.x,pt.y,pt.size*pt.life,pt.size*pt.life);
  }

  // ── UI ─────────────────────────────────────────────────────

  function _drawUI(p){
    switch(gameState){
      case "start":   _drawStart(p);              break;
      case "playing": _drawHUD(p);                break;
      case "paused":  _drawHUD(p); _drawPause(p); break;
      case "dead":    _drawHUD(p); _drawDead(p);  break;
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

    const th=THEMES[themeIndex];
    const timeLeft=Math.max(0,GCFG_GAME.THEME_CHANGE_SEC-themeTimer);
    p.textAlign(p.CENTER,p.TOP);
    p.fill(th.name==="FOREST"?p.color(160,100,220):p.color(200,140,40));
    p.textSize(10);
    p.text(th.name+" → "+(themeIndex===0?"COUNTRYSIDE":"FOREST")+" in "+timeLeft.toFixed(0)+"s",p.width/2,16);
    const barW=140,barH=4,barX=p.width/2-barW/2,barY=30;
    p.fill(0,0,0,60); p.rect(barX,barY,barW,barH,2);
    const prog=Math.min(themeTimer/GCFG_GAME.THEME_CHANGE_SEC,1);
    p.fill(th.name==="FOREST"?p.color(160,100,220):p.color(200,140,40));
    p.rect(barX,barY,barW*prog,barH,2);

    const g=GestureEngine.state.gesture;
    const MAP={swipe_up:"↑ JUMP",JUMP:"↑ JUMP",DASH:"→ DASH",
               swipe_right:"→ DASH",open_palm:"✋ START",
               PAUSE:"⏸ PAUSE",RESUME:"▶ GO"};
    const lbl=MAP[g]||"·";
    const pw=130,ph=26,px2=p.width/2-65,py=p.height-46;
    p.fill(0,0,0,80); p.rect(px2,py,pw,ph,13);
    p.fill(g==="JUMP"||g==="swipe_up"?p.color(60,180,60):p.color(100,80,30));
    p.textSize(12); p.textAlign(p.CENTER,p.CENTER);
    p.textFont("Rajdhani, monospace");
    p.text(lbl,p.width/2,py+ph/2+1);
    if(window._pendingLoad){
      p.fill(80,50,20,210); p.textSize(12);
      p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER,p.CENTER);
      p.text(window._pendingLoad,p.width/2,p.height-26);
    }
  }

  function _drawStart(p){
    p.fill(0,0,0,80); p.rect(0,0,p.width,p.height);
    const cy=p.height*0.26, pulse=Math.sin(titleT);
    p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER,p.CENTER);
    p.fill(p.lerpColor(p.color(180,120,30),p.color(240,190,60),(pulse+1)/2));
    p.textSize(70); p.text("HORSE",p.width/2,cy);
    p.fill(80,160,50); p.text("RUNNER",p.width/2,cy+72);
    p.fill(200,180,220,200); p.textSize(13); p.textFont("Rajdhani, monospace");
    p.text("🌸 FOREST  →  🏡 COUNTRYSIDE  ·  THEME CHANGES EVERY 30s",p.width/2,cy+128);
    p.fill(200,185,150,180); p.textSize(13);
    p.text("↑ SWIPE UP = JUMP  ·  → SWIPE RIGHT = DASH",p.width/2,cy+152);
    p.text("✋✋ TWO PALMS = PAUSE  ·  ✊✊ TWO FISTS = RESUME",p.width/2,cy+172);
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
    p.noStroke(); p.fill(220,180,80);
    p.textSize(20); p.textAlign(p.CENTER,p.CENTER);
    p.text("✋",p.width/2,y);
    p.fill(200,180,140,220); p.textSize(11);
    p.textFont("Orbitron, monospace");
    p.text("HOLD OPEN PALM TO START",p.width/2,y+46);
    p.fill(160,150,120,160); p.textSize(10);
    p.text("( or press SPACE / ENTER )",p.width/2,y+62);
  }

  function _drawPause(p){
    p.fill(0,0,0,130); p.rect(0,0,p.width,p.height);
    p.fill(220,180,60); p.textSize(56);
    p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER,p.CENTER);
    p.text("PAUSED ⏸",p.width/2,p.height/2-20);
    p.fill(180,160,120,200); p.textSize(13); p.textFont("Rajdhani, monospace");
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
    p.fill(200,160,60); p.textSize(24);
    p.text("SCORE  "+_pad(score,6),p.width/2,p.height*0.36+80);
    p.fill(160,130,80,200); p.textSize(14);
    p.text("BEST   "+_pad(hiScore,6),p.width/2,p.height*0.36+114);
    const elapsed=performance.now()-deathTime;
    const rem=Math.max(0,GCFG_GAME.AUTO_RESTART_MS-elapsed);
    const pct=1-rem/GCFG_GAME.AUTO_RESTART_MS;
    p.fill(160,140,100,200); p.textSize(12); p.textFont("Rajdhani, monospace");
    p.text("RESTARTING IN "+(rem/1000).toFixed(1)+"s …",p.width/2,p.height*0.36+155);
    const bx=p.width/2-100, by=p.height*0.36+172;
    p.fill(60,40,10,120); p.rect(bx,by,200,8,4);
    p.fill(200,160,50); p.rect(bx,by,200*pct,8,4);
  }

  function _pad(n,len){ return String(Math.floor(n)).padStart(len,"0"); }

  function _lerpHex(a,b,t){
    const ah=a.replace("#",""), bh=b.replace("#","");
    const ar=parseInt(ah.slice(0,2),16),ag=parseInt(ah.slice(2,4),16),ab=parseInt(ah.slice(4,6),16);
    const br=parseInt(bh.slice(0,2),16),bg=parseInt(bh.slice(2,4),16),bb=parseInt(bh.slice(4,6),16);
    return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
  }

  return {init,resize,update,draw,handleGesture,getState};
})();
