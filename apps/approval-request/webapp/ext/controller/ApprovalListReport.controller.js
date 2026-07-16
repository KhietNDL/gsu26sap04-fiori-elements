sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/model/json/JSONModel",
  "ztbl/approval/ui/ext/formatter/ApprovalFormatter"
], function (ControllerExtension, JSONModel, ApprovalFormatter) {
  "use strict";

  var FIELD_LABELS = {
    ENTITY_ID: "Entity ID",
    ITEM_ID: "Item ID",
    PRODUCT_CATEGORY: "Product Category",
    DESCRIPTION: "Description",
    STATUS: "Status",
    VALID_FROM: "Valid From",
    VALID_TO: "Valid To",
    COMPANY_CODE: "Company Code",
    PLANT: "Plant",
    MATERIAL_GROUP: "Material Group",
    QUANTITY: "Quantity",
    UNIT: "Unit",
    CREATED_BY: "Created By",
    CREATED_AT: "Created At",
    CHANGED_BY: "Changed By",
    CHANGED_AT: "Changed At"
  };

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
        recordKeyRows: [],
        changeRows: [],
        showOldColumn: false,
        showNewColumn: true,
        oldColumnHeader: "Old Value",
        newColumnHeader: "New Value",
        changeMessage: "Loading change details...",
        technicalRecordKey: "",
        technicalOldData: "",
        technicalNewData: ""
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
    var normalizedKey = String(key || "").toUpperCase();

    return FIELD_LABELS[normalizedKey] || titleCase(normalizedKey.replace(/_/g, " "));
  }

  function parseJsonObject(value) {
    if (!value || value === "BULK") {
      return null;
    }

    try {
      var parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
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

  function mapFieldValue(key, value) {
    var normalizedKey = String(key || "").toUpperCase();
    var normalizedValue = String(value === null || value === undefined ? "" : value).trim().toUpperCase();

    if (value === null || value === undefined || value === "") {
      return "-";
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
    var parsed = parseJsonObject(rawJson);
    var rows = [];

    flattenObject(parsed || {}, "", rows);

    return rows.map(function (row) {
      return {
        key: row.key,
        field: row.label,
        value: mapFieldValue(row.key, row.value),
        compareValue: String(row.value === null || row.value === undefined ? "" : row.value)
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

  function buildChangeRows(actionType, oldData, newData, recordKey) {
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
        oldValue: oldRow ? oldRow.value : "-",
        newValue: newRow ? newRow.value : "-",
        oldCompare: oldRow ? oldRow.compareValue : "",
        newCompare: newRow ? newRow.compareValue : ""
      };
    }).filter(function (row) {
      if (action === "Update") {
        return row.oldCompare !== row.newCompare;
      }

      return row.oldValue !== "-" || row.newValue !== "-";
    });
  }

  function formatTechnicalJson(rawJson) {
    var parsed = parseJsonObject(rawJson);

    if (!rawJson) {
      return "";
    }

    if (!parsed) {
      return String(rawJson);
    }

    return JSON.stringify(parsed, null, 2);
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

  function updateApprovalDetailModel(view) {
    var context = getObjectPageContext(view);
    var model = ensureDetailModel(view);

    if (!context || !model) {
      return;
    }

    requestContextValues(context).then(function (values) {
      var actionText = ApprovalFormatter.formatActionText(values.ActionType);
      var recordKeyRows = getJsonRows(values.RecordKey);
      var changeRows = buildChangeRows(values.ActionType, values.OldData, values.NewData, values.RecordKey);
      var showOldColumn = actionText === "Update" || actionText === "Delete";
      var showNewColumn = actionText === "Create" || actionText === "Update";
      var comment = values.AprvlComment || "-";

      model.setData({
        approvalId: values.AprvlId || "-",
        operationText: actionText,
        operationState: ApprovalFormatter.formatActionState(values.ActionType),
        statusText: ApprovalFormatter.formatStatusText(values.Status),
        statusState: ApprovalFormatter.formatStatusState(values.Status),
        tableName: values.TableName || "-",
        recordKeyRows: recordKeyRows.length ? recordKeyRows : [{ field: "Record Key", value: values.RecordKey || "-" }],
        submittedBy: values.SubmittedBy || "-",
        submittedAt: values.SubmittedAt || "-",
        approvedAt: values.ApprovedAt || "-",
        comment: comment,
        changeRows: changeRows,
        showOldColumn: showOldColumn,
        showNewColumn: showNewColumn,
        oldColumnHeader: actionText === "Delete" ? "Previous Value" : "Old Value",
        newColumnHeader: "New Value",
        changeMessage: actionText + " request for " + (values.TableName || "record"),
        technicalRecordKey: formatTechnicalJson(values.RecordKey),
        technicalOldData: formatTechnicalJson(values.OldData),
        technicalNewData: formatTechnicalJson(values.NewData)
      });
    });
  }

  function isBulkRequest(view) {
    var context = getObjectPageContext(view);
    var recordKey = getContextValue(context, "RecordKey");
    var recordKeyText = getContextValue(context, "RecordKeyText");

    return String(recordKey || recordKeyText || "").trim().toUpperCase() === "BULK";
  }

  function hideNonBulkExcelItems(view) {
    var showExcelItems = isBulkRequest(view);

    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      var title = control.getTitle && control.getTitle();
      var headerText = control.getHeaderText && control.getHeaderText();
      var text = String(title || headerText || "");

      if (/Excel Approval Items/i.test(text) && control.setVisible) {
        control.setVisible(showExcelItems);
      }

      return false;
    });
  }

  function hideLegacyObjectPageSections(view) {
    var legacySectionTitles = {
      "Request Detail": true,
      "Request Metadata": true,
      "Change Details": true,
      "Approval Items": true
    };

    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      var title = control.getTitle && control.getTitle();
      var headerText = control.getHeaderText && control.getHeaderText();
      var text = String(title || headerText || "").trim();

      if (legacySectionTitles[text] && control.setVisible && !String(control.getId && control.getId()).includes("CustomSection")) {
        control.setVisible(false);
      }

      return false;
    });
  }

  function requestApprovalDetailProperties(view) {
    var context = getObjectPageContext(view);
    var properties = ["ActionType", "RecordKey", "OldData", "NewData"];

    if (!context || !context.requestProperty) {
      return;
    }

    properties.forEach(function (propertyName) {
      context.requestProperty(propertyName).catch(function () {
        // Keep the object page usable even if a technical field is not exposed.
      });
    });
  }

  function getColumnHeaderText(column) {
    var header = column && column.getHeader && column.getHeader();

    if (header && header.getText) {
      return header.getText();
    }

    return "";
  }

  function setCellText(cell, text) {
    if (cell && cell.setText) {
      cell.setText(text || "-");
    }

    if (cell && cell.setTooltip) {
      cell.setTooltip(text || "");
    }
  }

  function setCellState(cell, actionType) {
    if (cell && cell.setState) {
      cell.setState(ApprovalFormatter.formatActionState(actionType));
    }
  }

  function applyReadableListTable(table) {
    var columns = table.getColumns ? table.getColumns() : [];
    var items = table.getItems ? table.getItems() : [];
    var indexes = {};
    var rawJsonColumnHeaders = {
      "Action": true,
      "Record Key": true,
      "Old Data (JSON)": true,
      "New Data (JSON)": true
    };

    columns.forEach(function (column, index) {
      var headerText = getColumnHeaderText(column).trim();

      if (headerText === "Summary" || headerText === "Changed Fields" || headerText === "Object" || rawJsonColumnHeaders[headerText]) {
        column.setVisible(false);
        return;
      }

      if (headerText === "Operation") {
        indexes.operation = index;
      }

    });

    items.forEach(function (item) {
      var context = item.getBindingContext && item.getBindingContext();
      var cells = item.getCells ? item.getCells() : [];
      var actionType = getContextValue(context, "ActionType");

      if (indexes.operation !== undefined) {
        setCellText(cells[indexes.operation], ApprovalFormatter.formatActionText(actionType));
        setCellState(cells[indexes.operation], actionType);
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
            setTimeout(function () {
              applyReadableListTable(control);
            }, 0);
          });
        }
      }

      return false;
    });
  }

  return ControllerExtension.extend("ztbl.approval.ui.ext.controller.ApprovalListReport", {
    override: {
      onInit: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (view) {
          ensureDetailModel(view);
        }
      },

      onAfterRendering: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (!view) {
          return;
        }

        [0, 100, 500, 1000, 2000].forEach(function (delay) {
          setTimeout(function () {
            requestApprovalDetailProperties(view);
            updateApprovalDetailModel(view);
            applyReadableListTables(view);
            hideLegacyObjectPageSections(view);
            hideNonBulkExcelItems(view);
          }, delay);
        });
      }
    }
  });
});
