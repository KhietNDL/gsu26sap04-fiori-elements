sap.ui.define(
  ["sap/fe/core/AppComponent"],
  function (AppComponent) {
    "use strict";

    function ensureAuditCss() {
      if (typeof document === "undefined") {
        return;
      }
      var cssId = "ztblAuditCustomCss";
      if (!document.getElementById(cssId)) {
        var link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = sap.ui.require.toUrl("ztbl/audit/ui/css/audit.css");
        document.head.appendChild(link);
      }
    }

    return AppComponent.extend("ztbl.audit.ui.Component", {
      metadata: {
        manifest: "json"
      },
      init: function () {
        AppComponent.prototype.init.apply(this, arguments);
        ensureAuditCss();

        if (this.getRouter()) {
          this.getRouter().attachRouteMatched(function () {
            ensureAuditCss();
          });
        }
      }
    });
  }
);
