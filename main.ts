import { MarkdownView, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { ArticleSuggest } from './components/suggester';
import { FileHandler } from './utils/file-handler';
import { patchDefaultSuggester } from './utils/suggester-patcher';
import { IDEALOGS_READER, IdealogsReaderView } from './components/idealogs-reader';
import { AnnotationService } from './utils/annotation-service';
import { IDL_RIGHT_PANEL, RightPanel } from 'components/right-panel';
import { ApiService } from './utils/api';
import { IDEALOGS_WEB_VIEW, IdealogsWebView } from 'components/idl-webview';

export default class ArticleSuggestPlugin extends Plugin {
    private articleSuggest: ArticleSuggest;
    private fileHandler: FileHandler;
    public annotationService: AnnotationService;
    private apiService: ApiService;
    
    async onload() {
        this.articleSuggest = new ArticleSuggest(this);
        this.registerEditorSuggest(this.articleSuggest);
        
        this.fileHandler = new FileHandler(this.app);
        this.annotationService = new AnnotationService(this.app);
        this.apiService = new ApiService();
        
        await this.annotationService.ensureAnnotationsDirectory();
        
        this.registerView(IDEALOGS_READER, (leaf) => {
            return new IdealogsReaderView(leaf);
        });
        
        this.registerView(IDL_RIGHT_PANEL, (leaf) => {
            return new RightPanel(leaf, this.annotationService);
        });

                
        this.registerView(IDEALOGS_WEB_VIEW, (leaf) => {
            return new IdealogsWebView(leaf);
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
        
        this.patchLinkOpening();
        
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

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item.setTitle("Open in Idealogs Reader")
                           .setIcon("book-open")
                           .onClick(() => {
                               this.openInIdealogsReader(file);
                           });
                    });
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile instanceof TFile && activeFile.extension === 'md') {
                    menu.addItem((item) => {
                        item.setTitle("Open in Idealogs Reader")
                           .setIcon("book-open")
                           .onClick(() => {
                                this.openInIdealogsReader(activeFile);
                           });
                    });
                }
            })
        );
    }
    
    private originalOpenLinkText: any;
    
    private patchLinkOpening(): void {
        const workspace = this.app.workspace;
        this.originalOpenLinkText = workspace.openLinkText;
        
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;

        // @ts-ignore 
        workspace.openLinkText = function(linktext, sourcePath, newLeaf, openViewState) {
            if (self.isIdealogsArticle(linktext)) {
                self.openIdealogsArticleInWebView(linktext);
                return true;
            }
            
            return self.originalOpenLinkText.call(workspace, linktext, sourcePath, newLeaf, openViewState);
        };
    }
    
    private isIdealogsArticle(id: string): boolean {
        return ['Tx', 'Ix', 'Fx', '0x'].some(prefix => id.startsWith(prefix));
    }
    
    async openIdealogsArticleById(articleId: string): Promise<void> {
        const existingReaderLeaves = this.app.workspace.getLeavesOfType(IDEALOGS_READER);
        let readerLeaf: WorkspaceLeaf;
        
        if (existingReaderLeaves.length > 0) {
            readerLeaf = existingReaderLeaves[0];
        } else {
            readerLeaf = this.app.workspace.getLeaf('split');
            await readerLeaf.setViewState({
                type: IDEALOGS_READER,
                active: false
            });
        }
        
        await readerLeaf.setViewState({
            type: IDEALOGS_READER,
            active: true,
            state: { 
                articleId: articleId,
                openedFromCommand: false
            }
        });
        
        try {
            const content = await this.apiService.fetchFileContent(articleId);
            const readerView = readerLeaf.view as IdealogsReaderView;
            await readerView.setContent(content);
            this.app.workspace.revealLeaf(readerLeaf);
        } catch (error) {
            console.error('Error fetching article content:', error);
        }
    }


    async openIdealogsArticleInWebView(articleId: string): Promise<void> {
        try {
            const existingLeaves = this.app.workspace.getLeavesOfType(IDEALOGS_WEB_VIEW);
            let leaf: WorkspaceLeaf;
            
            if (existingLeaves.length > 0) {
                leaf = existingLeaves[0];
            } else {
                leaf = this.app.workspace.getLeaf('split');
            }
            
            await leaf.setViewState({
                type: IDEALOGS_WEB_VIEW,
                active: true,
                state: { 
                    articleId: articleId
                }
            });
            
            this.app.workspace.revealLeaf(leaf);
        } catch (error) {
            console.error('Error opening article in WebView:', error);
        }
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
        
        const workspace = this.app.workspace;
        if (this.originalOpenLinkText && workspace.openLinkText !== this.originalOpenLinkText) {
            workspace.openLinkText = this.originalOpenLinkText;
        }
    }
}
