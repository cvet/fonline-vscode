import * as vscode from 'vscode';
import * as fs from './fileSystem'

export const wslShellPath: string = 'C:\\Windows\\System32\\wsl.exe';
export let fonlinePath: string | undefined;
export let fonlineWslPath: string | undefined;
export let workspacePath: string = 'Workspace';
export let workspaceWslPath: string;
export let cmakeContribPath: string | undefined;
export let cmakeContribWslPath: string | undefined;
export const content: { label: string, path: string, type: string }[] = [];
export const resources: { label: string, path: string, type: string }[] = [];
export const actions: { label: string, group: string, command?: string }[] = [];

export async function init(context: vscode.ExtensionContext) {
    // Evaluate workspace path
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.scheme == 'file')
        workspacePath = fs.joinPath(vscode.workspace.workspaceFolders[0].uri.fsPath, workspacePath);
    else
        workspacePath = fs.resolvePath(workspacePath);
    workspaceWslPath = winToWslPath(workspacePath);
    console.log('workspacePath', workspacePath, workspaceWslPath);

    // Evaluate fonline path
    while (fonlinePath === undefined || cmakeContribPath === undefined) {
        let foPath: string | undefined;
        let foCMake: string | undefined;
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                if (folder.uri.scheme == 'file') {
                    foPath = vscode.workspace.getConfiguration('fonline', folder).get<string>('path');
                    if (foPath) {
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
                if (answer === 'Specify path')
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
            });
        } else if (!await fs.exists(fs.joinPath(foPath, 'fonline-setup.ps1'))) {
            await vscode.window.showErrorMessage('Invalid FOnline Engine repository path', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path')
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
            });
        } else if (!foCMake) {
            await vscode.window.showErrorMessage('CMake contribution file is not specified', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path')
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
            });
        } else if (!await fs.exists(foCMake)) {
            await vscode.window.showErrorMessage('Invalid CMake contribution file is not exist', 'Specify path').then((answer?: string) => {
                if (answer === 'Specify path')
                    vscode.commands.executeCommand('workbench.action.openGlobalSettings');
            });
        } else {
            fonlinePath = foPath;
            cmakeContribPath = foCMake;
        }
    }

    fonlineWslPath = winToWslPath(fonlinePath);
    console.log('fonlinePath', fonlinePath, fonlineWslPath);
    cmakeContribWslPath = winToWslPath(cmakeContribPath);
    console.log('cmakeContribPath', cmakeContribPath, cmakeContribWslPath);

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
                console.log(action);
                newActions.push({
                    label: action.label,
                    group: action.group,
                    command: action.command
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

function winToWslPath(winPath: string): string {
    let wslPath = winPath;
    if (wslPath[1] == ':')
        wslPath = '/mnt/' + wslPath[0].toLowerCase() + wslPath.substr(2);
    wslPath = wslPath.replace(/\\/g, '/');
    return wslPath;
}
