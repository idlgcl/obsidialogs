import { Component } from "obsidian";
import { TabsComponent, TabItem } from "./tabs-component";
import { CommentsTab } from "./comments-tab";
import { NotesTab } from "./notes-tab";

export interface RightPanelListViewOptions {
    container: HTMLElement;
    onSelectItem: () => void;
    onNewComment: () => void;
    onNewNote: () => void;
}

export class RightPanelListView extends Component {
    private container: HTMLElement;
    private contentEl: HTMLElement;
    private onSelectItem: () => void;
    private onNewComment: () => void;
    private onNewNote: () => void;
    private tabsComponent: TabsComponent;
    private commentsTab: CommentsTab;
    private notesTab: NotesTab;
    private tabContentEl: HTMLElement;
    
    constructor(options: RightPanelListViewOptions) {
        super();
        this.container = options.container;
        this.onSelectItem = options.onSelectItem;
        this.onNewComment = options.onNewComment;
        this.onNewNote = options.onNewNote;
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
            onSelectComment: () => this.onSelectItem(),
            onNewComment: () => this.onNewComment()
        });
        
        this.notesTab = new NotesTab({
            container: this.tabContentEl,
            onSelectNote: () => this.onSelectItem(),
            onNewNote: () => this.onNewNote()
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
