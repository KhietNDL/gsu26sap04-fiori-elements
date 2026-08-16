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

  /**
   * Maps the displayed Operation to the raw AuditLog properties.
   * Bulk is a derived operation: the backend stores the concrete ActionType
   * while RecordKey marks the parent summary as BULK.
   */
  function getFilter(value) {
    var operation = String(value || "").trim().toUpperCase();

    if (!operation) {
      return undefined;
    }

    if (operation === "B" || operation === "BULK") {
      return andFilter([
        fieldFilter("RecordKey", FilterOperator.EQ, "BULK"),
        fieldFilter("ActionType", FilterOperator.NE, "R"),
        fieldFilter("ActionType", FilterOperator.NE, "ROLLBACK"),
        fieldFilter("ActionType", FilterOperator.NE, "R BULK")
      ]);
    }

    if (operation === "R" || operation === "ROLLBACK") {
      return fieldFilter("ActionType", FilterOperator.EQ, "R");
    }

    if (operation === "C" || operation === "U" || operation === "D") {
      return andFilter([
        fieldFilter("ActionType", FilterOperator.EQ, operation),
        fieldFilter("RecordKey", FilterOperator.NE, "BULK")
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
