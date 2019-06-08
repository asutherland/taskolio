gnome-shell extension that communicates with the controller-webserver via
WebSockets.

## Debugging ##

If things seem broken, like the "window-manager" client isn't showing up in the
CLI's "Clients" pane, or when you select the client the "Client Focus Slots
Inventory" pane is empty, then you can see logs from gnome-shell via:

```
journalctl -e /usr/bin/gnome-shell
```

Once you've made changes, if you're running under X11 you can use "alt-f2" to
bring up the gnome-shell debug UI thing and type "r" and hit enter to reboot
gnome-shell.  Less dramatically, you may also be able to use the "Gnome Shell
Extension Reloader" extension, but it has some limitations.

## TODO ##

### Sub-window clients using the AT-SPI Acessibility API ###

#### Gnome Terminal ####

Gnome Terminal doesn't appear to expose a D-Bus API for tabs, but it is an
accessible app.  So we can do something like the following to enumerate tabs and
select them.  Docs for libatspi are at
https://developer.gnome.org/libatspi/stable/

```js
const Atspi = imports.gi.Atspi;

// There is a get_desktop_list() method, but that currently returns an empty
// list for me from looking glass, and it's also defined to only return a single
// result anyways.
const desktop = Atspi.get_desktop(0);

// The desktop is itself an AtspiAccessible instance, documented at:
// https://developer.gnome.org/libatspi/stable/AtspiAccessible.html

// XXX enumerate using desktop.get_child_count() and get_child_at_index(i).

// XXX get_name() will return "gnome-terminal-server" for the terminal app root.
// The "accerciser" (or dogtail, for less fancy) GUI tool is able to help
// visualize the hierarchy and interfaces.  The interfaces are things like
// AtspiSelection which can be coerced/retrieved via get_selection().

// The hierarchy for gnome-terminal looks like:
// - `application` title="gnome-terminal-server"
//   - `frame` title={the current tab's title}.  There is one of these nodes for
//      each window that's currently open).  The area corresponds to the window
//      and its titlebar.
//     - `filler` no title, seems to correspond to the content area of the
//       window, sans titlebar.
//       - `menu bar`
//       - `page tab list`.  Implements Selection interface.
//         - `page tab` title={tab title}.  There is one of these nodes for each
//           tab.
```

## Credits ##

For gnome-shell extensions, existing extensions are invaluable.  I've consulted:

- https://github.com/marmis85/pushbullet-gnome (MIT licensed) for its WebSocket
  logic using libsoup.
