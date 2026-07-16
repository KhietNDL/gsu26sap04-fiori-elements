sap.ui.define(
  ["sap/fe/core/AppComponent", "ztbl/approval/ui/model/formatter"],
  function (AppComponent, formatter) {
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
      setTimeout(apply, 500);
      setTimeout(apply, 1500);
    }

    installApprovalDisplayCleanup();
    hideRawJsonColumns();

    return AppComponent.extend("ztbl.approval.ui.Component", {
      metadata: {
        manifest: "json"
      }
    });
  }
);
