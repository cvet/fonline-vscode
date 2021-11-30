import * as vscode from 'vscode';
import * as fs from './fileSystem'
import * as config from './config'

interface Entry {
    label: string,
    uri?: vscode.Uri;
    children?: Entry[];
}

export async function init(context: vscode.ExtensionContext) {
    async function fill(files: { label: string, path: string, type: string }[], recursive: boolean): Promise<Entry[]> {
        const rootEntries: Entry[] = [];
        for (const f of files) {
            const entries: Entry[] = [];
            async function readRecursively(path: string) {
                for (const child of await fs.readdir(path)) {
                    const stat = await fs.stat(fs.joinPath(path, child));
                    if (stat.isDirectory()) {
                        if (recursive) {
                            await readRecursively(fs.joinPath(path, child));
                        }
                    }
                    else {
                        entries.push({ label: child, uri: vscode.Uri.file(fs.joinPath(path, child)) });
                    }
                }
            }
            await readRecursively(f.path);
            if (entries.length > 0) {
                rootEntries.push({ label: f.label, children: entries });
            }
        }
        return rootEntries;
    }

    const contentTree = vscode.window.createTreeView('fonlineContent', { treeDataProvider: new FileSystemProvider(await fill(config.content, false)) });
    context.subscriptions.push(contentTree);
    const resourcesTree = vscode.window.createTreeView('fonlineResources', { treeDataProvider: new FileSystemProvider(await fill(config.resources, true)) });
    context.subscriptions.push(resourcesTree);

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
            return element.children ?? [];
        }
        return this._rootEntries;
    }

    getTreeItem(element: Entry): vscode.TreeItem {
        if (element.children) {
            return {
                label: element.label,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            }
        } else {
            return {
                label: element.label,
                command: { command: 'fileExplorer.openFile', title: 'Open File', arguments: [element.uri] }
            }
        }
    }
}
