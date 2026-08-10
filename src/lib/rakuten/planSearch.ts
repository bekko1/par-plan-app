import "server-only";
import { goraRequest } from "./client";
import type { GoraPlanSearchResponse } from "@/lib/types/gora";

const MAX_COURSE_IDS_PER_REQUEST = 30; // 公式ドキュメント: golfCourseIdはカンマ区切りで最大30件

export interface PlanSearchParams {
  golfCourseIds: number[];
  /** GoraPlanSearchは1リクエスト1日分のみ(playDateは単一のYYYY-MM-DD) */
  playDate: string;
  sort?: string;
}

/**
 * golfCourseId をカンマ区切りで最大30件までまとめて渡せる。
 * それを超える場合はここで分割して複数リクエストにする(いずれもレート制御キューを通る)。
 */
export async function searchPlans(
  { golfCourseIds, playDate, sort }: PlanSearchParams,
  withAffiliateId = false
): Promise<GoraPlanSearchResponse> {
  if (golfCourseIds.length === 0) {
    return { items: [], count: 0, page: 1, pageCount: 0, hits: 0 };
  }

  const chunks: number[][] = [];
  for (let i = 0; i < golfCourseIds.length; i += MAX_COURSE_IDS_PER_REQUEST) {
    chunks.push(golfCourseIds.slice(i, i + MAX_COURSE_IDS_PER_REQUEST));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      goraRequest<GoraPlanSearchResponse>({
        api: "GoraPlanSearch",
        withAffiliateId,
        params: {
          golfCourseId: chunk.join(","),
          playDate,
          sort,
        },
      })
    )
  );

  const merged = responses.flatMap((r) => r.items);
  return {
    items: merged,
    count: merged.length,
    page: 1,
    pageCount: 1,
    hits: merged.length,
  };
}
