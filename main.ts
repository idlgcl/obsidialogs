import { 
    Plugin, 
    MarkdownView,
    TFile,
    MarkdownPostProcessorContext,
    Notice
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
import { ANNOTATOR_VIEW_TYPE, AnnotatorView } from 'components/AnnotatorView';

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
        
        this.registerView(
            ANNOTATOR_VIEW_TYPE,
            (leaf) => new AnnotatorView(leaf)
        );
        
        this.addCommand({
            id: 'open-in-idealogs-annotator',
            name: 'Open in Idealogs Annotator',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (file && file.extension === 'md') {
                    if (!checking) {
                        this.openFileInAnnotator(file);
                    }
                    return true;
                }
                return false;
            }
        });
    }

    onunload() {
        idlFileIfExists(this.app, this.currentIdealogsFile);
        this.currentIdealogsFile = null;
        this.wordProcessor = null;
        
        this.app.workspace.detachLeavesOfType(ANNOTATOR_VIEW_TYPE);
    }
    
    async openFileInAnnotator(file: TFile) {
        const leaf = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE)[0] || 
                     this.app.workspace.getLeaf('tab');
        
        if (!leaf) {
            new Notice('Failed to create Annotator view');
            return;
        }
        
        if (leaf.getViewState().type !== ANNOTATOR_VIEW_TYPE) {
            await leaf.setViewState({
                type: ANNOTATOR_VIEW_TYPE,
                active: true
            });
        }
        
        const view = leaf.view as AnnotatorView;
        await view.setFile(file);
        
        this.app.workspace.revealLeaf(leaf);
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
