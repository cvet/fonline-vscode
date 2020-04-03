import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as config from './config';

interface ActionTreeEntry {
    label: string;
    command?: string;
    shellArgs?: string;
    children?: ActionTreeEntry[];
}

export async function init(context: vscode.ExtensionContext) {
    const actions: ActionTreeEntry[] = [];

    for (const actionEntry of config.actions) {
        const label = actionEntry.label;
        console.log('register', label);

        let shellArgs: string | undefined;
        if (actionEntry.command) {
            const foRoot = config.fonlineWslPath;
            const foWorkspace = config.workspaceWslPath;
            const foCMake = config.cmakeContribWslPath;
            const env = `export FO_ROOT=${foRoot}; export FO_WORKSPACE=${foWorkspace}; export FO_CMAKE_CONTRIBUTION=${foCMake}`;
            shellArgs = `${env}; ${actionEntry.command}; read -p "Press enter to close terminal..."`;
        }

        const commandName = 'extension.' + label.substr(0, 1).toLowerCase() + label.replace(/ /g, '').substr(1);
        context.subscriptions.push(vscode.commands.registerCommand(commandName, () => {
            for (const terminal of vscode.window.terminals) {
                if (terminal.name == label) {
                    console.log('skip run', commandName);
                    return;
                }
            }
            console.log('run', commandName);
            const actionInstance = vscode.window.createTerminal({
                name: label,
                shellPath: config.wslShellPath,
                shellArgs: shellArgs,
                cwd: config.fonlinePath,
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
                command: commandName,
                shellArgs: shellArgs
            });
        }
    }

    const actionsTree = vscode.window.createTreeView('fonline-actions', { treeDataProvider: new ActionTree(actions) });
    context.subscriptions.push(actionsTree);
}

export async function execute(command: string, ...shellArgs: string[]): Promise<number> {
    const foRoot = config.fonlineWslPath;
    const foWorkspace = config.workspaceWslPath;
    const env = `export FO_ROOT=${foRoot}; export FO_WORKSPACE=${foWorkspace}`;

    let exitCode: number | undefined;
    childProcess.exec(`wsl ${env}; ${command}`, {
        cwd: config.fonlinePath,
        windowsHide: true
    }, (error: childProcess.ExecException | null, stdout: string, stderr: string) => {
        exitCode = error ? error.code : 0;
        console.log('execute', command, exitCode)
    });

    while (exitCode === undefined) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return exitCode;
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
            tooltip: `Open ${element.label}`,
            collapsibleState: element.children ? vscode.TreeItemCollapsibleState.Collapsed : undefined,
            command: element.command ? { command: element.command, title: element.label } : undefined
        }
    }
}
