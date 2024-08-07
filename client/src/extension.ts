import * as path from "path";
import {
  DecorationRangeBehavior,
  window,
  workspace,
  ExtensionContext,
  Range,
} from "vscode";
import * as splitEditors from "./features/splitEditors";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

export interface Token {
  key: string;
  loc: {
    start: number;
    end: number;
  };
}

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "mpx" }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };

  client = new LanguageClient(
    "MpxTemplateFeatures",
    "Mpx Template Features",
    serverOptions,
    clientOptions
  );

  client.start();

  /** SFC 文件切分视图 */
  splitEditors.register(context, client);

  const UnderlineDecoration = window.createTextEditorDecorationType({
    textDecoration: "none; border-bottom: 1px dotted currentColor",
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  });
  // const borderRadius = "50%";
  // const colorDecoration = window.createTextEditorDecorationType({
  //   before: {
  //     width: "0.9em",
  //     height: "0.9em",
  //     contentText: " ",
  //     border: "1px solid",
  //     margin: `auto 0.2em auto 0;vertical-align: middle;border-radius: ${borderRadius};`,
  //   },
  //   dark: {
  //     before: {
  //       borderColor: "#eeeeee50",
  //     },
  //   },
  //   light: {
  //     before: {
  //       borderColor: "#00000050",
  //     },
  //   },
  // });

  // receive from server
  client.onRequest("mpx/tokens", (params) => {
    const editor = window.visibleTextEditors.find(
      (e) => e.document.uri.toString() === params.uri
    );
    if (editor) {
      const { styleTokens } = params.tokens;
      const classTokensRanges = styleTokens?.map((token: Token) => {
        const { loc } = token || {};
        return new Range(
          editor.document.positionAt(loc?.start),
          editor.document.positionAt(loc?.end)
        );
      });
      if (classTokensRanges) {
        editor.setDecorations(UnderlineDecoration, classTokensRanges);
      }
    }
  });

  // switch Tab file
  window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      const uri = editor.document.uri.toString();
      client.sendRequest("mpx/switchTabFile", uri);
    }
  });
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
