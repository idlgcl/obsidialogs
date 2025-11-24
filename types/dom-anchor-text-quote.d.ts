declare module "dom-anchor-text-quote" {
  export interface TextQuoteSelector {
    type?: "TextQuoteSelector";
    exact: string;
    prefix?: string;
    suffix?: string;
  }

  export function toRange(
    root: Node,
    selector: TextQuoteSelector
  ): Range;

  export function fromRange(
    root: Node,
    range: Range
  ): TextQuoteSelector;
}
