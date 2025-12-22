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

// Show handoff screen
function showHandoffScreen(customer, needsData) {
  const popupOverlay = document.getElementById('popupOverlay');
  const handoffScreen = document.getElementById('handoffScreen');
  
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
  const btnProceed = document.getElementById('btnHandoffProceed');
  btnProceed.onclick = () => {
    // Close handoff screen
    popupOverlay.style.display = 'none';
    handoffScreen.style.display = 'none';
    
    // Show alchemy input UI
    //showAlchemyInputUI(customer, needsData, recipesData);
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
    
    // Compute toxicity from pills using 五行相剋 rules
    const customerWeakness = Utils.wuxingWeakness[customer.constitution];
    let totalToxicityDelta = 0;
    
    log(`Customer constitution: ${customer.constitution}, weakness element: ${customerWeakness}`);
    
    collectedPills.forEach((pill, index) => {
      let pillToxicity = pill.toxicity;
      let multiplier = 1.0;
      
      // Check if pill's 五行 matches customer's weakness element
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
    
    let died = false;
    if (!customer.alive) {
      log(
        `Toxicity increased from ${previousToxicity.toFixed(2)} to ${customer.currentToxicity.toFixed(2)} (> ${customer.maxToxicity}). ` +
        `Customer died from toxicity.`
      );
      UI.showDeathPopup(ui, customer);
      deathPopupVisible = true;
      typePopupVisible = false;
      died = true;
    } else {
      // Calculate satisfaction based on needs fulfillment
      const customerBenefit = Utils.wuxingBenefit[customer.constitution];
      const truthNeeds = customer.needs; // Use TRUTH/INTERNAL STATE, not diagnosed
      
      // Calculate maximum possible score
      let maxScore = 0;
      truthNeeds.forEach(need => {
        maxScore += need.isMain ? 2 : 1;
      });
      
      // Calculate achieved score
      let achievedScore = 0;
      const metNeeds = new Set(); // Track which needs were met
      const needsWithBonus = new Set(); // Track which needs got 五行 bonus
      const needBestQuality = {}; // Track best quality grade for each need
      
      truthNeeds.forEach(need => {
        // Check if this need appears in any pill
        let needMet = false;
        let hasBonus = false;
        let bestQuality = null;
        let bestQualityRank = -1;
        
        collectedPills.forEach(pill => {
          if (pill.needs.includes(need.code)) {
            needMet = true;
            // Check if this pill has beneficial 五行
            if (pill.wuxing === customerBenefit) {
              hasBonus = true;
            }
            // Find best quality grade for this need
            const qualityRank = Utils.QUALITY_ORDER.indexOf(pill.quality);
            if (qualityRank > bestQualityRank) {
              bestQualityRank = qualityRank;
              bestQuality = pill.quality;
            }
          }
        });
        
        if (needMet) {
          metNeeds.add(need.code);
          if (hasBonus) {
            needsWithBonus.add(need.code);
          }
          if (bestQuality) {
            needBestQuality[need.code] = bestQuality;
          }
        }
      });
      
      // Calculate score with bonuses and quality multipliers
      truthNeeds.forEach(need => {
        if (metNeeds.has(need.code)) {
          let needScore = need.isMain ? 2 : 1;
          
          // Apply 五行 benefit multiplier if applicable
          if (needsWithBonus.has(need.code)) {
            needScore *= Utils.BENEFIT_MULTIPLIER;
          }
          
          // Apply quality multiplier
          const quality = needBestQuality[need.code] || 'B';
          const qualityMultiplier = Utils.QUALITY_MULTIPLIERS[quality] || 1.0;
          needScore *= qualityMultiplier;
          
          achievedScore += needScore;
        }
      });
      
      // Calculate fulfillment ratio
      const fulfillmentRatio = maxScore > 0 ? achievedScore / maxScore : 0;
      
      // Determine satisfaction level
      let satisfaction;
      if (fulfillmentRatio >= 0.8) {
        satisfaction = 'High';
      } else if (fulfillmentRatio < 0.4) {
        satisfaction = 'Low';
      } else {
        satisfaction = 'Medium';
      }
      
      // Apply category cap: if main need's best quality is C, cap at Medium
      const mainNeed = truthNeeds.find(n => n.isMain);
      if (mainNeed && metNeeds.has(mainNeed.code)) {
        const mainNeedBestQuality = needBestQuality[mainNeed.code] || 'B';
        if (mainNeedBestQuality === 'C' && satisfaction === 'High') {
          satisfaction = 'Medium';
          log(`  Category cap applied: Main need quality is C, downgrading High to Medium`);
        }
      }
      
      customer.previousSatisfaction = satisfaction;
      
      // Log satisfaction calculation
      log(`Satisfaction calculation:`);
      log(`  Customer needs (truth): ${truthNeeds.map(n => n.code + (n.isMain ? '(main)' : '')).join(', ')}`);
      log(`  Customer beneficial element: ${customerBenefit}`);
      log(`  Met needs: ${Array.from(metNeeds).join(', ') || 'none'}`);
      log(`  Needs with 五行 bonus: ${Array.from(needsWithBonus).join(', ') || 'none'}`);
      truthNeeds.forEach(need => {
        if (metNeeds.has(need.code)) {
          const quality = needBestQuality[need.code] || 'B';
          const qualityMultiplier = Utils.QUALITY_MULTIPLIERS[quality] || 1.0;
          const hasBonus = needsWithBonus.has(need.code);
          const baseScore = need.isMain ? 2 : 1;
          let finalScore = baseScore;
          if (hasBonus) finalScore *= Utils.BENEFIT_MULTIPLIER;
          finalScore *= qualityMultiplier;
          log(`    ${need.code}${need.isMain ? '(main)' : ''}: base=${baseScore}, 五行=${hasBonus ? Utils.BENEFIT_MULTIPLIER + 'x' : '1.0x'}, quality=${quality}(${qualityMultiplier}x), final=${finalScore.toFixed(2)}`);
        }
      });
      log(`  Score: ${achievedScore.toFixed(2)}/${maxScore} (ratio: ${(fulfillmentRatio * 100).toFixed(1)}%)`);
      log(`  Satisfaction: ${satisfaction}`);
      
      log(
        `Toxicity increased from ${previousToxicity.toFixed(2)} to ${customer.currentToxicity.toFixed(2)}/${customer.maxToxicity}. ` +
        `Previous dose satisfaction: ${satisfaction}.`
      );
      
      // Show post-alchemy feedback screen
      // Note: Don't call updateStatusAndUI() here as it might interfere with popup
      // It will be called when the user clicks "繼續" button
      currentDiagnosis = null;
      saveRun('alchemyConfirm');
      showPostAlchemyScreen();
    }
    
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
  log('Simulation initialized. State=NoActiveVisit, toxicity=0, constitution=None.');
  updateStatusAndUI();

// ---- MQTT RECEIVE TEST (TEMPORARY) ----
const MQTT_TOPIC = 'thirza/alchemy/v1';
const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt');

client.on('connect', () => {
  console.log('[MQTT] connected, subscribing:', MQTT_TOPIC);
  client.subscribe(MQTT_TOPIC);
  client.publish(
    MQTT_TOPIC,
    JSON.stringify({
      source: 'clinic',
      test: true,
      message: 'hello from clinic'
    })
  );
  log('[MQTT] sent test message (source=clinic)');
  
});

client.on('message', (topic, msg) => {
  console.log('[MQTT] raw message:', topic, msg.toString());
  try {
    const data = JSON.parse(msg.toString());
    console.log('[MQTT] parsed JSON:', data);
  } catch (e) {
    console.log('[MQTT] JSON parse failed:', e);
  }
});
// ---- END MQTT RECEIVE TEST ----

  
}

// Start the app
initializeApp();
