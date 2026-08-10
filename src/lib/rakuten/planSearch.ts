import "server-only";
import { goraRequest } from "./client";
import type { GoraPlanSearchResponse } from "@/lib/types/gora";

const MAX_COURSE_IDS_PER_REQUEST = 30;

export interface PlanSearchParams {
  golfCourseIds: number[];
  /** GoraPlanSearchは1リクエスト1日分のみ(cache_design_draft.md 1節) */
  playDate: string; // YYYY-MM-DD
}

/**
 * golfCourseId をカンマ区切りで最大30件までまとめて渡せる。
 * それを超える場合はここで分割して複数リクエストにする(いずれもレート制御キューを通る)。
 */
export async function searchPlans({
  golfCourseIds,
  playDate,
}: PlanSearchParams): Promise<GoraPlanSearchResponse> {
  if (golfCourseIds.length === 0) {
    return { results: [] };
  }

  const chunks: number[][] = [];
  for (let i = 0; i < golfCourseIds.length; i += MAX_COURSE_IDS_PER_REQUEST) {
    chunks.push(golfCourseIds.slice(i, i + MAX_COURSE_IDS_PER_REQUEST));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      goraRequest<GoraPlanSearchResponse>({
        endpoint: "GoraPlanSearch/20170426",
        withAffiliateId: false, // golf_plans_dailyにキャッシュするため素のURLで取得
        params: {
          golfCourseId: chunk.join(","),
          playDate,
        },
      })
    )
  );

  return { results: responses.flatMap((r) => r.results) };
}
