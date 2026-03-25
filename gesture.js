/* ============================================================
   gesture.js — MediaPipe Hand Tracking + Gesture Detection
   ============================================================
   GESTURE MAPPINGS:
     JUMP    — swipe ONE hand upward quickly
     DUCK    — swipe ONE hand downward quickly
     DASH    — swipe ONE hand to the right quickly
     START   — hold ONE open palm for ~800ms (title/dead screen)
     PAUSE   — show TWO open palms at same time
     RESUME  — show TWO closed fists at same time
*/
"use strict";

const GCFG = {
  HISTORY_LENGTH:        16,
  SWIPE_UP_THRESHOLD:    0.028,
  SWIPE_DOWN_THRESHOLD:  0.026,
  DASH_THRESHOLD:        0.032,
  COOLDOWN_JUMP:         600,
  COOLDOWN_DUCK:         380,
  COOLDOWN_DASH:         320,
  PALM_HOLD_MS:          800,
  TWO_PALM_FRAMES:       10,
  TWO_FIST_FRAMES:       10,
  SMOOTH_FRAMES:         4,
  OPEN_PALM_SPREAD:      0.16,
  FIST_THRESHOLD:        0.10,
  MIN_CONFIDENCE:        0.50,
};

window.GestureEngine = (function () {

  let handLandmarker = null;
  let ready          = false;
  let lastVideoTime  = -1;
  let histories      = [[], []];
  let lastJump = 0, lastDuck = 0, lastDash = 0;
  let palmHoldStart = null, palmHoldFired = false;
  let twoPalmFrames = 0, twoFistFrames = 0;
  let twoPalmFired  = false, twoFistFired = false;
  let _lastLMs      = [];

  const state = {
    gesture:      "none",
    handPresent:  false,
    handsCount:   0,
    openPalm:     false,
    closedFist:   false,
    pending:      [],
    palmProgress: 0,
    debugInfo:    { vx: "0", vy: "0", hands: 0, shape0: "—", shape1: "—" },
  };

  async function init(videoEl) {
    await _waitForMP();
    const { HandLandmarker, FilesetResolver } = window._MPVision;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
    );

    const opts = (delegate) => ({
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate,
      },
      runningMode:                 "VIDEO",
      numHands:                    2,
      minHandDetectionConfidence:  GCFG.MIN_CONFIDENCE,
      minHandPresenceConfidence:   GCFG.MIN_CONFIDENCE,
      minTrackingConfidence:       GCFG.MIN_CONFIDENCE,
    });

    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, opts("GPU"));
    } catch (e) {
      console.warn("[GestureEngine] GPU failed, trying CPU:", e);
      handLandmarker = await HandLandmarker.createFromOptions(vision, opts("CPU"));
    }

    ready = true;
    console.log("[GestureEngine] HandLandmarker ready (numHands=2) ✓");
  }

  function _waitForMP() {
    return new Promise(resolve => {
      if (window._MPReady) return resolve();
      window.addEventListener("mp-ready", resolve, { once: true });
    });
  }

  function processFrame(videoEl) {
    state.pending = [];
    if (!ready || !videoEl || videoEl.readyState < 2) return;
    if (videoEl.currentTime === lastVideoTime) return;
    lastVideoTime = videoEl.currentTime;

    let result;
    try {
      result = handLandmarker.detectForVideo(videoEl, performance.now());
    } catch (e) { return; }

    const count   = result.landmarks ? result.landmarks.length : 0;
    _lastLMs      = result.landmarks || [];
    state.handsCount  = count;
    state.handPresent = count > 0;

    if (count === 0) { _resetAll(); return; }

    const now    = performance.now();
    const shapes = [];

    for (let hi = 0; hi < Math.min(count, 2); hi++) {
      const lm = result.landmarks[hi];
      histories[hi].push({
        wrist:      { x: lm[0].x, y: lm[0].y },
        palmCenter: { x: lm[9].x, y: lm[9].y },
        tips:       [lm[4], lm[8], lm[12], lm[16], lm[20]],
      });
      if (histories[hi].length > GCFG.HISTORY_LENGTH) histories[hi].shift();
      shapes.push(_classifyShape(hi));
    }

    if (count < 2) histories[1] = [];

    const primaryShape  = shapes[0] || "neutral";
    const primaryMotion = _classifyMotion(0);
    const secondShape   = shapes[1] || "none";

    state.openPalm   = primaryShape === "open_palm";
    state.closedFist = primaryShape === "fist";
    state.gesture    = primaryMotion !== "none" ? primaryMotion : primaryShape;
    state.debugInfo  = {
      vx: state.debugInfo.vx, vy: state.debugInfo.vy,
      hands: count, shape0: primaryShape, shape1: secondShape,
    };

    _fireGestures(primaryShape, primaryMotion, secondShape, now);
  }

  function _classifyShape(handIndex) {
    const h = histories[handIndex];
    if (!h || !h.length) return "unknown";
    const f   = h[h.length - 1];
    const pc  = f.palmCenter;
    const avg = f.tips.reduce(
      (sum, t) => sum + Math.hypot(t.x - pc.x, t.y - pc.y), 0
    ) / f.tips.length;
    if (avg > GCFG.OPEN_PALM_SPREAD) return "open_palm";
    if (avg < GCFG.FIST_THRESHOLD)   return "fist";
    return "neutral";
  }

  function _classifyMotion(handIndex) {
    const h = histories[handIndex];
    if (!h) return "none";
    const n = h.length;
    if (n < GCFG.SMOOTH_FRAMES + 3) return "none";
    const recent = _avgWrist(h, n - GCFG.SMOOTH_FRAMES,     n);
    const older  = _avgWrist(h, n - GCFG.SMOOTH_FRAMES - 3, n - GCFG.SMOOTH_FRAMES);
    const vy = older.y - recent.y;
    const vx = recent.x - older.x;
    state.debugInfo.vy = vy.toFixed(3);
    state.debugInfo.vx = vx.toFixed(3);
    if ( vy >  GCFG.SWIPE_UP_THRESHOLD)   return "swipe_up";
    if (-vy >  GCFG.SWIPE_DOWN_THRESHOLD) return "swipe_down";
    if ( vx >  GCFG.DASH_THRESHOLD)       return "swipe_right";
    return "none";
  }

  function _avgWrist(h, start, end) {
    const slice = h.slice(Math.max(0, start), Math.min(h.length, end));
    if (!slice.length) return h[h.length - 1].wrist;
    return {
      x: slice.reduce((a, f) => a + f.wrist.x, 0) / slice.length,
      y: slice.reduce((a, f) => a + f.wrist.y, 0) / slice.length,
    };
  }

  function _fireGestures(primaryShape, primaryMotion, secondShape, now) {

    // JUMP
    if (primaryMotion === "swipe_up" && now - lastJump > GCFG.COOLDOWN_JUMP) {
      lastJump = now; _push("JUMP");
    }
    // DUCK
    if (primaryMotion === "swipe_down" && now - lastDuck > GCFG.COOLDOWN_DUCK) {
      lastDuck = now; _push("DUCK");
    }
    // DASH
    if (primaryMotion === "swipe_right" && now - lastDash > GCFG.COOLDOWN_DASH) {
      lastDash = now; _push("DASH");
    }

    // START — one open palm held (only when 1 hand visible)
    if (state.handsCount === 1 && primaryShape === "open_palm") {
      if (!palmHoldStart) palmHoldStart = now;
      state.palmProgress = Math.min(1, (now - palmHoldStart) / GCFG.PALM_HOLD_MS);
      if (!palmHoldFired && state.palmProgress >= 1) {
        palmHoldFired = true; _push("START");
      }
    } else {
      palmHoldStart = null; palmHoldFired = false; state.palmProgress = 0;
    }

    // PAUSE — both hands open
    const bothOpen = state.handsCount === 2
                  && primaryShape === "open_palm"
                  && secondShape  === "open_palm";
    if (bothOpen) {
      twoPalmFrames++;
      twoFistFrames = 0; twoFistFired = false;
      if (!twoPalmFired && twoPalmFrames >= GCFG.TWO_PALM_FRAMES) {
        twoPalmFired = true; _push("PAUSE");
      }
    } else {
      twoPalmFrames = 0; twoPalmFired = false;
    }

    // RESUME — both hands fist
    const bothFist = state.handsCount === 2
                  && primaryShape === "fist"
                  && secondShape  === "fist";
    if (bothFist) {
      twoFistFrames++;
      twoPalmFrames = 0; twoPalmFired = false;
      if (!twoFistFired && twoFistFrames >= GCFG.TWO_FIST_FRAMES) {
        twoFistFired = true; _push("RESUME");
      }
    } else {
      twoFistFrames = 0; twoFistFired = false;
    }
  }

  function _push(name) { state.gesture = name; state.pending.push(name); }

  function _resetAll() {
    histories = [[], []]; _lastLMs = [];
    state.gesture = "none"; state.openPalm = false; state.closedFist = false;
    state.palmProgress = 0;
    palmHoldStart = null; palmHoldFired = false;
    twoPalmFrames = 0; twoPalmFired = false;
    twoFistFrames = 0; twoFistFired = false;
    state.debugInfo = { vx: "0", vy: "0", hands: 0, shape0: "—", shape1: "—" };
  }

  function drawLandmarksOnCanvas(ctx, w, h) {
    const CONNS = [
      [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],[0,17],
    ];
    const LINE_COLS = ["rgba(230,255,80,0.8)",  "rgba(80,220,255,0.8)"];
    const DOT_COLS  = ["rgba(255,80,120,0.95)", "rgba(80,180,255,0.95)"];

    _lastLMs.forEach((lm, hi) => {
      if (!lm) return;
      const mx = v => (1 - v.x) * w;
      const my = v => v.y * h;
      ctx.strokeStyle = LINE_COLS[hi] || LINE_COLS[0];
      ctx.lineWidth   = 1.5;
      for (const [a, b] of CONNS) {
        if (!lm[a] || !lm[b]) continue;
        ctx.beginPath();
        ctx.moveTo(mx(lm[a]), my(lm[a]));
        ctx.lineTo(mx(lm[b]), my(lm[b]));
        ctx.stroke();
      }
      ctx.fillStyle = DOT_COLS[hi] || DOT_COLS[0];
      for (const i of [4, 8, 12, 16, 20]) {
        if (!lm[i]) continue;
        ctx.beginPath();
        ctx.arc(mx(lm[i]), my(lm[i]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // One-palm start progress ring
    if (state.palmProgress > 0 && state.handsCount === 1) {
      ctx.strokeStyle = "rgba(80,255,180,0.9)";
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(w/2, h/2, 22, -Math.PI/2, -Math.PI/2 + Math.PI*2*state.palmProgress);
      ctx.stroke();
    }
    // Two-palm pause progress ring
    if (twoPalmFrames > 0 && state.handsCount === 2) {
      ctx.strokeStyle = "rgba(255,180,80,0.9)";
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(w/2, h/2, 22, -Math.PI/2,
              -Math.PI/2 + Math.PI*2*Math.min(twoPalmFrames/GCFG.TWO_PALM_FRAMES, 1));
      ctx.stroke();
    }
    // Two-fist resume progress ring
    if (twoFistFrames > 0 && state.handsCount === 2) {
      ctx.strokeStyle = "rgba(80,180,255,0.9)";
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(w/2, h/2, 22, -Math.PI/2,
              -Math.PI/2 + Math.PI*2*Math.min(twoFistFrames/GCFG.TWO_FIST_FRAMES, 1));
      ctx.stroke();
    }
  }

  function getLastLM() { return _lastLMs[0] || null; }

  return { init, processFrame, drawLandmarksOnCanvas, getLastLM, state };
})();
