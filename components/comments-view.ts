import { ItemView, WorkspaceLeaf, Component, MarkdownView, Notice } from 'obsidian';
import { Comment, parseComments } from '../utils/comment-parser';
import { ArticleAutocompleteField } from './article-input';
import { Article } from '../types';
import { ARTICLE_VIEW_TYPE, ArticleView } from './article-view';
import { ApiService } from '../api';
import { AnnotationService } from 'utils/annotation-service';

export const COMMENTS_VIEW_TYPE = 'idealogs-comments-view';

export class CommentsView extends ItemView {
    private listContentEl: HTMLElement;
    private formContentEl: HTMLElement;
    private component: Component;
    private showingList = true;
    private comments: Comment[] = [];
    private articleAutocomplete: ArticleAutocompleteField | null = null;
    private selectedArticle: Article | null = null;
    private apiService: ApiService;
    private annotationService: AnnotationService;
    
    private selectedComment: Comment;
    private targetTextStartInput: HTMLInputElement;
    private targetTextEndInput: HTMLInputElement;
    private targetTextDisplayInput: HTMLInputElement;
    private sourceFilePath: string | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.component = new Component();
        this.apiService = new ApiService();
        this.annotationService = new AnnotationService(this.app);
        
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

        this.sourceFilePath = activeView.file?.path || null;
        
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
                this.selectedComment = comment;
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
        
        this.articleAutocomplete = new ArticleAutocompleteField({
            container: targetArticleField,
            placeholder: 'Search for an article...',
            onChange: (article) => {
                this.selectedArticle = article;
                this.openArticleView(article);
            }
        });
        this.component.addChild(this.articleAutocomplete);
        
        const textRangeFields = formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = textRangeFields.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Target Text Start' });
        const targetTextStart = startField.createEl('input', { 
            type: 'text'
        });
        this.targetTextStartInput = targetTextStart;
        
        const endField = textRangeFields.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Target Text End' });
        const targetTextEnd = endField.createEl('input', { 
            type: 'text'
        });
        this.targetTextEndInput = targetTextEnd;
        
        const targetDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        const targetTextDisplay = targetDisplayField.createEl('input', { 
            type: 'text'
        });
        this.targetTextDisplayInput = targetTextDisplay;
        
        const saveButtonContainer = formContainer.createDiv({ cls: 'idl-btns' });
        const saveButton = saveButtonContainer.createEl('button', { text: 'Save' });
        saveButton.addEventListener('click', () => this.handleSave(commentIndex, {
            textDisplay: textDisplay.value,
            commentBody: commentTextarea.value,
            targetArticle: this.selectedArticle ? this.selectedArticle.id : '',
            targetTextStart: targetTextStart.value, 
            targetTextEnd: targetTextEnd.value,
            targetTextDisplay: targetTextDisplay.value
        }));
    }
    
    private async openArticleView(article: Article): Promise<void> {
        try {
            const articleLeaf = this.app.workspace.getLeaf('split');
            
            await articleLeaf.setViewState({
                type: ARTICLE_VIEW_TYPE,
                active: true,
                state: { articleId: article.id }
            });
            
            const articleView = articleLeaf.view as ArticleView;
            
            try {
                const content = await this.apiService.fetchFileContent(article.id);
                await articleView.setContent(content);
            } catch (error) {
                console.error('Error fetching article content:', error);
            }
        } catch (error) {
            console.error('Error opening article view:', error);
        }
    }
    
    private getAllWordSpansFromArticleView(articleView: ArticleView): HTMLElement[] {
        const contentEl = articleView.contentEl;
        if (!contentEl) return [];
        
        const articleContentEl = contentEl.querySelector('.idealogs-article-content');
        if (!articleContentEl) return [];
        
        const spans = articleContentEl.querySelectorAll('span[data-word-index]');
        return Array.from(spans) as HTMLElement[];
    }
    
    private findTextSpans(spans: HTMLElement[], text: string): HTMLElement[] {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return [];
        
        if (words.length === 1) {
            return spans.filter(span => span.textContent === words[0]);
        }
        
        const result: HTMLElement[] = [];
        let currentSequence: HTMLElement[] = [];
        
        for (let i = 0; i < spans.length; i++) {
            if (spans[i].textContent === words[currentSequence.length]) {
                currentSequence.push(spans[i]);
                
                if (currentSequence.length === words.length) {
                    result.push(...currentSequence);
                    currentSequence = [];
                }
            } else {
                if (spans[i].textContent === words[0]) {
                    currentSequence = [spans[i]];
                } else {
                    currentSequence = [];
                }
            }
        }
        
        return result;
    }
    
    private findTextSpansInRange(rangeSpans: HTMLElement[], text: string): HTMLElement[] {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return [];
        
        if (words.length === 1) {
            return rangeSpans.filter(span => span.textContent === words[0]);
        }
        
        const result: HTMLElement[] = [];
        
        for (let i = 0; i <= rangeSpans.length - words.length; i++) {
            let found = true;
            const sequence: HTMLElement[] = [];
            
            for (let j = 0; j < words.length; j++) {
                if (rangeSpans[i + j].textContent !== words[j]) {
                    found = false;
                    break;
                }
                sequence.push(rangeSpans[i + j]);
            }
            
            if (found) {
                result.push(...sequence);
                break; 
            }
        }
        
        return result;
    }
    
    private getTextFromSpans(spans: HTMLElement[]): string {
        return spans.map(span => span.textContent).join(' ');
    }
    
    private getSpansBetweenIndices(allSpans: HTMLElement[], startIndex: number, endIndex: number): HTMLElement[] {
        return allSpans.filter(span => {
            const indexAttr = parseInt(span.getAttribute('data-word-index') || '-1');
            return indexAttr >= startIndex && indexAttr <= endIndex;
        }).sort((a, b) => {
            const indexA = parseInt(a.getAttribute('data-word-index') || '0');
            const indexB = parseInt(b.getAttribute('data-word-index') || '0');
            return indexA - indexB;
        });
    }
    
    private highlightWords(spans: HTMLElement[], articleView: ArticleView): void {
        const allSpans = this.getAllWordSpansFromArticleView(articleView);
        allSpans.forEach(span => {
            span.classList.remove('idl-highlighted-word');
        });
        
        spans.forEach(span => {
            span.classList.add('idl-highlighted-word');
        });
    }
    
    private async handleSave(
        commentIndex: number,
        formData: {
            textDisplay: string,
            commentBody: string,
            targetArticle: string,
            targetTextStart: string,
            targetTextEnd: string,
            targetTextDisplay: string
        }
    ): Promise<void> {
        if (!this.sourceFilePath) {
            new Notice('Source document not available');
            return;
        }
        
        if (!formData.targetArticle) {
            new Notice('Please select a target article');
            return;
        }
        
        if (!formData.targetTextStart || !formData.targetTextEnd || !formData.targetTextDisplay) {
            new Notice('Please fill in all target text fields');
            return;
        }
        
        const articleLeaves = this.app.workspace.getLeavesOfType(ARTICLE_VIEW_TYPE);
        if (articleLeaves.length === 0) {
            new Notice('No article view found');
            return;
        }
        
        const articleView = articleLeaves[0].view as ArticleView;
        const wordSpans = this.getAllWordSpansFromArticleView(articleView);
        
        if (!wordSpans || wordSpans.length === 0) {
            new Notice('No word spans found in article view');
            return;
        }
        
        let targetStartIndex;
        let targetEndIndex;
        let targetFullText;
        let targetRangeIndices;
        let targetDisplayIndices;
        const srcIndices = this.selectedComment.indices;
        
        const targetTextStart = formData.targetTextStart;
        const targetTextEnd = formData.targetTextEnd;
        const targetTextDisplay = formData.targetTextDisplay;
        
        if (targetTextStart && targetTextEnd && targetTextDisplay) {
            const targetStartSpans = this.findTextSpans(wordSpans, targetTextStart);
            const targetEndSpans = this.findTextSpans(wordSpans, targetTextEnd);
            
            if (targetStartSpans.length === 0 || targetEndSpans.length === 0) {
                new Notice('Could not find target text ranges');
                return;
            }
            
            targetStartIndex = parseInt(targetStartSpans[0].getAttribute('data-word-index') || '0');
            targetEndIndex = parseInt(targetEndSpans[targetEndSpans.length - 1].getAttribute('data-word-index') || '0');
            
            const targetRangeSpans = this.getSpansBetweenIndices(wordSpans, targetStartIndex, targetEndIndex);
            
            targetFullText = this.getTextFromSpans(targetRangeSpans);
            
            if (!targetFullText.includes(targetTextDisplay)) {
                new Notice('Target display text not found in the selected range');
                return;
            }
            
            const targetDisplaySpans = this.findTextSpansInRange(targetRangeSpans, targetTextDisplay);
            
            if (targetDisplaySpans.length === 0) {
                new Notice('Could not locate target display text within range');
                return;
            }

            targetRangeIndices = targetRangeSpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            targetDisplayIndices = targetDisplaySpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            
            this.highlightWords(targetDisplaySpans, articleView);
        } else {
            new Notice('Please fill in all target text fields');
            return;
        }
        
        try {
            await this.annotationService.saveComment({
                commentIndex,
                textDisplay: formData.textDisplay,
                commentBody: formData.commentBody,
                targetArticle: formData.targetArticle,
                targetTextStart: targetTextStart,
                targetTextEnd: targetTextEnd,
                targetTextDisplay: targetTextDisplay,
                targetStartIndex,
                targetEndIndex,
                targetFullText,
                targetRangeIndices,
                targetDisplayIndices,
                srcIndices,
                sourceFilePath: this.sourceFilePath
            });
            
            new Notice('Comment saved successfully');
            // this.showCommentsList();
        } catch (error) {
            new Notice(`Error saving comment: ${error.message}`);
        }
    }
    
    private showCommentsList(): void {
        this.showingList = true;
        this.formContentEl.hide();
        this.listContentEl.show();
        
        if (this.articleAutocomplete) {
            this.component.removeChild(this.articleAutocomplete);
            this.articleAutocomplete = null;
        }
        
        this.selectedArticle = null;
    }
    
    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
