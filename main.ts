import { Plugin, TFile } from 'obsidian';
import { ArticleSuggest } from './suggester';
import { FileHandler } from './file-handler';
import { patchDefaultSuggester } from './suggester-patcher';
import { ARTICLE_VIEW_TYPE, ArticleView } from './components/article-view';
import { NOTES_VIEW_TYPE, NotesView } from './components/notes-view';

export default class ArticleSuggestPlugin extends Plugin {
    private articleSuggest: ArticleSuggest;
    private fileHandler: FileHandler;
    
    async onload() {
        this.articleSuggest = new ArticleSuggest(this);
        this.registerEditorSuggest(this.articleSuggest);
        
        this.fileHandler = new FileHandler(this.app);
        
        this.registerView(ARTICLE_VIEW_TYPE, (leaf) => {
            return new ArticleView(leaf);
        });
        
        this.registerView(NOTES_VIEW_TYPE, (leaf) => {
            return new NotesView(leaf);
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
