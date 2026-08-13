import "server-only";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { GOLF_COURSES_TTL_MS, isFresh } from "./ttl";
import type { GoraCourseDetailResponse } from "@/lib/types/gora";
import type { Database } from "@/lib/types/database";
import type { GoraCourseSearchItem } from "@/lib/types/gora";

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
    detail_fetched_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * GoraGolfCourseSearchの結果(軽量情報)から、golf_coursesへ即座にupsertする。
 * Detail由来のフィールド(course_type/hole_count/dimension等)には触れない
 * (既存の値があれば保持、新規行ならnullのまま)ので、後からDetailが来た時に
 * 上書きされる想定。detail_fetched_atはここでは設定しない
 * (Search由来だけの行だと分かるようにするため)。
 *
 * cache_design_draft.md 2.1節の「CourseSearch + CourseDetailの結果をマージして
 * 保持」という設計を維持しつつ、書き込みタイミングを2段階に分けたもの
 * (2026年8月、Detail全件先読みがVercelの実行時間上限に収まらない問題への対応)。
 */
export async function upsertGolfCoursesFromSearchItems(
  items: GoraCourseSearchItem[]
): Promise<void> {
  if (items.length === 0) return;
 
  const supabase = createServerSupabaseClient();
  const rows = items.map((item) => ({
    golf_course_id: item.golfCourseId,
    golf_course_name: item.golfCourseName,
    golf_course_abbr: item.golfCourseAbbr ?? null,
    golf_course_kana: item.golfCourseNameKana ?? null,
    address: item.address ?? null,
    latitude: item.latitude || null,
    longitude: item.longitude || null,
    highway: item.highway ?? null,
    evaluation: item.evaluation ?? null,
    // Search結果には画像が1枚しかない(Detailは5枚)。暫定的にこの1枚を入れておく
    image_urls: item.golfCourseImageUrl ? [item.golfCourseImageUrl] : [],
    fetched_at: new Date().toISOString(),
    // course_type/hole_count/dimension等のDetail限定フィールド、detail_fetched_at には
    // 触れない(upsertでは指定しなかったフィールドは列に応じてSupabase側の挙動に注意。
    // 下記の onConflict 設定と合わせて、既存行の当該フィールドを上書きしないようにする)
  }));
 
  // 重要: ignoreDuplicates: false かつ 該当フィールドを部分的にしか渡さない場合、
  // Supabaseのupsertは「渡さなかった列」をNULLで上書きしてしまう可能性があるため、
  // 既にDetail取得済み(detail_fetched_at が入っている)行に対しては
  // このSearch由来の軽量upsertでは触らないよう、事前に対象を絞り込む方が安全。
  const { data: existing } = await supabase
    .from("golf_courses")
    .select("golf_course_id, detail_fetched_at")
    .in(
      "golf_course_id",
      items.map((i) => i.golfCourseId)
    );
 
  const alreadyDetailed = new Set(
    (existing ?? [])
      .filter((row) => row.detail_fetched_at !== null)
      .map((row) => row.golf_course_id)
  );
 
  const rowsToUpsert = rows.filter((r) => !alreadyDetailed.has(r.golf_course_id));
  if (rowsToUpsert.length === 0) return;
 
  const { error } = await supabase.from("golf_courses").upsert(rowsToUpsert);
  if (error) throw error;
}
