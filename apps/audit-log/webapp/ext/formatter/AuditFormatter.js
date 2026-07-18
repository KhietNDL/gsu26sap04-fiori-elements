sap.ui.define([], function () {
  "use strict";

  function titleCase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/(^|[\s_-])([a-z])/g, function (match, separator, char) {
        return separator + char.toUpperCase();
      });
  }

  function mapFieldLabel(key) {
    return titleCase(String(key || "").split(".").pop().replace(/_/g, " "));
  }

  function safeParseObject(value) {
    var parsed;

    if (value === null || value === undefined || String(value).trim() === "") {
      return {};
    }

    try {
      parsed = typeof value === "string" ? JSON.parse(value) : value;
    } catch (error) {
      return {};
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.getPrototypeOf(parsed) === Object.prototype ? parsed : {};
  }

  function flattenObject(object, prefix, rows) {
    Object.keys(object || {}).forEach(function (key) {
      var value = object[key];
      var name = prefix ? prefix + "." + key : key;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        flattenObject(value, name, rows);
        return;
      }

      rows.push({
        key: name,
        field: mapFieldLabel(name),
        value: formatAuditValue(value)
      });
    });
  }

  function formatActionText(value) {
    var action = String(value || "").trim().toUpperCase();

    if (action === "C" || action === "CREATE") {
      return "Create";
    }

    if (action === "U" || action === "UPDATE") {
      return "Update";
    }

    if (action === "D" || action === "DELETE") {
      return "Delete";
    }

    if (action === "R" || action === "ROLLBACK") {
      return "Rollback";
    }

    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function formatActionState(value) {
    var action = formatActionText(value);

    if (action === "Create") {
      return "Success";
    }

    if (action === "Update") {
      return "Information";
    }

    if (action === "Delete") {
      return "Error";
    }

    if (action === "Rollback") {
      return "Warning";
    }

    return "None";
  }

  function formatAuditValue(value) {
    var normalized;

    if (value === null || value === undefined || String(value).trim() === "") {
      return "—";
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    normalized = String(value).trim().toUpperCase();

    if (normalized === "TRUE") {
      return "Yes";
    }

    if (normalized === "FALSE") {
      return "No";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function formatTimestamp(value) {
    var date;

    if (value === null || value === undefined || value === "") {
      return "—";
    }

    date = new Date(value);

    if (isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getRecordKeyRows(recordKey) {
    var parsed = safeParseObject(recordKey);
    var rows = [];

    flattenObject(parsed, "", rows);

    if (rows.length) {
      return rows;
    }

    if (recordKey !== null && recordKey !== undefined && recordKey !== "") {
      return [{
        key: "RecordKey",
        field: "Record Key",
        value: String(recordKey)
      }];
    }

    return [];
  }

  function getValueRows(rawValue) {
    var parsed = safeParseObject(rawValue);
    var rows = [];

    flattenObject(parsed, "", rows);

    return rows;
  }

  function formatRecordKeyText(recordKey) {
    var rows = getRecordKeyRows(recordKey);

    if (!rows.length) {
      return "—";
    }

    return rows.map(function (row) {
      return row.field + ": " + row.value;
    }).join(", ");
  }

  function getChangeTitle(actionType) {
    var action = formatActionText(actionType);

    if (action === "Create") {
      return "Created Value";
    }

    if (action === "Delete") {
      return "Deleted Value";
    }

    if (action === "Rollback") {
      return "Rollback Change";
    }

    return "Value Change";
  }

  function rowsToMap(rows) {
    var map = {};

    rows.forEach(function (row) {
      map[row.key] = row;
    });

    return map;
  }

  function buildJsonChangeRows(values, actionText, oldRows, newRows) {
    var oldMap = rowsToMap(oldRows);
    var newMap = rowsToMap(newRows);
    var keys = [];
    var seen = {};

    function addKey(key) {
      if (!seen[key]) {
        seen[key] = true;
        keys.push(key);
      }
    }

    if (actionText === "Create") {
      newRows.forEach(function (row) {
        addKey(row.key);
      });
    } else if (actionText === "Delete") {
      oldRows.forEach(function (row) {
        addKey(row.key);
      });
    } else {
      oldRows.forEach(function (row) {
        addKey(row.key);
      });
      newRows.forEach(function (row) {
        addKey(row.key);
      });
    }

    return keys.map(function (key) {
      var oldRow = oldMap[key];
      var newRow = newMap[key];

      return {
        field: (newRow || oldRow || {}).field || mapFieldLabel(key),
        oldValue: oldRow ? oldRow.value : "—",
        newValue: newRow ? newRow.value : "—"
      };
    });
  }

  function buildChangeRows(values) {
    var actionText = formatActionText(values.ActionType);
    var oldRows = getValueRows(values.OldValue);
    var newRows = getValueRows(values.NewValue);

    if (oldRows.length || newRows.length) {
      return buildJsonChangeRows(values, actionText, oldRows, newRows);
    }

    return [{
      field: values.FieldName ? mapFieldLabel(values.FieldName) : "—",
      oldValue: formatAuditValue(values.OldValue),
      newValue: formatAuditValue(values.NewValue)
    }];
  }

  function isRollbackAvailable(operationControl) {
    var value = operationControl;

    if (operationControl && typeof operationControl === "object") {
      value = operationControl.rollback;
    }

    return value === true || value === "true" || value === "X" || value === 1;
  }

  function formatRollbackText(operationControl) {
    return isRollbackAvailable(operationControl) ? "Rollback available" : "Rollback not available";
  }

  function formatRollbackState(operationControl) {
    return isRollbackAvailable(operationControl) ? "Success" : "None";
  }

  return {
    formatActionText: formatActionText,
    formatActionState: formatActionState,
    formatAuditValue: formatAuditValue,
    formatTimestamp: formatTimestamp,
    formatRecordKeyText: formatRecordKeyText,
    getRecordKeyRows: getRecordKeyRows,
    getValueRows: getValueRows,
    getChangeTitle: getChangeTitle,
    buildChangeRows: buildChangeRows,
    formatRollbackText: formatRollbackText,
    formatRollbackState: formatRollbackState,
    _test: {
      safeParseObject: safeParseObject,
      formatActionText: formatActionText,
      formatActionState: formatActionState,
      formatAuditValue: formatAuditValue,
      formatTimestamp: formatTimestamp,
      formatRecordKeyText: formatRecordKeyText,
      getRecordKeyRows: getRecordKeyRows,
      getValueRows: getValueRows,
      getChangeTitle: getChangeTitle,
      buildChangeRows: buildChangeRows,
      isRollbackAvailable: isRollbackAvailable,
      formatRollbackText: formatRollbackText,
      formatRollbackState: formatRollbackState
    }
  };
});
