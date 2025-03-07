import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { Comment } from 'types/interfaces';
import { ANNOTATOR_VIEW_TYPE, AnnotatorView } from './AnnotatorView';

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
    private originalFile: TFile | null = null;
    
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

        commentSelect.createEl('option', {
            text: 'Select Comment',
            attr: { value: '', selected: 'selected' }
        });
        
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
        targetField.createEl('label', { text: 'Target Article' });
        const targetSelect = targetField.createEl('select', { attr: {'disabled': 'true'}});
        
        targetSelect.createEl('option', {
            text: 'Select Article',
            attr: { value: '' }
        });

        const mdFiles = this.app.vault.getMarkdownFiles();
        mdFiles.forEach(file => {
            targetSelect.createEl('option', {
                text: file.basename,
                attr: { value: file.path }
            });
        });

        const displayField = this.commentsContainer.createDiv({ cls: 'idl-form-field' });
        displayField.createEl('label', { text: 'Text Display' });
        const displayInput = displayField.createEl('input', { 
            type: 'text',
            attr: { disabled: 'true' }
        });
        
        const rangeField = this.commentsContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = rangeField.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Text Start' });
        const startInput = startField.createEl('input', { 
            type: 'text',
            attr: { disabled: 'true' }
        });
        
        const endField = rangeField.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Text End' });
        const endInput = endField.createEl('input', { 
            type: 'text',
            attr: { disabled: 'true' }
        });
        
        const buttonContainer = this.commentsContainer.createDiv({ cls: 'idl-form-buttons' });
        const switchButton = buttonContainer.createEl('button', { 
            text: 'Switch Article', 
            cls: 'idl-button',
            attr: { disabled: 'true' }
        });
        
        const saveButton = buttonContainer.createEl('button', { 
            text: 'Save', 
            cls: 'idl-button',
            attr: { disabled: 'true' }
        });
       
        commentSelect.addEventListener('change', (e) => {
            const select = e.target as HTMLSelectElement;
            const value = select.value;
            
            if (value === '') {
                bodyTextarea.value = '';
                targetSelect.setAttribute('disabled', 'true');
                displayInput.setAttribute('disabled', 'true');
                startInput.setAttribute('disabled', 'true');
                endInput.setAttribute('disabled', 'true');
                saveButton.setAttribute('disabled', 'true');
            } else {
                const index = parseInt(value);
                if (!isNaN(index) && index >= 0 && this.comments[index]) {
                    bodyTextarea.value = this.comments[index].body;
                    
                    targetSelect.removeAttribute('disabled');
                    displayInput.removeAttribute('disabled');
                    startInput.removeAttribute('disabled');
                    endInput.removeAttribute('disabled');
                    saveButton.removeAttribute('disabled');
                }
            }
        });

        targetSelect.addEventListener('change', async (e) => {
            const select = e.target as HTMLSelectElement;
            const value = select.value;
            
            if (value === '') {
                bodyTextarea.value = '';
                targetSelect.setAttribute('disabled', 'true');
                displayInput.setAttribute('disabled', 'true');
                startInput.setAttribute('disabled', 'true');
                endInput.setAttribute('disabled', 'true');
                saveButton.setAttribute('disabled', 'true');
                switchButton.setAttribute('disabled', 'true');
            } else {
                const index = parseInt(value);
                if (!isNaN(index) && index >= 0 && this.comments[index]) {
                    bodyTextarea.value = this.comments[index].body;
                    
                    targetSelect.removeAttribute('disabled');
                    displayInput.removeAttribute('disabled');
                    startInput.removeAttribute('disabled');
                    endInput.removeAttribute('disabled');
                    saveButton.removeAttribute('disabled');
                    switchButton.setAttribute('disabled', 'true');
                } else {
                    const file = this.app.vault.getAbstractFileByPath(value);
                    if (file instanceof TFile) {
                        const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
                        if (annotatorLeaves.length > 0) {
                            const annotatorView = annotatorLeaves[0].view as AnnotatorView;
                            await annotatorView.setFile(file);
                            switchButton.removeAttribute('disabled');
                        }
                    }
                }
            }
        });

        switchButton.addEventListener('click', async () => {
            const annotatorLeaves = this.app.workspace.getLeavesOfType(ANNOTATOR_VIEW_TYPE);
            if (annotatorLeaves.length > 0) {
                const annotatorView = annotatorLeaves[0].view as AnnotatorView;
                
                if (this.originalFile && annotatorView.getCurrentFile()?.path !== this.originalFile.path) {
                    await annotatorView.setFile(this.originalFile);
                    switchButton.setText('View Target');
                } else {
                    const targetPath = targetSelect.value;
                    const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
                    if (targetFile instanceof TFile) {
                        await annotatorView.setFile(targetFile);
                        switchButton.setText('View Original');
                    }
                }
            }
        });
    }

    setComments(comments: Comment[]): void {
        this.comments = comments;
        this.setupCommentsTab()
    }

    setOriginalFile(file: TFile): void {
        this.originalFile = file;
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
        this.comments = []
        this.originalFile = null;
    }
}
