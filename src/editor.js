class EditorManager {
    constructor(container) {
        this.container = container;
        this.editor = null;
        this.models = new Map();
        this.activeModel = null;
        this.ready = false;
    }

    async init() {
        if (this.ready) return;

        const monaco = await this._loadMonaco();
        this.monaco = monaco;

        this._registerTheme();

        this.editor = monaco.editor.create(this.container, {
            theme: 'deepcode-dark',
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

    _registerTheme() {
        this.monaco.editor.defineTheme('deepcode-dark', {
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
        });
        this.monaco.editor.setTheme('deepcode-dark');
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

    async openFile(filePath, content) {
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
