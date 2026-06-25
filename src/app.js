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

            document.getElementById('inputModalOk').onclick = (e) => {
                e.stopPropagation();
                cleanup();
                resolve(field.value.trim() || null);
            };
            document.getElementById('inputModalCancel').onclick = (e) => {
                e.stopPropagation();
                cleanup();
                resolve(null);
            };
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            };
            field.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
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
        this.setupPackagePanel();
        this.setupExtensionsPanel();
        this.setupThemeSelector();
        this.restoreLastFolder();
    }

    async restoreLastFolder() {
        const lastFolder = localStorage.getItem('deepcode-last-folder');
        if (lastFolder) {
            try {
                const items = await window.api.fs.readDirectory(lastFolder);
                if (items !== null) {
                    this.currentFolder = lastFolder;
                    window.state.set('workspaceRoot', lastFolder);
                    await this.loadFileTree(lastFolder);
                    this.refreshGitStatus();
                    if (this.terminalManager) {
                        this.terminalManager.killAll();
                        this.terminalManager.create(lastFolder);
                    }
                }
            } catch {}
        }
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
                const fileTreeSection = document.querySelector('.sidebar-section.flex-1:not(#gitPanelSection):not(#packagePanelSection):not(#extensionsPanelSection):not(#searchPanelSection)');
                const searchSection = document.getElementById('searchPanelSection');
                const packageSection = document.getElementById('packagePanelSection');
                const extensionsSection = document.getElementById('extensionsPanelSection');

                [gitSection, fileTreeSection, searchSection, packageSection, extensionsSection].forEach(s => {
                    if (s) s.style.display = 'none';
                });

                if (panel === 'git') {
                    gitSection.style.display = 'flex';
                    this.refreshGitStatus();
                } else if (panel === 'explorer') {
                    fileTreeSection.style.display = 'flex';
                } else if (panel === 'search') {
                    searchSection.style.display = 'flex';
                } else if (panel === 'packages') {
                    packageSection.style.display = 'flex';
                    this.refreshPackagePanel();
                } else if (panel === 'extensions') {
                    extensionsSection.style.display = 'flex';
                    this.refreshExtensionsPanel();
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
        const splitBtn = document.getElementById('splitEditorBtn');
        if (splitBtn) {
            splitBtn.addEventListener('click', () => {
                if (this.editorManager) {
                    this.editorManager.toggleSplit();
                }
            });
        }
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
            localStorage.setItem('deepcode-last-folder', folderPath);
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

            if (this.editorManager.splitMode && this.editorManager.editorGroups) {
                const emptyGroup = this.editorManager.editorGroups.find(g => !g.activeFile);
                if (emptyGroup) {
                    const language = this.editorManager._getLanguage(filePath);
                    const uri = this.editorManager.monaco.Uri.file(filePath);
                    if (!this.editorManager.models.has(filePath)) {
                        const model = this.editorManager.monaco.editor.createModel(content, language, uri);
                        this.editorManager.models.set(filePath, model);
                    }
                    emptyGroup.editor.setModel(this.editorManager.models.get(filePath));
                    emptyGroup.activeFile = filePath;
                    const tab = document.createElement('div');
                    tab.className = 'editor-group-tab active';
                    tab.dataset.file = filePath;
                    tab.innerHTML = '<span>' + fileName + '</span>';
                    emptyGroup.tabsEl.querySelectorAll('.editor-group-tab').forEach(t => t.classList.remove('active'));
                    emptyGroup.tabsEl.appendChild(tab);
                    tab.onclick = () => {
                        emptyGroup.editor.setModel(this.editorManager.models.get(filePath));
                        emptyGroup.activeFile = filePath;
                        emptyGroup.tabsEl.querySelectorAll('.editor-group-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                    };
                    window.state.set('activeFile', filePath);
                    if (!window.state.get('openFiles').find(f => f.path === filePath)) {
                        window.state.set('openFiles', [...window.state.get('openFiles'), { path: filePath, content, dirty: false }]);
                    }
                    return;
                }
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
        const panels = {
            terminal: document.getElementById('terminalPanel'),
            problems: document.getElementById('problemsPanel'),
            output: document.getElementById('outputPanel'),
        };
        document.querySelectorAll('.panel-tab').forEach((tab) => {
            tab.onclick = () => {
                document.querySelectorAll('.panel-tab').forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.panel;
                Object.entries(panels).forEach(([key, el]) => {
                    if (el) el.style.display = key === target ? 'block' : 'none';
                });
                if (target === 'terminal' && this.terminalManager) this.terminalManager.resize();
            };
        });
        this.outputLog = [];
    }

    logToOutput(message, type = 'info') {
        const panel = document.getElementById('outputPanel');
        if (!panel) return;
        const time = new Date().toLocaleTimeString('vi-VN');
        const colors = { info: '#94a3b8', success: '#34d399', error: '#f87171', warn: '#fbbf24' };
        const prefix = { info: '●', success: '✓', error: '✗', warn: '⚠' };
        const line = document.createElement('div');
        line.style.cssText = `padding:2px 0; border-bottom:1px solid #1e1a2e; color:${colors[type] || colors.info};`;
        line.textContent = `[${time}] ${prefix[type] || '●'} ${message}`;
        panel.appendChild(line);
        panel.scrollTop = panel.scrollHeight;
        this.outputLog.push({ time, type, message });
        const badge = document.querySelector('[data-panel="output"] .panel-badge');
        if (badge) badge.style.display = 'block';
    }

    updateProblems() {
        const panel = document.getElementById('problemsPanel');
        if (!panel) return;
        const markers = window.editorManager?.editor?.getModel()?.getMarkers() || [];
        const badge = document.getElementById('problemsBadge');
        if (markers.length === 0) {
            panel.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;">Không có vấn đề nào</div>';
            if (badge) badge.style.display = 'none';
            return;
        }
        if (badge) { badge.style.display = 'inline'; badge.textContent = markers.length; }
        panel.innerHTML = markers.map(m => {
            const sev = m.severity === 8 ? 'error' : m.severity === 4 ? 'warning' : 'info';
            const colors = { error: '#f87171', warning: '#fbbf24', info: '#60a5fa' };
            const icons = { error: '✗', warning: '⚠', info: '●' };
            return `<div class="problem-item" style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #1e1a2e;font-size:12px;cursor:pointer;" data-line="${m.startLineNumber}" data-col="${m.startColumn}">
                <span style="color:${colors[sev]};flex-shrink:0;">${icons[sev]}</span>
                <span style="color:var(--text-secondary);flex-shrink:0;">Ln ${m.startLineNumber}</span>
                <span style="color:var(--text-primary);">${m.message}</span>
            </div>`;
        }).join('');
        panel.querySelectorAll('.problem-item').forEach(el => {
            el.onclick = () => {
                const line = parseInt(el.dataset.line);
                const col = parseInt(el.dataset.col);
                window.editorManager?.editor?.revealLineInCenter(line);
                window.editorManager?.editor?.setPosition({ lineNumber: line, column: col });
                window.editorManager?.editor?.focus();
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
        this.commandRegistry.register('admin.open', 'Admin: Mo Admin Panel', async () => {
            try {
                await window.api.admin.open();
            } catch (e) { console.error(e); }
        });
        this.commandRegistry.register('view.explorer', 'View: Explorer', () => this.switchPanel('explorer'));
        this.commandRegistry.register('view.git', 'View: Source Control', () => this.switchPanel('git'));
        this.commandRegistry.register('view.packages', 'View: Packages', () => this.switchPanel('packages'));
        this.commandRegistry.register('view.extensions', 'View: Extensions', () => this.switchPanel('extensions'));
        this.commandRegistry.register('editor.split', 'Editor: Split Editor', () => {
            if (this.editorManager) this.editorManager.toggleSplit();
        });
    }

    switchPanel(panel) {
        const btn = document.querySelector(`.activity-btn[data-panel="${panel}"]`);
        if (btn) btn.click();
    }

    _showTokenInput(title) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999';
            overlay.innerHTML = `
                <div style="background:var(--bg-secondary,#1e1e2e);border:1px solid var(--border-color,#333);border-radius:12px;padding:24px;min-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
                    <div style="color:var(--text-primary,#fff);font-size:14px;margin-bottom:12px">${title}<br><span style="color:var(--text-muted,#888);font-size:12px">(Xem mã trong terminal/console)</span></div>
                    <input type="text" id="_adminTokenInput" style="width:100%;padding:8px 12px;border:1px solid var(--border-color,#333);border-radius:6px;background:var(--bg-tertiary,#2a2a3a);color:var(--text-primary,#fff);font-size:14px;outline:none;box-sizing:border-box" placeholder="Nhập mã session..." autofocus />
                    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
                        <button id="_adminTokenCancel" style="padding:6px 16px;border:1px solid var(--border-color,#333);border-radius:6px;background:transparent;color:var(--text-primary,#fff);cursor:pointer;font-size:13px">Hủy</button>
                        <button id="_adminTokenOk" style="padding:6px 16px;border:none;border-radius:6px;background:var(--accent,#7c5cfc);color:white;cursor:pointer;font-size:13px">Mở Admin</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('#_adminTokenInput');
            const cleanup = (val) => { overlay.remove(); resolve(val); };
            overlay.querySelector('#_adminTokenOk').onclick = () => cleanup(input.value.trim());
            overlay.querySelector('#_adminTokenCancel').onclick = () => cleanup(null);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') cleanup(input.value.trim()); if (e.key === 'Escape') cleanup(null); });
            setTimeout(() => input.focus(), 50);
        });
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
            if (e.ctrlKey && e.key === '\\') {
                e.preventDefault();
                if (this.editorManager) {
                    this.editorManager.toggleSplit();
                }
            }
        });
    }

    async saveFile() {
        if (this.editorManager) {
            await this.editorManager.save();
        }
    }

    // ===== Feature 2: Package Manager Panel =====
    setupPackagePanel() {
        const container = document.getElementById('packagePanelContainer');
        if (!container) return;
        this.packageContainer = container;
    }

    async refreshPackagePanel() {
        const container = this.packageContainer;
        if (!container) return;
        if (!this.currentFolder) {
            container.innerHTML = '<div class="package-panel"><div class="package-empty">Mở thư mục để quản lý gói</div></div>';
            return;
        }

        const projectInfo = await window.api.pkg.detectProjectType(this.currentFolder);
        if (!projectInfo) {
            container.innerHTML = '<div class="package-panel"><div class="package-empty">Không tìm thấy file package nào</div></div>';
            return;
        }

        this._currentPkgType = projectInfo.type;
        const packages = await window.api.pkg.list(this.currentFolder, projectInfo.type);

        container.innerHTML = `
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
                const result = await window.api.pkg.install(this.currentFolder, this._currentPkgType, name);
                if (result.success) {
                    this.showToast(`Đã cài đặt ${name}`, 'success');
                    searchInput.value = '';
                    await this.refreshPackagePanel();
                } else {
                    this.showToast(`Lỗi cài đặt: ${result.error || result.stderr}`, 'error');
                }
                installBtn.textContent = 'Cài đặt';
                installBtn.disabled = false;
            };
            searchInput.onkeydown = (e) => { if (e.key === 'Enter') installBtn.click(); };
        }

        container.querySelectorAll('.package-item-remove').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const name = btn.closest('.package-item').dataset.name;
                if (confirm(`Gỡ cài đặt ${name}?`)) {
                    const result = await window.api.pkg.uninstall(this.currentFolder, this._currentPkgType, name);
                    if (result.success) {
                        this.showToast(`Đã gỡ ${name}`, 'success');
                        await this.refreshPackagePanel();
                    } else {
                        this.showToast(`Lỗi: ${result.error || result.stderr}`, 'error');
                    }
                }
            };
        });
    }

    // ===== Feature 3: Extensions Panel =====
    setupExtensionsPanel() {
        const container = document.getElementById('extensionsPanelContainer');
        if (!container) return;
        this.extensionsContainer = container;
    }

    async refreshExtensionsPanel() {
        const container = this.extensionsContainer;
        if (!container) return;

        const installed = await window.api.ext.list();
        const builtInExtensions = [
            { id: 'deepcode-themes-pack', name: 'DeepCode Themes Pack', description: 'Bo giao dien bo sung cho DeepCode IDE', version: '1.0.0', author: 'DeepCode', builtin: true },
            { id: 'deepcode-snippets-js', name: 'JavaScript Snippets', description: 'Snippet nhanh cho JavaScript & TypeScript', version: '1.2.0', author: 'DeepCode', builtin: true },
            { id: 'deepcode-snippets-py', name: 'Python Snippets', description: 'Snippet nhanh cho Python', version: '1.0.0', author: 'DeepCode', builtin: true },
            { id: 'deepcode-lint-hint', name: 'Lint & Hint', description: 'Goi y linting realtime trong editor', version: '0.9.0', author: 'DeepCode', builtin: true },
        ];

        const installedIds = new Set(installed.map(e => e.id));

        container.innerHTML = `
            <div class="extensions-panel">
                <div class="ext-search-row">
                    <input type="text" class="ext-search-input" id="extSearchInput" placeholder="Tim kiem phan mo rong..." autocomplete="off">
                </div>
                <div class="ext-list" id="extList">
                    ${installed.length > 0 ? `
                        <div class="ext-section-label">Da cai dat</div>
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
                    <div class="ext-section-label">Cho tien ich</div>
                    ${builtInExtensions.map(ext => `
                        <div class="ext-item" data-id="${ext.id}">
                            <div class="ext-item-icon">${ext.name[0]}</div>
                            <div class="ext-item-info">
                                <div class="ext-item-name">${ext.name}</div>
                                <div class="ext-item-desc">${ext.description}</div>
                                <div class="ext-item-meta">v${ext.version} - ${ext.author}</div>
                            </div>
                            ${installedIds.has(ext.id)
                                ? '<button class="ext-install-btn installed" disabled>Da cai</button>'
                                : '<button class="ext-install-btn" data-id="' + ext.id + '">Cai dat</button>'
                            }
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.querySelectorAll('.ext-toggle').forEach(toggle => {
            toggle.onclick = async (e) => {
                e.stopPropagation();
                const id = toggle.dataset.id;
                const isActive = toggle.classList.contains('active');
                await window.api.ext.setEnabled(id, !isActive);
                toggle.classList.toggle('active');
            };
        });

        container.querySelectorAll('.ext-install-btn:not(.installed)').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const ext = builtInExtensions.find(e => e.id === id);
                if (!ext) return;
                btn.textContent = 'Dang cai...';
                btn.disabled = true;
                const result = await window.api.ext.install(id, {
                    name: ext.name, description: ext.description, version: ext.version, author: ext.author,
                });
                if (result.success) {
                    this.showToast(`Da cai dat ${ext.name}`, 'success');
                    await this.refreshExtensionsPanel();
                } else {
                    this.showToast(`Loi: ${result.error}`, 'error');
                    btn.textContent = 'Cai dat';
                    btn.disabled = false;
                }
            };
        });

        const searchInput = document.getElementById('extSearchInput');
        if (searchInput) {
            searchInput.oninput = () => {
                const query = searchInput.value.toLowerCase();
                container.querySelectorAll('.ext-item').forEach(item => {
                    const name = item.querySelector('.ext-item-name')?.textContent.toLowerCase() || '';
                    const desc = item.querySelector('.ext-item-desc')?.textContent.toLowerCase() || '';
                    item.style.display = (name.includes(query) || desc.includes(query)) ? 'flex' : 'none';
                });
            };
        }
    }

    // ===== Feature 5: Theme Selector =====
    setupThemeSelector() {
        const themeSelect = document.getElementById('settingsTheme');
        if (!themeSelect) return;
        const saved = localStorage.getItem('deepcode-theme') || 'deepcode-dark';
        themeSelect.value = saved;

        themeSelect.addEventListener('change', (e) => {
            const themeId = e.target.value;
            if (this.editorManager) {
                this.editorManager.setTheme(themeId);
            }
            localStorage.setItem('deepcode-theme', themeId);
            this.showToast(`Da chuyen giao dien: ${themeId}`, 'success');
        });
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
                const openFiles = window.state.get('openFiles') || [];
                const updated = openFiles.map(f => {
                    if (f.path === targetPath) return { ...f, path: newPath, name: newName };
                    if (f.path.startsWith(targetPath + '\\') || f.path.startsWith(targetPath + '/')) {
                        return { ...f, path: f.path.replace(targetPath, newPath) };
                    }
                    return f;
                });
                window.state.set('openFiles', updated);
                const activeFile = window.state.get('activeFile');
                if (activeFile?.path === targetPath) {
                    window.state.set('activeFile', { ...activeFile, path: newPath, name: newName });
                }
            }
            await this.loadFileTree(this.currentFolder);

        } else if (action === 'delete') {
            const openFiles = window.state.get('openFiles') || [];
            const activeFile = window.state.get('activeFile');
            const isOpen = openFiles.some(f => f.path === targetPath);
            if (isOpen) {
                const remaining = openFiles.filter(f => f.path !== targetPath);
                window.state.set('openFiles', remaining);
                if (activeFile?.path === targetPath) {
                    window.state.set('activeFile', remaining.length > 0 ? remaining[remaining.length - 1] : null);
                }
            }
            await window.api.fs.deleteFile(targetPath);
            await this.loadFileTree(this.currentFolder);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.ide = new DeepCodeIDE();
});
