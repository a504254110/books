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


def test_deep_dive_drawer(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(250)
    page.locator("#chapter-1 #concept-1 [data-open-deep]").first.click()
    page.wait_for_timeout(300)
    assert not page.locator("#drawer").evaluate("n => n.hidden"), "Drawer did not open"
    assert "Antifragility" in (page.locator("#drawerTitle").inner_text() or "")
    # Switch to Chinese tab
    page.locator("[data-drawer-lang='zh']").click()
    page.wait_for_timeout(200)
    zh_class = page.locator("#drawerContent").get_attribute("class") or ""
    assert "zh" in zh_class, f"Drawer did not switch to Chinese content, class={zh_class!r}"
    # Close via backdrop. The drawer overlays the backdrop's center, so we tap the
    # backdrop near the top-left corner where only the backdrop should be at that point.
    page.locator("#drawerBackdrop").click(position={"x": 2, "y": 2})
    page.wait_for_timeout(300)
    assert page.locator("#drawer").evaluate("n => n.hidden"), "Drawer should hide after backdrop click"


def test_drawer_closes_on_escape(page: Page, ctx: dict) -> None:
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(250)
    page.locator("#chapter-1 #concept-1 [data-open-deep]").first.click()
    page.wait_for_timeout(300)
    assert not page.locator("#drawer").evaluate("n => n.hidden")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    assert page.locator("#drawer").evaluate("n => n.hidden"), "Drawer should close on Escape"


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
    """Quick smoke walk: overview -> chapter 1 -> deep dive -> quiz -> search."""
    events = {"errors": [], "pageerrors": []}
    page.on("console", lambda msg: events["errors"].append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: events["pageerrors"].append(str(exc)))

    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(200)
    page.locator("#chapter-1 #concept-1 [data-open-deep]").first.click()
    page.wait_for_timeout(200)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
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


def test_mobile_drawer_fits_viewport(page: Page, ctx: dict) -> None:
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    page.locator("#overview button[data-view-target='chapter-1']").click()
    page.wait_for_timeout(200)
    page.locator("#chapter-1 #concept-1 [data-open-deep]").first.click()
    page.wait_for_timeout(300)
    box = page.locator("#drawer").bounding_box()
    vp = ctx["viewport"]
    assert box is not None, "Drawer has no bounding box"
    assert box["x"] >= 0 and box["x"] + box["width"] <= vp["width"] + 1, (
        f"Drawer overflows viewport horizontally: x={box['x']}, w={box['width']}, vp={vp['width']}"
    )


def test_mobile_topbar_visible(page: Page, ctx: dict) -> None:
    if not ctx["is_mobile"]:
        return
    reset_storage(page)
    assert page.locator(".topbar").is_visible(), "Topbar should be visible on mobile"
    display = page.evaluate("() => getComputedStyle(document.querySelector('.topbar')).display")
    assert display == "flex", f"Topbar expected flex on mobile, got {display}"


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


# ----------------------------- runner ------------------------------------ #

TESTS: list[Callable[[Page, dict], None]] = [
    test_initial_load_overview,
    test_all_chapters_mounted,
    test_search_index_built,
    test_theme_toggle,
    test_language_toggle,
    test_overview_start_chapter_one,
    test_overview_start_quiz,
    test_deep_dive_drawer,
    test_drawer_closes_on_escape,
    test_quiz_navigation_and_reveal,
    test_quiz_related_navigation,
    test_quiz_persistence,
    test_search_keyboard_navigation,
    test_search_no_results,
    test_cmd_k_shortcut,
    test_view_persistence,
    test_chapter_collapse_toggle,
    test_no_console_errors_on_main_paths,
    # mobile-only
    test_mobile_menu_button_clickable,
    test_mobile_sidebar_open_close,
    test_mobile_sidebar_closes_on_navigation,
    test_mobile_drawer_fits_viewport,
    test_mobile_topbar_visible,
    # desktop-only
    test_desktop_topbar_hidden,
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
