// ========== Backend API Client ==========
function getApiUrl() {
    return localStorage.getItem('deepcode-api-url') || 'http://localhost:3000';
}

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

// ========== Mock Backend (fallback when not logged in) ==========
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

// ========== Export (không ghi đè window.api từ preload!) ==========
window.DeepCodeAPI = DeepCodeAPI;
window.MockBackend = MockBackend;
window.deepcodeClient = new DeepCodeAPI();
