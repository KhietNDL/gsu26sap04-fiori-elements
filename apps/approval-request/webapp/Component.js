sap.ui.define(
  ["sap/fe/core/AppComponent", "sap/ui/dom/includeStylesheet", "ztbl/approval/ui/model/formatter"],
  function (AppComponent, includeStylesheet, formatter) {
    "use strict";

    function installApprovalDisplayCleanup() {
      if (typeof document === "undefined" || document.getElementById("ztblApprovalDisplayCleanup")) {
        return;
      }

      var style = document.createElement("style");
      style.id = "ztblApprovalDisplayCleanup";
      style.textContent = [
        "[id*='fe::FacetSection::General'],",
        "[id*='fe::FacetSubSection::General'],",
        "[id*='fe::ObjectPageSection::General'],",
        "[id*='fe::ObjectPageSubSection::General'] {",
        "  display: none !important;",
        "}"
      ].join("\n");
      document.head.appendChild(style);
    }

    function ensureApprovalCss() {
      if (typeof document === "undefined") {
        return;
      }
      var cssId = "ztblApprovalCustomCss";
      if (!document.getElementById(cssId)) {
        var link = document.createElement("link");
        link.id = cssId;
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = sap.ui.require.toUrl("ztbl/approval/ui/css/approval.css");
        document.head.appendChild(link);
      }
    }

    function hideRawJsonColumns() {
      var rawHeaders = {
        "Action": true,
        "Record Key": true,
        "Old Data (JSON)": true,
        "New Data (JSON)": true
      };

      function apply() {
        Array.prototype.slice.call(document.querySelectorAll("th, [role='columnheader']")).forEach(function (header) {
          var text = (header.innerText || "").trim();
          var table;
          var index;

          if (!rawHeaders[text] || !header.parentElement) {
            return;
          }

          table = header.closest("table");
          index = Array.prototype.indexOf.call(header.parentElement.children, header);
          if (!table || index < 0) {
            return;
          }

          Array.prototype.slice.call(table.rows).forEach(function (row) {
            if (row.children[index]) {
              row.children[index].style.display = "none";
            }
          });
        });
      }

      if (typeof document === "undefined") {
        return;
      }

      apply();
      setTimeout(apply, 300);
      setTimeout(apply, 800);
      setTimeout(apply, 1500);
    }

    return AppComponent.extend("ztbl.approval.ui.Component", {
      metadata: {
        manifest: "json"
      },

      init: function () {
        AppComponent.prototype.init.apply(this, arguments);

        installApprovalDisplayCleanup();
        ensureApprovalCss();
        hideRawJsonColumns();

        this.getRouter().attachRouteMatched(function () {
          ensureApprovalCss();
          hideRawJsonColumns();
        });
      }
    });
  }
);
