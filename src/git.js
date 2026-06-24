const simpleGit = require('simple-git');
const path = require('path');

class GitManager {
    constructor() {
        this.instances = new Map();
    }

    getInstance(repoPath) {
        if (!this.instances.has(repoPath)) {
            this.instances.set(repoPath, simpleGit(repoPath));
        }
        return this.instances.get(repoPath);
    }

    async init(repoPath) {
        try {
            const git = this.getInstance(repoPath);
            await git.init();
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    }

    async status(repoPath) {
        try {
            const git = this.getInstance(repoPath);
            return await git.status();
        } catch (error) {
            return { notGitRepo: true, error: error.message };
        }
    }

    async diff(repoPath, file) {
        try {
            const git = this.getInstance(repoPath);
            if (file) {
                return await git.diff(['--', file]);
            }
            return await git.diff();
        } catch (error) {
            return { error: error.message };
        }
    }

    async diffStaged(repoPath, file) {
        try {
            const git = this.getInstance(repoPath);
            if (file) {
                return await git.diff(['--cached', '--', file]);
            }
            return await git.diff(['--cached']);
        } catch (error) {
            return { error: error.message };
        }
    }

    async stage(repoPath, files) {
        try {
            const git = this.getInstance(repoPath);
            return await git.add(files);
        } catch (error) {
            return { error: error.message };
        }
    }

    async unstage(repoPath, files) {
        try {
            const git = this.getInstance(repoPath);
            return await git.reset(['HEAD', '--', ...files]);
        } catch (error) {
            return { error: error.message };
        }
    }

    async commit(repoPath, message) {
        try {
            const git = this.getInstance(repoPath);
            return await git.commit(message);
        } catch (error) {
            return { error: error.message };
        }
    }

    async branches(repoPath) {
        try {
            const git = this.getInstance(repoPath);
            return await git.branchLocal();
        } catch (error) {
            return { error: error.message };
        }
    }

    async checkout(repoPath, branch) {
        try {
            const git = this.getInstance(repoPath);
            return await git.checkout(branch);
        } catch (error) {
            return { error: error.message };
        }
    }

    async log(repoPath, maxCount = 20) {
        try {
            const git = this.getInstance(repoPath);
            return await git.log({ maxCount });
        } catch (error) {
            return { error: error.message };
        }
    }

    async addRemote(repoPath, name, url) {
        try {
            const git = this.getInstance(repoPath);
            await git.addRemote(name, url);
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    }

    async removeRemote(repoPath, name) {
        try {
            const git = this.getInstance(repoPath);
            await git.removeRemote(name);
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    }

    async getRemotes(repoPath) {
        try {
            const git = this.getInstance(repoPath);
            return await git.getRemotes(true);
        } catch (error) {
            return { error: error.message };
        }
    }

    async push(repoPath, remote = 'origin', branch = null, token = null) {
        try {
            const git = this.getInstance(repoPath);
            if (branch) {
                await git.push(remote, branch);
            } else {
                await git.push(remote);
            }
            return { success: true };
        } catch (error) {
            if (token) {
                try {
                    const git2 = this.getInstance(repoPath);
                    const currentBranch = (await git2.branchLocal()).current;
                    const url = (await this.getRemotes(repoPath))
                        .find(r => r.name === remote)?.refs?.push;
                    if (url) {
                        const authUrl = url.replace('https://', `https://${token}@`);
                        await git2.remote([remote, authUrl, '--set-url']);
                        await git2.push(remote, currentBranch || 'main');
                        const originalUrl = url.replace(`https://${token}@`, 'https://');
                        await git2.remote([remote, originalUrl, '--set-url']);
                        return { success: true };
                    }
                } catch (e2) {
                    return { error: e2.message };
                }
            }
            return { error: error.message };
        }
    }

    async pull(repoPath, remote = 'origin', branch = null, token = null) {
        try {
            const git = this.getInstance(repoPath);
            if (branch) {
                await git.pull(remote, branch);
            } else {
                await git.pull(remote);
            }
            return { success: true };
        } catch (error) {
            if (token) {
                try {
                    const git2 = this.getInstance(repoPath);
                    const url = (await this.getRemotes(repoPath))
                        .find(r => r.name === remote)?.refs?.fetch;
                    if (url) {
                        const authUrl = url.replace('https://', `https://${token}@`);
                        await git2.remote([remote, authUrl, '--set-url']);
                        await git2.pull(remote);
                        const originalUrl = url.replace(`https://${token}@`, 'https://');
                        await git2.remote([remote, originalUrl, '--set-url']);
                        return { success: true };
                    }
                } catch (e2) {
                    return { error: e2.message };
                }
            }
            return { error: error.message };
        }
    }

    async fetch(repoPath, remote = 'origin', token = null) {
        try {
            const git = this.getInstance(repoPath);
            await git.fetch(remote);
            return { success: true };
        } catch (error) {
            return { error: error.message };
        }
    }

    async clone(url, destPath, token = null) {
        try {
            const authUrl = token ? url.replace('https://', `https://${token}@`) : url;
            await simpleGit().clone(authUrl, destPath);
            return { success: true, path: destPath };
        } catch (error) {
            return { error: error.message };
        }
    }
}

module.exports = { GitManager };
