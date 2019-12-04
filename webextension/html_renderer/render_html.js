/**
 * See README.md for context.
 **/

window.LOG_HTML = false;

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

function toRGB16({ width, height, rgbaBytes }) {
  // create the array to hold the 16-bit values (represented as 16-bit numbers,
  // not 8-bit.)
  const pixCount = width * height;
  const pixels = new Array(pixCount);

  for (let iRGBA = 0, iPix = 0; iPix < pixCount; iRGBA += 4, iPix += 1) {
    pixels[iPix] = rgb16(rgbaBytes[iRGBA],
                         rgbaBytes[iRGBA + 1],
                         rgbaBytes[iRGBA + 2]);
  }

  return pixels;
}

/**
 * We're just dropping the alpha byte.
 */
function toRGB({ width, height, rgbaBytes }) {
  const pixCount = width * height;
  const pixels = new Array(pixCount * 3);

  for (let iRGBA = 0, iPix = 0; iPix < pixels.length; iRGBA += 4, iPix += 3) {
    pixels[iPix] = rgbaBytes[iRGBA];
    pixels[iPix + 1] = rgbaBytes[iRGBA + 1];
    pixels[iPix + 2] = rgbaBytes[iRGBA + 2];
  }

  return pixels;
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
export async function renderHTMLAndConvert({ width, height, convertFunc, sandboxedIframe, htmlStr }) {
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
<foreignObject width="${width}" height="${height}">
${htmlStr}
</foreignObject>
</svg>`;

  const loadedPromise = new Promise((resolve) => {
    img.onload = resolve;
  });
  img.src = 'data:image/svg+xml,' + encodeURIComponent(svgStr);
  if (window.LOG_HTML) {
    console.log('rendering', { width, height })
    console.log(img.src);
  }
  await loadedPromise;

  ctx.drawImage(img, 0, 0);

  // get the RGBA bytes backing the image
  const rgbaBytes = ctx.getImageData(0, 0, width, height).data;
  return convertFunc({ width, height, rgbaBytes })
}

export function renderHTML({ width, height, mode, sandboxedIframe, htmlStr }) {
  let convertFunc;
  switch (mode) {
    case 'rgb16':
      convertFunc = toRGB16;
      break;

    case 'rgb':
      convertFunc = toRGB;
      break;

    default:
      throw new Error('not a legit mode');
  }

  return renderHTMLAndConvert({
    width, height, convertFunc, sandboxedIframe, htmlStr });
}
