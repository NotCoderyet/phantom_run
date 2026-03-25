/* ============================================================
   gesture.js — MediaPipe Hand Tracking + Gesture Detection
   ============================================================
   Exposes: window.GestureEngine  (singleton)

   GESTURE MAPPINGS:
     JUMP   — swipe wrist upward quickly
     DUCK   — swipe wrist downward quickly
     DASH   — swipe hand to the right quickly
     START  — hold open palm for PALM_HOLD_MS ms
     PAUSE  — hold closed fist for FIST_HOLD_FRAMES frames
*/
"use strict";

// ── Tuning constants ─────────────────────────────────────────────────────────
// TODO: Raise thresholds if gestures false-trigger; lower if they don't respond
const GCFG = {
  HISTORY_LENGTH:       16,    // frames of wrist history kept
  SWIPE_UP_THRESHOLD:   0.026, // normalised dy for a jump swipe
  SWIPE_DOWN_THRESHOLD: 0.024, // normalised dy for a duck swipe
  DASH_THRESHOLD:       0.030, // normalised dx for a dash swipe
  COOLDOWN_JUMP:        650,   // ms between jump triggers
  COOLDOWN_DUCK:        400,   // ms between duck triggers
  COOLDOWN_DASH:        320,   // ms between dash triggers
  PALM_HOLD_MS:         900,   // ms open palm must be held to fire START
  FIST_HOLD_FRAMES:     12,    // consecutive fist frames needed to fire PAUSE
  SMOOTH_FRAMES:        4,     // frames averaged for velocity calculation
  OPEN_PALM_SPREAD:     0.17,  // avg fingertip-to-palm distance for open hand
  FIST_THRESHOLD:       0.10,  // avg fingertip-to-palm distance for closed fist
  MIN_CONFIDENCE:       0.50,  // minimum detection confidence to accept result
};

// ── GestureEngine singleton ──────────────────────────────────────────────────
window.GestureEngine = (function () {

  // Private state
  let handLandmarker = null;
  let ready          = false;
  let lastVideoTime  = -1;
  let history        = [];       // array of { wrist, palmCenter, tips[] }
  let lastJump  = 0, lastDuck = 0, lastDash = 0;
  let palmHoldStart = null, palmHoldFired = false;
  let fistFrames = 0, fistFired = false;
  let _lastLM = null;            // most recent raw 21-landmark array

  // Public state object read by sketch.js each frame
  const state = {
    gesture:      "none",
    handPresent:  false,
    openPalm:     false,
    closedFist:   false,
    rawWrist:     null,
    pending:      [],      // gesture strings fired this frame, consumed by game
    palmProgress: 0,       // 0-1 progress toward START
    debugInfo:    { vx: "0", vy: "0" },
  };

  // ── init: load MediaPipe model ──────────────────────────────────────────
  async function init(videoEl) {
    await _waitForMP();
    const { HandLandmarker, FilesetResolver } = window._MPVision;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
    );

    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode:                  "VIDEO",
        numHands:                     1,
        minHandDetectionConfidence:   GCFG.MIN_CONFIDENCE,
        minHandPresenceConfidence:    GCFG.MIN_CONFIDENCE,
        minTrackingConfidence:        GCFG.MIN_CONFIDENCE,
      });
    } catch (gpuErr) {
      console.warn("[GestureEngine] GPU delegate failed, falling back to CPU:", gpuErr);
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "CPU",
        },
        runningMode:                  "VIDEO",
        numHands:                     1,
        minHandDetectionConfidence:   GCFG.MIN_CONFIDENCE,
        minHandPresenceConfidence:    GCFG.MIN_CONFIDENCE,
        minTrackingConfidence:        GCFG.MIN_CONFIDENCE,
      });
    }

    ready = true;
    console.log("[GestureEngine] HandLandmarker ready ✓");
  }

  function _waitForMP() {
    return new Promise(resolve => {
      if (window._MPReady) return resolve();
      window.addEventListener("mp-ready", resolve, { once: true });
    });
  }

  // ── processFrame: called every p5 draw tick ─────────────────────────────
  function processFrame(videoEl) {
    state.pending = [];
    if (!ready || !videoEl || videoEl.readyState < 2) return;
    // Skip if video hasn't advanced (avoids duplicate detection on same frame)
    if (videoEl.currentTime === lastVideoTime) return;
    lastVideoTime = videoEl.currentTime;

    let result;
    try {
      result = handLandmarker.detectForVideo(videoEl, performance.now());
    } catch (e) { return; }

    const hasHand = result.landmarks && result.landmarks.length > 0;
    state.handPresent = hasHand;

    if (!hasHand) {
      _resetHandState();
      return;
    }

    const lm = result.landmarks[0];
    _lastLM = lm;

    // Push a compact frame into history
    history.push({
      wrist:      { x: lm[0].x,  y: lm[0].y  },
      palmCenter: { x: lm[9].x,  y: lm[9].y  },
      // Fingertips: thumb(4) index(8) middle(12) ring(16) pinky(20)
      tips: [lm[4], lm[8], lm[12], lm[16], lm[20]],
    });
    if (history.length > GCFG.HISTORY_LENGTH) history.shift();
    state.rawWrist = history[history.length - 1].wrist;

    const shape  = _classifyShape();
    const motion = _classifyMotion();

    state.openPalm   = shape === "open_palm";
    state.closedFist = shape === "fist";
    state.gesture    = motion !== "none" ? motion : shape;

    _fireGestures(shape, motion, performance.now());
  }

  function _resetHandState() {
    history = []; _lastLM = null;
    state.rawWrist = null; state.openPalm = false; state.closedFist = false;
    state.gesture = "none"; state.palmProgress = 0;
    palmHoldStart = null; palmHoldFired = false;
    fistFrames = 0; fistFired = false;
    state.debugInfo = { vx: "0", vy: "0" };
  }

  // ── Shape classification (open palm / fist / neutral) ──────────────────
  function _classifyShape() {
    const f = history[history.length - 1];
    if (!f) return "unknown";
    const pc  = f.palmCenter;
    const avg = f.tips.reduce(
      (sum, t) => sum + Math.hypot(t.x - pc.x, t.y - pc.y), 0
    ) / f.tips.length;

    if (avg > GCFG.OPEN_PALM_SPREAD) return "open_palm";
    if (avg < GCFG.FIST_THRESHOLD)   return "fist";
    return "neutral";
  }

  // ── Motion classification (swipe direction from wrist velocity) ─────────
  function _classifyMotion() {
    const n = history.length;
    if (n < GCFG.SMOOTH_FRAMES + 3) return "none";
    const recent = _avgWrist(n - GCFG.SMOOTH_FRAMES,     n);
    const older  = _avgWrist(n - GCFG.SMOOTH_FRAMES - 3, n - GCFG.SMOOTH_FRAMES);
    // In normalised coords: y increases downward, x increases rightward
    const vy = older.y - recent.y; // positive means hand moved UP
    const vx = recent.x - older.x; // positive means hand moved RIGHT
    state.debugInfo = { vx: vx.toFixed(3), vy: vy.toFixed(3) };
    if ( vy >  GCFG.SWIPE_UP_THRESHOLD)   return "swipe_up";
    if (-vy >  GCFG.SWIPE_DOWN_THRESHOLD) return "swipe_down";
    if ( vx >  GCFG.DASH_THRESHOLD)       return "swipe_right";
    return "none";
  }

  function _avgWrist(start, end) {
    const slice = history.slice(Math.max(0, start), Math.min(history.length, end));
    if (!slice.length) return history[history.length - 1].wrist;
    return {
      x: slice.reduce((a, f) => a + f.wrist.x, 0) / slice.length,
      y: slice.reduce((a, f) => a + f.wrist.y, 0) / slice.length,
    };
  }

  // ── Gesture firing with cooldowns ───────────────────────────────────────
  function _fireGestures(shape, motion, now) {
    // ─ Swipe gestures (motion-based) ─
    if (motion === "swipe_up"    && now - lastJump > GCFG.COOLDOWN_JUMP) {
      lastJump = now; _push("JUMP");
    }
    if (motion === "swipe_down"  && now - lastDuck > GCFG.COOLDOWN_DUCK) {
      lastDuck = now; _push("DUCK");
    }
    if (motion === "swipe_right" && now - lastDash > GCFG.COOLDOWN_DASH) {
      lastDash = now; _push("DASH");
    }

    // ─ Open palm hold → START ─
    if (shape === "open_palm") {
      if (!palmHoldStart) palmHoldStart = now;
      state.palmProgress = Math.min(1, (now - palmHoldStart) / GCFG.PALM_HOLD_MS);
      if (!palmHoldFired && state.palmProgress >= 1) {
        palmHoldFired = true;
        _push("START");
      }
    } else {
      palmHoldStart = null; palmHoldFired = false; state.palmProgress = 0;
    }

    // ─ Closed fist hold → PAUSE ─
    if (shape === "fist") {
      fistFrames++;
      if (!fistFired && fistFrames >= GCFG.FIST_HOLD_FRAMES) {
        fistFired = true;
        _push("PAUSE");
      }
    } else {
      fistFrames = 0; fistFired = false;
    }
  }

  function _push(name) {
    state.gesture = name;
    state.pending.push(name);
  }

  // ── Landmark overlay drawing (called by sketch.js) ──────────────────────
  function drawLandmarksOnCanvas(ctx, w, h, lm) {
    if (!lm) return;
    // Mirror x because the canvas CSS is already scaleX(-1)
    // but we're drawing into the raw canvas pixels, so we need to flip manually
    const mx = v => (1 - v.x) * w;
    const my = v => v.y * h;

    const CONNS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],
      [0,17],
    ];

    ctx.strokeStyle = "rgba(230,255,80,0.75)";
    ctx.lineWidth = 1.5;
    for (const [a, b] of CONNS) {
      if (!lm[a] || !lm[b]) continue;
      ctx.beginPath();
      ctx.moveTo(mx(lm[a]), my(lm[a]));
      ctx.lineTo(mx(lm[b]), my(lm[b]));
      ctx.stroke();
    }

    // Fingertip dots in accent colour
    for (const i of [4, 8, 12, 16, 20]) {
      if (!lm[i]) continue;
      ctx.fillStyle = "rgba(255,80,120,0.95)";
      ctx.beginPath();
      ctx.arc(mx(lm[i]), my(lm[i]), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Palm-hold progress arc
    if (state.palmProgress > 0) {
      ctx.strokeStyle = "rgba(80,255,180,0.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.palmProgress);
      ctx.stroke();
    }
  }

  function getLastLM() { return _lastLM; }

  return { init, processFrame, drawLandmarksOnCanvas, getLastLM, state };
})();
