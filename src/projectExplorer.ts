import * as vscode from 'vscode';
import * as fs from './fileSystem'
import * as config from './config'

interface Entry {
    uri: vscode.Uri;
    type: vscode.FileType;
}

let fileExplorer: vscode.TreeView<Entry>;

export async function init(context: vscode.ExtensionContext) {
    const entries: Entry[] = [];
    for (const files of config.files) {
        // ...
    }

    const treeDataProvider = new FileSystemProvider(entries);
    fileExplorer = vscode.window.createTreeView('projectExplorer', { treeDataProvider });
    vscode.commands.registerCommand('fileExplorer.openFile', (resource) => { vscode.window.showTextDocument(resource); });
}

class FileStat implements vscode.FileStat {
    constructor(private _st: fs.FileStat) {
    }

    get type(): vscode.FileType {
        return this._st.isFile() ? vscode.FileType.File :
            this._st.isDirectory() ? vscode.FileType.Directory :
                this._st.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
    }

    get isFile(): boolean | undefined {
        return this._st.isFile();
    }

    get isDirectory(): boolean | undefined {
        return this._st.isDirectory();
    }

    get isSymbolicLink(): boolean | undefined {
        return this._st.isSymbolicLink();
    }

    get size(): number {
        return this._st.size;
    }

    get ctime(): number {
        return this._st.ctime.getTime();
    }

    get mtime(): number {
        return this._st.mtime.getTime();
    }
}

class FileSystemProvider implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {
    private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;

    constructor(private _rootEntries: Entry[]) {
        this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    }

    get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
        return this._onDidChangeFile.event;
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
            const filepath = fs.joinPath(uri.fsPath, fs.normalizeNFC(filename.toString()));

            // TODO support excludes (using minimatch library?)

            this._onDidChangeFile.fire([{
                type: event === 'change' ? vscode.FileChangeType.Changed : await fs.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
                uri: uri.with({ path: filepath })
            } as vscode.FileChangeEvent]);
        });

        return { dispose: () => watcher.close() };
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return this._stat(uri.fsPath);
    }

    async _stat(path: string): Promise<vscode.FileStat> {
        return new FileStat(await fs.stat(path));
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return this._readDirectory(uri);
    }

    async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const children = await fs.readdir(uri.fsPath);
        const result: [string, vscode.FileType][] = [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const stat = await this._stat(fs.joinPath(uri.fsPath, child));
            result.push([child, stat.type]);
        }
        return Promise.resolve(result);
    }

    readDirectoryRecusivly(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return this._readDirectoryRecursively(uri);
    }

    async _readDirectoryRecursively(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const result: [string, vscode.FileType][] = [];
        this._readDirectoryRecursively2(uri.fsPath, result);
        return Promise.resolve(result);
    }

    async _readDirectoryRecursively2(fsPath: string, result: [string, vscode.FileType][]) {
        const children = await fs.readdir(fsPath);
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const stat = await this._stat(fs.joinPath(fsPath, child));
            result.push([child, stat.type]);
            if (stat.type === vscode.FileType.Directory)
                await this._readDirectoryRecursively2(fs.joinPath(fsPath, child), result);
        }
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        return fs.mkdir(uri.fsPath);
    }

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        return fs.readfile(uri.fsPath);
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
        return this._writeFile(uri, content, options);
    }

    async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
        const exists = await fs.exists(uri.fsPath);
        if (!exists) {
            if (!options.create) {
                throw vscode.FileSystemError.FileNotFound();
            }

            await fs.mkdir(fs.dirName(uri.fsPath));
        } else {
            if (!options.overwrite) {
                throw vscode.FileSystemError.FileExists();
            }
        }

        return fs.writefile(uri.fsPath, content as Buffer);
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
        if (options.recursive) {
            return fs.rmrf(uri.fsPath);
        }

        return fs.unlink(uri.fsPath);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        return this._rename(oldUri, newUri, options);
    }

    async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
        const exists = await fs.exists(newUri.fsPath);
        if (exists) {
            if (!options.overwrite) {
                throw vscode.FileSystemError.FileExists();
            } else {
                await fs.rmrf(newUri.fsPath);
            }
        }

        const parentExists = await fs.exists(fs.dirName(newUri.fsPath));
        if (!parentExists) {
            await fs.mkdir(fs.dirName(newUri.fsPath));
        }

        return fs.rename(oldUri.fsPath, newUri.fsPath);
    }

    // tree data provider

    async getChildren(element?: Entry): Promise<Entry[]> {
        if (element) {
            const children = await this.readDirectory(element.uri);
            children.sort((a, b) => {
                if (a[1] === b[1]) {
                    return a[0].localeCompare(b[0]);
                }
                return a[1] === vscode.FileType.Directory ? -1 : 1;
            });
            return children.map(([name, type]) => ({ uri: vscode.Uri.file(fs.joinPath(element.uri.fsPath, name)), type }));
        }
        return this._rootEntries;
    }

    getTreeItem(element: Entry): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (element.type === vscode.FileType.File) {
            treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
            treeItem.contextValue = 'file';
        }
        return treeItem;
    }
}
