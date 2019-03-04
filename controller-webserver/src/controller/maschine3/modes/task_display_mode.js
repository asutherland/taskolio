"use strict";

const { html } = require('@popeindustries/lit-html-server');

class TaskDisplayMode {
  constructor({ dispatcher, taskManager, taskPickerMode }) {
    this.dispatcher = dispatcher;
    this.taskManager = taskManager;
    this.taskPickerMode = taskPickerMode;

    this.curTask = null;
  }

  async update() {
    this.curTask = await this.taskManager.getActiveTask();
  }

  onNavPushButton() {
    this.dispatcher.pushMode(this, this.taskPickerMode);
  }

  computeBottomHTML(stt, iDisplay) {
    if (iDisplay === 1) {
      return '';
    }

    // kick off an async update so the next time we render we're more accurate.
    this.update();

    let useClass = 'taskDescription';

    let project = '';
    let text = '';
    if (this.curTask) {
      project = this.curTask.project || '';
      text = this.curTask.description || '';
    }

    return html`<div class="${useClass}">
<div>${project}</div>
<div>${text}</div>
</div>`;
  }
}

module.exports.TaskDisplayMode = TaskDisplayMode;
