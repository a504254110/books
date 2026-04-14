const { Plugin, MarkdownRenderer } = require('obsidian');

const DEFAULT_STATE = { progress: {} };

function parseBlockConfig(source) {
  const config = {};
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)$/);
    if (!match) continue;
    config[match[1]] = match[2].trim();
  }
  return config;
}

function deriveChapterMeta(path, markdown) {
  const chapterMatch = markdown.match(/^chapter:\s*(.+)$/m);
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const basename = path.split('/').pop().replace(/\.md$/, '');
  const sortFromNameMatch = basename.match(/^(\d+)/);
  return {
    path,
    title: titleMatch ? titleMatch[1].trim() : basename,
    sort: chapterMatch ? Number(chapterMatch[1]) || 9999 : sortFromNameMatch ? Number(sortFromNameMatch[1]) : 9999,
  };
}

function buildChapterRows(chapters, progressMap) {
  return [...chapters]
    .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title))
    .map((chapter) => ({
      ...chapter,
      read: Boolean(progressMap[chapter.path]),
    }));
}

module.exports = class BooksReadingProgressPlugin extends Plugin {
  async onload() {
    this.state = Object.assign({}, DEFAULT_STATE, await this.loadData());
    if (!this.state.progress) this.state.progress = {};
    this.renderers = new Set();

    await this.migrateLegacyPrivateState();

    this.registerMarkdownCodeBlockProcessor('books-progress', async (source, el, ctx) => {
      const config = parseBlockConfig(source);
      const render = async () => {
        el.empty();
        if (config.mode === 'table') {
          await this.renderTable(el, config);
          return;
        }
        await this.renderChapterStatus(el, ctx.sourcePath, config);
      };
      this.renderers.add(render);
      await render();
    });
  }

  async migrateLegacyPrivateState() {
    if (Object.keys(this.state.progress).length > 0) return;
    const folder = this.app.vault.getAbstractFileByPath('_private/reader-state');
    if (!folder || !folder.children) return;

    let changed = false;
    for (const bookFolder of folder.children) {
      if (!bookFolder.children) continue;
      for (const file of bookFolder.children) {
        if (file.extension !== 'md') continue;
        const content = await this.app.vault.cachedRead(file);
        const pathMatch = content.match(/^chapter_path:\s+(.+)$/m);
        const readMatch = content.match(/^> - \[([ xX])\] Finished reading this chapter$/m);
        if (!pathMatch || !readMatch) continue;
        if (readMatch[1].toLowerCase() === 'x') {
          this.state.progress[pathMatch[1].trim()] = true;
          changed = true;
        }
      }
    }

    if (changed) {
      await this.saveState();
    }
  }

  async saveState() {
    await this.saveData(this.state);
    for (const render of [...this.renderers]) {
      await render();
    }
  }

  isRead(path) {
    return Boolean(this.state.progress[path]);
  }

  async setRead(path, read) {
    if (read) {
      this.state.progress[path] = true;
    } else {
      delete this.state.progress[path];
    }
    await this.saveState();
  }

  async renderChapterStatus(el, sourcePath, config) {
    const path = config.chapter || sourcePath;
    if (!path) {
      el.createEl('p', { text: 'Missing chapter path.', cls: 'books-progress-empty' });
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      el.createEl('p', { text: `Missing chapter file: ${path}`, cls: 'books-progress-empty' });
      return;
    }

    const wrapper = el.createDiv({ cls: 'books-progress-card' });
    wrapper.dataset.read = String(this.isRead(path));

    const label = wrapper.createEl('label', { cls: 'books-progress-toggle' });
    const checkbox = label.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.isRead(path);
    checkbox.addEventListener('change', async () => {
      await this.setRead(path, checkbox.checked);
    });

    const chip = label.createEl('span', {
      cls: `books-status-chip ${checkbox.checked ? 'books-status-chip--read' : 'books-status-chip--unread'}`,
      text: checkbox.checked ? 'Read' : 'Unread',
    });
    chip.dataset.status = checkbox.checked ? 'read' : 'unread';
    const text = label.createEl('span', {
      cls: 'books-progress-label',
      text: 'Finished reading this chapter',
    });

    checkbox.addEventListener('change', () => {
      wrapper.dataset.read = String(checkbox.checked);
      chip.textContent = checkbox.checked ? 'Read' : 'Unread';
      chip.className = `books-status-chip ${checkbox.checked ? 'books-status-chip--read' : 'books-status-chip--unread'}`;
      chip.dataset.status = checkbox.checked ? 'read' : 'unread';
      text.textContent = 'Finished reading this chapter';
    });
  }

  async renderTable(el, config) {
    const folderPath = config.book;
    if (!folderPath) {
      el.createEl('p', { text: 'Missing book folder.', cls: 'books-progress-empty' });
      return;
    }

    const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${folderPath}/`));
    const chapters = [];
    for (const file of files) {
      const markdown = await this.app.vault.cachedRead(file);
      chapters.push(deriveChapterMeta(file.path, markdown));
    }

    const rows = buildChapterRows(chapters, this.state.progress).filter((row) => {
      if (config.show === 'read') return row.read;
      if (config.show === 'unread') return !row.read;
      return true;
    });

    if (!rows.length) {
      el.createEl('p', { text: 'No chapters to show.', cls: 'books-progress-empty' });
      return;
    }

    const table = el.createEl('table', { cls: 'books-progress-table' });
    const thead = table.createEl('thead');
    const headRow = thead.createEl('tr');
    headRow.createEl('th', { text: `Chapter (${rows.length})` });
    headRow.createEl('th', { text: 'Status' });

    const tbody = table.createEl('tbody');
    for (const row of rows) {
      const tr = tbody.createEl('tr');
      tr.dataset.read = String(row.read);
      tr.dataset.status = row.read ? 'read' : 'unread';
      const titleCell = tr.createEl('td');
      await MarkdownRenderer.render(this.app, `[[${row.path}|${row.title}]]`, titleCell, row.path, this);

      const statusCell = tr.createEl('td');
      const button = statusCell.createEl('button', {
        cls: `books-status-chip ${row.read ? 'books-status-chip--read' : 'books-status-chip--unread'}`,
        text: row.read ? 'Read' : 'Unread',
        type: 'button',
      });
      button.dataset.status = row.read ? 'read' : 'unread';
      button.addEventListener('click', async () => {
        await this.setRead(row.path, !this.isRead(row.path));
      });
    }
  }
};
