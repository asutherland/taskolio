# Taskolio #

An attempt at task-focused bookmarking of application windows, browser tabs,
code editor buffers, and terminal tabs/buffers.

The intended interface is that of a 4-by-4 set of RGB-backlit pads like you'd
find on various MIDI drum or DJ controllers, plus some extra buttons.  I chose a
Native Instruments Traktor Kontrol F1, a DJ controller, because of its
dimensions (12cm wide), the surprising rarity of full-RGB buttons in smaller
form factors, and because its non-velocity-sensitive buttons provide a tactile
click.  (Compare with velocity sensitive pads which necessarily can't have a
click experience.)

## What Works ##

The gnome-shell extension reports all your windows to the local node.js server
that talks to your Kontrol F1.  In the future, a Launchpad Pro may work, but
for now you need a Kontrol F1.

### How to get it to work ###

#### Install the gnome-shell extension

Do something like this to teach gnome-shell about your development checkout and
where the extension lives in there:
```
cd ~/.local/share/gnome-shell
ln -s /PATH/TO/taskolio/gnome-shell-taskolio@visophyte.org
```

Now you probably need to restart gnome-shell so it sees the extension.  You can
do that by hitting Alt-F2 and then typing "r" and hitting enter to refresh
gnome-shell.  That may only work under X11.  Under Wayland you might need to
log out and log in again.

The extension will automatically start and try to talk to the node.js server
every 5 seconds.

#### Get the server thing working.

This should be fairly simple:
- Have node.js installed.  I use v8.9.x.
- `cd controller-webserver`
- `npm install`
  - If this didn't work, you probably need to install libhid and/or its
    development libraries.  Check out https://github.com/node-hid/node-hid
    and the helpful docs there if something went wrong.
- `node server.js`
- Curse if you were already using the port the websocket server listens on,
  because it's not configurable and you'll have to refresh gnome-shell again
  if you change its source.
- Wait 5 seconds for the gnome-shell extension to connect.  You should see
  a tremendous amount of interesting debug spew about all your windows when
  it does.
- Move your mouse or press alt-tab so a new window becomes focused to ensure
  a focus update gets sent through the pipeline.  (The extension doesn't
  currently report what was focused at startup, an oversight.)

### Using it.

Button pushing:
- The default mode is "bg" or "bookmark go" mode.  The 2-letter display looks
  like "bG" in this mode.  Pushing a grid button activates the window
  corresponding to the bookmark you pushed if that window is still around.
  Your mouse will not move, but focus will.  I use sloppy focus mode, but this
  probably works for any focus mode?  I'm not opposed to making the mouse jump
  around in the future.
- The "stop" buttons along the bottom of the controller always switch "banks"
  of bookmarks (or colors).
- Push "capture" to switch to bookmark setting mode.  The next grid button you
  push will be assigned a random color and whatever gnome-shell most recently
  reported as focused.  You can switch banks in this mode.  You can also push
  capture a second time to leave the mode without assigning a bookmark.
  Assigning a bookmark returns you back to "bookmark go" mode.
- Hold down "shift" and push "capture" to switch to bookmark deleting mode.  You
  can release "shift" once you've released "capture".  The next grid button you
  push will have its bookmark deleted if it had one.
- Push "reverse" (which has "color" as its alternate, shifted label, hence the
  button choice) to enter color picking mode for the currently focused window.
  This means that if you set a new bookmark using "capture" and then
  immediately hit "reverse" without messing with your mouse or keyboard, you
  should now be setting the color of that bookmark.  This breaks if you have
  foolishly opted to assign a single window multiple bookmarks.

  The grid buttons will switch to displaying the HSV hue colorspace divided
  into 16 colors.  Switch banks to mess with the saturation.  (The bookmark
  logic saves the Value to convey when a bookmark's window is missing,
  there but not visible, visible, and focused.  This will likely change in
  the future.  Either to HSI with the Intensity expressing that state, or
  with Intensity only used for daylight/brightness-compensation and with
  Saturation reclaimed in order to convey focused/visible by making the
  colors whiter in those cases.

  Assigning a color returns you to "bookmark go" mode.
- The sliders don't do anything right now, nor do the knobs.  But no one else
  knows that, so feel free to pretend like they do something cool.

Other info:
- Your bookmarks get persisted to `~/.config/configustore/taskolio.json`.
  There is currently no magic inference engine to re-establish bookmarks based
  on app names or anything like that.  This persistence means that if you
  ctrl-c the node.js server and make changes, you won't lose your work.  But if
  your X11/wayland session ends, that's game over.  You'll still get to see
  the pretty colors with less "value" intensity in an HSV kind of way because
  of future plans, but it's not useful in any other way.  If you assign a new
  bookmark to that grid button, the existing color will be rudely clobbered
  with a new, random one.

# Rambling Follows #

## Problem Statement ##

Through the years I've used an ad-hoc combination of:
- Multiple monitors.
- Virtual desktops.
- Application bookmarking at a window manager level.  (Ex: alt-win-# to set a
  bookmark on the current window, win-# to go to the bookmark with that number.
  Also, script-based approaches so that win-F might focus Firefox without having
  the window previously having been identified.)
- Editor bookmarking via emacs registers and VIM marks.
- Editor buffer switching via alt-N.
- Editor buffer switching based on tab-position locality and ctrl-{pgup,pgdn}.
- Editor buffer switching via smart buffer switchers like "iswitchb" that
  combine frecency and substring matching.
- Editor buffer switching via UI relying on Eclipse extensions that let
  resources be annotated with a color and then displaying the parallel subtrees
  of currently open resources grouped by their color labels.
- Editor buffer switching via external XULRunner app that interrogated the
  running emacs.
- Browser tab switching based on TreeStyle Tabs hierarchical clustering.
- Browser tab switching using Panorama / Tab Groups to group tabs and create
  tiny information spaces.
- Browser tab switching using the awesomebar.
- Terminal tab management by manually titling terminals.
- More.

These worked reasonably well for me, but as of late I've found myself having to
deal with a greater level of multitasking that overflows my mental buffers and
the best case scenarios of the tools I work with:
- Too many tabs.
  - Too many bugs.
  - Too many open patch review windows.
  - Too many searchfox searches and explorations.
- Too many terminals.
- Too many buffers.

## Design and Rationale ##

### Consistent Context through Coordinated Colors ###

Human vision systems are pretty good at pre-attentive processing based on color
and shape.  And with a small enough set of colors in use, conventions can be
established and memorized at least a little.

It's also feasible to apply colored decorations to most of the software I use
to assist in this.

### Physical Reachability, Muscle Memory, and Small Search Spaces ###

One of the most hopeless things about having too many tabs in too many windows
is the certainty that what you want is in there, but also the knowledge that
a linear scan of all the tabs will take forever.  (And potentially lead to bad
browser performance if all of the pages are actually loaded into memory.)  Even
small sets can be disheartening if you're continually failing to jump directly
to something and need to end up manually searching every time.

The 4-by-4 grid of the F1 is ideal for all of this.  My pointer finger through
my pinky finger line up with the four columns of buttons.  The heel of my palm
can rest on its base with my four fingers able to effectively rest on the top
row of the grid, with my thumb able to rest on the side edge of the F1.  This
does imply that the top row should be used for more frequent operations than the
bottom row.

### Support for Incremental Adoption / Low Initial Activation Energy ###

With the client extensions installed and the controller-webserver running, the
system should function as a mechanism to bookmark things without needing to
open a text editor.

### Tasks and Task Slots ###

One of the realities of software development of a large project like Firefox is
that working directory checkouts hold a lot of state.  Changing branches willy
nilly incurs rebuild times.
