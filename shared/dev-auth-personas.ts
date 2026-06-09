export type DevAuthPersona = 'viewer' | 'editor' | 'admin'

export interface DevAuthPersonaConfig {
  id: string
  email: string
  name: string
  role: DevAuthPersona
  image: string
}

export const DEV_AUTH_PERSONAS: Record<DevAuthPersona, DevAuthPersonaConfig> = {
  viewer: {
    id: 'dev-viewer',
    email: 'dev-viewer@localhost',
    name: 'Dev Viewer',
    role: 'viewer',
    image: 'https://ui-avatars.com/api/?name=Dev+Viewer&background=6b7280&color=fff'
  },
  editor: {
    id: 'dev-editor',
    email: 'dev-editor@localhost',
    name: 'Dev Editor',
    role: 'editor',
    image: 'https://ui-avatars.com/api/?name=Dev+Editor&background=3b82f6&color=fff'
  },
  admin: {
    id: 'dev-admin',
    email: 'dev-admin@localhost',
    name: 'Dev Admin',
    role: 'admin',
    image: 'https://ui-avatars.com/api/?name=Dev+Admin&background=ef4444&color=fff'
  }
}

export const DEV_AUTH_PERSONA_KEYS = Object.keys(DEV_AUTH_PERSONAS) as DevAuthPersona[]

export function isDevAuthPersona(value: string): value is DevAuthPersona {
  return value in DEV_AUTH_PERSONAS
}
