const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const manifestPath = path.join(__dirname, "..", "apps", "approval-request", "webapp", "manifest.json");
const approvalManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const selectionFieldConfig = approvalManifest["sap.ui5"].routing.targets.ApprovalRequestList.options.settings.controlConfiguration["@com.sap.vocabularies.UI.v1.SelectionFields"];
assert.strictEqual(selectionFieldConfig.filterFields.Status.template, "ztbl.approval.ui.ext.fragment.StatusFilterField", "approval status uses custom dropdown filter");
const statusFilterFragment = fs.readFileSync(path.join(__dirname, "..", "apps", "approval-request", "webapp", "ext", "fragment", "StatusFilterField.fragment.xml"), "utf8");
assert.ok(statusFilterFragment.includes('key="APPROVED" text="Approved"'), "status dropdown includes Approved");
assert.ok(statusFilterFragment.includes('key="PENDING" text="Pending"'), "status dropdown includes Pending");
assert.ok(statusFilterFragment.includes('key="REJECTED" text="Rejected"'), "status dropdown includes Rejected");
const requestOverviewFragment = fs.readFileSync(path.join(__dirname, "..", "apps", "approval-request", "webapp", "ext", "fragment", "RequestOverview.fragment.xml"), "utf8");
assert.ok(requestOverviewFragment.includes('text="{approvalDetail>/comment}"'), "approval object page renders the approval comment");

function loadController() {
  const controllerPath = path.join(
    __dirname,
    "..",
    "apps",
    "approval-request",
    "webapp",
    "ext",
    "controller",
    "ApprovalListReport.controller.js"
  );
  const source = fs.readFileSync(controllerPath, "utf8");
  let moduleResult;

  const formatter = {
    formatActionText: function (value) {
      const action = String(value || "").trim().toUpperCase();
      if (action === "C" || action === "CREATE") return "Create";
      if (action === "U" || action === "UPDATE") return "Update";
      if (action === "D" || action === "DELETE") return "Delete";
      return value || "-";
    },
    formatRequestActionText: function (actionType, recordKey, recordKeyText) {
      if ([recordKey, recordKeyText].some((value) => String(value || "").trim().toUpperCase() === "BULK")) {
        return "BULK";
      }

      return this.formatActionText(actionType);
    },
    formatRequestActionState: function () {
      return "None";
    },
    formatActionState: function () {
      return "None";
    },
    formatStatusText: function (value) {
      const status = String(value || "").trim().toUpperCase();
      if (status === "P") return "Pending";
      if (status === "A") return "Approved";
      if (status === "R") return "Rejected";
      return value || "-";
    },
    formatStatusState: function () {
      return "None";
    }
  };

  const sandbox = {
    sap: {
      ui: {
        define: function (_dependencies, factory) {
          const ControllerExtension = {
            extend: function (name, definition) {
              definition.__name = name;
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
          moduleResult = factory(
            ControllerExtension,
            { load: function () {} },
            JSONModel,
            formatter,
            {
              attachGlobalHandlers: function () {},
              extractBackendMessage: function () {
                return "";
              }
            }
          );
        }
      }
    },
    setTimeout: function (callback) {
      callback();
    },
    console: console
  };

  vm.runInNewContext(source, sandbox, { filename: controllerPath });
  return moduleResult;
}

function createContext(values) {
  return {
    getPath: function () {
      return values.__path || "/ApprovalRequest('" + (values.AprvlId || "REQ") + "')";
    },
    getObject: function () {
      return values;
    },
    getProperty: function (propertyName) {
      return values[propertyName];
    }
  };
}

function createControl(text) {
  return {
    visible: undefined,
    getId: function () {
      return "";
    },
    getTitle: function () {
      return text;
    },
    setVisible: function (visible) {
      this.visible = visible;
    }
  };
}

function createControlWithId(id) {
  return {
    visible: undefined,
    getId: function () {
      return id;
    },
    setVisible: function (visible) {
      this.visible = visible;
    }
  };
}

function createItem(values) {
  return {
    getBindingContext: function () {
      return createContext(values);
    }
  };
}

function createModel(initialData) {
  return {
    data: initialData || {},
    setProperty: function (name, value) {
      this.data[name.replace(/^\//, "")] = value;
    },
    getProperty: function (name) {
      return this.data[name.replace(/^\//, "")];
    }
  };
}

function createView(values, controls) {
  const models = {};
  let currentValues = values;

  return {
    setContextValues: function (nextValues) {
      currentValues = nextValues;
    },
    getBindingContext: function () {
      return createContext(currentValues);
    },
    getModel: function (name) {
      return models[name];
    },
    setModel: function (model, name) {
      models[name] = model;
    },
    findAggregatedObjects: function (_recursive, visitor) {
      controls.forEach(function (control) {
        visitor(control);
      });
    }
  };
}

const controller = loadController();
const api = controller._test;

assert(api, "Controller exposes test helpers");

function assertPlainObject(value, expected, message) {
  assert.strictEqual(JSON.stringify(value), JSON.stringify(expected), message);
}

function assertJsonEqual(value, expected, message) {
  assert.strictEqual(JSON.stringify(value), JSON.stringify(expected), message);
}

assertPlainObject(api.safeParseObject(""), {}, "empty JSON returns empty object");
assertPlainObject(api.safeParseObject(null), {}, "null JSON returns empty object");
assertPlainObject(api.safeParseObject("{bad"), {}, "malformed JSON returns empty object");
assertPlainObject(api.safeParseObject("[1,2]"), {}, "arrays are rejected");
assertPlainObject(api.safeParseObject("{\"A\":1}"), { A: 1 }, "plain object is accepted");
assertPlainObject(api.safeParseObject("{\"A\":\"old\",\"COUNT\":0,\"BROKEN\":\"unterminated"), { A: "old", COUNT: 0 }, "truncated JSON preserves complete flat fields");

assert.strictEqual(api.formatApprovalValue("QUANTITY", 0), "0", "numeric zero is preserved");
assert.strictEqual(api.formatApprovalValue("DESCRIPTION", ""), "—", "empty string becomes dash");
assert.strictEqual(api.formatApprovalValue("ACTIVE_FLAG", "X"), "Yes", "confirmed flag field renders X as Yes");
assert.strictEqual(api.formatApprovalValue("NESTED", { A: 1 }), "{\"A\":1}", "nested values do not become object Object");
assert.strictEqual(api.mapFieldLabel("PRODUCT_CATEGORY"), "Product Category", "technical field label is readable");
assert.strictEqual(api.formatRawJson("[{\"ID\":\"1\"}]"), "[\n  {\n    \"ID\": \"1\"\n  }\n]", "raw JSON formatter pretty-prints arrays");
assert.strictEqual(api.formatRawJson("BULK"), "BULK", "raw JSON formatter preserves non-JSON technical values");

const createRows = api.buildApprovalDiff("C", "", "{\"ID\":\"1\",\"NAME\":\"New\"}", "{\"ID\":\"1\"}");
assertJsonEqual(createRows.map((row) => row.field), ["Id", "Name"], "create shows new record fields");
assert.strictEqual(createRows[0].oldValue, "—", "create has no before value");
assert.strictEqual(createRows[0].newValue, "1", "create new value is shown");

const updateRows = api.buildApprovalDiff(
  "U",
  "{\"ID\":\"1\",\"NAME\":\"Old\",\"COUNT\":0}",
  "{\"ID\":\"1\",\"NAME\":\"New\",\"COUNT\":0,\"EXTRA\":\"Added\"}",
  "{\"ID\":\"1\"}"
);
assertJsonEqual(updateRows.map((row) => row.field), ["Name", "Extra"], "update shows changed and new-only fields only");
assert.strictEqual(updateRows[0].oldValue, "Old", "update shows old value from OldData JSON");
assert.strictEqual(updateRows[0].newValue, "New", "update shows new value from NewData JSON");

const headerUpdateRows = api.buildApprovalDiff(
  "U",
  "{\"ENTITY_ID\":\"8B95F36A4F271FE19B946B389BE4FDB7\",\"PRODUCT_CATEGORY\":\"PC06\",\"DESCRIPTION\":\"ABC\",\"STATUS\":\"I\",\"VALID_FROM\":\"2026-06-20\",\"VALID_TO\":\"2026-06-20\",\"COMPANY_CODE\":\"CCCL\",\"PLANT\":\"BD17\"}",
  "{\"ENTITY_ID\":\"8B95F36A4F271FE19B946B389BE4FDB7\",\"PRODUCT_CATEGORY\":\"PC06\",\"DESCRIPTION\":\"ABCDEF\",\"STATUS\":\"I\",\"VALID_FROM\":\"2026-06-20\",\"VALID_TO\":\"2026-06-20\",\"COMPANY_CODE\":\"CCCL\",\"PLANT\":\"BD17\"}",
  "{\"ENTITY_ID\":\"8B95F36A4F271FE19B946B389BE4FDB7\"}"
);
assertJsonEqual(headerUpdateRows.map((row) => row.field), ["Description"], "header update shows changed business fields only");
assert.strictEqual(headerUpdateRows[0].oldValue, "ABC", "header update pulls old description from OldData JSON");
assert.strictEqual(headerUpdateRows[0].newValue, "ABCDEF", "header update pulls new description from NewData JSON");

const truncatedOldHeaderRows = api.buildApprovalDiff(
  "U",
  "{\"ENTITY_ID\":\"8B95F36A4F271FE19B946B389BE4FDB7\",\"DESCRIPTION\":\"ABC\",\"CREATED_AT\":\"2026-06-20 12",
  "{\"ENTITY_ID\":\"8B95F36A4F271FE19B946B389BE4FDB7\",\"DESCRIPTION\":\"ABCDEF\",\"CREATED_AT\":\"2026-06-20 12:00:00\"}",
  "{\"ENTITY_ID\":\"8B95F36A4F271FE19B946B389BE4FDB7\"}"
);
assertJsonEqual(truncatedOldHeaderRows.map((row) => row.field), ["Description"], "truncated old JSON still shows changed business fields");
assert.strictEqual(truncatedOldHeaderRows[0].oldValue, "ABC", "truncated old JSON pulls complete old field values");

const deleteRows = api.buildApprovalDiff("D", "{\"ID\":\"1\",\"NAME\":\"Old\"}", "", "{\"ID\":\"1\"}");
assertJsonEqual(deleteRows.map((row) => row.field), ["Id", "Name"], "delete shows old record fields");
assert.strictEqual(deleteRows[1].oldValue, "Old", "delete shows previous value");
assert.strictEqual(deleteRows[0].newValue, "—", "delete has no after value");

const infoRows = api.buildRequestInfoRows({
  AprvlId: "REQ-1",
  TableName: "ZTPC_HEADER",
  ActionType: "C",
  Status: "P",
  SubmittedBy: "DEV-253",
  SubmittedAt: "2026-07-18T00:00:00Z",
  ApprovedBy: "",
  ApprovedAt: "",
  AprvlComment: ""
});
assertJsonEqual(infoRows.map((row) => row.label), [
  "Approval ID",
  "Table Name",
  "Operation",
  "Status",
  "Submitted By",
  "Submitted At"
], "empty reviewed fields are hidden");
assert.ok(/07:00:00/.test(infoRows[5].value), "submitted UTC time is converted to Vietnam time");
assert.ok(/17:58:52/.test(api.formatVietnamTimestamp("2026-07-14T10:58:52.098366Z")), "microsecond UTC timestamp is converted to Vietnam time");

const bulkInfoRows = api.buildRequestInfoRows({
  AprvlId: "REQ-BULK",
  TableName: "Z251_SCHEDULE",
  ActionType: "C",
  RecordKey: "BULK",
  ItemCount: 1,
  Status: "PENDING",
  SubmittedBy: "DEV-253",
  SubmittedAt: "2026-07-25T08:22:50Z"
});
assert.strictEqual(bulkInfoRows[2].value, "Create", "bulk marker with one item keeps the real action");
assert.strictEqual(bulkInfoRows[2].isBulkOperation, false, "single-action bulk marker is not flagged as bulk operation");
assert.strictEqual(api.getRequestActionText("U", "BULK"), "BULK", "unknown bulk item count shows bulk in the list first");
assert.strictEqual(api.getRequestActionText("U", "BULK", "", 1), "Update", "one bulk item shows its real action");
assert.strictEqual(api.getRequestActionText("D", "BULK", "", 2), "BULK", "two or more bulk items show the bulk label");
assert.strictEqual(api.getRequestActionState("D", "BULK", "", 2), "None", "bulk label is neutral instead of forcing a highlight color");

assert.strictEqual(api.getApprovalActionFromRequest(
  "/sap/opu/odata4/$batch",
  "POST /com.sap.gateway.srvd.zsd_tbl_config.v0001.approve HTTP/1.1"
), "approve", "batch request action is detected from the embedded URL");
assert.strictEqual(api.injectRemarksIntoRequestBody('{"remarks":"old"}', "approve", "new comment"),
  '{"remarks":"old"}', "existing direct remarks are preserved by design");
const batchBody = [
  "--batch_x",
  "Content-Type: application/http",
  "",
  "POST /com.sap.gateway.srvd.zsd_tbl_config.v0001.approve HTTP/1.1",
  "Content-Type: application/json",
  "",
  "{}",
  "--batch_x--"
].join("\\r\\n");
assert.ok(api.injectRemarksIntoRequestBody(batchBody, "approve", "new comment").includes('"remarks":"new comment"'),
  "batch action payload receives remarks");

const singleApprovalItems = createControl("Approval Items");
const singleExcelItems = createControl("Excel Approval Items");
const singleOtherSection = createControl("Technical Details");
api.syncApprovalItemsVisibility(createView({
  RecordKey: "{\"ENTITY_ID\":\"1\"}",
  RecordKeyText: "ENTITY_ID: 1"
}, [singleApprovalItems, singleExcelItems, singleOtherSection]));
assert.strictEqual(singleApprovalItems.visible, false, "single request hides Approval Items");
assert.strictEqual(singleExcelItems.visible, false, "single request hides Excel Approval Items");
assert.strictEqual(singleOtherSection.visible, undefined, "single request leaves unrelated sections untouched");

const bulkApprovalItems = createControl("Approval Items");
api.syncApprovalItemsVisibility(createView({
  RecordKey: "BULK",
  RecordKeyText: ""
}, [bulkApprovalItems]));
assert.strictEqual(bulkApprovalItems.visible, false, "bulk request hides generated Approval Items to avoid duplicate item tables");

const backendItemsFacet = createControlWithId("ApprovalRequestObjectPage::Items");
api.syncApprovalItemsVisibility(createView({
  RecordKey: "BULK",
  RecordKeyText: ""
}, [backendItemsFacet]));
assert.strictEqual(backendItemsFacet.visible, false, "stable Items facet ID is hidden when custom bulk table owns item review");

assert.strictEqual(api.isBulkRequest(createView({
  RecordKey: "",
  RecordKeyText: " bulk "
}, [])), true, "RecordKeyText BULK is treated as bulk");
assert.strictEqual(api.isBulkRequest(createView({
  RecordKey: "{\"ID\":\"BULK-1\"}",
  RecordKeyText: "ID: BULK-1"
}, [])), false, "business values containing BULK are not treated as bulk");

const bulkSummary = api.buildBulkSummary([
  createItem({ ActionType: "C", Status: "PENDING" }),
  createItem({ ActionType: "U", Status: "APPROVED" }),
  createItem({ ActionType: "D", Status: "ERROR" })
]);
assert.strictEqual(bulkSummary, "3 items • 1 create • 1 update • 1 delete • 1 error/conflict", "bulk summary counts item operations and error states");
assert.strictEqual(api.buildBulkSummary([]), "No approval items found.", "empty bulk item table is summarized");

const loadingModel = createModel({
  bulkItemSelected: true,
  bulkItemRecordKeyJson: "{\"STALE\":\"1\"}",
  bulkItemOldDataJson: "{\"STALE\":\"old\"}",
  bulkItemNewDataJson: "{\"STALE\":\"new\"}"
});
api.beginItemsLoading(loadingModel, "REQ-1", "/ApprovalRequest('REQ-1')", 1, false);
assert.strictEqual(loadingModel.getProperty("/itemsLoading"), true, "rows load sets loading true");
assert.strictEqual(loadingModel.getProperty("/itemsEmptyVisible"), false, "rows load hides empty state");
assert.strictEqual(loadingModel.getProperty("/bulkItemSelected"), false, "rows load clears stale selected item");
assert.strictEqual(loadingModel.getProperty("/bulkItemRecordKeyJson"), "", "rows load clears stale item RecordKey JSON");

api.finishItemsLoading(loadingModel, [
  createItem({ ActionType: "C", Status: "PENDING" }),
  createItem({ ActionType: "U", Status: "PENDING" })
], "", 1);
assert.strictEqual(loadingModel.getProperty("/itemsLoading"), false, "rows loaded clears loading");
assert.strictEqual(loadingModel.getProperty("/itemCount"), 2, "rows loaded stores item count");
assert.strictEqual(loadingModel.getProperty("/bulkSummaryVisible"), true, "rows loaded shows summary");
assert.strictEqual(loadingModel.getProperty("/itemsEmptyVisible"), false, "rows loaded hides empty state");

const emptyModel = createModel();
api.finishItemsLoading(emptyModel, [], "", undefined);
assert.strictEqual(emptyModel.getProperty("/itemsLoading"), false, "empty load clears loading");
assert.strictEqual(emptyModel.getProperty("/itemsEmptyVisible"), true, "empty load shows empty state");
assert.strictEqual(emptyModel.getProperty("/bulkSummaryVisible"), false, "empty load hides summary");

const errorModel = createModel({ bulkItemSelected: true });
api.finishItemsLoading(errorModel, [], "Backend unavailable", undefined);
assert.strictEqual(errorModel.getProperty("/itemsLoading"), false, "error load clears loading");
assert.strictEqual(errorModel.getProperty("/itemsErrorVisible"), true, "error load shows backend error");
assert.strictEqual(errorModel.getProperty("/itemsErrorText"), "Backend unavailable", "error load stores backend message");
assert.strictEqual(errorModel.getProperty("/itemsEmptyVisible"), false, "error load does not show empty state");

const navModel = createModel({
  bulkItemSelected: true,
  bulkItemRecordKeyJson: "{\"ITEM\":\"1\"}",
  bulkItemOldDataJson: "{\"NAME\":\"Old\"}",
  bulkItemNewDataJson: "{\"NAME\":\"New\"}"
});
api.beginItemsLoading(navModel, "REQ-A", "/ApprovalRequest('REQ-A')", 1, false);
api.finishItemsLoading(navModel, [createItem({ ActionType: "D", Status: "PENDING" })], "", 1);
api.beginItemsLoading(navModel, "REQ-B", "/ApprovalRequest('REQ-B')", 2, true);
assert.strictEqual(navModel.getProperty("/itemsLoading"), true, "navigation bulk to bulk starts a fresh load");
assert.strictEqual(navModel.getProperty("/bulkItemSelected"), false, "navigation bulk to bulk clears selected item");
api.clearItemsLoadingForSingle({}, navModel);
assert.strictEqual(navModel.getProperty("/itemsLoading"), false, "navigation bulk to single clears loading");
assert.strictEqual(navModel.getProperty("/bulkItemOldDataJson"), "", "navigation bulk to single clears stale item old JSON");

const staleModel = createModel();
api.beginItemsLoading(staleModel, "REQ-A", "/ApprovalRequest('REQ-A')", 1, false);
api.beginItemsLoading(staleModel, "REQ-B", "/ApprovalRequest('REQ-B')", 2, true);
api.finishItemsLoading(staleModel, [createItem({ ActionType: "C", Status: "PENDING" })], "", 1);
assert.strictEqual(staleModel.getProperty("/itemsLoading"), true, "bulk A stale response does not clear bulk B loading");
api.finishItemsLoading(staleModel, [createItem({ ActionType: "U", Status: "PENDING" })], "", 2);
assert.strictEqual(staleModel.getProperty("/itemsLoading"), false, "latest bulk response clears loading");
assert.strictEqual(staleModel.getProperty("/itemCount"), 1, "latest bulk response owns item count");

const bulkCreateDetail = api.buildBulkItemDetail({
  ActionType: "C",
  TableName: "ZTPC_HEADER",
  RecordKey: "{\"ID\":\"1\"}",
  OldData: "",
  NewData: "{\"ID\":\"1\",\"NAME\":\"New\"}"
});
assert.strictEqual(bulkCreateDetail.bulkItemTitle, "New Record", "bulk create item uses create title");
assertJsonEqual(bulkCreateDetail.bulkItemHeaderRows.map((row) => row.label), ["Item Number", "Action Type", "Record Key", "Status"], "bulk item dialog header exposes required fields");
assert.strictEqual(bulkCreateDetail.bulkItemRecordKeyText, "Id: 1", "bulk item dialog header formats record key without JSON braces");
assert.strictEqual(bulkCreateDetail.bulkItemHeaderRows[2].value, "Id: 1", "bulk item header row uses readable record key text");
assert.strictEqual(controller.formatBulkRecordKeyText("{\"SCHEDULE_ID\":\"SCH010\"}"), "Schedule Id: SCH010", "bulk items table formats record key without JSON braces");
assert.strictEqual(bulkCreateDetail.bulkItemRecordKeyJson, "{\n  \"ID\": \"1\"\n}", "bulk item exposes formatted RecordKey JSON");
assert.strictEqual(bulkCreateDetail.bulkItemOldDataJson, "", "bulk item exposes empty OldData JSON for create");
assert.strictEqual(bulkCreateDetail.bulkItemNewDataJson, "{\n  \"ID\": \"1\",\n  \"NAME\": \"New\"\n}", "bulk item exposes formatted NewData JSON");
assert.strictEqual(bulkCreateDetail.bulkItemShowOldColumn, false, "bulk create hides before column");
assert.strictEqual(bulkCreateDetail.bulkItemShowNewColumn, true, "bulk create shows value column");
assert.strictEqual(bulkCreateDetail.bulkItemNewColumnHeader, "Value", "bulk create value header is readable");
assertJsonEqual(bulkCreateDetail.bulkItemRows.map((row) => row.field), ["Id", "Name"], "bulk create item parses new data");

const bulkUpdateDetail = api.buildBulkItemDetail({
  ActionType: "U",
  TableName: "ZTPC_HEADER",
  RecordKey: "{\"ID\":\"1\"}",
  OldData: "{\"ID\":\"1\",\"NAME\":\"Old\"}",
  NewData: "{\"ID\":\"1\",\"NAME\":\"New\"}"
});
assert.strictEqual(bulkUpdateDetail.bulkItemTitle, "Field-Level Changes", "bulk update item uses update title");
assert.strictEqual(bulkUpdateDetail.bulkItemOldColumnHeader, "Before", "bulk update before header is readable");
assert.strictEqual(bulkUpdateDetail.bulkItemNewColumnHeader, "After", "bulk update after header is readable");
assert.strictEqual(bulkUpdateDetail.bulkItemShowAllFieldsVisible, true, "bulk update can show all fields");
assertJsonEqual(bulkUpdateDetail.bulkItemRows.map((row) => row.field), ["Name"], "bulk update item parses changed fields only");

const bulkUpdateAllFieldsDetail = api.buildBulkItemDetail({
  ActionType: "U",
  TableName: "ZTPC_HEADER",
  RecordKey: "{\"ID\":\"1\",\"COMPANY_CODE\":\"1000\"}",
  OldData: "{\"ID\":\"1\",\"NAME\":\"Old\",\"COUNT\":0,\"ACTIVE\":false}",
  NewData: "{\"ID\":\"1\",\"NAME\":\"New\",\"COUNT\":0,\"ACTIVE\":true}"
}, true);
assert.strictEqual(bulkUpdateAllFieldsDetail.bulkItemShowAllFields, true, "bulk update remembers show all fields state");
assert.strictEqual(bulkUpdateAllFieldsDetail.bulkItemRecordKeyText, "Id: 1, Company Code: 1000", "composite record key is summarized professionally");
assertJsonEqual(bulkUpdateAllFieldsDetail.bulkItemRecordKeyRows.map((row) => row.field), ["Id", "Company Code"], "composite record key is parsed");
assertJsonEqual(bulkUpdateAllFieldsDetail.bulkItemRows.map((row) => row.field), ["Id", "Name", "Count", "Active"], "show all fields includes unchanged update fields");
assert.strictEqual(bulkUpdateAllFieldsDetail.bulkItemRows[2].oldValue, "0", "numeric zero is preserved in bulk dialog rows");
assert.strictEqual(bulkUpdateAllFieldsDetail.bulkItemRows[3].oldValue, "No", "boolean false is formatted in bulk dialog rows");
assert.strictEqual(bulkUpdateAllFieldsDetail.bulkItemRows[3].newValue, "Yes", "boolean true is formatted in bulk dialog rows");

const bulkDeleteDetail = api.buildBulkItemDetail({
  ActionType: "D",
  TableName: "ZTPC_HEADER",
  RecordKey: "{\"ID\":\"1\"}",
  OldData: "{\"ID\":\"1\",\"NAME\":\"Old\"}",
  NewData: ""
});
assert.strictEqual(bulkDeleteDetail.bulkItemTitle, "Record To Be Deleted", "bulk delete item uses delete title");
assert.strictEqual(bulkDeleteDetail.bulkItemShowOldColumn, true, "bulk delete shows current value column");
assert.strictEqual(bulkDeleteDetail.bulkItemShowNewColumn, false, "bulk delete hides after column");
assert.strictEqual(bulkDeleteDetail.bulkItemOldColumnHeader, "Current Value", "bulk delete current value header is readable");
assertJsonEqual(bulkDeleteDetail.bulkItemRows.map((row) => row.field), ["Id", "Name"], "bulk delete item parses old data");

const malformedOldDetail = api.buildBulkItemDetail({
  ActionType: "D",
  RecordKey: "{\"ID\":\"1\"}",
  OldData: "{bad",
  NewData: ""
});
assertJsonEqual(malformedOldDetail.bulkItemRows.map((row) => row.field), ["Id"], "malformed old data falls back to record key for delete");
assert.strictEqual(malformedOldDetail.bulkItemOldDataJson, "{bad", "malformed old data remains available in technical JSON");

const malformedNewDetail = api.buildBulkItemDetail({
  ActionType: "C",
  RecordKey: "{\"ID\":\"1\"}",
  OldData: null,
  NewData: "{bad"
});
assertJsonEqual(malformedNewDetail.bulkItemRows, [], "malformed new data yields no parsed create rows");
assert.strictEqual(malformedNewDetail.bulkItemOldDataJson, "", "null old data renders empty technical JSON");
assert.strictEqual(malformedNewDetail.bulkItemNewDataJson, "{bad", "malformed new data remains available in technical JSON");

const emptyJsonDetail = api.buildBulkItemDetail({
  ActionType: "U",
  RecordKey: "{}",
  OldData: "{}",
  NewData: "{}"
});
assertJsonEqual(emptyJsonDetail.bulkItemRecordKeyRows, [], "empty JSON record key has no parsed key rows");
assertJsonEqual(emptyJsonDetail.bulkItemRows, [], "empty JSON data has no parsed change rows");

const requestLevelValues = {
  ActionType: "U",
  RecordKey: "BULK",
  OldData: "{\"REQUEST_LEVEL\":\"old\"}",
  NewData: "{\"REQUEST_LEVEL\":\"new\"}"
};
const item1Detail = api.buildBulkItemDetail({
  ActionType: "U",
  RecordKey: "{\"ID\":\"1\"}",
  OldData: "{\"ID\":\"1\",\"NAME\":\"Item 1 Old\"}",
  NewData: "{\"ID\":\"1\",\"NAME\":\"Item 1 New\"}"
});
const item2Detail = api.buildBulkItemDetail({
  ActionType: "U",
  RecordKey: "{\"ID\":\"2\"}",
  OldData: "{\"ID\":\"2\",\"NAME\":\"Item 2 Old\"}",
  NewData: "{\"ID\":\"2\",\"NAME\":\"Item 2 New\"}"
});
assert.strictEqual(item1Detail.bulkItemOldDataJson, "{\n  \"ID\": \"1\",\n  \"NAME\": \"Item 1 Old\"\n}", "item 1 detail uses item-level OldData JSON");
assert.strictEqual(item2Detail.bulkItemOldDataJson, "{\n  \"ID\": \"2\",\n  \"NAME\": \"Item 2 Old\"\n}", "selected item JSON changes between item 1 and item 2");
assert.notStrictEqual(item1Detail.bulkItemOldDataJson, item2Detail.bulkItemOldDataJson, "selected item JSON is not stale between rows");
assert.notStrictEqual(item1Detail.bulkItemOldDataJson, api.formatRawJson(requestLevelValues.OldData), "request-level raw JSON is not used as item-level detail");

const lifecycleOwner = {};
const responseContext = {
  getObject: function () {
    return {
      AprvlId: "8B95F36A4F271FD1A492171350C57AD0",
      TableName: "Z251_SCHEDULE",
      ActionType: "U",
      Status: "REJECTED",
      AprvlComment: "a"
    };
  },
  getProperty: function (propertyName) {
    return this.getObject()[propertyName];
  },
  requestObject: function () {
    return Promise.resolve(this.getObject());
  },
  requestProperty: function (propertyName) {
    // Simulate a generated object-page $select that does not expose the
    // comment through requestProperty although the entity response has it.
    return Promise.resolve(propertyName === "AprvlComment" ? undefined : this.getObject()[propertyName]);
  }
};
const lifecycleView = createView({
  __path: "/ApprovalRequest('REQ-A')",
  AprvlId: "REQ-A",
  RecordKey: "BULK",
  ActionType: "U"
}, []);

Promise.resolve()
  .then(function () {
    return api.requestContextValues(responseContext);
  })
  .then(function (values) {
    assert.strictEqual(values.AprvlComment, "a", "entity response comment is retained when requestProperty does not return it");
  })
  .then(function () {
    return api.handleApprovalContextChanged(lifecycleOwner, lifecycleView, lifecycleView.getBindingContext());
  })
  .then(function () {
    const model = lifecycleView.getModel("approvalDetail");
    assert.strictEqual(model.getProperty("/itemsLoading"), true, "one bulk context starts one item load");
    assert.strictEqual(model.getProperty("/itemsLoadSequence"), 1, "first bulk context uses one load sequence");
    return api.handleApprovalContextChanged(lifecycleOwner, lifecycleView, lifecycleView.getBindingContext());
  })
  .then(function () {
    const model = lifecycleView.getModel("approvalDetail");
    assert.strictEqual(model.getProperty("/itemsLoadSequence"), 1, "same context does not rebind repeatedly");
    api.finishItemsLoading(model, [createItem({ ActionType: "U", Status: "PENDING" })], "", 1);
    assert.strictEqual(model.getProperty("/itemsLoading"), false, "rows received clears loading in context lifecycle");

    lifecycleView.setContextValues({
      __path: "/ApprovalRequest('REQ-B')",
      AprvlId: "REQ-B",
      RecordKey: "BULK",
      ActionType: "C"
    });
    return api.handleApprovalContextChanged(lifecycleOwner, lifecycleView, lifecycleView.getBindingContext());
  })
  .then(function () {
    const model = lifecycleView.getModel("approvalDetail");
    assert.strictEqual(model.getProperty("/itemsLoadSequence"), 2, "bulk A to bulk B starts exactly one new load");
    assert.strictEqual(model.getProperty("/itemsLoading"), true, "bulk B is loading");

    lifecycleView.setContextValues({
      __path: "/ApprovalRequest('REQ-C')",
      AprvlId: "REQ-C",
      RecordKey: "{\"ID\":\"1\"}",
      ActionType: "U"
    });
    return api.handleApprovalContextChanged(lifecycleOwner, lifecycleView, lifecycleView.getBindingContext());
  })
  .then(function () {
    const model = lifecycleView.getModel("approvalDetail");
    assert.strictEqual(model.getProperty("/itemsLoading"), false, "bulk to single detaches item binding and clears busy");
    assert.strictEqual(model.getProperty("/currentItemsBindingPath"), "", "bulk to single clears item binding path");

    lifecycleView.setContextValues({
      __path: "/ApprovalRequest('REQ-D')",
      AprvlId: "REQ-D",
      RecordKey: "BULK",
      ActionType: "D"
    });
    return api.handleApprovalContextChanged(lifecycleOwner, lifecycleView, lifecycleView.getBindingContext());
  })
  .then(function () {
    const model = lifecycleView.getModel("approvalDetail");
    assert.strictEqual(model.getProperty("/itemsLoadSequence"), 4, "single to bulk loads once with a new sequence");
    assert.strictEqual(model.getProperty("/itemsLoading"), true, "single to bulk starts loading");
    console.log("approval-list-report tests passed");
  })
  .catch(function (error) {
    console.error(error);
    process.exit(1);
  });
