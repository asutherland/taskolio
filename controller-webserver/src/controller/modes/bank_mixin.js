const NUM_BANKS = 4;

class BankMixin {
  constructor() {
    /** The bank to display. */
    this.bankSelected = 0;
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
      lrStates[iBank * 2] = selected;
      lrStates[iBank * 2 + 1] = selected;
    }
    return lrStates;
  }
}

module.exports.BankMixin = BankMixin;
module.exports.NUM_BANKS = NUM_BANKS;