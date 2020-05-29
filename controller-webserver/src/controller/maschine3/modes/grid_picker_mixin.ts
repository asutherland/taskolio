"use strict";

const GRID_ROWS = 4;
const GRID_COLS = 4;
const GRID_CELLS = GRID_ROWS * GRID_COLS;
const GRID_COLS_PER_DISPLAY = 2;

const { html } = require('@popeindustries/lit-html-server');

/**
 * Mixin where the subclass provides a computeCellInfo method that is used to
 * display a 4x4 grid across the two screens where each cell corresponds to a
 * pad button.  The picker completes by having one of the pad buttons pressed or
 * the subclassing mode invoking `abortPick` via a custom button handler.
 */
class GridPickerMixin {
  computeCenterHTML(stt, iDisplay) {
    const bank = this.curBank;
    const cellValues = [];

    for (let iRow = 0; iRow < GRID_ROWS; iRow++) {
      for (let iCol = (iDisplay * GRID_COLS_PER_DISPLAY);
           iCol < ((iDisplay + 1) * GRID_COLS_PER_DISPLAY);
           iCol++) {
        const iCell = iRow * GRID_COLS + iCol;
        const cellValue = this.computeCellHTML(iCell, iRow, iCol);
        cellValues.push(cellValue);
      }
    }

    return html`${cellValues}`;
  }
}

module.exports.GridPickerMixin = GridPickerMixin;
module.exports.GRID_COLS = GRID_COLS;
module.exports.GRID_ROWS = GRID_ROWS;
module.exports.GRID_CELLS = GRID_CELLS;
