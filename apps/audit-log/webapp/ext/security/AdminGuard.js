sap.ui.define(
  ["sap/m/App", "sap/m/Page", "sap/m/VBox", "sap/m/Title", "sap/m/Text", "sap/m/MessageStrip"],
  function (App, Page, VBox, Title, Text, MessageStrip) {
    "use strict";

    var AUTH_BASE = "/sap/opu/odata/sap/ZSB_AUTH_ADMIN_V2/";
    var adminAccess;
    var activeAccess;

    function getShellUser() {
      var container = sap.ushell && sap.ushell.Container;
      var service;
      var user;

      try {
        user = container && container.getUser && container.getUser();
        if (user && user.getId) {
          return user.getId();
        }

        service = container && container.getService && container.getService("UserInfo");
        user = service && service.getUser && service.getUser();
        if (user && user.getId) {
          return user.getId();
        }
        if (service && service.getId) {
          return service.getId();
        }
      } catch (error) {
        return "";
      }

      return "";
    }

    function getCurrentUsername() {
      return String(getShellUser() || "").trim().toUpperCase();
    }

    function readAuthUser(username) {
      var xhr = new XMLHttpRequest();
      var key = String(username).replace(/'/g, "''");

      xhr.open("GET", AUTH_BASE + "AuthUsers('" + encodeURIComponent(key) + "')?$format=json", false);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.send();

      if (xhr.status < 200 || xhr.status >= 300) {
        return null;
      }

      var payload = JSON.parse(xhr.responseText || "{}");
      return payload.d || payload;
    }

    function getCurrentAuthUser() {
      var username = getCurrentUsername();

      if (!username) {
        return null;
      }

      return readAuthUser(username);
    }

    function isAdmin() {
      var user;

      if (adminAccess !== undefined) {
        return adminAccess;
      }

      try {
        user = getCurrentAuthUser();
        adminAccess = !!user &&
          String(user.RoleType || "").trim().toUpperCase() === "ADMIN" &&
          String(user.ActiveFlag || "").trim().toUpperCase() === "X";
      } catch (error) {
        adminAccess = false;
      }

      return adminAccess;
    }

    function isActiveUser() {
      var user;

      if (activeAccess !== undefined) {
        return activeAccess;
      }

      try {
        user = getCurrentAuthUser();
        activeAccess = !!user && String(user.ActiveFlag || "").trim().toUpperCase() === "X";
      } catch (error) {
        activeAccess = false;
      }

      return activeAccess;
    }

    function createAccessDeniedContent(appTitle) {
      return new App({
        pages: [
          new Page({
            title: appTitle || "Application",
            content: [
              new VBox({
                width: "100%",
                alignItems: "Center",
                justifyContent: "Center",
                items: [
                  new Title({
                    text: "Không có quyền truy cập",
                    level: "H2"
                  }),
                  new Text({
                    text: "Tài khoản của bạn không có quyền xem hoặc thao tác trong ứng dụng này."
                  }).addStyleClass("sapUiSmallMarginTop"),
                  new MessageStrip({
                    text: "Vui lòng liên hệ quản trị viên nếu bạn cần quyền truy cập.",
                    type: "Warning",
                    showIcon: true
                  }).addStyleClass("sapUiMediumMarginTop")
                ]
              }).addStyleClass("sapUiLargeMargin")
            ]
          })
        ]
      });
    }

    return {
      isAdmin: isAdmin,
      isActiveUser: isActiveUser,
      createAccessDeniedContent: createAccessDeniedContent
    };
  }
);
