class BottomPanel {
    constructor(app) {
        this.app = app;
        this.outputLog = [];
    }

    setup() {
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
                if (target === 'terminal' && this.app.terminalManager) this.app.terminalManager.resize();
            };
        });
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

    async toggle() {
        const bottomPanel = document.getElementById('bottomPanel');
        const isVisible = bottomPanel.style.display !== 'none';

        if (isVisible) {
            bottomPanel.style.display = 'none';
        } else {
            bottomPanel.style.display = 'flex';
            if (!this.app.terminalManager.activeId) {
                await this.app.terminalManager.create(this.app.currentFolder);
            } else {
                this.app.terminalManager.resize();
                this.app.terminalManager.xterm?.focus();
            }
        }
    }
}
