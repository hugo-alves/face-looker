// Grid configuration (must match your generated images)
const P_MIN = -15;
const P_MAX = 15;
const STEP = 3;
const SIZE = 256;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function quantizeToGrid(val) {
  const raw = P_MIN + (val + 1) * (P_MAX - P_MIN) / 2; // [-1,1] -> [-15,15]
  const snapped = Math.round(raw / STEP) * STEP;
  return clamp(snapped, P_MIN, P_MAX);
}

function sanitize(val) {
  const str = Number(val).toFixed(1); // force one decimal, e.g. 0 -> 0.0
  return str.replace('-', 'm').replace('.', 'p');
}

function gridToFilename(px, py) {
  return `gaze_px${sanitize(px)}_py${sanitize(py)}_${SIZE}.webp`;
}

function updateDebug(debugEl, x, y, filename) {
  if (!debugEl) return;
  debugEl.innerHTML = `Mouse: (${Math.round(x)}, ${Math.round(y)})<br/>Image: ${filename}`;
}

function initializeFaceTracker(container) {
  const basePath = container.dataset.basePath || '/faces/';
  const showDebug = String(container.dataset.debug || 'false') === 'true';

  const img = document.createElement('img');
  img.className = 'face-image';
  img.alt = 'Face following gaze';
  container.appendChild(img);

  let debugEl = null;
  if (showDebug) {
    debugEl = document.createElement('div');
    debugEl.className = 'face-debug';
    container.appendChild(debugEl);
  }

  let useOrientation = false;
  let baseOrientation = { beta: 0, gamma: 0 };
  let hasCalibrated = false;

  function setFromClient(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const nx = (clientX - centerX) / (rect.width / 2);
    const ny = (centerY - clientY) / (rect.height / 2);

    const clampedX = clamp(nx, -1, 1);
    const clampedY = clamp(ny, -1, 1);

    const px = quantizeToGrid(clampedX);
    const py = quantizeToGrid(clampedY);

    const filename = gridToFilename(px, py);
    const imagePath = `${basePath}${filename}`;
    img.src = imagePath;
    updateDebug(debugEl, clientX - rect.left, clientY - rect.top, filename);
  }

  function handleMouseMove(e) {
    setFromClient(e.clientX, e.clientY);
  }

  function handleTouch(e) {
    if (e.touches && e.touches.length > 0) {
      e.preventDefault();
      const t = e.touches[0];
      setFromClient(t.clientX, t.clientY);
      useOrientation = false; // Disable orientation mode when user touches
    }
  }

  function handleOrientation(e) {
    if (!useOrientation) return;

    // Calibrate on first reading
    if (!hasCalibrated) {
      baseOrientation = { beta: e.beta || 0, gamma: e.gamma || 0 };
      hasCalibrated = true;
    }

    // Get tilt relative to calibrated position
    // beta: front-to-back tilt (-180 to 180), 0 is flat
    // gamma: left-to-right tilt (-90 to 90), 0 is flat
    const beta = (e.beta || 0) - baseOrientation.beta;
    const gamma = (e.gamma || 0) - baseOrientation.gamma;

    // Invert and normalize to [-1, 1] range
    // Tilting phone left (negative gamma) -> face looks right (positive x)
    // Tilting phone away (positive beta) -> face looks down (negative y)
    const nx = clamp(-gamma / 30, -1, 1);  // Inverted: negative gamma = positive x
    const ny = clamp(-beta / 30, -1, 1);   // Inverted: positive beta = negative y

    const px = quantizeToGrid(nx);
    const py = quantizeToGrid(ny);

    const filename = gridToFilename(px, py);
    const imagePath = `${basePath}${filename}`;
    img.src = imagePath;
    if (debugEl) {
      debugEl.innerHTML = `Orientation Mode<br/>Beta: ${beta.toFixed(1)}, Gamma: ${gamma.toFixed(1)}<br/>Image: ${filename}`;
    }
  }

  // Track pointer anywhere on the page
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('touchstart', handleTouch, { passive: false });
  window.addEventListener('touchmove', handleTouch, { passive: false });
  window.addEventListener('deviceorientation', handleOrientation, true);

  // Initialize at center
  const rect = container.getBoundingClientRect();
  setFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);

  // Return API for controlling orientation mode
  return {
    enableOrientation: () => {
      useOrientation = true;
      hasCalibrated = false;
    },
    disableOrientation: () => {
      useOrientation = false;
    }
  };
}

let trackerInstances = [];

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.face-tracker').forEach((el) => {
    const instance = initializeFaceTracker(el);
    trackerInstances.push(instance);
  });

  // Set up orientation button
  const orientationBtn = document.getElementById('orientationBtn');
  const header = document.querySelector('.header');
  let isOrientationMode = false;

  if (orientationBtn) {
    orientationBtn.addEventListener('click', async () => {
      if (!isOrientationMode) {
        // Request permission on iOS 13+
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
              enableOrientationMode();
            } else {
              alert('Motion permission denied. Please enable it in your browser settings.');
            }
          } catch (error) {
            console.error('Error requesting device orientation permission:', error);
            alert('Error enabling motion tracking: ' + error.message);
          }
        } else {
          // Non-iOS or older iOS, no permission needed
          enableOrientationMode();
        }
      } else {
        disableOrientationMode();
      }
    });
  }

  function enableOrientationMode() {
    isOrientationMode = true;
    trackerInstances.forEach(instance => instance.enableOrientation());
    orientationBtn.textContent = 'Disable Motion Tracking';
    header.textContent = 'Tilt your phone - face looks at you!';
  }

  function disableOrientationMode() {
    isOrientationMode = false;
    trackerInstances.forEach(instance => instance.disableOrientation());
    orientationBtn.textContent = 'Enable Motion Tracking';
    header.textContent = 'Move your cursor or tap anywhere';
  }
});
