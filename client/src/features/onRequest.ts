import * as vscode from "vscode";
import { BaseLanguageClient } from "vscode-languageclient";
import { mpxLocationMappingClient } from "../common/mapping";
import { MpxLocationMappingClientTokens } from "../common/types";

export function register(
  context: vscode.ExtensionContext,
  client: BaseLanguageClient
) {
  const UnderlineDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: "none; border-bottom: 1px dotted currentColor",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  /** receive from server */
  client.onRequest(
    "mpx/tokens",
    (params: { tokens?: any; uri?: string } = {}) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === params.uri
      );
      if (editor) {
        // update
        mpxLocationMappingClient.update(params?.tokens, params?.uri);

        // decorations
        const { stylusTokensSorted } =
          (params?.tokens as MpxLocationMappingClientTokens) || {};
        const classTokensRanges = stylusTokensSorted?.map((token) => {
          const { loc } = token || {};
          return new vscode.Range(
            editor.document.positionAt(loc?.start),
            editor.document.positionAt(loc?.end)
          );
        });
        if (classTokensRanges) {
          editor.setDecorations(UnderlineDecoration, classTokensRanges);
        }
      }
    }
  );

  /** switch Tab file */
  vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      const uri = editor.document.uri.toString();
      client.sendRequest("mpx/switchTabFile", uri);
    }
  });
}
