import "server-only";
import { enqueueRakutenCall, Rate429Error } from "./rateLimiter";

// 2026年5月13日の楽天ウェブサービス基盤刷新で app.rakuten.co.jp → openapi.rakuten.co.jp に移行済み。
// TODO: Issue #2(Vercelからの疎通確認, 200 OK済み)で実際に使ったベースURL・パス構造と
// 完全に一致しているか必ず確認すること。ここでは仕様上の想定値を置いている。
const GORA_BASE_URL = "https://openapi.rakuten.co.jp/services/api/Gora";

/**
 * 認証情報。2026年5月のAPI基盤刷新でaccessKeyが必須化(HTTPヘッダー送信)。
 * applicationIdはクエリパラメータ。本番はWebアプリケーションタイプ登録
 * (許可Webサイト + Origin/Referer完全一致検証)を前提とする。
 */
function getCredentials() {
  const applicationId = process.env.RAKUTEN_APPLICATION_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;

  if (!applicationId || !accessKey) {
    throw new Error(
      "RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY が未設定です(.env.local参照)"
    );
  }

  return { applicationId, accessKey };
}

export interface GoraRequestOptions {
  /** 例: "GoraGolfCourseSearch/20170426" のようなエンドポイント+バージョン */
  endpoint: string;
  params: Record<string, string | number | undefined>;
  /**
   * true の場合、リクエストにaffiliateIdを付与する。
   * ただしcache_design_draft.md 2.4の方針により、golf_plans_daily等への保存前の
   * 「キャッシュ用取得」では false(素のURLを保存)、表示直前の取得でのみ true にする。
   */
  withAffiliateId?: boolean;
}

async function rawGoraRequest<T>({
  endpoint,
  params,
  withAffiliateId,
}: GoraRequestOptions): Promise<T> {
  const { applicationId, accessKey } = getCredentials();

  const query = new URLSearchParams();
  query.set("applicationId", applicationId);
  query.set("format", "json");

  if (withAffiliateId) {
    const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
    if (!affiliateId) {
      throw new Error("RAKUTEN_AFFILIATE_ID が未設定です(.env.local参照)");
    }
    query.set("affiliateId", affiliateId);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const url = `${GORA_BASE_URL}/${endpoint}?${query.toString()}`;

  const res = await fetch(url, {
    headers: {
      // accessKeyはヘッダー経由(2026年5月刷新後の必須仕様)
      "X-RAKUTEN-Access-Key": accessKey,
    },
    // GoraGolfCourseDetail等の準静的データはNext.jsのfetchキャッシュに乗せてよいが、
    // 実際のTTL制御はSupabase側(src/lib/db)で行うため、ここでは常にno-storeにしておく
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new Rate429Error();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GORA API error: ${res.status} ${endpoint} ${body}`);
  }

  return (await res.json()) as T;
}

/** レート制御キューを通した呼び出し。実装から使う場合はこちらを使う。 */
export function goraRequest<T>(options: GoraRequestOptions): Promise<T> {
  return enqueueRakutenCall(() => rawGoraRequest<T>(options));
}
