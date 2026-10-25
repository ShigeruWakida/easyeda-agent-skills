// 開いているプロジェクトの回路図ページを開き、（--place を付けたときだけ）部品を 1 個置いて確かめる。
//   node verify-open-project.mjs                  # 読み取りだけ：プロジェクト・回路図・ページの一覧
//   node verify-open-project.mjs --place C25804   # 最初のページを開き、LCSC C25804 を 1 個置いてピン座標を読む
//   node verify-open-project.mjs --place C25804 --delete   # 置いた部品を確かめた後に消す
import { execute, saveLog } from './bridge.mjs';

const args = process.argv.slice(2);
const pi = args.indexOf('--place');
const lcsc = pi >= 0 ? args[pi + 1] : null;
const del = args.includes('--delete');

const code = `
const out = {};
out.project = await eda.dmt_Project.getCurrentProjectInfo();
if (!out.project) return {ok: false, reason: 'プロジェクトが開いていない（GUI で作成して開く）'};
out.schematics = await eda.dmt_Schematic.getAllSchematicsInfo();
out.pages = await eda.dmt_Schematic.getAllSchematicPagesInfo();
if (!out.pages || !out.pages.length) return {ok: false, reason: '回路図ページがない', ...out};
const page = out.pages[0];
const lcsc = ${JSON.stringify(lcsc)};
if (!lcsc) return {ok: true, ...out};
out.opened = await eda.dmt_EditorControl.openDocument(page.uuid);
await new Promise(r => setTimeout(r, 1500));
out.document = await eda.dmt_SelectControl.getCurrentDocumentInfo();
const dev = (await eda.lib_Device.getByLcscIds([lcsc]))[0];
if (!dev) return {ok: false, reason: 'ライブラリに無い: ' + lcsc, ...out};
const comp = await eda.sch_PrimitiveComponent.create(dev, 1000, 1000, undefined, 0, false, true, true);
if (!comp) return {ok: false, reason: '配置に失敗', ...out};
const id = comp.getState_PrimitiveId();
out.placed = {id, designator: comp.getState_Designator(), x: comp.getState_X(), y: comp.getState_Y()};
const pins = await eda.sch_PrimitiveComponent.getAllPinsByPrimitiveId(id) || [];
out.pins = pins.map(p => ({n: p.getState_PinNumber(), name: p.getState_PinName(), x: p.getState_X(), y: p.getState_Y(), rot: p.getState_Rotation()}));
if (${del}) { out.deleted = await eda.sch_PrimitiveComponent.delete([id]); }
return {ok: true, ...out};
`;
const result = await execute(code);
const file = saveLog('verify-open-project', { lcsc, del, result });
console.log(JSON.stringify(result, null, 1).slice(0, 4000));
console.log('保存:', file);
