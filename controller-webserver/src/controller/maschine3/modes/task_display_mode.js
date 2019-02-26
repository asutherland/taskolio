"use strict";

const { html } = require('@popeindustries/lit-html-server');

class TaskDisplayMode {
  constructor({ taskManager }) {
    this.taskManager = taskManager;

    this.curTask = null;
  }

  async update() {
    this.curTask = await this.taskManager.getActiveTask();
  }

  computeBottomHTML(stt, iDisplay) {
    if (iDisplay === 1) {
      return '';
    }

    // kick off an async update so the next time we render we're more accurate.
    this.update();

    let useClass = 'taskDescription';

    let text = '';
    if (this.curTask) {
      text = this.curTask.description || '';
    }

    return html`<div class="${useClass}">
${text}
</div>`;
  }
}

module.exports.TaskDisplayMode = TaskDisplayMode;
