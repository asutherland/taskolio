/**
 * See README.md for context.
 **/


/**
 * Pack 8-bit RGB values into 5-bit red, 6-bit green, and 5-bit blue 16-bit
 * encoding, big-endian, which means we need to do the byte swapping ourselves.
 */
function rgb16(red, green, blue) {
  const wrongEndian =
         (((red >> 3) & 0x1f) << 11) |
         (((green >> 2) & 0x3f) << 5) |
         ((blue >> 3) & 0x1f);
  // This could obviously be baked into the above at the expense of even less
  // clarity.
  return ((wrongEndian & 0xff) << 8) |
         (wrongEndian >> 8);
}

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
export async function renderHTMLTo16BitArray({ width, height, sandboxedIframe, htmlStr }) {
  const useWin = sandboxedIframe.contentWindow;
  const useDoc = sandboxedIframe.contentDocument;
  const img = new useWin.Image();

  const root = useDoc.body;
  while (root.lastChild) {
    root.removeChild(root.lastChild);
  }

  const canvas = useDoc.createElement('canvas');
  canvas.setAttribute('width', width);
  canvas.setAttribute('height', height);
  root.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<foreignObject width="100%" height="100%">
${htmlStr}
</foreignObject>
</svg>`;

  const loadedPromise = new Promise((resolve) => {
    img.onload = resolve;
  });
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svgStr);
  console.log('rendering:', img.src);
  await loadedPromise;

  ctx.drawImage(img, 0, 0);

  // get the RGBA bytes backing the image
  const rgbaBytes = ctx.getImageData(0, 0, width, height).data;
  // create the array to hold the 16-bit values (represented as 16-bit numbers,
  // not 8-bit.)
  const pixCount = width * height;
  const pixels = new Array(pixCount);

  for (let iRGBA = 0, iPix = 0; iPix < pixCount; iRGBA += 4, iPix += 1) {
    pixels[iPix] = rgb16(rgbaBytes[iRGBA],
                         rgbaBytes[iRGBA + 1],
                         rgbaBytes[iRGBA + 2]);
    if (iPix < 3) {
      console.log(pixels[iPix], rgbaBytes[iRGBA],
                         rgbaBytes[iRGBA + 1],
                         rgbaBytes[iRGBA + 2]);
    }
  }
  console.log('got', pixels, 'from', rgbaBytes);

  return pixels;
}
