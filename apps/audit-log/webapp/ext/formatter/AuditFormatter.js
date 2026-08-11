sap.ui.define([], function () {
  "use strict";

  var TECHNICAL_FIELDS = {
    CLIENT: true,
    MANDT: true,
    SNAPSHOT: true,
    BATCH: true,
    CREATED_BY: true,
    CREATED_AT: true,
    CHANGED_BY: true,
    CHANGED_AT: true,
    LAST_CHANGED_AT: true,
    LOCAL_LAST_CHANGED_AT: true
  };

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

  function isTechnicalField(key) {
    return !!TECHNICAL_FIELDS[String(key || "").split(".").pop().toUpperCase()];
  }

  function safeParseObject(value) {
    var parsed;
    var attempts = 0;

    if (value === null || value === undefined || String(value).trim() === "") {
      return {};
    }

    parsed = value;

    while (typeof parsed === "string" && attempts < 3) {
      try {
        parsed = JSON.parse(parsed);
      } catch (error) {
        return {};
      }
      attempts += 1;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.getPrototypeOf(parsed) === Object.prototype ? parsed : {};
  }

  function parseLegacyMap(value) {
    var map = {};
    var text = String(value || "");

    if (!text || /^[\[{]/.test(text)) {
      return map;
    }

    function isLegacyFieldKey(key) {
      return /^[A-Za-z_][A-Za-z0-9_ .-]*$/.test(String(key || "").trim());
    }

    text.split("|").forEach(function (part) {
      var colonIndex = part.indexOf(":");
      var equalsIndex = part.indexOf("=");
      var index = colonIndex;
      var key;

      if (index < 0 || equalsIndex >= 0 && equalsIndex < index) {
        index = equalsIndex;
      }

      if (index < 0) {
        return;
      }

      key = part.slice(0, index).trim();

      if (key && isLegacyFieldKey(key)) {
        map[key] = part.slice(index + 1).trim();
      }
    });

    return map;
  }

  function parseAuditMap(value) {
    var parsed = safeParseObject(value);

    if (Object.keys(parsed).length) {
      return parsed;
    }

    return parseLegacyMap(value);
  }

  function flattenObject(object, prefix, rows) {
    Object.keys(object || {}).forEach(function (key) {
      var value = object[key];
      var name = prefix ? prefix + "." + key : key;

      if (isTechnicalField(name)) {
        return;
      }

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

    if (action === "C" || action === "CREATE" || action === "01") {
      return "Create";
    }

    if (action === "U" || action === "UPDATE" || action === "02") {
      return "Update";
    }

    if (action === "D" || action === "DELETE" || action === "03") {
      return "Delete";
    }

    if (action === "R" || action === "ROLLBACK") {
      return "Rollback";
    }

    if (action === "BULK" || action === "BULK CRUD OPERATION") {
      return "Bulk";
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

    if (action === "Bulk") {
      return "None";
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
    var parsed = parseAuditMap(recordKey);
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
    var parsed = parseAuditMap(rawValue);
    var rows = [];

    flattenObject(parsed, "", rows);

    return rows;
  }

  function formatRecordKeyText(recordKey) {
    var rows = getRecordKeyRows(recordKey);

    if (!rows.length) {
      return "—";
    }

    if (rows.length === 1) {
      return rows[0].value;
    }

    return rows.map(function (row) {
      return row.field + ": " + row.value;
    }).join("\n");
  }

  function formatCleanRecordKey(recordKey) {
    if (recordKey === null || recordKey === undefined || String(recordKey).trim() === "") {
      return "—";
    }

    var str = String(recordKey).trim();

    if (str.toUpperCase() === "BULK") {
      return "BULK";
    }

    var parsed = parseAuditMap(str);
    var rows = [];
    flattenObject(parsed, "", rows);

    if (rows.length > 0) {
      if (rows.length === 1) {
        return rows[0].value;
      }

      return rows.map(function (r) {
        return r.field + ": " + r.value;
      }).join(", ");
    }

    var firstLine = str.split(/[\r\n]+/)[0].trim().replace(/^[\{\[\s]+|[\}\]\s]+$/g, "");
    if (firstLine.length > 40) {
      return firstLine.substring(0, 40) + "...";
    }
    return firstLine || "—";
  }

  function isBulkRecordKey(recordKey) {
    return String(recordKey || "").trim().toUpperCase() === "BULK";
  }

  function isBulkRecord(values) {
    return isBulkRecordKey(values && values.RecordKey);
  }

  function getBulkCountText(oldValue, newValue) {
    var text = [newValue, oldValue].map(function (value) {
      return value === null || value === undefined ? "" : String(value);
    }).join(" ");
    var match = text.match(/(\d+)\s+item/i) || text.match(/Bulk audit:\s*(\d+)/i);

    return match ? match[1] + " item(s)" : "Bulk CRUD Operation";
  }

  function formatBulkButtonText(oldValue, newValue) {
    var countText = getBulkCountText(oldValue, newValue);
    var match = String(countText || "").match(/^(\d+)/);

    return match ? "Bulk (" + match[1] + ")" : "Bulk";
  }

  function formatBulkRecordKeyText(recordKey, oldValue, newValue) {
    return isBulkRecordKey(recordKey) ? "BULK · " + getBulkCountText(oldValue, newValue) : formatRecordKeyText(recordKey);
  }

  function getBulkActionText(actionType, items) {
    var normalized = [];
    var seen = {};
    var action;

    (items || []).forEach(function (item) {
      action = formatActionText(item && item.ActionType);

      if (action && action !== "—" && !seen[action]) {
        seen[action] = true;
        normalized.push(action);
      }
    });

    if (normalized.length === 1) {
      return normalized[0];
    }

    if (normalized.length > 1) {
      return "Bulk";
    }

    action = formatActionText(actionType);
    return action === "—" ? "Bulk" : action;
  }

  function formatRowActionText(actionType, recordKey) {
    var actionText = formatActionText(actionType);
    return isBulkRecordKey(recordKey) ? (actionText === "—" ? "Bulk" : "Bulk " + actionText) : actionText;
  }

  function hasMultipleActions(actionType) {
    var knownActions = {
      C: true,
      CREATE: true,
      U: true,
      UPDATE: true,
      D: true,
      DELETE: true,
      R: true,
      ROLLBACK: true
    };
    var actions = {};

    String(actionType || "").toUpperCase().split(/[\s,;|/+]+/).forEach(function (part) {
      if (knownActions[part]) {
        actions[part] = true;
      }
    });

    return Object.keys(actions).length > 1;
  }

  function getBulkItemCount(oldValue, newValue) {
    var text = [newValue, oldValue].map(function (value) {
      return value === null || value === undefined ? "" : String(value);
    }).join(" ");
    var match = text.match(/bulk\s+audit\s*:\s*(\d+)/i) || text.match(/bulk[^0-9]{0,20}\b(\d+)\s+items?/i);

    return match ? parseInt(match[1], 10) : null;
  }

  function hasBulkItemCount(oldValue, newValue) {
    var count = getBulkItemCount(oldValue, newValue);
    return count !== null && count >= 2;
  }

  function formatOperationText(actionType, recordKey, oldValue, newValue) {
    var rawAction = String(actionType || "").trim().toUpperCase();
    var action = rawAction.split(/\s+/)[0];
    var count = getBulkItemCount(oldValue, newValue);

    // If bulk audit explicitly specifies 1 item, render actual action (Create, Update, Delete, Rollback) instead of Bulk
    if (count === 1) {
      return formatActionText(action);
    }

    // If bulk audit specifies 2 or more items, render Bulk
    if (count !== null && count >= 2) {
      return "Bulk";
    }

    if (hasMultipleActions(actionType)) {
      return "Bulk";
    }

    if (rawAction.indexOf("BULK") >= 0 || String(recordKey || "").trim().toUpperCase().indexOf("BULK") === 0) {
      return "Bulk";
    }

    return formatActionText(action);
  }

  function formatOperationState(actionType, recordKey, oldValue, newValue) {
    var text = formatOperationText(actionType, recordKey, oldValue, newValue);
    return formatActionState(text);
  }

  function formatOperationIcon(actionType, recordKey, oldValue, newValue) {
    var text = formatOperationText(actionType, recordKey, oldValue, newValue);

    if (text === "Bulk") {
      return "sap-icon://group-2";
    }

    if (text === "Create") {
      return "sap-icon://add";
    }

    if (text === "Update") {
      return "sap-icon://edit";
    }

    if (text === "Delete") {
      return "sap-icon://delete";
    }

    if (text === "Rollback") {
      return "sap-icon://undo";
    }

    return "";
  }

  function formatShortAuditId(auditId) {
    var str = String(auditId || "").trim();
    if (!str) {
      return "—";
    }
    if (str.length > 16) {
      return str.substring(0, 8) + "..." + str.substring(str.length - 6);
    }
    return str;
  }

  function formatUserInitials(user) {
    var str = String(user || "").trim().replace(/^DEV-/i, "");
    if (!str) {
      return "";
    }
    return str.substring(0, 2).toUpperCase();
  }

  function formatRowActionState(actionType, recordKey) {
    return isBulkRecordKey(recordKey) ? "None" : formatActionState(actionType);
  }

  function isBulkVisible(recordKey) {
    return isBulkRecordKey(recordKey);
  }

  function formatItemNumber(value, index) {
    return formatAuditValue(value || value === 0 ? value : index + 1);
  }

  function buildItemRows(values) {
    return buildChangeRows({
      ActionType: values && values.ActionType,
      FieldName: values && values.FieldName,
      OldValue: values && (values.OldValue !== undefined ? values.OldValue : values.OldData),
      NewValue: values && (values.NewValue !== undefined ? values.NewValue : values.NewData)
    });
  }

  function buildBulkItemViewModel(values, index) {
    var actionText = formatActionText(values && values.ActionType);
    var recordKeyRows = getRecordKeyRows(values && values.RecordKey);

    return {
      itemNumber: formatItemNumber(values && (values.ItemNo || values.ItemNumber), index || 0),
      actionText: actionText,
      actionState: formatActionState(values && values.ActionType),
      recordKeyText: formatRecordKeyText(values && values.RecordKey),
      recordKeyRows: recordKeyRows,
      changeRows: buildItemRows(values || {}),
      showOldColumn: actionText === "Update" || actionText === "Delete" || actionText === "Rollback",
      showNewColumn: actionText === "Create" || actionText === "Update" || actionText === "Rollback",
      oldColumnHeader: actionText === "Delete" ? "Old Value" : "Old",
      newColumnHeader: actionText === "Create" ? "New Value" : "New"
    };
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
        newValue: newRow ? newRow.value : "—",
        oldCompare: oldRow ? oldRow.value : "",
        newCompare: newRow ? newRow.value : ""
      };
    }).filter(function (row) {
      if (actionText === "Update") {
        return row.oldCompare !== row.newCompare;
      }

      return row.oldValue !== "—" || row.newValue !== "—";
    }).map(function (row) {
      return {
        field: row.field,
        oldValue: row.oldValue,
        newValue: row.newValue
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

    if (actionText === "Update" && formatAuditValue(values.OldValue) === formatAuditValue(values.NewValue)) {
      return [];
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

  function formatAuditListStatusText(actionType, rollbackAuditId) {
    if (String(actionType || "").trim().toUpperCase() === "R") {
      return "Rolled back";
    }

    return rollbackAuditId && String(rollbackAuditId).trim() ? "Rolled back" : "Review required";
  }

  function formatAuditListStatusState(actionType, rollbackAuditId) {
    return formatAuditListStatusText(actionType, rollbackAuditId) === "Rolled back" ? "Success" : "Information";
  }

  var AuditFormatter = {
    formatActionText: formatActionText,
    formatActionState: formatActionState,
    formatAuditValue: formatAuditValue,
    formatTimestamp: formatTimestamp,
    formatRecordKeyText: formatRecordKeyText,
    formatCleanRecordKey: formatCleanRecordKey,
    formatBulkRecordKeyText: formatBulkRecordKeyText,
    formatRowActionText: formatRowActionText,
    formatOperationText: formatOperationText,
    formatOperationState: formatOperationState,
    formatOperationIcon: formatOperationIcon,
    formatShortAuditId: formatShortAuditId,
    formatUserInitials: formatUserInitials,
    formatRowActionState: formatRowActionState,
    isBulkVisible: isBulkVisible,
    getRecordKeyRows: getRecordKeyRows,
    getValueRows: getValueRows,
    getChangeTitle: getChangeTitle,
    buildChangeRows: buildChangeRows,
    getBulkCountText: getBulkCountText,
    formatBulkButtonText: formatBulkButtonText,
    getBulkActionText: getBulkActionText,
    isBulkRecord: isBulkRecord,
    buildBulkItemViewModel: buildBulkItemViewModel,
    isRollbackAvailable: isRollbackAvailable,
    formatRollbackText: formatRollbackText,
    formatRollbackState: formatRollbackState,
    formatAuditListStatusText: formatAuditListStatusText,
    formatAuditListStatusState: formatAuditListStatusState,
    _test: {
      safeParseObject: safeParseObject,
      parseAuditMap: parseAuditMap,
      formatActionText: formatActionText,
      formatActionState: formatActionState,
      formatAuditValue: formatAuditValue,
      formatTimestamp: formatTimestamp,
      formatRecordKeyText: formatRecordKeyText,
      formatCleanRecordKey: formatCleanRecordKey,
      formatBulkRecordKeyText: formatBulkRecordKeyText,
      formatRowActionText: formatRowActionText,
      formatOperationText: formatOperationText,
      formatOperationState: formatOperationState,
      formatRowActionState: formatRowActionState,
      isBulkVisible: isBulkVisible,
      getRecordKeyRows: getRecordKeyRows,
      getValueRows: getValueRows,
      getChangeTitle: getChangeTitle,
      buildChangeRows: buildChangeRows,
      getBulkCountText: getBulkCountText,
      formatBulkButtonText: formatBulkButtonText,
      getBulkActionText: getBulkActionText,
      isBulkRecord: isBulkRecord,
      buildBulkItemViewModel: buildBulkItemViewModel,
      isRollbackAvailable: isRollbackAvailable,
      formatRollbackText: formatRollbackText,
      formatRollbackState: formatRollbackState
    }
  };

  try {
    if (typeof window !== "undefined") {
      window.ztbl = window.ztbl || {};
      window.ztbl.audit = window.ztbl.audit || {};
      window.ztbl.audit.ui = window.ztbl.audit.ui || {};
      window.ztbl.audit.ui.ext = window.ztbl.audit.ui.ext || {};
      window.ztbl.audit.ui.ext.formatter = window.ztbl.audit.ui.ext.formatter || {};
      window.ztbl.audit.ui.ext.formatter.AuditFormatter = AuditFormatter;
    }
  } catch (e) {
    // Ignore in non-browser env
  }

  return AuditFormatter;
});
