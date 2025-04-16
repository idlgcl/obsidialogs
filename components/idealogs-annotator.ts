import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import { WordProcessor } from '../utils/word-processor';
import { ApiService } from '../utils/api';

export const IDEALOGS_ANNOTATOR = 'idealogs-annotator';

export class IdealogsAnnotator extends ItemView {
    private articleHeaderEl: HTMLElement;
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleContent = '';
    private component: Component;
    private apiService: ApiService;
    private mode: 'WEB' | 'LOCAL' | 'ANNOTATOR';

    constructor(leaf: WorkspaceLeaf, mode?: 'WEB' | 'LOCAL' | 'ANNOTATOR') {
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
    
    setMode(mode: 'WEB' | 'LOCAL' | 'ANNOTATOR'): void {
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
        return this.articleId ? `${this.articleId}` : '';
    }

    async loadWebArticleContent(): Promise<void> {
        try {
            const content = await this.apiService.fetchFileContent(this.articleId);
            this.articleContent = content;

            this.articleHeaderEl.empty();
            this.articleHeaderEl.createEl('div', { text: this.articleId, cls: 'inline-title' });
            
            await this.render();
        } catch (error) {
            this.articleContent = 'Failed to load article content';
            this.articleHeaderEl.empty();
            await this.render();
            
            console.error('Error loading article content:', error);
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
