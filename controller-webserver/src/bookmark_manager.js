const tinycolor = require("tinycolor2");

const NO_BOOKMARK_RGB = [0, 0, 0];

/**
 * Mints opaque, JSON-serializable bookmark descriptors and provides API for
 * all meta-data related operations like setting explicit bookmark hue-sat
 * colors and retrieving the current derived RGB color given the reported status
 * in the `VisibilityTracker`.
 */
class BookmarkManager {
  constructor({ visibilityTracker, brainBoss, colorHelper }) {
    this.visTracker = visibilityTracker;
    this.brainBoss = brainBoss;
    this.colorHelper = colorHelper;
  }

  /**
   * Helper for our bookmark minters.
   *
   * @param {'window'|'container'} scope
   *   What were we trying to bookmark.  If 'window', then the focusSlotId, if
   *   non-null, is the client focus slot we were able to resolve and should be
   *   the basis for resolving the bookmark, falling back to the window
   *   containerId otherwise.
   *
   */
  _makeBookmark(scope, containerId, focusSlotId) {
    return {
      scope,
      containerId,
      focusSlotId,
      color: this.colorHelper.makeRandomColor()
    };
  }

  /**
   * Create a bookmark at window-level granularity.  If we have client info and
   * are able to map to the client's focus slot, we persist that instead.
   * Otherwise we fall back to the window container id.
   *
   * In the future, the fallback would ideally include descriptor-ish info so
   * that we can auto re-establish the bookmark.  (That is, if we know it's
   * the only console window on the left monitor, and later a console window is
   * created on that monitor and it's the only one, that seems reasonable to
   * hook back up.)
   */
  mintBookmarkForFocusedWindow() {
    const windowContainerId = this.visTracker.getFocusedWindowContainerId();
    // It's possible nothing is focused.
    if (!windowContainerId) {
      console.warn('asked to mint window bookmark with nothing focused');
      return null;
    }

    const focusSlotId = this.visTracker.getFocusedFocusSlotId();
    if (focusSlotId) {
      return this._makeBookmark('window', null, focusSlotId);
    } else {
      return this._makeBookmark('window', windowContainerId, null);
    }
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
    return this._makeBookmark('container', containerId, focusSlotId);
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

    newBookmark.color = oldBookmark.color;

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
    /*
    console.log('findFocusedBookmarkInCollection: looking for',
                 focusedId, focusSlotId);
    */
    // It's possible nothing is focused.
    if (!focusedId) {
      //console.log('findFocusedBookmarkInCollection: nothing focused?');
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
          //console.log('findFocusedBookmarkInCollection: found:', obj);
          return obj;
        }
      }

      // not found.
      //console.log('findFocusedBookmarkInCollection: no matching thing');
      return null;
    }

    if (Array.isArray(coll)) {
      return traverseArray(coll);
    } else {
      throw new Error("Unsupported collection type!");
    }
  }

  setBookmarkColor(bookmark, color) {
    bookmark.color = color;
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

    if (bookmark.scope === 'window') {
      this.visTracker.focusWindow(bookmark.containerId, bookmark.focusSlotId);
    } else {
      this.visTracker.focusThing(bookmark.containerId, bookmark.focusSlotId);
    }
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
  computeColorForBookmark(bookmark, brightnessScale) {
    if (!bookmark) {
      return this.colorHelper.computeEmptyDisplayColor();
    }

    let visResult;
    if (bookmark.scope === 'window') {
      visResult = this.visTracker.checkFocusSlotVisibility(bookmark.focusSlotId);
    } else {
      // This covers both scope === 'container' and scope === undefined (which
      // doesn't actually need to be supported going forward but is nice to
      // have for the next few minutes...)
      visResult = this.visTracker.checkVisibility(
        bookmark.containerId, bookmark.focusSlotId);
    }

    return this.colorHelper.computeBookmarkDisplayColor(
      bookmark.color, visResult, brightnessScale);
  }
}

module.exports.BookmarkManager = BookmarkManager;
