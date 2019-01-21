const tinycolor = require("tinycolor2");
const { BankMixin, NUM_BANKS, GRID_ROWS, GRID_COLS, GRID_CELLS } =
  require("./bank_mixin");

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
        const sat = 1 - (iBank / 5);
        const hue = 360 * (iCell / 16);

        //console.log('bank', iBank, 'cell', iCell, 'hue', hue, 'sat', sat);

        const color = tinycolor({ h: hue, s: sat, v: 1.0 });
        const { r, g, b } = color.toRgb();

        return {
          hue, sat, rgb: [r, g, b]
        };
      }
    });

    this.caller = caller;
  }

  /**
   * Bookmark mode uses reverse (shift=color) to get to us, so provide the same
   * button as an escape hatch.
   */
  onLoopButton(evt) {
    this.caller.dispatcher.popMode(this);
  }

  onRemixButton(evt) {
    this.caller.dispatcher.popMode(this);
  }

  onGridButton(evt) {
    const { hue, sat } = this.curBank[evt.index];
    this.caller.onColorPicked(hue, sat);
    this.caller.dispatcher.popMode(this);
  }

  computeGridColors() {
    return this.curBank.map(({ rgb }) => rgb);
  }
}

module.exports.ColorPickerMode = ColorPickerMode;
