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
      theme: "light"
    };

    const themeStorageKey = "antifragile-html-reader:theme";
    const views = Array.from(document.querySelectorAll("[data-view]"));
    const viewTargetButtons = Array.from(document.querySelectorAll("[data-view-target]"));
    const navButtons = Array.from(document.querySelectorAll("[data-nav-item]"));
    const themeButtons = Array.from(document.querySelectorAll("[data-theme-toggle]"));
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

    function setView(viewId) {
      state.currentView = viewId;
      views.forEach((view) => view.classList.toggle("active", view.id === viewId));
      navButtons.forEach((button) => {
        if (button.dataset.viewTarget) {
          button.classList.toggle("active", button.dataset.viewTarget === viewId);
        }
      });
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

    function escapeHtml(value) {
      return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    viewTargetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled) return;
        const viewId = button.dataset.viewTarget;
        const targetId = button.dataset.scrollTarget;
        if (viewId) setView(viewId);
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
