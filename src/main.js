const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { GitManager } = require('./git');

const gitManager = new GitManager();

// Register custom protocol for OAuth callback
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('deepcode', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('deepcode');
}

let mainWindow;

// Handle protocol URL when app is already running
function handleProtocolUrl(url) {
    if (url && url.startsWith('deepcode://auth')) {
        try {
            const urlObj = new URL(url);
            const token = urlObj.searchParams.get('token');
            const userStr = urlObj.searchParams.get('user');
            if (token && mainWindow) {
                mainWindow.webContents.send('github-auth', {
                    token,
                    user: userStr ? JSON.parse(decodeURIComponent(userStr)) : null,
                });
                mainWindow.focus();
            }
        } catch (e) {
            console.error('Protocol URL parse error:', e);
        }
    }
}

// Handle protocol launch when app is already running
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        const url = commandLine.find(arg => arg.startsWith('deepcode://'));
        if (url) handleProtocolUrl(url);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Handle protocol URL from command line args (Windows)
if (process.platform === 'win32') {
    const protocolUrl = process.argv.find(arg => arg.startsWith('deepcode://'));
    if (protocolUrl) {
        app.whenReady().then(() => handleProtocolUrl(protocolUrl));
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0d0b14',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle custom protocol (macOS/Linux)
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleProtocolUrl(url);
});

// App controls
ipcMain.on('app:minimize', () => mainWindow?.minimize());
ipcMain.on('app:maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});
ipcMain.on('app:close', () => mainWindow?.close());
ipcMain.on('open-external', (event, url) => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            shell.openExternal(url);
        }
    } catch {}
});

// FS operations
ipcMain.handle('fs:open-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('fs:read-directory', async (event, dirPath) => {
    try {
        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        return items
            .filter((item) => !item.name.startsWith('.'))
            .map((item) => ({
                name: item.name,
                path: path.join(dirPath, item.name),
                isDirectory: item.isDirectory(),
            }))
            .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return b.isDirectory - a.isDirectory;
                return a.name.localeCompare(b.name);
            });
    } catch {
        return [];
    }
});

ipcMain.handle('fs:read-file', async (event, filePath) => {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
});

ipcMain.handle('fs:write-file', async (event, filePath, content) => {
    try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    } catch {
        return false;
    }
});

ipcMain.handle('fs:delete-file', async (event, filePath) => {
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch {
        return false;
    }
});

// Terminal
const terminals = new Map();

ipcMain.handle('terminal:create', (event, { cwd }) => {
    const id = crypto.randomUUID();
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? ['-NoLogo', '-NoProfile'] : [];

    const term = spawn(shell, shellArgs, {
        cwd: cwd || process.env.USERPROFILE || process.env.HOME || 'C:\\',
        env: process.env,
        cols: 80,
        rows: 24,
        windowsHide: true,
    });

    term.stdout.on('data', (data) => {
        event.sender.send(`terminal:data:${id}`, data.toString());
    });

    term.stderr.on('data', (data) => {
        event.sender.send(`terminal:data:${id}`, data.toString());
    });

    term.on('exit', (code) => {
        event.sender.send(`terminal:exit:${id}`, code);
        terminals.delete(id);
    });

    terminals.set(id, term);
    return id;
});

ipcMain.handle('terminal:write', (event, { id, data }) => {
    const term = terminals.get(id);
    if (term && term.stdin.writable) {
        term.stdin.write(data);
    }
});

ipcMain.handle('terminal:resize', (event, { id, cols, rows }) => {
    // child_process doesn't support resize natively, but we store it
    // For full terminal support, use node-pty (requires Python + build tools)
});

ipcMain.handle('terminal:kill', (event, { id }) => {
    const term = terminals.get(id);
    if (term) {
        term.kill();
        terminals.delete(id);
    }
});

// Git operations
ipcMain.handle('git:status', async (event, { repoPath }) => {
    return await gitManager.status(repoPath);
});

ipcMain.handle('git:diff', async (event, { repoPath, file }) => {
    return await gitManager.diff(repoPath, file);
});

ipcMain.handle('git:diff-staged', async (event, { repoPath, file }) => {
    return await gitManager.diffStaged(repoPath, file);
});

ipcMain.handle('git:stage', async (event, { repoPath, files }) => {
    return await gitManager.stage(repoPath, files);
});

ipcMain.handle('git:unstage', async (event, { repoPath, files }) => {
    return await gitManager.unstage(repoPath, files);
});

ipcMain.handle('git:commit', async (event, { repoPath, message }) => {
    return await gitManager.commit(repoPath, message);
});

ipcMain.handle('git:branches', async (event, { repoPath }) => {
    return await gitManager.branches(repoPath);
});

ipcMain.handle('git:checkout', async (event, { repoPath, branch }) => {
    return await gitManager.checkout(repoPath, branch);
});

ipcMain.handle('git:log', async (event, { repoPath, maxCount }) => {
    return await gitManager.log(repoPath, maxCount);
});

// Kill all terminals on app quit
app.on('before-quit', () => {
    terminals.forEach((term) => {
        try { term.kill(); } catch (e) {}
    });
    terminals.clear();
});
