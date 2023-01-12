import { RangeChunk } from "../types"

export function chunk<T>(arr: T[], size: number): T[][] {
  return arr.reduce<T[][]>(
    (a, item) => {
      if (a[a.length - 1].length === size) {
        a.push([item]);
      } else {
        a[a.length - 1].push(item);
      }

      return a;
    },
    [[]]
  );
}

export function rangeChunk(size: number, chunkSize: number) {
  const rangeChunks: RangeChunk[] = []
  for (let i = 1; i < size + 1; i = i + chunkSize) {
    rangeChunks.push({
      start: i,
      end: Math.min(i+chunkSize, size)
    })
  }
  return rangeChunks
}
