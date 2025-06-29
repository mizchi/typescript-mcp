// Test file for document symbols

interface User {
  id: number;
  name: string;
  email: string;
}

class UserService {
  private users: User[] = [];

  constructor() {
    console.log("UserService initialized");
  }

  addUser(user: User): void {
    this.users.push(user);
  }

  getUser(id: number): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  get userCount(): number {
    return this.users.length;
  }
}

function processUser(user: User): string {
  return `Processing ${user.name}`;
}

const defaultUser: User = {
  id: 0,
  name: "Default",
  email: "default@example.com",
};

export { defaultUser, processUser, UserService };
export type { User };
