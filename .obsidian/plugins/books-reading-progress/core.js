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

module.exports = {
  parseBlockConfig,
  deriveChapterMeta,
  buildChapterRows,
};
