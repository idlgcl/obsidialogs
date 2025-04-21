import { Component, MarkdownView, App } from "obsidian";
import { AnnotationData, AnnotationService } from "../utils/annotation-service";
import { Note, parseNotes, noteToAnnotationData } from "../utils/note-parser";

export interface NotesTabOptions {
    container: HTMLElement;
    onSelectNote: (note: AnnotationData, originalNote?: Note) => void; 
    onNewNote: () => void;
    app: App; 
}

export class NotesTab extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectNote: (note: AnnotationData, originalNote: Note) => void;
    private onNewNote: () => void;
    private notesListEl: HTMLElement;
    private app: App;
    
    constructor(options: NotesTabOptions) {
        super();
        this.container = options.container;
        this.onSelectNote = options.onSelectNote;
        this.onNewNote = options.onNewNote;
        this.app = options.app;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'idl-notes-tab' });
        
        const notesListEl = this.contentEl.createDiv({ cls: 'idl-notes-list' });
        
        this.notesListEl = notesListEl.createDiv({ cls: 'idl-notes-items' });
    }
    
    public async updateNotes(annotationService: AnnotationService, filePath: string): Promise<void> {
        if (!filePath) {
            this.displayEmptyState();
            return;
        }
        
        try {
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
            
            if (!content) {
                this.displayEmptyState();
                return;
            }
            
            const parsedNotes = parseNotes(content);
            
            this.notesListEl.empty();
            
            const annotations = await annotationService.loadAnnotations(filePath);
            const savedNotes = annotations.notes;
            
            if (parsedNotes.length === 0 && Object.keys(savedNotes).length === 0) {
                this.displayEmptyState();
                return;
            }
            
            const remainingParsedNotes = [...parsedNotes];
            
            for (const noteId in savedNotes) {
                const savedNote = savedNotes[noteId];
                const savedNoteMeta = savedNote.noteMeta;
                
                if (!savedNoteMeta) continue;
                
                const matchIndex = remainingParsedNotes.findIndex(parsedNote => 
                    savedNoteMeta.linkText === parsedNote.linkText
                );
                
                if (matchIndex !== -1) {
                    remainingParsedNotes.splice(matchIndex, 1);
                }
                // else {
                //     savedNote.isValid = false;
                //     savedNote.validationMessage = "Note reference not found in document";
                // }
                
                this.renderNoteItem(savedNoteMeta, filePath, true, savedNote);
            }
            
            for (const parsedNote of remainingParsedNotes) {
                this.renderNoteItem(parsedNote, filePath, false);
            }
            
        } catch (error) {
            console.error('Error parsing notes:', error);
            this.displayEmptyState();
        }
    }
    
    private displayEmptyState(): void {
        this.notesListEl.empty();
        const emptyStateEl = this.notesListEl.createDiv({ cls: 'note-empty-state' });
        emptyStateEl.setText('No notes found.');
    }
    
    private renderNoteItem(note: Note, filePath: string, isSaved = false, savedAnnotation?: AnnotationData): void {
        const noteItemEl = this.notesListEl.createDiv({ 
            cls: 'comment-item' 
        });
        
        const displayText = note.linkText.replace(/\[\[(.*?)(?:\|.*?)?\]\]/g, '$1');
        
        const annotationData = savedAnnotation || noteToAnnotationData(note, filePath);
        
        if (isSaved && savedAnnotation?.isValid === false) {
            noteItemEl.addClass('comment-invalid');
        }
        
        if (!isSaved) {
            noteItemEl.addClass('unsaved-note');
        }
        
        noteItemEl.createDiv({
            cls: 'comment-text',
            text: displayText
        });
        
        noteItemEl.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onSelectNote(annotationData, note);
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
