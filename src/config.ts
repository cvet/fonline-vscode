import * as vscode from 'vscode';
import * as fs from './fileSystem'

export enum BuildEnv {
    Win,
    Linux,
    Mac,
}

export let buildEnv = BuildEnv.Win;
export let isRemoteDev = false;
export let isEngineDev = false;
export let fonlinePath: string;
export let workspacePath: string = 'Workspace';
export let cmakeContribPath: string;
export const content: { label: string, path: string, type: string }[] = [];
export const resources: { label: string, path: string, type: string }[] = [];
export const actions: { label?: string, group?: string, command?: string, env?: string }[] = [];

export async function init(context: vscode.ExtensionContext) {
    isRemoteDev = vscode.env.remoteName !== undefined;

    // Detect env
    if (process.platform == 'win32') {
        buildEnv = BuildEnv.Win;
    }
    else if (process.platform == 'darwin') {
        buildEnv = BuildEnv.Mac;
    }
    else {
        buildEnv = BuildEnv.Linux;
    }

    // Evaluate workspace path
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.scheme == 'file') {
        workspacePath = fs.joinPath(vscode.workspace.workspaceFolders[0].uri.fsPath, workspacePath);
    }
    else {
        workspacePath = fs.resolvePath(workspacePath);
    }

    console.log('workspacePath', workspacePath);

    // Evaluate fonline path
    while (fonlinePath === undefined || cmakeContribPath === undefined) {
        let foPath: string | undefined;
        let foCMake: string | undefined;
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                if (folder.uri.scheme == 'file') {
                    foPath = vscode.workspace.getConfiguration('fonline', folder).get<string>('path');
                    if (foPath) {
                        isEngineDev = foPath == '.';
                        foPath = fs.resolvePath(fs.joinPath(folder.uri.fsPath, foPath));
                        console.log('take fonline path from workspace folder', foPath);
                    }
                    foCMake = vscode.workspace.getConfiguration('fonline', folder).get<string>('cmake');
                    if (foCMake) {
                        foCMake = fs.resolvePath(fs.joinPath(folder.uri.fsPath, foCMake));
                        console.log('take fonline cmake path from workspace folder', foCMake);
                    }
                    break;
                }
            }
        }

        if (!foPath) {
            await vscode.window.showErrorMessage('FOnline Engine repository path is not specified', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path') {
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
                }
            });
        } else if (!await fs.exists(fs.joinPath(foPath, 'BuildTools'))) {
            await vscode.window.showErrorMessage('Invalid FOnline Engine repository path', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path') {
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
                }
            });
        } else if (!foCMake) {
            await vscode.window.showErrorMessage('CMake contribution file is not specified', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path') {
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
                }
            });
        } else if (!await fs.exists(foCMake)) {
            await vscode.window.showErrorMessage('Invalid CMake contribution file is not exist', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path') {
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
                }
            });
        } else {
            fonlinePath = foPath;
            cmakeContribPath = foCMake;
        }
    }

    console.log('fonlinePath', fonlinePath);
    console.log('cmakeContribPath', cmakeContribPath);

    // Collect engine configs
    async function applyConfig(filePath: string) {
        console.log('apply config', filePath);

        const buf = await fs.readfile(filePath);
        const json = JSON.parse(buf.toString());

        if (json.content) {
            const newContent = [];
            for (const e of json.content) {
                newContent.push({
                    label: e.label,
                    path: fs.joinPath(fs.dirName(filePath), e.path),
                    type: e.type
                });
            }
            content.unshift(...newContent);
        }

        if (json.resources) {
            const newResources = [];
            for (const e of json.resources) {
                newResources.push({
                    label: e.label,
                    path: fs.joinPath(fs.dirName(filePath), e.path),
                    type: e.type
                });
            }
            resources.unshift(...newResources);
        }

        if (json.actions) {
            const newActions = [];
            for (const action of json.actions) {
                newActions.push({
                    label: action.label,
                    group: action.group,
                    command: action.command,
                    env: action.env
                });
            }
            actions.unshift(...newActions);
        }
    }

    await applyConfig(fs.joinPath(fonlinePath, 'BuildTools', 'vscode-config.json'))

    if (vscode.workspace.workspaceFolders) {
        const configPattern = new RegExp(/fonline.*\.json/);
        for (const folder of vscode.workspace.workspaceFolders) {
            if (folder.uri.scheme == 'file') {
                for (const dirEntry of await fs.readdir(folder.uri.fsPath)) {
                    if (configPattern.test(fs.joinPath(folder.uri.fsPath, dirEntry))) {
                        await applyConfig(fs.joinPath(folder.uri.fsPath, dirEntry));
                    }
                }
            }
        }
    }
}
