class EditorManager {
    constructor(container) {
        this.container = container;
        this.editor = null;
        this.models = new Map();
        this.activeModel = null;
        this.ready = false;
        this.editorGroups = [];
        this.splitMode = false;
        this.themes = {};
        this.currentTheme = localStorage.getItem('deepcode-theme') || 'deepcode-dark';
    }

    async init() {
        if (this.ready) return;

        const monaco = await this._loadMonaco();
        this.monaco = monaco;

        this._registerAllThemes();

        this.editor = monaco.editor.create(this.container, {
            theme: this.currentTheme,
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: true, maxColumn: 80 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            padding: { top: 12, bottom: 12 },
            wordWrap: 'off',
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 4,
        });

        this._wireEvents();
        this.ready = true;
    }

    async _loadMonaco() {
        const monacoPath = '../node_modules/monaco-editor/min/vs';

        window.MonacoEnvironment = {
            getWorkerUrl: function (workerId, label) {
                const getWorkerModule = (modulePath) => {
                    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                        self.MonacoEnvironment = { baseUrl: '${monacoPath}/' };
                        importScripts('${monacoPath}/${modulePath}');`
                    )}`;
                };
                switch (label) {
                    case 'json':
                        return getWorkerModule('language/json/json.worker');
                    case 'css':
                    case 'scss':
                    case 'less':
                        return getWorkerModule('language/css/css.worker');
                    case 'html':
                    case 'handlebars':
                    case 'razor':
                        return getWorkerModule('language/html/html.worker');
                    case 'typescript':
                    case 'javascript':
                        return getWorkerModule('language/typescript/ts.worker');
                    default:
                        return getWorkerModule('editor/editor.worker');
                }
            },
        };

        // Load requirejs first for AMD module support
        await new Promise((resolve, reject) => {
            if (window.require && window.require.config) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = '../node_modules/monaco-editor/min/vs/loader.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });

        window.require.config({
            paths: { vs: monacoPath }
        });

        return new Promise((resolve, reject) => {
            window.require(['vs/editor/editor.main'], (monaco) => {
                resolve(monaco);
            }, (err) => {
                console.error('Monaco load error:', err);
                reject(err);
            });
        });
    }

    _registerAllThemes() {
        this.themes = {
            'deepcode-dark': {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '6b6580', fontStyle: 'italic' },
                    { token: 'keyword', foreground: '7c5cfc' },
                    { token: 'string', foreground: '34d399' },
                    { token: 'number', foreground: 'fbbf24' },
                    { token: 'type', foreground: '60a5fa' },
                    { token: 'function', foreground: 'e8e5f0' },
                    { token: 'variable', foreground: 'e8e5f0' },
                    { token: 'operator', foreground: '9890aa' },
                ],
                colors: {
                    'editor.background': '#0d0b14',
                    'editor.foreground': '#e8e5f0',
                    'editor.lineHighlightBackground': '#1c1a2a',
                    'editor.selectionBackground': '#2a2540',
                    'editor.inactiveSelectionBackground': '#231f36',
                    'editorCursor.foreground': '#7c5cfc',
                    'editorLineNumber.foreground': '#6b6580',
                    'editorLineNumber.activeForeground': '#e8e5f0',
                    'editorIndentGuide.background': '#2d2945',
                    'editorIndentGuide.activeBackground': '#3d3856',
                    'editorWidget.background': '#151320',
                    'editorWidget.border': '#2d2945',
                    'editorSuggestWidget.background': '#151320',
                    'editorSuggestWidget.border': '#2d2945',
                    'editorSuggestWidget.selectedBackground': '#2a2540',
                    'input.background': '#1c1a2a',
                    'input.border': '#2d2945',
                    'input.foreground': '#e8e5f0',
                    'focusBorder': '#7c5cfc',
                    'scrollbar.shadow': '#00000000',
                    'scrollbarSlider.background': '#3d385680',
                    'scrollbarSlider.hoverBackground': '#3d3856',
                    'scrollbarSlider.activeBackground': '#7c5cfc',
                    'minimap.background': '#0d0b14',
                },
                cssVars: {
                    '--bg-primary': '#0d0b14',
                    '--bg-secondary': '#151320',
                    '--bg-tertiary': '#1c1a2a',
                    '--bg-hover': '#231f36',
                    '--bg-active': '#2a2540',
                    '--border-color': '#2d2945',
                    '--border-light': '#3d3856',
                    '--text-primary': '#e8e5f0',
                    '--text-secondary': '#9890aa',
                    '--text-muted': '#6b6580',
                    '--accent-purple': '#7c5cfc',
                    '--accent-green': '#34d399',
                    '--accent-yellow': '#fbbf24',
                    '--accent-blue': '#60a5fa',
                    '--accent-red': '#f87171',
                    '--scrollbar-thumb': '#3d3856',
                },
                terminalBg: '#0d0b14',
            },
            'midnight-blue': {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
                    { token: 'keyword', foreground: '61afef' },
                    { token: 'string', foreground: '98c379' },
                    { token: 'number', foreground: 'd19a66' },
                    { token: 'type', foreground: 'e5c07b' },
                    { token: 'function', foreground: '61afef' },
                    { token: 'variable', foreground: 'e06c75' },
                    { token: 'operator', foreground: '56b6c2' },
                ],
                colors: {
                    'editor.background': '#0a1628',
                    'editor.foreground': '#abb2bf',
                    'editor.lineHighlightBackground': '#0f1d32',
                    'editor.selectionBackground': '#1a3a5c',
                    'editorCursor.foreground': '#528bff',
                    'editorLineNumber.foreground': '#495162',
                    'editorLineNumber.activeForeground': '#abb2bf',
                    'editorIndentGuide.background': '#1a2a42',
                    'editorWidget.background': '#0c1524',
                    'input.background': '#0f1d32',
                    'input.border': '#1a2a42',
                    'focusBorder': '#528bff',
                    'minimap.background': '#0a1628',
                },
                cssVars: {
                    '--bg-primary': '#0a1628',
                    '--bg-secondary': '#0c1524',
                    '--bg-tertiary': '#0f1d32',
                    '--bg-hover': '#142238',
                    '--bg-active': '#1a3a5c',
                    '--border-color': '#1a2a42',
                    '--border-light': '#253a52',
                    '--text-primary': '#abb2bf',
                    '--text-secondary': '#8892a0',
                    '--text-muted': '#495162',
                    '--accent-purple': '#528bff',
                    '--accent-green': '#98c379',
                    '--accent-yellow': '#d19a66',
                    '--accent-blue': '#61afef',
                    '--accent-red': '#e06c75',
                    '--scrollbar-thumb': '#253a52',
                },
                terminalBg: '#0a1628',
            },
            'monokai': {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'f92672' },
                    { token: 'string', foreground: 'e6db74' },
                    { token: 'number', foreground: 'ae81ff' },
                    { token: 'type', foreground: 'a6e22e' },
                    { token: 'function', foreground: 'a6e22e' },
                    { token: 'variable', foreground: 'f8f8f2' },
                    { token: 'operator', foreground: 'f92672' },
                ],
                colors: {
                    'editor.background': '#272822',
                    'editor.foreground': '#f8f8f2',
                    'editor.lineHighlightBackground': '#3e3d32',
                    'editor.selectionBackground': '#49483e',
                    'editorCursor.foreground': '#f8f8f0',
                    'editorLineNumber.foreground': '#75715e',
                    'editorLineNumber.activeForeground': '#f8f8f2',
                    'editorIndentGuide.background': '#3e3d32',
                    'editorWidget.background': '#1e1f1c',
                    'input.background': '#3e3d32',
                    'input.border': '#49483e',
                    'focusBorder': '#a6e22e',
                    'minimap.background': '#272822',
                },
                cssVars: {
                    '--bg-primary': '#272822',
                    '--bg-secondary': '#1e1f1c',
                    '--bg-tertiary': '#3e3d32',
                    '--bg-hover': '#49483e',
                    '--bg-active': '#75715e',
                    '--border-color': '#49483e',
                    '--border-light': '#75715e',
                    '--text-primary': '#f8f8f2',
                    '--text-secondary': '#cfcfc2',
                    '--text-muted': '#75715e',
                    '--accent-purple': '#ae81ff',
                    '--accent-green': '#a6e22e',
                    '--accent-yellow': '#e6db74',
                    '--accent-blue': '#66d9ef',
                    '--accent-red': '#f92672',
                    '--scrollbar-thumb': '#49483e',
                },
                terminalBg: '#272822',
            },
            'solarized-dark': {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
                    { token: 'keyword', foreground: '859900' },
                    { token: 'string', foreground: '2aa198' },
                    { token: 'number', foreground: 'd33682' },
                    { token: 'type', foreground: 'b58900' },
                    { token: 'function', foreground: '268bd2' },
                    { token: 'variable', foreground: 'cb4b16' },
                    { token: 'operator', foreground: '93a1a1' },
                ],
                colors: {
                    'editor.background': '#002b36',
                    'editor.foreground': '#839496',
                    'editor.lineHighlightBackground': '#073642',
                    'editor.selectionBackground': '#073642',
                    'editorCursor.foreground': '#839496',
                    'editorLineNumber.foreground': '#586e75',
                    'editorLineNumber.activeForeground': '#839496',
                    'editorIndentGuide.background': '#073642',
                    'editorWidget.background': '#00212b',
                    'input.background': '#073642',
                    'input.border': '#586e75',
                    'focusBorder': '#268bd2',
                    'minimap.background': '#002b36',
                },
                cssVars: {
                    '--bg-primary': '#002b36',
                    '--bg-secondary': '#00212b',
                    '--bg-tertiary': '#073642',
                    '--bg-hover': '#0a4050',
                    '--bg-active': '#586e75',
                    '--border-color': '#073642',
                    '--border-light': '#586e75',
                    '--text-primary': '#839496',
                    '--text-secondary': '#93a1a1',
                    '--text-muted': '#586e75',
                    '--accent-purple': '#6c71c4',
                    '--accent-green': '#859900',
                    '--accent-yellow': '#b58900',
                    '--accent-blue': '#268bd2',
                    '--accent-red': '#dc322f',
                    '--scrollbar-thumb': '#586e75',
                },
                terminalBg: '#002b36',
            },
            'dracula': {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'ff79c6' },
                    { token: 'string', foreground: 'f1fa8c' },
                    { token: 'number', foreground: 'bd93f9' },
                    { token: 'type', foreground: '8be9fd' },
                    { token: 'function', foreground: '50fa7b' },
                    { token: 'variable', foreground: 'f8f8f2' },
                    { token: 'operator', foreground: 'ff79c6' },
                ],
                colors: {
                    'editor.background': '#282a36',
                    'editor.foreground': '#f8f8f2',
                    'editor.lineHighlightBackground': '#44475a',
                    'editor.selectionBackground': '#44475a',
                    'editorCursor.foreground': '#f8f8f2',
                    'editorLineNumber.foreground': '6272a4',
                    'editorLineNumber.activeForeground': '#f8f8f2',
                    'editorIndentGuide.background': '#44475a',
                    'editorWidget.background': '#21222c',
                    'input.background': '#44475a',
                    'input.border': '#6272a4',
                    'focusBorder': '#bd93f9',
                    'minimap.background': '#282a36',
                },
                cssVars: {
                    '--bg-primary': '#282a36',
                    '--bg-secondary': '#21222c',
                    '--bg-tertiary': '#44475a',
                    '--bg-hover': '#44475a',
                    '--bg-active': '#6272a4',
                    '--border-color': '#44475a',
                    '--border-light': '#6272a4',
                    '--text-primary': '#f8f8f2',
                    '--text-secondary': '#bd93f9',
                    '--text-muted': '#6272a4',
                    '--accent-purple': '#bd93f9',
                    '--accent-green': '#50fa7b',
                    '--accent-yellow': '#f1fa8c',
                    '--accent-blue': '#8be9fd',
                    '--accent-red': '#ff5555',
                    '--scrollbar-thumb': '#44475a',
                },
                terminalBg: '#282a36',
            },
            'github-dark': {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'ff7b72' },
                    { token: 'string', foreground: 'a5d6ff' },
                    { token: 'number', foreground: '79c0ff' },
                    { token: 'type', foreground: 'ffa657' },
                    { token: 'function', foreground: 'd2a8ff' },
                    { token: 'variable', foreground: 'ffa657' },
                    { token: 'operator', foreground: 'ff7b72' },
                ],
                colors: {
                    'editor.background': '#0d1117',
                    'editor.foreground': '#c9d1d9',
                    'editor.lineHighlightBackground': '#161b22',
                    'editor.selectionBackground': '#264f78',
                    'editorCursor.foreground': '#c9d1d9',
                    'editorLineNumber.foreground': '484f58',
                    'editorLineNumber.activeForeground': '#c9d1d9',
                    'editorIndentGuide.background': '#21262d',
                    'editorWidget.background': '#161b22',
                    'input.background': '#0d1117',
                    'input.border': '#30363d',
                    'focusBorder': '#58a6ff',
                    'minimap.background': '#0d1117',
                },
                cssVars: {
                    '--bg-primary': '#0d1117',
                    '--bg-secondary': '#161b22',
                    '--bg-tertiary': '#21262d',
                    '--bg-hover': '#30363d',
                    '--bg-active': '#484f58',
                    '--border-color': '#30363d',
                    '--border-light': '#484f58',
                    '--text-primary': '#c9d1d9',
                    '--text-secondary': '#8b949e',
                    '--text-muted': '#484f58',
                    '--accent-purple': '#d2a8ff',
                    '--accent-green': '#3fb950',
                    '--accent-yellow': '#e3b341',
                    '--accent-blue': '#58a6ff',
                    '--accent-red': '#f85149',
                    '--scrollbar-thumb': '#30363d',
                },
                terminalBg: '#0d1117',
            },
        };

        for (const [id, theme] of Object.entries(this.themes)) {
            this.monaco.editor.defineTheme(id, theme);
        }
        this.monaco.editor.setTheme(this.currentTheme);
        this._applyThemeToCSS(this.currentTheme);
    }

    _applyThemeToCSS(themeId) {
        const theme = this.themes[themeId];
        if (!theme || !theme.cssVars) return;
        const root = document.documentElement;
        for (const [key, value] of Object.entries(theme.cssVars)) {
            root.style.setProperty(key, value);
        }
    }

    setTheme(themeId) {
        if (!this.themes[themeId]) return;
        this.currentTheme = themeId;
        if (this.monaco) {
            this.monaco.editor.setTheme(themeId);
        }
        this._applyThemeToCSS(themeId);
        localStorage.setItem('deepcode-theme', themeId);
        if (this.editorGroups && this.editorGroups.length > 0) {
            this.editorGroups.forEach(g => {
                if (g.editor) g.editor.updateOptions({});
            });
        }
    }

    // ===== Split View Editor =====
    splitEditor() {
        if (this.splitMode) return;
        this.splitMode = true;

        const currentContent = this.editor.getValue();
        const currentFile = this.activeModel;

        const editorArea = document.getElementById('editorArea');
        const panelsContainer = this.container.parentElement;
        const tabsBar = document.getElementById('tabsBar');

        const splitContainer = document.createElement('div');
        splitContainer.className = 'split-editor-container';
        splitContainer.id = 'splitEditorContainer';

        const group1Content = document.createElement('div');
        group1Content.className = 'editor-group';
        group1Content.id = 'editorGroup1';

        const group1Tabs = document.createElement('div');
        group1Tabs.className = 'editor-group-tabs';
        group1Content.appendChild(group1Tabs);

        const group1Editor = document.createElement('div');
        group1Editor.className = 'editor-group-content';
        group1Editor.id = 'editorGroupContent1';
        group1Content.appendChild(group1Editor);

        const divider = document.createElement('div');
        divider.className = 'split-editor-divider';

        const group2Content = document.createElement('div');
        group2Content.className = 'editor-group';
        group2Content.id = 'editorGroup2';

        const group2Tabs = document.createElement('div');
        group2Tabs.className = 'editor-group-tabs';
        group2Content.appendChild(group2Tabs);

        const group2Editor = document.createElement('div');
        group2Editor.className = 'editor-group-content';
        group2Editor.id = 'editorGroupContent2';
        group2Content.appendChild(group2Editor);

        splitContainer.appendChild(group1Content);
        splitContainer.appendChild(divider);
        splitContainer.appendChild(group2Content);

        panelsContainer.style.display = 'none';
        tabsBar.style.display = 'none';
        editorArea.insertBefore(splitContainer, editorArea.querySelector('.resize-handle-horizontal'));

        this.editor.dispose();
        this.editor = null;

        const monaco = this.monaco;

        const editor1 = monaco.editor.create(group1Editor, {
            theme: this.currentTheme,
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            padding: { top: 12, bottom: 12 },
        });

        const editor2 = monaco.editor.create(group2Editor, {
            theme: this.currentTheme,
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            padding: { top: 12, bottom: 12 },
        });

        if (currentFile && this.models.has(currentFile)) {
            editor1.setModel(this.models.get(currentFile));
            this._addGroupTab(group1Tabs, currentFile, editor1);
        }

        this.editorGroups = [
            { editor: editor1, container: group1Content, tabsEl: group1Tabs, contentEl: group1Editor, activeFile: currentFile },
            { editor: editor2, container: group2Content, tabsEl: group2Tabs, contentEl: group2Editor, activeFile: null },
        ];

        this._setupDividerDrag(divider, group1Content, group2Content);

        const splitBtn = document.getElementById('splitEditorBtn');
        if (splitBtn) splitBtn.classList.add('active');
    }

    _addGroupTab(tabsEl, filePath, editor) {
        tabsEl.innerHTML = '';
        const tab = document.createElement('div');
        tab.className = 'editor-group-tab active';
        tab.dataset.file = filePath;
        const name = filePath ? filePath.split(/[\\/]/).pop() : 'Trống';
        tab.innerHTML = `<span>${name}</span>`;
        tab.onclick = () => {
            if (filePath && this.models.has(filePath)) {
                editor.setModel(this.models.get(filePath));
                const group = this.editorGroups.find(g => g.tabsEl === tabsEl);
                if (group) group.activeFile = filePath;
                tabsEl.querySelectorAll('.editor-group-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            }
        };
        tabsEl.appendChild(tab);
    }

    _setupDividerDrag(divider, left, right) {
        let startX, startLeftW;
        const onMouseMove = (e) => {
            e.preventDefault();
            const totalWidth = divider.parentElement.offsetWidth;
            let newLeftW = startLeftW + (e.clientX - startX);
            newLeftW = Math.max(200, Math.min(totalWidth - 200 - 4, newLeftW));
            left.style.flex = 'none';
            left.style.width = newLeftW + 'px';
            right.style.flex = '1';
            divider.classList.add('active');
            this.editorGroups.forEach(g => {
                if (g.editor) g.editor.layout();
            });
        };
        const onMouseUp = () => {
            divider.classList.remove('active');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        divider.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startLeftW = left.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    closeSplitEditor() {
        if (!this.splitMode) return;
        const splitContainer = document.getElementById('splitEditorContainer');
        if (splitContainer) splitContainer.remove();

        if (this.editorGroups) {
            this.editorGroups.forEach(g => {
                if (g.editor) g.editor.dispose();
            });
            this.editorGroups = [];
        }

        const panelsContainer = this.container.parentElement;
        const tabsBar = document.getElementById('tabsBar');
        const editorPanel = document.getElementById('editorPanel');
        panelsContainer.style.display = 'flex';
        tabsBar.style.display = 'flex';
        if (editorPanel) editorPanel.style.display = 'block';

        this.editor = this.monaco.editor.create(this.container, {
            theme: this.currentTheme,
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "'JetBrains Mono', monospace",
            minimap: { enabled: true, maxColumn: 80 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            padding: { top: 12, bottom: 12 },
            wordWrap: 'off',
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 4,
        });
        this._wireEvents();

        if (this.activeModel && this.models.has(this.activeModel)) {
            this.editor.setModel(this.models.get(this.activeModel));
        }

        this.splitMode = false;
        const splitBtn = document.getElementById('splitEditorBtn');
        if (splitBtn) splitBtn.classList.remove('active');
    }

    toggleSplit() {
        if (this.splitMode) {
            this.closeSplitEditor();
        } else {
            this.splitEditor();
        }
    }

    _wireEvents() {
        this.editor.onDidChangeModelContent(() => {
            const activeFile = window.state.get('activeFile');
            if (activeFile) {
                const files = window.state.get('openFiles').map((f) =>
                    f.path === activeFile ? { ...f, dirty: true } : f
                );
                window.state.set('openFiles', files);
            }
            clearTimeout(this._problemTimer);
            this._problemTimer = setTimeout(() => window.ide?.updateProblems?.(), 500);
        });

        this.editor.onDidChangeCursorPosition((e) => {
            const statusCursor = document.getElementById('statusCursor');
            if (statusCursor) {
                statusCursor.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
            }
        });
    }

    _getLanguage(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const langs = {
            js: 'javascript',
            jsx: 'javascript',
            ts: 'typescript',
            tsx: 'typescript',
            json: 'json',
            html: 'html',
            htm: 'html',
            css: 'css',
            scss: 'scss',
            less: 'less',
            md: 'markdown',
            py: 'python',
            rb: 'ruby',
            go: 'go',
            rs: 'rust',
            java: 'java',
            c: 'c',
            cpp: 'cpp',
            h: 'c',
            hpp: 'cpp',
            cs: 'csharp',
            php: 'php',
            swift: 'swift',
            kt: 'kotlin',
            sh: 'shell',
            bash: 'shell',
            yml: 'yaml',
            yaml: 'yaml',
            xml: 'xml',
            sql: 'sql',
            dockerfile: 'dockerfile',
        };
        return langs[ext] || 'plaintext';
    }

    async openFile(filePath, content, lineNumber) {
        if (!this.ready) await this.init();

        if (this.models.has(filePath)) {
            this.editor.setModel(this.models.get(filePath));
        } else {
            const language = this._getLanguage(filePath);
            const uri = this.monaco.Uri.file(filePath);
            const model = this.monaco.editor.createModel(content, language, uri);
            this.models.set(filePath, model);
            this.editor.setModel(model);

            const statusLang = document.getElementById('statusLanguage');
            if (statusLang) {
                statusLang.textContent = language.charAt(0).toUpperCase() + language.slice(1);
            }
        }

        if (lineNumber && lineNumber > 0) {
            this.editor.revealLineInCenter(lineNumber);
            this.editor.setPosition({ lineNumber, column: 1 });
            this.editor.focus();
        }

        this.activeModel = filePath;
        window.state.set('activeFile', filePath);

        const files = window.state.get('openFiles');
        if (!files.find((f) => f.path === filePath)) {
            window.state.set('openFiles', [...files, { path: filePath, content, dirty: false }]);
        }
    }

    getContent() {
        if (!this.editor) return '';
        return this.editor.getValue();
    }

    getActiveFile() {
        return this.activeModel;
    }

    async save() {
        if (!this.activeModel) return false;
        const content = this.editor.getValue();
        const result = await window.api.fs.writeFile(this.activeModel, content);
        if (result) {
            const files = window.state.get('openFiles').map((f) =>
                f.path === this.activeModel ? { ...f, dirty: false, content } : f
            );
            window.state.set('openFiles', files);
        }
        return result;
    }

    closeFile(filePath) {
        if (this.models.has(filePath)) {
            this.models.get(filePath).dispose();
            this.models.delete(filePath);
        }
    }

    dispose() {
        this.models.forEach((model) => model.dispose());
        this.models.clear();
        if (this.editor) this.editor.dispose();
    }
}

window.EditorManager = EditorManager;
