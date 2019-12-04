"use strict";

const { openStreamDeck } = require('elgato-stream-deck')

const { renderToString } = require('@popeindustries/lit-html-server');

/**
 * This is a whittled-down version of the mk3 variant of this class.  The
 * streamdeck is a homogenous grid of LCD buttons, so there's no meaningful
 * mapping.  Some type of cuteness may be appropriate for the modes if they
 * create their own UIs, but that's at a higher level.
 *
 * For now the HTML display strategy is to render a single HTML document to the
 * full streamdeck display every time.  The protocol and general button-centric
 * display allow for rendering buttons independently, but it seems likely the
 * HTML might want to be able to span multiple buttons, etc.
 */
class DeckControllerDriver {
  constructor({ dispatcher, log, asyncRenderHTML, colorHelper }) {
    const controller = this.controller = openStreamDeck();

    // nb: There are a bunch of getters that expose the properties on the object
    // more directly.  I didn't see them at first and see no reason to change
    // yet.
    this.COLUMNS = controller.deviceProperties.COLUMNS;
    this.ROWS = controller.deviceProperties.ROWS;
    this.ICON_SIZE = controller.deviceProperties.ICON_SIZE;

    this.TOTAL_PIX_WIDTH = this.COLUMNS * this.ICON_SIZE;
    this.TOTAL_PIX_HEIGHT = this.ROWS * this.ICON_SIZE;

    const numDisplays = this.numDisplays = 1;

    this.dispatcher = dispatcher;
    this.log = log;
    this.asyncRenderHTML = asyncRenderHTML;

    this.buttonStates = new Array(controller.NUM_KEYS);

    /**
     * For each display, the HTML of what is currently displayed.
     */
    this.htmlDisplayed = new Array(numDisplays);
    /**
     * For each display, the HTML of what we most recently asked to be rendered.
     * When we get the render back for a display, the value moves to
     * `htmlDisplayed`.  If there is a value for the display in `htmlDesired`,
     * we kick off another render and move the value to `htmlPending`.
     */
    this.htmlPending = new Array(numDisplays);
    /**
     * The most recently desired HTML contents for the given display, and which
     * has not yet been issued to a html-rendering-capable client.  This can
     * be clobbered if we are generating new desired HTML state faster than we
     * can render it or, more likely, if we're simply not connected to such a
     * client at the current moment.
     */
    this.htmlDesired = new Array(numDisplays);
    // See updateHTML().
    this._htmlUpdatePending = false;

    this._bindButtons();
  }

  close() {
    this.controller.close();
  }

  updateLEDs() {
    const stt = this._latchState();

    // -- HTML
    this.updateHTML(stt);
  }

  /**
   * Recomputes HTML displays for the modes and issues rendering requests if
   * needed.  This uses a very dumb/simple Promise-based debouncing to minimize
   * same-event-loop-dispatch churn.  There's slightly more complicated flow
   * control going on beyond that state, but we're assuming the calls to
   * computeHTML aren't free, hence the Promise debouncing.  A setTimeout(0)
   * approach might also be appropriate, although I need to understand how
   * node.js handles differentiating tasks/micro-tasks as to whether that
   * actually changes things.
   */
  async updateHTML(stt) {
    if (this._htmlUpdatePending) {
      return;
    }
    this._htmlUpdatePending = true;
    // yield control flow / go async
    await Promise.resolve();
    this._htmlUpdatePending = false;

    const ctrl = this.controller;
    if (!stt) {
      stt = this._latchState();
    }

    if (this.numDisplays) {
      for (let iDisplay = 0; iDisplay < this.numDisplays; iDisplay++) {
        const recentHtml = this.htmlDesired[iDisplay] ||
                           this.htmlPending[iDisplay] ||
                           this.htmlDisplayed[iDisplay];

        const desiredHtml = await renderToString(
          this.dispatcher.computeDeckHTML(stt, iDisplay));
        if (desiredHtml !== recentHtml) {
          // it's async, but run for side-effect, no need to wait
          //console.log('...want to update display', iDisplay, 'to', desiredHtml);
          this.setDisplayHTML(iDisplay, desiredHtml);
        }
      }
    }
  }

  async setDisplayHTML(iDisplay, html) {
    // If we already have a pending render, then just stash the HTML in desired
    // and the active instance of ourselves will re-trigger once it's done.
    if (this.htmlPending[iDisplay]) {
      //console.log('  already pending HTML, saving to desired');
      this.htmlDesired[iDisplay] = html;
      return;
    }

    // Check that this isn't already what we've displayed.  This has some
    // overlap with the logic in updateHTML, but we may potentially end up
    // having this method called directly as we experiment here...
    if (this.htmlDisplayed[iDisplay] === html) {
      //console.log('  already displaying desired HTML, bailing');
      return;
    }

    /*
    console.log('updating display', iDisplay,
     'to', html
    );
    */
    // Otherwise do note that this is now the pending HTML...
    this.htmlPending[iDisplay] = html;

    const { imageArray } = await this.asyncRenderHTML({
      width: this.TOTAL_PIX_WIDTH,
      height: this.TOTAL_PIX_HEIGHT,
      mode: 'rgb',
      htmlStr: html
    });


    const buf = Buffer.from(imageArray);

    //console.log('got rendering data, blitting');
    // we wait for this to fully be sent as a form of flow-control
    this.controller.fillPanel(buf);

    this.htmlDisplayed[iDisplay] = html;
    this.htmlPending[iDisplay] = null;

    if (this.htmlDesired[iDisplay]) {
      html = this.htmlDesired[iDisplay];
      this.htmlDesired[iDisplay] = null;
      return this.setDisplayHTML(iDisplay, html);
    }
    // otherwise, we're done.
  }

  /**
   * Capture the current state of the controller as we understand it on a fresh
   * object that we will not subsequently updated;
   */
  _latchState() {
    const stt = {
      columns: this.COLUMNS,
      rows: this.ROWS,
      iconPix: this.ICON_SIZE,
      buttons: this.buttonStates.concat()
    };
    return stt;
  }

  /**
   * Make a button event that captures the current state of all buttons when
   * pressed.
   */
  _makeButtonEvent(name, index) {
    const evt = this._latchState();
    evt.name = name;
    evt.index = index;
    return evt;
  }

  _makeValueEvent(name, index, value) {
    const evt = this._makeButtonEvent(name, index);
    evt.value = value;
    return evt;
  }

  _bindButtons() {
    let pressMethodName = "onButtonDown";
    let methodName = "onButton";
    let index;
    let match;
    let name = "button";

    for (let index=0; index < this.controller.NUM_KEYS; index++) {
      this.buttonStates[index] = 0;
    }

    this.controller.on(`down`, (index) => {
      this.buttonStates[index] = 1;

      if (pressMethodName) {
        const evt = this._makeButtonEvent(name, index);
        if (!(pressMethodName in this.dispatcher)) {
          this.log(`no handler for: ${pressMethodName}`);
          return;
        }
        this.dispatcher[pressMethodName](evt);
      }

      this.updateLEDs();
    });
    this.controller.on(`up`, (index) => {
      this.buttonStates[name] = 0;
      const evt = this._makeButtonEvent(name, index);

      //console.log('attempting dispatch of', name);

      if (!(methodName in this.dispatcher)) {
        this.log(`no handler for: ${methodName}`);
        return;
      }
      this.dispatcher[methodName](evt);
      this.updateLEDs();
    });
  }
}

module.exports.DeckControllerDriver = DeckControllerDriver;
