"use strict";

const { html } = require('@popeindustries/lit-html-server');

const { GridPickerMixin } = require('./grid_picker_mixin');

/**
 * This mode
 */
class TaskPickerMode extends GridPickerMixin {
  constructor({ dispatcher, visibilityTracker, bookmarkMode, updateHTML }) {
    this.dispatcher = dispatcher;
    this.visTracker = visibilityTracker;
    this.bookmarkMode = bookmarkMode;
    this.updateHTML = updateHTML;
  }

  computeHTML(stt, iDisplay) {

  }
}
