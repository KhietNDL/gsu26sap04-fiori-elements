sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "sap/ui/core/ComponentContainer",
    "sap/m/App",
    "sap/m/Page",
    "sap/m/Title",
    "sap/m/Text",
    "sap/m/VBox",
    "sap/m/FlexItemData",
    "sap/m/SegmentedButton",
    "sap/m/SegmentedButtonItem"
  ],
  function (
    UIComponent,
    ComponentContainer,
    App,
    Page,
    Title,
    Text,
    VBox,
    FlexItemData,
    SegmentedButton,
    SegmentedButtonItem
  ) {
    "use strict";

    var AREAS = {
      users: {
        key: "users",
        label: "Users",
        icon: "sap-icon://employee",
        component: "ztbl.authorization.users.ui",
        description: "Manage system users, roles, and active status"
      },
      "table-permissions": {
        key: "table-permissions",
        label: "Table Permissions",
        icon: "sap-icon://table-view",
        component: "ztbl.authorization.tablepermissions.ui",
        description: "Manage default permissions configured for tables"
      }
    };

    var DEFAULT_AREA = "users";
    var AREA_ORDER = ["users", "table-permissions"];

    sap.ui.loader.config({
      paths: {
        "ztbl/authorization/users/ui": sap.ui.require.toUrl("ztbl/authorization/ui/users"),
        "ztbl/authorization/tablepermissions/ui": sap.ui.require.toUrl("ztbl/authorization/ui/table-permissions")
      }
    });

    function getShellAreaFromHash() {
      var hash = window.location.hash || "";

      if (hash.indexOf("#/users") === 0) {
        return "users";
      }
      if (hash.indexOf("#/table-permissions") === 0) {
        return "table-permissions";
      }

      return "";
    }

    function getAreaFromUrl() {
      var queryArea = new URLSearchParams(window.location.search).get("area");
      var hashArea = getShellAreaFromHash();
      var area = hashArea || queryArea || DEFAULT_AREA;

      return AREAS[area] ? area : DEFAULT_AREA;
    }

    function cleanModuleSwitchHash() {
      var hash = window.location.hash || "";

      if (hash.indexOf("#ZAuthorizationManagement") === 0) {
        return hash.split("&/")[0] + "&/";
      }

      return "";
    }

    function needsCleanModuleHash() {
      var hash = window.location.hash || "";

      return hash.indexOf("#ZAuthorizationManagement") === 0 && hash.indexOf("&/") < 0;
    }

    function getInnerRouteFromHash() {
      var hash = window.location.hash || "";
      var innerRouteIndex = hash.indexOf("&/");

      if (innerRouteIndex >= 0) {
        return hash.slice(innerRouteIndex + 2);
      }

      if (hash.indexOf("#/") === 0) {
        return hash.slice(2);
      }

      return "";
    }

    function isObjectPageRoute() {
      return /(?:AuthUsers|TablePermissions)\(/.test(getInnerRouteFromHash());
    }

    function areaUrl(area) {
      var params = new URLSearchParams(window.location.search);
      params.set("area", area);

      return window.location.pathname + "?" + params.toString() + cleanModuleSwitchHash();
    }

    return UIComponent.extend("ztbl.authorization.ui.Component", {
      metadata: {
        manifest: "json"
      },

      createContent: function () {
        var contentHost = new VBox({
          width: "100%",
          height: "100%",
          renderType: "Bare",
          layoutData: new FlexItemData({
            growFactor: 1,
            baseSize: "0"
          })
        });
        contentHost.addStyleClass("authorizationEmbeddedContent");

        var description = new Text({
          text: "Manage users, assignments, and table-level permissions."
        });
        description.addStyleClass("authorizationShellDescription");

        var header = new VBox({
          width: "100%",
          renderType: "Bare",
          items: [
            new Title({
              text: "Authorization Management",
              level: "H3"
            }),
            description
          ]
        });
        header.addStyleClass("authorizationShellHeader sapUiSmallMarginBegin sapUiSmallMarginEnd sapUiSmallMarginTop");

        var navItems = {
          users: new SegmentedButtonItem({
            key: "users",
            text: AREAS.users.label,
            icon: AREAS.users.icon
          }),
          "table-permissions": new SegmentedButtonItem({
            key: "table-permissions",
            text: AREAS["table-permissions"].label,
            icon: AREAS["table-permissions"].icon
          })
        };
        var tabs = new SegmentedButton({
          width: "100%",
          selectionChange: function (event) {
            this._selectArea(event.getParameter("item").getKey(), true);
          }.bind(this),
          items: [
            navItems.users,
            navItems["table-permissions"]
          ]
        });
        tabs.addStyleClass("authorizationModuleNav");
        var shell = new VBox({
          width: "100%",
          height: "100%",
          renderType: "Bare",
          items: [
            header,
            tabs,
            contentHost
          ]
        });
        var page = new Page({
          enableScrolling: false,
          showHeader: false,
          content: [
            shell
          ]
        });
        var app = new App({
          pages: [
            page
          ]
        });

        this._contentHost = contentHost;
        this._tabs = tabs;
        this._navItems = navItems;

        window.addEventListener("popstate", function () {
          this._selectArea(getAreaFromUrl(), false);
        }.bind(this));
        window.addEventListener("hashchange", function () {
          this._syncModuleNavigation();
        }.bind(this));

        this._selectArea(getAreaFromUrl(), false);

        return app;
      },

      _selectArea: function (area, writeHistory) {
        var areaConfig = AREAS[area] || AREAS[DEFAULT_AREA];

        if (writeHistory) {
          window.history.pushState({ area: areaConfig.key }, "", areaUrl(areaConfig.key));
        } else if (getShellAreaFromHash()) {
          window.history.replaceState({ area: areaConfig.key }, "", areaUrl(areaConfig.key));
        } else if (needsCleanModuleHash()) {
          window.history.replaceState({ area: areaConfig.key }, "", areaUrl(areaConfig.key));
        }

        if (this._currentArea === areaConfig.key) {
          this._tabs.setSelectedKey(areaConfig.key);
          this._syncModuleNavigation();
          return;
        }

        this._currentArea = areaConfig.key;
        this._tabs.setSelectedKey(areaConfig.key);
        this._contentHost.removeAllItems();

        if (this._currentContainer) {
          this._currentContainer.destroy();
        }

        this._currentContainer = new ComponentContainer({
          name: areaConfig.component,
          manifest: true,
          async: true,
          height: "100%",
          width: "100%"
        });

        this._contentHost.addItem(this._currentContainer);
        this._syncModuleNavigation();
      },

      _syncModuleNavigation: function () {
        var visibleKeys = isObjectPageRoute() ? [this._currentArea || getAreaFromUrl()] : AREA_ORDER;
        var currentItems = this._tabs.getItems().slice();

        currentItems.forEach(function (item) {
          if (visibleKeys.indexOf(item.getKey()) < 0) {
            this._tabs.removeItem(item);
          }
        }.bind(this));

        visibleKeys.forEach(function (key, index) {
          var item = this._navItems[key];

          if (item && this._tabs.getItems().indexOf(item) < 0) {
            this._tabs.insertItem(item, index);
          }
        }.bind(this));

        this._tabs.setSelectedKey(this._currentArea || getAreaFromUrl());
      }
    });
  }
);
