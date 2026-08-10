import "server-only";
import { getGolfCourseDetail } from "./courseDetail";
import { searchPlans } from "./planSearch";

/**
 * アフィリエイトURLの取得方針(2026年8月、公式ドキュメントで確定済み):
 * https://webservice.rakuten.co.jp/documentation/gora-golf-course-detail
 * https://webservice.rakuten.co.jp/documentation/gora-plan-search
 *
 * 「アフィリエイトIDをリクエストパラメータに含めるだけで、レスポンス中のURL系フィールドが
 * API側で自動的にアフィリエイトURLに変換されて返ってくる」と明記されている。
 * hb.afl.rakuten.co.jp/hgc/... 側の内部URL構造は非公開かつAPI側の実装詳細のため、
 * 自前で組み立てる(以前のaffiliate.tsのアプローチ)のは不要かつ非推奨と判断し廃止した。
 *
 * cache_design_draft.md 2.4節の「DBには素のURLだけ保存し、表示直前に組み立てる」という
 * 方針自体は維持しつつ、「組み立て」の実体は下記のとおり「affiliateId付きでAPIを呼び直す」
 * ことで実現する。
 */

export type DeviceType = "pc" | "mobile";

/**
 * コース詳細ページ・予約カレンダーへのアフィリエイトリンクを取得する。
 * 表示直前(インターステイシャル画面遷移時等)にのみ呼ぶこと。
 */
export async function getAffiliateCourseDetailUrl(
  golfCourseId: number,
  device: DeviceType
): Promise<{ golfCourseDetailUrl?: string; reserveCalUrl?: string }> {
  const detail = await getGolfCourseDetail(
    golfCourseId,
    device === "pc" ? 0 : 1,
    /* withAffiliateId */ true
  );
  return {
    golfCourseDetailUrl: (detail as { golfCourseDetailUrl?: string }).golfCourseDetailUrl,
    reserveCalUrl: detail.reserveCalUrl,
  };
}

/**
 * 特定プレー日の予約ページへのアフィリエイトリンクを取得する。
 * GoraPlanSearchはPC/モバイル両方のURLを1回のレスポンスで返すため、
 * carrierの出し分けリクエストは不要(courseDetailとの違いに注意)。
 */
export async function getAffiliatePlanUrls(
  golfCourseId: number,
  playDate: string
): Promise<{ pc?: string; mobile?: string }[]> {
  const result = await searchPlans(
    { golfCourseIds: [golfCourseId], playDate },
    /* withAffiliateId */ true
  );

  const course = result.items[0];
  if (!course) return [];

  return course.planInfo.flatMap((plan) =>
    plan.calInfo.map((stock) => ({
      pc: stock.reservePageUrlPC,
      mobile: stock.reservePageUrlMobile,
    }))
  );
}
