import { ItemView, WorkspaceLeaf } from "obsidian";

// Add this constant at the top level
export const IDEALOGS_WEB_VIEW = 'idealogs-web-view';

// Add this class
export class IdealogsWebView extends ItemView {
    private iframe: HTMLIFrameElement;
    private articleId = '';
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
    }

    getViewType(): string {
        return IDEALOGS_WEB_VIEW;
    }

    getDisplayText(): string {
        return `Idealogs: ${this.articleId}`;
    }

    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
            this.loadArticle();
        }
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl.createDiv({cls: 'idealogs-web-container'});
        this.iframe = container.createEl('iframe', {
            attr: {
                style: 'width: 100%; height: 100%; border: none;'
            }
        });
    }

    loadArticle(): void {
        if (!this.articleId) return;
        // @ts-ignore
        const apiEndpoint = FE_ENDPOINT_VALUE;
        const baseUrl = apiEndpoint.replace('/api', '');
        this.iframe.src = `${baseUrl}/${this.articleId}`;
    }
}
