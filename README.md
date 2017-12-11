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
nilly will