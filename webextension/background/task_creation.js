const SITE_MAPPINGS = {
  'https://bugzilla.mozilla.org/': {
    page_regexp: /^show_bug.cgi\?id=(\d+)/,
    makeOptions(match) {

    }
  },
  'https://phabricator.services.mozilla.com/': {

  }
};

/**
 * Tab context menu support for creating a new TaskWarrior task based on the
 * current tab.  For now this is based on a hardcoded set of sites.
 *
 * ## Hardcoded Sites
 * - bugzilla.mozilla.org: If we're on a bug page, offer to create a review task
 *   or a generic "fix bug" task based on the URL.
 * - phabricator.services.mozilla.com: If we're on a Differential page, offer to
 *   create a review task.
 */
export class TaskCreator {
  constructor() {
    // nothin' yet.
  }

  hookupMenus() {
    const createTaskRootId = 'task-create-root';

    browser.menus.create({
      id: createTaskRootId,
      title: 'Create Task...',
      contexts: ['tab'],
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
