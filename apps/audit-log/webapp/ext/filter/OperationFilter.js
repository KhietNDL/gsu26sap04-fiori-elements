sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator"
], function (Filter, FilterOperator) {
  "use strict";

  function fieldFilter(path, operator, value) {
    return new Filter({
      path: path,
      operator: operator,
      value1: value
    });
  }

  function andFilter(filters) {
    return new Filter({
      filters: filters,
      and: true
    });
  }

  function activeAuditFilter() {
    return fieldFilter("RollbackAuditId", FilterOperator.EQ, "");
  }

  function bulkMarkerFilter() {
    return fieldFilter("RecordKey", FilterOperator.EQ, "BULK");
  }

  /**
   * Maps the displayed Operation to the raw AuditLog properties.
   * Bulk is a derived operation: the backend stores the concrete ActionType
   * while RecordKey marks the parent summary as BULK.
   */
  function getFilter(value) {
    var operation = String(value || "").trim().toUpperCase();

    if (!operation) {
      // Keep the generated rollback audit as backend history, but present the
      // original audit as the single user-facing record.
      return fieldFilter("ActionType", FilterOperator.NE, "R");
    }

    if (operation === "B" || operation === "BULK") {
      return andFilter([
        bulkMarkerFilter(),
        fieldFilter("ActionType", FilterOperator.NE, "R"),
        fieldFilter("ActionType", FilterOperator.NE, "ROLLBACK"),
        fieldFilter("ActionType", FilterOperator.NE, "R BULK"),
        activeAuditFilter()
      ]);
    }

    if (operation === "R" || operation === "ROLLBACK") {
      return fieldFilter("RollbackAuditId", FilterOperator.NE, "");
    }

    if (operation === "C" || operation === "U" || operation === "D") {
      return andFilter([
        fieldFilter("ActionType", FilterOperator.EQ, operation),
        fieldFilter("RecordKey", FilterOperator.NE, "BULK"),
        activeAuditFilter()
      ]);
    }

    return fieldFilter("ActionType", FilterOperator.EQ, operation);
  }

  return {
    getFilter: getFilter,
    _test: {
      getFilter: getFilter
    }
  };
});
