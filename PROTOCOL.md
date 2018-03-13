# Protocol / Implementation Sketch #

## Overview ##

We have:
- Multiple clients
- One controller-webserver

Clients (will) exist for:
- The relevant window manager-ish thing: gnome-shell on linux, an autohotkey
  script on Windows.
- Web browsers.
- Text editors/IDEs.
- Terminal emulator things.

The controller-webserver is responsible for:
- persistence of bookmarks
- tracking authoritative state like what's believed to be active
- letting clients subscribe via websockets and sending them updates
- interfacing with the hardware controller, although ideally this is something
  that would be split out to be just a variety of controller.

The clients are responsible for
- Reporting when something is made active.  For example:
  - A window manager reports when the currently focused window changes.
  - A tabbed terminal emulator reports when the selected tab changes.
  - A web browser reports when the selected tab changes.  Note that we do not
    care about navigations, just tabs.  The rationale is the same as the
    terminal case.
  - The limited decision-maker logic.  (Most d)
  - The

## Moving Parts ##

###  ###



### Controller Webserver ###



## Protocol Concepts ##

### Containers ###

Analogous to a WindowProxy/browser tab for web browsers.  This tool is about
managing and arranging the working-set of open apps/tabs/etc., it's not a way
to manage your URL bookmarks.  There may end up being a way to persist container
state even if the app loses it so that a tab can be re-opened at the last URL
it contained, but the focus is still not really on the URL itself.  We are
conceptually persisting the state of the container in that case, not supplanting
the awesomebar or user's shell tools.

### Focus Slots ###

Containers are displayed in focus slots.  Focus slots are grouped under their
"parent".  For a window manager, the parents are monitors.  For all other
clients, the parents are windows.  For example, for a normal web browser, this
would be each of its windows.  But for a tiled web-browser, each of its tiles
would be a focus slot.  For a text editor with multiple editor panes, each pane
would be a focus slot.

## Protocol Proper ##

### To Controller-Server ###

#### helloMyNameIs ####

Sent by a client to identify itself to the server.  This should contain fields
like so:
- type: One of 'window-manager', 'web-browser', 'terminal', 'text-editor'.
- name: Something like the process name of whatever the thing is.  'firefox',
  'chromium', 'emacs', etc.
- rootPid: If known, the root pid of whatever the thing is.  May be omitted if
  unknown.
- uniqueId: Something to distinguish this instance from other instances with the
  same `name`, ideally something persistent and invariant, like the profile
  directory HOME-normalized profile path for a firefox instance.
- persistence: `false` if persistence is not supported, or a unique id that will
  change if the client loses its persistent storage due to user action or
  abnormal situations or whatever.

#### focusSlotsInventory ####

Sent by a client to describe all of the places that support displaying a
container.



Each message should provide an exhaustive inventory.  If a message includes a
focus slot that a later message does not include, that focus slot will no longer
be known to the controller.

Each item in the array should have the following fields:
- focusSlotId: Unique (within the client) identifier for the focus slot.
- parentDescriptor: TBD mechanism for non-'window-manager' clients to identify
  themselves in a way that allows mapping the focus slot to the container the
  window manager generates for the window.  For 'window-manager' clients, this
  is used to identify the monitor so that human-friendly names can be attached
  for rule-making purposes.


#### thingsExist ####

Sent by a client to report one or more things that can be visible/focused.  Each
message is treated as a delta, with its effects being cumulative based on the
previously received "things" messages.

The message contains an array of items with the following keys:
- containerId: The id of the tab/whatever that can be focused or unfocused.
  This should be a persistent identifier if the client reported a non-false
  persistence
- title: A human-readable string label that provides some context about the
  contents of the container at the time it is being reported.  This is primarily
  for debugging at this time and is expected to go stale.


#### thingsGone ####

Sent by a client to report one or more things that previously existed, as
reported in a `thingsExist` message now no longer exist.

- containerId: The id of the thing that is gone.

#### thingsVisibilityInventory ####
Sent by a client to list currently visible containers.  Containers no longer
included in the report that were previously included are taken to no longer be
visible.  It's expected that a value will be emitted for every item included in
the most recent `focusSlotsInventory` message.

- containerId: What got focused/unfocused.
- focusSlotId: The slot which the container occupies.
- state: One of:
  - focused: The container is visible and has input focus (in its window) if
    dialogs are ignored.  This does not mean the window has input focus, just
    that that it would if the window was focused.  (This state will be adjusted
    after applying the window manager's most recent report.)
  - visible: The container is fully visible but does not have input focus.
  - partiallyVisible: The container is partially visible.  This is primarily
    expected to be used by the window-manager when a window is occluded by
    another window but still sufficiently visible to be interacted with as a
    typing target, like the bottom of a terminal window.
  - empty: There's somehow nothing in the focus slot.  This goes with a null
    containerId.
- selectRequestId: If this focusing occurred as the result of a selectThings
  message, this is the id that was provided.  This is a best-effort value.



### From Controller-Server ###

#### selectThings ####

Sent by the authoritative server to indicate that user action from a controller
has explicitly indicating a desire to focus one or more things.  This contains
an array of items with the following keys:
- containerId: Focus this.
- selectRequestId: An relatively unique value used by the server primarily to
  aid in tracing the results of the request through the system, but which may
  also be used in the future to avoid flapping and ensure idempotency.

