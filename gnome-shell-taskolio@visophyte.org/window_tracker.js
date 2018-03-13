'use strict';

const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

const RE_NATIVE_PTR = /^.+ native@([^\]]+)]$/;

/**
 * Slurp the native pointer address of the given window out of its toString()
 * representation.  This is sketchy but is stable and works.  We can presumably
 * find a way to pierce to the XID underlying the window.
 */
function extractWindowId(win) {
  const winStr = win.toString();
  const match = RE_NATIVE_PTR.exec(winStr);
  return match[1];
}

/**
 * Extract interesting details about the window for the benefit of the app
 * logic so it can remain naive about lower level window management details.
 */
function extractWindowDetails(win, id) {
  let tracker = Shell.WindowTracker.get_default();
  let app = tracker.get_window_app(win);

  return {
    id,
    // raw window manager strings
    wmClass: win.get_wm_class(),
    wmClassInstance: win.get_wm_class_instance(),
    title: win.get_title(),
    // numeric monitor id
    monitor: win.get_monitor(),
    // shell-window-tracker.c figures out how to map from windows to their
    // .desktop meta-info and process-id details, so we provide that too on a
    // per-window basis.
    appId: app.get_id(),
    appName: app.get_name(),
    appDesc: app.get_description(),
    appPids: app.get_pids(),
    // TODO: could be handy if command line arguments could be excerpted for
    // cases like "-P profilename" for Firefox.  Or alternately, we could
    // perhaps sniff /proc/PID to locate the directories the app seems to be
    // using for profile storage, etc.
  };
}

/**
 * See extension.js' "Window Tracking" block comment.
 */
let WindowTracker = new Lang.Class({
  Name: 'WindowTracker',
  _init({ onWindowAdded, onWindowFocused, onWindowRemoved }) {
    this._windowCreatedId = global.display.connect(
      'window-created', this.onWindowCreated.bind(this));
    this._focusWindowId = global.display.connect(
      'notify::focus-window', this.onFocusedWindowChanged.bind(this));

    this._bound_onWindowDestroyed = this.onWindowDestroyed.bind(this);

    this.winInfoById = new Map();

    this._cb_onWindowAdded = onWindowAdded;
    this._cb_onWindowFocused = onWindowFocused;
    this._cb_onWindowRemoved = onWindowRemoved;
  },

  shutdown() {
    for (let { win, unmanageId } of this.winInfoById.values()) {
      // (there is no need to tell the app callbacks about this, it's the one
      // shutting us down.)
      win.disconnected('unmanaged', unmanageId);
    }
    this.winInfoById = null;

    global.display.disconnect('window-created', this._windowCreatedId);
    this._windowCreatedId = 0;

    global.display.disconnect(this._focusWindowId);
    this._focusWindowId = 0;
  },

  pretendExistingWindowsWereJustAdded() {
    const actors = global.get_window_actors();
    for (let actor of actors) {
      // This returns actors, but we want the actual MetaWindow.
      // NB: We can also get the get the X "Window" type via get_x_window(), but
      // that doesn't seem to be used by gnome-shell's JS logic and it does seem
      // safer to stay a level up from X given the ascendance of Wayland, etc.
      this.onWindowCreated(actor.get_meta_window());
    }
  },

  onWindowCreated(win) {
    const winId = extractWindowId(win);

    const unmanageId = win.connect('unmanaged', this._bound_onWindowDestroyed);

    let data;
    try {
      const details = extractWindowDetails(win, winId);
      data = this._cb_onWindowAdded(details);
    } catch (ex) {
      global.log('problem invoking onWindowAdded callback:' + ex);
    }

    const winfo = {
      // The MetaWindow
      win,
      // The "unmanaged" signal id for us to disconnect() later.
      unmanageId,
      // We'll hold onto and update the details each time the focus changes.
      details,
      // App data provided to us from the onWindowAdded callback we invoked.
      data
    };
    this.winInfoById.set(winId, winfo);
  },

  onFocusedWindowChanged() {
    const win = global.display.focus_window;
    const winId = extractWindowId(win);
    const details = extractWindowDetails(win, winId);
    const winfo = this.winInfoById.get(winId);

    // The Window's state may have changed and we should report that.
    winfo.details = details;

    try {
      this._cb_onWindowFocused(details, winfo.data);
    } catch (ex) {
      global.log('problem invoking onWindowFocused callback:' + ex);
    }
  },

  onWindowDestroyed(win) {
    const winId = extractWindowId(win);
    const winfo = this.winInfoById.get(winId);

    win.disconnect('unmanaged', winfo.unmanageId);
    winfo.unmanageId = 0;

    this.winInfoById.delete(winId);

    try {
      this._cb_onWindowRemoved(winfo.details, winfo.data);
    } catch (ex) {
      global.log('problem invoking onWindowRemoved callback:' + ex);
    }
  },

  /**
   * Make the window active and presumably focused.
   */
  activateWindow(winId) {
    const winfo = this.winInfoById.get(winId);
    if (!winfo) {
      return;
    }

    winfo.win.activate();
  }
});