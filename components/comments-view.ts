import { ItemView, WorkspaceLeaf, Component, MarkdownView } from 'obsidian';
import { Comment, parseComments } from '../utils/comment-parser';

export const COMMENTS_VIEW_TYPE = 'idealogs-comments-view';

export class CommentsView extends ItemView {
    private listContentEl: HTMLElement;
    private formContentEl: HTMLElement;
    private component: Component;
    private showingList = true;
    private comments: Comment[] = [];

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.component = new Component();
        
        this.listContentEl = this.contentEl.createDiv({ cls: 'idealogs-comments-list' });
        this.formContentEl = this.contentEl.createDiv({ cls: 'idealogs-comments-form' });
        this.formContentEl.hide();
    }
    
    getViewType(): string {
        return COMMENTS_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        return 'Article Comments';
    }
    
    async onOpen() {
        this.loadCommentsFromActiveFile();
        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                this.loadCommentsFromActiveFile();
            })
        );
        this.registerEvent(
            this.app.workspace.on('editor-change', () => {
                this.loadCommentsFromActiveFile();
            })
        );
    }
    
    private loadCommentsFromActiveFile(): void {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
            this.comments = [];
            this.renderCommentsList();
            return;
        }
        
        const editor = activeView.editor;
        const content = editor.getValue();
        
        this.comments = parseComments(content);
        this.renderCommentsList();
    }
    
    private renderCommentsList(): void {
        this.listContentEl.empty();
        this.listContentEl.createEl('h3', { text: 'Comments' });
        
        const commentsContainer = this.listContentEl.createDiv({ cls: 'comments-container' });
        
        if (this.comments.length === 0) {
            commentsContainer.createDiv({ 
                cls: 'comment-empty-state',
                text: 'No comments found in current document'
            });
            return;
        }
        
        this.comments.forEach((comment, index) => {
            const commentEl = commentsContainer.createDiv({ cls: 'comment-item' });
            commentEl.setText(comment.title);
            
            commentEl.addEventListener('click', () => {
                this.showCommentForm(index);
            });
        });
    }
    
    private showCommentForm(commentIndex: number): void {
        if (commentIndex < 0 || commentIndex >= this.comments.length) {
            return;
        }
        
        const comment = this.comments[commentIndex];
        
        this.showingList = false;
        this.listContentEl.hide();
        this.formContentEl.empty();
        this.formContentEl.show();
        
        const headerContainer = this.formContentEl.createDiv({ cls: 'form-header' });
        const backButton = headerContainer.createEl('button', { text: 'Back to List' });
        backButton.addEventListener('click', () => this.showCommentsList());
        
        const formContainer = this.formContentEl.createDiv({ cls: 'idl-form' });
        
        const textDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        const textDisplay = textDisplayField.createEl('input', { 
            type: 'text',
            attr: {disabled: true}
        });
        textDisplay.value = comment.title;
        
        const commentField = formContainer.createDiv({ cls: 'idl-form-field' });
        commentField.createEl('label', { text: 'Comment' });
        const commentTextarea = commentField.createEl('textarea', {
            attr: { rows: '4', disabled: true }
        });
        commentTextarea.value = comment.body;
        
        const targetArticleField = formContainer.createDiv({ cls: 'idl-form-field' });
        targetArticleField.createEl('label', { text: 'Target Article' });
        const targetArticle = targetArticleField.createEl('input', { 
            type: 'text'
        });
        
        const textRangeFields = formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = textRangeFields.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Target Text Start' });
        const targetTextStart = startField.createEl('input', { 
            type: 'text'
        });
        
        const endField = textRangeFields.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Target Text End' });
        const targetTextEnd = endField.createEl('input', { 
            type: 'text'
        });
        
        const targetDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        const targetTextDisplay = targetDisplayField.createEl('input', { 
            type: 'text'
        });
        
        const saveButtonContainer = formContainer.createDiv({ cls: 'idl-btns' });
        const saveButton = saveButtonContainer.createEl('button', { text: 'Save' });
        saveButton.addEventListener('click', () => this.handleSave({
            commentIndex,
            textDisplay: textDisplay.value,
            commentBody: commentTextarea.value,
            targetArticle: targetArticle.value,
            targetTextStart: targetTextStart.value, 
            targetTextEnd: targetTextEnd.value,
            targetTextDisplay: targetTextDisplay.value
        }));
    }
    
    private handleSave(formData: {
        commentIndex: number,
        textDisplay: string,
        commentBody: string,
        targetArticle: string,
        targetTextStart: string,
        targetTextEnd: string,
        targetTextDisplay: string
    }): void {
        console.log('Comment form saved:', formData);
        
        this.showCommentsList();
    }
    
    private showCommentsList(): void {
        this.showingList = true;
        this.formContentEl.hide();
        this.listContentEl.show();
    }
    
    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
