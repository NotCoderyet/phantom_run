/* ============================================================
   game.js — HORSE RUNNER — Game Logic, Physics, Obstacles
   ============================================================
   Player: a galloping horse (drawn with p5 shapes)
   Obstacles: dog, goat, cat, chicken, cart (at different heights)
   - Ground animals: horse must JUMP over them
   - Cart: horse can JUMP onto it (acts as a platform)
   - Auto-restart 1 second after death
*/
"use strict";

const GCFG_GAME = {
  GRAVITY:           0.65,
  JUMP_FORCE:       -15.0,
  DUCK_DURATION:     500,
  DASH_DURATION:     500,
  DASH_SPEED_BONUS:  4.0,
  GROUND_Y_RATIO:    0.78,
  PLAYER_X_RATIO:    0.15,
  PLAYER_W:          70,
  PLAYER_H:          60,
  PLAYER_DUCK_H:     34,
  BASE_SPEED:        4.5,
  MAX_SPEED:         16.0,
  SPEED_INC:         0.0006,
  OBS_MIN_GAP:       480,
  OBS_MAX_GAP:       820,
  SHAKE_FRAMES:      10,
  DEATH_PARTICLES:   30,
  AUTO_RESTART_MS:   1200,   // ms after death before auto-restart
};

// ── Particle ──────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, rgb) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 10;
    this.vy = (Math.random() - 1.8) * 7;
    this.life  = 1.0;
    this.decay = 0.02 + Math.random() * 0.025;
    this.size  = 4 + Math.random() * 7;
    this.rgb   = rgb || [255, 180, 70];
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.32;
    this.life -= this.decay;
  }
  get alive() { return this.life > 0; }
}

// ── Dust puff particle ────────────────────────────────────────────────────────
class Dust {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = -1 - Math.random() * 2;
    this.vy = -Math.random() * 1.5;
    this.life  = 1.0;
    this.decay = 0.04 + Math.random() * 0.03;
    this.size  = 5 + Math.random() * 8;
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.05;
    this.life -= this.decay;
  }
  get alive() { return this.life > 0; }
}

// ── Obstacle types ────────────────────────────────────────────────────────────
// type: "dog" | "goat" | "cat" | "chicken" | "cart"
class Obstacle {
  constructor(x, groundY, type) {
    this.type    = type;
    this.groundY = groundY;
    this.passed  = false;
    this.animT   = Math.random() * Math.PI * 2; // random anim offset

    switch (type) {
      case "dog":
        this.w = 52; this.h = 38;
        break;
      case "goat":
        this.w = 50; this.h = 56;
        break;
      case "cat":
        this.w = 36; this.h = 32;
        break;
      case "chicken":
        this.w = 28; this.h = 36;
        break;
      case "cart":
        this.w = 80; this.h = 50;
        break;
      default:
        this.w = 40; this.h = 40;
    }
    this.x = x;
    this.y = groundY - this.h;
  }

  move(speed) { this.x -= speed; this.animT += 0.12; }
  get offscreen() { return this.x + this.w < 0; }

  // Cart top surface y (for landing on it)
  get cartTopY() { return this.y; }
}

// ── Horse Player ──────────────────────────────────────────────────────────────
class Player {
  constructor(x, groundY) {
    this.groundY  = groundY;
    this.x        = x;
    this.y        = groundY - GCFG_GAME.PLAYER_H;
    this.vy       = 0;
    this.grounded = true;
    this.ducking  = false;
    this.dashing  = false;
    this.duckTimer = 0;
    this.dashTimer = 0;
    this.jumpCount = 0;
    this.scaleX   = 1.0;
    this.scaleY   = 1.0;
    this.legPhase = 0;       // gallop animation
    this.onCart   = false;   // is horse standing on a cart?
    this.cartY    = 0;       // y of cart top if on cart
  }

  get w()       { return GCFG_GAME.PLAYER_W; }
  get h()       { return this.ducking ? GCFG_GAME.PLAYER_DUCK_H : GCFG_GAME.PLAYER_H; }
  get hitboxY() { return this.ducking ? this.groundY - GCFG_GAME.PLAYER_DUCK_H : this.y; }
  get floorY()  { return this.onCart ? this.cartY : this.groundY; }

  jump() {
    if (this.jumpCount >= 2) return;
    this.vy = GCFG_GAME.JUMP_FORCE;
    this.grounded = false;
    this.onCart   = false;
    this.jumpCount++;
    this.scaleY = 0.6; this.scaleX = 1.4;
    if (this.ducking) { this.ducking = false; this.duckTimer = 0; }
  }

  duck() {
    if (!this.grounded) return;
    this.ducking  = true;
    this.duckTimer = GCFG_GAME.DUCK_DURATION;
  }

  dash() {
    this.dashing  = true;
    this.dashTimer = GCFG_GAME.DASH_DURATION;
  }

  update(dt, obstacles) {
    if (this.ducking) {
      this.duckTimer -= dt;
      if (this.duckTimer <= 0) { this.ducking = false; this.duckTimer = 0; }
    }
    if (this.dashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) { this.dashing = false; this.dashTimer = 0; }
    }

    // Gravity
    if (!this.grounded) {
      this.vy += GCFG_GAME.GRAVITY;
      this.y  += this.vy;

      // Check landing on cart tops
      this.onCart = false;
      for (const o of obstacles) {
        if (o.type === "cart") {
          const onTopX = this.x + this.w * 0.3 > o.x && this.x + this.w * 0.7 < o.x + o.w;
          const falling = this.vy >= 0;
          const nearTop = this.y + this.h >= o.cartTopY - 5 && this.y + this.h <= o.cartTopY + 20;
          if (onTopX && falling && nearTop) {
            this.y        = o.cartTopY - GCFG_GAME.PLAYER_H;
            this.vy       = 0;
            this.grounded = true;
            this.onCart   = true;
            this.cartY    = o.cartTopY;
            this.jumpCount = 0;
            this.scaleY   = 1.35; this.scaleX = 0.7;
          }
        }
      }

      // Land on ground
      const floor = this.groundY - GCFG_GAME.PLAYER_H;
      if (!this.onCart && this.y >= floor) {
        this.y        = floor;
        this.vy       = 0;
        this.grounded = true;
        this.jumpCount = 0;
        this.scaleY   = 1.4; this.scaleX = 0.65;
      }
    } else {
      // Stay on ground or cart
      if (this.onCart) {
        // If cart moves out from under horse, fall
        let stillOnCart = false;
        for (const o of obstacles) {
          if (o.type === "cart") {
            if (this.x + this.w * 0.3 > o.x && this.x + this.w * 0.7 < o.x + o.w) {
              this.y     = o.cartTopY - GCFG_GAME.PLAYER_H;
              this.cartY = o.cartTopY;
              stillOnCart = true;
            }
          }
        }
        if (!stillOnCart) {
          this.grounded = false;
          this.onCart   = false;
        }
      } else {
        this.y = this.groundY - GCFG_GAME.PLAYER_H;
      }
    }

    this.scaleX += (1 - this.scaleX) * 0.18;
    this.scaleY += (1 - this.scaleY) * 0.18;

    // Gallop animation — faster when dashing
    this.legPhase += this.dashing ? 0.45 : 0.32;
  }

  // AABB collision — generous shrink for fairness
  hits(ox, oy, ow, oh) {
    const S  = 8;
    const px = this.x + S, py = this.hitboxY + S;
    const pw = this.w - S*2, ph = this.h - S*2;
    // Carts: only collide with sides, not top (horse can jump on)
    return (px < ox + ow - S && px + pw > ox + S &&
            py < oy + oh - S && py + ph > oy + S);
  }
}

// ── Game singleton ────────────────────────────────────────────────────────────
window.Game = (function () {

  let _p        = null;
  let player    = null;
  let obstacles = [];
  let particles = [];
  let dusts     = [];
  let score     = 0;
  let hiScore   = 0;
  let speed     = GCFG_GAME.BASE_SPEED;
  let gameState = "start";
  let groundY   = 0;
  let shakeFrames   = 0;
  let totalFrames   = 0;
  let deathTime     = 0;       // timestamp of death for auto-restart
  let bgLayers  = [];
  let stars     = [];
  let clouds    = [];
  let titleT    = 0;
  let sunY      = 0;

  // ── init ───────────────────────────────────────────────────────────────────
  function init(p5ref) {
    _p = p5ref;
    groundY = Math.floor(_p.height * GCFG_GAME.GROUND_Y_RATIO);
    sunY    = _p.height * 0.18;
    _buildBg();
    _resetRound();
  }

  function resize() {
    groundY = Math.floor(_p.height * GCFG_GAME.GROUND_Y_RATIO);
    sunY    = _p.height * 0.18;
    if (player) player.groundY = groundY;
    _buildBg();
  }

  function handleGesture(g) {
    switch (g) {
      case "JUMP":  if (gameState === "playing") player.jump(); break;
      case "DUCK":  if (gameState === "playing") player.duck(); break;
      case "DASH":  if (gameState === "playing") player.dash(); break;
      case "START": if (gameState === "start" || gameState === "dead") _startRound(); break;
      case "PAUSE":  if (gameState === "playing") gameState = "paused"; break;
      case "RESUME": if (gameState === "paused")  gameState = "playing"; break;
    }
  }

  function update(dt) {
    titleT += 0.022;

    // Auto-restart 1 second after death
    if (gameState === "dead" && deathTime > 0 && performance.now() - deathTime > GCFG_GAME.AUTO_RESTART_MS) {
      _startRound();
      return;
    }

    if (gameState !== "playing") return;
    totalFrames++;
    score++;
    speed = Math.min(GCFG_GAME.MAX_SPEED, GCFG_GAME.BASE_SPEED + score * GCFG_GAME.SPEED_INC);
    const effSpeed = speed + (player.dashing ? GCFG_GAME.DASH_SPEED_BONUS : 0);

    player.update(dt * 1000, obstacles);

    _spawnIfNeeded();

    // Move obstacles, check collision (skip cart tops — player can land on those)
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.move(effSpeed);
      if (!o.passed && o.x + o.w < player.x) o.passed = true;

      // Collision — but not if horse is ON TOP of a cart
      if (o.type === "cart" && player.onCart) continue;
      if (player.hits(o.x, o.y, o.w, o.h)) {
        _die();
        break;
      }
      if (o.offscreen) obstacles.splice(i, 1);
    }

    // Dust puffs when galloping on ground
    if (player.grounded && !player.ducking && totalFrames % 6 === 0) {
      dusts.push(new Dust(player.x + 5, groundY));
    }

    // Dash trail
    if (player.dashing && totalFrames % 3 === 0) {
      particles.push(new Particle(player.x, player.y + player.h * 0.5, [255, 200, 80]));
    }

    particles = particles.filter(p => { p.update(); return p.alive; });
    dusts     = dusts.filter(d => { d.update(); return d.alive; });

    // Scroll clouds
    clouds.forEach(c => {
      c.x -= c.spd * (effSpeed / GCFG_GAME.BASE_SPEED);
      if (c.x + c.w < 0) {
        c.x = _p.width + Math.random() * 200;
        c.y = Math.random() * groundY * 0.5;
      }
    });

    // Scroll bg layers
    bgLayers.forEach(L => {
      L.offset = (L.offset + L.speed * effSpeed) % _p.width;
    });

    if (shakeFrames > 0) shakeFrames--;
  }

  function draw() {
    const p = _p;
    let sx = 0, sy = 0;
    if (shakeFrames > 0) { sx = (Math.random()-0.5)*10; sy = (Math.random()-0.5)*8; }
    p.push();
    p.translate(sx, sy);

    _drawSky(p);
    _drawSun(p);
    _drawClouds(p);
    _drawBgLayers(p);
    _drawGround(p);
    dusts.forEach(d => _drawDust(p, d));
    obstacles.forEach(o => _drawObstacle(p, o));
    if (player) _drawHorse(p, player);
    particles.forEach(pt => _drawParticle(p, pt));

    p.pop();
    _drawUI(p);
  }

  function getState() { return gameState; }

  // ── Private ────────────────────────────────────────────────────────────────
  function _buildBg() {
    const W = _p.width;

    // Rolling hills layers
    bgLayers = [
      { speed: 0.1, alpha: 0.7, yBase: 0.72, amp: 0.12, freq: 0.004, seed: 10, offset: 0 },
      { speed: 0.2, alpha: 0.85, yBase: 0.77, amp: 0.08, freq: 0.007, seed: 40, offset: 0 },
    ].map(L => {
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const t  = i / 120;
        const xf = t * W * 2;
        const ny = Math.sin(xf * L.freq + L.seed) * 0.6
                 + Math.sin(xf * L.freq * 2.5 + L.seed) * 0.4;
        pts.push({ x: xf, ny });
      }
      return { ...L, pts };
    });

    // Stars (visible at dusk sky)
    stars = [];
    for (let i = 0; i < 60; i++) {
      stars.push({ x: Math.random()*W, y: Math.random()*_p.height*0.4,
                   r: Math.random()*1.2+0.3, bri: Math.random() });
    }

    // Clouds
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x:   Math.random() * W,
        y:   30 + Math.random() * groundY * 0.38,
        w:   80 + Math.random() * 120,
        h:   28 + Math.random() * 30,
        spd: 0.3 + Math.random() * 0.4,
      });
    }
  }

  function _resetRound() {
    player    = new Player(Math.floor(_p.width * GCFG_GAME.PLAYER_X_RATIO), groundY);
    obstacles = [];
    particles = [];
    dusts     = [];
    score     = 0;
    speed     = GCFG_GAME.BASE_SPEED;
    shakeFrames   = 0;
    totalFrames   = 0;
    deathTime     = 0;
  }

  function _startRound() {
    hiScore   = Math.max(hiScore, score);
    _resetRound();
    gameState = "playing";
  }

  function _die() {
    gameState = "dead";
    hiScore   = Math.max(hiScore, score);
    shakeFrames = GCFG_GAME.SHAKE_FRAMES;
    deathTime   = performance.now();
    const cx = player.x + player.w / 2;
    const cy = player.hitboxY + player.h / 2;
    for (let i = 0; i < GCFG_GAME.DEATH_PARTICLES; i++) {
      particles.push(new Particle(cx, cy, [220, 140, 60]));
      particles.push(new Particle(cx, cy, [255, 220, 100]));
    }
  }

  function _spawnIfNeeded() {
    let rightEdge = _p.width;
    obstacles.forEach(o => { if (o.x + o.w > rightEdge) rightEdge = o.x + o.w; });
    if (rightEdge < _p.width + GCFG_GAME.OBS_MIN_GAP) return;

    const gap    = GCFG_GAME.OBS_MIN_GAP + Math.random() * (GCFG_GAME.OBS_MAX_GAP - GCFG_GAME.OBS_MIN_GAP);
    const spawnX = _p.width + gap * 0.2;
    const types  = ["dog", "goat", "cat", "chicken", "cart"];

    // Weighted — cart less common
    const weights = [25, 20, 25, 20, 10];
    const type = _weightedRandom(types, weights);
    obstacles.push(new Obstacle(spawnX, groundY, type));

    // Sometimes a second small animal after a cart
    if (type === "cart" && Math.random() < 0.4) {
      const small = ["dog","cat","chicken"][Math.floor(Math.random()*3)];
      obstacles.push(new Obstacle(spawnX + 110 + Math.random()*60, groundY, small));
    }
    // Sometimes two animals close together (not cart)
    if (type !== "cart" && Math.random() < 0.3) {
      const t2 = ["dog","cat","chicken","goat"][Math.floor(Math.random()*4)];
      obstacles.push(new Obstacle(spawnX + 60 + Math.random()*50, groundY, t2));
    }
  }

  function _weightedRandom(arr, weights) {
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total;
    for (let i=0; i<arr.length; i++) { r -= weights[i]; if (r<=0) return arr[i]; }
    return arr[arr.length-1];
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  function _drawSky(p) {
    // Warm daytime sky — golden horizon (countryside feel)
    const ctx = p.drawingContext;
    const g   = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0,   "#87CEEB"); // sky blue
    g.addColorStop(0.6, "#FDD09A"); // warm golden horizon
    g.addColorStop(1,   "#F4A460"); // sandy dusk
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, p.width, groundY);
  }

  function _drawSun(p) {
    const sx = p.width * 0.82;
    const sy = sunY;
    p.noStroke();
    // Glow
    for (let r = 60; r > 0; r -= 10) {
      p.fill(255, 220, 100, 18);
      p.ellipse(sx, sy, r*2, r*2);
    }
    p.fill(255, 240, 80);
    p.ellipse(sx, sy, 50, 50);
    p.fill(255, 255, 200);
    p.ellipse(sx, sy, 30, 30);
  }

  function _drawClouds(p) {
    p.noStroke();
    clouds.forEach(c => {
      p.fill(255, 255, 255, 200);
      p.ellipse(c.x, c.y, c.w, c.h);
      p.ellipse(c.x + c.w*0.25, c.y - c.h*0.25, c.w*0.6, c.h*0.7);
      p.ellipse(c.x - c.w*0.2,  c.y - c.h*0.15, c.w*0.5, c.h*0.6);
    });
  }

  function _drawBgLayers(p) {
    // Rolling green hills
    const hillCols = ["#5a8a3c", "#4a7a2c"];
    bgLayers.forEach((L, li) => {
      p.fill(hillCols[li] || "#4a7a2c");
      p.noStroke();
      for (let rep = -1; rep <= 1; rep++) {
        const baseX = -L.offset + rep * p.width;
        p.beginShape();
        p.vertex(baseX, groundY);
        L.pts.forEach(pt => {
          const sx = baseX + pt.x * 0.5;
          const sy = groundY - L.amp * p.height - pt.ny * L.amp * p.height * 0.5;
          p.vertex(sx, sy);
        });
        p.vertex(baseX + p.width, groundY);
        p.endShape(p.CLOSE);
      }
    });
  }

  function _drawGround(p) {
    // Ground — grassy brown
    p.noStroke();
    p.fill(139, 100, 50);
    p.rect(0, groundY, p.width, p.height - groundY);

    // Grass strip
    p.fill(80, 150, 50);
    p.rect(0, groundY, p.width, 10);

    // Ground line
    p.stroke(60, 120, 30);
    p.strokeWeight(2);
    p.line(0, groundY, p.width, groundY);
    p.noStroke();

    // Scrolling dirt marks
    const gOff = (totalFrames * speed * 0.3) % 90;
    p.fill(120, 85, 40, 80);
    for (let x = -gOff; x < p.width; x += 90) {
      p.ellipse(x + 30, groundY + 8, 18, 5);
    }
  }

  // ── Horse drawing ──────────────────────────────────────────────────────────
  function _drawHorse(p, horse) {
    const cx = horse.x + horse.w / 2;
    const cy = horse.hitboxY + horse.h / 2;

    p.push();
    p.translate(cx, cy);
    p.scale(horse.scaleX, horse.scaleY);

    const leg = Math.sin(horse.legPhase);
    const leg2 = Math.sin(horse.legPhase + Math.PI);
    const bodyW = 52, bodyH = 28;

    // Shadow
    p.noStroke();
    p.fill(0, 0, 0, 30);
    p.ellipse(0, bodyH * 0.5 + 4, bodyW * 0.9, 10);

    // Dash glow
    if (horse.dashing) {
      p.fill(255, 200, 50, 60);
      for (let t = 1; t <= 3; t++) {
        p.rect(-bodyW/2 - t*18, -bodyH/2, bodyW, bodyH, 6);
      }
    }

    // Tail (wavy)
    const tailWag = Math.sin(horse.legPhase * 0.7) * 8;
    p.stroke(80, 50, 20); p.strokeWeight(4); p.noFill();
    p.beginShape();
    p.curveVertex(-bodyW/2 - 5, -5);
    p.curveVertex(-bodyW/2 - 10, 0 + tailWag);
    p.curveVertex(-bodyW/2 - 18, 8 + tailWag);
    p.curveVertex(-bodyW/2 - 14, 16 + tailWag);
    p.endShape();
    p.noStroke();

    // Body
    p.fill(horse.dashing ? 200 : 180, 130, 70);
    p.rect(-bodyW/2, -bodyH/2, bodyW, bodyH, 10);

    // Neck
    p.fill(175, 125, 65);
    p.beginShape();
    p.vertex(bodyW/2 - 10, -bodyH/2);
    p.vertex(bodyW/2 + 10, -bodyH/2 - 18);
    p.vertex(bodyW/2 + 22, -bodyH/2 - 14);
    p.vertex(bodyW/2 + 8,  -bodyH/2 + 4);
    p.endShape(p.CLOSE);

    // Head
    p.fill(180, 130, 70);
    p.ellipse(bodyW/2 + 20, -bodyH/2 - 18, 26, 20);

    // Eye
    p.fill(30);
    p.ellipse(bodyW/2 + 26, -bodyH/2 - 20, 5, 5);
    p.fill(255);
    p.ellipse(bodyW/2 + 27, -bodyH/2 - 21, 2, 2);

    // Nostril
    p.fill(140, 90, 50);
    p.ellipse(bodyW/2 + 30, -bodyH/2 - 15, 4, 3);

    // Mane
    p.fill(80, 50, 20);
    for (let i = 0; i < 4; i++) {
      const maneWag = Math.sin(horse.legPhase + i) * 3;
      p.ellipse(bodyW/2 + 8 - i*5, -bodyH/2 - 10 + maneWag, 8, 14);
    }

    // Ear
    p.fill(190, 140, 80);
    p.triangle(bodyW/2+14, -bodyH/2-26, bodyW/2+10, -bodyH/2-34, bodyW/2+20, -bodyH/2-30);

    // Legs (4 legs, animated gallop)
    p.stroke(150, 100, 55); p.strokeWeight(6);
    p.strokeCap(p.ROUND);
    const legH = horse.ducking ? 10 : 22;

    if (!horse.ducking) {
      // Front legs
      p.line(bodyW/2 - 8,  bodyH/2, bodyW/2 - 10 + leg*8,  bodyH/2 + legH);
      p.line(bodyW/2 - 18, bodyH/2, bodyW/2 - 20 + leg2*8, bodyH/2 + legH);
      // Back legs
      p.line(-bodyW/2 + 10, bodyH/2, -bodyW/2 + 8 + leg2*8,  bodyH/2 + legH);
      p.line(-bodyW/2 + 20, bodyH/2, -bodyW/2 + 18 + leg*8,  bodyH/2 + legH);
    } else {
      // Ducking — legs bent flat
      p.line(bodyW/2 - 10, bodyH/2, bodyW/2, bodyH/2 + 10);
      p.line(-bodyW/2+10, bodyH/2, -bodyW/2, bodyH/2 + 10);
    }

    // Hooves
    p.noStroke();
    p.fill(60, 40, 20);
    if (!horse.ducking) {
      p.ellipse(bodyW/2 - 10 + leg*8,  bodyH/2 + legH + 3, 10, 6);
      p.ellipse(bodyW/2 - 20 + leg2*8, bodyH/2 + legH + 3, 10, 6);
      p.ellipse(-bodyW/2 + 8 + leg2*8, bodyH/2 + legH + 3, 10, 6);
      p.ellipse(-bodyW/2 + 18 + leg*8, bodyH/2 + legH + 3, 10, 6);
    }

    p.pop();
  }

  // ── Animal / Cart obstacle drawing ─────────────────────────────────────────
  function _drawObstacle(p, o) {
    p.push();
    p.translate(o.x, o.y);
    const bob = Math.sin(o.animT) * 1.5;
    p.translate(o.w/2, o.h/2 + bob);

    switch (o.type) {
      case "dog":      _drawDog(p, o.w, o.h, o.animT);     break;
      case "goat":     _drawGoat(p, o.w, o.h, o.animT);    break;
      case "cat":      _drawCat(p, o.w, o.h, o.animT);     break;
      case "chicken":  _drawChicken(p, o.w, o.h, o.animT); break;
      case "cart":     _drawCart(p, o.w, o.h, o.animT);    break;
    }

    p.pop();
  }

  function _drawDog(p, w, h, t) {
    p.noStroke();
    // Body
    p.fill(160, 110, 60);
    p.rect(-w/2, -h/2+6, w, h-10, 8);
    // Head
    p.fill(150, 100, 55);
    p.ellipse(w/2-2, -h/2+2, w*0.45, w*0.42);
    // Ear
    p.fill(130, 85, 40);
    p.ellipse(w/2+4, -h/2-4, 12, 16);
    // Eye
    p.fill(30);
    p.ellipse(w/2+4, -h/2, 5, 5);
    // Snout
    p.fill(200, 150, 110);
    p.ellipse(w/2+10, -h/2+4, 10, 7);
    p.fill(60,30,10);
    p.ellipse(w/2+13, -h/2+3, 4, 3);
    // Tail wag
    p.stroke(140, 95, 50); p.strokeWeight(4); p.noFill();
    const wag = Math.sin(t*2)*15;
    p.line(-w/2, -h/2+10, -w/2-10, -h/2+10-wag);
    // Legs
    p.stroke(140, 95, 50); p.strokeWeight(5);
    const lk = Math.sin(t)*4;
    p.line(-w/2+8,  h/2-4, -w/2+8+lk,  h/2+8);
    p.line(-w/2+18, h/2-4, -w/2+18-lk, h/2+8);
    p.line(w/2-8,   h/2-4, w/2-8-lk,   h/2+8);
    p.line(w/2-18,  h/2-4, w/2-18+lk,  h/2+8);
    p.noStroke();
  }

  function _drawGoat(p, w, h, t) {
    p.noStroke();
    // Body
    p.fill(200, 195, 185);
    p.rect(-w/2, -h/2+8, w, h-14, 8);
    // Head
    p.fill(195, 188, 178);
    p.ellipse(w/2+2, -h/2, w*0.38, w*0.40);
    // Horns
    p.fill(180, 160, 100);
    p.triangle(w/2-2, -h/2-8, w/2+4, -h/2-20, w/2+8, -h/2-6);
    p.triangle(w/2+6, -h/2-8, w/2+12,-h/2-18, w/2+14,-h/2-5);
    // Eye
    p.fill(30);
    p.ellipse(w/2+8, -h/2-2, 5, 4);
    // Beard
    p.fill(220, 215, 205);
    p.ellipse(w/2+12, -h/2+10, 8, 12);
    // Legs
    p.stroke(180,175,165); p.strokeWeight(5);
    const lk = Math.sin(t)*4;
    p.line(-w/2+8,  h/2-4, -w/2+8+lk,  h/2+10);
    p.line(-w/2+18, h/2-4, -w/2+18-lk, h/2+10);
    p.line(w/2-8,   h/2-4, w/2-8-lk,   h/2+10);
    p.line(w/2-18,  h/2-4, w/2-18+lk,  h/2+10);
    // Udder
    p.noStroke(); p.fill(240, 200, 200);
    p.ellipse(0, h/2-2, 18, 10);
    p.noStroke();
  }

  function _drawCat(p, w, h, t) {
    p.noStroke();
    // Body
    p.fill(100, 100, 110);
    p.ellipse(0, 0, w*0.8, h*0.75);
    // Head
    p.fill(105, 105, 115);
    p.ellipse(w/2-4, -h/2+6, w*0.55, w*0.52);
    // Ears
    p.fill(95, 95, 105);
    p.triangle(w/2-12, -h/2-2, w/2-6, -h/2-16, w/2-2, -h/2-2);
    p.triangle(w/2+2,  -h/2-2, w/2+8, -h/2-14, w/2+12,-h/2-2);
    // Eye
    p.fill(60, 200, 80);
    p.ellipse(w/2-2, -h/2+4, 7, 7);
    p.fill(10);
    p.ellipse(w/2-2, -h/2+4, 3, 6);
    // Tail curve
    p.stroke(90, 90, 100); p.strokeWeight(4); p.noFill();
    const tailC = Math.sin(t)*10;
    p.beginShape();
    p.curveVertex(-w/2+2, h/2-4);
    p.curveVertex(-w/2-8, 0);
    p.curveVertex(-w/2-14, -h/4+tailC);
    p.curveVertex(-w/2-8,  -h/2+tailC);
    p.endShape();
    // Stripes
    p.stroke(80, 80, 90); p.strokeWeight(1.5);
    p.line(-8, -h/4, -4, -h/4+8);
    p.line(0, -h/4+2, 4, -h/4+10);
    p.noStroke();
    // Legs
    p.fill(95, 95, 108);
    p.ellipse(-w/4, h/2-2, 10, 14);
    p.ellipse(w/4, h/2-2, 10, 14);
  }

  function _drawChicken(p, w, h, t) {
    p.noStroke();
    // Body
    p.fill(240, 235, 220);
    p.ellipse(0, 2, w*0.85, h*0.72);
    // Head bob
    const headBob = Math.sin(t*3)*3;
    p.fill(238, 232, 215);
    p.ellipse(w/2-2, -h/2+6+headBob, w*0.45, w*0.45);
    // Comb
    p.fill(220, 50, 50);
    p.ellipse(w/2-2, -h/2-2+headBob, 8, 8);
    p.ellipse(w/2+3, -h/2-4+headBob, 6, 7);
    // Beak
    p.fill(255, 180, 40);
    p.triangle(w/2+10, -h/2+8+headBob, w/2+18, -h/2+10+headBob, w/2+10, -h/2+14+headBob);
    // Eye
    p.fill(30);
    p.ellipse(w/2+4, -h/2+7+headBob, 5, 5);
    // Wattle
    p.fill(220, 60, 60);
    p.ellipse(w/2+10, -h/2+15+headBob, 7, 9);
    // Wing
    p.fill(220, 215, 195);
    p.ellipse(-4, 2, w*0.55, h*0.4);
    // Feet
    p.stroke(200, 160, 40); p.strokeWeight(3);
    p.line(-w/4, h/2-2, -w/4-4, h/2+8);
    p.line(-w/4, h/2-2, -w/4+4, h/2+8);
    p.line(w/4, h/2-2, w/4-4, h/2+8);
    p.line(w/4, h/2-2, w/4+4, h/2+8);
    p.noStroke();
  }

  function _drawCart(p, w, h, t) {
    // Wooden cart — horse can jump ON TOP
    p.noStroke();

    // Wheels (spin with t)
    const wheelR = 18;
    const wheelY = h/2 - 2;
    for (const wx of [-w/2+wheelR+4, w/2-wheelR-4]) {
      // Wheel rim
      p.fill(80, 50, 20);
      p.ellipse(wx, wheelY, wheelR*2, wheelR*2);
      p.fill(60, 35, 10);
      p.ellipse(wx, wheelY, wheelR*1.4, wheelR*1.4);
      // Spokes
      p.stroke(80, 50, 20); p.strokeWeight(2.5);
      for (let s = 0; s < 6; s++) {
        const a = t + (s / 6) * Math.PI * 2;
        p.line(wx, wheelY,
               wx + Math.cos(a)*wheelR*0.85,
               wheelY + Math.sin(a)*wheelR*0.85);
      }
      // Hub
      p.noStroke(); p.fill(120, 80, 30);
      p.ellipse(wx, wheelY, 8, 8);
    }

    // Cart body (wooden planks)
    p.noStroke();
    p.fill(160, 110, 55);
    p.rect(-w/2+6, -h/2, w-12, h-wheelR-2, 4);

    // Plank lines
    p.stroke(130, 90, 40); p.strokeWeight(1.5);
    for (let px2 = -w/2+14; px2 < w/2-10; px2 += 12) {
      p.line(px2, -h/2+2, px2, h/2-wheelR-4);
    }

    // Cart rim/edge
    p.stroke(120, 80, 30); p.strokeWeight(3);
    p.noFill();
    p.rect(-w/2+6, -h/2, w-12, h-wheelR-2, 4);

    // Top rail (platform the horse lands on)
    p.stroke(100, 65, 25); p.strokeWeight(4);
    p.line(-w/2+6, -h/2+2, w/2-6, -h/2+2);

    // Axle
    p.stroke(80, 50, 20); p.strokeWeight(3);
    p.line(-w/2+wheelR+4, wheelY, w/2-wheelR-4, wheelY);

    // Handle/shaft
    p.stroke(100, 65, 25); p.strokeWeight(4);
    p.line(w/2-6, -h/2+12, w/2+20, -h/2+20);
    p.line(w/2-6, h/2-wheelR-4, w/2+20, h/2-wheelR);

    p.noStroke();
  }

  function _drawDust(p, d) {
    p.noStroke();
    p.fill(180, 150, 110, d.life * 120);
    p.ellipse(d.x, d.y, d.size * d.life, d.size * d.life * 0.5);
  }

  function _drawParticle(p, pt) {
    p.noStroke();
    p.fill(pt.rgb[0], pt.rgb[1], pt.rgb[2], pt.life * 220);
    p.ellipse(pt.x, pt.y, pt.size * pt.life, pt.size * pt.life);
  }

  // ── UI Screens ─────────────────────────────────────────────────────────────
  function _drawUI(p) {
    switch (gameState) {
      case "start":   _drawStartScreen(p); break;
      case "playing": _drawHUD(p);         break;
      case "paused":  _drawHUD(p); _drawPauseScreen(p); break;
      case "dead":    _drawHUD(p); _drawDeadScreen(p);  break;
    }
  }

  function _drawHUD(p) {
    p.textFont("Orbitron, monospace");
    p.noStroke();

    // Score
    p.textSize(22); p.textAlign(p.RIGHT, p.TOP);
    p.fill(60, 40, 10);
    p.text(_pad(score, 6), p.width - 18, 16);

    // Hi score
    p.textSize(10);
    p.fill(100, 70, 30);
    p.text("BEST " + _pad(hiScore, 6), p.width - 18, 44);

    // Speed
    p.textAlign(p.LEFT, p.TOP);
    p.fill(80, 120, 50);
    p.textSize(10);
    p.text("SPD " + speed.toFixed(1), 16, 16);

    // Gesture pill
    const g   = GestureEngine.state.gesture;
    const MAP = { swipe_up:"↑ JUMP", swipe_down:"↓ DUCK", swipe_right:"→ DASH",
                  JUMP:"↑ JUMP", DUCK:"↓ DUCK", DASH:"→ DASH",
                  open_palm:"✋ START", PAUSE:"⏸ PAUSE", RESUME:"▶ RESUME" };
    const lbl = MAP[g] || "·";
    const pillW = 130, pillH = 26;
    const pillX = p.width/2 - pillW/2, pillY = p.height - 46;
    p.fill(0, 0, 0, 80); p.rect(pillX, pillY, pillW, pillH, 13);
    p.fill(g && g!=="none" && g!=="neutral" ? 60 : 100,
           g === "swipe_up" ? 160 : 80,
           30, 230);
    p.textSize(12); p.textAlign(p.CENTER, p.CENTER);
    p.textFont("Rajdhani, monospace");
    p.text(lbl, p.width/2, pillY + pillH/2 + 1);

    if (window._pendingLoad) {
      p.fill(80, 50, 20, 210);
      p.textSize(12); p.textFont("Orbitron, monospace");
      p.textAlign(p.CENTER, p.CENTER);
      p.text(window._pendingLoad, p.width/2, p.height - 26);
    }
  }

  function _drawStartScreen(p) {
    // Sky overlay
    p.fill(0, 0, 0, 80);
    p.rect(0, 0, p.width, p.height);

    const cy = p.height * 0.28;
    const pulse = Math.sin(titleT);

    // Title
    p.textFont("Orbitron, monospace");
    p.textAlign(p.CENTER, p.CENTER);
    for (let i = 3; i >= 0; i--) {
      p.fill(200, 140, 40, (3-i)*22);
      p.textSize(70+i);
      p.text("HORSE", p.width/2, cy+i);
      p.text("RUNNER", p.width/2, cy+72+i);
    }
    p.fill(p.lerpColor(p.color(180,120,30), p.color(240,190,60), (pulse+1)/2));
    p.textSize(70);
    p.text("HORSE", p.width/2, cy);
    p.fill(80, 140, 50);
    p.text("RUNNER", p.width/2, cy+72);

    p.fill(100, 70, 30, 180);
    p.textSize(13); p.textFont("Rajdhani, monospace");
    p.text("SWIPE TO CONTROL YOUR HORSE · AVOID THE ANIMALS · RIDE THE CART!", p.width/2, cy+138);

    // Controls card
    const cardW = 520, cardH = 106, cx2 = p.width/2 - cardW/2;
    const cardY  = p.height * 0.60;
    p.fill(255, 245, 220, 180);
    p.stroke(180, 140, 60); p.strokeWeight(1.5);
    p.rect(cx2, cardY, cardW, cardH, 10);
    p.noStroke();

    const items = [
      ["↑ SWIPE UP",   "JUMP over animals",  "#3a7a20"],
      ["↓ SWIPE DOWN", "DUCK low",            "#c06010"],
      ["→ SWIPE RIGHT","DASH (speed boost)",  "#205090"],
      ["✋✋ TWO PALMS","PAUSE",               "#902020"],
    ];
    p.textSize(12); p.textFont("Rajdhani, monospace"); p.textAlign(p.LEFT, p.CENTER);
    items.forEach(([lbl, action, col], i) => {
      const rx = cx2 + 22 + (i%2)*264;
      const ry = cardY + 30 + Math.floor(i/2)*40;
      p.fill(col);
      p.text(lbl + "  →  " + action, rx, ry);
    });

    // Palm ring
    _drawPalmRing(p, p.height*0.60 + cardH + 70);
  }

  function _drawPalmRing(p, y) {
    const prog = GestureEngine.state.palmProgress || 0;
    const r    = 30;
    p.noFill(); p.stroke(180, 140, 60, 60); p.strokeWeight(3);
    p.ellipse(p.width/2, y, r*2, r*2);
    if (prog > 0) {
      const ctx = p.drawingContext;
      ctx.strokeStyle = "rgba(60,160,60,0.9)";
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(p.width/2, y, r, -Math.PI/2, -Math.PI/2 + Math.PI*2*prog);
      ctx.stroke();
    }
    p.noStroke(); p.fill(180, 120, 30);
    p.textSize(18); p.textAlign(p.CENTER, p.CENTER);
    p.text("✋", p.width/2, y);
    p.fill(80, 60, 20, 200); p.textSize(11);
    p.textFont("Orbitron, monospace");
    p.text("HOLD OPEN PALM TO START", p.width/2, y+46);
    p.fill(120, 100, 60, 140); p.textSize(10);
    p.text("( or press SPACE / ENTER )", p.width/2, y+62);
  }

  function _drawPauseScreen(p) {
    p.fill(0, 0, 0, 130); p.rect(0, 0, p.width, p.height);
    p.fill(220, 170, 50); p.textSize(56);
    p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER, p.CENTER);
    p.text("PAUSED ⏸", p.width/2, p.height/2 - 20);
    p.fill(100, 70, 30, 180); p.textSize(13);
    p.textFont("Rajdhani, monospace");
    p.text("SHOW TWO FISTS ✊✊ TO RESUME  ·  PRESS P", p.width/2, p.height/2+38);
  }

  function _drawDeadScreen(p) {
    p.fill(0, 0, 0, 150); p.rect(0, 0, p.width, p.height);

    // "WHOA!" instead of game over
    const ctx = p.drawingContext;
    ctx.shadowColor = "#cc4400";
    ctx.shadowBlur  = 30;
    p.fill(200, 80, 20);
    p.textSize(72); p.textFont("Orbitron, monospace"); p.textAlign(p.CENTER, p.CENTER);
    p.text("WHOA! 🐴", p.width/2, p.height*0.36);
    ctx.shadowBlur = 0;

    p.fill(180, 130, 40);
    p.textSize(24);
    p.text("SCORE  " + _pad(score, 6), p.width/2, p.height*0.36+80);

    p.fill(120, 90, 40, 180); p.textSize(14);
    p.text("BEST   " + _pad(hiScore, 6), p.width/2, p.height*0.36+114);

    // Auto-restart countdown
    const elapsed = performance.now() - deathTime;
    const remaining = Math.max(0, GCFG_GAME.AUTO_RESTART_MS - elapsed);
    const pct = 1 - remaining / GCFG_GAME.AUTO_RESTART_MS;

    p.fill(100, 70, 30, 180); p.textSize(12); p.textFont("Rajdhani, monospace");
    p.text("RESTARTING IN " + (remaining/1000).toFixed(1) + "s …", p.width/2, p.height*0.36+160);

    // Progress bar
    const barW = 200, barH = 8;
    const barX  = p.width/2 - barW/2;
    const barY  = p.height*0.36 + 178;
    p.fill(60, 40, 10, 120); p.rect(barX, barY, barW, barH, 4);
    p.fill(180, 140, 40); p.rect(barX, barY, barW*pct, barH, 4);
  }

  function _pad(n, len) {
    return String(Math.floor(n)).padStart(len, "0");
  }

  return { init, resize, update, draw, handleGesture, getState };
})();
