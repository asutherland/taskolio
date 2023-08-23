"use strict";

import { BankMixin, NUM_BANKS, GRID_ROWS, GRID_COLS, GRID_CELLS }
  from "./bank_mixin.js";
import { ColorPickerMode } from "./color_picker_mode.js";

import { html } from '@popeindustries/lit-html-server';

/**
 * UI for 4 "stop" button banks of 4x4 container-bookmark grids.
 *
 * ## Task Awareness
 * The bookmark mode is now task-aware.  I had initially gone with giving each
 * task its own entirely separate set of bookmarks as a first step, but the UX
 * was event worse than expected.  The sudden loss of some of the "global"
 * bookmarks meant I didn't actually use the task mode.  So the new solution is
 * that the top 2 rows of bookmarks always come from/mutate the global bookmark
 * state.  In order to avoid too much churn / I'm lazy, the per-task bookmarks
 * will actually still be 4 banks of 4x4 grids, it's just that only the bottom
 * 2 rows of each bank will be accessible.  This can be cleaned up if it works
 * out.
 *
 * ## Architecture (older comment)
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
export class BookmarkMode extends BankMixin {
  dispatcher: any;
  bookmarkManager: any;
  __saveBookmarks: any;
  _globalBookmarks: any;
  _taskBookmarks: any;
  log: any;
  pickingForBookmark: any;
  setBookmarkSubMode: SetBookmarkSubMode;
  pickColorMode: ColorPickerMode;
  gridPushCount: number;
  activity: string;
  curTask: any;
  _taskState: any;
  __updateTaskStateKey: any;
  
  constructor({ dispatcher, bookmarkManager, persistedState, saveBookmarks, colorHelper, log }) {
    super({
      defaultCellValue: null,
      initialState: persistedState
    });

    this.dispatcher = dispatcher;
    this.bookmarkManager = bookmarkManager;
    this.__saveBookmarks = saveBookmarks;
    // We want to save off the global bookmarks reference because we clobber
    // `this.banks` in `onCurrentTaskChanged`.  We want to initialize from
    // `this.banks`, though, because our superclass provides defualts when there
    // isn't already persisted data available.
    this._globalBookmarks = this.banks;
    // The banks of whatever the current task's bookmarks are.
    this._taskBookmarks = null;
    // The above 2 mashed up so that the top 2 rows of each bank are from
    // _globalBookmarks and the bottom 2 are from _taskBookmarks if non-null
    // goes into `this.banks`
    this.log = log;

    /** Static 2-charcter label to help convey the current mode. */
    this.modeShortLabel = "bg"; // Bookmark Go

    this.pickingForBookmark = null;
    this.setBookmarkSubMode = new SetBookmarkSubMode({
      owner: this,
    });
    this.pickColorMode = new ColorPickerMode({
      caller: this,
      colorHelper,
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

    // by default we're in global mode.
    this.curTask = null;
    this._taskState = null;
    this.__updateTaskStateKey = null;
  }

  getGlobalBookmarkMainBank() {
    return this._globalBookmarks[0];
  }

  _mergeBookmarks() {
    const top = this._globalBookmarks;
    const bottom = this._taskBookmarks || this._globalBookmarks;
    const merged = this.banks = [];
    for (let iBank = 0; iBank < top.length; iBank++) {
      merged.push([...top[iBank].slice(0, 8), ...bottom[iBank].slice(8)]);
    }
  }

  /**
   * So this actually returns the same value that this.curBank[index] would
   * return, but this way is more explicit and should hopefully avoid confusion
   * going forward.
   */
  _getBookmarkAtCell(index) {
    const top = this._globalBookmarks;
    const bottom = this._taskBookmarks || this._globalBookmarks;

    if (index < 8) {
      return top[this.bankSelected][index];
    } else {
      return bottom[this.bankSelected][index];
    }
  }

  _setBookmarkAtCell(index, bookmark) {
    const top = this._globalBookmarks;
    const bottom = this._taskBookmarks || this._globalBookmarks;

    if (index < 8) {
      top[this.bankSelected][index] = bookmark;
    } else {
      bottom[this.bankSelected][index] = bookmark;
    }
    this._mergeBookmarks();
  }

  onCurrentTaskChanged(task, taskState, updateTaskStateKey, cause) {
    this.curTask = task;
    this._taskState = taskState;
    this.__updateTaskStateKey = updateTaskStateKey;

    // No task means we're operating in global bookmarks mode.
    if (!task) {
      this._taskBookmarks = null;
      this._mergeBookmarks();
      return;
    }

    if (taskState && taskState.bookmarks) {
      this._taskBookmarks = taskState.bookmarks;
    } else {
      this._taskBookmarks = this.makeEmptyBanks({ defaultCellValue: null });
    }
    this._mergeBookmarks();
  }

  _saveBookmarks() {
    // Save the global bookmarks every time because they may have been changed.
    this.__saveBookmarks(this._globalBookmarks);
    // And save the task bookmarks if we have them.
    if (this.curTask) {
      this.__updateTaskStateKey('bookmarks', this._taskBookmarks);
    }
  }

  // f1 forwards
  onSizeButton(evt) {
    return this.onChordsButton(evt);
  }
  onBrowseButton(evt) {
    return this.onStepButton(evt);
  }
  onReverseButton(evt) {
    return this.onPadModeButton(evt);
  }
  onTypeButton(evt) {
    return this.onKeyboardButton(evt);
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
    this.log(`bookmark position picked: ${index} in mode ${this.activity}`,
             this.pickingForBookmark);
    if (this.activity === 'delete') {
      this.log(`deleting bookmark at index ${index}`);
      this._setBookmarkAtCell(index, null);
      this._saveBookmarks();
    } else if (this.pickingForBookmark) {
      //console.log("Setting bookmark", JSON.stringify(this.pickingForBookmark));
      const oldBookmark = this._getBookmarkAtCell(index);
      const newBookmark =
        this.bookmarkManager.replacingBookmarkMaybeMerge(
            this.pickingForBookmark, oldBookmark);
      this._setBookmarkAtCell(
        index,
        newBookmark);
      this.pickingForBookmark = null;
      this._saveBookmarks();
      this.log(`set bookmark to index ${index}`, newBookmark);
    } else {
      this.log(`bookmark position mode is weird: ${this.activity}`);
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
      this._saveBookmarks();
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
  // Mk3
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

  // The F1 buttons are boolean, leave them off unless we're in the state.
  computeReverseLED(stt: any) {
    return 0;
  }
  computeTypeLED(stt: any) {
    return 0;
  }
  computeSizeLED(stt: any) {
    return 0;
  }
  computeBrowseLED(stt: any) {
    return 0;
  }


  computeGridColors() {
    return this._internalComputeGridColors(1);
  }

  computeCellHTML(iCell, iRow/*, iCol*/) {
    const bookmark = this.curBank[iCell];
    let useClass = 'gridButton';
    if (iRow === 0) {
      useClass += ' topGridRow';
    }

    // No bookmark means an empty cell.
    if (!bookmark) {
      return html`<div class="${useClass}"></div>`;
    }

    const desc = this.bookmarkManager.describeBookmark(bookmark);
    // A bookmark that doesn't usefully resolve gets left blank, but perhaps
    // this wants to be styled in subtle gray?
    if (!desc || !desc.app) {
      return html`<div class="${useClass}"></div>`;
    }
    const isSetting = this.activity === 'set-bookmark';
    const useBorder = isSetting ? 'white' : desc.colors.border;

    return html`<div class="${useClass}" style="border: 2px solid ${useBorder}; background-color: ${desc.colors.background};">
  <div>${desc.app.name}: ${desc.app.shortInstance}</div>
  <div>${ desc.container ? desc.container.title : ''}</div>
</div>`;
  }
}

/**
 * Bookmark setting mode.  We use the next
 */
class SetBookmarkSubMode {
  owner: any;
  modeShortLabel: string;

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
   * Hitting chords again toggles out of set-bookmark mode.
   */
  onChordsButton(evt) {
    this.owner.dispatcher.popMode(this);
  }

  /**
   * Hitting step again toggles out of set-bookmark mode.
   */
  onStepButton(evt) {
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
