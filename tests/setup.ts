// Global test setup
// @ts-ignore
global.fetch = jest.fn();

// Define API endpoint constants for tests
(global as any).API_ENDPOINT_VALUE = "https://api.test.com";
(global as any).ANNOTATION_ENDPOINT_VALUE = "https://annotations.test.com";

// Reset fetch mock before each test
beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
});

// Setup JSDOM environment
global.document = document;
global.window = window as any;

// Add Obsidian-specific HTMLElement methods
HTMLElement.prototype.empty = function () {
    this.innerHTML = "";
};

HTMLElement.prototype.addClass = function (className: string) {
    this.classList.add(className);
};

HTMLElement.prototype.removeClass = function (className: string) {
    this.classList.remove(className);
};

HTMLElement.prototype.createDiv = function (options?: any) {
    const div = document.createElement("div");
    if (options?.cls) {
        if (Array.isArray(options.cls)) {
            options.cls.forEach((c: string) => div.classList.add(c));
        } else {
            div.classList.add(options.cls);
        }
    }
    if (options?.text) {
        div.textContent = options.text;
    }
    if (options?.attr) {
        Object.entries(options.attr).forEach(([key, value]) => {
            div.setAttribute(key, value as string);
        });
    }
    this.appendChild(div);
    return div;
};

// @ts-ignore
HTMLElement.prototype.createEl = function (tag: string, options?: any) {
    const el = document.createElement(tag);
    if (options?.cls) {
        if (Array.isArray(options.cls)) {
            options.cls.forEach((c: string) => el.classList.add(c));
        } else {
            el.classList.add(options.cls);
        }
    }
    if (options?.text) {
        el.textContent = options.text;
    }
    if (options?.attr) {
        Object.entries(options.attr).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                el.setAttribute(key, value as string);
            }
        });
    }
    if (options?.type) {
        el.setAttribute("type", options.type);
    }
    if (options?.placeholder) {
        el.setAttribute("placeholder", options.placeholder);
    }
    if (options?.value !== undefined) {
        (el as HTMLInputElement).value = options.value;
    }
    this.appendChild(el);
    return el;
};

HTMLElement.prototype.hide = function () {
    this.style.display = "none";
};

HTMLElement.prototype.show = function () {
    this.style.display = "";
};
