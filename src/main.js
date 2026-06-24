const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { GitManager } = require('./git');
const { AdminDB } = require('./admin-db');
const { EmailSender } = require('./email-sender');

const gitManager = new GitManager();
const adminDB = new AdminDB(app.getPath('userData'));
const emailSender = new EmailSender(app.getPath('userData'));

// ========== DeepCode Gateway (hidden providers) ==========
const GATEWAY_URL = 'https://deepcode-gateway.vercel.app';
const GATEWAY_DEVICE_ID = 'deepcode-ide-v1';
// GATEWAY_SECRET is NOT used directly — see deriveUserSecret()

// ===== Per-user API Key (unique per account) =====
const API_KEY_PATH = path.join(app.getPath('userData'), 'api-key.json');
const USER_SECRET_PATH = path.join(app.getPath('userData'), 'user-secret.enc');
const SESSION_TOKEN_PATH = path.join(app.getPath('userData'), 'session-token.enc');

// ===== Hardware Fingerprint (for encryption key) =====
function getHardwareFingerprint() {
    const os = require('os');
    const cpus = os.cpus().map(c => c.model).join('');
    const mac = Object.values(os.networkInterfaces()).flat().find(n => n.mac && n.mac !== '00:00:00:00:00:00')?.mac || '';
    const hostname = os.hostname();
    return crypto.createHash('sha256').update(`${cpus}:${mac}:${hostname}`).digest('hex').substring(0, 32);
}

// ===== AES-256-GCM Encrypted Storage =====
function encryptData(data, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv: iv.toString('hex'), encrypted: encrypted.toString('hex'), tag: tag.toString('hex') };
}

function decryptData(encObj, key) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(encObj.iv, 'hex'));
        decipher.setAuthTag(Buffer.from(encObj.tag, 'hex'));
        const decrypted = Buffer.concat([decipher.update(Buffer.from(encObj.encrypted, 'hex')), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    } catch { return null; }
}

function loadEncrypted(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const key = getHardwareFingerprint();
            return decryptData(raw, key);
        }
    } catch {}
    return null;
}

function saveEncrypted(filePath, data) {
    try {
        const key = getHardwareFingerprint();
        const enc = encryptData(data, key);
        fs.writeFileSync(filePath, JSON.stringify(enc), 'utf-8');
    } catch {}
}

// ===== User Secret (per-user HMAC secret from gateway) =====
let currentUserSecret = null;

function loadUserSecret() {
    if (currentUserSecret) return currentUserSecret;
    const data = loadEncrypted(USER_SECRET_PATH);
    if (data?.userSecret) { currentUserSecret = data.userSecret; return data.userSecret; }
    return null;
}

function saveUserSecret(userSecret) {
    currentUserSecret = userSecret;
    saveEncrypted(USER_SECRET_PATH, { userSecret });
}

// ===== Session Token (from gateway, 1h TTL) =====
let currentSessionToken = null;
let sessionExpiresAt = 0;

function loadSessionToken() {
    if (currentSessionToken && Date.now() < sessionExpiresAt) return currentSessionToken;
    const data = loadEncrypted(SESSION_TOKEN_PATH);
    if (data?.token && Date.now() < data.expiresAt) {
        currentSessionToken = data.token;
        sessionExpiresAt = data.expiresAt;
        return data.token;
    }
    return null;
}

function saveSessionToken(token, expiresAt) {
    currentSessionToken = token;
    sessionExpiresAt = expiresAt;
    saveEncrypted(SESSION_TOKEN_PATH, { token, expiresAt });
}

function clearSessionToken() {
    currentSessionToken = null;
    sessionExpiresAt = 0;
    try { fs.unlinkSync(SESSION_TOKEN_PATH); } catch {}
}

// Check if session needs refresh (within 10 min of expiry)
function needsSessionRefresh() {
    return !currentSessionToken || Date.now() > sessionExpiresAt - 10 * 60 * 1000;
}

// Refresh session token by re-calling bind-device
async function refreshSessionToken() {
    if (!currentApiKey || !currentUserEmail) return false;
    try {
        const ip = await getClientIp();
        const binding = loadDeviceBinding();
        const res = await fetch(`${GATEWAY_URL}/bind-device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': currentApiKey },
            body: JSON.stringify({
                deviceId: GATEWAY_DEVICE_ID,
                email: currentUserEmail,
                provider: currentUserProvider || 'unknown',
                ip,
                bindingTimestamp: (binding.loginTime || Date.now()).toString(),
            }),
        });
        const data = await res.json();
        if (data.success && data.sessionToken && data.userSecret) {
            saveUserSecret(data.userSecret);
            saveSessionToken(data.sessionToken, data.sessionExpiresAt);
            // Also save binding signature for fallback
            const localBinding = loadDeviceBinding();
            localBinding.bindingSignature = data.bindingSignature;
            localBinding.bindingTimestamp = data.bindingTimestamp;
            saveDeviceBinding(localBinding);
            return true;
        }
    } catch {}
    return false;
}

function loadApiKey() {
    try {
        if (fs.existsSync(API_KEY_PATH)) {
            const data = JSON.parse(fs.readFileSync(API_KEY_PATH, 'utf-8'));
            if (data.apiKey && data.apiKey.startsWith('dc-')) return data;
        }
    } catch {}
    return null;
}

function saveApiKey(data) {
    try {
        fs.writeFileSync(API_KEY_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
}

// Generate API key via gateway
async function generateApiKey(email, tier = 'free', provider = 'unknown') {
    try {
        const res = await fetch(`${GATEWAY_URL}/api-keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Email': email,
                'X-User-Provider': provider,
            },
            body: JSON.stringify({ email, tier }),
        });
        const data = await res.json();
        if (data.success && data.apiKey) {
            saveApiKey({ apiKey: data.apiKey, email: data.email, tier: data.tier, createdAt: data.createdAt });
            return data.apiKey;
        }
    } catch (e) {
        console.error('[DeepCode] Failed to generate API key:', e.message);
    }
    return null;
}

// Get or create API key
async function getOrCreateApiKey(email, tier = 'free', provider = 'unknown') {
    const existing = loadApiKey();
    if (existing && (!email || existing.email === email)) {
        return existing.apiKey;
    }
    // Generate new key for this user
    return await generateApiKey(email || 'anonymous@deepcode.dev', tier, provider);
}

// Auto-generate API key on startup (anonymous free user)
async function initApiKey() {
    const existing = loadApiKey();
    if (existing) {
        currentApiKey = existing.apiKey;
        // Load encrypted secrets
        loadUserSecret();
        loadSessionToken();
        return existing.apiKey;
    }
    console.log('[DeepCode] Generating anonymous API key...');
    const key = await generateApiKey('anonymous@deepcode.dev', 'free');
    if (key) currentApiKey = key;
    return key;
}

// ===== Device Binding (1 device = 1 user) =====
const DEVICE_BINDING_PATH = path.join(app.getPath('userData'), 'device-binding.json');

function loadDeviceBinding() {
    try { if (fs.existsSync(DEVICE_BINDING_PATH)) return JSON.parse(fs.readFileSync(DEVICE_BINDING_PATH, 'utf-8')); } catch {}
    return { primaryEmail: null, provider: null, loginIp: null, loginTime: null, linkedAccounts: [] };
}

function saveDeviceBinding(data) {
    try { fs.writeFileSync(DEVICE_BINDING_PATH, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}

function bindDeviceLocally(email, provider, ip) {
    const binding = loadDeviceBinding();
    if (binding.primaryEmail === email) {
        // Same user, update login time and IP
        binding.loginTime = Date.now();
        binding.loginIp = ip;
        binding.provider = provider;
        saveDeviceBinding(binding);
        return { success: true, merged: false };
    }
    if (binding.primaryEmail && binding.primaryEmail !== email) {
        // Different user on same device → merge usage
        const alreadyLinked = binding.linkedAccounts.some(a => a.email === email);
        if (!alreadyLinked) {
            binding.linkedAccounts.push({ email, provider, addedAt: Date.now() });
        }
        binding.loginTime = Date.now();
        binding.loginIp = ip;
        saveDeviceBinding(binding);
        return { success: true, merged: true, primaryEmail: binding.primaryEmail };
    }
    // New device binding
    binding.primaryEmail = email;
    binding.provider = provider;
    binding.loginIp = ip;
    binding.loginTime = Date.now();
    saveDeviceBinding(binding);
    return { success: true, merged: false };
}

function getDeviceBindingLocal() {
    return loadDeviceBinding();
}

// ===== Get client IP for gateway =====
async function getClientIp() {
    try {
        const res = await fetch('https://api.ipify.org?format=json', { timeout: 3000 });
        const data = await res.json();
        return data.ip || 'unknown';
    } catch { return 'unknown'; }
}

// ===== Current user state (set after login) =====
let currentUserEmail = null;
let currentUserProvider = null;
let currentUserTier = 'free';

function setCurrentUser(email, provider, tier) {
    currentUserEmail = email;
    currentUserProvider = provider;
    currentUserTier = tier || 'free';
}

// ===== Canonical JSON: sorted keys at all levels for consistent signing =====
function canonicalJson(obj) {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'string') return JSON.stringify(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
    const keys = Object.keys(obj).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

async function gatewaySign(body) {
    const timestamp = Date.now().toString();
    const canonical = typeof body === 'string' ? body : canonicalJson(body);
    const message = `${timestamp}:${GATEWAY_DEVICE_ID}:${canonical}`;
    // Sign with per-user secret (NOT gateway secret)
    const userSecret = loadUserSecret();
    if (!userSecret) throw new Error('No user secret - please login first');
    const hmac = crypto.createHmac('sha256', userSecret).update(message).digest('hex');
    return { timestamp, signature: hmac, canonicalBody: canonical };
}

function getBindingSignature() {
    const binding = loadDeviceBinding();
    if (!binding.primaryEmail) return {};
    const headers = {
        'X-Binding-Timestamp': (binding.bindingTimestamp || binding.loginTime || Date.now()).toString(),
        'X-Login-IP': binding.loginIp || '',
    };
    // Use stored binding signature from gateway (NOT locally generated)
    if (binding.bindingSignature) headers['X-Binding-Signature'] = binding.bindingSignature;
    // Add session token if available
    const sessionToken = loadSessionToken();
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    return headers;
}

// ===== Current API key (cached in memory) =====
let currentApiKey = null;

async function gatewayHeaders(timestamp, signature) {
    if (!currentApiKey) {
        const data = loadApiKey();
        currentApiKey = data?.apiKey || '';
    }
    // Auto-refresh session if needed
    if (needsSessionRefresh() && currentUserEmail) {
        await refreshSessionToken();
    }
    return {
        'Content-Type': 'application/json',
        'X-Api-Key': currentApiKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'X-Device-ID': GATEWAY_DEVICE_ID,
        'X-Platform': process.platform,
        'X-Version': app.getVersion() || '1.0.0',
        ...getBindingSignature(),
    };
}

// ========== SECURITY: API keys stored ONLY in main process ==========
const ATXP_ACCOUNTS = [
    { token: 'yag0uXh7o5dsHU9kv60Zb', accountId: 'atxp_acct_eOpU5dPuk8Sigxs0c3ST3' },
    { token: '9nG86jG8LD2oI8Ok9Kx2h', accountId: 'atxp_acct_ybPGs4TCk2JAmH9rAURMU' },
    { token: 'YcoJiP29r0VLJrJYe2ABG', accountId: 'atxp_acct_4nVQc6VSDMhO0N9rpBbFY' },
    { token: '0dxF36u0wAMuXeaJGbo2p', accountId: 'atxp_acct_UqrAKQGjB9KfspQH8mPHh' },
];

const ATXP_BASE_URL = 'https://llm.atxp.ai';

// Cloudflare Workers AI (deepcode-ultra)
const CF_API_TOKEN = 'cfut_UPqrvn9y5npADCJpvOsOCC59VAnm8twauqXwr6Qp9ef474c6';
let CF_ACCOUNT_ID = '837012b91630c2e9a2d2f03ce8ab64e6';
const CF_MODEL = '@cf/zai-org/glm-5.2';

// ZenMux API (DeepCode Pro + Review mode)
const ZENMUX_API_KEY = 'sk-ai-v1-26dc2ea3a9df9856deac28938d811130f10626eb22fd1edee8cf4bd9fa33742f';
const ZENMUX_BASE_URL = 'https://zenmux.ai/api/v1';
const ZENMUX_PRO_MODEL = 'z-ai/glm-4.7-flash-free';
const ZENMUX_PRO_FALLBACK = 'z-ai/glm-5.2-free';
const ZENMUX_REVIEW_MODEL = 'stepfun/step-3.7-flash-free';

const CF_CONFIG_PATH = path.join(app.getPath('userData'), 'cloudflare-config.json');
function loadCfConfig() {
    try { if (fs.existsSync(CF_CONFIG_PATH)) return JSON.parse(fs.readFileSync(CF_CONFIG_PATH, 'utf-8')); } catch {}
    return { accountId: '' };
}
function saveCfConfig(cfg) { fs.writeFileSync(CF_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8'); }
function getCfAccountId() {
    if (CF_ACCOUNT_ID) return CF_ACCOUNT_ID;
    const cfg = loadCfConfig();
    CF_ACCOUNT_ID = cfg.accountId || '';
    return CF_ACCOUNT_ID;
}

// ========== SECURITY: Device Fingerprint ==========
const os = require('os');
const FINGERPRINT_PATH = path.join(app.getPath('userData'), 'device-fingerprint.json');

function generateDeviceFingerprint() {
    const data = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalmem: os.totalmem(),
        username: os.userInfo().username,
        appVersion: app.getVersion(),
        created: Date.now(),
    };
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
    return { id: hash, data };
}

function getDeviceFingerprint() {
    try {
        if (fs.existsSync(FINGERPRINT_PATH)) {
            return JSON.parse(fs.readFileSync(FINGERPRINT_PATH, 'utf-8'));
        }
    } catch {}
    const fp = generateDeviceFingerprint();
    fs.writeFileSync(FINGERPRINT_PATH, JSON.stringify(fp, null, 2), 'utf-8');
    return fp;
}

// ========== SECURITY: Request Signing ==========
const REQUEST_SIGNING_KEY = crypto.randomBytes(32).toString('hex');

function signRequest(payload) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const message = `${timestamp}:${nonce}:${JSON.stringify(payload)}`;
    const signature = crypto.createHmac('sha256', REQUEST_SIGNING_KEY).update(message).digest('hex');
    return { timestamp, nonce, signature };
}

function verifyRequestSign(timestamp, nonce, signature, payload) {
    const age = Date.now() - parseInt(timestamp);
    if (isNaN(age) || age < 0 || age > 300000) return false;
    const message = `${timestamp}:${nonce}:${JSON.stringify(payload)}`;
    const expected = crypto.createHmac('sha256', REQUEST_SIGNING_KEY).update(message).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

const deviceFingerprint = getDeviceFingerprint();

// ========== SECURITY: Advanced Rate Limiter ==========
const rateLimiter = new Map();
const banList = new Set();
const violations = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_MAX_PREMIUM = 60;
const RATE_LIMIT_MAX_BUSINESS = 120;
const BAN_THRESHOLD = 5;
const BAN_DURATION_MS = 300000;
const CLEANUP_INTERVAL_MS = 120000;

const TIER_RATE_LIMITS = {
    free: RATE_LIMIT_MAX,
    pro: 40,
    premium: RATE_LIMIT_MAX_PREMIUM,
    business: RATE_LIMIT_MAX_BUSINESS,
    ultra: 120,
};

function getRateLimitForTier(tier) {
    return TIER_RATE_LIMITS[tier] || RATE_LIMIT_MAX;
}

function isBanned(identifier) {
    if (banList.has(identifier)) return true;
    const banEntry = violations.get(identifier);
    if (banEntry && banEntry.bannedUntil && Date.now() < banEntry.bannedUntil) {
        banList.add(identifier);
        return true;
    }
    if (banEntry && banEntry.bannedUntil && Date.now() >= banEntry.bannedUntil) {
        violations.delete(identifier);
        banList.delete(identifier);
    }
    return false;
}

function checkRateLimit(windowId, tier) {
    if (isBanned(windowId)) return false;

    const now = Date.now();
    const maxRequests = getRateLimitForTier(tier);
    const entry = rateLimiter.get(windowId);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimiter.set(windowId, {
            windowStart: now,
            count: 1,
            timestamps: [now],
        });
        return true;
    }

    entry.count++;
    entry.timestamps.push(now);

    entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    entry.count = entry.timestamps.length;

    if (entry.count > maxRequests) {
        const v = violations.get(windowId) || { count: 0 };
        v.count++;
        if (v.count >= BAN_THRESHOLD) {
            v.bannedUntil = Date.now() + BAN_DURATION_MS;
            banList.add(windowId);
            console.warn(`[SECURITY] Banned ${windowId} for ${BAN_DURATION_MS / 1000}s (${v.count} violations)`);
        }
        violations.set(windowId, v);
        return false;
    }

    return true;
}

setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of rateLimiter) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimiter.delete(id);
        }
    }
    for (const [id, v] of violations) {
        if (v.bannedUntil && now >= v.bannedUntil) {
            violations.delete(id);
            banList.delete(id);
        }
    }
}, CLEANUP_INTERVAL_MS);

// ========== SECURITY: Tier store (persisted to disk) ==========
const TIER_STORE_PATH = path.join(app.getPath('userData'), 'deepcode-tier.json');
const TIER_CONFIG = {
    free:    { creditsPerDay: 0,    creditsPerMonth: 0,    maxContext: 4096  },
    pro:     { creditsPerDay: 10,   creditsPerMonth: 300,  maxContext: 32000 },
    premium: { creditsPerDay: 1000, creditsPerMonth: 1000, maxContext: 64000 },
    ultra:   { creditsPerDay: 2000, creditsPerMonth: 2000, maxContext: 128000 },
    business:{ creditsPerDay: 3000, creditsPerMonth: 3000, maxContext: 128000 },
};

function loadTierStore() {
    try {
        if (fs.existsSync(TIER_STORE_PATH)) {
            return JSON.parse(fs.readFileSync(TIER_STORE_PATH, 'utf-8'));
        }
    } catch {}
    return { tier: 'free', creditsUsed: 0, lastReset: Date.now() };
}

function saveTierStore(data) {
    try {
        fs.writeFileSync(TIER_STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch {}
}

function getTierData() {
    const store = loadTierStore();
    const now = Date.now();
    const dayMs = 86400000;
    if (now - store.lastReset > dayMs) {
        store.creditsUsed = 0;
        store.lastReset = now;
        saveTierStore(store);
    }
    const cfg = TIER_CONFIG[store.tier] || TIER_CONFIG.free;
    return {
        tier: store.tier,
        creditsPerDay: cfg.creditsPerDay,
        creditsPerMonth: cfg.creditsPerMonth,
        creditsUsed: store.creditsUsed,
        contextLimits: { maxContext: cfg.maxContext },
    };
}

function incrementCredits() {
    const store = loadTierStore();
    store.creditsUsed = (store.creditsUsed || 0) + 1;
    saveTierStore(store);
}

// ========== SECURITY: Path validation for fs IPC ==========
function isPathSafe(filePath, workspaceRoot) {
    if (!filePath || typeof filePath !== 'string') return false;
    const normalized = path.normalize(filePath);
    if (workspaceRoot) {
        return normalized.startsWith(path.normalize(workspaceRoot));
    }
    // Block sensitive system directories
    const blocked = [
        'C:\\Windows\\System32', 'C:\\Windows\\SysWOW64',
        process.env.USERPROFILE + '\\.ssh',
        process.env.USERPROFILE + '\\.aws',
        process.env.USERPROFILE + '\\.gnupg',
    ];
    for (const b of blocked) {
        if (normalized.toLowerCase().startsWith(b.toLowerCase())) return false;
    }
    return true;
}

// Register custom protocol for OAuth callback
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('deepcode', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('deepcode');
}

let mainWindow;

function handleProtocolUrl(url) {
    if (url && url.startsWith('deepcode://auth')) {
        try {
            const urlObj = new URL(url);
            const token = urlObj.searchParams.get('token');
            const userStr = urlObj.searchParams.get('user');
            if (token && mainWindow) {
                mainWindow.webContents.send('github-auth', {
                    token,
                    user: userStr ? JSON.parse(decodeURIComponent(userStr)) : null,
                });
                mainWindow.focus();
            }
        } catch (e) {
            console.error('Protocol URL parse error:', e);
        }
    }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        const url = commandLine.find(arg => arg.startsWith('deepcode://'));
        if (url) handleProtocolUrl(url);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

if (process.platform === 'win32') {
    const protocolUrl = process.argv.find(arg => arg.startsWith('deepcode://'));
    if (protocolUrl) {
        app.whenReady().then(() => handleProtocolUrl(protocolUrl));
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0d0b14',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // ========== SECURITY: CSP Headers ==========
    const { session } = require('electron');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://api.github.com https://github.com https://llm.atxp.ai https://zenmux.ai https://openrouter.ai https://api.cloudflare.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com https://deepcode-gateway.vercel.app; font-src 'self' data: https://fonts.googleapis.com https://fonts.gstatic.com;"
                ],
                'X-Content-Type-Options': ['nosniff'],
                'X-Frame-Options': ['DENY'],
                'X-XSS-Protection': ['1; mode=block'],
                'Referrer-Policy': ['strict-origin-when-cross-origin'],
            },
        });
    });

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ========== Admin Panel Window ==========
let adminWindow;
let adminSessionToken = null;
let adminLoginAttempts = 0;
let adminLockedUntil = 0;
const ADMIN_MAX_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 300000;

function generateSessionToken() {
    const adminTokenFile = path.join(app.getPath('userData'), 'admin-session.json');
    try {
        const existing = JSON.parse(fs.readFileSync(adminTokenFile, 'utf8'));
        if (existing.token && existing.created > Date.now() - 24 * 60 * 60 * 1000) {
            return existing.token;
        }
    } catch (e) {}
    const token = crypto.randomBytes(16).toString('hex').toUpperCase();
    try {
        fs.writeFileSync(adminTokenFile, JSON.stringify({ token, created: Date.now() }));
    } catch (e) {}
    return token;
}

function verifyAdminToken(token) {
    if (adminLockedUntil > Date.now()) {
        const remaining = Math.ceil((adminLockedUntil - Date.now()) / 1000);
        return { success: false, error: `Tài khoản bị khóa ${remaining}s nữa do nhập sai quá nhiều lần.` };
    }
    if (!adminSessionToken) return { success: false, error: 'Session chưa sẵn sàng' };
    const provided = Buffer.from(token || '', 'utf8');
    const expected = Buffer.from(adminSessionToken, 'utf8');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        adminLoginAttempts++;
        if (adminLoginAttempts >= ADMIN_MAX_ATTEMPTS) {
            adminLockedUntil = Date.now() + ADMIN_LOCKOUT_MS;
            adminLoginAttempts = 0;
            console.warn('[SECURITY] Admin locked out for 5 minutes due to too many failed attempts');
        }
        return { success: false, error: 'Mã session không đúng' };
    }
    adminLoginAttempts = 0;
    return { success: true };
}

app.whenReady().then(async () => {
    adminSessionToken = generateSessionToken();
    console.log('\n========================================');
    console.log('  DeepCode Admin Panel');
    console.log('  Mã session: ' + adminSessionToken);
    console.log('========================================\n');

    // Gửi mã qua email nếu đã cấu hình
    const emailConfig = emailSender.getConfig();
    if (emailConfig.configured) {
        const result = await emailSender.sendSessionCode(adminSessionToken);
        if (result.success) {
            console.log('  Mã đã gửi đến email: ' + emailConfig.adminEmail);
        } else {
            console.log('  Không gửi được email: ' + result.error);
        }
        console.log('========================================\n');
    }
});

// Verify session token
ipcMain.handle('admin:verify', (event, token) => {
    return verifyAdminToken(token);
});

// Open admin panel
ipcMain.handle('admin:open', (event, token) => {
    if (adminWindow) { adminWindow.focus(); return { success: true }; }
    adminWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'DeepCode Admin Panel',
        backgroundColor: '#0d0b14',
        webPreferences: {
            preload: path.join(__dirname, 'admin-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    adminWindow.loadFile(path.join(__dirname, 'admin.html'));
    adminWindow.on('closed', () => { adminWindow = null; });
    return { success: true };
});

// Regenerate session token
ipcMain.handle('admin:refresh-token', async () => {
    adminSessionToken = generateSessionToken();
    console.log('\n========================================');
    console.log('  Mã session mới: ' + adminSessionToken);
    console.log('========================================\n');

    const emailConfig = emailSender.getConfig();
    if (emailConfig.configured) {
        const result = await emailSender.sendSessionCode(adminSessionToken);
        if (result.success) {
            console.log('  Mã đã gửi đến email: ' + emailConfig.adminEmail);
        }
        console.log('========================================\n');
    }
    return { success: true };
});

// Email config
ipcMain.handle('admin:email-config', () => emailSender.getConfig());
ipcMain.handle('admin:email-setup', async (event, user, appPassword, adminEmail) => {
    return await emailSender.setup(user, appPassword, adminEmail);
});

app.whenReady().then(async () => {
    // Auto-generate API key on startup
    await initApiKey();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
});

// App controls
ipcMain.on('app:minimize', () => mainWindow?.minimize());
ipcMain.on('app:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.on('app:close', () => mainWindow?.close());
ipcMain.on('open-external', (event, url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            shell.openExternal(url);
        }
    } catch {}
});

// ========== FS operations (with path validation) ==========
ipcMain.handle('fs:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('fs:read-directory', async (event, dirPath) => {
    try {
        if (!isPathSafe(dirPath)) return [];
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return items
            .filter((item) => !item.name.startsWith('.'))
            .map((item) => ({
                name: item.name,
                path: path.join(dirPath, item.name),
                isDirectory: item.isDirectory(),
            }))
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return b.isDirectory - a.isDirectory;
                return a.name.localeCompare(b.name);
            });
    } catch {
        return [];
    }
});

ipcMain.handle('fs:read-file', async (event, filePath) => {
    try {
        if (!isPathSafe(filePath)) return null;
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
});

ipcMain.handle('fs:write-file', async (event, filePath, content) => {
    try {
        if (!isPathSafe(filePath)) return false;
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('fs:delete-file', async (event, filePath) => {
    try {
        if (!isPathSafe(filePath)) return false;
        fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('fs:rename', async (event, oldPath, newName) => {
    try {
        if (!isPathSafe(oldPath)) return null;
        const dir = path.dirname(oldPath);
        const newPath = path.join(dir, newName);
        fs.renameSync(oldPath, newPath);
        return newPath;
    } catch {
        return null;
    }
});

ipcMain.handle('fs:mkdir', async (event, dirPath) => {
    try {
        if (!isPathSafe(dirPath)) return false;
        fs.mkdirSync(dirPath, { recursive: true });
        return true;
    } catch {
        return false;
    }
});

// ========== SECURITY: Tier management (server-side enforced) ==========
ipcMain.handle('tier:get', async () => {
    return getTierData();
});

ipcMain.handle('tier:set', async (event, newTier) => {
    const validTiers = ['free', 'pro', 'premium', 'business'];
    if (!validTiers.includes(newTier)) return getTierData();
    const store = loadTierStore();
    store.tier = newTier;
    store.creditsUsed = 0;
    saveTierStore(store);
    return getTierData();
});

// ========== SECURITY: ATXP proxy (keys never leave main process) ==========
ipcMain.handle('atxp:chat', async (event, { model, messages, stream }) => {
    const wid = mainWindow?.id;
    const tierData = getTierData();
    if (wid && !checkRateLimit(wid, tierData.tier)) {
        throw new Error('Rate limit exceeded. Vui lòng thử lại sau.');
    }

    if (tierData.tier === 'free') {
        throw new Error('Tài khoản Free không thể sử dụng DeepCode Server 2. Vui lòng nâng cấp PRO.');
    }
    if (tierData.creditsPerDay > 0 && tierData.creditsUsed >= tierData.creditsPerDay) {
        throw new Error(`Hết ${tierData.creditsPerDay} lượt hôm nay. Nâng cấp Premium để có nhiều hơn.`);
    }

    const apiModel = model && model.includes('/') ? model.split('/').pop() : (model || 'gpt-4.1');
    const body = { model: apiModel, messages, stream: !!stream };

    let lastError;
    for (let i = 0; i < ATXP_ACCOUNTS.length; i++) {
        const acct = ATXP_ACCOUNTS[i];
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${acct.token}`,
            'x-account-id': acct.accountId,
        };

        try {
            const res = await fetch(`${ATXP_BASE_URL}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (res.ok) {
                incrementCredits();
                if (stream) {
                    const contentType = res.headers.get('content-type') || '';
                    if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
                        const data = await res.json();
                        return { _nonStreaming: true, content: data.choices?.[0]?.message?.content || JSON.stringify(data) };
                    }
                    const buffer = await res.arrayBuffer();
                    return Array.from(new Uint8Array(buffer));
                }
                const data = await res.json();
                return { content: data.choices?.[0]?.message?.content || '' };
            }

            lastError = await res.json().catch(() => ({}));
            if (res.status !== 401 && res.status !== 403) break;
        } catch (e) {
            lastError = { message: e.message };
            break;
        }
    }

    const errDetail = lastError?.error?.[0]?.message || lastError?.message || JSON.stringify(lastError);
    throw new Error(errDetail);
});

ipcMain.handle('atxp:models', async () => {
    for (let i = 0; i < ATXP_ACCOUNTS.length; i++) {
        const acct = ATXP_ACCOUNTS[i];
        try {
            const res = await fetch(`${ATXP_BASE_URL}/v1/models`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${acct.token}`,
                    'x-account-id': acct.accountId,
                },
            });
            if (res.ok) {
                const data = await res.json();
                const nonChatPatterns = /image|embed|tts|whisper|dall-e|stable-diffusion|midjourney|audio|speech|moderation|ranker|classifier|tokenizer|vision|ocr|video|music|suno|fal-|luma|kling|runway|pika|ideogram|recraft|baseten|assembly|inworld|fable|proxy|rerank|grounding|search|web|realtime|batch|fine-?tune|ft-/i;
                return (data.data || [])
                    .filter(m => !nonChatPatterns.test(m.id))
                    .map(m => ({ id: m.id, name: m.id }));
            }
        } catch {}
    }
    return [];
});

// ========== DeepCode Go → Gateway v1 ==========
ipcMain.handle('deepcode-go:chat', async (event, { model, messages, stream }) => {
    const wid = mainWindow?.id;
    const tierData = getTierData();
    if (wid && !checkRateLimit(wid, tierData.tier)) {
        throw new Error('Rate limit exceeded. Vui lòng thử lại sau.');
    }

    const bodyObj = { model: model || 'auto', messages, stream: !!stream };
    const { timestamp, signature, canonicalBody } = await gatewaySign(bodyObj);
    const hdrs = await gatewayHeaders(timestamp, signature);

    console.log('[DeepCode Go] Request:', {
        apiKey: (hdrs['X-Api-Key'] || '').substring(0, 15) + '...',
        timestamp,
        signature: signature.substring(0, 10) + '...',
        deviceId: hdrs['X-Device-ID'],
        bodyLen: canonicalBody.length,
    });

    try {
        const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: hdrs,
            body: canonicalBody,
        });

        if (res.ok) {
            const contentType = res.headers.get('content-type') || '';

            if (stream && contentType.includes('text/event-stream')) {
                const webContents = mainWindow?.webContents;
                if (!webContents) throw new Error('No window');

                const reader = res.body.getReader();
                const decoder = new TextDecoder();

                (async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                webContents.send('deepcode-go:stream-chunk', { done: true });
                                break;
                            }
                            const chunk = decoder.decode(value, { stream: true });
                            webContents.send('deepcode-go:stream-chunk', { data: chunk });
                        }
                    } catch (e) {
                        webContents.send('deepcode-go:stream-chunk', { error: e.message });
                    }
                })();

                return { _streaming: true };
            }

            const data = await res.json();
            return { content: data.choices?.[0]?.message?.content || '' };
        }

        const errData = await res.json().catch(() => ({}));
        const errMsg = typeof errData.error === 'string' ? errData.error : (errData.error?.message || JSON.stringify(errData));
        console.error('[DeepCode Go] Gateway error:', res.status, errMsg, 'Full:', JSON.stringify(errData).substring(0, 200));
        throw new Error(errMsg || `Gateway error: ${res.status}`);
    } catch (e) {
        throw new Error('DeepCode Go error: ' + e.message);
    }
});

ipcMain.handle('deepcode-go:models', async () => {
    try {
        const res = await fetch(`${GATEWAY_URL}/v1/models`, {
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': currentApiKey || '',
            },
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data) {
                return data.data.map(m => ({ id: m.id, name: m.id }));
            }
        }
    } catch (e) {
        // Gateway not available
    }
    return [{ id: 'auto', name: 'Auto (Gateway)' }];
});

// ========== DeepCode Pro → Gateway v2 ==========
ipcMain.handle('zenmux:chat', async (event, { messages, stream, mode }) => {
    const wid = mainWindow?.id;
    const tierData = getTierData();
    if (wid && !checkRateLimit(wid, tierData.tier)) {
        throw new Error('Rate limit exceeded. Vui lòng thử lại sau.');
    }

    const model = mode === 'review' ? 'stepfun/step-3.7-flash-free' : 'z-ai/glm-4.7-flash-free';

    const bodyObj = { model, messages, stream: !!stream };
    const { timestamp, signature, canonicalBody } = await gatewaySign(bodyObj);

    try {
        const res = await fetch(`${GATEWAY_URL}/v2/chat/completions`, {
            method: 'POST',
            headers: await gatewayHeaders(timestamp, signature),
            body: canonicalBody,
        });

        if (res.ok) {
            if (stream) {
                const buffer = await res.arrayBuffer();
                return Array.from(new Uint8Array(buffer));
            }
            const data = await res.json();
            return { content: data.choices?.[0]?.message?.content || '' };
        }

        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Gateway error: ' + res.status);
    } catch (e) {
        throw new Error('DeepCode Pro error: ' + e.message);
    }
});

// ========== DeepCode Ultra → Gateway v3 ==========
ipcMain.handle('cf:chat', async (event, { model, messages, stream }) => {
    const wid = mainWindow?.id;
    const tierData = getTierData();
    if (wid && !checkRateLimit(wid, tierData.tier)) {
        throw new Error('Rate limit exceeded. Vui lòng thử lại sau.');
    }
    if (tierData.tier === 'free') {
        throw new Error('Free accounts cannot use DeepCode Ultra. Please upgrade to PRO.');
    }

    const bodyObj = { model: model || 'z-ai/glm-5.1', messages, stream: !!stream };
    const { timestamp, signature, canonicalBody } = await gatewaySign(bodyObj);

    try {
        const res = await fetch(`${GATEWAY_URL}/v3/chat/completions`, {
            method: 'POST',
            headers: await gatewayHeaders(timestamp, signature),
            body: canonicalBody,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Gateway error: ' + res.status);
        }

        incrementCredits();

        if (stream) {
            const buffer = await res.arrayBuffer();
            return Array.from(new Uint8Array(buffer));
        }

        const data = await res.json();
        return { content: data.choices?.[0]?.message?.content || '' };
    } catch (e) {
        throw new Error('DeepCode Ultra error: ' + e.message);
    }
});

ipcMain.handle('cf:set-account-id', (event, accountId) => {
    if (!accountId || typeof accountId !== 'string') return { success: false };
    CF_ACCOUNT_ID = accountId;
    saveCfConfig({ accountId });
    return { success: true };
});

ipcMain.handle('cf:get-config', () => {
    return { accountId: getCfAccountId(), model: CF_MODEL };
});

// ========== DeepCode Server 2 → Gateway v4 (multi-model, tier-gated) ==========
ipcMain.handle('server2:chat', async (event, { model, messages, stream, githubToken }) => {
    const wid = mainWindow?.id;
    const tierData = getTierData();
    if (wid && !checkRateLimit(wid, tierData.tier)) {
        throw new Error('Rate limit exceeded. Vui lòng thử lại sau.');
    }
    if (tierData.tier === 'free') {
        throw new Error('Tài khoản Free không thể sử dụng DeepCode Server 2. Vui lòng nâng cấp PRO.');
    }
    if (tierData.creditsPerDay > 0 && tierData.creditsUsed >= tierData.creditsPerDay) {
        throw new Error(`Hết ${tierData.creditsPerDay} lượt hôm nay. Nâng cấp Premium để có nhiều hơn.`);
    }

    const bodyObj = { model: model || 'auto', messages, stream: !!stream };
    const { timestamp, signature, canonicalBody } = await gatewaySign(bodyObj);

    try {
        const headers = await gatewayHeaders(timestamp, signature);
        if (githubToken) headers['X-GitHub-Token'] = githubToken;

        const res = await fetch(`${GATEWAY_URL}/v4/chat/completions`, {
            method: 'POST',
            headers,
            body: canonicalBody,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gateway error: ${res.status}`);
        }

        incrementCredits();

        if (stream) {
            const contentType = res.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                const webContents = mainWindow?.webContents;
                if (!webContents) throw new Error('No window');

                const reader = res.body.getReader();
                const decoder = new TextDecoder();

                (async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                webContents.send('server2:stream-chunk', { done: true });
                                break;
                            }
                            const chunk = decoder.decode(value, { stream: true });
                            webContents.send('server2:stream-chunk', { data: chunk });
                        }
                    } catch (e) {
                        webContents.send('server2:stream-chunk', { error: e.message });
                    }
                })();

                return { _streaming: true };
            }
        }

        const data = await res.json();
        return { content: data.choices?.[0]?.message?.content || '' };
    } catch (e) {
        throw new Error('DeepCode Server 2 error: ' + e.message);
    }
});

// DeepCode Server 2 with specific model → Gateway v4/:model
ipcMain.handle('server2:chat-model', async (event, { modelId, messages, stream, githubToken }) => {
    const wid = mainWindow?.id;
    const tierData = getTierData();
    if (wid && !checkRateLimit(wid, tierData.tier)) {
        throw new Error('Rate limit exceeded. Vui lòng thử lại sau.');
    }
    if (tierData.tier === 'free') {
        throw new Error('Tài khoản Free không thể sử dụng DeepCode Server 2. Vui lòng nâng cấp PRO.');
    }

    const bodyObj = { messages, stream: !!stream };
    const { timestamp, signature, canonicalBody } = await gatewaySign(bodyObj);

    try {
        const headers = await gatewayHeaders(timestamp, signature);
        if (githubToken) headers['X-GitHub-Token'] = githubToken;

        const res = await fetch(`${GATEWAY_URL}/v4/chat/completions/${modelId}`, {
            method: 'POST',
            headers,
            body: canonicalBody,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gateway error: ${res.status}`);
        }

        incrementCredits();

        if (stream) {
            const contentType = res.headers.get('content-type') || '';

            if (contentType.includes('text/event-stream')) {
                const webContents = mainWindow?.webContents;
                if (!webContents) throw new Error('No window');

                const reader = res.body.getReader();
                const decoder = new TextDecoder();

                (async () => {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                webContents.send('server2:stream-chunk', { done: true });
                                break;
                            }
                            const chunk = decoder.decode(value, { stream: true });
                            webContents.send('server2:stream-chunk', { data: chunk });
                        }
                    } catch (e) {
                        webContents.send('server2:stream-chunk', { error: e.message });
                    }
                })();

                return { _streaming: true };
            }
        }

        const data = await res.json();
        return { content: data.choices?.[0]?.message?.content || '' };
    } catch (e) {
        throw new Error('DeepCode Server 2 error: ' + e.message);
    }
});

ipcMain.handle('server2:models', async () => {
    const tierData = getTierData();
    try {
        const res = await fetch(`${GATEWAY_URL}/v4/models`, {
            headers: await gatewayHeaders(Date.now().toString(), ''),
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data) {
                // Filter models by tier
                return data.data.filter(m => {
                    if (m.tier === 'free') return true;
                    const tierOrder = { free: 0, pro: 1, premium: 2, business: 3 };
                    return tierOrder[tierData.tier] >= tierOrder[m.tier];
                });
            }
        }
    } catch {}
    return [];
});

// ========== Device Binding ==========
ipcMain.handle('device:bind', async (event, { email, provider }) => {
    const ip = await getClientIp();
    const result = bindDeviceLocally(email, provider, ip);
    setCurrentUser(email, provider, getTierData().tier);

    // Generate API key for this user
    const apiKey = await getOrCreateApiKey(email, getTierData().tier, provider);
    if (apiKey) currentApiKey = apiKey;

    // Call gateway /bind-device to get sessionToken + userSecret
    try {
        const res = await fetch(`${GATEWAY_URL}/bind-device`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey,
            },
            body: JSON.stringify({
                deviceId: GATEWAY_DEVICE_ID,
                email,
                provider: provider || 'unknown',
                ip,
                bindingTimestamp: result.loginTime?.toString() || Date.now().toString(),
            }),
        });
        const data = await res.json();
        if (data.success) {
            // Save encrypted secrets locally
            if (data.userSecret) saveUserSecret(data.userSecret);
            if (data.sessionToken && data.sessionExpiresAt) saveSessionToken(data.sessionToken, data.sessionExpiresAt);
            // Save binding signature from gateway for fallback
            const localBinding = loadDeviceBinding();
            localBinding.bindingSignature = data.bindingSignature;
            localBinding.bindingTimestamp = data.bindingTimestamp;
            saveDeviceBinding(localBinding);
            return {
                ...result,
                apiKey,
                bindingSignature: data.bindingSignature,
                bindingTimestamp: data.bindingTimestamp,
                sessionToken: data.sessionToken,
            };
        }
    } catch (e) {
        console.error('[DeepCode] Gateway bind failed:', e.message);
    }

    // Fallback: generate binding locally (for offline/first-time)
    const binding = loadDeviceBinding();
    return { ...result, apiKey, bindingTimestamp: binding.loginTime };
});

ipcMain.handle('device:get-binding', () => {
    return getDeviceBindingLocal();
});

ipcMain.handle('device:set-user', (event, { email, provider, tier }) => {
    setCurrentUser(email, provider, tier);
    return { success: true };
});

// ========== Terminal ==========
const terminals = new Map();

ipcMain.handle('terminal:create', (event, { cwd }) => {
    const id = crypto.randomUUID();
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : [];

    const term = spawn(shell, shellArgs, {
        cwd: cwd || process.env.USERPROFILE || process.env.HOME || 'C:\\',
        env: process.env,
        cols: 80,
        rows: 24,
        windowsHide: true,
    });

    const safeSend = (channel, data) => {
        try { if (!event.sender.isDestroyed()) event.sender.send(channel, data); } catch {}
    };

    term.stdout.on('data', (data) => {
        safeSend(`terminal:data:${id}`, data.toString());
    });

    term.stderr.on('data', (data) => {
        safeSend(`terminal:data:${id}`, data.toString());
    });

    term.on('exit', (code) => {
        safeSend(`terminal:exit:${id}`, code);
        terminals.delete(id);
    });

    terminals.set(id, term);
    return id;
});

ipcMain.handle('terminal:write', (event, { id, data }) => {
    const term = terminals.get(id);
    if (term && term.stdin.writable) {
        term.stdin.write(data);
    }
});

ipcMain.handle('terminal:resize', (event, { id, cols, rows }) => {});

ipcMain.handle('terminal:kill', (event, { id }) => {
    const term = terminals.get(id);
    if (term) {
        term.kill();
        terminals.delete(id);
    }
});

// Git operations
ipcMain.handle('git:init', async (event, { repoPath }) => {
    return await gitManager.init(repoPath);
});

ipcMain.handle('git:status', async (event, { repoPath }) => {
    return await gitManager.status(repoPath);
});

ipcMain.handle('git:diff', async (event, { repoPath, file }) => {
    return await gitManager.diff(repoPath, file);
});

ipcMain.handle('git:diff-staged', async (event, { repoPath, file }) => {
    return await gitManager.diffStaged(repoPath, file);
});

ipcMain.handle('git:stage', async (event, { repoPath, files }) => {
    return await gitManager.stage(repoPath, files);
});

ipcMain.handle('git:unstage', async (event, { repoPath, files }) => {
    return await gitManager.unstage(repoPath, files);
});

ipcMain.handle('git:commit', async (event, { repoPath, message }) => {
    return await gitManager.commit(repoPath, message);
});

ipcMain.handle('git:branches', async (event, { repoPath }) => {
    return await gitManager.branches(repoPath);
});

ipcMain.handle('git:checkout', async (event, { repoPath, branch }) => {
    return await gitManager.checkout(repoPath, branch);
});

ipcMain.handle('git:log', async (event, { repoPath, maxCount }) => {
    return await gitManager.log(repoPath, maxCount);
});

// ========== GitHub Sync ==========
const GITHUB_TOKEN_PATH = path.join(app.getPath('userData'), 'github-token.json');

function deriveEncryptionKey() {
    const fp = deviceFingerprint || getDeviceFingerprint();
    return crypto.createHash('sha256').update(fp.id + '-github-token-key').digest();
}

function encryptToken(text) {
    const key = deriveEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return { iv: iv.toString('hex'), encrypted, tag };
}

function decryptToken(data) {
    try {
        const key = deriveEncryptionKey();
        const iv = Buffer.from(data.iv, 'hex');
        const tag = Buffer.from(data.tag, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch { return ''; }
}

function loadGithubToken() {
    try {
        if (fs.existsSync(GITHUB_TOKEN_PATH)) {
            const raw = JSON.parse(fs.readFileSync(GITHUB_TOKEN_PATH, 'utf-8'));
            if (raw.encrypted) {
                const token = decryptToken(raw);
                return { token, username: raw.username || '' };
            }
            return raw;
        }
    } catch {}
    return { token: '', username: '' };
}

function saveGithubToken(data) {
    if (data.token) {
        const encrypted = encryptToken(data.token);
        fs.writeFileSync(GITHUB_TOKEN_PATH, JSON.stringify({ ...data, token: undefined, encrypted }));
    } else {
        fs.writeFileSync(GITHUB_TOKEN_PATH, JSON.stringify(data));
    }
}

ipcMain.handle('git:add-remote', async (event, { repoPath, name, url }) => {
    return await gitManager.addRemote(repoPath, name, url);
});

ipcMain.handle('git:remove-remote', async (event, { repoPath, name }) => {
    return await gitManager.removeRemote(repoPath, name);
});

ipcMain.handle('git:get-remotes', async (event, { repoPath }) => {
    return await gitManager.getRemotes(repoPath);
});

ipcMain.handle('git:push', async (event, { repoPath, remote, branch }) => {
    const gh = loadGithubToken();
    return await gitManager.push(repoPath, remote, branch, gh.token || null);
});

ipcMain.handle('git:pull', async (event, { repoPath, remote, branch }) => {
    const gh = loadGithubToken();
    return await gitManager.pull(repoPath, remote, branch, gh.token || null);
});

ipcMain.handle('git:fetch', async (event, { repoPath, remote }) => {
    return await gitManager.fetch(repoPath, remote);
});

ipcMain.handle('git:clone', async (event, { url, destPath }) => {
    const gh = loadGithubToken();
    return await gitManager.clone(url, destPath, gh.token || null);
});

ipcMain.handle('github:save-token', async (event, { token, username }) => {
    saveGithubToken({ token, username });
    return { success: true };
});

ipcMain.handle('github:get-token', async () => {
    return loadGithubToken();
});

ipcMain.handle('github:create-repo', async (event, { name, description, isPrivate }) => {
    const gh = loadGithubToken();
    if (!gh.token) return { error: 'Chưa đăng nhập GitHub' };
    try {
        const res = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gh.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github+json',
            },
            body: JSON.stringify({ name, description, private: isPrivate }),
        });
        const data = await res.json();
        if (data.clone_url) return { success: true, url: data.clone_url, html_url: data.html_url };
        return { error: data.message || 'Tạo repo thất bại' };
    } catch (e) {
        return { error: e.message };
    }
});

// GitHub OAuth Device Flow
const GITHUB_CLIENT_ID = 'Ov23lib6asAuKeLT5RRo';

ipcMain.handle('github:device-code', async () => {
    try {
        const res = await fetch('https://github.com/login/device/code', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                scope: 'repo user',
            }),
        });
        return await res.json();
    } catch (e) {
        return { error: e.message };
    }
});

ipcMain.handle('github:poll-token', async (event, { deviceCode }) => {
    try {
        const res = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                device_code: deviceCode,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
        });
        const data = await res.json();
        if (data.access_token) {
            const userRes = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${data.access_token}` },
            });
            const user = await userRes.json();
            saveGithubToken({ token: data.access_token, username: user.login });
            return { success: true, token: data.access_token, username: user.login };
        }
        return data;
    } catch (e) {
        return { error: e.message };
    }
});

// ========== ADMIN IPC Handlers ==========
ipcMain.handle('admin:get-users', () => adminDB.getAllUsers());
ipcMain.handle('admin:get-user', (event, userId) => adminDB.getUser(userId));
ipcMain.handle('admin:add-user', (event, userId, name, email, tier) => {
    const user = adminDB.createUser(userId, name, email);
    if (tier && tier !== 'free') adminDB.setUserTier(userId, tier);
    return user;
});
ipcMain.handle('admin:update-user', (event, userId, updates) => adminDB.updateUser(userId, updates));
ipcMain.handle('admin:delete-user', (event, userId) => adminDB.deleteUser(userId));
ipcMain.handle('admin:block-user', (event, userId, reason) => adminDB.blockUser(userId, reason));
ipcMain.handle('admin:unblock-user', (event, userId) => adminDB.unblockUser(userId));
ipcMain.handle('admin:set-user-tier', (event, userId, tier) => adminDB.setUserTier(userId, tier));

function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>"'&]/g, '').slice(0, 500);
}

function sanitizeUserId(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^a-zA-Z0-9\-_.@]/g, '').slice(0, 200);
}

ipcMain.handle('admin:get-stats', () => adminDB.getStats());
ipcMain.handle('admin:get-settings', () => adminDB.getSettings());
ipcMain.handle('admin:save-settings', (event, settings) => {
    if (typeof settings !== 'object' || !settings) return;
    return adminDB.updateSettings(settings);
});

ipcMain.handle('admin:auto-register', (event, { userId, name, email, tier }) => {
    const safeUserId = sanitizeUserId(userId);
    const safeName = sanitizeString(name);
    const safeEmail = sanitizeString(email);
    if (!safeUserId) return null;
    const existing = adminDB.getUser(safeUserId);
    if (!existing) {
        adminDB.createUser(safeUserId, safeName || 'User', safeEmail || '');
    }
    if (tier && ['free', 'pro', 'premium', 'business', 'ultra'].includes(tier) && tier !== 'free') {
        adminDB.setUserTier(safeUserId, tier);
    }
    adminDB.data.stats.totalRequests = (adminDB.data.stats.totalRequests || 0) + 1;
    adminDB.save();
    return adminDB.getUser(userId);
});

ipcMain.handle('admin:increment-requests', () => {
    adminDB.data.stats.totalRequests = (adminDB.data.stats.totalRequests || 0) + 1;
    adminDB.save();
    return { success: true };
});

// ========== SECURITY: Device & Bot Protection ==========
ipcMain.handle('security:get-fingerprint', () => {
    return { id: deviceFingerprint.id, created: deviceFingerprint.data.created };
});

ipcMain.handle('security:get-ban-status', () => {
    const wid = mainWindow?.id;
    return { banned: wid ? isBanned(wid) : false };
});

// ========== FIREBASE OAuth ==========
const http = require('http');
const url = require('url');

const GOOGLE_CLIENT_ID = '317314962134-1a11bl4vbmvso15jup884q5rqh780ll2.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const GITHUB_CLIENT_SECRET = '0052977df3627d6c7629b60ca5ff250fca600a27';
const FIREBASE_API_KEY = 'AIzaSyB0um5Pl7t15KwOzFsOnu_737TZMLbFuXY';

function createOAuthServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        server.on('error', (e) => reject(e));
        server.listen(3000, '127.0.0.1', () => {
            resolve({ server, port: 3000, redirectUri: 'http://127.0.0.1:3000/callback' });
        });
    });
}

function waitForCallback(server) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            server.close();
            reject(new Error('OAuth timeout'));
        }, 120000);

        server.on('request', (req, res) => {
            const parsed = url.parse(req.url, true);
            if (parsed.pathname === '/callback') {
                clearTimeout(timeout);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<html><body style="background:#0d0b14;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><h2>Đăng nhập thành công! Bạn có thể đóng tab này.</h2></body></html>');
                server.close();
                resolve(parsed.query);
            }
        });
    });
}

ipcMain.handle('oauth-google', async () => {
    try {
        const { server, port, redirectUri } = await createOAuthServer();
        const state = crypto.randomBytes(16).toString('hex');
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}&prompt=select_account`;
        shell.openExternal(authUrl);
        const params = await waitForCallback(server);
        if (params.code) {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: params.code,
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    redirect_uri: redirectUri,
                    grant_type: 'authorization_code',
                }).toString(),
            });
            const tokenData = await tokenRes.json();
            if (tokenData.id_token) {
                mainWindow?.webContents.send('oauth-callback', { provider: 'google', idToken: tokenData.id_token });
            } else {
                mainWindow?.webContents.send('oauth-callback', { provider: 'google', error: tokenData.error_description || tokenData.error || 'No token' });
            }
        } else {
            mainWindow?.webContents.send('oauth-callback', { provider: 'google', error: params.error || 'No code received' });
        }
    } catch (e) {
        mainWindow?.webContents.send('oauth-callback', { provider: 'google', error: e.message });
    }
});

ipcMain.handle('oauth-github', async () => {
    try {
        const { server, port, redirectUri } = await createOAuthServer();
        const state = crypto.randomBytes(16).toString('hex');
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user&state=${state}`;
        shell.openExternal(authUrl);
        const params = await waitForCallback(server);
        if (params.code) {
            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code: params.code }),
            });
            const tokenData = await tokenRes.json();
            if (tokenData.access_token) {
                mainWindow?.webContents.send('oauth-callback', { provider: 'github', accessToken: tokenData.access_token });
            } else {
                mainWindow?.webContents.send('oauth-callback', { provider: 'github', error: tokenData.error_description || 'No token' });
            }
        } else {
            mainWindow?.webContents.send('oauth-callback', { provider: 'github', error: params.error || 'No code received' });
        }
    } catch (e) {
        mainWindow?.webContents.send('oauth-callback', { provider: 'github', error: e.message });
    }
});

app.on('before-quit', () => {
    terminals.forEach((term) => {
        try { term.kill(); } catch (e) {}
    });
    terminals.clear();
});
