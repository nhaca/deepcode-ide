class GitPanel {
    constructor(container) {
        this.container = container;
        this.status = null;
        this.repoPath = null;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="git-panel-content">
                <div class="git-section">
                    <div class="git-section-header">
                        <span>CHANGES</span>
                        <div class="git-section-actions">
                            <button class="git-action-btn" id="gitRefreshBtn" title="Refresh">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="git-changes-list" id="gitChangesList">
                        <div class="git-empty">No changes</div>
                    </div>
                </div>
                <div class="git-section">
                    <div class="git-section-header">
                        <span>COMMIT</span>
                    </div>
                    <div class="git-commit-box">
                        <textarea id="gitCommitMsg" placeholder="Thông điệp commit..." rows="2"></textarea>
                        <button class="git-commit-btn" id="gitCommitBtn" disabled>Commit</button>
                    </div>
                </div>
                <div class="git-section">
                    <div class="git-section-header">
                        <span>SYNC</span>
                    </div>
                    <div class="git-sync-box">
                        <button class="git-sync-btn" id="gitPushBtn" title="Push lên GitHub">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                            Push
                        </button>
                        <button class="git-sync-btn" id="gitPullBtn" title="Pull từ GitHub">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                            Pull
                        </button>
                        <button class="git-sync-btn" id="gitFetchBtn" title="Fetch từ remote">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M6 12h12"/></svg>
                            Fetch
                        </button>
                    </div>
                    <div class="git-sync-status" id="gitSyncStatus"></div>
                </div>
                <div class="git-section">
                    <div class="git-section-header">
                        <span>REMOTE</span>
                        <button class="git-action-btn" id="gitRemoteToggle" title="Cài đặt remote">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        </button>
                    </div>
                    <div class="git-remote-info" id="gitRemoteInfo">
                        <div class="git-empty">Chưa cấu hình remote</div>
                    </div>
                    <div class="git-remote-form" id="gitRemoteForm" style="display:none;">
                        <input type="text" id="gitRemoteUrl" placeholder="https://github.com/user/repo.git" class="git-input" />
                        <button class="git-action-btn primary" id="gitRemoteSaveBtn">Lưu</button>
                    </div>
                </div>
                <div class="git-section">
                    <div class="git-section-header">
                        <span>GITHUB</span>
                    </div>
                    <div class="git-github-box" id="gitGithubBox">
                        <div id="gitGithubStatus">
                            <div class="git-empty">Kết nối GitHub</div>
                        </div>
                        <button class="git-action-btn primary" id="gitGithubLoginBtn">Kết nối</button>
                    </div>
                </div>
                <div class="git-section">
                    <div class="git-section-header">
                        <span>BRANCHES</span>
                    </div>
                    <div class="git-branches-list" id="gitBranchesList">
                        <div class="git-branch-item active">main</div>
                    </div>
                </div>
                <div class="git-section">
                    <div class="git-section-header">
                        <span>CLONE</span>
                    </div>
                    <div class="git-clone-box">
                        <input type="text" id="gitCloneUrl" class="git-input" placeholder="https://github.com/user/repo.git" />
                        <button class="git-action-btn primary" id="gitCloneBtn">Clone</button>
                    </div>
                </div>
            </div>
        `;
    }

    async refresh(repoPath) {
        if (!repoPath) return;
        this.repoPath = repoPath;

        const status = await window.api.git.status(repoPath);
        if (status.notGitRepo) {
            this.showNotGitRepo(repoPath);
            return;
        }

        this.status = status;
        this.renderChanges(status);
        this.renderBranches(repoPath);
        this.renderRemote(repoPath);
        this.checkGithubAuth();
        this.setupEvents(repoPath);
    }

    showNotGitRepo(repoPath) {
        const changesList = document.getElementById('gitChangesList');
        if (changesList) {
            changesList.innerHTML = `
                <div class="git-empty">
                    <div>Chưa là git repo</div>
                    <button class="git-init-btn" id="gitInitBtn">Khởi tạo Git</button>
                </div>
            `;
            document.getElementById('gitInitBtn')?.addEventListener('click', async () => {
                const result = await window.api.git.init(repoPath);
                if (result.success) {
                    this.refresh(repoPath);
                } else {
                    alert('Lỗi init git: ' + result.error);
                }
            });
        }
    }

    renderChanges(status) {
        const changesList = document.getElementById('gitChangesList');
        if (!changesList) return;

        const changes = [];

        if (status.staged && status.staged.length > 0) {
            status.staged.forEach((file) => {
                changes.push({ name: file, status: 'staged', icon: 'M' });
            });
        }

        if (status.modified && status.modified.length > 0) {
            status.modified.forEach((file) => {
                if (!status.staged?.includes(file)) {
                    changes.push({ name: file, status: 'modified', icon: 'M' });
                }
            });
        }

        if (status.not_added && status.not_added.length > 0) {
            status.not_added.forEach((file) => {
                changes.push({ name: file, status: 'untracked', icon: 'U' });
            });
        }

        if (status.deleted && status.deleted.length > 0) {
            status.deleted.forEach((file) => {
                changes.push({ name: file, status: 'deleted', icon: 'D' });
            });
        }

        if (changes.length === 0) {
            changesList.innerHTML = '<div class="git-empty">No changes</div>';
            return;
        }

        changesList.innerHTML = changes
            .map(
                (change) => `
            <div class="git-change-item" data-file="${change.name}" data-status="${change.status}">
                <span class="git-change-icon ${change.status}">${change.icon}</span>
                <span class="git-change-name">${change.name}</span>
                <button class="git-change-action" data-action="${change.status === 'staged' ? 'unstage' : 'stage'}">
                    ${change.status === 'staged' ? '-' : '+'}
                </button>
            </div>
        `
            )
            .join('');

        const commitBtn = document.getElementById('gitCommitBtn');
        if (commitBtn) {
            commitBtn.disabled = status.staged?.length === 0;
        }
    }

    async renderBranches(repoPath) {
        const branchesList = document.getElementById('gitBranchesList');
        if (!branchesList) return;

        const branches = await window.api.git.branches(repoPath);
        if (branches.error) return;

        branchesList.innerHTML = branches.all
            .map(
                (branch) => `
            <div class="git-branch-item ${branch === branches.current ? 'active' : ''}" data-branch="${branch}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="18" r="3"/>
                    <circle cx="6" cy="6" r="3"/>
                    <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                    <line x1="6" y1="9" x2="6" y2="21"/>
                </svg>
                ${branch.replace('origin/', '')}
            </div>
        `
            )
            .join('');
    }

    async renderRemote(repoPath) {
        const remoteInfo = document.getElementById('gitRemoteInfo');
        if (!remoteInfo) return;

        const remotes = await window.api.git.getRemotes(repoPath);
        if (remotes.error || !remotes || remotes.length === 0) {
            remoteInfo.innerHTML = '<div class="git-empty">Chưa cấu hình remote</div>';
            return;
        }

        const origin = remotes.find(r => r.name === 'origin');
        if (origin) {
            remoteInfo.innerHTML = `
                <div class="git-remote-item">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    <span class="git-remote-url">${origin.refs?.push || origin.refs?.fetch || 'origin'}</span>
                </div>
            `;
        } else {
            remoteInfo.innerHTML = remotes.map(r => `
                <div class="git-remote-item">
                    <span>${r.name}: ${r.refs?.push || r.refs?.fetch || ''}</span>
                </div>
            `).join('');
        }
    }

    async checkGithubAuth() {
        const gh = await window.api.github.getToken();
        const statusEl = document.getElementById('gitGithubStatus');
        const loginBtn = document.getElementById('gitGithubLoginBtn');
        if (!statusEl || !loginBtn) return;

        if (gh.token && gh.username) {
            statusEl.innerHTML = `<div class="git-github-connected">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                <span>${gh.username}</span>
            </div>
            <div class="git-github-actions">
                <button class="git-action-btn primary" id="gitCreateRepoBtn">Tạo repo</button>
                <button class="git-action-btn" id="gitGithubLogoutBtn" title="Đăng xuất">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
            </div>
            <div class="git-create-repo-form" id="gitCreateRepoForm" style="display:none;">
                <input type="text" id="ghRepoName" class="git-input" placeholder="Tên repo" />
                <input type="text" id="ghRepoDesc" class="git-input" placeholder="Mô tả (tùy chọn)" />
                <label class="git-checkbox-label">
                    <input type="checkbox" id="ghRepoPrivate" /> Private
                </label>
                <button class="git-action-btn primary" id="ghRepoCreateConfirm">Tạo &amp; kết nối</button>
            </div>`;
            loginBtn.textContent = 'Ngắt kết nối';
            loginBtn.onclick = async () => {
                await window.api.github.saveToken('', '');
                this.checkGithubAuth();
            };
            document.getElementById('gitCreateRepoBtn')?.addEventListener('click', () => {
                const form = document.getElementById('gitCreateRepoForm');
                if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
            });
            document.getElementById('ghRepoCreateConfirm')?.addEventListener('click', async () => {
                const name = document.getElementById('ghRepoName')?.value.trim();
                if (!name) return;
                const desc = document.getElementById('ghRepoDesc')?.value.trim();
                const isPrivate = document.getElementById('ghRepoPrivate')?.checked;
                const result = await window.api.github.createRepo(name, desc, isPrivate);
                if (result.success) {
                    if (this.repoPath) {
                        await window.api.git.addRemote(this.repoPath, 'origin', result.url);
                        this.renderRemote(this.repoPath);
                    }
                    document.getElementById('gitCreateRepoForm').style.display = 'none';
                    alert(`Repo tạo thành công: ${result.html_url}`);
                } else {
                    alert('Lỗi: ' + result.error);
                }
            });
        } else {
            statusEl.innerHTML = '<div class="git-empty">Chưa kết nối</div>';
            loginBtn.textContent = 'Kết nối';
            loginBtn.onclick = () => this.startDeviceFlow();
        }
    }

    async startDeviceFlow() {
        const statusEl = document.getElementById('gitGithubStatus');
        const loginBtn = document.getElementById('gitGithubLoginBtn');
        if (!statusEl || !loginBtn) return;

        loginBtn.disabled = true;
        loginBtn.textContent = 'Đang lấy mã...';

        const codeData = await window.api.github.requestDeviceCode();
        if (codeData.error) {
            statusEl.innerHTML = `<div class="git-empty" style="color:var(--accent-red);">Lỗi: ${codeData.error_description || codeData.error}</div>`;
            loginBtn.disabled = false;
            loginBtn.textContent = 'Kết nối GitHub';
            return;
        }

        const userCode = codeData.user_code;
        const verifyUrl = codeData.verification_uri;
        const interval = (codeData.interval || 5) * 1000;
        const expiresIn = codeData.expires_in || 900;

        statusEl.innerHTML = `
            <div class="git-device-flow">
                <div class="git-device-hint">Mở link và nhập mã:</div>
                <div class="git-device-code">${userCode}</div>
                <div class="git-device-url">
                    <span class="git-link" onclick="window.electronAPI?.openExternal('${verifyUrl}')">${verifyUrl}</span>
                </div>
                <div class="git-device-status" id="ghPollStatus">Đang chờ xác nhận...</div>
            </div>
        `;
        loginBtn.textContent = 'Hủy';
        loginBtn.disabled = false;
        loginBtn.onclick = () => {
            this._deviceFlowAborted = true;
            this.checkGithubAuth();
        };

        this._deviceFlowAborted = false;
        const startTime = Date.now();
        const maxWait = expiresIn * 1000;

        const poll = async () => {
            if (this._deviceFlowAborted) return;
            if (Date.now() - startTime > maxWait) {
                statusEl.innerHTML = '<div class="git-empty" style="color:var(--accent-red);">Hết thời gian. Thử lại.</div>';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Kết nối GitHub';
                loginBtn.onclick = () => this.startDeviceFlow();
                return;
            }

            const result = await window.api.github.pollToken(codeData.device_code);

            if (result.success) {
                this.checkGithubAuth();
                return;
            }

            if (result.error === 'authorization_pending') {
                setTimeout(poll, interval);
            } else if (result.error === 'slow_down') {
                setTimeout(poll, (codeData.interval || 5) + 5000);
            } else if (result.error === 'expired_token') {
                statusEl.innerHTML = '<div class="git-empty" style="color:var(--accent-red);">Mã hết hạn. Thử lại.</div>';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Kết nối GitHub';
                loginBtn.onclick = () => this.startDeviceFlow();
            } else if (result.error === 'access_denied') {
                statusEl.innerHTML = '<div class="git-empty" style="color:var(--accent-red);">Bạn đã từ chối quyền.</div>';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Kết nối GitHub';
                loginBtn.onclick = () => this.startDeviceFlow();
            } else {
                const pollStatus = document.getElementById('ghPollStatus');
                if (pollStatus) pollStatus.textContent = `Lỗi: ${result.error}. Đang thử lại...`;
                setTimeout(poll, interval);
            }
        };

        setTimeout(poll, interval);
    }

    setupEvents(repoPath) {
        document.getElementById('gitRefreshBtn')?.addEventListener('click', () => {
            this.refresh(repoPath);
        });

        document.getElementById('gitCloneBtn')?.addEventListener('click', async () => {
            const url = document.getElementById('gitCloneUrl')?.value.trim();
            if (!url) return;
            const folderName = url.split('/').pop().replace('.git', '');
            const destPath = repoPath ? `${repoPath}/${folderName}` : folderName;
            const result = await window.api.git.clone(url, destPath);
            if (result.success) {
                alert(`Clone thành công: ${result.path}`);
            } else {
                alert('Lỗi clone: ' + result.error);
            }
        });

        document.querySelectorAll('.git-change-action').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                const item = e.target.closest('.git-change-item');
                const file = item.dataset.file;
                const action = btn.dataset.action;

                if (action === 'stage') {
                    await window.api.git.stage(repoPath, [file]);
                } else {
                    await window.api.git.unstage(repoPath, [file]);
                }
                this.refresh(repoPath);
            });
        });

        document.getElementById('gitCommitBtn')?.addEventListener('click', async () => {
            const msg = document.getElementById('gitCommitMsg')?.value.trim();
            if (!msg) return;

            await window.api.git.commit(repoPath, msg);
            document.getElementById('gitCommitMsg').value = '';
            this.refresh(repoPath);
        });

        document.querySelectorAll('.git-branch-item').forEach((item) => {
            item.addEventListener('click', async () => {
                const branch = item.dataset.branch;
                if (branch && !item.classList.contains('active')) {
                    await window.api.git.checkout(repoPath, branch);
                    this.refresh(repoPath);
                }
            });
        });

        document.getElementById('gitPushBtn')?.addEventListener('click', async () => {
            const statusEl = document.getElementById('gitSyncStatus');
            if (statusEl) statusEl.textContent = 'Đang push...';
            const result = await window.api.git.push(repoPath, 'origin');
            if (statusEl) statusEl.textContent = result.success ? 'Push thành công!' : `Lỗi: ${result.error}`;
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
            this.refresh(repoPath);
        });

        document.getElementById('gitPullBtn')?.addEventListener('click', async () => {
            const statusEl = document.getElementById('gitSyncStatus');
            if (statusEl) statusEl.textContent = 'Đang pull...';
            const result = await window.api.git.pull(repoPath, 'origin');
            if (statusEl) statusEl.textContent = result.success ? 'Pull thành công!' : `Lỗi: ${result.error}`;
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
            this.refresh(repoPath);
        });

        document.getElementById('gitFetchBtn')?.addEventListener('click', async () => {
            const statusEl = document.getElementById('gitSyncStatus');
            if (statusEl) statusEl.textContent = 'Đang fetch...';
            const result = await window.api.git.fetch(repoPath, 'origin');
            if (statusEl) statusEl.textContent = result.success ? 'Fetch thành công!' : `Lỗi: ${result.error}`;
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        });

        document.getElementById('gitRemoteToggle')?.addEventListener('click', () => {
            const form = document.getElementById('gitRemoteForm');
            if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
        });

        document.getElementById('gitRemoteSaveBtn')?.addEventListener('click', async () => {
            const url = document.getElementById('gitRemoteUrl')?.value.trim();
            if (!url) return;
            await window.api.git.addRemote(repoPath, 'origin', url);
            document.getElementById('gitRemoteForm').style.display = 'none';
            this.renderRemote(repoPath);
        });
    }
}

window.GitPanel = GitPanel;
