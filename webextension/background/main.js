import TaskolioClient from "./taskolio_ws_client.js";
import { renderHTMLTo16BitArray } from "../html_renderer/render_html.js";
import { ElementBookmarker } from "./element_bookmarker.js";

/**
 * This implementation is derived from taskolio-atom-client which was somewhat
 * hackily adapted from taskolio-vscode-client in an attempt to imitate the
 * auto-generated atom extension's idiom.  Besides obvious semantic differences
 * of browser tabs from editor tabs and that Firefox is multi-window where atom
 * is window-per-project (and therefore window-per-client), this client also
 * hosts HTML rendering logic for MIDI controller displays.
 */
const ExtCore = {
  subscriptions: null,
  // The TaskolioClient
  client: null,

  /**
   * The ElementBookmarker that handles generating element bookmarks and
   * processes requests to trigger them.
   */
  elementBookmarker: null,

  /**
   * This maps tab id's to the persistent id we created for them and set with
   * `browser.sessions.setTabValue`.
   */
  rawTabIdToPersistentId: new Map(),
  /**
   * This maps persistent id's to the underlying tab id.
   */
  persistentIdToRawTabId: new Map(),

  // Same as for tabs, but now for windows!
  rawWindowIdToPersistentId: new Map(),
  persistentIdToRawWindowId: new Map(),

  PERSISTENT_TAB_ID_KEY: 'taskolio-id',
  PERSISTENT_WINDOW_ID_KEY: 'taskolio-win-id',
  persistentIdEpoch: Date.now(),

  /**
   * Generate a persistent tab id.  For now we just generate a prefix derived
   * from the client's start time and the rawTabId we're given.  If we cared
   * about id size we could do a persistent numeric value using localStorage
   * (performing a safety 'jump' on load in case previous increments didn't hit
   * disk).
   */
  makePersistentId(rawTabId) {
    const persId = `0-${this.persistentIdEpoch}-${rawTabId}`;
    return persId;
  },

  /**
   * Helper to do the asynchronous session lookup for the tab and to assign the
   * id if it didn't exist.  This is simple logic, but because there's
   * inherently a potential race as other events arrive in parallel and
   * multiple redundant lookups could occur and step on each other, it pays to
   * have a helper.
   *
   * NB: ensurePersistentWindowId is a mutated clone of this; update that if
   * updating this, etc.
   */
  async ensurePersistentTabId(rawTabId) {
    let persId = this.rawTabIdToPersistentId.get(rawTabId);
    // Note, this might be a promise!
    if (persId) {
      return persId;
    }
    let resolve;
    const pendingPromise = new Promise((_resolve) => { resolve = _resolve; });
    this.rawTabIdToPersistentId.set(rawTabId, pendingPromise);

    persId = await browser.sessions.getTabValue(rawTabId, this.PERSISTENT_TAB_ID_KEY);
    if (!persId) {
      persId = this.makePersistentId(rawTabId);
      browser.sessions.setTabValue(rawTabId, this.PERSISTENT_TAB_ID_KEY, persId);
    }
    // resolve the promise any equivalent calls to us made during our async time
    // are now waiting on...
    resolve(persId);
    // And update the true value to no longer involve a promise.
    this.rawTabIdToPersistentId.set(rawTabId, persId);
    this.persistentIdToRawTabId.set(persId, rawTabId);
    return persId;
  },

  forgetTab(rawTabId) {
    const persId = this.rawTabIdToPersistentId.get(rawTabId);
    if (!persId) {
      return;
    }

    this.rawTabIdToPersistentId.delete(rawTabId);
    this.persistentIdToRawTabId.delete(persId);
    return persId;
  },

  // This is just ensurePersistentTabId copy-paste-modified
  async ensurePersistentWindowId(rawWindowId) {
    let persId = this.rawWindowIdToPersistentId.get(rawWindowId);
    // Note, this might be a promise!
    if (persId) {
      return persId;
    }
    let resolve;
    const pendingPromise = new Promise((_resolve) => { resolve = _resolve; });
    this.rawWindowIdToPersistentId.set(rawWindowId, pendingPromise);

    persId = await browser.sessions.getWindowValue(rawWindowId, this.PERSISTENT_WINDOW_ID_KEY);
    if (!persId) {
      persId = this.makePersistentId(rawWindowId);
      browser.sessions.setWindowValue(rawWindowId, this.PERSISTENT_WINDOW_ID_KEY, persId);
    }
    // resolve the promise any equivalent calls to us made during our async time
    // are now waiting on...
    resolve(persId);
    // And update the true value to no longer involve a promise.
    this.rawWindowIdToPersistentId.set(rawWindowId, persId);
    this.persistentIdToRawWindowId.set(persId, rawWindowId);
    return persId;
  },

  // This is just forgetWindow copy-paste-modified
  forgetWindow(rawWindowId) {
    const persId = this.rawWindowIdToPersistentId.get(rawWindowId);
    if (!persId) {
      return;
    }

    this.rawWindowIdToPersistentId.delete(rawWindowId);
    this.persistentIdToRawWindowId.delete(persId);
    return persId;
  },

  /**
   * Send an updated focusSlotsInventory to the server.
   *
   * This method is fired on first connection, plus every time the set of
   * browser windows changes.  Because that may potentially
   * purge the visibility state of things in the server, we also directly invoke
   * updateAndSendThingsVisibilityInventory().
   */
  async updateAndSendFocusSlotsInventory() {
    if (!this.client) {
      return;
    }

    const windows = await browser.windows.getAll({ windowTypes: ["normal"] });

    const pxRatio = window.devicePixelRatio;

    const focusSlots = [];
    for (const win of windows) {
      const persWinId = await this.ensurePersistentWindowId(win.id);
      focusSlots.push({
        focusSlotId: persWinId,
        parentDescriptors: [
          // I don't think we know the PID to provide it here, but thankfully
          // the Firefox process model means that gnome-shell should be able to
          // map from the window to the process without trouble.  (Compare with
          // electron-based apps that maintain a root forking process that
          // confuses gnome-shell.)
          {
            title: win.title,
            // We now provide the bounds so that we can tie the focusSlotId to
            // the actual window as gnome-shell understands it without having to
            // engage in games where we tunnel information through the window
            // title.  (In the future we can also get better at automatically
            // restoring bookmarks based on window positions and metadata like
            // the unique client persistence id.)
            //
            // Note that the pixel ratio rules as they apply to the window
            // coordinates are very awkward.  In a multi-monitor setup with two
            // 3840x2160 displays, the window on the right half of the right
            // display can have an absolute screen X of 5760 (3840 + 1920).
            // However, when Firefox goes to apply the scaling, rather than
            // apply it to the whole 5760, it applies it only to the relative
            // location of the window on the current monitor.  So the X coord
            // becomes 3840 + (1920*1.25) = 5376.
            //
            // See
            // https://searchfox.org/mozilla-central/rev/fe7dbedf223c0fc4b37d5bd72293438dfbca6cec/dom/base/nsGlobalWindowOuter.cpp#3638
            //
            // Because the webext APIs don't usefully expose screen information,
            // we just send the confused cssBounds here unscaled so that the
            // controller can attempt to apply a correction factor knowing the
            // actual screen coordinates and
            cssBounds: {
              left: win.left,
              top: win.top,
              width: win.width,
              height: win.height,
            },
            devicePixelRatio: pxRatio,
          }
        ]
      });
    }

    this.client.sendMessage('focusSlotsInventory', {
      focusSlots
    });
    this.updateAndSendThingsVisibilityInventory();
  },

  async updateAndSendThingsVisibilityInventory() {
    if (!this.client) {
      return;
    }

    // For simplicity we just re-query all windows and their tabs.  A more
    // efficient approach would be to reuse tabdrome's TabTracker implementation
    // which can maintain an efficient understanding of state.  However, that's
    // potentially error-prone and we expect this method to be called only on
    // focus/tab changes, which is rare enough for our purposes at this time.

    const windows = await browser.windows.getAll({
      populate: true,
      windowTypes: ["normal"]
    });

    const inventory = [];
    for (const win of windows) {
      const persWinId = await this.ensurePersistentWindowId(win.id);
      const activeTab = win.tabs.find(tab => tab.active);

      const activePersId = activeTab &&
                           await this.ensurePersistentTabId(activeTab.id);
      inventory.push({
        // Again, like for windows, it's possible the sessionId is more useful.
        containerId: activePersId,
        focusSlotId: persWinId,
        state: win.focused ? 'focused' : 'visible'
      });
    }

    this.client.sendMessage('thingsVisibilityInventory', {
      inventory
    });
  },

  _extractTabInfo(tab, persTabId, persWinId) {
    return {
      // the tab's id (which unfortunately is not currently stable between
      // browser restarts) is what we use to identify the tab for now.  We might
      // also try and hack something up with the sessionId.
      containerId: persTabId,
      // right, this is ephemeral too.
      focusSlotId: persWinId,
      index: tab.index,
      cookieStoreId: tab.cookieStoreId,
      title: tab.title,
      url: tab.url,
      pinned: tab.pinned,
      attention: tab.attention,
      // TODO: similarly, this could provide useful info, but right now it's
      // just noise or a privacy issue.
      rawDetails: {}
    };
  },

  /**
   * Send a thingExists notification for every current tab.  As with the
   * editors, it's quite possible this deserves a re-think.
   */
  async sendThingsExist() {
    if (!this.client) {
      return;
    }

    const windows = await browser.windows.getAll({
      populate: true,
      windowTypes: ["normal"]
    });

    const items = [];

    for (const win of windows) {
      for (const tab of win.tabs) {
        // NB: we could issue the requests in parallel, but this at least avoids
        // having an insane number of requests outstanding at once.
        const persTabId = await this.ensurePersistentTabId(tab.id);
        const persWinId = await this.ensurePersistentWindowId(tab.windowId);
        items.push(this._extractTabInfo(tab, persTabId, persWinId));
      }
    }

    this.client.sendMessage('thingsExist', {
      items
    });
    // Now send the focus slots inventory which will in turn send the visibility
    // inventory.
    this.updateAndSendFocusSlotsInventory();
  },

  async activate() {
    this.elementBookmarker = new ElementBookmarker({
      sendBookmarkRequest: async (tab, elemId) => {
        const persId = await this.ensurePersistentTabId(tab.id);
        this.client.sendMessage('actionBookmarkRequest', {
          containerId: persId,
          actionId: elemId
        });
      }
    });
    this.elementBookmarker.hookupMenus();

    // Whenever the active tab changes, send an updated focus slots inventory.
    const sendUpdateHelper = this.sendUpdateHelper = () => {
      this.updateAndSendFocusSlotsInventory();
    }
    browser.tabs.onActivated.addListener(sendUpdateHelper);

    // Send updated things exist entries whenever a tab changes.  This is a new
    // thing we're doing now that we have screens that care about being able to
    // display info about the tabs we have.
    const sendUpdatedThingsExist = this.sendUpdatedThingsExist = async (tabId, changeInfo, tab) => {
      let persTabId = await this.ensurePersistentTabId(tabId);
      let persWinId = await this.ensurePersistentWindowId(tab.windowId);
      this.client.sendMessage('thingsExist', {
        items: [
          this._extractTabInfo(tab, persTabId, persWinId)
        ]
      });
    };
    // Now that we're getting more proactive about exists notifications, we also
    // need to start generating 'gone' notifications.
    browser.tabs.onUpdated.addListener(sendUpdatedThingsExist);
    const sendThingGone = this.sendThingGone = (tabId) => {
      // Lookup the persistent id and also remove the entry.  If we didn't have
      // a persistent id for the tab, there's nothing to do.
      const persId = this.forgetTab(tabId);
      if (!persId) {
        return;
      }
      this.client.sendMessage('thingsGone', {
        items: [
          {
            containerId: persId
          }
        ]
      });
    };
    browser.tabs.onRemoved.addListener(sendThingGone);

    // XXX it'd be great to get something more deterministic than this, but it's
    // generally contrary to privacy interests to expose the profile name/etc.
    // so let's just generate and persist an id as random numbers.
    let uniqueId;
    if ("uniqueId" in localStorage) {
      uniqueId = localStorage["uniqueId"];
    } else {
      uniqueId = localStorage["uniqueId"] =
        Math.floor(Math.random() * 1e10);
    }

    const browserInfo = await browser.runtime.getBrowserInfo();

    this.client = new TaskolioClient({
      endpoint: 'ws://localhost:8008/',

      /**
       * Handle (re)connecting.
       */
      onConnect: () => {
        // Tell the server our general meta-info.
        this.client.sendMessage('helloMyNameIs', {
          type: 'web-browser',
          name: browserInfo.name,
          // As noted higher up, we simply don't know this.
          rootPid: null,
          uniqueId,
          // We're maybe persistent.  Let's see.
          persistence: true,
          capabilities: ['renderHtml-0'],
        });

        // This will also send a visibility inventory as its last step.
        this.sendThingsExist();
      },

      onDisconnect() {
      },

      /**
       * Select a file based on relative path.  Notable things:
       * - The server internally tries to remember what pane the bookmark was
       *   established in, passing us the focusSlotId.
       *
       * In vscode this ended up being reasonably easy because the concept of
       * column appears to have been more first-class than atom's pane
       * mechanism.  I'm going to hew towards the tight pane affinity here
       * because it seems like not doing so is more likely to infuriate me down
       * the road.
       */
      onMessage_selectThings: async (msg) => {
        const thing = msg.items[0];
        const persTabId = thing.containerId;
        const tabId = this.persistentIdToRawTabId.get(persTabId);
        if (!tabId) {
          return;
        }
        const persWinId = parseInt(thing.focusSlotId, 10);
        const winId = this.persistentIdToRawWindowId.get(persWinId);

        //console.log("trying to activate tab:", tabId, "in window", winId);
        browser.tabs.update(tabId, { active: true });
      },

      onMessage_triggerActionBookmark: async (msg) => {
        const thing = msg.items[0];
        const persId = thing.containerId;
        const tabId = this.persistentIdToRawTabId.get(persId);
        if (!tabId) {
          return;
        }
        const tab = await browser.tabs.get(tabId);

        const elemId = thing.actionId;

        console.log('   actually triggering');
        this.elementBookmarker.triggerBookmarkedAction(tab, elemId);
      },

      onMessage_fadeThings: (msg) => {
        // XXX we currently don't need/want to do anything for fading.
      },

      /**
       * The server tells us when it has successfully mapped our focus slots back
       * to their windows, allowing us to remove the PID we tunnel through our
       * workspace title (because the window manager hints are for the root vscode
       * pid rather than our workspace window's root pid as advertised by
       * process.pid).
       */
      onMessage_focusSlotsLinked: async (msg) => {
      },

      onMessage_renderHtml: async (msg, reply) => {
        const sandboxedIframe = document.getElementById('html-render-frame');
        let imageArray;
        try {
          imageArray = await renderHTMLTo16BitArray({
            sandboxedIframe,
            width: msg.width,
            height: msg.height,
            htmlStr: msg.htmlStr
          });
        } catch (ex) {
          console.error('problem rendering', ex);
        }
        reply({
          imageArray
        });
      }
    });
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  serialize() {
    return {
    };
  },
};

window.addEventListener("load", () => { ExtCore.activate(); }, { once: true });
