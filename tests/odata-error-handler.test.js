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

console.log("odata-error-handler tests passed");
