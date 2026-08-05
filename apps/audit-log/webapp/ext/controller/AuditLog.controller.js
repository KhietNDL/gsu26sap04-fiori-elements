sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/core/Element",
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "ztbl/audit/ui/ext/formatter/AuditFormatter",
  "ztbl/audit/ui/ext/util/ODataErrorHandler"
], function (ControllerExtension, Element, Fragment, JSONModel, MessageBox, MessageToast, AuditFormatter, ODataErrorHandler) {
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
        actionText: "—",
        actionState: "None",
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
      model = new JSONModel({ rows: [] });
      view.setModel(model, "auditItems");
    }

    return model;
  }

  function ensureBulkModel(view) {
    var model = view && view.getModel && view.getModel("auditBulk");

    if (!model && view && view.setModel) {
      model = new JSONModel({
        title: "Bulk Audit Items — 0",
        auditId: "—",
        changedBy: "—",
        changedAt: "—",
        actionText: "Bulk",
        actionState: "Information",
        summaryText: "",
        emptyVisible: false,
        emptyText: "",
        items: []
      });
      view.setModel(model, "auditBulk");
    }

    return model;
  }

  function requestAuditValues(context) {
    var values = {};

    if (!context) {
      return Promise.resolve(values);
    }

    return Promise.all(AUDIT_PROPERTIES.map(function (propertyName) {
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

    return binding.requestContexts(0, 200).then(function (contexts) {
      return (contexts || []).map(function (context) {
        return context && context.getObject ? context.getObject() : {};
      });
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

    try {
      binding = model.bindList("/AuditItem", null, null, null, {
        $filter: "AuditId eq '" + escapeODataString(auditId) + "'"
      });
    } catch (error) {
      return Promise.resolve([]);
    }

    return requestContextsFromListBinding(binding).catch(function () {
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
    var seen = {};
    var rows = [];
    var binding;
    var contexts;

    while (control && control.getParent) {
      binding = control.getBinding && (control.getBinding("items") || control.getBinding("rows"));

      if (binding && binding.getCurrentContexts) {
        contexts = binding.getCurrentContexts() || [];
        contexts.forEach(function (rowContext) {
          var object = rowContext && rowContext.getObject && rowContext.getObject();
          var isCandidate;

          if (!object || object.RecordKey === "BULK") {
            return;
          }

          isCandidate = object.TableName === parentValues.TableName ||
            object.ChangedBy === parentValues.ChangedBy ||
            (object.AuditId && parentValues.AuditId && String(object.AuditId).indexOf(String(parentValues.AuditId)) === 0) ||
            isSameSecond(object.ChangedAt, parentValues.ChangedAt, 5);

          if (isCandidate && !seen[object.AuditId + "|" + object.RecordKey + "|" + object.FieldName]) {
            seen[object.AuditId + "|" + object.RecordKey + "|" + object.FieldName] = true;
            rows.push(object);
          }
        });
      }

      control = control.getParent();
    }

    return rows;
  }

  function requestBulkItems(context, source, parentValues) {
    return requestNavigationItems(context).then(function (items) {
      if (items.length) {
        return items;
      }

      return requestAuditItemEntity(context, parentValues.AuditId);
    }).then(function (items) {
      if (items.length) {
        return items;
      }

      return collectLoadedAuditRows(source, parentValues);
    });
  }

  function buildInfoRows(values) {
    return [
      { label: "Audit ID", value: AuditFormatter.formatAuditValue(values.AuditId), state: "None" },
      { label: "Table Name", value: AuditFormatter.formatAuditValue(values.TableName), state: "None" },
      { label: "Record Key", value: AuditFormatter.formatRecordKeyText(values.RecordKey), state: "None" },
      { label: "Field Name", value: AuditFormatter.formatAuditValue(values.FieldName), state: "None" },
      { label: "Action", value: AuditFormatter.formatActionText(values.ActionType), state: AuditFormatter.formatActionState(values.ActionType), isStatus: true },
      { label: "Changed By", value: AuditFormatter.formatAuditValue(values.ChangedBy), state: "None" },
      { label: "Changed At", value: AuditFormatter.formatTimestamp(values.ChangedAt), state: "None" },
      { label: "Rollback Audit ID", value: AuditFormatter.formatAuditValue(values.RollbackAuditId), state: "None" }
    ];
  }

  function buildOverviewRows(values) {
    var operation = AuditFormatter.isBulkRecord(values.RecordKey) ||
      String(values.NewValue || values.OldValue || "").toUpperCase().indexOf("BULK AUDIT") >= 0
      ? "Bulk"
      : AuditFormatter.formatActionText(values.ActionType);

    return [
      { label: "Audit ID", value: AuditFormatter.formatAuditValue(values.AuditId), state: "None" },
      { label: "Table Name", value: AuditFormatter.formatAuditValue(values.TableName), state: "None" },
      { label: "Operation", value: operation, state: operation === "Bulk" ? "Information" : AuditFormatter.formatActionState(values.ActionType) },
      { label: "Changed By", value: AuditFormatter.formatAuditValue(values.ChangedBy), state: "None" },
      { label: "Changed At", value: AuditFormatter.formatTimestamp(values.ChangedAt), state: "None" }
    ];
  }

  function buildAuditDetail(values) {
    var actionText = AuditFormatter.formatActionText(values.ActionType);
    var recordKeyRows = AuditFormatter.getRecordKeyRows(values.RecordKey);
    var title = AuditFormatter.formatAuditValue(values.TableName);
    var operationControl = values.__OperationControl || {};

    return {
      title: title + " · " + actionText,
      subtitle: "Audit " + AuditFormatter.formatAuditValue(values.AuditId),
      actionText: actionText,
      actionState: AuditFormatter.formatActionState(values.ActionType),
      rollbackMessageVisible: String(values.ActionType || "").trim().toUpperCase() === "R" || !!(values.RollbackAuditId && String(values.RollbackAuditId).trim()),
      rollbackMessage: "Rollback completed for this audit record.",
      overviewRows: buildOverviewRows(values),
      infoRows: buildInfoRows(values),
      recordKeyRows: recordKeyRows,
      recordKeyVisible: recordKeyRows.length > 0,
      changeTitle: AuditFormatter.getChangeTitle(values.ActionType),
      changeRows: AuditFormatter.buildChangeRows(values),
      showOldColumn: actionText === "Update" || actionText === "Delete" || actionText === "Rollback",
      showNewColumn: actionText === "Create" || actionText === "Update" || actionText === "Rollback",
      oldColumnHeader: actionText === "Delete" ? "Previous Value" : "Before",
      newColumnHeader: actionText === "Create" ? "New Value" : "After",
      rollbackText: AuditFormatter.formatRollbackText(operationControl),
      rollbackState: AuditFormatter.formatRollbackState(operationControl),
      rollbackAvailable: AuditFormatter.isRollbackAvailable(operationControl),
      bulkVisible: AuditFormatter.isBulkRecord(values),
      bulkText: AuditFormatter.formatBulkRecordKeyText(values.RecordKey, values.OldValue, values.NewValue),
      rawRecordKey: AuditFormatter.formatAuditValue(values.RecordKey),
      rawOldValue: AuditFormatter.formatAuditValue(values.OldValue),
      rawNewValue: AuditFormatter.formatAuditValue(values.NewValue)
    };
  }

  function buildBulkDialogData(parentValues, rawItems) {
    var items = (rawItems || []).map(function (item, index) {
      var viewModel = AuditFormatter.buildBulkItemViewModel(valuesFromObject(item), index);

      viewModel.recordKeyVisible = viewModel.recordKeyRows.length > 0;
      return viewModel;
    });
    var actionText = AuditFormatter.getBulkActionText(parentValues.ActionType, rawItems || []);
    var countText = AuditFormatter.getBulkCountText(parentValues.OldValue, parentValues.NewValue);
    var emptyText = "No child audit items were found for this bulk summary. Summary: " +
      AuditFormatter.formatBulkRecordKeyText(parentValues.RecordKey, parentValues.OldValue, parentValues.NewValue) +
      ". Old Value: " + AuditFormatter.formatAuditValue(parentValues.OldValue) +
      ". New Value: " + AuditFormatter.formatAuditValue(parentValues.NewValue) + ".";

    return {
      title: "Bulk Audit Items — " + items.length,
      auditId: AuditFormatter.formatAuditValue(parentValues.AuditId),
      changedBy: AuditFormatter.formatAuditValue(parentValues.ChangedBy),
      changedAt: AuditFormatter.formatTimestamp(parentValues.ChangedAt),
      actionText: actionText,
      actionState: actionText === "Bulk" ? "Information" : AuditFormatter.formatActionState(actionText),
      summaryText: countText,
      emptyVisible: items.length === 0,
      emptyText: emptyText,
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

  function buildAuditItemsData(parentValues, items) {
    var rows = [];
    var itemRows = [];
    var operationControl = parentValues.__OperationControl;

    if ((!items || !items.length) && !AuditFormatter.isBulkRecord(parentValues)) {
      items = [parentValues];
    }

    (items || []).forEach(function (item, index) {
      var itemValues = valuesFromObject(item);
      var itemView = AuditFormatter.buildBulkItemViewModel(itemValues, index);

      itemRows.push({
        item: itemView.itemNumber,
        actionText: itemView.actionText,
        actionState: itemView.actionState,
        recordKey: itemView.recordKeyText,
        recordKeyRows: itemView.recordKeyRows,
        changeRows: itemView.changeRows,
        showOldColumn: itemView.showOldColumn,
        showNewColumn: itemView.showNewColumn,
        oldColumnHeader: itemView.oldColumnHeader,
        newColumnHeader: itemView.newColumnHeader,
        statusText: AuditFormatter.isRollbackAvailable(operationControl) ? "Rollback available" : "Review required",
        statusState: AuditFormatter.isRollbackAvailable(operationControl) ? "Success" : "Information",
        message: "Changed by " + AuditFormatter.formatAuditValue(parentValues.ChangedBy) +
          " · " + AuditFormatter.formatTimestamp(parentValues.ChangedAt)
      });

      (itemView.changeRows || []).forEach(function (change) {
        rows.push({
          item: itemView.itemNumber,
          actionText: itemView.actionText,
          actionState: itemView.actionState,
          recordKey: itemView.recordKeyText,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          showOldColumn: itemView.showOldColumn,
          showNewColumn: itemView.showNewColumn
        });
      });
    });

    return {
      rows: rows,
      itemRows: itemRows,
      itemSummary: itemRows.length + " item(s)"
    };
  }

  function updateAuditModel(view, context) {
    var model = ensureAuditModel(view);

    if (!model || !context) {
      return Promise.resolve();
    }

    return requestAuditValues(context).then(function (values) {
      model.setData(buildAuditDetail(values));
      return requestNavigationItems(context).then(function (items) {
        if ((!items || !items.length) && values.AuditId) {
          return requestAuditItemEntity(context, values.AuditId);
        }
        return items || [];
      }).then(function (items) {
        // Normal audit rows do not have an AuditItem child. Their NewValue/
        // OldValue snapshot is still one logical item and must be rendered.
        // Keep an empty result for bulk rows so the bulk dialog remains the
        // single source of truth when child items are missing.
        ensureAuditItemsModel(view).setData(buildAuditItemsData(values, items));
      });
    });
  }

  function hideGeneratedAuditSections(view) {
    if (!view || !view.findAggregatedObjects) {
      return;
    }

    view.findAggregatedObjects(true, function (control) {
      var title = control && control.getTitle && control.getTitle();

      if (title === "Audit Detail" || title === "Audit Items") {
        if (control.setVisible) {
          control.setVisible(false);
        }
      }

      return false;
    });
  }

  function refreshAuditData(context) {
    var model = context && context.getModel && context.getModel();
    var binding = context && context.getBinding && context.getBinding();

    if (binding && binding.refresh) {
      binding.refresh();
    }

    if (model && model.refresh) {
      model.refresh();
    }
  }

  function executeRollback(context) {
    var model = context && context.getModel && context.getModel();
    var actionPath = context && context.getPath && context.getPath();
    var actionBinding;

    if (!model || !model.bindContext || !actionPath) {
      return Promise.reject(new Error("Rollback action cannot be prepared for this audit record."));
    }

    actionBinding = model.bindContext(actionPath + "/com.sap.gateway.srvd.zsd_tbl_config.v0001.rollback(...)");
    return actionBinding.execute().then(function () {
      refreshAuditData(context);
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

  function findAuditFilterBar(view) {
    var controls;
    var viewId = view && view.getId && view.getId();

    if (!view || !view.findAggregatedObjects) {
      return null;
    }

    controls = view.findAggregatedObjects(true, function (control) {
      var id = control && control.getId && control.getId();
      var hasSearchApi = control && (control.triggerSearch || control.search);

      return !!hasSearchApi && /FilterBar/i.test(id || "");
    });

    if (controls && controls[0]) {
      return controls[0];
    }

    if (Element && Element.registry && Element.registry.filter) {
      controls = Element.registry.filter(function (control) {
        var id = control && control.getId && control.getId();
        var hasSearchApi = control && (control.triggerSearch || control.search);

        return !!hasSearchApi && /FilterBar/i.test(id || "") && (!viewId || id.indexOf(viewId) === 0);
      });
    }

    return controls && controls[0] ? controls[0] : null;
  }

  function triggerInitialListLoad(extension, attemptsLeft) {
    var view = extension.base && extension.base.getView && extension.base.getView();
    var filterBar = findAuditFilterBar(view);

    if (extension._auditInitialSearchTriggered) {
      return;
    }

    if (filterBar) {
      extension._auditInitialSearchTriggered = true;

      if (filterBar.triggerSearch) {
        filterBar.triggerSearch();
        return;
      }

      if (filterBar.search) {
        filterBar.search();
      }

      return;
    }

    if (attemptsLeft > 0) {
      setTimeout(function () {
        triggerInitialListLoad(extension, attemptsLeft - 1);
      }, 250);
    }
  }

  var AuditLogExtension = ControllerExtension.extend("ztbl.audit.ui.ext.controller.AuditLog", {
    override: {
      onInit: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (view) {
          ensureAuditModel(view);
          ODataErrorHandler.attachGlobalHandlers("audit");
          triggerInitialListLoad(this, 12);

          if (view.attachModelContextChange && !this._auditContextHandlerAttached) {
            this._auditContextHandlerAttached = true;
            view.attachModelContextChange(function () {
              updateAuditModel(view, getObjectPageContext(view));
            });
          }

          setTimeout(function () {
            hideGeneratedAuditSections(view);
          }, 0);
        }
      },

      routing: {
        onAfterBinding: function (context) {
          var view = this.base && this.base.getView && this.base.getView();

          if (view) {
            updateAuditModel(view, context || getObjectPageContext(view));
            setTimeout(function () {
              hideGeneratedAuditSections(view);
            }, 0);
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

    onRollbackPress: function (event) {
      var source = event && event.getSource && event.getSource();
      var context = source && source.getBindingContext && source.getBindingContext() ||
        getObjectPageContext(this.base && this.base.getView && this.base.getView());
      var auditId = getContextValue(context, "AuditId");
      var tableName = getContextValue(context, "TableName");

      if (!context) {
        MessageBox.error("No audit record is selected for rollback.");
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

          executeRollback(context).then(function () {
            MessageToast.show("Rollback completed.");
          }).catch(function (error) {
            ODataErrorHandler.showBackendError(error, "Rollback failed.");
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
      var itemNumber = source && source.getBindingContext && source.getBindingContext("auditItems") && source.getBindingContext("auditItems").getProperty("item");
      var view = this.base && this.base.getView && this.base.getView();
      var parentContext = getObjectPageContext(view);
      var tableName = getContextValue(parentContext, "TableName");
      var that = this;

      requestNavigationItems(parentContext).then(function (items) {
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
    valuesFromObject: valuesFromObject,
    collectLoadedAuditRows: collectLoadedAuditRows,
    executeRollback: executeRollback
  };

  return AuditLogExtension;
});
