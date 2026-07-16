sap.ui.define([], function () {
  "use strict";

  function formatScalar(value) {
    if (value === null || value === undefined || value === "") {
      return "-";
    }

    return String(value);
  }

  function flattenValue(value, prefix, lines) {
    if (Array.isArray(value)) {
      if (!value.length) {
        lines.push(prefix + ": -");
        return;
      }

      value.forEach(function (item, index) {
        flattenValue(item, prefix + "[" + (index + 1) + "]", lines);
      });
      return;
    }

    if (value && typeof value === "object") {
      Object.keys(value).forEach(function (key) {
        flattenValue(value[key], prefix ? prefix + "." + key : key, lines);
      });
      return;
    }

    lines.push(prefix + ": " + formatScalar(value));
  }

  var formatter = {
    formatJson: function (rawValue) {
      if (!rawValue) {
        return "-";
      }

      try {
        var parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
        var lines = [];
        flattenValue(parsed, "", lines);
        return lines.join("\n") || "-";
      } catch (error) {
        return String(rawValue);
      }
    }
  };

  if (typeof window !== "undefined") {
    window.ZTblFormatter = formatter;
  }

  return formatter;
});
