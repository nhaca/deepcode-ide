class Settings {
    constructor(app) {
        this.app = app;
    }

    setup() {
        document.getElementById('settingsClose')?.addEventListener('click', () => {
            document.getElementById('settingsModal').style.display = 'none';
        });
        document.getElementById('settingsModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                e.target.style.display = 'none';
            }
        });

        const providerSelect = document.getElementById('settingsProvider');
        const savedProvider = localStorage.getItem('deepcode-provider') || 'deepcode';
        if (providerSelect) providerSelect.value = savedProvider;

        const savedModel = localStorage.getItem('deepcode-default-model');
        const savedCtx = localStorage.getItem('deepcode-context-limit');
        const modelSelect = document.getElementById('settingsDefaultModel');
        const ctxSelect = document.getElementById('settingsContextLimit');
        if (modelSelect && savedModel) modelSelect.value = savedModel;

        const tierMaxContext = { free: 4096, pro: 32768, premium: 65536, business: 128000 };
        const currentTier = window._aiPanel?.credits?.tier || 'free';
        const maxCtx = tierMaxContext[currentTier] || 4096;
        if (ctxSelect) {
            Array.from(ctxSelect.options).forEach(opt => {
                opt.disabled = parseInt(opt.value) > maxCtx;
            });
            if (savedCtx && parseInt(savedCtx) <= maxCtx) {
                ctxSelect.value = savedCtx;
            } else {
                ctxSelect.value = String(maxCtx);
            }
        }

        const filePermSelect = document.getElementById('settingsFilePerm');
        const termPermSelect = document.getElementById('settingsTermPerm');
        const readPermSelect = document.getElementById('settingsReadPerm');
        const deletePermSelect = document.getElementById('settingsDeletePerm');
        if (filePermSelect) filePermSelect.value = localStorage.getItem('deepcode-file-perm') || 'ask';
        if (termPermSelect) termPermSelect.value = localStorage.getItem('deepcode-term-perm') || 'ask';
        if (readPermSelect) readPermSelect.value = localStorage.getItem('deepcode-read-perm') || 'allow';
        if (deletePermSelect) deletePermSelect.value = localStorage.getItem('deepcode-delete-perm') || 'ask';

        providerSelect?.addEventListener('change', (e) => {
            localStorage.setItem('deepcode-provider', e.target.value);
            window._aiPanel?.loadModels?.();
        });

        document.getElementById('settingsSaveBtn')?.addEventListener('click', () => {
            const model = document.getElementById('settingsDefaultModel')?.value;
            let ctx = document.getElementById('settingsContextLimit')?.value;
            const provider = providerSelect?.value || 'deepcode';

            const tierMaxContext = { free: 4096, pro: 32768, premium: 65536, business: 128000 };
            const currentTier = window._aiPanel?.credits?.tier || 'free';
            const maxCtx = tierMaxContext[currentTier] || 4096;
            if (ctx && parseInt(ctx) > maxCtx) ctx = String(maxCtx);

            if (model) localStorage.setItem('deepcode-default-model', model);
            if (ctx) localStorage.setItem('deepcode-context-limit', ctx);
            localStorage.setItem('deepcode-provider', provider);

            const filePerm = document.getElementById('settingsFilePerm')?.value || 'ask';
            const termPerm = document.getElementById('settingsTermPerm')?.value || 'ask';
            const readPerm = document.getElementById('settingsReadPerm')?.value || 'allow';
            const deletePerm = document.getElementById('settingsDeletePerm')?.value || 'ask';
            localStorage.setItem('deepcode-file-perm', filePerm);
            localStorage.setItem('deepcode-term-perm', termPerm);
            localStorage.setItem('deepcode-read-perm', readPerm);
            localStorage.setItem('deepcode-delete-perm', deletePerm);
            window._aiPanel?.updateAutoBadge?.();

            const aiDropdown = document.getElementById('aiModelDropdown');
            if (aiDropdown && model && aiDropdown.querySelector(`option[value="${model}"]`)) {
                aiDropdown.value = model;
            }

            document.getElementById('settingsModal').style.display = 'none';
        });

        this.updateConnectionStatus();
        document.getElementById('githubConnectBtn')?.addEventListener('click', () => {
            window.deepcodeClient?.loginWithGitHub?.();
        });

        this.setupThemeSelector();
    }

    updateConnectionStatus() {
        const client = window.deepcodeClient;
        if (client?.isLoggedIn()) {
            document.getElementById('githubStatus').textContent = 'Đã kết nối';
            document.getElementById('githubStatus').style.color = '#22c55e';
            document.getElementById('githubConnectBtn').textContent = 'Đã kết nối';
            document.getElementById('githubConnectBtn').classList.add('connected');
        }
    }

    toggle() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
        }
    }

    setupThemeSelector() {
        const themeSelect = document.getElementById('settingsTheme');
        if (!themeSelect) return;
        const saved = localStorage.getItem('deepcode-theme') || 'deepcode-dark';
        themeSelect.value = saved;

        themeSelect.addEventListener('change', (e) => {
            const themeId = e.target.value;
            if (this.app.editorManager) {
                this.app.editorManager.setTheme(themeId);
            }
            localStorage.setItem('deepcode-theme', themeId);
            this.app.showToast(`Đã chuyển giao diện: ${themeId}`, 'success');
        });
    }
}
