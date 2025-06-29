class Bar {
  private value: number;

  constructor(value: number) {
    this.value = value;
  }

  getValue(): number {
    return this.value;
  }
}

const instance = new Bar(42);
console.log(instance.getValue());

export { Bar as Foo };
