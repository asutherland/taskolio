import { html } from '@popeindustries/lit-html-server';
import { unsafeHTML } from '@popeindustries/lit-html-server/directives/unsafe-html.js';

// This is forked from Maschine, changes not yet made.
export class ModeDispatcher {
  rootModes: any;
  modeStack: any;
  modeGeneration: number;
  constructor() {
    // Because of circularity and my desire to have the modes have explicit
    // constructor invocations rather than magic poking-in of the dispatcher,
    // all the actual initialization logic happens in init().

    /**
     * Everytime the mode stack changes, the generation is incremented.
     */
    this.modeGeneration = 0;
  }

  /**
   *
   * @param {ControllerMode[]} rootModes
   *   Ordered array of root modes to live at the bottom of the mode stack.
   */
  init({ rootModes }) {
    this.rootModes = rootModes.concat();
    this.modeStack = rootModes.concat();

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
      // things we got multiples of
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
    const barelyIlluminateLED = () => { return 0; };
    const returnEmptyHTML = () => { return ''; };
    for (const methodName of boundMethods) {
      // Look-up whether we implement a handler to be an explicit fallback if
      // the method isn't implemented by a mode.  (Usually these methods are
      // used to spread high-level requests out amongst specific per-button
      // methods, allowing the modes to be very explicit about what's going on.)
      const unboundFallback = this[`base_${methodName}`];
      let fallback, match;
      if (unboundFallback) {
        fallback = unboundFallback.bind(this);
      } else if (methodName !== 'onUnhandledButton' &&
                 (match = /^on(.+)Button$/.exec(methodName))) {
        const capitalName = match[1];
        // In order to make it possible for a mode to reuse buttons that aren't
        // used by any modes, we implement `onUnhandledButton` as a fallback.
        fallback = (evt) => {
          return this.onUnhandledButton(capitalName, evt);
        };
      } else if (methodName !== 'computeUnhandledLED' &&
                 (match = /^compute(.+)LED$/.exec(methodName))) {
        const capitalName = match[1];
        fallback = (evt) => {
          return this.computeUnhandledLED(capitalName);
        };
      } else if (/LED$/.test(methodName)) {
        fallback = barelyIlluminateLED;
      } else if (/HTML$/.test(methodName)) {
        fallback = returnEmptyHTML;
      } else {
        fallback = nop;
      }
      this[methodName] = this._bindMagicModeStackMethodCallingHelper(
        methodName, fallback);
    }
  }
  onUnhandledButton(capitalName: any, evt: any) {
    throw new Error("Method not implemented.");
  }
  computeUnhandledLED(capitalName: any) {
    throw new Error("Method not implemented.");
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

  /**
   * Helper to invoke a method on all modes currently in the mode stack, a
   * sort of hacky event bus mechanism that allows for solid-looking method
   * signatures.
   */
  notifyModes(methodName, ...args) {
    for (let iMode = this.modeStack.length-1; iMode >= 0; iMode--) {
      const mode = this.modeStack[iMode];
      if (methodName in mode) {
        mode[methodName](...args)
      }
    }
  }

  base_computeGridColors(stt: any) {
    // The driver knows to map this to an all-black 4x4 grid.
    return null;
  }

  base_computeGroupColors(stt: any) {
    // The driver knows to map this to an all-black 4x2 grid.
    return null;
  }

  base_computeTouchStripColors(stt: any) {
    // The driver knows to map this to all 25 LEDs being black.
    return null;
  }

  base_computeDisplayLEDs(stt: any) {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }

  base_computeLabeledLEDs(stt: any) {
    return {
      browse: this.computeBrowseLED(stt),
      sync: this.computeSyncLED(stt),
      quant: this.computeQuantLED(stt),
      capture: this.computeCaptureLED(stt),
      shift: this.base_computeShiftLED(stt),
      reverse: this.computeReverseLED(stt),
      type: this.computeTypeLED(stt),
      size: this.computeSizeLED(stt),
    };
  }

  // we only want to do handle the shift LED ourselves because it's part of our
  // expected idiom to have shift work.
  base_computeShiftLED(stt: any) {
    return stt.shift;
  }

  computeBrowseLED(stt: any) {
    throw new Error("Method not implemented.");
  }
  computeSyncLED(stt: any) {
    throw new Error("Method not implemented.");
  }
  computeQuantLED(stt: any) {
    throw new Error("Method not implemented.");
  }
  computeCaptureLED(stt: any) {
    throw new Error("Method not implemented.");
  }
  computeReverseLED(stt: any) {
    throw new Error("Method not implemented.");
  }
  computeTypeLED(stt: any) {
    throw new Error("Method not implemented.");
  }
  computeSizeLED(stt: any) {
    throw new Error("Method not implemented.");
  }
}
