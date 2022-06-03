const EMPTY_INDEX = 0;

/**
 * Indexed color helper built around how the Maschine mk3 indexed color
 * implementation works.
 *
 * There are 3 types used here:
 * - "Wrapped" colors.  The internal high level representation of the color.
 *   Methods should end in `Color`.
 * - "Display" colors.  The wrapped color rendered into the actual information
 *   used by the hardware device in question.  Methods should end in
 *   `DisplayColor`.
 * - "RGBHexColors".  HTML/CSS style #RRGGBB hex color representations
 *   in a { border, background } object representation for use in HTML
 *   rendering.  Methods should end in "RGBHexColors".
 *
 * ## Low-Level Color Notes
 *
 * Here's a bunch of stuff I wrote up for my node-traktor-f1 fork about how the
 * colors work.  It's useful to leave there, but I think also useful to have
 * here since I don't really want to tie us to whatever happens in
 * led_indexed.js too tightly/at all.
 *
 * The Maschine mk3 supports a finite indexed set of LED colors.  (Presumably
 * this simplifies things for the drivers, especially on USB bus power.)
 *
 * The NI Controller Editor PDF provides a table that's pretty accurate, noting
 * that the mk3 touch slider dot LEDs and directional encoder dot LEDs cannot do
 * white; they get truncated to be colors.  They may also exist in a somewhat
 * different color-space.

 * For each color, there are 4 variants: "dim", "dim flash", "bright", and
 * "flash".  "Flash" seems to be intended to mean "pressed" and seems to be a
 * whiter, less saturated version of the base color.  That is, the colors don't
 * form a line in any color-space, but rather a square.  This is much more
 * noticable for the dot LEDs than the pad LEDs.  At least in daylight, the
 * "dim flash" color usually looks like it's on a 3-color linear HSV value
 * ramp, although for some colors there's a hint of discoloration in the middle.
 * And the "flash" color looks notably whiter.  With daylight involved, however,
 * it seems like "dim" is too dim and it's better to only use the upper 3 colors
 * which should be largely distinguishable.
 *
 * The 16 colors are roughly hue-spaced.  NI has basically chosen to add "warm
 * yellow", deleting an extra weird green-cyan color.  While I don't really
 * miss the deleted color, the yellows are super hard to visually distinguish
 * compared to the lost color, so it's not much of a win.
 */
const colorTable = [
  'red',
  'orange',
  'light orange',
  'warm yellow', // in hue space this would just be yellow
  'yellow', // in hue space this would be lime
  'lime', // in hue space this would be green
  'green', // in hue space this would be mint
  'mint', // in hue space this would be a greenish-cyan
  'cyan',
  'turquoise',
  'blue',
  'plum',
  'violet',
  'purple',
  'magenta',
  'fuschia'
];
const COLORS_START_OFFSET = 4;
const WHITE_START_OFFSET = 68;
// the white colors come after the actual color, so we can treat it like color
// index 16.
const WHITE_COLOR_INDEX = 16;
const DIM_OFFSET = 0;
const DIM_FLASH_OFFSET = 1;
const BRIGHT_OFFSET = 2;
const BRIGHT_FLASH_OFFSET = 3;

/// Convert a number to a 0-padded 2-digit hexadecimal number.
function hexTwo(num) {
  return num.toString(16).padStart(2, '0');
}
/// Given a {red,green,blue} object, return CSS hex-color representation.
function hexifyRGB({ red, green, blue }) {
  return `#${hexTwo(red)}${hexTwo(green)}${hexTwo(blue)}`;
}

/**
 * Mk3-style indexed color helper.  We store the color as { colorIndex } where
 * colorIndex is a value in the inclusive range [0, 15].
 */
export class IndexedColorHelper {
  static computeColorBankColor(iBank: any, nBanks: number, iCell: any, nCells: number) {
    return { colorIndex: iCell };
  }
  static computeDisplayColor(wrapped: any) {
    if (!wrapped) {
      return null;
    }
    return COLORS_START_OFFSET + wrapped.colorIndex * 4 + BRIGHT_OFFSET;
  }

  public indexed_led_mapping: any;

  constructor() {
    this.indexed_led_mapping = null;
  }

  updateLedMapping(mapping: any) {
    this.indexed_led_mapping = mapping;
  }

  makeRandomColor() {
    return { colorIndex: Math.min(Math.floor(Math.random() * 16), 15) };
  }

  makeWhiteColor() {
    return { colorIndex: WHITE_COLOR_INDEX };
  }

  /**
   * Generate a color-bank color.  For the mk3, we only support 16 colors for
   * now since the mk3 only has 16 base colors (in 3 variations).
   */
  computeColorBankColor(iBank, nBanks, iCell, nCells) {
    return { colorIndex: iCell };
  }

  computeColorBank(numColors) {
    const colors = new Array(numColors);
    for (let i = 0; i < numColors; i++) {
      colors[i] = { colorIndex: i };
    }
    return colors;
  }

  computeEmptyDisplayColor() {
    return EMPTY_INDEX;
  }

  /**
   * Given a color, produce a #RRGGBB representation of the color for border
   * and background purposes.  This is intended to be displayed on the device's
   * LCD/whatever display, so may be biased and not what makes mose sense on a
   * high quality monitor, etc.
   */
  computeBookmarkRGBHexColors(wrapped) {
    if (this.indexed_led_mapping == null) {
      throw new Error('indexed_led_mapping not initialized!');
    }

    const idxBorder = this.computeBookmarkDisplayColor(wrapped, 'visible');
    const idxBackground = this.computeBookmarkDisplayColor(wrapped, 'hidden');

    return {
      border: hexifyRGB(this.indexed_led_mapping[idxBorder]),
      background: hexifyRGB(this.indexed_led_mapping[idxBackground]),
    };
  }

  /**
   * Compute the actual display values to return, since this is the RGB class,
   * an [r,g,b] tuple is returned.  The indexed variant returns a single index.
   */
  computeBookmarkDisplayColor(wrapped, state, brightnessScale=undefined) {
    if (!wrapped) {
      return null;
    }

    let brightness;
    switch (state) {
      case 'focused':
        brightness = BRIGHT_FLASH_OFFSET;
        break
      case 'visible':
        brightness = BRIGHT_OFFSET;
        break;
      case 'hidden':
        brightness = DIM_FLASH_OFFSET;
        break;
      case 'missing':
        brightness = DIM_OFFSET;
        break;
      default:
        throw new Error("unknown visibility: " + state);
    }

    return COLORS_START_OFFSET + wrapped.colorIndex * 4 + brightness;
  }

  computeDisplayColor(wrapped) {
    if (!wrapped) {
      return null;
    }
    return COLORS_START_OFFSET + wrapped.colorIndex * 4 + BRIGHT_OFFSET;
  }


  /**
   * Given a wrapped color, compute the correct index color to tell the web
   * extension.  This is mapped to a CSS class name that in turn matches a
   * selector populated by a copied-and-pasted version of the table in
   * maschine_mk3_config.json in our fork of node-traktor-f1.
   *
   * Since our palette is really just 16 colors (plus black/no color),
   * the right thing to do is likely to hand curate a list of 16 appropriate
   * RGB color values that match whatever TST theme is in use and just directly
   * pass this value through.  But for now, just like for the HTML screen
   * displays, we use the provided RGB value and their multiple brightness
   * levels in a sketchy hack where we dodge needing to test our aesthetic
   * skills.
   */
  computeTabColor(wrapped) {
    if (!wrapped) {
      return null;
    }
    return COLORS_START_OFFSET + wrapped.colorIndex * 4 + DIM_FLASH_OFFSET;
  }


  computeRGBHexColors(wrapped) {
    return this.computeBookmarkRGBHexColors(wrapped);
  }
}
