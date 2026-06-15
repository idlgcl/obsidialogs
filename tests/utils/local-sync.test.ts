import { buildImportUrl, ImportPayload } from "../../utils/local-sync";
import type { Annotation } from "../../utils/annotation-service";

function decodeFragment(url: string): ImportPayload {
  const fragment = url.split("#")[1];
  const b64 = fragment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const base: Annotation = {
  id: "a1",
  kind: "Comment",
  targetId: "Tx1",
  targetStart: "The",
  targetEnd: "end.",
  targetDisplay: "painful",
  targetText: "The painful end.",
  sourceId: "note.md",
  sourceStart: "Title",
  sourceEnd: "body",
  sourceDisplay: "Title",
  sourceText: "Title body",
};

describe("buildImportUrl", () => {
  it("targets the site's import page with the payload in the fragment only", () => {
    const url = buildImportUrl("https://site.test", "MyVault", ["note.md"], [base]);
    expect(url.startsWith("https://site.test/obsidian-import#")).toBe(true);
    // The fragment never reaches a server — nothing may leak into path or query.
    expect(url.split("#")[0]).toBe("https://site.test/obsidian-import");
  });

  it("round-trips annotations so the import page can rebuild them exactly", () => {
    const url = buildImportUrl("https://site.test", "MyVault", ["note.md"], [base]);
    const payload = decodeFragment(url);
    expect(payload.version).toBe(1);
    expect(payload.vault).toBe("MyVault");
    expect(payload.annotations).toHaveLength(1);
    expect(payload.annotations[0]).toMatchObject({
      kind: "Comment",
      targetId: "Tx1",
      targetTextDisplay: "painful",
      isLocal: true,
      sourceVault: "MyVault",
    });
  });

  it("carries the scope so the import knows which articles to replace", () => {
    const url = buildImportUrl(
      "https://site.test",
      "V",
      ["a.md", "sub/b.md"],
      [base]
    );
    expect(decodeFragment(url).scope).toEqual(["a.md", "sub/b.md"]);
  });

  it("survives non-ASCII annotation text", () => {
    const unicode = { ...base, targetText: "缝合 — ærø ✓" };
    const url = buildImportUrl("https://site.test", "V", ["note.md"], [unicode]);
    expect(decodeFragment(url).annotations[0].targetText).toBe("缝合 — ærø ✓");
  });

  it("encodes an emptied article, which clears it on the site", () => {
    const url = buildImportUrl("https://site.test", "V", ["note.md"], []);
    const payload = decodeFragment(url);
    expect(payload.scope).toEqual(["note.md"]);
    expect(payload.annotations).toEqual([]);
  });
});
