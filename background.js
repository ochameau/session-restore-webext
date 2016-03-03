let tabs = [];
let sessions = {};

function log(msg) {
  dump(" >> "+msg+": \n");
  let sorted = tabs.sort((a, b) => a.index > b.index);
  sorted.forEach(t => {
    dump(" - " + t.url + "\n");
    if (sessions[t.id]) {
      dump("   " + JSON.stringify(sessions[t.id]) + "\n");
    }
  });
  dump("\n");
}

var restored = false;
function tryRestore(firstTab) {
  if (restored) return;
  restored = true;
  chrome.storage.local.get(["tabs", "sessions"], function ({ tabs, sessions }) {
    restore(tabs || [], sessions || {}, firstTab);
  });
}

let saveTimeout = null;
function scheduleSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(save, 250);
}

function save() {
  saveTimeout = null;
  // Do some cleanup before saving
  // We may slip some default tab while testing the addon...
  tabs = tabs.filter(tab => (tab.url && tab.url != "about:startpage" && tab.url != "about:home"));
  chrome.storage.local.set({ tabs });
}

function restore(tabs, savedSessions, firstTab) {
  let sorted = tabs.sort((a, b) => a.index > b.index);
  sorted.forEach((tab, i) => {
    let session = savedSessions[tab.id];
    if (i == 0) {
      // Special case for the first tab. We override default opened tab,
      // which should be about:home, about:blank, or custom default home page
      session.restoring = true;
      sessions[firstTab.id] = session;
      chrome.tabs.update(firstTab.id, {
        url: tab.url,
        active: tab.active,
        pinned: tab.pinned,
        // openerTabId: tab.openerTabId // Not supported in Firefox
      });
    } else {
      chrome.tabs.create({
        url: tab.url,
        active: tab.active,
        pinned: tab.pinned,
        // openerTabId: tab.openerTabId // Not supported in Firefox
      }, function (tab) {
        if (session) {
          // Set a flag to say this tab is in process of being restore
          // and session shouldn't be wiped when we navigate to a new location.
          // (tabs.create's callback is fired very early, before the tab navigates)
          session.restoring = true;
          sessions[tab.id] = session;
        }
      });
    }
  });
}

function getTabWithId(id) {
  for(let i = 0; i < tabs.length; i++) {
    let t = tabs[i];
    if (t.id == id) {
      return t;
    }
  }
  return null;
}

function updateTab(tab) {
  let found = false;
  for(let i = 0; i < tabs.length; i++) {
    let t = tabs[i];
    if (t.id == tab.id) {
      tabs[i] = tab;
      found = true;
      break;
    }
  }
  if (!found) {
    tabs.push(tab);
  }

  scheduleSave();
}

function removeTab(tabId) {
  for(let i = 0; i < tabs.length; i++) {
    if (tabs[i].id == tabId) {
      tabs.splice(i, 1);
      scheduleSave();
      return;
    }
  }
}

// Listen for all possible usefull tab event to save
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  let navigates = changeInfo && changeInfo.status == "loading" && tab.url && tab.url != "about:blank";
  // Try to catch up the first tab opening.
  // We have to wait for it to be loaded before restoring
  // in order to correct override it.
  if (changeInfo && changeInfo.status == "complete") {
    tryRestore(tab);
  }
  updateTab(tab);
  if (navigates) {
    let session = sessions[tabId];
    if (session) {
      if (session.restoring) {
        delete session.restoring;
      } else {
        // Wipe session if we navigate to a new URL
        // We do not support history per tab yet
        removeSessionData(tabId);
      }
    }
  }
});

chrome.tabs.onActivated.addListener(function ({tabId, windowId}) {
  chrome.tabs.get(tabId, function (tab) {
    updateTab(tab);
  });
});

chrome.tabs.onMoved.addListener(function (tabId, moveInfo) {
  chrome.tabs.get(tabId, function (tab) {
    updateTab(tab);
  });
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
  // Ignore close on browser shutdown or window closing
  if (!removeInfo.isWindowClosing) {
    removeTab(tabId);
    removeSessionData(tabId);
  }
});


// Listen for messages from content script to save and restore content data

function removeSessionData(tabId) {
  delete sessions[tabId];
  chrome.storage.local.set({ sessions });
}
function updateSessionData(tabId, field, data) {
  if (!sessions[tabId]) {
    sessions[tabId] = {};
  }
  let session = sessions[tabId];
  session[field] = data;
  chrome.storage.local.set({ sessions });
}
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type != "session") return;
  let tabId = sender.tab.id;
  if (request.command == "save") {
    let { field, data } = request;
    updateSessionData(tabId, field, data);
  } else if (request.command == "restore") {
    sendResponse(sessions[tabId]);
  }
});
