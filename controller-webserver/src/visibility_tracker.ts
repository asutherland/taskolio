import { FilteredSubscription } from './filtered_subscription.js';

interface LeftTopRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface XYRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Hacky helper to find the key that maps to a given value in a Map.  For use
 * in the VisibilityTracker where data structures are undergoing evolutionary
 * changes that are still in progress.
 *
 * Update: Unused again.  Reverse lookup is a footgun when you can have multiple
 * values but only one of the keys is the right answer.
 */
function reverseMapLookup(map, findValue) {
  for (const [key, value] of map.entries()) {
    if (value === findValue) {
      return key;
    }
  }

  return null;
}

/**
 * Quantize numeric values for pixel coordinates that may have been rounded due
 * to DPI scaling.
 */
function quantizePixels(x) {
  // round then quantize to even numbers.  The quantizing was introduced for my
  // 4k thinkpad screen with 2x scaling.  The rounding was introduced for my
  // desktop where the scaling is set to 1.25 and Firefox says 33.75 when it
  // should say 34.
  x = Math.round(x);
  return x - x%2;
}

function quantizeBounds(bounds : LeftTopRect) : LeftTopRect {
  return {
    left: quantizePixels(bounds.left),
    top: quantizePixels(bounds.top),
    width: quantizePixels(bounds.width),
    height: quantizePixels(bounds.height)
  };
}

function quantizeFrameRect(bounds : XYRect) : XYRect {
  return {
    x: quantizePixels(bounds.x),
    y: quantizePixels(bounds.y),
    width: quantizePixels(bounds.width),
    height: quantizePixels(bounds.height)
  };
}

/**
 * Hackily un-transforms CSS pixels transforms that Firefox applies to its
 * window.screenX/screenLeft and screenY/screenTop.  See call-site for more
 * context.
 *
 * Note that this depends on one of the following being true:
 * - devicePixelRatio is 1.  This is likely the case for standard 1920x1280
 *   monitors where the user has reasonably good eyesight.  This works for
 *   any number of monitors.
 * - The user only has one monitor.
 * - The user has two monitors and the second monitor is coordinate-space to the
 *   right of the first monitor.
 *
 * For this to be smart, we would otherwise need to know all of the monitors.
 * Then we'd resolve to the correct monitor and apply the correct transform.
 */
function fixupCSSBounds(bounds: LeftTopRect, devicePixelRatio: number, monWidth: number, monHeight: number) {
  // No transforms needed if there's no scaling ratio.
  if (devicePixelRatio === 1) {
    return bounds;
  }

  const monXCoord = Math.floor(bounds.left / monWidth);
  const monYCoord = Math.floor(bounds.top / monHeight);

  const monitorLeft = monXCoord * monWidth;
  const monitorTop = monYCoord * monHeight;

  const monX = (bounds.left - monitorLeft);
  const monY = (bounds.top - monitorTop);
  return {
    left: monitorLeft + monX * devicePixelRatio,
    top: monitorTop + monY * devicePixelRatio,
    width: bounds.width,
    height: bounds.height
  };
}

/**
 * MRU-List helper.  Ensures that recentThing is at the head of the list and
 * exists at most once in the list.  Reversing the ordering to have the new
 * thing at the tail would be more efficient for a naive Array implementation,
 * but we do not care.  This is more useful for console.log() purposes.
 */
function mruBump(array: any[], recentThing: any) {
  const existingIdx = array.findIndex(x => (x === recentThing));
  if (existingIdx != -1) {
    array.splice(existingIdx, -1);
  }
  array.unshift(recentThing);
}

function removeFromMapUsingPrefix(map: Map<string, any>, prefix: string) {
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) {
      map.delete(key);
    }
  }
}

function removeFromArrayUsingPrefix(array: string[], prefix: string) {
  for (let i = array.length - 1; i >= 0; i--) {
    if (array[i].startsWith(prefix)) {
      array.splice(i, 1);
    }
  }
}

function extractPrefixWithDelim(prefixed: string) {
  const idxColon = prefixed.indexOf(':');
  return prefixed.substring(0, idxColon + 1);
}

/**
 * Processes and latches the thingsVisibilityInventory reports for each client,
 * applying window-manager visibility to non-WM clients.
 */
export class VisibilityTracker {
  brainBoss: any;
  log: any;
  containersByFullId: Map<any, any>;
  focusSlotContentsById: Map<any, any>;
  visibleContainerIds: Set<unknown>;
  mruFocusSlotIds: any[];
  alreadyReportedFailedFocusSlotWindowLookups: Set<unknown>;
  wmPopulated: boolean;
  windowContainerIdLookup: Map<any, any>;
  focusSlotToWindowContainerId: Map<any, any>;
  windowContainerIdToActiveFocusSlot: Map<any, any>;
  focusedWindowContainerId: any;
  focusedContainerId: any;
  filteredSubscriptions: any[];

  constructor({ brainBoss, log }) {
    this.brainBoss = brainBoss;
    this.log = log;

    // ### Homogeneous State tracking
    // Everything in this section doesn't care about window manager clients
    // versus other clients.

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


    // ### Window-manager aware state tracking.

    /**
     * Array of focus slot id's ordered from most recently focused to least
     * recently focused.  Used when trying to figure out where to focus a
     * containerId.
     */
    this.mruFocusSlotIds = [];

    /**
     * Debug helper thing so we can log the first time we hear about a focus
     * slot and fail to map it to a window.
     *
     * TODO: This should get purged on client disconnect, but it's also not a
     * huge deal.  (We do purge on WM disconnect, at least.)
     */
    this.alreadyReportedFailedFocusSlotWindowLookups = new Set();
    /**
     * True if the WM is connected and has already told us about all the
     * windows.
     */
    this.wmPopulated = false;

    /**
     * Keys are prefixed string identifiers generated from information told to
     * us by the window-manager client about windows.  This will usually rely
     * on the window manager's ability to map the window back to the application
     * and PIDs associated with the window, and then perhaps using various
     * heuristic-based digging.  The values are the containerId uniquely
     * identified by that serialization.
     *
     * This is then used by processFocusSlotsInventory to transform parent
     * descriptors into matching serialized strings and checking for those
     * strings in this map.
     */
    this.windowContainerIdLookup = new Map();

    /**
     * Keys are focus slot id's, values are the window-manager client id's of
     * the window that contains each focus slot.  We do expect multiple keys to
     * map to the same value when they are focus slots contained by the same
     * window, such as multi-pane text editors.
     *
     * There is currently no directly-corresponding reverse mapping to this map.
     * windowContainerIdToActiveFocusSlot only tracks the most recently focused
     * slot in each window, with the value constantly being overwritten.
     */
    this.focusSlotToWindowContainerId = new Map();

    /**
     * Keys are window manager container id's, values are the focus slot id of
     * the most recently focused focus slot in that window.
     */
    this.windowContainerIdToActiveFocusSlot = new Map();

    /**
     * The window manager client's focused container.
     */
    this.focusedWindowContainerId = null;

    /**
     * The most specific focused container that we're aware of.
     */
    this.focusedContainerId = null;

    /**
     * A list of FilteredSubscription instances.
     */
    this.filteredSubscriptions = [];
  }

  renderDebugDump() {
    return `focusedWindowContainerId: ${this.focusedWindowContainerId}
focusedContainerId: ${this.focusedContainerId}
focusedFocusSlotId: ${this.getFocusedFocusSlotId()}
`;
  }

  /**
   * Process a window's new or revised details.  Some details may only be
   * temporarily available in situations where we tunnel meta-information
   * through a window's title, and so we accumulate and persist this information
   * for the lifetime of the window.
   *
   * ## Issues to be aware of
   *
   * ### appPid limitations
   *
   * The appPids come from the `_NET_WM_PID(CARDINAL)` window manager hint that
   * can be set on windows.  In the case of the electron shell used by vscode,
   * this process id is of the single root process for the session and is not
   * the same as the process.pid our extension gets to see and is what we want
   * for rendezvous purposes.[1]
   *
   * Our solution to deal with this for vscode is to have it temporarily tunnel
   * its PID through its title.  Once we have seen the PID, we can tell the
   * client and allow it to remove the titles.
   *
   * 1: Window-manager related stuff appears to happen in electron's
   * NativeWindowViews::NativeWindowViews constructor:
   * https://github.com/electron/electron/blob/67f052a6e15c2d3cb1f581d2f6aa31eb05e2de98/atom/browser/native_window_views.cc#L137
   */
  _trackWindow(containerId, details) {
    // Helper for readability and to potentially provide for a reverse mapping
    // for cleanup purposes, or just a set of forward mappings that get unioned
    // on removal to rebuild from scratch.
    const track = (key) => {
      let matchingSet = this.windowContainerIdLookup.get(key);
      if (!matchingSet) {
        matchingSet = new Set();
        this.windowContainerIdLookup.set(key, matchingSet);
      }

      matchingSet.add(containerId);
      /*
      console.log('tracker: mapped', key, 'to window', containerId, 'which has',
                  matchingSet.size, 'known windows');
      */
    };

    if (details.appPids) {
      for (const pid of details.appPids) {
        track(`pid:${pid}`);
      }
    }

    if (details.title) {
      let titleMatch = / PID=(\d+)$/.exec(details.title);
      if (titleMatch) {
        track(`pid:${titleMatch[1]}`);
      }
    }

    // UpperLeft rendezvous, the lookup also verifies the title.
    if (details.frameRect) {
      const frameRect = quantizeFrameRect(details.frameRect);
      track(`upperLeft:${frameRect.x},${frameRect.y}`);
    }
  }

  _lookupWindowContainerId(parentDescriptors, traceLines) {
    if (!parentDescriptors) {
      return null;
    }

    // For now we'll go with logic that the "last" descriptor wins.  If we get
    // fancier we can go with a CSS style longest/most-specific wins.

    let match = null;
    // A match-check where there has to be only one window registered to match.
    // Necessary for cases like PID mapping where gnome-shell can't do it on
    // its own.
    const check = (key) => {
      const hitSet = this.windowContainerIdLookup.get(key);
      if (hitSet) {
        traceLines.push(`lookup resolved ${key} to hit set of ${hitSet.size}`);
        if (hitSet.size === 1) {
          match = hitSet.values().next().value;
          traceLines.push(`  using match: ${match}`);
        } else {
          traceLines.push(`  ignoring match because there was more than 1`);
        }
      }
    }

    // A match check that does initial lookup expecting multiple matches.  The
    // set is then examined for secondary equivalency checks against the known
    // meta-info for the window.
    const checkMulti = (lookupKey, checkKey, checkValue) => {
      //console.log("checking", lookupKey);
      traceLines.push(`tracker: looking up key: ${lookupKey}`);
      const hitSet = this.windowContainerIdLookup.get(lookupKey);
      if (hitSet) {
        traceLines.push(`tracker: multi-lookup resolved ${lookupKey} to hit set of ${hitSet.size}`);

        for (const containerId of hitSet) {
          // Look-up the most recent thingExists report for this window.
          const winMeta = this.containersByFullId.get(containerId);
          if (!winMeta) {
            // TODO: we absolutely need the container id purging logic now.
            traceLines.push(`no winMeta for containerId ${containerId}`);
            continue;
          }
          if (checkKey in winMeta && winMeta[checkKey] === checkValue) {
            match = containerId;
            traceLines.push(`  containerId ${containerId} matched on ${checkKey} = ${checkValue}`);
          } else {
            traceLines.push(`  failed containerId match ${containerId} on ${checkKey} had: ${winMeta[checkKey]} wanted: ${checkValue}`);
          }
        }
      }
    };

    for (const descriptor of parentDescriptors) {
      // the caller lists the descriptors they're calling us with, no need to
      // log them.
      if (descriptor.pid) {
        check(`pid:${descriptor.pid}`);
      }
      // See the webextension logic for an explanation of what cssBounds are.
      // We need to make the bounds screen-relative, then multiply by
      // devicePixelRatio, then add back the screen offsets in order to get into
      // screen coordinates.  I think gnome-shell in X mode at least doesn't do
      // any additional scaling, so things work out?
      if (descriptor.cssBounds && descriptor.title) {
        // XXX TODO Actually get the screen dimensions from the window manager
        // via its `focusSlotsInventory`.  As much as I would love to write
        // that code and the debouncing logic, it's currently the case that all
        // of my linux displays where scaling is involved have a width of 3840.
        // I'm going to predicate this hard-coding on a pixel ratio > 1.

        const fixedUpBounds =
          fixupCSSBounds(descriptor.cssBounds, descriptor.devicePixelRatio,
                         3840, 2160);
        const bounds = quantizeBounds(fixedUpBounds);
        checkMulti(`upperLeft:${bounds.left},${bounds.top}`,
                   'title', descriptor.title);
      }
      if (descriptor.bounds && descriptor.title) {
        const bounds = quantizeBounds(descriptor.bounds);
        checkMulti(`upperLeft:${bounds.left},${bounds.top}`,
                   'title', descriptor.title);
      }
    }

    return match;
  }

  /**
   * The client that owns the prefix has gone away and so we need to evict all
   * data corresponding to the thing.
   */
  evictMootPrefix(mootPrefix, isWM) {
    removeFromMapUsingPrefix(this.containersByFullId, mootPrefix);

    removeFromMapUsingPrefix(this.focusSlotContentsById, mootPrefix);
    // re-derive visible container id's.
    this.visibleContainerIds = new Set(this.focusSlotContentsById.values());

    removeFromArrayUsingPrefix(this.mruFocusSlotIds, mootPrefix);

    if (isWM) {
      this.windowContainerIdLookup.clear();
      this.focusSlotToWindowContainerId.clear();
      this.windowContainerIdToActiveFocusSlot.clear();
      this.focusedWindowContainerId = null;
      this.wmPopulated = false;
      this.alreadyReportedFailedFocusSlotWindowLookups.clear();
    } else {
      removeFromMapUsingPrefix(this.focusSlotToWindowContainerId, mootPrefix);
    }

    if (this.focusedContainerId &&
        this.focusedContainerId.startsWith(mootPrefix)) {
      this.focusedContainerId = null;
    }
  }

  processFocusSlotsInventory(prefix, focusSlots, isWM, brainConn) {
    // Track the slots that existed before this inventory so we can remove them
    // at the end if they didn't get handled.  We used to just purge them all,
    // but it results in state churn that causes the LEDs to needlessly flash.
    // (I originally tried to be lazy here, but it's not that hard and the
    // workarounds have their own complexity.)
    const unhandledPreSlots = new Set();
    for (const prefixedSlotId of this.focusSlotContentsById.keys()) {
      if (prefixedSlotId.startsWith(prefix)) {
        unhandledPreSlots.add(prefixedSlotId);
      }
    }

    const debugInfo = brainConn.debugSlotsInventory = [];

    // Create the (empty) slots.
    let windowMappedCount = 0;
    for (const info of focusSlots) {
      //console.log('processing focus slot:', info);
      const fullSlotId = prefix + info.focusSlotId;
      const lookupTraceLines = [];
      let windowContainerId = !isWM ?
        this._lookupWindowContainerId(info.parentDescriptors, lookupTraceLines) : null;
      //console.log('  setting slot', fullSlotId, 'win', windowContainerId);

      const prevWinId = this.focusSlotToWindowContainerId.get(fullSlotId);

      if (windowContainerId) {
        windowMappedCount++;
      } else if (prevWinId) {
        // This is almost certainly the result of a race between the window
        // manager reporting a title change and the client that lives inside the
        // window reporting the change.
        //
        // We know that this mapping doesn't actually change and that there will
        // be situations like this, so we just reuse the existing mapping in
        // this case.
        windowContainerId = prevWinId;
        windowMappedCount++;
        if (0) {
          this.log(`failed to map already valid ${fullSlotId}???`,
                   {
                     parentDescriptors: info.parentDescriptors,
                     lookupTraceLines
                   });
          }
      } else if (this.wmPopulated &&
            !this.alreadyReportedFailedFocusSlotWindowLookups.has(fullSlotId)) {
        this.log(`failed to map newly seen slot ${fullSlotId}`,
                 {
                   parentDescriptors: info.parentDescriptors,
                   lookupTraceLines
                 });
        this.alreadyReportedFailedFocusSlotWindowLookups.add(fullSlotId);
      }

      // Mappings that must be established here because nowhere else will:
      if (!prevWinId && windowContainerId) {
        this.log(`successfully mapped ${fullSlotId} to window ${windowContainerId}`,
                 {
                   parentDescriptors: info.parentDescriptors,
                   lookupTraceLines
                 });
        this.brainBoss.notifyModes('onFocusSlotMapped');
      }
      this.focusSlotToWindowContainerId.set(fullSlotId, windowContainerId);

      // Mappings that are established here for invariant purposes, mainly,
      // beause processThingsVisibilityInventory will do the same thing but
      // without being gibberish.
      // (Actually, this one might matter if the client has an empty focus slot
      // and doesn't bother reporting the slot.)
      if (!this.focusSlotContentsById.has(fullSlotId)) {
        this.focusSlotContentsById.set(fullSlotId, null);
      }
      unhandledPreSlots.delete(fullSlotId);
      this.windowContainerIdToActiveFocusSlot.set(
        windowContainerId, fullSlotId);

      debugInfo.push([
        info.focusSlotId,
        windowContainerId,
      ]);
    }

    for (const mootSlotId of unhandledPreSlots) {
      this.focusSlotContentsById.delete(mootSlotId);
    }

    // re-derive visible container id's even though this will cause the
    // client to report nothing as visible until we get the next
    // thingsVisibilityInventory for the client.
    this.visibleContainerIds = new Set(this.focusSlotContentsById.values());

    // XXX HACK let the brainconn know that we mapped all the slots to windows
    // when we return true, allowing the connection to tell the client that it
    // can stop doing any hacky title meta-info tunneling.
    return (focusSlots.length === windowMappedCount);
  }

  processThingsExist(prefix, items, isWM) {
    for (const item of items) {
      const prefixedContainerId = prefix + item.containerId;
      item.fullContainerId = prefixedContainerId;
      const prefixedFocusSlotId = prefix + item.focusSlotId;
      item.fullFocusSlotId = prefixedFocusSlotId;

      // temporary debug specialization as I deal with pinned tabs.
      if (item.pinned) {
        //console.log('>>> exists:', item.containerId, item);
      }
      this.containersByFullId.set(prefixedContainerId, item);
      if (isWM) {
        this._trackWindow(prefixedContainerId, item.rawDetails);
      }

      for (const filteredSub of this.filteredSubscriptions) {
        filteredSub.considerItem(item);
      }
    }

    if (isWM) {
      this.wmPopulated = true;
    }
  }

  processThingsVisibilityInventory(prefix, inventory, isWM, brainConn) {
    const debugInfo = brainConn.debugVisibilityInventory = [];

    //console.log('visibility inventory:', inventory);
    for (const item of inventory) {
      if (!item) {
        continue;
      }

      // The containerId could be null.
      const prefixedContainerId =
        item.containerId ? (prefix + item.containerId) : null;
      const fullSlotId = prefix + item.focusSlotId;
      this.focusSlotContentsById.set(fullSlotId, prefixedContainerId);

      const normDisplay = (v) => {
        if (v === undefined) {
          return 'undefined';
        } else if (v === null) {
          return 'null';
        }

        return v;
      };
      debugInfo.push([
        normDisplay(item.state),
        normDisplay(item.focusSlotId),
        normDisplay(item.containerId),
        this.focusSlotToWindowContainerId.get(fullSlotId) || `<unmapped:${fullSlotId}>`
      ]);

      // state is one of focused/visible/empty, with focused also counting as
      // visible, which is why we put everything reported in the visible bucket.
      // (containerId would be null if state was 'empty'.)
      if (item.state === 'focused') {
        mruBump(this.mruFocusSlotIds, fullSlotId);

        if (isWM) {
          // As the WM, it's always our focused container that matters.
          this.focusedWindowContainerId = prefixedContainerId;
          // given the window, find the most recently active focus slot inside.
          const mruSlot = this.windowContainerIdToActiveFocusSlot.get(
            this.focusedWindowContainerId);

          if (!mruSlot) {
            // Okay, there was no focused slot inside, which means that we don't
            // have a more specific client for this window.  So just report the
            // window as the focused thing.
            this.focusedContainerId = prefixedContainerId;
            /*
            console.log('could not find active slot for window',
                        this.focusedWindowContainerId, 'sticking with window.');
            */
          } else {
            // There was a client, so now see what containerId is displayed in
            // that slot and report it as the focused thing.
            this.focusedContainerId = this.focusSlotContentsById.get(mruSlot);
            /*
            console.log('found active focus slot, focused window is',
                        this.focusedWindowContainerId, 'focused child:',
                        this.focusedContainerId);
            */
          }
        } else {
          const winContainerId =
            this.focusSlotToWindowContainerId.get(fullSlotId);

          // Keep our window-level concept of which slot inside the window is
          // focused up-to-date.  This is necessary for the WM branch of the
          // focused case to get things right.
          if (winContainerId) {
            //console.log('updating window focused slot id', fullSlotId);
            this.windowContainerIdToActiveFocusSlot.set(
              winContainerId, fullSlotId);
          }

          // If we're the focused window, update the focused container too.
          if (winContainerId === this.focusedWindowContainerId) {
            // Hooray!  That's us!  Update the focused container id.
            this.focusedContainerId = prefixedContainerId;
          }
        }
        /*
        console.log('set focused:', this.focusedContainerId, 'slot',
                    this.getFocusedFocusSlotId());
        */
      }
    }

    // re-derive visible container id's.
    this.visibleContainerIds = new Set(this.focusSlotContentsById.values());
  }

  processThingsGone(prefix, items, isWM) {
    const mootedFullIds = new Set();

    for (const item of items) {
      const prefixedContainerId = prefix + item.containerId;
      //console.log('gone:', item.containerId);
      this.containersByFullId.delete(prefixedContainerId);
      mootedFullIds.add(prefixedContainerId);
      if (this.focusedContainerId === prefixedContainerId) {
        this.focusedContainerId = null;
      }
    }

    let changedAny = false;
    for (const [key, value] of this.focusSlotContentsById.entries()) {
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
   * Variant of `checkVisibility` for window-scoped bookmarks that resolved to
   * a client's focus slot.  We want to know if the focus slot exists and
   * whether it's visible.
   */
  checkFocusSlotVisibility(fullFocusSlotId) {
    // If the focus slot is focused, then it's focused!
    if (this.getFocusedFocusSlotId() === fullFocusSlotId) {
      return 'focused';
    }

    // It's visible if the window container that holds the focus slot is
    // visible.
    const windowContainerId =
      this.focusSlotToWindowContainerId.get(fullFocusSlotId);
    if (this.visibleContainerIds.has(windowContainerId)) {
      return 'visible';
    }

    // It exists but is hidden if we know about the focus slot at all.  And
    // we know about it if the above lookup was not undefined.
    if (windowContainerId) {
      return 'hidden';
    }

    // And so it's missing if we don't know about the focus slot id.
    return 'missing';
  }

  /**
   * Returns a string based on the current state of the full container id and
   * the passed-in focus slot.  The focus slot matters because, for the time
   * being, all bookmarks are (by default[1]) tied to their focus slots, so we
   * don't want confusing states to arise for different editor panes/etc.
   * - focused: It exists, it's focused.
   * - visible: It exists, it's visible.
   * - hidden: It exists, it's not visible.
   * - missing: We don't think the thing exists anymore.
   */
  checkVisibility(fullContainerId, fullFocusSlotId) {
    // For window bookmarks, compare against the focused window id.  We don't
    // need to check to see if the container id is a window client id or not
    // because it's implicit that it is if it matches.
    //
    // Note that we don't need to check the slot id for this for a focus check.
    // XXX but we're probably failing on the visibility check everywhere for
    // windows?  I'm not sure we care that much...
    if (this.focusedWindowContainerId === fullContainerId) {
      return 'focused';
    }

    if (this.focusedContainerId === fullContainerId &&
        this.getFocusedFocusSlotId() === fullFocusSlotId) {
      return 'focused';
    }

    if (this.focusSlotContentsById.get(fullFocusSlotId) === fullContainerId) {
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
   * Returns the container id of whatever's currently focused at the most
   * detailed client level, or null if nothing is focused.  That is, if there's
   * a focused window and that window has a client that reports further detail
   * to us, we'll report what's focused inside that window.  If there is no
   * client, then we just report the window.  If you only want to know about
   * the window, use getFocusedWindowContainerId() instead.
   *
   * This is intended to be used directly by the BookmarkManager.  If you're
   * not the BookmarkManager, first consider using its
   * `mintBookmarkForFocusedThing` and `findFocusedBookmarkInCollection`
   * helpers.
   */
  getFocusedContainerId() {
    return this.focusedContainerId;
  }

  /**
   * Returns the focus slot corresponding to whatever is returned by
   * getFocusedContainerId().  This allows bookmarks to persist which pane of an
   * editor a document was found in rather than always using some kind of weird
   * heuristics that are likely to drive people insane.
   */
  getFocusedFocusSlotId() {
    if (!this.focusedContainerId) {
      return null;
    }

    return this.windowContainerIdToActiveFocusSlot.get(
      this.focusedWindowContainerId) || null;
  }

  /**
   * Like getFocusedContainerId, but only considering the window manager client.
   * This is for bookmarking a window rather than its contents.
   *
   * @see getFocusedContainerId
   */
  getFocusedWindowContainerId() {
    return this.focusedWindowContainerId;
  }

  /**
   * Given a containerId, figure out:
   * - The focus slot in its client that it wants to be displayed in.  This may
   *   be explicitly specified because it was persisted in the bookmark, or
   *   because strong AI told us to, or because there's some buttons that say
   *   to.
   * - The window containerId that holds that focus slot.
   * - Whether that window containerId needs to be focused.
   *
   * These will be returned as { focusSlotId, windowContainerId,
   * windowFocused }.  In the case the containerId is itself a window
   * containerId, then windowContainerId will be null.
   *
   * ### original thinking that now led to the above, when this was a check()
   *
   * Check whether a container could be in the currently focused window.  If
   * it's not, return the container id of a window that it could live in that
   * should be focused.  This is a specialized helper for the BookmarkManager.
   *
   * This is also somewhat of a best-effort hack.  Much of the rationale behind
   * modeling everything as containerId and focusSlots is that we conceptually
   * break the strong ownership hierarchy of (window, panes in window, the
   * things you show in the panes).  Much of this is speculative and subject to
   * experimentation, but given how I already use my heterogeneous monitor
   * setup, the ability to have a browser tab that previously was on the
   * right-portrait display and now display it on the left-landscape display or
   * the center-portrait display instead of having the tabs tied to their
   * specific monitor is deemed desirable.  That's the crux of the name
   * taskolio...
   *
   * Anywho, the main point is that what our client really wants is to make sure
   * that when the user hits a bookmark button that the thing they bookmarked
   * shows up on a monitor and gets focused.  The details of that are still to
   * be worked out.  We'll probably want to refactor this so we can issue 2
   * focus messages:
   * - to the window manager: hey, you, focus this window
   * - to the web browser client for example: hey, you, focus this tab, oh, and
   *   hey, I decided that you're going to do it in focus slot "blah" that you
   *   told me about before.
   * Which mainly entails having this method also return the focus slot
   */
  figureOutHowToFocusThing(containerId, forceFocusSlotId) {
    let focusSlotId = forceFocusSlotId;
    if (!focusSlotId) {
      const prefix = extractPrefixWithDelim(containerId);
      focusSlotId = this.mruFocusSlotIds.find(x => x.startsWith(prefix));
    }

    const windowContainerId =
      this.focusSlotToWindowContainerId.get(focusSlotId) || null;
    const windowFocused = windowContainerId === this.focusedWindowContainerId;

    return {
      focusSlotId,
      windowContainerId,
      windowFocused
    };
  }

  focusWindow(containerId, focusSlotId) {
    // If we have a focus slot, map that to the window that owns it.
    if (focusSlotId) {
      const windowContainerId =
        this.focusSlotToWindowContainerId.get(focusSlotId);
      // No window means the bookmarked thing isn't present right now, so
      // there's nothing to do.
      if (!windowContainerId) {
        //console.log('unable to map focus slot back to a container id');
        return;
      }

      const windowFocused = windowContainerId === this.focusedWindowContainerId;

      /*
      console.log('mapped focus slot to', windowContainerId, 'focused?',
                  windowFocused);
      */
      if (!windowFocused) {
        this.brainBoss.focusContainerId(windowContainerId);
      }
      return;
    }

    // Fall back to the general focusWindow call.
    return this.focusThing(containerId, undefined);
  }

  /**
   * Given a containerId and optionally a focus slot to force it to be displayed
   * in, display it.  This builds on top of `figureOutHowToFocusThing`.  This
   * logic originally lived in BookmarkManager.focusBookmark but was extracted
   * out.
   */
  focusThing(containerId, forceFocusSlotId) {
    const { focusSlotId, windowContainerId, windowFocused } =
      this.figureOutHowToFocusThing(containerId, forceFocusSlotId);

    // (If bookmark.containerId is already a window containerId, then
    // windowContainerId will be null.)
    if (windowContainerId && !windowFocused) {
      this.log(`focusing window containerId ${windowContainerId}`);
      this.brainBoss.focusContainerId(windowContainerId);
    } else if (windowFocused) {
      this.log(`window was already focused: ${windowContainerId}`);
    } else {
      this.log(`unable to find window from focus slot: ${forceFocusSlotId}`);
    }
    this.log(`focusing containerId: ${containerId} focusSlotId: ${focusSlotId}`)
    this.brainBoss.focusContainerId(containerId, focusSlotId);
  }

  /**
   * Given a window-manager containerId, get some info about the client it
   * corresponds to.
   *
   * This is currently used by:
   * - TabsOnDisplayButtonsMode: Helps figure out the prefix for its filter.
   *   This method was originally created for its use, but given that 'window'
   *   bookmarks are now characterized by focus slots and the caller maps from
   *   that to the container id, the use-case is a little bit silly and probably
   *   could be collapsed.
   * - BookmarkManager.describeBookmark: Basically cribs the prior caller's
   *   logic to get the prefix in order to get the BrainConn and its metadata.
   *   This really suggests this method or the BookmarkManager want to be able
   *   to go from the 'window' scope bookmark to a DOM-ish rep without
   *   constantly having to pierce the weird bouncy data structures this class
   *   uses.
   */
  resolveWindowContainerIdToClientInfo(windowContainerId) {
    const fullFocusSlotId =
      this.windowContainerIdToActiveFocusSlot.get(windowContainerId);

    if (!fullFocusSlotId) {
      return null;
    }

    const prefixWithDelim = extractPrefixWithDelim(fullFocusSlotId);
    return {
      prefixWithDelim,
      fullFocusSlotId,
      focusSlotId: fullFocusSlotId.slice(prefixWithDelim.length)
    };
  }

  /**
   * Hacky variant of resolveWindowContainerIdToClientInfo for use by
   * BookmarkManager.describeBookmark until we clean up the abstraction.
   */
  resolveContainerIdToClientInfo(containerId) {
    const prefixWithDelim = extractPrefixWithDelim(containerId);
    return {
      prefixWithDelim
    };
  }

  /**
   * Creates a persistent filtered subscription on a set of containers.
   *
   * The initial use-case is for "tabs on display buttons" mode to be able to
   * get a list of pinned tabs in the primary Firefox window.  For this we want
   * to filter to tabs that are in the focusSlotId that corresponds to the
   * top-left bookmarked window and are pinned.  And we want them displayed in
   * index order.
   *
   */
  createFilteredSubscription(callerArgs) {
    const fs = new FilteredSubscription({
      visTracker: this,
      callerArgs
    });
    fs.reset();
    this.filteredSubscriptions.push(fs);
    return fs;
  }
}
