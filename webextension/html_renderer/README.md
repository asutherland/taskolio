tl;dr: Renders HTML provided by taskolio to raw 16-bit framebuffer bytes.

Taskolio is designed to work with controllers like the Native Instruments
Maschine Mk3 which contain one or more displays.  HTML is the natural mechanism
to render to these displays.  However, it turns out headless HTML rendering can
actually be pretty involved.  Most solutions end up spinning up a headless
Firefox or Chromium renderer and remoting the rendering to the process.

Since we already have a WebExtension that runs in the browser that we remote to,
the simplest thing for us to do is then to just do that in the extension.  And
so here we are.

The fundamental mechanism that we use to do this is taken from this MDN article:
https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Drawing_DOM_objects_into_a_canvas

If you want to do something similar, there's an existing library you can use at:
https://github.com/cburgmer/rasterizeHTML.js

We're not using the library because:
- The hope is to keep this webextension simple enough that it can be easily
  audited by anyone who's interested in using it but worried about security.
  Involving a library with its own dependencies makes that harder.
- It's nice to avoid a build step for as long as possible.
- The mechanism is actually fairly simple if you're not worried about edge cases
  for older browsers without Blobs or that have weird rendering work-arounds.
  Since I always run Firefox nightly, this provides a nice reliable target that
  can do everything that's needed.
