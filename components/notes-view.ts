import { ItemView, WorkspaceLeaf, Component } from 'obsidian';

export const NOTES_VIEW_TYPE = 'idealogs-notes-view';

export class NotesView extends ItemView {
    private notesContentEl: HTMLElement;
    private formContainer: HTMLElement;
    private articleId: string;
    private component: Component;

    private textStart: HTMLInputElement;
    private textEnd: HTMLInputElement;
    private textDisplay: HTMLInputElement;
    private targetArticle: HTMLInputElement;
    private targetTextStart: HTMLInputElement;
    private targetTextEnd: HTMLInputElement;
    private targetTextDisplay: HTMLInputElement;

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
            
            this.notesContentEl.createEl('h3', { text: 'Add Note' });
            
            this.createForm();
        }
    }

    private createForm(): void {
        this.formContainer = this.notesContentEl.createDiv({ cls: 'idl-notes-form' });
        
        const textDisplayField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        this.textDisplay = textDisplayField.createEl('input', { 
            type: 'text'
        });
        
        const srcRangeFields = this.formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = srcRangeFields.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Text Start' });
        this.textStart = startField.createEl('input', { 
            type: 'text'
        });
        
        const endField = srcRangeFields.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Text End' });
        this.textEnd = endField.createEl('input', { 
            type: 'text'
        });

        const targetArticleField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        targetArticleField.createEl('label', { text: 'Target Article' });
        this.targetArticle = targetArticleField.createEl('input', { 
            type: 'text',
            attr: { disabled: true }
        });
        this.targetArticle.value = this.articleId;

        const targetDisplayField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        this.targetTextDisplay = targetDisplayField.createEl('input', { 
            type: 'text'
        });

        const targetSrcRangeFields = this.formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });

                
        const targetStartField = targetSrcRangeFields.createDiv({ cls: 'idl-start-field' });
        targetStartField.createEl('label', { text: 'Text Start' });
        this.targetTextStart = targetStartField.createEl('input', { 
            type: 'text'
        });
        
        const targetEndField = targetSrcRangeFields.createDiv({ cls: 'idl-end-field' });
        targetEndField.createEl('label', { text: 'Text End' });
        this.targetTextEnd = targetEndField.createEl('input', { 
            type: 'text'
        });

        const saveButtonContainer = this.formContainer.createDiv({ cls: 'idl-btns' });
        const saveButton = saveButtonContainer.createEl('button', { text: 'Save' });
        saveButton.addEventListener('click', () => this.handleSave());
    }
    
    private handleSave(): void {
        console.log('Form saved with values:', {
            textStart: this.textStart.value,
            textEnd: this.textEnd.value,
            textDisplay: this.textDisplay.value,
            targetArticle: this.targetArticle.value,
            targetTextStart: this.targetTextStart.value,
            targetTextEnd: this.targetTextEnd.value,
            targetTextDisplay: this.targetTextDisplay.value
        });
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
