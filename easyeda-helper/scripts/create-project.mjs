// EasyEDA Pro 3.2.209（半オフライン）で、API の代わりにプロジェクトを作る。
//
// 公開 API の eda.dmt_Project.createProject は、本体が保存先 path を空で送るので失敗する（README.md §2）。
// ここでは GUI の新規作成と同じ要求を、エディタの窓からローカルサーバーへ直接送る（非公開の内部 API）：
//   1. POST /api/client/createProject {name, path, content, ...}   … <path>/<name>.eprj を作る（pro-mgr の createInClient と同じ）
//   2. POST /api/client/openProject  {path: <作られたファイル>}     … クライアントに登録する
//   3. eda.dmt_Project.openProject(uuid)                            … 公開 API で開く
//   4. 回路図とページが無ければ、公開 API で作る（createSchematic・createSchematicPage）
// 版が変わると内部 API が変わりうる。EasyEDA の版が 3.2.209 以外なら止める（--any-version で無視）。
//
//   node create-project.mjs <名前>              # 何をするか表示するだけ
//   node create-project.mjs <名前> --yes        # 作る
// 名前は英数字とハイフン。保存先は EasyEDA のプロジェクトフォルダ（config の APP_PROJECT_DIR の 1 番目）。
import { execute, saveLog } from './bridge.mjs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const yes = args.includes('--yes');
const anyVersion = args.includes('--any-version');
if (!name || !/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(name)) {
  console.error('使い方: node create-project.mjs <名前（英数字とハイフン）> [--yes]');
  process.exit(2);
}

const code = `
const NAME = ${JSON.stringify(name)};
const YES = ${yes};
const ANY = ${anyVersion};
const out = {name: NAME};
const post = async (url, body) => {
  const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), credentials: 'include'});
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { return {success: false, http: r.status, raw: t.slice(0, 300)}; }
};
out.version = eda.sys_Environment.getEditorCurrentVersion();
if (!ANY && out.version !== '3.2.209') return {...out, ok: false, reason: '3.2.209 以外の版（内部 API が違うかもしれない）。公開 API の createProject が直っていないか先に確かめる'};
// 保存先：チームの 1 番目のうち example-projects でないもの
const teams = await eda.dmt_Team.getAllTeamsInfo();
const dir = (teams || []).map(t => t.uuid).find(u => /[\\\\/]projects$/i.test(u));
if (!dir) return {...out, ok: false, reason: 'プロジェクトフォルダが見つからない', teams};
out.dir = dir;
// 同名があれば止める
const paths = await (await fetch('/api/client/projectPaths', {credentials: 'include'})).json();
const exists = Object.values(paths.result || {}).filter(p => p.dir === dir).map(p => p.path);
out.existing = exists;
if (exists.some(p => p.toLowerCase().replace(/\\.eprj2?$/, '').endsWith('\\\\' + NAME.toLowerCase()))) return {...out, ok: false, reason: '同じ名前のプロジェクトがある'};
out.plan = {createProject: {name: NAME, path: dir}};
if (!YES) return {...out, ok: true, dryRun: true};
// 1. 作る
const c = await post('/api/client/createProject', {cbb_project: false, name: NAME, introduction: '', content: 'RoboScope', path: dir, public: false, default_sheet: ''});
out.create = c;
if (!c.success) return {...out, ok: false, reason: 'createProject 失敗'};
const uuid = Object.keys(c.result)[0];
const file = c.result[uuid].path;
out.uuid = uuid; out.file = file;
// 2. クライアントに登録
out.registerOpen = await post('/api/client/openProject', {path: file});
// 3. 公開 API で開く。別のプロジェクトに未保存の変更があると openProject は false を返す（2026-10-25 確認）ので、
//    開いている回路図を先に保存する
const cur = await eda.dmt_Project.getCurrentProjectInfo();
if (cur && cur.uuid !== uuid) { try { out.savedPrevious = await eda.sch_Document.save(); } catch (e) { out.savedPrevious = String(e); } }
out.opened = await eda.dmt_Project.openProject(uuid);
await new Promise(r => setTimeout(r, 3000));
out.project = await eda.dmt_Project.getCurrentProjectInfo();
// 4. 回路図とページ
let schs = await eda.dmt_Schematic.getAllSchematicsInfo();
if (!schs || !schs.length) {
  out.createSchematic = await eda.dmt_Schematic.createSchematic();
  await new Promise(r => setTimeout(r, 1500));
  schs = await eda.dmt_Schematic.getAllSchematicsInfo();
}
out.schematics = schs;
let pages = await eda.dmt_Schematic.getAllSchematicPagesInfo();
if ((!pages || !pages.length) && schs && schs.length) {
  out.createPage = await eda.dmt_Schematic.createSchematicPage(schs[0].uuid);
  await new Promise(r => setTimeout(r, 1500));
  pages = await eda.dmt_Schematic.getAllSchematicPagesInfo();
}
out.pages = pages;
if (pages && pages.length) { out.openPage = await eda.dmt_EditorControl.openDocument(pages[0].uuid); }
out.inList = (await eda.dmt_Project.getAllProjectsUuid(dir)).includes(uuid);
out.ok = !!(out.project && out.project.uuid === uuid && pages && pages.length);
return out;
`;

const result = await execute(code, 180000);
const file = saveLog(`create-project-${name}`, result);
console.log(JSON.stringify(result, null, 1).slice(0, 5000));
console.log('保存:', file);
process.exit(result.ok ? 0 : 1);
