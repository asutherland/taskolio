const tinycolor = require("tinycolor2");

const EMPTY_RGB = [0, 0, 0];

/**
 * This is the RGB color helper.
 */
class ColorHelper {
  makeRandomColor() {
    let hue = 360 * Math.random();
    let sat = 1.0;

    const color = tinycolor({ h: hue, s: sat, v: 1.0 });
    const { r, g, b } = color.toRgb();

    return {
      hue, sat, rgb: [r, g, b]
    };
  }

  /**
   * Generate a color-bank color over 2 axes: banks, and cells for that bank.
   */
  computeColorBankColor(iBank, nBanks, iCell, nCells) {
    const sat = 1 - (iBank / (nBanks + 1));
    const hue = 360 * (iCell / nCells);

    //console.log('bank', iBank, 'cell', iCell, 'hue', hue, 'sat', sat);

    const color = tinycolor({ h: hue, s: sat, v: 1.0 });
    const { r, g, b } = color.toRgb();

    return {
      hue, sat, rgb: [r, g, b]
    };
  }

  computeEmptyDisplayColor() {
    return EMPTY_RGB;
  }

  /**
   * Compute the actual display values to return, since this is the RGB class,
   * an [r,g,b] tuple is returned.  The indexed variant returns a single index.
   */
  computeBookmarkDisplayColor(wrapped, state, brightnessScale) {
    let brightness;
    switch (state) {
      case 'focused':
        brightness = 1.0;
        break
      case 'visible':
        brightness = 0.8;
        break;
      case 'hidden':
        brightness = 0.5;
        break;
      case 'missing':
        brightness = 0.2;
        break;
      default:
        throw new Error("unknown visibility: " + state);
    }

    brightness *= brightnessScale;

    const color = tinycolor({ h: wrapped.hue, s: wrapped.sat, v: brightness });
    const { r, g, b } = color.toRgb();
    return [r, g, b];
  }

  computeDisplayColor(wrappedColor) {
    return wrappedColor.rgb;
  }
}

module.exports.ColorHelper = new ColorHelper();
