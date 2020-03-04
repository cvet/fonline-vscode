import * as vscode from 'vscode';
import * as fs from './fileSystem'

export const wslShellPath: string = 'C:\\Windows\\System32\\wsl.exe';
export let fonlinePath: string = '';
export let fonlineWslPath: string;
export let workspacePath: string = 'Workspace';
export let workspaceWslPath: string;
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
    let foPath: string | undefined;
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            if (folder.uri.scheme == 'file') {
                foPath = vscode.workspace.getConfiguration('fonline', folder).get<string>('path');
                if (foPath) {
                    console.log('take fonline path from workspace folder');
                    foPath = fs.joinPath(folder.uri.fsPath, foPath);
                    break;
                }
            }
        }
    }
    if (!foPath) {
        foPath = vscode.workspace.getConfiguration('fonline').get<string>('path');
        if (foPath) {
            console.log('take fonline path from workspace');
        }
    }
    if (!foPath) {
        foPath = process.env.FONLINE_PATH;
        if (foPath) {
            console.log('take fonline path from env var');
        }
    }
    if (!foPath && await fs.exists('setup.ps1') && await fs.exists('fonline.json')) {
        console.log('take fonline path from cur dir');
        foPath = fs.resolvePath('.');
    }
    if (!foPath && await fs.exists('../../setup.ps1') && await fs.exists('../../fonline.json')) {
        console.log('take fonline path from dir two steps outside');
        foPath = fs.resolvePath('../../');
    }
    if (!foPath) {
        await vscode.window.showErrorMessage('FOnline Engine not found', 'Specify path').then((answer?: string) => {
            if (answer === 'Specify path')
                vscode.commands.executeCommand('workbench.action.openGlobalSettings');
        });
    } else {
        if (!fs.isAbsolutePath(foPath))
            foPath = fs.resolvePath(foPath);
        fonlinePath = foPath;
    }
    fonlineWslPath = winToWslPath(fonlinePath);
    console.log('fonlinePath', fonlinePath, fonlineWslPath);

    // Collect engine configs
    const configPattern = new RegExp(/fonline.*\.json/);
    const appliedFiles = new Set<string>();

    async function applyFile(filePath: string) {
        if (appliedFiles.has(filePath))
            return;

        appliedFiles.add(filePath);
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
                    command: action.command
                });
            }
            actions.unshift(...newActions);
        }
    }

    console.log('check engine folder', fonlinePath);
    for (const dirEntry of await fs.readdir(fonlinePath)) {
        if (configPattern.test(fs.joinPath(fonlinePath, dirEntry))) {
            await applyFile(fs.joinPath(fonlinePath, dirEntry));
        }
    }

    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            console.log('check workspace folder', folder.name, folder.uri.scheme);
            if (folder.uri.scheme == 'file') {
                for (const dirEntry of await fs.readdir(folder.uri.fsPath)) {
                    if (configPattern.test(fs.joinPath(folder.uri.fsPath, dirEntry))) {
                        await applyFile(fs.joinPath(folder.uri.fsPath, dirEntry));
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
