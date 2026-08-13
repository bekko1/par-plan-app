import "server-only";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { COURSE_SEARCH_INDEX_TTL_MS, isFresh } from "./ttl";

/**
 * 1グリッドあたりの取得上限ページ数。
 * TODO: 都心部等で件数が多いエリアのレイテンシとのトレードオフのため、
 * 実測してから値を調整すること。
 */
export const MAX_PAGES_PER_GRID = 5;

export interface CourseSearchIndexRecord {
  courseIds: number[];
  apiCount?: number | null;
  apiHits?: number | null;
  apiPage?: number | null;
  apiPageCount?: number | null;
  fetchedAt?: string;
  /**
   * 2026年8月追記: course_ids.length が本来の総件数(apiCount)に対して
   * 足りているかどうかの完全性判定。従来はTTLの新鮮さのみで有効判定しており、
   * ページネーション未対応で1ページ目だけキャッシュされたケース(30件/113件)を
   * 検知できなかった不具合の修正。
   *
   * 完全性 = course_ids.length が (本来の総件数 と 取得上限件数 の小さい方)以上。
   * 例: 総件数113件・上限150件(5ページ×30件) → 113件揃っていれば完全。
   *     総件数400件・上限150件 → 150件で頭打ちにするのは仕様(意図的な部分キャッシュ)
   *     なので、150件揃っていれば完全扱いとする。
   */
  isComplete: boolean;
}

export async function getFreshCourseSearchIndex(
  gridKey: string
): Promise<CourseSearchIndexRecord | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("course_search_index")
    .select(
      "course_ids, fetched_at, api_count, api_hits, api_page, api_page_count"
    )
    .eq("grid_key", gridKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (!isFresh(data.fetched_at, COURSE_SEARCH_INDEX_TTL_MS)) return null;

  const courseIds = (data.course_ids ?? []) as number[];
  const apiCount = typeof data.api_count === "number" ? data.api_count : null;
  const apiHits = typeof data.api_hits === "number" ? data.api_hits : null;

  // apiCount未保存の旧データ(このカラムを追加する前にキャッシュされた行)への後方互換。
  // 総件数が不明な場合は「今ある件数がそのまま総件数」とみなし、不当にミス扱いにしない。
  const totalCount = apiCount ?? courseIds.length;
  const perPageHits = apiHits ?? 30;
  const expectedCount = Math.min(totalCount, MAX_PAGES_PER_GRID * perPageHits);
  const isComplete = courseIds.length >= expectedCount;

  return {
    courseIds,
    apiCount,
    apiHits,
    apiPage: typeof data.api_page === "number" ? data.api_page : null,
    apiPageCount:
      typeof data.api_page_count === "number" ? data.api_page_count : null,
    fetchedAt: data.fetched_at ?? undefined,
    isComplete,
  };
}

export async function upsertCourseSearchIndex(
  gridKey: string,
  searchRadius: number,
  courseIds: number[],
  meta?: {
    apiCount?: number | null;
    apiHits?: number | null;
    apiPage?: number | null;
    apiPageCount?: number | null;
  }
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createServerSupabaseClient();
  const payload: any = {
    grid_key: gridKey,
    search_radius: searchRadius,
    course_ids: courseIds,
    fetched_at: new Date().toISOString(),
  };
  if (meta) {
    if (meta.apiCount !== undefined) payload.api_count = meta.apiCount;
    if (meta.apiHits !== undefined) payload.api_hits = meta.apiHits;
    if (meta.apiPage !== undefined) payload.api_page = meta.apiPage;
    if (meta.apiPageCount !== undefined) payload.api_page_count = meta.apiPageCount;
  }

  const { error } = await supabase.from("course_search_index").upsert(payload);
  if (error) throw error;
}
