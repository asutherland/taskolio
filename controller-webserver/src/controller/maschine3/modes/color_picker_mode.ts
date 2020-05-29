const { BankMixin, NUM_BANKS, GRID_ROWS, GRID_COLS, GRID_CELLS } =
  require("./bank_mixin");

const { ColorHelper } = require('../../../indexed_color_helper');
const { html } = require('@popeindustries/lit-html-server');

/**
 * Banked color picker.  Uses BankMixin to pre-compute the hue/sat/rgb values at
 * creation time, which should make this easier to move to a palette-based
 * picker if desired.
 *
 */
class ColorPickerMode extends BankMixin {
  constructor({ caller }) {
    super({
      computeCellValue(iBank, iCell, iRow, iCol) {
        return ColorHelper.computeColorBankColor(iBank, 4, iCell, 16);
      }
    });

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
    return this.curBank.map(ColorHelper.computeDisplayColor);
  }

  // XXX do something better than this.
  computeCenterHTML() {
    return html`<div>Pick a color!</div>`;
  }
}

module.exports.ColorPickerMode = ColorPickerMode;
