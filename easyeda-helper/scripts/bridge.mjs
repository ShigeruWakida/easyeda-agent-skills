// easyeda-api-skill の中継サーバー（scripts/bridge-server.mjs、127.0.0.1:49620）に JavaScript を送って実行する。
// 形式は中継サーバーの実装どおり：POST /execute {"code": "..."} → {"success": bool, "result": ..., "windowId": ...}
export const BRIDGE = process.env.EASYEDA_BRIDGE || 'http://127.0.0.1:49620';

export async function execute(code, timeoutMs = 120000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BRIDGE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: ctl.signal,
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok || !body.success) throw new Error(`HTTP ${res.status}: ${text.slice(0, 1000)}`);
    return body.result;
  } finally {
    clearTimeout(t);
  }
}

export async function health() {
  const res = await fetch(`${BRIDGE}/health`);
  return res.json();
}

// 結果を JSON で残す。保存先は環境変数 EASYEDA_LOG_DIR、無ければ一時フォルダの easyeda-logs
// （skill はリポジトリへのリンクとして入れるので、スクリプトの隣には書かない）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export function saveLog(name, data) {
  const dir = process.env.EASYEDA_LOG_DIR || join(tmpdir(), 'easyeda-logs');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `${stamp}_${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  return file;
}
