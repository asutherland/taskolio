"use strict";

const Mk3 = require("node-traktor-f1/lib/maschine_mk3");

const { renderToString } = require('@popeindustries/lit-html-server');

const COLOR_BLACK = 0;
const BLANK_ROW = [COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK];
const BLANK_GRID = [...BLANK_ROW, ...BLANK_ROW, ...BLANK_ROW, ...BLANK_ROW];
const BLANK_GROUPS = [COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK,
                      COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK];
const BLANK_BANKS = [0, 0, 0, 0, 0, 0, 0, 0];
const BLANK_TOUCHSTRIP = [];
{
  for (let i=0; i < 25; i++) {
    BLANK_TOUCHSTRIP.push(COLOR_BLACK);
  }
}

/**
 * Abstracts interaction with the actual Kontrol F1 hardware using the
 * node-traktor-f1 library (which has a very cool demo app if you have one and
 * just want to see it do cool things! :).
 *
 * The ModeDispatcher uses a magic onFoo() idiom for readability for "foo"
 * events.  We perform the EventEmitter idiom-conversion here.  (The
 * node-traktor-f1 library style makes sense on its own and directly pushing
 * our changes into it would make for an otherwise useless fork.)
 */
class ControllerDriver {
  constructor({ dispatcher, log, asyncRenderHTML, colorHelper }) {
    const controller = this.controller = new Mk3();
    this.dispatcher = dispatcher;
    this.log = log;
    this.asyncRenderHTML = asyncRenderHTML;
    this.colorHelper = colorHelper;
    this.colorHelper.indexed_led_mapping = controller.indexed_led_mapping;

    this.buttonStates = {};
    this.sliderStates = [];
    this.knobStates = [];
    this.touchStripStates = [];

    /**
     * For each display, the HTML of what is currently displayed.
     */
    this.htmlDisplayed = new Array(controller.displays.numDisplays);
    /**
     * For each display, the HTML of what we most recently asked to be rendered.
     * When we get the render back for a display, the value moves to
     * `htmlDisplayed`.  If there is a value for the display in `htmlDesired`,
     * we kick off another render and move the value to `htmlPending`.
     */
    this.htmlPending = new Array(controller.displays.numDisplays);
    /**
     * The most recently desired HTML contents for the given display, and which
     * has not yet been issued to a html-rendering-capable client.  This can
     * be clobbered if we are generating new desired HTML state faster than we
     * can render it or, more likely, if we're simply not connected to such a
     * client at the current moment.
     */
    this.htmlDesired = new Array(controller.displays.numDisplays);
    // See updateHTML().
    this._htmlUpdatePending = false;

    this._bindButtons();

    this._bindEventFamily("s", "changed", 4, this.sliderStates,
                          "slider", "onSliderMoved");
    this._bindEventFamily("k", "changed", 8, this.knobStates,
                          "knob", "onKnobTurned");
    this._bindEventFamily("touchStrip", "changed", 2, this.touchStripStates,
                          "touchStrip", "onTouchStripMovement");
    // TODO: expose the stepper's onStepperTurned event.  I'm not doing it yet
    // because it looks like node-traktor-f1 likely has a wraparound bug.
  }

  updateLEDs() {
    const ctrl = this.controller;

    const stt = this._latchState();

    // -- Grid
    const gridColors = this.dispatcher.computeGridColors(stt) || BLANK_GRID;
    for (let iGrid = 0; iGrid < 16; iGrid++) {
      const index = gridColors[iGrid];
      ctrl.setIndexedColor(`p${ iGrid + 1}`, index);
    }

    // -- Group
    const groupColors = this.dispatcher.computeGroupColors(stt) || BLANK_GROUPS;
    for (let iGroup = 0; iGroup < 8; iGroup++) {
      const index = groupColors[iGroup];
      ctrl.setIndexedColor(`g${ iGroup + 1}`, index);
    }

    // -- Touch Strip
    const tsColors = this.dispatcher.computeTouchStripColors(stt) || BLANK_TOUCHSTRIP;
    for (let iTS = 0; iTS < 25; iTS++) {
      const index = tsColors[iTS];
      ctrl.setIndexedColor(`ts${ iTS + 1}`, index);
    }

    // -- Display Buttons
    const displayLEDs = this.dispatcher.computeDisplayLEDs(stt) || BLANK_BANKS;
    for (let iDisplay = 0; iDisplay < 8; iDisplay++) {
      ctrl.setLED(`d${iDisplay + 1}`, displayLEDs[iDisplay]);
    }

    // -- Labeled LEDs (monocolor, usually white)
    const labeledLEDs = this.dispatcher.computeLabeledLEDs(stt);
    for (let [key, value] of Object.entries(labeledLEDs)) {
      ctrl.setLED(key, value);
    }

    // -- Indexed Labeled LEDs
    const indexedLEDs = this.dispatcher.computeIndexedLabeledLEDs(stt);
    for (let [key, value] of Object.entries(indexedLEDs)) {
      ctrl.setIndexedColor(key, value);
    }

    // -- HTML
    this.updateHTML(stt);
  }

  /**
   * Recomputes HTML displays for the modes and issues rendering requests if
   * needed.  This uses a very dumb/simple Promise-based debouncing to minimize
   * same-event-loop-dispatch churn.  There's slightly more complicated flow
   * control going on beyond that state, but we're assuming the calls to
   * computeHTML aren't free, hence the Promise debouncing.  A setTimeout(0)
   * approach might also be appropriate, although I need to understand how
   * node.js handles differentiating tasks/micro-tasks as to whether that
   * actually changes things.
   */
  async updateHTML(stt) {
    if (this._htmlUpdatePending) {
      return;
    }
    this._htmlUpdatePending = true;
    // yield control flow / go async
    await Promise.resolve();
    this._htmlUpdatePending = false;

    const ctrl = this.controller;
    if (!stt) {
      stt = this._latchState();
    }

    if (ctrl.displays) {
      for (let iDisplay = 0; iDisplay < ctrl.displays.numDisplays; iDisplay++) {
        const recentHtml = this.htmlDesired[iDisplay] ||
                           this.htmlPending[iDisplay] ||
                           this.htmlDisplayed[iDisplay];

        const desiredHtml = await renderToString(
          this.dispatcher.computeHTML(stt, iDisplay, ctrl.displays));
        if (desiredHtml !== recentHtml) {
          // it's async, but run for side-effect, no need to wait
          //console.log('...want to update display', iDisplay, 'to', desiredHtml);
          this.setDisplayHTML(iDisplay, desiredHtml);
        }
      }
    }
  }

  async setDisplayHTML(iDisplay, html) {
    // If we already have a pending render, then just stash the HTML in desired
    // and the active instance of ourselves will re-trigger once it's done.
    if (this.htmlPending[iDisplay]) {
      //console.log('  already pending HTML, saving to desired');
      this.htmlDesired[iDisplay] = html;
      return;
    }

    // Check that this isn't already what we've displayed.  This has some
    // overlap with the logic in updateHTML, but we may potentially end up
    // having this method called directly as we experiment here...
    if (this.htmlDisplayed[iDisplay] === html) {
      //console.log('  already displaying desired HTML, bailing');
      return;
    }

    /*
    console.log('updating display', iDisplay,
     'to', html
    );
    */
    // Otherwise do note that this is now the pending HTML...
    this.htmlPending[iDisplay] = html;

    const { imageArray } = await this.asyncRenderHTML({
      width: this.controller.displays.width,
      height: this.controller.displays.height,
      mode: 'rgb16',
      htmlStr: html
    });

    //console.log('got rendering data, blitting');
    // we wait for this to fully be sent as a form of flow-control
    await this.controller.displays.paintDisplayFromArray(iDisplay, imageArray);

    this.htmlDisplayed[iDisplay] = html;
    this.htmlPending[iDisplay] = null;

    if (this.htmlDesired[iDisplay]) {
      html = this.htmlDesired[iDisplay];
      this.htmlDesired[iDisplay] = null;
      return this.setDisplayHTML(iDisplay, html);
    }
    // otherwise, we're done.
  }

  /**
   * Capture the current state of the controller as we understand it on a fresh
   * object that we will not subsequently updated;
   */
  _latchState() {
    // the grid button states are currently in the buttonStates too.  If we
    // thought they might be used, it would probably be appropriate to break
    // them out to be their own array too.
    const stt = Object.assign({}, this.buttonStates);
    stt.sliders = this.sliderStates.concat();
    stt.knobs = this.knobStates.concat();
    this.touchStrips = this.touchStripStates.concat();
    return stt;
  }

  /**
   * Make a button event that captures the current state of all buttons when
   * pressed.
   */
  _makeButtonEvent(name, index) {
    const evt = this._latchState();
    evt.name = name;
    evt.index = index;
    return evt;
  }

  _makeValueEvent(name, index, value) {
    const evt = this._makeButtonEvent(name, index);
    evt.value = value;
    return evt;
  }

  /**
   * Event binding helper for sliders/knobs/touchstrips.
   *
   * @param baseName
   *   The prefix for instances of the control that will be suffixed with an
   *   index.  For example "s" for sliders named "s1", "s2", etc.
   * @param eventSuffix
   *   The event type that suffixes the control name, so for a slider "s1" that
   *   emits event "s1:changed" when moved, this would be "changed".
   * @param count
   *   How many instances of this control are there?  Indices are assumed to
   *   start at 1 in name-space, but we'll map this to a 0-based index.
   * @param stateArray
   *   Reference to the array where the state for these controls should be
   *   stored, and that `_latchState` will capture when generating an event.
   * @param type
   *   The type to report on the event object.
   */
  _bindEventFamily(baseName, eventSuffix, count, stateArray, type, methodName) {
    for (let i = 0; i < count; i++) {
      const eventName = `${baseName}${i+1}:${eventSuffix}`;
      const index = i;
      this.controller.on(eventName, (e) => {
        stateArray[index] = e.value;
        const evt = this._makeValueEvent(type, index, e.value);
        this.dispatcher[methodName](evt);
        this.updateLEDs();
      });
    }
  }

  _bindButtons() {
    for (const name of Object.keys(this.controller.buttons)) {
      const initialCap = name.slice(0, 1).toUpperCase() + name.slice(1);
      let methodName;
      let index;
      let match;
      // by default we don't generate an event for something being pressed.
      let pressMethodName;
      if (/^p\d+$/.test(name)) {
        methodName = "onGridButton";
        index = parseInt(name.slice(1), 10) - 1;
      } else if (/^g\d+$/.test(name)) {
        methodName = "onGroupButton";
        index = parseInt(name.slice(1), 10) - 1;
      } else if (/^d\d+$/.test(name)) {
        methodName = "onDisplayButton";
        index = parseInt(name.slice(1), 10) - 1;
      } else if ((match = /^knobTouch(\d+)$/.exec(name))) {
        methodName = "onKnobTouch";
        index = parseInt(match[1], 10) - 1;
      } else if (initialCap == "NavTouch") {
        pressMethodName = "onNavTouchPressed";
        methodName = "onNavTouchReleased";
        index = null;
      } else {
        methodName = `on${initialCap}Button`;
        index = null;
      }

      this.buttonStates[name] = 0;

      this.controller.on(`${name}:pressed`, () => {
        this.buttonStates[name] = 1;

        if (pressMethodName) {
          const evt = this._makeButtonEvent(name, index);
          if (!(pressMethodName in this.dispatcher)) {
            this.log(`no handler for: ${pressMethodName}`);
            return;
          }
          this.dispatcher[pressMethodName](evt);
        }

        this.updateLEDs();
      });
      this.controller.on(`${name}:released`, () => {
        this.buttonStates[name] = 0;
        const evt = this._makeButtonEvent(name, index);

        //console.log('attempting dispatch of', name);

        if (!(methodName in this.dispatcher)) {
          this.log(`no handler for: ${methodName}`);
          return;
        }
        this.dispatcher[methodName](evt);
        this.updateLEDs();
      });
    }
  }
}

module.exports.ControllerDriver = ControllerDriver;
