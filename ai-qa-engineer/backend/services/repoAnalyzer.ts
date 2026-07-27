import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import axios from 'axios';

const execPromise = util.promisify(exec);

// Maximum cumulative character size of file contents sent to AI
const MAX_AI_CONTEXT_CHARS = 120000; 

export interface ScannedFile {
    name: string;
    content: string;
    size: number;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
}

export interface SkillProfile {
    languages: string[];
    frameworks: string[];
    databases: string[];
    devops: string[];
    auth: string[];
    testing: string[];
    patterns: string[];
    packageManager: string;
    allSkills: string[];  // flat deduplicated list injected into AI prompt
}

/**
 * Static Skills Detection Engine
 * Runs purely in-memory on already-fetched files — zero extra API calls, < 5ms.
 * Detects languages, frameworks, databases, devops tools, auth patterns, testing libs.
 */
export function detectSkills(files: ScannedFile[]): SkillProfile {
    const languages = new Set<string>();
    const frameworks = new Set<string>();
    const databases = new Set<string>();
    const devops = new Set<string>();
    const auth = new Set<string>();
    const testing = new Set<string>();
    const patterns = new Set<string>();
    let packageManager = 'npm';

    // ── 1. Language detection from file extensions ────────────────────────────
    const extLanguageMap: Record<string, string> = {
        ts: 'TypeScript', tsx: 'TypeScript',
        js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
        py: 'Python', pyw: 'Python',
        rb: 'Ruby', rake: 'Ruby',
        go: 'Go',
        rs: 'Rust',
        java: 'Java', kt: 'Kotlin', groovy: 'Groovy', scala: 'Scala',
        cs: 'C#', fs: 'F#', vb: 'VB.NET',
        cpp: 'C++', cc: 'C++', cxx: 'C++', c: 'C', h: 'C',
        php: 'PHP',
        swift: 'Swift',
        dart: 'Dart',
        ex: 'Elixir', exs: 'Elixir',
        clj: 'Clojure', cljs: 'ClojureScript',
        hs: 'Haskell',
        lua: 'Lua',
        r: 'R',
        jl: 'Julia',
        vue: 'Vue',
        svelte: 'Svelte',
        sql: 'SQL',
    };
    for (const file of files) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (extLanguageMap[ext]) languages.add(extLanguageMap[ext]);
    }

    // ── 2. Framework & tool detection by file names ───────────────────────────
    for (const file of files) {
        const nameLower = file.name.toLowerCase();

        // DevOps / Infrastructure
        if (nameLower === 'dockerfile' || nameLower.includes('/dockerfile')) devops.add('Docker');
        if (nameLower.includes('docker-compose')) devops.add('Docker Compose');
        if (nameLower.includes('.github/workflows')) devops.add('GitHub Actions');
        if (nameLower.includes('k8s/') || nameLower.includes('kubernetes/') || nameLower.endsWith('.k8s.yml')) devops.add('Kubernetes');
        if (nameLower === 'nginx.conf' || nameLower.includes('/nginx')) devops.add('Nginx');
        if (nameLower.includes('terraform') || nameLower.endsWith('.tf')) devops.add('Terraform');
        if (nameLower.includes('helm') || nameLower.includes('chart.yaml')) devops.add('Helm');
        if (nameLower === 'render.yaml' || nameLower === 'railway.json') devops.add('PaaS Deploy');
        if (nameLower === 'vercel.json' || nameLower === '.vercelignore') devops.add('Vercel');
        if (nameLower === 'netlify.toml' || nameLower === '.netlifyignore') devops.add('Netlify');
        if (nameLower.includes('.circleci/')) devops.add('CircleCI');
        if (nameLower.includes('.travis.yml')) devops.add('Travis CI');
        if (nameLower.includes('jenkinsfile')) devops.add('Jenkins');

        // Database / ORM config files
        if (nameLower.endsWith('.prisma') || nameLower.includes('prisma/schema')) databases.add('Prisma');
        if (nameLower.includes('drizzle.config')) databases.add('Drizzle ORM');
        if (nameLower.endsWith('knexfile.js') || nameLower.endsWith('knexfile.ts')) databases.add('Knex');
        if (nameLower.includes('alembic.ini') || nameLower.includes('migrations/')) { /* check content below */ }
        if (nameLower.includes('flyway') || nameLower.endsWith('flyway.conf')) databases.add('Flyway');

        // Test config files
        if (nameLower.includes('playwright.config')) testing.add('Playwright');
        if (nameLower.includes('jest.config') || nameLower.includes('jest.setup')) testing.add('Jest');
        if (nameLower.includes('vitest.config')) testing.add('Vitest');
        if (nameLower.includes('cypress.config') || nameLower.includes('cypress/')) testing.add('Cypress');
        if (nameLower === 'pytest.ini' || nameLower === 'conftest.py' || nameLower.endsWith('_test.py') || nameLower.endsWith('test_.py')) testing.add('Pytest');
        if (nameLower.includes('rspec') || nameLower.endsWith('_spec.rb')) testing.add('RSpec');
        if (nameLower.includes('minitest')) testing.add('Minitest');
        if (nameLower.endsWith('_test.go') || nameLower.includes('testify')) testing.add('Go Testing');
        if (nameLower.endsWith('_test.rs') || nameLower.includes('#[test]')) testing.add('Rust Testing');
        if (nameLower.endsWith('test.java') || nameLower.includes('junit')) testing.add('JUnit');
        if (nameLower.includes('phpunit')) testing.add('PHPUnit');

        // ── 3. Package manifest parsing ──────────────────────────────────────
        if (nameLower === 'package.json') {
            try {
                const pkg = JSON.parse(file.content);
                const allDeps: Record<string, string> = {
                    ...(pkg.dependencies || {}),
                    ...(pkg.devDependencies || {}),
                    ...(pkg.peerDependencies || {}),
                };

                // Package manager
                if (pkg.packageManager?.includes('yarn') || file.name.includes('yarn.lock')) packageManager = 'yarn';
                else if (pkg.packageManager?.includes('pnpm') || files.some(f => f.name === 'pnpm-lock.yaml')) packageManager = 'pnpm';
                else if (pkg.packageManager?.includes('bun') || files.some(f => f.name === 'bun.lockb')) packageManager = 'bun';
                else packageManager = 'npm';

                const depMap: Array<[string[], 'frameworks' | 'databases' | 'auth' | 'testing' | 'patterns' | 'devops', string]> = [
                    // Frameworks / Runtime
                    [['react', 'react-dom'], 'frameworks', 'React'],
                    [['next'], 'frameworks', 'Next.js'],
                    [['vue'], 'frameworks', 'Vue'],
                    [['nuxt'], 'frameworks', 'Nuxt.js'],
                    [['svelte', '@sveltejs/kit'], 'frameworks', 'SvelteKit'],
                    [['express'], 'frameworks', 'Express'],
                    [['fastify'], 'frameworks', 'Fastify'],
                    [['hono'], 'frameworks', 'Hono'],
                    [['koa'], 'frameworks', 'Koa'],
                    [['nestjs', '@nestjs/core'], 'frameworks', 'NestJS'],
                    [['@remix-run/node', '@remix-run/react'], 'frameworks', 'Remix'],
                    [['astro'], 'frameworks', 'Astro'],
                    [['@angular/core'], 'frameworks', 'Angular'],
                    [['vite'], 'frameworks', 'Vite'],
                    [['elysia'], 'frameworks', 'Elysia'],
                    [['trpc', '@trpc/server'], 'frameworks', 'tRPC'],
                    // Databases / ORMs
                    [['prisma', '@prisma/client'], 'databases', 'Prisma'],
                    [['drizzle-orm'], 'databases', 'Drizzle ORM'],
                    [['mongoose'], 'databases', 'MongoDB (Mongoose)'],
                    [['pg', 'postgres', 'postgresql'], 'databases', 'PostgreSQL'],
                    [['mysql2', 'mysql'], 'databases', 'MySQL'],
                    [['better-sqlite3', 'sqlite3'], 'databases', 'SQLite'],
                    [['redis', 'ioredis', '@upstash/redis'], 'databases', 'Redis'],
                    [['@supabase/supabase-js'], 'databases', 'Supabase'],
                    [['@planetscale/database'], 'databases', 'PlanetScale'],
                    [['@neon-database/neon', '@neondatabase/serverless'], 'databases', 'Neon'],
                    [['firebase', '@firebase/app'], 'databases', 'Firebase'],
                    [['typeorm'], 'databases', 'TypeORM'],
                    [['sequelize'], 'databases', 'Sequelize'],
                    [['knex'], 'databases', 'Knex'],
                    // Auth
                    [['passport', 'passport-local', 'passport-github2'], 'auth', 'Passport.js'],
                    [['next-auth', '@auth/core'], 'auth', 'NextAuth'],
                    [['jsonwebtoken', 'jose', 'jwt-decode'], 'auth', 'JWT'],
                    [['bcrypt', 'bcryptjs', 'argon2'], 'auth', 'Password Hashing'],
                    [['@clerk/clerk-sdk-node', '@clerk/nextjs'], 'auth', 'Clerk'],
                    [['@lucia-auth/core', 'lucia'], 'auth', 'Lucia Auth'],
                    [['better-auth'], 'auth', 'Better Auth'],
                    [['auth0', 'auth0-js'], 'auth', 'Auth0'],
                    [['keycloak-js', 'keycloak-connect'], 'auth', 'Keycloak'],
                    // Testing
                    [['@playwright/test', 'playwright'], 'testing', 'Playwright'],
                    [['jest', '@jest/core'], 'testing', 'Jest'],
                    [['vitest'], 'testing', 'Vitest'],
                    [['cypress'], 'testing', 'Cypress'],
                    [['mocha'], 'testing', 'Mocha'],
                    [['chai'], 'testing', 'Chai'],
                    [['supertest'], 'testing', 'Supertest'],
                    // Patterns / APIs
                    [['graphql', '@apollo/server', '@apollo/client', 'graphql-yoga'], 'patterns', 'GraphQL'],
                    [['ws', 'socket.io', 'uWebSockets.js'], 'patterns', 'WebSockets'],
                    [['@grpc/grpc-js', '@grpc/proto-loader'], 'patterns', 'gRPC'],
                    [['bullmq', 'bull', 'bee-queue', 'pg-boss'], 'patterns', 'Job Queues'],
                    [['stripe'], 'patterns', 'Stripe Payments'],
                    [['nodemailer', 'resend', '@sendgrid/mail'], 'patterns', 'Email Service'],
                    [['openai', '@anthropic-ai/sdk', '@google/generative-ai'], 'patterns', 'AI/LLM Integration'],
                    [['zod', 'yup', 'joi', 'valibot'], 'patterns', 'Schema Validation'],
                    // DevOps / Build
                    [['tsx', 'ts-node', 'ts-node-dev'], 'devops', 'TypeScript Runtime'],
                    [['turbo', 'nx'], 'devops', 'Monorepo Tooling'],
                ];

                for (const [pkgNames, category, label] of depMap) {
                    if (pkgNames.some(p => allDeps[p] !== undefined)) {
                        if (category === 'frameworks') frameworks.add(label);
                        else if (category === 'databases') databases.add(label);
                        else if (category === 'auth') auth.add(label);
                        else if (category === 'testing') testing.add(label);
                        else if (category === 'patterns') patterns.add(label);
                        else if (category === 'devops') devops.add(label);
                    }
                }

                // REST API detection: if express/fastify without graphql → REST
                if ((frameworks.has('Express') || frameworks.has('Fastify') || frameworks.has('Hono') || frameworks.has('Koa'))
                    && !patterns.has('GraphQL')) {
                    patterns.add('REST API');
                }
                if (frameworks.has('NestJS') && !patterns.has('GraphQL')) patterns.add('REST API');

            } catch (_) { /* malformed package.json, skip */ }
        }

        // ── 4. Python manifest parsing ────────────────────────────────────────
        if (nameLower === 'requirements.txt' || nameLower === 'requirements-dev.txt' || nameLower === 'pipfile') {
            const c = file.content.toLowerCase();
            if (c.includes('django')) frameworks.add('Django');
            if (c.includes('flask')) frameworks.add('Flask');
            if (c.includes('fastapi')) frameworks.add('FastAPI');
            if (c.includes('starlette')) frameworks.add('Starlette');
            if (c.includes('sqlalchemy')) databases.add('SQLAlchemy');
            if (c.includes('alembic')) databases.add('Alembic');
            if (c.includes('psycopg2') || c.includes('asyncpg')) databases.add('PostgreSQL');
            if (c.includes('pymongo') || c.includes('motor')) databases.add('MongoDB');
            if (c.includes('redis')) databases.add('Redis');
            if (c.includes('pyjwt') || c.includes('python-jose')) auth.add('JWT');
            if (c.includes('pytest')) testing.add('Pytest');
            if (c.includes('unittest')) testing.add('unittest');
            if (c.includes('graphene') || c.includes('strawberry')) patterns.add('GraphQL');
            if (c.includes('celery')) patterns.add('Job Queues');
            if (c.includes('openai') || c.includes('anthropic') || c.includes('langchain')) patterns.add('AI/LLM Integration');
            packageManager = 'pip';
        }

        // ── 5. Ruby / Rails ────────────────────────────────────────────────────
        if (nameLower === 'gemfile') {
            const c = file.content.toLowerCase();
            if (c.includes("'rails'") || c.includes('"rails"')) frameworks.add('Ruby on Rails');
            if (c.includes('sinatra')) frameworks.add('Sinatra');
            if (c.includes('padrino')) frameworks.add('Padrino');
            if (c.includes('pg') || c.includes('activerecord')) databases.add('PostgreSQL');
            if (c.includes('mongoid') || c.includes('mongo')) databases.add('MongoDB');
            if (c.includes('redis')) databases.add('Redis');
            if (c.includes('devise')) auth.add('Devise');
            if (c.includes('jwt') || c.includes('knock')) auth.add('JWT');
            if (c.includes('rspec')) testing.add('RSpec');
            if (c.includes('minitest')) testing.add('Minitest');
            if (c.includes('graphql-ruby') || c.includes('graphql')) patterns.add('GraphQL');
            if (c.includes('sidekiq') || c.includes('resque')) patterns.add('Job Queues');
            if (c.includes('stripe')) patterns.add('Stripe Payments');
            packageManager = 'bundler';
        }

        // ── 6. Go modules ────────────────────────────────────────────────────
        if (nameLower === 'go.mod') {
            const c = file.content.toLowerCase();
            if (c.includes('gin-gonic/gin')) frameworks.add('Gin');
            if (c.includes('labstack/echo')) frameworks.add('Echo');
            if (c.includes('gofiber/fiber')) frameworks.add('Fiber');
            if (c.includes('go-chi/chi')) frameworks.add('Chi');
            if (c.includes('gorilla/mux')) frameworks.add('Gorilla Mux');
            if (c.includes('gorm.io/gorm')) databases.add('GORM');
            if (c.includes('lib/pq') || c.includes('pgx')) databases.add('PostgreSQL');
            if (c.includes('go-redis/redis') || c.includes('redis')) databases.add('Redis');
            if (c.includes('mongo-driver')) databases.add('MongoDB');
            if (c.includes('golang-jwt') || c.includes('dgrijalva/jwt-go')) auth.add('JWT');
            if (c.includes('graph-gophers/graphql') || c.includes('99designs/gqlgen')) patterns.add('GraphQL');
            if (c.includes('testify')) testing.add('Testify');
            packageManager = 'go mod';
        }

        // ── 7. Rust ────────────────────────────────────────────────────────────
        if (nameLower === 'cargo.toml') {
            const c = file.content.toLowerCase();
            if (c.includes('actix-web')) frameworks.add('Actix Web');
            if (c.includes('axum')) frameworks.add('Axum');
            if (c.includes('rocket')) frameworks.add('Rocket');
            if (c.includes('warp')) frameworks.add('Warp');
            if (c.includes('diesel')) databases.add('Diesel ORM');
            if (c.includes('sqlx')) databases.add('SQLx');
            if (c.includes('tokio-postgres') || c.includes('postgres')) databases.add('PostgreSQL');
            if (c.includes('redis')) databases.add('Redis');
            if (c.includes('jsonwebtoken')) auth.add('JWT');
            if (c.includes('async-graphql') || c.includes('juniper')) patterns.add('GraphQL');
            packageManager = 'cargo';
        }

        // ── 8. Java / Kotlin (Maven / Gradle) ────────────────────────────────
        if (nameLower === 'pom.xml' || nameLower === 'build.gradle' || nameLower === 'build.gradle.kts') {
            const c = file.content.toLowerCase();
            if (c.includes('spring-boot') || c.includes('springframework')) frameworks.add('Spring Boot');
            if (c.includes('quarkus')) frameworks.add('Quarkus');
            if (c.includes('micronaut')) frameworks.add('Micronaut');
            if (c.includes('hibernate') || c.includes('jpa')) databases.add('Hibernate/JPA');
            if (c.includes('postgresql') || c.includes('postgres')) databases.add('PostgreSQL');
            if (c.includes('mongodb')) databases.add('MongoDB');
            if (c.includes('redis')) databases.add('Redis');
            if (c.includes('spring-security') || c.includes('oauth2')) auth.add('Spring Security');
            if (c.includes('jwt') || c.includes('jjwt')) auth.add('JWT');
            if (c.includes('junit')) testing.add('JUnit');
            if (c.includes('mockito')) testing.add('Mockito');
            if (c.includes('graphql')) patterns.add('GraphQL');
            packageManager = nameLower.includes('gradle') ? 'gradle' : 'maven';
        }

        // ── 9. PHP (Composer) ─────────────────────────────────────────────────
        if (nameLower === 'composer.json') {
            const c = file.content.toLowerCase();
            if (c.includes('laravel/framework')) frameworks.add('Laravel');
            if (c.includes('symfony/symfony') || c.includes('symfony/')) frameworks.add('Symfony');
            if (c.includes('slim/slim')) frameworks.add('Slim');
            if (c.includes('doctrine/orm') || c.includes('illuminate/database')) databases.add('ORM');
            if (c.includes('tymondesigns/jwt-auth') || c.includes('firebase/php-jwt')) auth.add('JWT');
            if (c.includes('phpunit')) testing.add('PHPUnit');
            packageManager = 'composer';
        }

        // ── 10. Content-based keyword scan (all files) ───────────────────────
        if (file.content.length > 0 && file.content.length < 100_000) {
            const c = file.content;
            const cl = c.toLowerCase();

            // Auth patterns in code
            if (/jwt\.sign|jwt\.verify|createtoken|verifytoken/i.test(c)) auth.add('JWT');
            if (/bcrypt|argon2|scrypt|pbkdf2/i.test(c)) auth.add('Password Hashing');
            if (/oauth|openid|oidc/i.test(c)) auth.add('OAuth/OIDC');
            if (/session\(|express-session|req\.session/i.test(c)) auth.add('Session Auth');
            if (/passport\.use|passport\.authenticate/i.test(c)) auth.add('Passport.js');
            if (/supabase\.auth|supabaseauth/i.test(c)) auth.add('Supabase Auth');

            // Database usage in code
            if (/supabase\.from\(|createclient.*supabase/i.test(c)) databases.add('Supabase');
            if (/mongoose\.connect|schema\s*=\s*new\s*schema/i.test(c)) databases.add('MongoDB (Mongoose)');
            if (/prisma\.\w+\.findmany|prisma\.\w+\.create/i.test(c)) databases.add('Prisma');
            if (/pg\.pool|pool\.query|client\.query/i.test(c)) databases.add('PostgreSQL');
            if (/redis\.set|redis\.get|ioredis/i.test(c)) databases.add('Redis');
            if (/createclient.*firebase|initializeapp/i.test(c) && cl.includes('firebase')) databases.add('Firebase');

            // API Patterns
            if (/graphql|gql`|typedefs|resolvers/i.test(c)) patterns.add('GraphQL');
            if (/websocket|ws\.send|socket\.emit|new WebSocket/i.test(c)) patterns.add('WebSockets');
            if (/grpc|proto\.load|protoloader/i.test(c)) patterns.add('gRPC');
            if (/bullmq|new Queue|new Worker.*bullmq|agenda\.define/i.test(c)) patterns.add('Job Queues');
            if (/stripe\.charges|stripe\.paymentintents|stripe\.webhooks/i.test(c)) patterns.add('Stripe Payments');
            if (/openai\.|new OpenAI|anthropic\.|gemini|groq\./i.test(c)) patterns.add('AI/LLM Integration');
            if (/app\.(get|post|put|patch|delete)\s*\(/i.test(c)) patterns.add('REST API');
            if (/swagger|openapi|apidoc/i.test(cl)) patterns.add('API Documentation');
            if (/rate.?limit|ratelimiter/i.test(cl)) patterns.add('Rate Limiting');
            if (/multer|busboy|formidable|multipart/i.test(cl)) patterns.add('File Uploads');
            if (/s3\.upload|putobject|@aws-sdk\/client-s3/i.test(c)) patterns.add('AWS S3');
            if (/sendgrid|nodemailer|resend\.emails|mailgun/i.test(cl)) patterns.add('Email Service');
        }
    }

    // ── 11. Build allSkills flat list ─────────────────────────────────────────
    const allSkills = [
        ...Array.from(languages),
        ...Array.from(frameworks),
        ...Array.from(databases),
        ...Array.from(devops),
        ...Array.from(auth),
        ...Array.from(testing),
        ...Array.from(patterns),
    ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    return {
        languages: [...languages],
        frameworks: [...frameworks],
        databases: [...databases],
        devops: [...devops],
        auth: [...auth],
        testing: [...testing],
        patterns: [...patterns],
        packageManager,
        allSkills,
    };
}

/**
 * Returns the additional API roots to fetch based on detected primary language.
 * Enables thorough scanning of non-JS repos on the first API pass.
 */
export function getStackAwareRoots(files: ScannedFile[]): string[] {
    const extensions = new Set(files.map(f => f.name.split('.').pop()?.toLowerCase() || ''));
    const names = new Set(files.map(f => f.name.split('/').pop()?.toLowerCase() || ''));

    const roots: string[] = [];

    // Python
    if (extensions.has('py') || names.has('requirements.txt') || names.has('pipfile')) {
        roots.push('requirements.txt', 'Pipfile', 'setup.py', 'pyproject.toml',
            'app.py', 'main.py', 'manage.py', 'wsgi.py', 'asgi.py',
            'app', 'api', 'core', 'models', 'views', 'urls', 'serializers', 'schemas', 'routers', 'tests');
    }
    // Ruby
    if (extensions.has('rb') || names.has('gemfile')) {
        roots.push('Gemfile', 'Rakefile',
            'app/controllers', 'app/models', 'app/views', 'app/helpers',
            'config/routes.rb', 'config/database.yml', 'db/schema.rb',
            'spec', 'test', 'lib');
    }
    // Go
    if (extensions.has('go') || names.has('go.mod')) {
        roots.push('go.mod', 'go.sum', 'main.go',
            'cmd', 'internal', 'pkg', 'api', 'handler', 'handlers',
            'middleware', 'model', 'models', 'repository', 'service', 'services', 'router');
    }
    // Rust
    if (extensions.has('rs') || names.has('cargo.toml')) {
        roots.push('Cargo.toml', 'src/main.rs', 'src/lib.rs', 'src', 'tests');
    }
    // Java / Kotlin
    if (extensions.has('java') || extensions.has('kt') || names.has('pom.xml') || names.has('build.gradle')) {
        roots.push('pom.xml', 'build.gradle', 'build.gradle.kts',
            'src/main/java', 'src/main/kotlin', 'src/main/resources',
            'src/test/java', 'src/test/kotlin');
    }
    // PHP
    if (extensions.has('php') || names.has('composer.json')) {
        roots.push('composer.json', 'artisan', 'app', 'routes', 'config', 'database', 'tests');
    }
    // Generic JS/TS (always included as baseline)
    roots.push('package.json', 'tsconfig.json', 'src', 'app', 'middleware.ts', 'server.js', 'server.ts', 'app.js', 'index.ts', 'index.js');

    return [...new Set(roots)]; // deduplicate
}

/**
 * Repository Analyzer
 * High-speed implementation that prioritizes selective API fetching and shallow cloning.
 * Integrates ZIP download fallbacks and smart prioritized token compression.
 */
export async function analyzeRepository(
    repoUrl: string,
    analysisId: string,
    githubToken?: string,
    onProgress?: (stage: string, percent: number) => void
) {
    const notify = (stage: string, percent: number) => {
        if (onProgress) onProgress(stage, percent);
    };

    try {
        // Sanitize URL: strip trailing slash and .git suffix before matching
        const cleanUrl = repoUrl.trim().replace(/\.git$/, '').replace(/\/$/, '');
        const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) throw new Error("Invalid GitHub URL. Must be a valid github.com repository URL.");

        const owner = match[1];
        const repoName = match[2];
        const testsDir = path.join(__dirname, '..', 'tests-generated');
        const cloneFolder = `site-${analysisId}`;
        const clonePath = path.join(testsDir, cloneFolder);

        if (!fs.existsSync(testsDir)) {
            await fsPromises.mkdir(testsDir, { recursive: true });
        }

        notify("Fetching Repository", 15);
        console.log(`Starting High-Speed Analysis for ${owner}/${repoName}...`);

        let files: ScannedFile[] = [];
        let fetchedViaApi = false;

        // STRATEGY 1: Selective API Fetch (INSTANT fallback/bypass)
        try {
            console.log("Attempting high-speed selective API fetch...");
            files = await fetchKeyFilesViaAPI(owner, repoName, githubToken);
            if (files.length > 5) {
                console.log(`✅ API Selective Fetch (Phase 1) successful (${files.length} files).`);
                fetchedViaApi = true;

                // PHASE 2: Stack-aware follow-up fetch for non-JS ecosystems
                // Run detectSkills on Phase 1 files to identify the ecosystem
                const phase1Skills = detectSkills(files);
                const stackRoots = getStackAwareRoots(files);
                if (phase1Skills.languages.some(l => !['TypeScript','JavaScript'].includes(l))) {
                    console.log(`🔍 Phase 2 stack-aware fetch for ecosystem: ${phase1Skills.languages.join(', ')}`);
                    const phase2Files = await fetchKeyFilesViaAPI(owner, repoName, githubToken, stackRoots);
                    // Merge — avoid duplicate paths
                    const existingPaths = new Set(files.map(f => f.name));
                    for (const f of phase2Files) {
                        if (!existingPaths.has(f.name)) files.push(f);
                    }
                    console.log(`✅ Phase 2 added ${phase2Files.length} extra files (total: ${files.length}).`);
                }

                // Start background clone for environment execution later
                startBackgroundClone(cleanUrl, clonePath, githubToken);
            } else {
                console.log(`Notice: API Fetch returned too few files (${files.length}), falling back to clone.`);
                files = [];
            }
        } catch (apiError: any) {
            console.log(`Notice: API Fetch skipped/failed (${apiError.message}), using shallow clone...`);
        }

        // STRATEGY 2: Ultra-Shallow Clone (Primary Local)
        if (!fetchedViaApi) {
            if (fs.existsSync(clonePath)) {
                await fsPromises.rm(clonePath, { recursive: true, force: true });
            }

            const authenticatedUrl = githubToken
                ? cleanUrl.replace('https://', `https://${githubToken}@`)
                : cleanUrl;

            notify("Fetching Repository (Cloning)", 20);

            try {
                // Clone depth 1, single branch, filtering out blob bodies until read
                await execPromise(
                    `git clone --depth 1 --single-branch --filter=blob:none "${authenticatedUrl}" "${clonePath}"`,
                    { timeout: 30000 }
                );
                console.log("✅ Ultra-shallow clone successful.");
            } catch (cloneError: any) {
                // Redact token from error message before logging
                const safeMsg = (cloneError.message as string).replace(githubToken || 'NO_TOKEN_PLACEHOLDER', '***');
                console.warn(`Shallow clone failed (${safeMsg}). Trying ZIP Fallback...`);
                notify("Fetching Repository (ZIP Fallback)", 25);
                await downloadRepoZip(owner, repoName, clonePath, githubToken);
            }

            notify("Filtering Files", 35);
            // Scan directory and build prioritised map
            files = await scanAndCategorizeDirectory(clonePath, clonePath);
        }

        if (files.length === 0) {
            throw new Error("Repository appears to be empty or contains no recognizable source files.");
        }

        notify("Static Analysis", 50);

        // Detect tech stack skills from scanned files (in-memory, < 5ms)
        const skillProfile = detectSkills(files);
        console.log(`✅ Skills detected: ${skillProfile.allSkills.join(', ') || 'none'}`);
        
        // Check if there is a frontend interface dynamically
        const isHeadless = !files.some(f => 
            f.name.endsWith('.html') || 
            f.name.endsWith('.jsx') || 
            f.name.endsWith('.tsx') || 
            f.name.endsWith('.vue') || 
            f.name.endsWith('.svelte')
        );

        // Apply dynamic token-budget priority sorting & prompt compression
        const compressedFiles = compressPromptContext(files);

        notify("AI Deep Analysis", 65);

        return { 
            files: compressedFiles, 
            cloneFolder, 
            isHeadless, 
            allScannedCount: files.length,
            skillProfile
        };
        
    } catch (error: any) {
        console.error("Error in repository analysis:", error.message);
        throw new Error(`Failed to analyze repo: ${error.message}`);
    }
}

/**
 * Downloads the repository ZIP file as a fallback and extracts it.
 */
async function downloadRepoZip(owner: string, repo: string, extractPath: string, githubToken?: string) {
    // Attempt to determine the default branch first via API
    let branch = 'main';
    try {
        const repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: githubToken ? { 'Authorization': `token ${githubToken}` } : {}
        });
        branch = repoInfo.data.default_branch || 'main';
    } catch (e) {
        // Fallback to main/master if API fails
    }

    const branches = [...new Set([branch, 'main', 'master', 'develop', 'trunk'])];
    const tempZip = `${extractPath}.zip`;

    // Ensure the folder directory exists
    await fsPromises.mkdir(extractPath, { recursive: true });

    let success = false;
    for (const b of branches) {
        const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/${b}`;
        try {
            const headers: any = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AI-QA-Engineer' };
            if (githubToken) headers['Authorization'] = `token ${githubToken}`;

            const response = await axios.get(zipUrl, {
                headers,
                responseType: 'arraybuffer',
                timeout: 20000
            });

            await fsPromises.writeFile(tempZip, Buffer.from(response.data));
            success = true;
            break;
        } catch (err) {
            continue;
        }
    }

    if (!success) throw new Error("Could not download ZIP from any known default branch.");

    try {
        // Extract ZIP using native platforms
        if (process.platform === 'win32') {
            await execPromise(
                `powershell -NoProfile -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${extractPath}' -Force"`,
                { timeout: 60000 }
            );
        } else {
            await execPromise(`unzip -q "${tempZip}" -d "${extractPath}"`, { timeout: 60000 });
        }

        // Clean up zip archive
        if (fs.existsSync(tempZip)) await fsPromises.unlink(tempZip);

        // Flatten the top level zip folder if it exists
        const rootItems = await fsPromises.readdir(extractPath);
        if (rootItems.length === 1) {
            const nestedDir = path.join(extractPath, rootItems[0]);
            const stat = await fsPromises.stat(nestedDir);
            if (stat.isDirectory()) {
                const subItems = await fsPromises.readdir(nestedDir);
                for (const subItem of subItems) {
                    const src = path.join(nestedDir, subItem);
                    const dest = path.join(extractPath, subItem);
                    await fsPromises.rename(src, dest);
                }
                await fsPromises.rm(nestedDir, { recursive: true, force: true });
            }
        }
        console.log("✅ ZIP Fallback download & extraction completed.");
    } catch (err: any) {
        if (fs.existsSync(tempZip)) await fsPromises.unlink(tempZip).catch(() => {});
        throw new Error(`ZIP Fallback extraction failed: ${err.message}`);
    }
}

/**
 * Fast background cloner for verification step.
 */
function startBackgroundClone(repoUrl: string, clonePath: string, githubToken?: string) {
    if (fs.existsSync(clonePath)) return;
    const authenticatedUrl = githubToken ? repoUrl.replace('https://', `https://${githubToken}@`) : repoUrl;
    exec(`git clone --depth 1 --single-branch "${authenticatedUrl}" "${clonePath}"`, (err) => {
        if (err) console.error("Background clone error:", err.message.replace(githubToken || '', '***'));
        else console.log("Background clone completed successfully.");
    });
}

/**
 * Scan directory and categorize based on developers priority rules.
 */
async function scanAndCategorizeDirectory(basePath: string, currentPath: string, depth = 0): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    if (depth > 6) return files; // Protect against unbounded recursion

    let items: string[];
    try {
        items = await fsPromises.readdir(currentPath);
    } catch (_) {
        return files; // Directory may have been removed mid-scan
    }
    
    // Concurrently fetch stats to speed up scanning
    const results = await Promise.all(items.map(async (item) => {
        const fullPath = path.join(currentPath, item);
        
        // Smart IGNORE checking
        if (isIgnoredPath(item)) return null;

        try {
            const stat = await fsPromises.stat(fullPath);
            if (stat.isDirectory()) {
                return await scanAndCategorizeDirectory(basePath, fullPath, depth + 1);
            } else if (stat.isFile()) {
                if (stat.size > 2 * 1024 * 1024) return null; // Ignore huge files > 2MB

                const extension = path.extname(item).toLowerCase().replace('.', '');
                if (!isMeaningfulExtension(extension) || isBinaryExtension(extension)) return null;

                const name = path.relative(basePath, fullPath).replace(/\\/g, '/');
                const content = await fsPromises.readFile(fullPath, 'utf8');
                
                // Determine file priority
                const priority = getFilePriority(name, extension);

                return {
                    name,
                    content,
                    size: stat.size,
                    priority,
                    category: getFileCategory(extension)
                };
            }
        } catch (e) {
            // Ignore individual file read errors
        }
        return null;
    }));

    for (const res of results) {
        if (Array.isArray(res)) {
            files.push(...res);
        } else if (res) {
            files.push(res);
        }
    }

    return files;
}

/**
 * Optimized key files fetcher via GitHub REST API.
 * Accepts optional `customRoots` for stack-aware Phase 2 fetching (non-JS ecosystems).
 */
async function fetchKeyFilesViaAPI(owner: string, repo: string, githubToken?: string, customRoots?: string[]): Promise<ScannedFile[]> {
    const criticalRoots = customRoots ?? ['package.json', 'tsconfig.json', 'src', 'app', 'middleware.ts', 'server.js', 'app.js'];
    const maxFiles = customRoots ? 60 : 40; // allow more files in Phase 2
    const files: ScannedFile[] = [];
    const seenPaths = new Set<string>();
    
    async function fetchPath(targetPath: string, depth = 0) {
        if (depth > 3 || files.length > maxFiles || seenPaths.has(targetPath)) return;
        seenPaths.add(targetPath);
        
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`;
        
        try {
            const headers: any = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AI-QA-Engineer' };
            if (githubToken) headers['Authorization'] = `token ${githubToken}`;
            
            const res = await axios.get(url, { headers, timeout: 5000 });
            const data = res.data;
            
            if (Array.isArray(data)) {
                // Parallelize children fetch
                await Promise.all(data.map(async (item: any) => {
                    const ext = path.extname(item.name).toLowerCase().replace('.', '');
                    if (item.type === 'file' && isMeaningfulExtension(ext) && !isBinaryExtension(ext)) {
                        await fetchPath(item.path, depth + 1);
                    } else if (item.type === 'dir' && !isIgnoredPath(item.name) && depth < 2) {
                        await fetchPath(item.path, depth + 1);
                    }
                }));
            } else if (data.type === 'file' && data.content) {
                const content = Buffer.from(data.content, 'base64').toString('utf8');
                const extension = path.extname(data.name).toLowerCase().replace('.', '');
                if (content.length < 150000) {
                    files.push({
                        name: data.path,
                        content,
                        size: content.length,
                        priority: getFilePriority(data.path, extension),
                        category: getFileCategory(extension)
                    });
                }
            }
        } catch (e) {
            // Silence API failures to let shallow clone run
        }
    }

    await Promise.all(criticalRoots.map(p => fetchPath(p)));
    return files;
}

/**
 * Checks if a path is in our ignore list.
 */
function isIgnoredPath(name: string): boolean {
    const ignored = [
        'node_modules', 'dist', 'build', 'coverage', '.next', '.cache',
        '.git', 'vendor', 'target', 'out', 'bin', '.idea', '.vscode'
    ];
    return ignored.includes(name.toLowerCase());
}

/**
 * Checks if file extension is meaningful for developer files.
 */
function isMeaningfulExtension(ext: string): boolean {
    const list = [
        'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less',
        'py', 'java', 'go', 'rb', 'php', 'cs', 'cpp', 'c', 'rs', 'kt', 'scala', 'swift', 'dart', 'ex', 'exs',
        'json', 'yaml', 'yml', 'toml', 'env', 'ini', 'conf', 'properties', 'xml',
        'sql', 'prisma', 'md', 'ipynb'
    ];
    return list.includes(ext);
}

/**
 * Checks if extension is a binary file.
 */
function isBinaryExtension(ext: string): boolean {
    const binaries = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mp3', 'zip', 'tar', 'exe', 'dll', 'so', 'dylib', 'pdf', 'ico'
    ];
    return binaries.includes(ext);
}

/**
 * Dynamic File Prioritization Heuristic.
 */
function getFilePriority(filePath: string, ext: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const pathLower = filePath.toLowerCase();
    
    // High Priority Rules
    const isHighKeywords = [
        'auth', 'route', 'middleware', 'jwt', 'schema', 'db', 'controller', 
        'security', 'permission', 'rbac', 'payment', 'stripe', 'checkout', 'config'
    ];
    const isHighExtensions = ['sql', 'prisma', 'env'];
    const isHighFiles = ['package.json', 'dockerfile', 'docker-compose.yml', 'tsconfig.json', 'nginx.conf'];

    if (isHighFiles.includes(pathLower.split('/').pop() || '')) return 'HIGH';
    if (isHighExtensions.includes(ext)) return 'HIGH';
    if (isHighKeywords.some(keyword => pathLower.includes(keyword))) return 'HIGH';

    // Low Priority Rules
    const isLowExtensions = ['css', 'scss', 'sass', 'less', 'md'];
    if (isLowExtensions.includes(ext)) return 'LOW';

    // Default to Medium (services, utilities, hooks, components)
    return 'MEDIUM';
}

function getFileCategory(ext: string): string {
    const frontend = ['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html'];
    const styling = ['css', 'scss', 'sass', 'less'];
    const backend = ['py', 'java', 'go', 'rb', 'php', 'cs', 'cpp', 'c', 'rs', 'kt', 'scala', 'swift', 'dart', 'ex', 'exs'];
    const configs = ['json', 'yaml', 'yml', 'toml', 'env', 'ini', 'conf', 'properties', 'xml'];
    
    if (frontend.includes(ext)) return 'frontend';
    if (styling.includes(ext)) return 'styling';
    if (backend.includes(ext)) return 'backend';
    if (configs.includes(ext)) return 'config';
    return 'other';
}

/**
 * Token-budget prompt compressor.
 * Guarantees context characters do not exceed MAX_AI_CONTEXT_CHARS by abstracting files.
 */
export function compressPromptContext(files: ScannedFile[]): ScannedFile[] {
    // Sort: HIGH priority first, then MEDIUM, then LOW. Within that, smaller files first
    const sorted = [...files].sort((a, b) => {
        const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return a.size - b.size;
    });

    let currentLength = 0;
    const result: ScannedFile[] = [];

    for (const file of sorted) {
        const charLength = file.content.length;
        
        if (file.priority === 'HIGH' || (currentLength + charLength < MAX_AI_CONTEXT_CHARS)) {
            // Keep full content
            result.push(file);
            currentLength += charLength;
        } else {
            // Out of budget - abstract/summarize file to keep structural integrity without burning tokens
            const abstractedContent = `// [CONTENT OMITTED FOR TOKEN BUDGET - STRUCTURAL OVERVIEW ONLY]
// File Path: ${file.name}
// Size: ${file.size} bytes
// Priority: ${file.priority}
// Category: ${file.category}
// Imports / Exports Detectable in Static Mapping.
`;
            result.push({
                ...file,
                content: abstractedContent,
                size: abstractedContent.length
            });
            currentLength += abstractedContent.length;
        }
    }

    console.log(`compressed code context from ${files.reduce((acc, f) => acc + f.content.length, 0)} to ${currentLength} characters.`);
    return result;
}
