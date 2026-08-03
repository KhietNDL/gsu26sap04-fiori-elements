sap.ui.define([], function () {
  "use strict";

  function isActive(value) {
    var normalized = String(value || "").trim().toUpperCase();
    return normalized === "X" || normalized === "YES" || normalized === "ACTIVE" || normalized === "TRUE" || normalized === "1";
  }

  return {
    flagText: function (value) {
      return isActive(value) ? "Enabled" : "Disabled";
    },

    flagState: function (value) {
      return isActive(value) ? "Success" : "Error";
    },

    flagErrorState: function (value) {
      return isActive(value) ? "Success" : "Error";
    },

    flagTooltip: function (value) {
      return isActive(value) ? "Permission is enabled." : "Permission is disabled.";
    },

    flagSelected: function (value) {
      return isActive(value);
    },

    activeText: function (value) {
      return isActive(value) ? "Active" : "Inactive";
    },

    activeState: function (value) {
      return isActive(value) ? "Success" : "Error";
    },

    activeSelected: function (value) {
      return isActive(value);
    },

    activeTooltip: function (value) {
      return isActive(value) ? "User is active." : "User is inactive.";
    },

    updateTooltip: function (canUpdate) {
      return canUpdate ? "" : "You do not have permission to update this record.";
    }
  };
});
