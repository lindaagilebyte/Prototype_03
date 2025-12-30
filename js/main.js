import { Customer } from './customer.js';
import * as Utils from './utils.js';
import * as UI from './ui.js';
import * as Clues from './clues.js';
import * as Diagnosis from './diagnosis.js';

// --- App State ---
const customer = new Customer(Utils.namePool, Utils.clothesColorPool, Utils.skinTonePool);
const ui = UI.getElements();
let currentVisitState = Utils.VisitState.NoActiveVisit;
let currentDiagnosis = null;
let typePopupVisible = false;
let deathPopupVisible = false;
let baseMouthBottom = 28;
let greetingShowing = false;

// --- Minimal Local Save (single truth, no locks, explicit actions only) ---
const SAVE_KEY = 'proto.activeRun.v1';
// Saved for debug only; ignored on restore
let savedPhaseForDebug = 'READY';

// In-memory inbox: last received package (discarded on restore/reset)
let mqttInboxLatest = null;
let playerLevelLatest = null;

// ---- MQTT (shared) ----
const MQTT_TOPIC_BASE = 'thirza/alchemy/v1';
const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
let mqttClient = null;
let mqttConnected = false;
let currentRoomId = null; // Current room ID (4-digit)

// Load room ID from localStorage on init
function loadRoomId() {
  const saved = localStorage.getItem('clinic.roomId');
  if (saved && /^\d{4}$/.test(saved)) {
    currentRoomId = saved;
    return saved;
  }
  return null;
}
loadRoomId();

// Save room ID to localStorage
function saveRoomId(roomId) {
  if (roomId && /^\d{4}$/.test(roomId)) {
    currentRoomId = roomId;
    localStorage.setItem('clinic.roomId', roomId);
    return true;
  } else {
    currentRoomId = null;
    localStorage.removeItem('clinic.roomId');
    return false;
  }
}
// --- Start Screen Gate (separate from VisitState) ---
function getAlchemyUrl(roomId) {
  return `https://thirza0.github.io/ChineseAlchemy_Prototype/?room_id=${roomId}`;
}

function isValidRoomId(roomId) {
  return !!roomId && /^\d{4}$/.test(roomId);
}

function showAdminOpenAlchemyButtonIfReady() {
  const btn = document.getElementById('btnAdminOpenAlchemy');
  if (!btn) return;

  if (isValidRoomId(currentRoomId)) {
    btn.style.display = 'inline-block';
  } else {
    btn.style.display = 'none';
  }
}

function bindAdminOpenAlchemyButton() {
  const btn = document.getElementById('btnAdminOpenAlchemy');
  if (!btn) return;

  btn.onclick = () => {
    if (!isValidRoomId(currentRoomId)) return;
    const url = getAlchemyUrl(currentRoomId);
    window.open(url, '_blank', 'noopener,noreferrer');
    log(`[StartGate] Admin opened alchemy tab: ${url}`);
  };
}

function bindStartScreenGate() {
  const startScreen = document.getElementById('startScreen');
  const appMain = document.getElementById('appMain');
  const input = document.getElementById('startRoomIdInput');
  const btnConfirm = document.getElementById('btnStartConfirm');
  const btnProceed = document.getElementById('btnStartProceed');
  const stateA = document.getElementById('startStateA');
  const stateB = document.getElementById('startStateB');
  

  if (!startScreen || !appMain || !input || !btnConfirm || !btnProceed || !stateA || !stateB) {
    // If the DOM is missing, don't block the prototype (fail open)
    return;
  }
  

  // Normalize input to digits, max 4 (same behavior as current handoff)
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
  });

  // If we already have a valid saved roomId, skip start screen
  if (isValidRoomId(currentRoomId)) {
    startScreen.style.display = 'none';
    appMain.style.display = 'flex';
    showAdminOpenAlchemyButtonIfReady();
    return;
  }

  // Otherwise: enforce start screen
  startScreen.style.display = 'block';
  appMain.style.display = 'none';
  
  stateA.style.display = 'block';
  stateB.style.display = 'none';
  

  btnConfirm.onclick = () => {
    const roomId = input.value.trim();
    if (!isValidRoomId(roomId)) {
      alert('房間 ID 必須是 4 位數字。');
      return;
    }

    // Persist + update subscriptions (same as before)
    saveRoomId(roomId);
    updateMqttSubscriptions();
    showAdminOpenAlchemyButtonIfReady();

    const url = getAlchemyUrl(roomId);

    // Open the external prototype. Avoid 'noopener' here because it can cause window.open to return null
    // even when the tab actually opens.
    const w = window.open(url, '_blank');
    
    // If blocked, w will be null. Still allow the user to proceed, but show a message.
    if (!w) {
      alert('瀏覽器可能阻擋了新分頁開啟。請手動開啟外部煉丹Prototype，或使用上方「重新開啟煉丹Prototype（管理用）」按鈕。');
    } else {
      // Prevent the new tab from having access to this tab (noopener behavior without breaking return value logic)
      try { w.opener = null; } catch (e) {}
    }
    
    // Unlock proceed + swap instructions
    stateA.style.display = 'none';
    stateB.style.display = 'block';
    
    

    log(`[StartGate] Room ID set: ${roomId}`);
    log(`[StartGate] Opened alchemy tab: ${url}`);
  };

  btnProceed.onclick = () => {
    startScreen.style.display = 'none';
    appMain.style.display = 'flex';
  };
}


// Get MQTT topic for publishing (room-specific if room ID exists, otherwise public)
function getMqttPublishTopic() {
  if (currentRoomId) {
    return `${MQTT_TOPIC_BASE}/${currentRoomId}`;
  }
  return MQTT_TOPIC_BASE;
}

// Get MQTT topics for subscribing (both room-specific and public)
function getMqttSubscribeTopics() {
  const topics = [MQTT_TOPIC_BASE]; // Always subscribe to public topic
  if (currentRoomId) {
    topics.push(`${MQTT_TOPIC_BASE}/${currentRoomId}`);
  }
  return topics;
}

function publishDiagnosisExportData(reason) {
  if (!mqttClient || !mqttConnected) {
    log('[MQTT] ERROR: not connected; export skipped.');
    return false;
  }
  if (!customer?.name) {
    log('[MQTT] ERROR: no active customer name; export skipped.');
    return false;
  }
  if (!currentDiagnosis?.truth || !currentDiagnosis?.diagnosed) {
    log('[MQTT] ERROR: no diagnosis data available; export skipped.');
    return false;
  }

  // EXACTLY match diagnosis.js exportData shape
  const exportData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    diagnosis: {
      truth: currentDiagnosis.truth,
      diagnosed: {
        customerName: customer.name,
        constitution: currentDiagnosis.diagnosed.constitution,
        needs: currentDiagnosis.diagnosed.needs,
        toxicity: currentDiagnosis.diagnosed.toxicity
      }
    }
  };

  const topic = getMqttPublishTopic();
  mqttClient.publish(topic, JSON.stringify(exportData), { retain: true });
  log(`[MQTT] exported diagnosis package to ${topic} (retained): patientName=${customer.name}`);
  return true;
}


function getCheckpoint() {
  // In your code, "customer exists" is effectively: customer.name !== null
  return (customer.name === null) ? 'NO_CUSTOMER' : 'HAS_CUSTOMER';
}

function snapshotCustomer() {
  if (customer.name === null) return null;

  return {
    name: customer.name,
    constitution: customer.constitution,
    needs: customer.needs, // already [{code,isMain}]
    primaryNeedCode: customer.primaryNeedCode,
    maxToxicity: customer.maxToxicity,
    currentToxicity: customer.currentToxicity,
    relationship: customer.relationship,
    previousSatisfaction: customer.previousSatisfaction,
    alive: customer.alive,
    clothesColor: customer.clothesColor,
    skinBaseColor: customer.skinBaseColor,
    skinCurrentColor: customer.skinCurrentColor
  };
}

function applyCustomerSnapshot(data) {
  // Always start from a clean base
  customer.reset();

  if (!data) return;

  customer.name = data.name ?? null;
  customer.constitution = data.constitution ?? null;
  customer.needs = Array.isArray(data.needs) ? data.needs : [];
  customer.primaryNeedCode = data.primaryNeedCode ?? null;
  customer.maxToxicity = data.maxToxicity ?? null;
  customer.currentToxicity = typeof data.currentToxicity === 'number' ? data.currentToxicity : 0;

  customer.relationship = data.relationship ?? 'New';
  customer.previousSatisfaction = data.previousSatisfaction ?? 'None';
  customer.alive = (typeof data.alive === 'boolean') ? data.alive : true;

  customer.clothesColor = data.clothesColor ?? null;
  customer.skinBaseColor = data.skinBaseColor ?? null;
  customer.skinCurrentColor = data.skinCurrentColor ?? null;
}

function loadRun() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('[SAVE] loadRun failed:', e);
    return null;
  }
}

function saveRun(reason) {
  try {
    const run = {
      checkpoint: getCheckpoint(),
      customer: snapshotCustomer(),
      updatedAt: Date.now(),
      reason: reason || ''
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(run));

    log(`[SAVE] saved (${run.checkpoint})${reason ? ' : ' + reason : ''}`);
  } catch (e) {
    log('[SAVE] save failed');
  }
}

// Boot restore: restore customer if present, but ALWAYS return to safe checkpoint
function restoreFromSave() {
  const run = loadRun();

  if (!run) {
    log('[SAVE] restore: none');
    customer.reset();
  } else if (run.checkpoint !== 'HAS_CUSTOMER' || !run.customer) {
    log('[SAVE] restore: NO_CUSTOMER');
    customer.reset();
  } else {
    log('[SAVE] restore: HAS_CUSTOMER');
    applyCustomerSnapshot(run.customer);
  }

  // Always force safe checkpoint
  currentVisitState = Utils.VisitState.NoActiveVisit;
  currentDiagnosis = null;
  typePopupVisible = false;
  deathPopupVisible = false;
  greetingShowing = false;
  // ignore any saved phase; discard pending inbox
  savedPhaseForDebug = 'READY';
  mqttInboxLatest = null;

  // Ensure handoff/postAlchemy/alchemyInput are not left visible
  const popupOverlay = document.getElementById('popupOverlay');
  if (popupOverlay) popupOverlay.style.display = 'none';

  const handoffScreen = document.getElementById('handoffScreen');
  if (handoffScreen) handoffScreen.style.display = 'none';

  const postAlchemyScreen = document.getElementById('postAlchemyScreen');
  if (postAlchemyScreen) postAlchemyScreen.style.display = 'none';

  const alchemyInputUI = document.getElementById('alchemyInputUI');
  if (alchemyInputUI) alchemyInputUI.style.display = 'none';
}


// Game data (loaded from CSV)
let needsData = [];
let cluesData = [];
let recipesData = [];

// Current visit clue selection
let currentClueSelection = null;

function popupActive() {
  // Check if any popup is visible
  const popupOverlay = document.getElementById('popupOverlay');
  if (popupOverlay && popupOverlay.style.display === 'flex') {
    // Check which popup is active
    const postAlchemy = document.getElementById('postAlchemyScreen');
    const handoff = document.getElementById('handoffScreen');
    const alchemyInput = document.getElementById('alchemyInputUI');
    if ((postAlchemy && postAlchemy.style.display === 'block') ||
        (handoff && handoff.style.display === 'block') ||
        (alchemyInput && alchemyInput.style.display === 'block')) {
      return true;
    }
  }
  return typePopupVisible || deathPopupVisible;
}

function log(line) {
  UI.logLine(ui, line);
}

function updateStatusAndUI() {
  UI.updateStatus(ui, customer, currentVisitState);
  UI.updateCustomerSprite(ui, customer, currentVisitState, Utils);
  UI.updateButtons(ui, {
    popupActive: popupActive(),
    customer,
    visitState: currentVisitState,
    diagnosis: currentDiagnosis
  });
  updateGameScreenControls();

  // Hide popup overlay if not in any popup state
  if (currentVisitState === Utils.VisitState.NoActiveVisit && !popupActive()) {
    UI.hidePopupOverlay(ui);
  }
}

// Expose for diagnosis.js
window.updateStatusAndUI = updateStatusAndUI;

function updateGameScreenControls() {
  // If diagnosis overlay is active, hide all center buttons
  const diagnosisOverlay = document.getElementById('diagnosisOverlay');
  const diagnosisActive = diagnosisOverlay && diagnosisOverlay.classList.contains('active');
  
  if (diagnosisActive) {
    UI.showOnlyButton(ui, null);
    return;
  }
  
  if (!customer.alive) {
    UI.showOnlyButton(ui, null);
    return;
  }
  if (currentVisitState === Utils.VisitState.NoActiveVisit) {
    UI.showOnlyButton(ui, 'btnSpawn');
  } else if (currentVisitState === Utils.VisitState.VisitInProgress) {
    if (customer.constitution === null) {
      UI.showOnlyButton(ui, 'btnClick');
    } else if (greetingShowing) {
      // Hide button while greeting is showing
      UI.showOnlyButton(ui, null);
    } else if (currentDiagnosis === null) {
      UI.showOnlyButton(ui, 'btnDiagnose');
    } else {
      UI.showOnlyButton(ui, 'btnLeave');
    }
  }
}

function showCustomerGreeting() {
  // Find main need
  const mainNeed = customer.needs.find(n => n.isMain);
  if (!mainNeed) {
    console.log('No main need found');
    greetingShowing = false;
    updateStatusAndUI();
    return;
  }
  
  // Find greeting text from needsData
  const needData = needsData.find(n => n.code === mainNeed.code);
  if (!needData || !needData.greetingText) {
    console.log('No greeting text found for need:', mainNeed.code);
    greetingShowing = false;
    updateStatusAndUI();
    return;
  }
  
  console.log('Showing greeting:', needData.greetingText);
  // greetingShowing should already be set to true by caller
  if (!greetingShowing) {
    greetingShowing = true;
    updateStatusAndUI(); // Hide buttons
  }
  
  // Show greeting balloon (separate from diagnosis speech balloon)
  const balloon = document.getElementById('greetingBalloon');
  if (!balloon) {
    console.error('Greeting balloon element not found!');
    return;
  }
  
  balloon.textContent = needData.greetingText;
  balloon.style.display = 'block';
  balloon.style.visibility = 'visible';
  balloon.style.opacity = '1';
  balloon.classList.add('active');
  balloon.classList.remove('fade-out');
  
  console.log('Greeting balloon shown:', needData.greetingText);
  
  // Hide after 3 seconds (longer for greeting)
  setTimeout(() => {
    balloon.classList.add('fade-out');
    setTimeout(() => {
      balloon.classList.remove('active', 'fade-out');
      balloon.style.display = 'none';
      balloon.style.visibility = 'hidden';
      greetingShowing = false;
      updateStatusAndUI(); // Show "Run Diagnosis" button
    }, 300);
  }, 3000);
}

// --- Button Handlers ---
ui.btnReset.onclick = () => {
  mqttInboxLatest = null;
  savedPhaseForDebug = 'READY';
  customer.reset();
  currentVisitState = Utils.VisitState.NoActiveVisit;
  currentDiagnosis = null;
  typePopupVisible = false;
  deathPopupVisible = false;
  UI.hidePopupOverlay(ui);
  ui.logEl.textContent = '';
  log('*** ADMIN: customer reset to fresh state. ***');
  updateStatusAndUI();
  saveRun('btnReset');
};
bindAdminOpenAlchemyButton();
showAdminOpenAlchemyButtonIfReady();
bindStartScreenGate();

ui.btnSpawn.onclick = () => {
  if (!customer.alive) return;
  if (currentVisitState !== Utils.VisitState.NoActiveVisit) {
    log('InitializeCustomerVisit ignored (visit already in progress).');
    return;
  }
  
  // First-time setup: assign name and visuals
  const isFirstEver = customer.name === null;
  customer.assignNameAndVisuals();
  
  if (isFirstEver) {
    log(`Name assigned: ${customer.name}.`);
    log(`Visuals: clothesColor=${customer.clothesColor}, skinBase=${customer.skinBaseColor}.`);
  }
  
  // Needs management
  if (customer.needs.length === 0) {
    // First visit ever: initialize needs
    customer.initializeNeeds(needsData);
    const needsCodes = customer.needs.map(n => n.code + (n.isMain ? '(main)' : '')).join('');
    log(`Needs initialized: ${needsCodes}`);
    const needsDetails = customer.needs.map(n => {
      const data = needsData.find(nd => nd.code === n.code);
      return `  ${n.code}: ${data.label}`;
    }).join('\n');
    log(`Needs details:\n${needsDetails}`);
  } else {
    // Subsequent visit: check for need changes
    log('Checking for need changes...');
    const changes = customer.updateSecondaryNeeds(needsData);
    if (changes) {
      if (changes.removed.length > 0) {
        log(`  Removed: ${changes.removed.join(', ')}`);
      }
      if (changes.added.length > 0) {
        log(`  Added: ${changes.added.join(', ')}`);
      }
    } else {
      log('  No secondary need changes.');
    }
    const needsCodes = customer.needs.map(n => n.code + (n.isMain ? '(main)' : '')).join('');
    log(`Current needs: ${needsCodes}`);
  }
  
  currentVisitState = Utils.VisitState.VisitInProgress;
  currentDiagnosis = null;
  log('Customer appears for a new visit.');
  
  // If constitution already assigned (returning customer), show greeting immediately
  if (customer.constitution !== null) {
    // Set flag immediately to prevent button from showing
    greetingShowing = true;
    updateStatusAndUI(); // Hide button immediately

    
    // Small delay to let customer sprite appear first
    setTimeout(() => {
      showCustomerGreeting();
    }, 300);
  }
  
  // Select clues for this visit
  currentClueSelection = Clues.selectCluesForVisit(customer, cluesData, needsData);
  log(`Selected ${currentClueSelection.selectedClues.length} clues for this visit.`);
  
  // Log confidence totals
  const confLog = needsData.map(need => {
    const conf = currentClueSelection.confidences[need.code] || 0;
    const hasNeed = customer.needs.some(n => n.code === need.code);
    const marker = hasNeed ? '✓' : ' ';
    return `  [${marker}] ${need.code}: ${conf}`;
  }).join('\n');
  log(`Diagnosis Confidence totals:\n${confLog}`);
  
  // Log warnings if any
  if (currentClueSelection.warnings.length > 0) {
    currentClueSelection.warnings.forEach(warning => log(warning));
  }
  
  // Log selected clues (just IDs and methods for now)
  const cluesList = currentClueSelection.selectedClues.map(c => `${c.id}(${c.method})`).join(', ');
  log(`Clues: ${cluesList}`);
  
  updateStatusAndUI();
  saveRun('btnSpawn');
};

ui.btnClick.onclick = () => {
  if (!customer.alive) return;
  if (currentVisitState !== Utils.VisitState.VisitInProgress) {
    log('ClickCustomer ignored (no visit in progress).');
    return;
  }
  if (customer.constitution === null) {
    customer.assignConstitution(Utils.constitutionTypes);
    log(`Constitution assigned: ${customer.constitution}.`);
    UI.showTypePopup(ui, customer);
    typePopupVisible = true;
    deathPopupVisible = false;
    
    // Show greeting after type popup is closed
    // We'll trigger it when popup closes
  } else {
    log('ClickCustomer ignored (constitution already assigned).');
  }
  updateStatusAndUI();
  saveRun('btnClick:assignConstitution');
};

ui.btnDiagnose.onclick = () => {
  if (!customer.alive) return;
  if (currentVisitState !== Utils.VisitState.VisitInProgress) {
    log('RunDiagnosis ignored (no visit in progress).');
    return;
  }
  if (customer.constitution === null) {
    log('RunDiagnosis ignored (constitution not assigned yet).');
    return;
  }
  if (currentDiagnosis !== null) {
    log('RunDiagnosis ignored (diagnosis already done this visit).');
    return;
  }
  
  // Check if diagnosis overlay is already active
  const diagnosisOverlay = document.getElementById('diagnosisOverlay');
  if (diagnosisOverlay.classList.contains('active')) {
    log('RunDiagnosis ignored (diagnosis already in progress).');
    return;
  }
  
  // Start interactive diagnosis phase
  log('Starting diagnosis...');
  
  Diagnosis.startDiagnosis(customer, currentClueSelection, needsData, (diagnosedStateFromPopup) => {
    // Diagnosis complete callback - receives diagnosed state from popup
    
    // TRUTH / INTERNAL STATE (what the system knows)
    const truthState = {
      constitution: customer.constitution,
      needs: customer.needs.map(n => ({ code: n.code, isMain: n.isMain })),
      toxicity: {
        current: customer.currentToxicity,
        max: customer.maxToxicity
      }
    };
    
    // DIAGNOSED / PLAYER-OBSERVED STATE (what player discovered - may be incomplete)
    const diagnosedState_final = diagnosedStateFromPopup || {
      constitution: null,
      needs: [],
      toxicity: null,
      collectedConfidences: {}
    };
    
    // Store both in currentDiagnosis
    currentDiagnosis = {
      truth: truthState,
      diagnosed: diagnosedState_final
    };
    
    // Sort needs for display: main needs first
    const sortedTruthNeeds = [...truthState.needs].sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return 0;
    });
    const sortedDiagnosedNeeds = [...diagnosedState_final.needs].sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return 0;
    });
    
    // Log both states clearly
    const truthNeedsSummary = sortedTruthNeeds
      .map(n => n.code)
      .join(', ');
    
    log('=== TRUTH / INTERNAL STATE ===');
    log(`Constitution: ${truthState.constitution}`);
    log(`Needs: ${truthNeedsSummary}`);
    log(`Toxicity: ${truthState.toxicity.current}/${truthState.toxicity.max}`);
    
    log('=== DIAGNOSED / PLAYER-OBSERVED STATE ===');
    if (diagnosedState_final.constitution) {
      log(`Constitution: ${diagnosedState_final.constitution}`);
    } else {
      log(`Constitution: Not diagnosed`);
    }
    
    if (diagnosedState_final.needs && diagnosedState_final.needs.length > 0) {
      const diagnosedNeedsSummary = sortedDiagnosedNeeds
        .map(n => n.code)
        .join(', ');
      log(`Needs: ${diagnosedNeedsSummary}`);
    } else {
      log(`Needs: Not diagnosed`);
    }
    
    if (diagnosedState_final.toxicity) {
      // Toxicity is now a string term (微毒/積毒/深毒/劇毒/未明), not an object
      if (typeof diagnosedState_final.toxicity === 'string') {
        log(`Toxicity: ${diagnosedState_final.toxicity}`);
      } else {
        // Legacy format (shouldn't happen, but handle it)
        log(`Toxicity: ${diagnosedState_final.toxicity.current}/${diagnosedState_final.toxicity.max}`);
      }
    } else {
      log(`Toxicity: Not diagnosed`);
    }
    
    updateStatusAndUI();
  });
};

ui.btnLeave.onclick = () => {
  if (!customer.alive) return;
  if (currentVisitState !== Utils.VisitState.VisitInProgress) {
    log('CustomerLeaves ignored (no visit in progress).');
    return;
  }
  if (currentDiagnosis === null) {
    log('CustomerLeaves ignored (no diagnosis output for this visit).');
    return;
  }
  currentVisitState = Utils.VisitState.NoActiveVisit;
  log('Diagnosis output sent to alchemy.');
  
  // Show handoff screen first
  showHandoffScreen(customer, needsData);
};

ui.btnTypeOk.onclick = () => {
  typePopupVisible = false;
  UI.hidePopupOverlay(ui);
  
  // Set flag immediately to prevent button from showing, then update UI
  greetingShowing = true;
  updateStatusAndUI(); // Hide button immediately
  
  // Show greeting after type is confirmed (small delay to ensure UI is updated)
  setTimeout(() => {
    showCustomerGreeting();
  }, 50);
};
ui.btnDeathOk.onclick = () => {
  deathPopupVisible = false;
  UI.hidePopupOverlay(ui);
  log('Death popup closed.');
  updateStatusAndUI();
};

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function applyPillsAndProceed(collectedPills, saveReason) {
  log('Calculating results...');

  // Compute toxicity from pills using 五行相剋 rules
  const customerWeakness = Utils.wuxingWeakness[customer.constitution];
  let totalToxicityDelta = 0;

  log(`Customer constitution: ${customer.constitution}, weakness element: ${customerWeakness}`);

  collectedPills.forEach((pill, index) => {
    let pillToxicity = pill.toxicity;
    let multiplier = 1.0;

    if (pill.wuxing === customerWeakness) {
      multiplier = Utils.WEAKNESS_MULTIPLIER;
      pillToxicity = pill.toxicity * multiplier;
      log(`  Pill ${index + 1}: Base toxicity=${pill.toxicity}, 五行=${pill.wuxing} (weakness match), multiplier=${multiplier}, final=${pillToxicity.toFixed(2)}`);
    } else {
      log(`  Pill ${index + 1}: Base toxicity=${pill.toxicity}, 五行=${pill.wuxing} (no match), multiplier=${multiplier}, final=${pillToxicity.toFixed(2)}`);
    }

    totalToxicityDelta += pillToxicity;
  });

  log(`Total toxicity delta: ${totalToxicityDelta.toFixed(2)}`);

  // Apply toxicity to customer
  const previousToxicity = customer.currentToxicity;
  customer.increaseToxicity(totalToxicityDelta);

  // Save after applying (your requirement)
  saveRun(saveReason || 'pillsApplied');

  if (!customer.alive) {
    log(
      `Toxicity increased from ${previousToxicity.toFixed(2)} to ${customer.currentToxicity.toFixed(2)} (> ${customer.maxToxicity}). ` +
      `Customer died from toxicity.`
    );
    UI.showDeathPopup(ui, customer);
    deathPopupVisible = true;
    typePopupVisible = false;
    return;
  }

  // Calculate satisfaction based on needs fulfillment
  const customerBenefit = Utils.wuxingBenefit[customer.constitution];
  const truthNeeds = customer.needs;

  let maxScore = 0;
  truthNeeds.forEach(need => { maxScore += need.isMain ? 2 : 1; });

  let achievedScore = 0;
  const metNeeds = new Set();
  const needsWithBonus = new Set();
  const needBestQuality = {};

  truthNeeds.forEach(need => {
    let needMet = false;
    let hasBonus = false;
    let bestQuality = null;
    let bestQualityRank = -1;

    collectedPills.forEach(pill => {
      if (pill.needs.includes(need.code)) {
        needMet = true;
        if (pill.wuxing === customerBenefit) hasBonus = true;

        const qualityRank = Utils.QUALITY_ORDER.indexOf(pill.quality);
        if (qualityRank > bestQualityRank) {
          bestQualityRank = qualityRank;
          bestQuality = pill.quality;
        }
      }
    });

    if (needMet) {
      metNeeds.add(need.code);
      if (hasBonus) needsWithBonus.add(need.code);
      if (bestQuality) needBestQuality[need.code] = bestQuality;
    }
  });

  truthNeeds.forEach(need => {
    if (metNeeds.has(need.code)) {
      let needScore = need.isMain ? 2 : 1;

      if (needsWithBonus.has(need.code)) {
        needScore *= Utils.BENEFIT_MULTIPLIER;
      }

      const quality = needBestQuality[need.code] || 'B';
      const qualityMultiplier = Utils.QUALITY_MULTIPLIERS[quality] || 1.0;
      needScore *= qualityMultiplier;

      achievedScore += needScore;
    }
  });

  const fulfillmentRatio = maxScore > 0 ? achievedScore / maxScore : 0;

  let satisfaction;
  if (fulfillmentRatio >= 0.8) satisfaction = 'High';
  else if (fulfillmentRatio < 0.4) satisfaction = 'Low';
  else satisfaction = 'Medium';

  const mainNeed = truthNeeds.find(n => n.isMain);
  if (mainNeed && metNeeds.has(mainNeed.code)) {
    const mainNeedBestQuality = needBestQuality[mainNeed.code] || 'B';
    if (mainNeedBestQuality === 'C' && satisfaction === 'High') {
      satisfaction = 'Medium';
      log(`  Category cap applied: Main need quality is C, downgrading High to Medium`);
    }
  }

  customer.previousSatisfaction = satisfaction;

  log(
    `Toxicity increased from ${previousToxicity.toFixed(2)} to ${customer.currentToxicity.toFixed(2)}/${customer.maxToxicity}. ` +
    `Previous dose satisfaction: ${satisfaction}.`
  );

  currentDiagnosis = null;
  showPostAlchemyScreen();
}

// Show handoff screen
function showHandoffScreen(customer, needsData) {
  const popupOverlay = document.getElementById('popupOverlay');
  const handoffScreen = document.getElementById('handoffScreen');
    
  // Restore original handoff screen markup (Import replaces the whole screen)
  if (!window.__handoffOriginalHTML) {
    window.__handoffOriginalHTML = handoffScreen.innerHTML;
  } else {
    handoffScreen.innerHTML = window.__handoffOriginalHTML;
  }

  
  // Show handoff screen
  popupOverlay.style.display = 'flex';
  popupOverlay.style.zIndex = '30000';
  handoffScreen.style.display = 'block';
  document.getElementById('typePopup').style.display = 'none';
  document.getElementById('deathPopup').style.display = 'none';
  document.getElementById('pulsePopup').style.display = 'none';
  document.getElementById('diagnosisResultPopup').style.display = 'none';
  document.getElementById('diagnosisSelectionUI').style.display = 'none';
  document.getElementById('alchemyInputUI').style.display = 'none';
  
  // Set up Proceed button
  // Set up Export / Import
  const msgEl = document.getElementById('handoffMessage');
  const btnExport = document.getElementById('btnHandoffExport');
  const btnImport = document.getElementById('btnHandoffImport');
  if (btnImport) btnImport.classList.remove('handoffNext');
  if (btnExport) btnExport.classList.remove('handoffRetry');
  if (btnImport) btnImport.style.display = 'none';

  
  // Room ID input elements
  const roomIdInput = document.getElementById('roomIdInput');
  const btnGenerateLink = document.getElementById('btnGenerateLink');
  const generatedLinkContainer = document.getElementById('generatedLinkContainer');
  const generatedLink = document.getElementById('generatedLink');
  const btnCopyLink = document.getElementById('btnCopyLink');
  const btnOpenLink = document.getElementById('btnOpenLink');

  // Reset UI each time
  if (msgEl) msgEl.textContent = '';
  if (generatedLinkContainer) generatedLinkContainer.style.display = 'none';
  
  // Load saved room ID into input
  if (roomIdInput && currentRoomId) {
    roomIdInput.value = currentRoomId;
  }
  
  // Restrict room ID input to digits only
  if (roomIdInput) {
    roomIdInput.addEventListener('input', (e) => {
      // Only allow digits
      e.target.value = e.target.value.replace(/\D/g, '');
      // Limit to 4 digits
      if (e.target.value.length > 4) {
        e.target.value = e.target.value.slice(0, 4);
      }
    });
  }

  // Debug phase only (saved but ignored on restore)
  savedPhaseForDebug = 'HANDOFF';
  saveRun('phase=HANDOFF');

  // Set up Generate Link button
  if (btnGenerateLink && roomIdInput) {
    btnGenerateLink.onclick = () => {
      const roomId = roomIdInput.value.trim();
      
      // Validate room ID (must be 4 digits)
      if (!/^\d{4}$/.test(roomId)) {
        alert('請輸入 4 位數的房間 ID（例如：8888）');
        roomIdInput.focus();
        return;
      }
      
      // Save room ID
      saveRoomId(roomId);
      
      // Update MQTT subscriptions
      updateMqttSubscriptions();
      
      // Generate link
      const alchemyUrl = `https://thirza0.github.io/ChineseAlchemy_Prototype/?room_id=${roomId}`;
      
      if (generatedLink) {
        generatedLink.href = alchemyUrl;
        generatedLink.textContent = alchemyUrl;
      }
      
      if (generatedLinkContainer) {
        generatedLinkContainer.style.display = 'block';
      }
      
      log(`[Room ID] 房間 ID 已設定為: ${roomId}`);
      log(`[Room ID] 生成的連結: ${alchemyUrl}`);
    };
  }
  
  // Set up Copy Link button
  if (btnCopyLink && generatedLink) {
    btnCopyLink.onclick = () => {
      const url = generatedLink.href;
      if (url && url !== '#') {
        navigator.clipboard.writeText(url).then(() => {
          log('[Room ID] 連結已複製到剪貼簿');
          if (msgEl) {
            const originalMsg = msgEl.textContent;
            msgEl.textContent = '連結已複製到剪貼簿！';
            setTimeout(() => {
              if (msgEl.textContent === '連結已複製到剪貼簿！') {
                msgEl.textContent = originalMsg;
              }
            }, 2000);
          }
        }).catch(err => {
          console.error('Failed to copy link:', err);
          log('[Room ID] 複製連結失敗');
        });
      }
    };
  }
  
  // Set up Open Link button
  if (btnOpenLink && generatedLink) {
    btnOpenLink.onclick = () => {
      const url = generatedLink.href;
      if (url && url !== '#') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };
  }

  btnExport.onclick = () => {
  
    const ok = publishDiagnosisExportData('handoffExport');
    if (msgEl) {
      const roomInfo = currentRoomId ? ` (房間 ID: ${currentRoomId})` : '';
      msgEl.textContent = ok
        ? `診斷資料已發送到 MQTT${roomInfo}。請前往煉丹系統製作丹藥，然後回來按 Import pills。`
        : 'MQTT 發送失敗（未連線）。請前往煉丹系統製作丹藥，然後回來按 Import pills。';
      if (btnImport) btnImport.classList.add('handoffNext');
      if (btnExport) btnExport.classList.add('handoffRetry');
    }
    if (btnImport) btnImport.style.display = 'inline-block';
  };
  

  btnImport.onclick = () => {
    log(`[Import] Checking for pills... mqttInboxLatest is ${mqttInboxLatest ? 'set' : 'null'}`);
    if (!mqttInboxLatest) {
      log('[Import] No pills found in inbox. Make sure pills were exported from alchemy system.');
      alert('No pills found. Go make pills in the other prototype and come back when ready.');
      return;
    }
    log(`[Import] Found pills package: patientName=${mqttInboxLatest.patientName}, medicines=${mqttInboxLatest.medicines?.length || 0}`);

    const incomingName = mqttInboxLatest.patientName;
    const currentName = customer?.name;

    if (currentName && incomingName && currentName !== incomingName) {
      console.error('[MQTT] patientName mismatch', { currentName, incomingName, pkg: mqttInboxLatest });
      mqttInboxLatest = null;
      alert(`Received pills for a different patient (${incomingName}). Discarded. Please resend results and make the correct pills for ${currentName}.`);
      return;
    }

    // Pills found: replace the whole handoff screen (no apply yet)
    const meds = Array.isArray(mqttInboxLatest.medicines)
      ? mqttInboxLatest.medicines
      : [];

    const patientName = mqttInboxLatest.patientName ?? '';

    const rowsHtml = meds.map((m, i) => {
      const name = escapeHtml(m.name);
      const element = escapeHtml(m.element);
      const quality = escapeHtml(m.quality);
      const effects = Array.isArray(m.effectCodes)
      ? m.effectCodes
          .map((code) => (needsData.find((n) => n.code === code)?.label ?? code))
          .join('、')
      : '';


      return `
        <tr>
          <td style="padding:6px 10px; text-align:right;">${i + 1}</td>
          <td style="padding:6px 10px;">${name}</td>
          <td style="padding:6px 10px;">${element}</td>
          <td style="padding:6px 10px;">${quality}</td>
          <td style="padding:6px 10px;">${escapeHtml(effects)}</td>
        </tr>
      `;
    }).join('');

    handoffScreen.innerHTML = `
      <h3>問診流程已結束</h3>

      <div style="max-width:760px; margin:16px auto; text-align:left;">
        <div style="font-weight:700; margin-bottom:8px;">Pills found.</div>
        <div style="margin-bottom:12px;">patientName=${escapeHtml(patientName)}</div>

        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th>#</th>
              <th>name</th>
              <th>element</th>
              <th>quality</th>
              <th>effects</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="5">(no pills)</td></tr>`}
          </tbody>
        </table>

        <div style="display:flex; justify-content:center; margin-top:18px;">
          <button id="btnHandoffProceed">Give pills</button>
        </div>
      </div>
    `;

    const btnProceed = document.getElementById('btnHandoffProceed');
    btnProceed.onclick = () => {
      const meds2 = Array.isArray(mqttInboxLatest?.medicines) ? mqttInboxLatest.medicines : [];

      const collectedPills = meds2.map((m) => {
        let needs = Array.isArray(m.effectCodes) ? m.effectCodes.filter(Boolean) : [];

        if (needs.length === 0) {
          console.error('[MQTT] ERROR: effectCodes empty, defaulting to A', { id: m.id, name: m.name, medicine: m });
          log(`[MQTT] ERROR: effectCodes empty for pill id=${m.id} name=${m.name}. Defaulting needs to [A].`);
          needs = ['A'];
        }

        const tox = parseFloat(m.toxin);
        if (!Number.isFinite(tox)) {
          console.error('[MQTT] ERROR: toxin not a number', { id: m.id, name: m.name, toxin: m.toxin, medicine: m });
          log(`[MQTT] ERROR: toxin invalid for pill id=${m.id} name=${m.name}. Using 0.`);
        }

        return {
          needs,
          toxicity: Number.isFinite(tox) ? tox : 0,
          wuxing: m.element ?? '',
          quality: m.quality ?? 'B'
        };
      });

      // Prevent double-apply
      mqttInboxLatest = null;

      // Hide handoff screen; next UI is death popup or post-alchemy screen (both use overlay)
      handoffScreen.style.display = 'none';

      applyPillsAndProceed(collectedPills, 'mqttGivePills');
    };

    // Keep the log if you still want it for debugging
    log('[MQTT] pills found package:');
    log(JSON.stringify(mqttInboxLatest, null, 2));

  };

}

// Show post-alchemy feedback screen
function showPostAlchemyScreen() {
  const popupOverlay = document.getElementById('popupOverlay');
  const postAlchemyScreen = document.getElementById('postAlchemyScreen');
  
  // Show post-alchemy screen
  popupOverlay.style.display = 'flex';
  popupOverlay.style.zIndex = '30000';
  postAlchemyScreen.style.display = 'block';
  document.getElementById('typePopup').style.display = 'none';
  document.getElementById('deathPopup').style.display = 'none';
  document.getElementById('pulsePopup').style.display = 'none';
  document.getElementById('diagnosisResultPopup').style.display = 'none';
  document.getElementById('diagnosisSelectionUI').style.display = 'none';
  document.getElementById('alchemyInputUI').style.display = 'none';
  document.getElementById('handoffScreen').style.display = 'none';
  
  // Set up Continue button
  const btnContinue = document.getElementById('btnPostAlchemyContinue');
  btnContinue.onclick = () => {
    // Close post-alchemy screen
    popupOverlay.style.display = 'none';
    postAlchemyScreen.style.display = 'none';
    
    // Update UI to show "Initialize Customer Visit" button
    updateStatusAndUI();
  };
}

// Show alchemy input UI
function showAlchemyInputUI(customer, needsData, recipesData) {
  const popupOverlay = document.getElementById('popupOverlay');
  const alchemyUI = document.getElementById('alchemyInputUI');
  const pillsContainer = document.getElementById('pillsContainer');
  
  // Initialize/reset alchemy result data
  let alchemyResult = {
    pills: [
      { needs: [], toxicity: null, wuxing: null, quality: null },
      { needs: [], toxicity: null, wuxing: null, quality: null },
      { needs: [], toxicity: null, wuxing: null, quality: null }
    ]
  };
  
  // Clear previous content
  pillsContainer.innerHTML = '';
  
  // Check if recipesData is available
  if (!recipesData || recipesData.length === 0) {
    log('ERROR: No recipes data available. Make sure recipes_from_datajs.csv exists and was loaded correctly.');
    console.error('recipesData is empty or undefined:', recipesData);
  }
  
  // SymptomID to NeedCode mapping
  const symptomToNeed = {
    '1': 'A',
    '2': 'B',
    '3': 'C',
    '4': 'D',
    '5': 'E'
  };
  
  // Create 3 pill input groups
  for (let i = 0; i < 3; i++) {
    const pillGroup = document.createElement('div');
    pillGroup.className = 'pillInputGroup';
    pillGroup.innerHTML = `<h4>丹藥 ${i + 1}</h4>`;
    
    // Recipe dropdown
    const recipeRow = document.createElement('div');
    recipeRow.className = 'pillInputRow';
    recipeRow.innerHTML = `
      <label>丹方：</label>
      <select id="pill${i}_recipe" class="pillRecipeSelect">
        <option value="">-- 請選擇 --</option>
        ${recipesData.map(r => `<option value="${r.name}">${r.name}</option>`).join('')}
      </select>
    `;
    
    // Needs display (read-only, auto-filled from recipe)
    const needsRow = document.createElement('div');
    needsRow.className = 'pillInputRow';
    needsRow.innerHTML = `
      <label>需求：</label>
      <div id="pill${i}_needsDisplay" style="flex: 1; padding: 6px; background: #2a2a2a; border: 1px solid #555; border-radius: 3px; color: #aaa; font-size: 14px;">--</div>
    `;
    
    // 五行 display (read-only, auto-filled from recipe)
    const wuxingRow = document.createElement('div');
    wuxingRow.className = 'pillInputRow';
    wuxingRow.innerHTML = `
      <label>五行:</label>
      <div id="pill${i}_wuxingDisplay" style="flex: 1; padding: 6px; background: #2a2a2a; border: 1px solid #555; border-radius: 3px; color: #aaa; font-size: 14px;">--</div>
    `;
    
    // Toxicity input
    const toxicityRow = document.createElement('div');
    toxicityRow.className = 'pillInputRow';
    toxicityRow.innerHTML = `
      <label>毒性：</label>
      <input type="number" id="pill${i}_toxicity" min="0" step="0.01" placeholder="0.00">
    `;
    
    // Quality dropdown
    const qualityRow = document.createElement('div');
    qualityRow.className = 'pillInputRow';
    qualityRow.innerHTML = `
      <label>品質：</label>
      <select id="pill${i}_quality" class="pillQualitySelect">
        <option value="U">U</option>
        <option value="S">S</option>
        <option value="A">A</option>
        <option value="B" selected>B</option>
        <option value="C">C</option>
      </select>
    `;
    
    pillGroup.appendChild(recipeRow);
    pillGroup.appendChild(needsRow);
    pillGroup.appendChild(wuxingRow);
    pillGroup.appendChild(toxicityRow);
    pillGroup.appendChild(qualityRow);
    pillsContainer.appendChild(pillGroup);
    
    // Handle recipe selection
    const recipeSelect = document.getElementById(`pill${i}_recipe`);
    const needsDisplay = document.getElementById(`pill${i}_needsDisplay`);
    const wuxingDisplay = document.getElementById(`pill${i}_wuxingDisplay`);
    
    recipeSelect.addEventListener('change', () => {
      const selectedRecipe = recipesData.find(r => r.name === recipeSelect.value);
      
      if (selectedRecipe) {
        // Auto-fill needs from Symptom1/Symptom2
        const needs = [];
        if (selectedRecipe.symptom1 && symptomToNeed[selectedRecipe.symptom1]) {
          needs.push(symptomToNeed[selectedRecipe.symptom1]);
        }
        if (selectedRecipe.symptom2 && symptomToNeed[selectedRecipe.symptom2]) {
          needs.push(symptomToNeed[selectedRecipe.symptom2]);
        }
        
        // Update needs display
        if (needs.length > 0) {
          needsDisplay.textContent = needs.join(', ');
          needsDisplay.style.color = '#fff';
        } else {
          needsDisplay.textContent = '--';
          needsDisplay.style.color = '#aaa';
        }
        
        // Auto-fill 五行 from Element
        if (selectedRecipe.element && Utils.constitutionTypes.includes(selectedRecipe.element)) {
          wuxingDisplay.textContent = selectedRecipe.element;
          wuxingDisplay.style.color = '#fff';
        } else {
          wuxingDisplay.textContent = '--';
          wuxingDisplay.style.color = '#aaa';
        }
      } else {
        // Clear displays
        needsDisplay.textContent = '--';
        needsDisplay.style.color = '#aaa';
        wuxingDisplay.textContent = '--';
        wuxingDisplay.style.color = '#aaa';
      }
      
      // Trigger validation
      validateAlchemyInput();
    });
  }
  
  // Show UI
  popupOverlay.style.display = 'flex';
  popupOverlay.style.zIndex = '30000';
  alchemyUI.style.display = 'block';
  document.getElementById('typePopup').style.display = 'none';
  document.getElementById('deathPopup').style.display = 'none';
  document.getElementById('pulsePopup').style.display = 'none';
  document.getElementById('diagnosisResultPopup').style.display = 'none';
  document.getElementById('diagnosisSelectionUI').style.display = 'none';
  
  // Validation function to check that all pills with data are complete
  function validateAlchemyInput() {
    let hasCompletePill = false;
    let hasIncompletePill = false;
    const incompletePillNumbers = [];
    
    for (let i = 0; i < 3; i++) {
      const recipe = document.getElementById(`pill${i}_recipe`).value;
      const needsDisplay = document.getElementById(`pill${i}_needsDisplay`);
      const wuxingDisplay = document.getElementById(`pill${i}_wuxingDisplay`);
      const toxicity = document.getElementById(`pill${i}_toxicity`).value;
      const quality = document.getElementById(`pill${i}_quality`).value;
      
      // Get needs and wuxing from displays (they're auto-filled from recipe)
      const needsText = needsDisplay.textContent.trim();
      const needs = needsText !== '--' ? needsText.split(',').map(n => n.trim()).filter(n => n) : [];
      const wuxing = wuxingDisplay.textContent.trim() !== '--' ? wuxingDisplay.textContent.trim() : '';
      
      // Check if this pill has any data (quality="B" is default, so don't count it as "data entered")
      const hasAnyData = recipe || (toxicity && toxicity.trim() !== '');
      
      if (hasAnyData) {
        // If pill has any data, it must be complete
        const hasRecipe = recipe && recipe.trim() !== '';
        const hasNeeds = needs.length > 0;
        const hasWuxing = wuxing && wuxing.trim() !== '';
        const hasToxicity = toxicity && toxicity.trim() !== '';
        const hasQuality = quality && quality.trim() !== ''; // Quality always has default "B", so this is always true
        
        if (hasRecipe && hasNeeds && hasWuxing && hasToxicity && hasQuality) {
          hasCompletePill = true;
        } else {
          hasIncompletePill = true;
          incompletePillNumbers.push(i + 1);
        }
      }
    }
    
    const btnConfirm = document.getElementById('btnAlchemyInputConfirm');
    
    if (hasIncompletePill) {
      btnConfirm.disabled = true;
      // Log reason (but only once to avoid spam)
      if (!validateAlchemyInput.lastLogged || validateAlchemyInput.lastLogged !== incompletePillNumbers.join(',')) {
        const missingFields = [];
        incompletePillNumbers.forEach(pillNum => {
          const i = pillNum - 1;
          const recipe = document.getElementById(`pill${i}_recipe`).value;
          const needsDisplay = document.getElementById(`pill${i}_needsDisplay`);
          const wuxingDisplay = document.getElementById(`pill${i}_wuxingDisplay`);
          const toxicity = document.getElementById(`pill${i}_toxicity`).value;
          const quality = document.getElementById(`pill${i}_quality`).value;
          
          const needsText = needsDisplay.textContent.trim();
          const needs = needsText !== '--' ? needsText.split(',').map(n => n.trim()).filter(n => n) : [];
          const wuxing = wuxingDisplay.textContent.trim() !== '--' ? wuxingDisplay.textContent.trim() : '';
          
          const missing = [];
          if (!recipe || recipe.trim() === '') missing.push('recipe');
          if (needs.length === 0) missing.push('needs');
          if (!wuxing || wuxing.trim() === '') missing.push('五行');
          if (!toxicity || toxicity.trim() === '') missing.push('toxicity');
          if (!quality || quality.trim() === '') missing.push('quality');
          
          if (missing.length > 0) {
            missingFields.push(`Pill ${pillNum}: missing ${missing.join(', ')}`);
          }
        });
        log(`Data incomplete: ${missingFields.join('; ')}. All pills with data must be complete.`);
        validateAlchemyInput.lastLogged = incompletePillNumbers.join(',');
      }
    } else if (!hasCompletePill) {
      btnConfirm.disabled = true;
    } else {
      btnConfirm.disabled = false;
      validateAlchemyInput.lastLogged = null; // Reset when valid
    }
  }
  
  // Add event listeners to all inputs for validation
  for (let i = 0; i < 3; i++) {
    const recipeSelect = document.getElementById(`pill${i}_recipe`);
    const toxicityInput = document.getElementById(`pill${i}_toxicity`);
    const qualitySelect = document.getElementById(`pill${i}_quality`);
    
    // Recipe change is already handled above with auto-fill logic
    toxicityInput.addEventListener('input', validateAlchemyInput);
    qualitySelect.addEventListener('change', validateAlchemyInput);
  }
  
  // Initial validation (should disable button initially)
  validateAlchemyInput();
  
  // Set up Confirm button (initially disabled)
  const btnConfirm = document.getElementById('btnAlchemyInputConfirm');
  btnConfirm.disabled = true;
  
  btnConfirm.onclick = () => {
    // Collect and validate data from all pills
    const collectedPills = [];
    const incompletePills = [];
    
    for (let i = 0; i < 3; i++) {
      const recipe = document.getElementById(`pill${i}_recipe`).value;
      const needsDisplay = document.getElementById(`pill${i}_needsDisplay`);
      const wuxingDisplay = document.getElementById(`pill${i}_wuxingDisplay`);
      const toxicity = document.getElementById(`pill${i}_toxicity`).value;
      const quality = document.getElementById(`pill${i}_quality`).value;
      
      // Get needs and wuxing from displays (they're auto-filled from recipe)
      const needsText = needsDisplay.textContent.trim();
      const needs = needsText !== '--' ? needsText.split(',').map(n => n.trim()).filter(n => n) : [];
      const wuxing = wuxingDisplay.textContent.trim() !== '--' ? wuxingDisplay.textContent.trim() : '';
      
      // Check if this pill has any data (quality="B" is default, so don't count it as "data entered")
      const hasAnyData = recipe || (toxicity && toxicity.trim() !== '');
      
      if (hasAnyData) {
        // Check if complete
        const hasRecipe = recipe && recipe.trim() !== '';
        const hasNeeds = needs.length > 0;
        const hasWuxing = wuxing && wuxing.trim() !== '';
        const hasToxicity = toxicity && toxicity.trim() !== '';
        const hasQuality = quality && quality.trim() !== '';
        
        if (hasRecipe && hasNeeds && hasWuxing && hasToxicity && hasQuality) {
          // Complete pill
          const pill = {
            needs: needs,
            toxicity: parseFloat(toxicity),
            wuxing: wuxing,
            quality: quality
          };
          
          collectedPills.push(pill);
        } else {
          // Incomplete pill
          incompletePills.push(i + 1);
        }
      }
    }
    
    // Check if we have at least one complete pill
    if (collectedPills.length === 0) {
      log('Data incomplete: No complete pills. Each pill must have at least one need, toxicity, and 五行.');
      return;
    }
    
    // Log incomplete pills if any
    if (incompletePills.length > 0) {
      log(`Data incomplete: Pill(s) ${incompletePills.join(', ')} are missing required fields. Each pill must have at least one need, toxicity, and 五行.`);
    }
    
    // Store alchemy result (only complete pills)
    alchemyResult.pills = collectedPills;
    
    // Log collected data
    log(`Alchemy input confirmed. Collected ${collectedPills.length} pill(s):`);
    collectedPills.forEach((pill, index) => {
      const needsStr = pill.needs.join(', ');
      log(`  Pill ${index + 1}: Needs=[${needsStr}], Toxicity=${pill.toxicity}, 五行=${pill.wuxing}, Quality=${pill.quality}`);
    });
    
    // Close UI
    popupOverlay.style.display = 'none';
    alchemyUI.style.display = 'none';
    
    // Continue with flow - show "Calculating results"
    log('Calculating results...');
    
    applyPillsAndProceed(collectedPills, 'alchemyConfirm');


    
    // If customer died, updateStatusAndUI was already called in death popup handler
    // If customer alive, updateStatusAndUI will be called when post-alchemy screen closes
  };
}

// Init - Load CSV data first
async function initializeApp() {
  log('Loading game data...');
  
  // Set version label
  const versionLabel = document.getElementById('versionLabel');
  if (versionLabel) {
    versionLabel.textContent = Utils.VERSION;
  }
  
  // Ensure diagnosis overlay is hidden on init
  const diagnosisOverlay = document.getElementById('diagnosisOverlay');
  if (diagnosisOverlay) {
    diagnosisOverlay.classList.remove('active');
  }
  
  // Load needs, clues, and recipes data
  needsData = await Utils.loadNeedsData();
  cluesData = await Utils.loadCluesData();
  recipesData = await Utils.loadRecipesData();
  
  if (needsData.length === 0) {
    log('ERROR: Failed to load needs data from needs.csv');
    return;
  }
  
  log(`Loaded ${needsData.length} needs, ${cluesData.length} clues, and ${recipesData.length} recipes.`);
  
  if (recipesData.length === 0) {
    log('WARNING: No recipes loaded from recipes_from_datajs.csv. Check if file exists and is properly formatted.');
  }
  restoreFromSave();
  const savedLevel = localStorage.getItem('playerLevelLatest');

  if (savedLevel !== null) {
    playerLevelLatest = Number(savedLevel) || 1;
  } else {
    playerLevelLatest = 1;
    log('[Level] No saved player level found. Defaulting to level 1.');
  }
  

  log('Simulation initialized. State=NoActiveVisit, toxicity=0, constitution=None.');
  updateStatusAndUI();

  // Initialize MQTT connection
  initializeMqtt();
}

// ---- MQTT Connection ----
function initializeMqtt() {
  // Load saved room ID
  loadRoomId();
  
  const client = mqtt.connect(MQTT_BROKER);

  client.on('connect', () => {
    const topics = getMqttSubscribeTopics();
    console.log('[MQTT] connected, subscribing to topics:', topics);
    
    // Subscribe to all relevant topics
    topics.forEach(topic => {
      client.subscribe(topic);
    });
    
    mqttClient = client;
    mqttConnected = true;
    
    // Send test message to public topic only
    client.publish(
      MQTT_TOPIC_BASE,
      JSON.stringify({
        source: 'clinic',
        test: true,
        message: 'hello from clinic'
      })
    );
    log(`[MQTT] connected and subscribed to: ${topics.join(', ')}`);
  });

  client.on('message', (topic, msg) => {
    console.log('[MQTT] raw message from topic:', topic, msg.toString());
  
    try {
      const data = JSON.parse(msg.toString());
      console.log('[MQTT] parsed JSON:', data);
  
      // --- Player level sync (log only) ---
      if (data?.type === "PLAYER_LEVEL_SYNC") {
        log(`[MQTT] PLAYER_LEVEL_SYNC level=${data.level} exp=${data.exp}/${data.maxExp} roomId=${data.roomId} topic=${topic}`);
        console.log('[MQTT] PLAYER_LEVEL_SYNC:', data);
        playerLevelLatest = Number(data.level) || 0;
        localStorage.setItem('playerLevelLatest', String(playerLevelLatest));
        return;
      }
  
      // Silently ignore diagnosis messages (the ones we sent ourselves)
      if (data?.diagnosis) {
        return;
      }
  
      // Check if this looks like an alchemy result package (pills)
      const hasMedicines = Array.isArray(data?.medicines);
      const hasPatientName = data?.patientName || data?.patient_name;
  
      if (!hasMedicines) {
        log(`[MQTT] ignored - no medicines array found. Message keys: ${Object.keys(data).join(', ')}`);
        return;
      }
  
      log(`[MQTT] received pills message on topic: ${topic}`);
  
      // Store the package
      mqttInboxLatest = data;
      log(`[MQTT] ✓ stored alchemy package from ${topic}: patientName=${hasPatientName || '(missing)'} medicines=${data.medicines.length}`);
    } catch (e) {
      console.log('[MQTT] JSON parse failed:', e);
      log(`[MQTT] JSON parse failed: ${e.message}`);
    }
  });
  

  client.on('error', (error) => {
    console.error('[MQTT] connection error:', error);
    log(`[MQTT] connection error: ${error.message}`);
    mqttConnected = false;
  });

  client.on('offline', () => {
    console.log('[MQTT] client offline');
    log('[MQTT] client offline');
    mqttConnected = false;
  });
}

// Function to update MQTT subscriptions when room ID changes
function updateMqttSubscriptions() {
  if (!mqttClient || !mqttConnected) {
    return;
  }
  
  const topics = getMqttSubscribeTopics();
  console.log('[MQTT] updating subscriptions to:', topics);
  
  // Unsubscribe from all topics first (we'll resubscribe to what we need)
  // Note: In practice, we keep both public and room-specific subscriptions
  topics.forEach(topic => {
    mqttClient.subscribe(topic);
  });
  
  log(`[MQTT] updated subscriptions to: ${topics.join(', ')}`);
}

// Start the app
initializeApp();
