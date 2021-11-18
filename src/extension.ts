import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as config from './config'
import * as actions from './actions'
import * as projectExplorer from './projectExplorer'
import * as fs from './fileSystem'

export function activate(context: vscode.ExtensionContext) {
  try {
    init(context);

    context.subscriptions.push(
      vscode.commands.registerCommand('extension.run', () => {
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
}

let compileOutput: vscode.OutputChannel;
let compiling = false;
async function compile() {
  if (compiling)
    return;
  compiling = true;

  vscode.commands.executeCommand('workbench.action.files.saveAll');

  if (compileOutput === undefined)
    compileOutput = vscode.window.createOutputChannel('Compile');
  compileOutput.clear();
  compileOutput.append('Compiling source code');
  compileOutput.show(true);

  const shell = 'C:\\Windows\\system32\\cmd.exe /C';
  const cwd = fs.joinPath(config.workspacePath, 'compilation-env');
  const command = 'cmake --build . --config RelWithDebInfo -- -nologo -m'

  let result: string | undefined;
  childProcess.exec(`${shell} "${command}"`, {
    cwd: cwd,
    windowsHide: true
  }, (error: childProcess.ExecException | null, stdout: string, stderr: string) => {
    if (error && error.code != 0) {
      result = stdout;
    } else {
      result = '';
    }
  });

  while (result === undefined) {
    await new Promise(r => setTimeout(r, 500));
    compileOutput.append('.');
  }

  compileOutput.clear();
  if (result.length == 0) {
    compileOutput.append('Compilation successful!');
  } else {
    result = result.replace(/.*(->).*\r\n/g, '');
    result = result.replace(/\[.*\\/g, '[');
    result = result.replace(/\.vcxproj]/g, ']');
    compileOutput.append(result);
  }

  compiling = false;
}
