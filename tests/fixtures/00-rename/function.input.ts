function foo(x: number): number { // @rename foo bar
  return x * 2;
}

const value = foo(5);
console.log(foo(10));

export { foo };
