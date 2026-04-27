(function () {
  if (window.__visualQABridgeInstalled__) return;

  var REQUEST_SOURCE = "visual-qa-v12-step2";
  var RESPONSE_SOURCE = "visual-qa-bridge-v12-step2";
  var bridgeActive = true;

  function postResponse(requestId, action, payload) {
    window.postMessage(
      {
        source: RESPONSE_SOURCE,
        requestId: requestId,
        action: action,
        payload: payload || {}
      },
      "*"
    );
  }

  function shutdownBridge() {
    if (!bridgeActive) return;
    bridgeActive = false;
    window.removeEventListener("message", onWindowMessage, false);
    try {
      delete window.__visualQABridgeInstalled__;
    } catch (err) {
      window.__visualQABridgeInstalled__ = false;
    }
  }

  function isRuntimeAvailable() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage);
    } catch (err) {
      return false;
    }
  }

  function isInvalidatedError(err) {
    var message = err && err.message ? err.message : String(err || "");
    return /Extension context invalidated/i.test(message);
  }

  function onWindowMessage(event) {
    if (!bridgeActive) return;
    var data = event && event.data;
    if (!data || event.source !== window || data.source !== REQUEST_SOURCE) return;
    if (!data.requestId || !data.action) return;

    if (!isRuntimeAvailable()) {
      shutdownBridge();
      postResponse(data.requestId, data.action, {
        ok: false,
        error: "Bridge runtime unavailable"
      });
      return;
    }

    try {
      chrome.runtime.sendMessage(
        {
          source: RESPONSE_SOURCE,
          requestId: data.requestId,
          action: data.action,
          pageKey: data.pageKey,
          active: !!data.active,
          draft: data.draft || null,
          html: data.html || "",
          filename: data.filename || ""
        },
        function (response) {
          var runtimeError = chrome.runtime && chrome.runtime.lastError ? chrome.runtime.lastError : null;
          if (runtimeError) {
            if (isInvalidatedError(runtimeError)) shutdownBridge();
            postResponse(data.requestId, data.action, {
              ok: false,
              error: runtimeError.message || "Bridge request failed"
            });
            return;
          }

          postResponse(data.requestId, data.action, response || { ok: false, error: "Empty response" });
        }
      );
    } catch (err) {
      if (isInvalidatedError(err)) shutdownBridge();
      postResponse(data.requestId, data.action, {
        ok: false,
        error: err && err.message ? err.message : "Bridge request failed"
      });
    }
  }

  window.addEventListener("message", onWindowMessage, false);
  window.__visualQABridgeInstalled__ = true;
})();
