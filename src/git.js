const simpleGit = require('simple-git');

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
}

module.exports = { GitManager };
