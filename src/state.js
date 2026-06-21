class AppState {
    constructor() {
        this._state = {
            openFiles: [],
            activeFile: null,
            workspaceRoot: null,
            aiPanelVisible: false,
            aiMode: 'plan',
            gitStatus: null,
        };
        this._listeners = {};
    }

    get(key) {
        return this._state[key];
    }

    set(key, value) {
        this._state[key] = value;
        (this._listeners[key] || []).forEach((fn) => fn(value));
    }

    subscribe(key, fn) {
        if (!this._listeners[key]) {
            this._listeners[key] = [];
        }
        this._listeners[key].push(fn);
        return () => {
            this._listeners[key] = this._listeners[key].filter((f) => f !== fn);
        };
    }
}

window.AppState = AppState;
window.state = new AppState();
