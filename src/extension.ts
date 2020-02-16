import * as vscode from 'vscode';
import * as config from './config'
import * as actions from './actions'
import * as projectExplorer from './projectExplorer'

export function activate(context: vscode.ExtensionContext) {
  try {
    init(context);

    context.subscriptions.push(
      vscode.commands.registerCommand('extension.run', () => {
      }));

    context.subscriptions.push(
      vscode.commands.registerCommand('extension.compile', () => {
      }));

    context.subscriptions.push(
      vscode.commands.registerCommand('extension.build', () => {
      }));
  } catch (error) {
    vscode.window.showErrorMessage(error);
  }
}

export function deactivate() {
  // ...
}

async function init(context: vscode.ExtensionContext) {
  await config.init(context);
  await actions.init(context);
  // await projectExplorer.init(context);
  await checkReadiness();
}

async function checkReadiness(): Promise<void> {
  if (await actions.execute('echo') != 0) {
    const message = 'Windows Subsystem for Linux is not installed (required WSL2 and Ubuntu-18.04 as distro)';
    vscode.window.showErrorMessage(message, 'WSL Installation Guide').then((value?: string) => {
      if (value === 'WSL Installation Guide')
        vscode.env.openExternal(vscode.Uri.parse('https://docs.microsoft.com/en-us/windows/wsl/wsl2-install'));
    });
  } else {
    const workspaceStatus = await actions.execute('BuildTools/check-workspace.sh');
    if (workspaceStatus != 0) {
      let message: string;
      if (workspaceStatus == 10)
        message = 'Workspace is not created';
      else if (workspaceStatus == 11)
        message = 'Workspace is outdated';
      else
        message = 'Can\'t determine workspace state';

      vscode.window.showErrorMessage(message, 'Prepare Workspace').then((value?: string) => {
        if (value === 'Prepare Workspace')
          vscode.commands.executeCommand('extension.prepareWorkspace');
      });
    }
  }
}
