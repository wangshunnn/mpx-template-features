import * as path from "path";
import { workspace, ExtensionContext, Uri } from "vscode";
import * as splitEditors from "./features/splitEditors";
import * as onRequest from "./features/onRequest";
import * as hover from "./features/hover";
import * as transformStylus2Unocss from "./features/transformStylus2Unocss";

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  const serverModule = Uri.joinPath(context.extensionUri, "server.js").fsPath;

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

  client = new LanguageClient("MpxTemplateFeatures", "Mpx Template Features", serverOptions, clientOptions);

  client.start();

  /** 初始化配置 */
  transformStylus2Unocss.initializeConfig();

  /** SFC split */
  splitEditors.register(context, client);
  /** onRequest */
  onRequest.register(context, client);
  /** hover: client hover 可以实现 command 富文本, server 不行 😮‍💨 */
  hover.register(context, client);
  /** command: transformStylus2Unocss */
  transformStylus2Unocss.register(context, client);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
