// 読み取りだけの診断：版・動作モード・ワークスペース・チーム・フォルダ・プロジェクト一覧・開いている文書。
// 何も作らず、何も変更しない。
//   node diagnose-project-api.mjs
import { execute, health, saveLog } from './bridge.mjs';

const CODE = `
const out = {};
const t = async (k, f) => { try { out[k] = await f(); } catch (e) { out[k] = 'ERR ' + String(e); } };
await t('version', () => eda.sys_Environment.getEditorCurrentVersion());
await t('isClient', () => eda.sys_Environment.isClient?.());
await t('isHalfOffline', () => eda.sys_Environment.isHalfOfflineMode?.());
await t('isOffline', () => eda.sys_Environment.isOfflineMode?.());
await t('workspaces', () => eda.dmt_Workspace.getAllWorkspacesInfo());
await t('currentWorkspace', () => eda.dmt_Workspace.getCurrentWorkspaceInfo());
await t('teams', () => eda.dmt_Team.getAllTeamsInfo());
await t('currentTeam', () => eda.dmt_Team.getCurrentTeamInfo());
out.projectsByTeam = {};
for (const team of (Array.isArray(out.teams) ? out.teams : [])) {
  try {
    const ids = await eda.dmt_Project.getAllProjectsUuid(team.uuid);
    const infos = [];
    for (const id of ids || []) { try { infos.push(await eda.dmt_Project.getProjectInfo(id)); } catch (e) { infos.push({uuid: id, err: String(e)}); } }
    out.projectsByTeam[team.uuid] = infos;
  } catch (e) { out.projectsByTeam[team.uuid] = 'ERR ' + String(e); }
}
await t('currentProject', () => eda.dmt_Project.getCurrentProjectInfo());
await t('currentDocument', () => eda.dmt_SelectControl.getCurrentDocumentInfo());
return out;
`;

const h = await health();
const result = await execute(CODE);
const file = saveLog('diagnose', { health: h, result });
console.log(JSON.stringify(result, null, 1));
console.log('保存:', file);
