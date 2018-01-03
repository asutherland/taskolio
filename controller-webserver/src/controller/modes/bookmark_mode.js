"use strict";

const { BankMixin, NUM_BANKS } = require("./bank_mixin");
const { ColorPickerMode } = require("./color_picker_mode");

const GRID_ROWS = 4;
const GRID_COLS = 4;
const GRID_CELLS = GRID_ROWS * GRID_COLS;

/**
 * UI for 4 "stop" button banks of 4x4 container-bookmark grids.
 *
 * Sub-modes:
 * - SetBookmarkSubMode: Triggered by hitting the "capture" button.
 *
 * Keep in mind that this only tracks bookmarks, not their focused/visible
 * state.  That's handled by the VisibilityTracker.
 */
class BookmarkMode extends BankMixin {
  constructor({ dispatcher }) {
    super();

    this.dispatcher = dispatcher;

    /** Static 2-charcter label to help convey the current mode. */
    this.modeShortLabel = "bg"; // Bookmark Go


    /**
     * Array of arrays of serializable persistent bookmark descriptors.
     */
    this.banks = new Array(NUM_BANKS);
    for (let i = 0; i < NUM_BANKS; i++) {
      this.banks[i] = new Array(GRID_CELLS);
    }

    this.setBookmarkSubMode = new SetBookmarkSubMode({
      owner: this,
    });
    this.pickColorMode = new ColorPickerMode({
      caller: this
    });
  }

  onCaptureButton(evt) {
    this.dispatcher.pushMode(this, new SetBookmarkSubMode({
      owner: this
    }));
  }

  onGridButton(evt) {

  }

  computeGridColors() {

  }

}

/**
 * Bookmark setting mode.  We use the next
 */
class SetBookmarkSubMode {
  constructor({ owner }) {
    this.owner = owner;

    this.modeShortLabel = "bs"; // Bookmark Set
  }

  /**
   * Hitting capture again toggles out of set-bookmark mode.
   */
  onCaptureButton(evt) {
    this.owner.dispatcher.popMode(this);
  }

  onGridButton(evt) {

  }

  computeGridColors() {

  }
}

module.exports.BookmarkMode = BookmarkMode;