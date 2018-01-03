/**
 * Mints opaque, JSON-serializable bookmark descriptors and provides API for
 * all meta-data related operations like setting explicit bookmark hue-sat
 * colors and retrieving the current derived RGB color given the reported status
 * in the `VisibilityTracker`.
 */
class BookmarkManager {
  constructor({ visibilityTracker }) {
    this.visTracker = visibilityTracker;
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
    const containerId = visTracker.getFocusedContainerId();
    // It's possible nothing is focused.
    if (!containerId) {
      return null;()
    }

    return {

    }
  }

  computeRGBColorForBookmark(bookmark) {

  }
}