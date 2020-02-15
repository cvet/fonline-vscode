import * as vscode from 'vscode';
import * as config from './config'

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
            const env = `export FO_ROOT=${foRoot}; export FO_WORKSPACE=${foWorkspace}; export FO_INSTALL_PACKAGES=0`;;
            shellArgs = `${env}; ${actionEntry.command}; read -p "Press enter to close action..."`;
        }

        const commandName = 'extension.' + label.substr(0, 1).toLowerCase() + label.replace(/ /g, '').substr(1);
        context.subscriptions.push(vscode.commands.registerCommand(commandName, () => {
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

    context.subscriptions.push(vscode.window.createTreeView('actionManager', { treeDataProvider: new ActionTree(actions) }));
}

export async function execute(label: string, ...shellArgs: string[]): Promise<number> {
    const action = vscode.window.createTerminal({
        name: label,
        shellPath: config.wslShellPath,
        shellArgs: shellArgs.concat('exit'),
        cwd: config.fonlinePath,
        hideFromUser: true
    });

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    while (action.exitStatus === undefined)
        await sleep(5);

    return action.exitStatus.code ?? -1;
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
            collapsibleState: element.children ? vscode.TreeItemCollapsibleState.Collapsed : undefined,
            command: element.command ? { command: element.command, title: element.label } : undefined
        }
    }
}
