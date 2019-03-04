"use strict";

const { html } = require('@popeindustries/lit-html-server');

const { GridPickerMixin, GRID_CELLS } = require('./grid_picker_mixin');

/**
 *
 */
class TaskPickerMode extends GridPickerMixin {
  constructor({ dispatcher, colorHelper, taskManager, updateHTML }) {
    super();

    this.dispatcher = dispatcher;
    this.colorHelper = colorHelper;
    this.taskManager = taskManager;
    this.updateHTML = updateHTML;

    this.buttonColors = colorHelper.computeColorBank(GRID_CELLS);
    this.unlitButtonDisplayColor = colorHelper.computeEmptyDisplayColor();

    this.pages = [];
    this.iPage = 0;

    this.update();
  }

  get curPage() {
    return this.pages[this.iPage];
  }

  async update() {
    const pages = this.pages = await this.taskManager.getPagedRecentPending();
    this.updateHTML();
  }

  async onGridButton(evt) {
    const curPage = this.curPage;
    const task = curPage && curPage.tasks[evt.index];
    if (!task) {
      return;
    }

    this.dispatcher.popMode(this);

    await this.taskManager.setActiveTask(task);
    this.updateHTML();
  }

  onNavPushButton() {
    this.dispatcher.popMode(this);
  }

  /**
   * Light up display buttons for which we have pages.
   */
  computeDisplayLEDs(stt) {
    const leds = new Array(8);
    for (let i = 0; i < 8; i++) {
      // (we intentionally may read beyond `length` to get undefined)
      const page = this.pages[i];
      let brightness;
      // There may be no such page, in which case leave the button off.
      if (!page) {
        brightness = 0;
      // Highlight the current page's button.
      } else if (i === this.iPage) {
        brightness = 1;
      // Otherwise more subtle for pages that exist.
      } else {
        brightness = 0.2;
      }
      leds[i] = brightness;
    }
    return leds;
  }

  /**
   * Display the page names.
   */
  computeTopHTML(stt, iDisplay) {
    const base = iDisplay * 4;
    const top = base + 4;
    const pieces = [];
    for (let i = base; i < top; i++) {
      const page = this.pages[i];
      let tstr;
      if (page) {
        pieces.push(html`<div class="displayButton">
  ${page.name}
</div>`);
      } else {
        pieces.push(html`<div class="displayButton">_</div>`);
      }
    }
    return pieces;
  }

  /**
   * Colors come from a pre-made constant color table for now.  We only light up
   * buttons for which we have a task on this page.
   */
  computeGridColors() {
    const curPage = this.curPage;
    const colors = new Array(GRID_CELLS);

    for (let iCell = 0; iCell < GRID_CELLS; iCell++) {
      const task = curPage && curPage.tasks[iCell];
      if (task) {
        colors[iCell] =
          this.colorHelper.computeDisplayColor(this.buttonColors[iCell]);
      } else {
        colors[iCell] = this.unlitButtonDisplayColor;
      }
    }

    return colors;
  }

  computeCellHTML(iCell, iRow/*, iCol*/) {
    const curPage = this.curPage;
    let useClass = 'gridButton';
    if (iRow === 0) {
      useClass += ' topGridRow';
    }

    const task = curPage && curPage.tasks[iCell];

    // Leave blank cells empty.
    if (!task) {
      return html`<div class="${useClass}"></div>`;
    }

    const wrappedColor = this.buttonColors[iCell];
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

module.exports.TaskPickerMode = TaskPickerMode;
