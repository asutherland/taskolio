"use strict";

/**
 * This mode lets clients like web browsers send us action bookmark requests
 * that grant us a capability to trigger some action in a container.  Right now
 * that means being able to click on a button/link in a webpage, primarily
 * intended for being able to do media things in Google Play Music right now.
 */
export class ActionBookmarkMode {
  brainBoss: any;
  bookmarkActions: any;
  _saveState: any;
  log: any;
  pickingButton: boolean;
  constructor({ brainBoss, persistedState, saveState, log }) {
    this.brainBoss = brainBoss;
    this.bookmarkActions = persistedState || {};
    this._saveState = saveState;
    this.log = log;

    this.pickingButton = false;
  }

  onUnhandledButton(capitalName, evt) {
    if (this.pickingButton) {
      this.bookmarkActions[capitalName] = this.pickingButton;
      this._saveState(this.bookmarkActions);
      this.log(`picked ${capitalName}`);
      this.pickingButton = null;
      return;
    }

    const actionInfo = this.bookmarkActions[capitalName];
    if (!actionInfo) {
      return;
    }

    this.brainBoss.triggerContainerAction(
      actionInfo.containerId, actionInfo.actionId);
  }

  computeUnhandledLED(capitalName) {
    const actionInfo = this.bookmarkActions[capitalName];
    if (!actionInfo) {
      return 0;
    }
    return 1;
  }

  /**
   * We receive this when the web browser webext client claims the user has
   * told it to authorize a bookmark action.  We take this to be explicit user
   * action that should immediately shift us into a mode to pick which button
   * to bind the action to.
   */
  onActionBookmarkRequest(info) {
    this.pickingButton = info;
    this.log(`entering button picking mode`);
  }
}
