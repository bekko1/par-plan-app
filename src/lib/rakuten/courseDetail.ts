import "server-only";
import { goraRequest } from "./client";
import type { GoraCourseDetailResponse } from "@/lib/types/gora";

/**
 * コース詳細取得。バッチ不可のAPIのため、未キャッシュ/TTL切れのIDを個別に呼ぶ
 * (cache_design_draft.md 4節 手順3)。
 */
export async function getGolfCourseDetail(
  golfCourseId: number,
  carrier: 0 | 1 = 0,
  withAffiliateId = false
): Promise<GoraCourseDetailResponse> {
  return goraRequest<GoraCourseDetailResponse>({
    api: "GoraGolfCourseDetail",
    withAffiliateId,
    params: { golfCourseId, carrier },
  });
}
