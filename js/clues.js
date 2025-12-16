// Clue selection logic for diagnosis

export function selectCluesForVisit(customer, cluesData, needsData) {
  if (!customer.needs || customer.needs.length === 0) {
    return { selectedClues: [], confidences: {}, warnings: ['No customer needs defined'] };
  }

  const presentCodes = customer.needs.map(n => n.code);
  const allCodes = needsData.map(n => n.code);
  const absentCodes = allCodes.filter(c => !presentCodes.includes(c));

  // Initialize confidence tracking
  const confidences = {};
  allCodes.forEach(code => confidences[code] = 0);

  const selectedClues = [];
  const availableClues = [...cluesData];

  // Helper: calculate score for a clue
  function scoreClue(clue) {
    let presentScore = 0;
    let absentScore = 0;

    presentCodes.forEach(code => {
      presentScore += clue[`conf${code}`] || 0;
    });

    absentCodes.forEach(code => {
      absentScore += clue[`conf${code}`] || 0;
    });

    // Ratio scoring: favor clues with high present, low absent
    const quality = presentScore / (absentScore + 1);
    return { quality, presentScore, absentScore };
  }

  // Helper: check if all present needs are satisfied
  function allPresentSatisfied() {
    return presentCodes.every(code => confidences[code] >= 100);
  }

  // Helper: check if clue helps any under-100 present need
  function helpsUnderservedNeed(clue) {
    return presentCodes.some(code => {
      return confidences[code] < 100 && (clue[`conf${code}`] || 0) > 0;
    });
  }

  // Main selection loop
  let iterations = 0;
  const MAX_ITERATIONS = 50; // Safety limit

  while (!allPresentSatisfied() && availableClues.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Score all remaining clues that help underserved needs
    const scoredClues = availableClues
      .filter(clue => helpsUnderservedNeed(clue))
      .map(clue => ({ clue, ...scoreClue(clue) }))
      .sort((a, b) => b.quality - a.quality);

    if (scoredClues.length === 0) {
      // No helpful clues remain
      break;
    }

    // Pick randomly from top 3 candidates (or fewer if not enough)
    const topCandidates = scoredClues.slice(0, Math.min(3, scoredClues.length));
    const chosen = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    // Add chosen clue
    selectedClues.push(chosen.clue);

    // Update confidences
    allCodes.forEach(code => {
      confidences[code] += chosen.clue[`conf${code}`] || 0;
    });

    // Remove from available
    const idx = availableClues.findIndex(c => c.id === chosen.clue.id);
    if (idx >= 0) availableClues.splice(idx, 1);
  }

  // Generate warnings
  const warnings = [];

  // Check if we failed to reach 100 for any present need
  presentCodes.forEach(code => {
    if (confidences[code] < 100) {
      warnings.push(`WARNING: Need ${code} only reached ${confidences[code]}/100 confidence`);
    }
  });

  // Check for false positives (absent needs reaching high confidence)
  absentCodes.forEach(code => {
    if (confidences[code] >= 80) {
      warnings.push(`WARNING: Absent need ${code} reached ${confidences[code]} confidence (false positive risk)`);
    }
  });

  if (iterations >= MAX_ITERATIONS) {
    warnings.push('WARNING: Maximum iterations reached in clue selection');
  }

  return { selectedClues, confidences, warnings };
}

