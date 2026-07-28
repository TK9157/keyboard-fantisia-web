/**
 * Keyboard Fantasia — Rotary Dial Controller
 * Handles radial drag interaction for the volume dial
 */

export class RotaryDial {
  /**
   * @param {HTMLElement} dialElement - The dial body element to rotate
   * @param {HTMLElement} containerElement - The outer container for event tracking
   * @param {function} onValueChange - Callback with value 0-100
   * @param {number} initialValue - Initial value 0-100
   */
  constructor(dialElement, containerElement, onValueChange, initialValue = 50) {
    this.dial = dialElement;
    this.container = containerElement;
    this.onValueChange = onValueChange;
    this.value = initialValue;

    // Angle mapping: 30° to 330° (300° range)
    this.minAngle = -150;  // degrees from top
    this.maxAngle = 150;
    this.angleRange = this.maxAngle - this.minAngle;

    this._isDragging = false;
    this._lastAngle = null;

    // Set initial rotation
    this._setRotation(this._valueToAngle(initialValue));

    // Bind events
    this._bindEvents();
  }

  /**
   * Convert value (0-100) to angle
   */
  _valueToAngle(value) {
    return this.minAngle + (value / 100) * this.angleRange;
  }

  /**
   * Convert angle to value (0-100)
   */
  _angleToValue(angle) {
    const normalized = ((angle - this.minAngle) / this.angleRange) * 100;
    return Math.max(0, Math.min(100, normalized));
  }

  /**
   * Get angle from pointer position relative to center
   */
  _getAngleFromEvent(e) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const dx = clientX - centerX;
    const dy = clientY - centerY;

    // atan2 gives angle from positive X axis; we want from top (negative Y)
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);

    return angle;
  }

  /**
   * Set the visual rotation
   */
  _setRotation(angle) {
    this.dial.style.transform = `rotate(${angle}deg)`;
  }

  /**
   * Bind pointer/touch events
   */
  _bindEvents() {
    // Pointer events (mouse + touch unified)
    this.container.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._isDragging = true;
      this.container.setPointerCapture(e.pointerId);
      this.container.classList.add('is-adjusting');

      const angle = this._getAngleFromEvent(e);
      this._handleAngle(angle);
    });

    this.container.addEventListener('pointermove', (e) => {
      if (!this._isDragging) return;
      e.preventDefault();

      const angle = this._getAngleFromEvent(e);
      this._handleAngle(angle);
    });

    this.container.addEventListener('pointerup', (e) => {
      this._isDragging = false;
      this.container.releasePointerCapture(e.pointerId);
      this.container.classList.remove('is-adjusting');
    });

    this.container.addEventListener('pointercancel', (e) => {
      this._isDragging = false;
      this.container.classList.remove('is-adjusting');
    });

    // Mouse wheel support
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -2 : 2;
      this.value = Math.max(0, Math.min(100, this.value + delta));

      const angle = this._valueToAngle(this.value);
      this._setRotation(angle);
      this.onValueChange(this.value);
    }, { passive: false });
  }

  /**
   * Handle angle input and clamp to range
   */
  _handleAngle(angle) {
    // Clamp angle to our range
    const clamped = Math.max(this.minAngle, Math.min(this.maxAngle, angle));

    this.value = this._angleToValue(clamped);
    this._setRotation(clamped);
    this.onValueChange(this.value);
  }

  /**
   * Set value programmatically
   */
  setValue(value) {
    this.value = Math.max(0, Math.min(100, value));
    this._setRotation(this._valueToAngle(this.value));
  }

  /**
   * Clean up
   */
  destroy() {
    // Events are bound to the container element and will be GC'd with it
  }
}
