import * as vscode from "vscode";
import { BaseLanguageClient } from "vscode-languageclient";

export function register(
  context: vscode.ExtensionContext,
  client: BaseLanguageClient
) {
  const getDocDescriptor = useDocDescriptor();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "MpxTemplateFeatures.action.splitEditors",
      onSplit
    )
  );

  async function onSplit() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const doc = editor.document;
    const uri = doc.fileName;
    const descriptor = await getDocDescriptor(uri);
    if (!descriptor) return;

    // TODO: 用户自定义配置，暂时默认写死
    // const layout = config.splitEditors.layout;
    const layout = {
      left: ["script", "scriptSetup", "styles"],
      right: ["template", "customBlocks"],
    };
    let leftBlocks: any[] = [];
    let rightBlocks: any[] = [];

    if (descriptor.script) {
      if (layout.left.includes("script")) {
        leftBlocks.push(descriptor.script);
      }
      if (layout.right.includes("script")) {
        rightBlocks.push(descriptor.script);
      }
    }
    if (descriptor.scriptSetup) {
      if (layout.left.includes("scriptSetup")) {
        leftBlocks.push(descriptor.scriptSetup);
      }
      if (layout.right.includes("scriptSetup")) {
        rightBlocks.push(descriptor.scriptSetup);
      }
    }
    if (descriptor.template) {
      if (layout.left.includes("template")) {
        leftBlocks.push(descriptor.template);
      }
      if (layout.right.includes("template")) {
        rightBlocks.push(descriptor.template);
      }
    }
    if (layout.left.includes("styles")) {
      leftBlocks = leftBlocks.concat(descriptor.styles);
    }
    if (layout.right.includes("styles")) {
      rightBlocks = rightBlocks.concat(descriptor.styles);
    }
    if (layout.left.includes("customBlocks")) {
      leftBlocks = leftBlocks.concat(descriptor.customBlocks);
    }
    if (layout.right.includes("customBlocks")) {
      rightBlocks = rightBlocks.concat(descriptor.customBlocks);
    }

    await vscode.commands.executeCommand("workbench.action.joinEditorInGroup");

    if (vscode.window.activeTextEditor === editor) {
      await foldingBlocks(leftBlocks);
      await vscode.commands.executeCommand(
        "workbench.action.toggleSplitEditorInGroup"
      );
      await foldingBlocks(rightBlocks);
    } else {
      await vscode.commands.executeCommand("editor.unfoldAll");
    }

    async function foldingBlocks(blocks: any[]) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      editor.selections = blocks.length
        ? blocks.map(
            (block) =>
              new vscode.Selection(
                doc.positionAt(block.loc.start.offset),
                doc.positionAt(block.loc.start.offset)
              )
          )
        : [
            new vscode.Selection(
              doc.positionAt(doc.getText().length),
              doc.positionAt(doc.getText().length)
            ),
          ];

      await vscode.commands.executeCommand("editor.unfoldAll");
      await vscode.commands.executeCommand("editor.foldLevel1");

      const firstBlock = blocks.sort(
        (a, b) => a.loc.start.offset - b.loc.start.offset
      )[0];
      if (firstBlock) {
        editor.revealRange(
          new vscode.Range(
            doc.positionAt(firstBlock.loc.start.offset),
            new vscode.Position(editor.document.lineCount, 0)
          ),
          vscode.TextEditorRevealType.AtTop
        );
      }
    }
  }

  function useDocDescriptor() {
    let splitDocUri: string | undefined;
    let splitDocDescriptor: any;

    return getDescriptor;

    async function getDescriptor(uri: string) {
      if (uri !== splitDocUri) {
        splitDocUri = uri;
        splitDocDescriptor = await client.sendRequest("mpx/parseSfc", uri);
      }
      return splitDocDescriptor;
    }
  }
}
