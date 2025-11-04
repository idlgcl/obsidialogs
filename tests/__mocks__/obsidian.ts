export class TFile {
    basename: string;
    extension: string;
    path: string;
    name: string;
    parent: any;
    vault: any;
    stat: any;

    constructor(
        basename: string = "test",
        extension: string = "md",
        path: string = "test.md",
    ) {
        this.basename = basename;
        this.extension = extension;
        this.path = path;
        this.name = `${basename}.${extension}`;
        this.parent = null;
        this.vault = null;
        this.stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
    }
}

export class Vault {
    private files: Map<string, TFile> = new Map();

    async read(file: TFile): Promise<string> {
        return "";
    }

    async modify(file: TFile, data: string): Promise<void> {
        // mock implementation
    }

    async create(path: string, data: string): Promise<TFile> {
        const file = new TFile(
            path.replace(/\.\w+$/, ""),
            path.split(".").pop() || "md",
            path,
        );
        this.files.set(path, file);
        return file;
    }

    async createFolder(path: string): Promise<void> {
        // mock implementation
    }

    async delete(file: TFile): Promise<void> {
        this.files.delete(file.path);
    }

    getAbstractFileByPath(path: string): TFile | null {
        return this.files.get(path) || null;
    }

    getFiles(): TFile[] {
        return Array.from(this.files.values());
    }

    adapter = {
        exists: jest.fn().mockResolvedValue(true),
        mkdir: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue(""),
        write: jest.fn().mockResolvedValue(undefined),
    };
}

export class MetadataCache {
    getFileCache(file: TFile): any {
        return null;
    }

    getCache(path: string): any {
        return null;
    }
}

export class WorkspaceLeaf {
    view: any = null;

    async setViewState(viewState: any): Promise<void> {
        // mock implementation
    }

    detach(): void {
        // mock implementation
    }

    getViewState(): any {
        return {};
    }
}

export class Workspace {
    private leaves: WorkspaceLeaf[] = [];
    private activeFile: TFile | null = null;
    rightSplit = {
        expand: jest.fn(),
    };

    on(event: string, callback: (...args: any[]) => void): any {
        return { unload: () => {} };
    }

    getActiveFile(): TFile | null {
        return this.activeFile;
    }

    setActiveFile(file: TFile | null): void {
        this.activeFile = file;
    }

    getLeaf(newLeaf?: boolean | "split" | "tab" | "window"): WorkspaceLeaf {
        const leaf = new WorkspaceLeaf();
        this.leaves.push(leaf);
        return leaf;
    }

    getRightLeaf(newLeaf?: boolean): WorkspaceLeaf {
        const leaf = new WorkspaceLeaf();
        this.leaves.push(leaf);
        return leaf;
    }

    getLeavesOfType(type: string): WorkspaceLeaf[] {
        return [];
    }

    getActiveViewOfType<T>(type: any): T | null {
        return null;
    }

    openLinkText(
        linktext: string,
        sourcePath: string,
        newLeaf?: boolean,
        openViewState?: any,
    ): Promise<void> {
        return Promise.resolve();
    }
}

export class App {
    vault: Vault;
    workspace: Workspace;
    metadataCache: MetadataCache;
    hotkeyManager: any;
    fileManager: any;

    constructor() {
        this.vault = new Vault();
        this.workspace = new Workspace();
        this.metadataCache = new MetadataCache();
        this.hotkeyManager = {
            defaultKeys: {},
        };
        this.fileManager = {
            trashFile: jest.fn(),
        };
    }
}

export class Plugin {
    app: App;
    manifest: any;

    constructor(app: App, manifest?: any) {
        this.app = app;
        this.manifest = manifest || {
            id: "test-plugin",
            name: "Test Plugin",
            version: "1.0.0",
        };
    }

    addCommand(command: any): void {
        // mock implementation
    }

    registerEvent(event: any): void {
        // mock implementation
    }

    registerView(
        type: string,
        viewCreator: (leaf: WorkspaceLeaf) => any,
    ): void {
        // mock implementation
    }

    registerEditorSuggest(suggest: any): void {
        // mock implementation
    }

    registerEditorExtension(extension: any): void {
        // mock implementation
    }

    registerMarkdownPostProcessor(processor: any): void {
        // mock implementation
    }

    addSettingTab(tab: any): void {
        // mock implementation
    }

    async loadData(): Promise<any> {
        return {};
    }

    async saveData(data: any): Promise<void> {
        // mock implementation
    }
}

export abstract class EditorSuggest<T> {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    abstract getSuggestions(context: any): T[] | Promise<T[]>;
    abstract renderSuggestion(value: T, el: HTMLElement): void;
    abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class ItemView {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;

    constructor(leaf: WorkspaceLeaf) {
        this.leaf = leaf;
        this.app = new App();
        this.containerEl = document.createElement("div");
    }

    abstract getViewType(): string;
    abstract getDisplayText(): string;

    async onOpen(): Promise<void> {
        // mock implementation
    }

    async onClose(): Promise<void> {
        // mock implementation
    }
}

export class MarkdownView {
    app: App;
    file: TFile | null;
    containerEl: HTMLElement;
    editor: any;

    constructor(leaf?: WorkspaceLeaf) {
        this.app = new App();
        this.file = null;
        this.containerEl = document.createElement("div");
        this.editor = {
            getCursor: jest.fn().mockReturnValue({ line: 0, ch: 0 }),
            getLine: jest.fn().mockReturnValue(""),
            replaceRange: jest.fn(),
        };
    }

    getViewType(): string {
        return "markdown";
    }

    getMode(): string {
        return "source";
    }
}

export class Modal {
    app: App;
    containerEl: HTMLElement;

    constructor(app: App) {
        this.app = app;
        this.containerEl = document.createElement("div");
    }

    open(): void {
        // mock implementation
    }

    close(): void {
        // mock implementation
    }
}

export class Setting {
    constructor(containerEl: HTMLElement) {
        // mock implementation
    }

    setName(name: string): this {
        return this;
    }

    setDesc(desc: string): this {
        return this;
    }

    addButton(callback: (button: any) => void): this {
        callback({
            setButtonText: jest.fn().mockReturnThis(),
            setCta: jest.fn().mockReturnThis(),
            onClick: jest.fn(),
        });
        return this;
    }

    addText(callback: (text: any) => void): this {
        callback({
            setPlaceholder: jest.fn().mockReturnThis(),
            setValue: jest.fn().mockReturnThis(),
            onChange: jest.fn(),
        });
        return this;
    }
}

export class PluginSettingTab {
    app: App;
    plugin: Plugin;

    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
    }

    display(): void {
        // mock implementation
    }

    hide(): void {
        // mock implementation
    }
}

export function setIcon(element: HTMLElement, icon: string): void {
    element.setAttribute("data-icon", icon);
}

export class Notice {
    constructor(message: string, timeout?: number) {
        // mock implementation
    }
}

export class Component {
    load(): void {
        // mock implementation
    }

    unload(): void {
        // mock implementation
    }

    addChild<T extends Component>(component: T): T {
        return component;
    }

    removeChild<T extends Component>(component: T): T {
        return component;
    }

    register(callback: () => any): void {
        // mock implementation
    }

    registerEvent(event: any): void {
        // mock implementation
    }

    registerDomEvent(
        element: HTMLElement,
        type: string,
        callback: (evt: Event) => void,
    ): void {
        element.addEventListener(type, callback);
    }

    onunload(): void {
        // mock implementation
    }
}

export function normalizePath(path: string): string {
    // Simple implementation that handles basic path normalization
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
