'use babel';

import TaskolioClient from './taskolio_ws_client.js';

import { CompositeDisposable } from 'atom';

export default {
  subscriptions: null,
  client: null,

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
  updateAndSendFocusSlotsInventory() {
    if (!this.client) {
      return;
    }


    const focusSlots = atom.workspace.getCenter().getPanes().map((pane, iPane) => {
      return {
        // So, the pane does seem to have an `id` that is unique-ish, but our
        // goal with the id here is really to describe a persistent conceptual
        // slot, so just using the index of the pane in the center container is
        // what we want.
        focusSlotId: iPane,
        // We link our columns/panes to our window via our PID.
        parentDescriptors: [
          { pid: process.pid }
        ]
      };
    });

    this.client.sendMessage('focusSlotsInventory', {
      focusSlots
    });
    this.updateAndSendThingsVisibilityInventory();
  },

  updateAndSendThingsVisibilityInventory() {
    if (!this.client) {
      return;
    }

    // There are a variety of ways to get here.  The key facts to know are:
    // - Panes contain the text editors we care about.  There's one pane for
    //   each tabbed interface.  Both of these panes live inside the
    //   WorkspaceCenter which (potentially?) holds a pane container that holds
    //   one or more panes.
    // - There are a variety ways to get at the pane hierarchy.  For example,
    //   there's `atom.workspace.getPanes()` that seems to return the flattened
    //   list of panes across the center and the border panels and there's a
    //   flexbox style of layout to all of it (literally).
    // - So we just go direct to the center and get the panes.
    const inventory = atom.workspace.getCenter().getPanes().map((pane, iPane) => {
      // The pane could be showing something that's not an editor and we're
      // not quite ready to deal with that.
      const editor = pane.getActiveEditor();

      // there might be an empty column... see the focus slots inventory for
      // hand-waving.  This might also be an unsaved buffer that accordingly lacks
      // a URI.
      if (!editor) {
        return null;
      }
      const fullPath = editor.getPath();
      if (!fullPath) {
        return null;
      }
      const [projectPath, relativePath] = atom.project.relativizePath(fullPath);
      return {
        containerId: relativePath,
        focusSlotId: iPane,
        state: pane.isActive() ? 'focused' : 'visible'
      };
    });

    this.client.sendMessage('thingsVisibilityInventory', {
      inventory
    });
  },

  /**
   * XXX This was an evolutionary hack thing.  It was sketchy before, it's even
   * more sketchy here in atom where one of my major complaints is how it likes
   * to scan the filesystem all the time.  So I'm just stubbing this out.
   *
   * Send a thingExists notification for every file in the workspace.  Note that
   * this is different that vscode.workspace.textDocuments (all open files) or
   * vscode.window.textEditors (the currently displayed text editors, one per
   * pane).
   *
   * To accomplish this, we issue a findFiles command for all files and the
   * default excludes to get a list of all files.
   */
  async sendThingsExistForWorkspace() {
    if (!this.client) {
      return;
    }
    // XXX per the above, this was super dubious.
    return;

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

    this.client.sendMessage('thingsExist', {
      items
    });
    // Since we are an async process, it's very possible the visibility inventory
    // already happened, so just send a fresh one now that we've run.
    // Alternately, we could have our caller wait for us and call.
    this.updateAndSendThingsVisibilityInventory();
  },

  /**
   * Helper to expose the PID of the atom window in the window's title.
   *
   * In atom this is the same situation as with vscode, likely owing to the very
   * obvious codebase lineage they share.  That is, gnome-shell sees the "root"
   * electron process thing as the owner of all the windows.  When I use
   * `atom-beta` this is the top-level "atom-beta" process's single child.  And
   * then `process.pid` is accurately the thing we're interested in.  (I think
   * there might be some oddness surrounding the process hierarchy for the first
   * atom window versus other atom windows spawned off that one, but I think it
   * works out as far as we care.)
   *
   * This is somewhat easier than in vscode because we can just directly
   * manipulate `document.title`.  Or I didn't realize I could do that in
   * vscode.
   */
  tunnelPidThroughWindowTitle(enable) {
    if (!enable) {
      atom.workspace.updateWindowTitle();
    } else {
      // avoid stacking up the PID more than once.
      if (!/PID=/.test(document.title)) {
        document.title = document.title + ` PID=${process.pid}`;
      }
    }
  },

  activate(state) {
    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(atom.workspace.observeActiveTextEditor((editor) => {
      this.updateAndSendFocusSlotsInventory();
    }));

    // start tunneling immediately so that by the time we connect we might have
    // already tunneled it.
    this.tunnelPidThroughWindowTitle(true);
    this.client = new TaskolioClient({
      endpoint: 'ws://localhost:8008/',

      /**
       * Handle (re)connecting.
       */
      onConnect: () => {
        // We need to re-tunnel every time we connect to the server because the
        // server may be newly restarted and will not have any persisted mapping.
        this.tunnelPidThroughWindowTitle(true);

        const canonPath = atom.project.getPaths()[0];

        // Tell the server our general meta-info.
        this.client.sendMessage('helloMyNameIs', {
          type: 'text-editor',
          name: 'atom',
          // This is truly the relevant PID for this window/project, handy, that.
          rootPid: process.pid,
          // Similar to my hand-waving for vscode... the best thing we have is
          // what amounts to its root path.  And since I only ever deal with
          // single root paths, this simplification works out great.  We might
          // be better off if there's a 'project' file we can prefer over the
          // root path as the project file should be unique.
          uniqueId: canonPath,
          // We're as persistent as you can get, so just send true.
          persistence: true
        });

        // report our focus slots inventory (synchronously), also sending a
        // visibility inventory that will be useless to the server until it gets
        // info on the containerId's, which happens in the next step.
        this.updateAndSendFocusSlotsInventory();
        // asynchronously enumerate the files in the workspace and report them as
        // containerId's, triggering a visibility inventory automatically at the
        // tail end of this.
        this.sendThingsExistForWorkspace();

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
        this.tunnelPidThroughWindowTitle(true);
      },

      /**
       * Select a file based on relative path.  Notable things:
       * - The server internally tries to remember what pane the bookmark was
       *   established in, passing us the focusSlotId.
       *
       * In vscode this ended up being reasonably easy because the concept of
       * column appears to have been more first-class than atom's pane
       * mechanism.  I'm going to hew towards the tight pane affinity here
       * because it seems like not doing so is more likely to infuriate me down
       * the road.
       */
      onMessage_selectThings: async (msg) => {
        const thing = msg.items[0];
        const relPath = thing.containerId;
        const paneIdx = parseInt(thing.focusSlotId, 10);

        // XXX in vscode we used its findFiles mechanism to map back to the path
        // again.  This seems
        const canonPath = atom.project.getPaths()[0];
        const guessedFullPath = canonPath + '/' + relPath; // windows fail.

        const pane = atom.workspace.getCenter().getPanes()[paneIdx];
        // It's possible there's no pane there anymore.
        if (!pane) {
          return;
        }

        // ## Walk the texteditors in the pane to see if it exists.
        for (const item of pane.items) {
          if (!atom.workspace.isTextEditor(item)) {
            continue;
          }

          const editor = item;
          const editorRelPath =
            atom.project.relativizePath(editor.getPath())[1];

          if (editorRelPath === relPath) {
            console.log('found existing editor, reusing');
            // We found it!  Activate it, we're done!
            pane.activateItem(editor);
            return;
          }
        }

        // ## Didn't find it, open it in the pane.
        // First, activate the pane to force the open() call to use that pane.
        pane.activate();
        // Then use open.  It also seems possible we could have instead used
        // atom.workspace.createItemForURI() and then just stuck that in the
        // pane?  I don't really know/care.
        //
        // Note that open() does take a `split` option that provides limited
        // control over the pane that's used, but it would seem to fall down in
        // a 3-horizontal pane scenario, so it seems better for us to
        // pre-activate the absolute pane we're interested in.
        console.log('unable to find editor, opening', guessedFullPath);
        atom.workspace.open(guessedFullPath);
      },

      onMessage_fadeThings: (msg) => {
        // XXX we currently don't need/want to do anything for fading.
      },

      /**
       * The server tells us when it has successfully mapped our focus slots back
       * to their windows, allowing us to remove the PID we tunnel through our
       * workspace title (because the window manager hints are for the root vscode
       * pid rather than our workspace window's root pid as advertised by
       * process.pid).
       */
      onMessage_focusSlotsLinked: async (msg) => {
        this.tunnelPidThroughWindowTitle(false);
      },

      /**
       * This is the server asking us to pretend like it doesn't know any of our
       * state and to have us re-send it.  This becomes necessary when the
       * window manager restarts and generates new window container id's and
       * it becomes necessary for us to re-tunnel our PID.  It's also
       * potentially helpful in the face of code occasionally having bugs...
       */
      onMessage_pleaseReportState: async (msg) => {
        // Toggle off and back on again after a delay so that we can also ensure
        // the window manager perceives a change in our state.
        this.tunnelPidThroughWindowTitle(false);
        setTimeout(() => {
          this.tunnelPidThroughWindowTitle(true);
        }, 0);
        this.updateAndSendFocusSlotsInventory();
        // this may still be a no-op.
        this.sendThingsExistForWorkspace();
      }
    });
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  serialize() {
    return {
    };
  },
};
