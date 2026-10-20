/* DataVault — browser dashboard logic
 * This file is intended to be loaded by index.html:
 *   <script src="app.js" defer></script>
 *
 * Storage is local to this browser (localStorage); it does not connect to
 * the Python/Java SQLite database or upload data to a server.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "datavault.records.v1";
  const $ = (id) => document.getElementById(id);

  const requiredIds = [
    "notice", "recordForm", "recordKey", "recordCategory", "recordValue",
    "editorTitle", "saveBtn", "totalStat", "categoryStat", "todayStat",
    "categoryFilter", "searchInput", "recordCount", "recordList",
    "resetBtn", "newRecordBtn", "exportBtn", "importBtn", "importFile",
    "clearAllBtn", "editorPanel"
  ];

  const missing = requiredIds.filter((id) => !$(id));
  if (missing.length) {
    console.error("DataVault: required HTML elements are missing:", missing);
    return;
  }

  let records = [];
  let editingKey = null;
  let noticeTimer = null;

  const nowISO = () => new Date().toISOString();
  const toText = (value) => String(value ?? "");
  const valueToText = (value) =>
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  function escapeHTML(value) {
    return toText(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString();
  }

  function showNotice(message, isError = false) {
    const box = $("notice");
    box.textContent = message;
    box.style.borderColor = isError ? "#8c3945" : "#2b745d";
    box.style.background = isError ? "#361923" : "#103329";
    box.style.color = isError ? "#ffc2c8" : "#b8ffe1";
    box.classList.add("show");

    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.classList.remove("show"), 4000);
  }

  function loadRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) {
        throw new Error("Stored records are not a JSON array.");
      }

      records = parsed.filter(
        (record) =>
          record &&
          typeof record.key === "string" &&
          Object.prototype.hasOwnProperty.call(record, "value")
      );
    } catch (error) {
      console.error("DataVault load error:", error);
      records = [];
      showNotice(
        "Saved data could not be read. If you have a JSON backup, use Import JSON.",
        true
      );
    }
  }

  function persistRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      console.error("DataVault save error:", error);
      showNotice(
        "Could not save. Browser storage may be full or disabled. Export a backup and free space.",
        true
      );
      return false;
    }
  }

  function resetForm() {
    editingKey = null;
    $("recordForm").reset();
    $("recordCategory").value = "general";
    $("editorTitle").textContent = "Create a record";
    $("saveBtn").textContent = "Save record";
  }

  function render() {
    $("totalStat").textContent = String(records.length);

    const categories = [...new Set(
      records.map((record) => record.category || "general")
    )].sort((a, b) => a.localeCompare(b));

    $("categoryStat").textContent = String(categories.length);

    const today = new Date().toDateString();
    $("todayStat").textContent = String(
      records.filter((record) => {
        const date = new Date(record.createdAt);
        return !Number.isNaN(date.getTime()) && date.toDateString() === today;
      }).length
    );

    const previousCategory = $("categoryFilter").value;
    $("categoryFilter").innerHTML =
      '<option value="">All categories</option>' +
      categories.map((category) =>
        `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
      ).join("");

    if (categories.includes(previousCategory)) {
      $("categoryFilter").value = previousCategory;
    }

    const query = $("searchInput").value.trim().toLocaleLowerCase();
    const categoryFilter = $("categoryFilter").value;

    const visibleRecords = records
      .filter((record) => {
        const searchable = [
          record.key,
          record.category || "general",
          valueToText(record.value)
        ].join(" ").toLocaleLowerCase();

        return (
          (!query || searchable.includes(query)) &&
          (!categoryFilter || (record.category || "general") === categoryFilter)
        );
      })
      .sort((a, b) => toText(b.updatedAt).localeCompare(toText(a.updatedAt)));

    $("recordCount").textContent =
      `${visibleRecords.length} ${visibleRecords.length === 1 ? "record" : "records"}`;

    if (!visibleRecords.length) {
      $("recordList").innerHTML = `
        <div class="empty">
          <b>${records.length ? "No matching records" : "Your vault is ready"}</b>
          ${records.length
            ? "Try another search or category."
            : "Create your first record to get started."}
        </div>`;
      return;
    }

    $("recordList").innerHTML = visibleRecords.map((record) => {
      const fullValue = valueToText(record.value);
      const preview = fullValue.length > 500
        ? `${fullValue.slice(0, 500)}…`
        : fullValue;

      return `
        <article class="record">
          <div class="record-head">
            <div style="min-width:0">
              <div class="record-title">${escapeHTML(record.key)}</div>
              <span class="tag">${escapeHTML(record.category || "general")}</span>
            </div>
            <div class="record-buttons">
              <button type="button" data-action="edit" data-key="${escapeHTML(record.key)}">Edit</button>
              <button type="button" class="danger" data-action="delete" data-key="${escapeHTML(record.key)}">Delete</button>
            </div>
          </div>
          <div class="record-preview">${escapeHTML(preview)}</div>
          <div class="record-meta">
            Created ${escapeHTML(formatDate(record.createdAt))} ·
            Updated ${escapeHTML(formatDate(record.updatedAt))}
          </div>
        </article>`;
    }).join("");
  }

  function saveRecord(event) {
    event.preventDefault();

    const key = $("recordKey").value.trim();
    const category = $("recordCategory").value.trim().toLocaleLowerCase() || "general";
    const rawValue = $("recordValue").value;

    if (!key) {
      showNotice("Please enter a record key.", true);
      $("recordKey").focus();
      return;
    }

    if (key.length > 160) {
      showNotice("Record keys must be 160 characters or fewer.", true);
      return;
    }

    if (category.length > 80) {
      showNotice("Categories must be 80 characters or fewer.", true);
      return;
    }

    let value;
    try {
      value = JSON.parse(rawValue);
    } catch {
      value = rawValue;
    }

    const existing = records.find((record) => record.key === key);
    if (existing && editingKey !== key) {
      showNotice("That key already exists. Edit the existing record or choose a unique key.", true);
      return;
    }

    const previous = editingKey
      ? records.find((record) => record.key === editingKey)
      : null;

    const updatedRecord = {
      key,
      value,
      category,
      createdAt: previous?.createdAt || nowISO(),
      updatedAt: nowISO()
    };

    const previousRecords = records.slice();

    if (previous) {
      records = records.filter((record) => record.key !== editingKey);
    }
    records.push(updatedRecord);

    if (!persistRecords()) {
      records = previousRecords;
      render();
      return;
    }

    resetForm();
    render();
    showNotice(previous ? "Record updated." : "Record saved.");
  }

  function handleRecordAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const key = button.dataset.key;
    const record = records.find((item) => item.key === key);
    if (!record) return;

    if (button.dataset.action === "edit") {
      editingKey = record.key;
      $("recordKey").value = record.key;
      $("recordCategory").value = record.category || "general";
      $("recordValue").value = valueToText(record.value);
      $("editorTitle").textContent = "Edit record";
      $("saveBtn").textContent = "Update record";
      $("editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
      $("recordKey").focus({ preventScroll: true });
      return;
    }

    if (button.dataset.action === "delete") {
      if (!confirm(`Delete "${key}"? This cannot be undone unless you have a backup.`)) {
        return;
      }

      const previousRecords = records.slice();
      records = records.filter((item) => item.key !== key);

      if (!persistRecords()) {
        records = previousRecords;
        render();
        return;
      }

      if (editingKey === key) resetForm();
      render();
      showNotice("Record deleted.");
    }
  }

  function exportBackup() {
    const backup = {
      format: "DataVault JSON backup",
      version: 1,
      exportedAt: nowISO(),
      records
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `datavault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice("Backup export started.");
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed.records;

      if (!Array.isArray(incoming)) {
        throw new Error("Expected a JSON array or a DataVault backup with a records array.");
      }

      const cleanRecords = incoming.map((record) => {
        if (
          !record ||
          typeof record.key !== "string" ||
          !record.key.trim() ||
          !Object.prototype.hasOwnProperty.call(record, "value")
        ) {
          throw new Error("Every record must have a non-empty key and a value.");
        }

        return {
          key: record.key,
          value: record.value,
          category: toText(record.category || "general").trim().toLocaleLowerCase() || "general",
          createdAt: record.createdAt || nowISO(),
          updatedAt: record.updatedAt || nowISO()
        };
      });

      const uniqueKeys = new Set(cleanRecords.map((record) => record.key));
      if (uniqueKeys.size !== cleanRecords.length) {
        throw new Error("The import file contains duplicate record keys.");
      }

      if (!confirm(
        `Import ${cleanRecords.length} record(s)? Existing records with the same key will be replaced.`
      )) {
        return;
      }

      const previousRecords = records.slice();
      const merged = new Map(records.map((record) => [record.key, record]));
      cleanRecords.forEach((record) => merged.set(record.key, record));
      records = [...merged.values()];

      if (!persistRecords()) {
        records = previousRecords;
        render();
        return;
      }

      render();
      showNotice(`Imported ${cleanRecords.length} record(s).`);
    } catch (error) {
      showNotice(`Import failed: ${error.message}`, true);
    } finally {
      event.target.value = "";
    }
  }

  function clearAllRecords() {
    if (!records.length) {
      showNotice("There are no records to delete.");
      return;
    }

    if (!confirm("Delete ALL records from this browser? Export a backup first if needed.")) {
      return;
    }

    const previousRecords = records.slice();
    records = [];

    if (!persistRecords()) {
      records = previousRecords;
      render();
      return;
    }

    resetForm();
    render();
    showNotice("All records deleted.");
  }

  $("recordForm").addEventListener("submit", saveRecord);
  $("recordList").addEventListener("click", handleRecordAction);
  $("searchInput").addEventListener("input", render);
  $("categoryFilter").addEventListener("change", render);
  $("resetBtn").addEventListener("click", resetForm);
  $("newRecordBtn").addEventListener("click", () => {
    resetForm();
    $("recordKey").focus();
    $("editorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("exportBtn").addEventListener("click", exportBackup);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", importBackup);
  $("clearAllBtn").addEventListener("click", clearAllRecords);

  loadRecords();
  $("recordCategory").value = "general";
  render();
})();
