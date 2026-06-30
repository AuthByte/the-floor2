export const FLOOR_TOUR_STORAGE_KEY = "floor.tour.v1.done";

export type FloorTourPlacement = "top" | "bottom" | "left" | "right" | "center";

export type FloorTourStep = {
  id: string;
  title: string;
  body: string;
  /** CSS selector, usually `[data-tour="…"]`. Omit for centered modal steps. */
  target?: string;
  placement?: FloorTourPlacement;
};

export const FLOOR_TOUR_STEPS: FloorTourStep[] = [
  {
    id: "welcome",
    title: "Welcome to the floor",
    body: "This quick tour spotlights the desk — tickers, committee, live wire, and post-shift tools. Use arrow keys or the buttons below. Press Esc to skip.",
    placement: "center",
  },
  {
    id: "console",
    title: "Start a shift",
    body: "Pick tickers and model, set capital, then hit Start shift. Manage watchlists from the console presets.",
    target: '[data-tour="control-console"]',
    placement: "bottom",
  },
  {
    id: "roster",
    title: "Build your committee",
    body: "Open the roster dock to enable legend desks, data feeds, and specialists. You need at least one analyst before the floor runs.",
    target: '[data-tour="agent-roster"]',
    placement: "top",
  },
  {
    id: "floor",
    title: "The pixel floor",
    body: "Each room is an agent desk. Click a room for thesis, charts, and artifacts. Debate theater opens automatically when the committee argues.",
    target: '[data-tour="floor-map"]',
    placement: "right",
  },
  {
    id: "wire",
    title: "Live wire",
    body: "Tail the shift in real time. Press / to search the wire and click a line to pan the floor to that desk.",
    target: '[data-tour="wire-log"]',
    placement: "left",
  },
  {
    id: "toolbar",
    title: "Desk tools",
    body: "Ledger archives past shifts. Backtest runs history without a live shift. After clock-out: memo, replay, shadow bench, and weather unlock here.",
    target: '[data-tour="system-bar-tools"]',
    placement: "bottom",
  },
  {
    id: "feed",
    title: "Floor & feed",
    body: "Switch to the social feed for member posts, forks, and replays. Publish memos from the boss terminal to share a shift.",
    target: '[data-tour="view-toggle"]',
    placement: "bottom",
  },
  {
    id: "during-shift",
    title: "While the shift runs",
    body: "Use the consult bar (@Agent …) to steer a thesis mid-shift. Press Shift+S or Shelf to park a run and start another — up to 2 on the shelf tray.",
    placement: "center",
  },
  {
    id: "shortcuts",
    title: "Shortcuts & guide",
    body: "Press ? anytime for the full keyboard map and feature index. You can restart this tour from there too.",
    target: '[data-tour="shortcuts-btn"]',
    placement: "bottom",
  },
  {
    id: "done",
    title: "You are on the desk",
    body: "Run your first shift when ready. The tour will not auto-play again — reopen it from the toolbar or the ? panel.",
    placement: "center",
  },
];

export function hasCompletedFloorTour(): boolean {
  try {
    return localStorage.getItem(FLOOR_TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFloorTourCompleted(): void {
  try {
    localStorage.setItem(FLOOR_TOUR_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}
