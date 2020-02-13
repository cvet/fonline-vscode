"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
//import * as mkdirp from 'mkdirp';
//import * as rimraf from 'rimraf';
//#region Utilities
var _;
(function (_) {
    function handleResult(resolve, reject, error, result) {
        if (error) {
            reject(massageError(error));
        }
        else {
            resolve(result);
        }
    }
    function massageError(error) {
        if (error.code === 'ENOENT') {
            return vscode.FileSystemError.FileNotFound();
        }
        if (error.code === 'EISDIR') {
            return vscode.FileSystemError.FileIsADirectory();
        }
        if (error.code === 'EEXIST') {
            return vscode.FileSystemError.FileExists();
        }
        if (error.code === 'EPERM' || error.code === 'EACCESS') {
            return vscode.FileSystemError.NoPermissions();
        }
        return error;
    }
    function checkCancellation(token) {
        if (token.isCancellationRequested) {
            throw new Error('Operation cancelled');
        }
    }
    _.checkCancellation = checkCancellation;
    function normalizeNFC(items) {
        if (process.platform !== 'darwin') {
            return items;
        }
        if (Array.isArray(items)) {
            return items.map(item => item.normalize('NFC'));
        }
        return items.normalize('NFC');
    }
    _.normalizeNFC = normalizeNFC;
    function readdir(path) {
        return new Promise((resolve, reject) => {
            fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
        });
    }
    _.readdir = readdir;
    function stat(path) {
        return new Promise((resolve, reject) => {
            fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
        });
    }
    _.stat = stat;
    function readfile(path) {
        return new Promise((resolve, reject) => {
            fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
        });
    }
    _.readfile = readfile;
    function writefile(path, content) {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.writefile = writefile;
    function exists(path) {
        return new Promise((resolve, reject) => {
            fs.exists(path, exists => handleResult(resolve, reject, null, exists));
        });
    }
    _.exists = exists;
    function rmrf(path) {
        return new Promise((resolve, reject) => {
            //rimraf(path, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.rmrf = rmrf;
    function mkdir(path) {
        return new Promise((resolve, reject) => {
            //mkdirp(path, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.mkdir = mkdir;
    function rename(oldPath, newPath) {
        return new Promise((resolve, reject) => {
            fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.rename = rename;
    function unlink(path) {
        return new Promise((resolve, reject) => {
            fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
        });
    }
    _.unlink = unlink;
})(_ || (_ = {}));
class FileStat {
    constructor(fsStat) {
        this.fsStat = fsStat;
    }
    get type() {
        return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
    }
    get isFile() {
        return this.fsStat.isFile();
    }
    get isDirectory() {
        return this.fsStat.isDirectory();
    }
    get isSymbolicLink() {
        return this.fsStat.isSymbolicLink();
    }
    get size() {
        return this.fsStat.size;
    }
    get ctime() {
        return this.fsStat.ctime.getTime();
    }
    get mtime() {
        return this.fsStat.mtime.getTime();
    }
}
exports.FileStat = FileStat;
//#endregion
class FileSystemProvider {
    constructor(pattern) {
        this.pattern = pattern;
        this._onDidChangeFile = new vscode.EventEmitter();
    }
    get onDidChangeFile() {
        return this._onDidChangeFile.event;
    }
    watch(uri, options) {
        const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, (event, filename) => __awaiter(this, void 0, void 0, function* () {
            const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));
            // TODO support excludes (using minimatch library?)
            this._onDidChangeFile.fire([{
                    type: event === 'change' ? vscode.FileChangeType.Changed : (yield _.exists(filepath)) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
                    uri: uri.with({ path: filepath })
                }]);
        }));
        return { dispose: () => watcher.close() };
    }
    stat(uri) {
        return this._stat(uri.fsPath);
    }
    _stat(path) {
        return __awaiter(this, void 0, void 0, function* () {
            return new FileStat(yield _.stat(path));
        });
    }
    readDirectory(uri) {
        return this._readDirectory(uri);
    }
    _readDirectory(uri) {
        return __awaiter(this, void 0, void 0, function* () {
            const children = yield _.readdir(uri.fsPath);
            const result = [];
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const stat = yield this._stat(path.join(uri.fsPath, child));
                result.push([child, stat.type]);
            }
            return Promise.resolve(result);
        });
    }
    readDirectoryRecusivly(uri) {
        return this._readDirectoryRecursively(uri);
    }
    _readDirectoryRecursively(uri) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = [];
            this._readDirectoryRecursively2(uri.fsPath, result);
            return Promise.resolve(result);
        });
    }
    _readDirectoryRecursively2(fsPath, result) {
        return __awaiter(this, void 0, void 0, function* () {
            const children = yield _.readdir(fsPath);
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const stat = yield this._stat(path.join(fsPath, child));
                result.push([child, stat.type]);
                if (stat.type === vscode.FileType.Directory)
                    yield this._readDirectoryRecursively2(path.join(fsPath, child), result);
            }
        });
    }
    createDirectory(uri) {
        return _.mkdir(uri.fsPath);
    }
    readFile(uri) {
        return _.readfile(uri.fsPath);
    }
    writeFile(uri, content, options) {
        return this._writeFile(uri, content, options);
    }
    _writeFile(uri, content, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const exists = yield _.exists(uri.fsPath);
            if (!exists) {
                if (!options.create) {
                    throw vscode.FileSystemError.FileNotFound();
                }
                yield _.mkdir(path.dirname(uri.fsPath));
            }
            else {
                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists();
                }
            }
            return _.writefile(uri.fsPath, content);
        });
    }
    delete(uri, options) {
        if (options.recursive) {
            return _.rmrf(uri.fsPath);
        }
        return _.unlink(uri.fsPath);
    }
    rename(oldUri, newUri, options) {
        return this._rename(oldUri, newUri, options);
    }
    _rename(oldUri, newUri, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const exists = yield _.exists(newUri.fsPath);
            if (exists) {
                if (!options.overwrite) {
                    throw vscode.FileSystemError.FileExists();
                }
                else {
                    yield _.rmrf(newUri.fsPath);
                }
            }
            const parentExists = yield _.exists(path.dirname(newUri.fsPath));
            if (!parentExists) {
                yield _.mkdir(path.dirname(newUri.fsPath));
            }
            return _.rename(oldUri.fsPath, newUri.fsPath);
        });
    }
    // tree data provider
    getChildren(element) {
        return __awaiter(this, void 0, void 0, function* () {
            if (element) {
                const children = yield this.readDirectory(element.uri);
                return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
            }
            if (vscode.workspace.workspaceFolders) {
                const workspaceFolders = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file');
                let entries = [];
                for (let folder of workspaceFolders) {
                    //const fonlineWorkspace = workspaceFolders.indexOf(folder) == 0;
                    const children = yield this.readDirectoryRecusivly(folder.uri);
                    children.sort((a, b) => {
                        if (a[1] === b[1]) {
                            return a[0].localeCompare(b[0]);
                        }
                        return a[1] === vscode.FileType.Directory ? -1 : 1;
                    });
                    entries.push(...children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(folder.uri.fsPath, name)), type })));
                }
                return entries;
            }
            return [];
        });
    }
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        if (element.type === vscode.FileType.File) {
            treeItem.command = { command: 'fileExplorer.openFile', title: "Open File", arguments: [element.uri], };
            treeItem.contextValue = 'file';
        }
        return treeItem;
    }
}
exports.FileSystemProvider = FileSystemProvider;
class FileExplorer {
    constructor(context, pattern) {
        const treeDataProvider = new FileSystemProvider(pattern);
        this.fileExplorer = vscode.window.createTreeView('fileExplorer', { treeDataProvider });
        vscode.commands.registerCommand('fileExplorer.openFile', (resource) => this.openResource(resource));
    }
    openResource(resource) {
        vscode.window.showTextDocument(resource);
    }
}
exports.FileExplorer = FileExplorer;
//# sourceMappingURL=fileExplorer.js.map