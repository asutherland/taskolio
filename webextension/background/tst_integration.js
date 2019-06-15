const TST_ID = 'treestyletab@piro.sakura.ne.jp';

// Taken from the amazing MIT licensed CABL Macshine Jam helper logic: https://github.com/shaduzlabs/cabl/blob/master/src/devices/ni/MaschineJamHelper.cpp
const indexed_led_mapping = [
  { "red":   0, "green":   0, "blue":   0 },
  { "red":   0, "green":   0, "blue":   0 },
  { "red":   0, "green":   0, "blue":   0 },
  { "red":   0, "green":   0, "blue":   0 },
  { "red":  32, "green":   0, "blue":   0 },
  { "red":  64, "green":   0, "blue":   0 },
  { "red": 255, "green":   0, "blue":   0 },
  { "red": 255, "green":  32, "blue":  16 },
  { "red":  32, "green":  16, "blue":   0 },
  { "red":  64, "green":  16, "blue":   0 },
  { "red": 255, "green":  32, "blue":   0 },
  { "red": 255, "green":  64, "blue":  32 },
  { "red":  32, "green":  48, "blue":   8 },
  { "red":  64, "green":  64, "blue":   0 },
  { "red": 255, "green":  96, "blue":   0 },
  { "red": 255, "green": 128, "blue":  48 },
  { "red":  40, "green":  56, "blue":   0 },
  { "red":  64, "green":  96, "blue":   0 },
  { "red": 255, "green": 224, "blue":   0 },
  { "red": 128, "green": 255, "blue":  64 },
  { "red":  24, "green":  40, "blue":   0 },
  { "red":  96, "green": 176, "blue":   0 },
  { "red":  96, "green": 255, "blue":   0 },
  { "red": 112, "green": 255, "blue":  64 },
  { "red":  16, "green":  40, "blue":   0 },
  { "red":  56, "green": 112, "blue":   0 },
  { "red":  72, "green": 255, "blue":   0 },
  { "red": 64,  "green": 255, "blue":  64 },
  { "red":   0, "green":  40, "blue":   0 },
  { "red":   0, "green":  96, "blue":   0 },
  { "red":   0, "green": 255, "blue":   0 },
  { "red": 48,  "green": 255, "blue":  48 },
  { "red":   0, "green":  40, "blue":  16 },
  { "red":   0, "green": 112, "blue":  32 },
  { "red":   0, "green": 255, "blue":  48 },
  { "red": 56,  "green": 255, "blue":  40 },
  { "red":   0, "green":  40, "blue":  40 },
  { "red":   0, "green": 112, "blue":  96 },
  { "red":   0, "green": 255, "blue": 226 },
  { "red": 64,  "green": 255, "blue": 255 },
  { "red":   0, "green":  24, "blue":  48 },
  { "red":   0, "green":  64, "blue": 112 },
  { "red":   0, "green":  96, "blue": 255 },
  { "red": 40,  "green": 160, "blue": 255 },
  { "red":   0, "green":   0, "blue":  40 },
  { "red":   0, "green":   0, "blue": 128 },
  { "red":   0, "green":   0, "blue": 255 },
  { "red": 40,  "green": 104, "blue": 255 },
  { "red":   8, "green":   0, "blue":  44 },
  { "red":  32, "green":   0, "blue": 128 },
  { "red":  40, "green":   0, "blue": 255 },
  { "red": 48,  "green":  88, "blue": 255 },
  { "red":  24, "green":   0, "blue":  40 },
  { "red":  72, "green":   0, "blue": 128 },
  { "red": 104, "green":   0, "blue": 255 },
  { "red": 88,  "green":  80, "blue": 255 },
  { "red":  32, "green":   0, "blue":  48 },
  { "red":  96, "green":   0, "blue":  96 },
  { "red": 255, "green":   0, "blue": 128 },
  { "red": 255, "green":  64, "blue": 160 },
  { "red":  32, "green":   0, "blue":  16 },
  { "red":  90, "green":   0, "blue":  48 },
  { "red": 255, "green":   0, "blue":  64 },
  { "red": 255, "green":  40, "blue": 104 },
  { "red":  40, "green":   0, "blue":   8 },
  { "red": 112, "green":   0, "blue":  16 },
  { "red": 255, "green":   0, "blue":  16 },
  { "red": 255, "green":  48, "blue":  56 },
  { "red":  40, "green":  40, "blue":  40 },
  { "red":  96, "green":  96, "blue":  96 },
  { "red": 226, "green": 226, "blue": 226 },
  { "red": 160, "green": 255, "blue": 255 }
];

/// Convert a number to a 0-padded 2-digit hexadecimal number.
function hexTwo(num) {
  return num.toString(16).padStart(2, '0');
}
/// Given a {red,green,blue} object, return CSS hex-color representation.
function hexifyRGB({ red, green, blue }) {
  return `#${hexTwo(red)}${hexTwo(green)}${hexTwo(blue)}`;
}

function makeFancyStyles () {
  let rules = "";

  for (let i = 0; i < indexed_led_mapping.length; i++) {
    let c = indexed_led_mapping[i];
    rules += `.indexed-color-${i} {
      background-color: ${hexifyRGB(c)};
    }
`;
  }

  return rules;
}

const fancyStyles = makeFancyStyles();

/**
 * Provides task-aware integration with TreeStyleTabs.
 *
 * Specifically:
 * - Tab trees are associated with specific tasks at their root.
 *   - When new tabs are created, they are associated with the current task
 *     immediately.
 *   - For each window, when tasks are switched:
 *     - If the current tab is an un-navigated new tab (on about:home or
 *       about:newtab), the tab is updated to switch to the new task.
 *       Otherwise, what was the current tab is remembered as the MRU tab for
 *       that task.  And if there is an MRU tab associated with the task for the
 *       window, it will be switched to.
 *     - Tab tree roots associated with the prior task will be collapsed.  (Note
 *       that TST remembers the state of its descendants and this information is
 *       not lost.)
 * - Tab tree roots that are associated with a task will have the tab colored
 *   to match the task's currently assigned color.
 */
export class TSTIntegration {
  constructor() {
    this.init();
  }

  async init() {
    this.listenForReady();
    this.register();
  }

  listenForReady() {
    browser.runtime.onMessageExternal.addListener((message, sender) => {
      switch (sender.id) {
        case TST_ID:
          switch (message.type) {
            case 'ready':
              console.log('TSTIntegration: received "ready" message');
              this.register();
              break;
          }
          break;
      }
    });
  }

  async register() {
    try {
      let success = await browser.runtime.sendMessage(TST_ID, {
        type: 'register-self',
        name: 'Taskolio',
        icons: browser.runtime.getManifest().icons,
        listeningTypes: [], //['tab-mousedown', 'tab-mouseup'],
        // Extra style rules applied in the sidebar (string, optional)
        style: fancyStyles
      });
      console.log('TSTIntegration registered.  success:', success, 'styles:',
                  {
                    fancyStyles,
                  });
    } catch (ex) {
      // Meh, maybe there's no TST. Whatev's.
    }
  }

  /**
   * Send helper that exists to potentially add debugging gunk as needed.
   */
  async commonSend(msg) {
    let success = await browser.runtime.sendMessage(TST_ID, msg);
    if (!success) {
      console.warn('failed to send message successfully:', msg);
    }
  }

  collapseTree(tabId) {
    this.commonSend({
      type: 'collapse-tree',
      tab: tabId
    });
  }

  expandTree(tabId) {
    this.commonSend({
      type: 'expand-tree',
      tab: tabId
    });
  }

  addTabStates(tabIds, states) {
    this.commonSend({
      type: 'add-tab-state',
      tabs: tabIds,
      state: states
    });
  }

  addIndexedColor(tabId, colorIndex) {
    this.addTabStates([tabId], [`indexed-color-${colorIndex}`]);
  }

  removeTabStates(tabIds, states) {
    this.commonSend({
      type: 'remove-tab-state',
      tabs: tabIds,
      state: states
    });
  }

  removeIndexedColor(tabId, colorIndex) {
    this.removeTabStates([tabId], [`indexed-color-${colorIndex}`]);
  }
}
