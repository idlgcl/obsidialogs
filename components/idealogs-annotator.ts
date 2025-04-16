import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import { WordProcessor } from '../utils/word-processor';
import { ApiService } from '../utils/api';

export const IDEALOGS_ANNOTATOR = 'idealogs-annotator';

type AnnotatorMode = 'WEB' | 'LOCAL' | 'ANNOTATOR';

export class IdealogsAnnotator extends ItemView {
    private articleHeaderEl: HTMLElement;
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleTitle = '';
    private articleContent = '';
    private component: Component;
    private apiService: ApiService;
    private mode: AnnotatorMode;

    constructor(leaf: WorkspaceLeaf, mode?: AnnotatorMode) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.articleHeaderEl = this.contentEl.createDiv({ cls: 'idealogs-article-header' });
        this.articleContentEl = this.contentEl.createDiv({ cls: 'idealogs-article-content' });
        this.apiService = new ApiService();
        if (mode) {
            this.mode = mode;
        }
    }
    
    setMode(mode: AnnotatorMode): void {
        this.mode = mode;
    }

    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
            await this.loadWebArticleContent();
        }
        
        if (state && state.mode) {
            this.mode = state.mode;
        }
    }

    getViewType(): string {
        return IDEALOGS_ANNOTATOR;
    }

    getDisplayText(): string {
        return this.articleTitle || this.articleId;
    }

    async loadWebArticleContent(): Promise<void> {
        try {
            const [content, articleDetails] = await Promise.allSettled([
                this.apiService.fetchFileContent(this.articleId),
                this.apiService.fetchArticleById(this.articleId)
            ]);

            if (content.status === 'fulfilled') {
                this.articleContent = content.value;
            } else {
                this.articleContent = 'Failed to load article content';
                console.error('Error loading article content:', content.reason);
            }

            this.articleHeaderEl.empty();
            if (articleDetails.status === 'fulfilled') {
                this.articleTitle = articleDetails.value.title || this.articleId;
            } else {
                this.articleTitle = this.articleId;
            }
                
            this.articleHeaderEl.createEl('div', { text: this.articleTitle, cls: 'inline-title' });
            
            await this.render();
        } catch (error) {
            console.error('Unexpected error in loadWebArticleContent:', error);
            this.articleContent = 'An error occurred while loading the article';
            this.articleTitle = this.articleId;
            this.articleHeaderEl.empty();
            await this.render();
        }
    }

    private async render(): Promise<void> {
        this.articleContentEl.empty();
        
        await MarkdownRenderer.render(
            this.app,
            this.articleContent,
            this.articleContentEl,
            '',
            this.component
        );
        
        const processor = new WordProcessor({ articleId: this.articleId });
        processor.processMarkdown(this.articleContentEl);
    }

    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
