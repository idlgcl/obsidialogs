import {
  EditorView,
  ViewPlugin,
  PluginValue,
  ViewUpdate,
} from "@codemirror/view";
import { CommentParser } from "./parsers";

class CommentTitleClickHandler implements PluginValue {
  private commentParser: CommentParser;

  constructor(private view: EditorView) {
    this.commentParser = new CommentParser();
  }

  handleMouseDown = (event: MouseEvent, view: EditorView): boolean => {
    if (!event.ctrlKey && !event.metaKey) {
      return false;
    }

    try {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });

      if (pos === null) {
        return false;
      }

      const line = view.state.doc.lineAt(pos);
      const lineText = line.text;

      const comment = this.commentParser.parseLineAsComment(
        lineText,
        "current-file",
        "current-file-path"
      );

      if (comment) {
        const charOffset = pos - line.from;
        const titleEndPos = lineText.indexOf(".");

        if (titleEndPos !== -1 && charOffset <= titleEndPos) {
          return true;
        }
      }
    } catch (error) {
      console.error("[Idealogs] Error handling click:", error);
    }

    return false;
  };

  update(update: ViewUpdate) {}

  destroy() {}
}

export const commentClickPlugin = ViewPlugin.fromClass(
  CommentTitleClickHandler,
  {
    eventHandlers: {
      mousedown: (event, view) => {
        const handler = new CommentTitleClickHandler(view);
        return handler.handleMouseDown(event, view);
      },
    },
  }
);
