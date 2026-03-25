# PHANTOM RUN — Gesture-Controlled Endless Runner

A browser-based endless runner controlled by your webcam hand gestures.
Built with p5.js + MediaPipe Tasks Vision.

---

## ⚡ Quick Start (Mac)

**You MUST run this through a local HTTP server** — webcams and WASM modules
don't work if you just open index.html directly.

### Option A — Python (easiest, built into macOS)

```bash
cd /path/to/gesture-runner
python3 -m http.server 8080
```
Then open: http://localhost:8080

### Option B — Node.js serve

```bash
npm i -g serve
serve .
```

### Option C — VS Code Live Server extension

Right-click index.html → "Open with Live Server"

---

## 🎮 Controls

| Gesture | Action |
|---|---|
| ✋ Open palm held ~1 sec | Start / Restart |
| ↑ Swipe hand upward | Jump (double-jump supported) |
| ↓ Swipe hand downward | Duck / Slide |
| → Swipe hand to the right | Dash (speed burst) |
| ✊ Closed fist held | Pause / Resume |

### Keyboard fallbacks (for testing without camera)
- Space / ↑ = Jump
- S / ↓ = Duck  
- A = Dash
- Enter / R = Start/Restart
- P = Pause
- D = Toggle debug panel
- V = Toggle camera preview

---

## 🗂 File Structure

```
gesture-runner/
├── index.html    — Entry point, loads fonts + scripts
├── style.css     — All visual styling, dark cinematic theme
├── gesture.js    — GestureManager: MediaPipe + custom swipe detection
├── game.js       — GameState, Player, Obstacle, Particle physics
├── sketch.js     — p5.js draw loop, rendering, UI screens
└── README.md     — This file
```

---

## 🎛 Key Parameters to Tune

### Gesture sensitivity (gesture.js → GESTURE_CONFIG)

| Parameter | Default | Increase to... |
|---|---|---|
| SWIPE_UP_THRESHOLD | 0.026 | Require faster/bigger upswipe |
| SWIPE_DOWN_THRESHOLD | 0.024 | Require faster downswipe |
| DASH_RIGHT_THRESHOLD | 0.030 | Reduce accidental dashes |
| COOLDOWN_JUMP | 650ms | Prevent double-triggers |
| PALM_HOLD_DURATION | 900ms | Require longer palm hold |
| FIST_HOLD_FRAMES | 12 | Require longer fist |
| HISTORY_LENGTH | 14 | More = smoother but more lag |
| SMOOTH_FRAMES | 4 | More = smoother motion detection |

### Game feel (game.js → GAME_CFG)

| Parameter | Default | Effect |
|---|---|---|
| GRAVITY | 0.72 | Higher = heavier feel |
| JUMP_FORCE | -16 | More negative = higher jump |
| BASE_SPEED | 5 | Starting game speed |
| MAX_SPEED | 18 | Cap on speed ramp |
| SPEED_INCREMENT | 0.0008 | How fast game accelerates |
| OBSTACLE_MIN_GAP | 420 | Minimum space between obstacles |

---

## 🐛 Common Issues & Fixes

**"Cannot access webcam"**  
→ Make sure you're serving via http://localhost (not file://)  
→ Allow camera in browser popup

**Gestures trigger too often / randomly**  
→ Raise SWIPE_*_THRESHOLD values  
→ Raise COOLDOWN_JUMP / COOLDOWN_DUCK

**Gestures don't trigger at all**  
→ Lower SWIPE_*_THRESHOLD values  
→ Make sure lighting is decent on your hand

**Game crashes or MediaPipe fails to load**  
→ Check browser console for errors  
→ Try Chrome or Edge (best WebGL support)  
→ GPU delegate sometimes fails; the code will retry with CPU

**Parallax layers look wrong on resize**  
→ Resize your window; `windowResized()` in sketch.js handles it

---

## 🎨 Re-theming

Edit the `COL` object at the top of `sketch.js`:
```js
const COL = {
  bg0: "#020308",   // top sky colour
  bg1: "#0c1322",   // horizon colour
  player: "#e8dcc8", // player silhouette
  // ... etc
};
```

Change Google Font in index.html `<link>` tag and update `textFont()` calls in sketch.js.
