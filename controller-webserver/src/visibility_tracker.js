/**
 * Processes and latches the thingsVisibilityInventory reports for each client,
 * applying window-manager visibility to non-WM clients.
 */
class VisibilityTracker {
  constructor() {
    /**
     * Keys are fully-prefixed container ids, values are the contents of the
     * most recent thingExists report for the thing.  The report is stored for
     * debugging purposes; if we were using it to automatically restore
     * bookmarks, we could do that just on rising edge without persisting.
     */
    this.containersByFullId = new Map();

    /**
     * Keys are full-prefix slot id, values are the current containerId of what
     * is displayed there.
     */
    this.focusSlotContentsById = new Map();

    /**
     * This is the set of container id's that are currently visible.  This gets
     * recomputed from the values() of focusSlotContentsById each time that gets
     * updated.
     */
    this.visibleContainerIds = new Set();

    this.focusedContainerId = null;
  }

  /**
   * The client that owns the prefix has gone away and so we need to evict all
   * data corresponding to the thing.
   */
  evictMootPrefix(mootPrefix) {
    for (const prefixedContainerId of this.containersByFullId.keys()) {
      if (prefixedContainerId.startsWith(mootPrefix)) {
        this.containersByFullId.delete(prefixedContainerId);
      }
    }

    for (const prefixedSlotId of this.focusSlotContentsById.keys()) {
      if (prefixedSlotId.startsWith(mootPrefix)) {
        this.focusSlotContentsById.delete(prefixedSlotId);
      }
    }
    // re-derive visible container id's.
    this.visibleContainerIds = new Set(this.focusSlotContentsById.values());

    if (this.focusedContainerId.startsWith(mootPrefix)) {
      this.focusedContainerId = null;
    }
  }

  processFocusSlotsInventory(prefix, focusSlots) {
    // Purge the old focus slots; the delta is more work than is needed.
    for (const prefixedSlotId of this.focusSlotContentsById.keys()) {
      if (prefixedSlotId.startsWith(mootPrefix)) {
        this.focusSlotContentsById.delete(prefixedSlotId);
      }
    }

    // Create the (empty) slots.
    for (const info of focusSlots) {
      const fullSlotId = prefix + info.focusSlotId;
      this.focusSlotContentsById.set(fullSlotId, null);
    }

    // re-derive visible container id's even though this will cause the
    // client to report nothing as visible until we get the next
    // thingsVisibilityInventory for the client.
    this.visibleContainerIds = new Set(this.focusSlotContentsById.values());
  }

  processThingsExist(prefix, items) {
    for (const item of items) {
      const prefixedContainerId = prefix + item.containerId;
      this.containersByFullId.set(prefixedContainerId, item);
    }
  }

  processThingsVisibilityInventory(prefix, inventory) {
    for (const item of inventory) {
      // The containerId could be null.
      const prefixedContainerId =
        inventory.containerId ? (prefix + inventory.containerId) : null;
      const fullSlotId = prefix + inventory.focusSlotId;
      this.focusSlotContentsById.set(fullSlotId, prefixedContainerId);

      // state is one of focused/visible/empty, with focused also counting as
      // visible, which is why we put everything reported in the visible bucket.
      // (containerId would be null if state was 'empty'.)
      if (item.state === 'focused') {
        this.focusedContainerId = prefixedContainerId;
      }
    }

    // re-derive visible container id's.
    this.visibleContainerIds = new Set(this.focusSlotContentsById.values());
  }

  processThingsGone(prefix, items) {
    const mootedFullIds = new Set();

    for (const item of items) {
      const prefixedContainerId = prefix + item.containerId;
      this.containersByFullId.delete(prefixedContainerId);
      mootedFullIds.add(prefixedContainerId);
      if (this.focusedContainerId === prefixedContainerId) {
        this.focusedContainerId = null;
      }
    }

    let changedAny = false;
    for (const [key, value] of this.focusSlotContentsById.items()) {
      if (mootedFullIds.has(value)) {
        this.focusSlotContentsById.delete(key);
        changedAny = true;
      }
    }

    if (changedAny) {
      // re-derive visible container id's.
      this.visibleContainerIds = new Set(this.focusSlotContentsById.values());
    }
  }

  /**
   * Returns a string based on the current state of the full container id:
   * - focused: It exists, it's focused.
   * - visible: It exists, it's visible.
   * - hidden: It exists, it's not visible.
   * - missing: We don't think the thing exists anymore.
   */
  checkVisibility(fullContainerId) {
    if (this.focusedContainerId === fullContainerId) {
      return 'focused';
    }

    if (this.visibleContainerIds.has(fullContainerId)) {
      return 'visible';
    }

    if (this.containersByFullId.has(fullContainerId)) {
      return 'hidden';
    }

    return 'missing';
  }

  /**
   * Returns true if the thing currently exists, false if not.
   */
  checkExistence(fullContainerId) {
    return this.containersByFullId.has(fullContainerId);
  }

  /**
   * Returns the container id of whatever's currently focused, or null if
   * nothing is focused.
   *
   * This is intended to be used directly by the BookmarkManager.  If you're
   * not the BookmarkManager, first consider using its
   * `mintBookmarkForFocusedThing` and `findFocusedBookmarkInCollection`
   * helpers.
   */
  getFocusedContainerId() {
    return this.focusedContainerId;
  }
}

module.exports.VisibilityTracker = VisibilityTracker;