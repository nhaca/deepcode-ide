const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
    fs: {
        openFolder: () => ipcRenderer.invoke('fs:open-folder'),
        readFile: (path) => ipcRenderer.invoke('fs:read-file', path),
        writeFile: (path, content) => ipcRenderer.invoke('fs:write-file', path, content),
        deleteFile: (path) => ipcRenderer.invoke('fs:delete-file', path),
        rename: (oldPath, newName) => ipcRenderer.invoke('fs:rename', oldPath, newName),
        mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
        readDirectory: (path) => ipcRenderer.invoke('fs:read-directory', path),
    },
    backup: {
        save: (workspaceRoot, filePath, originalContent) => ipcRenderer.invoke('backup:save', { workspaceRoot, filePath, originalContent }),
        revert: (workspaceRoot, filePath) => ipcRenderer.invoke('backup:revert', { workspaceRoot, filePath }),
        hasBackup: (workspaceRoot, filePath) => ipcRenderer.invoke('backup:has-backup', { workspaceRoot, filePath }),
        list: (workspaceRoot) => ipcRenderer.invoke('backup:list', { workspaceRoot }),
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
        execute: (command, cwd, timeout) => ipcRenderer.invoke('terminal:execute', { command, cwd, timeout }),
    },
    ai: {
        readFile: (filePath) => ipcRenderer.invoke('ai:read-file', { filePath }),
        listDir: (dirPath) => ipcRenderer.invoke('ai:list-dir', { dirPath }),
    },
    git: {
        init: (repoPath) => ipcRenderer.invoke('git:init', { repoPath }),
        status: (repoPath) => ipcRenderer.invoke('git:status', { repoPath }),
        diff: (repoPath, file) => ipcRenderer.invoke('git:diff', { repoPath, file }),
        diffStaged: (repoPath, file) => ipcRenderer.invoke('git:diff-staged', { repoPath, file }),
        stage: (repoPath, files) => ipcRenderer.invoke('git:stage', { repoPath, files }),
        unstage: (repoPath, files) => ipcRenderer.invoke('git:unstage', { repoPath, files }),
        commit: (repoPath, message) => ipcRenderer.invoke('git:commit', { repoPath, message }),
        branches: (repoPath) => ipcRenderer.invoke('git:branches', { repoPath }),
        checkout: (repoPath, branch) => ipcRenderer.invoke('git:checkout', { repoPath, branch }),
        log: (repoPath, maxCount) => ipcRenderer.invoke('git:log', { repoPath, maxCount }),
        addRemote: (repoPath, name, url) => ipcRenderer.invoke('git:add-remote', { repoPath, name, url }),
        removeRemote: (repoPath, name) => ipcRenderer.invoke('git:remove-remote', { repoPath, name }),
        getRemotes: (repoPath) => ipcRenderer.invoke('git:get-remotes', { repoPath }),
        push: (repoPath, remote, branch) => ipcRenderer.invoke('git:push', { repoPath, remote, branch }),
        pull: (repoPath, remote, branch) => ipcRenderer.invoke('git:pull', { repoPath, remote, branch }),
        fetch: (repoPath, remote) => ipcRenderer.invoke('git:fetch', { repoPath, remote }),
        clone: (url, destPath) => ipcRenderer.invoke('git:clone', { url, destPath }),
    },
    github: {
        saveToken: (token, username) => ipcRenderer.invoke('github:save-token', { token, username }),
        getToken: () => ipcRenderer.invoke('github:get-token'),
        createRepo: (name, description, isPrivate) => ipcRenderer.invoke('github:create-repo', { name, description, isPrivate }),
        requestDeviceCode: () => ipcRenderer.invoke('github:device-code'),
        pollToken: (deviceCode) => ipcRenderer.invoke('github:poll-token', { deviceCode }),
    },
    // GitHub Models AI (models.inference.ai.azure.com)
    githubModels: {
        chat: (model, messages, stream) => ipcRenderer.invoke('github-models:chat', { model, messages, stream }),
        list: () => ipcRenderer.invoke('github-models:list'),
    },
    // SECURITY: Tier management — server-side enforced
    tier: {
        get: () => ipcRenderer.invoke('tier:get'),
        set: (tier) => ipcRenderer.invoke('tier:set', tier),
    },
    // SECURITY: ATXP proxy — keys never leave main process
    atxp: {
        chat: (model, messages, stream) => ipcRenderer.invoke('atxp:chat', { model, messages, stream }),
        models: () => ipcRenderer.invoke('atxp:models'),
    },
    // DeepCode Go → Gateway v1
    deepcodeGo: {
        chat: (model, messages, stream, tools) => ipcRenderer.invoke('deepcode-go:chat', { model, messages, stream, tools }),
        loadPersonality: () => ipcRenderer.invoke('deepcode-go:loadPersonality'),
        models: () => ipcRenderer.invoke('deepcode-go:models'),
        onStreamChunk: (cb) => ipcRenderer.on('deepcode-go:stream-chunk', (_e, data) => cb(data)),
        removeStreamListeners: () => ipcRenderer.removeAllListeners('deepcode-go:stream-chunk'),
    },
    // Cloudflare Workers AI (deepcode-ultra)
    cf: {
        chat: (model, messages, stream) => ipcRenderer.invoke('cf:chat', { model, messages, stream }),
        setAccountId: (id) => ipcRenderer.invoke('cf:set-account-id', id),
        getConfig: () => ipcRenderer.invoke('cf:get-config'),
    },
    // ZenMux API (DeepCode Pro + Review mode)
    zenmux: {
        chat: (messages, stream, mode) => ipcRenderer.invoke('zenmux:chat', { messages, stream, mode }),
    },
    // DeepCode Server 2 → Gateway v4 (multi-model, tier-gated)
    server2: {
        chat: (model, messages, stream, githubToken) => ipcRenderer.invoke('server2:chat', { model, messages, stream, githubToken }),
        chatModel: (modelId, messages, stream, githubToken) => ipcRenderer.invoke('server2:chat-model', { modelId, messages, stream, githubToken }),
        models: () => ipcRenderer.invoke('server2:models'),
        onStreamChunk: (cb) => ipcRenderer.on('server2:stream-chunk', (_e, data) => cb(data)),
        removeStreamListeners: () => ipcRenderer.removeAllListeners('server2:stream-chunk'),
    },
    // Device binding (1 device = 1 user)
    device: {
        bind: (email, provider) => ipcRenderer.invoke('device:bind', { email, provider }),
        getBinding: () => ipcRenderer.invoke('device:get-binding'),
        setUser: (email, provider, tier) => ipcRenderer.invoke('device:set-user', { email, provider, tier }),
    },
    // Gateway credits
    gateway: {
        credits: () => ipcRenderer.invoke('gateway:credits'),
    },
    // Admin panel (mã session mỗi lần mở app)
    admin: {
        open: (token) => ipcRenderer.invoke('admin:open', token),
        verify: (token) => ipcRenderer.invoke('admin:verify', token),
        refreshToken: () => ipcRenderer.invoke('admin:refresh-token'),
        getEmailConfig: () => ipcRenderer.invoke('admin:email-config'),
        setupEmail: (user, appPassword, adminEmail) => ipcRenderer.invoke('admin:email-setup', user, appPassword, adminEmail),
        autoRegister: (data) => ipcRenderer.invoke('admin:auto-register', data),
        incrementRequests: () => ipcRenderer.invoke('admin:increment-requests'),
    },
    security: {
        getFingerprint: () => ipcRenderer.invoke('security:get-fingerprint'),
        getBanStatus: () => ipcRenderer.invoke('security:get-ban-status'),
    },
    // Package Manager
    pkg: {
        detectProjectType: (workspaceRoot) => ipcRenderer.invoke('pkg:detect-project-type', { workspaceRoot }),
        list: (workspaceRoot, pkgType) => ipcRenderer.invoke('pkg:list', { workspaceRoot, pkgType }),
        install: (workspaceRoot, pkgType, packageName) => ipcRenderer.invoke('pkg:install', { workspaceRoot, pkgType, packageName }),
        uninstall: (workspaceRoot, pkgType, packageName) => ipcRenderer.invoke('pkg:uninstall', { workspaceRoot, pkgType, packageName }),
    },
    // Extensions
    ext: {
        list: () => ipcRenderer.invoke('ext:list'),
        install: (name, manifest) => ipcRenderer.invoke('ext:install', { name, manifest }),
        uninstall: (name) => ipcRenderer.invoke('ext:uninstall', { name }),
        setEnabled: (name, enabled) => ipcRenderer.invoke('ext:set-enabled', { name, enabled }),
    },
});

// Electron API for OAuth
contextBridge.exposeInMainWorld('electronAPI', {
    openExternal: (url) => ipcRenderer.send('open-external', url),
    onGithubAuth: (callback) => ipcRenderer.on('github-auth', (_e, data) => callback(data)),
    oauthGoogle: () => ipcRenderer.invoke('oauth-google'),
    oauthGitHub: () => ipcRenderer.invoke('oauth-github'),
    onOAuthCallback: (callback) => ipcRenderer.on('oauth-callback', (_e, data) => callback(data)),
});
