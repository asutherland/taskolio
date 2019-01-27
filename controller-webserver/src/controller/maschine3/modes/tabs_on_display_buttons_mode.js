"use strict";

/**
 * Handles displaying auto-bookmarked pinned browser tabs across the top of the
 * 2 mk3 tabs with the buttons above them indicating notifications and allowing
 * switching to the tabs.
 *
 * In order to figure out the set of pinned tabs we:
 * - Hard-coded assume that in bookmark location 0 we'll find a window container
 *   id which references a browser window.
 * - Map that to a client prefix and a
 */
class TabsOnDisplayButtonsMode {
  constructor({ dispatcher, visibilityTracker, bookmarkMode }) {
    this.dispatcher = dispatcher;
    this.visTracker = visibilityTracker;
    this.bookmarkMode = bookmarkMode;

    // The window containerId we pull out of the bookmark.
    this.usingWindowContainerId = null;
    // The prefix of the client that corresponds to.
    this.usingPrefix = null;
    // The unprefixed focusSlotId (therefore window id) that corresponds to.
    this.usingFocusSlotId = null;

    this.view = this.visTracker.createFilteredSubscription({
      filterPred: (tab) => {
        if (!this.usingWindowContainerId) {
          return false;
        }

        return (tab.pinned &&
                tab.focusSlotId == this.usingFocusSlotId &&
                tab.fullContainerId.startsWith(this.usingPrefix));
      },

      compare: (a, b) => {
        return b.index - a.index;
      },

      onUpdate: (items) => {
        this.onItemsUpdated(items);
      }
    });
  }

  onMixerButton() {
    this.rederiveFilter();
  }

  rederiveFilter() {
    const bookmark = this.bookmarkMode.banks[0][0];
    if (!bookmark) {
      this.usingWindowContainerId = null;
      this.usingPrefix = null;
      this.usingFocusSlotId = null;
      return;
    }

    // This is the fully prefixed containerId.
    this.usingWindowContainerId = bookmark.containerId;
    const info =
      this.visTracker.resolveWindowContainerIdToClientInfo(this.usingWindowContainerId);
    if (!info) {
      console.error('unable to find focus info for', this.usingWindowContainerId);
      return;
    }
    this.usingPrefix = info.prefixWithDelim;
    this.usingFocusSlotId = info.focusSlotId;

    this.view.reset();
  }

  onItemsUpdated(items) {
    // XXX we may need to explicitly trigger an HTML rebuild if whatever induced
    // this update doesn't update the LEDs itself.  (It probably should?)
  }

  computeDisplayLEDs(stt) {
    const leds = new Array(8);
    for (let i = 0; i < 8; i++) {
      const tab = this.view.items[i];
      let brightness;
      // There may be no such tab, in which case leave the button off.
      if (!tab) {
        brightness = 0;
      } else if (tab.attention) {
        brightness = 1;
      } else {
        brightness = 0.2;
      }
      leds[i] = brightness;
    }
    return leds;
  }

  /**
   * When the display button corresponding to a tab is pushed, we want to show
   * that tab.
   */
  onDisplayButton(evt) {
    const tab = this.view.items[evt.index];
    if (!tab) {
      return;
    }

    this.visTracker.focusThing(tab.fullContainerId);
  }

  computeTopHTML(stt, iDisplay) {
    const base = iDisplay * 4;
    const top = base + 4;
    let s = '';
    for (let i = base; i < top; i++) {
      const tab = this.view.items[i];
      // tab may be undefined if we found less than 8 pinned tabs (or no pinned)
      // tabs.
      let tstr;
      if (tab) {
        tstr = `<div>
  ${tab.title}
</div>`;
      } else { // the case where the tab didn't exist...
        tstr = `<div></div>`;
      }
      s += tstr;
    }
    return s;
  }
}

module.exports.TabsOnDisplayButtonsMode = TabsOnDisplayButtonsMode;
