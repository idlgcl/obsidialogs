import { Component, MarkdownView, App } from "obsidian";
import { AnnotationData, AnnotationService } from "../utils/annotation-service";
import { parseComments } from "../utils/comment-parser";

export interface CommentsTabOptions {
    container: HTMLElement;
    onSelectComment: (comment: AnnotationData) => void;
    onNewComment: () => void;
    app: App;
}

export class CommentsTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectComment: (comment: AnnotationData) => void;
    private onNewComment: () => void;
    private commentsListEl: HTMLElement;
    private newCommentBtn: HTMLElement;
    private app: App;
    
    constructor(options: CommentsTabOptions) {
        super();
        this.container = options.container;
        this.onSelectComment = options.onSelectComment;
        this.onNewComment = options.onNewComment;
        this.app = options.app;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-comments-tab' });
        
        const commentsListEl = this.contentEl.createDiv({ cls: 'idl-comments-list' });
        
        this.newCommentBtn = commentsListEl.createDiv({ cls: 'idl-new-comment-btn' });
        this.newCommentBtn.setText('New Comment');
        
        this.newCommentBtn.addEventListener('click', () => {
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
            const hasCommentsInFile = await this.checkForCommentsInFile(filePath);
            
            if (!hasCommentsInFile) {
                this.displayEmptyState();
                this.newCommentBtn.addClass('disabled');
                this.newCommentBtn.style.opacity = '0.6';
                
                 this.newCommentBtn.setAttribute('title', "No comments found. To add one, use the syntax 'Comment title. Comment body:'");
                
                 this.newCommentBtn.style.pointerEvents = 'auto';
                 this.newCommentBtn.style.cursor = 'not-allowed';
                return;
            }
            
            this.newCommentBtn.removeClass('disabled');
            this.newCommentBtn.removeAttribute('title');
            this.newCommentBtn.style.pointerEvents = 'auto';
            this.newCommentBtn.style.opacity = '1';

            const tooltip = this.newCommentBtn.querySelector('.idealogs-tooltip');
            if (tooltip) tooltip.remove();
            
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
    
    private async checkForCommentsInFile(filePath: string): Promise<boolean> {
        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
        let content = '';
        
        for (const leaf of markdownLeaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && 
                view.file && 
                view.file.path === filePath) {
                content = view.editor.getValue();
                break;
            }
        }
        
        if (content) {
            const comments = parseComments(content);
            return comments.length > 0;
        }
        
        return false;
    }
    
    private displayEmptyState(): void {
        this.commentsListEl.empty();
        const emptyStateEl = this.commentsListEl.createDiv({ cls: 'comment-empty-state' });
        emptyStateEl.setText('No comments found');
    }
    
    private renderCommentItem(comment: AnnotationData): void {
        const commentItemEl = this.commentsListEl.createDiv({ 
            cls: `comment-item ${comment.isValid === false ? 'comment-invalid' : ''}`
        });
        
        commentItemEl.createDiv({ 
            cls: 'comment-text',
            text: comment.src_txt_display 
        });
        
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
