"use strict";

import { html } from '@popeindustries/lit-html-server';

export class TaskDisplayMode {
  dispatcher: any;
  taskManager: any;

  constructor({ dispatcher, taskManager, taskPickerMode=null }) {
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
