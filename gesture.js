/* ============================================================
   gesture.js — MediaPipe Hand Tracking + Gesture Detection
   ============================================================
   JUMP    — swipe ONE hand upward quickly
   DUCK    — swipe ONE hand downward quickly
   DASH    — swipe ONE hand to the right
   START   — hold ONE open palm ~700ms
   PAUSE   — TWO open palms at same time
   RESUME  — TWO closed fists at same time
*/
"use strict";

// TUNING — lower thresholds = more responsive, raise if false triggers
const GCFG = {
  HISTORY_LENGTH:        10,   // shorter history = faster reaction
  SWIPE_UP_THRESHOLD:    0.022,// lower = jump triggers more easily
  SWIPE_DOWN_THRESHOLD:  0.020,
  DASH_THRESHOLD:        0.026,
  COOLDOWN_JUMP:         380,  // ms between jumps — shorter = snappier
  COOLDOWN_DUCK:         260,
  COOLDOWN_DASH:         240,
  PALM_HOLD_MS:          650,  // ms to hold palm for start
  TWO_PALM_FRAMES:       8,
  TWO_FIST_FRAMES:       8,
  SMOOTH_FRAMES:         3,    // fewer frames = snappier but slightly noisier
  OPEN_PALM_SPREAD:      0.15,
  FIST_THRESHOLD:        0.10,
  MIN_CONFIDENCE:        0.50,
};

window.GestureEngine = (function () {
  let handLandmarker = null, ready = false, lastVideoTime = -1;
  let histories = [[], []];
  let lastJump = 0, lastDuck = 0, lastDash = 0;
  let palmHoldStart = null, palmHoldFired = false;
  let twoPalmFrames = 0, twoFistFrames = 0;
  let twoPalmFired = false, twoFistFired = false;
  let _lastLMs = [];

  const state = {
    gesture: "none", handPresent: false, handsCount: 0,
    openPalm: false, closedFist: false, pending: [],
    palmProgress: 0,
    debugInfo: { vx:"0", vy:"0", hands:0, shape0:"—", shape1:"—" },
  };

  async function init(videoEl) {
    await _waitForMP();
    const { HandLandmarker, FilesetResolver } = window._MPVision;
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
    );
    const opts = (delegate) => ({
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO", numHands: 2,
      minHandDetectionConfidence: GCFG.MIN_CONFIDENCE,
      minHandPresenceConfidence:  GCFG.MIN_CONFIDENCE,
      minTrackingConfidence:      GCFG.MIN_CONFIDENCE,
    });
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, opts("GPU"));
    } catch(e) {
      handLandmarker = await HandLandmarker.createFromOptions(vision, opts("CPU"));
    }
    ready = true;
    console.log("[GestureEngine] ready ✓");
  }

  function _waitForMP() {
    return new Promise(r => {
      if (window._MPReady) return r();
      window.addEventListener("mp-ready", r, { once: true });
    });
  }

  function processFrame(videoEl) {
    state.pending = [];
    if (!ready || !videoEl || videoEl.readyState < 2) return;
    if (videoEl.currentTime === lastVideoTime) return;
    lastVideoTime = videoEl.currentTime;

    let result;
    try { result = handLandmarker.detectForVideo(videoEl, performance.now()); }
    catch(e) { return; }

    const count = result.landmarks ? result.landmarks.length : 0;
    _lastLMs = [];
    let validCount = 0;

    // Filter face false-positives: reject if wrist is in top 20% of frame
    for (let i = 0; i < count; i++) {
      const lm = result.landmarks[i];
      const wristY = lm[0].y, wristX = lm[0].x;
      if (wristY < 0.20) continue;
      const spread = lm.reduce((s,p) => s + Math.abs(p.x-wristX) + Math.abs(p.y-wristY), 0) / lm.length;
      if (spread < 0.015) continue;
      _lastLMs.push(lm);
      if (++validCount >= 2) break;
    }

    state.handsCount  = validCount;
    state.handPresent = validCount > 0;

    if (validCount === 0) { _resetAll(); return; }

    const now = performance.now();
    const shapes = [];

    for (let hi = 0; hi < Math.min(validCount, 2); hi++) {
      const lm = _lastLMs[hi];
      histories[hi].push({
        wrist:      { x: lm[0].x, y: lm[0].y },
        palmCenter: { x: lm[9].x, y: lm[9].y },
        tips: [lm[4], lm[8], lm[12], lm[16], lm[20]],
      });
      if (histories[hi].length > GCFG.HISTORY_LENGTH) histories[hi].shift();
      shapes.push(_classifyShape(hi));
    }
    if (validCount < 2) histories[1] = [];

    const pShape = shapes[0] || "neutral";
    const pMotion = _classifyMotion(0);
    const sShape  = shapes[1] || "none";

    state.openPalm   = pShape === "open_palm";
    state.closedFist = pShape === "fist";
    state.gesture    = pMotion !== "none" ? pMotion : pShape;
    state.debugInfo  = { vx: state.debugInfo.vx, vy: state.debugInfo.vy,
                         hands: validCount, shape0: pShape, shape1: sShape };

    _fireGestures(pShape, pMotion, sShape, now);
  }

  function _classifyShape(hi) {
    const h = histories[hi];
    if (!h || !h.length) return "unknown";
    const f = h[h.length-1], pc = f.palmCenter;
    const avg = f.tips.reduce((s,t) => s + Math.hypot(t.x-pc.x, t.y-pc.y), 0) / f.tips.length;
    if (avg > GCFG.OPEN_PALM_SPREAD) return "open_palm";
    if (avg < GCFG.FIST_THRESHOLD)   return "fist";
    return "neutral";
  }

  function _classifyMotion(hi) {
    const h = histories[hi];
    if (!h) return "none";
    const n = h.length;
    if (n < GCFG.SMOOTH_FRAMES + 3) return "none";
    const recent = _avgW(h, n-GCFG.SMOOTH_FRAMES, n);
    const older  = _avgW(h, n-GCFG.SMOOTH_FRAMES-3, n-GCFG.SMOOTH_FRAMES);
    const vy = older.y - recent.y;
    const vx = recent.x - older.x;
    state.debugInfo.vy = vy.toFixed(3);
    state.debugInfo.vx = vx.toFixed(3);
    if ( vy >  GCFG.SWIPE_UP_THRESHOLD)   return "swipe_up";
    if (-vy >  GCFG.SWIPE_DOWN_THRESHOLD) return "swipe_down";
    if ( vx >  GCFG.DASH_THRESHOLD)       return "swipe_right";
    return "none";
  }

  function _avgW(h, s, e) {
    const slice = h.slice(Math.max(0,s), Math.min(h.length,e));
    if (!slice.length) return h[h.length-1].wrist;
    return { x: slice.reduce((a,f)=>a+f.wrist.x,0)/slice.length,
             y: slice.reduce((a,f)=>a+f.wrist.y,0)/slice.length };
  }

  function _fireGestures(pShape, pMotion, sShape, now) {
    if (pMotion==="swipe_up"    && now-lastJump > GCFG.COOLDOWN_JUMP)  { lastJump=now; _push("JUMP"); }
    if (pMotion==="swipe_down"  && now-lastDuck > GCFG.COOLDOWN_DUCK)  { lastDuck=now; _push("DUCK"); }
    if (pMotion==="swipe_right" && now-lastDash > GCFG.COOLDOWN_DASH)  { lastDash=now; _push("DASH"); }

    // START — one palm held
    if (state.handsCount===1 && pShape==="open_palm") {
      if (!palmHoldStart) palmHoldStart = now;
      state.palmProgress = Math.min(1,(now-palmHoldStart)/GCFG.PALM_HOLD_MS);
      if (!palmHoldFired && state.palmProgress>=1) { palmHoldFired=true; _push("START"); }
    } else { palmHoldStart=null; palmHoldFired=false; state.palmProgress=0; }

    // PAUSE — both palms
    const bothOpen = state.handsCount===2 && pShape==="open_palm" && sShape==="open_palm";
    if (bothOpen) {
      twoPalmFrames++; twoFistFrames=0; twoFistFired=false;
      if (!twoPalmFired && twoPalmFrames>=GCFG.TWO_PALM_FRAMES) { twoPalmFired=true; _push("PAUSE"); }
    } else { twoPalmFrames=0; twoPalmFired=false; }

    // RESUME — both fists
    const bothFist = state.handsCount===2 && pShape==="fist" && sShape==="fist";
    if (bothFist) {
      twoFistFrames++; twoPalmFrames=0; twoPalmFired=false;
      if (!twoFistFired && twoFistFrames>=GCFG.TWO_FIST_FRAMES) { twoFistFired=true; _push("RESUME"); }
    } else { twoFistFrames=0; twoFistFired=false; }
  }

  function _push(name) { state.gesture=name; state.pending.push(name); }

  function _resetAll() {
    histories=[[[]]]; _lastLMs=[];
    state.gesture="none"; state.openPalm=false; state.closedFist=false;
    state.palmProgress=0;
    palmHoldStart=null; palmHoldFired=false;
    twoPalmFrames=0; twoPalmFired=false;
    twoFistFrames=0; twoFistFired=false;
    state.debugInfo={vx:"0",vy:"0",hands:0,shape0:"—",shape1:"—"};
    histories=[[], []];
  }

  function drawLandmarksOnCanvas(ctx, w, h) {
    const CONNS=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
                 [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
                 [13,17],[17,18],[18,19],[19,20],[0,17]];
    const LC=["rgba(230,255,80,0.8)","rgba(80,220,255,0.8)"];
    const DC=["rgba(255,80,120,0.95)","rgba(80,180,255,0.95)"];
    _lastLMs.forEach((lm,hi)=>{
      if(!lm) return;
      const mx=v=>(1-v.x)*w, my=v=>v.y*h;
      ctx.strokeStyle=LC[hi]||LC[0]; ctx.lineWidth=1.5;
      for(const [a,b] of CONNS){
        if(!lm[a]||!lm[b]) continue;
        ctx.beginPath(); ctx.moveTo(mx(lm[a]),my(lm[a]));
        ctx.lineTo(mx(lm[b]),my(lm[b])); ctx.stroke();
      }
      ctx.fillStyle=DC[hi]||DC[0];
      for(const i of [4,8,12,16,20]){
        if(!lm[i]) continue;
        ctx.beginPath(); ctx.arc(mx(lm[i]),my(lm[i]),3.5,0,Math.PI*2); ctx.fill();
      }
    });
    if(state.palmProgress>0&&state.handsCount===1){
      ctx.strokeStyle="rgba(80,255,180,0.9)"; ctx.lineWidth=4;
      ctx.beginPath();
      ctx.arc(w/2,h/2,22,-Math.PI/2,-Math.PI/2+Math.PI*2*state.palmProgress);
      ctx.stroke();
    }
  }

  function getLastLM() { return _lastLMs[0]||null; }
  return { init, processFrame, drawLandmarksOnCanvas, getLastLM, state };
})();
