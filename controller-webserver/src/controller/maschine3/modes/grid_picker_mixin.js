"use strict";

const { html } = require('@popeindustries/lit-html-server');

/**
 * Mixin where the subclass provides a computeCellInfo method that is used to
 * display a 4x4 grid across the two screens where each cell corresponds to a
 * pad button.  The picker completes by having one of the pad buttons pressed or
 * the subclassing mode invoking `abortPick` via a custom button handler.
 */
class GridPickerMixin {

}
