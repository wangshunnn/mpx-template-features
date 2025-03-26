import { URI } from "vscode-uri";
export { debounce } from "ts-debounce";
import type { MappingValue } from "./parse";

// eg: file:///Users/didi/mycode/test/hello.mpx -> /Users/didi/mycode/test/hello.mpx
export const uriToFileName = (uri: string) => URI.parse(uri).fsPath.replace(/\\/g, "/");

export function binarySearch(arr: MappingValue[], target: number): MappingValue | null {
  let left = 0,
    right = arr.length - 1;
  while (left <= right) {
    const mid = Math.floor((right - left) / 2) + left;
    if (target >= arr[mid].loc.start && target <= arr[mid].loc.end) {
      return arr[mid];
    } else if (arr[mid].loc.end < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return null;
}

export const noop = () => {};
export type ValueOf<T> = T[keyof T];

export function withResolvers<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

export async function findResult<T, R>(arr: T[], callback: (item: T) => Promise<R>): Promise<R | undefined> {
  for (const item of arr) {
    const result = await callback(item);
    if (result) return result;
  }
}