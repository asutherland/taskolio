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



## Protocol Proper ##

### To Controller-Server ###

### From Controller-Server ###