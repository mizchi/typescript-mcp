// Export a function that will be imported in another file
export function transformData(data: string): string {
  return data.toUpperCase();
}

export class DataProcessor {
  process(data: string): string {
    return transformData(data);
  }
}

export const DEFAULT_VALUE = "default";
