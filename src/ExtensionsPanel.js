class ExtensionsPanel {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    setup() {
        this.container = document.getElementById('extensionsPanelContainer');
    }

    async refresh() {
        if (!this.container) return;

        const installed = await window.api.ext.list();
        const builtInExtensions = [
            { id: 'deepcode-themes-pack', name: 'DeepCode Themes Pack', description: 'Bộ giao diện bổ sung cho DeepCode IDE', version: '1.0.0', author: 'DeepCode', builtin: true },
            { id: 'deepcode-snippets-js', name: 'JavaScript Snippets', description: 'Snippet nhanh cho JavaScript & TypeScript', version: '1.2.0', author: 'DeepCode', builtin: true },
            { id: 'deepcode-snippets-py', name: 'Python Snippets', description: 'Snippet nhanh cho Python', version: '1.0.0', author: 'DeepCode', builtin: true },
            { id: 'deepcode-lint-hint', name: 'Lint & Hint', description: 'Gợi ý linting realtime trong editor', version: '0.9.0', author: 'DeepCode', builtin: true },
        ];

        const installedIds = new Set(installed.map(e => e.id));

        this.container.innerHTML = `
            <div class="extensions-panel">
                <div class="ext-search-row">
                    <input type="text" class="ext-search-input" id="extSearchInput" placeholder="Tìm kiếm phần mở rộng..." autocomplete="off">
                </div>
                <div class="ext-list" id="extList">
                    ${installed.length > 0 ? `
                        <div class="ext-section-label">Đã cài đặt</div>
                        ${installed.map(ext => `
                            <div class="ext-item" data-id="${ext.id}">
                                <div class="ext-item-icon">${(ext.name || ext.id)[0].toUpperCase()}</div>
                                <div class="ext-item-info">
                                    <div class="ext-item-name">${ext.name || ext.id}</div>
                                    <div class="ext-item-desc">${ext.description || ''}</div>
                                    <div class="ext-item-meta">v${ext.version || '0.0.1'}${ext.author ? ' - ' + ext.author : ''}</div>
                                </div>
                                <div class="ext-toggle ${ext.enabled !== false ? 'active' : ''}" data-id="${ext.id}"></div>
                            </div>
                        `).join('')}
                    ` : ''}
                    <div class="ext-section-label">Cho tiện ích</div>
                    ${builtInExtensions.map(ext => `
                        <div class="ext-item" data-id="${ext.id}">
                            <div class="ext-item-icon">${ext.name[0]}</div>
                            <div class="ext-item-info">
                                <div class="ext-item-name">${ext.name}</div>
                                <div class="ext-item-desc">${ext.description}</div>
                                <div class="ext-item-meta">v${ext.version} - ${ext.author}</div>
                            </div>
                            ${installedIds.has(ext.id)
                                ? '<button class="ext-install-btn installed" disabled>Đã cài</button>'
                                : '<button class="ext-install-btn" data-id="' + ext.id + '">Cài đặt</button>'
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        this.container.querySelectorAll('.ext-toggle').forEach(toggle => {
            toggle.onclick = async (e) => {
                e.stopPropagation();
                const id = toggle.dataset.id;
                const isActive = toggle.classList.contains('active');
                await window.api.ext.setEnabled(id, !isActive);
                toggle.classList.toggle('active');
            };
        });

        this.container.querySelectorAll('.ext-install-btn:not(.installed)').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const ext = builtInExtensions.find(e => e.id === id);
                if (!ext) return;
                btn.textContent = 'Đang cài...';
                btn.disabled = true;
                const result = await window.api.ext.install(id, {
                    name: ext.name, description: ext.description, version: ext.version, author: ext.author,
                });
                if (result.success) {
                    this.app.showToast(`Đã cài đặt ${ext.name}`, 'success');
                    await this.refresh();
                } else {
                    this.app.showToast(`Lỗi: ${result.error}`, 'error');
                    btn.textContent = 'Cài đặt';
                    btn.disabled = false;
                }
            };
        });

        const searchInput = document.getElementById('extSearchInput');
        if (searchInput) {
            searchInput.oninput = () => {
                const query = searchInput.value.toLowerCase();
                this.container.querySelectorAll('.ext-item').forEach(item => {
                    const name = item.querySelector('.ext-item-name')?.textContent.toLowerCase() || '';
                    const desc = item.querySelector('.ext-item-desc')?.textContent.toLowerCase() || '';
                    item.style.display = (name.includes(query) || desc.includes(query)) ? 'flex' : 'none';
                });
            };
        }
    }
}
