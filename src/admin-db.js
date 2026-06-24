const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AdminDB {
    constructor(userDataPath) {
        this.dbPath = path.join(userDataPath, 'deepcode-admin.json');
        this.data = this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                return JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
            }
        } catch {}
        return {
            users: {},
            stats: { totalRequests: 0, totalMessages: 0 },
            settings: {
                requireLicenseKey: false,
                maxFreeUsers: 100,
            },
        };
    }

    save() {
        try {
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (e) {
            console.error('Failed to save admin DB:', e);
        }
    }

    // ========== User Management ==========
    getUser(userId) {
        return this.data.users[userId] || null;
    }

    getUserByToken(token) {
        for (const [id, user] of Object.entries(this.data.users)) {
            if (user.token === token) return { id, ...user };
        }
        return null;
    }

    createUser(userId, name, email) {
        if (this.data.users[userId]) return this.data.users[userId];
        const user = {
            name: name || 'User',
            email: email || '',
            tier: 'free',
            status: 'active',
            token: crypto.randomBytes(24).toString('hex'),
            createdAt: Date.now(),
            lastLogin: null,
            requestsToday: 0,
            requestsThisMonth: 0,
            lastRequestReset: Date.now(),
            blocked: false,
            blockedReason: '',
            notes: '',
        };
        this.data.users[userId] = user;
        this.save();
        return user;
    }

    updateUser(userId, updates) {
        if (!this.data.users[userId]) return null;
        Object.assign(this.data.users[userId], updates);
        this.save();
        return this.data.users[userId];
    }

    deleteUser(userId) {
        if (!this.data.users[userId]) return false;
        delete this.data.users[userId];
        this.save();
        return true;
    }

    blockUser(userId, reason) {
        if (!this.data.users[userId]) return null;
        this.data.users[userId].blocked = true;
        this.data.users[userId].blockedReason = reason || 'Blocked by admin';
        this.data.users[userId].status = 'blocked';
        this.save();
        return this.data.users[userId];
    }

    unblockUser(userId) {
        if (!this.data.users[userId]) return null;
        this.data.users[userId].blocked = false;
        this.data.users[userId].blockedReason = '';
        this.data.users[userId].status = 'active';
        this.save();
        return this.data.users[userId];
    }

    setUserTier(userId, tier) {
        const validTiers = ['free', 'pro', 'premium', 'business'];
        if (!validTiers.includes(tier)) return null;
        if (!this.data.users[userId]) return null;
        this.data.users[userId].tier = tier;
        this.save();
        return this.data.users[userId];
    }

    getAllUsers() {
        return Object.entries(this.data.users).map(([id, user]) => ({ id, ...user }));
    }

    searchUsers(query) {
        const q = query.toLowerCase();
        return this.getAllUsers().filter(u =>
            u.id.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
        );
    }

    // ========== Request Tracking ==========
    trackRequest(userId) {
        const user = this.data.users[userId];
        if (!user) return;

        const now = Date.now();
        const dayMs = 86400000;
        const monthMs = dayMs * 30;

        if (now - user.lastRequestReset > dayMs) {
            user.requestsToday = 0;
            user.lastRequestReset = now;
        }

        user.requestsToday = (user.requestsToday || 0) + 1;
        user.requestsThisMonth = (user.requestsThisMonth || 0) + 1;
        user.lastLogin = now;

        this.data.stats.totalRequests = (this.data.stats.totalRequests || 0) + 1;
        this.save();
    }

    canUserRequest(userId) {
        const user = this.data.users[userId];
        if (!user) return { allowed: false, reason: 'User not found' };
        if (user.blocked) return { allowed: false, reason: user.blockedReason || 'Account blocked' };

        const limits = { free: 0, pro: 10, premium: 1000, business: 3000 };
        const limit = limits[user.tier] || 0;

        if (limit === 0) return { allowed: false, reason: 'Free tier cannot use DeepCode Server 2' };
        if (user.requestsToday >= limit) return { allowed: false, reason: `Daily limit reached (${limit})` };

        return { allowed: true };
    }

    // ========== Stats ==========
    getStats() {
        const users = this.getAllUsers();
        return {
            totalUsers: users.length,
            activeUsers: users.filter(u => u.status === 'active').length,
            blockedUsers: users.filter(u => u.blocked).length,
            tierDistribution: {
                free: users.filter(u => u.tier === 'free').length,
                pro: users.filter(u => u.tier === 'pro').length,
                premium: users.filter(u => u.tier === 'premium').length,
                business: users.filter(u => u.tier === 'business').length,
            },
            totalRequests: this.data.stats.totalRequests || 0,
            totalMessages: this.data.stats.totalMessages || 0,
            licenseKeys: Object.keys(this.data.licenseKeys).length,
        };
    }

    // ========== Settings ==========
    getSettings() {
        return this.data.settings;
    }

    updateSettings(updates) {
        Object.assign(this.data.settings, updates);
        this.save();
        return this.data.settings;
    }
}

module.exports = { AdminDB };
