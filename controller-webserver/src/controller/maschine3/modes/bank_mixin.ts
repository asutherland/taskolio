"use strict";

const NUM_BANKS = 4;

import { GRID_ROWS, GRID_COLS, GRID_CELLS, GridPickerMixin } from
  './grid_picker_mixin.js';

/**
 * Supports multiple grid banks.
 *
 * @param {Function(iBank, iCell, iRow, iCol)} [computeCellValue]
 *   Optional function to help initialize the state of the cells in the banks.
 *   This is intended for use by modes like the `ColorPickerMode` where the bank
 *   contents are effectively static.  Modes like `BookmarkMode` use
 *   `initialState` to restore a persisted state.  And the actual button colors
 *   are left to the mode to implement via `computeGridColors`, etc.
 * @param {Object} [defaultCellValue]
 *   The default value to use for each cell's contents.  Will be ignored if
 *   `computeCellValue` is provided.
 * @param initialState
 *   Value to assign directly to `banks`.  This should be an array of arrays.
 *   Each entry in the outer array is a bank.  Each entry in the inner array is
 *   a cell in that bank's grid.
 */
export class BankMixin extends GridPickerMixin {
  bankSelected: number;
  banks: any;
  modeShortLabel: string;

  constructor({ computeCellValue=null, defaultCellValue=undefined, initialState=undefined }) {
    super();

    /** The bank to display. */
    this.bankSelected = 0;

    if (initialState) {
      // TODO: sanity check that the initial state conforms to what would be
      // populated below.
      this.banks = initialState;
    } else {
      this.banks = this.makeEmptyBanks({ computeCellValue, defaultCellValue });
    }

    this.modeShortLabel = "cp";
  }

  makeEmptyBanks({ computeCellValue=null, defaultCellValue=null }) {
    const banks = new Array(NUM_BANKS);
    for (let iBank = 0; iBank < NUM_BANKS; iBank++) {
      banks[iBank] = new Array(GRID_CELLS);
      for (let iCell = 0; iCell < GRID_CELLS; iCell++) {
        const iRow = Math.floor(iCell / GRID_COLS);
        const iCol = iCell % GRID_COLS;
        banks[iBank][iCell] =
          computeCellValue ? computeCellValue(iBank, iCell, iRow, iCol)
                           : defaultCellValue;
      }
    }

    return banks;
  }

  get curBank() {
    return this.banks[this.bankSelected];
  }

  onTouchStripMovement(evt) {
    // only listen to the first finger, and ignore the absolute 0 value which
    // means there's no finger on the strip.
    if (evt.index === 0 && evt.value > 0) {
      this.bankSelected = Math.min(Math.floor(evt.value * 4), 3);
    }
  }

  computeTouchStripColors(stt) {
    const leds = new Array(25);
    for (let i = 0; i < 25; i++) {
      const effBank = Math.max(0, Math.floor((i-1)/6));
      if (effBank === this.bankSelected) {
        leds[i] = 68;
      } else {
        leds[i] = 0;
      }
    }
    return leds;
  }
}

export {
  NUM_BANKS,
  GRID_COLS,
  GRID_ROWS,
  GRID_CELLS
};
