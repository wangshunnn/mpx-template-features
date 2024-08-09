import * as vscode from "vscode";
import { BaseLanguageClient } from "vscode-languageclient";
import { mpxLocationMappingClient } from "../common/mapping";
import { MapLocation, MatrixLocation } from "../common/types";
import { binarySearch } from "../common/utils";

export function register(
  context: vscode.ExtensionContext,
  client: BaseLanguageClient
) {
  vscode.languages.registerHoverProvider(
    "mpx",
    new (class implements vscode.HoverProvider {
      provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
      ): vscode.ProviderResult<vscode.Hover> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const uri = document.fileName;
        if (!document || !uri) return null;

        const { targetRange, keyLoc } =
          findDefinition(uri, document.offsetAt(position)) || {};
        if (!targetRange || !keyLoc) return null;

        // hover key range
        const keyRange = new vscode.Range(
          document.positionAt(keyLoc.start),
          document.positionAt(keyLoc.end)
        );

        const contentsArray: string[] = [];

        for (const r of targetRange) {
          const range = new vscode.Range(
            new vscode.Position(r.start.line - 1, r.start.column - 1),
            new vscode.Position(r.end.line - 1, r.end.column)
          );
          const text = document.getText(range);

          if (!text || !targetRange) continue;
          contentsArray.push(text);
        }

        if (!contentsArray.length) {
          return null;
        }

        // command
        const commandUri = vscode.Uri.parse(
          `command:MpxTemplateFeatures.action.transformStylus2Unocss`
        );

        // format stylus
        const markup = contentsArray
          .map((c) => {
            const stylusCssArray = c
              ?.split("\n")
              .map((i) => i.trim())
              .filter(Boolean);
            const commandArgs = encodeURIComponent(
              JSON.stringify([keyLoc, stylusCssArray])
            );
            const command = `[$(plug) 自动转换为 Unocss](${commandUri}?${commandArgs} 'tansform Stylus class to Unocss')`;
            return [
              "",
              command,
              "```stylus",
              stylusCssArray.join("\n  "),
              "```",
            ].join("\n");
          })
          .join("\n --- \n");

        // title
        const tips =
          contentsArray.length > 1
            ? ` 发现 **${contentsArray.length}** 个同名样式 `
            : " ";
        const title = `**stylus class**${tips}( ⌘ + 单击 ) \n`;

        // 第二个参数是否支持Icons, isTrusted 开启才能支持 command
        // VSCode API 太尼玛细节了。。
        const markdown = new vscode.MarkdownString(title + markup, true);
        markdown.isTrusted = true;

        return new vscode.Hover(markdown, keyRange);
      }
    })()
  );
}

export function findDefinition(
  uri: string,
  position: number
): {
  targetRange: Array<{ start: MatrixLocation; end: MatrixLocation }>;
  keyLoc: MapLocation;
} | null {
  const { stylusTokensSorted, stylusPropsMapping } =
    mpxLocationMappingClient.get(uri) || {};

  if (!stylusPropsMapping || !stylusTokensSorted?.length) {
    return null;
  }

  const findClassDefinition = binarySearch(stylusTokensSorted, position);

  if (findClassDefinition && stylusPropsMapping) {
    const { key, loc } = findClassDefinition;
    const rangeArray = stylusPropsMapping.get(key);
    if (rangeArray) {
      return { keyLoc: loc, targetRange: rangeArray };
    }
  }

  return null;
}
