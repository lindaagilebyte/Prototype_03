// Diagnosis UI and interaction logic

let currentClueSelection = null;
let collectedConfidences = {};
let availableQuestions = [];
let isQuestionMenuOpen = false;
let diagnosedState = null; // Player-observed state (starts empty, populated as player discovers)

// Start diagnosis phase
export function startDiagnosis(customer, clueSelection, needsData, onComplete) {
  console.log('startDiagnosis called');
  console.log('Clue selection:', clueSelection);
  
  currentClueSelection = clueSelection;
  window._currentCustomer = customer; // Store for checkDiagnosisComplete
  availableQuestions = clueSelection.selectedClues.filter(c => c.method === '問');
  
  // Initialize collected confidences to 0
  collectedConfidences = {};
  needsData.forEach(need => {
    collectedConfidences[need.code] = 0;
  });
  
  // Initialize diagnosed state (empty - player hasn't discovered anything yet)
  diagnosedState = {
    constitution: null,
    needs: [],
    toxicity: null,
    collectedConfidences: {}
  };
  
  // Show diagnosis overlay
  const overlay = document.getElementById('diagnosisOverlay');
  console.log('Overlay element:', overlay);
  console.log('Overlay display before:', window.getComputedStyle(overlay).display);
  overlay.style.display = 'block';
  overlay.classList.add('active');
  console.log('Overlay display after:', window.getComputedStyle(overlay).display);
  console.log('Overlay classes:', overlay.className);
  
  // Force UI update to hide main buttons
  if (window.updateStatusAndUI) {
    window.updateStatusAndUI();
  }
  
  // Render confidence bars
  renderConfidenceBars(needsData);
  
  // Render scattered clues (望/聞 only)
  const scatteredClues = clueSelection.selectedClues.filter(c => c.method === '望' || c.method === '聞');
  renderScatteredClues(scatteredClues);
  
  // Set up action buttons
  const btnAsk = document.getElementById('btnAsk');
  const btnPulse = document.getElementById('btnPulse');
  
  btnAsk.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Ask button clicked');
    askRandomQuestion();
  };
  btnPulse.onclick = () => {
    showPulsePopup(customer);
  };
  btnPulse.disabled = false; // Enable pulse button at diagnosis start
  
  // Update button states
  updateActionButtons();
  
  // Set up confirm button
  const btnConfirm = document.getElementById('btnConfirmDiagnosis');
  btnConfirm.onclick = () => {
    // Show diagnosis result popup instead of immediately ending
    showDiagnosisResultPopup(customer, needsData, onComplete);
  };
  
  // Set up 拍板 button
  const btnCommit = document.getElementById('btnCommitDiagnosis');
  btnCommit.onclick = () => {
    showDiagnosisSelectionUI(customer, needsData, onComplete);
  };
  
  // Update UI
  updateDiagnosisUI(customer, needsData);
  
  // Update button states after initialization
  updateActionButtons();
}

// Render confidence bars
function renderConfidenceBars(needsData) {
  const container = document.getElementById('confidenceBars');
  container.innerHTML = '';
  
  needsData.forEach(need => {
    const bar = document.createElement('div');
    bar.className = 'confidenceBar';
    bar.dataset.code = need.code;
    
    const label = document.createElement('div');
    label.className = 'confidenceBarLabel';
    label.textContent = need.label;
    
    const fill = document.createElement('div');
    fill.className = 'confidenceBarFill';
    fill.style.width = '0%';
    
    const percent = document.createElement('div');
    percent.className = 'confidenceBarPercent';
    percent.textContent = '0%';
    
    bar.appendChild(label);
    bar.appendChild(fill);
    bar.appendChild(percent);
    container.appendChild(bar);
  });
}

// Render scattered clues with random positioning and HiddenRank delay
function renderScatteredClues(clues) {
  const container = document.getElementById('cluesContainer');
  container.innerHTML = '';
  
  // Define safe zone boundaries (avoiding action buttons, bars, etc.)
  // More space now with smaller buttons and bars
  const safeZones = [
    { x: 30, y: 150, width: 600, height: 380 } // Larger area, still avoiding right edge
  ];
  
  const placedPositions = [];
  const minDistance = 130; // Minimum distance between clues
  
  clues.forEach((clue, index) => {
    // Calculate delay based on HiddenRank (0 = ignore, 1 = immediate, 10 = 5s)
    // Delay formula: (hiddenRank - 1) * (5000 / 9) milliseconds
    // HiddenRank 1: 0ms (0.00s) - immediate
    // HiddenRank 2: 556ms (0.56s)
    // HiddenRank 3: 1111ms (1.11s)
    // HiddenRank 4: 1667ms (1.67s)
    // HiddenRank 5: 2222ms (2.22s)
    // HiddenRank 6: 2778ms (2.78s)
    // HiddenRank 7: 3333ms (3.33s)
    // HiddenRank 8: 3889ms (3.89s)
    // HiddenRank 9: 4444ms (4.44s)
    // HiddenRank 10: 5000ms (5.00s) - maximum
    const hiddenRank = clue.hiddenRank || 0;
    const delayMs = hiddenRank > 0 ? (hiddenRank - 1) * (5000 / 9) : 0;
    
    // Create placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'cluePlaceholder';
    if (clue.method === '望') {
      placeholder.classList.add('method-wang');
    } else if (clue.method === '聞') {
      placeholder.classList.add('method-wen');
    }
    placeholder.dataset.clueId = clue.id;
    
    // Create actual button (initially hidden)
    const btn = document.createElement('button');
    btn.className = 'clueButton';
    if (clue.method === '望') {
      btn.classList.add('method-wang');
    } else if (clue.method === '聞') {
      btn.classList.add('method-wen');
    }
    btn.textContent = `【${clue.method}】${clue.text}`;
    btn.dataset.clueId = clue.id;
    btn.style.zIndex = '10002';
    btn.style.position = 'absolute';
    btn.style.opacity = '0';
    btn.style.visibility = 'hidden';
    
    // Find random position that doesn't overlap
    let position = null;
    let attempts = 0;
    while (!position && attempts < 50) {
      attempts++;
      const zone = safeZones[Math.floor(Math.random() * safeZones.length)];
      const x = zone.x + Math.random() * (zone.width - 200);
      const y = zone.y + Math.random() * (zone.height - 80);
      
      // Check distance from other clues
      const tooClose = placedPositions.some(pos => {
        const dx = pos.x - x;
        const dy = pos.y - y;
        return Math.sqrt(dx*dx + dy*dy) < minDistance;
      });
      
      if (!tooClose) {
        position = { x, y };
        placedPositions.push(position);
      }
    }
    
    // Set position for both placeholder and button
    if (position) {
      placeholder.style.left = position.x + 'px';
      placeholder.style.top = position.y + 'px';
      btn.style.left = position.x + 'px';
      btn.style.top = position.y + 'px';
    } else {
      // Fallback: spread vertically if no space
      const fallbackX = (60 + (index % 3) * 180) + 'px';
      const fallbackY = (240 + Math.floor(index / 3) * 90) + 'px';
      placeholder.style.left = fallbackX;
      placeholder.style.top = fallbackY;
      btn.style.left = fallbackX;
      btn.style.top = fallbackY;
    }
    
    btn.onclick = () => collectClue(clue, placeholder);
    
    // Store reference to placeholder on button for easy access
    btn.dataset.placeholderId = `placeholder-${clue.id}`;
    placeholder.id = `placeholder-${clue.id}`;
    
    // Add both to container
    container.appendChild(placeholder);
    container.appendChild(btn);
    
    // Schedule reveal based on HiddenRank
    setTimeout(() => {
      placeholder.style.display = 'none';
      btn.style.visibility = 'visible';
      btn.style.opacity = '1';
      btn.classList.add('fade-in');
    }, delayMs);
  });
}

// Collect a clue (onClick)
function collectClue(clue, placeholderElement) {
  // Add confidence values
  ['A', 'B', 'C', 'D', 'E'].forEach(code => {
    const value = clue[`conf${code}`] || 0;
    collectedConfidences[code] = Math.min(100, collectedConfidences[code] + value);
  });
  
  // Find and hide the button (specifically the button, not placeholder)
  const btn = document.querySelector(`button[data-clue-id="${clue.id}"]`);
  if (btn) {
    btn.style.pointerEvents = 'none';
    btn.classList.add('fade-out');
    // Hide after fade animation
    setTimeout(() => {
      btn.style.visibility = 'hidden';
      btn.style.opacity = '0';
      btn.style.display = 'none';
    }, 300);
  }
  
  // Also hide placeholder if it exists
  if (placeholderElement) {
    placeholderElement.style.display = 'none';
  } else {
    const placeholder = document.getElementById(`placeholder-${clue.id}`);
    if (placeholder) {
      placeholder.style.display = 'none';
    }
  }
  
  // Update UI
  updateConfidenceBars();
  checkDiagnosisComplete(window._currentCustomer);
}

// Update confidence bars
function updateConfidenceBars() {
  ['A', 'B', 'C', 'D', 'E'].forEach(code => {
    const value = collectedConfidences[code];
    const bar = document.querySelector(`.confidenceBar[data-code="${code}"]`);
    if (bar) {
      const fill = bar.querySelector('.confidenceBarFill');
      const percent = bar.querySelector('.confidenceBarPercent');
      fill.style.width = value + '%';
      percent.textContent = Math.floor(value) + '%';
      
      if (value >= 100) {
        fill.classList.add('complete');
      }
    }
  });
}

// Ask a random question (new behavior)
function askRandomQuestion() {
  // Check if button should be disabled
  if (availableQuestions.length === 0) {
    return;
  }
  
  // Check if already showing a question (prevent spam)
  const balloon = document.getElementById('speechBalloon');
  if (balloon.classList.contains('active')) {
    return;
  }
  
  // Randomly select a question
  const randomIndex = Math.floor(Math.random() * availableQuestions.length);
  const selectedClue = availableQuestions[randomIndex];
  
  // Ghost button while showing
  const btnAsk = document.getElementById('btnAsk');
  btnAsk.disabled = true;
  
  // Disable all clue buttons while balloon is showing
  const clueButtons = document.querySelectorAll('.clueButton');
  clueButtons.forEach(btn => {
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.5'; // Visual feedback that they're disabled
  });
  
  // Show speech balloon
  balloon.textContent = selectedClue.text;
  balloon.style.display = 'block'; // Force display
  balloon.classList.add('active');
  balloon.classList.remove('fade-out');
  console.log('Speech balloon shown:', selectedClue.text);
  console.log('Balloon display:', window.getComputedStyle(balloon).display);
  
  // Collect clue (this removes it from availableQuestions internally)
  collectClue(selectedClue, null);
  
  // Remove from available questions list
  availableQuestions = availableQuestions.filter(q => q.id !== selectedClue.id);
  
  // Hide balloon after 2 seconds and re-enable button
  setTimeout(() => {
    balloon.classList.add('fade-out');
    setTimeout(() => {
      balloon.classList.remove('active', 'fade-out');
      balloon.style.display = 'none'; // Force hide
      
      // Re-enable clue buttons
      const clueButtons = document.querySelectorAll('.clueButton');
      clueButtons.forEach(btn => {
        // Only re-enable if button is still visible (not collected)
        if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
          btn.style.pointerEvents = 'auto';
          btn.style.opacity = '1';
        }
      });
      
      btnAsk.disabled = false;
      updateActionButtons(); // Update state in case no questions left
    }, 300);
  }, 2000);
}

// Update action button states
function updateActionButtons() {
  const btnAsk = document.getElementById('btnAsk');
  const btnPulse = document.getElementById('btnPulse');
  if (btnAsk) {
    btnAsk.disabled = availableQuestions.length === 0;
  }
  if (btnPulse) {
    // Pulse button is enabled by default, only disabled after use
    // (initial state is set in startDiagnosis)
  }
}

// Check if diagnosis is complete
function checkDiagnosisComplete(customer) {
  if (!currentClueSelection || !customer) return;
  
  // Check if all PRESENT needs have reached 100
  const presentCodes = customer.needs.map(n => n.code);
  const allPresentComplete = presentCodes.every(code => collectedConfidences[code] >= 100);
  
  const confirmContainer = document.getElementById('diagnosisConfirmContainer');
  if (allPresentComplete) {
    confirmContainer.classList.add('active');
  } else {
    confirmContainer.classList.remove('active');
  }
}

// Update diagnosis UI based on current state
function updateDiagnosisUI(customer, needsData) {
  updateConfidenceBars();
  checkDiagnosisComplete(customer);
}

// End diagnosis phase
function endDiagnosis() {
  console.log('endDiagnosis called');
  const overlay = document.getElementById('diagnosisOverlay');
  overlay.classList.remove('active');
  overlay.style.display = 'none';
  
  // Clear containers
  document.getElementById('cluesContainer').innerHTML = '';
  document.getElementById('confidenceBars').innerHTML = '';
  document.getElementById('diagnosisConfirmContainer').classList.remove('active');
  document.getElementById('questionMenu').classList.remove('active');
  document.getElementById('speechBalloon').classList.remove('active', 'fade-out');
  
  currentClueSelection = null;
  isQuestionMenuOpen = false;
  window._currentCustomer = null;
  diagnosedState = null; // Reset for next diagnosis
  
  console.log('Diagnosis overlay hidden');
}

// Show pulse/toxicity popup
function showPulsePopup(customer) {
  const popupOverlay = document.getElementById('popupOverlay');
  const pulsePopup = document.getElementById('pulsePopup');
  const pulsePopupText = document.getElementById('pulsePopupText');
  
  pulsePopupText.textContent = `毒性：${customer.currentToxicity}/${customer.maxToxicity}`;
  
  // Disable all clue buttons while popup is showing (like 問 does)
  const clueButtons = document.querySelectorAll('.clueButton');
  clueButtons.forEach(btn => {
    if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
  });
  
  popupOverlay.style.display = 'flex';
  popupOverlay.style.zIndex = '30000'; // Above diagnosis overlay
  pulsePopup.style.display = 'block';
  document.getElementById('typePopup').style.display = 'none';
  document.getElementById('deathPopup').style.display = 'none';
  
  // Set up OK button handler
  const btnPulseOk = document.getElementById('btnPulseOk');
  const handler = () => {
    popupOverlay.style.display = 'none';
    pulsePopup.style.display = 'none';
    btnPulseOk.onclick = null; // Remove handler
    
    // Add toxicity to diagnosed state (player has now discovered it)
    diagnosedState.toxicity = {
      current: customer.currentToxicity,
      max: customer.maxToxicity
    };
    
    // Re-enable clue buttons
    clueButtons.forEach(btn => {
      if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }
    });
    
    // Disable pulse button
    const btnPulse = document.getElementById('btnPulse');
    btnPulse.disabled = true;
  };
  btnPulseOk.onclick = handler;
}

// Export diagnosis data to JSON file
function exportDiagnosisData(truthState, diagnosedState) {
  // Create a clean copy of diagnosed state without collectedConfidences
  const cleanDiagnosedState = {
    constitution: diagnosedState.constitution,
    needs: diagnosedState.needs,
    toxicity: diagnosedState.toxicity
  };
  
  const exportData = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    diagnosis: {
      truth: truthState,
      diagnosed: cleanDiagnosedState
    }
  };
  
  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagnosis_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Show diagnosis result popup
function showDiagnosisResultPopup(customer, needsData, onComplete) {
  // Disable all clue buttons while popup is showing
  const clueButtons = document.querySelectorAll('.clueButton');
  clueButtons.forEach(btn => {
    if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
  });
  
  // Only determine needs from collected confidences if not already set (e.g., from 拍板)
  if (!diagnosedState.needs || diagnosedState.needs.length === 0) {
    // Determine needs from collected confidences (needs with confidence >= 100)
    const discoveredNeeds = [];
    needsData.forEach(need => {
      const confidence = collectedConfidences[need.code] || 0;
      if (confidence >= 100) {
        // Check if this is the main need (compare with customer's actual main need)
        const isMain = customer.needs.find(n => n.code === need.code && n.isMain) !== undefined;
        discoveredNeeds.push({ code: need.code, isMain: isMain });
      }
    });
    
    // Sort needs: main needs first, then secondary needs
    discoveredNeeds.sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return 0;
    });
    
    // Add needs to diagnosed state (player has now confirmed their diagnosis)
    diagnosedState.needs = discoveredNeeds;
  }
  
  // Ensure constitution is set
  if (!diagnosedState.constitution) {
    diagnosedState.constitution = customer.constitution; // Constitution is known from type assignment
  }
  
  // Calculate toxicity stage term if player used 切 (only if not already converted to term)
  if (diagnosedState.toxicity && typeof diagnosedState.toxicity === 'object') {
    const ratio = customer.maxToxicity > 0 ? diagnosedState.toxicity.current / diagnosedState.toxicity.max : 0;
    let stageTerm;
    if (ratio < 0.25) stageTerm = '微毒';
    else if (ratio < 0.50) stageTerm = '積毒';
    else if (ratio < 0.75) stageTerm = '深毒';
    else stageTerm = '劇毒';
    
    // Replace raw numbers with stage term
    diagnosedState.toxicity = stageTerm;
  } else if (!diagnosedState.toxicity) {
    // Player didn't use 切
    diagnosedState.toxicity = '未明';
  }
  // If already a string (term), keep it as is
  
  const popupOverlay = document.getElementById('popupOverlay');
  const resultPopup = document.getElementById('diagnosisResultPopup');
  const resultText = document.getElementById('diagnosisResultText');
  
  // Format diagnosed state for display (only show what player has discovered)
  let displayText = '';
  
  if (diagnosedState.constitution) {
    displayText += `體質： ${diagnosedState.constitution}\n\n`;
  } else {
    displayText += `體質：未明\n\n`;
  }
  
  if (diagnosedState.needs && diagnosedState.needs.length > 0) {
    const needsSummary = diagnosedState.needs
      .map(n => {
        const needData = needsData.find(nd => nd.code === n.code);
        return `  ${needData ? needData.label : n.code}`;
      })
      .join('\n');
    displayText += `需求：\n${needsSummary}\n\n`;
  } else {
    displayText += `需求：未明\n\n`;
  }
  
  if (diagnosedState.toxicity) {
    displayText += `毒性：${diagnosedState.toxicity}`;
  } else {
    displayText += `毒性：Not diagnosed`;
  }
  
  resultText.textContent = displayText;
  
  popupOverlay.style.display = 'flex';
  popupOverlay.style.zIndex = '30000';
  resultPopup.style.display = 'block';
  document.getElementById('typePopup').style.display = 'none';
  document.getElementById('deathPopup').style.display = 'none';
  document.getElementById('pulsePopup').style.display = 'none';
  
  // Build truth state for export
  const truthState = {
    constitution: customer.constitution,
    needs: customer.needs.map(n => ({ code: n.code, isMain: n.isMain })),
    toxicity: {
      current: customer.currentToxicity,
      max: customer.maxToxicity
    }
  };
  
  // Set up Export button handler
  const btnExport = document.getElementById('btnDiagnosisResultExport');
  btnExport.onclick = () => {
    exportDiagnosisData(truthState, diagnosedState);
  };
  
  // Set up OK button handler
  const btnOk = document.getElementById('btnDiagnosisResultOk');
  const handler = () => {
    popupOverlay.style.display = 'none';
    resultPopup.style.display = 'none';
    btnOk.onclick = null;
    btnExport.onclick = null;
    
    // Re-enable clue buttons
    clueButtons.forEach(btn => {
      if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }
    });
    
    // Now end diagnosis and call completion callback
    // IMPORTANT: Save diagnosedState BEFORE calling endDiagnosis() which resets it to null
    const finalDiagnosedState = {
      constitution: diagnosedState.constitution,
      needs: diagnosedState.needs || [],
      toxicity: diagnosedState.toxicity
    };
    endDiagnosis(); // This resets diagnosedState = null
    if (onComplete) onComplete(finalDiagnosedState);
  };
  btnOk.onclick = handler;
}

// Show Diagnosis Selection UI (for 拍板)
function showDiagnosisSelectionUI(customer, needsData, onComplete) {
  // Disable all clue buttons while selection UI is showing
  const clueButtons = document.querySelectorAll('.clueButton');
  clueButtons.forEach(btn => {
    if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
    }
  });
  
  const popupOverlay = document.getElementById('popupOverlay');
  const selectionUI = document.getElementById('diagnosisSelectionUI');
  const needsArea = document.getElementById('needsSelectionArea');
  const toxicityArea = document.getElementById('toxicityDisplayArea');
  
  // Clear previous content
  needsArea.innerHTML = '';
  
  // Build needs selection UI
  needsData.forEach(need => {
    const confidence = collectedConfidences[need.code] || 0;
    const isComplete = confidence >= 100;
    
    // Check if this need is actually main or secondary in customer's needs
    const customerNeed = customer.needs.find(n => n.code === need.code);
    const isActuallyMain = customerNeed && customerNeed.isMain;
    const isActuallySecondary = customerNeed && !customerNeed.isMain;
    
    const item = document.createElement('div');
    item.className = 'needSelectionItem';
    
    const label = document.createElement('label');
    label.textContent = `${need.label}`;
    label.style.flex = '1';
    
    const mainRadio = document.createElement('input');
    mainRadio.type = 'radio';
    mainRadio.name = 'mainNeed';
    mainRadio.value = need.code;
    mainRadio.id = `main_${need.code}`;
    // Pre-select if complete and actually main
    if (isComplete && isActuallyMain) {
      mainRadio.checked = true;
    }
    
    const mainLabel = document.createElement('label');
    mainLabel.htmlFor = `main_${need.code}`;
    mainLabel.textContent = '主需求';
    mainLabel.style.marginRight = '15px';
    
    const secondaryCheck = document.createElement('input');
    secondaryCheck.type = 'checkbox';
    secondaryCheck.value = need.code;
    secondaryCheck.id = `secondary_${need.code}`;
    // Pre-select if complete and actually secondary
    if (isComplete && isActuallySecondary) {
      secondaryCheck.checked = true;
    }
    
    const secondaryLabel = document.createElement('label');
    secondaryLabel.htmlFor = `secondary_${need.code}`;
    secondaryLabel.textContent = '次需求';
    
    // Handle radio change: uncheck secondary if main is selected
    mainRadio.addEventListener('change', () => {
      if (mainRadio.checked) {
        secondaryCheck.checked = false;
        updateConfirmButton();
      }
    });
    
    // Handle checkbox change: uncheck main if secondary is selected
    secondaryCheck.addEventListener('change', () => {
      if (secondaryCheck.checked) {
        mainRadio.checked = false;
      }
      updateConfirmButton();
    });
    
    item.appendChild(label);
    item.appendChild(mainRadio);
    item.appendChild(mainLabel);
    item.appendChild(secondaryCheck);
    item.appendChild(secondaryLabel);
    needsArea.appendChild(item);
  });
  
  // Display toxicity
  if (diagnosedState.toxicity && typeof diagnosedState.toxicity === 'string') {
    // Already converted to term
    toxicityArea.textContent = `毒性： ${diagnosedState.toxicity}`;
  } else if (diagnosedState.toxicity) {
    // Still has raw numbers, calculate term
    const ratio = customer.maxToxicity > 0 ? diagnosedState.toxicity.current / diagnosedState.toxicity.max : 0;
    let stageTerm;
    if (ratio < 0.25) stageTerm = '微毒';
    else if (ratio < 0.50) stageTerm = '積毒';
    else if (ratio < 0.75) stageTerm = '深毒';
    else stageTerm = '劇毒';
    toxicityArea.textContent = `毒性： ${stageTerm}`;
  } else {
    toxicityArea.textContent = '毒性： 未明';
  }
  
  // Validation function
  function updateConfirmButton() {
    const btnConfirm = document.getElementById('btnDiagnosisSelectionConfirm');
    const mainSelected = document.querySelector('input[name="mainNeed"]:checked');
    const secondarySelected = document.querySelectorAll('input[type="checkbox"]:checked');
    
    if (!mainSelected || secondarySelected.length > 2) {
      btnConfirm.disabled = true;
    } else {
      btnConfirm.disabled = false;
    }
  }
  
  // Initial validation
  updateConfirmButton();
  
  // Show UI
  popupOverlay.style.display = 'flex';
  popupOverlay.style.zIndex = '30000';
  selectionUI.style.display = 'block';
  document.getElementById('typePopup').style.display = 'none';
  document.getElementById('deathPopup').style.display = 'none';
  document.getElementById('pulsePopup').style.display = 'none';
  document.getElementById('diagnosisResultPopup').style.display = 'none';
  
  // Set up Cancel button
  const btnCancel = document.getElementById('btnDiagnosisSelectionCancel');
  btnCancel.onclick = () => {
    popupOverlay.style.display = 'none';
    selectionUI.style.display = 'none';
    
    // Re-enable clue buttons
    clueButtons.forEach(btn => {
      if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }
    });
  };
  
  // Set up Confirm button
  const btnConfirm = document.getElementById('btnDiagnosisSelectionConfirm');
  btnConfirm.onclick = () => {
    // Get player's selections
    const mainSelected = document.querySelector('input[name="mainNeed"]:checked');
    const secondarySelected = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'));
    
    if (!mainSelected) return; // Should not happen due to validation
    
    // Build diagnosed needs array
    const selectedNeeds = [];
    
    // Add main need
    const mainNeedData = needsData.find(n => n.code === mainSelected.value);
    if (mainNeedData) {
      selectedNeeds.push({ code: mainSelected.value, isMain: true });
    }
    
    // Add secondary needs
    secondarySelected.forEach(checkbox => {
      const secondaryNeedData = needsData.find(n => n.code === checkbox.value);
      if (secondaryNeedData) {
        selectedNeeds.push({ code: checkbox.value, isMain: false });
      }
    });
    
    // Sort: main first
    selectedNeeds.sort((a, b) => {
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      return 0;
    });
    
    // Update diagnosed state with player's explicit selections
    diagnosedState.needs = selectedNeeds;
    diagnosedState.constitution = customer.constitution;
    
    // Handle toxicity (already set if 切 was used, otherwise 未明)
    if (!diagnosedState.toxicity) {
      diagnosedState.toxicity = '未明';
    } else if (typeof diagnosedState.toxicity === 'object') {
      // Still has raw numbers, convert to term
      const ratio = customer.maxToxicity > 0 ? diagnosedState.toxicity.current / diagnosedState.toxicity.max : 0;
      let stageTerm;
      if (ratio < 0.25) stageTerm = '微毒';
      else if (ratio < 0.50) stageTerm = '積毒';
      else if (ratio < 0.75) stageTerm = '深毒';
      else stageTerm = '劇毒';
      diagnosedState.toxicity = stageTerm;
    }
    
    // Close selection UI
    popupOverlay.style.display = 'none';
    selectionUI.style.display = 'none';
    
    // Re-enable clue buttons
    clueButtons.forEach(btn => {
      if (btn.style.display !== 'none' && btn.style.visibility !== 'hidden') {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }
    });
    
    // End diagnosis and proceed to result popup (same flow as normal completion)
    // Note: Don't call endDiagnosis() here because it resets diagnosedState
    // Instead, just hide the diagnosis overlay
    const diagnosisOverlay = document.getElementById('diagnosisOverlay');
    diagnosisOverlay.classList.remove('active');
    diagnosisOverlay.style.display = 'none';
    
    // Clear clue containers but keep diagnosedState
    document.getElementById('cluesContainer').innerHTML = '';
    document.getElementById('confidenceBars').innerHTML = '';
    document.getElementById('diagnosisConfirmContainer').classList.remove('active');
    document.getElementById('questionMenu').classList.remove('active');
    document.getElementById('speechBalloon').classList.remove('active', 'fade-out');
    
    currentClueSelection = null;
    isQuestionMenuOpen = false;
    window._currentCustomer = null;
    
    // Now show the result popup
    showDiagnosisResultPopup(customer, needsData, onComplete);
  };
}

// Get collected confidences (for diagnosis output)
export function getCollectedConfidences() {
  return { ...collectedConfidences };
}
