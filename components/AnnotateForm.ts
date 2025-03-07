import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Comment } from 'types/interfaces';

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
    private comments: Comment[] = [];
    
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
        
        const commentSelectField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        commentSelectField.createEl('label', { text: 'Select Comment' });
        const commentSelect = commentSelectField.createEl('select', { cls: 'idl-comment-select' });

        
        this.comments.forEach((comment, index) => {
            commentSelect.createEl('option', {
                text: comment.title,
                attr: { value: index.toString() }
            });
        });
        
        const bodyField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        bodyField.createEl('label', { text: 'Comment Body' });
        const bodyTextarea = bodyField.createEl('textarea', { 
            cls: 'idl-comment-body',
            attr: { rows: '4', readonly: 'true' }
        });
        
        const targetField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        targetField.createEl('label', { text: 'Target' });
        const typeSelect = targetField.createEl('select');
        
        ['Test', 'Test 1', 'Test 2', 'Test 3'].forEach(dummy => {
            typeSelect.createEl('option', { text: dummy });
        });
        
        const displayField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        displayField.createEl('label', { text: 'Text Display' });
        displayField.createEl('input', { type: 'text' });
        
        const rangeField = this.commentsContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = rangeField.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Text Start' });
        startField.createEl('input', { type: 'text' });
        
        const endField = rangeField.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Text End' });
        endField.createEl('input', { type: 'text' });
        
        const buttonContainer = this.commentsContainer.createDiv({ cls: 'idl-form-buttons' });
        buttonContainer.createEl('button', { text: 'Save', cls: 'idl-save-button' });
        
        commentSelect.addEventListener('change', (e) => {
            const select = e.target as HTMLSelectElement;
            const index = parseInt(select.value);
            
            if (!isNaN(index) && index >= 0 && this.comments[index]) {
                bodyTextarea.value = this.comments[index].body;
            } else {
                bodyTextarea.value = '';
            }
        });
    }

    setComments(comments: Comment[]): void {
        this.comments = comments;
        this.setupCommentsTab()
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
