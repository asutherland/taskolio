/**
 * See README.md for context.
 **/

/**
 * Render the given HTML string to a 16-bit JS Array suitable for JSON
 * serialization.  Refactor if additional display types start getting used.
 *
 * This is intended to run in a Window.
 *
 * Security-wise: The HTML is only ever inserted into an image/svg+xml IMG tag
 * which in turn lives inside a same-origin iframe sandbox.  Ideally, the
 * constraints on the SVG image are sufficient, but it's so easy to create the
 * sandbox that it would seem negligent not to.
 */
export async function renderHTMLTo16BitArray({ sandboxedIframe, htmlStr }) {
  const useWin = sandboxedIframe.contentWindow;
  const useDoc = sandboxedIframe.contentDocument;
  const img = new useWin.Image();

  const loaded = new Promise((resolve) => {
    img.onload = resolve;
  });
}
