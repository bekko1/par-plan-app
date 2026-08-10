/**
 * cache_design_draft.md のTTL方針をコード化したもの。
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const GOLF_COURSES_TTL_MS = 7 * DAY_MS;
export const COURSE_SEARCH_INDEX_TTL_MS = 48 * HOUR_MS;

/** golf_plans_dailyのTTLはプレー日までの残り日数で可変(cache_design_draft.md 3節) */
export function planSearchTtlMs(playDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${playDate}T00:00:00`);
  const daysUntil = Math.floor((target.getTime() - today.getTime()) / DAY_MS);

  if (daysUntil >= 8) return 24 * HOUR_MS;
  if (daysUntil >= 2) return 6 * HOUR_MS;
  return 1 * HOUR_MS; // 当日〜翌日
}

export function isFresh(fetchedAt: string, ttlMs: number): boolean {
  const fetchedTime = new Date(fetchedAt).getTime();
  return Date.now() - fetchedTime < ttlMs;
}
