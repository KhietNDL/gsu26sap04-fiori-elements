sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "ztbl/audit/ui/ext/formatter/AuditFormatter",
  "ztbl/audit/ui/ext/util/ODataErrorHandler",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (ControllerExtension, Fragment, JSONModel, MessageBox, MessageToast, AuditFormatter, ODataErrorHandler, Filter, FilterOperator) {
  "use strict";

  var AUDIT_PROPERTIES = [
    "AuditId",
    "TableName",
    "RecordKey",
    "FieldName",
    "OldValue",
    "NewValue",
    "ChangedBy",
    "ChangedAt",
    "ActionType",
    "RollbackAuditId",
    "__OperationControl"
  ];

  function getContextValue(context, propertyName) {
    var object = context && context.getObject && context.getObject();

    if (object && Object.prototype.hasOwnProperty.call(object, propertyName)) {
      return object[propertyName];
    }

    return context && context.getProperty ? context.getProperty(propertyName) : undefined;
  }

  function getObjectPageContext(view) {
    var context = view && view.getBindingContext && view.getBindingContext();

    if (context) {
      return context;
    }

    return null;
  }

  function ensureAuditModel(view) {
    var model = view && view.getModel && view.getModel("auditDetail");

    if (!model && view && view.setModel) {
      model = new JSONModel({
        title: "Audit Log",
        subtitle: "",
        auditId: "—",
        tableName: "—",
        fieldName: "—",
        fieldNameVisible: false,
        recordKeyText: "—",
        changedBy: "—",
        changedAt: "—",
        rollbackAuditId: "—",
        sourceAuditId: "—",
        linkedAuditId: "—",
        linkedAuditLabel: "Rollback Audit ID:",
        actionText: "—",
        actionState: "None",
        statusText: "Completed",
        statusState: "None",
        rollbackBusy: false,
        rollbackMessageVisible: false,
        rollbackMessage: "",
        infoRows: [],
        recordKeyRows: [],
        recordKeyVisible: false,
        changeTitle: "Value Change",
        changeRows: [],
        showOldColumn: true,
        showNewColumn: true,
        oldColumnHeader: "Before",
        newColumnHeader: "After",
        rollbackText: "Rollback not available",
        rollbackState: "None",
        rollbackAvailable: false,
        bulkVisible: false,
        bulkText: "",
        rawRecordKey: "",
        rawOldValue: "",
        rawNewValue: ""
      });
      view.setModel(model, "auditDetail");
    }

    return model;
  }

  function ensureAuditItemsModel(view) {
    var model = view && view.getModel && view.getModel("auditItems");

    if (!model && view && view.setModel) {
      model = new JSONModel({
        rows: [],
        itemRows: [],
        columns: [],
        tableRows: [],
        tableWidth: "100%",
        itemSummary: "",
        messageVisible: false,
        messageText: "",
        itemsLoading: false,
        itemsErrorVisible: false,
        itemsErrorText: ""
      });
      view.setModel(model, "auditItems");
    }

    return model;
  }

  function ensureBulkModel(view) {
    var model = view && view.getModel && view.getModel("auditBulk");

    if (!model && view && view.setModel) {
      model = new JSONModel({
        title: "Audit details",
        auditId: "—",
        changedBy: "—",
        changedAt: "—",
        detailsText: "0 records · 0 fields",
        operationText: "Bulk Operation",
        operationState: "None",
        operationIcon: "sap-icon://multi-select",
        operationKey: "B",
        actionText: "Bulk",
        actionState: "None",
        summaryText: "",
        emptyVisible: false,
        emptyText: "",
        columns: [],
        tableRows: [],
        tableWidth: "100%",
        items: []
      });
      view.setModel(model, "auditBulk");
    }

    return model;
  }

  function requestAuditValues(context) {
    var values = {};

    function mergeObject(object) {
      Object.keys(object || {}).forEach(function (propertyName) {
        if (values[propertyName] === undefined) {
          values[propertyName] = object[propertyName];
        }
      });
    }

    var objectPromise;

    if (!context) {
      return Promise.resolve(values);
    }

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

      return Promise.all(AUDIT_PROPERTIES.map(function (propertyName) {
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
      AUDIT_PROPERTIES.forEach(function (propertyName) {
        if (values[propertyName] === undefined) {
          values[propertyName] = getContextValue(context, propertyName);
        }
      });

      return values;
    });
  }

  function escapeODataString(value) {
    return String(value || "").replace(/'/g, "''");
  }

  function valuesFromObject(object) {
    var values = {};

    AUDIT_PROPERTIES.forEach(function (propertyName) {
      values[propertyName] = object && object[propertyName];
    });

    if (object && object.ItemNo !== undefined) {
      values.ItemNo = object.ItemNo;
    }

    if (object && object.ItemNumber !== undefined) {
      values.ItemNumber = object.ItemNumber;
    }

    if (object && object.OldData !== undefined && values.OldValue === undefined) {
      values.OldValue = object.OldData;
    }

    if (object && object.NewData !== undefined && values.NewValue === undefined) {
      values.NewValue = object.NewData;
    }

    return values;
  }

  function requestContextsFromListBinding(binding) {
    if (!binding || !binding.requestContexts) {
      return Promise.resolve([]);
    }

    return Promise.resolve().then(function () {
      return binding.requestContexts(0, 1000);
    }).then(function (contexts) {
      return (contexts || []).map(function (context) {
        return context && context.getObject ? context.getObject() : {};
      });
    }).finally(function () {
      if (binding && binding.destroy) {
        binding.destroy();
      }
    });
  }

  function requestNavigationItems(context) {
    var model = context && context.getModel && context.getModel();
    var path = context && context.getPath && context.getPath();
    var binding;

    if (!model || !path || !model.bindList) {
      return Promise.resolve([]);
    }

    try {
      binding = model.bindList(path + "/_Items");
    } catch (error) {
      return Promise.resolve([]);
    }

    return requestContextsFromListBinding(binding).catch(function () {
      return [];
    });
  }

  function requestAuditItemEntity(context, auditId) {
    var model = context && context.getModel && context.getModel();
    var binding;

    if (!model || !model.bindList || !auditId) {
      return Promise.resolve([]);
    }

    if (!Filter || !FilterOperator) {
      return Promise.resolve([]);
    }

    try {
      binding = model.bindList("/AuditItem", null, null, [
        new Filter("AuditId", FilterOperator.EQ, auditId)
      ], {
        $orderby: "ItemNo"
      });
    } catch (error) {
      return Promise.resolve([]);
    }

    return requestContextsFromListBinding(binding).catch(function () {
      return [];
    });
  }

  function requestRollbackSourceAuditId(context, rollbackAuditId) {
    var model = context && context.getModel && context.getModel();
    var binding;

    if (!model || !model.bindList || !rollbackAuditId || !Filter || !FilterOperator) {
      return Promise.resolve("");
    }

    try {
      binding = model.bindList("/AuditLog", null, null, [
        new Filter("RollbackAuditId", FilterOperator.EQ, rollbackAuditId)
      ], {
        $orderby: "ChangedAt desc",
        $top: 1
      });
    } catch (error) {
      return Promise.resolve("");
    }

    return requestContextsFromListBinding(binding).then(function (rows) {
      return rows && rows[0] && rows[0].AuditId || "";
    }).catch(function () {
      return "";
    });
  }

  function extractRollbackSourceAuditId(value) {
    var match = String(value || "").match(/rollback\s+of\s+audit\s+([A-Za-z0-9-]+)/i);

    return match && match[1] || "";
  }

  function requestLatestRollbackAuditId(context, tableName) {
    var model = context && context.getModel && context.getModel();
    var binding;

    if (!model || !model.bindList || !tableName || !Filter || !FilterOperator) {
      return Promise.resolve("");
    }

    try {
      binding = model.bindList("/AuditLog", null, null, [
        new Filter("TableName", FilterOperator.EQ, tableName),
        new Filter("ActionType", FilterOperator.EQ, "R")
      ], {
        $orderby: "ChangedAt desc",
        $top: 1
      });
    } catch (error) {
      return Promise.resolve("");
    }

    return requestContextsFromListBinding(binding).then(function (rows) {
      return rows && rows[0] && rows[0].AuditId || "";
    }).catch(function () {
      return "";
    });
  }

  function isAuditChildRow(object, parentValues) {
    var sameAuditPrefix;
    var sameTable;
    var sameChangedBy;
    var sameTimestamp;

    if (!object || String(object.RecordKey || "").trim().toUpperCase() === "BULK") {
      return false;
    }

    sameAuditPrefix = object.AuditId && parentValues.AuditId &&
      String(object.AuditId).indexOf(String(parentValues.AuditId)) === 0;
    sameTable = object.TableName === parentValues.TableName;
    sameChangedBy = object.ChangedBy === parentValues.ChangedBy;
    sameTimestamp = isSameSecond(object.ChangedAt, parentValues.ChangedAt, 5);

    return sameAuditPrefix || sameTable && sameChangedBy && sameTimestamp;
  }

  function filterAuditChildRows(items, parentValues) {
    var seen = {};

    return (items || []).filter(function (object) {
      var key;

      if (!isAuditChildRow(object, parentValues)) {
        return false;
      }

      key = object.AuditId + "|" + object.RecordKey + "|" + object.FieldName;

      if (seen[key]) {
        return false;
      }

      seen[key] = true;
      return true;
    });
  }

  function requestAuditLogChildRows(context, parentValues) {
    var model = context && context.getModel && context.getModel();
    var binding;
    var auditId = escapeODataString(parentValues && parentValues.AuditId);
    var tableName = escapeODataString(parentValues && parentValues.TableName);
    var changedBy = escapeODataString(parentValues && parentValues.ChangedBy);
    var prefixFilter;
    var candidateFilter;

    if (!model || !model.bindList || !parentValues || !parentValues.AuditId) {
      return Promise.resolve([]);
    }

    prefixFilter = "startswith(AuditId, '" + auditId + "') and AuditId ne '" + auditId + "'";

    try {
      binding = model.bindList("/AuditLog", null, null, null, {
        $filter: prefixFilter,
        $orderby: "ChangedAt"
      });
    } catch (error) {
      binding = null;
    }

    if (binding) {
      return requestContextsFromListBinding(binding).then(function (items) {
        return filterAuditChildRows(items, parentValues);
      }).catch(function () {
        return [];
      }).then(function (items) {
        if (items.length) {
          return items;
        }

        return requestAuditLogCandidates(context, parentValues, tableName, changedBy);
      });
    }

    candidateFilter = tableName && changedBy ?
      "TableName eq '" + tableName + "' and ChangedBy eq '" + changedBy + "'" : "";

    return candidateFilter ? requestAuditLogCandidates(context, parentValues, tableName, changedBy) : Promise.resolve([]);
  }

  function requestAuditLogCandidates(context, parentValues, tableName, changedBy) {
    var model = context && context.getModel && context.getModel();
    var binding;
    var filter = tableName && changedBy ?
      "TableName eq '" + tableName + "' and ChangedBy eq '" + changedBy + "'" : "";

    if (!model || !model.bindList || !filter) {
      return Promise.resolve([]);
    }

    try {
      binding = model.bindList("/AuditLog", null, null, null, {
        $filter: filter,
        $orderby: "ChangedAt desc"
      });
    } catch (error) {
      return Promise.resolve([]);
    }

    return requestContextsFromListBinding(binding).then(function (items) {
      return filterAuditChildRows(items, parentValues);
    }).catch(function () {
      return [];
    });
  }

  function isSameSecond(left, right, toleranceSeconds) {
    var leftDate = new Date(left);
    var rightDate = new Date(right);

    if (isNaN(leftDate.getTime()) || isNaN(rightDate.getTime())) {
      return false;
    }

    return Math.abs(leftDate.getTime() - rightDate.getTime()) <= toleranceSeconds * 1000;
  }

  function collectLoadedAuditRows(source, parentValues) {
    var control = source;
    var loadedRows = [];
    var binding;
    var contexts;

    while (control && control.getParent) {
      binding = control.getBinding && (control.getBinding("items") || control.getBinding("rows"));

      if (binding && binding.getCurrentContexts) {
        contexts = binding.getCurrentContexts() || [];
        contexts.forEach(function (rowContext) {
          var object = rowContext && rowContext.getObject && rowContext.getObject();

          if (object) {
            loadedRows.push(object);
          }
        });
      }

      control = control.getParent();
    }

    return filterAuditChildRows(loadedRows, parentValues);
  }

  function requestBulkItems(context, source, parentValues) {
    // Each audit record owns its own item actions. A rolled-back source must
    // still show its original Create/Delete/Update items; the generated
    // rollback audit is loaded separately by its own AuditId.
    var auditItemsId = parentValues && parentValues.AuditId;

    return requestAuditItemEntity(context, auditItemsId).then(function (items) {
      if (items.length) {
        return items;
      }

      if (auditItemsId !== (parentValues && parentValues.AuditId)) {
        return [];
      }

      return requestNavigationItems(context);
    }).then(function (items) {
      if (items.length) {
        return items;
      }

      return requestAuditLogChildRows(context, parentValues);
    }).then(function (items) {
      if (items.length) {
        return items;
      }

      return collectLoadedAuditRows(source, parentValues);
    });
  }

  function buildInfoRows(values) {
    var isBulk = AuditFormatter.isBulkRecord(values);
    var isRollbackEntry = String(values.ActionType || "").trim().toUpperCase() === "R";
    var actionText = isBulk ? AuditFormatter.formatOperationText(
      values.ActionType,
      values.RecordKey,
      values.OldValue,
      values.NewValue
    ) : AuditFormatter.formatActionText(values.ActionType);

    return [
      { label: "Audit ID", value: AuditFormatter.formatAuditValue(values.AuditId), state: "None" },
      { label: "Table Name", value: AuditFormatter.formatAuditValue(values.TableName), state: "None" },
      { label: "Field Name", value: AuditFormatter.formatAuditValue(values.FieldName), state: "None" },
      {
        label: "Operation",
        value: actionText,
        state: actionText === "Bulk" ? "None" : AuditFormatter.formatActionState(actionText),
        isStatus: true
      },
      { label: "Changed By", value: AuditFormatter.formatAuditValue(values.ChangedBy), state: "None" },
      { label: "Changed At", value: AuditFormatter.formatTimestamp(values.ChangedAt), state: "None" },
      {
        label: isRollbackEntry ? "Rollback ID" : "Rollback Audit ID",
        value: AuditFormatter.formatAuditValue(isRollbackEntry ? values.AuditId : values.RollbackAuditId),
        state: "None"
      }
    ];
  }

  function buildOverviewRows(values) {
    var operation = AuditFormatter.formatOperationText(
      values.ActionType,
      values.RecordKey,
      values.OldValue,
      values.NewValue
    );

    return [
      { label: "Audit ID", value: AuditFormatter.formatAuditValue(values.AuditId), state: "None" },
      { label: "Table Name", value: AuditFormatter.formatAuditValue(values.TableName), state: "None" },
      { label: "Operation", value: operation, state: operation === "Bulk" ? "None" : AuditFormatter.formatActionState(values.ActionType) },
      { label: "Changed By", value: AuditFormatter.formatAuditValue(values.ChangedBy), state: "None" },
      { label: "Changed At", value: AuditFormatter.formatTimestamp(values.ChangedAt), state: "None" }
    ];
  }

  function requestEntityContextsFromListBinding(binding) {
    if (!binding || !binding.requestContexts) {
      return Promise.resolve([]);
    }

    return Promise.resolve().then(function () {
      return binding.requestContexts(0, 1);
    }).then(function (contexts) {
      return contexts || [];
    }).finally(function () {
      if (binding && binding.destroy) {
        binding.destroy();
      }
    });
  }

  function buildHorizontalColumns(rows, labelPropertyName) {
    return (rows || []).map(function (row) {
      return {
        label: row && row[labelPropertyName] || "—"
      };
    });
  }

  function buildHorizontalSingleRow(rows, valuePropertyName) {
    if (!rows || !rows.length) {
      return [];
    }

    return [{
      cells: rows.map(function (row) {
        return {
          value: row && row[valuePropertyName] || "—",
          state: row && row.state || "None"
        };
      })
    }];
  }

  function buildChangeColumns(changeRows) {
    if (!changeRows || !changeRows.length) {
      return [];
    }

    return [{ label: "Value Type" }].concat(changeRows.map(function (row) {
      return {
        label: row && row.field || "—"
      };
    }));
  }

  function buildChangeTableRows(changeRows, showOldColumn, showNewColumn, oldColumnHeader, newColumnHeader) {
    var rows = [];

    if (!changeRows || !changeRows.length) {
      return rows;
    }

    if (showOldColumn) {
      rows.push({
        cells: [{ value: oldColumnHeader || "Before", state: "None" }].concat(changeRows.map(function (row) {
          return {
            value: row && row.oldValue || "—",
            state: "None"
          };
        }))
      });
    }

    if (showNewColumn) {
      rows.push({
        cells: [{ value: newColumnHeader || "After", state: "None" }].concat(changeRows.map(function (row) {
          return {
            value: row && row.newValue || "—",
            state: "None"
          };
        }))
      });
    }

    return rows;
  }

  function buildAuditDetail(values) {
    var baseActionText = AuditFormatter.formatActionText(values.ActionType);
    var actionText = AuditFormatter.formatOperationText(
      values.ActionType,
      values.RecordKey,
      values.OldValue,
      values.NewValue
    );
    var recordKeyRows = AuditFormatter.getRecordKeyRows(values.RecordKey);
    var infoRows = buildInfoRows(values);
    var changeRows = AuditFormatter.buildChangeRows(values);
    var title = AuditFormatter.formatAuditValue(values.TableName);
    var operationControl = values.__OperationControl || {};
    var showOldColumn = baseActionText === "Update" || baseActionText === "Delete" || baseActionText === "Rollback";
    var showNewColumn = baseActionText === "Create" || baseActionText === "Update" || baseActionText === "Rollback";
    var oldColumnHeader = baseActionText === "Delete" ? "Previous Value" : "Before";
    var newColumnHeader = baseActionText === "Create" ? "New Value" : "After";
    var rollbackAuditId = AuditFormatter.formatAuditValue(values.RollbackAuditId);
    var isRollbackEntry = baseActionText === "Rollback";
    var sourceAuditId = AuditFormatter.formatAuditValue(values.SourceAuditId);
    var linkedAuditId = isRollbackEntry ? AuditFormatter.formatAuditValue(values.AuditId) : rollbackAuditId;
    var linkedAuditLabel = isRollbackEntry ? "Rollback ID:" : "Rollback Audit ID:";
    var fieldName = AuditFormatter.formatAuditValue(values.FieldName);
    var rolledBack = baseActionText === "Rollback" || rollbackAuditId !== "—";
    var rollbackAvailable = !rolledBack && AuditFormatter.isRollbackAvailable(operationControl);
    var rollbackMessage = "This audit has already been rolled back" +
      (baseActionText === "Rollback" ? "." :
        (rollbackAuditId === "—" ? "." : ". Rollback Audit ID: " + rollbackAuditId + "."));

    return {
      title: AuditFormatter.formatAuditValue(values.AuditId),
      subtitle: title + " · " + actionText,
      auditId: AuditFormatter.formatAuditValue(values.AuditId),
      tableName: title,
      fieldName: fieldName,
      fieldNameVisible: fieldName !== "—",
      recordKeyText: AuditFormatter.formatRecordKeyText(values.RecordKey),
      changedBy: AuditFormatter.formatAuditValue(values.ChangedBy),
      changedAt: AuditFormatter.formatTimestamp(values.ChangedAt),
      rollbackAuditId: rollbackAuditId,
      sourceAuditId: sourceAuditId,
      linkedAuditId: linkedAuditId,
      linkedAuditLabel: linkedAuditLabel,
      affectedRecordsText: "Loading…",
      changedFieldsText: "Loading…",
      actionText: actionText,
      actionState: actionText === "Bulk" ? "None" : AuditFormatter.formatActionState(actionText),
      rolledBack: rolledBack,
      statusText: rolledBack ? "Rolled back" : rollbackAvailable ? "Rollback available" : "Completed",
      statusState: rolledBack ? "Success" : rollbackAvailable ? "Information" : "None",
      rollbackBusy: false,
      rollbackMessageVisible: rolledBack,
      rollbackMessage: rollbackMessage,
      overviewRows: buildOverviewRows(values),
      infoRows: infoRows,
      infoColumns: buildHorizontalColumns(infoRows, "label"),
      infoTableRows: buildHorizontalSingleRow(infoRows, "value"),
      recordKeyRows: recordKeyRows,
      recordKeyColumns: buildHorizontalColumns(recordKeyRows, "field"),
      recordKeyTableRows: buildHorizontalSingleRow(recordKeyRows, "value"),
      recordKeyVisible: recordKeyRows.length > 0,
      changeTitle: AuditFormatter.getChangeTitle(baseActionText),
      changeRows: changeRows,
      changeColumns: buildChangeColumns(changeRows),
      changeTableRows: buildChangeTableRows(changeRows, showOldColumn, showNewColumn, oldColumnHeader, newColumnHeader),
      showOldColumn: showOldColumn,
      showNewColumn: showNewColumn,
      oldColumnHeader: oldColumnHeader,
      newColumnHeader: newColumnHeader,
      rollbackText: rolledBack ? "Already rolled back" : AuditFormatter.formatRollbackText(operationControl),
      rollbackState: rolledBack ? "Success" : AuditFormatter.formatRollbackState(operationControl),
      rollbackAvailable: rollbackAvailable,
      bulkVisible: AuditFormatter.isBulkRecord(values),
      bulkText: AuditFormatter.formatBulkRecordKeyText(values.RecordKey, values.OldValue, values.NewValue),
      rawRecordKey: AuditFormatter.formatAuditValue(values.RecordKey),
      rawOldValue: AuditFormatter.formatAuditValue(values.OldValue),
      rawNewValue: AuditFormatter.formatAuditValue(values.NewValue)
    };
  }

  function formatCount(count, singular) {
    return count + " " + singular + (count === 1 ? "" : "s");
  }

  function formatBulkDialogTimestamp(value) {
    var date = new Date(value);

    if (value === null || value === undefined || value === "" || isNaN(date.getTime())) {
      return AuditFormatter.formatTimestamp(value);
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function getBulkDialogActionLabel(actionText) {
    // Keep the semantic action from the backend. Do not rewrite Delete to
    // Deleted (or Create/Update to past-tense labels) in the item table.
    return actionText;
  }

  function getAuditActionKey(actionText) {
    return AuditFormatter.formatActionKey(actionText) || "B";
  }

  function getBulkDialogOperationText(actionText) {
    if (actionText === "Bulk") {
      return "Bulk Operation";
    }
    if (actionText === "Rollback") {
      return "Rollback";
    }
    return getBulkDialogActionLabel(actionText);
  }

  function getBulkDialogOperationIcon(actionText) {
    var actionKey = getAuditActionKey(actionText);

    if (actionKey === "C") { return "sap-icon://add"; }
    if (actionKey === "U") { return "sap-icon://edit"; }
    if (actionKey === "D") { return "sap-icon://delete"; }
    if (actionKey === "R") { return "sap-icon://undo"; }
    return "sap-icon://group-2";
  }

  function buildBulkDialogData(parentValues, rawItems) {
    var items = (rawItems || []).map(function (item, index) {
      var viewModel = AuditFormatter.buildBulkItemViewModel(valuesFromObject(item), index);

      viewModel.recordKeyVisible = viewModel.recordKeyRows.length > 0;
      return viewModel;
    });
    var parentActionText = AuditFormatter.formatActionText(parentValues.ActionType);
    var actionText = parentActionText === "Rollback" ?
      "Rollback" : AuditFormatter.getBulkActionText(parentValues.ActionType, rawItems || []);
    var countText = AuditFormatter.getBulkCountText(parentValues.OldValue, parentValues.NewValue);
    var emptyText = "No child audit items were found for this bulk summary. Summary: " +
      AuditFormatter.formatBulkRecordKeyText(parentValues.RecordKey, parentValues.OldValue, parentValues.NewValue) +
      ". Old Value: " + AuditFormatter.formatAuditValue(parentValues.OldValue) +
      ". New Value: " + AuditFormatter.formatAuditValue(parentValues.NewValue) + ".";
    var itemData = buildAuditItemsData(parentValues, rawItems || []);
    var fieldCount = itemData.changedFieldCount;

    return {
      title: "Audit details",
      auditId: AuditFormatter.formatAuditValue(parentValues.AuditId),
      changedBy: AuditFormatter.formatAuditValue(parentValues.ChangedBy),
      changedAt: formatBulkDialogTimestamp(parentValues.ChangedAt),
      detailsText: formatCount(items.length, "record") + " · " + formatCount(fieldCount, "field"),
      operationText: getBulkDialogOperationText(actionText),
      operationState: AuditFormatter.formatActionState(actionText),
      operationIcon: getBulkDialogOperationIcon(actionText),
      operationKey: getAuditActionKey(actionText),
      actionText: actionText,
      actionState: actionText === "Bulk" ? "None" : AuditFormatter.formatActionState(actionText),
      summaryText: countText,
      emptyVisible: items.length === 0,
      emptyText: emptyText,
      columns: itemData.columns,
      tableRows: itemData.tableRows,
      tableWidth: itemData.tableWidth,
      items: items
    };
  }

  function buildAuditItemDetail(item, tableName, index) {
    var values = valuesFromObject(item || {});
    var itemView = AuditFormatter.buildBulkItemViewModel(values, index || 0);
    var actionText = itemView.actionText;

    return {
      itemNumber: itemView.itemNumber,
      actionText: actionText,
      actionState: itemView.actionState,
      statusText: AuditFormatter.isRollbackAvailable(values.__OperationControl) ? "Rollback available" : "Review required",
      statusState: AuditFormatter.isRollbackAvailable(values.__OperationControl) ? "Success" : "Information",
      recordKeyText: itemView.recordKeyText,
      recordKeyRows: itemView.recordKeyRows,
      changeTitle: AuditFormatter.getChangeTitle(values.ActionType),
      changeMessage: actionText === "Delete" ? "Delete request for " + AuditFormatter.formatAuditValue(tableName) + ". Review the record values that will be removed." : "Update request for " + AuditFormatter.formatAuditValue(tableName) + ". Showing changed fields only.",
      changeRows: itemView.changeRows,
      showOldColumn: itemView.showOldColumn,
      showNewColumn: itemView.showNewColumn,
      oldColumnHeader: actionText === "Delete" ? "Current Value" : itemView.oldColumnHeader,
      newColumnHeader: actionText === "Create" ? "New Value" : itemView.newColumnHeader,
      rawRecordKey: AuditFormatter.formatAuditValue(values.RecordKey),
      rawOldValue: AuditFormatter.formatAuditValue(values.OldValue),
      rawNewValue: AuditFormatter.formatAuditValue(values.NewValue)
    };
  }

  function rowsByKey(rows) {
    var map = Object.create(null);

    (rows || []).forEach(function (row) {
      map[String(row.key)] = row;
    });
    return map;
  }

  function buildSpreadsheetChanges(values) {
    var actionText = AuditFormatter.formatActionText(values.ActionType);
    var rawOldValue = values.OldValue !== undefined ? values.OldValue : values.OldData;
    var rawNewValue = values.NewValue !== undefined ? values.NewValue : values.NewData;
    var oldRows = AuditFormatter.getValueRows(rawOldValue);
    var newRows = AuditFormatter.getValueRows(rawNewValue);
    var oldMap = rowsByKey(oldRows);
    var newMap = rowsByKey(newRows);
    var keys = [];
    var seen = Object.create(null);

    function addKey(row) {
      var key = row && String(row.key);

      if (key && !seen[key]) {
        seen[key] = true;
        keys.push(key);
      }
    }

    if (oldRows.length || newRows.length) {
      if (actionText !== "Create") {
        oldRows.forEach(addKey);
      }
      if (actionText !== "Delete") {
        newRows.forEach(addKey);
      }

      return keys.map(function (key) {
        var oldRow = oldMap[key];
        var newRow = newMap[key];
        var oldValue = oldRow ? oldRow.value : "—";
        var newValue = newRow ? newRow.value : "—";

        return {
          key: key,
          label: key.toUpperCase(),
          oldValue: oldValue,
          newValue: newValue,
          text: actionText === "Create" ? newValue :
            actionText === "Delete" ? oldValue :
              oldValue + " → " + newValue
        };
      }).filter(function (change) {
        return actionText === "Create" || actionText === "Delete" || change.oldValue !== change.newValue;
      });
    }

    var oldValue = AuditFormatter.formatAuditValue(rawOldValue);
    var newValue = AuditFormatter.formatAuditValue(rawNewValue);
    var fieldKey = String(values.FieldName || "").trim();

    if (!fieldKey && oldValue === "—" && newValue === "—") {
      return [];
    }
    fieldKey = fieldKey || "VALUE";

    if (actionText === "Update" && oldValue === newValue) {
      return [];
    }

    return [{
      key: fieldKey,
      label: fieldKey.toUpperCase(),
      oldValue: oldValue,
      newValue: newValue,
      text: actionText === "Create" ? newValue :
        actionText === "Delete" ? oldValue :
          oldValue + " → " + newValue
    }];
  }

  function formatSpreadsheetRecordKey(recordKeyRows, fallbackText) {
    if (recordKeyRows && recordKeyRows.length) {
      return recordKeyRows.map(function (row) {
        return String(row.field || row.key || "Record Key").toUpperCase() + "=" +
          String(row.value === null || row.value === undefined ? "" : row.value);
      }).join(", ");
    }
    return fallbackText === null || fallbackText === undefined || fallbackText === "" ?
      "—" : String(fallbackText);
  }

  function createSpreadsheetCell(text, kind, state) {
    text = AuditFormatter.formatAuditValue(text);
    return {
      text: text,
      value: text,
      tooltip: text,
      kind: kind || "text",
      state: state || "None"
    };
  }

  function getAuditMessage(parentValues, itemValuesList) {
    var messages = [];

    if (parentValues.Message) {
      messages.push(parentValues.Message);
    }
    (itemValuesList || []).forEach(function (item) {
      if (item.Message && messages.indexOf(item.Message) < 0) {
        messages.push(item.Message);
      }
    });
    return messages.join(" · ");
  }

  function buildAuditItemsData(parentValues, items) {
    var rows = [];
    var itemRows = [];
    var sourceItems = items || [];
    var fieldColumns = [];
    var fieldKeys = Object.create(null);
    var recordKeyColumns = [];
    var recordKeyKeys = Object.create(null);
    var operationControl = parentValues.__OperationControl;

    function normalizeColumnKey(value) {
      return String(value || "RECORD_KEY").trim().toUpperCase();
    }

    function formatRecordKeyColumnLabel(value) {
      var label = normalizeColumnKey(value);

      return label === "RECORDKEY" ? "RECORD KEY" : label;
    }

    function getRecordKeyColumnWidth(key) {
      return /(?:^|_)ID$/.test(key) || key === "RECORD_KEY" ? "22rem" : "14rem";
    }

    if (!sourceItems.length && !AuditFormatter.isBulkRecord(parentValues) &&
        !String(parentValues.RollbackAuditId || "").trim()) {
      sourceItems = [parentValues];
    }

    sourceItems.forEach(function (item, index) {
      var itemValues = valuesFromObject(item);
      var itemView = AuditFormatter.buildBulkItemViewModel(itemValues, index);
      var changes = buildSpreadsheetChanges(itemValues);
      var recordKey = formatSpreadsheetRecordKey(itemView.recordKeyRows, itemValues.RecordKey || itemView.recordKeyText);

      itemView.recordKeyRows.forEach(function (recordKeyRow) {
        var key = normalizeColumnKey(recordKeyRow.key || recordKeyRow.field);

        if (!recordKeyKeys[key]) {
          recordKeyKeys[key] = true;
          recordKeyColumns.push({
            key: key,
            label: formatRecordKeyColumnLabel(recordKeyRow.key || recordKeyRow.field),
            width: getRecordKeyColumnWidth(key)
          });
        }
      });

      itemRows.push({
        item: itemView.itemNumber,
        actionText: itemView.actionText,
        actionState: itemView.actionState,
        recordKey: recordKey,
        recordKeyRows: itemView.recordKeyRows,
        changeRows: itemView.changeRows,
        spreadsheetChanges: changes,
        showOldColumn: itemView.showOldColumn,
        showNewColumn: itemView.showNewColumn,
        oldColumnHeader: itemView.oldColumnHeader,
        newColumnHeader: itemView.newColumnHeader,
        statusText: AuditFormatter.isRollbackAvailable(operationControl) ? "Rollback available" : "Review required",
        statusState: AuditFormatter.isRollbackAvailable(operationControl) ? "Success" : "Information",
        sourceItem: itemValues,
        message: "Changed by " + AuditFormatter.formatAuditValue(parentValues.ChangedBy) +
          " · " + AuditFormatter.formatTimestamp(parentValues.ChangedAt)
      });

      itemView.changeRows.forEach(function (change) {
        rows.push({
          item: itemView.itemNumber,
          actionText: itemView.actionText,
          actionState: itemView.actionState,
          recordKey: recordKey,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          showOldColumn: itemView.showOldColumn,
          showNewColumn: itemView.showNewColumn
        });
      });
    });

    itemRows.forEach(function (itemRow) {
      itemRow.spreadsheetChanges.forEach(function (change) {
        var normalizedKey = normalizeColumnKey(change.key);

        if (!recordKeyKeys[normalizedKey] && !fieldKeys[normalizedKey]) {
          fieldKeys[normalizedKey] = true;
          fieldColumns.push({ key: normalizedKey, label: change.label, width: "14rem" });
        }
      });
    });

    var columns = [
      { key: "__action", label: "Action", width: "9rem" }
    ].concat(recordKeyColumns, fieldColumns);

    var tableRows = itemRows.map(function (itemRow) {
      var changeMap = Object.create(null);
      var recordKeyMap = Object.create(null);

      itemRow.spreadsheetChanges.forEach(function (change) {
        changeMap[normalizeColumnKey(change.key)] = change;
      });
      itemRow.recordKeyRows.forEach(function (recordKeyRow) {
        recordKeyMap[normalizeColumnKey(recordKeyRow.key || recordKeyRow.field)] =
          recordKeyRow.value === null || recordKeyRow.value === undefined ? "" : String(recordKeyRow.value);
      });

      return {
        actionKey: getAuditActionKey(itemRow.actionText),
        cells: [
          createSpreadsheetCell(getBulkDialogActionLabel(itemRow.actionText), "status", itemRow.actionState)
        ].concat(recordKeyColumns.map(function (column) {
          return createSpreadsheetCell(recordKeyMap[column.key] || "—", "key");
        }), fieldColumns.map(function (column) {
          var change = changeMap[column.key];
          return createSpreadsheetCell(change ? change.text : "—");
        }))
      };
    });
    var messageText = getAuditMessage(parentValues, itemRows.map(function (row) { return row.sourceItem; }));

    return {
      rows: rows,
      itemRows: itemRows,
      columns: columns,
      tableRows: tableRows,
      tableWidth: recordKeyColumns.length + fieldColumns.length > 4 ?
        (9 + recordKeyColumns.reduce(function (total, column) {
          return total + parseInt(column.width, 10);
        }, 0) + fieldColumns.length * 14) + "rem" : "100%",
      itemSummary: formatCount(itemRows.length, "record") + " · " + formatCount(fieldColumns.length, "field"),
      affectedRecordCount: itemRows.length,
      changedFieldCount: fieldColumns.length,
      messageVisible: !!messageText,
      messageText: messageText,
      itemsLoading: false,
      itemsErrorVisible: false,
      itemsErrorText: ""
    };
  }

  function mergeAuditValues(values, overrideValues) {
    if (!overrideValues || typeof overrideValues !== "object") {
      return values;
    }

    if (overrideValues.__rollbackResultOnly) {
      if (overrideValues.RollbackAuditId) {
        values.RollbackAuditId = overrideValues.RollbackAuditId;
      }
      return values;
    }

    AUDIT_PROPERTIES.forEach(function (propertyName) {
      if (overrideValues[propertyName] !== undefined && overrideValues[propertyName] !== null && overrideValues[propertyName] !== "") {
        values[propertyName] = overrideValues[propertyName];
      }
    });

    return values;
  }

  function normalizeRollbackResult(result, originalAuditId) {
    var actionType;
    var rollbackAuditId;

    if (typeof result === "string" && result.trim()) {
      return {
        __rollbackResultOnly: true,
        RollbackAuditId: result
      };
    }

    if (!result || typeof result !== "object") {
      return null;
    }

    if (Array.isArray(result)) {
      return normalizeRollbackResult(result[0], originalAuditId);
    }

    if (result.RollbackAuditId) {
      return {
        __rollbackResultOnly: true,
        RollbackAuditId: result.RollbackAuditId
      };
    }

    if (result.value && typeof result.value === "string") {
      return {
        __rollbackResultOnly: true,
        RollbackAuditId: result.value
      };
    }

    if (result.value && typeof result.value === "object") {
      return normalizeRollbackResult(Array.isArray(result.value) ? result.value[0] : result.value, originalAuditId);
    }

    if (result.AuditId) {
      actionType = String(result.ActionType || "").trim().toUpperCase();
      if (String(result.AuditId) !== String(originalAuditId || "") || actionType === "R" || actionType === "ROLLBACK") {
        return {
          __rollbackResultOnly: true,
          RollbackAuditId: result.AuditId
        };
      }
    }

    rollbackAuditId = result.rollbackAuditId || result.rollback_audit_id || result.RollbackId || result.rollbackId;

    return rollbackAuditId ? {
      __rollbackResultOnly: true,
      RollbackAuditId: rollbackAuditId
    } : null;
  }

  function getRollbackAuditIdFromResult(result) {
    return result && result.RollbackAuditId || "";
  }

  function patchRollbackAuditId(view, rollbackAuditId) {
    var model = view && view.getModel && view.getModel("auditDetail");
    var infoRows;
    var found = false;
    var formattedRollbackAuditId = AuditFormatter.formatAuditValue(rollbackAuditId);

    if (!model || !rollbackAuditId) {
      return;
    }

    infoRows = (model.getProperty && model.getProperty("/infoRows") || []).map(function (row) {
      if (row && row.label === "Rollback Audit ID") {
        found = true;
        return {
          label: row.label,
          value: formattedRollbackAuditId,
          state: row.state || "None"
        };
      }
      return row;
    });

    if (!found) {
      infoRows.push({
        label: "Rollback Audit ID",
        value: formattedRollbackAuditId,
        state: "None"
      });
    }

    model.setProperty("/infoRows", infoRows);
    model.setProperty("/rollbackAuditId", formattedRollbackAuditId);
    model.setProperty("/rollbackAvailable", false);
    model.setProperty("/rolledBack", true);
    model.setProperty("/statusText", "Rolled back");
    model.setProperty("/statusState", "Success");
    model.setProperty("/rollbackText", "Already rolled back");
    model.setProperty("/rollbackState", "Success");
    model.setProperty("/rollbackMessageVisible", true);
    model.setProperty("/rollbackMessage", "This audit has already been rolled back" +
      (formattedRollbackAuditId === "—" ? "." : ". Rollback Audit ID: " + formattedRollbackAuditId + "."));
  }

  function loadAuditDetailModels(view, context, source, overrideValues) {
    var model = ensureAuditModel(view);
    var itemsModel = ensureAuditItemsModel(view);
    var loadSequence;

    if (!model || !context) {
      return Promise.resolve();
    }

    loadSequence = (view.__auditDetailLoadSequence || 0) + 1;
    view.__auditDetailLoadSequence = loadSequence;

    return requestAuditValues(context).then(function (values) {
      if (String(values.ActionType || "").trim().toUpperCase() === "R" && values.AuditId) {
        var sourceAuditIdFromMetadata = extractRollbackSourceAuditId(values.NewValue);

        if (sourceAuditIdFromMetadata) {
          values.SourceAuditId = sourceAuditIdFromMetadata;
          return values;
        }

        return requestRollbackSourceAuditId(context, values.AuditId).then(function (sourceAuditId) {
          values.SourceAuditId = sourceAuditId;
          return values;
        });
      }

      return values;
    }).then(function (values) {
      var itemsPromise;

      values = mergeAuditValues(values, overrideValues);
      model.setData(buildAuditDetail(values));

      if (itemsModel && AuditFormatter.isBulkRecord(values)) {
        itemsModel.setData({
          rows: [],
          itemRows: [],
          columns: [],
          tableRows: [],
          tableWidth: "100%",
          itemSummary: "Loading audit items...",
          messageVisible: false,
          messageText: "",
          itemsLoading: true,
          itemsErrorVisible: false,
          itemsErrorText: ""
        });
      }

      if (AuditFormatter.isBulkRecord(values)) {
        itemsPromise = requestBulkItems(context, source || null, values);
      } else {
        // Load the items belonging to the displayed audit record itself.
        // RollbackAuditId is only a link to another audit, not the source for
        // this record's detail values.
        var auditItemsId = values.AuditId;

        itemsPromise = requestAuditItemEntity(context, auditItemsId).then(function (items) {
          if ((!items || !items.length) && values.AuditId && auditItemsId === values.AuditId) {
            return requestNavigationItems(context);
          }
          return items || [];
        });
      }

      return itemsPromise.then(function (items) {
        var itemData;

        if (loadSequence !== view.__auditDetailLoadSequence) {
          return;
        }

        // Normal audit rows do not have an AuditItem child. Their NewValue/
        // OldValue snapshot is still one logical item and must be rendered.
        // Keep an empty result for bulk rows so the bulk dialog remains the
        // single source of truth when child items are missing.
        itemData = buildAuditItemsData(values, items);
        if (itemsModel) {
          itemsModel.setData(itemData);
        }
        model.setProperty("/affectedRecordsText", formatCount(itemData.affectedRecordCount, "record"));
        model.setProperty("/changedFieldsText", formatCount(itemData.changedFieldCount, "field"));
      }).catch(function (error) {
        if (loadSequence !== view.__auditDetailLoadSequence || !itemsModel) {
          return;
        }

        itemsModel.setData({
          rows: [],
          itemRows: [],
          columns: [],
          tableRows: [],
          tableWidth: "100%",
          itemSummary: "",
          messageVisible: false,
          messageText: "",
          itemsLoading: false,
          itemsErrorVisible: true,
          itemsErrorText: ODataErrorHandler.extractBackendMessage(error) || "Audit items could not be loaded."
        });
        model.setProperty("/affectedRecordsText", "—");
        model.setProperty("/changedFieldsText", "—");
      });
    });
  }

  function updateAuditModel(view, context) {
    return loadAuditDetailModels(view, context, null);
  }

  function hideGeneratedAuditSections(view) {
    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      var title = control && control.getTitle && control.getTitle() ||
        control && control.getText && control.getText();

      if (title === "Audit Detail" || title === "Audit Items") {
        if (control.addStyleClass) {
          control.addStyleClass("auditGeneratedSectionHidden");
        }
      }

      return false;
    });
  }

  function getSelectedAuditContext(view) {
    var selectedContexts = [];

    if (!view || !view.findAggregatedObjects) {
      return null;
    }

    view.findAggregatedObjects(true, function (control) {
      var contexts;
      var selectedItems;

      if (!control || !control.isA ||
          !(control.isA("sap.m.Table") || control.isA("sap.ui.table.Table") || control.isA("sap.ui.mdc.Table"))) {
        return false;
      }

      if (control.getSelectedContexts) {
        contexts = control.getSelectedContexts();
        if (contexts && contexts.length) {
          selectedContexts = contexts;
          return true;
        }
      }

      if (control.getSelectedItems) {
        selectedItems = control.getSelectedItems() || [];
        selectedContexts = selectedItems.map(function (item) {
          return item && item.getBindingContext && item.getBindingContext();
        }).filter(Boolean);
        if (selectedContexts.length) {
          return true;
        }
      }

      return false;
    });

    if (selectedContexts.length !== 1) {
      return null;
    }

    return selectedContexts[0];
  }

  function refreshAuditList(view) {
    var refreshPromises = [];

    if (!view || !view.findAggregatedObjects) {
      return Promise.resolve();
    }

    view.findAggregatedObjects(true, function (control) {
      var binding;

      if (!control || !control.isA ||
          !(control.isA("sap.m.Table") || control.isA("sap.ui.table.Table") || control.isA("sap.ui.mdc.Table"))) {
        return false;
      }

      binding = control.getBinding && (control.getBinding("items") || control.getBinding("rows"));
      if (binding && binding.refresh) {
        refreshPromises.push(Promise.resolve(binding.refresh()).catch(function () {
          return null;
        }));
      }

      return false;
    });

    return Promise.all(refreshPromises).then(function () {
      return undefined;
    });
  }

  function refreshAuditData(context) {
    var model = context && context.getModel && context.getModel();
    var binding = context && context.getBinding && context.getBinding();
    var promises = [];

    if (binding && binding.refresh) {
      promises.push(Promise.resolve(binding.refresh()).catch(function () {
        return null;
      }));
    }

    if (context && context.refresh) {
      promises.push(Promise.resolve(context.refresh()).catch(function () {
        return null;
      }));
    }

    if (model && model.refresh) {
      promises.push(Promise.resolve(model.refresh()).catch(function () {
        return null;
      }));
    }

    if (context && context.requestObject) {
      promises.push(Promise.resolve(context.requestObject()).catch(function () {
        return null;
      }));
    }

    return Promise.all(promises);
  }

  function attachHeaderRollbackConfirmation(extension, view) {
    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      var domRef;

      if (!control || !control.isA || !control.isA("sap.m.Button") ||
          String(control.getText && control.getText() || "").trim() !== "Rollback") {
        return false;
      }

      if (control.data("auditRollbackConfirmAttached")) {
        return false;
      }

      domRef = control.getDomRef && control.getDomRef();
      if (!domRef || !domRef.addEventListener) {
        return false;
      }

      control.data("auditRollbackConfirmAttached", true);
      domRef.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        extension.onRollbackPress({
          getSource: function () {
            return control;
          }
        });
      }, true);

      return false;
    });
  }

  function getRollbackResultObject(actionBinding) {
    var boundContext = actionBinding && actionBinding.getBoundContext && actionBinding.getBoundContext();

    if (boundContext && boundContext.requestObject) {
      return Promise.resolve(boundContext.requestObject()).catch(function () {
        return null;
      });
    }

    if (boundContext && boundContext.getObject) {
      return Promise.resolve(boundContext.getObject()).catch(function () {
        return null;
      });
    }

    return Promise.resolve(null);
  }

  function updateDetailAfterRollback(view, context, actionBinding) {

    return getRollbackResultObject(actionBinding).then(function (result) {
      var rollbackAuditId;

      result = normalizeRollbackResult(result, originalAuditId);
      rollbackAuditId = getRollbackAuditIdFromResult(result);

      if (rollbackAuditId) {
        patchRollbackAuditId(view, rollbackAuditId);
        return refreshAuditData(context).then(function () {
          return rollbackAuditId;
        });
      }

      return refreshAuditData(context).then(function () {
        rollbackAuditId = getContextValue(context, "RollbackAuditId");
        if (rollbackAuditId) {
          patchRollbackAuditId(view, rollbackAuditId);
          return rollbackAuditId;
        }

        return requestLatestRollbackAuditId(context, getContextValue(context, "TableName"))
          .then(function (latestRollbackAuditId) {
            patchRollbackAuditId(view, latestRollbackAuditId);
            return latestRollbackAuditId;
          });
      });
    });
  }

  function findAuditContext(context, auditId) {
    var model = context && context.getModel && context.getModel();
    var binding;
    var directBinding;

    if (!model || !model.bindList || !auditId) {
      return Promise.resolve(null);
    }

    try {
      binding = model.bindList("/AuditLog", null, null, [
        new Filter("AuditId", FilterOperator.EQ, auditId)
      ], {
        $top: 1
      });
    } catch (error) {
      return Promise.resolve(null);
    }

    return requestEntityContextsFromListBinding(binding).then(function (contexts) {
      var foundContext = contexts && contexts[0];

      if (foundContext) {
        return foundContext;
      }

      try {
        directBinding = model.bindContext("/AuditLog(AuditId='" + escapeODataString(auditId) + "')");
      } catch (error) {
        return null;
      }

      if (!directBinding || !directBinding.getBoundContext) {
        return null;
      }

      return Promise.resolve(directBinding.getBoundContext().requestObject()).then(function () {
        return directBinding.getBoundContext();
      }).catch(function () {
        return null;
      });
    }).catch(function () {
      return null;
    });
  }

  function findAuditContextWithRetry(context, auditId, attempt) {
    var retryAttempt = attempt || 0;

    return findAuditContext(context, auditId).then(function (rollbackContext) {
      if (rollbackContext || retryAttempt >= 4) {
        return rollbackContext;
      }

      return new Promise(function (resolve) {
        setTimeout(resolve, 300);
      }).then(function () {
        return findAuditContextWithRetry(context, auditId, retryAttempt + 1);
      });
    });
  }

  function findLatestRollbackContext(context) {
    var model = context && context.getModel && context.getModel();
    var tableName = getContextValue(context, "TableName");
    var recordKey = getContextValue(context, "RecordKey");
    var binding;
    var filters;

    if (!model || !model.bindList || !tableName) {
      return Promise.resolve(null);
    }

    filters = [
      new Filter("TableName", FilterOperator.EQ, tableName),
      new Filter("ActionType", FilterOperator.EQ, "R")
    ];

    if (recordKey) {
      filters.push(new Filter("RecordKey", FilterOperator.EQ, recordKey));
    }

    try {
      binding = model.bindList("/AuditLog", null, null, filters, {
        $orderby: "ChangedAt desc",
        $top: 1
      });
    } catch (error) {
      return Promise.resolve(null);
    }

    return requestEntityContextsFromListBinding(binding).then(function (contexts) {
      return contexts && contexts[0] || null;
    }).catch(function () {
      return null;
    });
  }

  function navigateToAuditHash(auditId) {
    var currentHash;
    var nextHash;

    if (typeof window === "undefined" || !window.location || !auditId) {
      return false;
    }

    currentHash = window.location.hash || "";
    if (!/AuditLog\('[^']*'\)/.test(currentHash)) {
      return false;
    }

    nextHash = currentHash.replace(
      /AuditLog\('[^']*'\)/,
      "AuditLog('" + String(auditId).replace(/'/g, "''") + "')"
    );

    if (nextHash === currentHash) {
      return false;
    }

    window.location.hash = nextHash;
    return true;
  }

  function navigateToAuditId(context, auditId, routing) {
    if (!auditId) {
      return Promise.resolve(false);
    }

    if (navigateToAuditHash(auditId)) {
      return Promise.resolve(true);
    }

    return findAuditContextWithRetry(context, auditId).then(function (targetContext) {
      if (!targetContext || !routing || !routing.navigate) {
        return false;
      }

      routing.navigate(targetContext);
      return true;
    });
  }

  function navigateToRollbackAudit(context, auditId, routing) {
    if (!auditId) {
      return Promise.resolve(false);
    }

    if (navigateToAuditHash(auditId)) {
      return Promise.resolve(true);
    }

    return findAuditContextWithRetry(context, auditId).then(function (rollbackContext) {
      if (!rollbackContext) {
        return findLatestRollbackContext(context);
      }
      return rollbackContext;
    }).then(function (rollbackContext) {
      if (!rollbackContext) {
        return false;
      }

      routing.navigate(rollbackContext);
      return true;
    });
  }

  function executeRollback(context, view) {
    var model = context && context.getModel && context.getModel();
    var actionPath = context && context.getPath && context.getPath();
    var actionBinding;

    if (!model || !model.bindContext || !actionPath) {
      return Promise.reject(new Error("Rollback action cannot be prepared for this audit record."));
    }

    actionBinding = model.bindContext(actionPath + "/com.sap.gateway.srvd.zsd_tbl_config.v0001.rollback(...)");
    return actionBinding.execute().then(function () {
      // The page is reloaded immediately by the caller. Do not wait for
      // extra context, model, or item-detail requests after the action.
      return "";
    });
  }

  function openBulkAuditItems(extension, context, source) {
    var view = extension.base && extension.base.getView && extension.base.getView();
    var model = ensureBulkModel(view);

    if (!context || !view || !model) {
      return;
    }

    requestAuditValues(context).then(function (parentValues) {
      return requestBulkItems(context, source, parentValues).then(function (items) {
        model.setData(buildBulkDialogData(parentValues, items));

        return extension._getBulkAuditItemsDialog(view).then(function (dialog) {
          dialog.open();
        });
      });
    }).catch(function (error) {
      ODataErrorHandler.showBackendError(error, "Bulk audit items could not be loaded.");
    });
  }

  function ensureAuditItemDialog(extension, view) {
    if (!extension._auditItemDialogPromise) {
      extension._auditItemDialogPromise = Fragment.load({
        id: view.getId(),
        name: "ztbl.audit.ui.ext.fragment.AuditItemDetailDialog",
        controller: extension
      }).then(function (dialog) {
        view.addDependent(dialog);
        extension._auditItemDialog = dialog;
        return dialog;
      });
    }

    return extension._auditItemDialogPromise;
  }

  function getI18nText(view, key, fallback) {
    var bundle = view && view.getModel && view.getModel("i18n") &&
      view.getModel("i18n").getResourceBundle && view.getModel("i18n").getResourceBundle();

    return bundle && bundle.getText ? bundle.getText(key) : fallback;
  }

  function copyTextToClipboard(text) {
    if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
      return window.navigator.clipboard.writeText(text);
    }

    return Promise.reject(new Error("Clipboard API is not available."));
  }

  function triggerAuditFilterSearch(extension) {
    var view = extension && extension.base && extension.base.getView && extension.base.getView();
    var filterBar;

    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      var isFilterBar = control && control.isA && (
        control.isA("sap.ui.mdc.FilterBar") ||
        control.isA("sap.ui.comp.smartfilterbar.SmartFilterBar")
      );

      if (isFilterBar) {
        filterBar = control;
        return true;
      }

      return false;
    });

    if (!filterBar) {
      return;
    }

    if (filterBar.triggerSearch) {
      filterBar.triggerSearch();
    } else if (filterBar.search) {
      filterBar.search();
    }
  }

  var AuditLogExtension = ControllerExtension.extend("ztbl.audit.ui.ext.controller.AuditLog", {
    override: {
      onInit: function () {
        var view = this.base && this.base.getView && this.base.getView();
        var model;

        if (view) {
          ensureAuditModel(view);
          ODataErrorHandler.attachGlobalHandlers("audit");
          model = view.getModel && view.getModel();
          ODataErrorHandler.attachModelHandlers(model, "audit");

          if (view.attachModelContextChange && !this._auditContextHandlerAttached) {
            this._auditContextHandlerAttached = true;
            view.attachModelContextChange(function () {
              ODataErrorHandler.attachModelHandlers(view.getModel && view.getModel(), "audit");
              updateAuditModel(view, getObjectPageContext(view));
            });
          }

          setTimeout(function () {
            hideGeneratedAuditSections(view);
            attachHeaderRollbackConfirmation(this, view);
            setTimeout(function () {
              attachHeaderRollbackConfirmation(this, view);
            }.bind(this), 250);
          }.bind(this), 0);
        }
      },

      routing: {
        onAfterBinding: function (context) {
          var view = this.base && this.base.getView && this.base.getView();

          if (view) {
            updateAuditModel(view, context || getObjectPageContext(view));
            setTimeout(function () {
              hideGeneratedAuditSections(view);
              attachHeaderRollbackConfirmation(this, view);
              setTimeout(function () {
                attachHeaderRollbackConfirmation(this, view);
              }.bind(this), 250);
            }.bind(this), 0);
          }
        }
      }
    },

    formatActionText: AuditFormatter.formatActionText,
    formatActionState: AuditFormatter.formatActionState,
    formatRecordKeyText: AuditFormatter.formatRecordKeyText,
    formatAuditValue: AuditFormatter.formatAuditValue,
    formatTimestamp: AuditFormatter.formatTimestamp,
    isRollbackAvailable: AuditFormatter.isRollbackAvailable,

    onBulkAuditItemsPress: function (event) {
      var source = event && event.getSource && event.getSource();
      var context = source && source.getBindingContext && source.getBindingContext();

      openBulkAuditItems(this, context, source);
    },

    onBulkAuditItemsFromDetailPress: function (event) {
      var view = this.base && this.base.getView && this.base.getView();
      var source = event && event.getSource && event.getSource();

      openBulkAuditItems(this, getObjectPageContext(view), source);
    },

    onAuditDetailsPress: function (event) {
      var source = event && event.getSource && event.getSource();
      var context = source && source.getBindingContext && source.getBindingContext();

      if (context && this.base && this.base.routing && this.base.routing.navigate) {
        this.base.routing.navigate(context);
      }
    },

    onAuditLinkedIdPress: function () {
      var view = this.base && this.base.getView && this.base.getView();
      var context = getObjectPageContext(view);
      var model = view && view.getModel && view.getModel("auditDetail");
      var linkedAuditId = model && model.getProperty && model.getProperty("/linkedAuditId");
      var routing = this.base && this.base.routing;

      if (!linkedAuditId || linkedAuditId === "—") {
        return;
      }

      navigateToAuditId(context, linkedAuditId, routing).catch(function () {
        MessageToast.show("The linked audit record could not be opened.");
      });
    },

    onOperationFilterChange: function () {
      var that = this;

      if (typeof setTimeout === "function") {
        setTimeout(function () {
          triggerAuditFilterSearch(that);
        }, 0);
      } else {
        triggerAuditFilterSearch(this);
      }
    },

    onCopyAuditIdPress: function () {
      var view = this.base && this.base.getView && this.base.getView();
      var model = view && view.getModel && view.getModel("auditDetail");
      var auditId = model && model.getProperty && model.getProperty("/auditId");

      if (!auditId || auditId === "—") {
        MessageToast.show(getI18nText(view, "auditInfoCopyAuditIdUnavailable", "No Audit ID to copy."));
        return;
      }

      copyTextToClipboard(auditId).then(function () {
        MessageToast.show(getI18nText(view, "auditInfoCopyAuditIdSuccess", "Audit ID copied."));
      }).catch(function () {
        MessageToast.show(getI18nText(view, "auditInfoCopyAuditIdError", "Audit ID could not be copied."));
      });
    },

    onRollbackPress: function (event) {
      var source = event && event.getSource && event.getSource();
      var view = this.base && this.base.getView && this.base.getView();
      var context = source && source.getBindingContext && source.getBindingContext() ||
        getObjectPageContext(view) || getSelectedAuditContext(view);
      var auditId = getContextValue(context, "AuditId");
      var tableName = getContextValue(context, "TableName");
      var operationControl = getContextValue(context, "__OperationControl");
      var rollbackAuditId = getContextValue(context, "RollbackAuditId");
      var actionType = getContextValue(context, "ActionType");
      var auditDetailModel = view && view.getModel && view.getModel("auditDetail");

      if (!context) {
        MessageBox.error("Select exactly one audit record before starting rollback.");
        return;
      }

      if (!AuditFormatter.isRollbackAvailableForEntry(operationControl, rollbackAuditId, actionType)) {
        MessageBox.information(AuditFormatter.isRolledBack(actionType, rollbackAuditId) ?
          "This audit record has already been rolled back." :
          "Rollback is not available for this audit record.");
        return;
      }

      MessageBox.confirm("Rollback audit record " + AuditFormatter.formatAuditValue(auditId) + " for " + AuditFormatter.formatAuditValue(tableName) + "?", {
        title: "Confirm Rollback",
        actions: [MessageBox.Action.ROLLBACK || "Rollback", MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.ROLLBACK || "Rollback",
        onClose: function (action) {
          if (action !== (MessageBox.Action.ROLLBACK || "Rollback")) {
            return;
          }

          if (source && source.setBusy) {
            source.setBusy(true);
          }
          if (auditDetailModel) {
            auditDetailModel.setProperty("/rollbackBusy", true);
            auditDetailModel.setProperty("/rollbackAvailable", false);
          }
          executeRollback(context, view).then(function () {
            MessageToast.show("Rollback completed.");

            // Reload the complete Fiori Elements page so the List Report
            // receives the newly created rollback audit and fresh backend
            // state, including the original record's RollbackAuditId.
            if (typeof window !== "undefined" && window.location && window.location.reload) {
              setTimeout(function () {
                window.location.reload();
              }, 50);
            }
          }).catch(function (error) {
            ODataErrorHandler.showBackendError(error, "Rollback failed.");
          }).finally(function () {
            if (source && source.setBusy) {
              source.setBusy(false);
            }
            if (auditDetailModel) {
              auditDetailModel.setProperty("/rollbackBusy", false);
            }
          });
        }
      });
    },

    onBulkAuditDialogClose: function () {
      if (this._bulkAuditDialog) {
        this._bulkAuditDialog.close();
      }
    },

    onAuditItemViewChangesPress: function (event) {
      var source = event && event.getSource && event.getSource();
      var itemContext = source && source.getBindingContext && source.getBindingContext("auditItems");
      var itemRow = itemContext && itemContext.getObject && itemContext.getObject();
      var itemNumber = itemRow && itemRow.item;
      var view = this.base && this.base.getView && this.base.getView();
      var parentContext = getObjectPageContext(view);
      var auditDetailModel = view && view.getModel && view.getModel("auditDetail");
      var tableName = getContextValue(parentContext, "TableName") ||
        auditDetailModel && auditDetailModel.getProperty && auditDetailModel.getProperty("/title");
      var that = this;
      var cachedItem = itemRow && itemRow.sourceItem;
      var itemPath = itemContext && itemContext.getPath && itemContext.getPath();
      var itemPathMatch = itemPath && itemPath.match(/\/(\d+)$/);
      var cachedIndex = itemPathMatch ? Number(itemPathMatch[1]) : 0;

      if (cachedItem) {
        ensureAuditItemDialog(that, view).then(function (dialog) {
          dialog.setModel(new JSONModel(buildAuditItemDetail(cachedItem, tableName, cachedIndex)), "auditItemDetail");
          dialog.open();
        });
        return;
      }

      requestAuditValues(parentContext).then(function (parentValues) {
        return requestBulkItems(parentContext, source, parentValues);
      }).then(function (items) {
        var index = -1;
        var selected = (items || []).filter(function (item, itemIndex) {
          var viewModel = AuditFormatter.buildBulkItemViewModel(valuesFromObject(item), itemIndex);
          if (String(viewModel.itemNumber) === String(itemNumber)) {
            index = itemIndex;
            return true;
          }
          return false;
        })[0];

        if (!selected) {
          MessageBox.information("No detail is available for this audit item.");
          return;
        }

        ensureAuditItemDialog(that, view).then(function (dialog) {
          dialog.setModel(new JSONModel(buildAuditItemDetail(selected, tableName, index)), "auditItemDetail");
          dialog.open();
        });
      }).catch(function (error) {
        ODataErrorHandler.showBackendError(error, "Audit item details could not be loaded.");
      });
    },

    onAuditItemDialogClose: function () {
      if (this._auditItemDialog) {
        this._auditItemDialog.close();
      }
    },

    onAuditItemDialogAfterOpen: function () {
      var that = this;
      var dialog = this._auditItemDialog;

      if (this._auditItemOutsideClickHandler || !dialog) {
        return;
      }

      this._auditItemOutsideClickHandler = function (event) {
        var domRef = dialog.getDomRef && dialog.getDomRef();

        if (domRef && !domRef.contains(event.target)) {
          that.onAuditItemDialogClose();
        }
      };

      document.addEventListener("mousedown", this._auditItemOutsideClickHandler, true);
    },

    onAuditItemDialogAfterClose: function () {
      if (this._auditItemOutsideClickHandler) {
        document.removeEventListener("mousedown", this._auditItemOutsideClickHandler, true);
        this._auditItemOutsideClickHandler = null;
      }
    },

    onBulkAuditDialogAfterOpen: function () {
      var that = this;

      if (this._bulkAuditOutsideClickHandler) {
        return;
      }

      this._bulkAuditOutsideClickHandler = function (event) {
        var dialog = that._bulkAuditDialog;
        var domRef = dialog && dialog.getDomRef && dialog.getDomRef();

        if (!dialog || !domRef || domRef.contains(event.target)) {
          return;
        }

        dialog.close();
      };

      document.addEventListener("mousedown", this._bulkAuditOutsideClickHandler, true);
    },

    onBulkAuditDialogAfterClose: function () {
      if (this._bulkAuditOutsideClickHandler) {
        document.removeEventListener("mousedown", this._bulkAuditOutsideClickHandler, true);
        this._bulkAuditOutsideClickHandler = null;
      }
    },

    _getBulkAuditItemsDialog: function (view) {
      var that = this;

      if (!this._bulkAuditDialogPromise) {
        this._bulkAuditDialogPromise = Fragment.load({
          id: view.getId(),
          name: "ztbl.audit.ui.ext.fragment.BulkAuditItemsDialog",
          controller: this
        }).then(function (dialog) {
          var closeButton = dialog.getBeginButton && dialog.getBeginButton();

          view.addDependent(dialog);
          dialog.attachAfterOpen(that.onBulkAuditDialogAfterOpen, that);
          dialog.attachAfterClose(that.onBulkAuditDialogAfterClose, that);

          if (closeButton && closeButton.attachPress && !closeButton.data("auditBulkCloseAttached")) {
            closeButton.data("auditBulkCloseAttached", true);
            closeButton.attachPress(that.onBulkAuditDialogClose, that);
          }

          that._bulkAuditDialog = dialog;
          return dialog;
        });
      }

      return this._bulkAuditDialogPromise;
    }
  });

  AuditLogExtension._test = {
    buildAuditDetail: buildAuditDetail,
    buildInfoRows: buildInfoRows,
    buildBulkDialogData: buildBulkDialogData,
    buildAuditItemsData: buildAuditItemsData,
    buildSpreadsheetChanges: buildSpreadsheetChanges,
    valuesFromObject: valuesFromObject,
    collectLoadedAuditRows: collectLoadedAuditRows,
    filterAuditChildRows: filterAuditChildRows,
    requestAuditValues: requestAuditValues,
    executeRollback: executeRollback
  };

  return AuditLogExtension;
});
