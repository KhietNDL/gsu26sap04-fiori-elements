const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadErrorHandler() {
  const handlerPath = path.join(
    __dirname,
    "..",
    "apps",
    "approval-request",
    "webapp",
    "ext",
    "util",
    "ODataErrorHandler.js"
  );
  const source = fs.readFileSync(handlerPath, "utf8");
  let moduleResult;

  const sandbox = {
    sap: {
      ui: {
        define: function (_dependencies, factory) {
          moduleResult = factory({
            error: function () {}
          });
        }
      }
    },
    window: {
      addEventListener: function () {}
    },
    JSON: JSON,
    String: String,
    Array: Array
  };

  vm.runInNewContext(source, sandbox, { filename: handlerPath });
  return moduleResult;
}

const handler = loadErrorHandler();

assert.strictEqual(
  handler.extractBackendMessage({
    response: {
      data: {
        error: {
          message: "User DEV-253 is not authorized to approve this request"
        }
      }
    }
  }),
  "User DEV-253 is not authorized to approve this request",
  "plain SAP error.message is preserved"
);

assert.strictEqual(
  handler.extractBackendMessage({
    response: {
      data: {
        error: {
          message: { value: "Không có quyền Reject" }
        }
      }
    }
  }),
  "Không có quyền Reject",
  "SAP error.message.value is preserved"
);

assert.strictEqual(
  handler.extractBackendMessage({
    response: {
      data: {
        error: {
          innererror: {
            errordetails: [
              { message: "Backend business rule denied the operation" }
            ]
          }
        }
      }
    }
  }),
  "Backend business rule denied the operation",
  "SAP innererror detail message is preserved"
);

assert.strictEqual(
  handler.extractBackendMessage({
    responseText: "{\"error\":{\"message\":\"Raw Gateway response text\"}}"
  }),
  "Raw Gateway response text",
  "JSON responseText is parsed"
);

assert.strictEqual(
  handler.extractBackendMessage({ message: "Request failed with status code 403" }),
  "",
  "generic HTTP client status text is not shown as backend authorization text"
);

assert.strictEqual(
  handler.isAuthorizationError({ response: { status: 403 } }),
  true,
  "HTTP 403 is recognized as an authorization error"
);

assert.strictEqual(
  handler.isAuthorizationError({ response: { status: 500 } }),
  false,
  "HTTP 500 is not treated as an authorization error"
);

let shownMessage = "";
const messageHandler = loadErrorHandlerWithMessageBox(function (message) {
  shownMessage = message;
});
messageHandler.showBackendError({ response: { status: 403 } }, "Fallback");
assert.strictEqual(
  shownMessage,
  "You are not authorized to access this application.",
  "HTTP 403 without a backend payload still produces an authorization message"
);
messageHandler.showBackendError({ response: { status: 403 } }, "Fallback");
assert.strictEqual(
  shownMessage,
  "You are not authorized to access this application.",
  "the same authorization error is not shown twice immediately"
);

let v4AttachCount = 0;
assert.doesNotThrow(function () {
  handler.attachModelHandlers({
    isA: function (typeName) {
      return typeName === "sap.ui.model.odata.v4.ODataModel";
    },
    attachRequestFailed: function () {
      v4AttachCount += 1;
      throw new Error("Unsupported event 'requestFailed': v4.ODataModel#attachEvent");
    }
  }, "approval");
}, "OData V4 model handler registration never blocks application startup");
assert.strictEqual(v4AttachCount, 0, "requestFailed is not attached to an OData V4 model");

let legacyAttachCount = 0;
const legacyModel = {
  attachRequestFailed: function () {
    legacyAttachCount += 1;
  }
};
handler.attachModelHandlers(legacyModel, "approval");
handler.attachModelHandlers(legacyModel, "approval");
assert.strictEqual(legacyAttachCount, 1, "supported model handler is attached only once");

assert.doesNotThrow(function () {
  handler.attachModelHandlers({
    attachRequestFailed: function () {
      throw new Error("Unsupported event 'requestFailed'");
    }
  }, "approval");
}, "an unsupported optional model event is safely ignored");

function loadErrorHandlerWithMessageBox(onError) {
  const handlerPath = path.join(
    __dirname,
    "..",
    "apps",
    "approval-request",
    "webapp",
    "ext",
    "util",
    "ODataErrorHandler.js"
  );
  const source = fs.readFileSync(handlerPath, "utf8");
  let moduleResult;

  vm.runInNewContext(source, {
    sap: {
      ui: {
        define: function (_dependencies, factory) {
          moduleResult = factory({ error: onError });
        }
      }
    },
    window: { addEventListener: function () {} },
    JSON: JSON,
    String: String,
    Array: Array,
    Number: Number
  }, { filename: handlerPath });

  return moduleResult;
}

console.log("odata-error-handler tests passed");
