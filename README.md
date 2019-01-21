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

* Clients:
  * gnome-shell extension reports all your windows to the local node.js server
  * atom extension reports document/text editors to the local node.js server.
  * Basic WebExtension, works on Firefox directly using the tabs API.  Doesn't
    work on Google Chrome because it does not implement the "browser" namespace.
    I presume I can address this at some point with a polyfill.  (I don't
    want to deal with the callback-based API...)
  * vscode extension reports documents/text editors to the local node.js server.
    * NOTE: This could encounter some bit-rot at some point as I've switched back to atom from vscode.
* Physical Controllers:
  * Native Instruments Kontrol F1 via `server-f1.js`

## What Sorta Works ##

* Physical Controllers
  * Native Instruments Maschine Mk3

## What's Coming Next ##

In no particular order:

* Clients:
  * Firefox WebExtension with Tree Style Tab integration.
  * gnome-terminal tab-bookmarking via accessibility API.  (May work for other
    apps that expose an accessibility tree via ATK2.0).
* Physical Controllers:
  * Novation Launchpad Pro

### How to get it to work ###

#### Install the gnome-shell extension

Do something like this to teach gnome-shell about your development checkout and
where the extension lives in there:
```
cd ~/.local/share/gnome-shell/extensions
ln -s /PATH/TO/taskolio/gnome-shell-taskolio@visophyte.org
```

Now you probably need to restart gnome-shell so it sees the extension.  You can
do that by hitting Alt-F2 and then typing "r" and hitting enter to refresh
gnome-shell.  That may only work under X11.  Under Wayland you might need to
log out and log in again.

The extension will automatically start and try to talk to the node.js server
every 5 seconds.

#### Install the vscode extension

Symlink the taskolio-vscode-client into your vscode extensions directory.  It
seems like this is not the suggested way of doing things, but it does seem to
work.  In particular, if you run "code" from the taskolio-vscode-client
directory and run the extension target from there (it doesn't work from top
level right now for me, I get an npm error), although the resulting vscode
window will complain about overwriting the extension, the symlink won't be
clobbered.  (It is possible something foolish like copying a file onto itself
may happen, which might revert your editors where you haven't saved stuff, so,
uh, save a lot or be on the lookout for that wackiness.)

```
cd ~/.vscode/extensions
ln -s /PATH/TO/taskolio/taskolio-vscode-client
```

The extension will take effect in new windows or reloaded windows (via some
combination of accelerator keys and the letter "r" allegedly, but I think my
emacs keybindings may have clobbered that).

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
- Push "capture" to bookmark the most-specific thing that can be bookmarked;
  if there is a client reporting tabs/editors for the currently focused window,
  the current tab/editor will be bookmarked.  Push "quant" to bookmark just the
  window.  Once, you push the button, you enter "bs" or "bookmark set" mode.
  The next grid button you push will be assigned a color and whatever was
  reported as focused when you pushed "capture" or "quant" will be assigned
  to the button.  You can switch banks in this mode.  You can also push
  capture/quant a second time to leave the mode without assigning a bookmark
  (but you can't switch between the setting mode right now... future work).
  Assigning a bookmark returns you back to "bookmark go" mode.
- Hold down "shift" and push "capture" to switch to bookmark deleting mode.  You
  can release "shift" once you've released "capture".  The next grid button you
  push will have its bookmark deleted if it had one.
- Push "reverse" (which has "color" as its alternate, shifted label, hence the
  button choice) or "type" to enter color picking mode.  These match the
  respective granularities of the "quant" and "capture" buttons above them.
  This means that if you set a new bookmark using "capture" and then
  immediately hit "type" without messing with your mouse or keyboard, you
  should now be setting the color of that bookmark.  This works less well if you
  have assigned a single window multiple bookmarks because only one will be
  modified.

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
  of future plans, but it's not useful in any other way.  The good news is that
  when assigning a bookmark to a button that already had a bookmark, your new
  bookmark will get the color of the previous bookmark automatically, rather
  than a random color.

# Newer Rambling Follows #

## Notes from Paged Bookmarking ##

- The single page of bookmarks with consistent grid locations and coloring works
  pretty well.
- The quasi-homogeneous row of vscode instances sharing the same colors works
  less well.  Since I only keep 3 open at a time, it works out acceptably,
  especially since the leftmost is my consistent notes repo.
- In general, it's a huge win for window management versus the gnome shell
  overview UI.  Especially since I tend to keep a full-screen window on each
  monitor, the zoomed out the windows are largely homogeneous, and the overview
  window arrangement effectively feels random, the overview simply doesn't work
  well for my purposes.  And the animation and its latency doesn't help.  The
  animation is distracting, increases cognitive burden, and is simply way too
  long even with an extension speeding things up.
  - Alt-tab isn't much better given the large number of windows.  Something like
    the windows taskbar would likely be best.
  - It does beg the question of whether virtual desktops/multiple workspaces
    would have been a better approach.  While things like mail and IRC tabs do
    cross-cut, those arguably could have gone on their own desktops.  The bigger
    issue is that even within a single desktop I run into scaling problems from
    too many tabs or buffers.

- Preliminary attempts to use buffer bookmarking haven't worked out all that
  well.  The main win has been partitioning the left-right 2-column-by-4-row
  pages for the left/right panes, but that's mainly a win just because the
  "ctrl-x b" "edt " prefix for vscode tuples the pane/column, so that rarely
  did what I wanted.
  - I've tried some color mapping, but without the color mirroring happening in
    the editor UI with persistent color-tracking or higher-level group
    switching, it's a chore and ctrl-pgup/ctrl-pgdn buffer switching and its
    locality works better... at least in the cases where the number of buffers
    is low or there's good locality.

- A thought exercise of using a Launchpad Pro for creating an "information
  space" type setup seemed to have some promise.  (The 8x8 grid provides the
  space to have a sense of geography informed by empty spaces.)  Various
  approaches sprang to mind:
  - Flatten the folder hierarchy into a tree.
  - Let specific sub-trees be mapped into horizontal or vertical lines or
    automatically arranged trees like in the previous idea.  You right-click and
    hit send, then click to add to the grid.  Also could be used on a per-file
    basis to allow more custom layout.
  - With the recognition ctrl-pgup/ctrl-pgdn was still great when it didn't
    run into scale problems, using each row of the launchpad as a different set
    of tabs, with the arrow buttons down the right switching between these
    banks/sets.
- A recurring desire was to have an ability to textually label things.  An F1
  with the scribble strips of the X-Touch extender would be amazing, for
  example.  The "thing"-space for buffers and browser tabs is just too large and
  which too much essential churn for colors or even information spaces to work
  without textual context.
  - Projector solutions were very briefly considered, but that really doesn't
    work with the known lighting situation and I still haven't done the
    implementation necessary for my simple musical needs.
  - Maschine mk3 decided upon for this scenario once protocol specs were
    discovered.  Most of the rationale versus using the Push 2 is that the
    right half of the Maschine mk3 is very similar to the Kontrol F1, whereas
    the Push 2 (which is wider than the mk3) has useless gunk on the right.
    There are some other trade-offs:
    - The Push 2 display soft-buttons above and below are RGB which is more
      useful than the mk3's boolean white above and non-display rotary encoders
      below the displays.  WAY more useful.
    - The mk3 separate screens look dumb.
    - The separate mk3 A-H RGB group buttons are useful through their physical
      separation in a way that the Push 2's homogeneous grid can't be, although
      it can obviously be divvied up.

## Nebulous Gameplan following Paged Bookmarking ##

Hierarchy.
- Task switching.  At the furthest out level, we switch between high level
  tasks.  We assume there will be minimal task switching and that at most we'd
  be jumping between a small set of tasks in any given time interval.  So this
  can involve a browse phase if we're not working from our small MRU set.
- Sub-task switching.  Within a task, there's going to be different sub-tasks
  or "focuses" or something.  For example, different set of text editor buffers.
- Operating with a sub-task.  The space where ctrl-pgup/ctrl-pgdn and just
  switching via the mouse or other easy hotkeys does stuff.

(NB: This is not really a change of the original gameplan.  The idea was never
that single-level bookmarking was the only plan.  It was just a good baby-step.)

This does imply more software integration, likely with some set of:
- Building on top of virtual desktops where that works (or is the only option).
- Creating clients to help with the task and sub-task switching, potentially
  with in-app UI.
  - For Firefox, we can potentially ignore the tab-bar which means we can
    ignore the tab hiding APIs and a lot of the corresponding fallout.
  - For example, chunkier tab UI's that provide a greater sense of place or
    hierarchy.  Or manual labeling of text editor files with a color/icon
    mnemonic.

One important side-goal is that client functionality not preclude standalone
use.  Almost no one is going to buy in to all the hardware stuff.  Useful
extensions may gain some adoption on their own.

### Workflow Risks

There are a lot of potential upsides to the displays and soft-buttons.  But
labels only work if:
- Clustering is automatic or the required interaction doesn't feel laborious.  I
  worry about needing to manually label everything.  Using shoddy auto-labeling
  with competent post-facto renaming or re-grouping (use a slider to pick the
  cut point, etc.) could work.
- Things aren't ridiculously truncated, too small to read, or too densely packed
  to process at a glance.  The mk3 screens are 480 x 272 and 3.75" x 2.125"
  which is not a huge amount of real estate.  The Maschine UI's concept of
  having four soft-button pads across the top of each screen works for terse
  verbs or nouns, but is categoryically not going to work for file names/etc.
  - The Maschine UI's "select" behavior is an example of a sane mapping; the
    left display shows the 4x2 A-H "group" buttons with embedded, wrapped labels
    and the right display shows the 4x4 pad grid with embedded, wrapped labels.
- Some additional pre-attentive mechanism is in place.

### Specific Paths forward

1. Keep the F1 around as a bookmarking-only mechanism, although everything will
   live in the same process still.  The bookmarking idiom works and the
   quant/capture distinction provides the necessary control.
2. This leaves the Machine mk3 able to be a bit more experimental.
3. Have the mk3 initially be modal to a specific family of clients using the
   buttons in the upper-left with the "sampling" RGB button conveying the
   current state.  In other words, the mk3 will not change state based on the
   focused window changing.  The F1's "active bookmark" changes are already more
   than a little distracting in peripheral vision; the mk3 with its displays
   would be WAY too distracting.

#### Text Editor





# Older Rambling Follows #

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
