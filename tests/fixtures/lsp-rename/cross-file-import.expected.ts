import {
  DataProcessor,
  DEFAULT_VALUE,
  transformData,
} from "./cross-file-export.input.ts";

const result = transformData("hello");
console.log(result);

const processor = new DataProcessor();
const output = processor.process(DEFAULT_VALUE);
console.log(output);

// Use transformData in another context
function wrapper(input: string): string {
  return transformData(input);
}
