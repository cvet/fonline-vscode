import * as vscode from 'vscode';
import * as fs from './fileSystem'

export const wslShellPath: string = 'C:\\Windows\\System32\\wsl.exe';
export let fonlinePath: string = '';
export let fonlineWslPath: string;
export let workspacePath: string = 'Workspace';
export let workspaceWslPath: string;
export const files: { label: string, path: string, pattern: string }[] = [];
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
                    foPath = fs.joinPath(folder.uri.fsPath, foPath);
                    break;
                }
            }
        }
    }
    if (!foPath) {
        foPath = vscode.workspace.getConfiguration('fonline').get<string>('path');
    }
    if (!foPath) {
        foPath = process.env.FONLINE_PATH;
        if (foPath)
            console.log('FONLINE_PATH', foPath);
    }
    if (!foPath && fs.exists('setup.ps1') && fs.exists('fonline.json')) {
        foPath = fs.resolvePath('.');
    }
    if (!foPath) {
        vscode.window.showErrorMessage('FOnline Engine not found', 'Specify path').then((answer?: string) => {
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

        if (json.files) {
            for (const f of json.files) {
                files.push({
                    label: f.label,
                    path: fs.joinPath(fs.dirName(filePath), f.path),
                    pattern: f.pattern
                })
            }
        }

        if (json.actions) {
            for (const action of json.actions) {
                actions.push({
                    label: action.label,
                    group: action.group,
                    command: action.command
                });
            }
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
