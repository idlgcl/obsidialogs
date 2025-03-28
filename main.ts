import { Plugin, TFile } from 'obsidian';
import { ArticleSuggest } from './components/suggester';
import { FileHandler } from './utils/file-handler';
import { patchDefaultSuggester } from './utils/suggester-patcher';
import { ARTICLE_VIEW_TYPE, ArticleView } from './components/article-view';
import { NOTES_VIEW_TYPE, NotesView } from './components/notes-view';
import { COMMENTS_VIEW_TYPE, CommentsView } from './components/comments-view';
import { AnnotationService } from './utils/annotation-service';

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
        
        this.registerView(ARTICLE_VIEW_TYPE, (leaf) => {
            return new ArticleView(leaf);
        });
        
        this.registerView(NOTES_VIEW_TYPE, (leaf) => {
            return new NotesView(leaf);
        });
        
        this.registerView(COMMENTS_VIEW_TYPE, (leaf) => {
            return new CommentsView(leaf);
        });
        
        this.addCommand({
            id: 'annotate-comments',
            name: 'Annotate comments',
            callback: () => this.openCommentsView()
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
    
    async openCommentsView() {
        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            leaf.setViewState({
                type: COMMENTS_VIEW_TYPE,
                active: true
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    onunload() {
        this.fileHandler.trash();
    }
}
