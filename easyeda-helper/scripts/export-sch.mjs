// 回路図を書き出す（画面の描画に頼らない確認用）。
//   node export-sch.mjs png out.png [幅px]     # PNG（SCH_ManufactureData.getPngFile、最大 4096）。複数ページなら zip
//   node export-sch.mjs svg out.svg            # SVG（複数ページなら zip）
//   node export-sch.mjs netlist out.json [種類] # ネットリスト（getNetlistFile、種類は ESYS_NetlistType の値。既定は EasyEDA の JSON）
import { writeFileSync } from 'node:fs';
import { execute } from './bridge.mjs';

const [kind, out, extra] = process.argv.slice(2);
if (!['png', 'svg', 'netlist'].includes(kind) || !out) {
  console.error('使い方: node export-sch.mjs png|svg|netlist <出力> [幅px|種類]');
  process.exit(2);
}
const call = {
  png: `eda.sch_ManufactureData.getPngFile('sch', ${extra ? `{width: ${Number(extra)}}` : 'undefined'})`,
  svg: `eda.sch_ManufactureData.getSvgFile('sch')`,
  netlist: `eda.sch_ManufactureData.getNetlistFile('netlist'${extra ? `, ${JSON.stringify(extra)}` : ''})`,
}[kind];
const code = `
const f = await ${call};
if (!f) return {ok: false};
const buf = new Uint8Array(await f.arrayBuffer());
let s = '';
for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
return {ok: true, name: f.name, type: f.type, b64: btoa(s)};
`;
const r = await execute(code, 180000);
if (!r.ok) { console.error('書き出せなかった'); process.exit(1); }
writeFileSync(out, Buffer.from(r.b64, 'base64'));
console.log(`保存: ${out}（元の名前 ${r.name}、${r.type}）`);
