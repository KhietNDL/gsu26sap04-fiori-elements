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

          moduleResult = factory(ControllerExtension, {
            load: function () {
              return Promise.resolve({});
            }
          }, JSONModel, {
            Action: {
              CANCEL: "Cancel"
            },
            confirm: function () {},
            error: function () {}
          }, {
            show: function () {}
          }, formatter, {
            attachGlobalHandlers: function () {}
          }, function Filter() {
            return {};
          }, {
            EQ: "EQ"
          });
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
assert.strictEqual(api.formatActionState("BULK"), "None", "bulk uses neutral gray state");
assert.strictEqual(api.formatOperationText("C", "ENTITY_ID=0001"), "Create", "operation hides normal record key");
assert.strictEqual(api.formatOperationText("D", "{\"ENTITY_ID\":\"\"}"), "Delete", "operation hides JSON record key");
assert.strictEqual(api.formatOperationText("U BULK", "BULK", "", "Bulk audit: 000001 item(s)"), "Update", "1-item bulk displays specific action Update");
assert.strictEqual(api.formatOperationText("C BULK", "BULK", "", "Bulk audit: 000001 item(s)"), "Create", "1-item bulk displays specific action Create");
assert.strictEqual(api.formatOperationText("R BULK", "BULK", "", "Bulk audit: 000001 item(s)"), "Rollback", "1-item bulk displays specific action Rollback");
assert.strictEqual(api.formatOperationText("R", "ENTITY_ID=0001"), "Rollback", "R ActionType displays Rollback");
assert.strictEqual(api.formatOperationText("U BULK", "BULK"), "Bulk", "list bulk operation does not need raw OldValue/NewValue fields");
assert.strictEqual(api.formatOperationText("U BULK", "BULK", "", "Bulk audit: 000005 item(s)"), "Bulk", "multi-item bulk operation displays Bulk");
assert.strictEqual(api.formatOperationText("C,U", "ENTITY_ID=0001"), "Bulk", "multiple actions are bulk");
assert.strictEqual(api.formatOperationText("C", "ENTITY_ID=0001", "", "Bulk audit: 2 items"), "Bulk", "bulk summary is compact");
assert.strictEqual(api.formatOperationText("C", "ENTITY_ID=0001", "", "Description: 2 items"), "Create", "normal business text does not become bulk");
assert.strictEqual(api.formatOperationState("C", "ENTITY_ID=0001"), "Success", "operation uses semantic state");

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

assert.strictEqual(api.formatRecordKeyText("{\"SCHEDULE_ID\":\"SCH010\",\"ITEM_NO\":1}"), "Schedule Id: SCH010\nItem No: 1", "valid JSON RecordKey becomes multiline key/value text");
assert.strictEqual(api.formatRecordKeyText("ENTITY_ID=ABC123 | ITEM_ID=ITEM9"), "Entity Id: ABC123\nItem Id: ITEM9", "legacy equals RecordKey becomes multiline key/value text");
assert.strictEqual(api.formatRecordKeyText("ENTITY_ID=ABC123"), "ABC123", "single-field RecordKey displays only the value");
assert.strictEqual(api.formatCleanRecordKey("ENTITY_ID=ABC123"), "ABC123", "single-field list RecordKey displays only the value");
assertJsonEqual(api.getRecordKeyRows("{\"SCHEDULE_ID\":\"SCH010\"}"), [
  { key: "SCHEDULE_ID", field: "Schedule Id", value: "SCH010" }
], "valid JSON RecordKey produces parsed rows");
assertJsonEqual(api.getRecordKeyRows("{bad"), [
  { key: "RecordKey", field: "Record Key", value: "{bad" }
], "invalid RecordKey safely falls back");
assertJsonEqual(api.getRecordKeyRows("ENTITY_ID=00000000000000000001"), [
  { key: "ENTITY_ID", field: "Entity Id", value: "00000000000000000001" }
], "legacy RecordKey preserves leading zeroes as a string");
assertJsonEqual(api.getRecordKeyRows("COMPANY_CODE=1000|DOCUMENT_ID=000012345678901234567890"), [
  { key: "COMPANY_CODE", field: "Company Code", value: "1000" },
  { key: "DOCUMENT_ID", field: "Document Id", value: "000012345678901234567890" }
], "composite RecordKey preserves every component as a string");
assertJsonEqual(api.getRecordKeyRows('{"DOCUMENT_ID":123456789012345678901234567890}'), [
  { key: "DOCUMENT_ID", field: "Document Id", value: "123456789012345678901234567890" }
], "long JSON numeric RecordKey is preserved without Number precision loss");
assertJsonEqual(api.getRecordKeyRows('{"DOCUMENT_ID":"000012345678901234567890"}'), [
  { key: "DOCUMENT_ID", field: "Document Id", value: "000012345678901234567890" }
], "quoted JSON RecordKey preserves leading zeroes");
assertJsonEqual(api.getRecordKeyRows("{\"ID\":\"1\",\"MANDT\":\"324\",\"SNAPSHOT\":{\"A\":1},\"BATCH\":\"B1\"}"), [
  { key: "ID", field: "Id", value: "1" }
], "technical bulk fields are hidden from parsed record key rows");
assertJsonEqual(api.getValueRows("ROOM: A101 | CLIENT: 324 | ROOM_TYPE: LAB"), [
  { key: "ROOM", field: "Room", value: "A101" },
  { key: "ROOM_TYPE", field: "Room Type", value: "LAB" }
], "legacy FIELD: value audit text is parsed and technical fields are ignored");
assertJsonEqual(api.getValueRows("2026-08-11T09:10:00Z"), [], "ISO timestamp system values are not parsed as legacy key/value maps");
assertJsonEqual(api.buildChangeRows({
  FieldName: "CHANGED_AT",
  OldValue: "2026-08-11T09:10:00Z",
  NewValue: "2026-08-11T09:11:00Z",
  ActionType: "U"
}), [{
  field: "Changed At",
  oldValue: "2026-08-11T09:10:00Z",
  newValue: "2026-08-11T09:11:00Z"
}], "system audit timestamp fields render as plain values instead of JSON-like rows");
assert.strictEqual(api.getBulkCountText("", "Bulk audit: 3"), "3 item(s)", "bulk count extracts Bulk audit count");
assert.strictEqual(api.getBulkCountText("1 item(s)", ""), "1 item(s)", "bulk count extracts item count");
assert.strictEqual(api.getBulkCountText("x", "y"), "Bulk CRUD Operation", "bulk count falls back safely");
assert.strictEqual(api.formatBulkButtonText("", "Bulk audit: 2"), "Bulk (2)", "bulk button shows a compact count");
assert.strictEqual(api.formatBulkButtonText("x", "y"), "Bulk", "bulk button falls back compactly");
assert.strictEqual(api.formatBulkRecordKeyText("BULK", "", "Bulk audit: 2"), "BULK · 2 item(s)", "bulk list row summarizes count");
assert.strictEqual(api.formatRowActionText("U", "BULK"), "Bulk Update", "bulk row is explicit in the list");
assert.strictEqual(api.getBulkActionText("U", [{ ActionType: "C" }, { ActionType: "D" }]), "Bulk", "mixed bulk child actions show generic bulk badge");
assert.strictEqual(api.isRollbackAvailable({ Rollback: true }), true, "rollback operation control accepts backend casing");

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
assert.strictEqual(createDetail.changeColumns[1].label, "Room", "create detail uses field names as horizontal columns");
assert.strictEqual(createDetail.changeTableRows[0].cells[0].value, "New Value", "create detail uses one horizontal value row");
assert.strictEqual(createDetail.changeTableRows[0].cells[1].value, "B", "create detail places NewValue in the field column");
assert.strictEqual(Object.prototype.hasOwnProperty.call(createDetail, "changeTableHtml"), false, "detail model does not generate hand-written HTML tables");
assert.strictEqual(createDetail.rollbackText, "Rollback available", "rollback available is displayed");
assert.strictEqual(createDetail.rollbackState, "Success", "rollback available state");
assert.strictEqual(createDetail.statusText, "Review required", "non-rolled-back audit detail displays review status");
assert.strictEqual(createDetail.statusState, "Warning", "review status uses warning semantics");

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
assert.strictEqual(updateDetail.changeTableRows.length, 2, "update detail renders before and after rows");
assert.strictEqual(updateDetail.changeTableRows[0].cells[0].value, "Before", "update detail first row is Before");
assert.strictEqual(updateDetail.changeTableRows[1].cells[0].value, "After", "update detail second row is After");
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
assert.strictEqual(rollbackDetail.statusState, "Success", "rolled-back status uses success semantics");

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

const normalAuditItems = controllerApi.buildAuditItemsData({
  AuditId: "A-NORMAL",
  TableName: "ZTPC_HEADER",
  RecordKey: "ENTITY_ID=00000000000000000000000000000000",
  FieldName: "",
  OldValue: "",
  NewValue: JSON.stringify({
    ENTITY_ID: "1",
    PRODUCT_CATEGORY: "PC01",
    DESCRIPTION: "em đẹp lắm",
    STATUS: "I",
    VALID_FROM: "2026-05-20",
    VALID_TO: "2026-05-28",
    COMPANY_CODE: "1000",
    PLANT: "01BD"
  }),
  ChangedBy: "DEV-251",
  ChangedAt: "2026-05-20T16:47:00Z",
  ActionType: "C"
}, []);
assert.strictEqual(normalAuditItems.itemRows.length, 1, "normal audit without child entity renders one item");
assert.strictEqual(normalAuditItems.rows.length, 8, "normal audit item renders fields from NewValue snapshot");
assert.strictEqual(normalAuditItems.rows[1].field, "Product Category", "normal audit item preserves snapshot field labels");
assert.strictEqual(normalAuditItems.rows[1].newValue, "PC01", "normal audit item preserves snapshot values");
assert.strictEqual(normalAuditItems.itemRows[0].sourceItem.AuditId, "A-NORMAL", "audit item row keeps its source data for local detail loading");
assertJsonEqual(normalAuditItems.columns.slice(0, 3).map((column) => column.label), ["Item", "Action", "Record Keys"], "audit item table keeps fixed leading columns");
assert(normalAuditItems.columns.some((column) => column.label === "PRODUCT_CATEGORY"), "audit item table exposes snapshot fields as dynamic columns");
assert.strictEqual(normalAuditItems.tableRows.length, 1, "normal audit table renders one physical row per record");
assert.strictEqual(normalAuditItems.tableRows[0].cells[1].value, "Created", "audit item table shows the semantic item action");
assert.strictEqual(normalAuditItems.tableRows[0].cells[1].kind, "status", "action cell is rendered as an ObjectStatus");
assert.strictEqual(normalAuditItems.tableRows[0].cells[1].state, "Success", "action cell uses semantic state from UI5");
assert(normalAuditItems.tableRows[0].cells[2].value.includes("ENTITY ID=00000000000000000000000000000000"), "audit item table keeps full record key values");
assert.strictEqual(Object.prototype.hasOwnProperty.call(normalAuditItems, "bulkItemsHtml"), false, "audit items model does not expose generated HTML");

[
  { actionType: "C", oldValue: "", newValue: '{"NAME":"Created"}', actionText: "Created" },
  { actionType: "U", oldValue: '{"NAME":"Before"}', newValue: '{"NAME":"After"}', actionText: "Updated" },
  { actionType: "D", oldValue: '{"NAME":"Deleted"}', newValue: "", actionText: "Deleted" }
].forEach((testCase) => {
  const data = controllerApi.buildAuditItemsData({
    AuditId: "A-" + testCase.actionType,
    RecordKey: "DOCUMENT_ID=00000000000000012345",
    ActionType: testCase.actionType,
    OldValue: testCase.oldValue,
    NewValue: testCase.newValue
  }, []);

  assert.strictEqual(data.tableRows[0].cells[1].value, testCase.actionText, testCase.actionText + " audit has the expected semantic action");
  assert(data.tableRows[0].cells[2].value.includes("DOCUMENT ID=00000000000000012345"), testCase.actionText + " audit preserves its Record Key string");
});

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
  { field: "Active", oldValue: "No", newValue: "Yes" }
], "JSON OldValue/NewValue show changed fields only");

const unchangedDetail = controllerApi.buildAuditDetail({
  AuditId: "A-UNCHANGED",
  TableName: "ZTPC_HEADER",
  RecordKey: "ENTITY_ID=1",
  OldValue: JSON.stringify({ STATUS: "I", ERDAT: "2026-05-20" }),
  NewValue: JSON.stringify({ STATUS: "I", ERDAT: "2026-05-20" }),
  ActionType: "U"
});
assert.strictEqual(unchangedDetail.changeRows.length, 0, "update with no changed fields renders no rows");

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
const i18nText = fs.readFileSync(path.join(__dirname, "..", "apps", "audit-log", "webapp", "i18n", "i18n.properties"), "utf8");
const auditListSettings = manifest["sap.ui5"].routing.targets.AuditLogList.options.settings;
assert.strictEqual(auditListSettings.initialLoad, "Enabled", "audit list loads automatically when the app opens");
const filterConfiguration = manifest["sap.ui5"].routing.targets.AuditLogList.options.settings.controlConfiguration["@com.sap.vocabularies.UI.v1.SelectionFields"].filterFields;
const columns = manifest["sap.ui5"].routing.targets.AuditLogList.options.settings.controlConfiguration["@com.sap.vocabularies.UI.v1.LineItem"].columns;
assert(!filterConfiguration.ActionType.template, "audit operation filter uses the standard Fiori Elements field");
assert(columns.OperationColumn, "List Report exposes Operation column");
assert.strictEqual(auditListSettings.controlConfiguration["@com.sap.vocabularies.UI.v1.LineItem"].tableSettings.type, "ResponsiveTable", "audit list keeps the standard responsive table configuration");
assert.strictEqual((annotationXml.match(/DataFieldForAction/g) || []).length, 0, "local annotation does not create duplicate Rollback action");
assert(!annotationXml.includes("<PropertyValue Property=\"Action\" String=\"com.sap.gateway.srvd.zsd_tbl_config.v0001.rollback\""), "local annotation does not duplicate rollback button");
assert(columns.OperationColumn.properties.includes("ActionType"), "Operation column uses ActionType");
assert(columns.OperationColumn.properties.includes("RecordKey"), "Operation column uses RecordKey to identify bulk rows");
assert(!columns.OperationColumn.properties.includes("OldValue"), "audit list does not request raw OldValue data");
assert(!columns.OperationColumn.properties.includes("NewValue"), "audit list does not request raw NewValue data");
assert.strictEqual(columns.RecordKeyColumn, undefined, "audit list does not add a custom Record Key column in the stable filter-bar configuration");
assert.strictEqual(columns.SummaryColumn, undefined, "audit list does not add a custom Summary column in the stable filter-bar configuration");
assert.strictEqual(columns.DetailColumn, undefined, "audit list does not add a custom Details column in the stable filter-bar configuration");
assert.strictEqual(columns.RollbackColumn, undefined, "audit list does not add a custom Rollback column in the stable filter-bar configuration");
assert.strictEqual(columns["DataField::RecordKey"].availability, "Hidden", "audit list hides the raw Record Key column");
assert(!annotationXml.includes('<PropertyValue Property="Value" Path="RecordKey"/>'), "audit list LineItem does not render raw Record Key");
assert(annotationXml.includes("<Annotation Term=\"UI.PresentationVariant\">"), "Audit list declares a default presentation variant");
assert(annotationXml.includes("<PropertyValue Property=\"Property\" PropertyPath=\"ChangedAt\"/>"), "Audit list sorts by ChangedAt");
assert(annotationXml.includes("<PropertyValue Property=\"Descending\" Bool=\"true\"/>"), "Audit list sorts newest first");
assert(!annotationXml.includes("Capabilities.SearchRestrictions"), "local annotations do not attach SearchRestrictions to the entity type");
assert(annotationXml.includes("<PropertyPath>ChangedAt</PropertyPath>"), "audit filters by changed time");
assert(annotationXml.includes("<Annotation Term=\"Common.Label\" String=\"Operation\"/>"), "audit action filter has a readable label");
assert(!annotationXml.includes("Common.IsActionCritical"), "rollback confirmation is handled only by the controller");
assert(!i18nText.includes("SAPFE_ACTION_CONFIRM|rollback"), "rollback does not register a duplicate Fiori Elements confirmation");
const auditDetailSectionFragment = fs.readFileSync(path.join(__dirname, "..", "apps", "audit-log", "webapp", "ext", "fragment", "AuditDetailSection.fragment.xml"), "utf8");
const bulkDialogFragment = fs.readFileSync(path.join(__dirname, "..", "apps", "audit-log", "webapp", "ext", "fragment", "BulkAuditItemsDialog.fragment.xml"), "utf8");
const auditCss = fs.readFileSync(path.join(__dirname, "..", "apps", "audit-log", "webapp", "css", "audit.css"), "utf8");
assert.strictEqual(auditListSettings.navigation.AuditLog.detail.route, "AuditLogObjectPage", "audit rows navigate to the detail page");
assert(auditDetailSectionFragment.includes("auditInfoSection"), "audit detail section renders audit information in a scoped section");
assert(auditDetailSectionFragment.includes("auditInfoMatrix"), "audit detail section renders audit information as a compact matrix");
assert(!auditDetailSectionFragment.includes("auditInfoGroupIdentification"), "audit information no longer renders the Identification group heading");
assert(!auditDetailSectionFragment.includes("auditInfoGroupChange"), "audit information no longer renders the Change Information group heading");
assert(!auditDetailSectionFragment.includes("auditInfoGroupImpact"), "audit information no longer renders the Impact group");
assert(!auditDetailSectionFragment.includes("auditInfoAffectedRecords"), "audit information no longer repeats affected record count");
assert(!auditDetailSectionFragment.includes("auditInfoChangedFields"), "audit information no longer repeats changed field count");
assert(auditDetailSectionFragment.includes("sap-icon://copy"), "audit detail section offers a native copy action for Audit ID");
assert(auditDetailSectionFragment.includes("onCopyAuditIdPress"), "audit detail section wires the Audit ID copy action");
assert(!auditDetailSectionFragment.includes("auditInfoTableName"), "audit information does not repeat Table Name from the Object Page header");
assert(!auditDetailSectionFragment.includes("auditInfoOperation"), "audit information does not repeat Operation from the Object Page header");
assert(!auditDetailSectionFragment.includes("{auditDetail>/subtitle}"), "audit information does not repeat the Object Page header subtitle");
assert(!auditDetailSectionFragment.includes("sap.ui.layout.form"), "audit detail section does not depend on layout forms");
assert(!auditDetailSectionFragment.includes('columns="{auditDetail>/infoColumns}"'), "audit detail section does not render audit info as horizontal columns");
assert(!auditDetailSectionFragment.includes('headerText="Record Key"'), "audit detail section does not duplicate Record Key below full information");
assert(!auditDetailSectionFragment.includes('items="{auditDetail>/recordKeyTableRows}"'), "audit detail section does not render a separate Record Key table");
assert(!auditDetailSectionFragment.includes("core:HTML"), "audit detail section does not render generated HTML");
assert(auditDetailSectionFragment.includes("auditItemsCard"), "audit detail section wraps audit items in a polished table card");
assert(auditDetailSectionFragment.includes("onRollbackPress"), "rollback is exposed from the Object Page detail section");
assert(auditDetailSectionFragment.includes('visible="{auditDetail>/rollbackAvailable}"'), "Object Page only shows rollback when the backend allows it");
assert(auditDetailSectionFragment.includes('alternateRowColors="true"'), "audit item table uses alternating rows for readability");
assert(auditDetailSectionFragment.includes("auditSpreadsheetAction"), "audit item table styles semantic action cells consistently");
assert(auditDetailSectionFragment.includes("path: 'auditItems>/columns'"), "audit detail section binds dynamic item columns");
assert(auditDetailSectionFragment.includes("path: 'auditItems>/tableRows'"), "audit detail section binds one row per audit item");
assert(auditDetailSectionFragment.includes("path: 'auditItems>cells'"), "audit detail section binds dynamic row cells");
assert(auditDetailSectionFragment.includes("ScrollContainer"), "audit detail section wraps the spreadsheet in one horizontal scroll container");
assert(!auditDetailSectionFragment.includes('items="{auditItems>/rows}"'), "bulk audit detail does not render one repeated row per field");
assert(!auditDetailSectionFragment.includes("View Changes"), "bulk audit detail does not require opening item changes");
assert(!auditDetailSectionFragment.includes("Review old and new values"), "bulk audit detail removes redundant instruction banner");
assert(!auditCss.includes("auditListOperationBulk"), "audit list leaves bulk operations with the default neutral color");
assert(!/#[0-9a-fA-F]{3,8}/.test(auditCss), "audit CSS uses SAP theme variables instead of hardcoded colors");
assert(auditCss.includes("display: grid;"), "audit information uses CSS grid for stable columns");
assert(auditCss.includes("minmax(18rem, 2fr)"), "audit information gives the Audit ID enough room on large screens");
assert(auditCss.includes("grid-template-columns: repeat(2, minmax(0, 1fr));"), "audit information displays two columns on medium screens");
assert(auditCss.includes("grid-template-columns: minmax(0, 1fr);"), "audit information stacks to one column on small screens");
assert(bulkDialogFragment.includes('text="{auditBulk>/detailsText}"'), "bulk dialog renders the record and field summary");
assert(bulkDialogFragment.includes('text="{auditBulk>/operationText}"'), "bulk dialog renders the Bulk Operation badge");
assert(!bulkDialogFragment.includes("core:HTML"), "bulk dialog does not render generated HTML");
assert(bulkDialogFragment.includes('alternateRowColors="true"'), "bulk dialog table uses alternating rows for readability");
assert(bulkDialogFragment.includes("auditSpreadsheetAction"), "bulk dialog shares the polished audit item table styling");
assert(bulkDialogFragment.includes("path: 'auditBulk>/columns'"), "bulk dialog renders a dynamic comparison table");
assert(bulkDialogFragment.includes("path: 'auditBulk>/tableRows'"), "bulk dialog binds one flat row per record");
assert(!bulkDialogFragment.includes('items="{auditBulk>/items}"'), "bulk dialog no longer nests a change table inside every item row");

const bulkDialogData = controllerApi.buildBulkDialogData({
  AuditId: "A8",
  TableName: "Z251_SCHEDULE",
  RecordKey: "BULK",
  OldValue: "",
  NewValue: "Bulk audit: 2",
  ChangedBy: "DEV-253",
  ChangedAt: "2026-07-18T18:42:24Z",
  ActionType: "U"
}, [{
  AuditId: "A8-1",
  RecordKey: "{\"ID\":\"1\",\"CLIENT\":\"324\"}",
  OldValue: "{\"ROOM\":\"A\"}",
  NewValue: "{\"ROOM\":\"B\"}",
  ActionType: "U"
}, {
  AuditId: "A8-2",
  RecordKey: "ID: 2 | MANDT: 324",
  OldValue: "",
  NewValue: "ROOM: C",
  ActionType: "C"
}]);
assert.strictEqual(bulkDialogData.title, "Audit details", "bulk dialog matches the audit detail modal title");
assert.strictEqual(bulkDialogData.detailsText, "2 records · 1 field", "bulk dialog summarizes record and field counts");
assert.strictEqual(bulkDialogData.operationText, "Bulk Operation", "bulk dialog shows the operation badge");
assert.strictEqual(bulkDialogData.actionText, "Bulk", "mixed bulk dialog action is generic");
assert.strictEqual(bulkDialogData.items[0].recordKeyText, "1", "bulk dialog hides single-field RecordKey labels");
assert.strictEqual(bulkDialogData.items[1].recordKeyText, "2", "bulk dialog parses legacy single-field RecordKey as value only");
assertJsonEqual(bulkDialogData.columns.map((column) => column.label), ["Item", "Action", "Record Keys", "ROOM"], "bulk dialog renders fixed columns plus dynamic changed fields");
assert.strictEqual(bulkDialogData.tableRows.length, 2, "bulk dialog renders one physical row per affected record");
assert.strictEqual(bulkDialogData.tableRows[0].cells[1].value, "Updated", "bulk dialog shows semantic action text");
assert.strictEqual(bulkDialogData.tableRows[0].cells[1].kind, "status", "bulk dialog renders action via ObjectStatus");
assert.strictEqual(bulkDialogData.tableRows[0].cells[3].value, "A → B", "bulk dialog compares old and new values in the field cell");
assert.strictEqual(bulkDialogData.tableRows[1].cells[2].value, "ID=2", "bulk dialog keeps record key label in the spreadsheet row");
assert.strictEqual(Object.prototype.hasOwnProperty.call(bulkDialogData, "tableHtml"), false, "bulk dialog model does not expose generated HTML");

const bulkDetail = controllerApi.buildAuditDetail({
  AuditId: "A-BULK",
  TableName: "ZTPC_HEADER",
  RecordKey: "BULK",
  OldValue: "",
  NewValue: "Bulk audit: 2",
  ActionType: "U"
});
assert.strictEqual(bulkDetail.actionText, "Bulk", "bulk detail header uses Bulk operation");
assert.strictEqual(bulkDetail.actionState, "None", "bulk detail header uses neutral gray state");
assert.strictEqual(bulkDetail.infoRows[4].label, "Operation", "bulk detail labels the summary action as Operation");
assert.strictEqual(bulkDetail.infoRows[4].value, "Bulk", "bulk detail shows Bulk in Full Audit Information");

const pureBulkDetail = controllerApi.buildAuditDetail({
  AuditId: "A-PURE-BULK",
  TableName: "ZTST_ITEM",
  RecordKey: "BULK",
  ActionType: "BULK",
  OldValue: "",
  NewValue: "Bulk audit: 2 item(s)"
});
assert.strictEqual(pureBulkDetail.infoRows[4].value, "Bulk", "pure bulk detail shows Bulk in Full Audit Information");

const parentAuditValues = {
  AuditId: "A-PARENT",
  TableName: "ZTPC_HEADER",
  ChangedBy: "DEV-251",
  ChangedAt: "2026-07-18T18:42:24Z"
};
assert.strictEqual(controllerApi.filterAuditChildRows([
  { AuditId: "A-PARENT-1", TableName: "ZTPC_HEADER", ChangedBy: "DEV-251", ChangedAt: "2026-07-18T18:42:25Z", RecordKey: "{\"ID\":\"1\"}" },
  { AuditId: "A-OTHER", TableName: "ZTPC_HEADER", ChangedBy: "DEV-251", ChangedAt: "2026-07-20T18:42:24Z", RecordKey: "{\"ID\":\"2\"}" },
  { AuditId: "A-PARENT-BULK", TableName: "ZTPC_HEADER", ChangedBy: "DEV-251", ChangedAt: "2026-07-18T18:42:25Z", RecordKey: "BULK" }
], parentAuditValues).length, 1, "audit child fallback rejects unrelated rows and parent bulk marker");

console.log("audit-log tests passed");
