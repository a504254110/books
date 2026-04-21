import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';

const require = createRequire(import.meta.url);

const {
  parseBlockConfig,
  deriveChapterMeta,
  buildChapterRows,
} = require('../.obsidian/plugins/books-reading-progress/core.js');

test('parseBlockConfig reads simple key-value pairs', () => {
  const config = parseBlockConfig(`
mode: table
book: books/taleb-antifragile-2012/chapters
show: unread
`);

  assert.deepEqual(config, {
    mode: 'table',
    book: 'books/taleb-antifragile-2012/chapters',
    show: 'unread',
  });
});

test('deriveChapterMeta uses frontmatter chapter number and h1 title', () => {
  const markdown = `---
book: Antifragile
chapter: 14
status: summarized
---

# Chapter 14. When Two Things Are Not the "Same Thing"

Body.
`;

  assert.deepEqual(
    deriveChapterMeta('books/taleb-antifragile-2012/chapters/14-when-two-things-are-not-the-same-thing.md', markdown),
    {
      path: 'books/taleb-antifragile-2012/chapters/14-when-two-things-are-not-the-same-thing.md',
      title: 'Chapter 14. When Two Things Are Not the "Same Thing"',
      sort: 14,
    },
  );
});

test('buildChapterRows sorts chapters and merges local read state', () => {
  const chapters = [
    {
      path: 'books/taleb-antifragile-2012/chapters/02-overcompensation-and-overreaction-everywhere.md',
      title: 'Chapter 2. Overcompensation and Overreaction Everywhere',
      sort: 2,
    },
    {
      path: 'books/taleb-antifragile-2012/chapters/01-between-damocles-and-hydra.md',
      title: 'Chapter 1. Between Damocles and Hydra',
      sort: 1,
    },
  ];

  const rows = buildChapterRows(chapters, {
    'books/taleb-antifragile-2012/chapters/02-overcompensation-and-overreaction-everywhere.md': true,
  });

  assert.deepEqual(rows, [
    {
      path: 'books/taleb-antifragile-2012/chapters/01-between-damocles-and-hydra.md',
      title: 'Chapter 1. Between Damocles and Hydra',
      sort: 1,
      read: false,
    },
    {
      path: 'books/taleb-antifragile-2012/chapters/02-overcompensation-and-overreaction-everywhere.md',
      title: 'Chapter 2. Overcompensation and Overreaction Everywhere',
      sort: 2,
      read: true,
    },
  ]);
});

test('plugin main exports a plugin class for Obsidian to load', () => {
  const pluginPath = require.resolve('../.obsidian/plugins/books-reading-progress/main.js');
  const originalLoad = Module._load;

  try {
    delete require.cache[pluginPath];
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'obsidian') {
        return {
          Plugin: class {},
          MarkdownRenderer: { render: async () => {} },
          MarkdownRenderChild: class {},
          Notice: class {},
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const pluginModule = require(pluginPath);
    assert.equal(typeof pluginModule, 'function');
  } finally {
    Module._load = originalLoad;
    delete require.cache[pluginPath];
  }
});

test('chapter status processor still renders when container is not yet connected', async () => {
  const pluginPath = require.resolve('../.obsidian/plugins/books-reading-progress/main.js');
  const originalLoad = Module._load;

  class FakeElement {
    constructor(tag = 'div') {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.isConnected = false;
      this.className = '';
      this.textContent = '';
    }

    empty() {
      this.children = [];
    }

    createDiv(opts = {}) {
      const el = new FakeElement('div');
      if (opts.cls) el.className = opts.cls;
      this.children.push(el);
      return el;
    }

    createEl(tag, opts = {}) {
      const el = new FakeElement(tag);
      if (opts.cls) el.className = opts.cls;
      if (opts.text) el.textContent = opts.text;
      if (opts.type) el.type = opts.type;
      this.children.push(el);
      return el;
    }

    addEventListener() {}
  }

  class FakePlugin {
    constructor(app) {
      this.app = app;
      this._processor = null;
    }

    async loadData() {
      return {};
    }

    async saveData() {}

    registerMarkdownCodeBlockProcessor(name, fn) {
      if (name === 'books-progress') this._processor = fn;
    }
  }

  class FakeMarkdownRenderChild {
    constructor(containerEl) {
      this.containerEl = containerEl;
    }

    unload() {
      if (typeof this.onunload === 'function') {
        this.onunload();
      }
    }
  }

  try {
    delete require.cache[pluginPath];
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'obsidian') {
        return {
          Plugin: FakePlugin,
          MarkdownRenderer: { render: async () => {} },
          MarkdownRenderChild: FakeMarkdownRenderChild,
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const PluginClass = require(pluginPath);
    const app = {
      vault: {
        getAbstractFileByPath(p) {
          if (p === '_private/reader-state') return null;
          if (p === 'books/taleb-antifragile-2012/chapters/01-between-damocles-and-hydra.md') return { path: p };
          return null;
        },
      },
    };
    const plugin = new PluginClass(app);
    plugin.app = app;
    await plugin.onload();

    const el = new FakeElement();
    const ctx = {
      sourcePath: 'books/taleb-antifragile-2012/chapters/01-between-damocles-and-hydra.md',
      addChild(child) {
        this.child = child;
      },
    };
    await plugin._processor('mode: chapter', el, ctx);

    assert.ok(el.children.length > 0);
    assert.equal(plugin.renderers.size, 1);
    assert.ok(ctx.child);
    ctx.child.unload();
    assert.equal(plugin.renderers.size, 0);
  } finally {
    Module._load = originalLoad;
    delete require.cache[pluginPath];
  }
});

test('table renderer marks rows and buttons with explicit read status', async () => {
  const pluginPath = require.resolve('../.obsidian/plugins/books-reading-progress/main.js');
  const originalLoad = Module._load;

  class FakeElement {
    constructor(tag = 'div') {
      this.tag = tag;
      this.children = [];
      this.dataset = {};
      this.className = '';
      this.textContent = '';
      this.type = undefined;
    }

    empty() {
      this.children = [];
    }

    createDiv(opts = {}) {
      const el = new FakeElement('div');
      if (opts.cls) el.className = opts.cls;
      this.children.push(el);
      return el;
    }

    createEl(tag, opts = {}) {
      const el = new FakeElement(tag);
      if (opts.cls) el.className = opts.cls;
      if (opts.text) el.textContent = opts.text;
      if (opts.type) el.type = opts.type;
      this.children.push(el);
      return el;
    }

    addEventListener() {}
  }

  class FakePlugin {
    constructor(app) {
      this.app = app;
      this._processor = null;
    }

    async loadData() {
      return {
        progress: {
          'books/taleb-antifragile-2012/chapters/01-between-damocles-and-hydra.md': true,
        },
      };
    }

    async saveData() {}

    registerMarkdownCodeBlockProcessor(name, fn) {
      if (name === 'books-progress') this._processor = fn;
    }
  }

  class FakeMarkdownRenderChild {
    constructor(containerEl) {
      this.containerEl = containerEl;
    }
  }

  try {
    delete require.cache[pluginPath];
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'obsidian') {
        return {
          Plugin: FakePlugin,
          MarkdownRenderer: { render: async (_app, markdown, el) => { el.textContent = markdown; } },
          MarkdownRenderChild: FakeMarkdownRenderChild,
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const PluginClass = require(pluginPath);
    const app = {
      vault: {
        getAbstractFileByPath(p) {
          if (p === '_private/reader-state') return null;
          return null;
        },
        getMarkdownFiles() {
          return [
            { path: 'books/taleb-antifragile-2012/chapters/01-between-damocles-and-hydra.md' },
            { path: 'books/taleb-antifragile-2012/chapters/02-overcompensation-and-overreaction-everywhere.md' },
          ];
        },
        async cachedRead(file) {
          if (file.path.endsWith('01-between-damocles-and-hydra.md')) {
            return '---\nchapter: 1\n---\n\n# Chapter 1. Between Damocles and Hydra\n';
          }
          return '---\nchapter: 2\n---\n\n# Chapter 2. Overcompensation and Overreaction Everywhere\n';
        },
      },
    };
    const plugin = new PluginClass(app);
    plugin.app = app;
    await plugin.onload();

    const el = new FakeElement();
    await plugin._processor('mode: table\nbook: books/taleb-antifragile-2012/chapters', el, {
      sourcePath: 'Home.md',
      addChild() {},
    });

    const table = el.children[0];
    const tbody = table.children[1];
    const firstRow = tbody.children[0];
    const secondRow = tbody.children[1];
    const firstButton = firstRow.children[1].children[0];
    const secondButton = secondRow.children[1].children[0];

    assert.equal(firstRow.dataset.status, 'read');
    assert.equal(secondRow.dataset.status, 'unread');
    assert.equal(firstButton.dataset.status, 'read');
    assert.equal(secondButton.dataset.status, 'unread');
  } finally {
    Module._load = originalLoad;
    delete require.cache[pluginPath];
  }
});
