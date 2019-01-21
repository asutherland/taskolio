"use strict";

const D2 = require("node-traktor-f1/lib/traktor_d2");

const COLOR_BLACK = [0, 0, 0];
const BLANK_ROW = [COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK];
const BLANK_GRID = [...BLANK_ROW, ...BLANK_ROW];
const BLANK_BANKS = [0, 0, 0, 0, 0, 0, 0, 0];

const BLANK_DISPLAY = [0, 0, 0, 0, 0, 0, 0, 0];

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
  constructor({ dispatcher }) {
    this.controller = new D2();
    this.dispatcher = dispatcher;

    this.buttonStates = {};
    this.sliderStates = [];
    this.knobStates = [];

    this._bindButtons();

    this._bindEventFamily("s", "changed", 4, this.sliderStates,
                          "slider", "onSliderMoved");
    this._bindEventFamily("k", "changed", 4, this.knobStates,
                          "knob", "onKnobTurned");
    // TODO: expose the stepper's onStepperTurned event.  I'm not doing it yet
    // because it looks like node-traktor-f1 likely has a wraparound bug.
  }

  updateLEDs() {
    const ctrl = this.controller;

    const stt = this._latchState();

    // -- Grid
    const gridColors = this.dispatcher.computeGridColors(stt) || BLANK_GRID;
    for (let iGrid = 0; iGrid < 16; iGrid++) {
      const rgb = gridColors[iGrid];
      ctrl.setRGB(`p${ iGrid + 1}`, rgb[0], rgb[1], rgb[2]);
    }

    // -- Banks
    const bankLEDs = this.dispatcher.computeBankLEDs(stt) || BLANK_BANKS;
    ctrl.setLED('shift', bankLEDs[0]);
    ctrl.setLED('syncGreen', bankLEDs[1]);
    ctrl.setLED('cue', bankLEDs[2]);
    ctrl.setLED('play', bankLEDs[3]);

    // -- Display Buttons
    const displayLEDs = this.dispatcher.computeDisplayLEDs(stt) || BLANK_DISPLAY;
    for (let iDisplay = 0; iDisplay < 8; iDisplay++) {
      ctrl.setLED(`d${iDisplay + 1}`, displayLEDs[iDisplay]);
    }
    const displaySideLEDs = this.dispatcher.computeDisplaySideLEDs(stt) || BLANK_DISPLAY;
    for (let iDisplay = 0; iDisplay < 4; iDisplay++) {
      ctrl.setLED(`dl${iDisplay + 1}`, displaySideLEDs[iDisplay]);
    }
    for (let iDisplay = 4; iDisplay < 8; iDisplay++) {
      ctrl.setLED(`dr${iDisplay + 1}`, displaySideLEDs[iDisplay]);
    }

    // -- Touch Strip
    const tsColors = this.dispatcher.computeTouchStripColors(stt) || BLANK_TOUCHSTRIP;
    for (let iTS = 0; iTS < 25; iTS++) {
      const [blue, orange] = tsColors[iTS];
      ctrl.setLED(`tsb${ iTS + 1}`, blue);
      ctrl.setLED(`tso${ iTS + 1}`, orange);
    }

    // -- Labeled LEDs
    const labeledLEDs = this.dispatcher.computeLabeledLEDs(stt);
    for (let [key, value] of Object.entries(labeledLEDs)) {
      ctrl.setLED(key, value ? 1 : 0);
    }
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
      if (/^p\d+$/.test(name)) {
        methodName = "onGridButton";
        index = parseInt(name.slice(1), 10) - 1;
      } else if (/^l\d+$/.test(name)) {
        methodName = "onBankButton";
        index = parseInt(name.slice(1), 10) - 1;
      } else {
        methodName = `on${initialCap}Button`;
        index = null;
      }

      this.buttonStates[name] = 0;

      this.controller.on(`${name}:pressed`, () => {
        this.buttonStates[name] = 1;
        this.updateLEDs();
      });
      this.controller.on(`${name}:released`, () => {
        this.buttonStates[name] = 0;
        const evt = this._makeButtonEvent(name, index);
        this.dispatcher[methodName](evt);
        this.updateLEDs();
      });
    }
  }
}

module.exports.ControllerDriver = ControllerDriver;
