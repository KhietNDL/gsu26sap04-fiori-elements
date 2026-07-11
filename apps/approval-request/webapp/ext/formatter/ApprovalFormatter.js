sap.ui.define([], function () {
  "use strict";

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function titleCase(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/(^|[\s_-])([a-z])/g, function (match, separator, char) {
        return separator + char.toUpperCase();
      });
  }

  function normalizeAction(value) {
    var action = String(value || "").trim().toUpperCase();

    if (action === "C" || action === "CREATE" || action === "01") {
      return "Create";
    }

    if (action === "U" || action === "UPDATE" || action === "02") {
      return "Update";
    }

    if (action === "D" || action === "DELETE" || action === "03") {
      return "Delete";
    }

    return value ? titleCase(value) : "-";
  }

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
    UNIT: "Unit"
  };

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

  function mapFieldLabel(key) {
    var normalizedKey = String(key || "").toUpperCase();

    return FIELD_LABELS[normalizedKey] || titleCase(normalizedKey.replace(/_/g, " "));
  }

  function mapFieldValue(key, value) {
    var normalizedKey = String(key || "").toUpperCase();
    var normalizedValue = String(value === null || value === undefined ? "" : value).trim().toUpperCase();

    if (value === null || value === undefined || value === "") {
      return "";
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

    if (Array.isArray(value)) {
      return value.join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function isTechnicalField(key) {
    var parts = String(key || "").toUpperCase().split(".");
    return TECHNICAL_FIELDS[parts[parts.length - 1]];
  }

  function flattenObject(object, prefix, result) {
    Object.keys(object || {}).forEach(function (key) {
      var value = object[key];
      var name = prefix ? prefix + "." + key : key;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        flattenObject(value, name, result);
        return;
      }

      result[name] = value;
    });
  }

  function getBusinessMap(rawJson) {
    var parsed = parseJsonObject(rawJson);
    var flat = {};
    var result = {};

    flattenObject(parsed || {}, "", flat);

    Object.keys(flat).forEach(function (key) {
      var value = mapFieldValue(key, flat[key]);

      if (!isTechnicalField(key) && value !== "") {
        result[mapFieldLabel(key)] = value;
      }
    });

    return result;
  }

  function formatRecordKeyFallback(rawRecordKey) {
    var parsed;
    var flat = {};
    var lines = [];

    if (rawRecordKey === "BULK") {
      return "BULK";
    }

    parsed = parseJsonObject(rawRecordKey);
    flattenObject(parsed || {}, "", flat);

    Object.keys(flat).forEach(function (key) {
      var value = mapFieldValue(key, flat[key]);

      if (value !== "") {
        lines.push(mapFieldLabel(key) + ": " + value);
      }
    });

    return lines.join("\n") || "-";
  }

  function getPrimaryRecordText(rawRecordKey) {
    var text = formatRecordKeyFallback(rawRecordKey);

    return text.split(/\r?\n/)[0].replace(/:\s*/, " ") || "Record";
  }

  function splitPresentationLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function parsePresentationMap(value) {
    var map = {};

    splitPresentationLines(value).forEach(function (line) {
      var separatorIndex = line.indexOf(":");
      var label;
      var text;

      if (separatorIndex < 0) {
        return;
      }

      label = line.slice(0, separatorIndex).trim();
      text = line.slice(separatorIndex + 1).trim();

      if (label) {
        map[label] = text;
      }
    });

    return map;
  }

  function splitChangedFields(value) {
    return String(value || "")
      .split(",")
      .map(function (field) {
        return field.trim();
      })
      .filter(Boolean);
  }

  function getFieldsForAction(action, oldDataText, newDataText, changedFieldsText) {
    var oldMap = parsePresentationMap(oldDataText);
    var newMap = parsePresentationMap(newDataText);
    var fields = splitChangedFields(changedFieldsText);
    var seen = {};

    if (changedFieldsText === "Deleted record") {
      fields = [];
    }

    if (!fields.length) {
      Object.keys(action === "Delete" ? oldMap : newMap).forEach(function (field) {
        fields.push(field);
      });
    }

    return fields.filter(function (field) {
      if (seen[field]) {
        return false;
      }

      seen[field] = true;
      return Object.prototype.hasOwnProperty.call(oldMap, field) || Object.prototype.hasOwnProperty.call(newMap, field);
    });
  }

  function renderCell(value, extraClass) {
    return "<div class=\"approvalChangeCell" + (extraClass ? " " + extraClass : "") + "\">" + escapeHtml(value || "-") + "</div>";
  }

  function buildChangedFieldsFallback(actionText, oldDataRaw, newDataRaw) {
    var action = normalizeAction(actionText);
    var oldMap = getBusinessMap(oldDataRaw);
    var newMap = getBusinessMap(newDataRaw);
    var fields = [];

    if (action === "Delete") {
      return "Deleted record";
    }

    Object.keys(action === "Create" ? newMap : Object.assign({}, oldMap, newMap)).forEach(function (field) {
      if (action === "Create" || oldMap[field] !== newMap[field]) {
        fields.push(field);
      }
    });

    return fields.join(", ");
  }

  function buildSummaryFallback(actionText, recordKeyRaw, oldDataRaw, newDataRaw) {
    var action = normalizeAction(actionText);
    var oldMap = getBusinessMap(oldDataRaw);
    var newMap = getBusinessMap(newDataRaw);
    var changedFields = [];
    var preferredCreateFields = ["Product Category", "Description", "Entity ID", "Item ID", "Material Group"];
    var createField;

    if (action === "Delete") {
      return getPrimaryRecordText(recordKeyRaw) + " deleted";
    }

    if (action === "Create") {
      createField = preferredCreateFields.filter(function (field) {
        return newMap[field];
      })[0] || Object.keys(newMap)[0];

      return createField ? createField + " " + newMap[createField] : "Record created";
    }

    Object.keys(Object.assign({}, oldMap, newMap)).forEach(function (field) {
      if (oldMap[field] !== newMap[field]) {
        changedFields.push(field);
      }
    });

    return changedFields.length ? changedFields.join(", ") + " changed" : "-";
  }

  function mapToPresentationText(map) {
    return Object.keys(map).map(function (field) {
      return field + ": " + map[field];
    }).join("\n");
  }

  function formatRawJsonValue(value) {
    if (value === null) {
      return "null";
    }

    if (value === undefined) {
      return "";
    }

    if (value === "") {
      return "\"\"";
    }

    if (Array.isArray(value)) {
      return value.map(formatRawJsonValue).join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function getRawJsonPairs(rawJson) {
    var parsed = parseJsonObject(rawJson);
    var flat = {};

    if (!parsed) {
      return [];
    }

    flattenObject(parsed, "", flat);

    return Object.keys(flat).map(function (key) {
      return {
        key: key,
        value: formatRawJsonValue(flat[key])
      };
    });
  }

  function formatJsonTreeText(rawJson) {
    var pairs = getRawJsonPairs(rawJson);

    if (!rawJson) {
      return "";
    }

    if (!pairs.length) {
      return String(rawJson);
    }

    return ["object {" + pairs.length + "}"].concat(pairs.map(function (pair) {
      return "  " + pair.key + " : " + pair.value;
    })).join("\n");
  }

  function renderJsonTreeBlock(title, rawJson, emptyText) {
    var pairs = getRawJsonPairs(rawJson);

    if (!pairs.length) {
      return [
        "<div class=\"approvalParsedBlock\">",
        "<div class=\"approvalParsedTitle\">", escapeHtml(title), "</div>",
        "<div class=\"approvalEmptyValue\">", escapeHtml(emptyText || "No data available"), "</div>",
        "</div>"
      ].join("");
    }

    return [
      "<div class=\"approvalParsedBlock\">",
      "<div class=\"approvalParsedTitle\">", escapeHtml(title), "</div>",
      "<div class=\"approvalParsedMeta\">object {", pairs.length, "}</div>",
      "<div class=\"approvalParsedTree\">",
      pairs.map(function (pair) {
        return [
          "<div class=\"approvalParsedKey\">", escapeHtml(pair.key), "</div>",
          "<div class=\"approvalParsedSep\">:</div>",
          "<div class=\"approvalParsedValue\">", escapeHtml(pair.value), "</div>"
        ].join("");
      }).join(""),
      "</div>",
      "</div>"
    ].join("");
  }

  function renderChangeDetails(actionText, oldDataText, newDataText, changedFieldsText, changeSummary, rawActionType, rawRecordKey, rawOldData, rawNewData) {
    if (arguments.length === 4) {
      rawActionType = actionText;
      rawRecordKey = oldDataText;
      rawOldData = newDataText;
      rawNewData = changedFieldsText;
      oldDataText = "";
      newDataText = "";
      changedFieldsText = "";
      changeSummary = "";
    }

    var action = normalizeAction(actionText || rawActionType);
    var effectiveOldDataText = oldDataText || mapToPresentationText(getBusinessMap(rawOldData));
    var effectiveNewDataText = newDataText || mapToPresentationText(getBusinessMap(rawNewData));
    var effectiveChangedFields = changedFieldsText || buildChangedFieldsFallback(action, rawOldData, rawNewData);
    var effectiveSummary = changeSummary || buildSummaryFallback(action, rawRecordKey, rawOldData, rawNewData);
    var oldMap = parsePresentationMap(effectiveOldDataText);
    var newMap = parsePresentationMap(effectiveNewDataText);
    var fields = getFieldsForAction(action, effectiveOldDataText, effectiveNewDataText, effectiveChangedFields);
    var columns = action === "Update" ? 3 : 2;
    var oldHeader = action === "Delete" ? "Previous Value" : "Old Value";

    if (!fields.length) {
      return "<div class=\"approvalEmptyValue\">" + escapeHtml(effectiveSummary || "No business field changes available") + "</div>";
    }

    return [
      "<div class=\"approvalChangeTable approvalChangeTable--cols", columns, "\">",
      "<div class=\"approvalChangeHeader\">Field</div>",
      "<div class=\"approvalChangeHeader\">", action === "Create" ? "New Value" : oldHeader, "</div>",
      action === "Update" ? "<div class=\"approvalChangeHeader\">New Value</div>" : "",
      fields.map(function (field) {
        return [
          renderCell(field, "approvalChangeField approvalChanged"),
          renderCell(action === "Create" ? newMap[field] : oldMap[field], action === "Update" || action === "Delete" ? "approvalChanged" : ""),
          action === "Update" ? renderCell(newMap[field], "approvalChanged") : ""
        ].join("");
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderReadableDetail(actionType, recordKey, oldData, newData) {
    var action = normalizeAction(actionType);
    var parsedBlocks;

    if (action === "Create") {
      parsedBlocks = [
        renderJsonTreeBlock("Record Key", recordKey, "No record key available"),
        renderJsonTreeBlock("New Data", newData, "No new data available")
      ].join("");
    } else if (action === "Delete") {
      parsedBlocks = [
        renderJsonTreeBlock("Record Key", recordKey, "No record key available"),
        renderJsonTreeBlock("Previous Data", oldData, "No previous data available")
      ].join("");
    } else {
      parsedBlocks = [
        renderJsonTreeBlock("Record Key", recordKey, "No record key available"),
        renderJsonTreeBlock("Old Data", oldData, "No old data available"),
        renderJsonTreeBlock("New Data", newData, "No new data available")
      ].join("");
    }

    return [
      "<div class=\"approvalReadableDetail\">",
      "<div class=\"approvalDetailHeadline\">",
      "<span class=\"approvalDetailAction approvalDetailAction--", escapeHtml(action.toLowerCase()), "\">", escapeHtml(action), "</span>",
      "<span>", escapeHtml(buildSummaryFallback(action, recordKey, oldData, newData)), "</span>",
      "</div>",
      renderChangeDetails(action, recordKey, oldData, newData),
      "<div class=\"approvalParsedGrid\">", parsedBlocks, "</div>",
      "</div>"
    ].join("");
  }

  function renderPresentationText(value) {
    var lines = splitPresentationLines(value);

    if (!lines.length) {
      return "<div class=\"approvalEmptyValue\">-</div>";
    }

    return "<div class=\"approvalKeyValueGrid\">" + lines.map(function (line) {
      var separatorIndex = line.indexOf(":");
      var label = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : "";
      var text = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : line;

      return [
        "<div class=\"approvalKeyValueLabel\">", escapeHtml(label || "-"), "</div>",
        "<div class=\"approvalKeyValueValue\">", escapeHtml(text), "</div>"
      ].join("");
    }).join("") + "</div>";
  }

  function renderTechnicalBlock(label, value) {
    return [
      "<div class=\"approvalTechnicalBlock\">",
      "<div class=\"approvalTechnicalLabel\">", escapeHtml(label), "</div>",
      "<pre class=\"approvalTechnicalPre\">", escapeHtml(value || "No data returned for this field"), "</pre>",
      "</div>"
    ].join("");
  }

  return {
    formatActionText: function (presentationValue, rawValue) {
      if (arguments.length === 1) {
        return normalizeAction(presentationValue);
      }

      return presentationValue || normalizeAction(rawValue);
    },

    formatActionState: function (value) {
      var action = normalizeAction(value);

      if (action === "Create") {
        return "Success";
      }

      if (action === "Delete") {
        return "Error";
      }

      return "Information";
    },

    formatStatusText: function (value) {
      return titleCase(value || "-");
    },

    formatStatusState: function (value) {
      var status = String(value || "").trim().toUpperCase();

      if (status === "APPROVED" || status === "A") {
        return "Success";
      }

      if (status === "REJECTED" || status === "R" || status === "ERROR" || status === "E") {
        return "Error";
      }

      return "Warning";
    },

    formatPresentationTextAsKeyValueHtml: renderPresentationText,

    formatJsonAsTreeText: formatJsonTreeText,

    formatRecordKeyText: function (presentationValue, rawValue) {
      if (arguments.length === 1) {
        return formatRecordKeyFallback(presentationValue);
      }

      return presentationValue || formatRecordKeyFallback(rawValue);
    },

    formatChangedFieldsText: function (presentationValue, rawActionType, rawOldData, rawNewData) {
      if (arguments.length === 3) {
        return buildChangedFieldsFallback(presentationValue, rawActionType, rawOldData) || "-";
      }

      return presentationValue || buildChangedFieldsFallback(rawActionType, rawOldData, rawNewData) || "-";
    },

    formatSummaryText: function (presentationValue, rawActionType, rawRecordKey, rawOldData, rawNewData) {
      if (arguments.length === 4) {
        return buildSummaryFallback(presentationValue, rawActionType, rawRecordKey, rawOldData);
      }

      return presentationValue || buildSummaryFallback(rawActionType, rawRecordKey, rawOldData, rawNewData);
    },

    formatChangeDetailsAsHtml: renderChangeDetails,

    formatReadableDetailAsHtml: renderReadableDetail,

    formatTechnicalDetailsAsHtml: function (recordKey, oldData, newData) {
      return [
        renderTechnicalBlock("RecordKey JSON", recordKey),
        renderTechnicalBlock("OldData JSON", oldData),
        renderTechnicalBlock("NewData JSON", newData)
      ].join("");
    }
  };
});
