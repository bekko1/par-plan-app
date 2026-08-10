import "server-only";
import { enqueueRakutenCall, Rate429Error } from "./rateLimiter";

/**
 * 公式ドキュメント(2026年8月確認)で確定した値:
 * https://webservice.rakuten.co.jp/documentation/gora-golf-course-search
 * https://webservice.rakuten.co.jp/documentation/gora-golf-course-detail
 * https://webservice.rakuten.co.jp/documentation/gora-plan-search
 *
 * リクエストURL形式: https://openapi.rakuten.co.jp/engine/api/Gora/{API名}/{version}
 * 3API共通でversion=20170623(2026年8月時点で最新かつ唯一のバージョン)。
 * 旧仕様の"/services/api/Gora/"や"20170426"は誤り(以前のスキャフォルドの仮置き値)だったため修正。
 */
const GORA_BASE_URL = "https://openapi.rakuten.co.jp/engine/api/Gora";
const GORA_API_VERSION = "20170623";

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
  /** 例: "GoraGolfCourseSearch" (バージョンは共通定数から自動付与) */
  api: "GoraGolfCourseSearch" | "GoraGolfCourseDetail" | "GoraPlanSearch";
  params: Record<string, string | number | undefined>;
  /**
   * true の場合、リクエストにaffiliateIdを付与する。
   * 公式ドキュメント確認済み: affiliateIdを含めてリクエストするだけで、
   * レスポンス中のURL系フィールド(golfCourseDetailUrl/reserveCalUrl/
   * reservePageUrlPC/reservePageUrlMobile等)がAPI側で自動的にアフィリエイトURLに
   * 変換されて返ってくる。自前でURL変換ロジックを組む必要はない
   * (cache_design_draft.md 2.4節で想定していた「自前変換」は不要と判明)。
   *
   * cache_design_draft.md の方針通り、キャッシュ用取得(golf_courses等への保存)では
   * false(素のURL)、表示直前の取得でのみ true にする。
   */
  withAffiliateId?: boolean;
}

async function rawGoraRequest<T>({
  api,
  params,
  withAffiliateId,
}: GoraRequestOptions): Promise<T> {
  const { applicationId, accessKey } = getCredentials();

  const query = new URLSearchParams();
  query.set("applicationId", applicationId);
  // 公式ドキュメント: accessKeyはヘッダーでもクエリパラメータでも可("Can be provided in
  // either header or as query parameter")。ヘッダー名を推測する必要がないクエリパラメータ方式を採用。
  query.set("accessKey", accessKey);
  query.set("format", "json");
  query.set("formatVersion", "2"); // ネストの浅いレスポンス形式(items[0].itemNameでアクセス可能)

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

  const url = `${GORA_BASE_URL}/${api}/${GORA_API_VERSION}?${query.toString()}`;
  const headers: Record<string, string> = {};
  const referrer = process.env.RAKUTEN_REFERRER;
  if (referrer) {
    headers.Referer = referrer;
    headers.Origin = referrer;
  }

  const res = await fetch(url, { cache: "no-store", headers });

  if (res.status === 429) {
    throw new Rate429Error();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GORA API error: ${res.status} ${api} ${body}`);
  }

  return (await res.json()) as T;
}

/** レート制御キューを通した呼び出し。実装から使う場合はこちらを使う。 */
export function goraRequest<T>(options: GoraRequestOptions): Promise<T> {
  return enqueueRakutenCall(() => rawGoraRequest<T>(options));
}
