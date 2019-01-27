"use strict";

/**
 *
 */
class FilteredSubscription {
  constructor({ visTracker, callerArgs: { filterPred, compare, onUpdate } }) {
    this.visTracker = visTracker;
    this.filterPred = filterPred;
    this.compare = compare;
    this.onUpdate = onUpdate;

    this.items = [];
  }

  /**
   * Completely rebuild the set of items and invoke the onUpdate method.  It's
   * assumed and required that this will be called when the filter's behavior
   * changes.
   */
  reset() {
    const items = this.items = [];

    for (const item of this.visTracker.containersByFullId.values()) {
      if (this.filterPred(item)) {
        items.push(item);
      }
    }

    this.onUpdate(items);
  }

  /**
   * Invokes by the VisibilityTracker when a new/updated item is heard about.
   * If the item matches the filter predicate onUpdate will be called even if
   *
   */
  considerItem(item) {
    if (!this.filterPred(item)) {
      return;
    }

    if (this.items.indexOf(item) !== -1) {
      this.items.push(item);
    }
    this.items.sort(this.compare);

    this.onUpdate(this.items);
  }

  destroy() {
    const idx = this.visTracker.filteredSubscriptions.indexOf(this);
    this.visTracker.filteredSubscriptions.splice(idx, 1);
  }
}

module.exports.FilteredSubscription = FilteredSubscription;
