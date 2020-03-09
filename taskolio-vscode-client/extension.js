'use strict';

const TaskolioClient = require('./src/taskolio_ws_client').TaskolioClient;

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');

// Our auto-reconnecting TaskolioClient.  Initialized in activate() and
// destroyed in deactivate().
let gClient;

/**
 * Given a URI, return its relative path to the base of its enclosing workspace.
 */
function normalizeUri(uri, useFolder) {
  // propagate falseyness without throwing.
  if (!uri || !uri.path) {
    return uri;
  }
  const workspaceFolder =
    useFolder || vscode.workspace.getWorkspaceFolder(uri);

  if (!workspaceFolder) {
    // If we couldn't find a workspace folder, just use the absolute path.
    return uri.path;
  }

  const wsUri = workspaceFolder.uri;
  // take off what would be a leading '/'.
  return uri.path.substring(wsUri.path.length + 1);
}

/**
 * Send an updated focusSlotsInventory to the server.  There will be one
 * visibleTextEditor per editor pane/column.  We name panes according to their
 * viewColumn, which should be an integer.  The editors themselves don't matter
 * to us.
 *
 * This method is fired on first connection, plus every time an
 * onDidChangeTextEditorViewColumn event fires.  Because that may potentially
 * purge the visibility state of things in the server, we also directly invoke
 * updateAndSendThingsVisibilityInventory().
 */
function updateAndSendFocusSlotsInventory() {
  if (!gClient) {
    return;
  }

  const focusSlots = vscode.window.visibleTextEditors.map((editor) => {
    // XXX need to investigate states more, but onDidChangeActiveTextEditor says
    // the active editor can be `undefined` and it's definitely the case that
    // there can be a "column"/pane with no open tabs (in the singleton case
    //  at least, they seem to auto-close for the other columsn), so be prepared
    // for that.
    if (!editor) {
      return null;
    }
    return {
      focusSlotId: editor.viewColumn,
      // We link our columns/panes to our window via our PID.
      parentDescriptors: [
        { pid: process.pid }
      ]
    };
  });

  gClient.sendMessage('focusSlotsInventory', {
    focusSlots
  });
  updateAndSendThingsVisibilityInventory();
}

function updateAndSendThingsVisibilityInventory() {
  if (!gClient) {
    return;
  }

  const inventory = vscode.window.visibleTextEditors.map((editor) => {
    // there might be an empty column... see the focus slots inventory for
    // hand-waving.  This might also be an unsaved buffer that accordingly lacks
    // a URI.
    if (!editor || !editor.document || !editor.document.uri) {
      return null;
    }
    return {
      containerId: normalizeUri(editor.document.uri),
      focusSlotId: editor.viewColumn,
      state: vscode.window.activeTextEditor === editor ? 'focused' : 'visible'
    };
  });

  gClient.sendMessage('thingsVisibilityInventory', {
    inventory
  });
}

/**
 * XXX We abandoned this in atom and it 100% doesn't work on any kind of large
 * repro.  We just early return immediately.  This was a dubious idea.
 *
 * Send a thingExists notification for every file in the workspace.  Note that
 * this is different that vscode.workspace.textDocuments (all open files) or
 * vscode.window.textEditors (the currently displayed text editors, one per
 * pane).
 *
 * To accomplish this, we issue a findFiles command for all files and the
 * default excludes to get a list of all files.
 */
async function sendThingsExistForWorkspace() {
  if (!gClient) {
    return;
  }
  return;
/*
  const uris = await vscode.workspace.findFiles('**');

  const items = uris.map((uri) => {
    const normUri = normalizeUri(uri);
    return {
      containerId: normUri,
      title: normUri,
      // meh, no details.  I suppose we could ask source control for details,
      // or infer MIME type, but for now... meh.
      rawDetails: {}
    }
  });

  gClient.sendMessage('thingsExist', {
    items
  });
  // Since we are an async process, it's very possible the visibility inventory
  // already happened, so just send a fresh one now that we've run.
  // Alternately, we could have our caller wait for us and call.
  updateAndSendThingsVisibilityInventory();
*/
}

function tunnelPidThroughWindowTitle(enable) {
  const config = vscode.workspace.getConfiguration('window');
  if (!enable) {
    // Setting the value to undefined removes it.
    config.update('title', undefined, vscode.ConfigurationTarget.Workspace);
  } else {
    const info = config.inspect('title');
    const titleStr = info.defaultValue + ` PID=${process.pid}`;
    config.update('title', titleStr, vscode.ConfigurationTarget.Workspace);
  }
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand(
    'taskolio.pushBookmark', function () {
    // XXX this wants to use a new protocol mechanism to push the folder
    // hierarchy of the given tree node across, triggering a mode transition
    // in the controllers or queueing up the hierarchy for placement in an
    // explicitly supported queue mechanism.
    vscode.window.showInformationMessage("Is this a native window...?");
  }));

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    // XXX as commented elsewhere, haven't figured out the perfect time to
    // re-compute the focus slots, so let's just do it every time text editors
    // change.  After that happens, a visibility inventory will automatically
    // be sent as well, and that's really what we want to do whenever the
    // active text editor changes.
    updateAndSendFocusSlotsInventory();
  }));

  // start tunneling immediately so that by the time we connect we might have
  // already tunneled it.
  tunnelPidThroughWindowTitle(true);
  gClient = new TaskolioClient({
    endpoint: 'ws://localhost:8008/',

    /**
     * Handle (re)connecting.
     */
    onConnect() {
      // We need to re-tunnel every time we connect to the server because the
      // server may be newly restarted and will not have any persisted mapping.
      tunnelPidThroughWindowTitle(true);

      const canonWorkspace = vscode.workspace.workspaceFolders[0];

      // Tell the server our general meta-info.
      gClient.sendMessage('helloMyNameIs', {
        type: 'text-editor',
        name: 'vscode',
        // This is truly the root PID, handy, that.
        rootPid: process.pid,
        // We use the normalized root path of the canonical workspace.  If
        // someone uses multiple workspaces, this could potentially still work
        // out, but we're likely to fall down with the rest of the namespace
        // stuff where relative-paths would collide between the workspace
        // folders.
        uniqueId: canonWorkspace.uri.path,
        // We're as persistent as you can get, so just send true.
        persistence: true
      });

      // report our focus slots inventory (synchronously), also sending a
      // visibility inventory that will be useless to the server until it gets
      // info on the containerId's, which happens in the next step.
      updateAndSendFocusSlotsInventory();
      // asynchronously enumerate the files in the workspace and report them as
      // containerId's, triggering a visibility inventory automatically at the
      // tail end of this.
      sendThingsExistForWorkspace();

      // TODO: better handle tracking changes to the workspace.  Specifically:
      // - It seems like we want to use a FileSystemWatcher to know when things
      //   are changing, but I want to ensure that this won't cost system
      //   resources.  We really just want to piggy-back on whatever the folder
      //   tree is doing.
      // - For now we just make sure we send thingsExist notifications for the
      //   visible text editors at all time, and this handles the creation of
      //   new files as they happen.  It doesn't cover deletion of files, but
      //   that's arguably not the biggest deal unless it starts resulting in
      //   empty files being created as selecting a bookmark does the wrong
      //   thing.
    },

    onDisconnect: () => {
      // re-enable tunneling when we disconnect so that when we reconnect the
      // window-manager might already have our info.
      tunnelPidThroughWindowTitle(true);
    },

    /**
     * Select a file based on relative path.  Notable things:
     * - The server internally tries to remember what column the bookmark was
     *   established in, passing us the focusSlotId.  We don't yet honor that.
     */
    async onMessage_selectThings(msg) {
      const thing = msg.items[0];
      const relPath = thing.containerId;
      const column = parseInt(thing.focusSlotId, 10);
      // map the relative path back to a full path by finding the first
      // workspace that has it.  The file might also no longer exist.
      const fullUris = await vscode.workspace.findFiles(relPath);
      if (fullUris.length) {
        const fullUri = fullUris[0];
        //console.log("selectThings mapped", relPath, "to", fullUri);
        const doc = await vscode.workspace.openTextDocument(fullUri);
        //console.log("got doc, going to try and show in column", column);
        const editor = await vscode.window.showTextDocument(doc, column);
        //console.log("allegedly shown in column", editor.viewColumn);
      } else {
        console.log("selectThings failed to map", relPath);
      }
    },

    onMessage_fadeThings(/*msg*/) {
      // XXX we currently don't need/want to do anything for fading.
    },

    /**
     * The server tells us when it has successfully mapped our focus slots back
     * to their windows, allowing us to remove the PID we tunnel through our
     * workspace title (because the window manager hints are for the root vscode
     * pid rather than our workspace window's root pid as advertised by
     * process.pid).
     */
    onMessage_focusSlotsLinked(/*msg*/) {
      tunnelPidThroughWindowTitle(false);
    },

    /**
     * This is the server asking us to pretend like it doesn't know any of our
     * state and to have us re-send it.  This becomes necessary when the
     * window manager restarts and generates new window container id's and
     * it becomes necessary for us to re-tunnel our PID.  It's also
     * potentially helpful in the face of code occasionally having bugs...
     */
    onMessage_pleaseReportState: async (/*msg*/) => {
      // Toggle off and back on again after a delay so that we can also ensure
      // the window manager perceives a change in our state.
      tunnelPidThroughWindowTitle(false);
      setTimeout(() => {
        tunnelPidThroughWindowTitle(true);
      }, 0);
      updateAndSendFocusSlotsInventory();
      // this may still be a no-op.
      sendThingsExistForWorkspace();
    },
  });
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {
  gClient.shutdown();
  gClient = null;

  tunnelPidThroughWindowTitle(false);
}
exports.deactivate = deactivate;
