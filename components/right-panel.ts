import { ItemView, WorkspaceLeaf, Component } from "obsidian";
import { RightPanelListView } from "./right-panel-list-view";
import { RightPanelFormView } from "./right-panel-form-view";
import { CommentForm } from "./comment-form"; 

export const IDL_RIGHT_PANEL = 'idl-right-panel';

export class RightPanel extends ItemView {
    private listView: RightPanelListView;
    private formView: RightPanelFormView;
    private commentForm: CommentForm | null = null; 
    private component: Component;
    private activeFilePath: string;
    
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.component = new Component();
    }

    async onOpen() {
        this.listView = new RightPanelListView({
            container: this.contentEl,
            onSelectItem: () => this.showFormView(),
            onNewComment: () => this.showNewCommentForm() 
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
                this.setActiveFilePath();
                if (this.commentForm && this.activeFilePath) {
                    this.commentForm.updateActiveFilePath(this.activeFilePath);
                }
            })
        );
        
        this.setActiveFilePath();
    }
    
    showListView() {
        this.listView.show();
        this.formView.hide();
        
        if (this.commentForm) {
            this.component.removeChild(this.commentForm);
            this.commentForm.onunload(); 
            this.commentForm = null;
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
        
        this.commentForm = new CommentForm({
            container: this.contentEl,
            onBack: () => this.showListView(),
            activeFilePath: this.activeFilePath,
            app: this.app
        });
        
        this.component.addChild(this.commentForm);
        this.commentForm.show();
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
        }
    }

    async onClose() {
        this.component.unload();
        return super.onClose();
    }
}
