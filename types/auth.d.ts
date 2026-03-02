declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string
    image: string
    role: 'viewer' | 'editor' | 'admin'
  }
}

export {}
