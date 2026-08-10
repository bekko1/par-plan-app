/**
 * 楽天GORA API(GoraGolfCourseSearch / GoraGolfCourseDetail / GoraPlanSearch)の
 * 型スタブ。GoraGolfCourseDetailは実測で約82フィールドあることを確認済みだが、
 * ここでは実装で確実に使うフィールドのみ明示し、それ以外はraw JSONとして
 * golf_courses.raw_detail_json に丸ごと保持する方針(cache_design_draft.md 2.1参照)。
 *
 * TODO: Issue #4〜#6のサンプルJSONを基に、必要になったフィールドから随時追加する。
 */

export interface GoraCourseSearchItem {
  golfCourseId: number;
  golfCourseName: string;
  latitude: number;
  longitude: number;
  address?: string;
  // affiliateId指定時はhb.afl.rakuten.co.jp経由のリダイレクトURLになる
  golfCourseDetailUrl?: string;
  rafcid?: string;
}

export interface GoraCourseSearchResponse {
  Items: GoraCourseSearchItem[];
  count: number;
  page: number;
  pageCount: number;
}

export interface GoraCourseDetailResponse {
  golfCourseId: number;
  golfCourseName: string;
  golfCourseAbbr?: string;
  golfCourseKana?: string;
  address?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  highway?: string;
  ic?: string;
  icDistance?: string;
  courseType?: string;
  designer?: string;
  holeCount?: number;
  parCount?: number;
  courseDistance?: string;
  // "0万m2"(未登録)の可能性あり
  dimension?: string;
  evaluation?: number;
  ratingNum?: number;
  imageUrls?: string[];
  newPlans?: {
    basePrice: number | null;
    salesTax: number | null;
    [key: string]: unknown;
  }[];
  reserveCalUrl?: string;
  rafcid?: string;
  // 未対応フィールドを含む生レスポンス全体。DBのraw_detail_jsonにそのまま保存する
  [key: string]: unknown;
}

export interface GoraPlan {
  planId?: string | number;
  planName?: string;
  price?: number | null;
  basePrice?: number | null;
  salesTax?: number | null;
  [key: string]: unknown;
}

/** stockStatusの値。Issue #6でstockStatus:5(リクエスト予約のみ)が
 * 成果報酬対象外の可能性があると判明しているため、収益シミュレーション・
 * 送客可否判定から除外する設計にする(issues.md 楽天アフィリエイトGORA料率区分の確認 参照)。
 * 正確な値の意味は事務局への確認結果を待って更新すること。
 */
export type GoraStockStatus = number;

export interface GoraPlanSearchDayResult {
  golfCourseId: number;
  playDate: string; // YYYY-MM-DD
  plans: GoraPlan[];
  stockStatus: GoraStockStatus;
  stockCount?: number;
  reserveUrl?: string;
  rafcid?: string;
}

export interface GoraPlanSearchResponse {
  results: GoraPlanSearchDayResult[];
}
