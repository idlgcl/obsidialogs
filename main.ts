import { 
    Plugin, 
    MarkdownView,
    TFile,
    MarkdownPostProcessorContext
} from 'obsidian';

import { ArticleSuggest } from './components/ArticleSuggest';
import { WordProcessor } from 'components/WordProcessor';
import { fetchArticleContent } from './utils/api';
import { 
    setViewToReadOnly, 
    setViewToEditMode,
    isIdealogsFile 
} from './services/viewManager';
import { patchDefaultSuggester } from './services/suggesterPatcher';
import { idlFileIfExists } from './utils/fileUtils';

export default class IdealogsMDPlugin extends Plugin {
    private articleSuggest: ArticleSuggest;
    private currentIdealogsFile: TFile | null = null;
    private wordProcessor: WordProcessor | null = null;
    
    async onload() {
        this.articleSuggest = new ArticleSuggest(this);
        this.registerEditorSuggest(this.articleSuggest);
        
        patchDefaultSuggester(this.app);

        this.registerMarkdownPostProcessor(this.customMarkdownProcessor.bind(this));

        this.registerEvent(
            this.app.workspace.on('file-open', this.handleFileOpen.bind(this))
        );
        
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', this.handleLeafChange.bind(this))
        );
    }

    onunload() {
        idlFileIfExists(this.app, this.currentIdealogsFile);
        this.currentIdealogsFile = null;
        this.wordProcessor = null;
    }
    
    private customMarkdownProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
        if (!this.wordProcessor) return;
        
        const file = ctx.sourcePath ? this.app.vault.getAbstractFileByPath(ctx.sourcePath) : null;
        
        if (file instanceof TFile && isIdealogsFile(file)) {
            this.wordProcessor.processMarkdown(el);
        }
    }
    
    private async handleFileOpen(file: TFile | null) {
        if (!file) return;
        
        if (this.currentIdealogsFile && 
            file instanceof TFile && 
            file.path !== this.currentIdealogsFile.path) {
            await idlFileIfExists(this.app, this.currentIdealogsFile);
            this.currentIdealogsFile = null;
        }
        
        if (file instanceof TFile && file.extension === 'md') {
            if (isIdealogsFile(file)) {
                this.currentIdealogsFile = file;
                this.wordProcessor = new WordProcessor({
                    articleId: file.basename
                });
                await this.handleIdealogsFileOpen(file);
            } else {
                this.wordProcessor = null;
                setViewToEditMode(this.app, file);
            }
        }
    }
    
    private async handleLeafChange() {
        if (!this.currentIdealogsFile) return;
        
        const stillOpen = this.app.workspace.getLeavesOfType('markdown')
            .some(leaf => {
                const view = leaf.view;
                return view instanceof MarkdownView && 
                       view.file && 
                       view.file.path === this.currentIdealogsFile?.path;
            });
        
        if (!stillOpen) {
            await idlFileIfExists(this.app, this.currentIdealogsFile);
            this.currentIdealogsFile = null;
            this.wordProcessor = null;
        }
    }
    
    private async handleIdealogsFileOpen(file: TFile) {
        const content = await fetchArticleContent(file.basename);
        
        if (content) {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (view && view.file && view.file.path === file.path) {
                view.editor.setValue(content);
            }
            setViewToReadOnly(this.app, file);
        }
    }
}
