import { Component, MarkdownView, Notice, App } from "obsidian";
import { annotationToComment, Comment, parseComments } from '../utils/comment-parser';
import { ArticleAutocompleteField } from './article-input';
import { Article } from '../types';
import { IDEALOGS_READER, IdealogsReaderView } from './idealogs-reader';
import { ApiService } from '../utils/api';
import { AnnotationData, AnnotationService } from '../utils/annotation-service';

import { v4 as uuidv4 } from 'uuid';

export interface CommentFormOptions {
    container: HTMLElement;
    onBack: () => void;
    activeFilePath: string;
    app: App;
    commentData?: AnnotationData;
}

export class CommentForm extends Component {
    private app: App; 
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onBack: () => void;
    private activeFilePath: string;
    private apiService: ApiService;
    private annotationService: AnnotationService;
    private commentData: AnnotationData;
    public isTargetArticleSelection = false;
    
    private comments: Comment[] = [];
    private textDisplayDropdown: HTMLSelectElement;
    private commentTextarea: HTMLTextAreaElement;
    private articleAutocomplete: ArticleAutocompleteField | null = null;
    private selectedArticle: Article | null = null;
    private targetTextStartInput: HTMLInputElement;
    private targetTextEndInput: HTMLInputElement;
    private targetTextDisplayInput: HTMLInputElement;
    
    constructor(options: CommentFormOptions) {
        super();
        this.container = options.container;
        this.onBack = options.onBack;
        this.activeFilePath = options.activeFilePath;
        this.app = options.app; 
        this.apiService = new ApiService();
        this.annotationService = new AnnotationService(this.app);
        
        this.createForm();
        
        if (options.commentData) {
            this.populateForm(options.commentData);
            this.setFormReadOnly();
            this.commentData = options.commentData
        } else {
            this.loadCommentsFromFile();
            this.resetFormFields();
        }
    }
    
    private populateForm(commentData: AnnotationData): void {
        this.textDisplayDropdown.innerHTML = '';
        const option = document.createElement('option');
        option.value = commentData.id;
        option.text = commentData.src_txt_display;
        option.selected = true;
        this.textDisplayDropdown.appendChild(option);
        
        this.commentTextarea.value = commentData.src_txt.replace(commentData.src_txt_display, '').trim();
        
        this.articleAutocomplete?.setValue(commentData.target);
        this.selectedArticle = {
            id: commentData.target,
            title: commentData.target,
            kind: ''
        };
        
        this.targetTextStartInput.value = commentData.target_txt_start;
        this.targetTextEndInput.value = commentData.target_txt_end;
        this.targetTextDisplayInput.value = commentData.target_txt_display;
        
        if (this.selectedArticle) {
            this.openArticleView(this.selectedArticle);
        }
    }

    private setFormReadOnly(): void {
        this.textDisplayDropdown.disabled = true;
        this.commentTextarea.disabled = true;
    }
    
    private loadCommentsFromFile(): void {
        setTimeout(() => {
            const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
            let content = '';
            
            for (const leaf of markdownLeaves) {
                const view = leaf.view;
                if (view instanceof MarkdownView && 
                    view.file && 
                    view.file.path === this.activeFilePath) {
                    content = view.editor.getValue();
                    break;
                }
            }
            
            if (content) {
                this.comments = parseComments(content);
                this.updateCommentDropdown();
            }

        }, 500); 
    }

    private resetFormFields(): void {
        this.commentTextarea.value = '';
        this.targetTextDisplayInput.value = '';
        this.targetTextStartInput.value = '';
        this.targetTextEndInput.value = '';
        this.articleAutocomplete?.setValue('');
    }
    
    private updateCommentDropdown(): void {
        this.textDisplayDropdown.innerHTML = '';
        
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.text = 'Select a comment...';
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        this.textDisplayDropdown.appendChild(placeholderOption);
        
        this.comments.forEach((comment, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            option.text = comment.title;
            this.textDisplayDropdown.appendChild(option);
        });
    }
    
    private createForm(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-comment-form' });
        
        const headerContainer = this.contentEl.createDiv({ cls: 'form-header' });
        const backButton = headerContainer.createEl('button', { text: 'Back to List' });
        backButton.addEventListener('click', this.onBack);
        
        headerContainer.createEl('h3', { text: 'New Comment' });
        
        const formContainer = this.contentEl.createDiv({ cls: 'idl-form' });
        
        // Text Display field (dropdown)
        const textDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        this.textDisplayDropdown = textDisplayField.createEl('select', {
            cls: 'idl-comment-dropdown'
        });
        
        this.textDisplayDropdown.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const commentIndex = parseInt(target.value);
            if (!isNaN(commentIndex) && this.comments[commentIndex]) {
                this.commentTextarea.value = this.comments[commentIndex].body;
            }
        });
        
        // Comment field
        const commentField = formContainer.createDiv({ cls: 'idl-form-field' });
        commentField.createEl('label', { text: 'Comment' });
        this.commentTextarea = commentField.createEl('textarea', {
            attr: { rows: '4' }
        });
        
        // Target Article field
        const targetArticleField = formContainer.createDiv({ cls: 'idl-form-field' });
        targetArticleField.createEl('label', { text: 'Target Article' });
        
        this.articleAutocomplete = new ArticleAutocompleteField({
            container: targetArticleField,
            placeholder: 'Search for an article...',
            onChange: (article) => {
                this.isTargetArticleSelection = true;
                this.selectedArticle = article;
                this.openArticleView(article);
            }
        });
        this.addChild(this.articleAutocomplete);
        
        // Target text range fields
        const textRangeFields = formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
        const startField = textRangeFields.createDiv({ cls: 'idl-start-field' });
        startField.createEl('label', { text: 'Target Text Start' });
        this.targetTextStartInput = startField.createEl('input', { 
            type: 'text'
        });
        
        const endField = textRangeFields.createDiv({ cls: 'idl-end-field' });
        endField.createEl('label', { text: 'Target Text End' });
        this.targetTextEndInput = endField.createEl('input', { 
            type: 'text'
        });
        
        // Target text display field
        const targetDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        this.targetTextDisplayInput = targetDisplayField.createEl('input', { 
            type: 'text'
        });
        
        // Save button
        const saveButtonContainer = formContainer.createDiv({ cls: 'idl-btns' });
        const saveButton = saveButtonContainer.createEl('button', { text: 'Save' });
        saveButton.addEventListener('click', () => this.handleSave());
    }
    
private async openArticleView(article: Article): Promise<void> {
    try {
        const existingArticleLeaves = this.app.workspace.getLeavesOfType(IDEALOGS_READER);
        let articleLeaf;
        
        if (existingArticleLeaves.length > 0) {
            articleLeaf = existingArticleLeaves[0];
            await articleLeaf.setViewState({
                type: IDEALOGS_READER,
                active: false,
                state: { articleId: article.id }
            });
        } else {
            articleLeaf = this.app.workspace.getLeaf('split');
            await articleLeaf.setViewState({
                type: IDEALOGS_READER,
                active: false,
                state: { articleId: article.id }
            });
        }
        
        const articleView = articleLeaf.view as IdealogsReaderView;
        
        try {
            const content = await this.apiService.fetchFileContent(article.id);
            await articleView.setContent(content);
        } catch (error) {
            console.error('Error fetching article content:', error);
        }
    } catch (error) {
        console.error('Error opening article view:', error);
        this.isTargetArticleSelection = false; 
    }
}
    
    private async handleSave(): Promise<void> {
        if (!this.activeFilePath) {
            new Notice('Source document not available');
            return;
        }
        
        if (!this.selectedArticle) {
            new Notice('Please select a target article');
            return;
        }

        let comment : Comment;
        let commentId : string;

        if (!this.commentData) {
            const commentIndex = parseInt(this.textDisplayDropdown.value);
            if (isNaN(commentIndex) || commentIndex < 0 || commentIndex >= this.comments.length) {
                new Notice('Please select a comment');
                return;
            }
            
            comment = this.comments[commentIndex];
            commentId = uuidv4() // TODO :: do it in annotation service
        } else {
            comment = annotationToComment(this.commentData)
            commentId = this.commentData.id
        }
        
        const targetTextStart = this.targetTextStartInput.value.trim();
        const targetTextEnd = this.targetTextEndInput.value.trim();
        const targetTextDisplay = this.targetTextDisplayInput.value.trim();
        
        if (!targetTextStart || !targetTextEnd || !targetTextDisplay) {
            new Notice('Please fill in all target text fields');
            return;
        }
        
        const articleLeaves = this.app.workspace.getLeavesOfType(IDEALOGS_READER);
        if (articleLeaves.length === 0) {
            new Notice('No article view found');
            return;
        }
        
        const articleView = articleLeaves[0].view as IdealogsReaderView;
        const wordSpans = this.getAllWordSpansFromArticleView(articleView);
        
        if (!wordSpans || wordSpans.length === 0) {
            new Notice('No word spans found in article view');
            return;
        }
        
        try {
            const targetStartSpans = this.findTextSpans(wordSpans, targetTextStart);
            const targetEndSpans = this.findTextSpans(wordSpans, targetTextEnd);
            
            if (targetStartSpans.length === 0 || targetEndSpans.length === 0) {
                new Notice('Could not find target text ranges');
                return;
            }
            
            const targetStartIndex = parseInt(targetStartSpans[0].getAttribute('data-word-index') || '0');
            const targetEndIndex = parseInt(targetEndSpans[targetEndSpans.length - 1].getAttribute('data-word-index') || '0');
            
            const targetRangeSpans = this.getSpansBetweenIndices(wordSpans, targetStartIndex, targetEndIndex);
            
            const targetFullText = this.getTextFromSpans(targetRangeSpans);
            
            if (!targetFullText.includes(targetTextDisplay)) {
                new Notice('Target display text not found in the selected range');
                return;
            }
            
            const targetDisplaySpans = this.findTextSpansInRange(targetRangeSpans, targetTextDisplay);
            
            if (targetDisplaySpans.length === 0) {
                new Notice('Could not locate target display text within range');
                return;
            }
            
            const targetRangeIndices = targetRangeSpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            const targetDisplayIndices = targetDisplaySpans.map(span => 
                parseInt(span.getAttribute('data-word-index') || '0')
            );
            
            this.highlightWords(targetDisplaySpans, articleView);
            
            await this.annotationService.saveComment({
                commentId,
                textDisplay: comment.title,
                commentBody: this.commentTextarea.value,
                targetArticle: this.selectedArticle.id,
                targetTextStart,
                targetTextEnd,
                targetTextDisplay,
                targetStartIndex,
                targetEndIndex,
                targetFullText,
                targetRangeIndices,
                targetDisplayIndices,
                srcIndices: comment.indices,
                sourceFilePath: this.activeFilePath
            });
            
            new Notice('Comment saved successfully');
            this.onBack();
        } catch (error) {
            new Notice(`Error saving comment: ${error.message}`);
        }
    }
    
    private getAllWordSpansFromArticleView(articleView: IdealogsReaderView): HTMLElement[] {
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
    
    private highlightWords(spans: HTMLElement[], articleView: IdealogsReaderView): void {
        const allSpans = this.getAllWordSpansFromArticleView(articleView);
        allSpans.forEach(span => {
            span.classList.remove('idl-highlighted-word');
        });
        
        spans.forEach(span => {
            span.classList.add('idl-highlighted-word');
        });
    }
    
    public updateActiveFilePath(filePath: string): void {
        this.activeFilePath = filePath;
        
        if (!this.isTargetArticleSelection) {
            this.loadCommentsFromFile();
            this.resetFormFields(); 
        } else {
            this.isTargetArticleSelection = false; 
        }
    }
    
    show() {
        this.contentEl.style.display = 'block';
    }
    
    hide() {
        this.contentEl.style.display = 'none';
    }
    
    onunload() {
        if (this.articleAutocomplete) {
            this.removeChild(this.articleAutocomplete);
        }
        this.contentEl.remove();
    }
}
