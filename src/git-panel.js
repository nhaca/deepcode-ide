class GitPanel {
    constructor(container) {
        this.container = container;
        this.status = null;
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                        <span>BRANCHES</span>
                    </div>
                    <div class="git-branches-list" id="gitBranchesList">
                        <div class="git-branch-item active">main</div>
                    </div>
                </div>
            </div>
        `;
    }

    async refresh(repoPath) {
        if (!repoPath) return;

        const status = await window.api.git.status(repoPath);
        if (status.notGitRepo) {
            this.showNotGitRepo();
            return;
        }

        this.status = status;
        this.renderChanges(status);
        this.renderBranches(repoPath);
        this.setupEvents(repoPath);
    }

    showNotGitRepo() {
        const changesList = document.getElementById('gitChangesList');
        if (changesList) {
            changesList.innerHTML = '<div class="git-empty">Not a git repository</div>';
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

    setupEvents(repoPath) {
        document.getElementById('gitRefreshBtn')?.addEventListener('click', () => {
            this.refresh(repoPath);
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
    }
}

window.GitPanel = GitPanel;
