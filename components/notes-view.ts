import { ItemView, WorkspaceLeaf, Component, MarkdownView, Notice } from 'obsidian';
import { ARTICLE_VIEW_TYPE, ArticleView } from './article-view';
import { AnnotationService } from '../utils/annotation-service';

import { v4 as uuidv4 } from 'uuid';


export const NOTES_VIEW_TYPE = 'idealogs-notes-view';

export class NotesView extends ItemView {
    private notesContentEl: HTMLElement;
    private formContainer: HTMLElement;
    private articleId: string;
    private component: Component;
    private annotationService: AnnotationService;

    private textStart: HTMLInputElement;
    private textEnd: HTMLInputElement;
    private textDisplay: HTMLInputElement;
    private targetArticle: HTMLInputElement;
    private targetTextStart: HTMLInputElement;
    private targetTextEnd: HTMLInputElement;
    private targetTextDisplay: HTMLInputElement;

    private sourceFilePath: string | null = null;
    private sourceMarkdownView: MarkdownView | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.articleId = '';
        this.component = new Component();
        this.annotationService = new AnnotationService(this.app);
        this.notesContentEl = this.contentEl.createDiv({ cls: 'idealogs-notes-content' });
    }
    
    async setState(state: any, result: any): Promise<void> {
        if (state && state.articleId) {
            this.articleId = state.articleId;
            
            if (state.sourceFilePath) {
                this.sourceFilePath = state.sourceFilePath;
                this.findSourceMarkdownView();
            }
            
            this.notesContentEl.empty();
            this.notesContentEl.createEl('h3', { text: 'Add Note' });
            this.createForm();
        }
    }

    private findSourceMarkdownView(): void {
        if (!this.sourceFilePath) return;
        
        const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
        
        for (const leaf of markdownLeaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && 
                view.file && 
                view.file.path === this.sourceFilePath) {
                this.sourceMarkdownView = view;
                return;
            }
        }
    }

    private createForm(): void {
        this.formContainer = this.notesContentEl.createDiv({ cls: 'idl-notes-form' });
        
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

        const textDisplayField = this.formContainer.createDiv({ cls: 'idl-form-field' });
        textDisplayField.createEl('label', { text: 'Text Display' });
        this.textDisplay = textDisplayField.createEl('input', { 
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
    
    private async findTargetText(text: string, type: 'start' | 'end'): Promise<void> {
        if (!text.trim()) return;
        
        const articleLeaves = this.app.workspace.getLeavesOfType(ARTICLE_VIEW_TYPE);
        if (articleLeaves.length === 0) return;
        
        const articleView = articleLeaves[0].view as ArticleView;
        const wordSpans = this.getAllWordSpansFromArticleView(articleView);
        
        if (!wordSpans || wordSpans.length === 0) return;
        
        const textSpans = this.findTextSpans(wordSpans, text);
        if (textSpans.length === 0) return;
        
        if (type === 'start') {
            if (this.targetTextDisplay.value.trim() === '') {
                this.targetTextDisplay.value = text;
            }
        }
        
        this.highlightWords(textSpans, articleView);
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
    
    private async handleSave(): Promise<void> {
        if (!this.sourceMarkdownView) {
            new Notice('Source document not available');
            return;
        }

        const textStart = this.textStart.value.trim();
        const textEnd = this.textEnd.value.trim();
        const textDisplay = this.textDisplay.value.trim();
        
        if (!textStart || !textEnd || !textDisplay) {
            new Notice('Please fill all required fields');
            return;
        }
        
        const content = this.sourceMarkdownView.editor.getValue();
        const startPos = content.indexOf(textStart);
        const endPos = content.indexOf(textEnd) + textEnd.length;
        
        if (startPos === -1 || endPos === -1) {
            new Notice("Text start or end not found in the source document");
            return;
        }
        
        if (startPos >= endPos) {
            new Notice("Text start must appear before text end");
            return;
        }
        
        const textBetween = content.substring(startPos, endPos);
        
        if (!textBetween.includes(textDisplay)) {
            new Notice(`"${textDisplay}" not found between start and end text`);
            return;
        }

        const articleLeaves = this.app.workspace.getLeavesOfType(ARTICLE_VIEW_TYPE);
        if (articleLeaves.length === 0) return;
        
        const articleView = articleLeaves[0].view as ArticleView;
        const wordSpans = this.getAllWordSpansFromArticleView(articleView);
        
        if (!wordSpans || wordSpans.length === 0) return;
  
        const targetArticlePath = this.targetArticle.value.trim();
        const targetTextStart = this.targetTextStart.value.trim();
        const targetTextEnd = this.targetTextEnd.value.trim();
        const targetTextDisplay = this.targetTextDisplay.value.trim();
        
        if (!targetArticlePath || !targetTextStart || !targetTextEnd || !targetTextDisplay) {
            new Notice('Please fill all target fields');
            return;
        }
        
        this.findTargetText(targetTextStart, 'start');
        this.findTargetText(targetTextEnd, 'end');
        
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
            const noteId = uuidv4();
            
            await this.annotationService.saveNote({
                id: noteId,
                sourceFilePath: this.sourceFilePath || '',
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
                targetDisplayIndices
            });
            
            new Notice('Note saved successfully');
            
            this.textStart.value = '';
            this.textEnd.value = '';
            this.textDisplay.value = '';
            this.targetTextStart.value = '';
            this.targetTextEnd.value = '';
            this.targetTextDisplay.value = '';
        } catch (error) {
            new Notice(`Error saving note: ${error.message}`);
        }
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
