import {
  ItemView,
  WorkspaceLeaf,
  Component as ObsidianComponent,
} from "obsidian";
import { Comment, NoteLinkInfo } from "../utils/parsers";
import { SplitManager } from "../utils/split-manager";
import { AnnotationService, AnnotationData } from "../utils/annotation-service";
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
    savedAnnotation: AnnotationData | null = null,
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

    this.commentForm = new CommentForm({
      container: this.contentEl,
      app: this.app,
      comment,
      savedAnnotation,
      openTargetArticle,
      splitManager: this.splitManager,
      annotationService: this.annotationService,
    });

    this.component.addChild(this.commentForm);
    this.commentForm.show();
  }

  updateNoteWithLinkInfo(
    noteLinkInfo: NoteLinkInfo,
    savedAnnotation: AnnotationData | null = null,
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

    this.noteForm = new NoteForm({
      container: this.contentEl,
      app: this.app,
      noteLinkInfo,
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
