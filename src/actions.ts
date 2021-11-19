import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as config from './config';

interface ActionTreeEntry {
    label: string;
    command?: string;
    children?: ActionTreeEntry[];
}

export async function init(context: vscode.ExtensionContext) {
    const actions: ActionTreeEntry[] = [];

    for (const actionEntry of config.actions) {
        if (actionEntry.label === undefined || actionEntry.group === undefined ||
            actionEntry.command === undefined || actionEntry.env === undefined) {
            continue;
        }

        if ((config.buildEnv == config.BuildEnv.Win && !actionEntry.env.includes('win') && !actionEntry.env.includes('wsl')) ||
            (config.buildEnv == config.BuildEnv.Linux && !actionEntry.env.includes('linux')) ||
            (config.buildEnv == config.BuildEnv.Mac && !actionEntry.env.includes('mac'))) {
            continue;
        }

        if (config.isRemoteDev && actionEntry.env.includes('noremote')) {
            continue;
        }

        if (!config.isEngineDev && actionEntry.env.includes('engine')) {
            continue;
        }

        const wslCall = config.buildEnv == config.BuildEnv.Win && actionEntry.env.includes('wsl');

        let shellPath: string | undefined;
        if (config.buildEnv == config.BuildEnv.Win) {
            if (wslCall) {
                shellPath = 'C:\\Windows\\System32\\wsl.exe';
            }
            else {
                shellPath = 'C:\\Windows\\System32\\WindowsPowershell\\v1.0\\powershell.exe';
            }
        }
        else {
            shellPath = 'bash';
        }

        let shellArgs: string | string[];
        if (config.buildEnv == config.BuildEnv.Win) {
            if (wslCall) {
                const foRoot = winToWslPath(config.fonlinePath);
                const foWorkspace = winToWslPath(config.workspacePath);
                const foCMake = winToWslPath(config.cmakeContribPath);
                const env = `export FO_ROOT=${foRoot}; export FO_WORKSPACE=${foWorkspace}; export FO_CMAKE_CONTRIBUTION=${foCMake}`;
                shellArgs = `${env}; ${actionEntry.command}; read -p "Press enter to close terminal..."`;
            }
            else {
                shellArgs = `Invoke-Command -ScriptBlock { ${actionEntry.command} }; pause "Press any key to close terminal..."`;
            }
        }
        else {
            shellArgs = ['-c', `${actionEntry.command}; read -p "Press enter to close terminal..."`];
        }

        const label = actionEntry.label;
        console.log('register', label);

        const commandName = 'extension.' + label.substr(0, 1).toLowerCase() + label.replace(/ /g, '').substr(1);

        context.subscriptions.push(vscode.commands.registerCommand(commandName, () => {
            for (const terminal of vscode.window.terminals) {
                if (terminal.name == label) {
                    console.log('skip run', commandName);
                    return;
                }
            }

            console.log('run', commandName);
            console.log('run command', actionEntry.command);
            console.log('run cwd', config.fonlinePath);

            const actionInstance = vscode.window.createTerminal({
                name: label,
                shellPath: shellPath,
                shellArgs: shellArgs,
                cwd: config.fonlinePath,
                env: { 'FO_ROOT': config.fonlinePath, 'FO_WORKSPACE': config.workspacePath, 'FO_CMAKE_CONTRIBUTION': config.cmakeContribPath },
                hideFromUser: false
            });

            actionInstance.show();
        }));

        let rootEntry = actions.find((value: ActionTreeEntry) => {
            return value.label == actionEntry.group;
        });

        if (!rootEntry) {
            rootEntry = { label: actionEntry.group, children: [] };
            actions.push(rootEntry);
        }

        if (rootEntry.children) {
            rootEntry.children.push({
                label: label,
                command: commandName
            });
        }
    }

    const actionsTree = vscode.window.createTreeView('fonline-actions', { treeDataProvider: new ActionTree(actions) });
    context.subscriptions.push(actionsTree);
}

class ActionTree implements vscode.TreeDataProvider<ActionTreeEntry> {
    constructor(private _actions: ActionTreeEntry[]) {
    }

    getChildren(element?: ActionTreeEntry): ActionTreeEntry[] {
        return element ? element.children ?? [] : this._actions;
    }

    getTreeItem(element: ActionTreeEntry): vscode.TreeItem {
        return {
            label: element.label,
            tooltip: `Run ${element.label}`,
            collapsibleState: element.children ? vscode.TreeItemCollapsibleState.Collapsed : undefined,
            command: element.command ? { command: element.command, title: element.label } : undefined
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
