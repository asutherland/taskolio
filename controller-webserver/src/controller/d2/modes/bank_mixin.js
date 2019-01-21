const NUM_BANKS = 4;
const GRID_ROWS = 2;
const GRID_COLS = 4;
const GRID_CELLS = GRID_ROWS * GRID_COLS;

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
    const states = new Array(NUM_BANKS);
    states[this.bankSelected] = 1.0;
    return states;
  }
}

module.exports.BankMixin = BankMixin;
module.exports.NUM_BANKS = NUM_BANKS;
module.exports.GRID_COLS = GRID_COLS;
module.exports.GRID_ROWS = GRID_ROWS;
module.exports.GRID_CELLS = GRID_CELLS;
