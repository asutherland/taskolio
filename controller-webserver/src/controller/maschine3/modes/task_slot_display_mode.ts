"use strict";

import { html } from '@popeindustries/lit-html-server';

import { GridPickerMixin, GRID_CELLS } from './grid_picker_mixin.js';

/**
 * This mode exists to show the current contents of the TaskSlotMode's slots
 * when the navigation button is capacitively touched as a sort-of peek
 * mechanism.
 *
 * Note that the slots only contain task uuid and color, so task names are
 * resolved via the TaskManager.
 */
export class TaskSlotDisplayMode extends GridPickerMixin {
  dispatcher: any;
  colorHelper: any;
  taskManager: any;
  updateHTML: any;
  emptyColor: any;
  slotBookmarks: any;
  parentMode: any;
  pages: any;

  constructor({ dispatcher, colorHelper, taskManager, updateHTML }) {
    super();

    this.dispatcher = dispatcher;
    this.colorHelper = colorHelper;
    this.taskManager = taskManager;
    this.updateHTML = updateHTML;

    this.emptyColor = this.colorHelper.makeWhiteColor();

    this.slotBookmarks = null;

    this.parentMode = null;
  }

  async update(parentMode, slotBookmarks) {
    this.parentMode = parentMode;
    this.slotBookmarks = slotBookmarks;

    const pages = this.pages =
      await this.taskManager.getProjectPagedRecentPending();
    this.updateHTML();
  }

  onNavTouchPressed() {
    // this shouldn't happen, but for sanity purposes, mark ourselves as
    // handling this method so TaskSlotMode never tries to push us a second time
    // since the pressed/released methods are separate.
  }

  onNavTouchReleased() {
    this.dispatcher.popMode(this);
  }

  onNavPushButton(evt) {
    // Handle push when we're on the stack by popping ourselves and
    // re-dispatching to our parent so it can push the TaskPickerMode.
    this.dispatcher.popMode(this);
    this.parentMode.onNavPushButton(evt);
  }

  /**
   * We blank the grid buttons in peek mode to help make it more clear what's
   * happening onthe display.
   */
  computeGridColors() {
    return null;
  }

  computeCellHTML(iCell, iRow/*, iCol*/) {
    let useClass = 'gridButton';
    if (iRow === 0) {
      useClass += ' topGridRow';
    }

    const slotBookmark = this.slotBookmarks[iCell];

    const task = slotBookmark &&
                 this.taskManager.syncGetTaskByUuid(slotBookmark.uuid);

    // Leave blank cells empty.
    if (!task) {
      return html`<div class="${useClass}"></div>`;
    }

    // (Match the computeGridColors logic for the color above.)
    const wrappedColor = slotBookmark && slotBookmark.color || this.emptyColor;

    const colors = this.colorHelper.computeRGBHexColors(wrappedColor);

    return html`<div class="${useClass}" style="border: 2px solid ${colors.border}; background-color: ${colors.background};">
  <div>${task.project}</div>
  <div>${task.description}</div>
</div>`;
  }

  computeBottomHTML() {
    return html`<div></div>`;
  }
}
