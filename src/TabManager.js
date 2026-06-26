class TabManager {
    constructor(app) {
        this.app = app;
    }

    newFile() {
        document.getElementById('welcomePanel').style.display = 'none';
        document.getElementById('editorPanel').style.display = 'flex';
        this.add('untitled', null);
    }

    add(name, filePath) {
        const tabsBar = document.getElementById('tabsBar');
        const existingTab = tabsBar.querySelector(`[data-file="${filePath || 'untitled'}"]`);
        if (existingTab) {
            this.switch(existingTab);
            return;
        }

        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));

        const tab = document.createElement('div');
        tab.className = 'tab active';
        tab.dataset.file = filePath || 'untitled';
        tab.innerHTML = `<span>${name}</span><button class="tab-close">×</button>`;
        tab.onclick = (e) => {
            if (e.target.classList.contains('tab-close')) {
                this.close(tab);
            } else {
                this.switch(tab);
            }
        };
        tabsBar.appendChild(tab);
    }

    close(tab) {
        const filePath = tab.dataset.file;
        if (filePath && filePath !== 'untitled') {
            this.app.editorManager?.closeFile(filePath);
        }
        tab.remove();

        const remainingTabs = document.querySelectorAll('.tab');
        if (remainingTabs.length > 0) {
            this.switch(remainingTabs[remainingTabs.length - 1]);
        } else {
            document.getElementById('welcomePanel').style.display = 'flex';
            document.getElementById('editorPanel').style.display = 'none';
        }
    }

    switch(tab) {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const filePath = tab.dataset.file;
        if (filePath && filePath !== 'untitled' && this.app.editorManager) {
            const file = window.state.get('openFiles').find((f) => f.path === filePath);
            if (file) {
                this.app.editorManager.openFile(filePath, file.content);
            }
        }
    }

    update(files) {
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

    highlightActive(path) {
        document.querySelectorAll('.tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.file === path);
        });
    }
}
