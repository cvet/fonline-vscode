import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';

let fonlinePath: string = '';
let workspacePath: string = 'Workspace';
const wslShellPath: string = 'C:\\Windows\\System32\\wsl.exe';

interface TerminalEntry {
    label: string;
    command: string;
    shellArgs?: string;
}

export function init(context: vscode.ExtensionContext) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.scheme == 'file')
        workspacePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, workspacePath);
    else
        workspacePath = path.resolve(workspacePath);
    console.log('workspacePath: ' + workspacePath);

    let foPath: string | undefined;
    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            if (folder.uri.scheme == 'file') {
                foPath = vscode.workspace.getConfiguration('fonline', folder).get<string>('path');
                if (foPath) {
                    foPath = path.join(folder.uri.fsPath, foPath);
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
            console.log('FONLINE_PATH: ' + foPath);
    }
    if (!foPath) {
        vscode.window.showErrorMessage('FOnline Engine not found', 'Specify path').then((answer?: string) => {
            if (answer === 'Specify path')
                vscode.commands.executeCommand('workbench.action.openGlobalSettings');
        });
    } else {
        if (!path.isAbsolute(foPath))
            foPath = path.resolve(foPath);
        fonlinePath = foPath;
        console.log('fonlinePath: ' + fonlinePath);
    }

    const terminals: TerminalEntry[] = [];
    const tree = vscode.window.createTreeView('terminalManager', { treeDataProvider: new TerminalTree(terminals) });
    context.subscriptions.push(tree);

    function applyCommands(commandsFileContent: string) {
        const commandsJson = JSON.parse(commandsFileContent);

        const newTerminals: TerminalEntry[] = commandsJson.map((terminal: any) => {
            if (terminal.command) {
                const foRoot = winToWslPath(fonlinePath);
                const foWorkspace = winToWslPath(workspacePath);
                const env = `export FO_ROOT=${foRoot}; export FO_WORKSPACE=${foWorkspace}; export FO_INSTALL_PACKAGES=0`;;
                terminal.shellArgs = `${env}; ${terminal.command}; read -p "Press enter to close terminal..."`;
            }
            terminal.command = 'extension.' + terminal.label.substr(0, 1).toLowerCase() + terminal.label.replace(/ /g, '').substr(1);
            return terminal;
        });

        for (const terminal of newTerminals) {
            console.log('register ' + terminal.command);
            const cmd = vscode.commands.registerCommand(terminal.command, () => {
                console.log('run ' + terminal.command);
                const terminalInstance = vscode.window.createTerminal({
                    name: terminal.label,
                    shellPath: wslShellPath,
                    shellArgs: terminal.shellArgs,
                    cwd: fonlinePath,
                    hideFromUser: false
                });
                terminalInstance.show();
            });
            context.subscriptions.push(cmd);
        }

        terminals.push(...newTerminals);
    }

    const fonlineCommandsFilePath = path.join(fonlinePath, 'fonline-commands.json');
    fs.exists(fonlineCommandsFilePath, (exists: boolean) => {
        if (exists) {
            console.log('applyCommands from engine: ' + fonlineCommandsFilePath);
            applyCommands(fs.readFileSync(fonlineCommandsFilePath).toString());
        }
    });

    if (vscode.workspace.workspaceFolders) {
        for (const folder of vscode.workspace.workspaceFolders) {
            console.log('check workspace folder ' + folder.name);
            if (folder.uri.scheme == 'file') {
                const commandsFilePath = path.join(folder.uri.fsPath, 'fonline-commands.json');
                if (commandsFilePath != fonlineCommandsFilePath) {
                    fs.exists(commandsFilePath, (exists: boolean) => {
                        if (exists) {
                            console.log('applyCommands from: ' + commandsFilePath);
                            applyCommands(fs.readFileSync(commandsFilePath).toString());
                        }
                    });
                }
            }
        }
    }
}

export async function execute(label: string, ...shellArgs: string[]): Promise<number> {
    const terminal = vscode.window.createTerminal({
        name: label,
        shellPath: wslShellPath,
        shellArgs: shellArgs.concat('exit'),
        cwd: fonlinePath,
        hideFromUser: true
    });

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    while (terminal.exitStatus === undefined)
        await sleep(5);

    return terminal.exitStatus.code ?? -1;
}

class TerminalTree implements vscode.TreeDataProvider<TerminalEntry> {
    constructor(private terminals: TerminalEntry[]) {
    }

    getChildren(element?: TerminalEntry): TerminalEntry[] {
        return element ? [] : this.terminals;
    }

    getTreeItem(element: TerminalEntry): vscode.TreeItem {
        return {
            label: element.label,
            command: { command: element.command, title: element.label }
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
