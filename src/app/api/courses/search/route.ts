import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { buildGridKey } from "@/lib/db/gridKey";
import {
  getFreshCourseSearchIndex,
  upsertCourseSearchIndex,
  MAX_PAGES_PER_GRID,
} from "@/lib/db/courseSearchIndexRepo";
import { getFreshGolfCourses, upsertGolfCourseFromDetail } from "@/lib/db/golfCoursesRepo";
import { searchGolfCourses } from "@/lib/rakuten/courseSearch";
import { getGolfCourseDetail } from "@/lib/rakuten/courseDetail";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { GoraCourseSearchItem } from "@/lib/types/gora";

export const maxDuration = 60;

/**
 * cache_design_draft.md 4節「API呼び出し順序とバッチ化」の手順2〜3を実装したもの。
 * 手順4(GoraPlanSearch)は別ルート(/api/plans)で行う想定。
 *
 * GET /api/courses/search?lat=35.6&lon=139.7&radius=30
 */

/** 1件ずつ独立したtry/catchでDetailを取得・保存する(1件の失敗が全体を止めないように) */
async function backfillMissingCourseDetails(missingIds: number[]): Promise<void> {
  for (const id of missingIds) {
    try {
      const detail = await getGolfCourseDetail(id);
      await upsertGolfCourseFromDetail(detail);
    } catch (detailError) {
      console.error(`golfCourseId=${id} のDetail取得に失敗、スキップして続行`, detailError);
    }
  }
}

/**
 * 2026年8月追記: 1ページ目取得後、course_search_indexに保存する前に
 * 残りのページ(2ページ目〜MAX_PAGES_PER_GRID)を追加取得してマージする。
 * これがないとcourse_ids.lengthが常に1ページ分(最大30件)で頭打ちになり、
 * 完全性チェック(isComplete)がいつまでも false のままキャッシュが効かなくなる。
 */
async function fetchRemainingPages(
  params: { latitude: number; longitude: number; searchRadius: number },
  firstPageItems: GoraCourseSearchItem[],
  totalCount: number,
  hitsPerPage: number,
  totalPageCount: number
): Promise<GoraCourseSearchItem[]> {
  const allItems = [...firstPageItems];
  const lastPage = Math.min(totalPageCount, MAX_PAGES_PER_GRID);

  for (let page = 2; page <= lastPage; page++) {
    try {
      const result = await searchGolfCourses({ ...params, page });
      allItems.push(...result.items);
    } catch (pageError) {
      console.error(`page=${page} の取得に失敗、ここまでの件数で打ち切り`, pageError);
      break; // 途中失敗時はそこまでの件数を使う(isCompleteはfalseのままになり、次回再試行される)
    }
  }

  return allItems;
}

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

  if (Number.isNaN(searchRadius) || searchRadius < 10 || searchRadius > 300) {
    return NextResponse.json(
      { status: "error", message: "radius must be between 10 and 300" },
      { status: 400 }
    );
  }

  try {
    const supabaseConfigured = isSupabaseConfigured();
    const gridKey = buildGridKey(latitude, longitude, searchRadius);

    if (!supabaseConfigured) {
      const searchResult = await searchGolfCourses({ latitude, longitude, searchRadius });
      const items = searchResult.items;
      return NextResponse.json({
        status: "ok",
        cacheHit: false,
        apiCalled: true,
        resultCount: items.length,
        courses: items,
      });
    }

    // 手順2: course_search_indexキャッシュを確認(完全性チェック込み)
    const searchIndexRecord = await getFreshCourseSearchIndex(gridKey);

    if (!searchIndexRecord || !searchIndexRecord.isComplete) {
      // キャッシュミス、またはTTLは新鮮でも不完全(件数が本来より少ない)な場合。
      // 速度優先方針: 1ページ目は即座にユーザーへ返し、残りページ+キャッシュ更新は
      // after()でバックグラウンド処理する。
      const searchResult = await searchGolfCourses({ latitude, longitude, searchRadius });
      const items = searchResult.items;
      const firstPageCourseIds = items.map((item) => item.golfCourseId);

      if (firstPageCourseIds.length > 0) {
        after(async () => {
          try {
            // 残りページを取得してマージ(これがないと永遠に1ページ分で頭打ちになる)
            const allItems = await fetchRemainingPages(
              { latitude, longitude, searchRadius },
              items,
              searchResult.count,
              searchResult.hits,
              searchResult.pageCount
            );
            const allCourseIds = allItems.map((item) => item.golfCourseId);

            await upsertCourseSearchIndex(gridKey, searchRadius, allCourseIds, {
              apiCount: searchResult.count ?? null,
              apiHits: searchResult.hits ?? null,
              apiPage: searchResult.page ?? null,
              apiPageCount: searchResult.pageCount ?? null,
              rawSearchJson: searchResult,
            });

            const freshCourses = await getFreshGolfCourses(allCourseIds);
            const freshIds = new Set(freshCourses.map((c) => c.golf_course_id));
            const missingIds = allCourseIds.filter((id) => !freshIds.has(id));
            await backfillMissingCourseDetails(missingIds);
          } catch (cacheError) {
            console.error("async cache update failed", cacheError);
          }
        });
      }

      return NextResponse.json({
        status: "ok",
        cacheHit: false,
        apiCalled: true,
        resultCount: items.length,
        totalCount: searchResult.count,
        isComplete: items.length >= searchResult.count,
        courses: items,
      });
    }

    // 手順3: course_search_indexヒット(完全)。golf_coursesキャッシュを確認し、
    // 欠落分はafter()でバックグラウンド補完する
    const freshCourses = await getFreshGolfCourses(searchIndexRecord.courseIds);
    const freshIds = new Set(freshCourses.map((c) => c.golf_course_id));
    const missingIds = searchIndexRecord.courseIds.filter((id) => !freshIds.has(id));

    if (missingIds.length > 0) {
      after(async () => {
        await backfillMissingCourseDetails(missingIds);
      });
    }

    return NextResponse.json({
      status: "ok",
      cacheHit: true,
      apiCalled: false,
      resultCount: freshCourses.length,
      totalCount: searchIndexRecord.apiCount,
      courses: freshCourses,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
