const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
    fs: {
        openFolder: () => ipcRenderer.invoke('fs:open-folder'),
        readFile: (path) => ipcRenderer.invoke('fs:read-file', path),
        writeFile: (path, content) => ipcRenderer.invoke('fs:write-file', path, content),
        deleteFile: (path) => ipcRenderer.invoke('fs:delete-file', path),
        readDirectory: (path) => ipcRenderer.invoke('fs:read-directory', path),
    },
    app: {
        minimize: () => ipcRenderer.send('app:minimize'),
        maximize: () => ipcRenderer.send('app:maximize'),
        close: () => ipcRenderer.send('app:close'),
    },
    terminal: {
        create: (cwd) => ipcRenderer.invoke('terminal:create', { cwd }),
        write: (id, data) => ipcRenderer.invoke('terminal:write', { id, data }),
        resize: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
        kill: (id) => ipcRenderer.invoke('terminal:kill', { id }),
        onData: (id, callback) => ipcRenderer.on(`terminal:data:${id}`, (_e, data) => callback(data)),
        onExit: (id, callback) => ipcRenderer.on(`terminal:exit:${id}`, (_e, code) => callback(code)),
    },
    git: {
        status: (repoPath) => ipcRenderer.invoke('git:status', { repoPath }),
        diff: (repoPath, file) => ipcRenderer.invoke('git:diff', { repoPath, file }),
        diffStaged: (repoPath, file) => ipcRenderer.invoke('git:diff-staged', { repoPath, file }),
        stage: (repoPath, files) => ipcRenderer.invoke('git:stage', { repoPath, files }),
        unstage: (repoPath, files) => ipcRenderer.invoke('git:unstage', { repoPath, files }),
        commit: (repoPath, message) => ipcRenderer.invoke('git:commit', { repoPath, message }),
        branches: (repoPath) => ipcRenderer.invoke('git:branches', { repoPath }),
        checkout: (repoPath, branch) => ipcRenderer.invoke('git:checkout', { repoPath, branch }),
        log: (repoPath, maxCount) => ipcRenderer.invoke('git:log', { repoPath, maxCount }),
    },
});

// Electron API for OAuth
contextBridge.exposeInMainWorld('electronAPI', {
    openExternal: (url) => ipcRenderer.send('open-external', url),
    onGithubAuth: (callback) => ipcRenderer.on('github-auth', (_e, data) => callback(data)),
});
