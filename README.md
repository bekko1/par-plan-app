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

## できていないこと / 要検証(TODO)

- `src/lib/rakuten/affiliate.ts` の hb.afl.rakuten.co.jp URL組み立てロジックは
  プレースホルダー。Issue #4〜#6で取得済みの実サンプルJSONと突き合わせて
  パスセグメント等を確定させること。
- `src/lib/rakuten/client.ts` のベースURL(`openapi.rakuten.co.jp`)は、
  Issue #2で実際にVercelから疎通確認(200 OK)した際の値と完全一致するか未確認。
- 楽天アフィリエイト料率区分(1%/5%)・`stockStatus`による成果対象外判定は
  `issues.md`の該当Issueが解決するまで `isLikelyCommissionEligible()` はダミー実装のまま。
- 交通費計算(Haversine・NEXCO料金式)、UI(検索フォーム・結果一覧・
  インターステイシャル画面)は未着手。
- `src/lib/types/database.ts` は手書きの最小版。`supabase link` 後は
  `supabase gen types typescript --linked` で置き換えるのが望ましい。
- テスト・エラーハンドリングの詳細化、429実測値が確定した後のレート制御パラメータ調整。

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local に Supabase / 楽天GORA の各キーを設定

# Supabase側でschema.sqlを適用(SQL Editorに貼るか supabase db push)

npm run dev
```

`http://localhost:3000/api/health` でSupabase接続確認。
