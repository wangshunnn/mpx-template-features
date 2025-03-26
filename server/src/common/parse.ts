import type { CallExpression, ExpressionStatement, ObjectExpression } from "@babel/types";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import {
  CompilerError,
  compileScript,
  parse as compileSFC,
  compileTemplate,
  SFCTemplateCompileResults,
  type SFCDescriptor,
} from "@vue/compiler-sfc";
import * as fs from "fs";
import * as path from "path";
import * as stylus from "stylus";
import { TextDocument } from "vscode-languageserver-textdocument";
import { findResult, noop, uriToFileName } from "./utils";
import { JSON_SCRIPT_TYPE, SCRIPT_CREATE_COMPONENT_PROPS, SETUP_GLOBAL_FUNCTION_NAME } from "./const";
import { tryResolveByTsConfig, tryResolvePackage } from "./resolve";
import { parseExpression, parseMpxExpression } from "./parse/slotExpression";
import { collectReturnStatement, findBlockReturnStatement } from "./parse/visitor";
import { MapLocation } from "./types";

export type MatrixLocation = { line: number; column: number };
export type MappingValue = { key: string; loc: MapLocation };
export type JsonMappingValue = {
  configPath: string;
  absolutePath?: string;
  relativePath?: string;
};
export type TemplateMappingItem = Map<string, MappingValue>;
export type ScriptLegacyMappingItem = Record<SCRIPT_CREATE_COMPONENT_PROPS, Map<string, MapLocation>>;
export type ScriptSetupMappingItem = Record<SETUP_GLOBAL_FUNCTION_NAME, Map<string, MapLocation>>;
export type TemplateMapping = {
  tagMapping: TemplateMappingItem;
  rangeMapping: Set<MappingValue>;
  classMapping: TemplateMappingItem;
  variableMapping: TemplateMappingItem;
  tagLocationSort: MappingValue[];
  classLocationSort: MappingValue[];
  variableLocationSort: MappingValue[];
  loc: MapLocation;
} | null;
export type ScriptMapping = {
  scriptDataMapping?: ScriptLegacyMappingItem;
  setupDataMapping?: ScriptSetupMappingItem;
} | null;
export type StylusMapping = Map<string, MatrixLocation[]>;
export type StylusPropsMapping = Map<string, Array<{ start: MatrixLocation; end: MatrixLocation }>>;
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

const emptySfcMapping: SFCMapping = {
  templateMapping: null,
  scriptMapping: null,
  stylusMapping: null,
  stylusPropsMapping: null,
  scriptJsonMapping: null,
  template2ScriptMapping: null,
  descriptor: null,
};

export async function parseSFC(uri: string, document?: TextDocument): Promise<SFCMapping> {
  console.log('---> debug11', uri);
  try {
    let fileContent;
    if (document) {
      fileContent = document.getText();
    } else {
      const filename = uriToFileName(uri);
      if (!fs.existsSync(filename)) return { ...emptySfcMapping };
      fileContent = fs.readFileSync(uriToFileName(uri), "utf8");
    }
    const compileSFCResult = compileSFC(fileContent);
    const { descriptor, errors } = compileSFCResult;
    const templateMapping = parseTemplate(descriptor, uri);
    const scriptMapping = parseScriptlang(descriptor, uri);
    const { stylusMapping, stylusPropsMapping } = parseStylus(descriptor, uri);
    const scriptJsonMapping = await parseScriptJson(descriptor, errors as CompilerError[], uri);
    const template2ScriptMapping = genTemplate2ScriptMapping(templateMapping?.variableMapping, scriptMapping);
    return {
      templateMapping,
      scriptMapping,
      stylusMapping,
      stylusPropsMapping,
      scriptJsonMapping,
      template2ScriptMapping,
      descriptor,
    };
  } catch (err) {
    console.warn(`[debug warning] ${uri} parse SFC failed`, err);
    return { ...emptySfcMapping };
  }
}

export const ignorePropList = ["wx:key", "wx:ref"];
export const ignoreTagList = ["template", "view", "image", "text", "block"];

export function parseTemplate(descriptor: SFCDescriptor, uri: string): TemplateMapping {
  if (!descriptor.template?.content) return null;
  const compileTemplateResult = compileTemplate({
    source: descriptor.template?.ast?.loc?.source,
    filename: uri,
    id: uri + "_mpx_template_",
  });
  const tagMapping = new Map<string, MappingValue>();
  const classMapping = new Map<string, MappingValue>();
  const variableMapping = new Map<string, MappingValue>();
  const rangeMapping = new Set<MappingValue>();
  const templateLoc = {
    start: descriptor.template.ast.loc?.start?.offset + 1,
    end: descriptor.template.ast.loc?.end?.offset + 1,
  };

  // fs.writeFileSync(
  //   uriToFileName(uri).replace(".mpx", "-temp.json"),
  //   JSON.stringify(compileTemplateResult, null, 2)
  // );

  function traverseTemplate(ast: SFCTemplateCompileResults["ast"]) {
    if (!ast || !ast.children) return null;

    function processChildren(content: string, loc: any) {
      parseMpxExpression(content).forEach((res) => {
        const [key = "", offset = 0] = res;
        if (key && loc?.start?.offset) {
          const locStart = loc.start.offset + offset;
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

    function appendVariableMapping(content: [string, number], loc: any) {
      const [key = "", offset = 0] = content;
      if (key && loc?.start?.offset) {
        const locStart = loc.start.offset + offset + templateLoc.start;
        variableMapping.set(key + "-" + locStart, {
          key,
          loc: {
            start: locStart,
            end: locStart + key.length,
          },
        });
      }
    }

    // dfs 深度优先好处可以保证位置顺序递增
    function dfsTraverseChildren(children: Exclude<SFCTemplateCompileResults["ast"], undefined>["children"]) {
      for (const child of children) {
        switch (child.type) {
          // <tag prop="value" />
          case 1: {
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
                if (child.tag === "component" && prop.name === "range") {
                  const content = prop.value?.content;
                  const _loc = prop.value?.loc;
                  if (content && _loc) {
                    const locStart = _loc.start.offset + templateLoc.start;

                    content
                      .split(",")
                      .reduce<[MappingValue[], number]>(
                        ([res, offset], item) => [
                          [
                            ...res,
                            {
                              key: item,
                              loc: {
                                start: offset,
                                end: offset + item.length,
                              },
                            },
                          ],
                          offset + item.length + 1,
                        ],
                        [[], locStart],
                      )[0]
                      .forEach((item) => rangeMapping.add(item));
                  }
                } else if (["class", "wx:class"].includes(prop.name)) {
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
                      const locStart = _loc.start.offset + offset + templateLoc.start;
                      (isVariable ? variableMapping : classMapping).set(key + "-" + locStart, {
                        key,
                        loc: {
                          start: locStart,
                          end: locStart + key.length,
                        },
                      });
                    }
                  });

                  parseMpxExpression(content).forEach((res) => {
                    const [key = "", offset = 0] = res;
                    if (key && _loc?.start?.offset) {
                      const locStart = _loc.start.offset + offset + templateLoc.start;
                      variableMapping.set(key + "-" + locStart, {
                        key,
                        loc: {
                          start: locStart,
                          end: locStart + key.length,
                        },
                      });
                    }
                  });
                } else if (prop.name.startsWith("bind") || prop.name.startsWith("bind")) {
                  parseExpression(prop.value?.content).forEach((res) => appendVariableMapping(res, prop.value?.loc));
                } else if (prop.value?.content.includes("{{")) {
                  const content = prop.value?.content;
                  const _loc = prop.value?.loc;

                  parseMpxExpression(content).forEach((item) => appendVariableMapping(item, _loc));
                }
              }
            }
            if (child.children) {
              dfsTraverseChildren(child.children);
            }
            break;
          }
          case 5: {
            processChildren(child.loc.source, child.loc);
            break;
          }
          // {{ expression.field1.field2 }}
          case 8: {
            processChildren(child.loc.source, child.loc);

            const children: any[] = child.children.filter((item) => typeof item === "object");

            if (children.length) {
              dfsTraverseChildren(children);
            }
            break;
          }
          /**
           * <view>text <text>hello world</text></view>
           *       ^^^^
           * */
          case 12: {
            dfsTraverseChildren([child.content]);
            break;
          }
          default: {
            const children = (child as any)?.children ?? [];

            if (Array.isArray(children)) {
              dfsTraverseChildren(children);
            }

            break;
          }
        }
      }
    }
    dfsTraverseChildren(ast.children);
  }

  try {
    traverseTemplate(compileTemplateResult.ast!);
  } catch (err) {
    console.warn(`[debug warning] ${uri} tra  verseTemplate error: `, err);
  }

  const tagLocationSort = [...tagMapping.entries()].map(([, v]) => v);
  const classLocationSort = [...classMapping.entries()].map(([, v]) => v);
  const variableLocationSort = [...variableMapping.entries()].map(([, v]) => v);

  return {
    tagMapping,
    classMapping,
    rangeMapping,
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
  if (key.startsWith("'") || key.startsWith('"') || ["true", "false"].includes(key)) {
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

export function getJsonScriptType(descriptor: SFCDescriptor) {
  if ((descriptor.script?.attrs?.name + "").toLowerCase().includes("json")) {
    return JSON_SCRIPT_TYPE.NAME_JSON;
  } else if ((descriptor.script?.attrs?.type + "").toLowerCase().includes("json")) {
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
      t.isExpressionStatement(item) &&
      t.isCallExpression(item.expression) &&
      t.isIdentifier(item.expression.callee) &&
      ["createPage", "createComponent"].includes(item.expression.callee.name),
  );
  if (!component) return null;
  const componentExpression = (component as ExpressionStatement).expression as CallExpression;
  const scriptOffset = compileScriptResult.loc.start.offset;

  const scriptDataMapping: ScriptLegacyMappingItem = {
    [SCRIPT_CREATE_COMPONENT_PROPS.DATA]: new Map<string, MapLocation>(),
    [SCRIPT_CREATE_COMPONENT_PROPS.COMPUTED]: new Map<string, MapLocation>(),
    [SCRIPT_CREATE_COMPONENT_PROPS.METHODS]: new Map<string, MapLocation>(),
    [SCRIPT_CREATE_COMPONENT_PROPS.SETUP]: new Map<string, MapLocation>(),
  };

  for (const prop of (componentExpression.arguments[0] as ObjectExpression).properties) {
    /**
     * createComponent({
     *  // --- parse
     *  setup(props) {
     *    return {
     *     // collect
     *     name: "suhlan",
     *    }
     *  },
     *  // ---
     * })
     */
    if (t.isObjectMethod(prop)) {
      const name = t.isIdentifier(prop.key) ? prop.key.name : "";

      if (name !== "setup") continue;

      for (const [name, location] of Object.entries(collectReturnStatement(findBlockReturnStatement(prop.body)))) {
        scriptDataMapping[SCRIPT_CREATE_COMPONENT_PROPS.SETUP].set(name, {
          start: location.start + scriptOffset,
          end: location.end + scriptOffset,
        });
      }

      continue;
    }
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      const propsName = prop.key.name;
      switch (propsName) {
        case "properties":
        case "data": {
          if (t.isObjectExpression(prop.value)) {
            const dataExpression = prop.value.properties;
            dataExpression.forEach((item) => {
              if (t.isObjectProperty(item)) {
                if (t.isIdentifier(item.key)) {
                  const dataKey = item.key.name;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset,
                    end: item.key.end! + scriptOffset,
                  };
                  scriptDataMapping[SCRIPT_CREATE_COMPONENT_PROPS.DATA].set(dataKey, dataLoc);
                } else if (t.isStringLiteral(item.key)) {
                  const dataKey = item.key.value;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset + 1,
                    end: item.key.end! + scriptOffset - 1,
                  };
                  scriptDataMapping[SCRIPT_CREATE_COMPONENT_PROPS.DATA].set(dataKey, dataLoc);
                } else {
                  console.warn("[debug warning] properties & data", item);
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
              if (t.isSpreadElement(item)) {
                if (
                  t.isCallExpression(item.argument) &&
                  t.isMemberExpression(item.argument.callee) &&
                  t.isIdentifier(item.argument.callee.property) &&
                  ["mapState", "mapMutations", "mapActions", "mapGetters"].includes(item.argument.callee.property.name)
                ) {
                  if (t.isArrayExpression(item.argument.arguments[0])) {
                    const elements = item.argument.arguments[0].elements;
                    elements.forEach((element) => {
                      if (t.isStringLiteral(element)) {
                        const dataKey = element.value;
                        const dataLoc = {
                          start: element.start! + scriptOffset + 1,
                          end: element.end! + scriptOffset - 1,
                        };
                        scriptDataMapping[propsName].set(dataKey, dataLoc);
                      }
                    });
                  }
                }
              } else if (t.isObjectMethod(item) || t.isObjectProperty(item)) {
                if (t.isIdentifier(item.key)) {
                  const dataKey = item.key.name;
                  const dataLoc = {
                    start: item.key.start! + scriptOffset,
                    end: item.key.end! + scriptOffset,
                  };
                  scriptDataMapping[propsName].set(dataKey, dataLoc);
                }
              } else {
                console.warn("[debug warning] computed & methods", item);
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

  return { scriptDataMapping };
}

export function parseScriptSetup(descriptor: SFCDescriptor, uri: string) {
  const setupDataMapping: ScriptSetupMappingItem = {
    [SETUP_GLOBAL_FUNCTION_NAME.DEFINE_PROPS]: new Map<string, MapLocation>(),
    [SETUP_GLOBAL_FUNCTION_NAME.DEFINE_EXPOSE]: new Map<string, MapLocation>(),
  };

  const compileSetupResult = descriptor.scriptSetup;
  const setupLocOffset = compileSetupResult?.loc.start.offset;

  function parseSetupGlobalFunction(funcName: SETUP_GLOBAL_FUNCTION_NAME) {
    if (!funcName) {
      return;
    }

    const [extractedCode = "", offset = 0] =
      extractSetupGlobalFunctionExpression(funcName)(compileSetupResult?.content) || [];

    const res: [string, number][] =
      parseSetupGlobalFunctionExpression(funcName)(extractedCode)?.map((i) => [i[0], i[1] + offset]) || [];

    res?.forEach((res) => {
      const [key = "", offset = 0] = res;
      if (key && setupLocOffset) {
        const dataLoc = {
          start: offset + setupLocOffset,
          end: offset + setupLocOffset + key.length,
        };
        setupDataMapping[funcName].set(key, dataLoc);
      }
    });
  }

  /** defineProps() ⬇ */
  parseSetupGlobalFunction(SETUP_GLOBAL_FUNCTION_NAME.DEFINE_PROPS);
  /** defineExpose() ⬇ */
  parseSetupGlobalFunction(SETUP_GLOBAL_FUNCTION_NAME.DEFINE_EXPOSE);
  // console.log("[shun] --->", setupDataMapping);

  return { setupDataMapping };
}

export function extractSetupGlobalFunctionExpression(funcName: SETUP_GLOBAL_FUNCTION_NAME) {
  if (!funcName) {
    return noop;
  }

  return (code: string = ""): [string, number] => {
    let _funcName: `${SETUP_GLOBAL_FUNCTION_NAME}${"({" | "<{"}`;
    let start, end, stack, pairs;

    if ((start = code.indexOf(`${funcName}({`)) !== -1) {
      _funcName = `${funcName}({`;
      stack = ["(", "{"];
      pairs = new Map([
        [")", "("],
        ["}", "{"],
      ]);
    } else if ((start = code.indexOf(`${funcName}<{`)) !== -1) {
      _funcName = `${funcName}<{`;
      stack = ["<", "{"];
      pairs = new Map([
        [">", "<"],
        ["}", "{"],
      ]);
    } else {
      return ["", 0];
    }

    for (let i = start + _funcName.length; i < code.length; i++) {
      const c = code[i];
      if ([...pairs.values()].includes(c)) {
        stack.push(c);
      } else if (pairs.has(c)) {
        if (stack.pop() !== pairs.get(c)) {
          break;
        }
        if (stack.length === 0) {
          end = i;
          break;
        }
      }
    }

    if (start && end && end > start) {
      const splitCode = code.substring(start, end + 1);
      return [splitCode, start || 0];
    } else {
      return ["", 0];
    }
  };
}

export function parseSetupGlobalFunctionExpression(funcName: SETUP_GLOBAL_FUNCTION_NAME) {
  if (!funcName) {
    return noop;
  }
  return (code: string = "") => {
    try {
      const ans: [string, number, boolean][] = [];
      const ast = parse(code, {
        sourceType: "script",
        plugins: ["typescript"],
      });
      traverse(ast, {
        Program(path: any) {
          const topLevelNode = path.node.body[0];
          if (t.isExpressionStatement(topLevelNode)) {
            const callExp = topLevelNode.expression;
            if (t.isTSInstantiationExpression(callExp)) {
              /** ts, like: defineProps<{}> */
              const tsNode = callExp.typeParameters?.params[0];
              if (t.isTSTypeLiteral(tsNode)) {
                tsNode.members?.forEach((p) => {
                  if (t.isTSPropertySignature(p) && t.isIdentifier(p.key)) {
                    const key = p.key;
                    if (key.start) {
                      ans.push([key.name, key.start, true]);
                    }
                  }
                });
              }
            } else if (t.isCallExpression(callExp)) {
              /** js, like: defineProps({}) */
              if (t.isIdentifier(callExp.callee) && callExp.callee.name === funcName) {
                const args = callExp.arguments?.[0];
                if (t.isObjectExpression(args)) {
                  args.properties?.forEach((p) => {
                    if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
                      const key = p.key;
                      if (key.start) {
                        ans.push([key.name, key.start, true]);
                      }
                    }
                  });
                }
              }
            }
          }
        },
      });
      return ans;
    } catch (_) {
      return [];
    }
  };
}

export function parseStylus(descriptor: SFCDescriptor, uri?: string) {
  const stylusMapping = new Map<string, MatrixLocation[]>();
  const stylusPropsMapping: StylusPropsMapping = new Map();
  const styleSource = descriptor.styles?.find((item) => item.lang === "stylus" && item.content && !item.src);

  if (!styleSource) {
    return { stylusMapping, stylusPropsMapping };
  }

  const stylusMatrixLoc = {
    line: styleSource.loc?.start?.line,
    column: styleSource.loc?.start?.column,
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
                const stylusRange = {
                  start: {
                    line: item.lineno + stylusMatrixLoc.line - 1,
                    column: item.column - 1,
                  },
                  end: {
                    line: endLine + stylusMatrixLoc.line - 1,
                    column: 0,
                  },
                };
                if (stylusPropsMapping.has(key)) {
                  stylusPropsMapping.get(key)?.push(stylusRange);
                } else {
                  stylusPropsMapping.set(key, [stylusRange]);
                }
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
    // @ts-expect-error ignore
    const compileStylusResult = new stylus.Parser(styleSource.content).parse();
    dfsTraverseStylusNode(compileStylusResult?.nodes);
    if (last) {
      last?.forEach((item: any) => {
        const key = item.string || item.val;
        if (key) {
          const stylusRange = {
            start: {
              line: item.lineno + stylusMatrixLoc.line - 1,
              column: item.column - 1,
            },
            end: {
              line: compileStylusResult.lineno + stylusMatrixLoc.line - 1,
              column: compileStylusResult.column,
            },
          };
          if (stylusPropsMapping.has(key)) {
            stylusPropsMapping.get(key)?.push(stylusRange);
          } else {
            stylusPropsMapping.set(key, [stylusRange]);
          }
        }
      });
    }
  } catch (err) {
    console.warn("[debug warning] traverseStylus error: ", err);
  }
  return { stylusMapping, stylusPropsMapping };
}

export async function parseScriptJson(descriptor: SFCDescriptor, errors: CompilerError[], uri: string) {
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
          item?.loc?.source?.startsWith('<script type="application/json">'),
      );
      jsonSource = jsonDescriptor?.loc?.source || "";
      const str = jsonSource?.slice(0, jsonSource.indexOf("\n")) || "";
      if (str.includes("type") && str.includes("application/json")) {
        jsonScriptType = JSON_SCRIPT_TYPE.TYPE_JSON;
      } else if (str.includes("name") && str.includes("json")) {
        jsonScriptType = JSON_SCRIPT_TYPE.NAME_JSON;
      }
    } else {
      return jsonMapping;
    }
    if (jsonSource.indexOf("\n") !== -1 && jsonSource.lastIndexOf("\n") !== -1) {
      jsonSource = jsonSource.substring(jsonSource.indexOf("\n"), jsonSource.lastIndexOf("\n"));
    }
    const usingComponents: Record<string, string | string[]> = {};
    // proces json
    if (jsonScriptType === JSON_SCRIPT_TYPE.TYPE_JSON) {
      // <script type="application/json">
      const jsonUsingComponents = JSON.parse(jsonSource)?.usingComponents;
      if (jsonUsingComponents) {
        Object.assign(usingComponents, jsonUsingComponents);
      }
    }
    // process javascript json
    // 1. 模糊匹配对象中的所有 key/val
    // 2. 使用 formatUsingComponentsPath 筛选出合法（在真实文件系统中存在）路径
    else {
      const result = parse(jsonSource, { sourceType: "script" });
      const componentPathFromExpr = (node: t.Expression) => {
        if (t.isIdentifier(node)) {
          return node.name;
        }

        if (t.isLiteral(node)) {
          if (t.isStringLiteral(node)) {
            return node.value;
          }
        }
      };
      const componentNameFromObjectProp = (node: t.ObjectProperty) => {
        const key = node.key;
        if (t.isPrivateName(key)) {
          return key.id.name;
        }

        if (t.isExpression(key)) {
          return componentPathFromExpr(key);
        }

        return;
      };

      const tryAsComponentDecl = (node: t.ObjectProperty) => {
        const value = node.value;

        if (t.isStringLiteral(value)) {
          return value.value;
        }
      };

      const tryAsComponent = (node: t.ObjectProperty) => {
        const componentName = componentNameFromObjectProp(node);
        const componentPath = tryAsComponentDecl(node);

        if (!(componentName && componentPath)) {
          return;
        }

        return [componentName, componentPath];
      };

      // 不精确的匹配
      traverse(result, {
        ObjectProperty(node) {
          if (node.node.extra?.markSkip) return;

          const name = componentNameFromObjectProp(node.node);
          if (node.parentPath) {
            const objectExprParent = node.parentPath.node;
            if (t.isObjectExpression(objectExprParent)) {
              const objectPropParent = node.parentPath.parentPath?.node;
              if (t.isObjectProperty(objectPropParent)) {
                const parentName = componentNameFromObjectProp(objectPropParent);
                if (parentName === "componentPlaceholder") {
                  return;
                }
              }
            }
          }

          if (name === "componentPlaceholder") {
            const childNode = node.node.value;
            if (t.isObjectExpression(node.node.value)) {
              childNode.extra ??= {};
              childNode.extra.markSkip = true;
              return;
            }
          }
          const component = tryAsComponent(node.node);

          if (component) {
            const [name, compPath] = component;
            if (!usingComponents[name]) usingComponents[name] = [];
            if (!Array.isArray(usingComponents[name])) usingComponents[name] = [usingComponents[name]];
            usingComponents[name].push(compPath);
          }
        },
      });
    }

    await Promise.allSettled(
      Object.entries(usingComponents).flatMap(([key, val]) =>
        (Array.isArray(val) ? val : [val]).map(async (componentPath) => {
          try {
            const { absolutePath = "", relativePath = "" } = await formatUsingComponentsPath(componentPath, uri);
            if (absolutePath || relativePath) {
              jsonMapping.set(key, {
                configPath: componentPath,
                absolutePath,
                relativePath,
              });
            }
          } catch (error) {
            console.log(`[debug warning] ${uri} resolve "${componentPath}" failed`, error);
          }
        }),
      ),
    );
  } catch (err) {
    console.error(`[debug warning] ${uri} parseScriptJson error: `, err);
  }

  return jsonMapping;
}

export async function formatUsingComponentsPath(
  componentPath: string = "",
  uri: string,
): Promise<{ absolutePath?: string; relativePath?: string }> {
  if (!componentPath) return {};

  const queryIndex = componentPath.indexOf("?");
  if (queryIndex !== -1) {
    componentPath = componentPath.substring(0, queryIndex);
  }

  if (componentPath.startsWith("./") || componentPath.startsWith("../")) {
    componentPath = path.join(uriToFileName(uri), "..", componentPath);
  } else {
    const resolvedPath = await findResult(
      [() => tryResolveByTsConfig(componentPath), () => tryResolvePackage(componentPath)],
      (fn) => fn(),
    );

    if (resolvedPath)
      return {
        absolutePath: resolvedPath,
      };

    return { relativePath: componentPath };
  }

  // absolute path
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
  scriptMapping: ScriptMapping | null,
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
