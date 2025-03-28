import { App, TFile, MarkdownView } from 'obsidian';
import { ApiService } from './api';
import { IDL_RIGHT_PANEL } from 'components/right-panel';

const IDEALOGS_FILE_PATTERNS = ['Ix', '0x', 'Tx', 'Fx'];

export class FileHandler {
    private app: App;
    private currentIdealogsFile: TFile | null = null;
    private apiService: ApiService;
    
    constructor(app: App) {
        this.app = app;
        this.apiService = new ApiService();
    }
    
    get currentFile(): TFile | null {
        return this.currentIdealogsFile;
    }
    
    async handleFileOpen(file: TFile): Promise<void> {
        if (!file) return;
        
        if (this.currentIdealogsFile && 
            file instanceof TFile && 
            file.path !== this.currentIdealogsFile.path) {
            try {
                this.app.fileManager.trashFile(this.currentIdealogsFile);
            } catch (error) {
                console.error('Error deleting Idealogs file:', error);
            }
            this.currentIdealogsFile = null;
        }
        
        if (file instanceof TFile && file.extension === 'md') {
            const isIdealogsFile = IDEALOGS_FILE_PATTERNS.some(pattern => file.basename.startsWith(pattern));
            
            if (isIdealogsFile) {
                this.currentIdealogsFile = file;
                this.handleMarkdownFileOpen(file);
            } else {
                const existingRightPanelLeaves = this.app.workspace.getLeavesOfType(IDL_RIGHT_PANEL);
                
                let rightLeaf;
                if (existingRightPanelLeaves.length > 0) {
                    rightLeaf = existingRightPanelLeaves[0];
                } else {
                    rightLeaf = this.app.workspace.getRightLeaf(false);
                    if (rightLeaf) {
                        rightLeaf.setViewState({
                            type: IDL_RIGHT_PANEL,
                            active: false,
                        });
                    }
                }
                
                if (rightLeaf) {
                    this.app.workspace.revealLeaf(rightLeaf);
                } else {
                    console.error('Failed to setup IDL_RIGHT_PANEL');
                }

                this.setViewToEditMode(file);
            }
        }
    }
    
    async handleMarkdownFileOpen(file: TFile): Promise<void> {
        const isIdealogsFile = IDEALOGS_FILE_PATTERNS.some(pattern => file.basename.startsWith(pattern));
        
        if (!isIdealogsFile) return;

        try {
            const content = await this.apiService.fetchFileContent(file.basename);
            
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view && view.file && view.file.path === file.path) {
                view.editor.setValue(content);
            }
            this.setViewToReadOnly(file);
        } catch (error) {
            console.error('Error fetching or updating content:', error);
        }
    }
    
    setViewToReadOnly(file: TFile): void {
        setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const view = leaf.view;
                if (view instanceof MarkdownView && 
                    view.file && 
                    view.file.path === file.path) {
                    
                    if (view.getMode() !== 'preview') {
                        // @ts-ignore
                        this.app.commands.executeCommandById('markdown:toggle-preview');
                    }
                }
            }
        }, 100);
    }
    
    setViewToEditMode(file: TFile): void {
        setTimeout(() => {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const view = leaf.view;
                if (view instanceof MarkdownView && 
                    view.file && 
                    view.file.path === file.path) {
                    
                    if (view.getMode() !== 'source') {
                        // @ts-ignore
                        this.app.commands.executeCommandById('markdown:toggle-preview');
                    }
                }
            }
        }, 100);
    }
    
    checkIfFileStillOpen(): void {
        if (!this.currentIdealogsFile) return;
        
        const stillOpen = this.app.workspace.getLeavesOfType('markdown')
            .some(leaf => {
                const view = leaf.view;
                return view instanceof MarkdownView && 
                       view.file && 
                       view.file.path === this.currentIdealogsFile?.path;
            });
        
        if (!stillOpen) {
            this.trash();
        }
    }
    
    trash(): void {
        if (this.currentIdealogsFile) {
            try {
                this.app.fileManager.trashFile(this.currentIdealogsFile);
            } catch (error) {
                console.error('Error deleting Idealogs file:', error);
            }
            this.currentIdealogsFile = null;
        }
    }
}
