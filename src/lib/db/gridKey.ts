/**
 * cache_design_draft.md 2.2節: 緯度経度を0.05度単位(約5km四方)に丸めた
 * グリッドキーを生成する。近い出発地からの検索は同じキーを使い回すことで
 * course_search_index のキャッシュヒット率を上げる。
 */
const GRID_STEP = 0.05;

export function buildGridKey(
  latitude: number,
  longitude: number,
  searchRadius: number
): string {
  const roundedLat = (Math.round(latitude / GRID_STEP) * GRID_STEP).toFixed(2);
  const roundedLon = (Math.round(longitude / GRID_STEP) * GRID_STEP).toFixed(2);
  return `${roundedLat}_${roundedLon}_r${searchRadius}`;
}
