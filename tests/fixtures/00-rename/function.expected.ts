function bar(x: number): number { // @rename foo bar
  return x * 2;
}

const value = bar(5);
console.log(bar(10));

export { bar };
