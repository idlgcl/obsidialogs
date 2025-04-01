import { Component } from "obsidian";
import { AnnotationData, AnnotationService } from "../utils/annotation-service";

export interface CommentsTabOptions {
    container: HTMLElement;
    onSelectComment: (comment: AnnotationData) => void;
    onNewComment: () => void;
}

export class CommentsTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectComment: (comment: AnnotationData) => void;
    private onNewComment: () => void;
    private commentsListEl: HTMLElement;
    
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
        
        this.commentsListEl = commentsListEl.createDiv({ cls: 'idl-comments-items' });
    }
    
    public async updateComments(annotationService: AnnotationService, filePath: string): Promise<void> {
        if (!annotationService || !filePath) {
            this.displayEmptyState();
            return;
        }
        
        try {
            const annotations = await annotationService.loadAnnotations(filePath);
            const comments = annotations.comments;
            
            this.commentsListEl.empty();
            
            if (Object.keys(comments).length === 0) {
                this.displayEmptyState();
                return;
            }
            
            for (const commentId in comments) {
                const comment = comments[commentId];
                this.renderCommentItem(comment);
            }
        } catch (error) {
            console.error('Error loading comments:', error);
            this.displayEmptyState();
        }
    }
    
    private displayEmptyState(): void {
        this.commentsListEl.empty();
        const emptyStateEl = this.commentsListEl.createDiv({ cls: 'comment-empty-state' });
        emptyStateEl.setText('No comments found');
    }
    
    private renderCommentItem(comment: AnnotationData): void {
        const commentItemEl = this.commentsListEl.createDiv({ cls: 'comment-item' });
        commentItemEl.setText(comment.src_txt_display);
        
        commentItemEl.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onSelectComment(comment);
        };
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
