// Watch for forms data

window.addEventListener("change", function (e) {
  saveForm(e.target);
}, true);
window.addEventListener("input", function (e) {
  saveForm(e.target);
}, true);

var forms = {};

// Compute a very naive Selector for the given element
function computeSelector(element) {
  // If the element has an id and is the first element to have this ID,
  // Use the id instead of xpath.
  if (element.id && document.getElementById(element.id) == element) {
    return "#" + element.id;
  }
  // Same thing for class name
  if (element.className) {
    let selector = element.tagName + "." +element.className.replace(/ /g, ".");
    if (document.querySelector(selector) == element) {
      return selector;
    }
  }
  let list = [];
  while(element.parentNode && element.parentNode.nodeType == document.ELEMENT_NODE) {
    let parent = element.parentNode;
    let idx = Array.indexOf(parent.children, element) + 1;
    let tagName = element.tagName.toLowerCase();
    if (idx > 1) {
      list.push(tagName + ":nth-child(" + idx + ")");
    } else {
      list.push(tagName);
    }
    element = parent;
  }
  return list.reverse().join(">");
}

// Returns null if there is no value
// or if it has a value which happen to be the default one
function getElementUserValue(element) {
  let tagName = element.tagName.toLowerCase();
  if (tagName == "input" || tagName == "textbox" || tagName == "textarea") {
    switch (element.type) {
      case "checkbox":
      case "radio":
        if (element.checked == element.defaultChecked) {
          return null;
        }
        return element.checked;
      case "file":
        // element.mozGetFileNameArray is only available in chrome?!
        break;
      default: // text, textarea
        if (element.value == element.defaultValue) {
          return null;
        }
        return element.value;
    }
  } else if (tagName == "select") {
    if (!element.multiple) {
      // <select>s without the multiple attribute are hard to determine the
      // default value, so assume we don't have the default.
      return element.value;
    } else {
      // <select>s with the multiple attribute are easier to determine the
      // default value since each <option> has a defaultSelected property
      let hasDefaultValue = false;
      let options = Array.map(element.options, opt => {
        hasDefaultValue = hasDefaultValue && (opt.selected == opt.defaultSelected);
        return opt.selected ? opt.value : -1;
      });
      if (hasDefaultValue) {
        return null;
      }
      return options.filter(ix => ix > -1);
    }
  }
  console.warn("Unsupported form element in session store: " + tagName, element);
  return null;
}

function restoreElementValue(element, value) {
  let tagName = element.tagName.toLowerCase();
  let eventType;
  if (tagName == "input" || tagName == "textbox" || tagName == "textarea") {
    switch (element.type) {
      case "checkbox":
      case "radio":
        if (element.checked == value) {
          return null;
        }
        element.checked = value;
        eventType = "change";
      case "file":
        // Not supported yet
        break;
      default: // text, textarea
        if (element.value == value) {
          return;
        }
        element.value = value;
        eventType = "input";
    }
  } else if (tagName == "select") {
    if (!element.multiple) {
      if (element.selectedIndex != -1 && element.options[element.selectedIndex].value == value) {
        return;
      }

      // find first option with matching aValue if possible
      for (let i = 0; i < element.options.length; i++) {
        if (element.options[i].value == value) {
          element.selectedIndex = i;
          eventType = "change";
          break;
        }
      }
    } else {
      Array.forEach(element.options, function(opt, index) {
        // don't worry about malformed options with same values
        opt.selected = value.indexOf(opt.value) > -1;

        // Only fire the event here if this wasn't selected by default
        if (!opt.defaultSelected) {
          eventType = "change";
        }
      });
    }
  }

  // Fire events for this element if applicable
  if (eventType) {
    fireEvent(element, eventType);
  }
}

function fireEvent(element, type) {
  let doc = element.ownerDocument;
  let event = doc.createEvent("UIEvents");
  event.initUIEvent(type, true, true, doc.defaultView, 0);
  element.dispatchEvent(event);
}

function saveForm(element) {
  let value = getElementUserValue(element);
  let selector = computeSelector(element);
  if (!value) {
    // Ensure cleaning up any previous value if the field is cleared
    if (selector in forms) {
      delete forms[selector];
      update("forms", forms);
    }
    return;
  }
  forms[selector] = value;
  update("forms", forms);
}

function restoreForms(forms) {
  for (let selector in forms) {
    try {
      let input = document.querySelector(selector);
      restoreElementValue(input, forms[selector]);
    } catch(e) {
      dump("error while restoring input at: "+selector+": "+e+"\n");
    }
  }
}
