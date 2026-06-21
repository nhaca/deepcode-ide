class ResizeManager {
    constructor() {
        this.handles = [];
        this.activeHandle = null;
        this.startPos = 0;
        this.startSize = 0;
        this.target = null;
        this.direction = 'horizontal';
        this.minSize = 100;
        this.maxSize = 0;

        this.init();
    }

    init() {
        document.querySelectorAll('.resize-handle, .resize-handle-horizontal').forEach((handle) => {
            this.handles.push(handle);
            handle.addEventListener('mousedown', (e) => this.startResize(e, handle));
        });

        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.stopResize());
    }

    startResize(e, handle) {
        e.preventDefault();
        this.activeHandle = handle;
        this.activeHandle.classList.add('active');
        document.body.style.cursor = handle.classList.contains('resize-handle-horizontal') ? 'row-resize' : 'col-resize';
        document.body.style.userSelect = 'none';

        const type = handle.dataset.resize;

        if (type === 'sidebar') {
            this.target = document.getElementById('sidebar');
            this.direction = 'horizontal';
            this.startPos = e.clientX;
            this.startSize = this.target.offsetWidth;
            this.minSize = 180;
            this.maxSize = 500;
        } else if (type === 'ai') {
            this.target = document.getElementById('aiColumn');
            this.direction = 'horizontal';
            this.startPos = e.clientX;
            this.startSize = this.target.offsetWidth;
            this.minSize = 250;
            this.maxSize = window.innerWidth * 0.6;
        } else if (type === 'terminal') {
            this.target = document.getElementById('bottomPanel');
            this.direction = 'vertical';
            this.startPos = e.clientY;
            this.startSize = this.target.offsetHeight;
            this.minSize = 80;
            this.maxSize = window.innerHeight * 0.7;
        }
    }

    onMouseMove(e) {
        if (!this.activeHandle || !this.target) return;

        let newSize;

        if (this.direction === 'horizontal') {
            const delta = e.clientX - this.startPos;
            newSize = this.startSize + delta;
        } else {
            const delta = this.startPos - e.clientY;
            newSize = this.startSize + delta;
        }

        newSize = Math.max(this.minSize, Math.min(this.maxSize, newSize));

        if (this.direction === 'horizontal') {
            this.target.style.width = newSize + 'px';
        } else {
            this.target.style.height = newSize + 'px';
        }

        // Trigger resize event for Monaco editor
        window.dispatchEvent(new Event('resize'));
    }

    stopResize() {
        if (this.activeHandle) {
            this.activeHandle.classList.remove('active');
        }
        this.activeHandle = null;
        this.target = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
}

window.ResizeManager = ResizeManager;
