"use strict";

const { ColorPickerMode } = require("./color_picker_mode");

const VERSION = 1;
const GROUP_BUTTONS = 8;
const GLOBAL_SLOT = 7;

/**
 * UI for the 8 A-H group buttons on the left side of the Maschine mk3.  Each
 * button represents a task slot which is associated with a given taskwarrior
 * slot.  Slot "H" is special and corresponds to the "global" state which is not
 * associated with any task and is intended to cover general operation.  This is
 * also the mode the system starts out in.
 *
 * Note that the task slot mechanism could also be thought of as a
 * "task bookmark" mechanism, but the way the window/container bookmarks work
 * isn't actually tied to the physical buttons in play.  Pushing a button is
 * intended to manipulate focus of windows/containers, and it's that state which
 * is then translated into the physical button seeming active.  But the bookmark
 * mode doesn't actually remember the button was pressed... it's just that when
 * you push the button, the focus state change should now be reflected back as
 * lighting up.  But for the task slot group buttons, we literally are tracking
 * the button you pushed.
 */
class TaskSlotMode {
  constructor({ dispatcher, colorHelper, persistedState, saveTaskBookmarks }) {
    this.dispatcher = dispatcher;
    this.colorHelper = colorHelper;
    this.saveTaskBookmarks = saveTaskBookmarks;

    this.iGroupButton = GLOBAL_SLOT;

    if (!persistedState || persistedState.version !== VERSION) {
      this.persistedState = persistedState = {
        version: VERSION,
        // we do have a slot for the global slot so its color can be configured
        bookmarks: new Array(GROUP_BUTTONS),
      };
      persistedState.bookmarks[GLOBAL_SLOT] = {
        uuid: null,
        color: null
      };
      // we don't need to trigger a save of this default state; it's fine if we
      // keep re-creating it.
    } else {
      this.persistedState = persistedState;
    }

    this.fallbackColor = this.colorHelper.makeWhiteColor();

    this.slotBookmarks = persistedState.bookmarks;

    this.pickingColor = false;
    this.pickColorMode = new ColorPickerMode({
      caller: this
    });
  }

  isGlobalSlot() {
    return this.iGroupButton === GLOBAL_SLOT;
  }

  onGroupButton(evt) {
    this.iGroupButton = evt.index;
  }

  computeSwingLED() {
    return this.pickingColor ? 1.0 : 0.2;
  }

  onSwingButton(evt) {
    const bookmark = this.slotBookmarks[this.iGroupButton];
    if (!bookmark) {
      return;
    }

    this.pickingColor = true;
    this.dispatcher.pushMode(this, this.pickColorMode);
  }

  onColorPicked(wrappedColor) {
    this.pickingColor = false;
    const bookmark = this.slotBookmarks[this.iGroupButton];
    bookmark.color = wrappedColor;
    // (we mutated the deep state above there)
    this.saveTaskBookmarks(this.persistedState);
  }

  computeGroupColors() {
    const displayColors = new Array(GROUP_BUTTONS);
    for (let i = 0; i < GROUP_BUTTONS; i++) {
      const bookmark = this.slotBookmarks[i];
      let color = (bookmark && bookmark.color) || this.fallbackColor;
      let state;
      if (i === this.iGroupButton) {
        state = 'focused';
      } else if (bookmark) {
        state = 'hidden';
      } else {
        state = 'missing';
      }
      displayColors[i] =
        this.colorHelper.computeBookmarkDisplayColor(color, state);
    }

    return displayColors;
  }
}

module.exports.TaskSlotMode = TaskSlotMode;
