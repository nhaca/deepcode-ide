class DeepCodeIDE {
    constructor() {
        this.currentFolder = null;
        this.editorManager = null;
        this.terminalManager = null;
        this.gitPanel = null;
        this.commandPalette = null;
        this.commandRegistry = null;
        this.aiPanel = null;
        this.sessions = [{ id: 1, title: 'Phiên mới', active: true }];

        this.init();
    }

    customPrompt(title, desc, defaultVal = '') {
        return new Promise((resolve) => {
            const overlay = document.getElementById('inputModal');
            document.getElementById('inputModalTitle').textContent = title;
            document.getElementById('inputModalDesc').textContent = desc;
            const field = document.getElementById('inputModalField');
            field.value = defaultVal;
            overlay.style.display = 'flex';
            field.focus();
            field.select();

            const cleanup = () => { overlay.style.display = 'none'; };

            document.getElementById('inputModalOk').onclick = () => {
                cleanup();
                resolve(field.value.trim() || null);
            };
            document.getElementById('inputModalCancel').onclick = () => {
                cleanup();
                resolve(null);
            };
            field.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    cleanup();
                    resolve(field.value.trim() || null);
                }
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            };
        });
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast ' + type;
        toast.style.display = 'block';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 2500);
    }

    init() {
        this.setupTitleBar();
        this.setupActivityBar();
        this.setupSidebar();
        this.setupBottomPanel();
        this.setupEditorContainer();
        this.setupStateSubscriptions();
        this.setupTerminal();
        this.setupGitPanel();
        this.setupCommandPalette();
        this.setupAIPanel();
        this.searchManager = new SearchManager();
        this.setupKeyboardShortcuts();
        this.setupResize();
        this.setupSettingsModal();
        this.setupContextMenu();
    }

    setupTitleBar() {
        document.getElementById('minimizeBtn').onclick = () => window.api.app.minimize();
        document.getElementById('maximizeBtn').onclick = () => window.api.app.maximize();
        document.getElementById('closeBtn').onclick = () => window.api.app.close();
    }

    setupActivityBar() {
        document.querySelectorAll('.activity-btn').forEach((btn) => {
            btn.onclick = () => {
                const panel = btn.dataset.panel;

                if (panel === 'ai') {
                    this.toggleAIPanel();
                    return;
                }

                if (panel === 'settings') {
                    this.toggleSettingsPanel();
                    return;
                }

                document.querySelectorAll('.activity-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                const gitSection = document.getElementById('gitPanelSection');
                const fileTreeSection = document.querySelector('.sidebar-section.flex-1:not(#gitPanelSection)');

                if (panel === 'git') {
                    gitSection.style.display = 'flex';
                    fileTreeSection.style.display = 'none';
                    document.getElementById('searchPanelSection').style.display = 'none';
                    this.refreshGitStatus();
                } else if (panel === 'explorer') {
                    gitSection.style.display = 'none';
                    fileTreeSection.style.display = 'flex';
                    document.getElementById('searchPanelSection').style.display = 'none';
                } else if (panel === 'search') {
                    gitSection.style.display = 'none';
                    fileTreeSection.style.display = 'none';
                    document.getElementById('searchPanelSection').style.display = 'flex';
                }
            };
        });
    }

    setupSidebar() {
        document.getElementById('openFolderBtn').onclick = () => this.openFolder();
        document.getElementById('welcomeOpenFolder')?.addEventListener('click', () => this.openFolder());
        document.getElementById('welcomeNewFile')?.addEventListener('click', () => this.newFile());
        document.getElementById('newSessionBtn').onclick = () => this.newSession();
    }

    setupEditorContainer() {
        this.editorContainer = document.getElementById('editorContainer');
        console.log('Editor container:', this.editorContainer);
    }

    setupStateSubscriptions() {
        window.state.subscribe('openFiles', (files) => this.updateTabs(files));
        window.state.subscribe('activeFile', (path) => this.highlightActiveTab(path));
    }

    async openFolder() {
        const folderPath = await window.api.fs.openFolder();
        if (folderPath) {
            this.currentFolder = folderPath;
            window.state.set('workspaceRoot', folderPath);
            await this.loadFileTree(folderPath);
            this.refreshGitStatus();
            if (this.terminalManager) {
                this.terminalManager.killAll();
                this.terminalManager.create(folderPath);
            }
        }
    }

    async refreshGitStatus() {
        if (this.gitPanel && this.currentFolder) {
            await this.gitPanel.refresh(this.currentFolder);
        }
    }

    async loadFileTree(dirPath) {
        const fileTree = document.getElementById('fileTree');
        fileTree.innerHTML = '';

        const rootName = dirPath.split(/[\\/]/).pop();
        const rootDiv = document.createElement('div');
        rootDiv.className = 'file-item folder root-folder';
        rootDiv.innerHTML = `
            <svg class="file-icon expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
            <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${rootName}</span>
        `;
        fileTree.appendChild(rootDiv);

        const listDiv = document.createElement('div');
        listDiv.className = 'file-tree-list';
        listDiv.style.paddingLeft = '12px';
        fileTree.appendChild(listDiv);

        rootDiv.onclick = () => {
            const isExpanded = listDiv.style.display !== 'none';
            listDiv.style.display = isExpanded ? 'none' : 'block';
            rootDiv.classList.toggle('expanded', !isExpanded);
        };
        rootDiv.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, dirPath, true);
        });

        await this.renderDirectory(dirPath, listDiv);
        listDiv.style.display = 'block';
        rootDiv.classList.add('expanded');
    }

    async renderDirectory(dirPath, container) {
        const items = await window.api.fs.readDirectory(dirPath);

        items.forEach((item) => {
            const div = document.createElement('div');
            div.className = `file-item ${item.isDirectory ? 'folder' : ''}`;
            
            const expandIcon = item.isDirectory ? `<svg class="file-icon expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>` : '';
            const fileIcon = item.isDirectory
                ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
                : this.getFileIcon(item.name);

            div.innerHTML = `
                ${expandIcon}
                <svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${fileIcon}
                </svg>
                <span>${item.name}</span>
            `;

            if (item.isDirectory) {
                const childContainer = document.createElement('div');
                childContainer.className = 'file-tree-list';
                childContainer.style.paddingLeft = '12px';
                childContainer.style.display = 'none';

                let loaded = false;
                div.onclick = async () => {
                    const isExpanded = childContainer.style.display !== 'none';
                    if (isExpanded) {
                        childContainer.style.display = 'none';
                        div.classList.remove('expanded');
                    } else {
                        if (!loaded) {
                            await this.renderDirectory(item.path, childContainer);
                            loaded = true;
                        }
                        childContainer.style.display = 'block';
                        div.classList.add('expanded');
                    }
                };
                div.addEventListener('contextmenu', (e) => {
                    this.showContextMenu(e, item.path, true);
                });

                container.appendChild(div);
                container.appendChild(childContainer);
            } else {
                div.onclick = () => {
                    container.querySelectorAll('.file-item').forEach(f => f.classList.remove('active'));
                    div.classList.add('active');
                    this.openFile(item.path, item.name);
                };
                div.addEventListener('contextmenu', (e) => {
                    container.querySelectorAll('.file-item').forEach(f => f.classList.remove('active'));
                    div.classList.add('active');
                    this.showContextMenu(e, item.path, false);
                });
                container.appendChild(div);
            }
        });
    }

    getFileIcon(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        const icons = {
            js: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="7" fill="currentColor" text-anchor="middle" font-family="monospace">JS</text>',
            ts: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="7" fill="currentColor" text-anchor="middle" font-family="monospace">TS</text>',
            py: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="7" fill="currentColor" text-anchor="middle" font-family="monospace">PY</text>',
            json: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="6" fill="currentColor" text-anchor="middle" font-family="monospace">{}</text>',
            md: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="6" fill="currentColor" text-anchor="middle" font-family="monospace">MD</text>',
            html: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="6" fill="currentColor" text-anchor="middle" font-family="monospace">&lt;&gt;</text>',
            css: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="6" fill="currentColor" text-anchor="middle" font-family="monospace">#</text>',
            bat: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><text x="12" y="17" font-size="6" fill="currentColor" text-anchor="middle" font-family="monospace">&gt;_</text>',
            txt: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
        };
        return icons[ext] || '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
    }

    async openFile(filePath, fileName) {
        try {
            const content = await window.api.fs.readFile(filePath);
            
            if (content === null) return;

            // Hide welcome, show editor
            document.getElementById('welcomePanel').style.display = 'none';
            const editorPanel = document.getElementById('editorPanel');
            editorPanel.style.display = 'block';

            // Initialize editor if needed
            if (!this.editorManager) {
                this.editorManager = new EditorManager(this.editorContainer);
                await this.editorManager.init();
            }

            // Open file in editor
            await this.editorManager.openFile(filePath, content);
            this.addTab(fileName, filePath);
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }

    newFile() {
        document.getElementById('welcomePanel').style.display = 'none';
        document.getElementById('editorPanel').style.display = 'flex';
        this.addTab('untitled', null);
    }

    addTab(name, filePath) {
        const tabsBar = document.getElementById('tabsBar');
        const existingTab = tabsBar.querySelector(`[data-file="${filePath || 'untitled'}"]`);
        if (existingTab) {
            this.switchTab(existingTab);
            return;
        }

        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));

        const tab = document.createElement('div');
        tab.className = 'tab active';
        tab.dataset.file = filePath || 'untitled';
        tab.innerHTML = `<span>${name}</span><button class="tab-close">×</button>`;
        tab.onclick = (e) => {
            if (e.target.classList.contains('tab-close')) {
                this.closeTab(tab);
            } else {
                this.switchTab(tab);
            }
        };
        tabsBar.appendChild(tab);
    }

    closeTab(tab) {
        const filePath = tab.dataset.file;
        if (filePath && filePath !== 'untitled') {
            this.editorManager?.closeFile(filePath);
        }
        tab.remove();

        const remainingTabs = document.querySelectorAll('.tab');
        if (remainingTabs.length > 0) {
            const lastTab = remainingTabs[remainingTabs.length - 1];
            this.switchTab(lastTab);
        } else {
            document.getElementById('welcomePanel').style.display = 'flex';
            document.getElementById('editorPanel').style.display = 'none';
        }
    }

    switchTab(tab) {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const filePath = tab.dataset.file;
        if (filePath && filePath !== 'untitled' && this.editorManager) {
            const file = window.state.get('openFiles').find((f) => f.path === filePath);
            if (file) {
                this.editorManager.openFile(filePath, file.content);
            }
        }
    }

    updateTabs(files) {
        const tabsBar = document.getElementById('tabsBar');
        files.forEach((file) => {
            const tab = tabsBar.querySelector(`[data-file="${file.path}"]`);
            if (tab) {
                const name = file.path.split(/[\\/]/).pop();
                const dot = file.dirty ? ' •' : '';
                tab.querySelector('span').textContent = name + dot;
            }
        });
    }

    highlightActiveTab(path) {
        document.querySelectorAll('.tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.file === path);
        });
    }

    setupBottomPanel() {
        document.querySelectorAll('.panel-tab').forEach((tab) => {
            tab.onclick = () => {
                document.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
            };
        });
    }

    setupTerminal() {
        const terminalPanel = document.getElementById('terminalPanel');
        this.terminalManager = new TerminalManager(terminalPanel);
        this.terminalManager.create(this.currentFolder || undefined);
    }

    setupGitPanel() {
        const gitPanelContainer = document.getElementById('gitPanelContainer');
        if (gitPanelContainer) {
            this.gitPanel = new GitPanel(gitPanelContainer);
        }
    }

    setupCommandPalette() {
        this.commandRegistry = new CommandRegistry();
        this.commandPalette = new CommandPalette(this.commandRegistry);
        this.registerCommands();
    }

    setupSettingsModal() {
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
        if (ctxSelect && savedCtx) ctxSelect.value = savedCtx;

        providerSelect?.addEventListener('change', (e) => {
            localStorage.setItem('deepcode-provider', e.target.value);
            window._aiPanel?.loadModels?.();
        });

        document.getElementById('settingsSaveBtn')?.addEventListener('click', () => {
            const model = document.getElementById('settingsDefaultModel')?.value;
            const ctx = document.getElementById('settingsContextLimit')?.value;
            const provider = providerSelect?.value || 'deepcode';

            if (model) localStorage.setItem('deepcode-default-model', model);
            if (ctx) localStorage.setItem('deepcode-context-limit', ctx);
            localStorage.setItem('deepcode-provider', provider);

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

    setupAIPanel() {
        const aiColumn = document.getElementById('aiColumn');
        if (aiColumn) {
            this.aiPanel = new AIPanel(aiColumn, window.state);
            window._aiPanel = this.aiPanel;
        }
    }

    toggleAIPanel() {
        const shell = document.querySelector('.ide-shell');
        const isHidden = shell.classList.contains('ai-hidden');

        if (isHidden) {
            shell.classList.remove('ai-hidden');
            window.state.set('aiPanelVisible', true);
        } else {
            shell.classList.add('ai-hidden');
            window.state.set('aiPanelVisible', false);
        }
    }

    toggleSettingsPanel() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
        }
    }

    registerCommands() {
        this.commandRegistry.register('file.openFolder', 'File: Open Folder', () => this.openFolder());
        this.commandRegistry.register('file.newFile', 'File: New File', () => this.newFile());
        this.commandRegistry.register('file.save', 'File: Save', () => this.saveFile());
        this.commandRegistry.register('terminal.toggle', 'Terminal: Toggle Terminal', () => this.toggleTerminal());
        this.commandRegistry.register('git.refresh', 'Git: Refresh Status', () => this.refreshGitStatus());
        this.commandRegistry.register('view.explorer', 'View: Explorer', () => this.switchPanel('explorer'));
        this.commandRegistry.register('view.git', 'View: Source Control', () => this.switchPanel('git'));
    }

    switchPanel(panel) {
        const btn = document.querySelector(`.activity-btn[data-panel="${panel}"]`);
        if (btn) btn.click();
    }

    async toggleTerminal() {
        const bottomPanel = document.getElementById('bottomPanel');
        const isVisible = bottomPanel.style.display !== 'none';

        if (isVisible) {
            bottomPanel.style.display = 'none';
        } else {
            bottomPanel.style.display = 'flex';
            if (!this.terminalManager.activeId) {
                await this.terminalManager.create(this.currentFolder);
            } else {
                this.terminalManager.resize();
                this.terminalManager.xterm?.focus();
            }
        }
    }

    newSession() {
        const sessionsList = document.getElementById('sessionsList');
        const div = document.createElement('div');
        div.className = 'session-item';
        div.innerHTML = `<span>New session ${this.sessions.length + 1}</span>`;
        div.onclick = () => {
            document.querySelectorAll('.session-item').forEach((s) => s.classList.remove('active'));
            div.classList.add('active');
        };
        sessionsList.insertBefore(div, sessionsList.firstChild);
        this.sessions.push({ id: this.sessions.length + 1 });
    }

    setupResize() {
        this.resizeManager = new ResizeManager();
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveFile();
            }
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.openFolder();
            }
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                this.toggleTerminal();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();
                this.commandPalette?.toggle();
            }
        });
    }

    async saveFile() {
        if (this.editorManager) {
            await this.editorManager.save();
        }
    }

    // Context Menu
    setupContextMenu() {
        const menu = document.getElementById('contextMenu');
        document.addEventListener('click', () => { menu.style.display = 'none'; });
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.file-tree-list') && !e.target.closest('#fileTree')) {
                menu.style.display = 'none';
            }
        });
    }

    showContextMenu(e, targetPath, isDir) {
        e.preventDefault();
        e.stopPropagation();
        const menu = document.getElementById('contextMenu');

        const newFileIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
        const newFolderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>';
        const renameIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
        const deleteIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

        menu.innerHTML = `
            <div class="context-menu-item" data-action="newFile">${newFileIcon} Tạo file mới</div>
            <div class="context-menu-item" data-action="newFolder">${newFolderIcon} Tạo thư mục mới</div>
            <div class="context-menu-sep"></div>
            <div class="context-menu-item" data-action="rename">${renameIcon} Đổi tên</div>
            <div class="context-menu-item danger" data-action="delete">${deleteIcon} Xóa</div>
        `;

        menu.style.display = 'block';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + 'px';

        menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.onclick = () => this.handleContextAction(item.dataset.action, targetPath, isDir);
        });
    }

    async handleContextAction(action, targetPath, isDir) {
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'none';
        const parentDir = isDir ? targetPath : targetPath.replace(/[\\/][^\\/]+$/, '');

        if (action === 'newFile') {
            const name = await this.customPrompt('Tạo file mới', 'Nhập tên file:');
            if (!name) return;
            const fullPath = parentDir + '\\' + name;
            await window.api.fs.writeFile(fullPath, '');
            await this.loadFileTree(this.currentFolder);

        } else if (action === 'newFolder') {
            const name = await this.customPrompt('Tạo thư mục mới', 'Nhập tên thư mục:');
            if (!name) return;
            const fullPath = parentDir + '\\' + name;
            await window.api.fs.mkdir(fullPath);
            await this.loadFileTree(this.currentFolder);

        } else if (action === 'rename') {
            const oldName = targetPath.split(/[\\/]/).pop();
            const newName = await this.customPrompt('Đổi tên', 'Nhập tên mới:', oldName);
            if (!newName || newName === oldName) return;
            const newPath = await window.api.fs.rename(targetPath, newName);
            if (newPath) {
                const openFile = window.state.get('activeFile');
                if (openFile && openFile.path === targetPath) {
                    openFile.path = newPath;
                    openFile.name = newName;
                }
            }
            await this.loadFileTree(this.currentFolder);

        } else if (action === 'delete') {
            const name = targetPath.split(/[\\/]/).pop();
            const confirmed = await this.customPrompt('Xóa', `Xóa "${name}"? Nhập "xóa" để xác nhận:`, '');
            if (confirmed !== 'xóa' && confirmed !== 'Xóa') return;
            await window.api.fs.deleteFile(targetPath);
            await this.loadFileTree(this.currentFolder);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.ide = new DeepCodeIDE();
});
