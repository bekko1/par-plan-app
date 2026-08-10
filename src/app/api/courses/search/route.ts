import { NextRequest, NextResponse } from "next/server";
import { buildGridKey } from "@/lib/db/gridKey";
import {
  getFreshCourseSearchIndex,
  upsertCourseSearchIndex,
} from "@/lib/db/courseSearchIndexRepo";
import { getFreshGolfCourses, upsertGolfCourseFromDetail } from "@/lib/db/golfCoursesRepo";
import { searchGolfCourses } from "@/lib/rakuten/courseSearch";
import { getGolfCourseDetail } from "@/lib/rakuten/courseDetail";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * cache_design_draft.md 4節「API呼び出し順序とバッチ化」の手順2〜3を実装したもの。
 * 手順4(GoraPlanSearch)は別ルート(/api/plans)で行う想定。
 *
 * GET /api/courses/search?lat=35.6&lon=139.7&radius=30
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latitude = Number(searchParams.get("lat"));
  const longitude = Number(searchParams.get("lon"));
  const searchRadius = Number(searchParams.get("radius") ?? "30");

  if (!latitude || !longitude) {
    return NextResponse.json(
      { status: "error", message: "lat/lon is required" },
      { status: 400 }
    );
  }

  // GORA API 要求: searchRadius は 10 より大きい必要がある
  if (Number.isNaN(searchRadius) || searchRadius <= 10) {
    return NextResponse.json(
      { status: "error", message: "radius must be over 10" },
      { status: 400 }
    );
  }

  try {
    const gridKey = buildGridKey(latitude, longitude, searchRadius);
    const supabaseConfigured = isSupabaseConfigured();

    // 手順2: course_search_indexキャッシュを確認
    let courseIds = await getFreshCourseSearchIndex(gridKey);
    let searchResult: Awaited<ReturnType<typeof searchGolfCourses>> | null = null;

    if (!courseIds) {
      searchResult = await searchGolfCourses({
        latitude,
        longitude,
        searchRadius,
      });
      const items = Array.isArray(searchResult?.items)
        ? searchResult.items
        : [];
      courseIds = items.map((item) => item.golfCourseId);
      if (courseIds.length > 0 && supabaseConfigured) {
        await upsertCourseSearchIndex(gridKey, searchRadius, courseIds);
      }
    }

    if (!supabaseConfigured) {
      if (!searchResult) {
        searchResult = await searchGolfCourses({
          latitude,
          longitude,
          searchRadius,
        });
      }
      return NextResponse.json({
        status: "ok",
        courses: searchResult.items ?? [],
      });
    }

    // 手順3: golf_coursesキャッシュを確認し、未キャッシュ/TTL切れのみ個別取得(バッチ不可API)
    const freshCourses = await getFreshGolfCourses(courseIds);
    const freshIds = new Set(freshCourses.map((c) => c.golf_course_id));
    const missingIds = courseIds.filter((id) => !freshIds.has(id));

    // NOTE: 骨組み段階のため逐次実行。本実装ではPromise.allSettled + 同時実行数制限
    // (レート制御キューが1秒間隔で吸収するので直列でも大きな問題はないが、
    // 件数が多い場合はUXのためタイムアウト/バックグラウンド更新を検討する)
    for (const id of missingIds) {
      const detail = await getGolfCourseDetail(id);
      await upsertGolfCourseFromDetail(detail);
    }

    const finalCourses =
      missingIds.length === 0
        ? freshCourses
        : await getFreshGolfCourses(courseIds);

    return NextResponse.json({ status: "ok", courses: finalCourses });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
