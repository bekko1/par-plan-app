import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GOLF_COURSES_TTL_MS, isFresh } from "./ttl";
import type { GoraCourseDetailResponse } from "@/lib/types/gora";
import type { Database } from "@/lib/types/database";

type GolfCourseRow = Database["public"]["Tables"]["golf_courses"]["Row"];

/** 渡したIDのうち、キャッシュが新鮮なものだけを返す */
export async function getFreshGolfCourses(
  golfCourseIds: number[]
): Promise<GolfCourseRow[]> {
  if (golfCourseIds.length === 0) return [];

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
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("golf_courses").upsert({
    golf_course_id: detail.golfCourseId,
    golf_course_name: detail.golfCourseName,
    golf_course_abbr: detail.golfCourseAbbr ?? null,
    golf_course_kana: detail.golfCourseKana ?? null,
    address: detail.address ?? null,
    postal_code: detail.postalCode ?? null,
    // 0の場合は未取得扱い。仕様上のリスクへの防御的措置(cache_design_draft.md参照)
    latitude: detail.latitude || null,
    longitude: detail.longitude || null,
    highway: detail.highway ?? null,
    ic: detail.ic ?? null,
    ic_distance: detail.icDistance ?? null,
    course_type: detail.courseType ?? null,
    designer: detail.designer ?? null,
    hole_count: detail.holeCount ?? null,
    par_count: detail.parCount ?? null,
    course_distance: detail.courseDistance ?? null,
    dimension: detail.dimension ?? null,
    evaluation: detail.evaluation ?? null,
    rating_num: detail.ratingNum ?? null,
    image_urls: detail.imageUrls ?? [],
    raw_detail_json: detail,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw error;
}
