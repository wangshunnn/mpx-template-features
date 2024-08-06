import type {
  CallExpression,
  ExpressionStatement,
  ObjectExpression,
} from "@babel/types";
import { parse } from "@babel/parser";
// @ts-expect-error ignore
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import {
  CompilerError,
  compileScript,
  parse as compileSFC,
  compileTemplate,
  type SFCDescriptor,
} from "@vue/compiler-sfc";
import type { RootNode, TemplateChildNode } from "@vue/compiler-core";
import * as fs from "fs";
import * as path from "path";
import * as stylus from "stylus";
import { TextDocument } from "vscode-languageserver-textdocument";
import { uriToFileName } from "./utils";

export type MapLocation = { start: number; end: number };
export type MatrixLocation = { line: number; column: number };
export type MappingValue = { key: string; loc: MapLocation };
export type JsonMappingValue = {
  configPath: string;
  absolutePath?: string;
  relativePath?: string;
};
export type TemplateMappingItem = Map<string, MappingValue>;
export type ScriptMappingItem = Map<string, MapLocation>;
export type TemplateMapping = {
  tagMapping: TemplateMappingItem;
  classMapping: TemplateMappingItem;
  variableMapping: TemplateMappingItem;
  tagLocationSort: MappingValue[];
  classLocationSort: MappingValue[];
  variableLocationSort: MappingValue[];
  loc: MapLocation;
} | null;
export type ScriptMapping = {
  dataMapping: ScriptMappingItem;
  computedMapping: ScriptMappingItem;
  methodsMapping: ScriptMappingItem;
} | null;
export type StylusMapping = Map<string, MatrixLocation[]>;
export type StylusPropsMapping = Map<
  string,
  { start: MatrixLocation; end: MatrixLocation }
>;
export type ScriptJsonMapping = Map<string, JsonMappingValue>;
export type Template2ScriptMapping = Map<string, MapLocation>;
export type SFCMapping = {
  templateMapping: TemplateMapping | null;
  scriptMapping: ScriptMapping | null;
  stylusMapping: StylusMapping | null;
  stylusPropsMapping: StylusPropsMapping | null;
  scriptJsonMapping: ScriptJsonMapping | null;
  template2ScriptMapping: Template2ScriptMapping | null;
  descriptor: SFCDescriptor | null;
};

export function parseSFC(uri: string, document?: TextDocument): SFCMapping {
  try {
    let fileContent;
    if (document) {
      fileContent = document.getText();
    } else {
      fileContent = fs.readFileSync(uriToFileName(uri), "utf8");
    }
    const compileSFCResult = compileSFC(fileContent);
    const { descriptor, errors } = compileSFCResult;
    const templateMapping = parseTemplate(descriptor, uri);
    const scriptMapping = parseScriptlang(descriptor, uri);
    const { stylusMapping, stylusPropsMapping } = parseStylus(descriptor, uri);
    const scriptJsonMapping = parseScriptJson(
      descriptor,
      errors as CompilerError[],
      uri
    );
    const template2ScriptMapping = genTemplate2ScriptMapping(
      templateMapping?.variableMapping,
      scriptMapping
    );
    const sfcMapping = {
      templateMapping,
      scriptMapping,
      stylusMapping,
      stylusPropsMapping,
      scriptJsonMapping,
      template2ScriptMapping,
      descriptor,
    };
    return sfcMapping;
  } catch (err) {
    console.error("parseSFC error: ", err);
    return {
      templateMapping: null,
      scriptMapping: null,
      stylusMapping: null,
      stylusPropsMapping: null,
      scriptJsonMapping: null,
      template2ScriptMapping: null,
      descriptor: null,
    };
  }
}

export const ignorePropList = ["wx:key", "wx:ref"];
export const ignoreTagList = ["template", "view", "image", "text", "block"];

export function parseTemplate(descriptor: SFCDescriptor, uri: string) {
  if (!descriptor.template?.content) return null;
  const compileTemplateResult = compileTemplate({
    source: descriptor.template?.ast?.loc?.source,
    filename: uri,
    id: uri + "_mpx_template_",
  });
  const tagMapping = new Map<string, MappingValue>();
  const classMapping = new Map<string, MappingValue>();
  const variableMapping = new Map<string, MappingValue>();
  const templateLoc = {
    start: descriptor.template.ast.loc?.start?.offset + 1,
    end: descriptor.template.ast.loc?.end?.offset + 1,
  };

  // fs.writeFileSync(
  //   uriToFileName(uri).replace(".mpx", "-temp.json"),
  //   JSON.stringify(compileTemplateResult, null, 2)
  // );

  function traverseTemplate(ast: RootNode) {
    if (!ast || !ast.children) return null;
    // dfs 深度优先好处可以保证位置顺序递增
    function dfsTraverseChildren(children: TemplateChildNode[]) {
      for (const child of children) {
        if (child.type === 1) {
          // 自定义标签
          if (child?.tag && !ignoreTagList.includes(child.tag)) {
            const key = child.tag;
            const locStart = child.loc.start.offset + templateLoc.start;
            tagMapping.set(key + "-" + locStart, {
              key,
              loc: {
                start: locStart,
                end: locStart + key.length,
              },
            });
          }
          // 标签属性
          if (child.props?.length > 0) {
            for (const prop of child.props) {
              if (!("value" in prop)) {
                continue;
              }
              if (["class", "wx:class"].includes(prop.name)) {
                let content: string;
                try {
                  content = JSON.parse(prop.value?.loc?.source + "");
                } catch (_) {
                  continue;
                }
                const _loc = prop.value?.loc;
                formatClass(content).forEach((res) => {
                  const [key = "", offset = 0, isVariable = false] = res;
                  if (key && _loc?.start?.offset) {
                    const locStart =
                      _loc.start.offset + offset + templateLoc.start;
                    (isVariable ? variableMapping : classMapping).set(
                      key + "-" + locStart,
                      {
                        key,
                        loc: {
                          start: locStart,
                          end: locStart + key.length,
                        },
                      }
                    );
                  }
                });
              } else if (
                prop.name.startsWith("bind") ||
                prop.name.startsWith("catch") ||
                prop.value?.content.includes("{{")
              ) {
                const content = prop.value?.content;
                const _loc = prop.value?.loc;
                formatCotent(content).forEach((res) => {
                  const [key = "", offset = 0] = res;
                  if (key && _loc?.start?.offset) {
                    const locStart =
                      _loc.start.offset + offset + templateLoc.start;
                    variableMapping.set(key + "-" + locStart, {
                      key,
                      loc: {
                        start: locStart,
                        end: locStart + key.length,
                      },
                    });
                  }
                });
              }
            }
          }
          if (child.children) {
            dfsTraverseChildren(child.children);
          }
        }
      }
    }
    dfsTraverseChildren(ast.children);
  }

  try {
    traverseTemplate(compileTemplateResult.ast!);
  } catch (err) {
    console.error("---> traverseTemplate error: ", err);
  }

  const tagLocationSort = [...tagMapping.entries()].map(([, v]) => v);
  const classLocationSort = [...classMapping.entries()].map(([, v]) => v);
  const variableLocationSort = [...variableMapping.entries()].map(([, v]) => v);
  return {
    tagMapping,
    classMapping,
    variableMapping,
    tagLocationSort,
    classLocationSort,
    variableLocationSort,
    loc: templateLoc,
  };
}

// TODO 增加对复杂表达式的解析
export function formatCotent(content = ""): [string, number][] {
  if (!content) return [];
  let key = content.trim();
  if (key.startsWith("{{") && key.endsWith("}}")) {
    key = key.slice(2, -2).trim();
  }
  if (
    key.startsWith("'") ||
    key.startsWith('"') ||
    ["true", "false"].includes(key)
  ) {
    return [["", 0]];
  }
  if (key.startsWith("!") || key.startsWith("+")) {
    key = key.slice(1);
  }
  if (key.includes(".")) {
    key = key.split(".")[0];
  }
  if (key.includes("(")) {
    key = key.split("(")[0];
  }
  if (key.includes("[")) {
    key = key.split("[")[0];
  }
  const offset = content.indexOf(key);
  return [[key, offset]];
}

export const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g;

export function formatClass(content = ""): [string, number, boolean][] {
  if (!content) return [];
  // 变量类型 class
  if (content.startsWith("{{") && content.endsWith("}}")) {
    const code = content.slice(2, -2);
    try {
      const res = parseJSExpression(code);
      return res.map((i) => [i[0], i[1] + 2, i[2]]);
    } catch (_) {
      t.noop();
    }
  }

  const ans: [string, number, boolean][] = [];

  // refer from vue2 parseText :)
  let match: RegExpExecArray | null, index: number;
  let lastIndex = 0;
  while ((match = defaultTagRE.exec(content))) {
    index = match.index;
    // push text token
    if (index > lastIndex) {
      parseText(content.slice(lastIndex, index), lastIndex);
    }
    // jump tag token
    lastIndex = index + match[0].length;
  }
  if (lastIndex < content.length) {
    parseText(content.slice(lastIndex), lastIndex);
  }

  if (ans.length > 0) {
    return ans;
  }

  function parseText(content: string, start: number) {
    const keyLists = content.split(" ");
    let idx = -1;
    for (const k of keyLists) {
      idx++;
      if (!k) {
        continue;
      }
      ans.push([k, idx + start, false]);
      idx += k.length;
    }
  }

  parseText(content, 0);

  return ans;
}

function parseJSExpression(code: string = "") {
  try {
    const ans: [string, number, boolean][] = [];
    const ast = parse(code, { sourceType: "script" });
    traverse(ast, {
      Program(path: any) {
        const topLevelNode = path.node.body[0];
        if (t.isBlockStatement(topLevelNode)) {
          topLevelNode.body.forEach((s) => {
            if (t.isLabeledStatement(s)) {
              if (t.isIdentifier(s.label)) {
                const l = s.label;
                ans.push([l.name, l.start || 0, false]);
              } else if (t.isExpressionStatement(s.body)) {
                const exp = s.body.expression;
                if (t.isIdentifier(exp)) {
                  ans.push([exp.name, exp.start || 0, true]);
                } else if (t.isMemberExpression(exp)) {
                  const key = exp.object;
                  if (t.isIdentifier(key)) {
                    ans.push([key.name, key.start || 0, true]);
                  }
                } else if (t.isBinaryExpression(exp)) {
                  [exp.left, exp.right].forEach((e) => {
                    if (t.isIdentifier(e)) {
                      ans.push([e.name, e.start || 0, true]);
                    } else if (t.isMemberExpression(e)) {
                      const key = e.object;
                      if (t.isIdentifier(key)) {
                        ans.push([key.name, key.start || 0, true]);
                      }
                    }
                  });
                }
              }
            } else if (t.isExpressionStatement(s)) {
              const exp = s.expression;
              if (t.isSequenceExpression(exp)) {
                exp.expressions.forEach((e) => {
                  if (t.isIdentifier(e)) {
                    ans.push([e.name, e.start || 0, true]);
                  }
                });
              } else if (t.isIdentifier(exp)) {
                ans.push([exp.name, exp.start || 0, true]);
              }
            }
          });
        }
      },
    });
    return ans;
  } catch (_) {
    return [];
  }
}

export function hasScriptLang(descriptor: SFCDescriptor) {
  return descriptor.scriptSetup || !getJsonScriptType(descriptor);
}

export const JSON_SCRIPT_TYPE = {
  NAME_JSON: "name-json",
  TYPE_JSON: "type-json",
} as const;
export type ValueOf<T> = T[keyof T];

export function getJsonScriptType(
  descriptor: SFCDescriptor
): ValueOf<typeof JSON_SCRIPT_TYPE> | null {
  if ((descriptor.script?.attrs?.name + "").toLowerCase().includes("json")) {
    return JSON_SCRIPT_TYPE.NAME_JSON;
  } else if (
    (descriptor.script?.attrs?.type + "").toLowerCase().includes("json")
  ) {
    return JSON_SCRIPT_TYPE.TYPE_JSON;
  } else {
    return null;
  }
}

export function parseScriptlang(descriptor: SFCDescriptor, uri: string) {
  if (!hasScriptLang) return null;

  if (descriptor.scriptSetup || !descriptor.script) {
    return parseScriptSetup(descriptor, uri);
  }
  return parseScriptLegacy(descriptor, uri);
}

export function parseScriptLegacy(descriptor: SFCDescriptor, uri: string) {
  const compileScriptResult = compileScript(descriptor, { id: uri });
  const component = compileScriptResult.scriptAst?.find(
    (item) =>
      item.type === "ExpressionStatement" &&
      item.expression.type === "CallExpression" &&
      item.expression.callee.type === "Identifier" &&
      ["createPage", "createComponent"].includes(item.expression.callee.name)
  );
  if (!component) return null;
  const componentExpression = (component as ExpressionStatement)
    .expression as CallExpression;
  const scriptOffset = compileScriptResult.loc.start.offset;
  const dataMapping = new Map<string, MapLocation>();

  // traverse(compileScriptResult.scriptAst, )
  for (const prop of (componentExpression.arguments[0] as ObjectExpression)
    .properties) {
    if (prop.type === "ObjectProperty" && prop.key.type === "Identifier") {
      switch (prop.key.name) {
        case "properties":
        case "data": {
          if (prop.value.type === "ObjectExpression") {
            const dataExpression = prop.value.properties;
            dataExpression.forEach((item) => {
              if (item.type === "ObjectProperty") {
                if (item.key.type === "Identifier") {
                  const dataKey = item.key.name;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset,
                    end: item.key.end! + scriptOffset,
                  };
                  dataMapping.set(dataKey, dataLoc);
                } else if (item.key.type === "StringLiteral") {
                  const dataKey = item.key.value;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset + 1,
                    end: item.key.end! + scriptOffset - 1,
                  };
                  dataMapping.set(dataKey, dataLoc);
                } else {
                  console.warn("----> warning: ", item.key.type);
                }
              }
            });
          }
          break;
        }
        case "computed":
        case "methods": {
          if (prop.value.type === "ObjectExpression") {
            const methodsProps = prop.value.properties;
            methodsProps.forEach((item) => {
              if (item.type === "SpreadElement") {
                if (
                  item.argument.type === "CallExpression" &&
                  item.argument.callee.type === "MemberExpression" &&
                  item.argument.callee.property.type === "Identifier" &&
                  [
                    "mapState",
                    "mapMutations",
                    "mapActions",
                    "mapGetters",
                  ].includes(item.argument.callee.property.name)
                ) {
                  if (item.argument.arguments[0].type === "ArrayExpression") {
                    const elements = item.argument.arguments[0].elements;
                    elements.forEach((element) => {
                      if (element?.type === "StringLiteral") {
                        const dataKey = element.value;
                        const dataLoc = {
                          start: element.start! + scriptOffset + 1,
                          end: element.end! + scriptOffset - 1,
                        };
                        dataMapping.set(dataKey, dataLoc);
                      }
                    });
                  }
                }
              } else if (item.type === "ObjectMethod") {
                if (item.key.type === "Identifier") {
                  const dataKey = item.key.name;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset,
                    end: item.key.end! + scriptOffset,
                  };
                  dataMapping.set(dataKey, dataLoc);
                }
              } else {
                console.warn("----> warning: ", item.type);
              }
            });
          }
          break;
        }
        default:
          break;
      }
    }
  }
  const computedMapping = new Map<string, MapLocation>();
  const methodsMapping = new Map<string, MapLocation>();
  return { dataMapping, computedMapping, methodsMapping };
}

export function parseScriptSetup(descriptor: SFCDescriptor, uri: string) {
  const dataMapping = new Map<string, MapLocation>();
  const computedMapping = new Map<string, MapLocation>();
  const methodsMapping = new Map<string, MapLocation>();

  const compileSetupResult = descriptor.scriptSetup;
  const setupLocOffset = compileSetupResult?.loc.start.offset;

  // defineExpose
  const [defineExpose, offset] = extractDefineExpose(
    compileSetupResult?.content
  );
  const res: [string, number][] = parseJSExpression(
    /** 去除最后一个逗号，避免报错 */
    defineExpose.replace(/,(\s*})/, "$1")
  )?.map((i /** `defineExpose(` 13个字符 */) => [i[0], i[1] + offset + 13]);
  // console.log("[shun] --->", setupLocOffset, res);
  res.forEach((res) => {
    const [key = "", offset = 0] = res;
    if (key && setupLocOffset) {
      const dataLoc = {
        start: offset + setupLocOffset,
        end: offset + setupLocOffset + key.length,
      };
      dataMapping.set(key, dataLoc);
    }
  });

  return { dataMapping, computedMapping, methodsMapping };
}

function extractDefineExpose(code: string = ""): [string, number] {
  const regex = /defineExpose\(\s*({[^}]*})\s*\)/;
  const match = code.match(regex);

  if (match) {
    return [match[1], match.index || 0];
  } else {
    return ["", 0];
  }
}

export function parseStylus(descriptor: SFCDescriptor, uri?: string) {
  const stylusMapping = new Map<string, MatrixLocation[]>();
  const stylusPropsMapping: StylusPropsMapping = new Map();
  let styleSourceCode: string = "";

  if (descriptor.styles?.[0]?.lang !== "stylus") {
    return { stylusMapping, stylusPropsMapping, styleSourceCode };
  }
  const styles = descriptor.styles[0];
  const stylusMatrixLoc = {
    line: styles.loc?.start?.line,
    column: styles.loc?.start?.column,
  };

  const getClassName = (seg: any[] = []) => {
    if (seg[0]?.string === "." && seg[1]?.string) {
      return seg[1];
    }
    if (seg[0]?.string === "&" && seg[1]?.string === "." && seg[2]?.string) {
      return seg[2];
    }
    return [];
  };

  let last: any = null;
  function dfsTraverseStylusNode(nodes: any) {
    if (!nodes.length) return null;
    for (const node of nodes) {
      if (node.nodes?.length > 0) {
        const classNamesNodes = node.nodes
          .map((node: any) => getClassName(node?.segments))
          .filter((i: any) => i.string || i.val);
        if (!classNamesNodes.length) {
          continue;
        }
        const [endLine] = [node?.lineno, node?.column];
        for (const item of classNamesNodes) {
          const key = item.string || item.val;
          if (!key) continue;
          const loc = {
            line: item.lineno + stylusMatrixLoc.line - 1,
            column: item.column - 1,
          };
          if (stylusMapping.has(key)) {
            stylusMapping.get(key)?.push(loc);
          } else {
            stylusMapping.set(key, [loc]);
          }
          if (last) {
            last?.forEach((item: any) => {
              const key = item.string || item.val;
              if (key) {
                stylusPropsMapping.set(key, {
                  start: {
                    line: item.lineno + stylusMatrixLoc.line - 1,
                    column: item.column - 1,
                  },
                  end: {
                    line: endLine + stylusMatrixLoc.line - 1,
                    column: 0,
                  },
                });
              }
            });
            last = null;
          }
        }
        last = classNamesNodes;
      }
      if (node.block?.nodes.length > 0) {
        dfsTraverseStylusNode(node.block.nodes);
      }
    }
  }
  try {
    styleSourceCode = descriptor.styles[0].content;
    // @ts-expect-error ignore
    const compileStylusResult = new stylus.Parser(styleSourceCode).parse();
    dfsTraverseStylusNode(compileStylusResult?.nodes);
    if (last) {
      last?.forEach((item: any) => {
        const key = item.string || item.val;
        if (key) {
          stylusPropsMapping.set(key, {
            start: {
              line: item.lineno + stylusMatrixLoc.line - 1,
              column: item.column - 1,
            },
            end: {
              line: compileStylusResult.lineno + stylusMatrixLoc.line - 1,
              column: compileStylusResult.column,
            },
          });
        }
      });
    }
  } catch (err) {
    console.error("---> traverseStylus error: ", err);
  }
  return { stylusMapping, stylusPropsMapping, styleSourceCode };
}

export function parseScriptJson(
  descriptor: SFCDescriptor,
  errors: CompilerError[],
  uri: string
) {
  const jsonMapping = new Map<string, JsonMappingValue>();
  try {
    let jsonSource: string;
    let jsonScriptType = getJsonScriptType(descriptor);
    if (jsonScriptType) {
      jsonSource = descriptor.script?.loc?.source as string;
    } else if (errors?.length) {
      const jsonDescriptor = errors.find(
        (item: any) =>
          item?.loc?.source?.startsWith('<script name="json">') ||
          item?.loc?.source?.startsWith('<script type="application/json">')
      );
      jsonSource = jsonDescriptor?.loc?.source as string;
      const str = jsonSource.slice(0, jsonSource.indexOf("\n"));
      if (str.includes("type") && str.includes("application/json")) {
        jsonScriptType = JSON_SCRIPT_TYPE.TYPE_JSON;
      } else if (str.includes("name") && str.includes("json")) {
        jsonScriptType = JSON_SCRIPT_TYPE.NAME_JSON;
      }
    } else {
      return jsonMapping;
    }
    if (
      jsonSource.indexOf("\n") !== -1 &&
      jsonSource.lastIndexOf("\n") !== -1
    ) {
      jsonSource = jsonSource.substring(
        jsonSource.indexOf("\n"),
        jsonSource.lastIndexOf("\n")
      );
    }
    if (jsonScriptType === JSON_SCRIPT_TYPE.TYPE_JSON) {
      // <script type="application/json">
      const jsonUsingComponents = JSON.parse(jsonSource)?.usingComponents;
      if (jsonUsingComponents) {
        for (const [key, val] of Object.entries(jsonUsingComponents)) {
          const { absolutePath = "", relativePath = "" } =
            formatUsingComponentsPath(val as string, uri);
          if (absolutePath || relativePath) {
            jsonMapping.set(key, {
              configPath: val as string,
              absolutePath,
              relativePath,
            });
          }
        }
        return jsonMapping;
      }
    } else {
      // TODO <script name="json">
    }
  } catch (err) {
    console.error("---> parseScriptJson error: ", err);
  }
  return jsonMapping;
}

export function formatUsingComponentsPath(
  componentPath: string = "",
  uri: string
): { absolutePath?: string; relativePath?: string } {
  if (!componentPath) return {};
  if (componentPath.indexOf("?") !== -1) {
    componentPath = componentPath.substring(0, componentPath.indexOf("?"));
  }
  if (componentPath.startsWith("./") || componentPath.startsWith("../")) {
    componentPath = path.join(uriToFileName(uri), "..", componentPath);
  } else {
    return { relativePath: componentPath };
  }
  const absolutePath = reolveAbsolutePath(componentPath);
  if (absolutePath) {
    return { absolutePath };
  }
  return { relativePath: componentPath };
}

export function reolveAbsolutePath(componentPath: string): string {
  // 按优先级补充完整路径再尝试访问
  if (componentPath.endsWith(".mpx")) {
    if (fs.existsSync(componentPath)) {
      return componentPath;
    }
  } else {
    if (fs.existsSync(componentPath + ".mpx")) {
      return componentPath + ".mpx";
    } else if (fs.existsSync(componentPath + "/index.mpx")) {
      return componentPath + "/index.mpx";
    }
  }
  return "";
}

export function genTemplate2ScriptMapping(
  templateVariableMapping: TemplateMappingItem | undefined,
  scriptMapping: ScriptMapping | null
): Template2ScriptMapping {
  const mapping = new Map();
  if (!templateVariableMapping || !scriptMapping) {
    return mapping;
  }
  // for (const [mapKey, value] of templateVariableMapping.entries()) {
  //   const { key } = value;
  //   const mappingLoc =
  //     scriptMapping.dataMapping.get(key) ||
  //     scriptMapping.computedMapping.get(key) ||
  //     scriptMapping.methodsMapping.get(key);
  //   if (mappingLoc) {
  //     mapping.set(mapKey, mappingLoc);
  //   }
  // }
  return mapping;
}
