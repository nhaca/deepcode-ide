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

        // Create module instances
        this.fileTree = new FileTree(this);
        this.tabManager = new TabManager(this);
        this.activityBar = new ActivityBarController(this);
        this.bottomPanel = new BottomPanel(this);
        this.contextMenu = new ContextMenu(this);
        this.settings = new Settings(this);
        this.packagePanel = new PackagePanel(this);
        this.extensionsPanel = new ExtensionsPanel(this);

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
        this.activityBar.setup();
        this.setupSidebar();
        this.bottomPanel.setup();
        this.setupEditorContainer();
        this.setupStateSubscriptions();
        this.setupTerminal();
        this.setupGitPanel();
        this.setupCommandPalette();
        this.setupAIPanel();
        this.searchManager = new SearchManager();
        this.setupKeyboardShortcuts();
        this.setupResize();
        this.settings.setup();
        this.contextMenu.setup();
        this.packagePanel.setup();
        this.extensionsPanel.setup();
        this.fileTree.restoreLastFolder();
    }

    setupTitleBar() {
        document.getElementById('minimizeBtn').onclick = () => window.api.app.minimize();
        document.getElementById('maximizeBtn').onclick = () => window.api.app.maximize();
        document.getElementById('closeBtn').onclick = () => window.api.app.close();
    }

    setupSidebar() {
        document.getElementById('openFolderBtn').onclick = () => this.fileTree.openFolder();
        document.getElementById('welcomeOpenFolder')?.addEventListener('click', () => this.fileTree.openFolder());
        document.getElementById('welcomeNewFile')?.addEventListener('click', () => this.tabManager.newFile());
    }

    setupEditorContainer() {
        this.editorContainer = document.getElementById('editorContainer');
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
        window.state.subscribe('openFiles', (files) => this.tabManager.update(files));
        window.state.subscribe('activeFile', (path) => this.tabManager.highlightActive(path));
    }

    async openFile(filePath, fileName) {
        try {
            const content = await window.api.fs.readFile(filePath);
            
            if (content === null) return;

            document.getElementById('welcomePanel').style.display = 'none';
            const editorPanel = document.getElementById('editorPanel');
            editorPanel.style.display = 'block';

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

            await this.editorManager.openFile(filePath, content);
            this.tabManager.add(fileName, filePath);
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }

    async refreshGitStatus() {
        if (this.gitPanel && this.currentFolder) {
            await this.gitPanel.refresh(this.currentFolder);
        }
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
        this.settings.toggle();
    }

    registerCommands() {
        this.commandRegistry.register('file.openFolder', 'File: Open Folder', () => this.fileTree.openFolder());
        this.commandRegistry.register('file.newFile', 'File: New File', () => this.tabManager.newFile());
        this.commandRegistry.register('file.save', 'File: Save', () => this.saveFile());
        this.commandRegistry.register('terminal.toggle', 'Terminal: Toggle Terminal', () => this.bottomPanel.toggle());
        this.commandRegistry.register('git.refresh', 'Git: Refresh Status', () => this.refreshGitStatus());
        this.commandRegistry.register('admin.open', 'Admin: Mở Admin Panel', async () => {
            try {
                await window.api.admin.open();
            } catch (e) { console.error(e); }
        });
        this.commandRegistry.register('view.explorer', 'View: Explorer', () => this.activityBar.switchPanel('explorer'));
        this.commandRegistry.register('view.git', 'View: Source Control', () => this.activityBar.switchPanel('git'));
        this.commandRegistry.register('view.packages', 'View: Packages', () => this.activityBar.switchPanel('packages'));
        this.commandRegistry.register('view.extensions', 'View: Extensions', () => this.activityBar.switchPanel('extensions'));
        this.commandRegistry.register('editor.split', 'Editor: Split Editor', () => {
            if (this.editorManager) this.editorManager.toggleSplit();
        });
    }

    newSession() {
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
                this.fileTree.openFolder();
            }
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                this.bottomPanel.toggle();
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

    async refreshPackagePanel() {
        await this.packagePanel.refresh();
    }

    async refreshExtensionsPanel() {
        await this.extensionsPanel.refresh();
    }

    logToOutput(message, type = 'info') {
        this.bottomPanel.logToOutput(message, type);
    }

    updateProblems() {
        this.bottomPanel.updateProblems();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.ide = new DeepCodeIDE();
});
