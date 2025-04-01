import { Component } from "obsidian";
import { AnnotationData, AnnotationService } from "../utils/annotation-service";

export interface NotesTabOptions {
    container: HTMLElement;
    onSelectNote: (note: AnnotationData) => void;
    onNewNote: () => void;
}

export class NotesTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectNote: (note: AnnotationData) => void;
    private onNewNote: () => void;
    private notesListEl: HTMLElement;
    
    constructor(options: NotesTabOptions) {
        super();
        this.container = options.container;
        this.onSelectNote = options.onSelectNote;
        this.onNewNote = options.onNewNote;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-notes-tab' });
        
        const notesListEl = this.contentEl.createDiv({ cls: 'idl-notes-list' });
        
        const newNoteBtn = notesListEl.createDiv({ cls: 'idl-new-note-btn' });
        newNoteBtn.setText('New Note');
        
        newNoteBtn.addEventListener('click', () => {
            this.onNewNote();
        });
        
        this.notesListEl = notesListEl.createDiv({ cls: 'idl-notes-items' });
    }
    
    public async updateNotes(annotationService: AnnotationService, filePath: string): Promise<void> {
        if (!annotationService || !filePath) {
            this.displayEmptyState();
            return;
        }
        
        try {
            const annotations = await annotationService.loadAnnotations(filePath);
            const notes = annotations.notes;
            
            this.notesListEl.empty();
            
            if (Object.keys(notes).length === 0) {
                this.displayEmptyState();
                return;
            }
            
            for (const noteId in notes) {
                const note = notes[noteId];
                this.renderNoteItem(note);
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            this.displayEmptyState();
        }
    }
    
    private displayEmptyState(): void {
        this.notesListEl.empty();
        const emptyStateEl = this.notesListEl.createDiv({ cls: 'note-empty-state' });
        emptyStateEl.setText('No notes found');
    }
    
    private renderNoteItem(note: AnnotationData): void {
        const noteItemEl = this.notesListEl.createDiv({ cls: 'comment-item' });
        noteItemEl.setText(note.src_txt_display);
        
        noteItemEl.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onSelectNote(note);
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
