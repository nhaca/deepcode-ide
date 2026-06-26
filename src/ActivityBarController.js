class ActivityBarController {
    constructor(app) {
        this.app = app;
    }

    setup() {
        document.querySelectorAll('.activity-btn').forEach((btn) => {
            btn.onclick = () => {
                const panel = btn.dataset.panel;

                if (panel === 'ai') {
                    this.app.toggleAIPanel();
                    return;
                }

                if (panel === 'settings') {
                    this.app.toggleSettingsPanel();
                    return;
                }

                document.querySelectorAll('.activity-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                const gitSection = document.getElementById('gitPanelSection');
                const fileTreeSection = document.querySelector('.sidebar-section.flex-1:not(#gitPanelSection):not(#packagePanelSection):not(#extensionsPanelSection):not(#searchPanelSection)');
                const searchSection = document.getElementById('searchPanelSection');
                const packageSection = document.getElementById('packagePanelSection');
                const extensionsSection = document.getElementById('extensionsPanelSection');

                [gitSection, fileTreeSection, searchSection, packageSection, extensionsSection].forEach(s => {
                    if (s) s.style.display = 'none';
                });

                if (panel === 'git') {
                    gitSection.style.display = 'flex';
                    this.app.refreshGitStatus();
                } else if (panel === 'explorer') {
                    fileTreeSection.style.display = 'flex';
                } else if (panel === 'search') {
                    searchSection.style.display = 'flex';
                } else if (panel === 'packages') {
                    packageSection.style.display = 'flex';
                    this.app.refreshPackagePanel();
                } else if (panel === 'extensions') {
                    extensionsSection.style.display = 'flex';
                    this.app.refreshExtensionsPanel();
                }
            };
        });
    }

    switchPanel(panel) {
        const btn = document.querySelector(`.activity-btn[data-panel="${panel}"]`);
        if (btn) btn.click();
    }
}
