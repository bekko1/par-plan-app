import "server-only";
import { goraRequest } from "./client";
import type { GoraCourseSearchResponse } from "@/lib/types/gora";

export interface CourseSearchParams {
  latitude?: number;
  longitude?: number;
  areaCode?: number;
  keyword?: string;
  searchRadius?: number; // 10〜300km、緯度経度指定時のみ有効。デフォルト150
  sort?: string; // rating/50on/prefecture/highway/reservation/evaluation等
  page?: number;
  hits?: number; // 1〜30
  /** PC:0 mobile:1。表示直前にアフィリエイトURLを取得する際は利用端末に合わせて指定する */
  carrier?: 0 | 1;
}

function normalizeCourseSearchResponse(
  raw: unknown
): GoraCourseSearchResponse {
  const anyRaw = raw as Record<string, unknown>;
  const items = Array.isArray(anyRaw.items)
    ? anyRaw.items
    : Array.isArray(anyRaw.Items)
    ? anyRaw.Items
    : [];

  return {
    items: items as GoraCourseSearchResponse["items"],
    count: typeof anyRaw.count === "number" ? anyRaw.count : 0,
    page: typeof anyRaw.page === "number" ? anyRaw.page : 0,
    pageCount: typeof anyRaw.pageCount === "number" ? anyRaw.pageCount : 0,
    hits: typeof anyRaw.hits === "number" ? anyRaw.hits : 0,
    carrier: typeof anyRaw.carrier === "number" ? anyRaw.carrier : undefined,
  };
}

/**
 * エリア/緯度経度/キーワード検索。cache_design_draft.md 4節の呼び出し順序に従い、
 * course_search_index の grid_key でキャッシュヒットしない場合のみ呼ぶこと。
 */
export async function searchGolfCourses(
  params: CourseSearchParams,
  withAffiliateId = false
): Promise<GoraCourseSearchResponse> {
  const rawResponse = await goraRequest<unknown>({
    api: "GoraGolfCourseSearch",
    withAffiliateId,
    params: {
      latitude: params.latitude,
      longitude: params.longitude,
      areaCode: params.areaCode,
      keyword: params.keyword,
      searchRadius: params.searchRadius,
      sort: params.sort,
      page: params.page,
      hits: params.hits,
      carrier: params.carrier,
    },
  });

  return normalizeCourseSearchResponse(rawResponse);
}
