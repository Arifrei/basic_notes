(function () {
  /* ============================================================
     STATE & BOOTSTRAP
     ============================================================ */
  var CHAT_KEY = "clearcut-ask-v1";
  var bootstrapNode = document.getElementById("bootstrap-data");
  var bootstrap = bootstrapNode ? JSON.parse(bootstrapNode.textContent || "{}") : { notes: [], folders: [] };

  var state = {
    notes: sortByRecent(bootstrap.notes || []),
    folders: sortFolders(bootstrap.folders || []),
    view: "library",            // "library" | "noteView" | "edit"
    selectedId: null,
    search: "",
    activeFilter: null,         // null = all, "unfiled", or folder_id
    sort: "recent",             // "recent" | "az"
    bulkMode: false,
    selectedIds: new Set(),
    editorTab: "write",
    editorContent: "",
    originalContent: "",
    saveBusy: false,
    previewTimer: null,
    askOpen: false,
    chatMessages: loadChat(),
    chatLoading: false,
    markdownCache: new Map(),
    importText: "",
    importBusy: false,
    moveBusy: false,
    moveTarget: "bulk",         // "bulk" or a single note id
  };

  /* ============================================================
     ELEMENT REFS
     ============================================================ */
  var els = {};
  function initEls() {
    els = {
      libraryView:    $("library-view"),
      noteView:       $("note-view"),
      editView:       $("edit-view"),
      noteCountLabel: $("note-count-label"),
      searchInput:    $("search-input"),
      filterRow:      $("filter-row"),
      bulkBar:        $("bulk-bar"),
      bulkLabel:      $("bulk-label"),
      bulkSelectAll:  $("bulk-select-all-btn"),
      bulkMoveBtn:    $("bulk-move-btn"),
      bulkDeleteBtn:  $("bulk-delete-btn"),
      bulkDoneBtn:    $("bulk-done-btn"),
      notesList:      $("notes-list"),
      newNoteBtn:     $("new-note-btn"),
      askOpenBtn:     $("ask-open-btn"),
      backBtn:        $("back-to-library"),
      askAboutBtn:    $("ask-about-btn"),
      shareBtn:       $("share-btn"),
      moveNoteBtn:    $("move-note-btn"),
      editBtn:        $("edit-btn"),
      deleteBtn:      $("delete-btn"),
      noteMeta:       $("note-meta"),
      noteBody:       $("note-body"),
      cancelEditBtn:  $("cancel-edit-btn"),
      tabWrite:       $("tab-write"),
      tabPreview:     $("tab-preview"),
      editorStatus:   $("editor-status"),
      saveBtn:        $("save-btn"),
      formatToolbar:  $("format-toolbar"),
      writePane:      $("write-pane"),
      previewPane:    $("preview-pane"),
      editorTextarea: $("editor-textarea"),
      editorPreview:  $("editor-preview"),
      askPalette:     $("ask-palette"),
      askBackdrop:    $("ask-backdrop"),
      askInput:       $("ask-input"),
      askCloseBtn:    $("ask-close-btn"),
      askBody:        $("ask-body"),
      askSuggestions: $("ask-suggestions"),
      askMessages:    $("ask-messages"),
      askClearBtn:    $("ask-clear-btn"),
      shareModal:     $("share-modal"),
      shareUrl:       $("share-url"),
      copyShareBtn:   $("copy-share-btn"),
      openPublicLink: $("open-public-link"),
      moveModal:      $("move-modal"),
      moveModalTitle: $("move-modal-title"),
      moveUnfiled:    $("move-unfiled-btn"),
      moveCreate:     $("move-create-folder-btn"),
      moveFolderList: $("move-folder-list"),
      importModal:    $("import-modal"),
      importTextarea: $("import-textarea"),
      importPreview:  $("import-preview"),
      importCancelBtn:$("import-cancel-btn"),
      importBtn:      $("import-btn"),
      toastContainer: $("toast-container"),
    };
  }

  function $(id) { return document.getElementById(id); }

  /* ============================================================
     INIT
     ============================================================ */
  initEls();
  bindEvents();
  restoreRoute();
  render();

  /* ============================================================
     ROUTING (hash-based)
     ============================================================ */
  function navigate(hash, replace) {
    if (replace) {
      history.replaceState(null, "", hash);
    } else {
      history.pushState(null, "", hash);
    }
    applyRoute(hash);
  }

  function restoreRoute() {
    applyRoute(location.hash || "#/");
  }

  function applyRoute(hash) {
    var editMatch = hash.match(/^#\/note\/([^/]+)\/edit$/);
    var viewMatch = hash.match(/^#\/note\/([^/]+)$/);

    if (editMatch) {
      var noteId = editMatch[1];
      var note = findNote(noteId);
      if (note) {
        state.selectedId = noteId;
        state.view = "edit";
        state.editorTab = "write";
        state.editorContent = note.content;
        state.originalContent = note.content;
      } else {
        state.view = "library";
      }
    } else if (viewMatch) {
      var noteId2 = viewMatch[1];
      var note2 = findNote(noteId2);
      if (note2) {
        state.selectedId = noteId2;
        state.view = "noteView";
      } else {
        state.view = "library";
      }
    } else {
      state.view = "library";
    }
    render();
  }

  window.addEventListener("popstate", function () {
    restoreRoute();
  });

  /* ============================================================
     EVENTS
     ============================================================ */
  function bindEvents() {
    // Library
    els.newNoteBtn.addEventListener("click", function () { createNote(null); });
    els.askOpenBtn.addEventListener("click", openAsk);
    els.searchInput.addEventListener("input", function (e) {
      state.search = e.target.value || "";
      renderLibrary();
    });
    els.notesList.addEventListener("click", handleNoteListClick);
    els.filterRow.addEventListener("click", handleFilterClick);

    // Bulk
    els.bulkSelectAll.addEventListener("click", selectAllVisible);
    els.bulkMoveBtn.addEventListener("click", function () { openMoveModal("bulk"); });
    els.bulkDeleteBtn.addEventListener("click", deleteSelectedNotes);
    els.bulkDoneBtn.addEventListener("click", function () { toggleBulkMode(false); });

    // Note view
    els.backBtn.addEventListener("click", function () { navigate("#/"); });
    els.askAboutBtn.addEventListener("click", function () {
      var note = selectedNote();
      if (note) {
        openAsk();
        els.askInput.value = "Tell me about " + note.title;
      }
    });
    els.shareBtn.addEventListener("click", function () { openShareModal(); });
    els.moveNoteBtn.addEventListener("click", function () {
      var note = selectedNote();
      if (note) openMoveModal(note.id);
    });
    els.editBtn.addEventListener("click", function () {
      if (state.selectedId) navigate("#/note/" + state.selectedId + "/edit");
    });
    els.deleteBtn.addEventListener("click", function () {
      var note = selectedNote();
      if (note) deleteNote(note.id);
    });

    // Edit view
    els.cancelEditBtn.addEventListener("click", cancelEdit);
    els.tabWrite.addEventListener("click", function () { setEditorTab("write"); });
    els.tabPreview.addEventListener("click", function () { setEditorTab("preview"); });
    els.saveBtn.addEventListener("click", saveNote);
    els.editorTextarea.addEventListener("input", function (e) {
      state.editorContent = e.target.value;
      updateEditorStatus();
      if (state.editorTab === "preview") schedulePreview();
    });
    els.formatToolbar.addEventListener("click", function (e) {
      var btn = e.target.closest(".fmt-btn");
      if (!btn) return;
      if (btn.dataset.wrap) wrapSelection(btn.dataset.wrap, btn.dataset.wrap, "text");
      else if (btn.dataset.prefix) linePrefix(btn.dataset.prefix);
    });

    // Ask palette
    els.askBackdrop.addEventListener("click", closeAsk);
    els.askCloseBtn.addEventListener("click", closeAsk);
    els.askClearBtn.addEventListener("click", resetChat);
    els.askInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    els.askBody.addEventListener("click", function (e) {
      var suggestion = e.target.closest(".suggestion-btn");
      if (suggestion) {
        els.askInput.value = suggestion.dataset.suggestion || "";
        els.askInput.focus();
      }
      var chip = e.target.closest("[data-source-note]");
      if (chip) {
        closeAsk();
        navigate("#/note/" + chip.dataset.sourceNote);
      }
    });

    // Modals
    document.addEventListener("click", function (e) {
      var close = e.target.closest("[data-close-modal]");
      if (close) closeModal(close.dataset.closeModal);
    });
    els.copyShareBtn.addEventListener("click", copyShareUrl);
    els.moveUnfiled.addEventListener("click", function () { executeMoveTarget(null); });
    els.moveCreate.addEventListener("click", createFolderAndMove);
    els.moveFolderList.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-move-folder-id]");
      if (btn) executeMoveTarget(btn.dataset.moveFolderId);
    });
    els.importTextarea.addEventListener("input", function (e) {
      state.importText = e.target.value || "";
      renderImportPreview();
    });
    els.importCancelBtn.addEventListener("click", function () { closeModal("import"); });
    els.importBtn.addEventListener("click", importBulkNotes);

    // Keyboard
    document.addEventListener("keydown", function (e) {
      // Cmd/Ctrl+K toggles ask
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (state.askOpen) closeAsk(); else openAsk();
        return;
      }
      if (e.key === "Escape") {
        if (state.askOpen) { closeAsk(); return; }
        if (!els.shareModal.classList.contains("hidden")) { closeModal("share"); return; }
        if (!els.moveModal.classList.contains("hidden")) { closeModal("move"); return; }
        if (!els.importModal.classList.contains("hidden")) { closeModal("import"); return; }
        if (state.view !== "library") { navigate("#/"); }
      }
    });

    // Warn on unsaved
    window.addEventListener("beforeunload", function (e) {
      if (state.view === "edit" && editorDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  /* ============================================================
     RENDER DISPATCHER
     ============================================================ */
  function render() {
    els.libraryView.classList.toggle("hidden", state.view !== "library");
    els.noteView.classList.toggle("hidden", state.view !== "noteView");
    els.editView.classList.toggle("hidden", state.view !== "edit");

    if (state.view === "library") renderLibrary();
    if (state.view === "noteView") renderNoteView();
    if (state.view === "edit") renderEditor();
    renderAsk();
  }

  /* ============================================================
     LIBRARY RENDERING
     ============================================================ */
  function renderLibrary() {
    els.noteCountLabel.textContent = state.notes.length + " note" + (state.notes.length === 1 ? "" : "s");
    renderFilterRow();
    renderBulkBar();
    renderNotesList();
  }

  function renderFilterRow() {
    var folderIcon = '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4.5A1.5 1.5 0 013.5 3h2.38a1 1 0 01.78.37L7.5 4.5H10.5A1.5 1.5 0 0112 6v4.5A1.5 1.5 0 0110.5 12h-7A1.5 1.5 0 012 10.5z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var sortIcon = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3.5 2v9M3.5 2L1.5 4M3.5 2l2 2M9.5 11V2M9.5 11l-2-2M9.5 11l2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var importIcon = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M4 2H3a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V3a1 1 0 00-1-1H9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><rect x="4.5" y="1" width="4" height="2" rx=".6" stroke="currentColor" stroke-width="1.1"/></svg>';

    var html = "";

    // All notes pill
    var allCount = state.notes.length;
    html += pill("all", folderIcon, "All notes", allCount, state.activeFilter === null);

    // Unfiled pill
    var unfiledCount = state.notes.filter(function (n) { return !n.folder_id; }).length;
    html += pill("unfiled", folderIcon, "Unfiled", unfiledCount, state.activeFilter === "unfiled");

    // Folder pills
    state.folders.forEach(function (folder) {
      var count = state.notes.filter(function (n) { return n.folder_id === folder.id; }).length;
      html += pill(folder.id, folderIcon, folder.name, count, state.activeFilter === folder.id);
    });

    // Add folder pill
    html += '<button class="filter-pill filter-pill-add" data-filter-action="add-folder" type="button" title="New folder">+</button>';

    // Separator + controls
    html += '<span class="filter-sep"></span>';
    html += '<button class="control-btn" data-filter-action="sort" type="button">' + sortIcon + " " + (state.sort === "recent" ? "Recent" : "A\u2013Z") + "</button>";
    html += '<button class="control-btn" data-filter-action="select" type="button">Select</button>';
    html += '<button class="control-btn" data-filter-action="import" type="button">' + importIcon + " Import</button>";

    els.filterRow.innerHTML = html;
  }

  function pill(key, icon, label, count, active) {
    return '<button class="filter-pill' + (active ? " active" : "") + '" data-filter="' + esc(key) + '" type="button">' +
      icon + " " + esc(label) + ' <span class="filter-pill-count">' + count + "</span></button>";
  }

  function handleFilterClick(e) {
    var pill = e.target.closest("[data-filter]");
    if (pill) {
      var key = pill.dataset.filter;
      if (key === "all") state.activeFilter = null;
      else if (key === "unfiled") state.activeFilter = "unfiled";
      else state.activeFilter = key;
      renderLibrary();
      return;
    }
    var action = e.target.closest("[data-filter-action]");
    if (!action) return;
    var act = action.dataset.filterAction;
    if (act === "sort") {
      state.sort = state.sort === "recent" ? "az" : "recent";
      renderLibrary();
    } else if (act === "select") {
      toggleBulkMode(true);
    } else if (act === "import") {
      openModal("import");
    } else if (act === "add-folder") {
      createFolder();
    }
  }

  function renderBulkBar() {
    els.bulkBar.classList.toggle("hidden", !state.bulkMode);
    if (!state.bulkMode) return;
    var count = state.selectedIds.size;
    els.bulkLabel.textContent = count + " selected";
    els.bulkMoveBtn.disabled = count === 0 || state.moveBusy;
    els.bulkDeleteBtn.disabled = count === 0;
  }

  function renderNotesList() {
    var notes = getFilteredNotes();
    if (!notes.length) {
      els.notesList.innerHTML = '<div class="notes-empty">' +
        (state.notes.length === 0 ? "No notes yet. Create one or import from clipboard." : "No matches.") + "</div>";
      return;
    }
    els.notesList.innerHTML = notes.map(function (note) {
      return state.bulkMode ? renderBulkRow(note) : renderNoteRow(note);
    }).join("");
  }

  function renderNoteRow(note) {
    var rating = extractRating(note.content);
    var tags = extractTags(note.content);
    var folder = folderForNote(note);
    var snippet = getSnippet(note.content, note.title);
    var date = relativeDate(note.updated_at);

    var tagsHtml = "";
    if (folder) {
      tagsHtml += '<span class="note-tag">' + folderIconSmall() + " " + esc(folder.name) + "</span>";
    }
    tags.forEach(function (tag) {
      tagsHtml += '<span class="note-tag">' + esc(tag) + "</span>";
    });

    return '<button class="note-row" type="button" data-note-select="' + note.id + '">' +
      '<div class="note-row-top">' +
        '<span class="note-row-title">' + esc(note.title || "Untitled") + "</span>" +
        (rating ? '<span class="note-row-rating">' + esc(rating) + "</span>" : "") +
        '<span class="note-row-date">' + esc(date) + "</span>" +
      "</div>" +
      (snippet ? '<div class="note-row-snippet">' + esc(snippet) + "</div>" : "") +
      (tagsHtml ? '<div class="note-row-tags">' + tagsHtml + "</div>" : "") +
    "</button>";
  }

  function renderBulkRow(note) {
    var selected = state.selectedIds.has(note.id);
    var checkSvg = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 5.5L4.5 7.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<button class="note-row' + (selected ? " bulk-selected" : "") + '" type="button" data-note-toggle="' + note.id + '">' +
      '<div class="note-row-bulk">' +
        '<span class="bulk-check' + (selected ? " checked" : "") + '">' + (selected ? checkSvg : "") + "</span>" +
        '<div>' +
          '<div class="note-row-title">' + esc(note.title || "Untitled") + "</div>" +
          '<div class="note-row-date" style="margin-top:.1rem">' + relativeDate(note.updated_at) + "</div>" +
        "</div>" +
      "</div>" +
    "</button>";
  }

  function handleNoteListClick(e) {
    var toggle = e.target.closest("[data-note-toggle]");
    if (toggle) {
      toggleNoteSelection(toggle.dataset.noteToggle);
      return;
    }
    var select = e.target.closest("[data-note-select]");
    if (select) {
      navigate("#/note/" + select.dataset.noteSelect);
    }
  }

  /* ============================================================
     NOTE VIEW
     ============================================================ */
  function renderNoteView() {
    var note = selectedNote();
    if (!note) { navigate("#/", true); return; }

    // Meta strip
    var folder = folderForNote(note);
    var rating = extractRating(note.content);
    var parts = [];
    if (folder) parts.push(esc(folder.name));
    parts.push("Edited " + relativeDate(note.updated_at));
    if (rating) parts.push('<span class="meta-rating">' + esc(rating) + "</span>");
    els.noteMeta.innerHTML = parts.join('<span class="meta-sep"> &middot; </span>');

    // Body
    els.noteBody.innerHTML = '<p style="color:var(--faint);font-family:var(--font-sans);font-size:.85rem">Loading...</p>';
    renderMarkdown(note.content).then(function (html) {
      if (selectedNote() && selectedNote().id === note.id && state.view === "noteView") {
        els.noteBody.innerHTML = html;
      }
    }).catch(function (err) {
      els.noteBody.innerHTML = '<p style="color:var(--danger);font-family:var(--font-sans);font-size:.85rem">' + esc(err.message || "Failed to render.") + "</p>";
    });
  }

  /* ============================================================
     EDITOR
     ============================================================ */
  function renderEditor() {
    els.editorTextarea.value = state.editorContent;
    updateEditorStatus();
    setEditorTab(state.editorTab, true);
  }

  function setEditorTab(tab, silent) {
    state.editorTab = tab;
    els.tabWrite.classList.toggle("active", tab === "write");
    els.tabPreview.classList.toggle("active", tab === "preview");
    els.writePane.classList.toggle("hidden", tab !== "write");
    els.previewPane.classList.toggle("hidden", tab !== "preview");
    if (tab === "preview") {
      renderEditorPreview();
    } else if (!silent) {
      requestAnimationFrame(function () { els.editorTextarea.focus(); });
    }
  }

  function renderEditorPreview() {
    var snapshot = state.editorContent;
    els.editorPreview.innerHTML = '<p style="color:var(--faint);font-family:var(--font-sans);font-size:.85rem">Loading preview...</p>';
    renderMarkdown(snapshot).then(function (html) {
      if (state.editorTab === "preview" && state.editorContent === snapshot) {
        els.editorPreview.innerHTML = html;
      }
    }).catch(function () {
      els.editorPreview.innerHTML = '<p style="color:var(--danger)">Preview failed.</p>';
    });
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(renderEditorPreview, 220);
  }

  function updateEditorStatus() {
    var label = "No changes";
    if (state.saveBusy) label = "Saving...";
    else if (editorDirty()) label = "Unsaved changes";
    els.editorStatus.textContent = label;
    els.saveBtn.disabled = state.saveBusy || !editorDirty();
  }

  function editorDirty() {
    return state.editorContent !== state.originalContent;
  }

  function cancelEdit() {
    if (editorDirty() && !confirm("Discard changes?")) return;
    state.editorContent = state.originalContent;
    navigate("#/note/" + state.selectedId);
  }

  function wrapSelection(before, after, placeholder) {
    var ta = els.editorTextarea;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var sel = ta.value.slice(start, end) || placeholder || "text";
    var next = ta.value.slice(0, start) + before + sel + after + ta.value.slice(end);
    setEditorText(next, start + before.length, start + before.length + sel.length);
  }

  function linePrefix(prefix) {
    var ta = els.editorTextarea;
    var pos = ta.selectionStart;
    var lineStart = ta.value.lastIndexOf("\n", pos - 1) + 1;
    var next = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    setEditorText(next, pos + prefix.length, pos + prefix.length);
  }

  function setEditorText(next, selStart, selEnd) {
    state.editorContent = next;
    els.editorTextarea.value = next;
    updateEditorStatus();
    if (state.editorTab === "preview") schedulePreview();
    requestAnimationFrame(function () {
      els.editorTextarea.focus();
      els.editorTextarea.selectionStart = selStart;
      els.editorTextarea.selectionEnd = selEnd;
    });
  }

  /* ============================================================
     ASK PALETTE
     ============================================================ */
  function openAsk() {
    state.askOpen = true;
    els.askPalette.classList.remove("hidden");
    renderAsk();
    requestAnimationFrame(function () { els.askInput.focus(); });
  }

  function closeAsk() {
    state.askOpen = false;
    els.askPalette.classList.add("hidden");
  }

  function resetChat() {
    if (state.chatLoading) return;
    state.chatMessages = [];
    persistChat();
    renderAsk();
  }

  function renderAsk() {
    var hasMessages = state.chatMessages.length > 0;
    els.askSuggestions.classList.toggle("hidden", hasMessages);
    els.askMessages.classList.toggle("hidden", !hasMessages);
    els.askClearBtn.disabled = state.chatLoading || !hasMessages;

    var markup = state.chatMessages.map(function (msg) {
      var body = msg.role === "assistant"
        ? (msg.html || esc(msg.content).replace(/\n/g, "<br>"))
        : esc(msg.content).replace(/\n/g, "<br>");
      var cls = msg.role === "assistant" ? "chat-msg-assistant" : "chat-msg-user";
      var sources = "";
      if (msg.role === "assistant" && msg.html) {
        sources = renderSourceChips(msg.content);
      }
      return '<div class="' + cls + '">' + body + sources + "</div>";
    });

    if (state.chatLoading && (!state.chatMessages.length || state.chatMessages[state.chatMessages.length - 1].role !== "assistant")) {
      markup.push(
        '<div class="chat-msg-assistant is-thinking">' +
        '<div class="thinking-indicator">' +
        '<span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>' +
        '</div><span class="thinking-label">Thinking...</span></div>'
      );
    }

    els.askMessages.innerHTML = markup.join("");
    requestAnimationFrame(function () {
      els.askBody.scrollTop = els.askBody.scrollHeight;
    });
  }

  function renderSourceChips(content) {
    if (!content) return "";
    var matched = [];
    state.notes.forEach(function (note) {
      if (content.toLowerCase().indexOf(note.title.toLowerCase()) !== -1) {
        matched.push(note);
      }
    });
    if (!matched.length) return "";
    var chips = matched.slice(0, 5).map(function (note) {
      return '<button class="source-chip" data-source-note="' + note.id + '">' + esc(note.title) + "</button>";
    }).join("");
    return '<div class="source-chips">' + chips + "</div>";
  }

  async function sendChat() {
    var question = els.askInput.value.trim();
    if (!question || state.chatLoading) return;

    var history = state.chatMessages.map(function (m) {
      return { role: m.role, content: m.content };
    });

    els.askInput.value = "";
    state.chatMessages.push({ role: "user", content: question, html: "" });
    state.chatLoading = true;
    renderAsk();

    var assistantMsg = null;

    try {
      var response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, history: history }),
      });

      if (!response.ok) {
        if (response.status === 429) throw new Error("Rate limited - try again in a moment.");
        if (response.status === 402) throw new Error("AI credits exhausted.");
        var text = await response.text();
        throw new Error(text || "AI request failed");
      }

      if (!response.body) throw new Error("Chat stream missing response body.");

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var done = false;

      function upsertAssistant(chunk) {
        if (!assistantMsg) {
          assistantMsg = { role: "assistant", content: "", html: "" };
          state.chatMessages.push(assistantMsg);
        }
        assistantMsg.content += chunk;
        assistantMsg.html = "";
        renderAsk();
      }

      while (!done) {
        var read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        var newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          var line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          var json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            var payload = JSON.parse(json);
            var chunk2 = payload.choices && payload.choices[0] && payload.choices[0].delta && payload.choices[0].delta.content;
            if (chunk2) upsertAssistant(chunk2);
          } catch (err) {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      if (assistantMsg && assistantMsg.content) {
        assistantMsg.html = await renderMarkdown(assistantMsg.content);
        renderAsk();
      }
    } catch (err) {
      pushToast("Chat error: " + (err.message || "unknown"), "error");
    } finally {
      state.chatLoading = false;
      persistChat();
      renderAsk();
    }
  }

  /* ============================================================
     API ACTIONS (preserved from original)
     ============================================================ */
  async function saveNote() {
    var note = selectedNote();
    if (!note || state.saveBusy || !editorDirty()) return;

    state.saveBusy = true;
    updateEditorStatus();

    try {
      var updated = await apiRequest("/api/notes/" + note.id, {
        method: "PUT",
        body: { content: state.editorContent },
      });
      upsertNote(updated);
      state.originalContent = updated.content;
      state.editorContent = updated.content;
      pushToast("Saved", "success");
      navigate("#/note/" + note.id);
    } catch (err) {
      pushToast("Save failed: " + (err.message || "unknown"), "error");
    } finally {
      state.saveBusy = false;
      updateEditorStatus();
    }
  }

  async function createNote(folderId) {
    try {
      var note = await apiRequest("/api/notes", {
        method: "POST",
        body: { title: "Untitled", content: "# Untitled\n\n", folder_id: folderId },
      });
      upsertNote(note, true);
      state.selectedId = note.id;
      state.bulkMode = false;
      state.selectedIds.clear();
      state.editorContent = note.content;
      state.originalContent = note.content;
      state.editorTab = "write";
      navigate("#/note/" + note.id + "/edit");
    } catch (err) {
      pushToast("Create failed: " + (err.message || "unknown"), "error");
    }
  }

  async function deleteNote(noteId) {
    if (!confirm("Delete this note?")) return;
    try {
      await apiRequest("/api/notes/" + noteId, { method: "DELETE" });
      removeNotes([noteId]);
      pushToast("Note deleted", "success");
      navigate("#/");
    } catch (err) {
      pushToast("Delete failed: " + (err.message || "unknown"), "error");
    }
  }

  async function deleteSelectedNotes() {
    var ids = Array.from(state.selectedIds);
    if (!ids.length) return;
    if (!confirm("Delete " + ids.length + " selected note" + (ids.length === 1 ? "" : "s") + "?")) return;
    try {
      await Promise.all(ids.map(function (id) {
        return apiRequest("/api/notes/" + id, { method: "DELETE" });
      }));
      removeNotes(ids);
      toggleBulkMode(false);
      pushToast("Deleted " + ids.length + " note" + (ids.length === 1 ? "" : "s"), "success");
    } catch (err) {
      pushToast("Delete failed: " + (err.message || "unknown"), "error");
    }
  }

  async function moveNotes(noteIds, folderId) {
    if (!noteIds.length || state.moveBusy) return;
    state.moveBusy = true;
    renderBulkBar();
    try {
      var updated = await Promise.all(noteIds.map(function (id) {
        return apiRequest("/api/notes/" + id, { method: "PUT", body: { folder_id: folderId || null } });
      }));
      updated.forEach(function (n) { upsertNote(n); });
      closeModal("move");
      if (state.bulkMode) toggleBulkMode(false);
      pushToast("Moved " + updated.length + " note" + (updated.length === 1 ? "" : "s"), "success");
      render();
    } catch (err) {
      pushToast("Move failed: " + (err.message || "unknown"), "error");
    } finally {
      state.moveBusy = false;
      renderBulkBar();
    }
  }

  async function createFolder() {
    var name = prompt("Folder name", "New folder");
    if (name === null) return null;
    return createFolderWithName(name);
  }

  async function createFolderWithName(name) {
    try {
      var folder = await apiRequest("/api/folders", { method: "POST", body: { name: name } });
      upsertFolder(folder);
      renderLibrary();
      renderMoveModal();
      return folder;
    } catch (err) {
      pushToast("Folder create failed: " + (err.message || "unknown"), "error");
      return null;
    }
  }

  async function createFolderAndMove() {
    var name = prompt("New folder name", "New folder");
    if (name === null) return;
    var folder = await createFolderWithName(name);
    if (folder) executeMoveTarget(folder.id);
  }

  async function importBulkNotes() {
    var notes = splitBulkMarkdown(state.importText);
    if (!notes.length || state.importBusy) return;
    state.importBusy = true;
    renderImportPreview();
    try {
      var payload = await apiRequest("/api/import", { method: "POST", body: { text: state.importText } });
      var created = payload.notes || [];
      created.forEach(function (n) { upsertNote(n, true); });
      if (created[0]) state.selectedId = created[0].id;
      state.importText = "";
      els.importTextarea.value = "";
      closeModal("import");
      pushToast("Imported " + payload.count + " note" + (payload.count === 1 ? "" : "s"), "success");
      renderLibrary();
    } catch (err) {
      pushToast("Import failed: " + (err.message || "unknown"), "error");
    } finally {
      state.importBusy = false;
      renderImportPreview();
    }
  }

  /* ============================================================
     MODALS
     ============================================================ */
  function openModal(name) {
    var el = $( name + "-modal");
    if (el) el.classList.remove("hidden");
  }

  function closeModal(name) {
    var el = $(name + "-modal");
    if (el) el.classList.add("hidden");
  }

  // Share
  function openShareModal() {
    var note = selectedNote();
    if (!note) return;
    var url = location.origin + "/n/" + note.id;
    els.shareUrl.textContent = url;
    els.openPublicLink.href = "/n/" + note.id;
    openModal("share");
  }

  async function copyShareUrl() {
    var url = els.shareUrl.textContent;
    try {
      await navigator.clipboard.writeText(url);
      pushToast("Share link copied", "success");
    } catch (err) {
      prompt("Copy share link:", url);
    }
  }

  // Move
  function openMoveModal(target) {
    state.moveTarget = target;
    if (target === "bulk") {
      els.moveModalTitle.textContent = "Move " + state.selectedIds.size + " note" + (state.selectedIds.size === 1 ? "" : "s");
    } else {
      var note = findNote(target);
      els.moveModalTitle.textContent = "Move \"" + (note ? note.title : "note") + "\"";
    }
    renderMoveModal();
    openModal("move");
  }

  function renderMoveModal() {
    var html = state.folders.map(function (f) {
      return '<button class="move-folder-btn" type="button" data-move-folder-id="' + f.id + '">' + esc(f.name) + "</button>";
    }).join("");
    els.moveFolderList.innerHTML = html || '<p style="color:var(--faint);font-size:.82rem;font-style:italic">No folders yet.</p>';
  }

  function executeMoveTarget(folderId) {
    var ids;
    if (state.moveTarget === "bulk") {
      ids = Array.from(state.selectedIds);
    } else {
      ids = [state.moveTarget];
    }
    moveNotes(ids, folderId);
  }

  // Import
  function renderImportPreview() {
    var notes = splitBulkMarkdown(state.importText);
    var labels = notes.slice(0, 3).map(function (n) { return '"' + n.title + '"'; }).join(", ");
    var suffix = notes.length > 3 ? "..." : "";
    els.importPreview.textContent = "Detected: " + notes.length + " note" + (notes.length === 1 ? "" : "s") +
      (notes.length ? " \u2014 " + labels + suffix : "");
    els.importBtn.textContent = state.importBusy ? "Importing..." : "Import " + notes.length + " note" + (notes.length === 1 ? "" : "s");
    els.importBtn.disabled = state.importBusy || notes.length === 0;
  }

  /* ============================================================
     BULK SELECT
     ============================================================ */
  function toggleBulkMode(enabled) {
    state.bulkMode = enabled;
    if (!enabled) {
      state.selectedIds.clear();
      closeModal("move");
    }
    renderLibrary();
  }

  function toggleNoteSelection(noteId) {
    if (state.selectedIds.has(noteId)) state.selectedIds.delete(noteId);
    else state.selectedIds.add(noteId);
    renderLibrary();
  }

  function selectAllVisible() {
    getFilteredNotes().forEach(function (n) { state.selectedIds.add(n.id); });
    renderLibrary();
  }

  /* ============================================================
     DATA HELPERS
     ============================================================ */
  function selectedNote() {
    return findNote(state.selectedId);
  }

  function findNote(id) {
    return state.notes.find(function (n) { return n.id === id; }) || null;
  }

  function folderForNote(note) {
    if (!note || !note.folder_id) return null;
    return state.folders.find(function (f) { return f.id === note.folder_id; }) || null;
  }

  function sortByRecent(notes) {
    return notes.slice().sort(function (a, b) {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }

  function sortByAZ(notes) {
    return notes.slice().sort(function (a, b) {
      return (a.title || "").localeCompare(b.title || "");
    });
  }

  function sortFolders(folders) {
    return folders.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function getFilteredNotes() {
    var notes = state.notes.slice();
    // Filter by folder
    if (state.activeFilter === "unfiled") {
      notes = notes.filter(function (n) { return !n.folder_id; });
    } else if (state.activeFilter && state.activeFilter !== "all") {
      notes = notes.filter(function (n) { return n.folder_id === state.activeFilter; });
    }
    // Search
    var query = state.search.trim().toLowerCase();
    if (query) {
      notes = notes.filter(function (n) {
        return n.title.toLowerCase().indexOf(query) !== -1 || n.content.toLowerCase().indexOf(query) !== -1;
      });
    }
    // Sort
    if (state.sort === "az") {
      notes = sortByAZ(notes);
    } else {
      notes = sortByRecent(notes);
    }
    return notes;
  }

  function upsertNote(note, preferFront) {
    var idx = state.notes.findIndex(function (n) { return n.id === note.id; });
    if (idx === -1) state.notes.push(note);
    else state.notes[idx] = note;
    state.notes = sortByRecent(state.notes);
  }

  function removeNotes(ids) {
    var set = new Set(ids);
    state.notes = state.notes.filter(function (n) { return !set.has(n.id); });
    ids.forEach(function (id) { state.selectedIds.delete(id); });
    if (state.selectedId && set.has(state.selectedId)) {
      state.selectedId = null;
    }
  }

  function upsertFolder(folder) {
    var idx = state.folders.findIndex(function (f) { return f.id === folder.id; });
    if (idx === -1) state.folders.push(folder);
    else state.folders[idx] = folder;
    state.folders = sortFolders(state.folders);
  }

  /* ============================================================
     CONTENT EXTRACTION
     ============================================================ */
  function extractRating(content) {
    var match = /Rating:\s*(\d+\s*\/\s*10)/i.exec(content || "");
    return match ? match[1].replace(/\s/g, "") : null;
  }

  function extractTags(content) {
    var match = /Tags?:\s*(.+)/im.exec(content || "");
    if (!match) return [];
    return match[1].split(",").map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 5);
  }

  function getSnippet(content, title) {
    if (!content) return "";
    // Strip the title heading
    var text = content.replace(/^#\s+[^\n]*\n*/, "");
    // Strip markdown markers
    text = text.replace(/[#*_`>\[\]()!|]/g, "").replace(/\n+/g, " ").trim();
    return text.slice(0, 200);
  }

  function relativeDate(isoStr) {
    if (!isoStr) return "";
    var date = new Date(isoStr);
    var now = new Date();
    var diffMs = now.getTime() - date.getTime();
    var diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      // Check if same calendar day
      if (date.toDateString() === now.toDateString()) return "Today";
      return "Yesterday";
    }
    if (diffDays === 1) {
      var yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    }
    if (diffDays < 7) return diffDays + "d ago";
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return months[date.getMonth()] + " " + date.getDate();
  }

  function folderIconSmall() {
    return '<svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2 4.5A1.5 1.5 0 013.5 3h2.38a1 1 0 01.78.37L7.5 4.5H10.5A1.5 1.5 0 0112 6v4.5A1.5 1.5 0 0110.5 12h-7A1.5 1.5 0 012 10.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ============================================================
     API & MARKDOWN
     ============================================================ */
  async function renderMarkdown(content) {
    if (state.markdownCache.has(content)) return state.markdownCache.get(content);
    var payload = await apiRequest("/api/markdown", { method: "POST", body: { content: content } });
    state.markdownCache.set(content, payload.html || "");
    return payload.html || "";
  }

  async function apiRequest(url, options) {
    var config = Object.assign({ method: "GET" }, options || {});
    var headers = Object.assign({}, config.headers || {});
    if (config.body && !(config.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      config.body = JSON.stringify(config.body);
    }
    config.headers = headers;
    var response = await fetch(url, config);
    var text = await response.text();
    var payload = {};
    if (text) {
      try { payload = JSON.parse(text); }
      catch (e) { payload = { error: text }; }
    }
    if (!response.ok) {
      var err = new Error(payload.error || ("Request failed (" + response.status + ")"));
      err.status = response.status;
      throw err;
    }
    return payload;
  }

  function splitBulkMarkdown(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var notes = [];
    var currentTitle = null;
    var currentBody = [];
    function flush() {
      if (currentTitle !== null) {
        notes.push({ title: currentTitle.trim() || "Untitled", content: currentBody.join("\n").trim() });
      }
    }
    lines.forEach(function (line) {
      var match = /^#\s+(.+?)\s*$/.exec(line);
      if (match) {
        flush();
        currentTitle = match[1];
        currentBody = [];
      } else if (currentTitle !== null) {
        currentBody.push(line);
      }
    });
    flush();
    if (!notes.length && text.trim()) {
      notes.push({ title: "Untitled", content: text.trim() });
    }
    return notes;
  }

  /* ============================================================
     CHAT PERSISTENCE
     ============================================================ */
  function loadChat() {
    try {
      var raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
      }).map(function (m) {
        return { role: m.role, content: m.content, html: typeof m.html === "string" ? m.html : "" };
      });
    } catch (e) { return []; }
  }

  function persistChat() {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(state.chatMessages.map(function (m) {
        return { role: m.role, content: m.content, html: m.html || "" };
      })));
    } catch (e) { /* ignore */ }
  }

  /* ============================================================
     TOAST
     ============================================================ */
  function pushToast(message, kind) {
    var el = document.createElement("div");
    el.className = "toast " + (kind || "success");
    el.textContent = message;
    els.toastContainer.appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  /* ============================================================
     UTILS
     ============================================================ */
  function esc(val) {
    return String(val || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
