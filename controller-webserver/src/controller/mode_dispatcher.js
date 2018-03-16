/**
 *
 */
class ModeDispatcher {
  constructor() {
    // Because of circularity and my desire to have the modes have explicit
    // constructor invocations rather than magic poking-in of the dispatcher,
    // all the actual initialization logic happens in init().
  }

  /**
   *
   * @param {ControllerMode[]} rootModes
   *   Ordered array of root modes to live at the bottom of the mode stack.
   */
  init({ rootModes }) {
    this.rootModes = rootModes.concat();
    this.modeStack = rootModes.concat();

    /**
     * Everytime the mode stack changes, the generation is incremented.
     */
    this.modeGeneration = 0;

    // -- stack-bound methods
    const boundMethods = [
      // the high level display computation methods
      "computeGridColors",
      "computeBankLEDs",
      "computeLabeledLEDs",
      // Our base_computeLabeledLEDs method is actually based on spreading over
      // all of these:
      "computeSyncLED",
      "computeQuantLED",
      "computeCaptureLED",
      "computeShiftLED",
      "computeReverseLED",
      "computeTypeLED",
      "computeSizeLED",
      "computeBrowseLED",
      // - event handling methods
      // things we got multiples off
      "onGridButton",
      "onBankButton",
      "onKnobTurned",
      "onSliderMoved",
      // stepper
      "onStepperButton",
      "onStepperTurned",
      // specific labeled buttons
      "onSyncButton",
      "onQuantButton",
      "onCaptureButton",
      "onShiftButton",
      "onReverseButton",
      "onTypeButton",
      "onSizeButton",
      "onBrowseButton",
    ];

    const nop = () => null;
    for (const methodName of boundMethods) {
      const unboundFallback = this[`base_${methodName}`];
      const fallback = unboundFallback ? unboundFallback.bind(this) : nop;
      this[methodName] = this._bindMagicModeStackMethodCallingHelper(
        methodName, fallback);
    }
  }

  get topMode() {
    return this.modeStack[this.modeStack.length - 1];
  }

  get topModeShortLabel() {
    return this.topMode.modeShortLabel;
  }

  /**
   *
   * @param {ControllerMode} pusherMode
   *   The mode that's pushing a mode onto the stack.  This is provided so that
   *   if a parent mode processes a fall-through button-press event, no special
   *   caller logic is required to pop all of the modes on top of the pusher
   *   because we do it automatically.
   * @param {ControllerMode} pusheeMode
   */
  pushMode(pusherMode, pusheeMode) {
    let pusherIndex = this.modeStack.indexOf(pusherMode);
    if (pusherIndex === -1) {
      throw new Error("Pusher is not on the mode stack already.");
    }

    // If the pusher is a root mode, act like it's the top of the root modes so
    // we don't accidentally pop a root mode.
    pusherIndex = Math.max(this.rootModes.length - 1, pusherIndex);

    // Pop anything above the (effective) pusher.
    if (pusherIndex < this.modeStack.length - 1) {
      this.modeStack.splice(pusherIndex + 1);
    }

    // Check the mode isn't already in the stack.
    if (this.modeStack.indexOf(pusheeMode) !== -1) {
      throw new Error("Attempting to push already-pushed mode.");
    }

    // Now actually push the new mode.
    this.modeStack.push(pusheeMode);
    this.modeGeneration++;
  }

  /**
   * Pop the given mode off the mode-stack, including any modes stacked on top
   * of it.
   */
  popMode(popeeMode) {
    const index = this.modeStack.indexOf(popeeMode);
    if (index === -1) {
      throw new Error("Request to pop non-existent mode.");
    }

    if (index < this.rootModes.length) {
      throw new Error("Trying to pop a root mode!");
    }

    this.modeStack.splice(index);
    this.modeGeneration++;
  }

  /**
   * Given a method name, return a bound method that will find the top-most
   * mode implementing the given method and call it.  The value is cached, keyed
   * by the modeGeneration so the walking and testing only happens when the mode
   * stack changes.  The caching isn't particularly essential, but we already
   * needed the traversal helper, so why not add caching.
   */
  _bindMagicModeStackMethodCallingHelper(methodName, defaultMethod) {
    let cachedBound = null;
    let cachedGeneration = -1;
    return (...args) => {
      if (cachedGeneration !== this.modeGeneration) {
        // If we don't find an implementation, use the default.
        cachedBound = defaultMethod;
        cachedGeneration = this.modeGeneration;

        for (let iMode = this.modeStack.length-1; iMode >= 0; iMode--) {
          const mode = this.modeStack[iMode];
          if (methodName in mode) {
            cachedBound = mode[methodName].bind(mode);
            break;
          }
        }
      }

      return cachedBound(...args);
    };
  }

  base_computeGridColors(stt) {
    // The driver knows to map this to an all-black grid.
    return null;
  }

  base_computeBankLEDs(stt) {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }

  base_computeLabeledLEDs(stt) {
    return {
      browse: this.computeBrowseLED(stt),
      sync: this.computeSyncLED(stt),
      quant: this.computeQuantLED(stt),
      capture: this.computeCaptureLED(stt),
      shift: this.computeShiftLED(stt),
      reverse: this.computeReverseLED(stt),
      type: this.computeTypeLED(stt),
      size: this.computeTypeLED(stt),
    };
  }

  // we only want to do handle the shift LED ourselves because it's part of our
  // expected idiom to have shift work.
  base_computeShiftLED(stt) {
    return stt.shift;
  }
}

module.exports.ModeDispatcher = ModeDispatcher;