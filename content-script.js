
// Handle communication with the background page that handles saving the session data

chrome.runtime.sendMessage({ type: "session", command: "restore" }, function(data) {
  if (!data) {
    return;
  }
  if (data.scroll) {
    restoreScroll(data.scroll);
  }
  if (data.forms) {
    restoreForms(data.forms);
  }
});

function update(field, data) {
  chrome.runtime.sendMessage({ type: "session", command: "save", field, data });
}
