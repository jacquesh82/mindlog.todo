// Minimal typings for the `mjml` compiler (the package ships no stable types).
declare module 'mjml' {
  interface MjmlOptions {
    validationLevel?: 'strict' | 'soft' | 'skip';
    minify?: boolean;
    keepComments?: boolean;
  }
  interface MjmlError {
    line: number;
    message: string;
    tagName: string;
    formattedMessage: string;
  }
  interface MjmlResult {
    html: string;
    errors: MjmlError[];
  }
  export default function mjml2html(mjml: string, options?: MjmlOptions): MjmlResult;
}
