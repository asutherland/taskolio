import tinycolor from "tinycolor2";

const EMPTY_RGB = [0, 0, 0];

/**
 * This is the RGB color helper.
 */
export class RGBColorHelper {
  makeRandomColor() {
    let hue = 360 * Math.random();
    let sat = 1.0;

    const color = tinycolor({ h: hue, s: sat, v: 1.0 });
    const { r, g, b } = color.toRgb();

    return {
      hue, sat, rgb: [r, g, b]
    };
  }

  // XXX From the comments in the indexed helper it seems like this was already
  // a hack; this should be revisited.
  computeTabColor(wrapped) {
    if (!wrapped) {
      return null;
    }
    return 5;
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
    if (!wrapped) {
      return EMPTY_RGB;
    }

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
    if (!wrappedColor) {
      return EMPTY_RGB;
    }

    return wrappedColor.rgb;
  }
}
