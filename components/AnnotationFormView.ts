import {
  ItemView,
  WorkspaceLeaf,
  Component as ObsidianComponent,
  MarkdownView,
} from "obsidian";
import { Comment, NoteLinkInfo } from "../utils/parsers";
import { SplitManager } from "../utils/split-manager";
import {
  Annotation,
  AnnotationService,
  WebAnnotation,
} from "../utils/annotation-service";
import { AnnotationHighlighter } from "../utils/annotation-highlighter";
import { CommentForm } from "./CommentForm";
import { NoteForm } from "./NoteForm";

export const ANNOTATION_FORM_VIEW = "annotation-form-view";

export class AnnotationFormView extends ItemView {
  private commentForm: CommentForm | null = null;
  private noteForm: NoteForm | null = null;
  private component: ObsidianComponent;
  private splitManager: SplitManager | null = null;
  private annotationService: AnnotationService | null = null;
  private annotationHighlighter: AnnotationHighlighter | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.component = new ObsidianComponent();
  }

  setAnnotationService(service: AnnotationService): void {
    this.annotationService = service;
  }

  setAnnotationHighlighter(highlighter: AnnotationHighlighter): void {
    this.annotationHighlighter = highlighter;
  }

  setSplitManager(manager: SplitManager): void {
    this.splitManager = manager;
  }

  updateTargetView(view: MarkdownView): void {
    if (this.commentForm) {
      this.commentForm.setTargetView(view);
    }
    if (this.noteForm) {
      this.noteForm.setTargetView(view);
    }
  }

  getViewType() {
    return ANNOTATION_FORM_VIEW;
  }

  getDisplayText(): string {
    return "Annotation Form";
  }

  getIcon(): string {
    return "brackets";
  }

  async onOpen() {}

  async onClose() {
    this.component.unload();
  }

  clear(): void {
    this.contentEl.empty();

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

  updateComment(
    comment: Comment,
    savedAnnotation: Annotation | null = null,
    openTargetArticle = false
  ): void {
    this.contentEl.empty();

    if (this.noteForm) {
      this.component.removeChild(this.noteForm);
      this.noteForm.onunload();
      this.noteForm = null;
    }

    if (this.commentForm) {
      this.component.removeChild(this.commentForm);
      this.commentForm.onunload();
      this.commentForm = null;
    }

    // Get the source view (active markdown view)
    const sourceView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!sourceView) {
      console.error("No active markdown view found");
      return;
    }

    // Get the target view from split manager if available
    const targetLeaf = this.splitManager?.getSplitLeaf();
    const targetView = targetLeaf?.view instanceof MarkdownView ? targetLeaf.view : null;

    this.commentForm = new CommentForm({
      container: this.contentEl,
      app: this.app,
      comment,
      sourceView,
      targetView,
      savedAnnotation,
      openTargetArticle,
      splitManager: this.splitManager,
      annotationService: this.annotationService,
      annotationHighlighter: this.annotationHighlighter,
    });

    this.component.addChild(this.commentForm);
    this.commentForm.show();
  }

  updateNoteWithLinkInfo(
    noteLinkInfo: NoteLinkInfo,
    savedAnnotation: WebAnnotation | null = null,
    hideSourceFields = false
  ): void {
    this.contentEl.empty();

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

    // Get the source view (active markdown view)
    const sourceView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!sourceView) {
      console.error("No active markdown view found");
      return;
    }

    // Get the target view from split manager if available
    const targetLeaf = this.splitManager?.getSplitLeaf();
    const targetView = targetLeaf?.view instanceof MarkdownView ? targetLeaf.view : null;

    this.noteForm = new NoteForm({
      container: this.contentEl,
      app: this.app,
      noteLinkInfo,
      sourceView,
      targetView,
      savedAnnotation,
      hideSourceFields,
      openTargetArticle: true,
      splitManager: this.splitManager,
      annotationService: this.annotationService,
      annotationHighlighter: this.annotationHighlighter,
    });

    this.component.addChild(this.noteForm);
    this.noteForm.show();
  }
}
