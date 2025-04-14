import { Component, Notice, App } from "obsidian";
import { ArticleAutocompleteField } from './article-input';
import { Article } from '../types';
import { IDEALOGS_READER, IdealogsReaderView } from './idealogs-reader';
import { ApiService } from '../utils/api';
import { AnnotationData, AnnotationService } from '../utils/annotation-service';

import { Note } from "utils/note-parser";

export interface NoteFormOptions {
    container: HTMLElement;
    onBack: () => void;
    activeFilePath: string;
    app: App;
    noteData?: AnnotationData;
    note?: Note;
}

export class NoteForm extends Component {
    private app: App;
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onBack: () => void;
    private activeFilePath: string;
    private apiService: ApiService;
    private annotationService: AnnotationService;
    public isTargetArticleSelection = false;
    private noteData: AnnotationData | undefined;

    private note?: Note;

    
    private textStart: HTMLInputElement;
    private textEnd: HTMLInputElement;
    private textDisplay: HTMLInputElement;
    private articleAutocomplete: ArticleAutocompleteField | null = null;
    private selectedArticle: Article | null = null;
    private targetTextStartInput: HTMLInputElement;
    private targetTextEndInput: HTMLInputElement;
    private targetTextDisplayInput: HTMLInputElement;
    
    constructor(options: NoteFormOptions) {
        super();
        this.container = options.container;
        this.onBack = options.onBack;
        this.activeFilePath = options.activeFilePath;
        this.app = options.app;
        this.apiService = new ApiService();
        this.annotationService = new AnnotationService(this.app);
        this.noteData = options.noteData;
        this.note = options.note || this.noteData?.noteMeta;

        
        this.createForm();
        
        if (this.noteData) {
            this.populateForm(this.noteData);
        }
    }
    
    private populateForm(noteData: AnnotationData): void {
        this.textStart.value = noteData.src_txt_start || '';
        this.textEnd.value = noteData.src_txt_end || '';
        this.textDisplay.value = noteData.src_txt_display || '';
        
        this.targetTextStartInput.value = noteData.target_txt_start || '';
        this.targetTextEndInput.value = noteData.target_txt_end || '';
        this.targetTextDisplayInput.value = noteData.target_txt_display || '';
        
        this.articleAutocomplete?.setValue(noteData.target || '');
        
        if (noteData.target) {
            this.articleAutocomplete?.setDisabled(true);
            
            this.selectedArticle = {
                id: noteData.target,
                title: noteData.target,
                kind: ''
            };
            
            if (this.selectedArticle) {
                this.openArticleView(this.selectedArticle);
            }
        }
    }
    
    private createForm(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-note-form' });
        
        const headerContainer = this.contentEl.createDiv({ cls: 'form-header' });
        const backButton = headerContainer.createEl('button', { text: 'Back to List' });
        backButton.addEventListener('click', this.onBack);
        
        headerContainer.createEl('h3', { text: this.noteData ? 'Edit Note' : 'New Note' });
        
        const formContainer = this.contentEl.createDiv({ cls: 'idl-form' });
        
        const isInvalid = this.noteData && this.noteData.isValid === false;
        if (isInvalid) {
            const validationWarningEl = formContainer.createDiv({ cls: 'idl-validation-warning' });
            validationWarningEl.createDiv({ 
                cls: 'idl-warning-icon',
                text: '⚠️'
            });
            
            validationWarningEl.createDiv({
                cls: 'idl-warning-message',
                text: this.noteData?.validationMessage || 'Note may be invalid due to document changes'
            });
        }
        
        // Original form elements
        const srcRangeFields = formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
        
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
    
        const textDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        this.textDisplay = textDisplayField.createEl('input', { 
            type: 'text'
        });
    
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
    
        const targetDisplayField = formContainer.createDiv({ cls: 'idl-form-field' });
        targetDisplayField.createEl('label', { text: 'Target Text Display' });
        this.targetTextDisplayInput = targetDisplayField.createEl('input', { 
            type: 'text'
        });
    
        const targetSrcRangeFields = formContainer.createDiv({ cls: 'idl-form-field idl-range-field' });
         
        const targetStartField = targetSrcRangeFields.createDiv({ cls: 'idl-start-field' });
        targetStartField.createEl('label', { text: 'Target Text Start' });
        this.targetTextStartInput = targetStartField.createEl('input', { 
            type: 'text'
        });
        
        const targetEndField = targetSrcRangeFields.createDiv({ cls: 'idl-end-field' });
        targetEndField.createEl('label', { text: 'Target Text End' });
        this.targetTextEndInput = targetEndField.createEl('input', { 
            type: 'text'
        });
    
        // Buttons container
        const buttonContainer = formContainer.createDiv({ cls: 'idl-btns' });
        const saveButton = buttonContainer.createEl('button', { text: 'Save' });
        
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
                    state: { 
                        articleId: article.id, 
                        openedFromCommand: false 
                    }
                });
            } else {
                articleLeaf = this.app.workspace.getLeaf('split');
                await articleLeaf.setViewState({
                    type: IDEALOGS_READER,
                    active: false,
                    state: { 
                        articleId: article.id, 
                        openedFromCommand: false 
                    }
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

        const textStart = this.textStart.value.trim();
        const textEnd = this.textEnd.value.trim();
        const textDisplay = this.textDisplay.value.trim();
        
        if (!textStart || !textEnd || !textDisplay) {
            new Notice('Please fill all required fields');
            return;
        }

        try {
            const fileContent = await this.app.vault.adapter.read(this.activeFilePath);
            const linkText = this.note?.linkText || `[[${this.selectedArticle.id}]]`;
            
            const correctSequencePattern = new RegExp(`${textDisplay}\\s*${linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
            
            if (!correctSequencePattern.test(fileContent)) {
                new Notice(`Text display "${textDisplay}" must appear directly before the link`);
                return;
            }
        } catch (error) {
            console.error('Error validating text display position:', error);
        }
        
        const targetArticlePath = this.selectedArticle.id;
        const targetTextStart = this.targetTextStartInput.value.trim();
        const targetTextEnd = this.targetTextEndInput.value.trim();
        const targetTextDisplay = this.targetTextDisplayInput.value.trim();
        
        if (!targetArticlePath || !targetTextStart || !targetTextEnd || !targetTextDisplay) {
            new Notice('Please fill all target fields');
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
            
            try {
                const noteId = this.note?.id;
                
                await this.annotationService.saveNote({
                    id: noteId,
                    sourceFilePath: this.activeFilePath,
                    textStart,
                    textEnd,
                    textDisplay,
                    targetArticle: targetArticlePath,
                    targetTextStart,
                    targetTextEnd,
                    targetTextDisplay,
                    targetStartIndex,
                    targetEndIndex,
                    targetFullText,
                    targetRangeIndices,
                    targetDisplayIndices,
                    noteMeta: this.note 
                });
                
                new Notice('Note saved successfully');
                this.onBack();
            } catch (error) {
                new Notice(`Error saving note: ${error.message}`);
            }
        } catch (error) {
            new Notice(`Error processing note: ${error.message}`);
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
        
        if (this.isTargetArticleSelection) {
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
