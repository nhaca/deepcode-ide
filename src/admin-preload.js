const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adminAPI', {
    // Auth
    verify: (token) => ipcRenderer.invoke('admin:verify', token),
    // Users - delegate to Firebase if available
    getAllUsers: () => ipcRenderer.invoke('admin:get-users'),
    getUser: (userId) => ipcRenderer.invoke('admin:get-user', userId),
    addUser: (userId, name, email, tier) => ipcRenderer.invoke('admin:add-user', userId, name, email, tier),
    updateUser: (userId, updates) => ipcRenderer.invoke('admin:update-user', userId, updates),
    deleteUser: (userId) => ipcRenderer.invoke('admin:delete-user', userId),
    blockUser: (userId, reason) => ipcRenderer.invoke('admin:block-user', userId, reason),
    unblockUser: (userId) => ipcRenderer.invoke('admin:unblock-user', userId),
    setUserTier: (userId, tier) => ipcRenderer.invoke('admin:set-user-tier', userId, tier),

    // Stats & Settings
    getStats: () => ipcRenderer.invoke('admin:get-stats'),
    getSettings: () => ipcRenderer.invoke('admin:get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('admin:save-settings', settings),

    // Email config
    getEmailConfig: () => ipcRenderer.invoke('admin:email-config'),
    setupEmail: (user, appPassword, adminEmail) => ipcRenderer.invoke('admin:email-setup', user, appPassword, adminEmail),

    // Cloudflare config
    getCfConfig: () => ipcRenderer.invoke('cf:get-config'),
    setCfAccountId: (id) => ipcRenderer.invoke('cf:set-account-id', id),

    // Firebase direct bridge (loaded via <script> in admin.html)
    firebase: {
        getAllUsers: () => ipcRenderer.invoke('admin:firebase-get-users'),
        updateUser: (userId, updates) => ipcRenderer.invoke('admin:firebase-update-user', userId, updates),
        deleteUser: (userId) => ipcRenderer.invoke('admin:firebase-delete-user', userId),
        getStats: () => ipcRenderer.invoke('admin:firebase-get-stats'),
    },

    // OAuth for admin
    oauthGoogle: () => ipcRenderer.invoke('oauth-google'),
    oauthGitHub: () => ipcRenderer.invoke('oauth-github'),
    onOAuthCallback: (callback) => ipcRenderer.on('oauth-callback', (_e, data) => callback(data)),
});
