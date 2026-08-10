import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * ブラウザ/クライアントコンポーネント用。anon keyのみ使用(RLSで読み取りのみ許可)。
 * サーバー側の書き込み処理には使わないこと(server.tsを使う)。
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です(.env.local参照)"
    );
  }

  return createClient<Database>(url, anonKey);
}
