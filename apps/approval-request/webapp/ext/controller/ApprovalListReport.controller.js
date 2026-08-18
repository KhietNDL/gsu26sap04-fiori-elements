sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "ztbl/approval/ui/ext/formatter/ApprovalFormatter",
  "ztbl/approval/ui/ext/util/ODataErrorHandler",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter"
], function (ControllerExtension, Fragment, JSONModel, ApprovalFormatter, ODataErrorHandler, Filter, FilterOperator, Sorter) {
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
        statusNoticeVisible: false,
        statusNoticeType: "Information",
        statusNoticeText: "",
        tableName: "-",
        requestInfoRows: [],
        recordKeyText: "-",
        recordKeyRows: [],
        recordKeyVisible: false,
        changeRows: [],
        changeTitle: "Change Details",
        changeColumnCount: 3,
        changeTableHtml: "",
        showOldColumn: false,
        showNewColumn: true,
        oldColumnHeader: "Old Value",
        newColumnHeader: "New Value",
        changeMessage: "Loading change details...",
        technicalRecordKey: "",
        technicalOldData: "",
        technicalNewData: "",
        comment: "-",
        commentEmpty: true,
        commentVisible: true,
        commentDebugVisible: false,
        commentDebugRows: [],
        bulkVisible: false,
        approvalItemsVisible: false,
        bulkItems: [],
        bulkColumns: [],
        bulkTableRows: [],
        bulkTableWidth: "100%",
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

  function parseLooseFlatJsonObject(value) {
    var text = String(value || "").trim();
    var parsed = {};
    var pairPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g;
    var match;

    if (!text || text.charAt(0) !== "{") {
      return {};
    }

    while ((match = pairPattern.exec(text)) !== null) {
      try {
        parsed[JSON.parse("\"" + match[1] + "\"")] = JSON.parse(match[2]);
      } catch (error) {
        // Ignore malformed pairs; this fallback is only for complete pairs in truncated JSON.
      }
    }

    return parsed;
  }

  function safeParseObject(value) {
    var parsed;

    if (value === null || value === undefined || String(value).trim() === "") {
      return {};
    }

    try {
      parsed = typeof value === "string" ? JSON.parse(value) : value;
    } catch (error) {
      return parseLooseFlatJsonObject(value);
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

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function buildApprovalChangeTableHtml(changeRows, actionText, oldColumnHeader, newColumnHeader) {
    var showOldColumn = actionText === "Update" || actionText === "Delete";
    var showNewColumn = actionText === "Create" || actionText === "Update";
    var normalizedAction = String(actionText || "").trim().toLowerCase();
    var actionLabel = actionText === "Create" ? "Created" : actionText === "Delete" ? "Deleted" : actionText === "Update" ? "Updated" : actionText;
    var rows = [];

    if (!changeRows || !changeRows.length) {
      return "";
    }

    if (showOldColumn) {
      rows.push({
        label: oldColumnHeader || "Old Value",
        values: changeRows.map(function (row) {
          return row && row.oldValue || "—";
        })
      });
    }

    if (showNewColumn) {
      rows.push({
        label: newColumnHeader || "New Value",
        values: changeRows.map(function (row) {
          return row && row.newValue || "—";
        })
      });
    }

    if (!rows.length) {
      return "";
    }

    return [
      "<div class=\"approvalExcelHtmlScroller\">",
      "<table class=\"approvalExcelHtmlTable\">",
      "<thead><tr>",
      "<th>Action</th>",
      "<th>Value Type</th>",
      changeRows.map(function (row) {
        return "<th>" + escapeHtml(row && row.field || "—") + "</th>";
      }).join(""),
      "</tr></thead>",
      "<tbody>",
      rows.map(function (row) {
        return [
          "<tr>",
          "<td class=\"approvalChangeAction approvalChangeAction--" + escapeHtml(normalizedAction) + "\">", escapeHtml(actionLabel), "</td>",
          "<td class=\"approvalExcelValueType\">", escapeHtml(row.label), "</td>",
          row.values.map(function (value) {
            return "<td>" + escapeHtml(value) + "</td>";
          }).join(""),
          "</tr>"
        ].join("");
      }).join(""),
      "</tbody>",
      "</table>",
      "</div>"
    ].join("");
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
    var objectPromise;

    function mergeObject(object) {
      Object.keys(object || {}).forEach(function (propertyName) {
        if (values[propertyName] === undefined) {
          values[propertyName] = object[propertyName];
        }
      });
    }

    if (!context) {
      return Promise.resolve(values);
    }

    // Read the entity once first. This is important for ApprovalRequest:
    // AprvlComment can be present in the entity response even when the
    // generated object-page binding did not include it in its initial $select.
    if (context.requestObject) {
      try {
        objectPromise = Promise.resolve(context.requestObject()).catch(function () {
          return null;
        });
      } catch (error) {
        objectPromise = Promise.resolve(null);
      }
    } else {
      objectPromise = Promise.resolve(null);
    }

    return objectPromise.then(function (object) {
      mergeObject(object);

      return Promise.all(DETAIL_PROPERTIES.map(function (propertyName) {
        var propertyPromise;

        if (values[propertyName] !== undefined) {
          return Promise.resolve();
        }

        if (!context.requestProperty) {
          values[propertyName] = getContextValue(context, propertyName);
          return Promise.resolve();
        }

        try {
          propertyPromise = Promise.resolve(context.requestProperty(propertyName));
        } catch (error) {
          values[propertyName] = getContextValue(context, propertyName);
          return Promise.resolve();
        }

        return propertyPromise.then(function (value) {
          if (value !== undefined) {
            values[propertyName] = value;
          }
        }).catch(function () {
          values[propertyName] = getContextValue(context, propertyName);
        });
      }));
    }).then(function () {
      DETAIL_PROPERTIES.forEach(function (propertyName) {
        if (values[propertyName] === undefined) {
          values[propertyName] = getContextValue(context, propertyName);
        }
      });

      return values;
    });
  }

  function valueOrDash(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function isEmptyValue(value) {
    return value === null || value === undefined || String(value).trim() === "";
  }

  function getCommentValue(values) {
    if (!isEmptyValue(values && values.AprvlComment)) {
      return values.AprvlComment;
    }

    return "";
  }

  function buildCommentDebugRows(values) {
    var value = values && values.AprvlComment;

    return [
      {
        field: "AprvlComment",
        value: isEmptyValue(value) ? "—" : String(value)
      }
    ];
  }

  function isApprovalDebugEnabled() {
    var query;

    if (typeof window === "undefined") {
      return false;
    }

    query = window.location && window.location.search || "";

    return /(?:[?&])approvalDebug=true(?:&|$)/i.test(query) ||
      /approvalDebug=true/i.test(window.location && window.location.hash || "");
  }

  function normalizeRemarks(value) {
    return String(value || "").trim().slice(0, 255);
  }

  function getControlFromDom(domRef) {
    var id = domRef && domRef.id;

    return id && sap.ui && sap.ui.getCore ? sap.ui.getCore().byId(id) : null;
  }

  function getParentDialog(control) {
    var current = control;

    while (current) {
      if (current.isA && current.isA("sap.m.Dialog")) {
        return current;
      }

      current = current.getParent && current.getParent();
    }

    return null;
  }

  function getDialogActionName(dialog) {
    var title = dialog && dialog.getTitle && dialog.getTitle();
    var normalizedTitle = String(title || "").trim().toLowerCase();

    if (normalizedTitle.indexOf("approve") === 0) {
      return "approve";
    }

    if (normalizedTitle.indexOf("reject") === 0) {
      return "reject";
    }

    return "";
  }

  function getDomDialogActionName(domDialog) {
    var titleElement;
    var title;

    if (!domDialog || !domDialog.querySelector) {
      return "";
    }

    titleElement = domDialog.querySelector(".sapMDialogTitle, .sapMDialogTitleGroup, [role='heading']");
    title = String(titleElement && titleElement.textContent || "").trim().toLowerCase();

    if (title.indexOf("approve") === 0) {
      return "approve";
    }

    if (title.indexOf("reject") === 0) {
      return "reject";
    }

    return "";
  }

  function findRemarksInput(dialog) {
    var input = null;

    if (!dialog || !dialog.findAggregatedObjects) {
      return null;
    }

    dialog.findAggregatedObjects(true, function (control) {
      if (!input && control.isA && (control.isA("sap.m.Input") || control.isA("sap.m.TextArea"))) {
        input = control;
        return true;
      }

      return false;
    });

    return input;
  }

  function captureApprovalActionRemarks(event) {
    var target = event && event.target;
    var domButton = target && target.closest && target.closest(".sapMBtn");
    var domDialog = target && target.closest && target.closest(".sapMDialog");
    var button = getControlFromDom(domButton);
    var dialog = getParentDialog(button);
    var actionName = getDialogActionName(dialog) || getDomDialogActionName(domDialog);
    var buttonText = button && button.getText && String(button.getText()).trim().toLowerCase();
    var input;
    var domInput;
    var remarks;

    // FE may render the action submit button as Approve/Reject, OK, Apply,
    // or a translated label. The dialog title identifies the action; only
    // ignore buttons that clearly cancel/close the dialog.
    if (!actionName || /^(cancel|close|back)$/i.test(buttonText)) {
      return;
    }

    input = findRemarksInput(dialog);
    domInput = domDialog && domDialog.querySelector && domDialog.querySelector("textarea, input:not([type='hidden'])");
    remarks = domInput && domInput.value !== undefined ? domInput.value : input && input.getValue && input.getValue();

    window.__ztblApprovalActionRemarks = {
      action: actionName,
      remarks: normalizeRemarks(remarks),
      timestamp: Date.now()
    };
  }

  function isApprovalActionUrl(url) {
    return /\/com\.sap\.gateway\.srvd\.zsd_tbl_config\.v0001\.(approve|reject)(?:\(\.\.\.\)|\?|$)/.test(String(url || ""));
  }

  function getApprovalActionFromUrl(url) {
    var match = String(url || "").match(/\/com\.sap\.gateway\.srvd\.zsd_tbl_config\.v0001\.(approve|reject)(?:\(\.\.\.\)|\?|$|[\s"'])/);

    return match && match[1] || "";
  }

  function getApprovalActionFromRequest(url, body) {
    return getApprovalActionFromUrl(url) || getApprovalActionFromUrl(body);
  }

  function injectRemarksIntoRequestBody(body, actionName, remarks) {
    var payload;
    var actionIndex;
    var separatorIndex;
    var separatorLength;
    var payloadStart;
    var payloadEnd;
    var payloadText;
    var lineBreak = "\r\n";
    var escapedLineBreak = "\\r\\n";

    if (typeof body !== "string") {
      return body;
    }

    try {
      payload = JSON.parse(body);
      payload.remarks = normalizeRemarks(payload.remarks || remarks);
      return JSON.stringify(payload);
    } catch (error) {
      // OData V4 may wrap the action in a multipart $batch request.
    }

    actionIndex = String(body).indexOf("." + actionName);

    if (actionIndex < 0) {
      return body;
    }

    separatorIndex = body.indexOf(lineBreak + lineBreak, actionIndex);
    separatorLength = (lineBreak + lineBreak).length;

    if (separatorIndex < 0) {
      separatorIndex = body.indexOf("\n\n", actionIndex);
      separatorLength = 2;
    }

    if (separatorIndex < 0) {
      separatorIndex = body.indexOf(escapedLineBreak + escapedLineBreak, actionIndex);
      separatorLength = (escapedLineBreak + escapedLineBreak).length;
    }

    if (separatorIndex < 0) {
      return body;
    }

    payloadStart = separatorIndex + separatorLength;
    payloadEnd = body.indexOf(lineBreak + "--", payloadStart);

    if (payloadEnd < 0) {
      payloadEnd = body.indexOf("\n--", payloadStart);
    }

    if (payloadEnd < 0) {
      payloadEnd = body.indexOf(escapedLineBreak + "--", payloadStart);
    }

    if (payloadEnd < 0) {
      payloadEnd = body.length;
    }

    payloadText = body.slice(payloadStart, payloadEnd).trim();

    try {
      payload = JSON.parse(payloadText);
    } catch (parseError) {
      return body;
    }

    payload.remarks = normalizeRemarks(payload.remarks || remarks);

    return body.slice(0, payloadStart) + JSON.stringify(payload) + body.slice(payloadEnd);
  }

  function getCapturedRemarksForAction(actionName) {
    var captured = typeof window !== "undefined" && window.__ztblApprovalActionRemarks;

    if (!captured || captured.action !== actionName || Date.now() - captured.timestamp > 60000) {
      return null;
    }

    return captured.remarks;
  }

  function notifyApprovalActionCompleted(actionName) {
    var handlers = typeof window !== "undefined" && window.__ztblApprovalActionRefreshHandlers;

    if (!handlers || !handlers.length) {
      return;
    }

    handlers.slice().forEach(function (handler) {
      if (typeof handler === "function") {
        handler(actionName);
      }
    });
  }

  function patchApprovalActionPayloads() {
    var originalOpen;
    var originalSend;
    var originalFetch;

    if (typeof window === "undefined") {
      return;
    }

    if (window.XMLHttpRequest && !window.__ztblApprovalActionPayloadPatch) {
      window.__ztblApprovalActionPayloadPatch = true;
      originalOpen = window.XMLHttpRequest.prototype.open;
      originalSend = window.XMLHttpRequest.prototype.send;

      window.XMLHttpRequest.prototype.open = function (method, url) {
        this.__ztblApprovalActionUrl = String(url || "");
        return originalOpen.apply(this, arguments);
      };

      window.XMLHttpRequest.prototype.send = function (body) {
        var actionName = getApprovalActionFromRequest(this.__ztblApprovalActionUrl, body);
        var remarks = getCapturedRemarksForAction(actionName);

        if (actionName && this.addEventListener) {
          this.addEventListener("loadend", function () {
            var status = Number(this.status || 0);

            if (status >= 200 && status < 300) {
              notifyApprovalActionCompleted(actionName);
            } else if (status >= 400) {
              ODataErrorHandler.showBackendError({
                status: status,
                statusText: this.statusText,
                responseText: this.responseText
              }, "The approval action could not be completed.");
            }
          });
        }

        if (!actionName || remarks === null) {
          return originalSend.apply(this, arguments);
        }

        return originalSend.call(this, injectRemarksIntoRequestBody(body, actionName, remarks));
      };
    }

    if (typeof window.fetch === "function" && !window.__ztblApprovalActionFetchPatch) {
      window.__ztblApprovalActionFetchPatch = true;
      originalFetch = window.fetch;

      window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : input && input.url;
        var requestInit = init ? Object.assign({}, init) : {};
        var body = requestInit.body;
        var actionName = getApprovalActionFromRequest(url, body);
        var remarks = getCapturedRemarksForAction(actionName);

        if (actionName && remarks !== null && typeof body === "string") {
          requestInit.body = injectRemarksIntoRequestBody(body, actionName, remarks);
        }

        return originalFetch.call(this, input, requestInit).then(function (response) {
          if (!actionName) {
            return response;
          }

          if (response.ok) {
            notifyApprovalActionCompleted(actionName);
            return response;
          }

          if (response.clone) {
            response.clone().text().then(function (responseText) {
              ODataErrorHandler.showBackendError({
                status: response.status,
                statusText: response.statusText,
                responseText: responseText
              }, "The approval action could not be completed.");
            });
          }

          return response;
        });
      };
    }
  }

  function refreshApprovalAfterAction(owner) {
    var view = owner && owner.base && owner.base.getView && owner.base.getView();
    var dataModel = view && view.getModel && view.getModel();
    var binding = view && view.getElementBinding && view.getElementBinding();
    var context = getObjectPageContext(view);

    if (!view) {
      return;
    }

    if (binding && binding.refresh) {
      binding.refresh();
    } else if (context && context.refresh) {
      context.refresh();
    } else if (dataModel && dataModel.refresh) {
      dataModel.refresh();
    }

    if (typeof setTimeout === "function") {
      setTimeout(function () {
        handleApprovalContextChanged(owner, view, getObjectPageContext(view));
      }, 250);
      setTimeout(function () {
        handleApprovalContextChanged(owner, view, getObjectPageContext(view));
      }, 1000);
    } else {
      handleApprovalContextChanged(owner, view, context);
    }
  }

  function registerApprovalActionPayloadFix(owner) {
    if (!owner || typeof document === "undefined" || owner._approvalActionPayloadFixAttached) {
      return;
    }

    patchApprovalActionPayloads();
    owner._approvalActionPayloadFixAttached = true;
    owner._approvalActionPayloadCapture = captureApprovalActionRemarks;
    owner._approvalActionRefreshHandler = function () {
      refreshApprovalAfterAction(owner);
    };
    window.__ztblApprovalActionRefreshHandlers = window.__ztblApprovalActionRefreshHandlers || [];
    window.__ztblApprovalActionRefreshHandlers.push(owner._approvalActionRefreshHandler);
    document.addEventListener("click", owner._approvalActionPayloadCapture, true);
  }

  function unregisterApprovalActionPayloadFix(owner) {
    var handlers;
    var index;

    if (!owner || typeof document === "undefined" || !owner._approvalActionPayloadFixAttached) {
      return;
    }

    document.removeEventListener("click", owner._approvalActionPayloadCapture, true);
    handlers = typeof window !== "undefined" && window.__ztblApprovalActionRefreshHandlers;

    if (handlers && owner._approvalActionRefreshHandler) {
      index = handlers.indexOf(owner._approvalActionRefreshHandler);

      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }

    owner._approvalActionPayloadFixAttached = false;
    owner._approvalActionPayloadCapture = null;
    owner._approvalActionRefreshHandler = null;
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

    return formatted.replace(",", "");
  }

  function buildRequestInfoRows(values) {
    var actionText = getRequestActionText(values.ActionType, values.RecordKey, values.RecordKeyText, values.ItemCount);
    var actionState = getRequestActionState(values.ActionType, values.RecordKey, values.RecordKeyText, values.ItemCount);
    var rows = [
      { label: "Approval ID", value: values.AprvlId },
      { label: "Table Name", value: values.TableName },
      { label: "Operation", value: actionText, state: actionState, isBulkOperation: actionText === "BULK" },
      { label: "Submitted By", value: values.SubmittedBy },
      { label: "Submitted At", value: formatVietnamTimestamp(values.SubmittedAt) },
      { label: "Status", value: ApprovalFormatter.formatStatusText(values.Status), state: ApprovalFormatter.formatStatusState(values.Status) }
    ];

    [
      { label: "Reviewed By", value: values.ApprovedBy },
      { label: "Reviewed At", value: formatVietnamTimestamp(values.ApprovedAt), rawValue: values.ApprovedAt }
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
        isStatus: !!row.state,
        isBulkOperation: !!row.isBulkOperation
      };
    });
  }

  function buildStatusNotice(status) {
    var normalized = String(status || "").trim().toUpperCase();

    if (normalized === "A" || normalized === "APPROVED") {
      return {
        visible: true,
        type: "Success",
        text: "This approval request has been approved."
      };
    }

    if (normalized === "R" || normalized === "REJECTED") {
      return {
        visible: true,
        type: "Error",
        text: "This approval request has been rejected."
      };
    }

    if (normalized === "E" || normalized === "ERROR") {
      return {
        visible: true,
        type: "Error",
        text: "This approval request could not be processed successfully."
      };
    }

    return {
      visible: false,
      type: "Information",
      text: ""
    };
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
      var changeActionText = ApprovalFormatter.formatActionText(values.ActionType);
      var recordKeyRows = getJsonRows(values.RecordKey);
      var changeRows = buildApprovalDiff(values.ActionType, values.OldData, values.NewData, values.RecordKey);
      var showOldColumn = changeActionText === "Update" || changeActionText === "Delete";
      var showNewColumn = changeActionText === "Create" || changeActionText === "Update";
      var oldColumnHeader = changeActionText === "Delete" ? "Previous Value" : "Old Value";
      var newColumnHeader = "New Value";
      var comment = getCommentValue(values) || "-";
      var commentEmpty = comment === "-";
      var bulkVisible = isBulkValues(values.RecordKey, values.RecordKeyText);
      var sameApproval = model.getProperty("/approvalId") === values.AprvlId;
      var contextPath = initialContextPath || values.AprvlId;
      var sameBindingPath = model.getProperty("/currentItemsBindingPath") === contextPath;
      var keepBulkItem = bulkVisible && sameApproval && sameBindingPath && model.getProperty("/bulkItemSelected");
      var keepItemsState = bulkVisible && sameBindingPath;
      var itemCount = keepItemsState ? model.getProperty("/itemCount") : undefined;
      var actionText = getRequestActionText(values.ActionType, values.RecordKey, values.RecordKeyText, itemCount);
      var statusNotice = buildStatusNotice(values.Status);
      var singleApprovalItem = buildSingleApprovalItem(values);
      var singleTableData = buildApprovalItemsTableData([singleApprovalItem]);

      if (initialContextPath && currentContextPath && initialContextPath !== currentContextPath) {
        return;
      }

      model.setData({
        approvalId: values.AprvlId || "-",
        rawActionType: values.ActionType,
        rawRecordKey: values.RecordKey,
        rawRecordKeyText: values.RecordKeyText,
        operationText: actionText,
        operationState: getRequestActionState(values.ActionType, values.RecordKey, values.RecordKeyText, itemCount),
        statusText: ApprovalFormatter.formatStatusText(values.Status),
        statusState: ApprovalFormatter.formatStatusState(values.Status),
        statusNoticeVisible: statusNotice.visible,
        statusNoticeType: statusNotice.type,
        statusNoticeText: statusNotice.text,
        tableName: values.TableName || "-",
        requestInfoRows: buildRequestInfoRows(Object.assign({}, values, { ItemCount: itemCount })),
        recordKeyText: formatRecordKeySummary(values.RecordKey),
        recordKeyRows: recordKeyRows.length ? recordKeyRows : [],
        recordKeyVisible: recordKeyRows.length > 0,
        submittedBy: values.SubmittedBy || "-",
        submittedAt: formatVietnamTimestamp(values.SubmittedAt),
        approvedBy: values.ApprovedBy || "-",
        approvedAt: formatVietnamTimestamp(values.ApprovedAt),
        comment: comment,
        commentEmpty: commentEmpty,
        commentVisible: true,
        commentDebugVisible: isApprovalDebugEnabled(),
        commentDebugRows: buildCommentDebugRows(values),
        changeRows: changeRows,
        changeTitle: getChangeTitle(changeActionText),
        changeColumnCount: changeActionText === "Update" ? 3 : 2,
        changeTableHtml: buildApprovalChangeTableHtml(changeRows, changeActionText, oldColumnHeader, newColumnHeader),
        showOldColumn: showOldColumn,
        showNewColumn: showNewColumn,
        oldColumnHeader: oldColumnHeader,
        newColumnHeader: newColumnHeader,
        changeMessage: getChangeMessage(changeActionText, values.TableName, changeRows.length, false),
        technicalRecordKey: formatTechnicalJson(values.RecordKey),
        technicalOldData: formatRawJson(values.OldData),
        technicalNewData: formatRawJson(values.NewData),
        bulkVisible: bulkVisible,
        approvalItemsVisible: true,
        currentApprovalId: bulkVisible ? values.AprvlId || "" : "",
        currentItemsBindingPath: bulkVisible ? contextPath : "",
        itemsLoadSequence: keepItemsState ? model.getProperty("/itemsLoadSequence") : 0,
        itemsLoadFinished: keepItemsState ? model.getProperty("/itemsLoadFinished") : false,
        bulkSummaryText: bulkVisible ? (keepItemsState ? model.getProperty("/bulkSummaryText") : "") : buildBulkSummary([singleApprovalItem]),
        bulkSummaryVisible: bulkVisible ? (keepItemsState ? model.getProperty("/bulkSummaryVisible") : false) : true,
        bulkColumns: bulkVisible ? (keepItemsState ? model.getProperty("/bulkColumns") || [] : []) : singleTableData.columns,
        bulkTableRows: bulkVisible ? (keepItemsState ? model.getProperty("/bulkTableRows") || [] : []) : singleTableData.tableRows,
        bulkTableWidth: bulkVisible ? (keepItemsState ? model.getProperty("/bulkTableWidth") || "100%" : "100%") : singleTableData.tableWidth,
        itemsLoading: keepItemsState ? model.getProperty("/itemsLoading") : false,
        itemsLoaded: keepItemsState ? model.getProperty("/itemsLoaded") : false,
        itemCount: keepItemsState ? model.getProperty("/itemCount") : 0,
        bulkItems: keepItemsState ? model.getProperty("/bulkItems") || [] : [],
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

  function getRequestActionText(actionType, recordKey, recordKeyText, itemCount) {
    return isBulkValues(recordKey, recordKeyText) && (itemCount === undefined || itemCount === null || Number(itemCount) >= 2) ?
      "BULK" :
      ApprovalFormatter.formatActionText(actionType);
  }

  function getRequestActionState(actionType, recordKey, recordKeyText, itemCount) {
    return isBulkValues(recordKey, recordKeyText) && (itemCount === undefined || itemCount === null || Number(itemCount) >= 2) ?
      "None" :
      ApprovalFormatter.formatActionState(actionType);
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
    if (context && typeof context === "object" && !context.getObject && !context.getProperty) {
      return context[propertyName];
    }

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
      var context = item && item.getBindingContext ?
        item.getBindingContext("approvalDetail") || item.getBindingContext() : item;
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

  function createApprovalSpreadsheetCell(text, kind, state, field) {
    var value = text === null || text === undefined || text === "" ? "—" : String(text);

    return {
      text: value,
      tooltip: value,
      kind: kind || "text",
      state: state || "None",
      field: field || ""
    };
  }

  function buildApprovalItemsTableData(items) {
    var itemRows = [];
    var fieldColumns = [];
    var fieldKeys = {};
    var recordKeyColumns = [];
    var recordKeyKeys = {};

    (items || []).forEach(function (item, index) {
      var context = item && item.getBindingContext ?
        item.getBindingContext("approvalDetail") || item.getBindingContext() : item;
      var actionType = getItemContextValue(context, "ActionType");
      var actionText = ApprovalFormatter.formatActionText(actionType);
      var actionState = ApprovalFormatter.formatActionState(actionType);
      var recordKey = getItemContextValue(context, "RecordKey");
      var recordKeyRows = getJsonRows(recordKey);
      var changes = buildApprovalDiff(
        actionType,
        getItemContextValue(context, "OldData"),
        getItemContextValue(context, "NewData"),
        recordKey
      );

      recordKeyRows.forEach(function (row) {
        var key = row.key || row.field;

        if (!recordKeyKeys[key]) {
          recordKeyKeys[key] = true;
          recordKeyColumns.push({ key: key, label: row.field, width: "14rem" });
        }
      });

      changes.forEach(function (change) {
        var key = change.field;

        if (!fieldKeys[key]) {
          fieldKeys[key] = true;
          fieldColumns.push({ key: key, label: change.field, width: "14rem" });
        }
      });

      itemRows.push({
        item: getItemContextValue(context, "ItemNo") || index + 1,
        actionText: actionText || valueOrDash(actionType),
        actionState: actionState,
        actionKey: String(actionType || "").trim().toUpperCase(),
        recordKeyRows: recordKeyRows,
        recordKeyText: formatRecordKeySummary(recordKey),
        changes: changes,
        // Item status is intentionally omitted from the spreadsheet. The request
        // status is already shown in the Request Information card.
      });
    });

    fieldColumns = fieldColumns.filter(function (fieldColumn) {
      return !recordKeyColumns.some(function (recordKeyColumn) {
        return recordKeyColumn.label === fieldColumn.label;
      });
    });

    var columns = [
      { key: "__item", label: "Item", width: "5rem" },
      { key: "__action", label: "Action", width: "9rem" }
    ].concat(recordKeyColumns, fieldColumns);

    var tableRows = itemRows.map(function (itemRow) {
      var recordKeyMap = {};
      var changeMap = {};

      itemRow.recordKeyRows.forEach(function (row) {
        recordKeyMap[row.key || row.field] = row.value;
      });
      itemRow.changes.forEach(function (change) {
        var oldValue = change.oldValue || "—";
        var newValue = change.newValue || "—";
        var text = oldValue === "—" ? newValue : newValue === "—" ? oldValue : oldValue + " → " + newValue;

        if (itemRow.actionText === "Create") {
          text = newValue;
        } else if (itemRow.actionText === "Delete") {
          text = oldValue;
        }

        changeMap[change.field] = text;
      });

      return {
        actionKey: itemRow.actionKey,
        cells: [
          createApprovalSpreadsheetCell("#" + itemRow.item, "text", "None", "__item"),
          createApprovalSpreadsheetCell(itemRow.actionText, "status", itemRow.actionState, "__action")
        ].concat(recordKeyColumns.map(function (column) {
          return createApprovalSpreadsheetCell(recordKeyMap[column.key] || "—", "key", "None", column.label);
        }), fieldColumns.map(function (column) {
          return createApprovalSpreadsheetCell(changeMap[column.key] || "—", "text", "None", column.label);
        }))
      };
    });

    return {
      columns: columns,
      tableRows: tableRows,
      // Let the table fill the card like Audit Items. The surrounding
      // horizontal ScrollContainer still handles wide/dynamic column sets.
      tableWidth: "100%"
    };
  }

  function buildSingleApprovalItem(values) {
    return {
      AprvlId: values && values.AprvlId,
      ItemNo: 1,
      ActionType: values && values.ActionType,
      TableName: values && values.TableName,
      RecordKey: values && values.RecordKey,
      Status: values && values.Status,
      OldData: values && values.OldData,
      NewData: values && values.NewData
    };
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
    model.setProperty("/bulkItems", []);
    model.setProperty("/bulkColumns", []);
    model.setProperty("/bulkTableRows", []);
    model.setProperty("/bulkTableWidth", "100%");
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

  function getApprovalItemsErrorText(error) {
    var message = ODataErrorHandler.extractBackendMessage(error) ||
      error && (error.message || error.statusText || error.responseText);

    return message ? String(message) : "Approval items could not be loaded.";
  }

  function requestApprovalItemsFromBinding(binding) {
    if (!binding || !binding.requestContexts) {
      return Promise.reject(new Error("Approval item binding is unavailable."));
    }

    return Promise.resolve().then(function () {
      return binding.requestContexts(0, 1000);
    }).then(function (contexts) {
      return (contexts || []).map(function (itemContext) {
        return itemContext && itemContext.getObject ? itemContext.getObject() : {};
      });
    }).finally(function () {
      if (binding && binding.destroy) {
        binding.destroy();
      }
    });
  }

  function requestApprovalItemsFromNavigation(context) {
    var dataModel = context && context.getModel && context.getModel();
    var binding;

    if (!dataModel || !dataModel.bindList || !context) {
      return Promise.reject(new Error("Approval item navigation is unavailable."));
    }

    try {
      binding = dataModel.bindList("_Items", context, undefined, undefined, {
        $select: "AprvlId,ItemNo,ActionType,TableName,RecordKey,Status,OldData,NewData",
        $orderby: "ItemNo"
      });
    } catch (error) {
      return Promise.reject(error);
    }

    return requestApprovalItemsFromBinding(binding);
  }

  function requestApprovalItems(view, context, approvalId, sequence) {
    var detailModel = ensureDetailModel(view);
    var dataModel = context && context.getModel && context.getModel();
    var binding;
    var filters;

    function applyLoadedItems(items) {
      if (sequence !== detailModel.getProperty("/itemsLoadSequence") || !detailModel.getProperty("/bulkVisible")) {
        return;
      }

      detailModel.setProperty("/bulkItems", items || []);
      finishItemsLoading(detailModel, items || [], "", sequence, "DIRECT_LOAD");
    }

    function applyLoadError(error) {
      if (sequence === detailModel.getProperty("/itemsLoadSequence") && detailModel.getProperty("/bulkVisible")) {
        detailModel.setProperty("/bulkItems", []);
        finishItemsLoading(detailModel, [], getApprovalItemsErrorText(error), sequence, "DIRECT_LOAD");
      }
    }

    function useNavigationFallback(error) {
      return requestApprovalItemsFromNavigation(context).then(function (items) {
        applyLoadedItems(items);
      }).catch(function () {
        applyLoadError(error);
      });
    }

    if (!detailModel) {
      return;
    }

    // The object-page test doubles can omit the OData model. In the real
    // object page a binding context always has the default service model.
    if (!dataModel) {
      return;
    }

    if (!dataModel.bindList || !approvalId) {
      useNavigationFallback(new Error("ApprovalItem service is unavailable."));
      return;
    }

    if (!Filter || !FilterOperator) {
      useNavigationFallback(new Error("Approval item filter is unavailable."));
      return;
    }

    filters = [new Filter("AprvlId", FilterOperator.EQ, approvalId)];

    try {
      binding = dataModel.bindList("/ApprovalItem", null, null, filters, {
        $select: "AprvlId,ItemNo,ActionType,TableName,RecordKey,Status,OldData,NewData",
        $orderby: "ItemNo"
      });
    } catch (error) {
      useNavigationFallback(error);
      return;
    }

    if (!binding || !binding.requestContexts) {
      useNavigationFallback(new Error("Approval item binding is unavailable."));
      return;
    }

    requestApprovalItemsFromBinding(binding).then(function (items) {
      if (!items.length) {
        return requestApprovalItemsFromNavigation(context).catch(function () {
          return [];
        });
      }

      return items;
    }).then(function (items) {
      applyLoadedItems(items);
    }).catch(function (error) {
      useNavigationFallback(error);
    });
  }

  function finishItemsLoading(model, items, errorText, sequence, eventName) {
    var count = items && items.length ? items.length : 0;
    var itemsLoadingBefore;
    var actionType;
    var recordKey;
    var recordKeyText;
    var operationText;
    var operationState;
    var requestInfoRows;
    var operationRow;
    var tableData;

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
    tableData = buildApprovalItemsTableData(items || []);
    model.setProperty("/itemsEmptyVisible", !errorText && count === 0);
    model.setProperty("/itemsErrorText", errorText || "");
    model.setProperty("/itemsErrorVisible", !!errorText);
    model.setProperty("/bulkSummaryText", errorText ? "" : buildBulkSummary(items || []));
    model.setProperty("/bulkSummaryVisible", !errorText && count > 0);
    model.setProperty("/bulkColumns", errorText ? [] : tableData.columns);
    model.setProperty("/bulkTableRows", errorText ? [] : tableData.tableRows);
    model.setProperty("/bulkTableWidth", errorText ? "100%" : tableData.tableWidth);

    actionType = count === 1 && items[0] ?
      getItemContextValue(items[0], "ActionType") :
      model.getProperty("/rawActionType");
    recordKey = model.getProperty("/rawRecordKey");
    recordKeyText = model.getProperty("/rawRecordKeyText");
    operationText = getRequestActionText(actionType, recordKey, recordKeyText, errorText || count === 0 ? undefined : count);
    operationState = getRequestActionState(actionType, recordKey, recordKeyText, errorText || count === 0 ? undefined : count);
    requestInfoRows = model.getProperty("/requestInfoRows") || [];
    operationRow = requestInfoRows.filter(function (row) {
      return row.label === "Operation";
    })[0];

    model.setProperty("/operationText", operationText);
    model.setProperty("/operationState", operationState);

    if (operationRow) {
      operationRow.value = operationText;
      operationRow.state = operationState;
      operationRow.isStatus = true;
      operationRow.isBulkOperation = operationText === "BULK";
      model.setProperty("/requestInfoRows", requestInfoRows.slice());
    }

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
    model.setProperty("/bulkItems", []);
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
      var bulkVisible = isBulkValues(values.RecordKey, values.RecordKeyText);
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
      scheduleApprovalObjectPageHeaderSync(view, values);
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
      requestApprovalItems(view, context, approvalId, owner._itemsLoadSequence);
      logApprovalItemsLifecycle(model, "BINDING_CREATED", {
        aprvlId: approvalId,
        sequence: owner._itemsLoadSequence,
        bindingPath: bindingPath,
        previousBindingExists: previousBindingExists
      });
    });
  }

  function syncApprovalObjectPageHeader(view, values) {
    var approvalId = valueOrDash(values && values.AprvlId);
    var tableName = valueOrDash(values && values.TableName);
    var actionType = valueOrDash(values && values.ActionType);
    var statusText = ApprovalFormatter.formatStatusText(values && values.Status);
    var viewRoot = view && view.getDomRef && view.getDomRef();
    var doc = viewRoot && viewRoot.ownerDocument || typeof document !== "undefined" && document;
    var headerRoots;
    var titleNodes;
    var descriptionNodes;
    var textNodes;

    if (!doc || approvalId === "—") {
      return;
    }

    headerRoots = doc.querySelectorAll(
      ".sapFDynamicPageTitle, " +
      ".sapFDynamicPageTitleMain, " +
      ".sapUxAPObjectPageHeaderIdentifier, " +
      ".sapUxAPObjectPageHeaderTitle, " +
      ".sapUxAPObjectPageHeader"
    );

    Array.prototype.forEach.call(headerRoots, function (headerRoot) {
      if (!headerRoot || headerRoot.closest && headerRoot.closest(".approvalDetailRoot")) {
        return;
      }

      titleNodes = headerRoot.querySelectorAll(
        ".sapFDynamicPageTitleMainHeading .sapMTitle, " +
        ".sapFDynamicPageTitleMainHeading [role='heading'], " +
        ".sapMTitleStyleH1, " +
        ".sapMTitle, " +
        "h1, " +
        "[role='heading']"
      );
      Array.prototype.forEach.call(titleNodes, function (node) {
        var text = node && node.textContent && node.textContent.trim();

        if (text === tableName || text === actionType || text === statusText) {
          node.textContent = approvalId;
        }
      });

      descriptionNodes = headerRoot.querySelectorAll(
        ".sapFDynamicPageTitleMainContent .sapMText, " +
        ".sapFDynamicPageTitleMainContent, " +
        ".sapFDynamicPageTitleContent .sapMText, " +
        ".sapFDynamicPageTitleContent, " +
        ".sapUxAPObjectPageHeaderContent .sapMText, " +
        ".sapUxAPObjectPageHeaderIdentifierDescription, " +
        ".sapUxAPObjectPageHeaderIdentifierDescription .sapMText"
      );
      Array.prototype.forEach.call(descriptionNodes, function (node) {
        var text = node && node.textContent && node.textContent.trim();

        if (text === actionType || text === statusText) {
          node.style.display = "none";
        }
      });

      textNodes = headerRoot.querySelectorAll(".sapMText, span, div");
      Array.prototype.forEach.call(textNodes, function (node) {
        var text = node && node.textContent && node.textContent.trim();

        if ((text === actionType || text === statusText) && node.style) {
          node.style.display = "none";
        }
      });
    });

    titleNodes = doc.querySelectorAll(
      ".sapFDynamicPageTitleMainHeading .sapMTitle, " +
      ".sapFDynamicPageTitleMainHeading [role='heading'], " +
      ".sapUxAPObjectPageHeaderIdentifierTitle, " +
      ".sapUxAPObjectPageHeaderIdentifierTitle .sapMTitle"
    );
    Array.prototype.forEach.call(titleNodes, function (node) {
      var text = node && node.textContent && node.textContent.trim();

      if (text === tableName || text === actionType || text === statusText) {
        node.textContent = approvalId;
      }
    });

    descriptionNodes = doc.querySelectorAll(
      ".sapFDynamicPageTitleMainContent .sapMText, " +
      ".sapFDynamicPageTitleMainContent, " +
      ".sapFDynamicPageTitleContent .sapMText, " +
      ".sapFDynamicPageTitleContent, " +
      ".sapUxAPObjectPageHeaderContent .sapMText, " +
      ".sapUxAPObjectPageHeaderIdentifierDescription, " +
      ".sapUxAPObjectPageHeaderIdentifierDescription .sapMText"
    );
    Array.prototype.forEach.call(descriptionNodes, function (node) {
      if (node && node.style) {
        node.style.display = "none";
      }
    });
  }

  function scheduleApprovalObjectPageHeaderSync(view, values) {
    syncApprovalObjectPageHeader(view, values);

    if (typeof setTimeout === "function") {
      setTimeout(function () {
        syncApprovalObjectPageHeader(view, values);
      }, 0);
      setTimeout(function () {
        syncApprovalObjectPageHeader(view, values);
      }, 250);
    }
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

  function applyNewestFirstSort(table) {
    var binding = table && table.getBinding && table.getBinding("items");
    var orderBy = "SubmittedAt desc";

    if (!binding || !table || !table.data) {
      return;
    }

    if (table.data("approvalNewestFirstSortBinding") === binding) {
      return;
    }

    try {
      if (binding.changeParameters) {
        binding.changeParameters({
          $orderby: orderBy
        });
      } else if (binding.sort && Sorter) {
        binding.sort(new Sorter("SubmittedAt", true));
      } else {
        return;
      }

      table.data("approvalNewestFirstSortBinding", binding);
    } catch (error) {
      // Keep the backend/annotation sort if the table binding does not support
      // client-side sorter replacement.
    }
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
    var statusState = ApprovalFormatter.formatStatusState(status) || "None";
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

    if (cell && cell.setState) {
      cell.setState(statusState);
    }

    updateCellClasses(cell, statusClasses, activeClassName);
  }

  function syncActionCellClass(cell, actionText) {
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

  function syncActionCellDisplay(cell, actionType, recordKey, recordKeyText, itemCount) {
    var actionText = getRequestActionText(actionType, recordKey, recordKeyText, itemCount);
    var actionState = getRequestActionState(actionType, recordKey, recordKeyText, itemCount) || "None";

    if (!cell) {
      return;
    }

    if (cell.setText) {
      cell.setText(actionText);
    }

    if (cell.setState) {
      cell.setState(actionState);
    }

    syncActionCellClass(cell, actionText);
  }

  function requestApprovalItemsPreviewFromContext(context) {
    if (!context || !context.requestObject) {
      return Promise.resolve(null);
    }

    return context.requestObject("_Items").then(function (items) {
      return (Array.isArray(items) ? items : items && items.value || []).slice(0, 2).map(function (item) {
        return {
          ActionType: item && item.ActionType
        };
      });
    }).catch(function () {
      return null;
    });
  }

  function requestApprovalItemsPreview(context) {
    var model = context && context.getModel && context.getModel();
    var binding;

    if (!model || !model.bindList) {
      return requestApprovalItemsPreviewFromContext(context);
    }

    try {
      binding = model.bindList("_Items", context, undefined, undefined, {
        $select: "ActionType",
        $orderby: "ItemNo"
      });
    } catch (error) {
      return requestApprovalItemsPreviewFromContext(context);
    }

    if (!binding || !binding.requestContexts) {
      return requestApprovalItemsPreviewFromContext(context);
    }

    return binding.requestContexts(0, 2).then(function (contexts) {
      return (contexts || []).map(function (itemContext) {
        return {
          ActionType: getContextValue(itemContext, "ActionType")
        };
      });
    }).catch(function () {
      return requestApprovalItemsPreviewFromContext(context);
    }).finally(function () {
      if (binding && binding.destroy) {
        binding.destroy();
      }
    });
  }

  function syncBulkActionCellFromItems(cell, context, actionType, recordKey, recordKeyText) {
    var path = context && context.getPath && context.getPath();
    var token = String(path || "") + "|" + String(actionType || "") + "|" + String(recordKey || "") + "|" + Date.now();

    if (!cell || !isBulkValues(recordKey, recordKeyText)) {
      return;
    }

    if (cell.data) {
      cell.data("approvalBulkActionToken", token);
    }

    requestApprovalItemsPreview(context).then(function (items) {
      var firstActionType;
      var itemCount = items && items.length;

      if (cell.data && cell.data("approvalBulkActionToken") !== token) {
        return;
      }

      if (!items || itemCount === 0) {
        syncActionCellDisplay(cell, actionType, recordKey, recordKeyText);
        return;
      }

      firstActionType = itemCount === 1 && items[0] ? items[0].ActionType : actionType;
      syncActionCellDisplay(cell, firstActionType, recordKey, recordKeyText, itemCount);
    });
  }

  function applyReadableListTable(table) {
    var columns = table.getColumns ? table.getColumns() : [];
    var items = table.getItems ? table.getItems() : [];
    var indexes = {};

    if (table && table.hasStyleClass && table.hasStyleClass("approvalItemsSpreadsheet")) {
      return;
    }

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
        syncActionCellDisplay(cells[indexes.operation], actionType, recordKey);
        syncBulkActionCellFromItems(cells[indexes.operation], context, actionType, recordKey);
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

    if (indexes.operation !== undefined) {
      applyNewestFirstSort(table);
    }
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

  function triggerInitialListLoad(extension, view) {
    var filterBar = null;

    if (!view || !view.findAggregatedObjects || extension._approvalInitialLoadTriggered) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      if (control && control.isA &&
          (control.isA("sap.ui.mdc.FilterBar") || control.isA("sap.ui.mdc.FilterBarBase"))) {
        filterBar = control;
        return true;
      }

      return false;
    });

    if (!filterBar) {
      return;
    }

    extension._approvalInitialLoadTriggered = true;

    try {
      if (filterBar.triggerSearch) {
        filterBar.triggerSearch();
      } else if (filterBar.search) {
        filterBar.search();
      }
    } catch (error) {
      extension._approvalInitialLoadTriggered = false;
      // Let the standard Fiori elements initial-load handling continue.
    }
  }

  var ApprovalListReportExtension = ControllerExtension.extend("ztbl.approval.ui.ext.controller.ApprovalListReport", {
    override: {
      onInit: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (view) {
          ensureDetailModel(view);
          ODataErrorHandler.attachGlobalHandlers("approval");
          registerApprovalActionPayloadFix(this);

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
        var model;

        if (!view) {
          return;
        }

        model = ensureDetailModel(view);
        scheduleApprovalObjectPageHeaderSync(view, {
          AprvlId: model && model.getProperty("/approvalId")
        });
        applyReadableListTables(view);
        syncApprovalItemsVisibility(view);
        registerApprovalActionPayloadFix(this);
        triggerInitialListLoad(this, view);
      },

      onExit: function () {
        unregisterApprovalActionPayloadFix(this);
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
      var context = source && source.getBindingContext &&
        (source.getBindingContext("approvalDetail") || source.getBindingContext());
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
    buildApprovalChangeTableHtml: buildApprovalChangeTableHtml,
    isBulkRequest: isBulkRequest,
    isApprovalItemsSection: isApprovalItemsSection,
    syncApprovalItemsVisibility: syncApprovalItemsVisibility,
    buildBulkSummary: buildBulkSummary,
    buildApprovalItemsTableData: buildApprovalItemsTableData,
    buildBulkItemDetail: buildBulkItemDetail,
    beginItemsLoading: beginItemsLoading,
    finishItemsLoading: finishItemsLoading,
    clearBulkItemSelection: clearBulkItemSelection,
    clearItemsLoadingForSingle: clearItemsLoadingForSingle,
    handleApprovalContextChanged: handleApprovalContextChanged,
    requestContextValues: requestContextValues,
    formatRawJson: formatRawJson,
    formatVietnamTimestamp: formatVietnamTimestamp,
    buildRequestInfoRows: buildRequestInfoRows,
    buildStatusNotice: buildStatusNotice,
    getRequestActionText: getRequestActionText,
    getRequestActionState: getRequestActionState,
    getApprovalActionFromRequest: getApprovalActionFromRequest,
    injectRemarksIntoRequestBody: injectRemarksIntoRequestBody
  };

  return ApprovalListReportExtension;
});
