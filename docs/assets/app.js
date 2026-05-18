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

    const state = {
      currentView: "overview",
      currentConcept: "concept1",
      currentLang: "en",
      theme: "light",
      chaptersExpanded: false,
      currentQuizIndex: 0,
      quizAnswerVisible: false
    };

    const themeStorageKey = "antifragile-html-reader:theme";
    const chapterNavStorageKey = "antifragile-html-reader:chapters-expanded";
    const viewStorageKey = "antifragile-html-reader:last-view";
    const quizStorageKey = "antifragile-html-reader:quiz-index";
    const quizData = window.ANTIFRAGILE_QUIZ || [];
    const views = Array.from(document.querySelectorAll("[data-view]"));
    const viewTargetButtons = Array.from(document.querySelectorAll("[data-view-target]"));
    const navButtons = Array.from(document.querySelectorAll("[data-nav-item]"));
    const themeButtons = Array.from(document.querySelectorAll("[data-theme-toggle]"));
    const collapseButtons = Array.from(document.querySelectorAll("[data-collapse-toggle]"));
    const quizPosition = document.getElementById("quizPosition");
    const quizScope = document.getElementById("quizScope");
    const quizProgressBar = document.getElementById("quizProgressBar");
    const quizJump = document.getElementById("quizJump");
    const quizCard = document.getElementById("quizCard");
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

    function setView(viewId, persist = true) {
      if (!isKnownView(viewId)) return;
      state.currentView = viewId;
      views.forEach((view) => view.classList.toggle("active", view.id === viewId));
      navButtons.forEach((button) => {
        if (button.dataset.viewTarget) {
          button.classList.toggle("active", button.dataset.viewTarget === viewId);
        }
      });
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
      drawerTitle.textContent = explainer.title;
      const chapterLabel = explainer.chapterLabel || "Chapter 1";
      drawerSubtitle.textContent = state.currentLang === "zh" ? `中文解释 · ${chapterLabel}` : `English explainer · ${chapterLabel}`;
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

    function openDrawer(concept, lang) {
      state.currentConcept = concept;
      state.currentLang = lang;
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
      const questionNumber = state.currentQuizIndex + 1;
      const paddedNumber = String(questionNumber).padStart(2, "0");
      quizPosition.textContent = `Question ${questionNumber} / ${quizData.length}`;
      quizScope.textContent = item.scope;
      quizProgressBar.style.width = `${(questionNumber / quizData.length) * 100}%`;
      quizJump.innerHTML = quizData.map((quizItem, index) => {
        const active = index === state.currentQuizIndex;
        return `<button class="quiz-jump-button${active ? " active" : ""}" type="button" data-quiz-action="jump" data-quiz-index="${index}" aria-label="Jump to question ${index + 1}" aria-current="${active ? "true" : "false"}">${String(index + 1).padStart(2, "0")}</button>`;
      }).join("");
      quizCard.innerHTML = `
        <div class="quiz-card-head">
          <span class="quiz-number">${paddedNumber}</span>
          <span class="quiz-scope">${escapeHtml(item.scope)}</span>
        </div>
        <h3 class="quiz-question">${escapeHtml(item.question)}</h3>
        <div class="quiz-actions">
          <button class="quiz-nav-button" type="button" data-quiz-action="prev"${state.currentQuizIndex === 0 ? " disabled" : ""}>Previous</button>
          <button class="quiz-reveal-button" type="button" data-quiz-action="toggle-answer" aria-expanded="${String(state.quizAnswerVisible)}">${state.quizAnswerVisible ? "Hide answer" : "Reveal answer"}</button>
          <button class="quiz-nav-button" type="button" data-quiz-action="next"${state.currentQuizIndex === quizData.length - 1 ? " disabled" : ""}>Next</button>
        </div>
        <div class="quiz-answer${state.quizAnswerVisible ? " open" : ""}" ${state.quizAnswerVisible ? "" : "hidden"}>
          <p><strong>Expected answer.</strong> ${escapeHtml(item.expected)}</p>
          <p><strong>Book signal.</strong> ${escapeHtml(item.signal)}</p>
        </div>
      `;
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
        if (viewId) setView(viewId);
        if (button.dataset.expandChapters === "true") setChaptersExpanded(true);
        if (targetId) requestAnimationFrame(() => scrollToTarget(targetId));
      });
    });

    document.querySelectorAll("[data-scroll-target]").forEach((button) => {
      button.addEventListener("click", () => scrollToTarget(button.dataset.scrollTarget));
    });

    document.querySelectorAll("[data-open-deep]").forEach((button) => {
      button.addEventListener("click", () => openDrawer(button.dataset.openDeep, button.dataset.lang));
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
    loadChapterNavState();
    loadQuizState();
    loadSavedView();
