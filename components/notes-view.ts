import { ItemView, WorkspaceLeaf, Component } from 'obsidian';

export const NOTES_VIEW_TYPE = 'idealogs-notes-view';

export class NotesView extends ItemView {
    private notesContentEl: HTMLElement;
    private articleId: string;
    private component: Component;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.notesContentEl = this.contentEl.createDiv({ cls: 'idealogs-notes-content' });
    }
    
    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
            this.notesContentEl.empty();
            
            this.notesContentEl.createEl('h3', { text: 'Notes' });
        }
    }

    getViewType(): string {
        return NOTES_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Article Notes';
    }

    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
