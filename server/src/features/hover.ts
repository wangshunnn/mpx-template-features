import {
  createConnection,
  TextDocuments,
  HoverParams,
  Hover,
  MarkupKind,
  MarkupContent,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { mpxLocationMappingService } from "../common/mapping";
import { binarySearch } from "../common/utils";
import { MatrixLocation } from "../common/parse";
import type { MapLocation } from '../common/types';

export async function useHover(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>
): Promise<void> {
  if (!connection) return;
  connection.onHover(hoverProvider(documents));
}

function hoverProvider(
  documents: TextDocuments<TextDocument>
): (param: HoverParams) => Promise<Hover | null> {
  return async ({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    const uri = document?.uri.toString();
    if (!document || !uri) return null;

    const { scriptMapping } = await mpxLocationMappingService.get(uri) || {};
    if (!scriptMapping) return null;

    const { targetRange, keyLoc } =
      await findDefinition(uri, document.offsetAt(position)) || {};
    if (!targetRange || !keyLoc) return null;

    const contentsArray = [];
    for (const r of targetRange) {
      const range = {
        start: {
          line: r.start.line - 1,
          character: r.start.column - 1,
        },
        end: {
          line: r.end.line - 1,
          character: r.end.column,
        },
      };
      const text = document.getText(range);
      if (!text || !targetRange) continue;
      contentsArray.push(text);
    }

    if (!contentsArray.length) {
      return null;
    }

    // format
    const markup = contentsArray
      .map((c) => {
        const _c = c
          ?.split("\n")
          .map((i) => i.trim())
          .filter(Boolean)
          .join("\n  ");
        return ["```stylus", _c, "```"].join("\n");
      })
      .join("\n --- \n");
    const tips =
      contentsArray.length > 1
        ? ` 发现 **${contentsArray.length}** 个同名样式 `
        : " ";
    const title = `**stylus class**${tips}(cmd + 单击)\n`;
    const markdown: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: title + markup,
    };

    return {
      contents: markdown,
      range: Range.create(
        document.positionAt(keyLoc.start),
        document.positionAt(keyLoc.end)
      ),
    };
  };
}

export async function findDefinition(
  uri: string,
  position: number
): Promise<{
  targetRange: Array<{ start: MatrixLocation; end: MatrixLocation }>;
  keyLoc: MapLocation;
} | null> {
  const sfcMapping = await mpxLocationMappingService.get(uri);
  const { templateMapping, stylusPropsMapping } = sfcMapping || {};
  if (
    !templateMapping ||
    position < templateMapping.loc?.start ||
    position > templateMapping.loc?.end
  ) {
    return null;
  }
  const findClassDefinition = binarySearch(
    templateMapping.classLocationSort,
    position
  );
  if (findClassDefinition && stylusPropsMapping) {
    const { key, loc } = findClassDefinition;
    const rangeArray = stylusPropsMapping.get(key);
    if (rangeArray) {
      return { keyLoc: loc, targetRange: rangeArray };
    }
  }
  return null;
}
