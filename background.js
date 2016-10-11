'use strict';

dump("background!\n");
let tabs = [];
let sessions = {};

let hasBeenRestoredAlready = false;

function log(msg) {
  dump(" >> " + msg + ": \n");
  let sorted = tabs.sort((a, b) => a.index > b.index);
  sorted.forEach(t => {
    dump(" - " + t.url + "\n");
    if (sessions[t.id]) {
      dump("   " + JSON.stringify(sessions[t.id]) + "\n");
    }
  });
  dump("\n");
}


function tryRestore(firstTab) {
  if (hasBeenRestoredAlready) {
    return;
  }
  hasBeenRestoredAlready = true;

  chrome.storage.local.get(["tabs", "sessions"], function ({ tabs, sessions }) {
    restore(tabs || [], sessions || {}, firstTab);
  });
}

function restore(tabs, savedSessions, firstTab) {
  let sorted = tabs.sort((a, b) => a.index > b.index);
  sorted.forEach((tab, i) => {
    let session = savedSessions[tab.id];
    if (i == 0) {
      // Special case for the first tab. We override default opened tab,
      // which should be about:home, about:blank, or custom default home page
      if (session) {
        session.restoring = true;
        sessions[firstTab.id] = session;
      }
      chrome.tabs.update({
        url: tab.url,
        active: tab.active,
        pinned: tab.pinned
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
          // XXX This needs to be implemented in the ext-tabs.js side for planula...
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

const Tabs = (function() {
  function getTabIndexForId(id) {
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].id == id) {
        return i;
      }
    }

    return -1;
  }

  return {
    set(tab) {
      let tabIndex = getTabIndexForId(tab.id);
      if (tabIndex !== -1) {
        tabs[tabIndex] = tab;
      } else {
        tabs.push(tab);
      }
    },

    unset(tabId) {
      let tabIndex = getTabIndexForId(tabId);
      if (tabIndex !== -1) {
        tabs.splice(tabIndex, 1);
      }
    },

    cleanup() {
      tabs = tabs.filter(tab => (tab.url && tab.url != "about:startpage" && tab.url != "about:home"));
    }
  }
})();

// Listen for all possible usefull tab event to save
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  // Try to catch up the first tab opening.
  // We have to wait for it to be loaded before restoring
  // in order to correct override it.
  if (changeInfo && changeInfo.status == "complete") {
    tryRestore(tab);
  }

  Tabs.set(tab);
  if (hasBeenRestoredAlready) {
    scheduleSave();
  }

  let isNavigation = changeInfo && changeInfo.status == "loading" && tab.url && tab.url != "about:blank";
  if (isNavigation) {
    let session = sessions[tabId];
    if (session) {
      if (session.restoring) {
        delete session.restoring;
      } else {
        // Wipe session if we navigate to a new URL
        // We do not support history per tab yet
        //Session.unset(tabId);
      }
    }
  }
});

chrome.tabs.onActivated.addListener(function ({tabId, windowId}) {
  chrome.tabs.get(tabId, function (tab) {
    Tabs.set(tab);
    scheduleSave();
  });
});

chrome.tabs.onMoved.addListener(function (tabId, moveInfo) {
  chrome.tabs.get(tabId, function (tab) {
    Tabs.set(tab);
    scheduleSave();
  });
});

chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
  // Ignore close on browser shutdown or window closing
  if (removeInfo.isWindowClosing) {
    return;
  }

  Tabs.unset(tabId);
  Session.unset(tabId);
  scheduleSave();
});


/*
 * Sessions contains data about the content rendered into a specific tab. Such
 * an example this data would be the scroll position, or the form data.
 *
 * Various content scripts listens for such changes. One those happens they forward
 * a message to the background page.
 *
 * On such message, the content data is save or restored.
 */
const Session = {
  set(tabId, name, value) {
    let session = sessions[tabId];
    if (!session) {
      session = sessions[tabId] = {};
    }
    session[name] = value;
  },

  unset(tabId) {
    delete sessions[tabId];
  },
};

browser.runtime.onMessage.addListener(function(request, sender, reply) {
  if (request.type != "session") {
    return;
  }

  let tabId = sender.tab.id;
  switch (request.command) {
    case 'save':
      let { field, data } = request;
      Session.set(tabId, field, data);
      scheduleSave();
      break;

    case 'restore':
      reply(sessions[tabId]);
      break;
  }
});

/*
 * The following methods save the in-memory content to the disk.
 * At the moment those are pretty unoptimized as they do a full update every
 * time.
 */

const kSaveDelay = 4000; // in ms

let saveTimeout = null;

function scheduleSave() {
  saveTimeout && clearTimeout(saveTimeout);
  saveTimeout = setTimeout(save, kSaveDelay);
}

function save() {
  saveTimeout = null;

  Tabs.cleanup();

  chrome.storage.local.set({ tabs });
  chrome.storage.local.set({ sessions });
}
