/**
 *
 */
export class FilteredSubscription {
  visTracker: any;
  filterPred: any;
  compare: any;
  onUpdate: any;
  itemsById: Map<any, any>;
  items: any[];
  
  constructor({ visTracker, callerArgs: { filterPred, compare, onUpdate } }) {
    this.visTracker = visTracker;
    this.filterPred = filterPred;
    this.compare = compare;
    this.onUpdate = onUpdate;

    /**
     * Map whose keys are full container id's and values are the most recently
     * seen state of the thing in question.
     */
    this.itemsById = new Map();
    this.items = [];
  }

  _rebuildItemsAndUpdate() {
    this.items = Array.from(this.itemsById.values());
    this.items.sort(this.compare);
    this.onUpdate(this.items);
  }

  /**
   * Completely rebuild the set of items and invoke the onUpdate method.  It's
   * assumed and required that this will be called when the filter's behavior
   * changes.
   */
  reset() {
    this.itemsById.clear();

    for (const item of this.visTracker.containersByFullId.values()) {
      if (this.filterPred(item)) {
        this.itemsById.set(item.fullContainerId, item);
      }
    }
    this._rebuildItemsAndUpdate();
  }

  /**
   * Invokes by the VisibilityTracker when a new/updated item is heard about.
   * If the item matches the filter predicate onUpdate will be called even if
   * the item is already in items.
   */
  considerItem(item) {
    const present = this.itemsById.has(item.fullContainerId);
    const shouldBe = this.filterPred(item);

    if (shouldBe) {
      this.itemsById.set(item.fullContainerId, item);
      this._rebuildItemsAndUpdate();
    } else if (present) {
      this.itemsById.delete(item.fullContainerId);
      this._rebuildItemsAndUpdate();
    } else {
      // Nothing to do if not previously present and shouldn't be now.
      return;
    }
  }

  destroy() {
    const idx = this.visTracker.filteredSubscriptions.indexOf(this);
    this.visTracker.filteredSubscriptions.splice(idx, 1);
  }
}
