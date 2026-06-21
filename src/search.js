class SearchManager {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.replaceInput = document.getElementById('replaceInput');
        this.resultsEl = document.getElementById('searchResults');
        this.caseSensitive = document.getElementById('searchCaseSensitive');
        this.regexToggle = document.getElementById('searchRegex');
        this.debounceTimer = null;
        this.results = [];
        this.setupEvents();
    }

    setupEvents() {
        this.searchInput?.addEventListener('input', () => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => this.search(), 300);
        });

        this.searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(this.debounceTimer);
                this.search();
            }
        });

        this.caseSensitive?.addEventListener('change', () => this.search());
        this.regexToggle?.addEventListener('change', () => this.search());

        document.getElementById('searchReplaceOneBtn')?.addEventListener('click', () => this.replaceSelected());
        document.getElementById('searchReplaceAllBtn')?.addEventListener('click', () => this.replaceAll());
    }

    async search() {
        const query = this.searchInput?.value?.trim();
        const workspaceRoot = window.state?.get('workspaceRoot');

        if (!query || !workspaceRoot) {
            this.resultsEl.innerHTML = '<div class="search-empty">' + (query ? 'Chưa mở thư mục' : 'Nhập từ khóa để tìm kiếm') + '</div>';
            this.results = [];
            return;
        }

        const useRegex = this.regexToggle?.checked;
        const caseSensitive = this.caseSensitive?.checked;

        let pattern;
        try {
            pattern = useRegex ? new RegExp(query, caseSensitive ? 'g' : 'gi') : null;
        } catch {
            this.resultsEl.innerHTML = '<div class="search-empty">Biểu thức regex không hợp lệ</div>';
            return;
        }

        const ignorePatterns = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.vscode', '.idea'];
        const textExtensions = ['.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.html', '.json', '.md', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.xml', '.yaml', '.yml', '.toml', '.ini', '.env', '.sh', '.bat', '.ps1', '.vue', '.svelte'];

        this.results = [];
        await this.searchDir(workspaceRoot, query, caseSensitive, pattern, ignorePatterns, textExtensions, workspaceRoot);

        this.renderResults(query);
    }

    async searchDir(dirPath, query, caseSensitive, pattern, ignorePatterns, textExtensions, rootPath) {
        let items;
        try {
            items = await window.api.fs.readDirectory(dirPath);
        } catch {
            return;
        }

        for (const item of items) {
            if (ignorePatterns.includes(item.name)) continue;

            if (item.isDirectory) {
                await this.searchDir(item.path, query, caseSensitive, pattern, ignorePatterns, textExtensions, rootPath);
            } else {
                const ext = '.' + item.name.split('.').pop().toLowerCase();
                if (!textExtensions.includes(ext) && !item.name.match(/\.(js|ts|css|html|json|md|py)$/i)) continue;

                try {
                    const content = await window.api.fs.readFile(item.path);
                    if (!content) continue;

                    const lines = content.split('\n');
                    const fileMatches = [];

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        let isMatch = false;

                        if (pattern) {
                            pattern.lastIndex = 0;
                            isMatch = pattern.test(line);
                        } else {
                            const searchLine = caseSensitive ? line : line.toLowerCase();
                            const searchQuery = caseSensitive ? query : query.toLowerCase();
                            isMatch = searchLine.includes(searchQuery);
                        }

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
            html += `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
            html += `<span class="file-name">${this.escapeHtml(fileName)}</span>`;
            html += `<span style="color:var(--text-muted);font-size:11px">${this.escapeHtml(file.file)}</span>`;
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
                html += `<span class="line-text">và ${file.matches.length - maxShow} kết quả khác</span>`;
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

        const useRegex = this.regexToggle?.checked;
        const caseSensitive = this.caseSensitive?.checked;
        const flags = caseSensitive ? 'g' : 'gi';

        try {
            const pattern = useRegex ? new RegExp(`(${query})`, flags) : new RegExp(`(${this.escapeRegex(query)})`, flags);
            return escaped.replace(pattern, '<mark>$1</mark>');
        } catch {
            return escaped;
        }
    }

    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    escapeAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/\\/g, '\\\\');
    }

    async replaceSelected() {
        const replaceText = this.replaceInput?.value || '';
        const activeEl = document.querySelector('.search-result-line:hover');
        if (!activeEl) return;

        const filePath = activeEl.dataset.path;
        const lineNum = parseInt(activeEl.dataset.line);
        if (!filePath || !lineNum) return;

        const content = await window.api.fs.readFile(filePath);
        if (!content) return;

        const lines = content.split('\n');
        const line = lines[lineNum - 1];
        const query = this.searchInput?.value?.trim();
        if (!query) return;

        const caseSensitive = this.caseSensitive?.checked;
        const searchLine = caseSensitive ? line : line.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        const idx = searchLine.indexOf(searchQuery);

        if (idx === -1) return;

        lines[lineNum - 1] = line.substring(0, idx) + replaceText + line.substring(idx + query.length);
        await window.api.fs.writeFile(filePath, lines.join('\n'));

        this.search();
    }

    async replaceAll() {
        const query = this.searchInput?.value?.trim();
        const replaceText = this.replaceInput?.value || '';
        if (!query || this.results.length === 0) return;

        for (const file of this.results) {
            const content = await window.api.fs.readFile(file.fullPath);
            if (!content) continue;

            const caseSensitive = this.caseSensitive?.checked;
            const useRegex = this.regexToggle?.checked;
            let newContent;

            if (useRegex) {
                const flags = caseSensitive ? 'g' : 'gi';
                newContent = content.replace(new RegExp(query, flags), replaceText);
            } else {
                const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const flags = caseSensitive ? 'g' : 'gi';
                newContent = content.replace(new RegExp(escaped, flags), replaceText);
            }

            if (newContent !== content) {
                await window.api.fs.writeFile(file.fullPath, newContent);
            }
        }

        this.search();
    }
}
