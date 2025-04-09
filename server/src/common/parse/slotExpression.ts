import { parse, ParseResult, parseExpression as parseExpr } from "@babel/parser";
import traverse, { TraverseOptions } from "@babel/traverse";
import * as t from "@babel/types";
import { LRUCache } from "vscode-languageserver";

const slotExpressionCache = new LRUCache<string, [string, number][]>(512);

/**
 *
 * ```vue
 * <view bindhandleXpClickEvent="handleXpClickEvent"></view>
 *                               ^^^^^^^^^^^^^^^^^^
 * ```
 *
 * @param content
 * @returns
 */
export function parseExpression(content = "") {
  return traverseExpression(content, 0);
}

const tryParse = (content: string) => {
  const res = [
    // try parse expression, link binaryExpression, link `1 + 2 + name + age + obj.m1.m2 + obj[foo]`
    () => parse(content),
    // try parse literal, link `{ name: 'value', age: 18 }`
    () => parseExpr(content)
  ];
  let _error: any;
  for (const fn of res) {
    try {
      return fn();
    } catch (error) {
      _error = error;
    }
  }

  if (_error) {
    throw _error;
  }
};

function traverseExpression(content: string, offset: number) {
  const result: [string, number][] = [];
  let expr: ParseResult<t.File> | ParseResult<t.Expression> | undefined;

  try {
    expr = tryParse(content);
  } catch (error) {
    console.log(`[debug warning] parse content failed "${content}"`, error);
    return result;
  }

  if (!expr) return result;

  const traverseOption: TraverseOptions = {
    noScope: true,
    Identifier(path) {
      const name = path.node.name;
      if (name) {
        result.push([name, path.node.start! + offset]);
      }
    },
    MemberExpression(path) {
      path.skip();

      const { object: obj, property, computed } = path.node;
      const objectPath = path.get("object");

      if (computed) {
        if (t.isIdentifier(property)) {
          result.push([property.name, property.start! + offset]);
        } else {
          path.get("property").visit();
        }
      }

      // a.b.c => { object: a, property: b }
      if (t.isIdentifier(obj)) {
        result.push([obj.name, obj.start! + offset]);
      }
      // a.b.c => { object: a.b, property: c }
      else if (t.isMemberExpression(obj)) {
        objectPath.visit();
      }
    },
  };

  try {
    traverse(expr, traverseOption);
  } catch (error) {
    console.log(`[debug warning] traverse content failed "${content}"`, error);
  }
  return result;
}

/**
 * ```vue
 * <view>
 *     text1 {{ text2 }} text3 {{ text4 }}
 *              ^^^^^             ^^^^^
 * </view>

 * ```
 * @param content
 * @returns
 */
export function parseMpxExpression(content = "") {
  const cachedExprResult = slotExpressionCache.get(content);

  if (cachedExprResult) {
    return cachedExprResult;
  }

  let offset = 0;

  const exprs: [string, number][] = [];

  while (content.indexOf("{{", offset) !== -1) {
    const start = content.indexOf("{{", offset);
    let end = content.indexOf("}}", offset);
    if (start === -1 || end === -1) {
      break;
    }

    // expect:
    // `{{{ auto: index }}}`
    //  ^^               ^^

    if (end !== -1) {
      let endOffset = end + 2;

      while (endOffset < content.length && content[endOffset] === "}") {
        endOffset++;
      }

      if (endOffset !== end + 2) {
        end = endOffset - 2;
      }
    }

    const expr = content.slice(start + 2, end);
    const startOffset = start + 2;

    exprs.push([expr, startOffset]);

    offset = end + 2;
  }

  const result = exprs.flatMap((item) => traverseExpression(...item));

  slotExpressionCache.set(content, result);

  return result;
}

function check(s1: string) {
  const result = parseMpxExpression(s1);

  const groups: Record<string, number[]> = {};

  result.forEach(([name, offset]) => {
    if (groups[name]) {
      groups[name].push(offset);
      groups[name].sort((a, b) => a - b);
    } else {
      groups[name] = [offset];
    }
  });

  console.log(groups);

  const prints = " ".repeat(s1.length).split("");
  for (const [name, offsets] of Object.entries(groups)) {
    offsets.forEach((offset) => {
      for (let i = offset; i < offset + name.length; i++) {
        prints[i] = "^";
      }
    });
  }
  console.log(s1);
  console.log(prints.join(""));
  console.log("");
}

// check(`{{obj.m1.m2.m3.m4}}`);
// check(`{{namespace + 'name' + 123 + obj.m1.m2 + obj[foo]['bar']}}`);
// check(`mt-60rpx flex justify-between {{ !isContainReserveEquity ? 'mt-118rpx' : '' }} {{ isContainReserveEquity + 12 }}`);
// check(`{{obj[foo]}}`);
// check(`{{obj[foo] + foo}}`);
// check(`{{obj[foo + 123 + 'bar' + 'foo' + google + arr[namespace]]}}`);
// check(`{{obj[n1 + obj[n2 + obj[n3]]]}}`);
// check(`{{popupData[popupData]['bar']}}`);
