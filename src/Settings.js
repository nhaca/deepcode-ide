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

        const filePermSelect = document.getElementById('settingsFilePerm');
        const termPermSelect = document.getElementById('settingsTermPerm');
        const readPermSelect = document.getElementById('settingsReadPerm');
        const deletePermSelect = document.getElementById('settingsDeletePerm');
        if (filePermSelect) filePermSelect.value = localStorage.getItem('deepcode-file-perm') || 'ask';
        if (termPermSelect) termPermSelect.value = localStorage.getItem('deepcode-term-perm') || 'ask';
        if (readPermSelect) readPermSelect.value = localStorage.getItem('deepcode-read-perm') || 'allow';
        if (deletePermSelect) deletePermSelect.value = localStorage.getItem('deepcode-delete-perm') || 'ask';

        document.getElementById('settingsSaveBtn')?.addEventListener('click', () => {
            const filePerm = document.getElementById('settingsFilePerm')?.value || 'ask';
            const termPerm = document.getElementById('settingsTermPerm')?.value || 'ask';
            const readPerm = document.getElementById('settingsReadPerm')?.value || 'allow';
            const deletePerm = document.getElementById('settingsDeletePerm')?.value || 'ask';
            localStorage.setItem('deepcode-file-perm', filePerm);
            localStorage.setItem('deepcode-term-perm', termPerm);
            localStorage.setItem('deepcode-read-perm', readPerm);
            localStorage.setItem('deepcode-delete-perm', deletePerm);
            window._aiPanel?.updateAutoBadge?.();

            document.getElementById('settingsModal').style.display = 'none';
        });

        this.updateConnectionStatus();
        document.getElementById('githubConnectBtn')?.addEventListener('click', async () => {
            try {
                window.api.onOAuthCallback(async (data) => {
                    if (data.provider === 'github' && data.accessToken) {
                        try {
                            await window.deepcodeClient?.loginWithGitHub?.(data.accessToken);
                            this.updateConnectionStatus();
                        } catch (e) {
                            console.error('GitHub login failed:', e);
                        }
                    }
                });
                await window.api.oauthGitHub();
            } catch (e) {
                console.error('OAuth error:', e);
            }
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
