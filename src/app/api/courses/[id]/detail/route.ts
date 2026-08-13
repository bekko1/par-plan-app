// src/app/api/courses/[id]/detail/route.ts (新規ファイル)
//
// ユーザーが一覧からコースを選んだ時に呼ぶ、Detail取得専用エンドポイント。
// 1件だけなのでmaxDurationのデフォルト(10秒程度)でも余裕で収まる。

import { NextRequest, NextResponse } from "next/server";
import { getGolfCourseDetail } from "@/lib/rakuten/courseDetail";
import { upsertGolfCourseFromDetail } from "@/lib/db/golfCoursesRepo";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GOLF_COURSES_TTL_MS, isFresh } from "@/lib/db/ttl";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }

) {
  const { id } = await params;
  const golfCourseId = Number(id);
  if (Number.isNaN(golfCourseId)) {
    return NextResponse.json(
      { status: "error", message: "invalid course id" },
      { status: 400 }
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("golf_courses")
      .select("*")
      .eq("golf_course_id", golfCourseId)
      .maybeSingle();

    // detail_fetched_at が入っていて、かつTTL内ならキャッシュをそのまま返す
    if (
      existing?.detail_fetched_at &&
      isFresh(existing.detail_fetched_at, GOLF_COURSES_TTL_MS)
    ) {
      return NextResponse.json({ status: "ok", cacheHit: true, course: existing });
    }

    // 未取得 or 古い場合はここで初めてGoraGolfCourseDetailを1件だけ呼ぶ
    const detail = await getGolfCourseDetail(golfCourseId);
    await upsertGolfCourseFromDetail(detail);

    const { data: updated } = await supabase
      .from("golf_courses")
      .select("*")
      .eq("golf_course_id", golfCourseId)
      .maybeSingle();

    return NextResponse.json({ status: "ok", cacheHit: false, course: updated });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}