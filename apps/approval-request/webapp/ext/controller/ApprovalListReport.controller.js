sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "ztbl/approval/ui/ext/formatter/ApprovalFormatter",
  "ztbl/approval/ui/ext/util/ODataErrorHandler"
], function (ControllerExtension, Fragment, JSONModel, ApprovalFormatter, ODataErrorHandler) {
  "use strict";

  var DETAIL_PROPERTIES = [
    "AprvlId",
    "ActionType",
    "Status",
    "TableName",
    "RecordKey",
    "OldData",
    "NewData",
    "SubmittedBy",
    "SubmittedAt",
    "ApprovedBy",
    "ApprovedAt",
    "AprvlComment"
  ];

  var TECHNICAL_FIELDS = {
    CLIENT: true,
    MANDT: true,
    CREATED_BY: true,
    CREATED_AT: true,
    CHANGED_BY: true,
    CHANGED_AT: true,
    LAST_CHANGED_AT: true,
    LOCAL_LAST_CHANGED_AT: true
  };

  var APPROVAL_ITEMS_DEBUG = false;

  function logApprovalItemsLifecycle(model, eventName, details) {
    var payload;

    if (!APPROVAL_ITEMS_DEBUG || !console || !console.debug) {
      return;
    }

    payload = details || {};
    console.debug("[ApprovalItems]", {
      timestamp: new Date().toISOString(),
      aprvlId: payload.aprvlId || model && model.getProperty && model.getProperty("/approvalId"),
      sequence: payload.sequence || model && model.getProperty && model.getProperty("/itemsLoadSequence"),
      event: eventName,
      itemsLoadingBefore: payload.itemsLoadingBefore,
      itemsLoadingAfter: model && model.getProperty && model.getProperty("/itemsLoading"),
      itemCount: payload.itemCount !== undefined ? payload.itemCount : model && model.getProperty && model.getProperty("/itemCount"),
      bindingPath: payload.bindingPath || model && model.getProperty && model.getProperty("/currentItemsBindingPath"),
      previousBindingExists: !!payload.previousBindingExists
    });
  }

  function getContextValue(context, propertyName) {
    var object = context && context.getObject && context.getObject();

    if (object && Object.prototype.hasOwnProperty.call(object, propertyName)) {
      return object[propertyName];
    }

    return context && context.getProperty ? context.getProperty(propertyName) : undefined;
  }

  function getObjectPageContext(view) {
    var viewContext = view && view.getBindingContext && view.getBindingContext();
    var foundContext = null;

    if (viewContext) {
      return viewContext;
    }

    if (!view || !view.findAggregatedObjects) {
      return null;
    }

    view.findAggregatedObjects(true, function (control) {
      var context = control.getBindingContext && control.getBindingContext();

      if (context) {
        foundContext = context;
        return true;
      }

      return false;
    });

    return foundContext;
  }

  function ensureDetailModel(view) {
    var model = view && view.getModel && view.getModel("approvalDetail");

    if (!model && view && view.setModel) {
      model = new JSONModel({
        operationText: "-",
        operationState: "None",
        statusText: "-",
        statusState: "None",
        tableName: "-",
        requestInfoRows: [],
        recordKeyRows: [],
        recordKeyVisible: false,
        changeRows: [],
        changeTitle: "Change Details",
        changeColumnCount: 3,
        showOldColumn: false,
        showNewColumn: true,
        oldColumnHeader: "Old Value",
        newColumnHeader: "New Value",
        changeMessage: "Loading change details...",
        technicalRecordKey: "",
        technicalOldData: "",
        technicalNewData: "",
        bulkVisible: false,
        bulkSummaryText: "",
        bulkSummaryVisible: false,
        currentApprovalId: "",
        currentItemsBindingPath: "",
        itemsLoadSequence: 0,
        itemsLoadFinished: false,
        itemsLoading: false,
        itemsLoaded: false,
        itemCount: 0,
        itemsEmptyVisible: false,
        itemsErrorText: "",
        itemsErrorVisible: false,
        bulkItemSelected: false,
        bulkItemNumberText: "",
        bulkItemActionText: "",
        bulkItemActionState: "None",
        bulkItemRecordKeyText: "",
        bulkItemStatusText: "",
        bulkItemStatusState: "None",
        bulkItemHeaderRows: [],
        bulkItemRecordKeyRows: [],
        bulkItemRecordKeyVisible: false,
        bulkItemTitle: "",
        bulkItemMessage: "",
        bulkItemRows: [],
        bulkItemShowAllFields: false,
        bulkItemShowAllFieldsVisible: false,
        bulkItemShowOldColumn: false,
        bulkItemShowNewColumn: true,
        bulkItemOldColumnHeader: "Old Value",
        bulkItemNewColumnHeader: "New Value",
        bulkItemRecordKeyJson: "",
        bulkItemOldDataJson: "",
        bulkItemNewDataJson: ""
      });
      view.setModel(model, "approvalDetail");
    }

    return model;
  }

  function titleCase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/(^|[\s_-])([a-z])/g, function (match, separator, char) {
        return separator + char.toUpperCase();
      });
  }

  function mapFieldLabel(key) {
    var lastPart = String(key || "").split(".").pop();

    return titleCase(lastPart.replace(/_/g, " "));
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
        label: mapFieldLabel(name),
        value: value
      });
    });
  }

  function isTechnicalField(key) {
    var parts = String(key || "").toUpperCase().split(".");
    return TECHNICAL_FIELDS[parts[parts.length - 1]];
  }

  function formatDateValue(value) {
    var text = String(value || "");
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    var date;

    if (!match) {
      return text;
    }

    date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatApprovalValue(key, value) {
    var normalizedKey = String(key || "").split(".").pop().toUpperCase();
    var normalizedValue = String(value === null || value === undefined ? "" : value).trim().toUpperCase();

    if (value === null || value === undefined || value === "") {
      return "—";
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (normalizedValue === "X" && /(^|_)(FLAG|ACTIVE|ENABLED|VALID|DELETED|LOCKED)$/.test(normalizedKey)) {
      return "Yes";
    }

    if (normalizedKey === "STATUS") {
      if (normalizedValue === "A" || normalizedValue === "ACTIVE") {
        return "Active";
      }

      if (normalizedValue === "I" || normalizedValue === "INACTIVE") {
        return "Inactive";
      }

      if (normalizedValue === "B" || normalizedValue === "BLOCKED") {
        return "Blocked";
      }
    }

    if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
      return formatDateValue(String(value).slice(0, 10));
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return formatDateValue(value);
    }

    if (Array.isArray(value)) {
      return value.join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function getJsonRows(rawJson) {
    var parsed = safeParseObject(rawJson);
    var rows = [];

    flattenObject(parsed, "", rows);

    return rows.map(function (row) {
      return {
        key: row.key,
        field: row.label,
        value: formatApprovalValue(row.key, row.value),
        compareValue: normalizeCompareValue(row.value)
      };
    });
  }

  function getBusinessJsonRows(rawJson) {
    return getJsonRows(rawJson).filter(function (row) {
      return !isTechnicalField(row.key);
    });
  }

  function rowsToMap(rows) {
    var map = {};

    rows.forEach(function (row) {
      map[row.key] = row;
    });

    return map;
  }

  function normalizeCompareValue(value) {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value).trim();
  }

  function buildApprovalDiff(actionType, oldData, newData, recordKey, showAllFields) {
    var action = ApprovalFormatter.formatActionText(actionType);
    var oldRows = getBusinessJsonRows(oldData);
    var newRows = getBusinessJsonRows(newData);
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

    if (action === "Create") {
      newRows.forEach(function (row) {
        addKey(row.key);
      });
    } else if (action === "Delete") {
      oldRows.forEach(function (row) {
        addKey(row.key);
      });

      if (!keys.length) {
        getBusinessJsonRows(recordKey).forEach(function (row) {
          addKey(row.key);
          oldMap[row.key] = row;
        });
      }
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
        oldCompare: oldRow ? oldRow.compareValue : "",
        newCompare: newRow ? newRow.compareValue : ""
      };
    }).filter(function (row) {
      if (action === "Update") {
        return showAllFields || row.oldCompare !== row.newCompare;
      }

      return row.oldValue !== "—" || row.newValue !== "—";
    });
  }

  function formatTechnicalJson(rawJson) {
    var parsed = safeParseObject(rawJson);

    if (!rawJson) {
      return "";
    }

    if (!Object.keys(parsed).length) {
      return String(rawJson);
    }

    return JSON.stringify(parsed, null, 2);
  }

  function formatRawJson(rawJson) {
    var parsed;

    if (rawJson === null || rawJson === undefined || rawJson === "") {
      return "";
    }

    try {
      parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      return String(rawJson);
    }
  }

  function requestContextValues(context) {
    var values = {};

    if (!context) {
      return Promise.resolve(values);
    }

    return Promise.all(DETAIL_PROPERTIES.map(function (propertyName) {
      var propertyPromise;

      if (!context.requestProperty) {
        values[propertyName] = getContextValue(context, propertyName);
        return Promise.resolve();
      }

      try {
        propertyPromise = context.requestProperty(propertyName);
      } catch (error) {
        values[propertyName] = getContextValue(context, propertyName);
        return Promise.resolve();
      }

      return propertyPromise.then(function (value) {
        values[propertyName] = value;
      }).catch(function () {
        values[propertyName] = getContextValue(context, propertyName);
      });
    })).then(function () {
      return values;
    });
  }

  function valueOrDash(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function isEmptyValue(value) {
    return value === null || value === undefined || String(value).trim() === "";
  }

  function parseApprovalTimestamp(value) {
    var text;
    var match;
    var normalized;
    var date;

    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    text = String(value).trim();

    if (!text) {
      return null;
    }

    match = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(text);
    if (match) {
      date = new Date(Number(match[1]));
      return isNaN(date.getTime()) ? null : date;
    }

    normalized = text.replace(/(\.\d{3})\d+(?=(Z|[+-]\d{2}:?\d{2})?$)/, "$1");
    date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  }

  function formatVietnamTimestamp(value) {
    var date = parseApprovalTimestamp(value);
    var formatted;

    if (!date) {
      return valueOrDash(value);
    }

    formatted = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(date);

    return formatted.replace(",", "") + " (GMT+7)";
  }

  function buildRequestInfoRows(values) {
    var rows = [
      { label: "Approval ID", value: values.AprvlId },
      { label: "Table Name", value: values.TableName },
      { label: "Operation", value: ApprovalFormatter.formatActionText(values.ActionType), state: ApprovalFormatter.formatActionState(values.ActionType) },
      { label: "Status", value: ApprovalFormatter.formatStatusText(values.Status), state: ApprovalFormatter.formatStatusState(values.Status) },
      { label: "Submitted By", value: values.SubmittedBy },
      { label: "Submitted At", value: formatVietnamTimestamp(values.SubmittedAt) }
    ];

    [
      { label: "Reviewed By", value: values.ApprovedBy },
      { label: "Reviewed At", value: formatVietnamTimestamp(values.ApprovedAt), rawValue: values.ApprovedAt },
      { label: "Remarks", value: values.AprvlComment }
    ].forEach(function (row) {
      if (!isEmptyValue(row.rawValue !== undefined ? row.rawValue : row.value)) {
        rows.push(row);
      }
    });

    return rows.map(function (row) {
      return {
        label: row.label,
        value: valueOrDash(row.value),
        state: row.state || "None",
        isStatus: !!row.state
      };
    });
  }

  function getChangeTitle(actionText) {
    if (actionText === "Create") {
      return "New Record";
    }

    if (actionText === "Delete") {
      return "Record To Be Deleted";
    }

    return "Field-Level Changes";
  }

  function getChangeMessage(actionText, tableName, rowCount, showAllFields) {
    var suffix = tableName ? " for " + tableName : "";

    if (actionText === "Create") {
      return "Create request" + suffix + ". Review the new record values before approving.";
    }

    if (actionText === "Delete") {
      return "Delete request" + suffix + ". Review the record values that will be removed.";
    }

    if (showAllFields) {
      return "Update request" + suffix + ". Showing all business fields.";
    }

    return rowCount ? "Update request" + suffix + ". Showing changed fields only." : "Update request" + suffix + ". No changed business fields were detected.";
  }

  function updateApprovalDetailModel(view, knownValues, knownContext) {
    var context = knownContext || getObjectPageContext(view);
    var model = ensureDetailModel(view);
    var initialContextPath = context && context.getPath && context.getPath();

    if (!context || !model) {
      return;
    }

    return (knownValues ? Promise.resolve(knownValues) : requestContextValues(context)).then(function (values) {
      var currentContext = getObjectPageContext(view);
      var currentContextPath = currentContext && currentContext.getPath && currentContext.getPath();
      var actionText = ApprovalFormatter.formatActionText(values.ActionType);
      var recordKeyRows = getJsonRows(values.RecordKey);
      var changeRows = buildApprovalDiff(values.ActionType, values.OldData, values.NewData, values.RecordKey);
      var showOldColumn = actionText === "Update" || actionText === "Delete";
      var showNewColumn = actionText === "Create" || actionText === "Update";
      var comment = values.AprvlComment || "-";
      var bulkVisible = isBulkValues(values.RecordKey);
      var sameApproval = model.getProperty("/approvalId") === values.AprvlId;
      var contextPath = initialContextPath || values.AprvlId;
      var sameBindingPath = model.getProperty("/currentItemsBindingPath") === contextPath;
      var keepBulkItem = bulkVisible && sameApproval && sameBindingPath && model.getProperty("/bulkItemSelected");
      var keepItemsState = bulkVisible && sameBindingPath;

      if (initialContextPath && currentContextPath && initialContextPath !== currentContextPath) {
        return;
      }

      model.setData({
        approvalId: values.AprvlId || "-",
        operationText: actionText,
        operationState: ApprovalFormatter.formatActionState(values.ActionType),
        statusText: ApprovalFormatter.formatStatusText(values.Status),
        statusState: ApprovalFormatter.formatStatusState(values.Status),
        tableName: values.TableName || "-",
        requestInfoRows: buildRequestInfoRows(values),
        recordKeyRows: recordKeyRows.length ? recordKeyRows : [],
        recordKeyVisible: recordKeyRows.length > 0,
        submittedBy: values.SubmittedBy || "-",
        submittedAt: formatVietnamTimestamp(values.SubmittedAt),
        approvedBy: values.ApprovedBy || "-",
        approvedAt: formatVietnamTimestamp(values.ApprovedAt),
        comment: comment,
        changeRows: changeRows,
        changeTitle: getChangeTitle(actionText),
        changeColumnCount: actionText === "Update" ? 3 : 2,
        showOldColumn: showOldColumn,
        showNewColumn: showNewColumn,
        oldColumnHeader: actionText === "Delete" ? "Previous Value" : "Old Value",
        newColumnHeader: "New Value",
        changeMessage: getChangeMessage(actionText, values.TableName, changeRows.length, false),
        technicalRecordKey: formatTechnicalJson(values.RecordKey),
        technicalOldData: formatRawJson(values.OldData),
        technicalNewData: formatRawJson(values.NewData),
        bulkVisible: bulkVisible,
        currentApprovalId: bulkVisible ? values.AprvlId || "" : "",
        currentItemsBindingPath: bulkVisible ? contextPath : "",
        itemsLoadSequence: keepItemsState ? model.getProperty("/itemsLoadSequence") : 0,
        itemsLoadFinished: keepItemsState ? model.getProperty("/itemsLoadFinished") : false,
        bulkSummaryText: keepItemsState ? model.getProperty("/bulkSummaryText") : "",
        bulkSummaryVisible: keepItemsState ? model.getProperty("/bulkSummaryVisible") : false,
        itemsLoading: keepItemsState ? model.getProperty("/itemsLoading") : false,
        itemsLoaded: keepItemsState ? model.getProperty("/itemsLoaded") : false,
        itemCount: keepItemsState ? model.getProperty("/itemCount") : 0,
        itemsEmptyVisible: keepItemsState ? model.getProperty("/itemsEmptyVisible") : false,
        itemsErrorText: keepItemsState ? model.getProperty("/itemsErrorText") : "",
        itemsErrorVisible: keepItemsState ? model.getProperty("/itemsErrorVisible") : false,
        bulkItemSelected: keepBulkItem,
        bulkItemHeaderRows: keepBulkItem ? model.getProperty("/bulkItemHeaderRows") : [],
        bulkItemRecordKeyRows: keepBulkItem ? model.getProperty("/bulkItemRecordKeyRows") : [],
        bulkItemRecordKeyVisible: keepBulkItem ? model.getProperty("/bulkItemRecordKeyVisible") : false,
        bulkItemTitle: keepBulkItem ? model.getProperty("/bulkItemTitle") : "",
        bulkItemMessage: keepBulkItem ? model.getProperty("/bulkItemMessage") : "",
        bulkItemRows: keepBulkItem ? model.getProperty("/bulkItemRows") : [],
        bulkItemShowAllFields: keepBulkItem ? model.getProperty("/bulkItemShowAllFields") : false,
        bulkItemShowAllFieldsVisible: keepBulkItem ? model.getProperty("/bulkItemShowAllFieldsVisible") : false,
        bulkItemShowOldColumn: keepBulkItem ? model.getProperty("/bulkItemShowOldColumn") : false,
        bulkItemShowNewColumn: keepBulkItem ? model.getProperty("/bulkItemShowNewColumn") : true,
        bulkItemOldColumnHeader: keepBulkItem ? model.getProperty("/bulkItemOldColumnHeader") : "Old Value",
        bulkItemNewColumnHeader: keepBulkItem ? model.getProperty("/bulkItemNewColumnHeader") : "New Value",
        bulkItemRecordKeyJson: keepBulkItem ? model.getProperty("/bulkItemRecordKeyJson") : "",
        bulkItemOldDataJson: keepBulkItem ? model.getProperty("/bulkItemOldDataJson") : "",
        bulkItemNewDataJson: keepBulkItem ? model.getProperty("/bulkItemNewDataJson") : ""
      });
    });
  }

  function isBulkValues(recordKey, recordKeyText) {
    return [recordKey, recordKeyText].some(function (value) {
      return String(value || "").trim().toUpperCase() === "BULK";
    });
  }

  function isBulkRequest(view) {
    var context = getObjectPageContext(view);
    var recordKey = getContextValue(context, "RecordKey");
    var recordKeyText = getContextValue(context, "RecordKeyText");

    return isBulkValues(recordKey, recordKeyText);
  }

  function isApprovalItemsSection(control) {
    var id = control && control.getId && control.getId();
    var title = control && control.getTitle && control.getTitle();
    var headerText = control && control.getHeaderText && control.getHeaderText();
    var text = String(title || headerText || "").trim();

    if (/(^|:|--|-)Items($|:|--|-)/.test(String(id || ""))) {
      return true;
    }

    return /^(Excel\s+)?Approval Items$/i.test(text);
  }

  function syncApprovalItemsVisibility(view) {
    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      if (isApprovalItemsSection(control) && control.setVisible) {
        control.setVisible(false);
      }

      return false;
    });
  }

  function getItemContextValue(context, propertyName) {
    return getContextValue(context, propertyName);
  }

  function buildBulkSummary(items) {
    var counts = {
      total: 0,
      create: 0,
      update: 0,
      delete: 0,
      error: 0
    };

    items.forEach(function (item) {
      var context = item.getBindingContext && item.getBindingContext();
      var action = ApprovalFormatter.formatActionText(getItemContextValue(context, "ActionType"));
      var status = String(getItemContextValue(context, "Status") || "").trim().toUpperCase();

      counts.total += 1;

      if (action === "Create") {
        counts.create += 1;
      } else if (action === "Update") {
        counts.update += 1;
      } else if (action === "Delete") {
        counts.delete += 1;
      }

      if (status === "ERROR" || status === "E" || status === "FAILED" || status === "FAIL" || status === "CONFLICT") {
        counts.error += 1;
      }
    });

    if (!counts.total) {
      return "No approval items found.";
    }

    return [
      counts.total + " item" + (counts.total === 1 ? "" : "s"),
      counts.create + " create",
      counts.update + " update",
      counts.delete + " delete",
      counts.error ? counts.error + " error/conflict" : ""
    ].filter(Boolean).join(" • ");
  }

  function clearBulkItemSelection(model) {
    if (!model) {
      return;
    }

    model.setProperty("/bulkItemSelected", false);
    model.setProperty("/bulkItemValues", null);
    model.setProperty("/bulkItemNumberText", "");
    model.setProperty("/bulkItemActionText", "");
    model.setProperty("/bulkItemActionState", "None");
    model.setProperty("/bulkItemRecordKeyText", "");
    model.setProperty("/bulkItemStatusText", "");
    model.setProperty("/bulkItemStatusState", "None");
    model.setProperty("/bulkItemHeaderRows", []);
    model.setProperty("/bulkItemRecordKeyRows", []);
    model.setProperty("/bulkItemRecordKeyVisible", false);
    model.setProperty("/bulkItemRows", []);
    model.setProperty("/bulkItemShowAllFields", false);
    model.setProperty("/bulkItemShowAllFieldsVisible", false);
    model.setProperty("/bulkItemRecordKeyJson", "");
    model.setProperty("/bulkItemOldDataJson", "");
    model.setProperty("/bulkItemNewDataJson", "");
  }

  function beginItemsLoading(model, approvalId, bindingPath, sequence, previousBindingExists) {
    var itemsLoadingBefore;

    if (!model) {
      return;
    }

    itemsLoadingBefore = model.getProperty("/itemsLoading");
    model.setProperty("/currentApprovalId", approvalId || "");
    model.setProperty("/currentItemsBindingPath", bindingPath || "");
    model.setProperty("/itemsLoadSequence", sequence || 0);
    model.setProperty("/itemsLoadFinished", false);
    model.setProperty("/itemsLoading", true);
    model.setProperty("/itemsLoaded", false);
    model.setProperty("/bulkSummaryText", "");
    model.setProperty("/bulkSummaryVisible", false);
    model.setProperty("/itemCount", 0);
    model.setProperty("/itemsEmptyVisible", false);
    model.setProperty("/itemsErrorText", "");
    model.setProperty("/itemsErrorVisible", false);
    clearBulkItemSelection(model);
    logApprovalItemsLifecycle(model, "LOAD_START", {
      aprvlId: approvalId,
      sequence: sequence,
      itemsLoadingBefore: itemsLoadingBefore,
      bindingPath: bindingPath,
      previousBindingExists: previousBindingExists
    });
  }

  function getEventErrorText(event) {
    var parameters = event && event.getParameters && event.getParameters();
    var error = parameters && (parameters.error || parameters.reason);
    var message = ODataErrorHandler.extractBackendMessage(error) ||
      error && (error.message || error.statusText || error.responseText);

    return message ? String(message) : "Approval items could not be loaded.";
  }

  function finishItemsLoading(model, items, errorText, sequence, eventName) {
    var count = items && items.length ? items.length : 0;
    var itemsLoadingBefore;

    if (!model) {
      return;
    }

    if (sequence !== undefined && sequence !== model.getProperty("/itemsLoadSequence")) {
      logApprovalItemsLifecycle(model, "STALE_" + (eventName || "LOAD_FINALLY"), {
        sequence: sequence,
        itemCount: count
      });
      return;
    }

    if (model.getProperty("/itemsLoadFinished")) {
      return;
    }

    itemsLoadingBefore = model.getProperty("/itemsLoading");
    model.setProperty("/itemsLoading", false);
    model.setProperty("/itemsLoaded", true);
    model.setProperty("/itemsLoadFinished", true);
    model.setProperty("/itemCount", count);
    model.setProperty("/itemsEmptyVisible", !errorText && count === 0);
    model.setProperty("/itemsErrorText", errorText || "");
    model.setProperty("/itemsErrorVisible", !!errorText);
    model.setProperty("/bulkSummaryText", errorText ? "" : buildBulkSummary(items || []));
    model.setProperty("/bulkSummaryVisible", !errorText && count > 0);

    if (!count) {
      clearBulkItemSelection(model);
    }

    logApprovalItemsLifecycle(model, errorText ? "LOAD_ERROR" : count ? "LOAD_SUCCESS" : "LOAD_EMPTY", {
      sequence: sequence,
      itemsLoadingBefore: itemsLoadingBefore,
      itemCount: count
    });
    logApprovalItemsLifecycle(model, "LOAD_FINALLY", {
      sequence: sequence,
      itemCount: count
    });
  }

  function getItemsFromTable(table) {
    return table && table.getItems ? table.getItems() : [];
  }

  function getCurrentItemsSequence(owner, model) {
    return owner && owner._itemsLoadSequence || model && model.getProperty && model.getProperty("/itemsLoadSequence") || 0;
  }

  function clearItemsLoadingForSingle(owner, model) {
    var itemsLoadingBefore;

    if (!model) {
      return;
    }

    itemsLoadingBefore = model.getProperty("/itemsLoading");

    if (owner) {
      owner._currentApprovalId = "";
      owner._currentItemsBindingPath = "";
      owner._itemsLoadSequence = (owner._itemsLoadSequence || 0) + 1;
    }

    model.setProperty("/currentApprovalId", "");
    model.setProperty("/currentItemsBindingPath", "");
    model.setProperty("/itemsLoadSequence", owner ? owner._itemsLoadSequence : model.getProperty("/itemsLoadSequence") + 1);
    model.setProperty("/itemsLoadFinished", true);
    model.setProperty("/itemsLoading", false);
    model.setProperty("/itemsLoaded", false);
    model.setProperty("/itemCount", 0);
    model.setProperty("/itemsEmptyVisible", false);
    model.setProperty("/itemsErrorText", "");
    model.setProperty("/itemsErrorVisible", false);
    model.setProperty("/bulkSummaryText", "");
    model.setProperty("/bulkSummaryVisible", false);
    clearBulkItemSelection(model);
    logApprovalItemsLifecycle(model, "BINDING_DETACHED", {
      itemsLoadingBefore: itemsLoadingBefore
    });
  }

  function handleApprovalContextChanged(owner, view, context) {
    var model = ensureDetailModel(view);
    var contextPath = context && context.getPath && context.getPath();
    var contextSequence;

    if (!owner || !view || !context || !model) {
      return Promise.resolve();
    }

    owner._approvalContextSequence = (owner._approvalContextSequence || 0) + 1;
    contextSequence = owner._approvalContextSequence;

    return requestContextValues(context).then(function (values) {
      var bulkVisible = isBulkValues(values.RecordKey);
      var approvalId = values.AprvlId || "";
      var bindingPath = contextPath || approvalId;
      var previousBindingExists = !!owner._currentItemsBindingPath;

      if (contextSequence !== owner._approvalContextSequence) {
        return;
      }

      logApprovalItemsLifecycle(model, "CONTEXT_CHANGED", {
        aprvlId: approvalId,
        sequence: getCurrentItemsSequence(owner, model),
        bindingPath: bindingPath,
        previousBindingExists: previousBindingExists
      });

      updateApprovalDetailModel(view, values, context);
      syncApprovalItemsVisibility(view);

      if (!bulkVisible) {
        clearItemsLoadingForSingle(owner, model);
        return;
      }

      if (owner._currentApprovalId === approvalId && owner._currentItemsBindingPath === bindingPath) {
        return;
      }

      if (previousBindingExists) {
        logApprovalItemsLifecycle(model, "BINDING_DETACHED", {
          aprvlId: approvalId,
          sequence: getCurrentItemsSequence(owner, model),
          bindingPath: owner._currentItemsBindingPath,
          previousBindingExists: previousBindingExists
        });
      }

      owner._currentApprovalId = approvalId;
      owner._currentItemsBindingPath = bindingPath;
      owner._itemsLoadSequence = (owner._itemsLoadSequence || 0) + 1;
      beginItemsLoading(model, approvalId, bindingPath, owner._itemsLoadSequence, previousBindingExists);
      logApprovalItemsLifecycle(model, "BINDING_CREATED", {
        aprvlId: approvalId,
        sequence: owner._itemsLoadSequence,
        bindingPath: bindingPath,
        previousBindingExists: previousBindingExists
      });
    });
  }

  function findApprovalDetailModel(control) {
    var current = control;

    while (current) {
      if (current.getModel && current.getModel("approvalDetail")) {
        return current.getModel("approvalDetail");
      }

      current = current.getParent && current.getParent();
    }

    return null;
  }

  function updateBulkSummary(table, sequence) {
    var model = findApprovalDetailModel(table);
    var items = table && table.getItems ? table.getItems() : [];

    if (!model) {
      return;
    }

    finishItemsLoading(model, items, "", sequence, "CHANGE");
  }

  function formatRecordKeySummary(recordKey) {
    var rows = getJsonRows(recordKey);

    if (!rows.length) {
      return valueOrDash(recordKey);
    }

    return rows.map(function (row) {
      return row.field + ": " + row.value;
    }).join(", ");
  }

  function buildBulkItemHeaderRows(values, actionText) {
    var recordKeyText = formatRecordKeySummary(values.RecordKey);

    return [
      { label: "Item Number", value: valueOrDash(values.ItemNo) },
      { label: "Action Type", value: actionText || valueOrDash(values.ActionType), state: ApprovalFormatter.formatActionState(values.ActionType), isStatus: true },
      { label: "Record Key", value: recordKeyText },
      { label: "Status", value: ApprovalFormatter.formatStatusText(values.Status), state: ApprovalFormatter.formatStatusState(values.Status), isStatus: true }
    ];
  }

  function buildBulkItemDetail(values, showAllFields) {
    var actionText = ApprovalFormatter.formatActionText(values.ActionType);
    var rows = buildApprovalDiff(values.ActionType, values.OldData, values.NewData, values.RecordKey, showAllFields);
    var recordKeyRows = getJsonRows(values.RecordKey);

    return {
      bulkItemSelected: true,
      bulkItemValues: values,
      bulkItemNumberText: valueOrDash(values.ItemNo),
      bulkItemActionText: actionText || valueOrDash(values.ActionType),
      bulkItemActionState: ApprovalFormatter.formatActionState(values.ActionType),
      bulkItemRecordKeyText: formatRecordKeySummary(values.RecordKey),
      bulkItemStatusText: ApprovalFormatter.formatStatusText(values.Status),
      bulkItemStatusState: ApprovalFormatter.formatStatusState(values.Status),
      bulkItemHeaderRows: buildBulkItemHeaderRows(values, actionText),
      bulkItemRecordKeyRows: recordKeyRows,
      bulkItemRecordKeyVisible: recordKeyRows.length > 0,
      bulkItemTitle: getChangeTitle(actionText),
      bulkItemMessage: getChangeMessage(actionText, values.TableName, rows.length, showAllFields),
      bulkItemRows: rows,
      bulkItemShowAllFields: !!showAllFields,
      bulkItemShowAllFieldsVisible: actionText === "Update",
      bulkItemShowOldColumn: actionText === "Update" || actionText === "Delete",
      bulkItemShowNewColumn: actionText === "Create" || actionText === "Update",
      bulkItemOldColumnHeader: actionText === "Delete" ? "Current Value" : "Before",
      bulkItemNewColumnHeader: actionText === "Create" ? "Value" : "After",
      bulkItemRecordKeyJson: formatRawJson(values.RecordKey),
      bulkItemOldDataJson: formatRawJson(values.OldData),
      bulkItemNewDataJson: formatRawJson(values.NewData)
    };
  }

  function applyBulkItemDetail(model, values, showAllFields) {
    var detail = buildBulkItemDetail(values, showAllFields);

    Object.keys(detail).forEach(function (propertyName) {
      model.setProperty("/" + propertyName, detail[propertyName]);
    });
  }

  function requestItemValues(context) {
    var itemProperties = ["AprvlId", "ItemNo", "ActionType", "TableName", "RecordKey", "Status", "Message", "OldData", "NewData"];
    var values = {};

    if (!context) {
      return Promise.resolve(values);
    }

    return Promise.all(itemProperties.map(function (propertyName) {
      if (!context.requestProperty) {
        values[propertyName] = getItemContextValue(context, propertyName);
        return Promise.resolve();
      }

      return context.requestProperty(propertyName).then(function (value) {
        values[propertyName] = value;
      }).catch(function () {
        values[propertyName] = getItemContextValue(context, propertyName);
      });
    })).then(function () {
      return values;
    });
  }

  function getColumnHeaderText(column) {
    var header = column && column.getHeader && column.getHeader();

    if (header && header.getText) {
      return header.getText();
    }

    return "";
  }

  function updateCellClasses(cell, classNames, activeClassName) {
    if (!cell || !cell.removeStyleClass || !cell.addStyleClass) {
      return;
    }

    classNames.forEach(function (className) {
      cell.removeStyleClass(className);
    });

    if (activeClassName) {
      cell.addStyleClass(activeClassName);
    }
  }

  function syncStatusCellClass(cell, status) {
    var statusText = ApprovalFormatter.formatStatusText(status);
    var normalizedStatus = String(statusText || "").trim().toLowerCase();
    var statusClasses = [
      "approvalStatusText--approved",
      "approvalStatusText--pending",
      "approvalStatusText--rejected"
    ];
    var activeClassName = "";

    if (normalizedStatus === "approved") {
      activeClassName = "approvalStatusText--approved";
    } else if (normalizedStatus === "pending") {
      activeClassName = "approvalStatusText--pending";
    } else if (normalizedStatus === "rejected") {
      activeClassName = "approvalStatusText--rejected";
    }

    updateCellClasses(cell, statusClasses, activeClassName);
  }

  function syncActionCellClass(cell, actionType) {
    var actionText = ApprovalFormatter.formatActionText(actionType);
    var normalizedAction = String(actionText || "").trim().toLowerCase();
    var actionClasses = [
      "approvalActionText--create",
      "approvalActionText--update",
      "approvalActionText--delete"
    ];
    var activeClassName = "";

    if (normalizedAction === "create") {
      activeClassName = "approvalActionText--create";
    } else if (normalizedAction === "update") {
      activeClassName = "approvalActionText--update";
    } else if (normalizedAction === "delete") {
      activeClassName = "approvalActionText--delete";
    }

    updateCellClasses(cell, actionClasses, activeClassName);
  }

  function applyReadableListTable(table) {
    var columns = table.getColumns ? table.getColumns() : [];
    var items = table.getItems ? table.getItems() : [];
    var indexes = {};

    columns.forEach(function (column, index) {
      var headerText = getColumnHeaderText(column).trim();

      if (headerText === "Summary" || headerText === "Changed Fields" || headerText === "Object") {
        column.setVisible(false);
        return;
      }

      if (headerText === "Operation") {
        indexes.operation = index;
      }

      if (headerText === "RecordKey") {
        indexes.recordKey = index;
      }

      if (headerText === "Status") {
        indexes.status = index;
      }

    });

    items.forEach(function (item) {
      var context = item.getBindingContext && item.getBindingContext();
      var cells = item.getCells ? item.getCells() : [];
      var actionType = getContextValue(context, "ActionType");
      var recordKey = getContextValue(context, "RecordKey");
      var status = getContextValue(context, "Status");

      if (indexes.operation !== undefined) {
        syncActionCellClass(cells[indexes.operation], actionType);
      }

      if (indexes.recordKey !== undefined && cells[indexes.recordKey]) {
        if (cells[indexes.recordKey].setText) {
          cells[indexes.recordKey].setText(formatRecordKeySummary(recordKey));
        }

        if (cells[indexes.recordKey].setTooltip) {
          cells[indexes.recordKey].setTooltip(formatRecordKeySummary(recordKey));
        }
      }

      if (indexes.status !== undefined) {
        syncStatusCellClass(cells[indexes.status], status);
      }
    });
  }

  function applyReadableListTables(view) {
    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      if (control.isA && control.isA("sap.m.Table")) {
        applyReadableListTable(control);

        if (control.attachUpdateFinished && !control.data("approvalReadableColumnsAttached")) {
          control.data("approvalReadableColumnsAttached", true);
          control.attachUpdateFinished(function () {
            applyReadableListTable(control);
          });
        }
      }

      return false;
    });
  }

  var ApprovalListReportExtension = ControllerExtension.extend("ztbl.approval.ui.ext.controller.ApprovalListReport", {
    override: {
      onInit: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (view) {
          ensureDetailModel(view);
          ODataErrorHandler.attachGlobalHandlers("approval");

          if (view.attachModelContextChange && !this._approvalContextHandlerAttached) {
            this._approvalContextHandlerAttached = true;
            view.attachModelContextChange(function () {
              handleApprovalContextChanged(this, view, getObjectPageContext(view));
            }.bind(this));
          }
        }
      },

      routing: {
        onAfterBinding: function (context) {
          var view = this.base && this.base.getView && this.base.getView();

          if (view) {
            handleApprovalContextChanged(this, view, context || getObjectPageContext(view));
          }
        }
      },

      onAfterRendering: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (!view) {
          return;
        }

        applyReadableListTables(view);
        syncApprovalItemsVisibility(view);
      }
    },

    onBulkItemsUpdateStarted: function (event) {
      var view = this.base && this.base.getView && this.base.getView();
      var model = ensureDetailModel(view);
      var context = getObjectPageContext(view);
      var bindingPath = context && context.getPath && context.getPath();
      var approvalId = model && model.getProperty("/currentApprovalId");
      var sequence = getCurrentItemsSequence(this, model);

      if (!model || !model.getProperty("/bulkVisible")) {
        return;
      }

      if (!model.getProperty("/itemsLoading") && !model.getProperty("/itemsLoadFinished")) {
        beginItemsLoading(model, approvalId, bindingPath || model.getProperty("/currentItemsBindingPath"), sequence, false);
      }

      logApprovalItemsLifecycle(model, "CHANGE", {
        aprvlId: approvalId,
        sequence: sequence,
        itemCount: getItemsFromTable(event && event.getSource && event.getSource()).length,
        bindingPath: bindingPath
      });
    },

    onBulkItemsUpdateFinished: function (event) {
      var view = this.base && this.base.getView && this.base.getView();
      var model = ensureDetailModel(view);

      updateBulkSummary(event && event.getSource && event.getSource(), getCurrentItemsSequence(this, model));
    },

    onBulkItemsDataRequested: function () {
      var view = this.base && this.base.getView && this.base.getView();
      var model = ensureDetailModel(view);

      if (!model || !model.getProperty("/bulkVisible")) {
        return;
      }

      logApprovalItemsLifecycle(model, "DATA_REQUESTED", {
        sequence: getCurrentItemsSequence(this, model),
        itemsLoadingBefore: model.getProperty("/itemsLoading")
      });
    },

    onBulkItemsDataReceived: function (event) {
      var view = this.base && this.base.getView && this.base.getView();
      var model = ensureDetailModel(view);
      var parameters = event && event.getParameters && event.getParameters();
      var errorText = parameters && parameters.error ? getEventErrorText(event) : "";

      if (!model || !model.getProperty("/bulkVisible")) {
        return;
      }

      logApprovalItemsLifecycle(model, "DATA_RECEIVED", {
        sequence: getCurrentItemsSequence(this, model),
        itemsLoadingBefore: model.getProperty("/itemsLoading")
      });

      if (errorText) {
        finishItemsLoading(model, [], errorText, getCurrentItemsSequence(this, model), "DATA_RECEIVED");
      }
    },

    formatBulkRecordKeyText: function (recordKey) {
      return formatRecordKeySummary(recordKey);
    },

    onBulkItemPress: function (event) {
      var source = event && event.getSource && event.getSource();
      var context = source && source.getBindingContext && source.getBindingContext();
      var view = this.base && this.base.getView && this.base.getView();
      var model = ensureDetailModel(view);
      var that = this;

      if (!model || !view) {
        return;
      }

      model.setProperty("/bulkItemSelected", false);
      model.setProperty("/bulkItemHeaderRows", []);
      model.setProperty("/bulkItemRecordKeyRows", []);
      model.setProperty("/bulkItemRecordKeyVisible", false);
      model.setProperty("/bulkItemRows", []);
      model.setProperty("/bulkItemShowAllFields", false);
      model.setProperty("/bulkItemShowAllFieldsVisible", false);
      model.setProperty("/bulkItemRecordKeyJson", "");
      model.setProperty("/bulkItemOldDataJson", "");
      model.setProperty("/bulkItemNewDataJson", "");

      requestItemValues(context).then(function (values) {
        applyBulkItemDetail(model, values, false);

        that._getBulkItemDialog(view).then(function (dialog) {
          dialog.open();
        });
      });
    },

    onBulkItemDialogClose: function () {
      if (this._bulkItemDialog) {
        this._bulkItemDialog.close();
      }
    },

    onBulkItemDialogAfterOpen: function () {
      var that = this;

      if (this._bulkItemOutsideClickHandler) {
        return;
      }

      this._bulkItemOutsideClickHandler = function (event) {
        var dialog = that._bulkItemDialog;
        var domRef = dialog && dialog.getDomRef && dialog.getDomRef();

        if (!dialog || !domRef || domRef.contains(event.target)) {
          return;
        }

        dialog.close();
      };

      document.addEventListener("mousedown", this._bulkItemOutsideClickHandler, true);
    },

    onBulkItemDialogAfterClose: function () {
      if (this._bulkItemOutsideClickHandler) {
        document.removeEventListener("mousedown", this._bulkItemOutsideClickHandler, true);
        this._bulkItemOutsideClickHandler = null;
      }
    },

    onBulkItemShowAllFieldsChange: function (event) {
      var source = event && event.getSource && event.getSource();
      var selected = source && source.getSelected && source.getSelected();
      var view = this.base && this.base.getView && this.base.getView();
      var model = ensureDetailModel(view);
      var values = model && model.getProperty("/bulkItemValues");

      if (!model || !values) {
        return;
      }

      applyBulkItemDetail(model, values, selected);
    },

    _getBulkItemDialog: function (view) {
      var that = this;

      if (!this._bulkItemDialogPromise) {
        this._bulkItemDialogPromise = Fragment.load({
          id: view.getId(),
          name: "ztbl.approval.ui.ext.fragment.BulkApprovalItemDialog",
          controller: this
        }).then(function (dialog) {
          var closeButton = dialog.getBeginButton && dialog.getBeginButton();

          view.addDependent(dialog);
          dialog.attachAfterOpen(that.onBulkItemDialogAfterOpen, that);
          dialog.attachAfterClose(that.onBulkItemDialogAfterClose, that);

          if (closeButton && closeButton.attachPress && !closeButton.data("approvalCloseAttached")) {
            closeButton.data("approvalCloseAttached", true);
            closeButton.attachPress(that.onBulkItemDialogClose, that);
          }

          that._bulkItemDialog = dialog;
          return dialog;
        });
      }

      return this._bulkItemDialogPromise;
    }
  });

  ApprovalListReportExtension._test = {
    safeParseObject: safeParseObject,
    formatApprovalValue: formatApprovalValue,
    mapFieldLabel: mapFieldLabel,
    buildApprovalDiff: buildApprovalDiff,
    isBulkRequest: isBulkRequest,
    isApprovalItemsSection: isApprovalItemsSection,
    syncApprovalItemsVisibility: syncApprovalItemsVisibility,
    buildBulkSummary: buildBulkSummary,
    buildBulkItemDetail: buildBulkItemDetail,
    beginItemsLoading: beginItemsLoading,
    finishItemsLoading: finishItemsLoading,
    clearBulkItemSelection: clearBulkItemSelection,
    clearItemsLoadingForSingle: clearItemsLoadingForSingle,
    handleApprovalContextChanged: handleApprovalContextChanged,
    formatRawJson: formatRawJson,
    formatVietnamTimestamp: formatVietnamTimestamp,
    buildRequestInfoRows: buildRequestInfoRows
  };

  return ApprovalListReportExtension;
});
