import "server-only";
import { goraRequest } from "./client";
import type { GoraCourseSearchResponse } from "@/lib/types/gora";

export interface CourseSearchParams {
  latitude?: number;
  longitude?: number;
  searchRadius?: number; // 10〜300km
  keyword?: string;
  sort?: "+distance" | "-distance" | "+rating" | "-rating" | "highway" | "beginner" | string;
  page?: number;
  hits?: number;
}

/**
 * エリア/緯度経度/キーワード検索。cache_design_draft.md 4節の呼び出し順序に従い、
 * course_search_index の grid_key でキャッシュヒットしない場合のみ呼ぶこと。
 */
export async function searchGolfCourses(
  params: CourseSearchParams
): Promise<GoraCourseSearchResponse> {
  return goraRequest<GoraCourseSearchResponse>({
    endpoint: "GoraGolfCourseSearch/20170426",
    withAffiliateId: false, // 検索結果はgolf_coursesにキャッシュするため素のURLで取得
    params: {
      latitude: params.latitude,
      longitude: params.longitude,
      searchRadius: params.searchRadius,
      keyword: params.keyword,
      sort: params.sort,
      page: params.page,
      hits: params.hits,
    },
  });
}
