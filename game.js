/* ============================================================
   game.js — Game Logic, Physics, Obstacles, Particles, Score
   ============================================================
   Exposes: window.Game  (singleton, used by sketch.js)

   States: "start" | "playing" | "paused" | "dead"
*/
"use strict";


    // Test 
// ── Game tuning constants ─────────────────────────────────────────────────────
// TODO: adjust these to change difficulty and feel
const GCFG_GAME = {
  GRAVITY:            0.72,    // pixels/frame² — increase for heavier feel
  JUMP_FORCE:        -16.0,    // initial vertical velocity on jump (negative = up)
  DUCK_DURATION:      600,     // ms the player stays ducked after gesture
  DASH_DURATION:      500,     // ms the speed boost lasts
  DASH_SPEED_BONUS:   4.5,     // extra px/frame during dash

  GROUND_Y_RATIO:     0.80,    // ground line as fraction of canvas height

  PLAYER_X_RATIO:     0.18,    // player horizontal position as fraction of width
  PLAYER_W:           26,
  PLAYER_H:           62,
  PLAYER_DUCK_H:      30,

  BASE_SPEED:         5.0,     // starting scroll speed (px/frame)
  MAX_SPEED:         19.0,     // hard cap
  SPEED_INC:          0.0008,  // speed added per score point

  OBS_MIN_GAP:        440,     // minimum x-gap between obstacle groups
  OBS_MAX_GAP:        800,     // maximum x-gap
  OBS_SECOND_CHANCE:  0.35,    // probability of a second obstacle in a group

  SHAKE_FRAMES:       12,      // screen shake duration on collision
  DEATH_PARTICLES:    35,      // particles spawned on death
};

// ── Particle ─────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, rgb) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 9;
    this.vy = (Math.random() - 1.6) * 7;
    this.life = 1.0;
    this.decay = 0.018 + Math.random() * 0.028;
    this.size  = 3 + Math.random() * 6;
    this.rgb   = rgb || [255, 180, 70];
  }
  update() {
    this.x  += this.vx;
    this.y  += this.vy;
    this.vy += 0.3;           // mini gravity
    this.life -= this.decay;
  }
  get alive() { return this.life > 0; }
}

// ── Obstacle ─────────────────────────────────────────────────────────────────
class Obstacle {
  /**
   * type: "tall" | "short" | "hover" | "wide"
   * groundY: y-coordinate of the ground line
   */
  constructor(x, groundY, type) {
    this.type    = type;
    this.groundY = groundY;
    this.passed  = false;

    switch (type) {
      case "tall":
        this.w = 22; this.h = 88;
        this.x = x;
        this.y = groundY - this.h;
        break;
      case "short":
        this.w = 40; this.h = 34;
        this.x = x;
        this.y = groundY - this.h;
        break;
      case "wide":
        this.w = 70; this.h = 28;
        this.x = x;
        this.y = groundY - this.h;
        break;
      case "hover":
        // Floats above ground — player must duck under it
        this.w = 44; this.h = 22;
        this.x = x;
        this.y = groundY - 96;
        break;
      default:
        this.w = 26; this.h = 60;
        this.x = x;
        this.y = groundY - this.h;
    }
  }
  move(speed) { this.x -= speed; }
  get offscreen() { return this.x + this.w < 0; }
}

// ── Player ────────────────────────────────────────────────────────────────────
class Player {
  constructor(x, groundY) {
    this.groundY   = groundY;
    this.x         = x;
    this.y         = groundY - GCFG_GAME.PLAYER_H;
    this.vy        = 0;
    this.grounded  = true;
    this.ducking   = false;
    this.dashing   = false;
    this.duckTimer = 0;
    this.dashTimer = 0;
    this.jumpCount = 0;      // allows double-jump

    // Squash & stretch
    this.scaleX = 1.0;
    this.scaleY = 1.0;

    // Running leg animation phase
    this.legPhase = 0;
  }

  get w()       { return GCFG_GAME.PLAYER_W; }
  get h()       { return this.ducking ? GCFG_GAME.PLAYER_DUCK_H : GCFG_GAME.PLAYER_H; }
  get hitboxY() { return this.ducking ? this.groundY - GCFG_GAME.PLAYER_DUCK_H : this.y; }

  jump() {
    if (this.jumpCount >= 2) return;
    this.vy        = GCFG_GAME.JUMP_FORCE;
    this.grounded  = false;
    this.jumpCount++;
    // Stretch upward on jump
    this.scaleY = 0.55; this.scaleX = 1.5;
    // Cancel duck
    if (this.ducking) { this.ducking = false; this.duckTimer = 0; }
  }

  duck() {
    if (!this.grounded) return;
    this.ducking   = true;
    this.duckTimer = GCFG_GAME.DUCK_DURATION;
  }

  dash() {
    this.dashing   = true;
    this.dashTimer = GCFG_GAME.DASH_DURATION;
  }

  update(dt) {
    // ─ Duck timer ─
    if (this.ducking) {
      this.duckTimer -= dt;
      if (this.duckTimer <= 0) { this.ducking = false; this.duckTimer = 0; }
    }

    // ─ Dash timer ─
    if (this.dashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) { this.dashing = false; this.dashTimer = 0; }
    }

    // ─ Vertical physics ─
    if (!this.grounded) {
      this.vy += GCFG_GAME.GRAVITY;
      this.y  += this.vy;
      const floor = this.groundY - GCFG_GAME.PLAYER_H;
      if (this.y >= floor) {
        this.y        = floor;
        this.vy       = 0;
        this.grounded = true;
        this.jumpCount = 0;
        // Squash on landing
        this.scaleY = 1.45; this.scaleX = 0.65;
      }
    } else {
      this.y = this.groundY - GCFG_GAME.PLAYER_H;
    }

    // ─ Ease squash/stretch back to 1 ─
    this.scaleX += (1 - this.scaleX) * 0.18;
    this.scaleY += (1 - this.scaleY) * 0.18;

    // ─ Leg animation ─
    if (this.grounded) this.legPhase += 0.28;
  }

  /**
   * AABB collision, slightly shrunk for fairness.
   */
  hits(ox, oy, ow, oh) {
    const S  = 5; // shrink per side
    const px = this.x + S, py = this.hitboxY + S;
    const pw = this.w - S*2, ph = this.h - S*2;
    return (px < ox + ow - S && px + pw > ox + S &&
            py < oy + oh     && py + ph > oy);
  }
}

// ── Game singleton ────────────────────────────────────────────────────────────
window.Game = (function () {

  let _p = null;             // p5 instance reference set by init()
  let player    = null;
  let obstacles = [];
  let particles = [];
  let score     = 0;
  let hiScore   = 0;
  let speed     = GCFG_GAME.BASE_SPEED;
  let gameState = "start";   // "start" | "playing" | "paused" | "dead"
  let groundY   = 0;
  let shakeFrames = 0;
  let totalFrames = 0;

  // Parallax background layers
  let bgLayers = [];
  let stars    = [];

  // Title / UI animation
  let titleT   = 0;

  // ── init (called once from p5 setup) ─────────────────────────────────────
  function init(p5ref) {
    _p = p5ref;
    groundY = Math.floor(_p.height * GCFG_GAME.GROUND_Y_RATIO);
    _buildBg();
    _resetRound();
  }

  // ── resize ────────────────────────────────────────────────────────────────
  function resize() {
    groundY = Math.floor(_p.height * GCFG_GAME.GROUND_Y_RATIO);
    if (player) player.groundY = groundY;
    _buildBg();
  }

  // ── handleGesture (called from sketch.js per pending gesture) ─────────────
  function handleGesture(g) {
    switch (g) {
      case "JUMP":
        if (gameState === "playing") player.jump();
        break;
      case "DUCK":
        if (gameState === "playing") player.duck();
        break;
      case "DASH":
        if (gameState === "playing") player.dash();
        break;
      case "START":
        if (gameState === "start" || gameState === "dead") _startRound();
        break;
      case "PAUSE":
        if (gameState === "playing") { gameState = "paused"; }
        break;
      case "RESUME":
        if (gameState === "paused") { gameState = "playing"; }
        break;
    }
  }

  // ── update (called each draw tick with dt in SECONDS) ────────────────────
  function update(dt) {
    titleT += 0.025;
    if (gameState !== "playing") return;
    totalFrames++;

    // Score + speed ramp
    score++;
    speed = Math.min(GCFG_GAME.MAX_SPEED,
                     GCFG_GAME.BASE_SPEED + score * GCFG_GAME.SPEED_INC);
    const effSpeed = speed + (player.dashing ? GCFG_GAME.DASH_SPEED_BONUS : 0);

    // Player physics
    player.update(dt * 1000); // player expects ms

    // Obstacle spawning
    _spawnIfNeeded();

    // Obstacle movement + collision
    obstacles = obstacles.filter(o => {
      o.move(effSpeed);
      if (!o.passed && o.x + o.w < player.x) o.passed = true;
      if (player.hits(o.x, o.y, o.w, o.h)) {
        _die();
        return false;
      }
      return !o.offscreen;
    });

    // Dash trail particles
    if (player.dashing && totalFrames % 3 === 0) {
      particles.push(new Particle(
        player.x, player.y + player.h * 0.5, [60, 180, 255]
      ));
    }

    // Ground run particles (occasional dust puff)
    if (player.grounded && totalFrames % 18 === 0) {
      particles.push(new Particle(
        player.x + player.w * 0.5,
        groundY,
        [140, 160, 200]
      ));
    }

    // Update + cull particles
    particles = particles.filter(p => { p.update(); return p.alive; });

    // Scroll background layers
    bgLayers.forEach(L => {
      L.offset = (L.offset + L.speed * effSpeed) % _p.width;
    });
    stars.forEach(s => {
      s.x -= s.spd * (effSpeed / GCFG_GAME.BASE_SPEED);
      if (s.x < 0) s.x += _p.width;
    });

    if (shakeFrames > 0) shakeFrames--;
  }

  // ── draw (called each draw tick) ─────────────────────────────────────────
  function draw() {
    const p = _p;

    // Screen shake
    let sx = 0, sy = 0;
    if (shakeFrames > 0) {
      sx = (Math.random() - 0.5) * 11;
      sy = (Math.random() - 0.5) * 8;
    }
    p.push();
    p.translate(sx, sy);

    _drawSky();
    _drawStars();
    _drawBgLayers();
    _drawGround();
    obstacles.forEach(o => _drawObstacle(p, o));
    if (player) _drawPlayer(p, player);
    particles.forEach(pt => _drawParticle(p, pt));

    p.pop();

    // Overlay UI (not shaken)
    _drawUI(p);
  }

  function getState() { return gameState; }

  // ── private: build background ─────────────────────────────────────────────
  function _buildBg() {
    const W = _p.width, H = _p.height;

    // Procedural mountain silhouette layers
    bgLayers = [
      { speed: 0.12, alpha: 0.18, yBase: 0.72, amp: 0.20, freq: 0.0030, seed: 0,  offset: 0 },
      { speed: 0.28, alpha: 0.30, yBase: 0.78, amp: 0.13, freq: 0.0055, seed: 50, offset: 0 },
      { speed: 0.52, alpha: 0.42, yBase: 0.82, amp: 0.08, freq: 0.0110, seed: 99, offset: 0 },
    ].map(L => {
      // Pre-bake a wide ridge array (2× canvas width for seamless scroll)
      const pts = [];
      const N   = 200;
      for (let i = 0; i <= N; i++) {
        const t  = i / N;
        const xf = t * W * 2;
        const ny = Math.sin(xf * L.freq + L.seed)         * 0.50
                 + Math.sin(xf * L.freq * 2.3 + L.seed)   * 0.30
                 + Math.sin(xf * L.freq * 5.1 + L.seed)   * 0.20;
        pts.push({ x: xf, ny });
      }
      return { ...L, pts };
    });

    // Stars
    stars = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x:   Math.random() * W,
        y:   Math.random() * H * 0.62,
        r:   Math.random() * 1.3 + 0.3,
        spd: 0.04 + Math.random() * 0.10,
        bri: 0.25 + Math.random() * 0.75,
      });
    }
  }

  function _resetRound() {
    const W = _p.width;
    player    = new Player(Math.floor(W * GCFG_GAME.PLAYER_X_RATIO), groundY);
    obstacles = [];
    particles = [];
    score     = 0;
    speed     = GCFG_GAME.BASE_SPEED;
    shakeFrames   = 0;
    totalFrames   = 0;
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
    const cx = player.x + player.w / 2;
    const cy = player.hitboxY + player.h / 2;
    for (let i = 0; i < GCFG_GAME.DEATH_PARTICLES; i++) {
      particles.push(new Particle(cx, cy, [255, 140, 50]));
      particles.push(new Particle(cx, cy, [255, 220, 90]));
    }
  }

  function _spawnIfNeeded() {
    // Find x of rightmost obstacle
    let rightEdge = _p.width;
    obstacles.forEach(o => { if (o.x + o.w > rightEdge) rightEdge = o.x + o.w; });
    if (rightEdge < _p.width + GCFG_GAME.OBS_MIN_GAP) return;

    const gap   = GCFG_GAME.OBS_MIN_GAP + Math.random() * (GCFG_GAME.OBS_MAX_GAP - GCFG_GAME.OBS_MIN_GAP);
    const spawnX = _p.width + gap * 0.25;
    const types  = ["tall", "short", "wide", "hover"];
    const t1     = types[Math.floor(Math.random() * types.length)];
    obstacles.push(new Obstacle(spawnX, groundY, t1));

    if (Math.random() < GCFG_GAME.OBS_SECOND_CHANCE) {
      const t2 = types[Math.floor(Math.random() * types.length)];
      obstacles.push(new Obstacle(spawnX + 85 + Math.random() * 55, groundY, t2));
    }
  }

  // ── Rendering helpers ─────────────────────────────────────────────────────

  function _drawSky() {
    const p = _p;
    // Vertical gradient
    const top = p.color(2, 3, 12);
    const bot = p.color(10, 18, 38);
    for (let y = 0; y <= p.height; y += 3) {
      const c = p.lerpColor(top, bot, y / p.height);
      p.stroke(c); p.strokeWeight(3);
      p.line(0, y, p.width, y);
    }
    p.noStroke();
    // Faint horizontal glow at horizon
    const hY = groundY - 30;
    const ctx = p.drawingContext;
    const g = ctx.createRadialGradient(p.width/2, hY, 0, p.width/2, hY, p.width * 0.55);
    g.addColorStop(0, "rgba(50,130,255,0.06)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, p.width, p.height);
  }

  function _drawStars() {
    const p = _p;
    p.noStroke();
    stars.forEach(s => {
      const twinkle = 0.5 + 0.5 * Math.sin(totalFrames * 0.04 + s.bri * 10);
      p.fill(255, 255, 220, (s.bri * 0.6 + twinkle * 0.4) * 255);
      p.ellipse(s.x, s.y, s.r * 2, s.r * 2);
    });
  }

  function _drawBgLayers() {
    const p = _p;
    const W = p.width;

    bgLayers.forEach((L, li) => {
      // Two dark-blue tones interpolated across layers
      const r1 = 8 + li * 6, g1 = 14 + li * 10, b1 = 30 + li * 16;
      p.fill(r1, g1, b1, L.alpha * 255);
      p.noStroke();

      // Draw ridge shifted by offset, repeated to cover full canvas
      for (let rep = -1; rep <= 1; rep++) {
        const baseX = -L.offset + rep * W;
        p.beginShape();
        p.vertex(baseX, groundY);
        L.pts.forEach(pt => {
          const screenX = baseX + pt.x * 0.5; // pts span 2×W
          const screenY = groundY - L.amp * p.height - pt.ny * L.amp * p.height * 0.6;
          p.vertex(screenX, screenY);
        });
        p.vertex(baseX + W, groundY);
        p.endShape(p.CLOSE);
      }
    });
  }

  function _drawGround() {
    const p = _p;
    const g = groundY;

    // Ground fill
    p.noStroke();
    p.fill(8, 12, 24);
    p.rect(0, g, p.width, p.height - g);

    // Ground line glow
    p.drawingContext.shadowColor = "rgba(60,140,255,0.5)";
    p.drawingContext.shadowBlur  = 8;
    p.stroke(40, 90, 160);
    p.strokeWeight(1.5);
    p.line(0, g, p.width, g);
    p.drawingContext.shadowBlur = 0;

    // Scrolling grid dashes on ground surface
    const gridSpacing = 80;
    const gOff = (totalFrames * speed * 0.4) % gridSpacing;
    p.stroke(20, 40, 80, 60);
    p.strokeWeight(0.5);
    for (let x = -gOff; x < p.width; x += gridSpacing) {
      p.line(x, g, x, p.height);
    }
    p.noStroke();
  }

  function _drawPlayer(p, pl) {
    const cx = pl.x + pl.w / 2;
    const cy = pl.hitboxY + pl.h / 2;
    const pw = pl.w, ph = pl.h;

    p.push();
    p.translate(cx, cy);
    p.scale(pl.scaleX, pl.scaleY);

    // Glow
    const ctx = p.drawingContext;
    ctx.shadowColor = pl.dashing ? "#4fc3f7" : "#ffcc44";
    ctx.shadowBlur  = pl.dashing ? 28 : 16;

    if (pl.ducking) {
      // Crouched — wide flat capsule
      p.fill(220, 210, 185);
      p.noStroke();
      p.rect(-pw * 0.9, -ph / 2, pw * 1.8, ph, 6);
    } else {
      // Upright silhouette
      p.fill(220, 210, 185);
      p.noStroke();
      // Body
      p.rect(-pw / 2, -ph * 0.28, pw, ph * 0.56, 4);
      // Head
      p.ellipse(0, -ph * 0.38, pw * 0.7, pw * 0.7);
      // Animated legs (only when grounded)
      const leg1 = Math.sin(pl.legPhase)      * 5;
      const leg2 = Math.sin(pl.legPhase + Math.PI) * 5;
      p.rect(-pw / 2 + 2, ph * 0.10, pw / 2 - 2, ph * 0.38 + leg1, 3);
      p.rect(2,            ph * 0.10, pw / 2 - 2, ph * 0.38 + leg2, 3);
    }

    ctx.shadowBlur = 0;

    // Dash afterimage streaks
    if (pl.dashing) {
      p.noStroke();
      for (let t = 1; t <= 4; t++) {
        p.fill(70, 170, 255, 55 - t * 10);
        p.rect(-pw / 2 - t * 16, -ph / 2, pw, ph, 4);
      }
    }

    // Double-jump sparkle ring
    if (!pl.grounded && pl.jumpCount === 2) {
      p.noFill();
      p.stroke(255, 220, 80, 160);
      p.strokeWeight(2);
      p.ellipse(0, 0, pw * 2.2, pw * 2.2);
      p.noStroke();
    }

    p.pop();
  }

  function _drawObstacle(p, o) {
    const ctx = p.drawingContext;
    p.noStroke();

    let fr, fg, fb, glowCol;
    switch (o.type) {
      case "tall":  fr=190; fg=35;  fb=30;  glowCol="#ff3322"; break;
      case "short": fr=130; fg=55;  fb=195; glowCol="#bb44ff"; break;
      case "wide":  fr=200; fg=120; fb=20;  glowCol="#ff8800"; break;
      case "hover": fr=20;  fg=160; fb=135; glowCol="#22ffcc"; break;
      default:      fr=120; fg=120; fb=120; glowCol="#888";
    }

    ctx.shadowColor = glowCol;
    ctx.shadowBlur  = 16;
    p.fill(fr, fg, fb);

    if (o.type === "hover") {
      // Floating with bob and slow spin effect
      const bob = Math.sin(totalFrames * 0.07) * 5;
      p.push();
      p.translate(o.x + o.w / 2, o.y + o.h / 2 + bob);
      p.rotate(totalFrames * 0.018);
      p.rect(-o.w / 2, -o.h / 2, o.w, o.h, 5);
      // Inner bright core
      p.fill(fr + 60, fg + 80, fb + 60, 180);
      p.rect(-o.w * 0.3, -o.h * 0.3, o.w * 0.6, o.h * 0.6, 3);
      p.pop();
    } else {
      p.rect(o.x, o.y, o.w, o.h, 3);
      // Top accent line
      p.fill(Math.min(fr + 60, 255), Math.min(fg + 50, 255), Math.min(fb + 50, 255));
      p.rect(o.x, o.y, o.w, 5, 2);
    }

    ctx.shadowBlur = 0;
  }

  function _drawParticle(p, pt) {
    p.noStroke();
    p.fill(pt.rgb[0], pt.rgb[1], pt.rgb[2], pt.life * 220);
    p.ellipse(pt.x, pt.y, pt.size * pt.life, pt.size * pt.life);
  }

  // ── UI screens ────────────────────────────────────────────────────────────
  function _drawUI(p) {
    p.noStroke();

    switch (gameState) {
      case "start":  _drawStartScreen(p); break;
      case "playing":_drawHUD(p);         break;
      case "paused": _drawHUD(p); _drawPauseScreen(p); break;
      case "dead":   _drawHUD(p); _drawDeadScreen(p);  break;
    }
  }

  function _drawHUD(p) {
    // Score
    p.textFont("Orbitron, monospace");
    p.textSize(20);
    p.textAlign(p.RIGHT, p.TOP);
    p.fill(255, 220, 80);
    p.text(_pad(score, 6), p.width - 20, 18);

    // Hi-score
    p.fill(200, 190, 160, 120);
    p.textSize(10);
    p.text("BEST " + _pad(hiScore, 6), p.width - 20, 44);

    // Speed meter (left)
    p.textAlign(p.LEFT, p.TOP);
    p.fill(80, 180, 255, 160);
    p.textSize(10);
    p.text("SPD " + speed.toFixed(1), 18, 18);

    // Gesture indicator pill
    _drawGesturePill(p);

    // Loading banner if MediaPipe not ready
    if (!GestureEngine.state.handPresent && window._pendingLoad) {
      p.fill(255, 220, 80, 200);
      p.textSize(13);
      p.textAlign(p.CENTER, p.CENTER);
      p.text(window._pendingLoad, p.width / 2, p.height - 36);
    }
  }

  function _drawGesturePill(p) {
    const g = GestureEngine.state.gesture;
    const MAP = {
      swipe_up:    "↑ JUMP",
      swipe_down:  "↓ DUCK",
      swipe_right: "→ DASH",
      open_palm:   "✋ START",
      fist:        "✊ PAUSE",
      JUMP: "↑ JUMP", DUCK: "↓ DUCK", DASH: "→ DASH",
      START: "✋ START", PAUSE: "✊ PAUSE",
    };
    const lbl = MAP[g] || "·";
    const pw = 130, ph = 26;
    const px = p.width / 2 - pw / 2, py = p.height - 48;
    p.fill(0, 0, 0, 90);
    p.rect(px, py, pw, ph, 13);
    const active = g && g !== "none" && g !== "neutral";
    p.fill(active ? 255 : 100, active ? 210 : 160, active ? 80 : 180, 220);
    p.textSize(12);
    p.textAlign(p.CENTER, p.CENTER);
    p.textFont("Rajdhani, monospace");
    p.text(lbl, p.width / 2, py + ph / 2 + 1);
  }

  function _drawStartScreen(p) {
    // Vignette
    const ctx = p.drawingContext;
    const vg = ctx.createRadialGradient(p.width/2, p.height/2, 80, p.width/2, p.height/2, p.height * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, p.width, p.height);

    const cy = p.height * 0.34;
    const t  = Math.sin(titleT);

    // Title glow layers
    for (let i = 3; i >= 0; i--) {
      p.fill(255, 200, 70, (3 - i) * 20);
      p.textSize(78 + i * 1.5);
      p.textAlign(p.CENTER, p.CENTER);
      p.textFont("Orbitron, monospace");
      p.text("PHANTOM", p.width / 2, cy + i * 1.5);
      p.text("RUN",     p.width / 2, cy + 70 + i * 1.5);
    }

    // Main title
    p.fill(p.lerpColor(p.color(210, 195, 155), p.color(255, 220, 90), (t + 1) / 2));
    p.textSize(78);
    p.text("PHANTOM", p.width / 2, cy);
    p.fill(80, 195, 245);
    p.text("RUN",     p.width / 2, cy + 70);

    // Tagline
    p.fill(180, 175, 165, 160);
    p.textSize(13);
    p.textFont("Rajdhani, monospace");
    p.text("A GESTURE-CONTROLLED ENDLESS RUNNER", p.width / 2, cy + 128);

    // Controls card
    _drawControlsCard(p, p.height * 0.66);

    // Palm-hold ring prompt
    _drawPalmRing(p, p.height * 0.66 + 118);
  }

  function _drawControlsCard(p, y) {
    const cw = 500, ch = 100, cx = p.width / 2 - cw / 2;
    p.fill(0, 0, 0, 95);
    p.stroke(255, 255, 255, 12);
    p.strokeWeight(1);
    p.rect(cx, y, cw, ch, 10);
    p.noStroke();

    const items = [
      ["↑ SWIPE UP",    "JUMP",    "#ffcc44"],
      ["↓ SWIPE DOWN",  "DUCK",    "#4fc3f7"],
      ["→ SWIPE RIGHT", "DASH",    "#7cfc00"],
      ["✊ HOLD FIST",  "PAUSE",   "#ff8c69"],
    ];
    p.textFont("Rajdhani, monospace");
    p.textSize(13);
    p.textAlign(p.LEFT, p.CENTER);
    items.forEach(([lbl, action, col], i) => {
      const col_ = i % 2 === 0 ? 0 : 250;
      const rx   = cx + 22 + (i % 2) * 252;
      const ry   = y + 30 + Math.floor(i / 2) * 36;
      p.fill(col);
      p.text(lbl + "  →  " + action, rx, ry);
    });
  }

  function _drawPalmRing(p, y) {
    const prog = GestureEngine.state.palmProgress || 0;
    const r = 34;

    // Track ring
    p.noFill();
    p.stroke(255, 255, 255, 25);
    p.strokeWeight(3);
    p.ellipse(p.width / 2, y, r * 2, r * 2);

    // Progress arc
    if (prog > 0) {
      const ctx = p.drawingContext;
      ctx.strokeStyle = "rgba(80,255,170,0.9)";
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(p.width / 2, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
    }

    p.noStroke();
    p.fill(255, 220, 80);
    p.textSize(20);
    p.textAlign(p.CENTER, p.CENTER);
    p.text("✋", p.width / 2, y);

    p.fill(180, 175, 160, 200);
    p.textSize(11);
    p.textFont("Orbitron, monospace");
    p.text("HOLD OPEN PALM TO START", p.width / 2, y + 52);

    p.fill(130, 130, 130, 120);
    p.textSize(10);
    p.text("( or press SPACE / ENTER )", p.width / 2, y + 70);
  }

  function _drawPauseScreen(p) {
    p.fill(0, 0, 0, 140);
    p.rect(0, 0, p.width, p.height);
    p.fill(255, 220, 80);
    p.textSize(58);
    p.textAlign(p.CENTER, p.CENTER);
    p.textFont("Orbitron, monospace");
    p.text("PAUSED", p.width / 2, p.height / 2 - 20);
    p.fill(180, 175, 160, 160);
    p.textSize(13);
    p.textFont("Rajdhani, monospace");
    p.text("HOLD FIST TO RESUME  ·  PRESS P", p.width / 2, p.height / 2 + 40);
  }

  function _drawDeadScreen(p) {
    p.fill(0, 0, 0, 160);
    p.rect(0, 0, p.width, p.height);

    const ctx = p.drawingContext;
    ctx.shadowColor = "#ff3311";
    ctx.shadowBlur  = 36;
    p.fill(210, 50, 30);
    p.textSize(68);
    p.textAlign(p.CENTER, p.CENTER);
    p.textFont("Orbitron, monospace");
    p.text("GAME OVER", p.width / 2, p.height * 0.38);
    ctx.shadowBlur = 0;

    p.fill(255, 220, 80);
    p.textSize(26);
    p.text("SCORE  " + _pad(score, 6), p.width / 2, p.height * 0.38 + 76);

    p.fill(180, 175, 160, 160);
    p.textSize(15);
    p.text("BEST   " + _pad(hiScore, 6), p.width / 2, p.height * 0.38 + 110);

    _drawPalmRing(p, p.height * 0.38 + 200);
  }

  function _pad(n, len) {
    return String(Math.floor(n)).padStart(len, "0");
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return { init, resize, update, draw, handleGesture, getState };
})();
