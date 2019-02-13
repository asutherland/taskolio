See PROTOCOL.md first.

## Bookmarks and Persistent Identity

### Meta

From a user-perspective, it's currently possible to bookmark at two
granularities: windows and tabs.  (Tabs can also be text editor files, but those
are also represented as tabs, so let's just call them tabs.)

Because the Window Manager client has a limited knowledge of what's going on in
complicated applications with multiple windows and complicated process
hierarchies (and that don't expose themselves to the native accessibility
introspection mechanism), we depend on the applications to have clients that
expose details about the internal state of the application.  And we do what it
takes to be able to link our understanding of focus slots to application
windows.

### Implementation

For bookmarking windows, we treat the focus slot as the thing that is being
bookmarked.  This means we use the app client's full focus slot id instead of
the window manager's full container id for the window.

For bookmarking tabs, we store the app client container id for the tab, but we
also store the app focus slot id as well.  This is currently something we do
for simplicity and user predictability.  There really isn't an alternative for
web browsers (unless we start automatically moving tabs between windows), but
for file editors, it could make sense to not tie files to buffers/panes.  So we
might relax that if we end up with it being usable to bookmark files.  It's not
right now, and I expect that the plan will be to bookmark groups of files
("working sets"?).
