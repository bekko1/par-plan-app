/**
 * これはMVP実装の骨組み用プレースホルダーです。本番LPのビジュアルデザインは別途
 * frontend-designの方針に沿って作り込む前提(ここではAPI/DB結線の確認が目的)。
 */
export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">パープラン(骨組み)</h1>
      <p className="mt-2 text-sm text-neutral-600">
        出発地・日程・予算からゴルフラウンドの総額最安プランを比較する検索フォームは
        今後ここに実装します。まずは{" "}
        <code className="rounded bg-neutral-100 px-1">/api/health</code> で
        Supabase接続を確認してください。
      </p>
    </main>
  );
}
