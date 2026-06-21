import type { WalkGrid } from "../walkGrid";

/**
 * Walk mask for Warren Buffett's Omaha office (24×24, aligned to room square).
 * 1 = red carpet / open floor, 0 = walls, desk, recliner, shelves, TV stand.
 *
 * Viewed top-to-bottom (row 0 = top of room image):
 *   - Upper rows: walls + chalkboard
 *   - Center-back block: rolltop desk
 *   - Left block: leather recliner
 *   - Right block: CRT / side table
 *   - Lower middle: main walkable carpet
 */
export const WARREN_BUFFETT_WALK_GRID: WalkGrid = {
  width: 24,
  height: 24,
  rows: [
    "000000000000000000000000",
    "000000000000000000000000",
    "000000000111100000000000",
    "000000001111110000000000",
    "000000011111111000000000",
    "000000111111111100000000",
    "000001111111111110000000",
    "000011111000011111100000",
    "000111111000001111110000",
    "001111110000000111111000",
    "001111110000000111111000",
    "001111100000000011111000",
    "001111100000000011111000",
    "000111111111111111110000",
    "000011111111111111100000",
    "000001111111111111000000",
    "000000111111111110000000",
    "000000011111111100000000",
    "000000001111111000000000",
    "000000000111110000000000",
    "000000000001100000000000",
    "000000000000000000000000",
    "000000000000000000000000",
    "000000000000000000000000",
  ],
};
