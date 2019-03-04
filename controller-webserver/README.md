# Overview

node.js server that:
- Directly interfaces with the control device, in this case assumed to be one
  of:
  - Native Instruments Maschine mk3 (current dev target and best experience)
  - Native Instruments Traktor Kontrol F1. (probably a bit bit-rotted)
  - Native Instruments Traktor Kontrol D2. (never fully hooked up; likely best
    to re-fork the mk3 stuff.  But the D2 is so insanely large and with such
    "whitespace" that I'd suggest just carrying around a Maschine mk3 even for
    on-the-road stuff.)
- Talks to the clients!

# Persistence

A very simple JSON store is used via the `configstore` npm package.  We define
it to have the following schema-lema-ding-dong.  Note that it's now likely we're
crossing the threshold for appropriate-ness, but if Firefox's session store
implementation has taught me anything, it's that you can continually re-write a
multi-megabyte JSON file and the world won't end.  (Although it will suck if the
file gets corrupted.)

## Schema

- version: Number.  Currently induces the config file to be blown away when the
  version is behind the current version.  Likely to start triggering upgrade
  logic because I am lazy.  I'm not making the various sub-stores have their
  own version numbers since they will likely evolve at their own pace.
- bookmarks: Legacy "global task" storage for bookmarks.  This is where we
  stored bookmarks before the task-centric stuff started happening and by
  special-casing this, I avoid losing my current bookmarks and lets the per-task
  data be reset periodically without the world ending.
- taskBookmarks: Object with the following keys/values:
  - version: Number.  To blow away taskBookmarks and taskStorage when the schema
    changes.
  - bookmarks: Array of 7 entries that track specific tasks.  (The 8th, 'H', is
    the global task.)  Each entry is an object with the following keys/values:
    - taskUuid: The UUID of the task tied to this button/bookmark.
    - color: The wrapped color to use.
- taskStorage: Dictionary object whose keys are task UUIDs and whose values is
  an object with the following fields.  The idea is that the bookmarks for a
  task are not tied to the specific physical button in question, but just to the
  task.  In the future, this storage could potentially be stored inside the
  taskwarrior task itself.
  - lastUseTS: Timestamp of when we last activated the
  - bookmarks: The set of (banked) bookmarks to use when this task is the
    current task.

## Interaction with Changing Active Task Bookmark

The "bookmark mode" has a naive Array of Arrays data structure.  The design
question when getting fancy was how to implement this swap.

The answer is using the `notifyModes` broadcast mechanism.  When the current
task bookmark is changed, we broadcast a "onCurrentTaskChanged" change with
the signature `onCurrentTaskChanged(task, taskState, updateTaskState)` where:
- task: the TaskWarrior JSON rep.  This will be null if there isn't a task
  associated with the current mode or if we're in the global "H" button which
  can never have a task associated.
- taskState: the contents of the `taskStorage` for the given task's UUID at
  the moment we just switched tasks.  This will be null if there isn't a task.
- updateTaskState(keyName, keyValue): A function to invoke that will update the
  task state written to disk so that the next time the notification is
  generated, `taskState[keyName] === keyValue`.  This will be null if there is
  no task.

From a UX level, the method will be invoked when:
- The program starts.  The task bookmark 'h' will be selected for global mode.
- The current task bookmark slot is changed.
- A new task is selected for the current slot.
