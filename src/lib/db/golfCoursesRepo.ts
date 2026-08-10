import "server-only";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { GOLF_COURSES_TTL_MS, isFresh } from "./ttl";
import type { GoraCourseDetailResponse } from "@/lib/types/gora";
import type { Database } from "@/lib/types/database";

type GolfCourseRow = Database["public"]["Tables"]["golf_courses"]["Row"];

/** 渡したIDのうち、キャッシュが新鮮なものだけを返す */
export async function getFreshGolfCourses(
  golfCourseIds: number[]
): Promise<GolfCourseRow[]> {
  if (golfCourseIds.length === 0) return [];
  if (!isSupabaseConfigured()) return [];

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("golf_courses")
    .select("*")
    .in("golf_course_id", golfCourseIds);

  if (error) throw error;
  return (data ?? []).filter((row) => isFresh(row.fetched_at, GOLF_COURSES_TTL_MS));
}

/** GoraGolfCourseDetailのレスポンスをgolf_coursesの行に変換してupsertする */
export async function upsertGolfCourseFromDetail(
  detail: GoraCourseDetailResponse
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createServerSupabaseClient();

  // 公式ドキュメント: 画像URLは配列ではなくgolfCourseImageUrl1〜5の5個の個別フィールド
  // GORA のレスポンスが { Item: { ... } } の形で返るケースに対応
  const payload: any = (detail as any).Item ? (detail as any).Item : detail;

  // 公式ドキュメント: 画像URLは配列ではなくgolfCourseImageUrl1〜5の5個の個別フィールド
  const imageUrls = [
    payload.golfCourseImageUrl1,
    payload.golfCourseImageUrl2,
    payload.golfCourseImageUrl3,
    payload.golfCourseImageUrl4,
    payload.golfCourseImageUrl5,
  ].filter((url): url is string => Boolean(url));

  // defensive: ensure golfCourseId exists and is a number (API may return string)
  const rawId = payload.golfCourseId ?? (payload.golfCourseId === 0 ? 0 : undefined);
  const golfCourseId = typeof rawId === "string" ? Number(rawId) : rawId;
  if ((golfCourseId === undefined || golfCourseId === null) && golfCourseId !== 0) {
    throw new Error("GORA detail response missing golfCourseId: " + JSON.stringify(detail));
  }

  const { error } = await supabase.from("golf_courses").upsert({
    golf_course_id: golfCourseId,
    golf_course_name: payload.golfCourseName,
    golf_course_abbr: payload.golfCourseAbbr ?? null,
    golf_course_kana: payload.golfCourseNameKana ?? null,
    address: payload.address ?? null,
    postal_code: payload.postalCode ?? null,
    // 0の場合は未取得扱い。仕様上のリスクへの防御的措置(cache_design_draft.md参照)
    latitude: payload.latitude || null,
    longitude: payload.longitude || null,
    highway: payload.highway ?? null,
    ic: payload.ic ?? null,
    ic_distance: payload.icDistance ?? null,
    course_type: payload.courseType ?? null,
    designer: payload.designer ?? null,
    hole_count: payload.holeCount ?? null,
    par_count: payload.parCount ?? null,
    course_distance: payload.courseDistance ?? null,
    dimension: payload.dimension ?? null,
    evaluation: payload.evaluation ?? null,
    rating_num: payload.ratingNum ?? null,
    image_urls: imageUrls,
    raw_detail_json: detail,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw error;
}
