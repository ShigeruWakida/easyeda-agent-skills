// 開いている文書の画面を PNG に保存する（確認用）。
//   node screenshot.mjs out.png                    # 全体が入るように拡大縮小してから撮る
//   node screenshot.mjs out.png --region L R T B   # 範囲（文書の座標）を指定して撮る
//   node screenshot.mjs out.png --keep             # 今の表示のまま撮る
import { writeFileSync } from 'node:fs';
import { execute } from './bridge.mjs';

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--') && /\.png$/i.test(a)) || 'easyeda.png';
const ri = args.indexOf('--region');
const region = ri >= 0 ? args.slice(ri + 1, ri + 5).map(Number) : null;
const keep = args.includes('--keep');

const code = `
const region = ${JSON.stringify(region)};
const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
const tab = doc && doc.tabId;
if (tab) { try { await eda.dmt_EditorControl.activateDocument(tab); } catch (e) {} }
if (region) await eda.dmt_EditorControl.zoomToRegion(...region, tab);
else if (!${keep}) await eda.dmt_EditorControl.zoomToAllPrimitives(tab);
await new Promise(r => setTimeout(r, 1500));
const blob = await eda.dmt_EditorControl.getCurrentRenderedAreaImage(tab);
if (!blob) return {ok: false};
const buf = new Uint8Array(await blob.arrayBuffer());
let s = '';
for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
return {ok: true, type: blob.type, b64: btoa(s)};
`;
const r = await execute(code, 120000);
if (!r.ok) { console.error('画像を取れなかった'); process.exit(1); }
writeFileSync(out, Buffer.from(r.b64, 'base64'));
console.log(`保存: ${out}（${r.type}）`);
