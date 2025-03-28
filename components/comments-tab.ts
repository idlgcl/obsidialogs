import { Component } from "obsidian";

export interface CommentsTabOptions {
    container: HTMLElement;
    onSelectComment: () => void;
}

export class CommentsTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectComment: () => void;
    
    constructor(options: CommentsTabOptions) {
        super();
        this.container = options.container;
        this.onSelectComment = options.onSelectComment;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-comments-tab' });
        
        const commentsListEl = this.contentEl.createDiv({ cls: 'idl-comments-list' });
        
        const sampleComment = commentsListEl.createDiv({ cls: 'idl-list-item' });
        sampleComment.setText('Sample Comment');
        
        sampleComment.addEventListener('click', () => {
            this.onSelectComment();
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
