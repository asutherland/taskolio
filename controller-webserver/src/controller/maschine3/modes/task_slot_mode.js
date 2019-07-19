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
  constructor({ dispatcher, taskManager, colorHelper, persistedState,
                saveTaskBookmarks, taskPickerMode, taskSlotDisplayMode }) {
    this.dispatcher = dispatcher;
    this.taskManager = taskManager;
    this.colorHelper = colorHelper;
    this.__saveTaskBookmarks = saveTaskBookmarks;

    this.taskPickerMode = taskPickerMode;
    this.taskSlotDisplayMode = taskSlotDisplayMode;

    this.iGroupButton = GLOBAL_SLOT;

    if (!persistedState || persistedState.version !== VERSION) {
      this.persistedState = persistedState = {
        version: VERSION,
        // we do have a slot for the global slot so its color can be configured
        bookmarks: new Array(GROUP_BUTTONS),
      };
      persistedState.bookmarks[GLOBAL_SLOT] = this._makeEmptyBookmark();
      // we don't need to trigger a save of this default state; it's fine if we
      // keep re-creating it.
    } else {
      // always reset the global slot to white; it shouldn't actually be able
      // to have its color changed anymore.
      persistedState.bookmarks[GLOBAL_SLOT] = this._makeEmptyBookmark();
      this.persistedState = persistedState;
    }

    this.fallbackColor = this.colorHelper.makeWhiteColor();

    this.slotBookmarks = persistedState.bookmarks;

    this.pickingColor = false;
    this.pickColorMode = new ColorPickerMode({
      caller: this
    });

    this.pickingTask = false;

    this._task = null;
    this._taskState = null;
    this._updateTaskStateKey = null;
  }

  _makeEmptyBookmark() {
    return {
      uuid: null,
      color: null,
    };
  }

  /**
   * Wrap the save logic to be invoked on mutation.  Exists to also update
   * subsidiary displays like TaskSlotDisplayMode which may need to update its
   * HTML or what not.
   */
  _saveTaskBookmarks() {
    this.__saveTaskBookmarks(this.persistedState);
    this.taskSlotDisplayMode.update(this, this.slotBookmarks);
  }

  /**
   * Notification received
   */
  onCurrentTaskChanged(task, taskState, updateTaskStateKey, cause) {
    // Ignore task change announcements if we're the global slot.
    if (this.iGroupButton === GLOBAL_SLOT) {
      return;
    }

    this._task = task;
    this._taskState = taskState;
    this._updateTaskStateKey = updateTaskStateKey;

    // If the task is being removed from the slot, clear out the slot bookmark.
    // (Although persistence of colors for slots used for consistent purposes
    // would be interesting, it makes for confusing UX right now, and we already
    // clobber the colors via the picker.  So I think it's better to provide
    // a means of associating colors with task project prefixes or the like.)
    if (cause === 'done' || cause === 'slot-clear') {
      this.slotBookmarks[this.iGroupButton] = null;
      this._saveTaskBookmarks();
    }

    let bookmark = this.slotBookmarks[this.iGroupButton];
    if (!bookmark && task) {
      // We didn't have a bookmark in this slot, but now there's a task, so
      // we're de-facto creating one.
      bookmark = this.slotBookmarks[this.iGroupButton] =
        this._makeEmptyBookmark();
      bookmark.uuid = task.uuid;
      // Also, propagate the task's color if it had one.
      if (taskState.color) {
        bookmark.color = taskState.color;
      }
      this._saveTaskBookmarks();
    } else if (task && taskState) {
      // update the task info into the slot, both uuid and color
      bookmark.uuid = task.uuid;
      bookmark.color = taskState.color;
      this._saveTaskBookmarks();
    }
  }

  isGlobalSlot() {
    return this.iGroupButton === GLOBAL_SLOT;
  }

  onNavTouchPressed(evt) {
    // Do not display the slot hint if we're picking...
    if (this.pickingTask) {
      return;
    }
    this.taskSlotDisplayMode.update(this, this.slotBookmarks);
    this.dispatcher.pushMode(this, this.taskSlotDisplayMode);
  }

  onNavPushButton(evt) {
    // If the user held down shift, we mark the current task as done regardless
    // of whether they go through with picking a new task.
    if (evt.shift) {
      this.taskManager.markTaskDone();
    }

    // Mark that we're in the task-picking sub-state so that we don't try and
    // layer the taskSlotDisplayMode on top of this sub-mode.
    this.pickingTask = true;

    // we keep it around all the time, we need to force an update...
    this.taskPickerMode.update(this);
    this.dispatcher.pushMode(this, this.taskPickerMode);
  }

  onGroupButton(evt) {
    this.iGroupButton = evt.index;
    const bookmark = this.isGlobalSlot() ? null : this.slotBookmarks[this.iGroupButton];
    const uuid = bookmark && bookmark.uuid;
    this.taskManager.setActiveTaskByUuid(uuid, 'slot-pick');
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
    this._saveTaskBookmarks();

    if (this._taskState) {
      this._updateTaskStateKey('color', wrappedColor);
    }
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
