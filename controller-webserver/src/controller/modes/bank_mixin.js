const NUM_BANKS = 4;
const GRID_ROWS = 4;
const GRID_COLS = 4;
const GRID_CELLS = GRID_ROWS * GRID_COLS;

/**
 *
 */
class BankMixin {
  constructor({ computeCellValue, defaultCellValue, initialState }) {
    /** The bank to display. */
    this.bankSelected = 0;

    if (initialState) {
      // TODO: sanity check that the initial state conforms to what would be
      // populated below.
      this.banks = initialState;
    } else {
      this.banks = new Array(NUM_BANKS);
      for (let iBank = 0; iBank < NUM_BANKS; iBank++) {
        this.banks[iBank] = new Array(GRID_CELLS);
        for (let iCell = 0; iCell < GRID_CELLS; iCell++) {
          const iRow = Math.floor(iCell / GRID_COLS);
          const iCol = iCell % GRID_COLS;
          this.banks[iBank][iCell] =
            computeCellValue ? computeCellValue(iBank, iCell, iRow, iCol)
                            : defaultCellValue;
        }
      }
    }

    this.modeShortLabel = "cp";
  }

  get curBank() {
    return this.banks[this.bankSelected];
  }

  onBankButton(evt) {
    this.bankSelected = evt.index;
  }

  computeBankLEDs() {
    // [button 0 left, button 0 right, button 1 left, ...] for boolean lights
    const lrStates = new Array(NUM_BANKS * 2);
    for (let iBank = 0; iBank < NUM_BANKS; iBank++) {
      const selected = (iBank === this.bankSelected) ? 1 : 0;
      // Previously I tried following node-traktor-f1's app.js's example of
      // always leaving the right LED lit for each button, but that ended up
      // being more distracting than useful.  So now we light both or none.
      // TODO: In the future, the bookmark mode may want to use just one light
      // to indicate when the currently selected bookmark is on a different
      // bank page.
      lrStates[iBank * 2] = selected;
      lrStates[iBank * 2 + 1] = selected;
    }
    return lrStates;
  }
}

module.exports.BankMixin = BankMixin;
module.exports.NUM_BANKS = NUM_BANKS;
module.exports.GRID_COLS = GRID_COLS;
module.exports.GRID_ROWS = GRID_ROWS;
module.exports.GRID_CELLS = GRID_CELLS;