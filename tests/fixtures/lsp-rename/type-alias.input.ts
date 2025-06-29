// Type alias definition
type UserData = {
  id: number;
  name: string;
  email: string;
};

// Use type in function parameters
function processUser(user: UserData): UserData {
  return {
    ...user,
    name: user.name.toUpperCase(),
  };
}

// Use type in variable declaration
const testUser: UserData = {
  id: 1,
  name: "John",
  email: "john@example.com",
};

// Use type in class
class UserService {
  private users: UserData[] = [];

  addUser(user: UserData): void {
    this.users.push(user);
  }

  getUser(id: number): UserData | undefined {
    return this.users.find((u) => u.id === id);
  }
}
