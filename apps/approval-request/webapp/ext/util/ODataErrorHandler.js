sap.ui.define([
  "sap/m/MessageBox"
], function (MessageBox) {
  "use strict";

  function parseJson(value) {
    var text;

    if (typeof value !== "string") {
      return null;
    }

    text = value.trim();
    if (!text || (text.charAt(0) !== "{" && text.charAt(0) !== "[")) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function firstDetailMessage(details) {
    var i;
    var message;

    if (!Array.isArray(details)) {
      return "";
    }

    for (i = 0; i < details.length; i += 1) {
      message = details[i] && details[i].message;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
      if (message && message.value && String(message.value).trim()) {
        return String(message.value);
      }
    }

    return "";
  }

  function extractBackendMessage(error) {
    var data = error && (error.response && error.response.data || error.responseText || error.error || error);
    var parsedData = parseJson(data) || data;
    var sapMessage = parsedData && parsedData.error && parsedData.error.message;
    var detailMessage = firstDetailMessage(parsedData && parsedData.error && parsedData.error.details) ||
      firstDetailMessage(parsedData && parsedData.error && parsedData.error.innererror && parsedData.error.innererror.errordetails) ||
      firstDetailMessage(parsedData && parsedData.innererror && parsedData.innererror.errordetails);

    if (typeof sapMessage === "string" && sapMessage.trim()) {
      return sapMessage;
    }
    if (sapMessage && sapMessage.value && String(sapMessage.value).trim()) {
      return String(sapMessage.value);
    }
    if (detailMessage) {
      return detailMessage;
    }
    if (parsedData && typeof parsedData.message === "string" && parsedData.message.trim() &&
        !/^Request failed with status code/i.test(parsedData.message.trim())) {
      return parsedData.message;
    }
    if (parsedData && parsedData.message && parsedData.message.value && String(parsedData.message.value).trim()) {
      return String(parsedData.message.value);
    }
    if (typeof data === "string" && data.trim() && !/^Request failed with status code/i.test(data.trim())) {
      return data;
    }

    return "";
  }

  function showBackendError(error, fallbackMessage) {
    var message = extractBackendMessage(error) || fallbackMessage || "";

    if (message) {
      MessageBox.error(message);
    }

    return message;
  }

  function attachGlobalHandlers(key) {
    var flag = "__ztblODataErrorHandler_" + key;

    if (typeof window === "undefined" || window[flag]) {
      return;
    }

    window[flag] = true;
    window.addEventListener("unhandledrejection", function (event) {
      var message = extractBackendMessage(event && event.reason);

      if (message) {
        MessageBox.error(message);
      }
    });
  }

  return {
    attachGlobalHandlers: attachGlobalHandlers,
    extractBackendMessage: extractBackendMessage,
    showBackendError: showBackendError
  };
});
