'use babel';

import TaskolioClient from './taskolio_ws_client.js';

import { CompositeDisposable } from 'atom';

export default {
  subscriptions: null,
  client: null,

  activate(state) {
    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'taskolio-atom-client:toggle': () => this.toggle()
    }));
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  serialize() {
    return {
    };
  },
};
