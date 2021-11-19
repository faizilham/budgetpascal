/**
 * The closest left (or right) word boundary of the given input at the
 * given offset.
 */
export function closestLeftBoundary(input, offset) {
  const found = wordBoundaries(input, true)
    .reverse()
    .find(x => x < offset);
  return found == null ? 0 : found;
}
export function closestRightBoundary(input, offset) {
  const found = wordBoundaries(input, false).find(x => x > offset);
  return found == null ? input.length : found;
}

/**
 * Convert offset at the given input to col/row location
 *
 * This function is not optimized and practically emulates via brute-force
 * the navigation on the terminal, wrapping when they reach the column width.
 */
export function offsetToColRow(input, offset, maxCols) {
  let row = 0,
    col = 0;

  for (let i = 0; i < offset; ++i) {
    const chr = input.charAt(i);
    if (chr == "\n") {
      col = 0;
      row += 1;
    } else {
      col += 1;
      if (col > maxCols) {
        col = 0;
        row += 1;
      }
    }
  }

  return { row, col };
}

/**
 * Counts the lines in the given input
 */
export function countLines(input, maxCols) {
  return offsetToColRow(input, input.length, maxCols).row + 1;
}
