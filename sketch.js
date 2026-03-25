/* ============================================================
   sketch.js — p5.js entry point + webcam init + HUD
   ============================================================
   Wires together: GestureEngine (gesture.js) + Game (game.js)

   Keyboard fallback (no webcam needed for testing):
     SPACE / UP   = Jump
     DOWN         = Duck
     D            = Dash
     ENTER        = Start / Restart
     P            = Pause / Resume
     F            = Toggle debug HUD
     V            = Toggle webcam preview
*/
"use strict";

new p5(function (p) {

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const videoEl     = document.getElementById("webcam");
  const camCanvas   = document.getElementById("cam-canvas");
  const camWrap     = document.getElementById("cam-preview-wrap");
  const camToggle   = document.getElementById("cam-toggle");
  const debugHud    = document.getElementById("debug-hud");
  const debugToggle = document.getElementById("debug-toggle");

  // Debug fields
  const dGesture = document.getElementById("d-gesture");
  const dHand    = document.getElementById("d-hand");
  const dVxy     = document.getElementById("d-vxy");
  const dPalm    = document.getElementById("d-palm");
  const dFps     = document.getElementById("d-fps");
  const dState   = document.getElementById("d-state");
  const dSpeed   = document.getElementById("d-speed");

  let camCtx     = null;
  let camVisible = true;
  let hudVisible = true;
  let webcamReady = false;
  let gestureReady = false;

  // ── p5 setup ──────────────────────────────────────────────────────────────
  p.setup = function () {
    const cnv = p.createCanvas(window.innerWidth, window.innerHeight);
    cnv.parent("canvas-container");
    p.colorMode(p.RGB, 255);
    p.frameRate(60);

    // Init game with the p5 instance
    Game.init(p);

    // Webcam preview canvas context
    camCtx = camCanvas.getContext("2d");

    // Button listeners
    camToggle.addEventListener("click", _toggleCam);
    debugToggle.addEventListener("click", _toggleHud);

    // Start webcam → then MediaPipe
    _startWebcam();
  };

  // ── p5 draw (~60 fps) ─────────────────────────────────────────────────────
  p.draw = function () {
    // dt in seconds (capped to avoid spiral of death on tab-hide)
    const dt = Math.min(p.deltaTime / 1000, 0.05);

    // 1. Run MediaPipe hand landmark detection on latest video frame
    if (webcamReady && gestureReady) {
      GestureEngine.processFrame(videoEl);
    }

    // 2. Forward any gestures fired this frame to the game
    for (const g of GestureEngine.state.pending) {
      Game.handleGesture(g);
    }

    // 3. Update game state
    Game.update(dt);

    // 4. Draw game (backgrounds, obstacles, player, particles, UI)
    p.background(4, 6, 15);
    Game.draw();

    // 5. Webcam corner preview with landmark overlay
    if (camVisible && webcamReady) {
      _renderCamPreview();
    }

    // 6. Update the debug HUD DOM elements
    _updateHud();
  };

  // ── Webcam initialisation ─────────────────────────────────────────────────
  async function _startWebcam() {
    window._pendingLoad = "REQUESTING WEBCAM…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
        audio: false,
      });
      videoEl.srcObject = stream;
      videoEl.addEventListener("loadeddata", async () => {
        webcamReady = true;
        window._pendingLoad = "LOADING HAND TRACKER MODEL…";
        console.log("[sketch] Webcam ready");
        try {
          await GestureEngine.init(videoEl);
          gestureReady = true;
          window._pendingLoad = null;
          console.log("[sketch] GestureEngine ready");
        } catch (err) {
          console.error("[sketch] GestureEngine init failed:", err);
          window._pendingLoad = "HAND TRACKER FAILED — keyboard controls active";
          gestureReady = false;
        }
      });
    } catch (err) {
      console.warn("[sketch] Webcam denied or unavailable:", err);
      window._pendingLoad = "NO WEBCAM — keyboard controls active";
      // Allow game to be played with keyboard fallback
      webcamReady = false;
    }
  }

  // ── Webcam corner preview ─────────────────────────────────────────────────
  function _renderCamPreview() {
    if (!camCtx || !videoEl.videoWidth) return;

    // Size canvas to element's CSS size
    const cw = camCanvas.width  = camCanvas.offsetWidth  || 200;
    const ch = camCanvas.height = camCanvas.offsetHeight || 112;

    // Draw mirrored video
    // Note: CSS applies scaleX(-1) to #cam-canvas already for display,
    // but we must un-mirror the raw draw so skeleton coords are correct.
    camCtx.save();
    camCtx.translate(cw, 0);
    camCtx.scale(-1, 1);
    camCtx.drawImage(videoEl, 0, 0, cw, ch);
    camCtx.restore();

    // Overlay hand skeleton + fingertip dots
    const lm = GestureEngine.getLastLM();
    if (lm) {
      GestureEngine.drawLandmarksOnCanvas(camCtx, cw, ch, lm);
    }
  }

  // ── Debug HUD update ──────────────────────────────────────────────────────
  function _updateHud() {
    if (!hudVisible) return;
    const s  = GestureEngine.state;
    const di = s.debugInfo || {};
    dGesture.textContent = s.gesture      || "—";
    dHand.textContent    = s.handPresent  ? "YES" : "NO";
    dVxy.textContent     = `vx=${di.vx||"0"} vy=${di.vy||"0"}`;
    dPalm.textContent    = s.palmProgress ? (s.palmProgress * 100).toFixed(0) + "%" : "—";
    dFps.textContent     = Math.round(p.frameRate());
    dState.textContent   = Game.getState().toUpperCase();
    dSpeed.textContent   = "—"; // filled by game internally; left as placeholder
  }

  // ── Button / key toggles ──────────────────────────────────────────────────
  function _toggleCam() {
    camVisible = !camVisible;
    camWrap.classList.toggle("hidden", !camVisible);
  }

  function _toggleHud() {
    hudVisible = !hudVisible;
    debugHud.classList.toggle("collapsed", !hudVisible);
    debugToggle.textContent = hudVisible ? "HIDE" : "SHOW";
  }

  // ── Keyboard fallback ─────────────────────────────────────────────────────
  p.keyPressed = function () {
    const k  = p.key;
    const kc = p.keyCode;

    if (k === " " || kc === p.UP_ARROW)   Game.handleGesture("JUMP");
    if (kc === p.DOWN_ARROW)              Game.handleGesture("DUCK");
    if (k === "d" || k === "D")           Game.handleGesture("DASH");
    if (kc === p.ENTER || k === "r" || k === "R") Game.handleGesture("START");
    if (k === "p" || k === "P")           Game.handleGesture("PAUSE");
    if (k === "f" || k === "F")           _toggleHud();
    if (k === "v" || k === "V")           _toggleCam();
  };

  // ── Canvas resize ─────────────────────────────────────────────────────────
  p.windowResized = function () {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    Game.resize();
  };

}, document.getElementById("canvas-container"));
