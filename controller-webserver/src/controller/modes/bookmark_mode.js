"use strict";

const { BankMixin, NUM_BANKS, GRID_ROWS, GRID_COLS, GRID_CELLS } =
  require("./bank_mixin");
const { ColorPickerMode } = require("./color_picker_mode");


/**
 * UI for 4 "stop" button banks of 4x4 container-bookmark grids.
 *
 * Sub-modes:
 * - SetBookmarkSubMode: Triggered by hitting the "capture" button.  The next
 *   grid button press will be assigned whatever the currently focused window
 *   is.  A color will automatically be assigned.
 * - ColorPickerMode: Triggered by pressing the "reverse" button which has the
 *   shift-label of "color" on the hardware, hence its selection.  The color
 *   picker will immediately display to pick a new color for whatever the
 *   currently focused/active bookmark is.
 *
 * Keep in mind that this only tracks bookmarks, not their focused/visible
 * state.  That's handled by the VisibilityTracker.
 *
 * Other stuff:
 * - persistedState: The previous state of this.banks previously saved via
 *   saveBookmarks().
 * - saveBookmarks(state): A function to be provided to persist our state
 *   somewhere on disk.  Currently we expect this to happen via the
 *   `configstore` npm module that synchronously(?) does IO under
 *   "~/.config/configustore/taskolio.json".  (It seems like it must for reads
 *   at least.)
 */
class BookmarkMode extends BankMixin {
  constructor({ dispatcher, bookmarkManager, persistedState, saveBookmarks }) {
    super({
      defaultCellValue: null,
      initialState: persistedState
    });

    this.dispatcher = dispatcher;
    this.bookmarkManager = bookmarkManager;
    this._saveBookmarks = saveBookmarks;

    /** Static 2-charcter label to help convey the current mode. */
    this.modeShortLabel = "bg"; // Bookmark Go

    this.pickingForBookmark = null;
    this.setBookmarkSubMode = new SetBookmarkSubMode({
      owner: this,
    });
    this.pickColorMode = new ColorPickerMode({
      caller: this
    });
  }

  onCaptureButton(evt) {
    this.pickingForBookmark =
      this.bookmarkManager.mintBookmarkForFocusedThing();
    this.dispatcher.pushMode(this, this.setBookmarkSubMode);
  }

  onBookmarkPositionPicked(index) {
    if (this.pickingForBookmark) {
      this.curBank[index] = this.pickingForBookmark;
      this.pickingForBookmark = null;
      this._saveBookmarks(this.banks);
    }
  }

  onReverseButton(evt) {
    this.pickingForBookmark =
      this.bookmarkManager.findFocusedBookmarkInCollection(this.banks);
    this.dispatcher.pushMode(this, this.pickColorMode);
  }

  onColorPicked(hue, sat) {
    if (this.pickingForBookmark) {
      this.bookmarkManager.setBookmarkHueSat(
        this.pickingForBookmark, hue, sat);
      this.pickingForBookmark = null;
      this._saveBookmarks(this.banks);
    }
  }

  onGridButton(evt) {
    const bookmark = this.curBank[evt.index];
    this.bookmarkManager.focusBookmark(bookmark); // handles nullish bookmarks.
  }

  _internalComputeGridColors(scaleLightness) {
    return this.curBank.map((cell) => {
      return this.bookmarkManager.computeRGBColorForBookmark(
        cell, scaleLightness);
    });
  }

  computeGridColors() {
    return this._internalComputeGridColors(1);
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
    this.owner.onBookmarkPositionPicked(evt.index);
    this.owner.dispatcher.popMode(this);
  }

  /**
   * Our grid colors should be a dimmed version of what the normal mode shows.
   */
  computeGridColors() {
    return this.owner._internalComputeGridColors(0.5);
  }

  // Proxy bank-related things to our owner.
  computeBankLEDs() {
    return this.owner.computeBankLEDs();
  }
  onBankButton(evt) {
    return this.owner.onBankButton(evt);
  }
}

module.exports.BookmarkMode = BookmarkMode;