declare module 'mammoth' {
  interface Message {
    type: string;
    message: string;
  }

  interface ConversionResult {
    value: string;
    messages: Message[];
  }

  interface Input {
    arrayBuffer?: ArrayBuffer;
    buffer?: Buffer;
    path?: string;
  }

  function convertToHtml(input: Input, options?: object): Promise<ConversionResult>;
  function convertToMarkdown(input: Input, options?: object): Promise<ConversionResult>;
  function extractRawText(input: Input, options?: object): Promise<ConversionResult>;
}
