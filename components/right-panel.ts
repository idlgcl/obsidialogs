import { ItemView, WorkspaceLeaf, Component, MarkdownView } from "obsidian";
import { RightPanelListView } from "./right-panel-list-view";
import { RightPanelFormView } from "./right-panel-form-view";
import { CommentForm } from "./comment-form";
import { NoteForm } from "./note-form";
import { AnnotationService } from '../utils/annotation-service';

export const IDL_RIGHT_PANEL = 'idl-right-panel';

export class RightPanel extends ItemView {
    private listView: RightPanelListView;
    private formView: RightPanelFormView;
    private commentForm: CommentForm | null = null;
    private noteForm: NoteForm | null = null;
    private component: Component;
    private activeFilePath: string;
    private annotationService: AnnotationService;

    constructor(leaf: WorkspaceLeaf, annotationService: AnnotationService) {
        super(leaf);
        this.component = new Component();
        this.annotationService = annotationService;
    }

    async onOpen() {
        this.listView = new RightPanelListView({
            container: this.contentEl,
            onSelectItem: () => this.showFormView(),
            onNewComment: () => this.showNewCommentForm(),
            onNewNote: () => this.showNewNoteForm()
        });

        this.formView = new RightPanelFormView({
            container: this.contentEl,
            onBack: () => this.showListView()
        });
        
        this.component.addChild(this.listView);
        this.component.addChild(this.formView);
        
        this.showListView();

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const previousPath = this.activeFilePath;
                this.setActiveFilePath();

                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (this.commentForm && 
                    activeView && 
                    this.activeFilePath !== previousPath) {
                    
                    this.commentForm.updateActiveFilePath(this.activeFilePath);
                }
                
                if (this.noteForm && 
                    activeView && 
                    this.activeFilePath !== previousPath) {
                    
                    this.noteForm.updateActiveFilePath(this.activeFilePath);
                }
            })
        );
    }
    
    showListView() {
        this.listView.show();
        this.formView.hide();

        this.updateCommentsList();

        if (this.commentForm) {
            this.component.removeChild(this.commentForm);
            this.commentForm.onunload();
            this.commentForm = null;
        }
        
        if (this.noteForm) {
            this.component.removeChild(this.noteForm);
            this.noteForm.onunload();
            this.noteForm = null;
        }
    }

    showFormView() {
        this.listView.hide();
        this.formView.show();
    }

    showNewCommentForm() {
        this.listView.hide();
        this.formView.hide();
        
        if (this.commentForm) {
            this.component.removeChild(this.commentForm);
            this.commentForm.onunload();
            this.commentForm = null;
        }
        
        if (this.noteForm) {
            this.component.removeChild(this.noteForm);
            this.noteForm.onunload();
            this.noteForm = null;
        }
        
        this.commentForm = new CommentForm({
            container: this.contentEl,
            onBack: () => this.showListView(),
            activeFilePath: this.activeFilePath,
            app: this.app
        });
        
        this.component.addChild(this.commentForm);
        this.commentForm.show();
    }
    
    showNewNoteForm() {
        this.listView.hide();
        this.formView.hide();
        
        if (this.commentForm) {
            this.component.removeChild(this.commentForm);
            this.commentForm.onunload();
            this.commentForm = null;
        }
        
        if (this.noteForm) {
            this.component.removeChild(this.noteForm);
            this.noteForm.onunload();
            this.noteForm = null;
        }
        
        this.noteForm = new NoteForm({
            container: this.contentEl,
            onBack: () => this.showListView(),
            activeFilePath: this.activeFilePath,
            app: this.app
        });
        
        this.component.addChild(this.noteForm);
        this.noteForm.show();
    }

    private updateCommentsList(): void {
        if (this.listView && this.activeFilePath && this.annotationService) {
            this.listView.updateComments(this.annotationService, this.activeFilePath);
        }
    }

    getViewType(): string {
        return IDL_RIGHT_PANEL;
    }

    getDisplayText(): string {
        return 'Idealogs';
    }

    getIcon(): string {
        return "brackets";
    }

    private setActiveFilePath(): void {
        const file = this.app.workspace.getActiveFile();
        this.activeFilePath = file?.path || '';

        if (this.activeFilePath === '') {
            this.leaf.detach();
        } else {
            this.updateCommentsList()
        }
    }

    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
