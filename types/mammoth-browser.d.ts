// mammoth publishes types for its Node entry point but not for the browser bundle,
// which is the one a preview must use — the Node build reaches for `fs`. Only the call
// this app makes is declared; widening it later is a deliberate act rather than an
// inherited `any`.
declare module "mammoth/mammoth.browser" {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value: string;
    messages: { type: string; message: string }[];
  }>;
}
