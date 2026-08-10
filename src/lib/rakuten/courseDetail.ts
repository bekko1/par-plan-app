import "server-only";
import { goraRequest } from "./client";
import type { GoraCourseDetailResponse } from "@/lib/types/gora";

/**
 * コース詳細取得。バッチ不可のAPIのため、未キャッシュ/TTL切れのIDを個別に呼ぶ
 * (cache_design_draft.md 4節 手順3)。
 */
export async function getGolfCourseDetail(
  golfCourseId: number
): Promise<GoraCourseDetailResponse> {
  return goraRequest<GoraCourseDetailResponse>({
    endpoint: "GoraGolfCourseDetail/20170426",
    withAffiliateId: false, // golf_coursesにキャッシュするため素のURLで取得
    params: { golfCourseId },
  });
}
