import { Plugin, TFile } from 'obsidian';
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
    }
    
    onunload() {
        this.fileHandler.trash();
    }
}
