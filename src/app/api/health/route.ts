import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("golf_courses")
      .select("golf_course_id", { count: "exact", head: true });

    if (error) throw error;

    return NextResponse.json({ status: "ok", supabase: "connected" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
