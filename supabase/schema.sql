-- par-plan (パープラン) Supabaseスキーマ
-- 出典: cache_design_draft.md の3テーブル設計をそのままDDL化したもの
-- Supabase SQL Editor または `supabase db push` で適用する想定

-- =========================================
-- 1. golf_courses (準静的: コース基本情報)
--    CourseSearch + CourseDetailの結果をマージして保持。TTL目安: 7日
-- =========================================
create table if not exists golf_courses (
  golf_course_id      bigint primary key,
  golf_course_name    text not null,
  golf_course_abbr    text,
  golf_course_kana    text,
  address             text,
  postal_code         text,
  -- 0の場合は「未取得」扱い。検索結果から除外 or 再取得フラグの対象(仕様上のリスクへの防御的対応)
  latitude            double precision,
  longitude           double precision,
  highway             text,
  ic                  text,
  ic_distance         text,
  course_type         text,
  designer            text,
  hole_count          int,
  par_count           int,
  course_distance     text,
  -- "0万m2"(未登録)の可能性があるためnull許容。UI側でフォールバック文言を出す
  dimension           text,
  evaluation          numeric,
  rating_num          int,
  image_urls          jsonb default '[]'::jsonb,
  -- 未対応フィールド用に生レスポンス(約82フィールド)も保持
  raw_detail_json      jsonb,
  fetched_at          timestamptz not null default now()
);

create index if not exists idx_golf_courses_fetched_at on golf_courses (fetched_at);
create index if not exists idx_golf_courses_lat_lon on golf_courses (latitude, longitude);

comment on table golf_courses is '準静的コース基本情報。TTL 7日(週次バッチ更新目安)';
comment on column golf_courses.latitude is '0の場合は未取得扱い。仕様上のリスクへの防御的措置(実発生は未確認)';
comment on column golf_courses.dimension is '"0万m2"(未登録)の可能性ありnull許容';

-- =========================================
-- 2. course_search_index (エリア検索結果のキャッシュ)
--    TTL: 48時間
-- =========================================
create table if not exists course_search_index (
  -- 緯度経度を丸めたグリッドキー(例: 0.05度単位 ≒ 約5km四方)。生成ロジックはsrc/lib/db参照
  grid_key       text primary key,
  search_radius  int not null,
  course_ids     jsonb not null default '[]'::jsonb,
  -- 楽天APIの検索メタデータ（キャッシュ時に保存）
  api_count      int,
  api_hits       int,
  api_page       int,
  api_page_count int,
  raw_search_json jsonb,
  fetched_at     timestamptz not null default now()
);

comment on table course_search_index is 'エリア検索結果キャッシュ。TTL 48時間。近い出発地は同じgrid_keyを使い回しAPI呼び出しを削減';

-- =========================================
-- 3. golf_plans_daily (動的: 日別プラン・空き状況)
--    TTLはプレー日までの残り日数で可変(アプリ側ロジックで判定。下記コメント参照)
-- =========================================
create table if not exists golf_plans_daily (
  golf_course_id       bigint not null,
  play_date            date not null,
  -- price/basePrice/salesTax等のプラン配列。basePrice/salesTaxがnullのケースあり、UI側でフォールバック必須
  plans                jsonb not null default '[]'::jsonb,
  stock_status         int,
  stock_count          int,
  -- affiliateId無しの素のURL。理由: 変換規則(hb.afl.rakuten.co.jp/hgc/...)が将来変わるリスクを避けるため、
  -- 表示直前にaffiliateIdを付与して都度組み立てる(src/lib/rakuten/affiliate.ts参照)
  reserve_url_pc_base  text,
  fetched_at           timestamptz not null default now(),
  primary key (golf_course_id, play_date)
);

create index if not exists idx_golf_plans_daily_fetched_at on golf_plans_daily (fetched_at);
create index if not exists idx_golf_plans_daily_play_date on golf_plans_daily (play_date);

comment on table golf_plans_daily is '日別プラン・空き状況。TTL可変: 8日以上先=24h / 2〜7日先=6h / 当日〜翌日=1h(アプリ側で判定)';
comment on column golf_plans_daily.reserve_url_pc_base is 'affiliateId無しの素のURL。表示直前に都度affiliateId付与して組み立てる(DBにアフィリエイトURLはキャッシュしない)';

-- =========================================
-- RLS: 全テーブルとも読み取り専用データのキャッシュであり、
-- 書き込みはサーバー側(service role key)からのみ行う想定。
-- anonキーからは読み取りのみ許可する。
-- =========================================
alter table golf_courses enable row level security;
alter table course_search_index enable row level security;
alter table golf_plans_daily enable row level security;

create policy "public read golf_courses" on golf_courses
  for select using (true);
create policy "public read course_search_index" on course_search_index
  for select using (true);
create policy "public read golf_plans_daily" on golf_plans_daily
  for select using (true);

-- insert/update/deleteはservice role keyのみ(RLSはservice roleに対しては適用されないためポリシー不要)
