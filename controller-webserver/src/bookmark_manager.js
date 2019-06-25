const tinycolor = require("tinycolor2");

const NO_BOOKMARK_RGB = [0, 0, 0];

/**
 * Mints opaque, JSON-serializable bookmark descriptors and provides API for
 * all meta-data related operations like setting explicit bookmark hue-sat
 * colors and retrieving the current derived RGB color given the reported status
 * in the `VisibilityTracker`.
 */
class BookmarkManager {
  constructor({ visibilityTracker, brainBoss, colorHelper, log }) {
    this.visTracker = visibilityTracker;
    this.brainBoss = brainBoss;
    this.colorHelper = colorHelper;
    this.log = log;
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
      this.log('asked to mint window bookmark with nothing focused');
      return null;
    }

    const focusSlotId = this.visTracker.getFocusedFocusSlotId();
    let bookmark;
    if (focusSlotId) {
      bookmark = this._makeBookmark('window', null, focusSlotId);
      this.log(`minted window bookmark using focusSlotId: ${focusSlotId}`,
               bookmark);
    } else {
      bookmark = this._makeBookmark('window', windowContainerId, null);
      this.log(`minted window bookmark using windowContainerId: ${windowContainerId}`,
               bookmark);
    }
    return bookmark;
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
      this.log('asked to mint specific bookmark with nothing focused');
      return null;
    }

    const focusSlotId = this.visTracker.getFocusedFocusSlotId();
    let bookmark = this._makeBookmark('container', containerId, focusSlotId);
    this.log(`minted thing bookmark`, bookmark);
    return bookmark;
  }

  /**
   * Invoked by the bookmark mode when a bookmark is being set, potentially atop
   * an old bookmark.  We want to both propagate the pre-existing color as well
   * as sending appropriate styling directives to clients so that they can
   * update the colors of tabs, etc.  In the event there is an old bookmark, we
   * de-style it.  We then send styling info for the new bookmark.
   */
  replacingBookmarkMaybeMerge(newBookmark, oldBookmark) {
    if (oldBookmark) {
      // De-style the old bookmark
      if (oldBookmark.containerId) {
        const oldColor = this.colorHelper.computeTabColor(oldBookmark.color);
        // window-scoped bookmarks have null containerId's; see other callsite.
        if (oldColor !== null && oldBookmark.scope !== 'window') {
          this.brainBoss.styleContainerId(
            oldBookmark.containerId,
            oldBookmark.focusSlotId,
            {
              oldColor,
            });
        }
      }

      newBookmark.color = oldBookmark.color;
    }

    if (newBookmark.containerId) {
      const newColor = this.colorHelper.computeTabColor(newBookmark.color);
      if (newColor !== null && newBookmark.scope !== 'window') {
        this.brainBoss.styleContainerId(
          newBookmark.containerId,
          newBookmark.focusSlotId,
          {
            newColor,
          });
      }
    }

    return newBookmark;
  }

  _describeAppGivenPrefix(prefixWithDelim) {
    // The map is by bare prefix, so lose the delim.
    const brainConn =
        this.brainBoss.clientsByPrefix.get(prefixWithDelim.slice(0, -1));

    // It's possible there's no client currently present with the given prefix.
    if (!brainConn) {
      return null;
    }

    // ### appInstance: Distinguish between instances of the same app.
    let appInstance;
    // Find the last slash, but don't consider the last character.  Currently
    // for atom, we expect that the last character will never be a '/', but
    // it's conceivable that could change or might vary for other clients.
    const lastSlash = brainConn.clientUniqueId.lastIndexOf(
                        '/', brainConn.clientUniqueId.length - 1);
    if (lastSlash !== -1) {
      appInstance = brainConn.clientUniqueId.substring(lastSlash + 1);
    } else {
      appInstance = brainConn.clientUniqueId;
    }

    return {
      name: brainConn.clientName,
      shortInstance: appInstance
    };
  }

  /**
   * Map the bookmark to info useful for describing what's bookmarked on a
   * compact display.
   *
   * For window bookmarks, this means the app name (ex: "Firefox", "atom"), any
   * disambiguating factors extracted from the unique id (ex: the firefox
   * profile name after lookup, the most-specific path component of the
   * directory atom is running in), and any window placement info (future).
   *
   * For container bookmarks, this includes both the window info for brief
   * presentation (ex: "FF Tab:" as a prefix) plus a detailed name like the
   * page title.
   */
  describeBookmark(bookmark) {
    if (!bookmark) {
      return null;
    }

    const colors = this.colorHelper.computeBookmarkRGBHexColors(bookmark.color);
    if (bookmark.scope === 'window') {
      let windowContainerId;
      let appInfo;
      if (bookmark.focusSlotId) {
        windowContainerId =
          this.visTracker.focusSlotToWindowContainerId.get(bookmark.focusSlotId);
        const clientInfo =
          this.visTracker.resolveWindowContainerIdToClientInfo(windowContainerId);
        if (!clientInfo) {
          return null;
        }
        appInfo = this._describeAppGivenPrefix(clientInfo.prefixWithDelim);
      } else {
        windowContainerId = bookmark.containerId;
        const containerInfo =
          this.visTracker.containersByFullId.get(windowContainerId);
        if (!containerInfo) {
          return;
        }
        appInfo = {
          name: containerInfo.rawDetails.appName,
          shortInstance: containerInfo.title,
        };
      }
      return {
        scope: 'window',
        app: appInfo,
        container: null,
        colors
      };
    } else if (bookmark.scope === 'container') {
      const containerId = bookmark.containerId;
      const containerInfo = this.visTracker.containersByFullId.get(containerId);
      const clientInfo =
        this.visTracker.resolveContainerIdToClientInfo(containerId);

      // To usefully explain what the bookmark means, we need info on the
      // container.  We may need to wait until the client (re)connects and tells
      // us stuff.
      if (!clientInfo || !containerInfo) {
        return null;
      }

      return {
        scope: 'container',
        app: this._describeAppGivenPrefix(clientInfo.prefixWithDelim),
        container: {
          title: containerInfo.title
        },
        colors
      }
    } else {
      return null;
    }
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
      this.log(
        'findFocusedBookmarkInCollection: nothing focused?',
        {
          useWindow, focusedId, focusSlotId
        });
      return null;
    }

    const traverseArray = (arr, depth=0) => {
      for (const obj of arr) {
        if (!obj) {
          continue;
        }

        // Support nested arrays.
        if (Array.isArray(obj)) {
          const found = traverseArray(obj, depth + 1);
          if (found) {
            return found;
          }
        } else if (useWindow && obj.focusSlotId && obj.focusSlotId === focusSlotId) {
          return obj;
        } else if (!useWindow && obj.containerId === focusedId &&
                   (!obj.focusSlotId || obj.focusSlotId === focusSlotId)) {
          //console.log('findFocusedBookmarkInCollection: found:', obj);
          return obj;
        }
      }

      // not found.
      if (depth === 0) {
        this.log(
          'findFocusedBookmarkInCollection: no matching thing',
          {
            useWindow, focusedId, focusSlotId
          });
      }
      return null;
    }

    if (Array.isArray(coll)) {
      return traverseArray(coll);
    } else {
      throw new Error("Unsupported collection type!");
    }
  }

  setBookmarkColor(bookmark, color) {
    const oldColor =
      bookmark ? this.colorHelper.computeTabColor(bookmark.color) : null;
    const newColor = this.colorHelper.computeTabColor(color);
    bookmark.color = color;
    // Don't propagate this info if this is for a window bookmark for now.  The
    // window manager client doesn't currently have an ability to color a window
    // and we're sending a null containerId if we did try, which is not useful.
    // We'd need to map to a window container id first.
    if (bookmark.scope !== 'window') {
      this.brainBoss.styleContainerId(
        bookmark.containerId,
        bookmark.focusSlotId,
        {
          oldColor,
          newColor,
        });
    }
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
    // If it's a window-scoped bookmark and it's using the focus slot for
    // identification, use that helper.
    if (bookmark.scope === 'window' && bookmark.focusSlotId) {
      visResult = this.visTracker.checkFocusSlotVisibility(bookmark.focusSlotId);
    } else {
      // Otherwise the dominant factor is the containerId.
      visResult = this.visTracker.checkVisibility(
        bookmark.containerId, bookmark.focusSlotId);
    }

    return this.colorHelper.computeBookmarkDisplayColor(
      bookmark.color, visResult, brightnessScale);
  }
}

module.exports.BookmarkManager = BookmarkManager;
