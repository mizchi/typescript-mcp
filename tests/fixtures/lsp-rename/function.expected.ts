function bar(x: number): number {
  return x * 2;
}

const value = bar(5);
console.log(bar(10));

export { bar as foo };
