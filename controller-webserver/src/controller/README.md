This directory hosts the MIDI-controller-related logic that wants to be as
decoupled as possible.

## Implementation ##

### Overview ###

This is how the implementation is broken up:
- ControllerDriver: Binds directly to the controller, pokes ModeDispatcher with
  received button events and processes display requests from ModeDispatcher to
  set LED state.  This abstraction most usefully exists so that the actual
  hardware can be replaced with a web mock version of the controller.
- ModeDispatcher: Models controller state as a stack of modes, each of which can
  do their own button handling and display logic.
- BookmarkMode: Logic for simple bookmarking of containers, with 4 banks of 4x4
  bookmarks, switched between via the orange "stop" buttons along the bottom.
- ColorPickerMode: Switch between 4 pages of 4x4 colors using the "stop"
  buttons at the bottom as banks.  Colors vary in hue and saturation, but
  brightness is left to the bookmarking modes to vary based on what's focused or
  visible.  This will probably also gain use of the sliders to vary hue and
  saturation.

  It also depends on the abstractions provided by the coordinating server logic
  in the parent directory:
  - BookmarkManager: Mints 