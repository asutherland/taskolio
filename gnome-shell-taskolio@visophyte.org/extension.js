'use strict';
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

// This is weird.  Maybe this is just a cargo-culted idiom?
const Self = imports.misc.extensionUtils.getCurrentExtension();
const TaskolioClient = Self.imports.taskolio_soup_client.TaskolioClient;
const WindowTracker = Self.imports.window_tracker.WindowTracker;

// Our auto-reconnecting TaskolioClient.  Initialized in enable() and destroyed
// in disable().
let gClient;
// Thing that tells us about Windows!  Very exciting!
// Initialized by gClient each time we (re)connect, and torn down each time we
// disconnect.
let gWindowTracker;

/**
 * Array of the windowDetails of the window currently visible on the given
 * monitor.  This is a hacky simplification to build from.
 */
let visiblePerMonitor;
/** Array index of the visiblePerMonitor thing that's currently focused.*/
let focusedMonitor;

/**
 * Render visiblePerMonitor in the thingsVisibilityInventory message payload
 * format.  The idea is when focus changed, we clobber the relevant monitor in
 * the given array slot and re-invoke this function.
 *
 * TODO: Better track multiple windows being visible on a single display.  The
 * message payload calls for us being able to express this, but we don't yet
 * actually do that.  This isn't a big deal yet because I personally do only
 * have a single maximized or almost-maximized thing on each monitor.
 */
function flattenVisibilityInventory() {
  const inventory = visiblePerMonitor.map((details, iMonitor) => {
    let state;
    if (details) {
      // there's something there;
      state = (focusedMonitor === iMonitor) ? 'focused' : 'visible';
    } else {
      // there's nothing there, uh...
      state = 'empty';
    }
    return {
      containerId: details ? details.id : null,
      focusSlotId: iMonitor,
      state
    };
  });
  return {
    inventory
  };
}

/**
 * ## Window Tracking
 *
 * ### Goal
 *
 * We want a list of all windows known to the window manager and to keep that
 * up-to-date and to reflect those changes to the server as they happen, using
 * identifiers that are stable for the duration of the X session.
 *
 * This enables the server to automatically re-establish bookmarks based on
 * information about the windows, etc.
 *
 * ### Mechanism
 *
 * Moderate investigation shows that there are two means of tracking windows
 * in an entirely window-driven manner using signals.
 *
 * - Workspaces.  They eached provide "window-added"/"window-removed" signals
 *   that originate from within the C core of Mutter.  The downside to this is
 *   some windows exist across all workspaces and the set of workspaces can
 *   dynamically change, so there's some additional bookkeeping and moving
 *   parts.
 *   - This is what shell-window-tracker.c uses to find out about windows.  It
 *     helps map from windows to ShellApp instances which can also provide us
 *     with PIDs.
 * - Use the display-scoped "window-created" signal, then subscribe to the
 *   "unmanaged" signal on each of the created windows to know when they go
 *   away.  This potentially results in a much greater number of tracked
 *   signals.
 *
 * The JS logic in gnome-shell seems to frequently favor dirtying notifications
 * that cause a re-enumeration of the known windows/workspaces/etc. using either
 * delta detection or just re-starting from an empty state.  This fits well in
 * many cases that are triggered by user action, but doesn't fit for us.
 *
 * The currently adopted solution is the 1 "window-created" listener paired with
 * N "unmanaged" listeners.
 **/

function makeConnection() {
  return new TaskolioClient({
    endpoint: 'ws://localhost:8008/',

    /**
     * Handle (re)connecting.
     */
    onConnect() {
      // Tell the server our general meta-info.
      gClient.sendMessage('helloMyNameIs', {
        type: 'window-manager',
        name: 'gnome-shell',
        rootPid: null,
        uniqueId: 'wm',
        // XXX it probably makes sense to choose a persistence id that's
        // something like the start time of this gnome session.
        persistence: false
      });

      // Tell the server about our monitors.  The Mutter hierarchy is the same
      // as the crufty X Xinerama hierarchy at this time, which means we have
      // "display -> screen" where there's one display (ex :0), and because
      // we're Xinerama, one screen on the display that just happens to span
      // N monitors.

      const numMonitors = global.screen.get_n_monitors();
      // ui/layout.js also maintains an array of JS Monitor instances that hold
      // the monitor geometry.  The array is available via
      // Main.layoutManager.monitors.
      visiblePerMonitor = new Array(numMonitors);

      let focusSlots = Main.layoutManager.monitors.map((monitor) => {
        return {
          focusSlotId: monitor.index,
          parentDescriptor: `monitor${monitor.index}`,
          // we also have the geometry we could expose here.
        };
      });

      gClient.sendMessage('focusSlotsInventory', {
        focusSlots
      });

      gWindowTracker = new WindowTracker({
        onWindowAdded(details) {
          gClient.sendMessage('thingsExist', {
            items: [
              {
                containerId: details.id,
                title: details.title,
                rawDetails: details
              }
            ]
          });
        },

        onWindowFocused(details, data) {
          visiblePerMonitor[details.monitor] = details;
          focusedMonitor = details.monitor;
          gClient.sendMessage('thingsVisibilityInventory',
                              flattenVisibilityInventory());
        },

        onWindowRemoved(details, data) {
          gClient.sendMessage('thingsGone', {
            items: [
              {
                containerId: details.id
              }
            ]
          });
        }
      });
      gWindowTracker.pretendExistingWindowsWereJustAdded();
    },

    onDisconnect() {
      gWindowTracker.shutdown();
      gWindowTracker = null;
    },

    onMessage_selectThings(msg) {
      if (!gWindowTracker) {
        return;
      }

      gWindowTracker.activateWindow(msg.items[0].containerId);
    }
  });
}

function init() {
}

function enable() {
  gClient = makeConnection();
}

function disable() {
  if (gClient) {
    gClient.shutdown();
    gClient = null;
  }
}
