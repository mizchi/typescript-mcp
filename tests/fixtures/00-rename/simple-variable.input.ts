const foo = 1; // @rename foo bar
console.log(foo);
const result = foo + 2;
export { foo };
