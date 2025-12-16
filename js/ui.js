// All DOM/UI logic centralized here
export function getElements() {
  return {
    logEl: document.getElementById('log'),
    statusEl: document.getElementById('status'),
    btnReset: document.getElementById('btnReset'),
    btnSpawn: document.getElementById('btnSpawn'),
    btnClick: document.getElementById('btnClick'),
    btnDiagnose: document.getElementById('btnDiagnose'),
    btnLeave: document.getElementById('btnLeave'),
    gameScreen: document.getElementById('gameScreen'),
    popupOverlay: document.getElementById('popupOverlay'),
    typePopup: document.getElementById('typePopup'),
    deathPopup: document.getElementById('deathPopup'),
    typePopupText: document.getElementById('typePopupText'),
    deathPopupText: document.getElementById('deathPopupText'),
    btnTypeOk: document.getElementById('btnTypeOk'),
    btnDeathOk: document.getElementById('btnDeathOk'),
    customerSprite: document.getElementById('customerSprite'),
    spriteHead: document.getElementById('spriteHead'),
    spriteBody: document.getElementById('spriteBody'),
    spriteHandLeft: document.getElementById('spriteHandLeft'),
    spriteHandRight: document.getElementById('spriteHandRight'),
    spriteMouth: document.getElementById('spriteMouth'),
  };
}

export function logLine(ui, msg) {
  const timestamp = new Date().toLocaleTimeString();
  ui.logEl.textContent += `[${timestamp}] ${msg}\n`;
  ui.logEl.scrollTop = ui.logEl.scrollHeight;
}

export function updateStatus(ui, customer, visitState) {
  const constitutionDisplay = customer.constitution === null ? '—' : customer.constitution;
  ui.statusEl.textContent =
    `State: ${visitState} | ` +
    `Toxicity: ${customer.currentToxicity}/${customer.maxToxicity} | ` +
    `Constitution: ${constitutionDisplay} | ` +
    `Alive: ${customer.alive}`;
}

export function showOnlyButton(ui, buttonKey) {
  const keys = ['btnSpawn', 'btnClick', 'btnDiagnose', 'btnLeave'];
  keys.forEach(key => {
    ui[key].style.display = (buttonKey === key) ? 'inline-block' : 'none';
  });
}

export function updateButtons(ui, state) {
  // state = { popupActive, customer, visitState, diagnosis }
  const { popupActive, customer, visitState, diagnosis } = state;
  ui.btnSpawn.disabled = popupActive || !customer.alive || visitState !== 'NoActiveVisit';
  ui.btnClick.disabled = popupActive || !customer.alive || visitState !== 'VisitInProgress' || customer.constitution !== null;
  ui.btnDiagnose.disabled = popupActive || !customer.alive || visitState !== 'VisitInProgress' || customer.constitution === null || diagnosis !== null;
  ui.btnLeave.disabled = popupActive || !customer.alive || visitState !== 'VisitInProgress' || diagnosis === null;
}

export function updateCustomerSprite(ui, customer, visitState, utils) {
  if (!ui.customerSprite) return;
  // Visible if alive & visit in progress
  if (!customer.alive || visitState !== 'VisitInProgress') {
    ui.customerSprite.style.display = 'none';
    return;
  }
  ui.customerSprite.style.display = 'block';

  // Toxicity influence
  const ratio = customer.maxToxicity > 0 ? customer.currentToxicity / customer.maxToxicity : 0;
  let stageIndex;
  if (ratio < 0.25) stageIndex = 0;
  else if (ratio < 0.50) stageIndex = 1;
  else if (ratio < 0.75) stageIndex = 2;
  else stageIndex = 3;

  // Blend skin
  const baseHex = customer.skinBaseColor || '#F2D1B0';
  const sickRgb = { r: 120, g: 130, b: 110 };
  const baseRgb = utils.hexToRgb(baseHex);
  const blendFactors = [0.0, 0.25, 0.5, 0.75];
  const t = blendFactors[stageIndex];
  const r = Math.round(utils.lerp(baseRgb.r, sickRgb.r, t));
  const g = Math.round(utils.lerp(baseRgb.g, sickRgb.g, t));
  const b = Math.round(utils.lerp(baseRgb.b, sickRgb.b, t));
  customer.skinCurrentColor = utils.rgbToHex(r, g, b);

  // Head posture
  const base = 240;
  const dropPerStage = [0, 0, 20, 40];
  const headDrop = dropPerStage[stageIndex] || 0;
  ui.spriteHead.style.bottom = (base - headDrop) + 'px';

  // Mouth (satisfaction)
  const baseSkin = customer.skinCurrentColor || customer.skinBaseColor || '#F2D1B0';
  const mouthColor = utils.darkenHex(baseSkin, 0.45);
  ui.spriteMouth.style.color = mouthColor;
  let cls;
  let bottomOffset = 0;
  if (customer.previousSatisfaction === 'High') {
    cls = 'mouth-smile'; bottomOffset = -3;
  } else if (customer.previousSatisfaction === 'Low') {
    cls = 'mouth-frown'; bottomOffset = -3;
  } else {
    cls = 'mouth-neutral'; bottomOffset = 0;
  }
  ui.spriteMouth.className = cls;
  ui.spriteMouth.style.bottom = (28 + bottomOffset) + 'px';

  // Colors
  const clothesColor = customer.clothesColor || '#444444';
  const skinColor = customer.skinCurrentColor || '#F2D1B0';
  ui.spriteBody.style.backgroundColor = clothesColor;
  ui.spriteHead.style.backgroundColor = skinColor;
  ui.spriteHandLeft.style.backgroundColor = skinColor;
  ui.spriteHandRight.style.backgroundColor = skinColor;
}

// Popup logic
export function showTypePopup(ui, customer) {
  ui.popupOverlay.style.display = 'flex';
  ui.typePopup.style.display = 'block';
  ui.deathPopup.style.display = 'none';
  ui.typePopupText.innerHTML = `<b>Constitution Assigned</b><br>Name: ${customer.name}<br>Constitution: ${customer.constitution}`;
}
export function hideTypePopup(ui) {
  ui.typePopup.style.display = 'none';
}
export function showDeathPopup(ui, customer) {
  ui.popupOverlay.style.display = 'flex';
  ui.typePopup.style.display = 'none';
  ui.deathPopup.style.display = 'block';
  ui.deathPopupText.innerHTML = `<b>Customer Deceased</b><br>Customer ${customer.name} has died from toxicity.<br>Toxicity: ${customer.currentToxicity}/${customer.maxToxicity}.`;
}
export function hideDeathPopup(ui) {
  ui.deathPopup.style.display = 'none';
}
export function hidePopupOverlay(ui) {
  ui.popupOverlay.style.display = 'none';
  hideTypePopup(ui); hideDeathPopup(ui);
}
