import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { planSearchTtlMs, isFresh } from "./ttl";
import type { GoraPlanSearchDayResult } from "@/lib/types/gora";
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

export async function upsertPlans(
  results: GoraPlanSearchDayResult[]
): Promise<void> {
  if (results.length === 0) return;

  const supabase = createServerSupabaseClient();
  const rows = results.map((r) => ({
    golf_course_id: r.golfCourseId,
    play_date: r.playDate,
    plans: r.plans,
    stock_status: r.stockStatus,
    stock_count: r.stockCount ?? null,
    // affiliateId無しの素のURL。表示直前にsrc/lib/rakuten/affiliate.tsで組み立てる
    reserve_url_pc_base: r.reserveUrl ?? null,
    fetched_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("golf_plans_daily").upsert(rows);
  if (error) throw error;
}

/**
 * 成果報酬対象外の可能性が高いプランを除外するフィルタ。
 * 現時点ではstockStatusの正確な意味が未確定(issues.md「楽天アフィリエイトGORA料率区分の確認」参照)。
 * TODO: 事務局への確認結果が出たら、対象外となる具体的なstockStatus値をここに反映する。
 */
export function isLikelyCommissionEligible(_row: PlanRow): boolean {
  // 現状は全件trueで返す(要確認が完了するまでUI側で「要確認」表示にする方が安全)
  return true;
}
