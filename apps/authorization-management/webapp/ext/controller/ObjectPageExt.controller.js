sap.ui.define(["sap/ui/core/mvc/ControllerExtension"], function (ControllerExtension) {
  "use strict";

  return ControllerExtension.extend("ztbl.authorization.ui.ext.controller.ObjectPageExt", {
    setStringFlag: function (event, propertyName) {
      var source = event.getSource();
      var context = source.getBindingContext();

      if (context && propertyName) {
        context.getModel().setProperty(context.getPath() + "/" + propertyName, event.getParameter("selected") ? "X" : "");
      }
    },

    onActiveFlagSelect: function (event) {
      this.setStringFlag(event, "ActiveFlag");
    },

    onCanViewSelect: function (event) {
      this.setStringFlag(event, "CanView");
    },

    onCanCreateSelect: function (event) {
      this.setStringFlag(event, "CanCreate");
    },

    onCanUpdateSelect: function (event) {
      this.setStringFlag(event, "CanUpdate");
    },

    onCanDeleteSelect: function (event) {
      this.setStringFlag(event, "CanDelete");
    },

    onCanUploadSelect: function (event) {
      this.setStringFlag(event, "CanUpload");
    }
  });
});
