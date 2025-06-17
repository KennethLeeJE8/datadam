// Chrome Extension Background Script - Autofill Extension
// This is a processed and deobfuscated version of eventPage.js

// Import browser APIs and utilities from common modules
import {
    browserAction as e,
    tabs as m,
    contextMenus as a,
    runtime as s,
    storage as n,
    alarms as t,
    getMessage as i,
    app_name as r,
    version as c,
    openOptionsPage as o,
    identity as l,
    tabs as d,
    storage_keys as u,
    // ... many other imports from common-e1dce6a4.js
} from "./common-e1dce6a4.js";

// Constants
const TIMEOUT_MS = 2000;
const DEBOUNCE_MS = 200;
const ERROR_BADGE = "❗";

// Global state variables
var ruleUpdateTimeout, badgeUpdateTimeout, alarmTimeout, storageTimeout, offscreenPort;

// Context menu IDs
const CONTEXT_MENU_EXECUTE = "cm_execute";
const CONTEXT_MENU_INSERT = "cm_insert";

// URL patterns for content script injection
const URL_PATTERNS = ["*://*/*", "file:///*"];

// Storage keys that should not trigger certain operations
const EXCLUDED_KEYS = [
    /* array of storage keys that are excluded from certain operations */
];

// Initialize empty objects for various caches and states
let fillCache = {};
let fieldCache = {};
let urlCache = {};
let tabCache = {};
let updateTimestamps = {};
let scriptRegistrations = {};
let pendingChanges = {};
let storageBuffers = {};

// Default tab query filter
const DEFAULT_TAB_QUERY = {
    discarded: false,
    status: "complete",
    url: URL_PATTERNS
};

// Text encoder/decoder for crypto operations
let textDecoder = new TextDecoder();
let textEncoder = new TextEncoder();

// Crypto function for decrypting stored data
async function decryptData(encryptedData, password) {
    try {
        // Decode base64 algorithm identifiers
        let algorithm = "PBKDF2";
        let keyAlgorithm = "AES-GCM";
        
        // Import the password as a crypto key
        let key = await crypto.subtle.importKey(
            "raw",
            textEncoder.encode(password),
            algorithm,
            false,
            ["decrypt"]
        );

        // Extract salt, IV, and encrypted content from the data
        let dataArray = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
        let encryptedContent = dataArray.slice(28);
        let iv = dataArray.slice(16, 28);
        let salt = dataArray.slice(0, 16);

        // Derive decryption key
        let derivedKey = await crypto.subtle.deriveKey(
            {
                name: algorithm,
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            key,
            {
                name: keyAlgorithm,
                length: 256
            },
            false,
            ["decrypt"]
        );

        // Decrypt the content
        let decrypted = await crypto.subtle.decrypt(
            {
                name: keyAlgorithm,
                iv: iv
            },
            derivedKey,
            encryptedContent
        );

        return textDecoder.decode(decrypted);
    } catch (error) {
        return "";
    }
}

// Execute autofill rules for a specific category
function executeRules(categoryId, tabId, forceExecute) {
    clearTabCache(tabId, forceExecute);
    
    // Get storage data and execute
    getStorageData([/* storage keys */], (data) => {
        let executionFunc = function() {
            sendMessageToTab(tabId, {
                type: "execute",
                data: { catnow: categoryId }
            }, handleTabError.bind(null, tabId));
        };

        if (data.catnow === categoryId) {
            executionFunc();
        } else {
            // Update storage first, then execute
            setStorageData({ catnow: categoryId }).then(executionFunc);
        }

        // Update context menu if needed
        if (data.other.menu) {
            updateContextMenu(categoryId);
        }
    });
}

// Calculate next day midnight timestamp
function getNextDayTimestamp() {
    let now = new Date();
    return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 0, 0
    ).getTime();
}

// Clear tab-specific caches
function clearTabCache(tabId, forced) {
    if (!forced && performance.now() - updateTimestamps[tabId] < TIMEOUT_MS) {
        return;
    }
    
    // Clear badge and reset caches
    e.setBadgeText({ tabId: tabId, text: "" }, handleError);
    fillCache = {};
    fieldCache = {};
    urlCache = {};
    tabCache = {};
    /* clear other caches */
}

// Send message to a specific tab
function sendMessageToTab(tabId, message, callback) {
    m.sendMessage(tabId, message, typeof callback === "function" ? callback : handleError);
}

// Update browser action title and badge
function updateBrowserAction(tabId) {
    getStorageData([/* keys for settings */], (data) => {
        let title = r + "\n" + i(/* localized string */) + data.settings;
        let options = data.options;
        
        let updateFunc = function(targetTabId) {
            e.setTitle({ tabId: targetTabId, title: title }, handleError);
            e.getBadgeText({ tabId: targetTabId }, (badgeText) => {
                if (!s.lastError && badgeText === ERROR_BADGE) {
                    e.setBadgeText({ tabId: targetTabId, text: "" }, handleError);
                }
            });
        };

        // Add version info to title if needed
        if (title.includes("version")) {
            title += " v" + c;
        }

        if (tabId) {
            updateFunc(tabId);
        } else {
            // Update all tabs
            m.query(DEFAULT_TAB_QUERY, (tabs) => {
                if (!s.lastError) {
                    try {
                        for (const tab of tabs) {
                            if (tab.id !== tabId) {
                                updateFunc(tab.id);
                            }
                        }
                    } catch (error) {
                        // Handle error silently
                    }
                }
            });
        }
    });
}

// Strip markdown headers from text
function stripMarkdownHeaders(text) {
    return text.replace(/^# .*$/gm, "").trim();
}

// Generic error handler
function handleError() {
    s.lastError;
}

// Fetch configuration updates
async function fetchUpdates() {
    try {
        let response = await fetch(i(/* update URL */));
        setStorageData({ k: await response.json() });
    } catch (error) {
        // Handle fetch error silently
    }
}

// Handle Google Sheets sync
function handleSheetsSync(token) {
    if (token) {
        getStorageData([/* sync-related keys */], (data) => {
            let syncEnabled = data.other.bisync;
            let docId = data.spreadsheetid;
            let email = data.email;
            let options = data.options;
            
            if (syncEnabled && docId && email) {
                // Make API call to sync data
                makeAPICall({
                    callback: handleSyncResponse,
                    headers: createAuthHeaders(token),
                    payload: {
                        function: i(/* function name */),
                        parameters: {
                            docId: docId,
                            e: email,
                            o: options,
                            lastMod: data.lastmod
                        }
                    },
                    url: i(/* API URL */)
                }).catch(() => {});
            }
        });
    } else {
        // Show disconnected state
        m.query(DEFAULT_TAB_QUERY, (tabs) => {
            if (!s.lastError) {
                try {
                    for (const tab of tabs) {
                        e.setTitle({
                            tabId: tab.id,
                            title: r + "\n" + "Disconnected from sync service"
                        }, handleError);
                        e.setBadgeText({ tabId: tab.id, text: ERROR_BADGE }, handleError);
                    }
                } catch (error) {
                    // Handle error silently
                }
            }
        });
    }
}

// Handle sync response from Google Sheets
function handleSyncResponse(response) {
    let result = response.response.result;
    if (result.data) {
        setStorageData({ isRestored: true }, () => {
            setStorageData(result.data);
        });
    }
}

// DEFAULT FIELD MATCHING RULES
// This is the core field matching configuration that shows how the extension
// identifies and matches form fields to stored values
const DEFAULT_RULES = {
    cats: [{
        k: "c1",
        n: "Sample address",
        s: "greenido.github.io"
    }],
    rules: JSON.stringify({
        // Name fields - uses regex patterns to match various name field formats
        r1: { t: 0, n: "/^(cc-)?name$/", v: "Full name", s: "", o: 1, c: "c1" },
        r2: { t: 0, n: '"honorific-prefix"', v: "Prefix/Title", s: "", o: 1, c: "c1" },
        r3: { t: 0, n: "/^(cc-)?given-name$/", v: "First name", s: "", o: 1, c: "c1" },
        r4: { t: 0, n: "/^(cc-)?additional-name$/", v: "Middle name", s: "", o: 1, c: "c1" },
        r5: { t: 0, n: "/^(cc-)?family-name$/", v: "Last name", s: "", o: 1, c: "c1" },
        r6: { t: 0, n: '"honorific-suffix"', v: "Suffix", s: "", o: 1, c: "c1" },
        
        // Address fields - matches autocomplete standard attributes
        r7: { t: 0, n: "street-address", v: "Street address - line 1, Street address - line 2, Street address - line 3", s: "", o: 1, c: "c1" },
        r8: { t: 0, n: "address-line1", v: "Street address - line 1", s: "", o: 1, c: "c1" },
        r9: { t: 0, n: "address-line2", v: "Street address - line 2", s: "", o: 1, c: "c1" },
        r10: { t: 0, n: "address-line3", v: "Street address - line 3", s: "", o: 1, c: "c1" },
        r11: { t: 0, n: "address-level2", v: "City/Town/Village", s: "", o: 1, c: "c1" },
        r12: { t: 0, n: "address-level1", v: "State/Province", s: "", o: 1, c: "c1" },
        r13: { t: 0, n: "postal-code", v: "Postal/Zip code", s: "", o: 1, c: "c1" },
        r14: { t: 0, n: '"country"', v: "Country code", s: "", o: 1, c: "c1" },
        r15: { t: 0, n: '"country-name"', v: "Country name", s: "", o: 1, c: "c1" },
        
        // Organization fields
        r16: { t: 0, n: '"organization-title"', v: "Job title", s: "", o: 1, c: "c1" },
        r17: { t: 0, n: '"organization"', v: "Company/Organization", s: "", o: 1, c: "c1" },
        
        // Contact fields
        r18: { t: 0, n: '"email"', v: "Email", s: "", o: 1, c: "c1" },
        r19: { t: 0, n: '"username"', v: "Username", s: "", o: 1, c: "c1" },
        
        // Phone number fields - supports various telephone formats
        r20: { t: 0, n: '"tel"', v: "1-888-444-2222", s: "", o: 1, c: "c1" },
        r21: { t: 0, n: '"tel-country-code"', v: "1", s: "", o: 1, c: "c1" },
        r22: { t: 0, n: '"tel-national"', v: "888-444-2222", s: "", o: 1, c: "c1" },
        r23: { t: 0, n: '"tel-area-code"', v: "888", s: "", o: 1, c: "c1" },
        r24: { t: 0, n: '"tel-local"', v: "444-2222", s: "", o: 1, c: "c1" },
        r25: { t: 0, n: '"tel-extension"', v: "Extension", s: "", o: 1, c: "c1" }
    }),
    advanced: [],
    exceptions: [],
    textclips: [],
    variables: [],
    lastUpdate: null
};

// RULE STRUCTURE EXPLANATION:
// t: Rule type (0 = field matching rule)
// n: Pattern to match against field attributes (supports regex /pattern/ or exact "string")
// v: Value to fill in the matched field
// s: Site filter (empty = applies to all sites, or specific domain)
// o: Overwrite setting (1 = overwrite existing values)
// c: Category ID this rule belongs to

// Context menu management
function updateContextMenu(categories, currentCategory, profileName) {
    getStorageData([/* menu-related keys */], async (data) => {
        if (!Object.keys(data).length) return;
        
        categories = categories || data.categories;
        currentCategory = currentCategory !== undefined ? currentCategory : data.currentCategory;
        profileName = profileName || data.profileName || "";

        let allContexts = ["all"];
        let editableContexts = ["editable"];
        let mediaContexts = ["audio", "editable", "frame", "image", "link", "page", "selection", "video"];
        let textClips = data.textclips;

        // Clear existing menu items
        await a.removeAll();

        // Add basic menu items
        createMenuItem({
            id: "cm_add_one",
            contexts: editableContexts,
            title: "Add Rule"
        });
        
        createMenuItem({
            id: "cm_add_all",
            contexts: allContexts,
            title: "Add Rules"
        });
        
        createMenuItem({
            id: CONTEXT_MENU_EXECUTE,
            contexts: allContexts,
            title: "Execute"
        });

        // Build category menu structure based on menu style
        let menuIndicator = "⬤   ";
        let executePrefix = CONTEXT_MENU_EXECUTE + "_";
        
        let allProfilesItem = {
            id: executePrefix + "1",
            parentId: CONTEXT_MENU_EXECUTE,
            contexts: allContexts,
            title: /* "All Profiles" */ + (profileName ? " (" + profileName + ")" : "")
        };
        
        let unfiledItem = {
            id: executePrefix + "2",
            parentId: CONTEXT_MENU_EXECUTE,
            contexts: allContexts,
            title: "Unfiled"
        };

        // Create menu structure based on menu style setting
        switch (data.menuStyle) {
            case 0: // Hierarchical menu
                // Build nested menu structure from category names
                break;
                
            case 1: // Alphabetical grouping
                // Group categories alphabetically
                break;
                
            case 2: // Radio button style
                // Create radio button menu items
                break;
        }

        // Add text clips submenu if available
        if (textClips.length) {
            createMenuItem({
                id: CONTEXT_MENU_INSERT,
                contexts: editableContexts,
                title: "Insert"
            });
            
            // Build text clips menu structure
            // ...
        }

        // Add separator and options
        createMenuItem({
            id: "cm_separator",
            contexts: ["all"],
            type: "separator"
        });
        
        createMenuItem({
            id: "cm_options",
            contexts: ["all"],
            title: "Options"
        });
    });
}

// Helper function to create menu items
function createMenuItem(properties) {
    a.create(properties, handleError);
}

// Update context menu for specific category
function updateMenuForCategory(categoryId) {
    updateContextMenu(undefined, categoryId);
}

// Handle browser action clicks
function handleBrowserActionClick(info, tab, editable, type, slug) {
    if (tab === undefined || !tab.id) {
        tab = info;
    }
    
    sendMessageToTab(tab.id, {
        type: "sW", // "show window" or similar
        data: {
            editable: info.editable && !!editable,
            frame: !!info.frameId,
            slug: slug,
            type: type
        }
    }, handleTabError.bind(null, tab.id));
}

// Content script management
function updateContentScripts() {
    if (typeof browser.scripting !== 'undefined') {
        /* iterate through script configurations and update them */
    }
}

// Register/unregister individual content scripts
async function manageContentScript(scriptId) {
    if (!typeof browser.scripting !== 'undefined') return;
    
    let script;
    switch (scriptId) {
        case "content_script_1":
            try {
                // Unregister existing script
                if (typeof browser.scripting !== 'undefined') {
                    let scriptQuery = { ids: [scriptId] };
                    script = await browser.scripting.getScripts(scriptQuery);
                    if (script.length) {
                        await browser.scripting.unregister(scriptQuery);
                    }
                } else {
                    await scriptRegistrations[scriptId]?.unregister();
                }
            } catch (error) {
                // Handle error silently
            }
            break;
            
        case "content_script_2":
            try {
                let scriptConfig = {
                    js: [{ code: i("content_script") }],
                    matches: URL_PATTERNS
                };
                
                if (typeof browser.scripting !== 'undefined') {
                    script = await browser.scripting.getScripts({ ids: [scriptId] });
                    if (script.length) {
                        scriptConfig.id = scriptId;
                        await browser.scripting.update([scriptConfig]);
                    }
                } else {
                    await scriptRegistrations[scriptId]?.unregister();
                    scriptRegistrations[scriptId] = await browser.scripting.registerContentScript(scriptConfig);
                }
            } catch (error) {
                // Handle error silently
            }
            break;
    }
}

// Handle tab communication errors
function handleTabError(tabId) {
    let error = s.lastError;
    if (error && error.message?.includes(i(/* error message key */))) {
        // Show update alert for tab
        /* execute script to show alert */
    }
}

// Main message handler for extension communication
function handleMessage(message, sender, sendResponse) {
    if (!sender?.tab) return;
    
    let data = message.data;
    
    switch (message.type) {
        case "bM": // Build Menu
            clearTimeout(badgeUpdateTimeout);
            badgeUpdateTimeout = setTimeout(() => {
                getStorageData(["categories"], (storageData) => {
                    updateContextMenu(storageData.categories, data.currentCategory);
                });
            }, DEBOUNCE_MS);
            break;
            
        case "cH": // Clear History
            sendMessageToTab(sender.tab.id, { type: "cH" });
            break;
            
        case "eR": // Execute Rules
            return executeRules(data.currentCategory, sender.tab.id, data.force)
                .finally(() => { sendResponse({}); }), true;
                
        case "gTI": // Get Tab ID
            return sendResponse({ tabId: sender.tab.id }), true;
            
        case "iU": // Import URL
            return fetch(data.url, /* fetch options */)
                .then((response) => {
                    if (response.ok) {
                        response.text().then((text) => {
                            sendResponse({ csv: text.trim() });
                        });
                    } else {
                        sendResponse({
                            error: /* localized server error */ + " (" + /* format response */ + ")"
                        });
                    }
                })
                .catch((error) => {
                    sendResponse({
                        error: /* localized request error */ + " (" + error + ")"
                    });
                }), true;
                
        case "oO": // Open Options
            s.openOptionsPage();
            break;
            
        case "rB": // Reset Badge
            m.query(DEFAULT_TAB_QUERY, (tabs) => {
                if (!s.lastError) {
                    try {
                        for (const tab of tabs) {
                            e.getBadgeText({ tabId: tab.id }, (badgeText) => {
                                if (!s.lastError && badgeText === ERROR_BADGE) {
                                    e.setTitle({ tabId: tab.id, title: r }, handleError);
                                    e.setBadgeText({ tabId: tab.id, text: "" }, handleError);
                                }
                            });
                        }
                    } catch (error) {
                        // Handle error silently
                    }
                }
            });
            break;
            
        case "rC": // Reset Cache
            clearTabCache(sender.tab.id, data.force);
            break;
            
        case "rD": // Request Data (sync)
            /* handle Google Sheets auth and sync */;
            break;
            
        case "sC": // Save Category
            // Complex category saving logic with Google Sheets sync
            return Promise.resolve(), true;
            
        case "sR": // Save Rules
            // Complex rule saving logic with field matching and sync
            return Promise.resolve(), true;
            
        case "uS": // Update Stats
            // Update fill statistics and badge counts
            /* stats update logic */;
            break;
            
        // ... more message types
    }
    
    sendResponse({});
}

// Event Listeners

// Browser action click
e.onClicked.addListener(handleBrowserActionClick);

// Alarm handler for periodic tasks
t.onAlarm.addListener(function(alarm) {
    if (alarm.name === "daily_sync") {
        getStorageData(["sync", "options", "email", "userId"], async (data) => {
            // Handle periodic sync and cleanup tasks
            // Update field rules, expire old categories, sync with Google Sheets
        });
    }
});

// Context menu click handler
a.onClicked.addListener(function(info, tab) {
    if (info.menuItemId === "cm_options") {
        s.openOptionsPage();
    } else if (info.menuItemId.indexOf("_add") > -1) {
        handleBrowserActionClick(info, tab, info.menuItemId.indexOf("one") > -1, "gen");
    } else if (info.parentMenuItemId.startsWith(CONTEXT_MENU_EXECUTE)) {
        executeRules(+info.menuItemId.slice((CONTEXT_MENU_EXECUTE + "_").length), tab.id, true);
    } else if (info.menuItemId.startsWith(CONTEXT_MENU_INSERT)) {
        sendMessageToTab(tab.id, {
            type: "iT", // Insert Text
            data: { id: info.menuItemId.replace(CONTEXT_MENU_INSERT + "_", "") }
        }, handleTabError.bind(null, tab.id));
    }
});

// Port connection handler (for options page communication)
s.onConnect.addListener(function(port) {
    if (port.name === "options_port") {
        offscreenPort = port;
        offscreenPort.onDisconnect.addListener(() => {
            if (!s.lastError) {
                offscreenPort = undefined;
            }
        });
        offscreenPort.onMessage.addListener(handleMessage);
    }
});

// Extension installation/update handler
s.onInstalled.addListener(async function(details) {
    // Initialize default data structures
    let localData, syncData, rulesData;
    
    try {
        localData = await n.local.get(DEFAULT_RULES);
        syncData = await n.sync.get({ sync: {}, options: {}, email: "", userId: "" });
    } catch (error) {
        localData = DEFAULT_RULES;
        syncData = { sync: {}, options: {}, email: "", userId: "" };
    }

    // Handle different installation scenarios
    switch (details.reason) {
        case s.OnInstalledReason.INSTALL:
            // Open quickstart page for new installations
            m.create({ url: i(/* quickstart URL */) + "quickstart" });
            break;
            
        case s.OnInstalledReason.UPDATE:
            // Handle updates and migrations
            if (localData.lastUpdate === null) {
                // Migrate old data format
                // ...
            }
            localData.lastUpdate = Date.now();
            break;
    }

    // Set up periodic alarms
    if (!await t.get("daily_sync")) {
        await t.create("daily_sync", {
            periodInMinutes: 1440, // Daily
            when: getNextDayTimestamp()
        });
    }

    // Save initial data
    await setStorageData(localData);
    await setStorageData(syncData);

    // Update context menu if enabled
    if (syncData.other.menu) {
        updateContextMenu(localData.categories, syncData.currentCategory, syncData.profileName);
    }
});

// Main message listener
s.onMessage.addListener(handleMessage);

// Extension startup handler
s.onStartup.addListener(async function() {
    // Handle startup sync if configured
    getStorageData([/* sync keys */], (data) => {
        let email = data.email;
        let userId = data.userId;
        let syncEnabled = !!data.options.bisync;
        
        if (email && userId && syncEnabled) {
            /* handle Google Sheets auth and sync */;
        }
    });
    
    await fetchUpdates();
});

// Storage change handler
n.onChanged.addListener(function(changes, areaName) {
    if (areaName === "session") return;
    
    let changeKeys = Object.keys(changes);
    if (changeKeys.length === 1 && EXCLUDED_KEYS.includes(changeKeys[0])) {
        return;
    }

    let isLocalChange = areaName === "local";
    if (isLocalChange) {
        for (const key of changeKeys) {
            if (key.startsWith("rule_") && !EXCLUDED_KEYS.includes(key)) {
                storageBuffers[key] = changes[key].newValue;
            }
        }
    }

    clearTimeout(storageTimeout);
    storageTimeout = setTimeout(() => {
        // Handle batched storage changes
        getStorageData([/* required keys */], async (data) => {
            if (!Object.keys(data).length) return;
            
            // Process storage changes and sync if needed
            // Update content scripts, sync with Google Sheets, etc.
        });
    }, DEBOUNCE_MS);
});