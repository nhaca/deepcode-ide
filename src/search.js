class SearchManager {
    constructor() {
        this.findBar = document.getElementById('findBar');
        this.searchInput = document.getElementById('findInput');
        this.replaceInput = document.getElementById('findReplaceInput');
        this.resultsEl = document.getElementById('searchResults');
        this.caseSensitive = document.getElementById('findCaseSensitive');
        this.regexToggle = document.getElementById('findRegex');
        this.countEl = document.getElementById('findCount');
        this.replaceRow = document.getElementById('findReplaceRow');
        this.debounceTimer = null;
        this.results = [];
        this.editorMatches = [];
        this.currentMatch = -1;
        this.setupEvents();
    }

    setupEvents() {
        this.searchInput?.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.searchInEditor();
                this.searchInFiles();
            }, 300);
        });

        this.searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this.navigateMatch(-1);
                else this.navigateMatch(1);
            } else if (e.key === 'Escape') {
                this.hideFindBar();
            }
        });

        this.caseSensitive?.addEventListener('change', () => { this.searchInEditor(); this.searchInFiles(); });
        this.regexToggle?.addEventListener('change', () => { this.searchInEditor(); this.searchInFiles(); });

        document.getElementById('findReplaceOneBtn')?.addEventListener('click', () => this.replaceSelected());
        document.getElementById('findReplaceAllBtn')?.addEventListener('click', () => this.replaceAll());
        document.getElementById('findCloseBtn')?.addEventListener('click', () => this.hideFindBar());
        document.getElementById('findPrevBtn')?.addEventListener('click', () => this.navigateMatch(-1));
        document.getElementById('findNextBtn')?.addEventListener('click', () => this.navigateMatch(1));

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.showFindBar(false);
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                e.preventDefault();
                this.showFindBar(true);
            }
        });
    }

    showFindBar(withReplace) {
        if (!this.findBar) return;
        this.findBar.style.display = 'flex';
        if (this.replaceRow) this.replaceRow.style.display = withReplace ? 'flex' : 'none';
        this.searchInput?.focus();
        this.searchInput?.select();
    }

    hideFindBar() {
        if (!this.findBar) return;
        this.findBar.style.display = 'none';
        this.clearEditorHighlights();
        if (this.resultsEl) {
            this.resultsEl.innerHTML = '<div class="search-empty">Nhập Ctrl+F để tìm kiếm</div>';
        }
    }

    getQueryOptions() {
        const query = this.searchInput?.value?.trim() || '';
        const useRegex = this.regexToggle?.checked || false;
        const caseSensitive = this.caseSensitive?.checked || false;
        return { query, useRegex, caseSensitive };
    }

    buildPattern(query, useRegex, caseSensitive) {
        if (!query) return null;
        try {
            if (useRegex) return new RegExp(query, caseSensitive ? 'g' : 'gi');
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, caseSensitive ? 'g' : 'gi');
        } catch {
            return null;
        }
    }

    searchInEditor() {
        const { query, useRegex, caseSensitive } = this.getQueryOptions();
        this.clearEditorHighlights();
        this.editorMatches = [];
        this.currentMatch = -1;

        if (!query || !window.ide?.editorManager?.monacoEditor) {
            if (this.countEl) this.countEl.textContent = '';
            return;
        }

        const editor = window.ide.editorManager.monacoEditor;
        const model = editor.getModel();
        if (!model) return;

        const pattern = this.buildPattern(query, useRegex, caseSensitive);
        const fullText = model.getValue();
        const lines = fullText.split('\n');

        for (let i = 0; i < lines.length; i++) {
            let linePattern;
            if (pattern) {
                linePattern = new RegExp(pattern.source, pattern.flags);
            } else {
                const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                linePattern = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
            }

            let m;
            while ((m = linePattern.exec(lines[i])) !== null) {
                this.editorMatches.push({
                    range: new (window.monaco?.Range || function(){})(
                        i + 1, m.index + 1,
                        i + 1, m.index + 1 + m[0].length
                    ),
                    text: m[0]
                });
                if (this.editorMatches.length > 5000) break;
            }
            if (this.editorMatches.length > 5000) break;
        }

        if (this.editorMatches.length > 0) {
            const decorations = this.editorMatches.map((m, i) => ({
                range: m.range,
                options: {
                    inlineClassName: i === 0 ? 'find-highlight-current' : 'find-highlight',
                    overviewRuler: { color: '#7c5cfc44', position: 2 },
                    stickiness: 1
                }
            }));
            this._decorations = editor.deltaDecorations(this._decorations || [], decorations);
            this.currentMatch = 0;
            editor.revealRangeInCenter(this.editorMatches[0].range);
        }

        if (this.countEl) {
            const total = this.editorMatches.length;
            this.countEl.textContent = total > 0 ? `${this.currentMatch + 1}/${total}` : '0';
        }
    }

    clearEditorHighlights() {
        const editor = window.ide?.editorManager?.monacoEditor;
        if (editor && this._decorations) {
            this._decorations = editor.deltaDecorations(this._decorations, []);
        }
        this.editorMatches = [];
        this.currentMatch = -1;
    }

    navigateMatch(direction) {
        if (this.editorMatches.length === 0) return;
        this.currentMatch = (this.currentMatch + direction + this.editorMatches.length) % this.editorMatches.length;
        const editor = window.ide?.editorManager?.monacoEditor;
        if (!editor) return;

        const match = this.editorMatches[this.currentMatch];
        editor.revealRangeInCenter(match.range);
        editor.setSelection(match.range);

        const decorations = this.editorMatches.map((m, i) => ({
            range: m.range,
            options: {
                inlineClassName: i === this.currentMatch ? 'find-highlight-current' : 'find-highlight',
                overviewRuler: { color: '#7c5cfc44', position: 2 },
                stickiness: 1
            }
        }));
        this._decorations = editor.deltaDecorations(this._decorations || [], decorations);

        if (this.countEl) {
            this.countEl.textContent = `${this.currentMatch + 1}/${this.editorMatches.length}`;
        }
    }

    async searchInFiles() {
        const { query, useRegex, caseSensitive } = this.getQueryOptions();
        const workspaceRoot = window.state?.get('workspaceRoot');

        if (!query || !workspaceRoot) {
            this.resultsEl.innerHTML = '<div class="search-empty">' + (query ? 'Chưa mở thư mục' : 'Nhập Ctrl+F để tìm kiếm') + '</div>';
            this.results = [];
            return;
        }

        let pattern = this.buildPattern(query, useRegex, caseSensitive);
        if (!pattern) {
            this.resultsEl.innerHTML = '<div class="search-empty">Regex không hợp lệ</div>';
            return;
        }

        const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.vscode', '.idea'];

        this.results = [];
        await this.searchDir(workspaceRoot, query, caseSensitive, pattern, ignorePatterns, workspaceRoot);
        this.renderResults(query);
    }

    async searchDir(dirPath, query, caseSensitive, pattern, ignorePatterns, rootPath) {
        let items;
        try {
            items = await window.api.fs.readDirectory(dirPath);
        } catch {
            return;
        }

        for (const item of items) {
            if (ignorePatterns.includes(item.name)) continue;

            if (item.isDirectory) {
                await this.searchDir(item.path, query, caseSensitive, pattern, ignorePatterns, rootPath);
            } else {
                const ext = '.' + item.name.split('.').pop().toLowerCase();
                const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.html', '.json', '.md', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.xml', '.yaml', '.yml', '.toml', '.ini', '.sh', '.bat', '.ps1', '.vue', '.svelte'];
                if (!textExtensions.includes(ext)) continue;

                try {
                    const content = await window.api.fs.readFile(item.path);
                    if (!content) continue;

                    const lines = content.split('\n');
                    const fileMatches = [];

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        let isMatch = false;

                        const linePattern = new RegExp(pattern.source, pattern.flags);
                        isMatch = linePattern.test(line);

                        if (isMatch) {
                            fileMatches.push({ line: i + 1, text: line });
                        }
                    }

                    if (fileMatches.length > 0) {
                        const relativePath = item.path.substring(rootPath.length + 1).replace(/\\/g, '/');
                        this.results.push({
                            file: relativePath,
                            fullPath: item.path,
                            matches: fileMatches,
                        });
                    }
                } catch {}
            }
        }
    }

    renderResults(query) {
        if (this.results.length === 0) {
            this.resultsEl.innerHTML = '<div class="search-empty">Không tìm thấy kết quả</div>';
            return;
        }

        const totalMatches = this.results.reduce((sum, r) => sum + r.matches.length, 0);
        let html = `<div class="search-summary">${totalMatches} kết quả trong ${this.results.length} file</div>`;

        for (const file of this.results) {
            const fileName = file.file.split('/').pop();
            html += `<div class="search-result-file">`;
            html += `<div class="search-result-file-header" data-path="${this.escapeAttr(file.fullPath)}">`;
            html += `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
            html += `<span class="file-name">${this.escapeHtml(fileName)}</span>`;
            html += `<span class="match-count">${file.matches.length}</span>`;
            html += `</div>`;

            const maxShow = 10;
            for (let i = 0; i < Math.min(file.matches.length, maxShow); i++) {
                const m = file.matches[i];
                const highlighted = this.highlightMatch(m.text, query);
                html += `<div class="search-result-line" data-path="${this.escapeAttr(file.fullPath)}" data-line="${m.line}">`;
                html += `<span class="line-num">${m.line}</span>`;
                html += `<span class="line-text">${highlighted}</span>`;
                html += `</div>`;
            }

            if (file.matches.length > maxShow) {
                html += `<div class="search-result-line" style="color:var(--text-muted);cursor:default">`;
                html += `<span class="line-num">...</span>`;
                html += `<span class="line-text">+${file.matches.length - maxShow} khác</span>`;
                html += `</div>`;
            }

            html += `</div>`;
        }

        this.resultsEl.innerHTML = html;

        this.resultsEl.querySelectorAll('.search-result-line[data-path]').forEach(el => {
            el.addEventListener('click', async () => {
                const filePath = el.dataset.path;
                const line = parseInt(el.dataset.line);
                if (filePath && line) {
                    const content = await window.api.fs.readFile(filePath);
                    if (content != null) {
                        window.ide?.editorManager?.openFile(filePath, content, line);
                    }
                }
            });
        });

        this.resultsEl.querySelectorAll('.search-result-file-header[data-path]').forEach(el => {
            el.addEventListener('click', async () => {
                const filePath = el.dataset.path;
                if (filePath) {
                    const content = await window.api.fs.readFile(filePath);
                    if (content != null) {
                        window.ide?.editorManager?.openFile(filePath, content, 1);
                    }
                }
            });
        });
    }

    highlightMatch(text, query) {
        const escaped = this.escapeHtml(text);
        if (!query) return escaped;

        const { useRegex, caseSensitive } = this.getQueryOptions();
        const flags = caseSensitive ? 'g' : 'gi';

        try {
            let pattern;
            if (useRegex) {
                pattern = new RegExp(`(${query})`, flags);
            } else {
                const escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                pattern = new RegExp(`(${escapedQ})`, flags);
            }
            return escaped.replace(pattern, '<mark>$1</mark>');
        } catch {
            return escaped;
        }
    }

    escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    escapeAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/\\/g, '\\\\');
    }

    async replaceSelected() {
        const replaceText = this.replaceInput?.value || '';
        const editor = window.ide?.editorManager?.monacoEditor;
        if (!editor || this.currentMatch < 0 || this.editorMatches.length === 0) return;

        const match = this.editorMatches[this.currentMatch];
        const { query, caseSensitive } = this.getQueryOptions();
        if (!query) return;

        const selection = editor.getSelection();
        const selectedText = editor.getModel().getValueInRange(selection);

        const searchLine = caseSensitive ? selectedText : selectedText.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        if (searchLine.toLowerCase().includes(searchQuery.toLowerCase())) {
            editor.executeEdits('find-replace', [{
                range: selection,
                text: replaceText
            }]);
        }

        this.searchInEditor();
        this.searchInFiles();
    }

    async replaceAll() {
        const { query, useRegex, caseSensitive } = this.getQueryOptions();
        const replaceText = this.replaceInput?.value || '';
        if (!query || this.results.length === 0) return;

        for (const file of this.results) {
            const content = await window.api.fs.readFile(file.fullPath);
            if (!content) continue;

            let newContent;
            const flags = caseSensitive ? 'g' : 'gi';

            if (useRegex) {
                newContent = content.replace(new RegExp(query, flags), replaceText);
            } else {
                const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                newContent = content.replace(new RegExp(escaped, flags), replaceText);
            }

            if (newContent !== content) {
                await window.api.fs.writeFile(file.fullPath, newContent);
            }
        }

        this.searchInEditor();
        this.searchInFiles();
    }
}
