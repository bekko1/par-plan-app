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
      // ヒットすれば courseIds が返る。ミスなら GORA 検索を行う。
      let courseIds = await getFreshCourseSearchIndex(gridKey);
      let searchResult: Awaited<ReturnType<typeof searchGolfCourses>> | null = null;

      // 非同期キャッシュ更新の開始フラグと、先に返すレスポンスデータ
      let asyncCacheStarted = false;
      let responseCourses: unknown[] | null = null;

      if (!courseIds) {
        // キャッシュが無ければ GORA 検索を実行し、結果を即座に返すために保持する
        searchResult = await searchGolfCourses({
          latitude,
          longitude,
          searchRadius,
        });
        const items = Array.isArray(searchResult?.items)
          ? searchResult.items
          : [];
        courseIds = items.map((item) => item.golfCourseId);
        responseCourses = items;

        if (courseIds.length > 0 && supabaseConfigured) {
          // 非同期でキャッシュを更新する。API のレスポンスは待たない。
          asyncCacheStarted = true;
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
      }

      if (!supabaseConfigured) {
        // Supabase 未構成の場合はキャッシュ処理せず、GORA の結果をそのまま返す
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

      if (responseCourses) {
        // course_search_index が無かったので、先に GORA 検索結果を返す
        if (!asyncCacheStarted) {
          // ここはキャッシュ更新フラグが立っていない場合、
          // レスポンス後に golf_courses キャッシュのみを非同期で補完する
          void (async () => {
            try {
              const freshCourses = await getFreshGolfCourses(courseIds);
              const freshIds = new Set(
                freshCourses.map((c) => c.golf_course_id)
              );
              const missingIds = courseIds.filter((id) => !freshIds.has(id));

              if (missingIds.length > 0) {
                for (const id of missingIds) {
                  const detail = await getGolfCourseDetail(id);
                  await upsertGolfCourseFromDetail(detail);
                }
              }
            } catch (cacheError) {
              console.error("async detail cache update failed", cacheError);
            }
          })();
        }

        return NextResponse.json({ status: "ok", courses: responseCourses });
      }

      // 手順3: golf_courses キャッシュを確認し、未キャッシュ / TTL 切れのみ個別取得
      const freshCourses = await getFreshGolfCourses(courseIds);
      const freshIds = new Set(freshCourses.map((c) => c.golf_course_id));
      const missingIds = courseIds.filter((id) => !freshIds.has(id));

      // NOTE: 骨組み段階のため逐次実行。
      // 本実装では Promise.allSettled + 同時実行数制限で改善したい。
      // レート制御キューが1秒間隔で吸収するので直列でも大きな問題はないが、
      // 件数が多ければ UX のためにタイムアウトやバックグラウンド更新を検討する。
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
