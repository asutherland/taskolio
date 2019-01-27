import TaskolioClient from "./taskolio_ws_client.js";
import { renderHTMLTo16BitArray } from "../html_renderer/render_html.js";

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

    const focusSlots = windows.map((win, iWin) => {
      return {
        // It might be better to use sessionId if available... it's not clear
        // whether the browser persists these id's through SessionStore restores
        // otherwise.  This is fine for now, however.
        focusSlotId: win.id,
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
            bounds: {
              left: win.left * pxRatio,
              top: win.top * pxRatio,
              width: win.width * pxRatio,
              height: win.height * pxRatio
            },
            devicePixelRatio: pxRatio
          }
        ]
      };
    });

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

    const inventory = windows.map((win, iWin) => {
      const activeTab = win.tabs.find(tab => tab.active);

      return {
        // Again, like for windows, it's possible the sessionId is more useful.
        containerId: activeTab && activeTab.id,
        focusSlotId: win.id,
        state: win.focused ? 'focused' : 'visible'
      };
    });

    this.client.sendMessage('thingsVisibilityInventory', {
      inventory
    });
  },

  _extractTabInfo(tab) {
    return {
      // the tab's id (which unfortunately is not currently stable between
      // browser restarts) is what we use to identify the tab for now.  We might
      // also try and hack something up with the sessionId.
      containerId: tab.id,
      // right, this is ephemeral too.
      focusSlotId: tab.windowId,
      sessionId: tab.sessionId,
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
  async sendThingsExistForWorkspace() {
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
        items.push(this._extractTabInfo(tab));
      }
    }

    this.client.sendMessage('thingsExist', {
      items
    });
    // Since we are an async process, it's very possible the visibility inventory
    // already happened, so just send a fresh one now that we've run.
    // Alternately, we could have our caller wait for us and call.
    this.updateAndSendThingsVisibilityInventory();
  },

  async activate() {
    // Whenever the active tab changes, send an updated focus slots inventory.
    const sendUpdateHelper = this.sendUpdateHelper = () => {
      this.updateAndSendFocusSlotsInventory();
    }
    browser.tabs.onActivated.addListener(sendUpdateHelper);

    // Send updated things exist entries whenever a tab changes.  This is a new
    // thing we're doing now that we have screens that care about being able to
    // display info about the tabs we have.
    const sendUpdatedThingsExist = this.sendUpdatedThingsExist = (tabId, changeInfo, tab) => {
      this.client.sendMessage('thingsExist', {
        items: [
          this._extractTabInfo(tab)
        ]
      });
    };
    // Now that we're getting more proactive about exists notifications, we also
    // need to start generating 'gone' notifications.
    browser.tabs.onUpdated.addListener(sendUpdatedThingsExist);
    const sendThingGone = this.sendThingGone = (tabId) => {
      this.client.sendMessage('thingsGone', {
        items: [
          {
            containerId: tabId
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

        // report our focus slots inventory (synchronously), also sending a
        // visibility inventory that will be useless to the server until it gets
        // info on the containerId's, which happens in the next step.
        this.updateAndSendFocusSlotsInventory();
        // asynchronously enumerate the files in the workspace and report them as
        // containerId's, triggering a visibility inventory automatically at the
        // tail end of this.
        this.sendThingsExistForWorkspace();

        // TODO: better handle tracking changes to the workspace.  Specifically:
        // - It seems like we want to use a FileSystemWatcher to know when things
        //   are changing, but I want to ensure that this won't cost system
        //   resources.  We really just want to piggy-back on whatever the folder
        //   tree is doing.
        // - For now we just make sure we send thingsExist notifications for the
        //   visible text editors at all time, and this handles the creation of
        //   new files as they happen.  It doesn't cover deletion of files, but
        //   that's arguably not the biggest deal unless it starts resulting in
        //   empty files being created as selecting a bookmark does the wrong
        //   thing.
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
        const tabId = parseInt(thing.containerId, 10);
        const winId = parseInt(thing.focusSlotId, 10);

        console.log("trying to activate tab:", tabId, "in window", winId);
        browser.tabs.update(tabId, { active: true });
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
