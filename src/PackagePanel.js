class PackagePanel {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.currentPkgType = null;
    }

    setup() {
        this.container = document.getElementById('packagePanelContainer');
    }

    async refresh() {
        if (!this.container) return;
        if (!this.app.currentFolder) {
            this.container.innerHTML = '<div class="package-panel"><div class="package-empty">Mở thư mục để quản lý gói</div></div>';
            return;
        }

        const projectInfo = await window.api.pkg.detectProjectType(this.app.currentFolder);
        if (!projectInfo) {
            this.container.innerHTML = '<div class="package-panel"><div class="package-empty">Không tìm thấy file package nào</div></div>';
            return;
        }

        this.currentPkgType = projectInfo.type;
        const packages = await window.api.pkg.list(this.app.currentFolder, projectInfo.type);

        this.container.innerHTML = `
            <div class="package-panel">
                <div class="package-header">
                    <div class="package-manager-badge">
                        <span class="badge-dot"></span>
                        <span>${projectInfo.type.toUpperCase()} - ${projectInfo.file}</span>
                    </div>
                    <div class="package-search-row">
                        <input type="text" class="package-search-input" id="packageSearchInput" placeholder="Tên package cần cài..." autocomplete="off">
                        <button class="package-install-btn" id="packageInstallBtn">Cài đặt</button>
                    </div>
                </div>
                <div class="package-list" id="packageList">
                    ${packages.length === 0 ? '<div class="package-empty">Chưa có package nào</div>' : packages.map(p => `
                        <div class="package-item" data-name="${p.name}">
                            <span class="package-item-name">${p.name}</span>
                            <span class="package-item-version">${p.version}</span>
                            <button class="package-item-remove" title="Gỡ cài đặt">&times;</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const installBtn = document.getElementById('packageInstallBtn');
        const searchInput = document.getElementById('packageSearchInput');
        if (installBtn && searchInput) {
            installBtn.onclick = async () => {
                const name = searchInput.value.trim();
                if (!name) return;
                installBtn.textContent = 'Đang cài...';
                installBtn.disabled = true;
                const result = await window.api.pkg.install(this.app.currentFolder, this.currentPkgType, name);
                if (result.success) {
                    this.app.showToast(`Đã cài đặt ${name}`, 'success');
                    searchInput.value = '';
                    await this.refresh();
                } else {
                    this.app.showToast(`Lỗi cài đặt: ${result.error || result.stderr}`, 'error');
                }
                installBtn.textContent = 'Cài đặt';
                installBtn.disabled = false;
            };
            searchInput.onkeydown = (e) => { if (e.key === 'Enter') installBtn.click(); };
        }

        this.container.querySelectorAll('.package-item-remove').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const name = btn.closest('.package-item').dataset.name;
                if (confirm(`Gỡ cài đặt ${name}?`)) {
                    const result = await window.api.pkg.uninstall(this.app.currentFolder, this.currentPkgType, name);
                    if (result.success) {
                        this.app.showToast(`Đã gỡ ${name}`, 'success');
                        await this.refresh();
                    } else {
                        this.app.showToast(`Lỗi: ${result.error || result.stderr}`, 'error');
                    }
                }
            };
        });
    }
}
