import { MarkdownView, Plugin, TFile } from 'obsidian';
import { ArticleSuggest } from './components/suggester';
import { FileHandler } from './utils/file-handler';
import { patchDefaultSuggester } from './utils/suggester-patcher';
import { IDEALOGS_READER, IdealogsReaderView } from './components/idealogs-reader';
import { AnnotationService } from './utils/annotation-service';
import { IDL_RIGHT_PANEL, RightPanel } from 'components/right-panel';

export default class ArticleSuggestPlugin extends Plugin {
    private articleSuggest: ArticleSuggest;
    private fileHandler: FileHandler;
    public annotationService: AnnotationService;
    
    async onload() {
        this.articleSuggest = new ArticleSuggest(this);
        this.registerEditorSuggest(this.articleSuggest);
        
        this.fileHandler = new FileHandler(this.app);
        this.annotationService = new AnnotationService(this.app);
        
        await this.annotationService.ensureAnnotationsDirectory();
        
        this.registerView(IDEALOGS_READER, (leaf) => {
            return new IdealogsReaderView(leaf);
        });
        
        this.registerView(IDL_RIGHT_PANEL, (leaf) => {
            return new RightPanel(leaf, this.annotationService);
        });
        
        patchDefaultSuggester(this.app);

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file instanceof TFile) {
                    this.fileHandler.handleFileOpen(file);
                }
            })
        );
        
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.fileHandler.checkIfFileStillOpen();
            })
        );
        
        this.addCommand({
            id: 'open-in-idealogs-reader',
            name: 'Open in Idealogs Reader',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                
                if (activeFile && activeFile.extension === 'md') {
                    const isIdealogsFile = ['Tx', 'Ix', 'Fx', '0x'].some(prefix => 
                        activeFile.basename.startsWith(prefix)
                    );
                    
                    if (!isIdealogsFile) {
                        if (!checking) {
                            this.openInIdealogsReader(activeFile);
                        }
                        return true;
                    }
                }
                return false;
            }
        });
    }
        
    async openInIdealogsReader(file: TFile): Promise<void> {
        const existingReaderLeaves = this.app.workspace.getLeavesOfType(IDEALOGS_READER);
        let readerLeaf;
        
        if (existingReaderLeaves.length > 0) {
            readerLeaf = existingReaderLeaves[0];
        } else {
            readerLeaf = this.app.workspace.getLeaf('split');
        }
        
        await readerLeaf.setViewState({
            type: IDEALOGS_READER,
            active: true,
            state: { 
                articleId: file.basename,
                openedFromCommand: true
            }
        });
        
        try {
            const content = await this.app.vault.read(file);
            const readerView = readerLeaf.view as IdealogsReaderView;
            await readerView.setContent(content);
            
            const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of markdownLeaves) {
                const markdownView = leaf.view as MarkdownView;
                if (markdownView && markdownView.file && markdownView.file.path === file.path) {
                    leaf.detach();
                    break;
                }
            }
            
            const rightPanelLeaves = this.app.workspace.getLeavesOfType(IDL_RIGHT_PANEL);
            for (const leaf of rightPanelLeaves) {
                leaf.detach();
            }
        } catch (error) {
            console.error('Error reading file content:', error);
        }
    }
    
    onunload() {
        this.fileHandler.trash();
    }
}
