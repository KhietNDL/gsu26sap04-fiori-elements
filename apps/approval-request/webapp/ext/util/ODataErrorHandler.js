sap.ui.define([
  "sap/m/MessageBox"
], function (MessageBox) {
  "use strict";

  var lastShownMessage = "";
  var lastShownAt = 0;

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

  function getRequestError(event) {
    var parameters;

    if (!event || !event.getParameters) {
      return event;
    }

    parameters = event.getParameters() || {};
    return {
      response: parameters.response || parameters.error && parameters.error.response,
      responseText: parameters.responseText,
      error: parameters.error,
      message: parameters.message,
      status: parameters.status,
      statusCode: parameters.statusCode
    };
  }

  function getStatus(error) {
    var requestError = getRequestError(error);
    var response = requestError && requestError.response;

    return Number(requestError && (requestError.status || requestError.statusCode) ||
      response && (response.status || response.statusCode));
  }

  function isAuthorizationError(error) {
    var status = getStatus(error);

    return status === 401 || status === 403;
  }

  function showBackendError(error, fallbackMessage) {
    var message = extractBackendMessage(error) ||
      (isAuthorizationError(error) ? "You are not authorized to access this application." : "") ||
      fallbackMessage || "";
    var now = Date.now();

    if (message && (message !== lastShownMessage || now - lastShownAt > 1000)) {
      MessageBox.error(message);
      lastShownMessage = message;
      lastShownAt = now;
    }

    return message;
  }

  function attachModelHandlers(model, key) {
    var flag = "__ztblODataModelErrorHandler_" + key;

    if (!model || !model.attachRequestFailed || model[flag]) {
      return;
    }

    // OData V4 inherits attachRequestFailed from Model, but explicitly rejects
    // the requestFailed event at runtime. V4 errors are handled by rejected
    // promises/message handling instead.
    if (model.isA && model.isA("sap.ui.model.odata.v4.ODataModel")) {
      return;
    }

    try {
      model.attachRequestFailed(function (event) {
        showBackendError(getRequestError(event), "Data could not be loaded.");
      });
      model[flag] = true;
    } catch (error) {
      // Attaching an optional error listener must never block application init.
      return;
    }
  }

  function attachGlobalHandlers(key) {
    var flag = "__ztblODataErrorHandler_" + key;

    if (typeof window === "undefined" || window[flag]) {
      return;
    }

    window[flag] = true;
    window.addEventListener("unhandledrejection", function (event) {
      showBackendError(event && event.reason, "Request failed.");
    });
  }

  return {
    attachGlobalHandlers: attachGlobalHandlers,
    attachModelHandlers: attachModelHandlers,
    extractBackendMessage: extractBackendMessage,
    isAuthorizationError: isAuthorizationError,
    showBackendError: showBackendError
  };
});
