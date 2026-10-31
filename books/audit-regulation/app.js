(() => {
  "use strict";

  const data = window.BOOK_DATA;
  const bookElement = document.getElementById("book");
  const bookFrame = document.getElementById("book-frame");
  const gutter = document.getElementById("book-gutter");
  const coverEntry = document.getElementById("cover-entry");
  const coverImage = document.getElementById("cover-image");
  const openCoverButton = document.getElementById("open-cover");
  const contentsDrawer = document.getElementById("contents-drawer");
  const drawerScrim = document.getElementById("drawer-scrim");
  const openContentsButton = document.getElementById("open-contents");
  const closeContentsButton = document.getElementById("close-contents");
  const searchDrawer = document.getElementById("search-drawer");
  const searchScrim = document.getElementById("search-scrim");
  const openSearchButton = document.getElementById("open-search");
  const closeSearchButton = document.getElementById("close-search");
  const searchInput = document.getElementById("search-input");
  const clearSearchButton = document.getElementById("clear-search");
  const searchStatus = document.getElementById("search-status");
  const searchResults = document.getElementById("search-results");
  const previousButtons = [
    document.getElementById("previous-page"),
    document.getElementById("previous-page-mobile"),
  ];
  const nextButtons = [
    document.getElementById("next-page"),
    document.getElementById("next-page-mobile"),
  ];
  const pageNumber = document.getElementById("page-number");
  const currentLocation = document.getElementById("current-location");
  const progress = document.getElementById("reading-progress");
  const progressBar = document.getElementById("reading-progress-bar");
  const fullscreenButton = document.getElementById("toggle-fullscreen");
  const frontMatterList = document.getElementById("front-matter-list");
  const chapterList = document.getElementById("chapter-list");
  const pdfLink = document.getElementById("pdf-link");
  const bookTitle = document.getElementById("book-title");
  const bookEdition = document.getElementById("book-edition");

  if (!data || !window.St || !window.lucide) {
    document.body.classList.add("is-ready");
    return;
  }

  const totalPages = data.totalPages;
  const savedPage = readSavedPage();
  const startingPage = Math.min(Math.max(savedPage, 0), totalPages - 1);
  let pageFlip = null;
  let currentPageIndex = startingPage;
  let coverMode = startingPage === 0;
  let openingCover = false;
  let closingToCover = false;
  let drawerOpen = false;
  let drawerHideTimer = 0;
  let searchOpen = false;
  let searchHideTimer = 0;
  let searchDebounceTimer = 0;
  let drawerReturnFocus = null;
  let searchReturnFocus = null;
  let searchMatches = [];
  let selectedMatch = null;

  const displayTitle = data.title.replace(/（[^）]+）$/, "");
  bookTitle.textContent = displayTitle;
  bookEdition.textContent = `法规阅读本 · ${data.edition}`;
  coverImage.src = data.pages[0].src;
  coverImage.alt = `${data.title}封面`;
  openCoverButton.setAttribute("aria-label", `翻开${data.title}`);
  document.title = data.title;
  pdfLink.href = data.pdfHref;
  progress.setAttribute("aria-valuemax", String(totalPages));

  buildContents();
  buildBookPages();
  syncLucide();

  pageFlip = new window.St.PageFlip(bookElement, {
    width: 420,
    height: 595,
    size: "stretch",
    minWidth: 230,
    maxWidth: 540,
    minHeight: 326,
    maxHeight: 766,
    drawShadow: true,
    flippingTime: 880,
    usePortrait: true,
    startPage: startingPage,
    autoSize: true,
    maxShadowOpacity: 0.34,
    showCover: true,
    mobileScrollSupport: true,
    swipeDistance: 24,
    clickEventForward: true,
    useMouseEvents: true,
    showPageCorners: true,
    disableFlipByClick: false,
  });

  pageFlip.on("init", (event) => {
    updateReadingState(event.data);
    if (startingPage === 0) {
      showCoverMode();
    } else {
      coverEntry.classList.add("is-hidden");
    }
    document.body.classList.add("is-ready");
  });

  pageFlip.on("flip", (event) => {
    const pageIndex = Number(event.data);
    updateReadingState(pageIndex);
    savePage(pageIndex);
    if (selectedMatch) {
      window.setTimeout(applySelectedHighlight, 80);
    }
    if (pageIndex === 0 && closingToCover) {
      closingToCover = false;
      window.setTimeout(showCoverMode, 180);
    }
  });

  pageFlip.on("changeOrientation", () => {
    window.setTimeout(() => {
      updateReadingState(pageFlip.getCurrentPageIndex());
      ensureCoverState();
      if (selectedMatch) {
        applySelectedHighlight();
      }
    }, 60);
  });

  preloadPageImages().finally(() => {
    pageFlip.loadFromHTML(bookElement.querySelectorAll(".book-page"));
  });

  previousButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (coverMode) {
        return;
      }
      if (currentPageIndex <= 1) {
        closingToCover = true;
      }
      if (currentPageIndex > 0) {
        pageFlip.flipPrev("bottom");
      }
    });
  });

  nextButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (coverMode) {
        openBook();
        return;
      }
      if (currentPageIndex < totalPages - 1) {
        pageFlip.flipNext("bottom");
      }
    });
  });

  openCoverButton.addEventListener("click", openBook);
  openContentsButton.addEventListener("click", () => {
    closeSearchPanel(false);
    openDrawer();
  });
  closeContentsButton.addEventListener("click", () => closeDrawer());
  drawerScrim.addEventListener("click", () => closeDrawer());
  openSearchButton.addEventListener("click", () => {
    closeDrawer(false);
    openSearchPanel();
  });
  closeSearchButton.addEventListener("click", () => closeSearchPanel());
  searchScrim.addEventListener("click", () => closeSearchPanel());
  clearSearchButton.addEventListener("click", clearSearch);
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", handleSearchInputKeydown);

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Some file:// browsers do not expose the Fullscreen API.
    }
  });

  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("keydown", handleKeyboard);

  window.addEventListener("resize", () => {
    window.clearTimeout(window.__bookResizeTimer);
    window.__bookResizeTimer = window.setTimeout(() => {
      updateReadingState(pageFlip.getCurrentPageIndex());
      if (selectedMatch) {
        applySelectedHighlight();
      }
    }, 120);
  });

  function buildContents() {
    data.frontMatter.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "front-link";
      button.textContent = item.title;
      button.addEventListener("click", () => navigateToPage(item.page));
      button.dataset.page = String(item.page);
      frontMatterList.appendChild(button);
    });

    data.chapters.forEach((chapter, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chapter-link";
      button.dataset.page = String(chapter.page);
      button.dataset.chapterIndex = String(index);
      button.innerHTML = `
        <span class="chapter-thumb">
          <img src="${chapter.thumb}" alt="" loading="lazy">
        </span>
        <span class="chapter-copy">
          <strong>${chapter.number}　${chapter.title}</strong>
          <span>${chapter.range}</span>
        </span>
        <span class="chapter-page">${chapter.page}</span>
      `;
      button.addEventListener("click", () => navigateToPage(chapter.page));
      chapterList.appendChild(button);
    });
  }

  function buildBookPages() {
    data.pages.forEach((page, index) => {
      const pageElement = document.createElement("div");
      pageElement.className = "book-page";
      pageElement.dataset.pageNumber = String(index + 1);
      pageElement.dataset.density =
        index === 0 || index === totalPages - 1 ? "hard" : "soft";

      const image = document.createElement("img");
      image.src = page.src;
      image.alt = `${data.title}第${index + 1}页`;
      image.draggable = false;
      image.loading = "eager";
      image.decoding = "async";

      const highlightLayer = document.createElement("div");
      highlightLayer.className = "page-highlight-layer";
      pageElement.append(image, highlightLayer);
      bookElement.appendChild(pageElement);
    });
  }

  async function preloadPageImages() {
    await Promise.all(
      data.pages.slice(0, 4).map(
        (page) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = resolve;
            image.src = page.src;
          }),
      ),
    );
  }

  function navigateToPage(pageNumberValue) {
    const targetIndex = Math.min(Math.max(pageNumberValue - 1, 0), totalPages - 1);
    closeDrawer(false);
    exitCoverMode();
    if (targetIndex === currentPageIndex) {
      return;
    }
    window.setTimeout(() => {
      pageFlip.flip(targetIndex, "bottom");
    }, 120);
  }

  function updateReadingState(rawIndex) {
    currentPageIndex = Math.min(Math.max(Number(rawIndex) || 0, 0), totalPages - 1);
    const firstVisiblePage = currentPageIndex + 1;
    const orientation = pageFlip.getOrientation();
    const isSpread =
      orientation === "landscape" &&
      currentPageIndex > 0 &&
      currentPageIndex < totalPages - 1;
    const lastVisiblePage = isSpread
      ? Math.min(firstVisiblePage + 1, totalPages)
      : firstVisiblePage;
    const pageText =
      lastVisiblePage > firstVisiblePage
        ? `${firstVisiblePage}-${lastVisiblePage} / ${totalPages}`
        : `${firstVisiblePage} / ${totalPages}`;
    const percentage = Math.min(
      100,
      Math.max(2, (lastVisiblePage / totalPages) * 100),
    );

    pageNumber.textContent = pageText;
    progressBar.style.width = `${percentage}%`;
    progress.setAttribute("aria-valuenow", String(lastVisiblePage));
    progress.setAttribute(
      "aria-valuetext",
      firstVisiblePage === lastVisiblePage
        ? `第 ${firstVisiblePage} 页，共 ${totalPages} 页`
        : `第 ${firstVisiblePage} 至 ${lastVisiblePage} 页，共 ${totalPages} 页`,
    );
    currentLocation.textContent = locationLabel(lastVisiblePage);
    gutter.classList.toggle("is-visible", isSpread);

    previousButtons.forEach((button) => {
      button.disabled = currentPageIndex <= 0;
    });
    nextButtons.forEach((button) => {
      button.disabled = currentPageIndex >= totalPages - 1;
    });
    updateContentsHighlight(lastVisiblePage);
  }

  function locationLabel(page) {
    if (page <= 1) {
      return "封面";
    }
    if (page === 2) {
      return "编辑说明";
    }
    if (page === 3) {
      return "目录";
    }

    let activeChapter = null;
    for (const chapter of data.chapters) {
      if (chapter.page <= page) {
        activeChapter = chapter;
      } else {
        break;
      }
    }
    return activeChapter
      ? `${activeChapter.number}　${activeChapter.title}`
      : `第 ${page} 页`;
  }

  function updateContentsHighlight(page) {
    frontMatterList.querySelectorAll(".front-link").forEach((button) => {
      button.classList.toggle("is-current", Number(button.dataset.page) === page);
    });

    let activeChapterIndex = -1;
    data.chapters.forEach((chapter, index) => {
      if (chapter.page <= page) {
        activeChapterIndex = index;
      }
    });
    chapterList.querySelectorAll(".chapter-link").forEach((button) => {
      button.classList.toggle(
        "is-current",
        Number(button.dataset.chapterIndex) === activeChapterIndex,
      );
    });
  }

  function openDrawer() {
    if (drawerOpen) {
      return;
    }
    drawerOpen = true;
    drawerReturnFocus = document.activeElement;
    window.clearTimeout(drawerHideTimer);
    contentsDrawer.hidden = false;
    drawerScrim.hidden = false;
    contentsDrawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      contentsDrawer.classList.add("is-open");
      drawerScrim.classList.add("is-visible");
      closeContentsButton.focus();
    });
  }

  function closeDrawer(restoreFocus = true) {
    if (!drawerOpen) {
      return;
    }
    drawerOpen = false;
    contentsDrawer.classList.remove("is-open");
    contentsDrawer.setAttribute("aria-hidden", "true");
    drawerScrim.classList.remove("is-visible");
    drawerHideTimer = window.setTimeout(() => {
      contentsDrawer.hidden = true;
      drawerScrim.hidden = true;
    }, 260);

    if (restoreFocus && drawerReturnFocus?.focus) {
      drawerReturnFocus.focus();
    }
    drawerReturnFocus = null;
  }

  function openSearchPanel() {
    if (searchOpen) {
      return;
    }
    searchOpen = true;
    searchReturnFocus = document.activeElement;
    window.clearTimeout(searchHideTimer);
    searchDrawer.hidden = false;
    searchScrim.hidden = false;
    searchDrawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      searchDrawer.classList.add("is-open");
      searchScrim.classList.add("is-visible");
      searchInput.focus();
      searchInput.select();
    });
  }

  function closeSearchPanel(restoreFocus = true) {
    if (!searchOpen) {
      return;
    }
    searchOpen = false;
    searchDrawer.classList.remove("is-open");
    searchDrawer.setAttribute("aria-hidden", "true");
    searchScrim.classList.remove("is-visible");
    searchHideTimer = window.setTimeout(() => {
      searchDrawer.hidden = true;
      searchScrim.hidden = true;
    }, 260);

    if (restoreFocus && searchReturnFocus?.focus) {
      searchReturnFocus.focus();
    }
    searchReturnFocus = null;
  }

  function openBook() {
    if (!coverMode || openingCover) {
      return;
    }
    openingCover = true;
    coverEntry.classList.add("is-opening");
    window.setTimeout(() => {
      pageFlip.turnToPage(1);
      coverMode = false;
      openingCover = false;
      bookFrame.classList.remove("is-cover-mode");
      coverEntry.classList.remove("is-opening");
      coverEntry.classList.add("is-hidden");
      updateReadingState(1);
      savePage(1);
    }, 430);
  }

  function showCoverMode() {
    if (openingCover) {
      return;
    }
    coverMode = true;
    bookFrame.classList.add("is-cover-mode");
    coverEntry.hidden = false;
    coverEntry.classList.remove("is-opening", "is-hidden");
    updateReadingState(0);
  }

  function exitCoverMode() {
    coverMode = false;
    openingCover = false;
    bookFrame.classList.remove("is-cover-mode");
    coverEntry.classList.remove("is-opening");
    coverEntry.classList.add("is-hidden");
  }

  function ensureCoverState() {
    if (currentPageIndex === 0 && !coverMode && !openingCover) {
      showCoverMode();
    } else if (currentPageIndex > 0 && coverMode) {
      exitCoverMode();
    }
  }

  function handleSearchInput() {
    const query = searchInput.value;
    clearSearchButton.hidden = query.length === 0;
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => runSearch(query), 120);
  }

  function handleSearchInputKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (searchMatches.length > 0) {
        selectSearchResult(searchMatches[0]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearchPanel();
    }
  }

  function runSearch(queryValue) {
    const query = normalizeSearch(queryValue);
    searchMatches = [];
    selectedMatch = null;
    clearHighlights();

    if (!query) {
      searchStatus.textContent = "";
      searchResults.replaceChildren();
      return;
    }

    const limit = 200;
    const firstSearchablePage = Math.max(0, data.chapters[0].page - 1);
    for (
      let pageIndex = firstSearchablePage;
      pageIndex < data.pages.length;
      pageIndex += 1
    ) {
      const page = data.pages[pageIndex];
      let from = 0;
      while (searchMatches.length < limit) {
        const start = page.text.indexOf(query, from);
        if (start < 0) {
          break;
        }
        searchMatches.push({
          pageIndex,
          start,
          end: start + query.length,
          chapter: page.chapter,
        });
        from = start + Math.max(1, query.length);
      }
      if (searchMatches.length >= limit) {
        break;
      }
    }

    searchStatus.textContent =
      searchMatches.length === 0
        ? "没有找到匹配内容"
        : searchMatches.length >= limit
          ? `找到 ${searchMatches.length}+ 处，显示前 ${limit} 处`
          : `找到 ${searchMatches.length} 处`;
    renderSearchResults();
  }

  function renderSearchResults() {
    searchResults.replaceChildren();
    if (searchMatches.length === 0) {
      if (searchInput.value.trim()) {
        const empty = document.createElement("div");
        empty.className = "search-empty";
        empty.textContent = "请尝试更短的词语、条文编号或不同表述。";
        searchResults.appendChild(empty);
      }
      return;
    }

    const totalsByPage = new Map();
    searchMatches.forEach((match) => {
      totalsByPage.set(
        match.pageIndex,
        (totalsByPage.get(match.pageIndex) || 0) + 1,
      );
    });
    const seenByPage = new Map();
    const fragment = document.createDocumentFragment();
    searchMatches.forEach((match) => {
      const ordinal = (seenByPage.get(match.pageIndex) || 0) + 1;
      seenByPage.set(match.pageIndex, ordinal);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.dataset.page = String(match.pageIndex + 1);

      const meta = document.createElement("span");
      meta.className = "search-result-meta";
      const chapterLabel = document.createElement("strong");
      chapterLabel.textContent = match.chapter;
      const pageLabel = document.createElement("span");
      pageLabel.textContent =
        `第 ${match.pageIndex + 1} 页 · ` +
        `${ordinal}/${totalsByPage.get(match.pageIndex)}`;
      meta.append(chapterLabel, pageLabel);

      const excerpt = buildExcerpt(match);
      button.append(meta, excerpt);
      button.addEventListener("click", () => selectSearchResult(match));
      fragment.appendChild(button);
    });
    searchResults.appendChild(fragment);
  }

  function buildExcerpt(match) {
    const page = data.pages[match.pageIndex];
    const displayStart = Math.max(0, match.start - 18);
    const displayEnd = Math.min(page.text.length, match.end + 42);
    const excerpt = document.createElement("span");
    excerpt.className = "search-result-excerpt";
    if (displayStart > 0) {
      excerpt.append("…");
    }
    excerpt.append(page.text.slice(displayStart, match.start));
    const mark = document.createElement("mark");
    mark.textContent = page.text.slice(match.start, match.end);
    excerpt.appendChild(mark);
    excerpt.append(page.text.slice(match.end, displayEnd));
    if (displayEnd < page.text.length) {
      excerpt.append("…");
    }
    return excerpt;
  }

  function selectSearchResult(match) {
    selectedMatch = match;
    closeSearchPanel(false);
    exitCoverMode();
    applySelectedHighlight();
    const targetIndex = visibleTargetIndex(match.pageIndex);
    if (targetIndex !== currentPageIndex) {
      pageFlip.flip(targetIndex, "bottom");
    }
  }

  function visibleTargetIndex(pageIndex) {
    if (
      pageFlip.getOrientation() === "landscape" &&
      pageIndex > 0 &&
      pageIndex < totalPages - 1
    ) {
      return pageIndex % 2 === 0 ? pageIndex - 1 : pageIndex;
    }
    return pageIndex;
  }

  function applySelectedHighlight() {
    clearHighlights();
    if (!selectedMatch) {
      return;
    }
    const pageNumberTarget = selectedMatch.pageIndex + 1;
    const page = data.pages[selectedMatch.pageIndex];
    const nodes = document.querySelectorAll(
      `.book-page[data-page-number="${pageNumberTarget}"] .page-highlight-layer`,
    );
    if (nodes.length === 0) {
      return;
    }

    const lines = new Map();
    page.chars
      .slice(selectedMatch.start, selectedMatch.end)
      .forEach((charBox) => {
        const line = Number(charBox[0]);
        const current = lines.get(line);
        if (!current) {
          lines.set(line, {
            x0: Number(charBox[1]),
            y0: Number(charBox[2]),
            x1: Number(charBox[3]),
            y1: Number(charBox[4]),
          });
        } else {
          current.x0 = Math.min(current.x0, Number(charBox[1]));
          current.y0 = Math.min(current.y0, Number(charBox[2]));
          current.x1 = Math.max(current.x1, Number(charBox[3]));
          current.y1 = Math.max(current.y1, Number(charBox[4]));
        }
      });
    const boxes = Array.from(lines.values());
    nodes.forEach((layer) => {
      boxes.forEach((box) => {
        const hit = document.createElement("span");
        hit.className = "search-hit is-selected";
        hit.style.left = `${box.x0 * 100}%`;
        hit.style.top = `${box.y0 * 100}%`;
        hit.style.width = `${(box.x1 - box.x0) * 100}%`;
        hit.style.height = `${(box.y1 - box.y0) * 100}%`;
        layer.appendChild(hit);
      });
    });
  }

  function clearHighlights() {
    document.querySelectorAll(".page-highlight-layer").forEach((layer) => {
      layer.replaceChildren();
    });
  }

  function clearSearch() {
    searchInput.value = "";
    clearSearchButton.hidden = true;
    searchStatus.textContent = "";
    searchMatches = [];
    selectedMatch = null;
    searchResults.replaceChildren();
    clearHighlights();
    searchInput.focus();
  }

  function normalizeSearch(value) {
    return String(value || "")
      .toLocaleLowerCase()
      .replace(/\s+/g, "");
  }

  function handleKeyboard(event) {
    if (searchOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearchPanel();
      } else if (event.key === "Tab") {
        trapFocus(searchDrawer, event);
      }
      return;
    }

    if (drawerOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === "Tab") {
        trapFocus(contentsDrawer, event);
      }
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLocaleLowerCase() === "f"
    ) {
      event.preventDefault();
      openSearchPanel();
      return;
    }

    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      if (coverMode) {
        return;
      }
      if (currentPageIndex <= 1) {
        closingToCover = true;
      }
      if (currentPageIndex > 0) {
        pageFlip.flipPrev("bottom");
      }
    } else if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      if (coverMode) {
        openBook();
        return;
      }
      if (currentPageIndex < totalPages - 1) {
        pageFlip.flipNext("bottom");
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      closingToCover = true;
      pageFlip.flip(0, "bottom");
    } else if (event.key === "End") {
      event.preventDefault();
      pageFlip.flip(totalPages - 1, "bottom");
    }
  }

  function trapFocus(container, event) {
    const focusable = Array.from(
      container.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateFullscreenButton() {
    const active = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute("aria-label", active ? "退出全屏" : "进入全屏");
    fullscreenButton.dataset.tooltip = active ? "退出全屏" : "全屏";
    fullscreenButton.innerHTML = `
      <i data-lucide="${active ? "minimize" : "maximize"}" aria-hidden="true"></i>
    `;
    syncLucide();
  }

  function syncLucide() {
    if (window.lucide?.createIcons) {
      window.lucide.createIcons({
        attrs: { width: 17, height: 17, "stroke-width": 1.7 },
      });
    }
  }

  function readSavedPage() {
    try {
      return Number.parseInt(
        localStorage.getItem(data.storageKey || "book-page") || "0",
        10,
      );
    } catch {
      return 0;
    }
  }

  function savePage(index) {
    try {
      localStorage.setItem(data.storageKey || "book-page", String(index));
    } catch {
      // Reading remains fully functional when file:// storage is unavailable.
    }
  }
})();
