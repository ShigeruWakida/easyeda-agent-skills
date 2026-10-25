// createProject の再試験（ファイルを作る可能性があるので --yes が必要）。
// EasyEDA Pro 3.2.209 では、本体の MK.createProject が path を void 0 で送るため失敗する（README.md §2）。
// 新しい版で直ったかを確かめるときに使う。
//   node test-create-project.mjs                 # 何をするか表示するだけ
//   node test-create-project.mjs --yes [teamUuid]
import { execute, saveLog } from './bridge.mjs';

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const team = args.find((a) => !a.startsWith('--')) ?? null;
const name = `ApiTest-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now() % 100000}`;
const plan = { friendlyName: name, projectName: name.toLowerCase(), teamUuid: team, fileFormat: 'eprj3' };
console.log('作るもの:', plan);
if (!yes) {
  console.log('実行しない（--yes を付けると実行する）。');
  process.exit(0);
}
const code = `
const r = {};
try {
  r.uuid = await eda.dmt_Project.createProject(${JSON.stringify(plan.friendlyName)}, ${JSON.stringify(plan.projectName)},
    ${team ? JSON.stringify(team) : 'undefined'}, undefined, 'API test (RoboScope)', undefined, 'eprj3');
} catch (e) { r.error = String(e); }
r.version = eda.sys_Environment.getEditorCurrentVersion();
return r;
`;
const result = await execute(code);
const file = saveLog('test-create-project', { plan, result });
console.log(result, '\n保存:', file);
console.log(result.uuid ? '成功：verify-open-project.mjs で開けるか確かめる' : '失敗（undefined）。EasyEDA の logs\\warn を見る');
