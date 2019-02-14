const BOOKMARK_PERMISSION = 'taskolio-actions';

/**
 * Implements a context-menu UI that allows users to right-click on an element
 * on the page and have it sent to the taskolio server so that the element can
 * be associated with a hardware button in order to trigger a "click" event on
 * whatever the thing is.
 *
 * In order to accomplish this, we require both the "menus" permission to
 * display the menu and "<all_urls>" to be able to later trigger the click.  We
 * also currently use the "sessions" permission to track granted bookmarks.
 *
 * For security purposes, we use a capability permission model wherein we store
 * the specific origin and specific element id's that are allowed to be clicked
 * on a given tab.  This is aligned with taskolio's tab/container model, and
 * gets permission cleanup here in the browser for free when a tab closes.  This
 * model will potentially want to be overhauled in the future in the case of
 * buttons/affordances that are supposed to operate on specific page scopes
 * automatically across matching tabs, not just specific tabs.
 */
export class ElementBookmarker {
  constructor({ sendBookmarkRequest }) {
    this.sendBookmarkRequest = sendBookmarkRequest;
  }

  /**
   * Given info about the target of a context menu action, walk up from the
   * selected element until we find something that is or behaves like a link or
   * button.  This probably can be generalized.
   */
  async _findClickableFromTarget(info, tab) {
    function contentScriptFindId(targetId) {
      let elem = browser.menus.getTargetElement(targetId);
      console.log('initially considering ' + elem + ' from targetId of', targetId, elem);
      while (elem && elem.tagName !== 'BODY') {
        console.log('  now considering ' + elem, elem);
        // links are okay
        if ((elem.tagName === 'A' || elem.tagName === 'BUTTON') && elem.id) {
          return elem.id;
        }
        // things that think they are buttons are okay.
        if ((elem.getAttribute('role').toLowerCase() === 'button') && elem.id) {
          return elem.id;
        }
        elem = elem.parentElement;
      }

      return null;
    }
    const results = await browser.tabs.executeScript(tab.id, {
      // XXX note that in theory there could be a frameId here, but we don't
      // currently want to support that.  So we should be bailing in that case.
      code: `(${contentScriptFindId.toString()})(${info.targetElementId});`
    });
    // the results are returned in an array in case multiple frames were
    // involved.
    const elemId = results[0];

    return elemId;
  }

  async doProcessContextClick(info, tab) {
    const elemId = await this._findClickableFromTarget(info, tab);
    if (!elemId) {
      console.warn('taskolio: unable to find clickable item id');
      return;
    }

    console.log('adding permission for', elemId)
    // this is async but we don't need to wait for it.
    this.addElementPermissionToTab(tab, elemId);
    // And send a message so that the controller-webserver can enter assignment
    // mode.
    this.sendBookmarkRequest(tab, elemId);
  }

  /**
   * Generate a synthetic 'click' event on the target element in the given tab.
   * XXX We don't attempt error handling here because this is all currently
   * under development and I'd like errors to get logged.
   */
  async triggerBookmarkedAction(tab, elemId) {
    const allowed = await this.checkPermission(tab, elemId);
    console.log('triggerBookmarkedAction', elemId, allowed);
    if (!allowed) {
      return;
    }

    await browser.tabs.executeScript(tab.id, {
      code: `document.getElementById("${elemId}").dispatchEvent(
               new MouseEvent('click', { bubbles: true, cancelable: true }));`
    });
  }

  async addElementPermissionToTab(tab, elemId) {
    const existingPermStr =
      await browser.sessions.getTabValue(tab.id, BOOKMARK_PERMISSION);
    let existingPerms;

    if (!existingPermStr) {
      existingPerms = [];
    } else {
      existingPerms = JSON.parse(existingPermStr);
    }
    if (existingPerms.indexOf(elemId) === -1) {
      existingPerms.push(elemId);
      const newPermStr = JSON.stringify(existingPerms);
      await browser.sessions.setTabValue(tab.id, BOOKMARK_PERMISSION, newPermStr);
    }
  }

  async checkPermission(tab, elemId) {
    const existingPermStr =
      await browser.sessions.getTabValue(tab.id, BOOKMARK_PERMISSION);
    if (!existingPermStr) {
      return false;
    }

    const existingPerms = JSON.parse(existingPermStr);
    return existingPerms.indexOf(elemId) !== -1;
  }

  hookupMenus() {
    const bookmarkTopId = 'bookmark-top';

    browser.menus.create({
      id: bookmarkTopId,
      title: 'Bookmark to hardware button...',
      contexts: ['page', 'link'],
    });

    browser.menus.onClicked.addListener((info, tab) => {
      switch (info.menuItemId) {
        case bookmarkTopId:
          this.doProcessContextClick(info, tab);
          break;
      }
    });
  }
}
