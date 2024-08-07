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
import { MapLocation, MatrixLocation } from "../common/parse";

export async function useHover(
  connection: ReturnType<typeof createConnection>,
  documents: TextDocuments<TextDocument>
): Promise<void> {
  if (!connection) return;
  connection.onHover(hoverProvider(documents));
}

function hoverProvider(
  documents: TextDocuments<TextDocument>
): (param: HoverParams) => Hover | null {
  return ({ textDocument, position }) => {
    const document = documents.get(textDocument.uri);
    const uri = document?.uri.toString();
    if (!document || !uri) return null;
    const { scriptMapping } = mpxLocationMappingService.get(uri) || {};
    if (!scriptMapping) return null;
    const { targetRange, keyLoc } =
      findDefinition(uri, document.offsetAt(position)) || {};
    if (!targetRange) return null;

    const range = {
      start: {
        line: targetRange.start.line - 1,
        character: targetRange.start.column - 1,
      },
      end: {
        line: targetRange.end.line - 1,
        character: targetRange.end.column,
      },
    };
    const text = document.getText(range);
    if (!text || !targetRange || !keyLoc) return null;

    // format
    const contents = text
      ?.split("\n")
      .map((i) => i.trim())
      .filter(Boolean)
      .join("\n  ");
    const markdown: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        "```stylus",
        "stylus className",
        "/* cmd+单击 跳转查看 */",
        contents,
        "```",
      ].join("\n"),
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

export function findDefinition(
  uri: string,
  position: number
): {
  targetRange: { start: MatrixLocation; end: MatrixLocation };
  keyLoc: MapLocation;
} | null {
  const sfcMapping = mpxLocationMappingService.get(uri);
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
    const range = stylusPropsMapping.get(key);
    if (range) {
      return { keyLoc: loc, targetRange: range };
    }
  }
  return null;
}
