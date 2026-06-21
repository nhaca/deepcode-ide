class CommandRegistry {
    constructor() {
        this.commands = [];
    }

    register(id, label, action, keywords = '') {
        this.commands.push({ id, label, action, keywords });
    }

    search(query) {
        if (!query) return this.commands;
        return fuzzysort.go(query, this.commands, { keys: ['label', 'keywords'] }).map((r) => r.obj);
    }
}

class CommandPalette {
    constructor(registry) {
        this.registry = registry;
        this.isOpen = false;
        this.selected = 0;
        this.filteredCommands = [];
        this.createOverlay();
        this.setupEvents();
    }

    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'command-palette-overlay';
        this.overlay.innerHTML = `
            <div class="command-palette-modal">
                <input type="text" class="command-palette-input" placeholder="Nhập lệnh..." />
                <div class="command-palette-list"></div>
            </div>
        `;
        document.body.appendChild(this.overlay);

        this.input = this.overlay.querySelector('.command-palette-input');
        this.list = this.overlay.querySelector('.command-palette-list');
    }

    setupEvents() {
        this.input.addEventListener('input', () => {
            this.filter(this.input.value);
        });

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectNext();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectPrev();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.executeSelected();
            }
        });

        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.close();
            }
        });
    }

    open() {
        this.isOpen = true;
        this.overlay.classList.add('visible');
        this.input.value = '';
        this.filter('');
        setTimeout(() => this.input.focus(), 50);
    }

    close() {
        this.isOpen = false;
        this.overlay.classList.remove('visible');
        this.input.value = '';
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    filter(query) {
        this.filteredCommands = this.registry.search(query);
        this.selected = 0;
        this.render();
    }

    render() {
        this.list.innerHTML = this.filteredCommands
            .map(
                (cmd, i) => `
            <div class="command-palette-item ${i === this.selected ? 'selected' : ''}" data-index="${i}">
                <span class="command-palette-label">${cmd.label}</span>
                <span class="command-palette-id">${cmd.id}</span>
            </div>
        `
            )
            .join('');

        this.list.querySelectorAll('.command-palette-item').forEach((item) => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.selected = index;
                this.executeSelected();
            });
            item.addEventListener('mouseenter', () => {
                this.selected = parseInt(item.dataset.index);
                this.updateSelection();
            });
        });
    }

    updateSelection() {
        this.list.querySelectorAll('.command-palette-item').forEach((item, i) => {
            item.classList.toggle('selected', i === this.selected);
        });
    }

    selectNext() {
        this.selected = Math.min(this.selected + 1, this.filteredCommands.length - 1);
        this.updateSelection();
        this.scrollToSelected();
    }

    selectPrev() {
        this.selected = Math.max(this.selected - 1, 0);
        this.updateSelection();
        this.scrollToSelected();
    }

    scrollToSelected() {
        const selected = this.list.querySelector('.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
    }

    executeSelected() {
        if (this.filteredCommands.length > 0) {
            const cmd = this.filteredCommands[this.selected];
            this.close();
            cmd.action();
        }
    }
}

window.CommandRegistry = CommandRegistry;
window.CommandPalette = CommandPalette;
