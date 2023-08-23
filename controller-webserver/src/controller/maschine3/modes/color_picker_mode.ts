import { BankMixin, NUM_BANKS, GRID_ROWS, GRID_COLS, GRID_CELLS }
  from "./bank_mixin.js";

import { html } from '@popeindustries/lit-html-server';

/**
 * Banked color picker.  Uses BankMixin to pre-compute the hue/sat/rgb values at
 * creation time, which should make this easier to move to a palette-based
 * picker if desired.
 *
 */
export class ColorPickerMode extends BankMixin {
  caller: any;

  constructor({ caller, colorHelper }) {
    super({
      computeCellValue(iBank, iCell, iRow, iCol) {
        return colorHelper.computeColorBankColor(iBank, 4, iCell, 16);
      }
    });

    this.colorHelper = colorHelper;
    this.caller = caller;
  }

  /**
   * Bookmark mode uses reverse (shift=color) to get to us, so provide the same
   * button as an escape hatch.
   */
  onPadModeButton(evt) {
    this.caller.dispatcher.popMode(this);
  }

  onKeyboardButton(evt) {
    this.caller.dispatcher.popMode(this);
  }

  onGridButton(evt) {
    const wrappedColor = this.curBank[evt.index];
    this.caller.onColorPicked(wrappedColor);
    this.caller.dispatcher.popMode(this);
  }

  computeGridColors() {
    return this.curBank.map(this.colorHelper.computeDisplayColor);
  }

  // XXX do something better than this.
  computeCenterHTML() {
    return html`<div>Pick a color!</div>`;
  }
}
