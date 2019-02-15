"use strict";

const { BankMixin, NUM_BANKS, GRID_ROWS, GRID_COLS, GRID_CELLS } =
  require("./bank_mixin");
const { ColorPickerMode } = require("./color_picker_mode");

const { html } = require('@popeindustries/lit-html-server');

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

    this.gridPushCount = 0;

    // hackish concept of our own sub-state so that we can handle deletion
    // explicitly.
    // TODO: clean up setting/deletion.  Probably want to
    // - adopt an async handler idiom that waits for the sub-state to pop and
    //   return a value.  Have the stack manager be aware of and able to
    //   terminate with that throwing with a bubbling exception being okay,
    //   but allowing for it to be caught.
    // - have deletion be its own real sub-mode that makes the existing
    //   bookmarks pulse or something like that to convey they're at risk.
    this.activity = 'switch'; // switch is our default.
  }

  /**
   * Mint a window-level bookmark.  This would be favored over the capture
   * button that mints a most-specific bookmark because when you're switching
   * apps you don't necessarily want to keep switching to the same tab/document.
   *
   */
  onChordsButton(evt) {
    // XXX see the TODO on activity.
    // NB: This is the same as onCaptureButton but we call a different minting
    // method.
    if (evt.shift) {
      this.activity = 'delete';
    } else {
      this.activity = 'set-bookmark';
      this.pickingForBookmark =
        this.bookmarkManager.mintBookmarkForFocusedWindow();
    }

    this.dispatcher.pushMode(this, this.setBookmarkSubMode);
  }

  onStepButton(evt) {
    // XXX see the TODO on activity.
    if (evt.shift) {
      this.activity = 'delete';
    } else {
      this.activity = 'set-bookmark';
      this.pickingForBookmark =
        this.bookmarkManager.mintBookmarkForFocusedThing();
    }

    this.dispatcher.pushMode(this, this.setBookmarkSubMode);
  }

  onBookmarkPositionPicked(index) {
    if (this.activity === 'delete') {
      this.curBank[index] = null;
      this._saveBookmarks(this.banks);
    } else if (this.pickingForBookmark) {
      //console.log("Setting bookmark", JSON.stringify(this.pickingForBookmark));
      const oldBookmark = this.curBank[index];
      this.curBank[index] =
        this.bookmarkManager.maybeMergeBookmarks(
          this.pickingForBookmark, oldBookmark);
      this.pickingForBookmark = null;
      this._saveBookmarks(this.banks);
    }
    this.activity = 'switch';
  }

  onPadModeButton(evt) {
    this.activity = 'set-color';
    this.pickingForBookmark =
      this.bookmarkManager.findFocusedBookmarkInCollection(
        this.banks, 'window');
    this.dispatcher.pushMode(this, this.pickColorMode);
  }

  onKeyboardButton(evt) {
    this.activity = 'set-color';
    this.pickingForBookmark =
      this.bookmarkManager.findFocusedBookmarkInCollection(this.banks);
    this.dispatcher.pushMode(this, this.pickColorMode);
  }

  onColorPicked(wrappedColor) {
    if (this.pickingForBookmark) {
      this.bookmarkManager.setBookmarkColor(
        this.pickingForBookmark, wrappedColor);
      this.pickingForBookmark = null;
      this._saveBookmarks(this.banks);
    }
    this.activity = 'switch';
  }

  onGridButton(evt) {
    this.gridPushCount++;

    //console.log('grid button pushed:', evt.index);
    const bookmark = this.curBank[evt.index];
    this.bookmarkManager.focusBookmark(bookmark); // handles nullish bookmarks.
  }

  onSliderMoved(evt) {
    const bookmark = this.curBank[evt.index];
    this.bookmarkManager.fadeBookmark(bookmark, evt.value);
  }

  _internalComputeGridColors(scaleLightness) {
    return this.curBank.map((cell) => {
      return this.bookmarkManager.computeColorForBookmark(
        cell, scaleLightness);
    });
  }

  // Turn on the LEDs that we do stuff for.
  computePadModeLED() {
    return 1;
  }
  computeKeyboardLED() {
    return 1;
  }
  computeChordsLED() {
    return 1;
  }
  computeStepLED() {
    return 1;
  }

  computeGridColors() {
    return this._internalComputeGridColors(1);
  }

  computeCenterHTML(stt, iDisplay) {
    return html`<div class=".fullCenter">
  <div>Hello World #${iDisplay}: ${this.gridPushCount}</div>
  <div style="background-color: white; display: inline-block; width: 32px; height: 32px; margin-right: 16px;"></div>
  <div style="background-color: red; display: inline-block; width: 32px; height: 32px; margin-right: 16px;"></div>
  <div style="background-color: green; display: inline-block; width: 32px; height: 32px; margin-right: 16px;"></div>
  <div style="background-color: blue; display: inline-block; width: 32px; height: 32px; margin-right: 16px;"></div>
  <div style="background-color: black; display: inline-block; width: 32px; height: 32px; margin-right: 16px;"></div>
</div>`;
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
   * Hitting quant again toggles out of set-bookmark mode.
   * TODO: Expose what granularity of button is being set and let quant/capture
   * switch between them.  Or at least consider that.
   */
  onQuantButton(evt) {
    this.owner.dispatcher.popMode(this);
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
