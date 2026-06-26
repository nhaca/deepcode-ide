class FileTree {
    constructor(app) {
        this.app = app;
    }

    async restoreLastFolder() {
        const lastFolder = localStorage.getItem('deepcode-last-folder');
        if (lastFolder) {
            try {
                const items = await window.api.fs.readDirectory(lastFolder);
                if (items !== null) {
                    this.app.currentFolder = lastFolder;
                    window.state.set('workspaceRoot', lastFolder);
                    await this.load(lastFolder);
                    this.app.refreshGitStatus();
                    if (this.app.terminalManager) {
                        this.app.terminalManager.killAll();
                        this.app.terminalManager.create(lastFolder);
                    }
                }
            } catch {}
        }
    }

    async openFolder() {
        const folderPath = await window.api.fs.openFolder();
        if (folderPath) {
            this.app.currentFolder = folderPath;
            window.state.set('workspaceRoot', folderPath);
            localStorage.setItem('deepcode-last-folder', folderPath);
            await this.load(folderPath);
            this.app.refreshGitStatus();
            if (this.app.terminalManager) {
                this.app.terminalManager.killAll();
                this.app.terminalManager.create(folderPath);
            }
        }
    }

    async load(dirPath) {
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
            this.app.contextMenu.show(e, dirPath, true);
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
                    this.app.contextMenu.show(e, item.path, true);
                });

                container.appendChild(div);
                container.appendChild(childContainer);
            } else {
                div.onclick = () => {
                    container.querySelectorAll('.file-item').forEach(f => f.classList.remove('active'));
                    div.classList.add('active');
                    this.app.openFile(item.path, item.name);
                };
                div.addEventListener('contextmenu', (e) => {
                    container.querySelectorAll('.file-item').forEach(f => f.classList.remove('active'));
                    div.classList.add('active');
                    this.app.contextMenu.show(e, item.path, false);
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
}
