"use strict";

const { html } = require('@popeindustries/lit-html-server');

class TaskDisplayMode {
  constructor({ dispatcher, taskManager, taskPickerMode }) {
    this.dispatcher = dispatcher;
    this.taskManager = taskManager;
  }

  computeBottomHTML(stt, iDisplay) {
    if (iDisplay === 1) {
      return '';
    }

    let useClass = 'taskDescription';

    // this kicks off an async process to ensure the activeTask we access
    // directly below is up-to-date.
    this.taskManager.getActiveTask();

    let project = '';
    let text = '';
    const curTask = this.taskManager.activeTask;
    if (curTask) {
      project = curTask.project || '';
      text = curTask.description || '';
    }

    return html`<div class="${useClass}">
<div>${project}</div>
<div>${text}</div>
</div>`;
  }
}

module.exports.TaskDisplayMode = TaskDisplayMode;
