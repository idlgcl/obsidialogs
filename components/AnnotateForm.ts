import { ItemView, WorkspaceLeaf } from 'obsidian';

export const ANNOTATE_FORM_VIEW_TYPE = 'idl-annotate-form-view';

export interface AnnotateFormData {
    title: string;
    comment: string;
}

export class AnnotateFormView extends ItemView {
    private commentsTab: HTMLElement;
    private notesTab: HTMLElement;
    private commentsContainer: HTMLElement;
    private notesContainer: HTMLElement;
    private onSaveCallback: ((data: AnnotateFormData) => void) | null = null;
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }
    
    getViewType(): string {
        return ANNOTATE_FORM_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        return 'Annotate';
    }
    
    getIcon(): string {
        return 'message-square';
    }

    async onOpen(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();
        
        const tabsContainer = containerEl.createDiv({ cls: 'idl-tabs-container' });
        
        this.commentsTab = tabsContainer.createDiv({ 
            cls: 'idl-tab idl-tab-active',
            text: 'Comments'
        });
        
        this.notesTab = tabsContainer.createDiv({ 
            cls: 'idl-tab',
            text: 'Notes'
        });
        
        this.commentsContainer = containerEl.createDiv({ cls: 'idl-tab-content idl-tab-content-active' });
        this.notesContainer = containerEl.createDiv({ cls: 'idl-tab-content' });
        
        this.commentsTab.addEventListener('click', () => this.selectTab('comments'));
        this.notesTab.addEventListener('click', () => this.selectTab('notes'));
        
        this.setupCommentsTab();
        
        this.setupNotesTab();
    }
    
    private selectTab(tabName: 'comments' | 'notes'): void {
        this.commentsTab.removeClass('idl-tab-active');
        this.notesTab.removeClass('idl-tab-active');
        this.commentsContainer.removeClass('idl-tab-content-active');
        this.notesContainer.removeClass('idl-tab-content-active');
        
        if (tabName === 'comments') {
            this.commentsTab.addClass('idl-tab-active');
            this.commentsContainer.addClass('idl-tab-content-active');
        } else {
            this.notesTab.addClass('idl-tab-active');
            this.notesContainer.addClass('idl-tab-content-active');
        }
    }
    
    private setupCommentsTab(): void {
        this.commentsContainer.empty();
        this.commentsContainer.createEl('h3', { text: 'Comments' });
        
        this.commentsContainer.createEl('p', { text: 'Comments tab content' });
    }
    
    private setupNotesTab(): void {
        this.notesContainer.empty();
        this.notesContainer.createEl('h3', { text: 'Notes' });
        
        this.notesContainer.createEl('p', { text: 'Notes tab content' });
    }
    
    setOnSave(callback: (data: AnnotateFormData) => void): this {
        this.onSaveCallback = callback;
        return this;
    }
    
    resetForm(): void {
        
    }
    
    async onClose(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();
        this.onSaveCallback = null;
    }
}
