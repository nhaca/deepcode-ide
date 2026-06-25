class AIPanel {
    constructor(container, state) {
        this.container = container;
        this.state = state;
        this.history = JSON.parse(localStorage.getItem('deepcode-chat-history') || '[]');
        this.isStreaming = false;
        this.credits = null;
        this.passport = JSON.parse(localStorage.getItem('deepcode-passport') || '[]');
        this.styleProfile = JSON.parse(localStorage.getItem('deepcode-style') || '{}');
        this.render();
        this.input = document.getElementById('aiInput');
        this.messagesEl = document.getElementById('aiMessages');
        this.setupEvents();
        this.checkAuth();
        this.restoreHistory();
    }

    async checkAuth() {
        const fb = window.firebaseAuth;
        if (fb && await fb.loadSession()) {
            try {
                const userData = await fb.getUserData();
                if (userData && !userData.blocked) {
                    this.credits = {
                        tier: userData.tier || 'free',
                        creditsUsed: userData.requestsToday || 0,
                        creditsPerDay: 0,
                        creditsPerMonth: { free: 100, pro: 2000, premium: 5000, business: 100000 }[userData.tier || 'free'] || 100,
                    };
                    const user = { id: fb.userId, email: userData.email, name: userData.displayName || userData.email };
                    this.state.set('user', user);
                    this.showLoggedInUI(user);
                    // Fetch real credits from gateway
                    this.refreshGatewayCredits();
                    return;
                }
            } catch (e) {
                console.log('Firebase session expired:', e.message);
                fb.logout();
            }
        }
        this.showLoginUI();
    }

    saveHistory() {
        // Chỉ lưu 50 tin nhắn gần nhất
        const toSave = this.history.slice(-50);
        localStorage.setItem('deepcode-chat-history', JSON.stringify(toSave));
    }

    restoreHistory() {
        if (this.history.length === 0) return;
        this.history.forEach(msg => {
            if (msg.content) {
                msg.content = msg.content.replace(/^\[QUY TẮC: Trả lời BẰNG TIẾNG VIỆT\]\s*/g, '');
            }
        });
        this.saveHistory();
        setTimeout(() => {
            this.history.forEach(msg => {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    this.addMessage(msg.content, msg.role);
                }
            });
            this.updateContextDisplay();
        }, 100);
    }

    render() {
        this.container.innerHTML = `
            <div class="ai-panel-inner">
                <div class="ai-panel-header">
                    <div class="ai-panel-title">
                        <svg width="20" height="20" viewBox="0 0 32 32">
                            <defs>
                                <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" style="stop-color:#7c5cfc"/>
                                    <stop offset="100%" style="stop-color:#a78bfa"/>
                                </linearGradient>
                            </defs>
                            <rect x="6" y="8" width="20" height="16" rx="4" fill="url(#aiGrad)"/>
                            <rect x="8" y="10" width="16" height="12" rx="3" fill="#1a1828"/>
                            <circle cx="12" cy="15" r="2.5" fill="#7c5cfc"/>
                            <circle cx="13" cy="14" r="1" fill="white"/>
                            <path d="M17 14 Q20 12 23 14" stroke="#7c5cfc" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                            <path d="M12 19 Q16 22 20 19" stroke="#7c5cfc" stroke-width="1.5" fill="none" stroke-linecap="round"/>
                        </svg>
                        <span>DeepCode</span>
                    </div>
                    <div class="ai-header-actions">
                        <button class="ai-settings-btn" id="aiClearBtn" title="Cuộc trò chuyện mới" onclick="if(window._aiPanel){window._aiPanel.newSession()}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                        <div class="ai-mode-toggle">
                            <button class="ai-mode-btn active" data-mode="plan">Plan</button>
                            <button class="ai-mode-btn" data-mode="code">Code</button>
                            <button class="ai-mode-btn" data-mode="review">Review</button>
                        </div>
                    </div>
                </div>

                <!-- Credits Bar (shown when logged in) -->
                <div class="ai-credits-bar" id="aiCreditsBar" style="display: none;">
                    <div class="credits-info">
                        <span class="credits-tier" id="creditsTier">Free</span>
                        <span class="credits-count"><span id="creditsUsed">0</span> / <span id="creditsTotal">50</span> credits</span>
                    </div>
                    <div class="credits-bar-track">
                        <div class="credits-bar-fill" id="creditsBarFill"></div>
                    </div>
                    <div class="context-info">
                        <span class="context-label">Context:</span>
                        <span class="context-count"><span id="contextUsed">0</span> / <span id="contextTotal">4K</span></span>
                        <div class="context-bar-track">
                            <div class="context-bar-fill" id="contextBarFill"></div>
                        </div>
                    </div>
                    <button class="credits-upgrade-btn" id="creditsUpgradeBtn">Upgrade</button>
                </div>

                <!-- Upgrade Modal -->
                <div class="ai-upgrade-modal" id="aiUpgradeModal" style="display: none;">
                    <div class="upgrade-content">
                        <button class="upgrade-close-x" id="upgradeCloseX">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                        <div class="upgrade-header">
                            <h3>Nâng cấp kế hoạch</h3>
                            <p>Mở khóa sức mạnh AI không giới hạn</p>
                        </div>
                        <div class="upgrade-tiers">
                            <div class="upgrade-tier" data-tier="free">
                                <div class="tier-icon">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                </div>
                                <div class="tier-name">Free</div>
                                <div class="tier-price"><span class="price-amount">$0</span><span class="price-period">/tháng</span></div>
                                <div class="tier-divider"></div>
                                <ul class="tier-features">
                                    <li>Xem models có sẵn</li>
                                    <li>Context 4K tokens</li>
                                    <li>Không sử dụng được DeepCode Server 2</li>
                                    <li>Hỗ trợ cơ bản</li>
                                </ul>
                                <button class="tier-btn" data-tier="free">Đang dùng</button>
                            </div>
                            <div class="upgrade-tier pro" data-tier="pro">
                                <div class="tier-badge">Phổ biến nhất</div>
                                <div class="tier-icon">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                </div>
                                <div class="tier-name">PRO</div>
                                <div class="tier-price"><span class="price-amount">$19</span><span class="price-period">/tháng</span></div>
                                <div class="tier-divider"></div>
                                <ul class="tier-features">
                                    <li>10 lượt/ngày</li>
                                    <li>2000 lượt/tháng</li>
                                    <li>Context 32K tokens</li>
                                    <li>DeepCode Server 2</li>
                                    <li>Hỗ trợ ưu tiên</li>
                                </ul>
                                <button class="tier-btn primary" data-tier="pro">Nâng cấp ngay</button>
                            </div>
                            <div class="upgrade-tier premium" data-tier="premium">
                                <div class="tier-badge">Cao cấp</div>
                                <div class="tier-icon">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                                </div>
                                <div class="tier-name">Premium</div>
                                <div class="tier-price"><span class="price-amount">$49</span><span class="price-period">/tháng</span></div>
                                <div class="tier-divider"></div>
                                <ul class="tier-features">
                                    <li>5000 lượt/tháng</li>
                                    <li>Context 64K tokens</li>
                                    <li>DeepCode Server 2</li>
                                    <li>Tất cả models</li>
                                    <li>Hỗ trợ ưu tiên cao</li>
                                </ul>
                                <button class="tier-btn" data-tier="premium">Nâng cấp ngay</button>
                            </div>
                            <div class="upgrade-tier business" data-tier="business">
                                <div class="tier-icon">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                                </div>
                                <div class="tier-name">Business</div>
                                <div class="tier-price"><span class="price-amount">$99</span><span class="price-period">/tháng</span></div>
                                <div class="tier-divider"></div>
                                <ul class="tier-features">
                                    <li>100000 lượt/tháng</li>
                                    <li>Context 128K tokens</li>
                                    <li>DeepCode Server 2</li>
                                    <li>Tất cả models + Priority</li>
                                    <li>Hỗ trợ dedicated</li>
                                </ul>
                                <button class="tier-btn" data-tier="business">Nâng cấp ngay</button>
                            </div>
                        </div>
                        <button class="upgrade-close" id="upgradeClose">Đóng</button>
                    </div>
                </div>

                <!-- Auth Panel -->
                <div class="ai-auth-panel" id="aiAuthPanel">
                    <div class="auth-welcome">
                        <div class="ai-avatar">
                            <svg width="40" height="40" viewBox="0 0 128 128">
                                <defs>
                                    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" style="stop-color:#7c5cfc"/>
                                        <stop offset="100%" style="stop-color:#a78bfa"/>
                                    </linearGradient>
                                </defs>
                                <rect x="28" y="32" width="72" height="60" rx="16" fill="url(#avatarGrad)"/>
                                <rect x="36" y="40" width="56" height="44" rx="10" fill="#1a1828"/>
                                <ellipse cx="50" cy="56" rx="8" ry="9" fill="#7c5cfc"/>
                                <ellipse cx="50" cy="54" rx="4" ry="5" fill="white"/>
                                <path d="M66 52 Q74 48 82 52" stroke="#7c5cfc" stroke-width="4" fill="none" stroke-linecap="round"/>
                                <path d="M52 70 Q64 80 76 70" stroke="#7c5cfc" stroke-width="3" fill="none" stroke-linecap="round"/>
                            </svg>
                        </div>
                        <h3>DeepCode</h3>
                        <p>Đăng nhập để sử dụng AI</p>
                    </div>

                    <button id="googleLoginBtn" style="width:100%;padding:10px 14px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:10px;">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        Đăng nhập với Google
                    </button>

                    <button id="githubLoginBtn" style="width:100%;padding:10px 14px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:10px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                        Đăng nhập với GitHub
                    </button>

                    <p class="auth-error" id="authError" style="display: none;"></p>
                </div>

                <!-- Chat Panel (shown when logged in) -->
                <div class="ai-chat-panel" id="aiChatPanel" style="display: none;">
                    <div class="ai-messages" id="aiMessages">
                        <div class="ai-welcome">
                            <div class="ai-suggestions">
                                <button class="ai-suggestion-btn" data-query="/context">Xem context</button>
                                <button class="ai-suggestion-btn" data-query="/reset">Chat mới</button>
                                <button class="ai-suggestion-btn" data-query="/help">Lệnh</button>
                            </div>
                        </div>
                    </div>
                    <div class="ai-attachments" id="aiAttachments" style="display:none;"></div>
                    <div class="ai-slash-menu" id="aiSlashMenu" style="display:none;">
                        <div class="slash-menu-item" data-cmd="/reset">
                            <span class="slash-cmd">/reset</span>
                            <span class="slash-desc">Bắt đầu chat mới</span>
                        </div>
                        <div class="slash-menu-item" data-cmd="/context">
                            <span class="slash-cmd">/context</span>
                            <span class="slash-desc">Xem context đang gửi cho AI</span>
                        </div>
                        <div class="slash-menu-item" data-cmd="/clear">
                            <span class="slash-cmd">/clear</span>
                            <span class="slash-desc">Xóa toàn bộ lịch sử chat</span>
                        </div>
                        <div class="slash-menu-item" data-cmd="/help">
                            <span class="slash-cmd">/help</span>
                            <span class="slash-desc">Xem danh sách lệnh</span>
                        </div>
                        <div class="slash-menu-item" data-cmd="/token">
                            <span class="slash-cmd">/token</span>
                            <span class="slash-desc">Xem thống kê tokens</span>
                        </div>
                    </div>
                    <div class="ai-input-area">
                        <div class="ai-model-select" id="aiModelSelect">
                            <select id="aiModelDropdown"></select>
                            <span class="ai-auto-badge" id="aiAutoBadge" style="display:none;" title="AI tự động chấp nhận">⚡ Auto</span>
                        </div>
                        <div class="ai-input-wrapper">
                            <button class="ai-attach-btn" id="aiAttachBtn" title="Đính kèm file">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                                </svg>
                            </button>
                            <textarea id="aiInput" placeholder="Nhập tin nhắn hoặc / để xem lệnh..." rows="1"></textarea>
                            <button class="ai-send-btn" id="aiSendBtn">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="22" y1="2" x2="11" y2="13"/>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            </button>
                        </div>
                        <input type="file" id="aiFileInput" multiple accept="*/*" style="display:none;">
                    </div>
                </div>
            </div>
        `;
    }

    showLoginUI() {
        document.getElementById('aiAuthPanel').style.display = 'flex';
        document.getElementById('aiChatPanel').style.display = 'none';
        document.getElementById('aiCreditsBar').style.display = 'none';
    }

    showLoggedInUI(user) {
        document.getElementById('aiAuthPanel').style.display = 'none';
        document.getElementById('aiChatPanel').style.display = 'flex';
        document.getElementById('aiCreditsBar').style.display = 'flex';
        this.updateCreditsDisplay();
        this.loadModels();
        this.updateAutoBadge();
    }

    updateAutoBadge() {
        const badge = document.getElementById('aiAutoBadge');
        if (!badge) return;
        const filePerm = localStorage.getItem('deepcode-file-perm') || 'ask';
        const termPerm = localStorage.getItem('deepcode-term-perm') || 'ask';
        badge.style.display = (filePerm === 'auto' || termPerm === 'auto') ? 'inline' : 'none';
    }

    updateCreditsDisplay() {
        if (!this.credits) return;
        const tier = this.credits.tier || 'free';
        const tierNames = { free: 'Free', pro: 'PRO', premium: 'Premium', business: 'Business' };
        document.getElementById('creditsTier').textContent = tierNames[tier] || tier;

        const used = this.credits.creditsUsed || 0;
        const perDay = this.credits.creditsPerDay || 0;

        document.getElementById('creditsUsed').textContent = used;
        document.getElementById('creditsTotal').textContent = perDay === 999999 ? '∞' : perDay;
        const percent = perDay === 999999 ? 0 : (used / perDay) * 100;
        document.getElementById('creditsBarFill').style.width = `${Math.min(100, percent)}%`;

        const tierMaxCtx = { free: 4096, pro: 32768, premium: 65536, business: 128000 };
        const _tier = this.credits?.tier || 'free';
        const _tierMax = tierMaxCtx[_tier] || 4096;
        const maxCtx = _tierMax;
        const usedCtx = this._estimateTokens(this.history);
        const ctxPercent = Math.min(100, (usedCtx / maxCtx) * 100);
        const ctxLabel = maxCtx >= 1000 ? `${Math.round(maxCtx / 1000)}K` : maxCtx;
        document.getElementById('contextUsed').textContent = usedCtx >= 1000 ? `${Math.round(usedCtx / 1000)}K` : usedCtx;
        document.getElementById('contextTotal').textContent = ctxLabel;
        document.getElementById('contextBarFill').style.width = `${ctxPercent}%`;

        const fill = document.getElementById('contextBarFill');
        fill.className = 'context-bar-fill';
        if (ctxPercent > 80) fill.classList.add('danger');
        else if (ctxPercent > 60) fill.classList.add('warning');
    }

    async refreshGatewayCredits() {
        try {
            const data = await window.api.gateway.credits();
            if (data && data.success) {
                this.credits = {
                    tier: data.tier || 'free',
                    creditsUsed: data.credits.limit - data.credits.remaining,
                    creditsPerDay: 0,
                    creditsPerMonth: data.credits.limit || 100,
                    remaining: data.credits.remaining,
                    resetAt: data.credits.resetAt,
                    tokensUsed: data.tokensUsed || 0,
                    requestsToday: data.requestsToday || 0,
                };
                this.updateCreditsDisplay();
            }
        } catch (e) {
            console.warn('Gateway credits fetch failed:', e.message);
        }
    }

    async loadModels() {
        const dropdown = document.getElementById('aiModelDropdown');
        const defaultModels = [
            { id: 'deepcode-go', name: 'DeepCode' },
            { id: 'deepcode-pro', name: 'DeepCode Pro' },
            { id: 'deepcode-ultra', name: 'DeepCode Ultra' },
        ];

        const providerOrder = ['DeepCode', 'GitHub', 'OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek', 'Mistral', 'Cohere', 'xAI', 'Alibaba', 'Baidu', 'ByteDance', 'Zhipu', '01.AI', 'Other'];

        const getProvider = (id) => {
            const lower = id.toLowerCase();
            if (lower.startsWith('deepcode')) return 'DeepCode';
            if (lower.startsWith('github:')) return 'GitHub';
            if (lower.startsWith('openai') || lower.startsWith('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return 'OpenAI';
            if (lower.startsWith('anthropic') || lower.startsWith('claude')) return 'Anthropic';
            if (lower.startsWith('google') || lower.startsWith('gemini')) return 'Google';
            if (lower.startsWith('meta') || lower.startsWith('llama')) return 'Meta';
            if (lower.startsWith('deepseek')) return 'DeepSeek';
            if (lower.startsWith('mistral') || lower.startsWith('mixtral')) return 'Mistral';
            if (lower.startsWith('cohere') || lower.startsWith('command')) return 'Cohere';
            if (lower.startsWith('x-ai') || lower.startsWith('grok')) return 'xAI';
            if (lower.startsWith('alibaba') || lower.startsWith('qwen')) return 'Alibaba';
            if (lower.startsWith('baidu') || lower.startsWith('ernie')) return 'Baidu';
            if (lower.startsWith('bytedance') || lower.startsWith('doubao')) return 'ByteDance';
            if (lower.startsWith('zhipu') || lower.startsWith('glm') || lower.startsWith('chatglm')) return 'Zhipu';
            if (lower.startsWith('01-ai') || lower.startsWith('yi')) return '01.AI';
            const slash = id.indexOf('/');
            if (slash > 0) return id.substring(0, slash);
            return 'Other';
        };

        const cleanName = (id) => {
            if (id.startsWith('github:')) return id.replace('github:', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const slash = id.indexOf('/');
            const raw = slash > 0 ? id.substring(slash + 1) : id;
            return raw.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        };

        const buildGroupedOptions = (models) => {
            const groups = {};
            for (const m of models) {
                const provider = getProvider(m.id);
                if (!groups[provider]) groups[provider] = [];
                groups[provider].push(m);
            }
            let html = '';
            for (const provider of providerOrder) {
                const items = groups[provider];
                if (!items || items.length === 0) continue;
                items.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
                html += `<optgroup label="${provider}">`;
                for (const m of items) {
                    html += `<option value="${m.id}">${m.name || cleanName(m.id)}</option>`;
                }
                html += '</optgroup>';
            }
            return html;
        };

        const applyModels = (models) => {
            if (!dropdown) return;
            if (models.length <= 3) {
                dropdown.innerHTML = models.map(m =>
                    `<option value="${m.id}">${m.name || m.id}</option>`
                ).join('');
            } else {
                dropdown.innerHTML = buildGroupedOptions(models);
            }
            const savedModel = localStorage.getItem('deepcode-default-model');
            if (savedModel && dropdown.querySelector(`option[value="${savedModel}"]`)) {
                dropdown.value = savedModel;
                this.currentModel = savedModel;
            }
        };

        const cached = localStorage.getItem('deepcode-cached-models');
        if (cached) {
            try {
                applyModels(JSON.parse(cached));
            } catch {}
        } else {
            applyModels(defaultModels);
        }

        try {
            const result = await window.deepcodeClient.getModels();
            const models = Array.isArray(result) ? result : (result?.models || []);
            if (models.length > 0) {
                localStorage.setItem('deepcode-cached-models', JSON.stringify(models));
                applyModels(models);
            }
        } catch (e) {
            console.error('Failed to load models:', e);
            if (!cached) applyModels(defaultModels);
        }
        this.loadRtkStats();
    }

    async loadRtkStats() {
        try {
            const res = await fetch(`${getApiUrl()}/api/rtk/stats`);
            const data = await res.json();
            if (data.available && data.stats) {
                const row = document.getElementById('rtkStatsRow');
                if (row) {
                    row.style.display = 'flex';
                    if (typeof data.stats === 'object') {
                        const saved = data.stats.tokensSaved || 0;
                        const percent = data.stats.savingPercent || 0;
                        const time = data.stats.avgExecTime || 0;
                        document.getElementById('tokenSavedValue').textContent = saved.toLocaleString();
                        document.getElementById('tokenPercentValue').textContent = `${percent}%`;
                        document.getElementById('tokenTimeValue').textContent = `${time}ms`;
                        document.getElementById('tokenProgressFill').style.width = `${Math.min(100, percent)}%`;
                    } else {
                        document.getElementById('tokenSavedValue').textContent = data.stats;
                    }
                }
            }
        } catch {}
    }

    setupEvents() {
        this.attachedFiles = [];
        this.currentModel = localStorage.getItem('deepcode-default-model') || 'deepcode-go';

        document.getElementById('aiModelDropdown')?.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            localStorage.setItem('deepcode-default-model', e.target.value);
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('#aiSendBtn') || e.target.closest('.ai-send-btn')) {
                const textarea = document.querySelector('#aiInput') || document.querySelector('#aiColumn textarea');
                if (textarea && textarea.value.trim()) {
                    this.handleInput(textarea.value.trim()).catch(err => console.error('handleInput error:', err));
                    textarea.value = '';
                    textarea.style.height = 'auto';
                }
            }
            if (e.target.closest('#aiAttachBtn')) {
                document.getElementById('aiFileInput')?.click();
            }
            if (e.target.closest('.slash-menu-item')) {
                const cmd = e.target.closest('.slash-menu-item').dataset.cmd;
                const textarea = document.querySelector('#aiInput');
                if (textarea) {
                    textarea.value = cmd + ' ';
                    textarea.focus();
                }
                document.getElementById('aiSlashMenu').style.display = 'none';
            }
            if (e.target.closest('.attachment-remove')) {
                const idx = parseInt(e.target.closest('.attachment-remove').dataset.idx);
                this.attachedFiles.splice(idx, 1);
                this.renderAttachments();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.target.tagName === 'TEXTAREA') {
                e.preventDefault();
                const textarea = e.target;
                if (textarea.value.trim()) {
                    this.handleInput(textarea.value.trim()).catch(err => console.error('handleInput error:', err));
                    textarea.value = '';
                    textarea.style.height = 'auto';
                }
            }
            if (e.key === 'Escape') {
                document.getElementById('aiSlashMenu').style.display = 'none';
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target.tagName === 'TEXTAREA') {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                const val = e.target.value;
                const slashMenu = document.getElementById('aiSlashMenu');
                if (val === '/' || (val.startsWith('/') && val.length < 10 && !val.includes(' '))) {
                    slashMenu.style.display = 'flex';
                } else {
                    slashMenu.style.display = 'none';
                }
            }
        });

        document.getElementById('aiFileInput')?.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            for (const file of files) {
                this.attachedFiles.push({ name: file.name, size: file.size, type: file.type, file });
            }
            this.renderAttachments();
            e.target.value = '';
        });

        // Listen for auth callback from main process (legacy GitHub auth)
        if (window.electronAPI?.onGithubAuth) {
            window.electronAPI.onGithubAuth(async (data) => {
                try {
                    const client = window.deepcodeClient;
                    client.token = data.token;
                    client.user = data.user;
                    localStorage.setItem('deepcode-token', data.token);
                    await this.checkAuth();
                } catch (e) {
                    console.error('Auth callback error:', e.message);
                    this.showLoginUI();
                }
            });
        }

        // Listen for Firebase OAuth callback
        if (window.electronAPI?.onOAuthCallback) {
            window.electronAPI.onOAuthCallback(async (data) => {
                const errorEl = document.getElementById('authError');
                if (data.error) {
                    if (errorEl) {
                        errorEl.textContent = 'Đăng nhập thất bại: ' + data.error;
                        errorEl.style.display = 'block';
                    }
                    return;
                }
                try {
                    const fb = window.firebaseAuth;
                    if (data.provider === 'google' && data.idToken) {
                        await fb.signInWithGoogle(data.idToken);
                    } else if (data.provider === 'github' && data.accessToken) {
                        await fb.signInWithGitHub(data.accessToken);
                    }
                    fb.saveSession();
                    await this.checkAuth();
                } catch (e) {
                    console.error('Firebase OAuth error:', e.message);
                    if (errorEl) {
                        errorEl.textContent = 'Lỗi xác thực: ' + e.message;
                        errorEl.style.display = 'block';
                    }
                }
            });
        }

        // Mode toggle
        document.querySelectorAll('.ai-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ai-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.set('aiMode', btn.dataset.mode);
            });
        });

        // Chat input
        const input = document.getElementById('aiInput');
        const sendBtn = document.getElementById('aiSendBtn');

        input?.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        sendBtn?.addEventListener('click', () => {
            console.log('Send button clicked');
            this.sendMessage().catch(err => console.error('sendMessage error:', err));
        });

        // Suggestions
        document.querySelectorAll('.ai-suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.query;
                this.sendMessage();
            });
        });

        // Upgrade
        document.getElementById('creditsUpgradeBtn')?.addEventListener('click', () => {
            document.getElementById('aiUpgradeModal').style.display = 'flex';
        });

        document.getElementById('upgradeClose')?.addEventListener('click', () => {
            document.getElementById('aiUpgradeModal').style.display = 'none';
        });

        document.getElementById('upgradeCloseX')?.addEventListener('click', () => {
            document.getElementById('aiUpgradeModal').style.display = 'none';
        });

        document.querySelectorAll('.tier-btn[data-tier]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tier = btn.dataset.tier;
                try {
                    if (getProvider() === 'atxp') {
                        await window.deepcodeClient.setTier(tier);
                    } else {
                        await window.deepcodeClient.upgradeTier(tier);
                    }
                    this.refreshGatewayCredits();
                    document.getElementById('aiUpgradeModal').style.display = 'none';
                    await this.loadModels();
                } catch (e) {
                    console.error('Upgrade failed:', e);
                }
            });
        });

        // Suggestions click
        document.querySelectorAll('.ai-suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('aiInput');
                input.value = btn.dataset.query;
                this.sendMessage();
            });
        });

        // Firebase OAuth login
        const errorEl = document.getElementById('authError');

        document.getElementById('googleLoginBtn')?.addEventListener('click', async () => {
            errorEl.style.display = 'none';
            try {
                if (window.electronAPI?.oauthGoogle) {
                    window.electronAPI.oauthGoogle();
                } else {
                    errorEl.textContent = 'Google login chưa khả dụng';
                    errorEl.style.display = 'block';
                }
            } catch (e) {
                errorEl.textContent = 'Lỗi kết nối Google';
                errorEl.style.display = 'block';
            }
        });

        document.getElementById('githubLoginBtn')?.addEventListener('click', async () => {
            errorEl.style.display = 'none';
            try {
                if (window.electronAPI?.oauthGitHub) {
                    window.electronAPI.oauthGitHub();
                } else {
                    errorEl.textContent = 'GitHub login chưa khả dụng';
                    errorEl.style.display = 'block';
                }
            } catch (e) {
                errorEl.textContent = 'Lỗi kết nối GitHub';
                errorEl.style.display = 'block';
            }
        });
    }

    async getProjectContext() {
        const limits = this.credits?.contextLimits || { treeDepth: 3, maxTreeItems: 40, maxFileSize: 3000, maxImportantFiles: 5, maxSourceFiles: 5 };
        const parts = [];
        const workspaceRoot = this.state.get('workspaceRoot');
        const activeFile = this.state.get('activeFile');

        if (workspaceRoot) {
            try {
                const gnContext = await this._getGitNexusContext(workspaceRoot);
                if (gnContext) {
                    parts.push(gnContext);
                } else {
                    const tree = await this._buildSmartTree(workspaceRoot, limits);
                    if (tree) {
                        parts.push(`## Project Structure (${workspaceRoot})\n${tree}`);
                    }

                    const important = await this._readImportantFiles(workspaceRoot, limits);
                    if (important) parts.push(important);

                    const sourceFiles = await this._readKeySourceFiles(workspaceRoot, limits);
                    if (sourceFiles) parts.push(sourceFiles);
                }
            } catch (e) {
                console.warn('Failed to read project context:', e.message);
            }
        }

        if (activeFile) {
            try {
                const content = await window.api.fs.readFile(activeFile);
                if (content) {
                    const maxLen = limits.maxFileSize;
                    const truncated = content.length > maxLen ? content.slice(0, maxLen) + '\n... (truncated)' : content;
                    const fileName = activeFile.split(/[\\/]/).pop();
                    parts.push(`## Current File: ${fileName}\n\`\`\`\n${truncated}\n\`\`\``);
                }
            } catch (e) {
                console.warn('Failed to read active file:', e.message);
            }
        }

        return parts.join('\n\n');
    }

    async _readImportantFiles(workspaceRoot, limits) {
        const importantNames = [
            'package.json', 'tsconfig.json', 'pyproject.toml', 'setup.py',
            'Cargo.toml', 'go.mod', 'README.md', 'AGENTS.md', 'CLAUDE.md',
        ].slice(0, limits.maxImportantFiles);
        const contents = [];
        for (const name of importantNames) {
            try {
                const filePath = workspaceRoot + '\\' + name;
                const content = await window.api.fs.readFile(filePath);
                if (content) {
                    const truncated = content.length > 1500 ? content.slice(0, 1500) + '\n...' : content;
                    contents.push(`### ${name}\n\`\`\`\n${truncated}\n\`\`\``);
                }
            } catch {}
        }
        return contents.join('\n\n');
    }

    async _getGitNexusContext(projectPath) {
        try {
            const apiClient = window.deepcodeClient;
            if (!apiClient?.isLoggedIn()) return null;

            const statusRes = await fetch(`${getApiUrl()}/api/gitnexus/status?projectPath=${encodeURIComponent(projectPath)}`, {
                headers: { 'Authorization': `Bearer ${apiClient.token}` }
            });
            const status = await statusRes.json();

            if (!status.available) return null;

            if (!status.analyzed) {
                console.log('[GitNexus] Analyzing project...');
                await fetch(`${getApiUrl()}/api/gitnexus/analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiClient.token}` },
                    body: JSON.stringify({ projectPath })
                });
            }

            const repoName = projectPath.split(/[\\/]/).pop();
            const ctxRes = await fetch(`${getApiUrl()}/api/gitnexus/context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiClient.token}` },
                body: JSON.stringify({ projectPath: repoName, query: 'project overview architecture' })
            });
            const ctxData = await ctxRes.json();

            if (ctxData.context) {
                try {
                    const parsed = JSON.parse(ctxData.context);
                    if (parsed.symbol) {
                        let result = `## GitNexus: ${parsed.symbol.name}\n`;
                        result += `**Type:** ${parsed.symbol.kind}\n`;
                        result += `**File:** ${parsed.symbol.filePath}\n`;
                        if (parsed.outgoing?.has_method) {
                            result += `\n### Methods (${parsed.outgoing.has_method.length}):\n`;
                            parsed.outgoing.has_method.forEach(m => {
                                result += `- \`${m.name}\` (${m.filePath})\n`;
                            });
                        }
                        return result;
                    }
                } catch {}
                return `## GitNexus Context\n${ctxData.context}`;
            }
        } catch (e) {
            console.warn('[GitNexus] Context failed:', e.message);
        }
        return null;
    }

    async _readKeySourceFiles(workspaceRoot, limits) {
        const maxFiles = limits.maxSourceFiles || 5;
        const sourceExts = new Set(['.py', '.js', '.ts', '.jsx', '.tsx', '.vue']);
        const ignoredDirs = new Set([
            'node_modules', '.git', '__pycache__', '.venv', 'venv',
            'dist', 'build', '.next', 'coverage', 'vendor', 'target',
        ]);
        const found = [];

        const walk = async (dir, depth) => {
            if (depth > 4 || found.length >= maxFiles) return;
            let items;
            try {
                items = await window.api.fs.readDirectory(dir);
            } catch { return; }

            const dirs = [];
            for (const item of items) {
                if (found.length >= maxFiles) break;
                if (item.name.startsWith('.') || ignoredDirs.has(item.name)) continue;

                if (item.isDirectory) {
                    dirs.push(item);
                } else {
                    const ext = '.' + item.name.split('.').pop().toLowerCase();
                    if (!sourceExts.has(ext)) continue;
                    try {
                        const content = await window.api.fs.readFile(item.path);
                        if (content && content.trim().length > 30) {
                            const maxLen = limits.maxFileSize || 3000;
                            const truncated = content.length > maxLen ? content.slice(0, maxLen) + '\n... (truncated)' : content;
                            const relPath = item.path.replace(workspaceRoot, '').replace(/^[\\/]/, '');
                            found.push(`### ${relPath}\n\`\`\`\n${truncated}\n\`\`\``);
                        }
                    } catch {}
                }
            }

            for (const d of dirs) {
                if (found.length >= maxFiles) break;
                await walk(d.path, depth + 1);
            }
        };

        await walk(workspaceRoot, 0);
        if (found.length === 0) return null;
        return `## Source Files\n${found.join('\n\n')}`;
    }

    async _buildSmartTree(dirPath, limits) {
        const ignoredDirs = new Set([
            'node_modules', '.git', '__pycache__', '.venv', 'venv',
            'dist', 'build', '.next', 'coverage', 'vendor', 'target',
        ]);
        const ignoredExt = new Set([
            '.exe', '.dll', '.png', '.jpg', '.gif', '.svg', '.ico',
            '.mp3', '.mp4', '.zip', '.tar', '.gz', '.pdf',
        ]);

        const lines = [];
        let count = 0;

        const walk = async (dir, prefix, depth) => {
            if (depth > limits.treeDepth || count >= limits.maxTreeItems) return;
            let items;
            try {
                items = await window.api.fs.readDirectory(dir);
            } catch { return; }

            const filtered = items
                .filter(item => {
                    if (item.name.startsWith('.')) return false;
                    if (ignoredDirs.has(item.name)) return false;
                    if (!item.isDirectory) {
                        const ext = '.' + item.name.split('.').pop().toLowerCase();
                        if (ignoredExt.has(ext)) return false;
                    }
                    return true;
                })
                .sort((a, b) => {
                    if (a.isDirectory !== b.isDirectory) return b.isDirectory - a.isDirectory;
                    return a.name.localeCompare(b.name);
                })
                .slice(0, limits.maxTreeItems - count);

            for (let i = 0; i < filtered.length; i++) {
                const item = filtered[i];
                const isLast = i === filtered.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                lines.push(`${prefix}${connector}${item.name}${item.isDirectory ? '/' : ''}`);
                count++;

                if (item.isDirectory) {
                    const subPrefix = prefix + (isLast ? '    ' : '│   ');
                    await walk(item.path, subPrefix, depth + 1);
                }
            }
        };

        await walk(dirPath, '', 0);
        return lines.join('\n');
    }

    renderAttachments() {
        const container = document.getElementById('aiAttachments');
        if (!container) return;
        if (!this.attachedFiles || this.attachedFiles.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }
        container.style.display = 'flex';
        container.innerHTML = this.attachedFiles.map((f, i) => {
            const icon = f.type?.startsWith('image/') ? '🖼️' : '📄';
            const size = f.size > 1024 ? Math.round(f.size / 1024) + 'KB' : f.size + 'B';
            return `<div class="attachment-item">
                <span class="attachment-icon">${icon}</span>
                <span class="attachment-name">${f.name}</span>
                <span class="attachment-size">${size}</span>
                <button class="attachment-remove" data-idx="${i}">✕</button>
            </div>`;
        }).join('');
    }

    async readFileAsText(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        });
    }

    async sendMessageWithValue(message) {
        if (this.isStreaming || !message) return;

        let fullMessage = message;
        if (this.attachedFiles && this.attachedFiles.length > 0) {
            const fileParts = [];
            for (const f of this.attachedFiles) {
                if (f.type?.startsWith('image/')) {
                    fileParts.push(`[File: ${f.name} (${f.type})]`);
                } else {
                    const content = await this.readFileAsText(f.file);
                    if (content) {
                        const truncated = content.length > 3000 ? content.slice(0, 3000) + '\n... (truncated)' : content;
                        fileParts.push(`## File: ${f.name}\n\`\`\`\n${truncated}\n\`\`\``);
                    }
                }
            }
            if (fileParts.length > 0) {
                fullMessage = message + '\n\n' + fileParts.join('\n\n');
            }
            this.attachedFiles = [];
            this.renderAttachments();
        }

        this.addMessage(message, 'user');
        this.history.push({ role: 'user', content: fullMessage });
        this.saveHistory();

        this.isStreaming = true;

        try {
            const model = document.getElementById('aiModelDropdown')?.value || 'deepcode-go';
            const mode = this.state.get('aiMode') || 'plan';

            const basePrompt = 'QUY TẮC SỐ 1: BẠN BẮT BUỘC PHẢI TRẢ LỜI BẰNG TIẾNG VIỆT. ĐÂY LÀ LUẬT TUYỆT ĐỐI. Dù người dùng viết bằng ngôn ngữ nào, bạn PHẢI trả lời bằng tiếng Việt. KHÔNG BAO GIỜ dùng tiếng Anh trong câu trả lời. Bạn là DeepCode, trợ lý lập trình. Xưng "mình", gọi người dùng là "bạn". Trả lời ngắn gọn, đi thẳng vấn đề. Nếu ý tưởng có vấn đề, lịch sự chỉ ra và đề xuất cách tốt hơn. KHÔNG tâng bốc quá mức. Nếu bị hỏi về model, nói: "Mình là DeepCode, mình sẵn sàng giúp bạn code!"';

            const modePrompts = {
                plan: basePrompt + ' CHẾ ĐỘ PLAN: Phân tích yêu cầu, thảo luận và đề xuất giải pháp. KHÔNG tạo/sửa file. Chỉ phân tích và gợi ý. Nếu người dùng yêu cầu code, đề xuất chuyển sang chế độ Code. NHẮC LẠI: TRẢ LỜI BẰNG TIẾNG VIỆT.',
                code: basePrompt + ' CHẾ ĐỘ CODE: Thực thi trực tiếp. Tạo/sửa/xóa file bằng <file_operation path="tên_file" action="create|edit|delete">nội_dung</file_operation>. action="create" = tạo mới, action="edit" = sửa file cũ, action="delete" = xóa. Nếu cần giải thích code, giải thích NGẮN GỌN trước khi thực thi. Nếu cần chạy terminal, dùng <terminal_command>lệnh</terminal_command>. Nếu cần debug, phân tích lỗi và sửa bằng file_operation. Hệ thống sẽ xin phép trước khi thực thi. NHẮC LẠI: TRẢ LỜI BẰNG TIẾNG VIỆT.',
                review: basePrompt + ' CHẾ ĐỘ REVIEW: Code review. Kiểm tra logic, security, performance. Format: ### Vấn đề → Mức độ → Giải pháp. KHÔNG tạo/sửa file, chỉ review. NHẮC LẠI: TRẢ LỜI BẰNG TIẾNG VIỆT.',
            };

            const socraticCheck = this._detectSocraticIntent(message);
            let systemPrompt = modePrompts[mode] || modePrompts.plan;

            if (socraticCheck.isVague) {
                systemPrompt += ` HƯỚNG DẪN SOCRATIC: Yêu cầu của người dùng mơ hồ. Hãy HỎI LẠI 2-3 câu cụ thể trước khi hành động. Ví dụ: "${socraticCheck.suggestion}"`;
            }

            systemPrompt += ' ANTI-SYCOPHANCY: Nếu người dùng đề xuất giải pháp có vấn đề, hãy challenge một cách lịch sự. Chỉ ra rủi ro, đề xuất thay thế tốt hơn. KHÔNG luôn đồng ý.';
            systemPrompt += ` STYLE PROFILE: Phong cách coding của user: ${this._getStyleHint()}.`;

            const tierMaxContext = { free: 4096, pro: 32768, premium: 65536, business: 128000 };
            const tier = this.credits?.tier || 'free';
            const tierMax = tierMaxContext[tier] || 4096;
            const maxContext = tierMax;
            const resetLimit = tier === 'premium' || tier === 'business' ? Infinity : (tier === 'pro' ? 30 : 5);
            const resetCount = parseInt(localStorage.getItem('deepcode-reset-count') || '0');
            const shouldReset = this._estimateTokens(this.history) > maxContext * 0.7;

            let conversationHistory = this.history.slice(-10);
            if (shouldReset && this.history.length > 4) {
                if (resetCount >= resetLimit) {
                    this.addMessage(`[Đã hết lượt reset context (${resetLimit} lần). Vui lòng tạo cuộc trò chuyện mới bằng lệnh /reset]`, 'system');
                } else {
                    this._saveCurrentSession();
                    // Smart context compaction (học từ OpenCode)
                    // 1. Extract key decisions and code from earlier messages
                    const earlier = this.history.slice(0, -4);
                    const decisions = earlier
                        .filter(m => m.role === 'user')
                        .map(m => m.content.slice(0, 100))
                        .slice(-3);
                    const codeSnippets = earlier
                        .filter(m => m.role === 'assistant' && (m.content.includes('```') || m.content.includes('file_operation')))
                        .map(m => {
                            const match = m.content.match(/```[\s\S]{0,200}/);
                            return match ? match[0].slice(0, 150) : null;
                        })
                        .filter(Boolean)
                        .slice(-2);
                    // 2. Build rich summary
                    const summaryParts = [];
                    if (decisions.length > 0) summaryParts.push(`Yêu cầu: ${decisions.join(' | ')}`);
                    if (codeSnippets.length > 0) summaryParts.push(`Code đã viết: ${codeSnippets.join(' ... ')}`);
                    const summary = summaryParts.join('\n') || earlier.filter(m => m.role === 'user').slice(0, 2).map(m => m.content.slice(0, 60)).join('; ');
                    // 3. Keep last 4 messages (more context than before)
                    conversationHistory = [
                        { role: 'system', content: `[Cuộc trò chuyện trước — tóm tắt:\n${summary}]` },
                        ...this.history.slice(-4),
                    ];
                    localStorage.setItem('deepcode-reset-count', String(resetCount + 1));
                    this._showResetNotice();
                }
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
            ];

            const apiMessages = messages.map((m, i) => {
                if (i === messages.length - 1 && m.role === 'user') {
                    return { ...m, content: '[QUY TẮC: Trả lời BẰNG TIẾNG VIỆT] ' + m.content };
                }
                return m;
            });

            const responseEl = this.addMessage('', 'assistant');
            this.showTypingIndicator();
            const client = window.deepcodeClient;

            // Tự động phát hiện yêu cầu review project
            const isReviewRequest = this._isReviewRequest(message);
            let useReviewModel = false;
            let reviewSystemPrompt = '';

            if (isReviewRequest) {
                useReviewModel = true;
                reviewSystemPrompt = 'Bạn là DeepCode Review — chuyên gia code review chuyên nghiệp. TUYỆT ĐỐI trả lời bằng tiếng Việt. PHẢI phân tích dựa trên code và context đã được cung cấp. KHÔNG BAO GIỜ yêu cầu người dùng gửi lại code hoặc cấu trúc project — mọi thông tin đã có trong context. Chỉ ra vấn đề về logic, security, performance, maintainability. Format: ### Vấn đề → Mức độ (Critical/High/Medium/Low) → Giải pháp. Tổng quan project trước khi đi vào chi tiết.';
                apiMessages[0] = { role: 'system', content: reviewSystemPrompt };
            }

            if (window.firebaseAuth && window.firebaseAuth.isLoggedIn()) {
                const projectContext = await this.getProjectContext();
                let fullContent = '';

                if (useReviewModel && projectContext) {
                    apiMessages.unshift({ role: 'system', content: `## CONTEXT PROJECT:\n${projectContext}\n\nDựa trên context project ở trên để phân tích. KHÔNG yêu cầu thêm thông tin.` });
                }

                let response;
                if (useReviewModel) {
                    response = await client.reviewChat(apiMessages, true);
                } else {
                    if (projectContext) {
                        apiMessages.unshift({ role: 'system', content: `## CONTEXT PROJECT:\n${projectContext}` });
                    }
                    response = await client.chat(model, apiMessages, true, projectContext || null);
                }

                if (response._nonStreaming) {
                    fullContent = response.content;
                    this.hideTypingIndicator();
                    this.updateMessage(responseEl, fullContent);
                    // Play notification sound
                    try {
                        const audio = new Audio('../notification.mp3');
                        audio.volume = 0.5;
                        audio.play().catch(() => {});
                    } catch (e) {}
                } else {
                    let buffer = '';
                    const reader = response.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const parts = buffer.split('\n');
                        buffer = parts.pop();
                        for (const part of parts) {
                            const trimmed = part.trim();
                            if (!trimmed || trimmed.startsWith(':')) continue;
                            if (trimmed.startsWith('data:')) {
                                const data = trimmed.slice(5).trim();
                                if (data === '[DONE]') continue;
                                try {
                                    const parsed = JSON.parse(data);
                                    const delta = parsed.choices?.[0]?.delta?.content
                                        || parsed.choices?.[0]?.message?.content
                                        || parsed.content
                                        || parsed.delta?.content
                                        || parsed.candidates?.[0]?.content?.parts?.[0]?.text
                                        || '';
                                    if (delta) {
                                        fullContent += delta;
                                        this.updateMessage(responseEl, fullContent, true);
                                    }
                                } catch (e) {
                                    console.warn('SSE parse error:', e.message, 'data:', data.substring(0, 200));
                                }
                            }
                        }
                    }
                    this.updateMessage(responseEl, fullContent, false);
                }

                // Play notification sound when AI response completes
                try {
                    const audio = new Audio('../notification.mp3');
                    audio.volume = 0.5;
                    audio.play().catch(() => {});
                } catch (e) {}

                const fileOps = this.parseFileOperations(fullContent);
                if (fileOps.length > 0) {
                    await this.requestFilePermission(fileOps);
                }

                const termCmds = this.parseTerminalCommands(fullContent);
                if (termCmds.length > 0) {
                    await this.requestTerminalPermission(termCmds);
                }

                const contextFiles = this._extractContextFiles(projectContext);
                this.history.push({ role: 'assistant', content: fullContent });
                this.saveHistory();
                const tokenUsed = this._estimateTokens([{ content: fullContent }]);
                this.addActivitySummary({
                    fileReads: contextFiles,
                    fileOps: fileOps,
                    termCmds: termCmds,
                    tokensUsed: tokenUsed,
                    charCount: fullContent.length,
                });

                const fb = window.firebaseAuth;
                if (fb && fb.isLoggedIn()) {
                    try {
                        const userData = await fb.getUserData();
                        fb.trackUsage(this.currentModel, fullContent.length);
                    } catch (e) { console.warn('Firebase usage track failed:', e.message); }
                }
                this.refreshGatewayCredits();
                this.updateContextDisplay();
                try { window.api.admin.incrementRequests(); } catch (e) {}
            } else {
                this.updateMessage(responseEl, 'Vui lòng đăng nhập để sử dụng AI.');
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.hideTypingIndicator();
            let errMsg = error.message || 'Không rõ lỗi';
            if (errMsg.includes('model:') || errMsg.includes('model not found') || errMsg.includes('model_not_found')) {
                errMsg = 'Model này không khả dụng. Vui lòng chọn model khác.';
            } else if (errMsg.includes('Free') || errMsg.includes('free')) {
                errMsg = 'Tài khoản Free không hỗ trợ model này. Vui lòng nâng cấp PRO để sử dụng.';
            } else if (errMsg.includes('Rate limit') || errMsg.includes('rate limit')) {
                errMsg = 'Bạn đã vượt quá giới hạn. Vui lòng thử lại sau.';
            } else if (errMsg.includes('Cloudflare') || errMsg.includes('cloudflare')) {
                errMsg = 'Lỗi kết nối Cloudflare. Vui lòng thử lại.';
            } else if (errMsg.includes('ATXP') || errMsg.includes('atxp') || errMsg.includes('provider')) {
                errMsg = 'Lỗi kết nối AI. Vui lòng thử lại.';
            } else if (errMsg.includes('500') || errMsg.includes('Internal Server')) {
                errMsg = 'Server đang gặp sự cố. Vui lòng thử lại sau.';
            } else if (errMsg.includes('Combo not included')) {
                errMsg = 'Model này không có trong gói của bạn. Vui lòng chọn model khác hoặc nâng cấp.';
            } else if (errMsg.includes('Failed to fetch') || errMsg.includes('fetch failed') || errMsg.includes('NetworkError')) {
                errMsg = 'Không thể kết nối server. Vui lòng kiểm tra kết nối mạng.';
            }
            this.addMessage(errMsg, 'system');
        } finally {
            this.isStreaming = false;
        }
    }

    updateContextDisplay() {
        if (!this.credits) return;
        const tierMaxCtx = { free: 4096, pro: 32768, premium: 65536, business: 128000 };
        const _tier = this.credits?.tier || 'free';
        const _tierMax = tierMaxCtx[_tier] || 4096;
        const maxCtx = _tierMax;
        const usedCtx = this._estimateTokens(this.history);
        const ctxPercent = Math.min(100, (usedCtx / maxCtx) * 100);
        const ctxLabel = maxCtx >= 1000 ? `${Math.round(maxCtx / 1000)}K` : maxCtx;
        const usedLabel = usedCtx >= 1000 ? `${Math.round(usedCtx / 1000)}K` : usedCtx;
        document.getElementById('contextUsed').textContent = usedLabel;
        document.getElementById('contextTotal').textContent = ctxLabel;
        document.getElementById('contextBarFill').style.width = `${ctxPercent}%`;
        const fill = document.getElementById('contextBarFill');
        fill.className = 'context-bar-fill';
        if (ctxPercent > 80) fill.classList.add('danger');
        else if (ctxPercent > 60) fill.classList.add('warning');
    }

    _estimateTokens(messages) {
        let chars = 0;
        for (const msg of messages) {
            chars += (msg.content || '').length;
        }
        return Math.ceil(chars / 3);
    }

    _escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _extractContextFiles(context) {
        if (!context) return [];
        const files = [];
        const readFileRegex = /### ([^\n]+)\n```/g;
        let match;
        while ((match = readFileRegex.exec(context)) !== null) {
            const name = match[1].trim();
            if (name && !name.includes('Project Structure') && !name.includes('Current File')) {
                files.push(name);
            }
        }
        const currentFileMatch = context.match(/## Current File: ([^\n]+)/);
        if (currentFileMatch) {
            files.push(currentFileMatch[1].trim() + ' (đang mở)');
        }
        return files;
    }

    addActivitySummary({ fileReads, fileOps, termCmds, tokensUsed, charCount }) {
        const items = [];

        if (fileReads && fileReads.length > 0) {
            items.push(`<div class="activity-item"><span class="activity-icon read"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span class="activity-text">Đọc ${fileReads.length} file: ${fileReads.slice(0, 3).join(', ')}${fileReads.length > 3 ? ` +${fileReads.length - 3}` : ''}</span></div>`);
        }

        if (fileOps && fileOps.length > 0) {
            const creates = fileOps.filter(o => o.action === 'create');
            const edits = fileOps.filter(o => o.action === 'edit');
            const deletes = fileOps.filter(o => o.action === 'delete');
            const parts = [];
            if (creates.length) parts.push(`tạo ${creates.length} file: ${creates.map(o => o.path).join(', ')}`);
            if (edits.length) parts.push(`sửa ${edits.length} file: ${edits.map(o => o.path).join(', ')}`);
            if (deletes.length) parts.push(`xóa ${deletes.length} file: ${deletes.map(o => o.path).join(', ')}`);
            items.push(`<div class="activity-item"><span class="activity-icon write"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span><span class="activity-text">${parts.join('; ')}</span></div>`);
        }

        if (termCmds && termCmds.length > 0) {
            items.push(`<div class="activity-item"><span class="activity-icon term"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></span><span class="activity-text">Chạy ${termCmds.length} lệnh terminal</span></div>`);
        }

        items.push(`<div class="activity-item"><span class="activity-icon token"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/></svg></span><span class="activity-text">~${tokensUsed} tokens · ${charCount} ký tự</span></div>`);

        if (items.length === 0) return;

        const lastAssistant = document.querySelector('.ai-message.assistant:last-of-type .ai-activity-container');
        if (lastAssistant) {
            lastAssistant.innerHTML = `<div class="activity-summary">${items.join('')}</div>`;
        }
        const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
        messages.scrollTop = messages.scrollHeight;
    }

    parseFileOperations(content) {
        const regex = /<file_operation\s+path="([^"]+)"\s+action="(create|edit|modify|delete)">([\s\S]*?)<\/file_operation>/g;
        const ops = [];
        let match;
        while ((match = regex.exec(content)) !== null) {
            const action = match[2] === 'modify' ? 'edit' : match[2];
            ops.push({ path: match[1], action, content: match[3].trim() });
        }
        return ops;
    }

    parseTerminalCommands(content) {
        const regex = /<terminal_command>([\s\S]*?)<\/terminal_command>/g;
        const cmds = [];
        let match;
        while ((match = regex.exec(content)) !== null) {
            cmds.push(match[1].trim());
        }
        return cmds;
    }

    // ===== Permission Enforcement (học từ OpenCode) =====
    // Plan/Review modes enforce real blocking, not just prompt instructions
    _getEffectiveMode() {
        return this.state.get('aiMode') || 'plan';
    }

    _isWriteBlocked() {
        const mode = this._getEffectiveMode();
        return mode === 'plan' || mode === 'review';
    }

    _isTerminalBlocked() {
        const mode = this._getEffectiveMode();
        return mode === 'plan' || mode === 'review';
    }

    _getBlockedReason() {
        const mode = this._getEffectiveMode();
        if (mode === 'plan') return 'CHẾ ĐỘ PLAN: Không được phép tạo/sửa/xóa file hoặc chạy terminal. Chỉ phân tích và gợi ý.';
        if (mode === 'review') return 'CHẾ ĐỘ REVIEW: Không được phép tạo/sửa/xóa file. Chỉ review code.';
        return null;
    }

    async requestTerminalPermission(commands) {
        // ENFORCEMENT: Plan/Review mode blocks terminal
        if (this._isTerminalBlocked()) {
            const reason = this._getBlockedReason();
            this.addMessage(`[BỊ CHẶN] ${reason}`, 'system');
            return false;
        }

        const perm = localStorage.getItem('deepcode-term-perm') || 'ask';
        if (perm === 'deny') {
            this.addMessage('[BỊ CHẶN] Terminal permission denied by user settings.', 'system');
            return false;
        }
        if (perm === 'auto') {
            await this.executeTerminalCommands(commands);
            return true;
        }

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'file-perm-overlay';
            overlay.innerHTML = `
                <div class="file-perm-dialog">
                    <div class="file-perm-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                        <span>AI muốn chạy terminal command</span>
                    </div>
                    <div class="file-perm-list">
                        ${commands.map(cmd => `
                            <div class="file-perm-item">
                                <span class="file-perm-action terminal">RUN</span>
                                <span class="file-perm-path">${cmd}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="file-perm-actions">
                        <button class="file-perm-btn deny" id="termPermDeny">Từ chối</button>
                        <button class="file-perm-btn allow" id="termPermAllow">Cho phép</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('#termPermDeny').addEventListener('click', () => {
                overlay.remove();
                this.addMessage('[Đã từ chối chạy terminal command]', 'system');
                resolve(false);
            });

            overlay.querySelector('#termPermAllow').addEventListener('click', async () => {
                overlay.remove();
                await this.executeTerminalCommands(commands);
                resolve(true);
            });
        });
    }

    async executeTerminalCommands(commands) {
        const workspaceRoot = this.state.get('workspaceRoot');
        for (const cmd of commands) {
            this.addMessage(`$ ${cmd}`, 'system');
            window.ide?.logToOutput?.(`Terminal: ${cmd}`, 'info');
            try {
                const tm = window.ide?.terminalManager || window.terminalManager;
                if (tm) {
                    const termId = await tm.create(workspaceRoot || undefined);
                    await tm.write(termId, cmd + '\n');
                    this.addMessage(`[Đã chạy: ${cmd}]`, 'system');
                    window.ide?.logToOutput?.(`Đã chạy: ${cmd}`, 'success');
                } else {
                    this.addMessage('[Terminal manager không khả dụng. Hãy mở terminal trước.]', 'system');
                    window.ide?.logToOutput?.(`Terminal không khả dụng`, 'error');
                }
            } catch (e) {
                this.addMessage(`[Lỗi khi chạy lệnh: ${e.message}]`, 'system');
                window.ide?.logToOutput?.(`Lỗi: ${e.message}`, 'error');
            }
        }
    }

    async requestFilePermission(operations) {
        // ENFORCEMENT: Plan/Review mode blocks file writes
        if (this._isWriteBlocked()) {
            const reason = this._getBlockedReason();
            this.addMessage(`[BỊ CHẶN] ${reason}`, 'system');
            return false;
        }

        // Granular: check delete permission separately
        const hasDelete = operations.some(op => op.action === 'delete');
        if (hasDelete) {
            const deletePerm = localStorage.getItem('deepcode-delete-perm') || 'ask';
            if (deletePerm === 'deny') {
                this.addMessage('[BỊ CHẶN] Delete permission denied by user settings.', 'system');
                return false;
            }
        }

        const perm = localStorage.getItem('deepcode-file-perm') || 'ask';
        if (perm === 'deny') {
            this.addMessage('[BỊ CHẶN] File write permission denied by user settings.', 'system');
            return false;
        }
        if (perm === 'auto') {
            await this.executeFileOperations(operations);
            return true;
        }

        // Build diff preview for each operation
        const workspaceRoot = this.state.get('workspaceRoot');
        const opsWithDiff = await Promise.all(operations.map(async (op) => {
            const diff = { ...op, oldContent: null, newContent: op.content, isNew: op.action === 'create', isDelete: op.action === 'delete' };
            if (op.action === 'edit' && workspaceRoot) {
                try {
                    const fullPath = workspaceRoot + '\\' + op.path;
                    diff.oldContent = await window.api.fs.readFile(fullPath) || '';
                } catch {}
            }
            return diff;
        }));

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'file-perm-overlay';
            overlay.innerHTML = `
                <div class="file-perm-dialog file-perm-dialog-wide">
                    <div class="file-perm-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        <span>AI muốn chỉnh sửa ${operations.length} file</span>
                    </div>
                    <div class="file-perm-list">
                        ${opsWithDiff.map(op => {
                            const actionLabel = op.action === 'create' ? 'TẠO MỚI' : op.action === 'edit' ? 'SỬA' : 'XÓA';
                            const actionClass = op.action;
                            let diffHtml = '';
                            if (op.action === 'edit' && op.oldContent !== null) {
                                const oldLines = op.oldContent.split('\n');
                                const newLines = (op.content || '').split('\n');
                                const maxShow = 20;
                                const oldPreview = oldLines.slice(0, maxShow).map(l => `<span class="diff-line old">- ${this._escHtml(l)}</span>`).join('');
                                const newPreview = newLines.slice(0, maxShow).map(l => `<span class="diff-line new">+ ${this._escHtml(l)}</span>`).join('');
                                const truncated = oldLines.length > maxShow || newLines.length > maxShow ? '<span class="diff-truncated">... (đã cắt bớt)</span>' : '';
                                diffHtml = `<div class="diff-preview"><div class="diff-old">${oldPreview}</div><div class="diff-new">${newPreview}</div>${truncated}</div>`;
                            } else if (op.action === 'create') {
                                const lines = (op.content || '').split('\n').slice(0, 15);
                                diffHtml = `<div class="diff-preview"><div class="diff-new">${lines.map(l => `<span class="diff-line new">+ ${this._escHtml(l)}</span>`).join('')}</div></div>`;
                            } else if (op.action === 'delete') {
                                diffHtml = `<div class="diff-preview"><div class="diff-old"><span class="diff-line old">File sẽ bị xóa vĩnh viễn</span></div></div>`;
                            }
                            return `
                                <div class="file-perm-item">
                                    <div class="file-perm-item-header">
                                        <span class="file-perm-action ${actionClass}">${actionLabel}</span>
                                        <span class="file-perm-path">${op.path}</span>
                                    </div>
                                    ${diffHtml}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="file-perm-actions">
                        <button class="file-perm-btn deny" id="filePermDeny">Từ chối tất cả</button>
                        <button class="file-perm-btn allow" id="filePermAllow">Cho phép tất cả</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('#filePermDeny').addEventListener('click', () => {
                overlay.remove();
                this.addMessage('[Đã từ chối chỉnh sửa file]', 'system');
                resolve(false);
            });

            overlay.querySelector('#filePermAllow').addEventListener('click', async () => {
                overlay.remove();
                await this.executeFileOperations(operations);
                resolve(true);
            });
        });
    }

    async executeFileOperations(operations) {
        const workspaceRoot = this.state.get('workspaceRoot');
        if (!workspaceRoot) {
            this.addMessage('[Không có workspace được chọn]', 'system');
            return;
        }

        this._lastChanges = [];

        for (const op of operations) {
            const fullPath = workspaceRoot + '\\' + op.path;
            const isDir = !op.path.includes('.') || op.path.endsWith('/');

            if (op.action === 'edit') {
                const existing = await window.api.fs.readFile(fullPath);
                if (!existing) {
                    this.addMessage(`[QUALITY GATE] File không tồn tại: ${op.path}. Sử dụng action="create" thay vì edit.`, 'system');
                    continue;
                }
                op._oldContent = existing;
            }

            if (op.action === 'delete') {
                const existing = await window.api.fs.readFile(fullPath);
                if (!existing) {
                    this.addMessage(`[QUALITY GATE] File không tồn tại: ${op.path}. Bỏ qua.`, 'system');
                    continue;
                }
                op._oldContent = existing;
            }

            try {
                if (op.action === 'create' && isDir) {
                    await window.api.fs.mkdir(fullPath);
                    this.addMessage(`[Đã tạo thư mục: ${op.path}]`, 'system');
                    window.ide?.logToOutput?.(`Tạo thư mục: ${op.path}`, 'success');
                } else if (op.action === 'create' || op.action === 'edit') {
                    // Backup before write
                    if (op._oldContent) {
                        await window.api.backup.save(workspaceRoot, fullPath, op._oldContent);
                    }
                    await window.api.fs.writeFile(fullPath, op.content);
                    this._recordPassport(op.action, op.path, op.content);
                    this._calibrateStyle(op.content);
                    this._lastChanges.push({ action: op.action, path: op.path, hasBackup: !!op._oldContent });
                    const label = op.action === 'create' ? 'tạo' : 'sửa';
                    this.addMessage(`[Đã ${label} file: ${op.path}]`, 'system');
                    window.ide?.logToOutput?.(`${op.action === 'create' ? 'Tạo' : 'Sửa'} file: ${op.path}`, 'success');
                } else if (op.action === 'delete') {
                    // Backup before delete
                    if (op._oldContent) {
                        await window.api.backup.save(workspaceRoot, fullPath, op._oldContent);
                    }
                    await window.api.fs.deleteFile(fullPath);
                    this._recordPassport('delete', op.path, '');
                    this._lastChanges.push({ action: 'delete', path: op.path, hasBackup: true });
                    this.addMessage(`[Đã xóa file: ${op.path}]`, 'system');
                    window.ide?.logToOutput?.(`Xóa file: ${op.path}`, 'warn');
                }
            } catch (e) {
                this.addMessage(`[Lỗi khi ${op.action} ${op.path}: ${e.message}]`, 'system');
                window.ide?.logToOutput?.(`Lỗi ${op.action} ${op.path}: ${e.message}`, 'error');
            }
        }

        // Show change summary with revert buttons
        if (this._lastChanges.length > 0) {
            this._showChangeSummary(this._lastChanges);
        }

        if (operations.length > 0 && window.ide?.currentFolder) {
            await window.ide.loadFileTree(window.ide.currentFolder);
            const lastOp = operations[operations.length - 1];
            if (lastOp && lastOp.action !== 'delete') {
                const workspaceRoot = this.state.get('workspaceRoot');
                const fullPath = workspaceRoot + '\\' + lastOp.path;
                const fileName = lastOp.path.split(/[\\/]/).pop();
                window.ide.openFile(fullPath, fileName);
            }
        }
    }

    _showChangeSummary(changes) {
        const actionLabels = { create: 'Tạo mới', edit: 'Sửa', delete: 'Xóa' };
        const actionIcons = { create: '+', edit: '~', delete: '-' };
        const actionColors = { create: '#4ade80', edit: '#fbbf24', delete: '#f87171' };

        const el = document.createElement('div');
        el.className = 'change-summary';
        el.innerHTML = `
            <div class="change-summary-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>AI đã thay đổi ${changes.length} file</span>
            </div>
            <div class="change-summary-list">
                ${changes.map((c, i) => `
                    <div class="change-summary-item" data-index="${i}">
                        <span class="change-action-icon" style="color:${actionColors[c.action]}">${actionIcons[c.action]}</span>
                        <span class="change-file-path">${c.path}</span>
                        <span class="change-action-label" style="color:${actionColors[c.action]}">${actionLabels[c.action]}</span>
                        ${c.hasBackup ? `<button class="change-revert-btn" data-index="${i}" title="Hoàn tác">↩</button>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        this.messagesEl.appendChild(el);
        this.scrollToBottom();

        // Bind revert buttons
        el.querySelectorAll('.change-revert-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                await this._revertChange(changes[idx]);
            });
        });
    }

    async _revertChange(change) {
        const workspaceRoot = this.state.get('workspaceRoot');
        if (!workspaceRoot) return;
        const fullPath = workspaceRoot + '\\' + change.path;
        try {
            if (change.action === 'delete') {
                // Revert delete = restore from backup
                const result = await window.api.backup.revert(workspaceRoot, fullPath);
                if (result.success) {
                    this.addMessage(`[Đã hoàn tác xóa: ${change.path}]`, 'system');
                    if (window.ide?.currentFolder) await window.ide.loadFileTree(window.ide.currentFolder);
                } else {
                    this.addMessage(`[Lỗi hoàn tác: ${result.error}]`, 'system');
                }
            } else {
                // Revert edit/create = restore from backup
                const result = await window.api.backup.revert(workspaceRoot, fullPath);
                if (result.success) {
                    this.addMessage(`[Đã hoàn tác: ${change.path}]`, 'system');
                    // Update editor if file is open
                    const editor = window.ide?.editor;
                    if (editor && editor.activeModel === fullPath) {
                        editor.editor.setValue(result.content);
                    }
                } else {
                    this.addMessage(`[Lỗi hoàn tác: ${result.error}]`, 'system');
                }
            }
        } catch (e) {
            this.addMessage(`[Lỗi hoàn tác: ${e.message}]`, 'system');
        }
    }

    _saveCurrentSession() {
        if (this.history.length < 2) return;
        const sessions = JSON.parse(localStorage.getItem('deepcode-sessions') || '[]');
        sessions.unshift({
            id: Date.now(),
            date: new Date().toLocaleString('vi-VN'),
            summary: this.history.filter(m => m.role === 'user').slice(0, 2).map(m => m.content.slice(0, 50)).join(' | '),
            messages: this.history.slice(),
        });
        if (sessions.length > 20) sessions.pop();
        localStorage.setItem('deepcode-sessions', JSON.stringify(sessions));
    }

    _showResetNotice() {
        this.addMessage('[Tự động bắt đầu cuộc trò chuyện mới để tiết kiệm tokens]', 'system');
    }

    newSession() {
        if (this.history.length > 2) {
            this._saveCurrentSession();
        }
        this.history = [];
        this.saveHistory();
        localStorage.setItem('deepcode-reset-count', '0');
        const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
        if (messages) messages.innerHTML = '';
        this.updateContextDisplay();
    }

    // Session fork (học từ OpenCode): branch từ message bất kỳ
    forkSession(buttonEl) {
        const msgDiv = buttonEl.closest('.ai-message');
        if (!msgDiv) return;
        // Find the message index in history by matching content
        const content = msgDiv.querySelector('.ai-message-content')?.innerText;
        const idx = this.history.findIndex(m => m.content === content);
        if (idx < 0) return;
        // Save current session
        if (this.history.length > 2) {
            this._saveCurrentSession();
        }
        // Fork: keep messages up to this point
        this.history = this.history.slice(0, idx + 1);
        this.saveHistory();
        localStorage.setItem('deepcode-reset-count', '0');
        // Re-render
        const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
        if (messages) {
            messages.innerHTML = '';
            for (const msg of this.history) {
                this.addMessage(msg.content, msg.role);
            }
        }
        this.updateContextDisplay();
        this.addMessage('[Đã fork conversation từ message này]', 'system');
    }

    async sendMessage() {
        const textarea = document.querySelector('#aiInput') || document.querySelector('#aiColumn textarea');
        if (textarea && textarea.value.trim()) {
            const msg = textarea.value.trim();
            textarea.value = '';
            textarea.style.height = 'auto';
            await this.handleInput(msg);
        }
    }

    async handleInput(message) {
        if (message === '/reset' || message === '/new') {
            this.newSession();
            this.addMessage('[Đã tạo cuộc trò chuyện mới]', 'system');
            return;
        }
        if (message === '/clear') {
            this.history = [];
            this.saveHistory();
            const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
            if (messages) messages.innerHTML = '';
            this.updateContextDisplay();
            this.addMessage('[Đã xóa toàn bộ lịch sử chat]', 'system');
            return;
        }
        if (message === '/context') {
            const ctx = await this.getProjectContext();
            this.addMessage(`## Context hiện tại\n${ctx || '(Không có context)'}`, 'assistant');
            return;
        }
        if (message === '/help') {
            this.addMessage(`## Danh sách lệnh\n- \`/reset\` — Tạo cuộc trò chuyện mới\n- \`/clear\` — Xóa toàn bộ lịch sử\n- \`/context\` — Xem context đang gửi cho AI\n- \`/token\` — Xem thống kê tokens\n- \`/passport\` — Xem lịch sử thay đổi file\n- \`/style\` — Xem profile coding style\n- \`/help\` — Xem danh sách lệnh này\n\n**Modes:** Plan, Act, Explain, Debug, Build, Review\n**Đính kèm file:** Click nút 📎 hoặc kéo thả file vào khung chat`, 'assistant');
            return;
        }
        if (message === '/passport') {
            this.addMessage(`## Material Passport\n${this._getPassportSummary()}`, 'assistant');
            return;
        }
        if (message === '/style') {
            const s = this.styleProfile;
            const hint = this._getStyleHint();
            const indentLabel = s.preferredIndent === 'tabs' ? 'Tab' : s.preferredIndent === 'spaces' ? 'Space' : 'chưa rõ';
            const quoteLabel = s.preferredQuotes === 'single' ? "Đơn (')" : s.preferredQuotes === 'double' ? 'Kép (")' : 'chưa rõ';
            const semiLabel = s.usesSemicolons === undefined ? 'chưa rõ' : (s.usesSemicolons ? 'Có' : 'Không');
            this.addMessage(`## Hồ sơ coding style\n- **Tổng số lần sửa:** ${s.totalEdits || 0}\n- **Thụt lề:** ${indentLabel}\n- **Dấu ngoặc kép:** ${quoteLabel}\n- **Dấu chấm phẩy:** ${semiLabel}\n- **Độ dài dòng TB:** ${s.avgLineLength || '?'} ký tự\n- **Tóm tắt:** ${hint}`, 'assistant');
            return;
        }
        if (message === '/token') {
            const tierMaxCtx = { free: 4096, pro: 32768, premium: 65536, business: 128000 };
            const _tier = this.credits?.tier || 'free';
            const _tierMax = tierMaxCtx[_tier] || 4096;
            const maxCtx = _tierMax;
            const usedCtx = this._estimateTokens(this.history);
            const tier = this.credits?.tier || 'free';
            this.addMessage(`## Thống kê tokens\n- **Tier:** ${tier}\n- **Context đã dùng:** ${usedCtx} / ${maxCtx} tokens\n- **Tin nhắn trong lịch sử:** ${this.history.length}\n- **File đính kèm:** ${this.attachedFiles?.length || 0}`, 'assistant');
            return;
        }
        await this.sendMessageWithValue(message);
    }

    addMessage(content, role) {
        const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
        const welcome = messages?.querySelector('.ai-welcome');
        if (welcome) welcome.remove();

        const div = document.createElement('div');
        div.className = `ai-message ${role}`;

        if (role === 'assistant') {
            const model = this.currentModel || 'deepcode-go';
            const modelNames = { 'deepcode-go': 'DeepCode', 'deepcode-pro': 'DeepCode Pro', 'deepcode-ultra': 'DeepCode Ultra' };
            const modelName = modelNames[model] || (model.includes('/') ? model.split('/').pop() : model);
            div.innerHTML = `
                <div class="ai-msg-header">
                    <span class="ai-model-name">${modelName}</span>
                </div>
                <div class="ai-message-content">${this.formatContent(content)}</div>
                <div class="ai-activity-container"></div>
                <div class="ai-msg-footer">
                    <button class="ai-msg-action" title="Copy" onclick="navigator.clipboard.writeText(this.closest('.ai-message').querySelector('.ai-message-content').innerText)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <button class="ai-msg-action" title="Regenerate" onclick="window._aiPanel?.regenerateLast()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                </div>
            `;
        } else if (role === 'system') {
            div.innerHTML = `<div class="ai-message-content system-msg">${this.formatContent(content)}</div>`;
        } else {
            // User message — add fork button (session fork từ OpenCode)
            div.innerHTML = `
                <div class="ai-message-content">${this.formatContent(content)}</div>
                <div class="ai-msg-footer">
                    <button class="ai-msg-action fork-btn" title="Fork conversation from here" onclick="window._aiPanel?.forkSession(this)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><path d="M6 9v12"/></svg>
                        <span style="font-size:10px;margin-left:2px">Fork</span>
                    </button>
                </div>
            `;
        }

        messages?.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    }

    updateMessage(el, content, streaming = false) {
        if (streaming) {
            if (!el._lastUpdate || Date.now() - el._lastUpdate > 50) {
                el._lastUpdate = Date.now();

                if (!el._transformed) {
                    el._transformed = true;
                    this.hideTypingIndicator();
                    const model = this.currentModel || 'deepcode-go';
            const modelNames = { 'deepcode-go': 'DeepCode', 'deepcode-pro': 'DeepCode Pro', 'deepcode-ultra': 'DeepCode Ultra' };
                    const modelName = modelNames[model] || (model.includes('/') ? model.split('/').pop() : model);
                    el.innerHTML = `
                        <div class="ai-msg-header">
                            <span class="ai-model-name">${modelName}</span>
                        </div>
                        <div class="ai-message-content">${this.formatContentLight(content)}</div>
                        <div class="ai-activity-container"></div>
                        <div class="ai-msg-footer">
                            <button class="ai-msg-action" title="Copy" onclick="navigator.clipboard.writeText(this.closest('.ai-message').querySelector('.ai-message-content').innerText)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                            <button class="ai-msg-action" title="Regenerate" onclick="window._aiPanel?.regenerateLast()">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            </button>
                        </div>
                    `;
                } else {
                    const contentEl = el.querySelector('.ai-message-content');
                    if (contentEl) contentEl.innerHTML = this.formatContentLight(content);
                }

                const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
                if (messages) messages.scrollTop = messages.scrollHeight;
            }
        } else {
            const contentEl = el.querySelector('.ai-message-content');
            if (contentEl) contentEl.innerHTML = this.formatContent(content);
            const messages = document.querySelector('#aiColumn #aiMessages') || document.getElementById('aiMessages');
            if (messages) messages.scrollTop = messages.scrollHeight;
        }
    }

    formatContentLight(text) {
        if (!text) return '';
        let html = text;
        html = html.replace(/<file_operation\s+path="[^"]*"\s+action="[^"]*">[\s\S]*?<\/file_operation>/g, '');
        html = html.replace(/<terminal_command>[\s\S]*?<\/terminal_command>/g, '');
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    formatContent(text) {
        if (!text) return '';
        let html = text;
        const placeholders = [];

        html = html.replace(/<think>([\s\S]*?)<\/think>/g, (match, content) => {
            const trimmed = content.trim();
            if (!trimmed) return '';
            const escaped = trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const id = placeholders.length;
            placeholders.push(`<details class="ai-thinking"><summary>Suy nghĩ...</summary><div class="ai-thinking-content">${escaped.replace(/\n/g, '<br>')}</div></details>`);
            return `__THINK_${id}__`;
        });

        html = html.replace(/<file_operation\s+path="[^"]*"\s+action="(create|edit|modify|delete)">[\s\S]*?<\/file_operation>/g, '');
        html = html.replace(/<terminal_command>[\s\S]*?<\/terminal_command>/g, '');

        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/\n/g, '<br>');

        placeholders.forEach((block, i) => {
            html = html.replace(`__THINK_${i}__`, block);
        });

        return html;
    }

    showTypingIndicator() {
        const messages = document.getElementById('aiMessages');
        const div = document.createElement('div');
        div.id = 'aiTypingIndicator';
        div.className = 'ai-message assistant';
        div.innerHTML = `
            <div class="ai-msg-header">
                <span class="ai-model-name ai-thinking-indicator">Đang suy nghĩ<span class="ai-thinking-dots"><span>.</span><span>.</span><span>.</span></span></span>
            </div>
            <div class="ai-message-content ai-thinking-content">
                <div class="ai-thinking-pulse"></div>
            </div>
        `;
        messages?.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    hideTypingIndicator() {
        document.getElementById('aiTypingIndicator')?.remove();
    }

    _detectSocraticIntent(message) {
        const vaguePatterns = [
            { regex: /^(fix|sửa|chỉnh|tối ưu|cải thiện)\s*(this|này|cái này)?$/i, suggestion: "Bạn muốn fix cái gì cụ thể? Mô tả triệu chứng lỗi hoặc phần cần cải thiện." },
            { regex: /^(help|giúp|giúp mình|hỗ trợ)\s*$/i, suggestion: "Bạn cần giúp gì? Ví dụ: giải thích code, sửa lỗi, thêm feature, review code?" },
            { regex: /^(làm|tạo|viết|generate)\s*(.*\s*)?$/i, suggestion: "Bạn muốn tạo gì? Mô tả chức năng, input/output, framework muốn dùng." },
            { regex: /^(tại sao|why|vì sao|lí do)\s*$/i, suggestion: "Bạn muốn tìm hiểu tại sao cái nào? Chỉ rõ phần code hoặc hành vi cần giải thích." },
            { regex: /^(ok|được|hay|good|great|tuyệt)\s*$/i, suggestion: "Bạn muốn tiếp tục với gì? Cần thêm thông tin để hỗ trợ tốt hơn." },
        ];
        for (const p of vaguePatterns) {
            if (p.regex.test(message.trim())) {
                return { isVague: true, suggestion: p.suggestion };
            }
        }
        if (message.length < 15 && !message.includes('?') && !message.includes('/')) {
            return { isVague: true, suggistion: 'Yêu cầu có vẻ quá ngắn. Bạn có thể mô tả chi tiết hơn không?' };
        }
        return { isVague: false };
    }

    _isReviewRequest(message) {
        const lower = message.toLowerCase();
        const reviewKeywords = [
            'review', 'đánh giá', 'kiểm tra', 'phân tích',
            'audit', 'check code', 'xem code', 'đọc project',
            'đọc code', 'analyze', 'security check', 'code review',
            'tổng quan project', 'overview project', 'review project',
            'kiểm tra project', 'phân tích project', 'đánh giá project',
            'code audit', 'vulnerability', 'lỗ hổng', 'bảo mật',
            'performance', 'hiệu suất', 'tối ưu',
            'đọc hiểu', 'hiểu project', 'giới thiệu project', 'mô tả project',
            'tổng quan code', 'xem xét', 'nhận xét',
        ];
        return reviewKeywords.some(kw => lower.includes(kw));
    }

    _recordPassport(action, path, content) {
        const entry = {
            action,
            path,
            timestamp: new Date().toISOString(),
            size: content ? content.length : 0,
            hash: content ? this._simpleHash(content) : null,
        };
        this.passport.push(entry);
        if (this.passport.length > 100) this.passport = this.passport.slice(-100);
        localStorage.setItem('deepcode-passport', JSON.stringify(this.passport));
    }

    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const chr = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + chr;
            hash |= 0;
        }
        return hash.toString(16);
    }

    _calibrateStyle(code) {
        const lines = code.split('\n');
        if (lines.length < 3) return;

        const style = this.styleProfile;
        style.totalEdits = (style.totalEdits || 0) + 1;

        const usesTabs = code.includes('\t');
        style.preferredIndent = usesTabs ? 'tabs' : 'spaces';

        const singleQuotes = (code.match(/'/g) || []).length;
        const doubleQuotes = (code.match(/"/g) || []).length;
        style.preferredQuotes = singleQuotes > doubleQuotes ? 'single' : 'double';

        const usesSemicolons = code.match(/;\s*$/m);
        style.usesSemicolons = !!usesSemicolons;

        const avgLineLen = lines.reduce((s, l) => s + l.length, 0) / lines.length;
        style.avgLineLength = Math.round(avgLineLen);

        this.styleProfile = style;
        localStorage.setItem('deepcode-style', JSON.stringify(style));
    }

    _getStyleHint() {
        const s = this.styleProfile;
        if (!s.totalEdits || s.totalEdits < 3) return 'đang học...';
        const parts = [];
        if (s.preferredIndent) parts.push(s.preferredIndent === 'tabs' ? 'dùng Tab' : 'dùng Space');
        if (s.preferredQuotes) parts.push(`ngoặc ${s.preferredQuotes === 'single' ? 'đơn' : 'kép'}`);
        if (s.usesSemicolons !== undefined) parts.push(s.usesSemicolons ? 'có chấm phẩy' : 'không chấm phẩy');
        return parts.join(', ') || 'đang học...';
    }

    _getPassportSummary() {
        if (this.passport.length === 0) return 'Chưa có thay đổi nào.';
        const recent = this.passport.slice(-5);
        return recent.map(e => `[${e.timestamp.slice(11, 16)}] ${e.action.toUpperCase()} ${e.path}`).join('\n');
    }
}

window.AIPanel = AIPanel;
