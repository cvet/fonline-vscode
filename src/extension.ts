import * as vscode from 'vscode';

// import * as build from './build';
import * as fileExplorer from './fileExplorer';
import * as commands from './commands'
import * as status from './status'

export function activate(context: vscode.ExtensionContext) {
  try {
    commands.init(context);
    status.check(context);

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
