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

  /**
   * Create a new bookmark that describes the currently focused container, if
   * one exists.  Null is returned if nothing was focused or if something else
   * went wrong.
   *
   * In the future, additional hooky things will be given the option to attempt
   * to suggest
   */
  mintBookmarkForFocusedThing() {
    const containerId = this.visTracker.getFocusedContainerId();
    // It's possible nothing is focused.
    if (!containerId) {
      console.warn('asked to mint bookmark with nothing focused');
      return null;
    }

    return {
      containerId,
      hue: 360 * Math.random(),
      sat: 1.0,
    };
  }

  /**
   * Given a collection, find the first Bookmark that corresponds to whatever
   * is the currently focused thing.  You would use this for things like
   * changing the color of the bookmark corresponding to whatever's currently
   * focused without requiring modes to track this themselves or introduce
   * additional superflouous picker states.
   */
  findFocusedBookmarkInCollection(coll) {
    const focusedId = this.visTracker.getFocusedContainerId();
    // It's possible nothing is focused.
    if (!focusedId) {
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
        } else if (obj.containerId === focusedId) {
          return obj;
        }
      }

      // not found.
      return null;
    }

    if (Array.isArray(coll)) {
      return traverseArray(coll);
    } else {
      throw new Error("Unsupported collection type!");
    }
  }

  setBookmarkHueSet(bookmark, hue, sat) {
    bookmark.hue = hue;
    bookmark.set = sat;
  }

  focusBookmark(bookmark) {
    if (!bookmark) {
      return;
    }

    this.brainBoss.focusContainerId(bookmark.containerId);
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

    const visResult = this.visTracker.checkVisibility(bookmark.containerId);

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