/**
 * 楽天GORA API(GoraGolfCourseSearch / GoraGolfCourseDetail / GoraPlanSearch)の型。
 * 公式ドキュメント(2026年8月確認、formatVersion=2のフラット形式に対応):
 * https://webservice.rakuten.co.jp/documentation/gora-golf-course-search
 * https://webservice.rakuten.co.jp/documentation/gora-golf-course-detail
 * https://webservice.rakuten.co.jp/documentation/gora-plan-search
 */

// ── GoraGolfCourseSearch ──────────────────────────────────────

export interface GoraCourseSearchItem {
  golfCourseId: number;
  golfCourseName: string;
  golfCourseAbbr?: string;
  golfCourseNameKana?: string;
  golfCourseCaption?: string;
  address?: string;
  latitude: number;
  longitude: number;
  highway?: string;
  /** affiliateId指定時はアフィリエイトURL、未指定時は通常URL(API側で自動変換) */
  golfCourseDetailUrl?: string;
  reserveCalUrl?: string;
  ratingUrl?: string;
  golfCourseImageUrl?: string;
  evaluation?: number;
}

export interface GoraCourseSearchResponse {
  items: GoraCourseSearchItem[]; // formatVersion=2
  count: number;
  page: number;
  pageCount: number;
  hits: number;
  carrier?: number; // 0: PC, 1: mobile
}

// ── GoraGolfCourseDetail ──────────────────────────────────────

export interface GoraPlanSummary {
  month?: string;
  planName?: string;
  planDate?: string;
  service?: string;
  /** プラン料金(総額)。税抜/税込内訳がnullになるケースあり(実データ検証で確認済み) */
  price?: number | null;
  basePrice?: number | null;
  salesTax?: number | null;
  courseUseTax?: number | null;
  otherTax?: number | null;
}

export interface GoraCourseDetailResponse {
  golfCourseId: number;
  golfCourseName: string;
  golfCourseAbbr?: string;
  golfCourseNameKana?: string;
  golfCourseCaption?: string;
  address?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  highway?: string;
  ic?: string;
  icDistance?: string;
  telephoneNo?: string;
  designer?: string;
  courseType?: string;
  courseVerticalInterval?: string;
  /** "0万m2"(未登録)の可能性あり */
  dimension?: string;
  holeCount?: number;
  parCount?: number;
  courseDistance?: string;
  ratingNum?: number;
  evaluation?: number;
  weekdayMinPrice?: number;
  baseWeekdayMinPrice?: number;
  holidayMinPrice?: number;
  baseHolidayMinPrice?: number;
  golfCourseImageUrl1?: string;
  golfCourseImageUrl2?: string;
  golfCourseImageUrl3?: string;
  golfCourseImageUrl4?: string;
  golfCourseImageUrl5?: string;
  reserveCalUrl?: string;
  voiceUrl?: string;
  layoutUrl?: string;
  routeMapUrl?: string;
  newPlans?: GoraPlanSummary[];
  // 未対応フィールドを含む生レスポンス全体。DBのraw_detail_jsonにそのまま保存する
  [key: string]: unknown;
}

// ── GoraPlanSearch ──────────────────────────────────────

/**
 * 在庫ステータス。公式ドキュメントで確定(2026年8月確認):
 * 1: 空き有り／リクエスト予約可
 * 2: 空き有り／リクエスト予約不可
 * 3: 在庫有り お得プラン
 * 4: 在庫有り GORA限定プラン
 * 5: リクエスト予約のみ
 * 6: キャンセル待ち
 *
 * issues.md「楽天アフィリエイトGORA料率区分の確認」との関係:
 * 楽天アフィリエイト規約(3)により「リクエスト予約」は成果報酬対象外。
 * stockStatus=5(リクエスト予約のみ)はこれに直接該当する。
 * stockStatus=1(空き有り／リクエスト予約可)は即予約とリクエスト予約が混在する
 * ステータスの可能性があるため、送客可否のUI表示では要注意(引き続き事務局確認は必要)。
 */
export type GoraStockStatus = 1 | 2 | 3 | 4 | 5 | 6;

/** ゴルフ場予約種別。1:リアルタイム予約 2:リクエスト予約・キャンセル待ち可能 3:その他 */
export type GoraCourseReservationType = 1 | 2 | 3;

export interface GoraPlanStock {
  playDate: string; // YYYY-MM-DD
  stockStatus: GoraStockStatus;
  stockCount?: number;
  /** affiliateId指定時はアフィリエイトURL(API側で自動変換) */
  reservePageUrlPC?: string;
  reservePageUrlMobile?: string;
}

export interface GoraPlan {
  planId?: string | number;
  planName?: string;
  planType?: 1 | 2 | 3; // 1:通常 2:お得 3:GORA限定
  limitedTimeFlag?: 0 | 1;
  price?: number | null;
  basePrice?: number | null;
  salesTax?: number | null;
  courseUseTax?: number | null;
  otherTax?: number | null;
  playerNumMin?: number;
  playerNumMax?: number;
  startTimeZone?: string;
  round?: number;
  caddie?: 0 | 1;
  cart?: 1 | 2 | 3 | 4;
  lunch?: 0 | 1;
  calInfo: GoraPlanStock[];
}

export interface GoraPlanSearchGolfCourse {
  golfCourseId: number;
  golfCourseName: string;
  golfCourseCaption?: string;
  /** 1:リアルタイム予約コース 2:リクエスト予約・キャンセル待ち可能コース 3:その他コース */
  golfCourseRsvType?: GoraCourseReservationType;
  areaCode?: number;
  prefecture?: string;
  highway?: string;
  icDistance?: string;
  displayWeekdayMinPrice?: string;
  displayHolidayMinPrice?: string;
  cancelFeeFlag?: 0 | 1;
  cancelFee?: string;
  ratingNum?: number;
  evaluation?: number;
  /** affiliateId指定時はアフィリエイトURL(API側で自動変換)。予約カレンダー全体へのリンク */
  reserveCalUrlPC?: string;
  reserveCalUrlMobile?: string;
  planInfo: GoraPlan[];
}

export interface GoraPlanSearchResponse {
  items: GoraPlanSearchGolfCourse[]; // formatVersion=2
  count: number;
  page: number;
  pageCount: number;
  hits: number;
}
