(function () {
  const CHAT_STORAGE_KEY = "software-eval-chat-v2";
  const bootstrapNode = document.getElementById("bootstrap-data");
  const bootstrap = bootstrapNode ? JSON.parse(bootstrapNode.textContent || "{}") : { notes: [], folders: [] };

  const state = {
    notes: sortNotes(bootstrap.notes || []),
    folders: sortFolders(bootstrap.folders || []),
    selectedId: (bootstrap.notes && bootstrap.notes[0] && bootstrap.notes[0].id) || null,
    leftOpen: true,
    aiOpen: true,
    search: "",
    collapsedFolders: new Set(),
    mode: "view",
    editorTab: "edit",
    editorContent: "",
    originalContent: "",
    saveBusy: false,
    previewTimer: null,
    chatMessages: loadStoredChatMessages(),
    chatLoading: false,
    markdownCache: new Map(),
    bulkText: "",
    bulkBusy: false,
    bulkSelectMode: false,
    selectedNoteIds: new Set(),
    moveBusy: false,
  };

  const els = {
    leftPanel: document.getElementById("left-panel"),
    rightPanel: document.getElementById("right-panel"),
    leftRail: document.getElementById("left-rail"),
    rightRail: document.getElementById("right-rail"),
    leftCollapseBtn: document.getElementById("left-collapse-btn"),
    rightCollapseBtn: document.getElementById("right-collapse-btn"),
    noteCountLabel: document.getElementById("note-count-label"),
    searchInput: document.getElementById("search-input"),
    notesList: document.getElementById("notes-list"),
    notesEmpty: document.getElementById("notes-empty"),
    newNoteBtn: document.getElementById("new-note-btn"),
    newFolderBtn: document.getElementById("new-folder-btn"),
    bulkOpenBtn: document.getElementById("bulk-open-btn"),
    bulkSelectBtn: document.getElementById("bulk-select-btn"),
    bulkActionsBar: document.getElementById("bulk-actions-bar"),
    bulkSelectionLabel: document.getElementById("bulk-selection-label"),
    bulkSelectAllBtn: document.getElementById("bulk-select-all-btn"),
    bulkClearSelectionBtn: document.getElementById("bulk-clear-selection-btn"),
    bulkMoveBtn: document.getElementById("bulk-move-btn"),
    bulkDeleteBtn: document.getElementById("bulk-delete-btn"),
    emptyNewNoteBtn: document.getElementById("empty-new-note-btn"),
    emptyBulkBtn: document.getElementById("empty-bulk-btn"),
    noteEmpty: document.getElementById("note-empty"),
    noteView: document.getElementById("note-view"),
    noteEdit: document.getElementById("note-edit"),
    noteViewTitle: document.getElementById("note-view-title"),
    noteViewBody: document.getElementById("note-view-body"),
    shareNoteBtn: document.getElementById("share-note-btn"),
    editNoteBtn: document.getElementById("edit-note-btn"),
    deleteNoteBtn: document.getElementById("delete-note-btn"),
    editorStatus: document.getElementById("editor-status"),
    cancelEditBtn: document.getElementById("cancel-edit-btn"),
    saveNoteBtn: document.getElementById("save-note-btn"),
    togglePreviewBtn: document.getElementById("toggle-preview-btn"),
    tabEditBtn: document.getElementById("tab-edit-btn"),
    tabPreviewBtn: document.getElementById("tab-preview-btn"),
    editorEditPane: document.getElementById("editor-edit-pane"),
    editorPreviewPane: document.getElementById("editor-preview-pane"),
    editorTextarea: document.getElementById("editor-textarea"),
    editorPreview: document.getElementById("editor-preview"),
    toolbarButtons: Array.from(document.querySelectorAll(".toolbar-btn")),
    chatScroll: document.getElementById("chat-scroll"),
    chatSuggestions: document.getElementById("chat-suggestions"),
    chatMessages: document.getElementById("chat-messages"),
    chatInput: document.getElementById("chat-input"),
    chatSendBtn: document.getElementById("chat-send-btn"),
    chatResetBtn: document.getElementById("chat-reset-btn"),
    bulkModal: document.getElementById("bulk-modal"),
    bulkTextarea: document.getElementById("bulk-textarea"),
    bulkPreview: document.getElementById("bulk-preview"),
    bulkImportBtn: document.getElementById("bulk-import-btn"),
    bulkCloseBtn: document.getElementById("bulk-close-btn"),
    bulkCancelBtn: document.getElementById("bulk-cancel-btn"),
    moveModal: document.getElementById("move-modal"),
    moveCloseBtn: document.getElementById("move-close-btn"),
    moveUnfiledBtn: document.getElementById("move-unfiled-btn"),
    moveCreateFolderBtn: document.getElementById("move-create-folder-btn"),
    moveFolderList: document.getElementById("move-folder-list"),
    toastContainer: document.getElementById("toast-container"),
  };

  init();

  function init() {
    bindEvents();
    if (state.selectedId) {
      const note = selectedNote();
      if (note) {
        state.editorContent = note.content;
        state.originalContent = note.content;
      }
    }
    renderShell();
    renderSidebar();
    renderSelection();
    renderChat();
    renderBulkPreview();
    renderMoveModal();
    updateChatSendState();
  }

  function bindEvents() {
    els.leftCollapseBtn.addEventListener("click", function () {
      state.leftOpen = false;
      renderShell();
    });
    els.rightCollapseBtn.addEventListener("click", function () {
      state.aiOpen = false;
      renderShell();
    });
    els.leftRail.addEventListener("click", function () {
      state.leftOpen = true;
      renderShell();
    });
    els.rightRail.addEventListener("click", function () {
      state.aiOpen = true;
      renderShell();
    });
    els.newNoteBtn.addEventListener("click", function () {
      createNote(null);
    });
    els.emptyNewNoteBtn.addEventListener("click", function () {
      createNote(null);
    });
    els.newFolderBtn.addEventListener("click", createFolder);
    els.bulkOpenBtn.addEventListener("click", openBulkModal);
    els.bulkSelectBtn.addEventListener("click", function () {
      toggleBulkSelectMode(!state.bulkSelectMode);
    });
    els.bulkSelectAllBtn.addEventListener("click", selectAllVisibleNotes);
    els.bulkClearSelectionBtn.addEventListener("click", function () {
      toggleBulkSelectMode(false);
    });
    els.bulkMoveBtn.addEventListener("click", openMoveModal);
    els.bulkDeleteBtn.addEventListener("click", deleteSelectedNotes);
    els.emptyBulkBtn.addEventListener("click", openBulkModal);
    els.searchInput.addEventListener("input", function (event) {
      state.search = event.target.value || "";
      renderSidebar();
    });
    els.notesList.addEventListener("click", handleSidebarClick);
    els.shareNoteBtn.addEventListener("click", function () {
      const note = selectedNote();
      if (note) copyShareLink(note.id);
    });
    els.editNoteBtn.addEventListener("click", beginEdit);
    els.deleteNoteBtn.addEventListener("click", function () {
      const note = selectedNote();
      if (note) deleteNote(note.id);
    });
    els.cancelEditBtn.addEventListener("click", cancelEdit);
    els.saveNoteBtn.addEventListener("click", saveNote);
    els.togglePreviewBtn.addEventListener("click", function () {
      setEditorTab(state.editorTab === "edit" ? "preview" : "edit");
    });
    els.tabEditBtn.addEventListener("click", function () {
      setEditorTab("edit");
    });
    els.tabPreviewBtn.addEventListener("click", function () {
      setEditorTab("preview");
    });
    els.editorTextarea.addEventListener("input", function (event) {
      state.editorContent = event.target.value;
      updateEditorStatus();
      if (state.editorTab === "preview") {
        schedulePreviewRender();
      }
    });
    els.toolbarButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.wrap) {
          wrapSelection(button.dataset.wrap, button.dataset.wrap, "text");
        } else if (button.dataset.prefix) {
          linePrefix(button.dataset.prefix);
        } else if (button.dataset.link) {
          insertLink();
        }
      });
    });
    window.addEventListener("beforeunload", function (event) {
      if (state.mode === "edit" && editorIsDirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    document.addEventListener("click", function (event) {
      const closeModalTrigger = event.target.closest("[data-close-modal]");
      if (closeModalTrigger) {
        if (closeModalTrigger.dataset.closeModal === "bulk") closeBulkModal();
        if (closeModalTrigger.dataset.closeModal === "move") closeMoveModal();
      }
      if (event.target.closest(".suggestion-btn")) {
        const suggestion = event.target.closest(".suggestion-btn").dataset.suggestion;
        els.chatInput.value = suggestion || "";
        updateChatSendState();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (!els.moveModal.classList.contains("hidden")) closeMoveModal();
        if (!els.bulkModal.classList.contains("hidden")) closeBulkModal();
      }
    });
    els.chatInput.addEventListener("input", updateChatSendState);
    els.chatInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
    els.chatSendBtn.addEventListener("click", sendChat);
    els.chatResetBtn.addEventListener("click", resetChatConversation);
    els.bulkTextarea.addEventListener("input", function (event) {
      state.bulkText = event.target.value || "";
      renderBulkPreview();
    });
    els.bulkCloseBtn.addEventListener("click", closeBulkModal);
    els.bulkCancelBtn.addEventListener("click", closeBulkModal);
    els.bulkImportBtn.addEventListener("click", importBulkNotes);
    els.moveCloseBtn.addEventListener("click", closeMoveModal);
    els.moveUnfiledBtn.addEventListener("click", function () {
      moveSelectedNotes(null);
    });
    els.moveCreateFolderBtn.addEventListener("click", createFolderAndMoveSelected);
    els.moveFolderList.addEventListener("click", function (event) {
      const button = event.target.closest("[data-move-folder-id]");
      if (!button) return;
      moveSelectedNotes(button.dataset.moveFolderId);
    });
  }

  function selectedNote() {
    return state.notes.find(function (note) {
      return note.id === state.selectedId;
    }) || null;
  }

  function selectedNotes() {
    return state.notes.filter(function (note) {
      return state.selectedNoteIds.has(note.id);
    });
  }

  function sortNotes(notes) {
    return notes.slice().sort(function (left, right) {
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }

  function sortFolders(folders) {
    return folders.slice().sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });
  }

  function renderShell() {
    els.leftPanel.classList.toggle("hidden", !state.leftOpen);
    els.rightPanel.classList.toggle("hidden", !state.aiOpen);
    els.leftRail.classList.toggle("hidden", state.leftOpen);
    els.rightRail.classList.toggle("hidden", state.aiOpen);
  }

  function renderSidebar() {
    const filtered = filteredNotes();
    const selectedCount = state.selectedNoteIds.size;
    els.noteCountLabel.textContent = state.notes.length + " note" + (state.notes.length === 1 ? "" : "s");
    els.bulkSelectBtn.textContent = state.bulkSelectMode ? "Cancel" : "Select";
    els.bulkActionsBar.classList.toggle("hidden", !state.bulkSelectMode);
    els.bulkSelectionLabel.textContent = selectedCount + " selected";
    els.bulkMoveBtn.disabled = selectedCount === 0 || state.moveBusy;
    els.bulkDeleteBtn.disabled = selectedCount === 0;
    els.bulkSelectAllBtn.disabled = filtered.length === 0;
    els.notesList.classList.toggle("bulk-mode", state.bulkSelectMode);

    if (!filtered.length) {
      els.notesEmpty.classList.remove("hidden");
      els.notesEmpty.textContent = state.notes.length === 0
        ? "No notes yet. Click New or paste in bulk."
        : "No matches.";
    } else {
      els.notesEmpty.classList.add("hidden");
      els.notesEmpty.textContent = "";
    }

    const groups = groupNotes(filtered);
    const sections = [];
    state.folders.forEach(function (folder) {
      const items = groups.get(folder.id) || [];
      const section = renderFolderSection(folder.id, folder.name, items, folder);
      if (section) sections.push(section);
    });
    const unfiled = renderFolderSection("__unfiled__", "Unfiled", groups.get("__unfiled__") || [], null);
    if (unfiled) sections.push(unfiled);
    els.notesList.innerHTML = sections.join("");
  }

  function filteredNotes() {
    const query = state.search.trim().toLowerCase();
    if (!query) return state.notes.slice();
    return state.notes.filter(function (note) {
      return note.title.toLowerCase().includes(query) || note.content.toLowerCase().includes(query);
    });
  }

  function visibleNoteIds() {
    return filteredNotes().map(function (note) {
      return note.id;
    });
  }

  function groupNotes(notes) {
    const byFolder = new Map();
    byFolder.set("__unfiled__", []);
    state.folders.forEach(function (folder) {
      byFolder.set(folder.id, []);
    });
    notes.forEach(function (note) {
      const key = note.folder_id && byFolder.has(note.folder_id) ? note.folder_id : "__unfiled__";
      byFolder.get(key).push(note);
    });
    return byFolder;
  }

  function renderFolderSection(key, label, items, folder) {
    if (folder && state.search.trim() && items.length === 0) return "";
    if (key === "__unfiled__" && items.length === 0 && state.folders.length > 0 && !state.search.trim()) return "";

    const collapsed = state.collapsedFolders.has(key);
    const menu = folder ? renderFolderMenu(folder) : "";
    const empty = items.length === 0 ? '<li class="empty-state">Empty</li>' : items.map(renderNoteItem).join("");

    var chevronSvg = collapsed
      ? '<svg class="folder-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3.5 2L7 5l-3.5 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg class="folder-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 7l3-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var folderIcon = '<svg class="folder-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3.5A1.25 1.25 0 012.75 2.25h2l.65.9a.75.75 0 00.6.3h3.25A1.25 1.25 0 0110.5 4.7v3.8a1.25 1.25 0 01-1.25 1.25h-6A1.25 1.25 0 012 8.5z" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    return (
      '<section class="folder-section">' +
      '<div class="folder-header">' +
      '<button class="folder-toggle" type="button" data-folder-toggle="' + key + '">' +
      '<span class="folder-chevron-wrap">' + chevronSvg + "</span>" +
      '<span class="folder-icon-wrap">' + folderIcon + "</span>" +
      '<span class="folder-name">' + escapeHtml(label) + "</span>" +
      '<span class="folder-count">' + items.length + "</span>" +
      "</button>" +
      menu +
      "</div>" +
      (collapsed ? "" : '<ul class="note-group">' + empty + "</ul>") +
      "</section>"
    );
  }

  var menuDotsSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="3.5" r="1" fill="currentColor"/><circle cx="7" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="10.5" r="1" fill="currentColor"/></svg>';

  function renderFolderMenu(folder) {
    return (
      '<details class="menu">' +
      '<summary title="Folder options">' + menuDotsSvg + '</summary>' +
      '<div class="menu-content">' +
      '<button class="menu-item" type="button" data-action="folder-new-note" data-folder-id="' + folder.id + '">New note here</button>' +
      '<button class="menu-item" type="button" data-action="rename-folder" data-folder-id="' + folder.id + '">Rename</button>' +
      '<div class="menu-divider"></div>' +
      '<button class="menu-item menu-danger" type="button" data-action="delete-folder" data-folder-id="' + folder.id + '">Delete folder</button>' +
      "</div>" +
      "</details>"
    );
  }

  function renderNoteItem(note) {
    if (state.bulkSelectMode) return renderBulkSelectableNote(note);

    const folders = state.folders.map(function (folder) {
      return (
        '<button class="menu-item" type="button" data-action="move-note" data-note-id="' + note.id + '" data-folder-id="' + folder.id + '">' +
        "Move to " + escapeHtml(folder.name) +
        "</button>"
      );
    }).join("");

    return (
      '<li class="note-item">' +
      '<button class="note-item-button' + (note.id === state.selectedId ? " active" : "") + '" type="button" data-note-select="' + note.id + '">' +
      '<div class="note-item-title">' + escapeHtml(note.title || "Untitled") + "</div>" +
      '<div class="note-item-meta">' + formatDate(note.updated_at) + "</div>" +
      "</button>" +
      '<details class="menu">' +
      '<summary title="Note options">' + menuDotsSvg + '</summary>' +
      '<div class="menu-content">' +
      '<button class="menu-item" type="button" data-action="share-note" data-note-id="' + note.id + '">Share link</button>' +
      '<button class="menu-item" type="button" data-action="move-note" data-note-id="' + note.id + '" data-folder-id="">Move to Unfiled</button>' +
      folders +
      '<div class="menu-divider"></div>' +
      '<button class="menu-item menu-danger" type="button" data-action="delete-note" data-note-id="' + note.id + '">Delete note</button>' +
      "</div>" +
      "</details>" +
      "</li>"
    );
  }

  var checkSvg = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2.5 5.5L4.5 7.5L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderBulkSelectableNote(note) {
    const selected = state.selectedNoteIds.has(note.id);
    return (
      '<li class="note-item note-item-bulk' + (selected ? " bulk-selected" : "") + '">' +
      '<button class="note-item-button note-item-button-bulk' + (selected ? " active" : "") + '" type="button" data-note-toggle="' + note.id + '">' +
      '<span class="note-item-bulk-check' + (selected ? " checked" : "") + '">' + (selected ? checkSvg : "") + "</span>" +
      '<span class="note-item-bulk-copy">' +
      '<span class="note-item-title">' + escapeHtml(note.title || "Untitled") + "</span>" +
      '<span class="note-item-meta">' + formatDate(note.updated_at) + "</span>" +
      "</span>" +
      "</button>" +
      "</li>"
    );
  }

  function handleSidebarClick(event) {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "share-note") copyShareLink(actionButton.dataset.noteId);
      if (action === "move-note") moveNote(actionButton.dataset.noteId, actionButton.dataset.folderId || null);
      if (action === "delete-note") deleteNote(actionButton.dataset.noteId);
      if (action === "folder-new-note") createNote(actionButton.dataset.folderId);
      if (action === "rename-folder") renameFolder(actionButton.dataset.folderId);
      if (action === "delete-folder") deleteFolder(actionButton.dataset.folderId);
      return;
    }

    const noteToggle = event.target.closest("[data-note-toggle]");
    if (noteToggle) {
      toggleNoteSelection(noteToggle.dataset.noteToggle);
      return;
    }

    const folderToggle = event.target.closest("[data-folder-toggle]");
    if (folderToggle) {
      toggleFolder(folderToggle.dataset.folderToggle);
      return;
    }

    const noteButton = event.target.closest("[data-note-select]");
    if (noteButton) {
      selectNote(noteButton.dataset.noteSelect);
    }
  }

  function toggleFolder(key) {
    if (state.collapsedFolders.has(key)) {
      state.collapsedFolders.delete(key);
    } else {
      state.collapsedFolders.add(key);
    }
    renderSidebar();
  }

  function toggleBulkSelectMode(enabled) {
    state.bulkSelectMode = enabled;
    if (!enabled) {
      state.selectedNoteIds.clear();
      closeMoveModal();
    }
    renderSidebar();
  }

  function toggleNoteSelection(noteId) {
    if (state.selectedNoteIds.has(noteId)) {
      state.selectedNoteIds.delete(noteId);
    } else {
      state.selectedNoteIds.add(noteId);
    }
    renderSidebar();
  }

  function selectAllVisibleNotes() {
    visibleNoteIds().forEach(function (noteId) {
      state.selectedNoteIds.add(noteId);
    });
    renderSidebar();
  }

  function clearSelectedNotes() {
    state.selectedNoteIds.clear();
    renderSidebar();
  }

  function sanitizeSelectedNotes() {
    const existing = new Set(state.notes.map(function (note) { return note.id; }));
    Array.from(state.selectedNoteIds).forEach(function (noteId) {
      if (!existing.has(noteId)) state.selectedNoteIds.delete(noteId);
    });
  }

  function ensureSelectedNoteStillExists() {
    if (state.selectedId && selectedNote()) return;
    state.selectedId = state.notes[0] ? state.notes[0].id : null;
    const note = selectedNote();
    state.editorContent = note ? note.content : "";
    state.originalContent = note ? note.content : "";
    state.mode = "view";
  }

  function selectNote(noteId) {
    state.selectedId = noteId;
    const note = selectedNote();
    state.mode = "view";
    state.editorTab = "edit";
    state.editorContent = note ? note.content : "";
    state.originalContent = note ? note.content : "";
    renderSidebar();
    renderSelection();
  }

  function renderSelection() {
    const note = selectedNote();
    if (!note) {
      els.noteEmpty.classList.remove("hidden");
      els.noteView.classList.add("hidden");
      els.noteEdit.classList.add("hidden");
      return;
    }

    els.noteEmpty.classList.add("hidden");
    if (state.mode === "view") {
      els.noteView.classList.remove("hidden");
      els.noteEdit.classList.add("hidden");
      renderNoteView(note);
    } else {
      els.noteView.classList.add("hidden");
      els.noteEdit.classList.remove("hidden");
      renderEditor(note);
    }
  }

  function renderNoteView(note) {
    els.noteViewTitle.textContent = note.title || "Untitled";
    els.noteViewBody.innerHTML = '<p class="empty-state">Loading...</p>';
    requestRenderedHtml(note.content)
      .then(function (html) {
        if (selectedNote() && selectedNote().id === note.id && state.mode === "view") {
          els.noteViewBody.innerHTML = html;
        }
      })
      .catch(function (error) {
        if (selectedNote() && selectedNote().id === note.id && state.mode === "view") {
          els.noteViewBody.innerHTML = '<p class="empty-state">' + escapeHtml(error.message || "Failed to render note.") + "</p>";
        }
      });
  }

  function beginEdit() {
    const note = selectedNote();
    if (!note) return;
    state.bulkSelectMode = false;
    state.selectedNoteIds.clear();
    state.mode = "edit";
    state.editorTab = "edit";
    state.editorContent = note.content;
    state.originalContent = note.content;
    renderSidebar();
    renderSelection();
    updateEditorStatus();
    requestAnimationFrame(function () {
      els.editorTextarea.focus();
    });
  }

  function cancelEdit() {
    if (editorIsDirty() && !window.confirm("Discard changes and restore the original?")) {
      return;
    }
    state.editorContent = state.originalContent;
    state.mode = "view";
    renderSelection();
  }

  function renderEditor(note) {
    els.editorTextarea.value = state.editorContent;
    updateEditorStatus();
    setEditorTab(state.editorTab, true);
    if (!note) {
      els.editorPreview.innerHTML = "";
    }
  }

  function setEditorTab(tab, silent) {
    state.editorTab = tab;
    els.tabEditBtn.classList.toggle("active", tab === "edit");
    els.tabPreviewBtn.classList.toggle("active", tab === "preview");
    els.editorEditPane.classList.toggle("hidden", tab !== "edit");
    els.editorPreviewPane.classList.toggle("hidden", tab !== "preview");
    els.togglePreviewBtn.textContent = tab === "edit" ? "Preview" : "Editor";
    if (tab === "preview") {
      renderEditorPreview();
    } else if (!silent) {
      requestAnimationFrame(function () {
        els.editorTextarea.focus();
      });
    }
  }

  function renderEditorPreview() {
    const snapshot = state.editorContent;
    els.editorPreview.innerHTML = '<p class="empty-state">Loading preview...</p>';
    requestRenderedHtml(snapshot)
      .then(function (html) {
        if (state.editorTab === "preview" && state.editorContent === snapshot) {
          els.editorPreview.innerHTML = html;
        }
      })
      .catch(function (error) {
        if (state.editorTab === "preview" && state.editorContent === snapshot) {
          els.editorPreview.innerHTML = '<p class="empty-state">' + escapeHtml(error.message || "Preview failed.") + "</p>";
        }
      });
  }

  function schedulePreviewRender() {
    window.clearTimeout(state.previewTimer);
    state.previewTimer = window.setTimeout(renderEditorPreview, 220);
  }

  function updateEditorStatus() {
    let label = "No changes";
    if (state.saveBusy) {
      label = "Saving...";
    } else if (editorIsDirty()) {
      label = "Unsaved changes";
    }
    els.editorStatus.textContent = label;
    els.saveNoteBtn.disabled = state.saveBusy || !editorIsDirty();
  }

  function editorIsDirty() {
    return state.editorContent !== state.originalContent;
  }

  function wrapSelection(before, after, placeholder) {
    const textarea = els.editorTextarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder || "text";
    const next = textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
    updateEditorText(next, start + before.length, start + before.length + selected.length);
  }

  function linePrefix(prefix) {
    const textarea = els.editorTextarea;
    const position = textarea.selectionStart;
    const lineStart = textarea.value.lastIndexOf("\n", position - 1) + 1;
    const next = textarea.value.slice(0, lineStart) + prefix + textarea.value.slice(lineStart);
    updateEditorText(next, position + prefix.length, position + prefix.length);
  }

  function insertLink() {
    const url = window.prompt("URL?");
    if (!url) return;
    const textarea = els.editorTextarea;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || "link text";
    const before = "[";
    const after = "](" + url + ")";
    const next = textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
    updateEditorText(next, start + before.length, start + before.length + selected.length);
  }

  function updateEditorText(next, selectionStart, selectionEnd) {
    state.editorContent = next;
    els.editorTextarea.value = next;
    updateEditorStatus();
    if (state.editorTab === "preview") {
      schedulePreviewRender();
    }
    requestAnimationFrame(function () {
      els.editorTextarea.focus();
      els.editorTextarea.selectionStart = selectionStart;
      els.editorTextarea.selectionEnd = selectionEnd;
    });
  }

  async function saveNote() {
    const note = selectedNote();
    if (!note || state.saveBusy || !editorIsDirty()) return;

    state.saveBusy = true;
    updateEditorStatus();

    try {
      const updated = await apiRequest("/api/notes/" + note.id, {
        method: "PUT",
        body: { content: state.editorContent },
      });
      upsertNote(updated);
      state.originalContent = updated.content;
      state.editorContent = updated.content;
      state.mode = "view";
      pushToast("Saved", "success");
      renderSidebar();
      renderSelection();
    } catch (error) {
      pushToast("Save failed: " + (error.message || "unknown"), "error");
    } finally {
      state.saveBusy = false;
      updateEditorStatus();
    }
  }

  async function createNote(folderId) {
    try {
      const note = await apiRequest("/api/notes", {
        method: "POST",
        body: {
          title: "Untitled",
          content: "# Untitled\n\n",
          folder_id: folderId,
        },
      });
      upsertNote(note, true);
      state.selectedId = note.id;
      state.bulkSelectMode = false;
      state.selectedNoteIds.clear();
      beginEdit();
    } catch (error) {
      pushToast("Failed to create note: " + (error.message || "unknown"), "error");
    }
  }

  async function deleteNote(noteId) {
    if (!window.confirm("Delete this note?")) return;

    try {
      await apiRequest("/api/notes/" + noteId, { method: "DELETE" });
      removeNotesFromState([noteId]);
      renderSidebar();
      renderSelection();
      pushToast("Note deleted", "success");
    } catch (error) {
      pushToast("Delete failed: " + (error.message || "unknown"), "error");
    }
  }

  async function deleteSelectedNotes() {
    const noteIds = Array.from(state.selectedNoteIds);
    if (!noteIds.length) return;
    if (!window.confirm("Delete " + noteIds.length + " selected note" + (noteIds.length === 1 ? "" : "s") + "?")) {
      return;
    }

    try {
      await Promise.all(noteIds.map(function (noteId) {
        return apiRequest("/api/notes/" + noteId, { method: "DELETE" });
      }));
      removeNotesFromState(noteIds);
      toggleBulkSelectMode(false);
      renderSelection();
      pushToast("Deleted " + noteIds.length + " note" + (noteIds.length === 1 ? "" : "s"), "success");
    } catch (error) {
      pushToast("Bulk delete failed: " + (error.message || "unknown"), "error");
    }
  }

  async function moveNote(noteId, folderId) {
    try {
      const updated = await apiRequest("/api/notes/" + noteId, {
        method: "PUT",
        body: { folder_id: folderId || null },
      });
      upsertNote(updated);
      renderSidebar();
      renderSelection();
    } catch (error) {
      pushToast("Move failed: " + (error.message || "unknown"), "error");
    }
  }

  function openMoveModal() {
    if (!state.selectedNoteIds.size) return;
    renderMoveModal();
    els.moveModal.classList.remove("hidden");
  }

  function closeMoveModal() {
    els.moveModal.classList.add("hidden");
  }

  function renderMoveModal() {
    const folders = state.folders.map(function (folder) {
      return '<button class="move-folder-btn" type="button" data-move-folder-id="' + folder.id + '">' + escapeHtml(folder.name) + "</button>";
    }).join("");
    els.moveFolderList.innerHTML = folders || '<p class="empty-state">No folders yet. Create one and move the notes there.</p>';
    els.moveUnfiledBtn.disabled = state.moveBusy || state.selectedNoteIds.size === 0;
    els.moveCreateFolderBtn.disabled = state.moveBusy || state.selectedNoteIds.size === 0;
  }

  async function moveSelectedNotes(folderId) {
    const noteIds = Array.from(state.selectedNoteIds);
    if (!noteIds.length || state.moveBusy) return;

    state.moveBusy = true;
    renderMoveModal();
    renderSidebar();

    try {
      const updatedNotes = await Promise.all(noteIds.map(function (noteId) {
        return apiRequest("/api/notes/" + noteId, {
          method: "PUT",
          body: { folder_id: folderId || null },
        });
      }));
      updatedNotes.forEach(function (note) {
        upsertNote(note);
      });
      closeMoveModal();
      toggleBulkSelectMode(false);
      renderSelection();
      pushToast("Moved " + updatedNotes.length + " note" + (updatedNotes.length === 1 ? "" : "s"), "success");
    } catch (error) {
      pushToast("Bulk move failed: " + (error.message || "unknown"), "error");
    } finally {
      state.moveBusy = false;
      renderMoveModal();
      renderSidebar();
    }
  }

  async function createFolder() {
    const name = window.prompt("Folder name", "New folder");
    if (name === null) return null;
    return createFolderWithName(name);
  }

  async function createFolderWithName(name) {
    try {
      const folder = await apiRequest("/api/folders", {
        method: "POST",
        body: { name: name },
      });
      upsertFolder(folder);
      renderSidebar();
      renderMoveModal();
      return folder;
    } catch (error) {
      pushToast("Folder create failed: " + (error.message || "unknown"), "error");
      return null;
    }
  }

  async function createFolderAndMoveSelected() {
    if (!state.selectedNoteIds.size || state.moveBusy) return;
    const name = window.prompt("New folder name", "New folder");
    if (name === null) return;
    const folder = await createFolderWithName(name);
    if (folder) {
      moveSelectedNotes(folder.id);
    }
  }

  async function renameFolder(folderId) {
    const folder = state.folders.find(function (item) {
      return item.id === folderId;
    });
    if (!folder) return;
    const name = window.prompt("Rename folder", folder.name);
    if (name === null) return;
    try {
      const updated = await apiRequest("/api/folders/" + folderId, {
        method: "PUT",
        body: { name: name },
      });
      upsertFolder(updated);
      renderSidebar();
      renderMoveModal();
    } catch (error) {
      pushToast("Folder rename failed: " + (error.message || "unknown"), "error");
    }
  }

  async function deleteFolder(folderId) {
    const folder = state.folders.find(function (item) {
      return item.id === folderId;
    });
    if (!folder) return;
    if (!window.confirm('Delete folder "' + folder.name + '"? Notes inside will move to Unfiled.')) {
      return;
    }

    try {
      await apiRequest("/api/folders/" + folderId, { method: "DELETE" });
      state.folders = state.folders.filter(function (item) {
        return item.id !== folderId;
      });
      state.notes = state.notes.map(function (note) {
        if (note.folder_id === folderId) {
          return Object.assign({}, note, { folder_id: null });
        }
        return note;
      });
      renderSidebar();
      renderSelection();
      renderMoveModal();
      pushToast("Folder deleted", "success");
    } catch (error) {
      pushToast("Folder delete failed: " + (error.message || "unknown"), "error");
    }
  }

  function openBulkModal() {
    els.bulkModal.classList.remove("hidden");
    els.bulkTextarea.focus();
  }

  function closeBulkModal() {
    els.bulkModal.classList.add("hidden");
  }

  function renderBulkPreview() {
    const notes = splitBulkMarkdownClient(state.bulkText);
    const labels = notes.slice(0, 3).map(function (note) {
      return '"' + note.title + '"';
    }).join(", ");
    const suffix = notes.length > 3 ? "..." : "";
    els.bulkPreview.textContent = "Detected: " + notes.length + " note" + (notes.length === 1 ? "" : "s") +
      (notes.length ? " - " + labels + suffix : "");
    els.bulkImportBtn.textContent = state.bulkBusy
      ? "Importing..."
      : "Import " + notes.length + " note" + (notes.length === 1 ? "" : "s");
    els.bulkImportBtn.disabled = state.bulkBusy || notes.length === 0;
  }

  async function importBulkNotes() {
    const notes = splitBulkMarkdownClient(state.bulkText);
    if (!notes.length || state.bulkBusy) return;

    state.bulkBusy = true;
    renderBulkPreview();

    try {
      const payload = await apiRequest("/api/import", {
        method: "POST",
        body: { text: state.bulkText },
      });
      const created = payload.notes || [];
      created.forEach(function (note) {
        upsertNote(note, true);
      });
      if (created[0]) {
        state.selectedId = created[0].id;
      }
      state.bulkText = "";
      els.bulkTextarea.value = "";
      closeBulkModal();
      renderSidebar();
      renderSelection();
      pushToast("Imported " + payload.count + " note" + (payload.count === 1 ? "" : "s"), "success");
    } catch (error) {
      pushToast("Import failed: " + (error.message || "unknown"), "error");
    } finally {
      state.bulkBusy = false;
      renderBulkPreview();
    }
  }

  async function sendChat() {
    const question = els.chatInput.value.trim();
    if (!question || state.chatLoading) return;

    const history = state.chatMessages.map(function (message) {
      return { role: message.role, content: message.content };
    });

    els.chatInput.value = "";
    updateChatSendState();

    state.chatMessages.push({ role: "user", content: question, html: "" });
    state.chatLoading = true;
    renderChat();

    let assistantMessage = null;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, history: history }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limited - try again in a moment.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted.");
        }
        const text = await response.text();
        throw new Error(text || "AI request failed");
      }

      if (!response.body) {
        throw new Error("Chat stream missing response body.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      function upsertAssistant(chunk) {
        if (!assistantMessage) {
          assistantMessage = { role: "assistant", content: "", html: "" };
          state.chatMessages.push(assistantMessage);
        }
        assistantMessage.content += chunk;
        assistantMessage.html = "";
        renderChat();
      }

      while (!done) {
        const read = await reader.read();
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }
          try {
            const payload = JSON.parse(json);
            const chunk = payload.choices && payload.choices[0] && payload.choices[0].delta && payload.choices[0].delta.content;
            if (chunk) upsertAssistant(chunk);
          } catch (error) {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      if (assistantMessage && assistantMessage.content) {
        assistantMessage.html = await requestRenderedHtml(assistantMessage.content);
        renderChat();
      }
    } catch (error) {
      pushToast("Chat error: " + (error.message || "unknown"), "error");
    } finally {
      state.chatLoading = false;
      renderChat();
      updateChatSendState();
    }
  }

  function resetChatConversation() {
    if (state.chatLoading) return;
    state.chatMessages = [];
    persistChatMessages();
    renderChat();
    updateChatSendState();
  }

  function renderChat() {
    persistChatMessages();
    updateChatSendState();
    els.chatSuggestions.classList.toggle("hidden", state.chatMessages.length > 0);
    const markup = state.chatMessages.map(function (message) {
      const body = message.role === "assistant"
        ? (message.html || escapeHtml(message.content).replace(/\n/g, "<br>"))
        : escapeHtml(message.content).replace(/\n/g, "<br>");
      return (
        '<div class="' + (message.role === "assistant" ? "chat-message-assistant" : "chat-message-user") + '">' +
        body +
        "</div>"
      );
    });
    if (state.chatLoading && (!state.chatMessages.length || state.chatMessages[state.chatMessages.length - 1].role !== "assistant")) {
      markup.push(
        '<div class="chat-message-assistant is-thinking">' +
        '<div class="thinking-indicator">' +
        '<span class="thinking-dot"></span>' +
        '<span class="thinking-dot"></span>' +
        '<span class="thinking-dot"></span>' +
        "</div>" +
        '<span class="thinking-label">Thinking...</span>' +
        "</div>"
      );
    }
    els.chatMessages.innerHTML = markup.join("");
    requestAnimationFrame(function () {
      els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
    });
  }

  function updateChatSendState() {
    els.chatSendBtn.disabled = state.chatLoading || !els.chatInput.value.trim();
    els.chatResetBtn.disabled = state.chatLoading || state.chatMessages.length === 0;
  }

  async function requestRenderedHtml(content) {
    if (state.markdownCache.has(content)) {
      return state.markdownCache.get(content);
    }
    const payload = await apiRequest("/api/markdown", {
      method: "POST",
      body: { content: content },
    });
    state.markdownCache.set(content, payload.html || "");
    return payload.html || "";
  }

  function upsertNote(note, preferFront) {
    const index = state.notes.findIndex(function (item) {
      return item.id === note.id;
    });
    if (index === -1) {
      state.notes.push(note);
    } else {
      state.notes[index] = note;
    }
    state.notes = sortNotes(state.notes);
    if (preferFront && state.notes[0] && state.notes[0].id !== note.id) {
      const selected = state.notes.find(function (item) {
        return item.id === note.id;
      });
      state.notes = [selected].concat(state.notes.filter(function (item) {
        return item.id !== note.id;
      }));
    }
    sanitizeSelectedNotes();
    ensureSelectedNoteStillExists();
  }

  function removeNotesFromState(noteIds) {
    const ids = new Set(noteIds);
    state.notes = state.notes.filter(function (note) {
      return !ids.has(note.id);
    });
    noteIds.forEach(function (noteId) {
      state.selectedNoteIds.delete(noteId);
    });
    ensureSelectedNoteStillExists();
    sanitizeSelectedNotes();
  }

  function upsertFolder(folder) {
    const index = state.folders.findIndex(function (item) {
      return item.id === folder.id;
    });
    if (index === -1) {
      state.folders.push(folder);
    } else {
      state.folders[index] = folder;
    }
    state.folders = sortFolders(state.folders);
  }

  async function copyShareLink(noteId) {
    const url = window.location.origin + "/n/" + noteId;
    try {
      await navigator.clipboard.writeText(url);
      pushToast("Share link copied", "success");
    } catch (error) {
      window.prompt("Copy share link:", url);
    }
  }

  async function apiRequest(url, options) {
    const config = Object.assign({ method: "GET" }, options || {});
    const headers = Object.assign({}, config.headers || {});
    if (config.body && !(config.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      config.body = JSON.stringify(config.body);
    }
    config.headers = headers;

    const response = await fetch(url, config);
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = { error: text };
      }
    }

    if (!response.ok) {
      const err = new Error(payload.error || ("Request failed (" + response.status + ")"));
      err.status = response.status;
      throw err;
    }
    return payload;
  }

  function splitBulkMarkdownClient(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const notes = [];
    let currentTitle = null;
    let currentBody = [];

    function flush() {
      if (currentTitle !== null) {
        notes.push({
          title: currentTitle.trim() || "Untitled",
          content: currentBody.join("\n").trim(),
        });
      }
    }

    lines.forEach(function (line) {
      const match = /^#\s+(.+?)\s*$/.exec(line);
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

  function loadStoredChatMessages() {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (message) {
        return message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string";
      }).map(function (message) {
        return {
          role: message.role,
          content: message.content,
          html: typeof message.html === "string" ? message.html : "",
        };
      });
    } catch (error) {
      return [];
    }
  }

  function persistChatMessages() {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state.chatMessages.map(function (message) {
        return {
          role: message.role,
          content: message.content,
          html: message.html || "",
        };
      })));
    } catch (error) {
      // Ignore storage failures for private browsing or quota issues.
    }
  }

  function pushToast(message, kind) {
    const toast = document.createElement("div");
    toast.className = "toast " + (kind || "success");
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    window.setTimeout(function () {
      toast.remove();
    }, 4200);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString();
  }
})();
