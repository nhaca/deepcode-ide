class ContextMenu {
    constructor(app) {
        this.app = app;
    }

    setup() {
        const menu = document.getElementById('contextMenu');
        document.addEventListener('click', () => { menu.style.display = 'none'; });
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.file-tree-list') && !e.target.closest('#fileTree')) {
                menu.style.display = 'none';
            }
        });
    }

    show(e, targetPath, isDir) {
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
            item.onclick = () => this.handleAction(item.dataset.action, targetPath, isDir);
        });
    }

    async handleAction(action, targetPath, isDir) {
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'none';
        const parentDir = isDir ? targetPath : targetPath.replace(/[\\/][^\\/]+$/, '');

        if (action === 'newFile') {
            const name = await this.app.customPrompt('Tạo file mới', 'Nhập tên file:');
            if (!name) return;
            const fullPath = parentDir + '\\' + name;
            await window.api.fs.writeFile(fullPath, '');
            await this.app.fileTree.load(this.app.currentFolder);

        } else if (action === 'newFolder') {
            const name = await this.app.customPrompt('Tạo thư mục mới', 'Nhập tên thư mục:');
            if (!name) return;
            const fullPath = parentDir + '\\' + name;
            await window.api.fs.mkdir(fullPath);
            await this.app.fileTree.load(this.app.currentFolder);

        } else if (action === 'rename') {
            const oldName = targetPath.split(/[\\/]/).pop();
            const newName = await this.app.customPrompt('Đổi tên', 'Nhập tên mới:', oldName);
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
            await this.app.fileTree.load(this.app.currentFolder);

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
            await this.app.fileTree.load(this.app.currentFolder);
        }
    }
}
