import { Component } from "obsidian";

export interface CommentsTabOptions {
    container: HTMLElement;
    onSelectComment: () => void;
    onNewComment: () => void;
}

export class CommentsTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectComment: () => void;
    private onNewComment: () => void; 
    
    constructor(options: CommentsTabOptions) {
        super();
        this.container = options.container;
        this.onSelectComment = options.onSelectComment;
        this.onNewComment = options.onNewComment;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-comments-tab' });
        
        const commentsListEl = this.contentEl.createDiv({ cls: 'idl-comments-list' });
        
        const newCommentBtn = commentsListEl.createDiv({ cls: 'idl-new-comment-btn' });
        newCommentBtn.setText('New Comment');
        
        newCommentBtn.addEventListener('click', () => {
            this.onNewComment();
        });
    }
    
    show() {
        this.contentEl.style.display = 'block';
    }
    
    hide() {
        this.contentEl.style.display = 'none';
    }
    
    onunload() {
        this.contentEl.remove();
    }
}
