// ========== Provider Helpers ==========
function getProvider() {
    return localStorage.getItem('deepcode-provider') || 'deepcode';
}

function getApiUrl() {
    return localStorage.getItem('deepcode-api-url') || 'http://localhost:3000';
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

    async loginWithGitHub(accessToken) {
        try {
            const firebaseAuth = window._firebaseAuth;
            if (firebaseAuth) {
                const data = await firebaseAuth.signInWithGitHub(accessToken);
                if (data && data.idToken) {
                    this.token = data.idToken;
                    this.user = data.user || { email: data.email, displayName: data.displayName };
                    localStorage.setItem('deepcode-token', data.idToken);
                    return data;
                }
            }
        } catch (e) {
            console.warn('Firebase GitHub auth failed:', e.message);
        }
        // Fallback: send to backend
        const data = await this.request('/api/auth/github', {
            method: 'POST',
            body: JSON.stringify({ code: accessToken }),
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

// ========== ATXP API Client (via IPC proxy — no keys in renderer) ==========
class AtxpAPI {
    async chat(model, messages, stream = false) {
        const result = await window.api.atxp.chat(model, messages, stream);

        if (result._nonStreaming) {
            return { content: result.content };
        }

        if (result instanceof Array || result instanceof Uint8Array) {
            const bytes = new Uint8Array(result);
            const text = new TextDecoder().decode(bytes);
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                }
            });
        }

        return result;
    }

    async getModels() {
        return await window.api.atxp.models();
    }

    isLoggedIn() {
        return true;
    }
}

// ========== DeepCode Go Client (Gateway v1) ==========
class DeepCodeGoAPI {
    async chat(model, messages, stream = false, tools = null) {
        if (stream) {
            window.api.deepcodeGo.removeStreamListeners();
            const result = await window.api.deepcodeGo.chat(model, messages, true, tools);

            if (result && result._streaming) {
                return new ReadableStream({
                    start(controller) {
                        window.api.deepcodeGo.onStreamChunk((chunk) => {
                            if (chunk.done) {
                                window.api.deepcodeGo.removeStreamListeners();
                                controller.close();
                            } else if (chunk.error) {
                                window.api.deepcodeGo.removeStreamListeners();
                                controller.error(new Error(chunk.error));
                            } else if (chunk.data) {
                                controller.enqueue(new TextEncoder().encode(chunk.data));
                            }
                        });
                    }
                });
            }

            if (result && result.content) {
                return { _nonStreaming: true, content: result.content };
            }
        }

        const result = await window.api.deepcodeGo.chat(model, messages, false, tools);
        return { _nonStreaming: true, content: result.content || '', choices: result.choices, tool_calls: result.choices?.[0]?.message?.tool_calls };
    }

    async getModels() {
        return await window.api.deepcodeGo.models();
    }

    isLoggedIn() {
        return true;
    }
}

// ========== Cloudflare Workers AI Client (deepcode-ultra) ==========
class CloudflareAPI {
    async chat(model, messages, stream = false) {
        const result = await window.api.cf.chat(model, messages, stream);

        if (result instanceof Array || result instanceof Uint8Array) {
            const bytes = new Uint8Array(result);
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                }
            });
        }

        if (result && result.content !== undefined && !result._nonStreaming) {
            return { _nonStreaming: true, content: result.content || '' };
        }
        return result;
    }

    async setAccountId(id) {
        return await window.api.cf.setAccountId(id);
    }

    async getConfig() {
        return await window.api.cf.getConfig();
    }

    isLoggedIn() {
        return true;
    }
}

// ========== ZenMux API Client (DeepCode Pro + Review Mode) ==========
class ZenMuxAPI {
    async chat(messages, stream = false, mode = 'pro') {
        const result = await window.api.zenmux.chat(messages, stream, mode);

        if (result instanceof Array || result instanceof Uint8Array) {
            const bytes = new Uint8Array(result);
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                }
            });
        }

        if (result && result.content !== undefined && !result._nonStreaming) {
            return { _nonStreaming: true, content: result.content || '' };
        }
        return result;
    }

    isLoggedIn() {
        return true;
    }
}

// ========== GitHub Models API Client (routed through Gateway) ==========
class GitHubModelsAPI {
    async chat(model, messages, stream = false) {
        // Route through DeepCode Go gateway with github: prefix
        return await this.deepcodeGo.chat(`github:${model}`, messages, stream);
    }

    async getModels() {
        const data = await window.api.githubModels.list();
        if (!data.connected) return [];
        return data.models;
    }

    isConnected() {
        return window.api.githubModels.list().then(d => d.connected);
    }
}

// ========== Unified Client ==========
class UnifiedClient {
    constructor() {
        this.deepcode = new DeepCodeAPI();
        this.atxp = new AtxpAPI();
        this.deepcodeGo = new DeepCodeGoAPI();
        this.cloudflare = new CloudflareAPI();
        this.zenmux = new ZenMuxAPI();
        this.githubModels = new GitHubModelsAPI();
    }

    get activeClient() {
        const p = getProvider();
        if (p === 'atxp') return this.atxp;
        return this.deepcode;
    }

    get user() { return this.deepcode.user; }
    set user(v) { this.deepcode.user = v; }
    get token() { return this.deepcode.token; }

    async chat(model, messages, stream = false, projectContext = null, tools = null) {
        // DeepCode models: route to correct backend, bypass provider setting
        if (model && (model.includes('go') || model === 'auto')) {
            return await this.deepcodeGo.chat(model, messages, stream, tools);
        }
        if (model && (model.includes('ultra') || model.includes('glm') || model.includes('deepcode-ultra'))) {
            return await this.cloudflare.chat(model, messages, stream);
        }
        if (model && model.includes('pro')) {
            return await this.zenmux.chat(messages, stream, 'pro');
        }
        // GitHub Models: route through Gateway with user's GitHub token
        if (model && model.startsWith('github:')) {
            return await this.deepcodeGo.chat(model, messages, stream);
        }

        const p = getProvider();
        if (p === 'atxp') {
            return await this.atxp.chat(model, messages, stream);
        }
        // Fallback: route through DeepCode Go (Gateway v1) instead of localhost:3000
        return await this.deepcodeGo.chat(model || 'auto', messages, stream);
    }

    // Review mode — dùng ZenMux API
    async reviewChat(messages, stream = false) {
        return await this.zenmux.chat(messages, stream, 'review');
    }

    async getModels() {
        const p = getProvider();
        if (p === 'atxp') {
            const deepcodeModels = [
                { id: 'deepcode-go', name: 'DeepCode' },
                { id: 'deepcode-pro', name: 'DeepCode Pro' },
                { id: 'deepcode-ultra', name: 'DeepCode Ultra' },
            ];
            try {
                const atxpModels = await this.atxp.getModels();
                return [...deepcodeModels, ...atxpModels];
            } catch (e) {
                console.error('Failed to load ATXP models:', e);
                return deepcodeModels;
            }
        }
        // Load from Gateway + GitHub Models
        const models = [];
        try {
            const gatewayModels = await this.deepcodeGo.getModels();
            models.push(...gatewayModels);
        } catch (e) {
            console.error('Failed to load models from Gateway:', e);
        }
        try {
            const ghModels = await this.githubModels.getModels();
            models.push(...ghModels);
        } catch (e) {
            console.error('Failed to load GitHub Models:', e);
        }
        return models.length > 0 ? models : [{ id: 'auto', name: 'DeepCode' }];
    }

    async getCredits() {
        const p = getProvider();
        if (p === 'atxp') return await window.api.tier.get();
        return await this.deepcode.getCredits();
    }

    async setTier(tier) {
        const p = getProvider();
        if (p === 'atxp') return await window.api.tier.set(tier);
        return null;
    }

    async getMe() {
        const p = getProvider();
        if (p === 'atxp') return { name: 'DeepCode Server 2 User', provider: 'atxp' };
        return await this.deepcode.getMe();
    }

    isLoggedIn() {
        const p = getProvider();
        if (p === 'atxp') return this.atxp.isLoggedIn();
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
