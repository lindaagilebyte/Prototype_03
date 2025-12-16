// data.js - v4.0 (Sarcastic Master Edition)

// --- 1. 五行基礎定義 ---
const Elements = {
    METAL: "金", 
    WOOD: "木", 
    WATER: "水", 
    FIRE: "火", 
    EARTH: "土",
    ALL: "全" // ✨ 新增這行
};

const ElementColors = {
    "金": "#E0E0E0", 
    "木": "#4CAF50", 
    "水": "#29B6F6", 
    "火": "#FF5252", 
    "土": "#FFC107",
    "全": "#b700ffff"  // ✨ 新增這行，全屬性用白色或彩虹色代表
};

// --- 2. 文案資料庫 (TextDB) ---
// 源自: 文案對應.csv
const TextDB = {
    // --- 陰陽程度 (1-7) ---
    1: "純陽",
    2: "陽性",
    3: "偏陽",
    4: "平衡",
    5: "偏陰",
    6: "陰性",
    7: "純陰",

    // --- 配方外觀描述 (8-17) ---
    8: "紫紅色堅硬晶體，光芒耀眼",
    9: "灰白色或淡粉色細粉末",
    10: "五色斑斕的結晶，紅青色為主",
    11: "橘紅色至鮮紅色的細粉或藥丸",
    12: "流動的金色液體/紫色霜狀物",
    13: "紫色的霜狀結晶",
    14: "蓬鬆紅色粉末，夾雜汞珠",
    15: "紅黃相間的粉末或塊狀物",
    16: "紅/綠色支狀結晶(像珊瑚)",
    17: "五色分明，像打碎的彩色琉璃",

    // --- 服藥反應 (18-27) ---
    18: "腹痛如絞、血便、全屬性暫時暴增後衰竭",
    19: "全身燥熱難耐、皮膚極度敏感、精神亢奮",
    20: "嘔吐藍綠色液體、腹痛、神智抽離",
    21: "手指震顫、患處腐肉脫落",
    22: "失去重力感、劇烈嘔吐、昏迷",
    23: "體溫驟降、神智清醒、鎮靜",
    24: "七竅流血、脫水、極度興奮後面色潮紅",
    25: "產生幻覺(無畏感)、焦慮消失",
    26: "消化道劇烈燒灼、吐血、夜間視力異常",
    27: "強烈視聽幻覺(見神靈)、精神解離",

    // --- 配方名稱 (28-37) ---
    28: "九轉金丹",
    29: "五石散",
    30: "太一神精丹",
    31: "小還丹",
    32: "太清金液",
    33: "紫雪丹",
    34: "赤雪流珠丹",
    35: "三五神丹",
    36: "琅玕華丹",
    37: "五靈丹",

    // --- 材料外觀描述 (38-48) ---
    38: "色赤入心，對應南方火。這是最標準的火屬性礦物。",
    39: "色白入肺，對應西方金。雖然是石頭，但因色白而歸金。",
    40: "雖常由丹砂提煉，但作為「液態金屬」本身亦存在於自然界。色白如銀，視覺直覺為金。",
    41: "核心設定：色黃居中，萬物之主，皇極之土。",
    42: "白色結晶，寒性之金，用於清熱。",
    43: "色黃，歸類為陽土。用於辟邪防護。",
    44: "色黃，歸類為流動之土（引火媒）。",
    45: "色青入肝，對應東方木。極為稀有的木屬性礦物。",
    46: "雖然是從曾青(木)提煉出來的，但「煉銅」是去除雜質還原真身的過程，並非化合。還原後的紅銅色澤紫紅，故視為火。",
    47: "鉛色黑灰，對應北方坎水。這是所有水屬性變化的源頭。",
    48: "雖然外表是橘紅色(像火/土)，但它是黑鉛燒煉後的氧化物。依照「人造追溯原料」規則，它的本質依然是水。",

    // --- 材料名稱 (49-59) ---
    49: "丹砂",
    50: "鐘乳石",
    51: "水銀",
    52: "黃金",
    53: "石膏",
    54: "雄黃",
    55: "石硫黃",
    56: "曾青",
    57: "銅",
    58: "黑鉛",
    59: "黃丹",
    // ★★★ 新增：症狀對應文案 (60-64) ★★★
    60: "安神/安眠",
    61: "振奮/快感",
    62: "補氣/補腎",
    63: "養顏/回春",
    64: "止痛/遮斷"
};
// ★★★ 新增：症狀資料庫 (SymptomsDB) ★★★
// 對應「症狀對應.csv」
const SymptomsDB = {
    1: { id: 1, element: Elements.WATER, descId: 60 },
    2: { id: 2, element: Elements.FIRE,  descId: 61 },
    3: { id: 3, element: Elements.EARTH, descId: 62 },
    4: { id: 4, element: Elements.WOOD,  descId: 63 },
    5: { id: 5, element: Elements.METAL, descId: 64 }
};
// --- 3. 材料資料庫 ---
// (保留您原本的 MaterialDB，完全不用動)
const MaterialDB = {
    DAN_SHA: { nameId: 49, element: Elements.FIRE, max: 2, color: "#E34234", status: "天然", formula: "HgS", toxin: 10, heatToxin: 8.5, descId: 38 },
    ZHONG_RU_SHI: { nameId: 50, element: Elements.METAL, max: 3, color: "#FBFBE8", status: "天然", formula: "CaCO₃", toxin: 0.5, heatToxin: 1, descId: 39 },
    SHUI_YIN: { nameId: 51, element: Elements.METAL, max: 5, color: "#E5E4E2", status: "天然", formula: "Hg", toxin: 20, heatToxin: 5, descId: 40 },
    HUANG_JIN: { nameId: 52, element: Elements.EARTH, max: 4, color: "#FFD700", status: "天然", formula: "Au", toxin: 0.1, heatToxin: 1, descId: 41 },
    SHI_GAO: { nameId: 53, element: Elements.METAL, max: 3, color: "#FFFFFF", status: "天然", formula: "CaSO₄·2H₂O", toxin: 0.1, heatToxin: 1, descId: 42 },
    XIONG_HUANG: { nameId: 54, element: Elements.EARTH, max: 2, color: "#FFA500", status: "天然", formula: "As₄S₄", toxin: 15, heatToxin: 65, descId: 43 },
    SHI_LIU_HUANG: { nameId: 55, element: Elements.EARTH, max: 3, color: "#FDFD96", status: "天然", formula: "S或 S8", toxin: 5, heatToxin: 1, descId: 44 },
    ZENG_QING: { nameId: 56, element: Elements.WOOD, max: 2, color: "#40E0D0", status: "天然", formula: "Cu₂(OH)₂CO₃", toxin: 40, heatToxin: 1, descId: 45 },
    TONG: { nameId: 57, element: Elements.FIRE, max: 2, color: "#B87333", status: "提煉", formula: "Cu", toxin: 5, heatToxin: 1, descId: 46 },
    HEI_QIAN: { nameId: 58, element: Elements.WATER, max: 3, color: "#2F353B", status: "天然", formula: "Pb", toxin: 25, heatToxin: 1, descId: 47 },
    HUANG_DAN: { nameId: 59, element: Elements.WATER, max: 4, color: "#FF4500", status: "人造", formula: "Pb₃O₄", toxin: 50, heatToxin: 1, descId: 48 }
};

// --- 4. 配方資料庫 ---
// (更新依據：配方表_v2.png)
const RecipeDB = [
    {
        nameId: 28, // 九轉金丹
        targets: ["DAN_SHA", "SHUI_YIN"],
        ratio: [0.5, 0.3],
        element: Elements.FIRE, // 表格更新：金 -> 火
        grindTarget: 0.6,
        descId: 8,
        effectId: 18,
        symptoms: [2, 4]
    },
    {
        nameId: 29, // 五石散
        targets: ["ZHONG_RU_SHI", "SHI_LIU_HUANG"], // 修正拼字 SHI_RIU -> SHI_LIU
        ratio: [1.0, 0.5],
        element: Elements.METAL, // 表格更新：土 -> 金
        grindTarget: 0.6,
        descId: 9,
        effectId: 19,
        symptoms: [2, 4]
    },
    {
        nameId: 30, // 太一神精丹
        targets: ["DAN_SHA", "ZENG_QING"], // 修正拼字 ZEN -> ZENG
        ratio: [0.1, 0.1],
        element: Elements.FIRE, // 表格更新：木 -> 火
        grindTarget: 0.6,
        descId: 10,
        effectId: 20,
        symptoms: [1, 5]
    },
    {
        nameId: 31, // 小還丹
        targets: ["SHUI_YIN", "SHI_LIU_HUANG"], // 修正拼字 SHI_RIU -> SHI_LIU
        ratio: [1.0, 0.5],
        element: Elements.METAL, // 表格更新：水 -> 金
        grindTarget: 0.6,
        descId: 11,
        effectId: 21,
        symptoms: [2, 3]
    },
    {
        nameId: 32, // 太清金液
        targets: ["HUANG_JIN", "SHUI_YIN"],
        ratio: [10.0, 20.0],
        element: Elements.EARTH, // 維持土
        grindTarget: 0.6,
        descId: 12,
        effectId: 22,
        symptoms: [3, 4]
    },
    {
        nameId: 33, // 紫雪丹
        targets: ["SHI_GAO", "DAN_SHA"],
        ratio: [10.0, 0.2],
        element: Elements.METAL, // 表格更新：火 -> 金
        grindTarget: 0.6,
        descId: 13,
        effectId: 23,
        symptoms: [1, 5]
    },
    {
        nameId: 34, // 赤雪流珠丹
        targets: ["DAN_SHA", "XIONG_HUANG"], // 修正拼字 XUNG -> XIONG
        ratio: [0.8, 0.3],
        element: Elements.FIRE, // 表格更新：土 -> 火
        grindTarget: 0.6,
        descId: 14,
        effectId: 24,
        symptoms: [3, 5]
    },
    {
        nameId: 35, // 三五神丹
        targets: ["XIONG_HUANG", "DAN_SHA"], // 修正拼字 XUNG -> XIONG
        ratio: [0.5, 2.0],
        element: Elements.EARTH, // 表格更新：火 -> 土
        grindTarget: 0.6,
        descId: 15,
        effectId: 25,
        symptoms: [1, 3]
    },
    {
        nameId: 36, // 琅玕華丹
        targets: ["SHUI_YIN", "TONG"], // 修正拼字 TUNG -> TONG
        ratio: [2.0, 30.0],
        element: Elements.METAL, // 維持金
        grindTarget: 0.6,
        descId: 16,
        effectId: 26,
        symptoms: [3, 4]
    },
    {
        nameId: 37, // 五靈丹
        targets: ["DAN_SHA", "XIONG_HUANG"], // 修正拼字 XUNG -> XIONG
        ratio: [50.0, 0.5],
        element: Elements.ALL, // 維持全屬性
        grindTarget: 0.6,
        descId: 17,
        effectId: 27,
        symptoms: [2, 5]
    }
];


// --- 5. 大師研發建議語錄（修正版） ---
const MasterAdviceDB = {
    WRONG_MATERIAL: 
        "呵，這材料嘛……算是『近親遠支』。替代得巧是本事，用得正才是底氣，還是回頭找對那味正主藥材吧。",
    WRONG_ELEMENT: 
        "五行運轉倒不甚流暢，屬性之間還在暗中角力。若能再細調五行取向，藥性會乖得多。",
    WRONG_RATIO: 
        "分量和研磨程度拿捏得有點放飛自我啊。再精細些，少一點豪氣，多一點算計，品質自然會再上一階。"
};
