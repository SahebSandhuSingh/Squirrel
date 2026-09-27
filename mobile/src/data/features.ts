/**
 * Features that exist in the UI but are not launched yet. While locked they render as
 * "Coming soon" and every entry point (buttons, routes, state actions) is a no-op.
 * Flip a flag to false at launch.
 */
export const LOCKED = {
  /** Meal + water logging (Create actions, the water/meal daily missions). */
  mealWater: true,
  /** Events: /events, /event/[id], event cards, map event markers, joining. */
  events: true,
} as const;

/** Missions that belong to a locked feature. */
export const LOCKED_MISSIONS = new Set<string>([
  ...(LOCKED.mealWater ? ['m-water', 'm-meal'] : []),
  ...(LOCKED.events ? ['w-event'] : []),
]);

export const COMING_SOON = {
  mealWater: 'Meal & water tracking is coming soon',
  events: 'Events are coming soon',
} as const;
