import { ItemView, WorkspaceLeaf } from "obsidian";
import { Comment } from "../utils/parsers";
import { CommentForm } from "./CommentForm";
import { NoteForm } from "./NoteForm";
import { Article } from "../types";
import { ApiService } from "../utils/api";
import { AnnotationService } from "../utils/annotation-service";

export const FORM_VIEW_TYPE = "form-view";

export class FormView extends ItemView {
  private commentForm: CommentForm | null = null;
  private noteForm: NoteForm | null = null;
  private container: HTMLElement | null = null;
  private onArticleSelectedCallback: ((article: Article) => void) | null = null;
  private onFlashTextCallback: ((text: string) => void) | null = null;
  private apiService: ApiService | null = null;
  private annotationService: AnnotationService | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return FORM_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Annotation Form";
  }

  getIcon(): string {
    return "brackets";
  }

  async onOpen(): Promise<void> {
    this.container = this.containerEl.children[1] as HTMLElement;
    this.container.empty();
  }

  async onClose(): Promise<void> {
    this.clear();
  }

  clear(): void {
    if (this.commentForm) {
      this.commentForm.unload();
      this.commentForm = null;
    }
    if (this.noteForm) {
      this.noteForm.unload();
      this.noteForm = null;
    }
    if (this.container) {
      this.container.empty();
    }
  }

  setOnArticleSelected(callback: (article: Article) => void): void {
    this.onArticleSelectedCallback = callback;
  }

  setOnFlashText(callback: (text: string) => void): void {
    this.onFlashTextCallback = callback;
  }

  setServices(
    apiService: ApiService,
    annotationService: AnnotationService
  ): void {
    this.apiService = apiService;
    this.annotationService = annotationService;
  }

  updateComment(comment: Comment): void {
    // Clear all existing forms
    this.clear();

    // Create new form with the detected comment
    if (this.container && this.apiService && this.annotationService) {
      this.commentForm = new CommentForm({
        container: this.container,
        app: this.app,
        apiService: this.apiService,
        annotationService: this.annotationService,
        comment: comment,
        onArticleSelected: this.onArticleSelectedCallback || undefined,
        onFlashText: this.onFlashTextCallback || undefined,
      });
      this.commentForm.load();
    }
  }

  updateNote(
    targetArticle: Article,
    sourceFilePath: string,
    hideSourceFields: boolean,
    sourceLineText: string,
    lineIndex: number,
    sameLinkCount: number
  ): void {
    // Clear all existing forms
    this.clear();

    // Create new note form with the target article
    if (this.container && this.apiService && this.annotationService) {
      this.noteForm = new NoteForm({
        container: this.container,
        app: this.app,
        apiService: this.apiService,
        annotationService: this.annotationService,
        targetArticle: targetArticle,
        sourceFilePath: sourceFilePath,
        hideSourceFields: hideSourceFields,
        sourceLineText: sourceLineText,
        lineIndex: lineIndex,
        sameLinkCount: sameLinkCount,
        onArticleSelected: this.onArticleSelectedCallback || undefined,
        onFlashText: this.onFlashTextCallback || undefined,
      });
      this.noteForm.load();
    }
  }
}
