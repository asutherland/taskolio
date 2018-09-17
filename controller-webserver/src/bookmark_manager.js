const tinycolor = require("tinycolor2");

const NO_BOOKMARK_RGB = [0, 0, 0];

/**
 * Mints opaque, JSON-serializable bookmark descriptors and provides API for
 * all meta-data related operations like setting explicit bookmark hue-sat
 * colors and retrieving the current derived RGB color given the reported status
 * in the `VisibilityTracker`.
 */
class BookmarkManager {
  constructor({ visibilityTracker, brainBoss }) {
    this.visTracker = visibilityTracker;
    this.brainBoss = brainBoss;
  }

  // helper for our bookmark minters
  _makeBookmark(containerId, focusSlotId) {

    return {
      containerId,
      focusSlotId,
      hue: 360 * Math.random(),
      sat: 1.0,
    };
  }

  /**
   * Create a bookmark at window-level granularity.  If you want the bookmark to
   * be more specific and refer to containerId's inside an app/its windows, then
   * use `mintBookmarkForFocusedThing`.
   */
  mintBookmarkForFocusedWindow() {
    const containerId = this.visTracker.getFocusedWindowContainerId();
    // It's possible nothing is focused.
    if (!containerId) {
      console.warn('asked to mint window bookmark with nothing focused');
      return null;
    }

    // XXX for now, let's not track the focus slot since that's the monitor and
    // we're not yet proposing to move windows between monitors.
    const focusSlotId = null;
    return this._makeBookmark(containerId, focusSlotId);
  }

  /**
   * Create a new bookmark that describes the currently most-focused container,
   * if one exists.  This bookmark may be more specific than a window if the
   * window is a taskolio client.  Use `mintBookmarkForFocusedWindow` if you
   * only want window granularity.
   *
   * Null is returned if nothing was focused or if something else went wrong.
   *
   * In the future, additional hooky things will be given the option to attempt
   * to suggest colors for the thing being bookmarked.
   */
  mintBookmarkForFocusedThing() {
    const containerId = this.visTracker.getFocusedContainerId();
    // It's possible nothing is focused.
    if (!containerId) {
      console.warn('asked to mint specific bookmark with nothing focused');
      return null;
    }

    const focusSlotId = this.visTracker.getFocusedFocusSlotId();
    return this._makeBookmark(containerId, focusSlotId);
  }

  /**
   * Helper to merge visual settings of an old bookmark into a new bookmark.
   * This is a stop-gap to make life easier when manually re-establishing
   * bookmarks that ideally should have been automatically re-established.
   */
  maybeMergeBookmarks(newBookmark, oldBookmark) {
    if (!oldBookmark) {
      return newBookmark;
    }

    newBookmark.hue = oldBookmark.hue;
    newBookmark.sat = oldBookmark.sat;

    return newBookmark;
  }

  /**
   * Given a collection, find the first Bookmark that corresponds to whatever
   * is the currently focused thing.  You would use this for things like
   * changing the color of the bookmark corresponding to whatever's currently
   * focused without requiring modes to track this themselves or introduce
   * additional superflouous picker states.
   *
   * @param {'thing'|'window'} [granularity='thing']
   *   Specifies if we should be dealing with window granularity or not.
   */
  findFocusedBookmarkInCollection(coll, granularity) {
    const useWindow = (granularity === 'window');
    const focusedId =
      useWindow ? this.visTracker.getFocusedWindowContainerId()
                : this.visTracker.getFocusedContainerId();
    const focusSlotId = this.visTracker.getFocusedFocusSlotId();
    console.log('findFocusedBookmarkInCollection: looking for',
                 focusedId, focusSlotId);
    // It's possible nothing is focused.
    if (!focusedId) {
      console.log('findFocusedBookmarkInCollection: nothing focused?');
      return null;
    }

    function traverseArray(arr) {
      for (const obj of arr) {
        if (!obj) {
          continue;
        }

        // Support nested arrays.
        if (Array.isArray(obj)) {
          const found = traverseArray(obj);
          if (found) {
            return found;
          }
        } else if (obj.containerId === focusedId &&
                   (!obj.focusSlotId || obj.focusSlotId === focusSlotId)) {
          console.log('findFocusedBookmarkInCollection: found:', obj);
          return obj;
        }
      }

      // not found.
      console.log('findFocusedBookmarkInCollection: no matching thing');
      return null;
    }

    if (Array.isArray(coll)) {
      return traverseArray(coll);
    } else {
      throw new Error("Unsupported collection type!");
    }
  }

  setBookmarkHueSat(bookmark, hue, sat) {
    bookmark.hue = hue;
    bookmark.sat = sat;
  }

  /**
   * Focus the given bookmark.  If this is a window bookmark, we only have to
   * tell the window client.  If this is a bookmark from a more detailed client,
   * we need to tell the window manager client too if we don't already believe
   * the window is focused.  (Or more specifically, we don't want to tell the
   * window manager to focus the window if it's not already focused because this
   * may raise the window, which may not be desired in non-click-to-focus
   * scenarios where the window may be partially obscured and that's desirable.
   * This could alternately be handled by the window manager client itself, but
   * if we do it here, it's more easily observable if we're looking at our
   * debug output and what's going over the wire.)
   */
  focusBookmark(bookmark) {
    if (!bookmark) {
      return;
    }

    const { focusSlotId, windowContainerId, windowFocused } =
      this.visTracker.figureOutHowToFocusThing(
        bookmark.containerId, bookmark.focusSlotId);

    // (If bookmark.containerId is already a window containerId, then
    // windowContainerId will be null.)
    if (windowContainerId && !windowFocused) {
      this.brainBoss.focusContainerId(windowContainerId);
    }
    this.brainBoss.focusContainerId(bookmark.containerId, focusSlotId);
  }

  /**
   * Hacky mechanism to tunnel slider values for the top buttons on the current
   * bank through to whatever the client is.  For the window manager this will
   * be jokey cross-fades for now, for web-browser clients this would be volume
   * levels.
   *
   * This wants to be a real mechanism, and probably wants to be volume levels
   * in all cases.
   */
  fadeBookmark(bookmark, value) {
    if (!bookmark) {
      return;
    }

    this.brainBoss.fadeContainerId(bookmark.containerId, value)
  }

  /**
   * Computes the RGB color for the given bookmark given current visibility
   * status and the hue/sat associated with the bookmark.
   *
   * If `null` is passed-in, NO_BOOKMARK_RGB will be returned, which is
   * currently black, but I guess could change in the future.
   */
  computeRGBColorForBookmark(bookmark, brightnessScale) {
    if (!bookmark) {
      return NO_BOOKMARK_RGB;
    }

    const visResult = this.visTracker.checkVisibility(
      bookmark.containerId, bookmark.focusSlotId);

    // uh, we rea
    let brightness;
    switch (visResult) {
      case 'focused':
        brightness = 1.0;
        break
      case 'visible':
        brightness = 0.8;
        break;
      case 'hidden':
        brightness = 0.5;
        break;
      case 'missing':
        brightness = 0.2;
        break;
      default:
        throw new Error("unknown visibility: " + visResult);
    }

    brightness *= brightnessScale;

    const color = tinycolor({ h: bookmark.hue, s: bookmark.sat, v: brightness });
    const { r, g, b } = color.toRgb();
    return [r, g, b];
  }
}

module.exports.BookmarkManager = BookmarkManager;
