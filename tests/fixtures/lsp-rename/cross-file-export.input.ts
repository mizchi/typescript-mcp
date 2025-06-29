// Export a function that will be imported in another file
export function processData(data: string): string {
  return data.toUpperCase();
}

export class DataProcessor {
  process(data: string): string {
    return processData(data);
  }
}

export const DEFAULT_VALUE = "default";
