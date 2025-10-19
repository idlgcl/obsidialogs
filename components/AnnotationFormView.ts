import {
  ItemView,
  WorkspaceLeaf,
  Component as ObsidianComponent,
} from "obsidian";
import { Comment, NoteMeta } from "../utils/parsers";
import { ArticleSplitViewHandler } from "../utils/article-split-handler";
import { AnnotationService, AnnotationData } from "../utils/annotation-service";
import { CommentFormComponent } from "./CommentFormComponent";
import { NoteForm } from "./NoteForm";

export const ANNOTATION_FORM_VIEW = "annotation-form-view";

export class AnnotationFormView extends ItemView {
  private commentForm: CommentFormComponent | null = null;
  private noteForm: NoteForm | null = null;
  private component: ObsidianComponent;
  private articleSplitHandler: ArticleSplitViewHandler | null = null;
  private annotationService: AnnotationService | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.component = new ObsidianComponent();
  }

  setAnnotationService(service: AnnotationService): void {
    this.annotationService = service;
  }

  setArticleSplitHandler(handler: ArticleSplitViewHandler): void {
    this.articleSplitHandler = handler;
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

  async onOpen() {
    // Don't render placeholder on open, wait for updateComment/updateNote
  }

  async onClose() {
    this.component.unload();
  }

  updateComment(
    comment: Comment,
    savedAnnotation: AnnotationData | null = null,
    openTargetArticle = false
  ): void {
    // Clear container
    this.contentEl.empty();

    // Hide/destroy note form if exists
    if (this.noteForm) {
      this.component.removeChild(this.noteForm);
      this.noteForm.onunload();
      this.noteForm = null;
    }

    // Hide/destroy old comment form if exists
    if (this.commentForm) {
      this.component.removeChild(this.commentForm);
      this.commentForm.onunload();
      this.commentForm = null;
    }

    // Create new comment form
    this.commentForm = new CommentFormComponent({
      container: this.contentEl,
      app: this.app,
      comment,
      savedAnnotation,
      openTargetArticle,
      articleSplitHandler: this.articleSplitHandler,
      annotationService: this.annotationService,
    });

    this.component.addChild(this.commentForm);
    this.commentForm.show();
  }

  updateNote(
    note: NoteMeta,
    savedAnnotation: AnnotationData | null = null,
    openTargetArticle = false
  ): void {
    // Clear container
    this.contentEl.empty();

    // Hide/destroy comment form if exists
    if (this.commentForm) {
      this.component.removeChild(this.commentForm);
      this.commentForm.onunload();
      this.commentForm = null;
    }

    // Hide/destroy old note form if exists
    if (this.noteForm) {
      this.component.removeChild(this.noteForm);
      this.noteForm.onunload();
      this.noteForm = null;
    }

    // Create new note form
    this.noteForm = new NoteForm({
      container: this.contentEl,
      app: this.app,
      note,
      savedAnnotation,
      openTargetArticle,
      articleSplitHandler: this.articleSplitHandler,
      annotationService: this.annotationService,
    });

    this.component.addChild(this.noteForm);
    this.noteForm.show();
  }
}
