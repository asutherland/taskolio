const { html } = require('@popeindustries/lit-html-server');
const { unsafeHTML } = require('@popeindustries/lit-html-server/directives/unsafe-html.js');

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
      "computeGroupColors",
      "computeTouchStripColors",
      "computeDisplayLEDs",
      "computeLabeledLEDs",
      "computeIndexedLabeledLEDs",
      "computeHTML",
      // base_computeHTML spreads over these:
      "computeTopHTML",
      "computeCenterHTML",
      "computeBottomHTML",
      // Our base_computeLabeledLEDs method is actually based on spreading over
      // all of these:
      "computeChannelMidiLED",
      "computePluginInstanceLED",
      "computeArrangerLED",
      "computeMixerLED",
      "computeBrowserPluginLED",
      "computeArrowLeftLED",
      "computeArrowRightLED",
      "computeFileSaveLED",
      "computeSettingsLED",
      "computeAutoLED",
      "computeMacroSetLED",
      "computeVolumeLED",
      "computeSwingLED",
      "computeNoteRepeatArpLED",
      "computeTempoLED",
      "computeLockLED",
      "computePitchLED",
      "computeModLED",
      "computePerformFxSelectLED",
      "computeNotesLED",
      "computeRestartLoopLED",
      "computeEraseReplaceLED",
      "computeTapMetroLED",
      "computeFollowGridLED",
      "computePlayLED",
      "computeRecCountInLED",
      "computeStopLED",
      "computeShiftLED",
      "computeFixedVelLED",
      "computePadModeLED",
      "computeKeyboardLED",
      "computeChordsLED",
      "computeStepLED",
      "computeSceneLED",
      "computePatternLED",
      "computeEventsLED",
      "computeVariationNavigateLED",
      "computeDuplicateDoubleLED",
      "computeSelectLED",
      "computeSoloLED",
      "computeMuteChokeLED",
      // And then we have base_computeIndexedLabeledLEDs is over these...
      "computeSamplerLED",
      "computeNavUpLED",
      "computeNavLeftLED",
      "computeNavRightLED",
      "computeNavDownLED",
      //
      "computeUnhandledLED",
      // - event handling methods
      // things we got multiples of
      "onGridButton",
      "onGroupButton",
      "onDisplayButton",
      "onKnobTurned",
      "onSliderMoved",
      "onTouchStripMovement",
      // XXX nav button mapping stuff here?
      "onNavTouchButton",
      "onNavPushButton",
      "onNavUpButton",
      "onNavRightButton",
      "onNavDownButton",
      "onNavLeftButton",

      // specific labeled buttons
      "onChannelMidiButton",
      "onPluginInstanceButton",
      "onArrangerButton",
      "onMixerButton",
      "onBrowserPluginButton",
      "onSamplingButton",
      "onArrowLeftButton",
      "onArrowRightButton",
      "onFileSaveButton",
      "onSettingsButton",
      "onAutoButton",
      "onMacroSetButton",
      "onVolumeButton",
      "onSwingButton",
      "onNoteRepeatArpButton",
      "onTempoButton",
      "onLockButton",
      "onPitchButton",
      "onModButton",
      "onPerformFxSelectButton",
      "onNotesButton",
      "onRestartLoopButton",
      "onEraseReplaceButton",
      "onTapMetroButton",
      "onFollowGridButton",
      "onPlayButton",
      "onRecCountInButton",
      "onStopButton",
      "onShiftButton",
      "onFixedVelButton",
      "onPadModeButton",
      "onKeyboardButton",
      "onChordsButton",
      "onStepButton",
      "onSceneButton",
      "onPatternButton",
      "onEventsButton",
      "onVariationNavigateButton",
      "onDuplicateDoubleButton",
      "onSelectButton",
      "onSoloButton",
      "onMuteChokeButton",
      "onUnhandledButton",
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

  base_computeGridColors(stt) {
    // The driver knows to map this to an all-black 4x4 grid.
    return null;
  }

  base_computeGroupColors(stt) {
    // The driver knows to map this to an all-black 4x2 grid.
    return null;
  }

  base_computeTouchStripColors(stt) {
    // The driver knows to map this to all 25 LEDs being black.
    return null;
  }

  base_computeDisplayLEDs(stt) {
    return [0, 0, 0, 0, 0, 0, 0, 0];
  }

  base_computeLabeledLEDs(stt) {
    return {
      channelMidi: this.computeChannelMidiLED(stt),
      pluginInstance: this.computePluginInstanceLED(stt),
      arranger: this.computeArrangerLED(stt),
      browserPlugin: this.computeBrowserPluginLED(stt),

      arrowLeft: this.computeArrowLeftLED(stt),
      arrowRight: this.computeArrowRightLED(stt),
      fileSave: this.computeFileSaveLED(stt),
      settings: this.computeSettingsLED(stt),
      auto: this.computeAutoLED(stt),
      macroSet: this.computeMacroSetLED(stt),
      // d1-d8
      volume: this.computeVolumeLED(stt),
      swing: this.computeSwingLED(stt),
      noteRepeatArp: this.computeNoteRepeatArpLED(stt),
      tempo: this.computeTempoLED(stt),
      lock: this.computeLockLED(stt),
      pitch: this.computePitchLED(stt),
      mod: this.computeModLED(stt),
      performFxSelect: this.computePerformFxSelectLED(stt),
      notes: this.computeNotesLED(stt),

      restartLoop: this.computeRestartLoopLED(stt),
      eraseReplace: this.computeEraseReplaceLED(stt),
      tapMetro: this.computeTapMetroLED(stt),
      followGrid: this.computeFollowGridLED(stt),
      play: this.computePlayLED(stt),
      recCountIn: this.computeRecCountInLED(stt),
      stop: this.computeStopLED(stt),
      shift: this.computeShiftLED(stt),
      fixedVel: this.computeFixedVelLED(stt),
      padMode: this.computePadModeLED(stt),
      keyboard: this.computeKeyboardLED(stt),
      chords: this.computeChordsLED(stt),
      step: this.computeStepLED(stt),
      scene: this.computeSceneLED(stt),
      pattern: this.computePatternLED(stt),
      events: this.computeEventsLED(stt),
      variationNavigate: this.computeVariationNavigateLED(stt),
      duplicateDouble: this.computeDuplicateDoubleLED(stt),
      select: this.computeSelectLED(stt),
      solo: this.computeSoloLED(stt),
      muteChoke: this.computeMuteChokeLED(stt),
    };
  }

  base_computeIndexedLabeledLEDs(stt) {
    return {
      sampler: this.computeSamplerLED(stt),

      navUp: this.computeNavUpLED(stt),
      navLeft: this.computeNavLeftLED(stt),
      navRight: this.computeNavRightLED(stt),
      navDown: this.computeNavDownLED(stt),
    };
  }

  // we only want to do handle the shift LED ourselves because it's part of our
  // expected idiom to have shift work.
  base_computeShiftLED(stt) {
    return stt.shift;
  }

  base_computeHTML(stt, iDisplay) {
    const outerStyle = `
width: 100%;
height: 100%;
color: white;
background-color: black;
font-size: 16px;
`.replace(/\n/g, ' ');
    const styleBlock = `<style>
.mainGrid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-column-gap: 8px;
}

.displayButton {
  grid-column: span 2;
  padding: 0 2px;
}
.displayButton:nth-child(odd) {
  border-left: 2px solid #ccc;
  border-right: 2px solid #666;
}
.displayButton:nth-child(even) {
  grid-row: 2;
  border-right: 2px solid #ccc;
  text-align: right;
}

/* Separate the display button top tabs from the grid area. */
.topGridRow {
  margin-top: 8px;
}
.gridButton {
  grid-column: span 2;
  min-height: 2.2em;
  max-height: 2.2em;
  line-height: 1.1em;
  border: 2px solid #222;
}

.mainGrid > div {
  overflow: hidden;
}

.taskDescription {
  margin-top: 8px;
  grid-column: span 4;
}

.fullCenter {
  grid-column-start: 1;
  grid-column-end: 4;
}
</style>`

    const topHtml = this.computeTopHTML(stt, iDisplay);
    const centerHtml = this.computeCenterHTML(stt, iDisplay);
    const bottomHtml = this.computeBottomHTML(stt, iDisplay);

    return html`<div xmlns="http://www.w3.org/1999/xhtml" style="${outerStyle.replace('"', "''")}">
  ${unsafeHTML(styleBlock)}
  <div class="mainGrid">
    ${topHtml}
    ${centerHtml}
    ${bottomHtml}
  </div>
</div>`;
  }
}

module.exports.ModeDispatcher = ModeDispatcher;
