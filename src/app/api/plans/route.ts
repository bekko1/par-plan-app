import { NextRequest, NextResponse } from "next/server";
import { getFreshPlans, upsertPlans } from "@/lib/db/golfPlansDailyRepo";
import { searchPlans } from "@/lib/rakuten/planSearch";

/**
 * cache_design_draft.md 4節 手順4。未キャッシュ/TTL切れのIDのみ最大30件ずつ
 * まとめてGoraPlanSearchに渡す。
 *
 * GET /api/plans?courseIds=101,102,103&playDate=2026-09-01
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const courseIdsParam = searchParams.get("courseIds");
  const playDate = searchParams.get("playDate");

  if (!courseIdsParam || !playDate) {
    return NextResponse.json(
      { status: "error", message: "courseIds and playDate are required" },
      { status: 400 }
    );
  }

  const golfCourseIds = courseIdsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));

  try {
    const freshRows = await getFreshPlans(golfCourseIds, playDate);
    const freshIds = new Set(freshRows.map((r) => r.golf_course_id));
    const missingIds = golfCourseIds.filter((id) => !freshIds.has(id));

    if (missingIds.length > 0) {
      const result = await searchPlans({ golfCourseIds: missingIds, playDate });
      await upsertPlans(result.results);
    }

    const finalRows =
      missingIds.length === 0 ? freshRows : await getFreshPlans(golfCourseIds, playDate);

    return NextResponse.json({ status: "ok", plans: finalRows });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
