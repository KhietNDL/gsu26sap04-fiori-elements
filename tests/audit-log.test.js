const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadAuditFormatter() {
  const formatterPath = path.join(
    __dirname,
    "..",
    "apps",
    "audit-log",
    "webapp",
    "ext",
    "formatter",
    "AuditFormatter.js"
  );
  const source = fs.readFileSync(formatterPath, "utf8");
  let moduleResult;

  const sandbox = {
    sap: {
      ui: {
        define: function (_dependencies, factory) {
          moduleResult = factory();
        }
      }
    }
  };

  vm.runInNewContext(source, sandbox, { filename: formatterPath });
  return moduleResult;
}

function loadAuditController(formatter) {
  const controllerPath = path.join(
    __dirname,
    "..",
    "apps",
    "audit-log",
    "webapp",
    "ext",
    "controller",
    "AuditLog.controller.js"
  );
  const source = fs.readFileSync(controllerPath, "utf8");
  let moduleResult;

  const sandbox = {
    sap: {
      ui: {
        define: function (_dependencies, factory) {
          const ControllerExtension = {
            extend: function (_name, definition) {
              return definition;
            }
          };
          function JSONModel(initialData) {
            this.data = initialData || {};
          }
          JSONModel.prototype.setData = function (data) {
            this.data = data;
          };
          JSONModel.prototype.setProperty = function (name, value) {
            this.data[name.replace(/^\//, "")] = value;
          };
          JSONModel.prototype.getProperty = function (name) {
            return this.data[name.replace(/^\//, "")];
          };

          moduleResult = factory(ControllerExtension, JSONModel, formatter);
        }
      }
    },
    Promise: Promise
  };

  vm.runInNewContext(source, sandbox, { filename: controllerPath });
  return moduleResult;
}

function assertJsonEqual(value, expected, message) {
  assert.strictEqual(JSON.stringify(value), JSON.stringify(expected), message);
}

const formatter = loadAuditFormatter();
const controller = loadAuditController(formatter);
const api = formatter._test;
const controllerApi = controller._test;

assert(api, "formatter exposes test helpers");
assert(controllerApi, "controller exposes test helpers");

assert.strictEqual(api.formatActionText("C"), "Create", "C maps to Create");
assert.strictEqual(api.formatActionText("U"), "Update", "U maps to Update");
assert.strictEqual(api.formatActionText("D"), "Delete", "D maps to Delete");
assert.strictEqual(api.formatActionText("R"), "Rollback", "R maps to Rollback");
assert.strictEqual(api.formatActionText("X"), "X", "unknown ActionType falls back readably");
assert.strictEqual(api.formatActionState("C"), "Success", "Create semantic state");
assert.strictEqual(api.formatActionState("U"), "Information", "Update semantic state");
assert.strictEqual(api.formatActionState("D"), "Error", "Delete semantic state");
assert.strictEqual(api.formatActionState("R"), "Warning", "Rollback semantic state");

assert.strictEqual(api.formatAuditValue(""), "—", "empty string becomes dash");
assert.strictEqual(api.formatAuditValue("   "), "—", "whitespace string becomes dash");
assert.strictEqual(api.formatAuditValue(null), "—", "null becomes dash");
assert.strictEqual(api.formatAuditValue(0), "0", "numeric zero remains 0");
assert.strictEqual(api.formatAuditValue(false), "No", "boolean false remains readable");
assert.strictEqual(api.formatAuditValue("0"), "0", "string zero remains visible");
assert.strictEqual(api.formatAuditValue("false"), "No", "string false remains visible");
assert.strictEqual(api.formatAuditValue({ A: 1 }), "{\"A\":1}", "nested object does not become object Object");

const longValue = "A".repeat(300);
assert.strictEqual(api.formatAuditValue(longValue), longValue, "long values are preserved for wrapping by UI");

assert.strictEqual(api.formatRecordKeyText("{\"SCHEDULE_ID\":\"SCH010\",\"ITEM_NO\":1}"), "Schedule Id: SCH010, Item No: 1", "valid JSON RecordKey becomes key/value text");
assertJsonEqual(api.getRecordKeyRows("{\"SCHEDULE_ID\":\"SCH010\"}"), [
  { key: "SCHEDULE_ID", field: "Schedule Id", value: "SCH010" }
], "valid JSON RecordKey produces parsed rows");
assertJsonEqual(api.getRecordKeyRows("{bad"), [
  { key: "RecordKey", field: "Record Key", value: "{bad" }
], "invalid RecordKey safely falls back");

const createDetail = controllerApi.buildAuditDetail({
  AuditId: "A1",
  TableName: "Z251_SCHEDULE",
  RecordKey: "{\"SCHEDULE_ID\":\"SCH010\"}",
  FieldName: "ROOM",
  OldValue: "",
  NewValue: "B",
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "C",
  __OperationControl: { rollback: true }
});
assert.strictEqual(createDetail.changeTitle, "Created Value", "create audit uses Created Value title");
assert.strictEqual(createDetail.showOldColumn, false, "create hides empty before column");
assert.strictEqual(createDetail.showNewColumn, true, "create shows new value");
assert.strictEqual(createDetail.changeRows[0].newValue, "B", "create shows NewValue");
assert.strictEqual(createDetail.rollbackText, "Rollback available", "rollback available is displayed");
assert.strictEqual(createDetail.rollbackState, "Success", "rollback available state");

const updateDetail = controllerApi.buildAuditDetail({
  AuditId: "A2",
  TableName: "Z251_SCHEDULE",
  RecordKey: "SCHEDULE_ID=SCH010",
  FieldName: "ROOM",
  OldValue: "A",
  NewValue: "B",
  ChangedBy: "DEV-253",
  ChangedAt: "",
  ActionType: "U",
  __OperationControl: { rollback: false }
});
assert.strictEqual(updateDetail.changeTitle, "Value Change", "update audit uses Value Change title");
assert.strictEqual(updateDetail.showOldColumn, true, "update shows before");
assert.strictEqual(updateDetail.showNewColumn, true, "update shows after");
assert.strictEqual(updateDetail.changeRows[0].oldValue, "A", "update shows OldValue");
assert.strictEqual(updateDetail.changeRows[0].newValue, "B", "update shows NewValue");
assert.strictEqual(updateDetail.infoRows[6].value, "—", "missing ChangedAt stays usable");
assert.strictEqual(updateDetail.rollbackText, "Rollback not available", "rollback unavailable is displayed");

const deleteDetail = controllerApi.buildAuditDetail({
  AuditId: "A3",
  TableName: "Z251_SCHEDULE",
  RecordKey: "{\"SCHEDULE_ID\":\"SCH010\"}",
  FieldName: "ROOM",
  OldValue: "A",
  NewValue: "",
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "D",
  __OperationControl: {}
});
assert.strictEqual(deleteDetail.changeTitle, "Deleted Value", "delete audit uses Deleted Value title");
assert.strictEqual(deleteDetail.showOldColumn, true, "delete shows previous value");
assert.strictEqual(deleteDetail.showNewColumn, false, "delete hides empty after column");
assert.strictEqual(deleteDetail.oldColumnHeader, "Previous Value", "delete old column is Previous Value");
assert.strictEqual(deleteDetail.changeRows[0].oldValue, "A", "delete shows OldValue");
assert.strictEqual(deleteDetail.changeRows[0].newValue, "—", "delete empty NewValue is represented as dash in model");

const rollbackDetail = controllerApi.buildAuditDetail({
  AuditId: "A4",
  TableName: "Z251_SCHEDULE",
  RecordKey: "{}",
  FieldName: "ROOM",
  OldValue: "B",
  NewValue: "A",
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "R",
  __OperationControl: { rollback: false }
});
assert.strictEqual(rollbackDetail.changeTitle, "Rollback Change", "rollback audit uses Rollback Change title when runtime data has R");
assert.strictEqual(rollbackDetail.showOldColumn, true, "rollback shows before");
assert.strictEqual(rollbackDetail.showNewColumn, true, "rollback shows after");

const plainStringDetail = controllerApi.buildAuditDetail({
  AuditId: "A5",
  TableName: "Z251_SCHEDULE",
  RecordKey: "{\"SCHEDULE_ID\":\"SCH010\"}",
  FieldName: "ROOM",
  OldValue: "A101",
  NewValue: "A102",
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "U"
});
assertJsonEqual(plainStringDetail.changeRows, [{
  field: "Room",
  oldValue: "A101",
  newValue: "A102"
}], "plain field-level values render directly");

const jsonValueDetail = controllerApi.buildAuditDetail({
  AuditId: "A6",
  TableName: "Z251_SCHEDULE",
  RecordKey: "{\"SCHEDULE_ID\":\"SCH010\"}",
  FieldName: "SNAPSHOT",
  OldValue: "{\"ROOM\":\"A101\",\"SEATS\":0,\"ACTIVE\":false}",
  NewValue: "{\"ROOM\":\"A102\",\"SEATS\":0,\"ACTIVE\":true}",
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "U"
});
assertJsonEqual(jsonValueDetail.changeRows, [
  { field: "Room", oldValue: "A101", newValue: "A102" },
  { field: "Seats", oldValue: "0", newValue: "0" },
  { field: "Active", oldValue: "No", newValue: "Yes" }
], "JSON OldValue/NewValue are parsed into readable rows");

const zeroFalseDetail = controllerApi.buildAuditDetail({
  AuditId: "A7",
  TableName: "Z251_SCHEDULE",
  RecordKey: "{\"SCHEDULE_ID\":\"SCH010\"}",
  FieldName: "ACTIVE",
  OldValue: false,
  NewValue: 0,
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "U"
});
assert.strictEqual(zeroFalseDetail.changeRows[0].oldValue, "No", "boolean false OldValue remains visible");
assert.strictEqual(zeroFalseDetail.changeRows[0].newValue, "0", "numeric zero NewValue remains visible");

const annotationPath = path.join(__dirname, "..", "apps", "audit-log", "webapp", "annotations", "audit-log.xml");
const annotationXml = fs.readFileSync(annotationPath, "utf8");
const manifestPath = path.join(__dirname, "..", "apps", "audit-log", "webapp", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const columns = manifest["sap.ui5"].routing.targets.AuditLogList.options.settings.controlConfiguration["@com.sap.vocabularies.UI.v1.LineItem"].columns;
assert(columns.OldValueColumn, "List Report exposes Old Value column");
assert(columns.NewValueColumn, "List Report exposes New Value column");
assert.strictEqual((annotationXml.match(/DataFieldForAction/g) || []).length, 0, "local annotation does not create duplicate Rollback action");
assert.strictEqual((annotationXml.match(/rollback/g) || []).length, 0, "local annotation does not duplicate rollback button");

console.log("audit-log tests passed");
