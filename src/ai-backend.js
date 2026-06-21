// ========== Provider Helpers ==========
function getProvider() {
    return localStorage.getItem('deepcode-provider') || 'deepcode';
}

function getApiUrl() {
    return localStorage.getItem('deepcode-api-url') || 'http://localhost:3000';
}

function getAtxpConfig() {
    return {
        token: localStorage.getItem('deepcode-atxp-token') || '',
        accountId: localStorage.getItem('deepcode-atxp-account-id') || '',
    };
}

// ========== DeepCode API Client ==========
class DeepCodeAPI {
    constructor() {
        this.token = localStorage.getItem('deepcode-token') || null;
        this.user = null;
    }

    async request(path, options = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

        const res = await fetch(`${getApiUrl()}${path}`, { ...options, headers });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'API error');
        return data;
    }

    async register(email, password, name) {
        const data = await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name }),
        });
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('deepcode-token', data.token);
        return data;
    }

    async login(email, password) {
        const data = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('deepcode-token', data.token);
        return data;
    }

    async loginWithGitHub(code) {
        const data = await this.request('/api/auth/github', {
            method: 'POST',
            body: JSON.stringify({ code }),
        });
        this.token = data.token;
        this.user = data.user;
        localStorage.setItem('deepcode-token', data.token);
        return data;
    }

    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('deepcode-token');
    }

    async getMe() {
        this.user = await this.request('/api/auth/me');
        return this.user;
    }

    async getCredits() {
        return await this.request('/api/credits');
    }

    async getModels() {
        return await this.request('/api/models');
    }

    async getTiers() {
        return await this.request('/api/tiers');
    }

    async upgradeTier(tier) {
        const data = await this.request('/api/subscription/upgrade', {
            method: 'POST',
            body: JSON.stringify({ tier }),
        });
        this.token = data.token;
        localStorage.setItem('deepcode-token', data.token);
        return data;
    }

    async chat(model, messages, stream = false, projectContext = null) {
        if (stream) {
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

            const body = { model, messages, stream: true };
            if (projectContext) body.projectContext = projectContext;

            const res = await fetch(`${getApiUrl()}/api/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error);
            }

            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
                const data = await res.json();
                return { _nonStreaming: true, content: data.content || data.choices?.[0]?.message?.content || JSON.stringify(data) };
            }

            return res.body;
        }

        const body = { model, messages, stream: false };
        if (projectContext) body.projectContext = projectContext;

        return await this.request('/api/chat', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    isLoggedIn() {
        return !!this.token;
    }
}

// ========== ATPX API Client ==========
class AtxpAPI {
    constructor() {
        this.baseUrl = 'https://api.atxp.ai';
    }

    _getHeaders() {
        const cfg = getAtxpConfig();
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cfg.token}`,
            'x-account-id': cfg.accountId,
        };
    }

    async chat(model, messages, stream = false) {
        const body = {
            model,
            messages,
            stream,
        };

        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: this._getHeaders(),
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error?.message || `ATPX API error: ${res.status}`);
        }

        if (stream) {
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
                const data = await res.json();
                return { _nonStreaming: true, content: data.choices?.[0]?.message?.content || JSON.stringify(data) };
            }
            return res.body;
        }

        const data = await res.json();
        return { content: data.choices?.[0]?.message?.content || '' };
    }

    async getModels() {
        const res = await fetch(`${this.baseUrl}/v1/models`, {
            headers: this._getHeaders(),
        });

        if (!res.ok) return [];

        const data = await res.json();
        return (data.data || []).map(m => ({
            id: m.id,
            name: m.id,
        }));
    }

    isLoggedIn() {
        const cfg = getAtxpConfig();
        return !!cfg.token && !!cfg.accountId;
    }
}

// ========== Unified Client ==========
class UnifiedClient {
    constructor() {
        this.deepcode = new DeepCodeAPI();
        this.atxp = new AtxpAPI();
    }

    get activeClient() {
        return getProvider() === 'atxp' ? this.atxp : this.deepcode;
    }

    get user() { return this.deepcode.user; }
    set user(v) { this.deepcode.user = v; }
    get token() { return this.deepcode.token; }

    async chat(model, messages, stream = false, projectContext = null) {
        if (getProvider() === 'atxp') {
            return await this.atxp.chat(model, messages, stream);
        }
        return await this.deepcode.chat(model, messages, stream, projectContext);
    }

    async getModels() {
        if (getProvider() === 'atxp') {
            return await this.atxp.getModels();
        }
        return await this.deepcode.getModels();
    }

    async getCredits() {
        if (getProvider() === 'atxp') {
            return { tier: 'atxp', contextLimits: { maxContext: 128000 }, used: 0, total: Infinity };
        }
        return await this.deepcode.getCredits();
    }

    async getMe() {
        if (getProvider() === 'atxp') {
            return { name: 'ATPX User', provider: 'atxp' };
        }
        return await this.deepcode.getMe();
    }

    isLoggedIn() {
        if (getProvider() === 'atxp') {
            return this.atxp.isLoggedIn();
        }
        return this.deepcode.isLoggedIn();
    }

    logout() {
        this.deepcode.logout();
    }

    async register(email, password, name) {
        return await this.deepcode.register(email, password, name);
    }

    async login(email, password) {
        return await this.deepcode.login(email, password);
    }

    async loginWithGitHub(code) {
        return await this.deepcode.loginWithGitHub(code);
    }
}

// ========== Mock Backend (fallback) ==========
class MockBackend {
    async *streamChat(messages) {
        const lastMsg = messages[messages.length - 1]?.content || '';
        const response = `Demo mode: "${lastMsg}"\n\nLogin to use real AI models.`;

        for (const char of response) {
            yield char;
            await new Promise(r => setTimeout(r, 10));
        }
    }
}

// ========== Export ==========
window.DeepCodeAPI = DeepCodeAPI;
window.AtxpAPI = AtxpAPI;
window.MockBackend = MockBackend;
window.deepcodeClient = new UnifiedClient();
