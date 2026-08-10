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

    let cacheHit = false;
    let apiCalled = false;
    let resultCount = 0;

    // 手順2: course_search_indexキャッシュを確認
    // ヒットすれば courseIds が返る。ミスなら GORA 検索を行う。
    let courseIds = await getFreshCourseSearchIndex(gridKey);
    cacheHit = courseIds !== null;

    if (!courseIds) {
      // キャッシュミス時は検索結果を先に返し、キャッシュ更新は非同期で行う
      apiCalled = true;
      const searchResult = await searchGolfCourses({
        latitude,
        longitude,
        searchRadius,
      });
      const items = Array.isArray(searchResult?.items)
        ? searchResult.items
        : [];
      resultCount = items.length;
      courseIds = items.map((item) => item.golfCourseId);

      if (courseIds.length > 0 && supabaseConfigured) {
        void (async () => {
          try {
            await upsertCourseSearchIndex(gridKey, searchRadius, courseIds);
            const freshCourses = await getFreshGolfCourses(courseIds);
            const freshIds = new Set(
              freshCourses.map((c) => c.golf_course_id)
            );
            const missingIds = courseIds.filter((id) => !freshIds.has(id));

            for (const id of missingIds) {
              const detail = await getGolfCourseDetail(id);
              await upsertGolfCourseFromDetail(detail);
            }
          } catch (cacheError) {
            console.error("async cache update failed", cacheError);
          }
        })();
      }

      return NextResponse.json({
        status: "ok",
        cacheHit: false,
        apiCalled: true,
        resultCount,
        courses: items,
      });
    }

    if (!supabaseConfigured) {
      // Supabase 未構成の場合は cache check ではなく GORA を直接返す
      apiCalled = true;
      const searchResult = await searchGolfCourses({
        latitude,
        longitude,
        searchRadius,
      });
      const items = Array.isArray(searchResult?.items)
        ? searchResult.items
        : [];
      resultCount = items.length;
      return NextResponse.json({
        status: "ok",
        cacheHit: false,
        apiCalled: true,
        resultCount,
        courses: items,
      });
    }

    // course_search_index ヒット時は golf_courses キャッシュを返しつつ、
    // 詳細が欠落していれば非同期で補完する
    const freshCourses = await getFreshGolfCourses(courseIds);
    resultCount = freshCourses.length;
    const freshIds = new Set(freshCourses.map((c) => c.golf_course_id));
    const missingIds = courseIds.filter((id) => !freshIds.has(id));

    if (missingIds.length > 0) {
      void (async () => {
        try {
          for (const id of missingIds) {
            const detail = await getGolfCourseDetail(id);
            await upsertGolfCourseFromDetail(detail);
          }
        } catch (cacheError) {
          console.error("async detail cache update failed", cacheError);
        }
      })();
    }

    return NextResponse.json({
      status: "ok",
      cacheHit: true,
      apiCalled,
      resultCount,
      courses: freshCourses,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
