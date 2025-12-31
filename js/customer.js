export class Customer {
  constructor(namePool, clothesColorPool, skinTonePool) {
    this.namePool = namePool;
    this.clothesColorPool = clothesColorPool;
    this.skinTonePool = skinTonePool;
    this.reset();
  }

  reset() {
    this.name = null;
    this.constitution = null;
    this.constitutionRevealed = false;
    this.needs = [];  // Will be assigned on first visit
    this.primaryNeedCode = null;  // Fixed for this customer
    this.maxToxicity = null;  // Will be assigned on first visit (random 80-120)
    this.currentToxicity = 0;
    this.relationship = 'New';
    this.previousSatisfaction = 'None';
    this.alive = true;
    this.clothesColor = null;
    this.skinBaseColor = null;
    this.skinCurrentColor = null;
  }

  assignNameAndVisuals() {
    if (this.name === null) {
      const idxName    = Math.floor(Math.random() * this.namePool.length);
      const idxClothes = Math.floor(Math.random() * this.clothesColorPool.length);
      const idxSkin    = Math.floor(Math.random() * this.skinTonePool.length);
      this.name           = this.namePool[idxName];
      this.clothesColor   = this.clothesColorPool[idxClothes];
      this.skinBaseColor  = this.skinTonePool[idxSkin];
      this.skinCurrentColor = this.skinBaseColor;
      
      // Assign random maxToxicity (80-120) - fixed for this customer
      if (this.maxToxicity === null) {
        this.maxToxicity = 80 + Math.floor(Math.random() * 41); // 80-120 inclusive
      }
    }
  }

  assignConstitution(constitutionPool) {
    if (this.constitution === null) {
      const idx = Math.floor(Math.random() * constitutionPool.length);
      this.constitution = constitutionPool[idx];
    }
  }

  increaseToxicity(delta) {
    this.currentToxicity += delta;
    if (this.currentToxicity > this.maxToxicity) {
      this.alive = false;
    }
  }

  // Initialize needs on first visit: 1 primary + 0-2 secondary
  initializeNeeds(needsData) {
    const allCodes = needsData.map(n => n.code);
    
    // Assign primary need (fixed for this customer's lifetime)
    const primaryIdx = Math.floor(Math.random() * allCodes.length);
    this.primaryNeedCode = allCodes[primaryIdx];
    
    // Determine number of secondary needs (0-2)
    const numSecondary = Math.floor(Math.random() * 3); // 0, 1, or 2
    
    // Build needs array
    this.needs = [{ code: this.primaryNeedCode, isMain: true }];
    
    // Add secondary needs
    const availableCodes = allCodes.filter(c => c !== this.primaryNeedCode);
    for (let i = 0; i < numSecondary && availableCodes.length > 0; i++) {
      const idx = Math.floor(Math.random() * availableCodes.length);
      const secondaryCode = availableCodes.splice(idx, 1)[0];
      this.needs.push({ code: secondaryCode, isMain: false });
    }
    
    return this.needs;
  }

  // Before each new visit (after first), check if secondary needs change
  updateSecondaryNeeds(needsData) {
    const allCodes = needsData.map(n => n.code);
    const changeLog = { removed: [], added: [] };
    
    // Separate primary and secondary
    const secondary = this.needs.filter(n => !n.isMain);
    const oldSecondaryCodes = secondary.map(n => n.code);
    
    // Check each secondary need for change (1/5 chance)
    const newSecondary = [];
    const toRemove = [];
    for (const need of secondary) {
      const roll = Math.random();
      if (roll < 0.2) {
        // Flag for removal/change
        toRemove.push(need.code);
      } else {
        // Keep it
        newSecondary.push(need);
      }
    }
    
    // For each removed need, possibly add a new one
    const currentCodes = [this.primaryNeedCode, ...newSecondary.map(n => n.code)];
    const availableCodes = allCodes.filter(c => !currentCodes.includes(c));
    
    for (const removedCode of toRemove) {
      changeLog.removed.push(removedCode);
      
      // 50% chance to add a new need (if available), 50% to just remove
      if (availableCodes.length > 0 && Math.random() < 0.5) {
        const idx = Math.floor(Math.random() * availableCodes.length);
        const newCode = availableCodes.splice(idx, 1)[0];
        newSecondary.push({ code: newCode, isMain: false });
        changeLog.added.push(newCode);
      }
    }
    
    // Rebuild needs array
    this.needs = [
      { code: this.primaryNeedCode, isMain: true },
      ...newSecondary
    ];
    
    return (changeLog.removed.length > 0 || changeLog.added.length > 0) ? changeLog : null;
  }
}
