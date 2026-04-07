/**
 * Game Analytics Dashboard - Server
 *
 * Lightweight Express server with session-based auth.
 * Route handlers are split into focused modules under ./routes/.
 *
 * Users are stored in server/users.json (bcrypt hashed).
 * Manage users with: node server/manage-users.cjs add <username>
 */

require('dotenv').config();
const express = require('express');
const compression = require('compression');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { loadUsers } = require('./helpers.cjs');

const authRoutes = require('./routes/auth.cjs');
const ticketRoutes = require('./routes/tickets.cjs');
const adminRoutes = require('./routes/admin.cjs');
const dataRoutes = require('./routes/data.cjs');
const aiRoutes = require('./routes/ai.cjs');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Behind IIS / reverse proxy — required for correct client IP in rate limiting and secure cookies
app.set('trust proxy', 1);

// --- Compression (gzip/brotli) ---
app.use(compression({ level: 6, threshold: 1024 }));

// --- Security ---
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
                workerSrc: ["'self'", 'blob:'],
                upgradeInsecureRequests: IS_PROD ? [] : null,
            },
        },
    })
);

// --- Body parsing ---
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// --- Session ---
if (IS_PROD && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET must be set in production. Exiting.');
    process.exit(1);
}
if (!process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET not set — sessions will not persist across restarts.');
}

app.use(
    session({
        store: new FileStore({
            path: path.join(__dirname, '.sessions'),
            ttl: 7 * 24 * 60 * 60,
            retries: 0,
            logFn: () => {},
        }),
        secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
        resave: false,
        saveUninitialized: false,
        name: 'gd.sid',
        cookie: {
            httpOnly: true,
            secure: IS_PROD,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        },
    })
);

// --- Request logging ---
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        if (req.path.startsWith('/api/')) {
            const ms = Date.now() - start;
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
        }
    });
    next();
});

// --- Rate limiting for write endpoints ---
const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/tickets', writeLimiter);
app.use('/api/admin', writeLimiter);
app.use('/api/generate-names', writeLimiter);
app.use('/api/trademark-check', writeLimiter);

// --- API routes ---
app.use(authRoutes);
app.use(ticketRoutes);
app.use(adminRoutes);
app.use(dataRoutes);
app.use(aiRoutes);

// --- Static files (auth-gated) ---
const PUBLIC_PATHS = [
    '/login.html',
    '/assets/',
    '/src/output.css',
    '/src/pages/login-page.js',
    '/src/assets/',
    '/robots.txt',
    '/health.json',
    '/sw.js',
];

function isPublicPath(url) {
    const pathname = url.split('?')[0];
    return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p));
}

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (isPublicPath(req.path)) return next();
    if (!req.session.user) return res.redirect('/login.html');
    next();
});

app.use(
    express.static(DIST_DIR, {
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
            } else if (filePath.includes('/assets/')) {
                // Vite content-hashed assets — safe to cache indefinitely
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
            }
        },
    })
);

// --- SPA fallback ---
app.get('/{*splat}', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(DIST_DIR, 'dashboard.html'));
});

// --- Error handler ---
app.use((err, req, res, _next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---
const server = app.listen(PORT, () => {
    const users = loadUsers();
    console.log('');
    console.log('  \x1b[1m\x1b[35m⚡ Game Analytics Dashboard\x1b[0m');
    console.log('');
    console.log(`  \x1b[2m➜\x1b[0m  Local:   \x1b[36mhttp://localhost:${PORT}/\x1b[0m`);
    console.log(`  \x1b[2m➜\x1b[0m  Users:   ${users.length} loaded`);
    console.log(`  \x1b[2m➜\x1b[0m  Serving: ${DIST_DIR}`);
    if (users.length === 0) {
        console.log('  \x1b[33m⚠  No users configured! Run: node server/manage-users.cjs add <username>\x1b[0m');
    }
    console.log('');
});

// --- Graceful shutdown ---
function shutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
    setTimeout(() => {
        console.error('Forced shutdown after timeout.');
        process.exit(1);
    }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', err => {
    console.error('[FATAL] Uncaught exception:', err);
    shutdown('uncaughtException');
});
process.on('unhandledRejection', reason => {
    console.error('[FATAL] Unhandled rejection:', reason);
    shutdown('unhandledRejection');
});
