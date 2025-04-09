import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { debounce } from "ts-debounce";
import { BaseLanguageClient } from "vscode-languageclient";
import { toUnocssClass } from "transform-to-unocss-core";
import { MapLocation } from "../common/types";

interface ITransformOptions {
  enforce?: "pre" | "post";
  include?: string | RegExp;
  exclude?: string | RegExp;
}

let userRules: [
  string | RegExp,
  (value: string, unocss?: string) => string | boolean,
  ITransformOptions?
][] = [];

const clearUserRules = () => {
  userRules.length = 0;
};

/**
 * @internal
 */
async function loadUserRules(configPath: string) {
  console.log("[shun] --->", configPath);
  try {
    if (fs.existsSync(configPath)) {
      // 动态执行代码来导入模块，避免 require/import 缓存问题
      const configContent = fs.readFileSync(configPath, "utf-8");
      const configModule = eval(configContent);

      const { rules = [] } = configModule || {};
      if (Array.isArray(rules)) {
        userRules = rules;
        console.log(
          "[Mpx Template Features] loadUserRules success: ",
          userRules
        );
      }
    } else {
      clearUserRules();
    }
  } catch (error) {
    clearUserRules();
    console.error(
      "[transformStylus2Unocss] `css2uno.config.js` 可能存在 js error:",
      error
    );
  }
}

export function initializeConfig() {
  const config = vscode.workspace.getConfiguration("MpxTemplateFeatures");
  const configPath =
    config.get<string>("css2uno.configPath") ||
    path.join(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
      "css2uno.config.js"
    );
  loadUserRules(configPath);

  const watcher = vscode.workspace.createFileSystemWatcher(configPath);
  watcher.onDidChange(
    debounce((_e: vscode.Uri) => {
      loadUserRules(configPath);
    }, 200)
  );
  watcher.onDidCreate(() => loadUserRules(configPath));
  watcher.onDidDelete(() => clearUserRules());
}

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

    stylus = stylus.split("//")[0].split("/*")[0];

    const idxSpace = stylus.indexOf(" ");
    const idxColon = stylus.indexOf(":");
    let stylusProperty = "";
    let stylusValue = "";

    if (idxColon !== -1) {
      stylusProperty = stylus.substring(0, idxColon).trim();
      stylusValue = stylus.substring(idxColon + 1).trim();
    } else if (idxSpace !== -1) {
      stylusProperty = stylus.substring(0, idxSpace).trim();
      stylusValue = stylus.substring(idxSpace + 1).trim();
      stylus = `${stylusProperty}:${stylusValue}`;
    } else {
      console.warn("[Mpx Template Features] stylus 格式错误: ", stylus);
      continue;
    }

    let unocss = '';
    let errArr: string[] = [];

    try {
      let value = stylusValue;
      let canTransform = true;

      for (const [rule, transformFn, options = {}] of userRules) {
        if (
          (typeof rule === "string" && rule === stylusProperty) ||
          (rule instanceof RegExp && rule.test(stylusProperty))
        ) {
          canTransform = false;

          const { enforce = "pre" } = options || {};

          if (enforce === "post") {
            [value = "", errArr] = toUnocssClass(stylus);
          }

          if (typeof transformFn === "function") {
            const res = transformFn(value);

            if (res === true && enforce === "pre") {
              [unocss, errArr] = toUnocssClass(stylus);
            } else if (typeof res === "string") {
              unocss = res;
            }
          } else {
            console.warn(
              "[Mpx Template Features] css2uno.config.js 中配置的 transformFn 必须是函数，否则会报错"
            );
          }

          break;
        }
      }

      if (canTransform) {
        [unocss, errArr] = toUnocssClass(stylus);
      }
    } catch (error) {
      console.error(
        "[Mpx Template Features] transformStylus2Unocss error: ",
        error
      );
    }

    if (errArr?.length) {
      console.warn(
        "[Mpx Template Features] toUnocssClass 转换失败 case: ",
        errArr
      );
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
        _stylusClassLoc.end = _stylusClassLoc.start + unocssStyleString.length;
      }
    });
}
