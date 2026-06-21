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
        const client = window.deepcodeClient;
        if (client.isLoggedIn()) {
            try {
                const user = await client.getMe();
                try {
                    this.credits = await client.getCredits();
                } catch (ce) {
                    console.warn('Credits fetch failed:', ce.message);
                    this.credits = null;
                }
                this.state.set('user', user);
                this.showLoggedInUI(user);
            } catch (e) {
                console.log('Auth check failed, clearing token:', e.message);
                client.logout();
                localStorage.removeItem('deepcode-token');
                this.showLoginUI();
            }
        } else {
            this.showLoginUI();
        }
    }

    saveHistory() {
        // Chỉ lưu 50 tin nhắn gần nhất
        const toSave = this.history.slice(-50);
        localStorage.setItem('deepcode-chat-history', JSON.stringify(toSave));
    }

    restoreHistory() {
        if (this.history.length === 0) return;
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
                        <span>DeepCode AI</span>
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
                            <button class="ai-mode-btn" data-mode="act">Act</button>
                            <button class="ai-mode-btn" data-mode="explain">Explain</button>
                            <button class="ai-mode-btn" data-mode="debug">Debug</button>
                            <button class="ai-mode-btn" data-mode="build">Build</button>
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
                                    <li>100 credits/ngày</li>
                                    <li>Context 4K tokens</li>
                                    <li>15+ models AI</li>
                                    <li>Hỗ trợ cơ bản</li>
                                </ul>
                                <button class="tier-btn" data-tier="free">Đang dùng</button>
                            </div>
                            <div class="upgrade-tier pro" data-tier="pro">
                                <div class="tier-badge">Phổ biến nhất</div>
                                <div class="tier-icon">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                </div>
                                <div class="tier-name">Pro</div>
                                <div class="tier-price"><span class="price-amount">$19</span><span class="price-period">/tháng</span></div>
                                <div class="tier-divider"></div>
                                <ul class="tier-features">
                                    <li>500 credits/ngày</li>
                                    <li>Context 32K tokens</li>
                                    <li>GPT-5.5, Claude 4.6, Gemini 3.1</li>
                                    <li>DeepCode Token Savings</li>
                                    <li>Hỗ trợ ưu tiên</li>
                                </ul>
                                <button class="tier-btn primary" data-tier="pro">Nâng cấp ngay</button>
                            </div>
                            <div class="upgrade-tier" data-tier="business">
                                <div class="tier-icon">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                                </div>
                                <div class="tier-name">Business</div>
                                <div class="tier-price"><span class="price-amount">$49</span><span class="price-period">/tháng</span></div>
                                <div class="tier-divider"></div>
                                <ul class="tier-features">
                                    <li>Không giới hạn credits</li>
                                    <li>Context 128K tokens</li>
                                    <li>Tất cả models + Priority</li>
                                    <li>DeepCode Token + Headroom</li>
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
                        <h3>DeepCode AI</h3>
                        <p>Sign in to unlock AI-powered coding</p>
                    </div>

                    <button class="github-login-btn" id="githubLoginBtn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        Sign in with GitHub
                    </button>

                    <p class="auth-hint">Free account with 50 AI credits per day</p>
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
    }

    updateCreditsDisplay() {
        if (!this.credits) return;
        document.getElementById('creditsTier').textContent = this.credits.tier.charAt(0).toUpperCase() + this.credits.tier.slice(1);
        document.getElementById('creditsUsed').textContent = this.credits.creditsUsed;
        document.getElementById('creditsTotal').textContent = this.credits.creditsPerDay === 999999 ? '∞' : this.credits.creditsPerDay;
        const percent = this.credits.creditsPerDay === 999999 ? 0 : (this.credits.creditsUsed / this.credits.creditsPerDay) * 100;
        document.getElementById('creditsBarFill').style.width = `${Math.min(100, percent)}%`;

        const maxCtx = this.credits.contextLimits?.maxContext || 4096;
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

    async loadModels() {
        try {
            const { models } = await window.deepcodeClient.getModels();
            const dropdown = document.getElementById('aiModelDropdown');
            if (dropdown) {
                dropdown.innerHTML = models.map(m =>
                    `<option value="${m.id}">${m.id}</option>`
                ).join('');
            }
        } catch (e) {
            console.error('Failed to load models:', e);
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

        // Listen for auth callback from main process
        if (window.electronAPI?.onGithubAuth) {
            window.electronAPI.onGithubAuth(async (data) => {
                try {
                    const client = window.deepcodeClient;
                    client.token = data.token;
                    client.user = data.user;
                    localStorage.setItem('deepcode-token', data.token);

                    this.credits = await client.getCredits();
                    this.showLoggedInUI(data.user);
                } catch (e) {
                    console.error('Auth callback error:', e.message);
                    window.deepcodeClient.logout();
                    localStorage.removeItem('deepcode-token');
                    this.showLoginUI();
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
                    await window.deepcodeClient.upgradeTier(tier);
                    this.credits = await window.deepcodeClient.getCredits();
                    this.updateCreditsDisplay();
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

        // GitHub login button
        document.getElementById('githubLoginBtn')?.addEventListener('click', async () => {
            try {
                const res = await fetch(`${getApiUrl()}/api/auth/github`);
                const data = await res.json();
                if (data.url) {
                    window.electronAPI.openExternal(data.url);
                }
            } catch (e) {
                console.error('GitHub login error:', e);
                const errorEl = document.getElementById('authError');
                if (errorEl) {
                    errorEl.textContent = 'Lỗi kết nối server';
                    errorEl.style.display = 'block';
                }
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
        this.showTypingIndicator();

        try {
            const model = document.querySelector('#aiColumn select')?.value || 'deepcode-go';
            const mode = this.state.get('aiMode') || 'plan';

            const basePrompt = 'Bạn là DeepCode AI — trợ lý lập trình chuyên nghiệp, đáng tin cipient. Luôn trả lời bằng tiếng Việt, bất kể người dùng gõ ngôn ngữ nào. Xưng "mình", gọi người dùng là "bạn". Giọng điệu ấm áp nhưng nghiêm túc, gọn gàng, đi thẳng vào vấn đề. KHÔNG vẽ bánh, KHÔNG hứa suông, KHÔNG tâng bốc quá mức. Nếu ý tưởng của người dùng có vấn đề hoặc chưa tối ưu, hãy lịch sự chỉ ra rủi ro và đề xuất phương án tốt hơn — đây là trách nhiệm của bạn. Luôn ưu tiên giải pháp thực tế, an toàn và maintainable. Nếu chưa chắc chắn, nói rõ thay vì đoán mò. Không xác nhận, phủ nhận, hay gợi ý về nhà cung cấp/model nền tảng bên dưới. Nếu bị hỏi về model, trả lời ngắn: "Mình là DeepCode AI, mình không chia sẻ chi tiết kỹ thuật nhưng mình sẵn sàng giúp bạn code!" rồi quay lại giúp việc.';

            const modePrompts = {
                plan: basePrompt + ' CHẾ ĐỘ PLAN: Phân tích yêu cầu, thảo luận và đề xuất giải pháp. Khi người dùng yêu cầu tạo/sửa file, HÃY TẠO file bằng cách dùng định dạng: <file_operation path="tên_file" action="create">nội_dung_file</file_operation>. Ví dụ: <file_operation path="README.md" action="create"># Hello World</file_operation>. Hệ thống sẽ xin phép người dùng trước khi thực thi.',
                act: basePrompt + ' CHẾ ĐỘ ACT: Tạo và sửa code trực tiếp. Dùng định dạng: <file_operation path="tên_file" action="create|edit|delete">nội_dung</file_operation>. action="create" = tạo file mới, action="edit" = sửa file cũ, action="delete" = xóa file. Hệ thống sẽ xin phép trước khi thực thi.',
                explain: basePrompt + ' CHẾ ĐỘ EXPLAIN: Giải thích code chi tiết. Phân tích từng phần, giải thích logic, flow dữ liệu, mối quan hệ giữa các function/module.',
                debug: basePrompt + ' CHẾ ĐỘ DEBUG: Tìm bug và sửa. Hỏi triệu chứng cụ thể. Dùng <file_operation> tags để sửa file nếu cần.',
                build: basePrompt + ' CHẾ ĐỘ BUILD: Chạy terminal commands. Dùng <terminal_command>lệnh</terminal_command>. Ví dụ: <terminal_command>npm install</terminal_command>. Hệ thống sẽ xin phép trước khi chạy.',
                review: basePrompt + ' CHẾ ĐỘ REVIEW: Code review. Kiểm tra logic, security, performance. Format: ### Vấn đề → Mức độ → Giải pháp.',
            };

            const socraticCheck = this._detectSocraticIntent(message);
            let systemPrompt = modePrompts[mode] || modePrompts.plan;

            if (socraticCheck.isVague) {
                systemPrompt += ` HƯỚNG DẪN SOCRATIC: Yêu cầu của người dùng mơ hồ. Hãy HỎI LẠI 2-3 câu cụ thể trước khi hành động. Ví dụ: "${socraticCheck.suggestion}"`;
            }

            systemPrompt += ' ANTI-SYCOPHANCY: Nếu người dùng đề xuất giải pháp có vấn đề, hãy challenge một cách lịch sự. Chỉ ra rủi ro, đề xuất thay thế tốt hơn. KHÔNG luôn đồng ý.';
            systemPrompt += ` STYLE PROFILE: Phong cách coding của user: ${this._getStyleHint()}.`;

            const maxContext = this.credits?.contextLimits?.maxContext || 4096;
            const tier = this.credits?.tier || 'free';
            const resetLimit = tier === 'premium' || tier === 'business' ? Infinity : (tier === 'pro' ? 30 : 5);
            const resetCount = parseInt(localStorage.getItem('deepcode-reset-count') || '0');
            const shouldReset = this._estimateTokens(this.history) > maxContext * 0.7;

            let conversationHistory = this.history.slice(-10);
            if (shouldReset && this.history.length > 4) {
                if (resetCount >= resetLimit) {
                    this.addMessage(`[Đã hết lượt reset context (${resetLimit} lần). Vui lòng tạo cuộc trò chuyện mới bằng lệnh /reset]`, 'system');
                } else {
                    this._saveCurrentSession();
                    const summary = this.history
                        .filter(m => m.role === 'user')
                        .slice(0, 3)
                        .map(m => m.content.slice(0, 60))
                        .join('; ');
                    conversationHistory = [
                        { role: 'system', content: `[Cuộc trò chuyện trước: ${summary}]` },
                        ...this.history.slice(-2),
                    ];
                    localStorage.setItem('deepcode-reset-count', String(resetCount + 1));
                    this._showResetNotice();
                }
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                ...conversationHistory,
            ];

            const responseEl = this.addMessage('', 'assistant');
            const client = window.deepcodeClient;

            if (client.isLoggedIn()) {
                const projectContext = await this.getProjectContext();
                let fullContent = '';
                const response = await client.chat(model, messages, true, projectContext || null);

                if (response._nonStreaming) {
                    fullContent = response.content;
                    this.updateMessage(responseEl, fullContent);
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
                                        || parsed.content
                                        || parsed.delta?.content
                                        || '';
                                    if (delta) {
                                        fullContent += delta;
                                        this.updateMessage(responseEl, fullContent, true);
                                    }
                                } catch {}
                            }
                        }
                    }
                    this.updateMessage(responseEl, fullContent, false);
                }

                const fileOps = this.parseFileOperations(fullContent);
                if (fileOps.length > 0) {
                    await this.requestFilePermission(fileOps);
                }

                const termCmds = this.parseTerminalCommands(fullContent);
                if (termCmds.length > 0) {
                    await this.requestTerminalPermission(termCmds);
                }

                this.history.push({ role: 'assistant', content: fullContent });
                this.saveHistory();
                this.credits = await client.getCredits();
                this.updateCreditsDisplay();
                this.updateContextDisplay();
            } else {
                this.updateMessage(responseEl, 'Vui lòng đăng nhập để sử dụng AI.');
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage(`Error: ${error.message}`, 'assistant');
        } finally {
            this.hideTypingIndicator();
            this.isStreaming = false;
        }
    }

    updateContextDisplay() {
        if (!this.credits) return;
        const maxCtx = this.credits.contextLimits?.maxContext || 4096;
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

    parseFileOperations(content) {
        const regex = /<file_operation\s+path="([^"]+)"\s+action="(create|edit|delete)">([\s\S]*?)<\/file_operation>/g;
        const ops = [];
        let match;
        while ((match = regex.exec(content)) !== null) {
            ops.push({ path: match[1], action: match[2], content: match[3].trim() });
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

    async requestTerminalPermission(commands) {
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
            try {
                const tm = window.ide?.terminalManager || window.terminalManager;
                if (tm) {
                    const termId = await tm.create(workspaceRoot || undefined);
                    await tm.write(termId, cmd + '\n');
                    this.addMessage(`[Đã chạy: ${cmd}]`, 'system');
                } else {
                    this.addMessage('[Terminal manager không khả dụng. Hãy mở terminal trước.]', 'system');
                }
            } catch (e) {
                this.addMessage(`[Lỗi khi chạy lệnh: ${e.message}]`, 'system');
            }
        }
    }

    async requestFilePermission(operations) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'file-perm-overlay';
            overlay.innerHTML = `
                <div class="file-perm-dialog">
                    <div class="file-perm-header">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        <span>AI muốn chỉnh sửa file</span>
                    </div>
                    <div class="file-perm-list">
                        ${operations.map(op => `
                            <div class="file-perm-item">
                                <span class="file-perm-action ${op.action}">${op.action.toUpperCase()}</span>
                                <span class="file-perm-path">${op.path}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="file-perm-actions">
                        <button class="file-perm-btn deny" id="filePermDeny">Từ chối</button>
                        <button class="file-perm-btn allow" id="filePermAllow">Cho phép</button>
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

        for (const op of operations) {
            const fullPath = workspaceRoot + '\\' + op.path;

            if (op.action === 'edit') {
                const existing = await window.api.fs.readFile(fullPath);
                if (!existing) {
                    this.addMessage(`[QUALITY GATE] File không tồn tại: ${op.path}. Sử dụng action="create" thay vì edit.`, 'system');
                    continue;
                }
            }

            if (op.action === 'delete') {
                const existing = await window.api.fs.readFile(fullPath);
                if (!existing) {
                    this.addMessage(`[QUALITY GATE] File không tồn tại: ${op.path}. Bỏ qua.`, 'system');
                    continue;
                }
            }

            try {
                if (op.action === 'create' || op.action === 'edit') {
                    await window.api.fs.writeFile(fullPath, op.content);
                    this._recordPassport(op.action, op.path, op.content);
                    this._calibrateStyle(op.content);
                    this.addMessage(`[Đã ${op.action === 'create' ? 'tạo' : 'sửa'} file: ${op.path}]`, 'system');
                } else if (op.action === 'delete') {
                    await window.api.fs.deleteFile(fullPath);
                    this._recordPassport('delete', op.path, '');
                    this.addMessage(`[Đã xóa file: ${op.path}]`, 'system');
                }
            } catch (e) {
                this.addMessage(`[Lỗi khi ${op.action} file ${op.path}: ${e.message}]`, 'system');
            }
        }

        if (operations.length > 0 && window.ide?.currentFolder) {
            await window.ide.loadFileTree(window.ide.currentFolder);
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
            const maxCtx = this.credits?.contextLimits?.maxContext || 4096;
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
        div.innerHTML = `<div class="ai-message-content">${this.formatContent(content)}</div>`;
        messages?.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    }

    updateMessage(el, content, streaming = false) {
        if (streaming) {
            if (!el._lastUpdate || Date.now() - el._lastUpdate > 50) {
                el._lastUpdate = Date.now();
                const contentEl = el.querySelector('.ai-message-content');
                if (contentEl) contentEl.innerHTML = this.formatContentLight(content);
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
            const id = placeholders.length;
            placeholders.push(`<details class="ai-thinking"><summary>Suy nghĩ...</summary><div class="ai-thinking-content">${trimmed.replace(/\n/g, '<br>')}</div></details>`);
            return `__THINK_${id}__`;
        });

        html = html.replace(/<file_operation\s+path="[^"]*"\s+action="(create|edit|delete)">[\s\S]*?<\/file_operation>/g, '');
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
        div.innerHTML = '<div class="ai-typing"><span></span><span></span><span></span></div>';
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
