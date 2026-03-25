/* ============================================================
   sketch.js — p5.js entry point + webcam init + HUD
   ============================================================
   Keyboard fallback:
     SPACE / UP  = Jump       DOWN = Duck     D = Dash
     ENTER / R   = Start      P   = Pause/Resume
     F           = Debug HUD  V   = Webcam preview
*/
"use strict";

new p5(function (p) {

  const videoEl     = document.getElementById("webcam");
  const camCanvas   = document.getElementById("cam-canvas");
  const camWrap     = document.getElementById("cam-preview-wrap");
  const camToggle   = document.getElementById("cam-toggle");
  const debugHud    = document.getElementById("debug-hud");
  const debugToggle = document.getElementById("debug-toggle");
  const dGesture    = document.getElementById("d-gesture");
  const dHand       = document.getElementById("d-hand");
  const dVxy        = document.getElementById("d-vxy");
  const dPalm       = document.getElementById("d-palm");
  const dFps        = document.getElementById("d-fps");
  const dState      = document.getElementById("d-state");
  const dSpeed      = document.getElementById("d-speed");

  let camCtx      = null;
  let camVisible  = true;
  let hudVisible  = true;
  let webcamReady  = false;
  let gestureReady = false;

  p.setup = function () {
    const cnv = p.createCanvas(window.innerWidth, window.innerHeight);
    cnv.parent("canvas-container");
    p.colorMode(p.RGB, 255);
    p.frameRate(60);
    Game.init(p);
    camCtx = camCanvas.getContext("2d");
    camToggle.addEventListener("click", _toggleCam);
    debugToggle.addEventListener("click", _toggleHud);
    _startWebcam();
  };

  p.draw = function () {
    const dt = Math.min(p.deltaTime / 1000, 0.05);

    if (webcamReady && gestureReady) {
      GestureEngine.processFrame(videoEl);
    }

    for (const g of GestureEngine.state.pending) {
      Game.handleGesture(g);
    }

    Game.update(dt);
    p.background(4, 6, 15);
    Game.draw();

    if (camVisible && webcamReady) {
      _renderCamPreview();
    }

    _updateHud();
  };

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
        }
      });
    } catch (err) {
      console.warn("[sketch] Webcam denied:", err);
      window._pendingLoad = "NO WEBCAM — keyboard controls active";
      webcamReady = false;
    }
  }

  function _renderCamPreview() {
    if (!camCtx || !videoEl.videoWidth) return;
    const cw = camCanvas.width  = camCanvas.offsetWidth  || 200;
    const ch = camCanvas.height = camCanvas.offsetHeight || 112;
    camCtx.save();
    camCtx.translate(cw, 0);
    camCtx.scale(-1, 1);
    camCtx.drawImage(videoEl, 0, 0, cw, ch);
    camCtx.restore();
    if (GestureEngine.state.handPresent) {
      GestureEngine.drawLandmarksOnCanvas(camCtx, cw, ch);
    }
  }

  function _updateHud() {
    if (!hudVisible) return;
    const s  = GestureEngine.state;
    const di = s.debugInfo || {};
    dGesture.textContent = s.gesture || "—";
    dHand.textContent    = `${s.handsCount||0} hand${s.handsCount!==1?"s":""}`;
    dVxy.textContent     = `vx=${di.vx||"0"} vy=${di.vy||"0"}`;
    dPalm.textContent    = s.palmProgress > 0
      ? (s.palmProgress * 100).toFixed(0) + "%"
      : `h0:${di.shape0||"—"} h1:${di.shape1||"—"}`;
    dFps.textContent     = Math.round(p.frameRate());
    dState.textContent   = Game.getState().toUpperCase();
    dSpeed.textContent   = "—";
  }

  function _toggleCam() {
    camVisible = !camVisible;
    camWrap.classList.toggle("hidden", !camVisible);
  }

  function _toggleHud() {
    hudVisible = !hudVisible;
    debugHud.classList.toggle("collapsed", !hudVisible);
    debugToggle.textContent = hudVisible ? "HIDE" : "SHOW";
  }

  p.keyPressed = function () {
    const k  = p.key;
    const kc = p.keyCode;
    if (k === " " || kc === p.UP_ARROW)         Game.handleGesture("JUMP");
    if (kc === p.DOWN_ARROW)                     Game.handleGesture("DUCK");
    if (k === "d" || k === "D")                  Game.handleGesture("DASH");
    if (kc === p.ENTER || k === "r" || k === "R") Game.handleGesture("START");
    if (k === "p" || k === "P") {
      if (Game.getState() === "playing")      Game.handleGesture("PAUSE");
      else if (Game.getState() === "paused")  Game.handleGesture("RESUME");
    }
    if (k === "f" || k === "F") _toggleHud();
    if (k === "v" || k === "V") _toggleCam();
  };

  p.windowResized = function () {
    p.resizeCanvas(window.innerWidth, window.innerHeight);
    Game.resize();
  };

}, document.getElementById("canvas-container"));
