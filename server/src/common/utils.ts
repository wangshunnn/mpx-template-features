import { URI } from "vscode-uri";
export { debounce } from "ts-debounce";

// eg: file:///Users/didi/mycode/test/hello.mpx -> /Users/didi/mycode/test/hello.mpx
export const uriToFileName = (uri: string) =>
  URI.parse(uri).fsPath.replace(/\\/g, "/");
