class Foo {
  private value: number;

  constructor(value: number) {
    this.value = value;
  }

  getValue(): number {
    return this.value;
  }
}

const instance = new Foo(42);
console.log(instance.getValue());

export { Foo };
