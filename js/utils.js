// Enums and pools
export const VisitState = Object.freeze({
  NoActiveVisit: 'NoActiveVisit',
  VisitInProgress: 'VisitInProgress'
});
export const constitutionTypes = ['木','火','土','金','水'];

// 五行相剋 (weakness multiplier) mapping
// Maps each element to the element that weakens it (剋)
// 金剋木, 木剋土, 土剋水, 水剋火, 火剋金
export const wuxingWeakness = {
  '木': '金',  // Wood is weakened by Metal
  '火': '水',  // Fire is weakened by Water
  '土': '木',  // Earth is weakened by Wood
  '金': '火',  // Metal is weakened by Fire
  '水': '土'   // Water is weakened by Earth
};

// Weakness multiplier constant
export const WEAKNESS_MULTIPLIER = 1.5;

// 五行相生 (generation/benefit) mapping
// Maps each element to the element that generates/benefits it (生)
// 木生火, 火生土, 土生金, 金生水, 水生木
export const wuxingBenefit = {
  '火': '木',  // Fire is benefited by Wood
  '土': '火',  // Earth is benefited by Fire
  '金': '土',  // Metal is benefited by Earth
  '水': '金',  // Water is benefited by Metal
  '木': '水'   // Wood is benefited by Water
};

// Benefit multiplier constant (for need satisfaction)
export const BENEFIT_MULTIPLIER = 1.2;

// CSV parsing utility
export function parseCSV(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',');
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    let isEmpty = true;
    
    for (let j = 0; j < headers.length; j++) {
      const value = values[j] ? values[j].trim() : '';
      row[headers[j]] = value;
      if (value) isEmpty = false;
    }
    
    // Skip empty rows
    if (!isEmpty) {
      rows.push(row);
    }
  }
  
  return rows;
}

// Load needs from CSV
export async function loadNeedsData() {
  try {
    const response = await fetch('needs.csv');
    if (!response.ok) throw new Error(`Failed to load needs.csv: ${response.status}`);
    const text = await response.text();
    const rows = parseCSV(text);
    
    // Transform to expected format
    return rows.map(row => ({
      code: row.NeedName ? row.NeedName.charAt(0) : '',  // Extract A, B, C, D, E from "A：..."
      label: row.NeedName || '',
      greetingText: row.GreetingText || ''
    })).filter(need => need.code); // Filter out invalid entries
  } catch (error) {
    console.error('Error loading needs.csv:', error);
    return [];
  }
}

// Load clues from CSV
export async function loadCluesData() {
  try {
    const response = await fetch('clues.csv');
    if (!response.ok) throw new Error(`Failed to load clues.csv: ${response.status}`);
    const text = await response.text();
    const rows = parseCSV(text);
    
    // Transform to expected format
    return rows.map(row => ({
      id: row.ClueID || '',
      method: row.DiagnosisMethod || '',
      text: row.ClueText || '',
      hiddenRank: parseInt(row.HiddenRank) || 0,
      confA: parseInt(row.ConfA) || 0,
      confB: parseInt(row.ConfB) || 0,
      confC: parseInt(row.ConfC) || 0,
      confD: parseInt(row.ConfD) || 0,
      confE: parseInt(row.ConfE) || 0
    })).filter(clue => clue.id); // Filter out invalid entries
  } catch (error) {
    console.error('Error loading clues.csv:', error);
    return [];
  }
}
export const namePool = [
  '李玄真','王守一','張子虛','陳養和','周清遠','劉觀明',
  '趙靜修','黃元和','吳養生','徐太和','沈抱樸','何存真'
];
export const clothesColorPool = [
  '#355C7D', '#6C5B7B', '#3C6E71', '#B56576'
];
export const skinTonePool = [
  '#F2D1B0', '#D9A066', '#B67A4F'
];

// Color helpers
export function hexToRgb(hex) {
  if (!hex) return { r: 242, g: 209, b: 176 };
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
export function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
export function lerp(a, b, t) { return a + (b - a) * t; }
export function darkenHex(hex, factor) {
  const rgb = hexToRgb(hex);
  return rgbToHex(Math.round(rgb.r * factor), Math.round(rgb.g * factor), Math.round(rgb.b * factor));
}
