# par-plan (パープラン) — 本番実装 骨組み

`golf_plan_service_development_plan.md` / `cache_design_draft.md` の設計をコード化した
Next.js(App Router)+ Supabase の骨組みです。UI・ビジネスロジックの作り込みはこれから。

## できていること

- Next.js 14(App Router)+ TypeScript + Tailwind の最小構成
- Supabaseクライアント(ブラウザ用 / サーバー専用の2系統、service role keyの混入防止付き)
- `supabase/schema.sql`:`cache_design_draft.md` の3テーブル設計(golf_courses /
  course_search_index / golf_plans_daily)をそのままDDL化
- 楽天GORA API(CourseSearch / CourseDetail / PlanSearch)の呼び出しラッパー
  - `applicationId` + `accessKey`(ヘッダー)の認証
  - 1秒1回のグローバルレート制御キュー + 429時の指数バックオフ
  - PlanSearchの最大30件バッチ化
- キャッシュ層(`src/lib/db/`):TTL判定(準静的7日 / エリア検索48時間 /
  日別プランは残り日数で可変)込みのリポジトリ関数
- API Routes:
  - `GET /api/health` — Supabase疎通確認
  - `GET /api/courses/search?lat=..&lon=..&radius=..` — キャッシュ確認→
    未ヒット分のみGORA API呼び出し、という`cache_design_draft.md`4節の流れを実装
  - `GET /api/plans?courseIds=..&playDate=..` — 同上のプラン取得版

## 進捗

- `GET /api/courses/search?lat=..&lon=..&radius=..` の疎通確認に成功。Rakuten GORA API から 1ページ目の `items` が正常に取得されることを確認した。
- Supabase 未構成環境でも検索結果を返すフェールバック処理を実装した。

## 2026年8月:公式ドキュメントに基づく修正

- リクエストURLを `https://openapi.rakuten.co.jp/engine/api/Gora/{API名}/20170623` に修正
  (旧スキャフォルドの `/services/api/Gora/...20170426` は仮置きの誤りだった)
- `accessKey` はクエリパラメータで送信する方式に統一(ヘッダー名を推測する必要がなくなった)
- **アフィリエイトURLの自前組み立ては不要と判明。** `affiliateId` をリクエストに含めるだけで
  レスポンス中のURL系フィールド(`golfCourseDetailUrl`/`reserveCalUrl`/
  `reservePageUrlPC`/`reservePageUrlMobile`等)がAPI側で自動的にアフィリエイトURLに
  変換されて返ってくる。旧`affiliate.ts`は削除し、`src/lib/rakuten/displayLinks.ts`
  (表示直前にaffiliateId付きでAPIを呼び直すヘルパー)に置き換えた
- `stockStatus`の意味を確定(1:空き有り/リクエスト予約可、2:空き有り/リクエスト予約不可、
  3:お得プラン、4:GORA限定プラン、5:リクエスト予約のみ、6:キャンセル待ち)。
  `isLikelyCommissionEligible()` で `stockStatus=5` を成果報酬対象外として除外する
  実装を追加(issues.md「楽天アフィリエイトGORA料率区分の確認」の一部が前進)
- `GoraGolfCourseDetail`の画像URLは配列ではなく `golfCourseImageUrl1`〜`5` の
  5個別フィールドだったため、`golfCoursesRepo.ts` のマッピングを修正
- レスポンス形式を `formatVersion=2`(フラットな`items[]`形式)に統一

## できていないこと / 要検証(TODO)

- 上記の修正はすべて**公式ドキュメントの記載に基づく**もので、実際のAPIキーでの
  疎通確認はまだ行っていない。`npm run dev` 後、実際の`applicationId`/`accessKey`で
  `/api/health` → `/api/courses/search` → `/api/plans` の順に動作確認すること。
- `stockStatus=1`(空き有り/リクエスト予約可)が即予約とリクエスト予約のどちらを含むかは
  ドキュメント上明確でないため、成果報酬対象の最終判定は楽天アフィリエイト事務局への
  確認結果を待つ必要がある(issues.md参照、未解決のまま)。
- 交通費計算(Haversine・NEXCO料金式)、UI(検索フォーム・結果一覧・
  インターステイシャル画面)は未着手。
- `src/lib/types/database.ts` は手書きの最小版。`supabase link` 後は
  `supabase gen types typescript --linked` で置き換えるのが望ましい。
- テスト・エラーハンドリングの詳細化、429実測値が確定した後のレート制御パラメータ調整。
- 公開APIルート(`/api/courses/search`、`/api/plans`)には認証・レート制限が
  一切ないため、実装を進める段階でSame-Origin/Refererチェック等の悪用対策を追加すること。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local に Supabase / 楽天GORA の各キーを設定

# Supabase側でschema.sqlを適用(SQL Editorに貼るか supabase db push)

npm run dev
```

`http://localhost:3000/api/health` でSupabase接続確認。
