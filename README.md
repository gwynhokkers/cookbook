# CookBook

A full-stack recipe management application built with Nuxt, NuxtHub, and Better Auth. Store and manage your recipes with image uploads, authentication, and a beautiful UI.

## Features

- 🍳 Recipe management with image uploads
- 🔐 Authentication via Better Auth (GitHub OAuth)
- 💾 PostgreSQL database with Drizzle ORM
- 📸 Image storage via NuxtHub Blob Storage
- 🎨 Beautiful UI with Nuxt UI
- 📝 Markdown support for recipe descriptions
- 🔍 Full-text search

## Prerequisites

- Node.js 18+ or Bun
- PostgreSQL database (or use PGlite for local development)
- GitHub account (for OAuth authentication)

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd cookbook
```

2. Install dependencies:

```bash
# Using npm
npm install

# Using pnpm
pnpm install

# Using yarn
yarn install

# Using bun
bun install
```

## Environment Setup

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

### Required Environment Variables

Edit `.env` and configure the following:

#### Better Auth Configuration

```env
# Generate a random secret for Better Auth (use a secure random string)
BETTER_AUTH_SECRET=your-random-secret-key-here-change-in-production

# Better Auth base URL (use your production domain in production)
BETTER_AUTH_URL=http://localhost:3000
```

#### GitHub OAuth

1. Create a GitHub OAuth App:
   - Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
   - Click "New OAuth App"
   - Set **Application name**: CookBook (or your preferred name)
   - Set **Homepage URL**: `http://localhost:3000` (or your production URL)
   - Set **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github` (or `https://yourdomain.com/api/auth/callback/github` for production)
   - Click "Register application"
   - Copy the **Client ID** and generate a **Client Secret**

2. Add to `.env`:

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

#### Database Configuration

For PostgreSQL, set one of these environment variables:

```env
# Option 1: Use DATABASE_URL
DATABASE_URL=postgresql://user:password@localhost:5432/cookbook

# Option 2: Use POSTGRES_URL
POSTGRES_URL=postgresql://user:password@localhost:5432/cookbook

# Option 3: Use POSTGRESQL_URL
POSTGRESQL_URL=postgresql://user:password@localhost:5432/cookbook
```

**Note:** If no database URL is set, NuxtHub will use PGlite (embedded PostgreSQL) for local development, which doesn't require a separate PostgreSQL server.

#### Migration Secret (Optional)

If you want to run the migration script to import existing recipes:

```env
MIGRATION_SECRET=migration-secret
```

## Database Setup

### Using PostgreSQL

1. **Install PostgreSQL** (if not already installed):
   - macOS: `brew install postgresql`
   - Linux: Use your distribution's package manager
   - Windows: Download from [postgresql.org](https://www.postgresql.org/download/)

2. **Create a database**:

```bash
createdb cookbook
# or using psql
psql -c "CREATE DATABASE cookbook;"
```

3. **Update your `.env`** with the connection string (see Database Configuration above)

### Using PGlite (Local Development)

If you don't set a `DATABASE_URL`, NuxtHub will automatically use PGlite for local development. No additional setup required!

## Generate Database Migrations

After setting up your environment, generate the database schema:

```bash
npx nuxt db generate
```

This creates migration files in `server/db/migrations/` which are automatically applied when you start the development server.

## Development

Start the development server:

```bash
# npm
npm run dev

# pnpm
pnpm run dev

# yarn
yarn dev

# bun
bun run dev
```

The application will be available at `http://localhost:3000`.

### First Run

1. The database migrations will run automatically on first start
2. Visit `http://localhost:3000`
3. Click "Sign In" to authenticate with GitHub
4. After authentication, you can create new recipes

## Migrating Existing Recipes

If you have existing recipes in the `content/recipes/` directory, you can migrate them to the database:

```bash
# Make a POST request to the migration endpoint
curl -X POST http://localhost:3000/api/migrate \
  -H "Authorization: Bearer migration-secret"
```

**Note:** Replace `migration-secret` with the value from your `.env` file (or the default if not set).

The migration script will:
- Parse all markdown files from `content/recipes/`
- Extract frontmatter and content
- Upload images to blob storage
- Insert recipes into the database

## Project Structure

```
cookbook/
├── app/                    # Nuxt app directory
│   ├── components/        # Vue components
│   ├── pages/             # Route pages
│   └── composables/       # Composables (useAuth, etc.)
├── server/                 # Server-side code
│   ├── api/               # API routes
│   ├── db/                # Database schema and migrations
│   ├── plugins/           # Nitro plugins
│   └── utils/             # Server utilities (auth, etc.)
├── content/               # NuxtContent files (for other content pages)
├── public/                # Static assets
└── nuxt.config.ts         # Nuxt configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run generate` - Generate static site
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npx nuxt db generate` - Generate database migrations

## Deployment

### Deploy to NuxtHub

1. Install NuxtHub CLI (if not already installed):

```bash
npm install -g @nuxthub/cli
```

2. Login to NuxtHub:

```bash
npx nuxthub login
```

3. Deploy:

```bash
npx nuxthub deploy
```

### Environment Variables in Production

Make sure to set all environment variables in your deployment platform:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SPOON_API_KEY`
- `DATABASE_URL` (your production PostgreSQL connection string)

Update your GitHub OAuth App callback URL to match your production domain.

## Technologies

- **Nuxt 4** - Vue.js framework
- **NuxtHub** - Backend services (database, blob storage, KV, cache)
- **Drizzle ORM** - Type-safe SQL ORM
- **PostgreSQL** - Database
- **Nuxt UI** - UI component library
- **Nuxt Content** - Content management (for other pages)

## License

MIT
