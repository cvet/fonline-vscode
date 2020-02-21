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
      vscode.commands.registerCommand('extension.compile', () => {
        compile();
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
    const workspaceStatus = await actions.execute('BuildTools/prepare-workspace.sh all check');
    if (workspaceStatus != 0) {
      let message: string;
      if (workspaceStatus == 10)
        message = 'Workspace is not created or outdated';
      else
        message = 'Can\'t determine workspace state';

      vscode.window.showErrorMessage(message, 'Prepare Workspace').then((value?: string) => {
        if (value === 'Prepare Workspace')
          vscode.commands.executeCommand('extension.prepareWorkspace');
      });
    }
  }
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
