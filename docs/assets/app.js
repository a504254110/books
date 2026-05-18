    const APP_VERSION = "2026-05-18-cache-1";
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

    const explainers = window.ANTIFRAGILE_EXPLAINERS || {};
    const translations = window.ANTIFRAGILE_TRANSLATIONS || {};

    const state = {
      currentView: "overview",
      currentConcept: "concept1",
      currentLang: "en",
      contentLang: "en",
      theme: "light",
      chaptersExpanded: false,
      currentQuizIndex: 0,
      quizAnswerVisible: false
    };

    const themeStorageKey = "antifragile-html-reader:theme";
    const languageStorageKey = "antifragile-html-reader:language";
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
    }

    function applyChapterTranslations() {
      Object.entries(translations).forEach(([viewId, viewTranslations]) => {
        const view = document.getElementById(viewId);
        if (!view) return;
        view.classList.toggle("zh-content", state.contentLang === "zh" && Boolean(viewTranslations.zh));
        const entries = viewTranslations[state.contentLang] || [];
        const translatedSelectors = new Set(entries.map((entry) => entry.selector));
        const fallbackEntries = Object.values(viewTranslations).flat();
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
        const hasExplicitTranslations = Boolean(translations[view.id]?.zh);
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
        if (!explainer?.zh) return;
        const sections = Array.isArray(explainer.zh) ? explainer.zh : explainer.zh.sections;
        if (!sections?.length) return;

        const heading = concept.querySelector("h3");
        if (heading) {
          if (!heading.dataset.originalText) heading.dataset.originalText = heading.textContent.trim();
          if (isChinese) {
            const conceptNumber = heading.dataset.originalText.match(/^Concept\s+(\d+)/)?.[1] || "";
            const title = explainer.titleZh || shortenText(firstParagraph(sections[0]?.[1] || "概念解释"), 54);
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
          const section = sections[index];
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
      const coreIdeas = conceptSections.map((sections) => sections[0]?.[1]).filter(Boolean);
      const details = conceptSections.map((sections) => firstParagraph(sections[1]?.[1])).filter(Boolean);
      const examples = conceptSections.map((sections) => firstParagraph(sections[2]?.[1])).filter(Boolean);
      applyListTranslation(view.querySelectorAll(".abstract li"), coreIdeas, isChinese, true);
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
          const sections = explainer?.zh;
          return Array.isArray(sections) ? sections : sections?.sections;
        })
        .filter((sections) => sections?.length);
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
      return value
        .split("\n\n")
        .map((paragraph) => escapeHtml(paragraph))
        .join("<br><br>");
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
        button.closest(".nav-group")?.classList.toggle("collapsed", !state.chaptersExpanded);
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
      const navList = activeButton?.closest(".nav-list");
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
        const concept = deepButtons[0]?.dataset.openDeep;
        if (!concept) return;
        row.querySelector("span")?.remove();
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
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function toggleCollapsedNav(button) {
      setChaptersExpanded(button.getAttribute("aria-expanded") !== "true");
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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!drawer.hidden) closeDrawer();
        sidebar.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      }
    });

    loadTheme();
    loadLanguage();
    loadChapterNavState();
    loadQuizState();
    loadSavedView();
