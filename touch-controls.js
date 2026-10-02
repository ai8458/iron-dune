// Radial dead zone keeps a resting thumb still, while preserving analog turns.
export function joystickAxes(dx, dy, radius, deadZone = .12) {
  const distance = Math.hypot(dx, dy);
  if (!radius || distance <= radius * deadZone) return { throttle: 0, steer: 0, x: 0, y: 0 };
  const reach = Math.min(distance, radius);
  const strength = (reach / radius - deadZone) / (1 - deadZone);
  return { throttle: -dy / distance * strength, steer: -dx / distance * strength, x: dx / distance * reach, y: dy / distance * reach };
}

export class TouchControls {
  constructor({ joystick, knob, canvas, fireButton, boostButton, zoomButton, isPlaying, onAim, onActivate, onZoom }) {
    this.joystick = joystick; this.knob = knob; this.canvas = canvas;
    this.fireButton = fireButton; this.boostButton = boostButton;
    this.state = { throttle: 0, steer: 0, fire: false, boost: false };
    this.drivePointer = null; this.aimPointer = null; this.firePointers = new Set(); this.firePositions = new Map(); this.captures = new Map();
    this.isPlaying = isPlaying; this.onAim = onAim; this.onActivate = onActivate;

    joystick.addEventListener('pointerdown', event => {
      if (!isPlaying() || this.drivePointer !== null) return;
      onActivate(); event.preventDefault();
      this.drivePointer = event.pointerId;
      this.capture(joystick, event.pointerId);
      const rect = joystick.getBoundingClientRect();
      this.origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width * .32 };
      joystick.classList.add('engaged'); this.moveStick(event);
    });
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !isPlaying() || this.aimPointer !== null) return;
      onActivate(); event.preventDefault();
      this.aimPointer = event.pointerId; this.lastAim = { x: event.clientX, y: event.clientY };
      this.capture(canvas, event.pointerId);
    });
    fireButton.addEventListener('pointerdown', event => {
      if (!isPlaying()) return;
      event.preventDefault(); onActivate();
      this.firePointers.add(event.pointerId); this.state.fire = true;
      this.firePositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
      fireButton.classList.add('pressed'); this.capture(fireButton, event.pointerId);
    });
    // A click is also available to keyboard and assistive-technology users.
    fireButton.addEventListener('click', event => { if (event.detail === 0 && isPlaying()) fireButton.dispatchEvent(new CustomEvent('singlefire')); });
    boostButton.addEventListener('click', () => {
      if (!isPlaying()) return;
      this.state.boost = !this.state.boost;
      boostButton.setAttribute('aria-pressed', String(this.state.boost));
    });
    zoomButton.addEventListener('click', () => { if (isPlaying()) onZoom(); });
    document.addEventListener('pointermove', event => {
      if (!isPlaying()) return;
      if (event.pointerId === this.drivePointer) { event.preventDefault(); this.moveStick(event); }
      if (event.pointerId === this.aimPointer) {
        event.preventDefault(); onAim(event.clientX - this.lastAim.x, event.clientY - this.lastAim.y);
        this.lastAim = { x: event.clientX, y: event.clientY };
      }
      if (this.firePointers.has(event.pointerId)) {
        event.preventDefault();
        const previous = this.firePositions.get(event.pointerId);
        if (this.aimPointer === null) onAim(event.clientX - previous.x, event.clientY - previous.y);
        this.firePositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
    }, { passive: false });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, event => this.release(event.pointerId));
    window.addEventListener('resize', () => this.clear());
  }
  capture(element, pointerId) {
    this.captures.set(pointerId, element);
    try { element.setPointerCapture(pointerId); } catch { /* Synthetic tests and older embedded browsers use document events. */ }
  }
  moveStick(event) {
    const axes = joystickAxes(event.clientX - this.origin.x, event.clientY - this.origin.y, this.origin.radius);
    this.state.throttle = axes.throttle; this.state.steer = axes.steer;
    this.knob.style.transform = `translate(${axes.x}px, ${axes.y}px)`;
  }
  release(pointerId) {
    if (pointerId === this.drivePointer) {
      this.drivePointer = null; this.state.throttle = this.state.steer = 0;
      this.knob.style.transform = ''; this.joystick.classList.remove('engaged');
    }
    if (pointerId === this.aimPointer) this.aimPointer = null;
    this.firePointers.delete(pointerId); this.firePositions.delete(pointerId); this.state.fire = this.firePointers.size > 0;
    this.fireButton.classList.toggle('pressed', this.state.fire);
    const target = this.captures.get(pointerId); this.captures.delete(pointerId);
    try { if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch {}
  }
  clear() {
    for (const id of [...this.captures.keys()]) this.release(id);
    this.drivePointer = this.aimPointer = null; this.firePointers.clear();
    Object.assign(this.state, { throttle: 0, steer: 0, fire: false, boost: false });
    this.knob.style.transform = ''; this.joystick.classList.remove('engaged'); this.fireButton.classList.remove('pressed');
    this.boostButton.setAttribute('aria-pressed', 'false');
  }
}
