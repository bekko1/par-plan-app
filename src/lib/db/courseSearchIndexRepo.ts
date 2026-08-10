import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { COURSE_SEARCH_INDEX_TTL_MS, isFresh } from "./ttl";

export async function getFreshCourseSearchIndex(
  gridKey: string
): Promise<number[] | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("course_search_index")
    .select("course_ids, fetched_at")
    .eq("grid_key", gridKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (!isFresh(data.fetched_at, COURSE_SEARCH_INDEX_TTL_MS)) return null;

  return data.course_ids as number[];
}

export async function upsertCourseSearchIndex(
  gridKey: string,
  searchRadius: number,
  courseIds: number[]
): Promise<void> {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("course_search_index").upsert({
    grid_key: gridKey,
    search_radius: searchRadius,
    course_ids: courseIds,
    fetched_at: new Date().toISOString(),
  });
  if (error) throw error;
}
