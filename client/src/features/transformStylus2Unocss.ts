import * as vscode from "vscode";
import { BaseLanguageClient } from "vscode-languageclient";
import { toUnocssClass } from "transform-to-unocss-core";
import { MapLocation } from "../common/types";

export function register(
  context: vscode.ExtensionContext,
  client: BaseLanguageClient
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "MpxTemplateFeatures.action.transformStylus2Unocss",
      transformStylus2Unocss
    )
  );
}

// 全局缓存，防止多次替换异常
let _stylusClassLoc: MapLocation;

function transformStylus2Unocss(
  stylusClassLoc?: MapLocation,
  stylusCssArray?: string[]
) {
  if (!stylusClassLoc?.start || !stylusClassLoc?.end || !stylusCssArray) return;

  // init
  _stylusClassLoc = stylusClassLoc;

  const unocssStyle = [];

  for (let stylus of stylusCssArray) {
    stylus = stylus.trim();

    if (
      !stylus ||
      stylus.startsWith("/*") || // 注释
      stylus.startsWith("//") || // 注释
      stylus.startsWith(".") // 多类名公用一套样式时, stylus可能是类名
    ) {
      continue;
    }

    stylus = stylus.split("//")?.[0];
    stylus = stylus.split("/*")?.[0];

    const idx = stylus.indexOf(" ");

    if (idx !== -1 && !stylus.includes(":")) {
      stylus = stylus.substring(0, idx) + ":" + stylus.substring(idx);
    }

    let unocss: string, errArr: string[];

    try {
      [unocss, errArr] = toUnocssClass(stylus);
    } catch (error) {
      console.error("[transformStylus2Unocss]", error);
    }

    if (errArr?.length) {
      console.warn("[Mpx Template Features] 转换 unocss 失败 case: ", errArr);
    }

    if (unocss) {
      unocssStyle.push(unocss);
    }
  }

  if (!unocssStyle.length) return;

  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const uri = document?.fileName;
  if (!uri) return;

  const unocssStyleString = unocssStyle.join(" ");

  editor
    .edit((editBuilder) => {
      editBuilder.replace(
        new vscode.Range(
          document.positionAt(_stylusClassLoc.start),
          document.positionAt(_stylusClassLoc.end)
        ),
        unocssStyleString
      );
    })
    .then((res) => {
      if (res) {
        // update range
        // 替换成功后原范围就不再适用，需要及时更新成替换后的文本范围
        // 既可以防止一直点击转换导致重复替换原范围
        // 也可以让单个hover中多stylus样式支持点击不同样式的替换
        // ? 还是不行，每次执行命令的位置参数是固定，不知道之前有没有替换过
        _stylusClassLoc.end = _stylusClassLoc.start + unocssStyleString.length;
      }
    });
}
