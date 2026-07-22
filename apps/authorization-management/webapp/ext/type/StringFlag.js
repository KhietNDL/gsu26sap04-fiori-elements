sap.ui.define(["sap/ui/model/SimpleType"], function (SimpleType) {
  "use strict";

  return SimpleType.extend("ztbl.authorization.ui.ext.type.StringFlag", {
    formatValue: function (value) {
      return String(value || "").toUpperCase() === "X";
    },

    parseValue: function (value) {
      return value ? "X" : "";
    },

    validateValue: function () {}
  });
});
