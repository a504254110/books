    // Defined in index.html's inline bootstrap. Falls back to empty string for
    // legacy callers but in normal page loads it will always be set.
    const APP_VERSION = window.APP_VERSION || "";
    const appVersionStorageKey = "antifragile-html-reader:app-version";

    try {
      const currentUrl = new URL(window.location.href);
      const currentUrlVersion = currentUrl.searchParams.get("v");
      if (localStorage.getItem(appVersionStorageKey) !== APP_VERSION || currentUrlVersion !== APP_VERSION) {
        localStorage.setItem(appVersionStorageKey, APP_VERSION);
        if (currentUrlVersion !== APP_VERSION) {
          currentUrl.searchParams.set("v", APP_VERSION);
          window.location.replace(currentUrl.toString());
        }
      }
    } catch {
      // Some local-file privacy settings block storage. Versioned asset URLs still handle cache busting.
    }

    const chapterMount = document.getElementById("chapterMount");
    if (chapterMount && window.ANTIFRAGILE_CHAPTERS) {
      const chapters = Object.entries(window.ANTIFRAGILE_CHAPTERS)
        .map(([key, chapter]) => ({
          key,
          number: chapter.number || Number(key.replace(/\D/g, "")) || 0,
          html: chapter.html
        }))
        .filter((chapter) => chapter.html)
        .sort((a, b) => a.number - b.number);
      chapterMount.innerHTML = chapters.map((chapter) => chapter.html).join("");
    }

    // Inject a compact prev/next pager into every chapter's .chapter-tools strip,
    // right next to the "Chapter X of N" locator. We do this before the global
    // viewTargetButtons capture below so the new buttons get the standard click handler.
    (function injectCompactChapterPagers() {
      const orderedViews = Array.from(document.querySelectorAll("article.view.chapter, #epilogue"))
        .map((view) => ({
          view,
          id: view.id,
          number: view.id === "epilogue" ? 1000 : Number(view.id.replace("chapter-", "")) || 0,
        }))
        .sort((a, b) => a.number - b.number);
      orderedViews.forEach((item, index) => {
        const tools = item.view.querySelector(".chapter-tools");
        if (!tools || tools.querySelector(".compact-pager")) return;
        const prev = index > 0 ? orderedViews[index - 1] : null;
        const next = index < orderedViews.length - 1 ? orderedViews[index + 1] : null;
        const pager = document.createElement("nav");
        pager.className = "compact-pager";
        pager.setAttribute("aria-label", "Chapter pagination");
        const makeButton = (target, glyph, label) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "compact-pager-btn";
          btn.setAttribute("aria-label", label);
          btn.textContent = glyph;
          if (target) {
            btn.dataset.viewTarget = target;
          } else {
            btn.disabled = true;
          }
          return btn;
        };
        pager.appendChild(makeButton(prev ? prev.id : "", "←", prev ? "Previous chapter" : "No previous chapter"));
        pager.appendChild(makeButton(next ? next.id : "", "→", next ? "Next chapter" : "No next chapter"));
        tools.appendChild(pager);
      });
    })();

    const explainers = window.ANTIFRAGILE_EXPLAINERS || {};
    const translations = window.ANTIFRAGILE_TRANSLATIONS || {};

    const state = {
      currentView: "overview",
      currentConcept: "concept1",
      currentLang: "en",
      contentLang: "en",
      theme: "light",
      sidebarCollapsed: false,
      chaptersExpanded: false,
      currentQuizIndex: 0,
      quizAnswerVisible: false,
      searchOpen: false,
      searchQuery: "",
      searchResults: [],
      searchActiveIndex: 0
    };

    const themeStorageKey = "antifragile-html-reader:theme";
    const languageStorageKey = "antifragile-html-reader:language";
    const sidebarStorageKey = "antifragile-html-reader:sidebar-collapsed";
    const chapterNavStorageKey = "antifragile-html-reader:chapters-expanded";
    const viewStorageKey = "antifragile-html-reader:last-view";
    const quizStorageKey = "antifragile-html-reader:quiz-index";
    const quizData = window.ANTIFRAGILE_QUIZ || [];
    const quizTranslationsZh = window.ANTIFRAGILE_QUIZ_ZH || [];
    const views = Array.from(document.querySelectorAll("[data-view]"));
    const viewTargetButtons = Array.from(document.querySelectorAll("[data-view-target]"));
    const navButtons = Array.from(document.querySelectorAll("[data-nav-item]"));
    const themeButtons = Array.from(document.querySelectorAll("[data-theme-toggle]"));
    const languageButtons = Array.from(document.querySelectorAll("[data-language-toggle]"));
    const sidebarCollapseButton = document.getElementById("sidebarCollapseButton");
    const sidebarExpandButton = document.getElementById("sidebarExpandButton");
    const collapseButtons = Array.from(document.querySelectorAll("[data-collapse-toggle]"));
    const quizPosition = document.getElementById("quizPosition");
    const quizScope = document.getElementById("quizScope");
    const quizProgressBar = document.getElementById("quizProgressBar");
    const quizJump = document.getElementById("quizJump");
    const quizCard = document.getElementById("quizCard");
    const quizRelatedViews = [
      "chapter-1", "chapter-1", "chapter-1", "chapter-1",
      "chapter-1", "chapter-1", "chapter-2", "chapter-2",
      "chapter-6", "chapter-3", "chapter-4", "chapter-5",
      "chapter-5", "chapter-7", "chapter-7", "chapter-7",
      "chapter-8", "chapter-8", "chapter-9", "chapter-9",
      "chapter-10", "chapter-11", "chapter-11", "chapter-12",
      "chapter-12", "chapter-13", "chapter-13", "chapter-17",
      "chapter-18", "chapter-19", "chapter-19", "chapter-20",
      "chapter-20", "chapter-22", "chapter-21", "chapter-23",
      "chapter-23", "chapter-23", "chapter-24", "chapter-25"
    ];
    const sidebar = document.getElementById("sidebar");
    const menuButton = document.getElementById("menuButton");
    const drawer = document.getElementById("drawer");
    const drawerBackdrop = document.getElementById("drawerBackdrop");
    const drawerContent = document.getElementById("drawerContent");
    const drawerTitle = document.getElementById("drawerTitle");
    const drawerSubtitle = document.getElementById("drawerSubtitle");
    const searchTrigger = document.getElementById("searchTrigger");
    const searchPanel = document.getElementById("searchPanel");
    const searchBackdrop = document.getElementById("searchBackdrop");
    const searchInput = document.getElementById("searchInput");
    const searchResults = document.getElementById("searchResults");
    const searchHelp = document.getElementById("searchHelp");
    const searchTriggerCopy = document.querySelector("[data-search-trigger-copy]");
    const searchShortcutLabels = Array.from(document.querySelectorAll("[data-search-shortcut]"));
    let searchIndex = [];

    function getPlatformSearchShortcutLabel() {
      const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
      return /mac|iphone|ipad|ipod/i.test(platform) ? "Command + K" : "Control + K";
    }

    function applyPlatformShortcutLabels() {
      const label = getPlatformSearchShortcutLabel();
      searchShortcutLabels.forEach((shortcut) => {
        shortcut.textContent = label;
      });
    }

    function loadSidebarCollapsedState() {
      try {
        state.sidebarCollapsed = localStorage.getItem(sidebarStorageKey) === "true";
      } catch {
        state.sidebarCollapsed = false;
      }
      applySidebarCollapsedState();
    }

    function setSidebarCollapsed(collapsed, persist = true) {
      state.sidebarCollapsed = collapsed;
      if (persist) {
        try {
          localStorage.setItem(sidebarStorageKey, String(collapsed));
        } catch {
          // Local-file privacy settings can block storage; the current sidebar state still updates.
        }
      }
      applySidebarCollapsedState();
    }

    function applySidebarCollapsedState() {
      document.documentElement.dataset.sidebarCollapsed = String(state.sidebarCollapsed);
      if (sidebarCollapseButton) {
        sidebarCollapseButton.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
        sidebarCollapseButton.setAttribute("aria-label", state.sidebarCollapsed ? "Show sidebar" : "Hide sidebar");
        sidebarCollapseButton.setAttribute("title", state.sidebarCollapsed ? "Show sidebar" : "Hide sidebar");
      }
      if (sidebarExpandButton) {
        sidebarExpandButton.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
        sidebarExpandButton.setAttribute("aria-label", state.sidebarCollapsed ? "Show sidebar" : "Sidebar is visible");
        sidebarExpandButton.setAttribute("title", state.sidebarCollapsed ? "Show sidebar" : "Sidebar is visible");
      }
      if (!state.sidebarCollapsed && state.chaptersExpanded) syncActiveNavPosition(state.currentView);
    }

    function loadTheme() {
      try {
        const saved = localStorage.getItem(themeStorageKey);
        state.theme = saved === "dark" ? "dark" : "light";
      } catch {
        state.theme = "light";
      }
      applyTheme();
    }

    function toggleTheme() {
      state.theme = state.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(themeStorageKey, state.theme);
      } catch {
        // Some local-file privacy settings block storage; the in-page theme still updates.
      }
      applyTheme();
    }

    function applyTheme() {
      document.documentElement.dataset.theme = state.theme;
      const isDark = state.theme === "dark";
      const label = isDark ? "Switch to light theme" : "Switch to dark theme";
      themeButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(isDark));
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
      });
    }

    function loadLanguage() {
      try {
        const saved = localStorage.getItem(languageStorageKey);
        state.contentLang = saved === "zh" ? "zh" : "en";
      } catch {
        state.contentLang = "en";
      }
      state.currentLang = state.contentLang;
      applyLanguage();
    }

    function toggleLanguage() {
      state.contentLang = state.contentLang === "zh" ? "en" : "zh";
      state.currentLang = state.contentLang;
      try {
        localStorage.setItem(languageStorageKey, state.contentLang);
      } catch {
        // Local-file privacy settings can block storage; the current page state still updates.
      }
      applyLanguage();
      if (!drawer.hidden) renderDrawer();
    }

    function applyLanguage() {
      document.documentElement.dataset.contentLang = state.contentLang;
      const isChinese = state.contentLang === "zh";
      const label = isChinese ? "Switch content language to English" : "Switch content language to Chinese";
      languageButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(isChinese));
        button.setAttribute("aria-label", label);
        button.setAttribute("title", label);
        const languageLabel = button.querySelector("[data-language-label]");
        if (languageLabel) languageLabel.textContent = isChinese ? "中" : "EN";
      });
      applyChapterTranslations();
      applyGeneratedChineseChapterLayer();
      renderQuiz();
      applySearchLanguage();
      if (state.searchOpen) renderSearchResults();
    }

    function applySearchLanguage() {
      const isChinese = state.contentLang === "zh";
      const placeholder = isChinese ? "搜索概念、答案、解释" : "Search concepts, answers, explanations";
      if (searchTriggerCopy) searchTriggerCopy.textContent = placeholder;
      if (searchInput) searchInput.placeholder = placeholder;
      if (searchHelp) {
        searchHelp.textContent = isChinese
          ? "搜索范围包括概念卡、quiz 答案，以及英文或中文 deep dive 解释。"
          : "Search across concept cards, quiz answers, and English or Chinese explainers.";
      }
    }

    function buildSearchIndex() {
      const entries = [];
      document.querySelectorAll(".concept[data-concept]").forEach((concept) => {
        const view = concept.closest(".view");
        const heading = concept.querySelector("h3");
        const conceptKey = concept.dataset.concept;
        const explainer = explainers[conceptKey];
        const title = (heading ? heading.textContent.trim() : "") || (explainer && explainer.title) || "Concept";
        const cardText = Array.from(concept.querySelectorAll("h3, p"))
          .map((node) => stripHtml(node.dataset.originalHtml || node.innerHTML || node.textContent))
          .join(" ");
        const enSections = getExplainerSections(explainer, "en");
        const zhSections = getExplainerSections(explainer, "zh");
        const explainerText = [...enSections, ...zhSections]
          .map(([sectionTitle, body]) => `${sectionTitle} ${body}`)
          .join(" ");
        entries.push(createSearchEntry({
          type: "concept",
          title,
          text: `${title} ${cardText} ${(explainer && explainer.title) || ""} ${explainerText}`,
          viewId: (view && view.id) || "overview",
          targetId: concept.id,
          conceptKey
        }));

        // Explainer entries are intentionally omitted from the search index now
        // that the deep-dive UI is hidden. The explainer data is retained in the
        // chapter files but is no longer surfaced to users via search either.
        void enSections; void zhSections;
      });

      quizData.forEach((item, index) => {
        const zh = quizTranslationsZh[index] || {};
        entries.push(createSearchEntry({
          type: "quiz",
          title: item.question,
          text: [
            item.scope,
            item.question,
            item.expected,
            item.signal,
            zh.scope,
            zh.question,
            zh.expected,
            zh.signal
          ].filter(Boolean).join(" "),
          viewId: "quiz",
          quizIndex: index
        }));
      });

      searchIndex = entries;
    }

    function safelyBuildSearchIndex() {
      try {
        buildSearchIndex();
      } catch (error) {
        searchIndex = [];
        if (searchHelp) {
          searchHelp.textContent = state.contentLang === "zh"
            ? "搜索索引暂时不可用，但阅读、菜单、语言和主题控制仍可使用。"
            : "Search index is unavailable, but reading, menu, language, and theme controls still work.";
        }
      }
    }

    function createSearchEntry(entry) {
      return {
        ...entry,
        normalizedTitle: normalizeSearch(entry.title),
        normalizedText: normalizeSearch(`${entry.title} ${entry.text}`)
      };
    }

    function getExplainerSections(explainer, lang) {
      const data = explainer ? explainer[lang] : null;
      if (!data) return [];
      return Array.isArray(data) ? data : data.sections || [];
    }

    function stripHtml(value = "") {
      const element = document.createElement("div");
      element.innerHTML = value;
      return element.textContent || element.innerText || "";
    }

    function normalizeSearch(value = "") {
      return String(value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    function openSearch() {
      if (!searchPanel || !searchBackdrop || !searchInput) return;
      state.searchOpen = true;
      searchPanel.hidden = false;
      searchBackdrop.hidden = false;
      renderSearchResults();
      requestAnimationFrame(() => {
        searchPanel.classList.add("open");
        searchBackdrop.classList.add("open");
        searchInput.focus();
        searchInput.select();
      });
    }

    function closeSearch() {
      if (!searchPanel || !searchBackdrop) return;
      state.searchOpen = false;
      searchPanel.classList.remove("open");
      searchBackdrop.classList.remove("open");
      setTimeout(() => {
        searchPanel.hidden = true;
        searchBackdrop.hidden = true;
      }, 160);
      if (searchTrigger) searchTrigger.focus();
    }

    function setSearchQuery(query) {
      state.searchQuery = query;
      state.searchActiveIndex = 0;
      renderSearchResults();
    }

    function renderSearchResults() {
      if (!searchResults) return;
      const query = state.searchQuery.trim();
      if (!query) {
        state.searchResults = [];
        searchResults.innerHTML = renderSearchEmpty(
          state.contentLang === "zh" ? "输入关键词开始搜索" : "Start with a keyword",
          state.contentLang === "zh"
            ? "可以搜索 barbell、iatrogenics、Thales、脆弱性、答案或中文解释。"
            : "Try barbell, iatrogenics, Thales, fragility, answers, or Chinese explanations."
        );
        return;
      }
      const results = getSearchResults(query);
      state.searchResults = results;
      state.searchActiveIndex = Math.min(state.searchActiveIndex, Math.max(results.length - 1, 0));
      if (!results.length) {
        searchResults.innerHTML = renderSearchEmpty(
          state.contentLang === "zh" ? "没有找到结果" : "No results found",
          state.contentLang === "zh"
            ? "换一个更短的关键词，或直接搜书中的英文术语。"
            : "Try a shorter keyword or one of Taleb's technical terms."
        );
        return;
      }
      searchResults.innerHTML = results.map((entry, index) => renderSearchResult(entry, index, query)).join("");
    }

    function getSearchResults(query) {
      const normalizedQuery = normalizeSearch(query);
      const tokens = normalizedQuery.split(" ").filter(Boolean);
      return searchIndex
        .map((entry) => ({ entry, score: scoreSearchEntry(entry, normalizedQuery, tokens) }))
        .filter((result) => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((result) => result.entry);
    }

    function scoreSearchEntry(entry, query, tokens) {
      if (!tokens.every((token) => entry.normalizedText.includes(token))) return 0;
      let score = 0;
      if (entry.normalizedTitle.includes(query)) score += 36;
      if (entry.normalizedText.includes(query)) score += 16;
      tokens.forEach((token) => {
        if (entry.normalizedTitle.includes(token)) score += 8;
        if (entry.normalizedText.includes(token)) score += 2;
      });
      if (entry.type === "concept") score += 6;
      if (entry.type === "quiz") score += 4;
      return score;
    }

    function renderSearchResult(entry, index, query) {
      const display = getSearchDisplay(entry);
      const active = index === state.searchActiveIndex;
      return `
        <button class="search-result${active ? " active" : ""}" type="button" role="option" aria-selected="${String(active)}" data-search-index="${index}">
          <span class="search-result-meta">
            <span class="search-result-type">${escapeHtml(display.typeLabel)}</span>
            <span>${escapeHtml(display.location)}</span>
          </span>
          <span class="search-result-title">${highlightSearchText(display.title, query)}</span>
          <span class="search-result-snippet">${highlightSearchText(display.snippet, query)}</span>
        </button>
      `;
    }

    function getSearchDisplay(entry) {
      const isChinese = state.contentLang === "zh";
      if (entry.type === "quiz") {
        const item = getLocalizedQuizItem(quizData[entry.quizIndex], entry.quizIndex);
        return {
          typeLabel: isChinese ? "答案" : "Answer",
          location: isChinese ? `Quiz · 第 ${entry.quizIndex + 1} 题` : `Quiz · Question ${entry.quizIndex + 1}`,
          title: item.question,
          snippet: `${isChinese ? "参考答案：" : "Expected answer:"} ${item.expected}`
        };
      }
      if (entry.type === "explainer") {
        const explainer = explainers[entry.conceptKey];
        const sections = getExplainerSections(explainer, entry.lang);
        const section = sections[entry.sectionIndex] || [];
        return {
          typeLabel: entry.lang === "zh" ? "中文解释" : "Explainer",
          location: `${localizeSearchViewLabel(entry.viewId)} · ${entry.lang.toUpperCase()}`,
          title: section[0] || (explainer && explainer.title) || entry.title,
          snippet: firstParagraph(section[1] || entry.text)
        };
      }
      const concept = document.getElementById(entry.targetId);
      const conceptHeading = concept ? concept.querySelector("h3") : null;
      const visibleParagraph = Array.from(concept ? concept.querySelectorAll("p:not(.grounding)") : [])
        .find((paragraph) => !paragraph.hidden);
      const title = (conceptHeading ? conceptHeading.textContent.trim() : "") || entry.title;
      const firstBody = visibleParagraph ? visibleParagraph.textContent.trim() : "";
      return {
        typeLabel: isChinese ? "概念卡" : "Concept card",
        location: localizeSearchViewLabel(entry.viewId),
        title,
        snippet: firstBody || entry.text
      };
    }

    function localizeSearchViewLabel(viewId) {
      if (state.contentLang !== "zh") return getViewLabel(viewId);
      if (viewId === "overview") return "总览";
      if (viewId === "quiz") return "全书测验";
      if (viewId === "epilogue") return "尾声";
      const chapterMatch = viewId.match(/^chapter-(\d+)$/);
      const chapter = chapterMatch ? chapterMatch[1] : "";
      return chapter ? `第 ${Number(chapter)} 章` : getViewLabel(viewId);
    }

    function renderSearchEmpty(title, body) {
      return `<div class="search-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></div>`;
    }

    function highlightSearchText(value, query) {
      const text = String(value || "");
      const normalizedQuery = query.trim();
      if (!normalizedQuery) return escapeHtml(text);
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean).slice(0, 4);
      if (!tokens.length) return escapeHtml(text);
      const pattern = tokens.map(escapeRegExp).join("|");
      return escapeHtml(text).replace(new RegExp(`(${pattern})`, "gi"), "<mark>$1</mark>");
    }

    function escapeRegExp(value) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function activateSearchResult(index) {
      const entry = state.searchResults[index];
      if (!entry) return;
      closeSearch();
      if (entry.type === "quiz") {
        setView("quiz");
        setQuizIndex(entry.quizIndex);
        state.quizAnswerVisible = true;
        renderQuiz();
        return;
      }
      if (entry.viewId && isChapterView(entry.viewId)) setChaptersExpanded(true);
      if (entry.viewId) setView(entry.viewId);
      requestAnimationFrame(() => {
        const target = document.getElementById(entry.targetId);
        if (target) target.scrollIntoView({ behavior: getNavScrollBehavior(), block: "start" });
        // Explainer entries are no longer added to the search index, but this
        // guard remains in case stale entries arrive from cached state.
      });
    }

    function moveSearchSelection(delta) {
      if (!state.searchResults.length) return;
      state.searchActiveIndex = (state.searchActiveIndex + delta + state.searchResults.length) % state.searchResults.length;
      renderSearchResults();
      const activeResult = searchResults ? searchResults.querySelector(`[data-search-index="${state.searchActiveIndex}"]`) : null;
      if (activeResult) activeResult.scrollIntoView({ block: "nearest" });
    }

    function applyChapterTranslations() {
      Object.entries(translations).forEach(([viewId, viewTranslations]) => {
        const view = document.getElementById(viewId);
        if (!view) return;
        view.classList.toggle("zh-content", state.contentLang === "zh" && Boolean(viewTranslations.zh));
        const entries = viewTranslations[state.contentLang] || [];
        const translatedSelectors = new Set(entries.map((entry) => entry.selector));
        const fallbackEntries = Object.keys(viewTranslations).reduce((items, key) => items.concat(viewTranslations[key]), []);
        fallbackEntries.forEach((entry) => {
          const target = document.querySelector(entry.selector);
          if (!target) return;
          if (!target.dataset.originalHtml) target.dataset.originalHtml = target.innerHTML;
          target.innerHTML = translatedSelectors.has(entry.selector)
            ? entries.find((candidate) => candidate.selector === entry.selector).html
            : target.dataset.originalHtml;
        });
      });
    }

    function applyGeneratedChineseChapterLayer() {
      const isChinese = state.contentLang === "zh";
      document.querySelectorAll(".view.chapter").forEach((view) => {
        const hasExplicitTranslations = Boolean(translations[view.id] && translations[view.id].zh);
        if (hasExplicitTranslations) return;
        view.classList.toggle("zh-content", isChinese);
        applyGeneratedChineseScaffold(view, isChinese);
        applyGeneratedChineseConcepts(view, isChinese);
      });
      document.querySelectorAll("[data-open-deep-auto='true']").forEach((button) => {
        button.textContent = isChinese ? "深度解释" : "Deep dive";
      });
    }

    function applyGeneratedChineseScaffold(view, isChinese) {
      const headingTranslations = {
        "Chapter in one minute": "一分钟读懂本章",
        "Core concepts": "核心概念",
        "Review appendix": "复盘附录",
        "What you should be able to say out loud": "你应该能够直接说出来的内容",
        "Key distinctions": "关键区分",
        "Common confusions in this chapter": "本章常见误解",
        "Points to debate": "可以讨论的争议点",
        "Why this chapter matters in the whole book": "本章在整本书中的作用",
        "Navigate": "导航"
      };
      view.querySelectorAll("h2").forEach((heading) => {
        if (!heading.dataset.originalText) heading.dataset.originalText = heading.textContent.trim();
        const original = heading.dataset.originalText;
        heading.textContent = isChinese && headingTranslations[original] ? headingTranslations[original] : original;
      });
      view.querySelectorAll(".review-appendix-header .section-label").forEach((label) => {
        if (!label.dataset.originalText) label.dataset.originalText = label.textContent.trim();
        label.textContent = isChinese ? "读后复盘" : label.dataset.originalText;
      });
      view.querySelectorAll(".review-appendix-header p").forEach((paragraph) => {
        if (!paragraph.dataset.originalHtml) paragraph.dataset.originalHtml = paragraph.innerHTML;
        paragraph.innerHTML = isChinese
          ? "核心概念读完后，再用这一部分复盘：它帮助你整理讨论时能说出口的判断、关键区分、常见误解、可争论的问题，以及这一章在整本书里的位置。"
          : paragraph.dataset.originalHtml;
      });
      view.querySelectorAll(".chapter-nav-kicker").forEach((kicker) => {
        if (!kicker.dataset.originalText) kicker.dataset.originalText = kicker.textContent.trim();
        const original = kicker.dataset.originalText;
        const translated = { Previous: "上一章", Home: "首页", Next: "下一章" }[original];
        kicker.textContent = isChinese && translated ? translated : original;
      });
      view.querySelectorAll(".chapter-nav-card").forEach((card) => {
        const title = card.querySelector(".chapter-nav-title");
        if (!title) return;
        if (!title.dataset.originalHtml) title.dataset.originalHtml = title.innerHTML;
        if (!isChinese) {
          title.innerHTML = title.dataset.originalHtml;
          return;
        }
        if (title.dataset.originalHtml === "Back to overview") title.textContent = "回到总览";
        if (title.dataset.originalHtml === "No next chapter") title.textContent = "没有下一章";
        if (title.dataset.originalHtml === "No previous chapter") title.textContent = "没有上一章";
      });
      applyGeneratedChineseReadingLists(view, isChinese);
    }

    function applyGeneratedChineseConcepts(view, isChinese) {
      view.querySelectorAll(".concept[data-concept]").forEach((concept) => {
        const explainer = explainers[concept.dataset.concept];
        if (!explainer || !explainer.zh) return;
        const sections = Array.isArray(explainer.zh) ? explainer.zh : explainer.zh.sections;
        if (!sections || !sections.length) return;
        // `bodyZh` (when present) is the 1:1 paragraph translation of the chapter
        // body's <p> elements (Claim / Example / Why / Whole-book / Possible confusion).
        // `zh` keeps the curated 3-section deep-dive layout for the drawer.
        const bodySections = Array.isArray(explainer.bodyZh) && explainer.bodyZh.length ? explainer.bodyZh : sections;

        const heading = concept.querySelector("h3");
        if (heading) {
          if (!heading.dataset.originalText) heading.dataset.originalText = heading.textContent.trim();
          if (isChinese) {
            const conceptNumberMatch = heading.dataset.originalText.match(/^Concept\s+(\d+)/);
            const conceptNumber = conceptNumberMatch ? conceptNumberMatch[1] : "";
            const firstSectionText = sections[0] ? sections[0][1] : "";
            const title = explainer.titleZh || shortenText(firstParagraph(firstSectionText || "概念解释"), 54);
            heading.textContent = conceptNumber ? `概念 ${conceptNumber}：${title}` : title;
          } else {
            heading.textContent = heading.dataset.originalText;
          }
        }

        const paragraphs = Array.from(concept.children).filter((child) => child.tagName === "P" && !child.classList.contains("grounding"));
        paragraphs.forEach((paragraph, index) => {
          if (!paragraph.dataset.originalHtml) paragraph.dataset.originalHtml = paragraph.innerHTML;
          if (!isChinese) {
            paragraph.hidden = false;
            paragraph.innerHTML = paragraph.dataset.originalHtml;
            return;
          }
          const section = bodySections[index];
          if (!section) {
            paragraph.hidden = true;
            return;
          }
          paragraph.hidden = false;
          const [label, body] = section;
          paragraph.innerHTML = `<strong>${escapeHtml(label)}：</strong> ${formatTextAsInlineHtml(body)}`;
        });

        concept.querySelectorAll(".grounding").forEach((grounding) => {
          if (!grounding.dataset.originalHtml) grounding.dataset.originalHtml = grounding.innerHTML;
          grounding.innerHTML = isChinese
            ? grounding.dataset.originalHtml.replace(/^Grounding:/, "出处：").replace(/chapter map/g, "章节地图")
            : grounding.dataset.originalHtml;
        });
      });
    }

    function applyGeneratedChineseReadingLists(view, isChinese) {
      const conceptSections = getChineseConceptSections(view);
      if (!conceptSections.length) return;
      // Per-chapter overrides (e.g. oneMinuteZh) live on the chapter data object,
      // looked up by mapping the view's id back to the chapter key.
      const chapterKey = (view.id || "").replace(/-/g, "");
      const chapterData = (window.ANTIFRAGILE_CHAPTERS || {})[chapterKey] || {};
      const coreIdeas = conceptSections.map((sections) => sections[0] && sections[0][1]).filter(Boolean);
      const details = conceptSections.map((sections) => firstParagraph((sections[1] && sections[1][1]) || "")).filter(Boolean);
      const examples = conceptSections.map((sections) => firstParagraph((sections[2] && sections[2][1]) || "")).filter(Boolean);
      const oneMinuteZh = Array.isArray(chapterData.oneMinuteZh) && chapterData.oneMinuteZh.length
        ? chapterData.oneMinuteZh
        : coreIdeas;
      applyListTranslation(view.querySelectorAll(".abstract li"), oneMinuteZh, isChinese, true);
      applyListTranslation(view.querySelectorAll(".insight-section--say .insight-list li"), coreIdeas, isChinese);
      applyListTranslation(view.querySelectorAll(".insight-section--distinctions .insight-list li"), details, isChinese);
      applyListTranslation(view.querySelectorAll(".insight-section--confusions .insight-list li"), details.slice(0, 2), isChinese);
      applyListTranslation(view.querySelectorAll(".insight-section--debate .insight-list li"), examples.map((text) => `可以讨论这个例子是否足以支撑概念：${text}`), isChinese);
      applyListTranslation(view.querySelectorAll(".insight-section--whole .insight-list li"), details, isChinese);
    }

    function getChineseConceptSections(view) {
      return Array.from(view.querySelectorAll(".concept[data-concept]"))
        .map((concept) => {
          const explainer = explainers[concept.dataset.concept];
          const sections = explainer && explainer.zh;
          return Array.isArray(sections) ? sections : (sections && sections.sections);
        })
        .filter((sections) => sections && sections.length);
    }

    function applyListTranslation(items, values, isChinese, isAbstract = false) {
      Array.from(items).forEach((item, index) => {
        if (!item.dataset.originalHtml) item.dataset.originalHtml = item.innerHTML;
        if (!isChinese) {
          item.hidden = false;
          item.innerHTML = item.dataset.originalHtml;
          return;
        }
        const value = values[index];
        if (!value) {
          item.hidden = true;
          return;
        }
        item.hidden = false;
        if (isAbstract) {
          item.innerHTML = `<span class="abstract-number">${String(index + 1).padStart(2, "0")}</span><span>${formatTextAsInlineHtml(value)}</span>`;
          return;
        }
        item.innerHTML = formatTextAsInlineHtml(value);
      });
    }

    function firstParagraph(value = "") {
      return value.split("\n\n")[0] || value;
    }

    function shortenText(value, maxLength) {
      if (value.length <= maxLength) return value;
      return `${value.slice(0, maxLength).trim()}...`;
    }

    function formatTextAsInlineHtml(value) {
      const parts = String(value == null ? "" : value).split("\n\n").map((paragraph) => escapeHtml(paragraph));
      if (parts.length <= 1) return parts[0] || "";
      return parts[0] + parts.slice(1).map((paragraph) => `<span class="zh-paragraph-break">${paragraph}</span>`).join("");
    }

    function loadChapterNavState() {
      try {
        const saved = localStorage.getItem(chapterNavStorageKey);
        state.chaptersExpanded = saved === "true";
      } catch {
        state.chaptersExpanded = false;
      }
      applyChapterNavState();
    }

    function setChaptersExpanded(expanded, persist = true) {
      state.chaptersExpanded = expanded;
      if (persist) {
        try {
          localStorage.setItem(chapterNavStorageKey, String(expanded));
        } catch {
          // Local-file privacy settings can block storage; the current page state still updates.
        }
      }
      applyChapterNavState();
    }

    function applyChapterNavState() {
      collapseButtons.forEach((button) => {
        const target = document.getElementById(button.dataset.collapseToggle);
        if (!target) return;
        button.setAttribute("aria-expanded", String(state.chaptersExpanded));
        button.setAttribute("aria-label", state.chaptersExpanded ? "Collapse chapters" : "Expand chapters");
        target.setAttribute("aria-hidden", String(!state.chaptersExpanded));
        const group = button.closest(".nav-group");
        if (group) group.classList.toggle("collapsed", !state.chaptersExpanded);
      });
      if (state.chaptersExpanded) syncActiveNavPosition(state.currentView);
    }

    function loadSavedView() {
      let savedView = "overview";
      try {
        savedView = localStorage.getItem(viewStorageKey) || "overview";
      } catch {
        savedView = "overview";
      }
      setView(isKnownView(savedView) ? savedView : "overview", false);
    }

    function isKnownView(viewId) {
      return views.some((view) => view.id === viewId);
    }

    function isChapterView(viewId) {
      return /^chapter-\d+$/.test(viewId) || viewId === "epilogue";
    }

    function getViewLabel(viewId) {
      const navButton = navButtons.find((button) => button.dataset.viewTarget === viewId);
      if (navButton) return navButton.textContent.trim().replace(/\s+/g, " ");
      return viewId === "overview" ? "Overview" : "Related chapter";
    }

    function getNavScrollBehavior() {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    }

    function centerActiveNavInList(viewId) {
      if (!isChapterView(viewId)) return;
      const activeButton = navButtons.find((button) => button.dataset.viewTarget === viewId);
      const navList = activeButton ? activeButton.closest(".nav-list") : null;
      if (!activeButton || !navList || navList.getAttribute("aria-hidden") === "true") return;
      if (navList.clientHeight <= 0) return;
      const listRect = navList.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      const buttonCenter = buttonRect.top - listRect.top + navList.scrollTop + buttonRect.height / 2;
      const centeredTop = buttonCenter - navList.clientHeight / 2;
      const maxScroll = Math.max(0, navList.scrollHeight - navList.clientHeight);
      const targetTop = Math.max(0, Math.min(centeredTop, maxScroll));
      if (Math.abs(navList.scrollTop - targetTop) < 1) return;
      navList.scrollTo({ top: targetTop, behavior: getNavScrollBehavior() });
    }

    function syncActiveNavPosition(viewId) {
      if (!isChapterView(viewId)) return;
      requestAnimationFrame(() => centerActiveNavInList(state.currentView));
      setTimeout(() => centerActiveNavInList(state.currentView), 260);
    }

    function prepareLanguageAwareDeepDives() {
      document.querySelectorAll(".chapter .deep-row").forEach((row) => {
        if (row.querySelector("[data-open-deep-auto='true']")) return;
        const deepButtons = Array.from(row.querySelectorAll("[data-open-deep]"));
        const concept = deepButtons[0] ? deepButtons[0].dataset.openDeep : "";
        if (!concept) return;
        const label = row.querySelector("span");
        if (label) label.remove();
        deepButtons.forEach((button) => button.remove());
        const button = document.createElement("button");
        button.className = "deep-button";
        button.type = "button";
        button.dataset.openDeep = concept;
        button.dataset.openDeepAuto = "true";
        button.textContent = "Deep dive";
        row.appendChild(button);
      });
    }

    function setView(viewId, persist = true) {
      if (!isKnownView(viewId)) return;
      state.currentView = viewId;
      views.forEach((view) => view.classList.toggle("active", view.id === viewId));
      navButtons.forEach((button) => {
        if (button.dataset.viewTarget) {
          button.classList.toggle("active", button.dataset.viewTarget === viewId);
        }
      });
      syncActiveNavPosition(viewId);
      if (persist) {
        try {
          localStorage.setItem(viewStorageKey, viewId);
        } catch {
          // Local-file privacy settings can block storage; navigation still works.
        }
      }
      if (window.matchMedia("(max-width: 760px)").matches) {
        sidebar.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      }
      window.scrollTo(0, 0);
    }

    function scrollToTarget(targetId) {
      const target = document.getElementById(targetId);
      if (!target) return;
      if (state.currentView !== "chapter-1") setView("chapter-1");
      requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    }

    function renderDrawer() {
      const explainer = explainers[state.currentConcept];
      if (!explainer) return;
      const langData = explainer[state.currentLang];
      if (!langData) return;
      const sections = Array.isArray(langData) ? langData : langData.sections;
      if (!sections) return;
      drawerTitle.textContent = state.currentLang === "zh" ? (explainer.titleZh || "概念解释") : explainer.title;
      const chapterLabel = explainer.chapterLabel || "Chapter 1";
      const localizedChapterLabel = state.currentLang === "zh" ? localizeChapterLabel(chapterLabel) : chapterLabel;
      drawerSubtitle.textContent = state.currentLang === "zh" ? `中文解释 · ${localizedChapterLabel}` : `English explainer · ${chapterLabel}`;
      drawerContent.className = state.currentLang === "zh" ? "drawer-content zh" : "drawer-content";
      drawerContent.innerHTML = sections.map(([heading, body]) => {
        const paragraphs = body.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
        return `<section><h3>${escapeHtml(heading)}</h3>${paragraphs}</section>`;
      }).join("");

      document.querySelectorAll("[data-drawer-lang]").forEach((tab) => {
        const active = tab.dataset.drawerLang === state.currentLang;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
    }

    function localizeChapterLabel(label) {
      if (label === "Epilogue") return "尾声";
      return label.replace(/^Chapter\s+(\d+)$/, "第 $1 章");
    }

    function openDrawer(concept, lang) {
      state.currentConcept = concept;
      state.currentLang = lang || state.contentLang;
      renderDrawer();
      drawer.hidden = false;
      drawerBackdrop.hidden = false;
      requestAnimationFrame(() => {
        drawer.classList.add("open");
        drawerBackdrop.classList.add("open");
        document.getElementById("closeDrawer").focus();
      });
    }

    function closeDrawer() {
      drawer.classList.remove("open");
      drawerBackdrop.classList.remove("open");
      setTimeout(() => {
        drawer.hidden = true;
        drawerBackdrop.hidden = true;
      }, 220);
    }

    function loadQuizState() {
      if (!quizData.length) return;
      try {
        const savedIndex = Number(localStorage.getItem(quizStorageKey));
        if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < quizData.length) {
          state.currentQuizIndex = savedIndex;
        }
      } catch {
        state.currentQuizIndex = 0;
      }
      renderQuiz();
    }

    function setQuizIndex(index) {
      if (!quizData.length) return;
      const nextIndex = Math.max(0, Math.min(index, quizData.length - 1));
      state.currentQuizIndex = nextIndex;
      state.quizAnswerVisible = false;
      try {
        localStorage.setItem(quizStorageKey, String(nextIndex));
      } catch {
        // The current quiz state still updates if storage is unavailable.
      }
      renderQuiz();
    }

    function toggleQuizAnswer() {
      state.quizAnswerVisible = !state.quizAnswerVisible;
      renderQuiz();
    }

    function renderQuiz() {
      if (!quizCard || !quizData.length) return;
      const item = quizData[state.currentQuizIndex];
      const localizedItem = getLocalizedQuizItem(item, state.currentQuizIndex);
      const questionNumber = state.currentQuizIndex + 1;
      const paddedNumber = String(questionNumber).padStart(2, "0");
      const relatedView = item.relatedView || quizRelatedViews[state.currentQuizIndex] || "overview";
      const relatedLabel = item.relatedLabel || getViewLabel(relatedView);
      const localizedRelatedLabel = localizedItem.relatedLabel || relatedLabel;
      const relatedPrefix = state.contentLang === "zh"
        ? (isChapterView(relatedView) ? "相关章节" : "相关阅读")
        : (isChapterView(relatedView) ? "Related chapter" : "Related reading");
      quizPosition.textContent = state.contentLang === "zh"
        ? `第 ${questionNumber} 题 / 共 ${quizData.length} 题`
        : `Question ${questionNumber} / ${quizData.length}`;
      quizScope.textContent = localizedItem.scope;
      quizProgressBar.style.width = `${(questionNumber / quizData.length) * 100}%`;
      quizJump.innerHTML = quizData.map((quizItem, index) => {
        const active = index === state.currentQuizIndex;
        const jumpLabel = state.contentLang === "zh" ? `跳到第 ${index + 1} 题` : `Jump to question ${index + 1}`;
        return `<button class="quiz-jump-button${active ? " active" : ""}" type="button" data-quiz-action="jump" data-quiz-index="${index}" aria-label="${escapeHtml(jumpLabel)}" aria-current="${active ? "true" : "false"}">${String(index + 1).padStart(2, "0")}</button>`;
      }).join("");
      const prevLabel = state.contentLang === "zh" ? "上一题" : "Previous";
      const nextLabel = state.contentLang === "zh" ? "下一题" : "Next";
      const revealLabel = state.contentLang === "zh" ? "显示答案" : "Reveal answer";
      const hideLabel = state.contentLang === "zh" ? "隐藏答案" : "Hide answer";
      const expectedLabel = state.contentLang === "zh" ? "参考答案：" : "Expected answer.";
      const signalLabel = state.contentLang === "zh" ? "判断信号：" : "Book signal.";
      quizCard.innerHTML = `
        <div class="quiz-card-head">
          <span class="quiz-number">${paddedNumber}</span>
          <span class="quiz-scope">${escapeHtml(localizedItem.scope)}</span>
          <button class="quiz-related-button" type="button" data-quiz-action="go-related" data-related-view="${escapeHtml(relatedView)}">${escapeHtml(relatedPrefix)}: ${escapeHtml(localizedRelatedLabel)}</button>
        </div>
        <h3 class="quiz-question">${escapeHtml(localizedItem.question)}</h3>
        <div class="quiz-actions">
          <button class="quiz-nav-button" type="button" data-quiz-action="prev"${state.currentQuizIndex === 0 ? " disabled" : ""}>${prevLabel}</button>
          <button class="quiz-reveal-button" type="button" data-quiz-action="toggle-answer" aria-expanded="${String(state.quizAnswerVisible)}">${state.quizAnswerVisible ? hideLabel : revealLabel}</button>
          <button class="quiz-nav-button" type="button" data-quiz-action="next"${state.currentQuizIndex === quizData.length - 1 ? " disabled" : ""}>${nextLabel}</button>
        </div>
        <div class="quiz-answer${state.quizAnswerVisible ? " open" : ""}" ${state.quizAnswerVisible ? "" : "hidden"}>
          <p><strong>${expectedLabel}</strong> ${escapeHtml(localizedItem.expected)}</p>
          <p><strong>${signalLabel}</strong> ${escapeHtml(localizedItem.signal)}</p>
        </div>
      `;
    }

    function getLocalizedQuizItem(item, index) {
      if (state.contentLang !== "zh") return item;
      const translation = item.zh || quizTranslationsZh[index];
      if (!translation) return item;
      return {
        scope: translation.scope || item.scope,
        question: translation.question || item.question,
        expected: translation.expected || item.expected,
        signal: translation.signal || item.signal,
        relatedLabel: translation.relatedLabel || item.relatedLabel
      };
    }

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function toggleCollapsedNav(button) {
      setChaptersExpanded(button.getAttribute("aria-expanded") !== "true");
    }

    function isMobileViewport() {
      return window.matchMedia("(max-width: 760px)").matches;
    }

    function closeMobileSidebar() {
      sidebar.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    }

    if (searchTrigger) searchTrigger.addEventListener("click", openSearch);
    const closeSearchButton = document.getElementById("closeSearch");
    if (closeSearchButton) closeSearchButton.addEventListener("click", closeSearch);
    if (searchBackdrop) searchBackdrop.addEventListener("click", closeSearch);
    if (searchInput) {
      searchInput.addEventListener("input", () => setSearchQuery(searchInput.value));
      searchInput.addEventListener("keydown", (event) => {
        if (event.isComposing) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSearchSelection(1);
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSearchSelection(-1);
        }
        if (event.key === "Enter") {
          event.preventDefault();
          activateSearchResult(state.searchActiveIndex);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeSearch();
        }
      });
    }
    if (searchResults) {
      searchResults.addEventListener("click", (event) => {
        const result = event.target.closest("[data-search-index]");
        if (!result) return;
        activateSearchResult(Number(result.dataset.searchIndex));
      });
      searchResults.addEventListener("mousemove", (event) => {
        const result = event.target.closest("[data-search-index]");
        if (!result) return;
        state.searchActiveIndex = Number(result.dataset.searchIndex);
      });
    }

    viewTargetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const viewId = button.dataset.viewTarget;
        const targetId = button.dataset.scrollTarget;
        const shouldExpandChapters = button.dataset.expandChapters === "true" || (button.classList.contains("chapter-nav-card") && isChapterView(viewId));
        if (shouldExpandChapters) setChaptersExpanded(true);
        if (viewId) setView(viewId);
        if (targetId) requestAnimationFrame(() => scrollToTarget(targetId));
      });
    });

    document.querySelectorAll("[data-scroll-target]").forEach((button) => {
      button.addEventListener("click", () => scrollToTarget(button.dataset.scrollTarget));
    });

    prepareLanguageAwareDeepDives();

    document.querySelectorAll("[data-open-deep]").forEach((button) => {
      button.addEventListener("click", () => openDrawer(button.dataset.openDeep, button.dataset.lang || state.contentLang));
    });

    document.querySelectorAll("[data-drawer-lang]").forEach((button) => {
      button.addEventListener("click", () => {
        state.currentLang = button.dataset.drawerLang;
        renderDrawer();
      });
    });

    document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
    drawerBackdrop.addEventListener("click", closeDrawer);
    themeButtons.forEach((button) => {
      button.addEventListener("click", toggleTheme);
    });
    languageButtons.forEach((button) => {
      button.addEventListener("click", toggleLanguage);
    });
    if (sidebarCollapseButton) {
      sidebarCollapseButton.addEventListener("click", () => {
        if (isMobileViewport()) {
          closeMobileSidebar();
          return;
        }
        setSidebarCollapsed(true);
      });
    }
    if (sidebarExpandButton) sidebarExpandButton.addEventListener("click", () => setSidebarCollapsed(false));
    collapseButtons.forEach((button) => {
      button.addEventListener("click", () => toggleCollapsedNav(button));
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-quiz-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.quizAction;
      if (action === "prev") setQuizIndex(state.currentQuizIndex - 1);
      if (action === "next") setQuizIndex(state.currentQuizIndex + 1);
      if (action === "jump") setQuizIndex(Number(button.dataset.quizIndex));
      if (action === "toggle-answer") toggleQuizAnswer();
      if (action === "go-related") {
        const relatedView = button.dataset.relatedView;
        if (!isKnownView(relatedView)) return;
        if (isChapterView(relatedView)) setChaptersExpanded(true);
        setView(relatedView);
      }
    });

    menuButton.addEventListener("click", () => {
      const open = !sidebar.classList.contains("open");
      sidebar.classList.toggle("open", open);
      menuButton.setAttribute("aria-expanded", String(open));
    });

    // On mobile, tapping anywhere outside the sidebar dismisses it. Skip taps on the
    // menu button itself (its own handler toggles the state) and taps inside the
    // sidebar (so nav buttons, language/theme toggles, etc. still work).
    document.addEventListener("click", (event) => {
      if (!sidebar.classList.contains("open")) return;
      if (!isMobileViewport()) return;
      const target = event.target;
      if (target.closest("#sidebar") || target.closest("#menuButton")) return;
      closeMobileSidebar();
    });

    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
        return;
      }
      if (event.key === "Escape" && state.searchOpen) {
        closeSearch();
        return;
      }
      if (event.key === "Escape") {
        if (!drawer.hidden) closeDrawer();
        sidebar.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      }
    });

    safelyBuildSearchIndex();
    applyPlatformShortcutLabels();
    loadTheme();
    loadLanguage();
    loadSidebarCollapsedState();
    loadChapterNavState();
    loadQuizState();
    loadSavedView();
