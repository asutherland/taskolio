"use strict";

const { html } = require('@popeindustries/lit-html-server');

class TaskDisplayMode {
  constructor({ dispatcher, taskManager, taskPickerMode }) {
    this.dispatcher = dispatcher;
    this.taskManager = taskManager;
    this.taskPickerMode = taskPickerMode;
  }

  onNavTouchButton(evt) {
    // TODO: have this do a peek mode thing for the displays to show what the
    // group buttons are bound to.  This will actually need a different series
    // of events, I just want to shut up the controllerDriver's warnings about
    // this button.
  }

  onNavPushButton(evt) {
    // If the user held down shift, we mark the current task as done regardless
    // of whether they go through with picking a new task.
    if (evt.shift) {
      this.taskManager.markTaskDone();
    }

    // we keep it around all the time, we need to force an update...
    this.taskPickerMode.update();
    this.dispatcher.pushMode(this, this.taskPickerMode);
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
