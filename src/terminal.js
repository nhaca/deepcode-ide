class TerminalManager {
    constructor(container) {
        this.container = container;
        this.terminals = new Map();
        this.activeId = null;
        this.xterm = null;
        this.fitAddon = null;
        this._outputBuffer = '';
        this._detectTimer = null;
    }

    async init() {
        if (this.xterm) return;

        await this._loadXterm();

        if (!window.Terminal) {
            console.warn('xterm.js not loaded, terminal unavailable');
            this.container.innerHTML = '<div style="padding:20px;color:#888;">Terminal không khả dụng. Kiểm tra kết nối mạng.</div>';
            return;
        }

        this.xterm = new window.Terminal({
            theme: {
                background: '#0f0f0f',
                foreground: '#e5e5e5',
                cursor: '#7c5cfc',
                cursorAccent: '#0f0f0f',
                selectionBackground: '#2a2540',
                black: '#0f0f0f',
                red: '#f87171',
                green: '#34d399',
                yellow: '#fbbf24',
                blue: '#60a5fa',
                magenta: '#7c5cfc',
                cyan: '#22d3ee',
                white: '#e5e5e5',
                brightBlack: '#6b6580',
                brightRed: '#f87171',
                brightGreen: '#34d399',
                brightYellow: '#fbbf24',
                brightBlue: '#60a5fa',
                brightMagenta: '#7c5cfc',
                brightCyan: '#22d3ee',
                brightWhite: '#e5e5e5',
            },
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            allowProposedApi: true,
        });

        this.fitAddon = new window.FitAddon.FitAddon();
        this.xterm.loadAddon(this.fitAddon);

        try {
            const webglAddon = new window.WebglAddon.WebglAddon();
            this.xterm.loadAddon(webglAddon);
            webglAddon.onContextLoss(() => {
                webglAddon.dispose();
                console.warn('WebGL context lost, falling back to canvas renderer');
            });
        } catch (e) {
            console.warn('WebGL addon unavailable, using canvas renderer');
        }

        this.xterm.open(this.container);
        setTimeout(() => this.fitAddon.fit(), 100);

        this._observeResize();
        this._setupInput();
    }

    async _loadXterm() {
        if (window.Terminal) return;

        const basePath = '../node_modules/xterm';

        return new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `${basePath}/css/xterm.css`;
            document.head.appendChild(link);

            const scripts = [
                `${basePath}/lib/xterm.js`,
                '../node_modules/xterm-addon-fit/lib/xterm-addon-fit.js',
                '../node_modules/xterm-addon-webgl/lib/xterm-addon-webgl.js',
            ];

            let loaded = 0;
            const total = scripts.length;
            scripts.forEach((src) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    loaded++;
                    if (loaded === total) resolve();
                };
                script.onerror = () => {
                    loaded++;
                    console.warn(`Failed to load: ${src}`);
                    if (loaded === total) resolve();
                };
                document.head.appendChild(script);
            });

            setTimeout(resolve, 3000);
        });
    }

    _observeResize() {
        const ro = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                if (this.fitAddon) {
                    this.fitAddon.fit();
                }
            });
        });
        ro.observe(this.container);
    }

    _setupInput() {
        this.xterm.onData((data) => {
            if (this.activeId) {
                window.api.terminal.write(this.activeId, data);
            }
        });
    }

    async create(cwd) {
        await this.init();

        const id = await window.api.terminal.create(cwd);
        if (!id) return null;

        this.terminals.set(id, { id, buffer: '' });
        this.activeId = id;

        window.api.terminal.onData(id, (data) => {
            this.xterm.write(data);
            this._detectMissingLibrary(data);
        });

        window.api.terminal.onExit(id, (code) => {
            this.xterm.writeln(`\r\n[Process exited with code ${code}]`);
            this.terminals.delete(id);
            if (this.activeId === id) {
                this.activeId = null;
            }
        });

        this.xterm.focus();
        return id;
    }

    write(data) {
        if (this.xterm) {
            this.xterm.write(data);
        }
    }

    kill(id) {
        window.api.terminal.kill(id);
        this.terminals.delete(id);
    }

    killAll() {
        this.terminals.forEach((_, id) => {
            window.api.terminal.kill(id);
        });
        this.terminals.clear();
    }

    resize() {
        if (this.fitAddon) {
            this.fitAddon.fit();
        }
    }

    show() {
        if (this.container) {
            this.container.style.display = 'block';
            this.resize();
            this.xterm?.focus();
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    _detectMissingLibrary(data) {
        this._outputBuffer += data;
        if (this._outputBuffer.length > 4096) {
            this._outputBuffer = this._outputBuffer.slice(-2048);
        }

        clearTimeout(this._detectTimer);
        this._detectTimer = setTimeout(() => {
            const buf = this._outputBuffer;
            const patterns = [
                { regex: /Cannot find module\s+['"]([^'"]+)['"]/i, type: 'npm' },
                { regex: /Module not found:\s+['"]([^'"]+)['"]/i, type: 'npm' },
                { regex: /ModuleNotFoundError:\s*No module named\s+['"]([^'"]+)['"]/i, type: 'pip' },
                { regex: /error:.*unresolved import\s+(\S+)/i, type: 'cargo' },
                { regex: /could not import package\s+(\S+)/i, type: 'go' },
                { regex: /Command not found:\s*(\S+)/i, type: 'cmd' },
            ];

            for (const p of patterns) {
                const match = buf.match(p.regex);
                if (match) {
                    const packageName = match[1];
                    this._showMissingLibNotification(packageName, p.type);
                    break;
                }
            }
            this._outputBuffer = '';
        }, 800);
    }

    _showMissingLibNotification(packageName, pkgType) {
        const bar = document.getElementById('missingLibBar');
        const msgEl = document.getElementById('missingLibMessage');
        const installBtn = document.getElementById('missingLibInstallBtn');
        const dismissBtn = document.getElementById('missingLibDismissBtn');

        if (!bar || !msgEl || !installBtn) return;

        const typeLabels = { npm: 'npm', pip: 'pip', cargo: 'cargo', go: 'go', cmd: '' };
        const typeLabel = typeLabels[pkgType] || pkgType;

        msgEl.innerHTML = `Thiếu ${typeLabel ? typeLabel + ' ' : ''}package: <strong>${packageName}</strong>`;

        bar.classList.add('visible');
        bar.dataset.package = packageName;
        bar.dataset.pkgType = pkgType;

        installBtn.onclick = () => {
            const installCmds = {
                npm: `npm install ${packageName}`,
                pip: `pip install ${packageName}`,
                cargo: `cargo add ${packageName}`,
                go: `go get ${packageName}`,
                cmd: packageName,
            };
            const cmd = installCmds[pkgType] || `npm install ${packageName}`;
            if (window.ide && window.ide.terminalManager) {
                window.ide.terminalManager.write(cmd + '\n');
            }
            bar.classList.remove('visible');
        };

        dismissBtn.onclick = () => {
            bar.classList.remove('visible');
        };
    }
}

window.TerminalManager = TerminalManager;
