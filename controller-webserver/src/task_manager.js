'use strict';

const { exec } = require('child_process');

/**
 * Mangle taskwarrior's delimiter-less ISO 8601 format into one Date.parse can
 * handle, and pass it to Date.parse, returning a milliseconds-since-epoch TS.
 */
function parseTaskDate(iso) {
  return Date.parse(
    `${iso.slice(0,4)}-${iso.slice(4,6)}-${iso.slice(6,11)}:${iso.slice(11,13)}:${iso.slice(13,16)}`
  );
}

/**
 * Track and switch between TaskWarrior tasks and associate / lookup metadata
 * stored in the tasks.
 *
 * ## General Operation
 *
 * We have multiple
 */
class TaskManager {
  construct() {
    this._lastExported = 0;
    /**
     * If non-null, the most recent task data we have, captured at the timestamp
     * saved in `_lastExported`.  Exists to avoid spamming the task warrior
     * process too much.
     */
    this._recentPending = null;
    /**
     * Simple/hacky mechanism to avoid having multiple getRecentPending exports
     * runnning under the hood.  If this is non-null, it's the promise of a call
     * to _runExport to get the current pending requests.
     */
    this._activePendingRequest = null;
  }

  /**
   * Run "task export" with the provided arguments string.  This currently goes
   * through a shell.
   */
  _runExport(argStr) {
    return new Promise((resolve, reject) => {
      const cmdStr = 'task ' + argStr;
      exec(cmdStr, (err, stdout, stderr) => {
        if (err) {
          console.error('Error while running:', cmdstr);
          console.error(stderr);
          reject(err);
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (ex) {
          console.error('Error parsing task output:', cmdstr);
          console.error(ex);
          reject(ex);
        }
      });
    });
  }

  async getRecentPending() {
    if (this._activePendingRequest) {
      await this._activePendingRequest;
    }

    // We want new data if we don't have any recent data and it's over 1 second
    // old.
    if (!this.recentPending ||
        (this._lastExported - Date.now()) > 1000) {
      this._activePendingRequest = this._runExport('export status:pending');
      this._recentPending = await this._activePendingRequest;
      // If any other calls to getRecentPending() blocked above, we'll still be
      // the first one woken up, so us clearing the value next will work as we
      // desire.
      this._activePendingRequest = null;
      // Track validity starting after we got the response back, not from when
      // we issued the request.
      this._lastExported = Date.now();
    }

    return this._recentPending;
  }

  /**
   * Return the task with the most recent `start` date or null if there is no
   * active task.
   */
  async getActiveTask() {
    const tasks = await this.getRecentPending();
    let mostRecentStartedTask = null;
    for (const task of tasks) {
      if (task.start) {
        if (!mostRecentStartedTask ||
            (parseTaskDate(task.start) > parseTaskDate(mostRecentStartedTask.start))) {
          mostRecentStartedTask = task;
        }
      }
    }

    return mostRecentStartedTask;
  }

  async getPendingTasks() {
    const tasks = await this.getRecentPending();
    return tasks;
  }
}

module.exports.TaskManager = TaskManager;
