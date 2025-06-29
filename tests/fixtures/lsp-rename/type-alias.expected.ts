// Type alias definition
type PersonData = {
  id: number;
  name: string;
  email: string;
};

// Use type in function parameters
function processUser(user: PersonData): PersonData {
  return {
    ...user,
    name: user.name.toUpperCase(),
  };
}

// Use type in variable declaration
const testUser: PersonData = {
  id: 1,
  name: "John",
  email: "john@example.com",
};

// Use type in class
class UserService {
  private users: PersonData[] = [];

  addUser(user: PersonData): void {
    this.users.push(user);
  }

  getUser(id: number): PersonData | undefined {
    return this.users.find((u) => u.id === id);
  }
}
