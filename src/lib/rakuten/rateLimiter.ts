/**
 * GoraPlanSearch(および他2API)向けのグローバルレート制御。
 * cache_design_draft.md 5節の方針に従い、実測値が確定するまでは
 * 「3API合計で最低1秒間隔」を安全側の前提として直列キューで実行する。
 *
 * NOTE: サーバーレス関数はインスタンスごとに独立するため、このキューは
 * 単一インスタンス内でのみ有効。複数インスタンスが同時に起動した場合の
 * グローバルなレート制御(例: Redis等での分散ロック)は将来課題。
 * まずは呼び出し元(cache未ヒット時のバッチ処理)側の同時実行数を絞ることで対応する。
 */

const MIN_INTERVAL_MS = 1000;
const MAX_RETRIES = 3;

let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSlot() {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastCallAt = Date.now();
}

/**
 * fn を「最低1秒間隔」のキューに乗せて実行する。429を検知した場合は
 * 指数バックオフ(1s→2s→4s)で最大3回リトライする。
 * fn は 429 を検知したら Rate429Error を throw する契約とする。
 */
export class Rate429Error extends Error {
  constructor(message = "GORA API rate limit (429)") {
    super(message);
    this.name = "Rate429Error";
  }
}

export function enqueueRakutenCall<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await waitForSlot();
      try {
        return await fn();
      } catch (err) {
        if (err instanceof Rate429Error && attempt < MAX_RETRIES) {
          const backoffMs = 1000 * 2 ** attempt;
          attempt += 1;
          await sleep(backoffMs);
          continue;
        }
        throw err;
      }
    }
  };

  const result = queue.then(run, run);
  // キュー自体は失敗しても後続を止めない
  queue = result.catch(() => undefined);
  return result;
}
