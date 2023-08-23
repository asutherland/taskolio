"use strict";

// This file is derived from the Maschine Mk3 controller again.  (There was an
// F1 controller that evolved into the maschine controller, but given the drift
// it makes sense to start from the mk3.)

import { createNodeHidAdapter, createNodeUsbAdapter, TraktorF1 } from "ni-controllers-lib";

import { renderToString } from '@popeindustries/lit-html-server';

const COLOR_BLACK = 0;
const BLANK_ROW = [COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK];
const BLANK_GRID = [...BLANK_ROW, ...BLANK_ROW, ...BLANK_ROW, ...BLANK_ROW];
const BLANK_GROUPS = [COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK,
                      COLOR_BLACK, COLOR_BLACK, COLOR_BLACK, COLOR_BLACK];
const BLANK_BANKS = [0, 0, 0, 0, 0, 0, 0, 0];
const BLANK_TOUCHSTRIP: number[] = [];
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
export class ControllerDriver {
  controller: TraktorF1;
  dispatcher: any;
  log: any;
  asyncRenderHTML: any;
  colorHelper: any;
  buttonStates!: {};
  sliderStates!: any[];
  knobStates!: any[];
  touchStripStates!: any[];
  htmlDisplayed!: any[];
  htmlPending!: any[];
  htmlDesired!: any[];
  _htmlUpdatePending!: boolean;
  touchStrips: any;

  constructor() {
    this.controller = new TraktorF1(createNodeHidAdapter, createNodeUsbAdapter);
  }

  async init({ dispatcher, log, colorHelper }): Promise<void> {
    const controller = this.controller;
    await controller.init();
    this.dispatcher = dispatcher;
    this.log = log;
    this.colorHelper = colorHelper;

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
    for (let iBank = 0; iBank < 4; iBank++) {
      ctrl.setLED(`l${iBank + 1}_l`, bankLEDs[iBank * 2]);
      ctrl.setLED(`l${iBank + 1}_r`, bankLEDs[iBank * 2 + 1]);
    }

    // -- Labeled LEDs (monocolor, usually white)
    const labeledLEDs = this.dispatcher.computeLabeledLEDs(stt);
    for (let [key, value] of Object.entries(labeledLEDs)) {
      ctrl.setLED(key, value);
    }

    // -- LCD display
    ctrl.setLCDString(this.dispatcher.topModeShortLabel);
  }

  /**
   * Capture the current state of the controller as we understand it on a fresh
   * object that we will not subsequently updated;
   */
  _latchState() {
    // the grid button states are currently in the buttonStates too.  If we
    // thought they might be used, it would probably be appropriate to break
    // them out to be their own array too.
    const stt: any = Object.assign({}, this.buttonStates);
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
      let methodName: string;
      let index: number | null;
      let match;
      // by default we don't generate an event for something being pressed.
      let pressMethodName: string;
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
