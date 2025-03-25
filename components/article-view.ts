import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import { WordProcessor } from './word-processor';

export const ARTICLE_VIEW_TYPE = 'idealogs-article-view';

export class ArticleView extends ItemView {
    private articleContentEl: HTMLElement;
    private articleId: string;
    private articleContent = '';
    private component: Component;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.articleContentEl = this.contentEl.createDiv({ cls: 'idealogs-article-content' });
    }
    
    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
        }
    }

    getViewType(): string {
        return ARTICLE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Idealogs Article';
    }

    async setContent(content: string): Promise<void> {
        this.articleContent = content;
        await this.render();
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
