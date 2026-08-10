import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { planSearchTtlMs, isFresh } from "./ttl";
import type { GoraPlanSearchGolfCourse, GoraStockStatus } from "@/lib/types/gora";
import type { Database } from "@/lib/types/database";

type PlanRow = Database["public"]["Tables"]["golf_plans_daily"]["Row"];

export async function getFreshPlans(
  golfCourseIds: number[],
  playDate: string
): Promise<PlanRow[]> {
  if (golfCourseIds.length === 0) return [];

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("golf_plans_daily")
    .select("*")
    .in("golf_course_id", golfCourseIds)
    .eq("play_date", playDate);

  if (error) throw error;

  const ttlMs = planSearchTtlMs(playDate);
  return (data ?? []).filter((row) => isFresh(row.fetched_at, ttlMs));
}

/** GoraPlanSearchのレスポンス(1コース分)をgolf_plans_dailyの1行に変換する */
export function toPlanRow(
  course: GoraPlanSearchGolfCourse,
  playDate: string
): Omit<PlanRow, "fetched_at"> & { fetched_at?: string } {
  // 同一コース・同一プレー日の在庫情報は複数プラン(planInfo)に跨るため、
  // plans列にはplanInfo全体を、stock_status/stock_countは代表値(最初に見つかった
  // 該当プレー日のcalInfo)を入れる。詳細な在庫はplans jsonbの中を見れば追える。
  const allStocks = course.planInfo.flatMap((plan) =>
    plan.calInfo
      .filter((stock) => stock.playDate === playDate)
      .map((stock) => ({ plan, stock }))
  );
  const representative = allStocks[0];

  return {
    golf_course_id: course.golfCourseId,
    play_date: playDate,
    plans: course.planInfo as unknown as unknown[],
    stock_status: representative?.stock.stockStatus ?? null,
    stock_count: representative?.stock.stockCount ?? null,
    reserve_url_pc_base: representative?.stock.reservePageUrlPC ?? null,
  };
}

export async function upsertPlans(
  courses: GoraPlanSearchGolfCourse[],
  playDate: string
): Promise<void> {
  if (courses.length === 0) return;

  const supabase = createServerSupabaseClient();
  const rows = courses.map((course) => ({
    ...toPlanRow(course, playDate),
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("golf_plans_daily").upsert(rows);
  if (error) throw error;
}

/**
 * 成果報酬対象外の可能性が高いプランを除外するフィルタ。
 * 公式ドキュメント(2026年8月確認)でstockStatusの意味が確定した:
 *   1: 空き有り／リクエスト予約可   2: 空き有り／リクエスト予約不可
 *   3: 在庫有り お得プラン         4: 在庫有り GORA限定プラン
 *   5: リクエスト予約のみ          6: キャンセル待ち
 *
 * 楽天アフィリエイト規約(3)により「リクエスト予約」は成果報酬対象外
 * (issues.md「楽天アフィリエイトGORA料率区分の確認」参照)。
 * stockStatus=5(リクエスト予約のみ)はこれに直接該当するため除外する。
 *
 * stockStatus=1(空き有り／リクエスト予約可)は即予約とリクエスト予約が
 * 混在するステータスの可能性があり、現時点では「除外しない」側に倒しているが、
 * 事務局への正式確認が完了したら見直すこと(issues.md参照、未解決のまま)。
 */
const EXCLUDED_STOCK_STATUSES: GoraStockStatus[] = [5];

export function isLikelyCommissionEligible(row: PlanRow): boolean {
  if (row.stock_status === null) return true; // 不明な場合は除外しない(要目視確認)
  return !EXCLUDED_STOCK_STATUSES.includes(row.stock_status as GoraStockStatus);
}
