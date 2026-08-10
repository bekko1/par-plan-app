/**
 * cache_design_draft.md 2.4節の方針:
 * DBには affiliateId 無しの素のURL(reserve_url_pc_base 等)だけを保存し、
 * 表示直前にこの関数でアフィリエイトURLを都度組み立てる。
 * 変換規則自体が将来変わる可能性があるため、キャッシュに古い変換ルールの
 * URLが残るリスクを避ける狙い(古いURLがDBに残っても実害が出にくい設計)。
 *
 * 既知の仕様(golf_plan_service_development_plan.md 3.1節の実データ検証結果):
 * - affiliateId指定時、GORA APIが返すgolfCourseDetailUrl/reserveCalUrl自体が
 *   hb.afl.rakuten.co.jp/hgc/... 形式に変わる
 * - PC = `pc=` パラメータ、モバイル = `m=` パラメータに遷移先URLをURLエンコードして格納
 * - `rafcid` はGORA内部トラッキングIDで、affiliateIdの有無と無関係に常時付与される(混同注意)
 *
 * ここでは「API呼び出し時にaffiliateIdを付与して都度取得し直す」方式の代わりに、
 * 素のURLからアフィリエイトリンクを自前組み立てする関数として用意している。
 * ただし実際のhb.afl.rakuten.co.jp側のURL構造(hgc/以下のセグメント等)は
 * APIレスポンスのサンプル(Issue #4〜#6で取得済み)を突き合わせて要検証。
 *
 * TODO: Issue #4〜#6で保存済みのサンプルJSON(affiliateId付き)を見て、
 * 以下のテンプレートのパスセグメントを実際の値に合わせて確定させる。
 * 確定するまでは「都度APIをaffiliateId付きで呼び直す」運用の方が安全。
 */

const HB_AFL_BASE = "https://hb.afl.rakuten.co.jp/hgc";

export type DeviceType = "pc" | "mobile";

export function buildAffiliateUrl(params: {
  rawUrl: string;
  affiliateId: string;
  device: DeviceType;
}): string {
  const { rawUrl, affiliateId, device } = params;
  const encoded = encodeURIComponent(rawUrl);
  const paramKey = device === "pc" ? "pc" : "m";

  // TODO(要検証): affiliateIdをパスに含めるか、materialId等の追加パラメータが
  // 必要かはサンプルURLで要確認。現状は最小構成のプレースホルダー。
  return `${HB_AFL_BASE}/${affiliateId}/?${paramKey}=${encoded}`;
}
