import { App } from "obsidian";
import { WRITING_LINK_PREFIX, COMMON_LINK_PREFIXES } from "../constants";

export class WritingLinkHandler {
  handleLink(linkText: string, sourcePath: string): void {
    const id = linkText.substring(WRITING_LINK_PREFIX.length);

    console.log("Writing link clicked:", {
      fullLink: linkText,
      prefix: WRITING_LINK_PREFIX,
      id: id,
      sourcePath: sourcePath,
    });
  }
}

export class CommonLinkHandler {
  handleLink(linkText: string, sourcePath: string): void {
    const prefix = linkText.substring(0, 3); // @Fx or @Ix
    const id = linkText.substring(3);

    console.log("Common link clicked:", {
      fullLink: linkText,
      prefix: prefix,
      id: id,
      sourcePath: sourcePath,
    });
  }
}

export function patchLinkOpening(
  app: App,
  writingLinkHandler: WritingLinkHandler,
  commonLinkHandler: CommonLinkHandler // Questions & Insights
): () => void {
  const workspace = app.workspace;
  const originalOpenLinkText = workspace.openLinkText;

  // @ts-ignore
  workspace.openLinkText = function (
    linktext: string,
    sourcePath: string,
    newLeaf?: boolean,
    openViewState?: unknown
  ) {
    if (linktext.startsWith(WRITING_LINK_PREFIX)) {
      writingLinkHandler.handleLink(linktext, sourcePath);
      return;
    }

    for (const prefix of COMMON_LINK_PREFIXES) {
      if (linktext.startsWith(prefix)) {
        commonLinkHandler.handleLink(linktext, sourcePath);
        return;
      }
    }

    // Fall back to default link handling
    return originalOpenLinkText.call(
      workspace,
      linktext,
      sourcePath,
      newLeaf,
      openViewState
    );
  };

  // Return cleanup function to restore default behavior
  return () => {
    workspace.openLinkText = originalOpenLinkText;
  };
}
