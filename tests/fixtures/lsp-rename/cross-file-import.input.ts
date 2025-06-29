import {
  DataProcessor,
  DEFAULT_VALUE,
  processData,
} from "./cross-file-export.input.ts";

const result = processData("hello");
console.log(result);

const processor = new DataProcessor();
const output = processor.process(DEFAULT_VALUE);
console.log(output);

// Use processData in another context
function wrapper(input: string): string {
  return processData(input);
}
