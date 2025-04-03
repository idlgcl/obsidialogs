import { Component, App } from "obsidian";
import { TabsComponent, TabItem } from "./tabs-component";
import { CommentsTab } from "./comments-tab";
import { NotesTab } from "./notes-tab";
import { AnnotationData, AnnotationService } from "utils/annotation-service";

export interface RightPanelListViewOptions {
    container: HTMLElement;
    onSelectItem: () => void;
    onSelectComment: (comment: AnnotationData) => void;
    onSelectNote: (note: AnnotationData) => void;
    onNewComment: () => void;
    onNewNote: () => void;
    app: App; 
}


export class RightPanelListView extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectItem: () => void;
    private onSelectComment: (comment: AnnotationData) => void;
    private onSelectNote: (note: AnnotationData) => void;
    private onNewComment: () => void;
    private onNewNote: () => void;
    private tabsComponent: TabsComponent;
    private commentsTab: CommentsTab;
    private notesTab: NotesTab;
    private tabContentEl: HTMLElement;
    private app: App;
    
    constructor(options: RightPanelListViewOptions) {
        super();
        this.container = options.container;
        this.onSelectItem = options.onSelectItem;
        this.onSelectComment = options.onSelectComment; 
        this.onSelectNote = options.onSelectNote;
        this.onNewComment = options.onNewComment;
        this.onNewNote = options.onNewNote;
        this.app = options.app;
        this.createView();
    }
    
    private createView(): void {
        this.contentEl = this.container.createDiv({ cls: 'side-panel-list-view' });
        
        this.contentEl.createEl('h3', { text: 'Idealogs' });
        
        const tabs: TabItem[] = [
            { id: 'comments', label: 'Comments' },
            { id: 'notes', label: 'Notes' }
        ];
        
        this.tabsComponent = new TabsComponent({
            container: this.contentEl,
            tabs: tabs,
            activeTabId: 'comments',
            onTabChange: (tabId) => this.handleTabChange(tabId)
        });
        
        this.addChild(this.tabsComponent);
        
        this.tabContentEl = this.contentEl.createDiv({ cls: 'idl-tab-contents' });
        
        this.commentsTab = new CommentsTab({
            container: this.tabContentEl,
            onSelectComment: (comment) => this.onSelectComment(comment), 
            onNewComment: () => this.onNewComment()
        });
        
        this.notesTab = new NotesTab({
            container: this.tabContentEl,
            onSelectNote: (note) => this.onSelectNote(note),
            onNewNote: () => this.onNewNote(),
            app: this.app 
        });
        
        this.addChild(this.commentsTab);
        this.addChild(this.notesTab);
        
        this.handleTabChange('comments');
    }
    
    private handleTabChange(tabId: string): void {
        if (tabId === 'comments') {
            this.commentsTab.show();
            this.notesTab.hide();
        } else if (tabId === 'notes') {
            this.commentsTab.hide();
            this.notesTab.show();
        }
    }

    public updateComments(annotationService: AnnotationService, filePath: string): void {
        if (this.commentsTab) {
            this.commentsTab.updateComments(annotationService, filePath);
        }
    }
    
    public updateNotes(annotationService: AnnotationService, filePath: string): void {
        if (this.notesTab) {
            this.notesTab.updateNotes(annotationService, filePath);
        }
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
