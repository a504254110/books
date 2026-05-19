"""End-to-end UI tests for docs/index.html (Antifragile Reader).

Runs the same suite twice — once with a desktop Chromium context, once with a
mobile iPhone-class context — and reports a per-test pass/fail line plus a
final summary. All artefacts (screenshots, JSON results) land in
tests/screenshots/ and tests/results.json under the project root.

Usage:
    python3 tests/test_reader.py            # run everything
    python3 tests/test_reader.py desktop    # desktop suite only
    python3 tests/test_reader.py mobile     # mobile suite only

Each test is a plain function that takes (page, ctx) where ctx is a small
dict of profile-specific flags (profile name, is_mobile, viewport size, etc.).
Tests raise AssertionError on failure; the runner catches it, captures a
screenshot, and continues.
"""

from __future__ import annotations

import json
import sys
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from playwright.sync_api import (
    Browser,
    BrowserContext,
    Error as PlaywrightError,
    Page,
    sync_playwright,
)


ROOT = Path(__file__).resolve().parent.parent
INDEX_URL = (ROOT / "docs" / "index.html").as_uri()
SCREEN_DIR = ROOT / "tests" / "screenshots"
RESULTS_PATH = ROOT / "tests" / "results.json"
SCREEN_DIR.mkdir(parents=True, exist_ok=True)


# ----------------------------- helpers ----------------------------------- #

def active_view_id(page: Page) -> str:
    return page.evaluate(
        "() => { const v = document.querySelector('.view.active'); return v ? v.id : ''; }"
    )


def reset_storage(page: Page) -> None:
    """Drop every persisted preference so each test starts from a known state."""
    page.goto(INDEX_URL)
    page.wait_for_load_state("networkidle")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.goto(INDEX_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(150)


def open_sidebar_if_mobile(page: Page, ctx: dict) -> None:
    if ctx["is_mobile"]:
        page.locator("#menuButton").click()
        page.wait_for_timeout(200)


# ----------------------------- tests ------------------------------------- #

def test_initial_load_overview(page: Page, ctx: dict) -> None:
    reset_storage(page)
    assert active_view_id(page) == "overview", f"Expected overview, got {active_view_id(page)}"
    assert page.locator("#overview .hero h2").is_visible()
    assert page.locator("text=The book in one minute").is_visible()


def test_all_chapters_mounted(page: Page, ctx: dict) -> None:
    reset_storage(page)
    count = page.evaluate(
        "() => document.querySelectorAll(\"article.view.chapter[id^='chapter-']\").length"
    )
    assert count == 25, f"Expected 25 chapter articles mounted, got {count}"
    assert page.locator("#epilogue").count() == 1, "Epilogue view missing"


def test_search_index_built(page: Page, ctx: dict) -> None:
    reset_storage(page)
    # The search index is private; expose it via a query through the search panel
    page.locator("#searchTrigger").click()
    page.wait_for_timeout(200)
    page.locator("#searchInput").fill("antifragile")
    page.wait_for_timeout(300)
    result_count = page.locator("[data-search-index]").count()
    assert result_count > 0, "Search index returned no results for the word 'antifragile'"
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)


def _visible_toggle(page: Page, selector: str):
    """The toggle exists twice (topbar + sidebar); pick the one currently rendered."""
    return page.locator(f"{selector}:visible").first


def test_theme_toggle(page: Page, ctx: dict) -> None:
    reset_storage(page)
    assert page.evaluate("() => document.documentElement.dataset.theme") == "light"
    _visible_toggle(page, "[data-theme-toggle]").click()
    page.wait_for_timeout(150)
    assert page.evaluate("() => document.documentElement.dataset.theme") == "dark"
    # Persistence
    page.reload()
    page.wait_for_load_state("networkidle")
    assert page.evaluate("() => document.documentElement.dataset.theme") == "dark", "Theme was not persisted after reload"
    # Toggle back
    _visible_toggle(page, "[data-theme-toggle]").click()
    page.wait_for_timeout(150)
    assert page.evaluate("() => document.documentElement.dataset.theme") == "light"


def test_language_toggle(page: Page, ctx: dict) -> None:
    reset_storage(page)
    assert page.evaluate("() => document.documentElement.dataset.contentLang") == "en"
    _visible_toggle(page, "[data-language-toggle]").click()
    page.wait_for_timeout(200)
    assert page.evaluate("() => document.documentElement.dataset.contentLang") == "zh"
    # Search placeholder updates
    page.locator("#searchTrigger").click()
    page.wait_for_timeout(200)
    placeholder = page.locator("#searchInput").get_attribute("placeholder") or ""
    assert "搜索" in placeholder, f"Expected Chinese placeholder, got {placeholder!r}"
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)
    # Persistence
    page.reload()
    page.wait_for_load_state("networkidle")
    assert page.evaluate("() => document.documentElement.dataset.contentLang") == "zh", "Language not persisted"


def test_overview_start_chapter_one(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(250)
    assert active_view_id(page) == "chapter-1"
    assert page.locator("#chapter-1 #concept-1").is_visible()
    # Expanding chapters flag should persist
    expanded = page.evaluate("() => localStorage.getItem('antifragile-html-reader:chapters-expanded')")
    assert expanded == "true", f"Expected chapters-expanded=true, got {expanded}"


def test_overview_start_quiz(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='quiz']").click()
    page.wait_for_timeout(300)
    assert active_view_id(page) == "quiz"
    assert page.locator("#quizCard .quiz-question").is_visible()
    assert "1" in (page.locator("#quizPosition").inner_text() or "")


def test_deep_dive_ui_is_hidden(page: Page, ctx: dict) -> None:
    """Deep dive was removed from the UI. Buttons, drawer, and backdrop must not be visible.
    The underlying data (`explainer.zh`) is still kept in the JS files for archival."""
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(250)
    state = page.evaluate(
        """
        () => {
          const row = document.querySelector('#chapter-1 .deep-row');
          const drawer = document.getElementById('drawer');
          const backdrop = document.getElementById('drawerBackdrop');
          return {
            row_display: row ? getComputedStyle(row).display : 'missing',
            drawer_display: getComputedStyle(drawer).display,
            backdrop_display: getComputedStyle(backdrop).display,
          };
        }
        """
    )
    assert state["row_display"] == "none", f".deep-row should be hidden, got {state['row_display']!r}"
    assert state["drawer_display"] == "none", f"#drawer should be hidden, got {state['drawer_display']!r}"
    assert state["backdrop_display"] == "none", f"#drawerBackdrop should be hidden, got {state['backdrop_display']!r}"


def test_search_excludes_explainer_results(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#searchTrigger").click()
    page.wait_for_timeout(200)
    page.locator("#searchInput").fill("antifragility")
    page.wait_for_timeout(300)
    type_labels = page.evaluate(
        """
        () => Array.from(document.querySelectorAll('[data-search-index] .search-result-type'))
                   .map(el => el.textContent.trim())
        """
    )
    bad = [t for t in type_labels if t in {"Explainer", "中文解释"}]
    assert not bad, f"Search should not surface explainer/deep-dive entries, got {bad}"


def test_quiz_navigation_and_reveal(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='quiz']").click()
    page.wait_for_timeout(300)
    # Initial state: Previous is disabled
    prev = page.locator("[data-quiz-action='prev']")
    assert prev.is_disabled(), "Previous should be disabled at question 1"
    # Reveal answer
    page.locator("[data-quiz-action='toggle-answer']").click()
    page.wait_for_timeout(150)
    assert not page.locator("#quizCard .quiz-answer").evaluate("n => n.hidden")
    # Next
    page.locator("[data-quiz-action='next']").click()
    page.wait_for_timeout(200)
    assert "2" in (page.locator("#quizPosition").inner_text() or "")
    # Answer auto-hides on navigation
    assert page.locator("#quizCard .quiz-answer").evaluate("n => n.hidden"), "Answer should auto-hide after navigation"
    # Jump
    page.locator("[data-quiz-action='jump'][data-quiz-index='39']").click()
    page.wait_for_timeout(200)
    nxt = page.locator("[data-quiz-action='next']")
    assert nxt.is_disabled(), "Next should be disabled at last question"


def test_quiz_related_navigation(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='quiz']").click()
    page.wait_for_timeout(300)
    page.locator("[data-quiz-action='go-related']").click()
    page.wait_for_timeout(300)
    vid = active_view_id(page)
    assert vid.startswith("chapter-") or vid == "epilogue", f"Related view should be chapter, got {vid}"


def test_quiz_persistence(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='quiz']").click()
    page.wait_for_timeout(200)
    page.locator("[data-quiz-action='next']").click()
    page.wait_for_timeout(150)
    page.locator("[data-quiz-action='next']").click()
    page.wait_for_timeout(150)
    page.reload()
    page.wait_for_load_state("networkidle")
    assert active_view_id(page) == "quiz", "Last view should restore to quiz"
    assert "3" in (page.locator("#quizPosition").inner_text() or ""), "Quiz index should persist"


def test_search_keyboard_navigation(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#searchTrigger").click()
    page.wait_for_timeout(200)
    assert page.evaluate("() => document.activeElement && document.activeElement.id") == "searchInput"
    page.locator("#searchInput").fill("Thales")
    page.wait_for_timeout(250)
    results_before = page.locator("[data-search-index]").count()
    assert results_before > 0
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(100)
    active_idx = page.evaluate(
        "() => { const el = document.querySelector('.search-result.active'); return el ? Number(el.dataset.searchIndex) : -1; }"
    )
    assert active_idx == 1, f"ArrowDown should move highlight to index 1, got {active_idx}"
    page.keyboard.press("Enter")
    page.wait_for_timeout(400)
    assert page.locator("#searchPanel").evaluate("n => n.hidden"), "Search should close after Enter"
    vid = active_view_id(page)
    assert vid != "overview", f"Search should navigate to result view, still on {vid}"


def test_search_no_results(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#searchTrigger").click()
    page.wait_for_timeout(200)
    page.locator("#searchInput").fill("zzzqqqxxxnotaword")
    page.wait_for_timeout(300)
    empty = page.locator(".search-empty").count()
    assert empty == 1, f"Expected empty state, got {empty}"


def test_cmd_k_shortcut(page: Page, ctx: dict) -> None:
    reset_storage(page)
    # The platform-aware label means Cmd on darwin
    page.keyboard.press("Meta+K" if sys.platform == "darwin" else "Control+K")
    page.wait_for_timeout(200)
    assert not page.locator("#searchPanel").evaluate("n => n.hidden"), "Cmd/Ctrl+K should open search"
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator("#searchPanel").evaluate("n => n.hidden"), "Escape should close search"


def test_view_persistence(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(200)
    # Open sidebar (mobile) to click chapter-12
    open_sidebar_if_mobile(page, ctx)
    # Chapters group must be expanded already (clicking "Start chapter 1" set the flag)
    page.locator("#sidebar button[data-view-target='chapter-12']").click()
    page.wait_for_timeout(250)
    assert active_view_id(page) == "chapter-12"
    page.reload()
    page.wait_for_load_state("networkidle")
    assert active_view_id(page) == "chapter-12", "Last view should be restored on reload"


def test_chapter_collapse_toggle(page: Page, ctx: dict) -> None:
    reset_storage(page)
    open_sidebar_if_mobile(page, ctx)
    toggle = page.locator("[data-collapse-toggle='chapterList']")
    assert toggle.get_attribute("aria-expanded") == "false"
    toggle.click()
    page.wait_for_timeout(150)
    assert toggle.get_attribute("aria-expanded") == "true"
    # Persistence
    page.reload()
    page.wait_for_load_state("networkidle")
    open_sidebar_if_mobile(page, ctx)
    toggle2 = page.locator("[data-collapse-toggle='chapterList']")
    assert toggle2.get_attribute("aria-expanded") == "true", "chapters-expanded flag should persist"


def test_no_console_errors_on_main_paths(page: Page, ctx: dict) -> None:
    """Smoke walk: overview -> chapter 1 -> quiz -> search. Deep dive removed from UI."""
    events = {"errors": [], "pageerrors": []}
    page.on("console", lambda msg: events["errors"].append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: events["pageerrors"].append(str(exc)))

    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(200)
    # Scroll through the chapter (used to open drawer here, but drawer is removed)
    page.evaluate("() => window.scrollBy(0, 500)")
    page.wait_for_timeout(150)
    open_sidebar_if_mobile(page, ctx)
    page.locator("#sidebar button[data-view-target='quiz']").click()
    page.wait_for_timeout(200)
    page.locator("[data-quiz-action='toggle-answer']").click()
    page.wait_for_timeout(150)
    page.locator("[data-quiz-action='next']").click()
    page.wait_for_timeout(150)
    page.locator("#searchTrigger").click()
    page.wait_for_timeout(150)
    page.locator("#searchInput").fill("barbell")
    page.wait_for_timeout(250)
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)

    assert not events["errors"], f"Console errors: {events['errors']}"
    assert not events["pageerrors"], f"Page errors: {events['pageerrors']}"


# --- mobile-only --- #

def test_mobile_menu_button_clickable(page: Page, ctx: dict) -> None:
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    hit = page.evaluate(
        """
        () => {
          const btn = document.getElementById('menuButton');
          const rect = btn.getBoundingClientRect();
          const el = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
          return Boolean(el && (el.id === 'menuButton' || el.closest('#menuButton')));
        }
        """
    )
    assert hit, "Mobile menu button is blocked by another element"


def test_mobile_sidebar_open_close(page: Page, ctx: dict) -> None:
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#menuButton").click()
    page.wait_for_timeout(250)
    cls = page.locator("#sidebar").get_attribute("class") or ""
    assert "open" in cls, f"Sidebar did not open, class={cls!r}"
    page.locator("#sidebarCollapseButton").click()
    page.wait_for_timeout(250)
    cls2 = page.locator("#sidebar").get_attribute("class") or ""
    assert "open" not in cls2, f"Sidebar did not close, class={cls2!r}"


def test_mobile_sidebar_closes_on_navigation(page: Page, ctx: dict) -> None:
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#menuButton").click()
    page.wait_for_timeout(200)
    # Make sure chapter list is open
    if (page.locator("[data-collapse-toggle='chapterList']").get_attribute("aria-expanded") or "") != "true":
        page.locator("[data-collapse-toggle='chapterList']").click()
        page.wait_for_timeout(150)
    page.locator("#sidebar button[data-view-target='chapter-5']").click()
    page.wait_for_timeout(300)
    assert active_view_id(page) == "chapter-5"
    cls = page.locator("#sidebar").get_attribute("class") or ""
    assert "open" not in cls, "Sidebar should auto-close on mobile after navigation"


def test_mobile_deep_dive_not_triggerable(page: Page, ctx: dict) -> None:
    """On mobile, confirm the deep-dive button row is gone — no way for users to surface
    the drawer. (The drawer DOM element remains for archival but is display:none.)"""
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(200)
    rows_visible = page.evaluate(
        "() => Array.from(document.querySelectorAll('#chapter-1 .deep-row')).filter(r => getComputedStyle(r).display !== 'none').length"
    )
    assert rows_visible == 0, f"Expected 0 visible .deep-row on mobile, got {rows_visible}"


def test_mobile_topbar_visible(page: Page, ctx: dict) -> None:
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    assert page.locator(".topbar").is_visible(), "Topbar should be visible on mobile"
    display = page.evaluate("() => getComputedStyle(document.querySelector('.topbar')).display")
    assert display == "flex", f"Topbar expected flex on mobile, got {display}"


def test_mobile_no_horizontal_overflow(page: Page, ctx: dict) -> None:
    """The mobile topbar used to leak negative horizontal margins from the desktop
    base rule, pushing html.scrollWidth past clientWidth by ~22 px and allowing a
    tiny left-right scroll. Guard against regression."""
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    sizes = page.evaluate(
        """
        () => {
          const h = document.documentElement;
          return { clientWidth: h.clientWidth, scrollWidth: h.scrollWidth, bodyScroll: document.body.scrollWidth };
        }
        """
    )
    overflow = sizes["scrollWidth"] - sizes["clientWidth"]
    assert overflow <= 0.5, (
        f"Mobile document overflows horizontally: clientWidth={sizes['clientWidth']}, "
        f"scrollWidth={sizes['scrollWidth']} (excess {overflow} px)"
    )


def test_mobile_shortcut_hint_hidden(page: Page, ctx: dict) -> None:
    """The Cmd/Ctrl+K hint is misleading on mobile (no keyboard); it should be hidden."""
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    displays = page.evaluate(
        "() => Array.from(document.querySelectorAll('.shortcut-key')).map(k => getComputedStyle(k).display)"
    )
    assert displays, "no .shortcut-key elements found"
    visible = [d for d in displays if d != "none"]
    assert not visible, f".shortcut-key should all be hidden on mobile, got displays={displays}"


def test_mobile_tap_outside_closes_sidebar(page: Page, ctx: dict) -> None:
    """Open the sidebar, tap somewhere outside it, sidebar should auto-close."""
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#menuButton").click()
    page.wait_for_timeout(220)
    assert "open" in (page.locator("#sidebar").get_attribute("class") or ""), "sidebar did not open"
    # Tap just outside the sidebar's right edge. Sidebar width on mobile ≈ 343 px,
    # viewport innerWidth ≈ 413 (mobile DPR inflation), so x=395 lands on main area.
    page.mouse.click(395, 400)
    page.wait_for_timeout(220)
    cls = page.locator("#sidebar").get_attribute("class") or ""
    assert "open" not in cls, f"sidebar should have auto-closed after tap-outside, class={cls!r}"


def test_mobile_tap_inside_sidebar_keeps_open(page: Page, ctx: dict) -> None:
    """Tapping a non-navigating control inside the sidebar (theme/language) should
    NOT trigger the auto-close path."""
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#menuButton").click()
    page.wait_for_timeout(220)
    page.locator("#sidebar [data-language-toggle]").first.click()
    page.wait_for_timeout(220)
    cls = page.locator("#sidebar").get_attribute("class") or ""
    assert "open" in cls, f"sidebar should stay open after in-sidebar control click, class={cls!r}"


# --- desktop-only --- #

def test_desktop_topbar_hidden(page: Page, ctx: dict) -> None:
    if ctx["is_mobile"]:
        return
    reset_storage(page)
    display = page.evaluate("() => getComputedStyle(document.querySelector('.topbar')).display")
    assert display == "none", f"Topbar should be hidden on desktop, got display={display}"


def test_desktop_sidebar_visible_by_default(page: Page, ctx: dict) -> None:
    if ctx["is_mobile"]:
        return
    reset_storage(page)
    assert page.locator("#sidebar").is_visible()
    # The restore button is always in DOM; it is faded out (opacity 0, pointer-events none)
    # when the sidebar is expanded. We assert the faded-out state, not display.
    info = page.evaluate(
        "() => { const el = document.getElementById('sidebarExpandButton'); const cs = getComputedStyle(el); return { opacity: cs.opacity, pointerEvents: cs.pointerEvents }; }"
    )
    assert info["opacity"] == "0", f"Restore button should be opacity:0 when sidebar open, got {info}"
    assert info["pointerEvents"] == "none", f"Restore button should be pointer-events:none, got {info}"


def test_desktop_sidebar_collapse_and_restore(page: Page, ctx: dict) -> None:
    if ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#sidebarCollapseButton").click()
    page.wait_for_timeout(250)
    assert page.evaluate("() => document.documentElement.dataset.sidebarCollapsed") == "true"
    # Sidebar now hidden; restore button should appear
    assert page.locator("#sidebarExpandButton").is_visible(), "Restore button should appear when sidebar collapses"
    # Persistence
    page.reload()
    page.wait_for_load_state("networkidle")
    assert page.evaluate("() => document.documentElement.dataset.sidebarCollapsed") == "true", "Sidebar collapsed flag should persist"
    page.locator("#sidebarExpandButton").click()
    page.wait_for_timeout(250)
    assert page.evaluate("() => document.documentElement.dataset.sidebarCollapsed") == "false"


def test_desktop_shortcut_hint_visible(page: Page, ctx: dict) -> None:
    """The Cmd/Ctrl+K hint should still render on desktop (keyboards exist there)."""
    if ctx["is_mobile"]:
        return
    reset_storage(page)
    visible = page.evaluate(
        "() => Array.from(document.querySelectorAll('.shortcut-key')).filter(k => getComputedStyle(k).display !== 'none').length"
    )
    assert visible >= 1, f"At least one .shortcut-key should be visible on desktop, got {visible}"


def test_chapter_zh_one_minute_uses_chapter_data(page: Page, ctx: dict) -> None:
    """The Chinese 'Chapter in one minute' list must come from the per-chapter
    oneMinuteZh array (a 1:1 translation of the English list), NOT from the first
    sentence of each concept. Regression-protect that wiring."""
    reset_storage(page)
    page.evaluate("() => document.querySelectorAll('[data-language-toggle]')[0].click()")
    page.wait_for_timeout(250)
    # Sample chapter 1: the EN line 1 begins with "The title frames three responses..."
    # The new ZH translation should begin with "标题...达摩克利斯..." (not Taleb...类别).
    page.evaluate("() => document.querySelector('[data-view-target=\"chapter-1\"]').click()")
    page.wait_for_timeout(350)
    first_line = page.evaluate(
        "() => { const li = document.querySelector('#chapter-1 .abstract li'); return li ? li.textContent.trim() : ''; }"
    )
    assert "达摩克利斯" in first_line or "标题" in first_line, (
        f"ch1 first one-minute line should be a translation of the EN line (contains '达摩克利斯'/'标题'), "
        f"got {first_line[:120]!r}"
    )
    # Also verify chapter data carries the field
    has_field = page.evaluate(
        "() => Array.isArray((window.ANTIFRAGILE_CHAPTERS && window.ANTIFRAGILE_CHAPTERS.chapter1 || {}).oneMinuteZh)"
    )
    assert has_field, "window.ANTIFRAGILE_CHAPTERS.chapter1.oneMinuteZh should be an array"


def test_compact_pager_navigation(page: Page, ctx: dict) -> None:
    """Each chapter view should have a compact prev/next pager in .chapter-tools.
    Click flow: ch5 → next → ch6 → prev → ch5. Edges: ch1 prev disabled, epilogue next disabled."""
    reset_storage(page)
    page.evaluate("() => document.querySelector('[data-view-target=\"chapter-5\"]').click()")
    page.wait_for_timeout(250)
    info = page.evaluate(
        """
        () => {
          const pager = document.querySelector('#chapter-5 .compact-pager');
          if (!pager) return null;
          const btns = Array.from(pager.querySelectorAll('button'));
          return {
            count: btns.length,
            prev: btns[0] ? btns[0].dataset.viewTarget : null,
            next: btns[1] ? btns[1].dataset.viewTarget : null,
          };
        }
        """
    )
    assert info and info["count"] == 2, f"ch5 should have a 2-button pager, got {info}"
    assert info["prev"] == "chapter-4" and info["next"] == "chapter-6", info

    page.locator("#chapter-5 .compact-pager button[data-view-target='chapter-6']").click()
    page.wait_for_timeout(250)
    assert active_view_id(page) == "chapter-6"

    page.locator("#chapter-6 .compact-pager button[data-view-target='chapter-5']").click()
    page.wait_for_timeout(250)
    assert active_view_id(page) == "chapter-5"

    # Edges
    page.evaluate("() => document.querySelector('[data-view-target=\"chapter-1\"]').click()")
    page.wait_for_timeout(250)
    ch1 = page.evaluate(
        "() => { const b = document.querySelectorAll('#chapter-1 .compact-pager button'); return {prev_disabled: b[0].disabled, next_target: b[1].dataset.viewTarget}; }"
    )
    assert ch1["prev_disabled"] is True, "ch1 prev should be disabled"
    assert ch1["next_target"] == "chapter-2"

    page.evaluate("() => document.querySelector('[data-view-target=\"epilogue\"]').click()")
    page.wait_for_timeout(250)
    ep = page.evaluate(
        "() => { const b = document.querySelectorAll('#epilogue .compact-pager button'); return {prev_target: b[0].dataset.viewTarget, next_disabled: b[1].disabled}; }"
    )
    assert ep["prev_target"] == "chapter-25"
    assert ep["next_disabled"] is True, "epilogue next should be disabled"


def test_cache_busting_single_source(page: Page, ctx: dict) -> None:
    """The bootstrap injects every asset with ?v=APP_VERSION read from window.APP_VERSION.
    Confirm app.js's APP_VERSION matches window.APP_VERSION (single source of truth)."""
    reset_storage(page)
    info = page.evaluate(
        """
        () => {
          const fromWindow = window.APP_VERSION;
          const appJsSrc = Array.from(document.scripts).find(s => s.src.includes('app.js')).src;
          const urlMatch = appJsSrc.match(/[?&]v=([^&]+)/);
          return {
            window_version: fromWindow,
            app_js_query: urlMatch ? urlMatch[1] : null,
          };
        }
        """
    )
    assert info["window_version"], "window.APP_VERSION must be set"
    assert info["app_js_query"] == info["window_version"], (
        f"app.js src ?v={info['app_js_query']} should match window.APP_VERSION={info['window_version']}"
    )


def test_chapter_zh_body_matches_en_paragraph_count(page: Page, ctx: dict) -> None:
    """bodyZh should give the Chinese chapter body the same paragraph count and label
    structure as the English original (Claim / Example / Why / Whole-book / Possible confusion)."""
    reset_storage(page)
    # Capture EN paragraph count for ch1 concept-1.
    page.evaluate("() => document.querySelector('[data-view-target=\"chapter-1\"]').click()")
    page.wait_for_timeout(300)
    en_count = page.evaluate(
        "() => document.querySelectorAll('#chapter-1 #concept-1 p:not(.grounding)').length"
    )
    # Switch to ZH; count visible (non-hidden) paragraphs in same concept.
    page.evaluate("() => document.querySelectorAll('[data-language-toggle]')[0].click()")
    page.wait_for_timeout(300)
    zh_count = page.evaluate(
        "() => Array.from(document.querySelectorAll('#chapter-1 #concept-1 p:not(.grounding)')).filter(p => !p.hidden).length"
    )
    assert zh_count == en_count, (
        f"ZH visible paragraph count ({zh_count}) should match EN paragraph count ({en_count}) for ch1 concept-1"
    )
    # Also check first ZH paragraph carries the Chinese label '主张：' (matching EN 'Claim:').
    first_zh = page.evaluate(
        "() => document.querySelector('#chapter-1 #concept-1 p:not(.grounding)').textContent.trim()"
    )
    assert first_zh.startswith("主张"), f"first ZH paragraph should lead with '主张', got {first_zh[:60]!r}"


# ----------------------------- runner ------------------------------------ #

TESTS: list[Callable[[Page, dict], None]] = [
    test_initial_load_overview,
    test_all_chapters_mounted,
    test_search_index_built,
    test_theme_toggle,
    test_language_toggle,
    test_overview_start_chapter_one,
    test_overview_start_quiz,
    test_deep_dive_ui_is_hidden,
    test_search_excludes_explainer_results,
    test_quiz_navigation_and_reveal,
    test_quiz_related_navigation,
    test_quiz_persistence,
    test_search_keyboard_navigation,
    test_search_no_results,
    test_cmd_k_shortcut,
    test_view_persistence,
    test_chapter_collapse_toggle,
    test_no_console_errors_on_main_paths,
    test_chapter_zh_one_minute_uses_chapter_data,
    test_chapter_zh_body_matches_en_paragraph_count,
    test_compact_pager_navigation,
    test_cache_busting_single_source,
    # mobile-only
    test_mobile_menu_button_clickable,
    test_mobile_sidebar_open_close,
    test_mobile_sidebar_closes_on_navigation,
    test_mobile_deep_dive_not_triggerable,
    test_mobile_topbar_visible,
    test_mobile_no_horizontal_overflow,
    test_mobile_shortcut_hint_hidden,
    test_mobile_tap_outside_closes_sidebar,
    test_mobile_tap_inside_sidebar_keeps_open,
    # desktop-only
    test_desktop_topbar_hidden,
    test_desktop_shortcut_hint_visible,
    test_desktop_sidebar_visible_by_default,
    test_desktop_sidebar_collapse_and_restore,
]


PROFILES = {
    "desktop": {
        "profile": "desktop",
        "is_mobile": False,
        "viewport": {"width": 1280, "height": 900},
        "device_scale_factor": 1,
        "has_touch": False,
    },
    "mobile": {
        "profile": "mobile",
        "is_mobile": True,
        "viewport": {"width": 390, "height": 844},
        "device_scale_factor": 3,
        "has_touch": True,
    },
}


@dataclass
class TestResult:
    name: str
    profile: str
    status: str  # "PASS" | "FAIL" | "SKIP"
    message: str = ""
    traceback: str = ""
    screenshot: str = ""
    duration_ms: int = 0


def run_one(test_fn: Callable[[Page, dict], None], browser: Browser, ctx_cfg: dict) -> TestResult:
    """Each test runs in a fresh context so localStorage and viewport state cannot leak."""
    name = test_fn.__name__
    profile = ctx_cfg["profile"]
    result = TestResult(name=name, profile=profile, status="PASS")
    start = time.time()
    context: BrowserContext = browser.new_context(
        viewport=ctx_cfg["viewport"],
        is_mobile=ctx_cfg["is_mobile"],
        has_touch=ctx_cfg["has_touch"],
        device_scale_factor=ctx_cfg["device_scale_factor"],
    )
    page = context.new_page()
    page_errors: list[str] = []
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    try:
        # Mobile/desktop-only tests early-return; record them as SKIP if they touched nothing.
        # To detect that, we inspect the function body: if it begins with the standard guard,
        # we surface SKIP. Simpler heuristic: run, and if profile mismatches the implicit guard
        # the function returns without raising. Track skip via a marker.
        is_mobile_only = name.startswith("test_mobile_")
        is_desktop_only = name.startswith("test_desktop_")
        if is_mobile_only and not ctx_cfg["is_mobile"]:
            result.status = "SKIP"
            result.message = "mobile-only test on desktop profile"
        elif is_desktop_only and ctx_cfg["is_mobile"]:
            result.status = "SKIP"
            result.message = "desktop-only test on mobile profile"
        else:
            test_fn(page, ctx_cfg)
            if page_errors:
                raise AssertionError(f"Uncaught page errors during test: {page_errors}")
    except AssertionError as exc:
        result.status = "FAIL"
        result.message = str(exc)
        result.traceback = traceback.format_exc()
        shot = SCREEN_DIR / f"{profile}-{name}-FAIL.png"
        try:
            page.screenshot(path=str(shot), full_page=True)
            result.screenshot = str(shot.relative_to(ROOT))
        except PlaywrightError:
            pass
    except Exception as exc:
        result.status = "FAIL"
        result.message = f"unexpected error: {exc}"
        result.traceback = traceback.format_exc()
        shot = SCREEN_DIR / f"{profile}-{name}-ERROR.png"
        try:
            page.screenshot(path=str(shot), full_page=True)
            result.screenshot = str(shot.relative_to(ROOT))
        except PlaywrightError:
            pass
    finally:
        result.duration_ms = int((time.time() - start) * 1000)
        context.close()
    return result


def main(argv: list[str]) -> int:
    selected = argv[1:] or ["desktop", "mobile"]
    bad = [p for p in selected if p not in PROFILES]
    if bad:
        print(f"Unknown profile(s): {bad}. Use: desktop, mobile")
        return 2

    results: list[TestResult] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            for profile_name in selected:
                cfg = PROFILES[profile_name]
                print(f"\n===== Running {profile_name} profile ({cfg['viewport']['width']}x{cfg['viewport']['height']}) =====")
                for test_fn in TESTS:
                    r = run_one(test_fn, browser, cfg)
                    results.append(r)
                    sym = {"PASS": "OK", "FAIL": "FAIL", "SKIP": "skip"}[r.status]
                    detail = f" — {r.message}" if r.message and r.status != "PASS" else ""
                    print(f"  [{sym:>4}] {r.name} ({r.duration_ms} ms){detail}")
        finally:
            browser.close()

    failures = [r for r in results if r.status == "FAIL"]
    passes = [r for r in results if r.status == "PASS"]
    skips = [r for r in results if r.status == "SKIP"]

    print("\n===== Summary =====")
    print(f"PASS: {len(passes)}    FAIL: {len(failures)}    SKIP: {len(skips)}")
    if failures:
        print("\nFailures:")
        for r in failures:
            print(f"  - [{r.profile}] {r.name}: {r.message}")

    RESULTS_PATH.write_text(
        json.dumps(
            [
                {
                    "name": r.name,
                    "profile": r.profile,
                    "status": r.status,
                    "message": r.message,
                    "screenshot": r.screenshot,
                    "duration_ms": r.duration_ms,
                    "traceback": r.traceback,
                }
                for r in results
            ],
            indent=2,
        )
    )
    print(f"\nDetailed results written to {RESULTS_PATH.relative_to(ROOT)}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
