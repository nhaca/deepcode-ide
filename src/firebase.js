const FIREBASE_CONFIG = {
    apiKey: "AIzaSyB0um5Pl7t15KwOzFsOnu_737TZMLbFuXY",
    authDomain: "deepcode-2c76c.firebaseapp.com",
    projectId: "deepcode-2c76c",
    storageBucket: "deepcode-2c76c.firebasestorage.app",
    messagingSenderId: "317314962134",
    appId: "1:317314962134:web:edffc9b139d79580dcef77",
};

const FIREBASE_URL = `https://identitytoolkit.googleapis.com/v1/accounts`;
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

class FirebaseAuth {
    constructor() {
        this.apiKey = FIREBASE_CONFIG.apiKey;
        this.idToken = null;
        this.refreshToken = null;
        this.userId = null;
        this.provider = null;
    }

    getAPIUrl(action) {
        return `${FIREBASE_URL}:${action}?key=${this.apiKey}`;
    }

    async signInWithGoogle(idToken) {
        const res = await fetch(this.getAPIUrl('signInWithIdp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postBody: `id_token=${idToken}&providerId=google.com`,
                requestUri: 'http://localhost',
                returnIdpCredential: true,
                returnSecureToken: true,
            }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return this._handleAuthResponse(data, 'google');
    }

    async signInWithGitHub(accessToken) {
        const res = await fetch(this.getAPIUrl('signInWithIdp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postBody: `access_token=${accessToken}&providerId=github.com`,
                requestUri: 'http://localhost',
                returnIdpCredential: true,
                returnSecureToken: true,
            }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return this._handleAuthResponse(data, 'github');
    }

    async _handleAuthResponse(data, provider) {
        this.idToken = data.idToken;
        this.refreshToken = data.refreshToken;
        this.userId = data.localId;
        this.provider = provider;

        const email = data.email || `${provider}_user`;
        const displayName = data.displayName || data.screenName || email.split('@')[0];
        const photoUrl = data.photoUrl || '';

        this.userEmail = email;

        await this.initUserDoc(email, displayName, provider, photoUrl);

        return { userId: email, email, displayName, provider, photoUrl };
    }

    async initUserDoc(email, displayName, provider, photoUrl) {
        if (!this.idToken || !email) return;
        const existing = await this.getUserDataByEmail(email);
        if (existing) {
            await this.updateUserByEmail(email, { lastLogin: Date.now(), provider });
            return;
        }
        const userData = {
            fields: {
                email: { stringValue: email },
                displayName: { stringValue: displayName || '' },
                provider: { stringValue: provider || '' },
                photoUrl: { stringValue: photoUrl || '' },
                tier: { stringValue: 'free' },
                requestsToday: { integerValue: 0 },
                requestsThisMonth: { integerValue: 0 },
                totalRequests: { integerValue: 0 },
                createdAt: { integerValue: Date.now() },
                lastLogin: { integerValue: Date.now() },
                blocked: { booleanValue: false },
            }
        };
        const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
        await fetch(`${FIRESTORE_URL}/users/${safeId}?key=${this.apiKey}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.idToken}`,
            },
            body: JSON.stringify(userData),
        });
    }

    async getUserDataByEmail(email) {
        if (!this.idToken) return null;
        const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
        const res = await fetch(`${FIRESTORE_URL}/users/${safeId}?key=${this.apiKey}`, {
            headers: { 'Authorization': `Bearer ${this.idToken}` },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return this.parseFirestoreDoc(data);
    }

    async updateUserByEmail(email, updates) {
        if (!this.idToken || !email) return;
        const safeId = email.replace(/[^a-zA-Z0-9]/g, '_');
        const fields = {};
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'string') fields[key] = { stringValue: value };
            else if (typeof value === 'number') fields[key] = { integerValue: value };
            else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
        }
        await fetch(`${FIRESTORE_URL}/users/${safeId}?key=${this.apiKey}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.idToken}`,
            },
            body: JSON.stringify({ fields }),
        });
    }

    async getUserData() {
        if (!this.idToken || !this.userEmail) return null;
        return this.getUserDataByEmail(this.userEmail);
    }

    async updateUserData(updates) {
        if (!this.idToken || !this.userEmail) return;
        return this.updateUserByEmail(this.userEmail, updates);
    }

    parseFirestoreDoc(data) {
        if (!data || !data.fields) return null;
        const result = {};
        for (const [key, val] of Object.entries(data.fields)) {
            if (val.stringValue !== undefined) result[key] = val.stringValue;
            else if (val.integerValue !== undefined) result[key] = parseInt(val.integerValue);
            else if (val.booleanValue !== undefined) result[key] = val.booleanValue;
        }
        return result;
    }

    saveSession() {
        const session = { idToken: this.idToken, refreshToken: this.refreshToken, userId: this.userId, userEmail: this.userEmail };
        localStorage.setItem('deepcode-firebase-session', JSON.stringify(session));
    }

    async refreshIdToken() {
        if (!this.refreshToken) return false;
        try {
            const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=refresh_token&refresh_token=${this.refreshToken}`,
            });
            const data = await res.json();
            if (data.error) return false;
            this.idToken = data.id_token;
            this.refreshToken = data.refresh_token;
            this.userId = data.user_id;
            this.saveSession();
            return true;
        } catch { return false; }
    }

    async loadSession() {
        try {
            const raw = localStorage.getItem('deepcode-firebase-session');
            if (!raw) return false;
            const session = JSON.parse(raw);
            this.idToken = session.idToken;
            this.refreshToken = session.refreshToken;
            this.userId = session.userId;
            this.userEmail = session.userEmail;
            if (!this.idToken || !this.refreshToken) return false;
            const refreshed = await this.refreshIdToken();
            return refreshed;
        } catch { return false; }
    }

    logout() {
        this.idToken = null;
        this.refreshToken = null;
        this.userId = null;
        localStorage.removeItem('deepcode-firebase-session');
    }

    isLoggedIn() {
        return !!this.idToken && !!this.userId;
    }

    async trackUsage(model, tokensUsed) {
        if (!this.idToken || !this.userEmail) return;

        const userData = await this.getUserData();
        const newCount = (userData?.requestsToday || 0) + 1;
        await this.updateUserData({
            requestsToday: newCount,
            totalRequests: (userData?.totalRequests || 0) + 1,
            lastLogin: Date.now(),
        });

        const logData = {
            fields: {
                userEmail: { stringValue: this.userEmail },
                model: { stringValue: model || '' },
                tokensUsed: { integerValue: tokensUsed || 0 },
                timestamp: { integerValue: Date.now() },
            }
        };
        await fetch(`${FIRESTORE_URL}/usageLogs?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.idToken}`,
            },
            body: JSON.stringify(logData),
        });
    }
}

class FirestoreAdmin {
    constructor(apiKey, idToken) {
        this.apiKey = apiKey || FIREBASE_CONFIG.apiKey;
        this.idToken = idToken;
    }

    async getAllUsers() {
        const res = await fetch(`${FIRESTORE_URL}/users?key=${this.apiKey}`, {
            headers: { 'Authorization': `Bearer ${this.idToken}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.documents) return [];
        return data.documents.map(doc => {
            const id = doc.name.split('/').pop();
            const parsed = {};
            for (const [key, val] of Object.entries(doc.fields || {})) {
                if (val.stringValue !== undefined) parsed[key] = val.stringValue;
                else if (val.integerValue !== undefined) parsed[key] = parseInt(val.integerValue);
                else if (val.booleanValue !== undefined) parsed[key] = val.booleanValue;
            }
            return { id, ...parsed };
        });
    }

    async updateUser(userId, updates) {
        const fields = {};
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'string') fields[key] = { stringValue: value };
            else if (typeof value === 'number') fields[key] = { integerValue: value };
            else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
        }
        await fetch(`${FIRESTORE_URL}/users/${userId}?key=${this.apiKey}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.idToken}`,
            },
            body: JSON.stringify({ fields }),
        });
    }

    async deleteUser(userId) {
        await fetch(`${FIRESTORE_URL}/users/${userId}?key=${this.apiKey}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${this.idToken}` },
        });
    }

    async getStats() {
        const users = await this.getAllUsers();
        const totalUsers = users.length;
        const tierDist = { free: 0, pro: 0, premium: 0, business: 0, ultra: 0 };
        let totalRequests = 0;
        let blocked = 0;
        for (const u of users) {
            if (tierDist[u.tier] !== undefined) tierDist[u.tier]++;
            totalRequests += u.totalRequests || 0;
            if (u.blocked) blocked++;
        }
        return { totalUsers, tierDist, totalRequests, blocked };
    }

    async getUsageLogs(limit = 50) {
        const res = await fetch(`${FIRESTORE_URL}/usageLogs?key=${this.apiKey}&orderBy=timestamp&limit=${limit}`, {
            headers: { 'Authorization': `Bearer ${this.idToken}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (!data.documents) return [];
        return data.documents.map(doc => {
            const parsed = {};
            for (const [key, val] of Object.entries(doc.fields || {})) {
                if (val.stringValue !== undefined) parsed[key] = val.stringValue;
                else if (val.integerValue !== undefined) parsed[key] = parseInt(val.integerValue);
                else if (val.booleanValue !== undefined) parsed[key] = val.booleanValue;
            }
            return parsed;
        });
    }
}

window.firebaseAuth = new FirebaseAuth();
window.FirestoreAdmin = FirestoreAdmin;
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
