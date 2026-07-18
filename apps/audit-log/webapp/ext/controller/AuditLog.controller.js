sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/model/json/JSONModel",
  "ztbl/audit/ui/ext/formatter/AuditFormatter"
], function (ControllerExtension, JSONModel, AuditFormatter) {
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
        rawRecordKey: "",
        rawOldValue: "",
        rawNewValue: ""
      });
      view.setModel(model, "auditDetail");
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

  function buildInfoRows(values) {
    return [
      { label: "Audit ID", value: AuditFormatter.formatAuditValue(values.AuditId) },
      { label: "Table Name", value: AuditFormatter.formatAuditValue(values.TableName) },
      { label: "Record Key", value: AuditFormatter.formatRecordKeyText(values.RecordKey) },
      { label: "Field Name", value: AuditFormatter.formatAuditValue(values.FieldName) },
      { label: "Action", value: AuditFormatter.formatActionText(values.ActionType), state: AuditFormatter.formatActionState(values.ActionType), isStatus: true },
      { label: "Changed By", value: AuditFormatter.formatAuditValue(values.ChangedBy) },
      { label: "Changed At", value: AuditFormatter.formatTimestamp(values.ChangedAt) }
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
      rawRecordKey: AuditFormatter.formatAuditValue(values.RecordKey),
      rawOldValue: AuditFormatter.formatAuditValue(values.OldValue),
      rawNewValue: AuditFormatter.formatAuditValue(values.NewValue)
    };
  }

  function updateAuditModel(view, context) {
    var model = ensureAuditModel(view);

    if (!model || !context) {
      return Promise.resolve();
    }

    return requestAuditValues(context).then(function (values) {
      model.setData(buildAuditDetail(values));
    });
  }

  var AuditLogExtension = ControllerExtension.extend("ztbl.audit.ui.ext.controller.AuditLog", {
    override: {
      onInit: function () {
        var view = this.base && this.base.getView && this.base.getView();

        if (view) {
          ensureAuditModel(view);

          if (view.attachModelContextChange && !this._auditContextHandlerAttached) {
            this._auditContextHandlerAttached = true;
            view.attachModelContextChange(function () {
              updateAuditModel(view, getObjectPageContext(view));
            });
          }
        }
      },

      routing: {
        onAfterBinding: function (context) {
          var view = this.base && this.base.getView && this.base.getView();

          if (view) {
            updateAuditModel(view, context || getObjectPageContext(view));
          }
        }
      }
    },

    formatActionText: AuditFormatter.formatActionText,
    formatActionState: AuditFormatter.formatActionState,
    formatRecordKeyText: AuditFormatter.formatRecordKeyText,
    formatAuditValue: AuditFormatter.formatAuditValue,
    formatTimestamp: AuditFormatter.formatTimestamp
  });

  AuditLogExtension._test = {
    buildAuditDetail: buildAuditDetail,
    buildInfoRows: buildInfoRows
  };

  return AuditLogExtension;
});
