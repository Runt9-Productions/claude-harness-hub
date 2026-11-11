const visibleIntervalMs = 2000;
const hiddenIntervalMs = 30_000;

/** The wait before the next snapshot request; Chrome does not slow this loop in a hidden tab, so the hub does. */
export function pollInterval(isPageHidden: boolean): number {
  return isPageHidden ? hiddenIntervalMs : visibleIntervalMs;
}
