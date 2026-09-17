// ============================================================
// nickVariations.js
// Генератор вариантов никнейма для поиска похожих каналов.
//
// Возвращает массив уникальных вариантов, отсортированных
// по приоритету (сначала самые вероятные):
//   bucket 0 — топ (минимальные изменения ника)
//   bucket 1 — высокий (частая практика стримеров)
//   bucket 2 — средний (обрезки, разделители, теги)
//   bucket 3 — низкий (leet, typo, реверс, гомоглифы)
//
// Использование в showPlayer.js:
//   generateNickVariations(nickname, [0, 1]) — только топ + высокий
//   generateNickVariations(nickname, [2, 3]) — средний + низкий
//   generateNickVariations(nickname)         — все корзины
// ============================================================

function generateNickVariations(nickname, bucketFilter) {
  if (!nickname) return [];

  const original = nickname.trim();
  if (!original) return [];

  // 4 корзины приоритета. Внутри — Set для дедупликации.
  const buckets = [new Set(), new Set(), new Set(), new Set()];
  // Глобальный Set для дедупликации по регистру между корзинами.
  const seenLower = new Set();

  // Хелпер: добавляет вариант в корзину с указанным приоритетом.
  const push = (s, prio = 2) => {
    if (typeof s !== "string") return;
    const v = s.trim();
    if (!v || v.length < 3 || v.length > 32) return;
    if (v === original) return;
    const lower = v.toLowerCase();
    if (lower === original.toLowerCase()) return;
    if (seenLower.has(lower)) return;
    seenLower.add(lower);
    buckets[prio].add(v);
  };

  // Предрасчёт общих форм.
  const stripped = original.replace(/[_\-. ]/g, "");
  const base = stripped;
  const parts = original.split(/[_\-. ]+/).filter(Boolean);

  // ==========================================================
  // КОРЗИНА 0 — ТОП (самые вероятные совпадения)
  // ==========================================================

  // Точные модификации без разделителей.
  push(original.replace(/_/g, ""), 0);
  push(original.replace(/-/g, ""), 0);
  push(original.replace(/\./g, ""), 0);
  push(original.replace(/ /g, ""), 0);
  push(original.replace(/[_-]/g, ""), 0);
  push(original.replace(/[_\-.]/g, ""), 0);
  push(original.replace(/[_\-.\s]/g, ""), 0);

  // Регистр.
  push(original.toLowerCase(), 0);
  push(original.toUpperCase(), 0);
  push(stripped.toLowerCase(), 0);
  push(stripped.toUpperCase(), 0);
  push(stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase(), 0);

  // Убрать разделители по краям.
  push(original.replace(/^[_\-. ]+|[_\-. ]+$/g, ""), 0);

  // Только буквы и цифры (убрать всё постороннее).
  push(original.replace(/[^a-zA-Zа-яА-Я0-9]/g, ""), 0);

  // ==========================================================
  // КОРЗИНА 1 — ВЫСОКИЙ (частые практики)
  // ==========================================================

  // --- Разделители (замена на другой) ---
  push(original.replace(/_/g, "-"), 1);
  push(original.replace(/-/g, "_"), 1);
  push(original.replace(/[_\-.\s]/g, "-"), 1);
  push(original.replace(/[_\-.\s]/g, "_"), 1);
  push(original.replace(/[_\-.\s]/g, "."), 1);

  // --- Цифры ---
  push(original.replace(/\d/g, ""), 1);
  push(original.replace(/\d+$/, ""), 1);
  push(original.replace(/^\d+/, ""), 1);
  push(original.replace(/^\d+|\d+$/g, ""), 1);
  push(original.replace(/\d/g, "").replace(/[_-]/g, ""), 1);

  const beforeDigit = original.match(/^[^\d]+/);
  if (beforeDigit) push(beforeDigit[0], 1);

  // --- Только буквы / буквы+цифры ---
  push(original.replace(/[^a-zA-Zа-яА-Я]/g, ""), 1);
  push(original.replace(/[^a-zA-Z0-9а-яА-Я]/g, ""), 1);
  push(original.replace(/[^a-zA-Zа-яА-Я0-9]/g, ""), 1);
  push(original.replace(/[^a-zA-Zа-яА-Я0-9]/g, "").toLowerCase(), 1);

  // --- КОМБО: разделители + регистр ---
  push(stripped.toLowerCase(), 1);
  push(stripped.toUpperCase(), 1);
  push(stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase(), 1);

  // --- Цифры + разделители + регистр ---
  const noSepNoDigit = stripped.replace(/\d/g, "");
  push(noSepNoDigit.toLowerCase(), 1);
  push(noSepNoDigit.toUpperCase(), 1);

  // --- Разделители по краям ---
  push(original.replace(/[_\-. ]+$/g, ""), 1);
  push(original.replace(/^[_\-. ]+/g, ""), 1);
  push(original.replace(/\d+$/g, "").replace(/[_\-. ]+$/g, ""), 1);

  // --- Типичные короткие суффиксы (годы, коды) ---
  const numSuffixShort = ["1", "2", "3", "7", "9", "01", "02", "07", "09",
                          "10", "11", "12", "13", "17", "21", "23",
                          "42", "52", "67", "69", "77", "88", "99",
                          "100", "123", "228", "420", "666", "777",
                          "888", "999", "1337", "2020", "2021", "2022",
                          "2023", "2024", "2025", "2026", "6767", "4242"];
  for (const n of numSuffixShort) push(`${base}${n}`, 1);

  push(`1${base}`, 1);
  push(`7${base}`, 1);
  push(`69${base}`, 1);
  push(`77${base}`, 1);
  push(`88${base}`, 1);
  push(`99${base}`, 1);

  // --- Типичные теги стримеров ---
  const tagsShort = ["ttv", "yt", "tv", "live", "real", "the", "pro", "gg", "op", "ez"];
  for (const t of tagsShort) {
    push(`${t}${base}`, 1);
    push(`${base}${t}`, 1);
    push(`${t}_${base}`, 1);
    push(`${base}_${t}`, 1);
  }

  // --- Обрезки до короткой длины ---
  if (stripped.length > 5) {
    push(stripped.slice(0, 5), 1);
    push(stripped.slice(0, 6), 1);
    push(stripped.slice(-5), 1);
    push(stripped.slice(-6), 1);
  }

  // --- Х-обёртки (xxBasexx) ---
  push(`x${base}x`, 1);
  push(`xx${base}xx`, 1);

  // ==========================================================
  // КОРЗИНА 2 — СРЕДНИЙ
  // ==========================================================

  // --- Leet-обратные (цифры → буквы) ---
  const unleetMap = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g" };
  push(original.replace(/[01345789]/g, (ch) => unleetMap[ch] || ch), 2);

  // --- Убрать разделители + цифры + lowercase ---
  push((base + original.replace(/\d/g, "")).slice(0, 24), 2);

  // --- Обрезки длинных ников ---
  if (stripped.length > 8) {
    push(stripped.slice(0, 8), 2);
    push(stripped.slice(-8), 2);
  }

  // --- Схлопывание повторяющихся букв ---
  push(original.replace(/(.)\1+/g, "$1"), 2);
  push(original.replace(/(.)\1+/g, "$1$1"), 2);

  // --- Удаление тегов ttv/yt/the/real/its/i_am в начале/конце ---
  const stripTags = original
    .replace(/^(ttv|ttv_|yt|yt_|tv|tv_|the|real|its|i_?am_?)/i, "")
    .replace(/(_?ttv|_?yt|_?tv|_?live|_?official|_?real|_?pro|_?gg)$/i, "");
  push(stripTags, 2);
  push(stripTags.replace(/[_\-. ]/g, ""), 2);

  // --- Расширенные словесные префиксы/суффиксы ---
  const prefixesMid = [
    "im", "iam", "i_am", "i_am_", "its", "it_s", "mr", "mister",
    "lil", "big", "young", "king", "queen", "lord", "sir",
    "god", "gaming", "game", "play", "plays", "twitch",
    "youtube", "stream", "streamer", "official", "team", "clan",
    "squad", "cyber", "backup", "main", "alt"
  ];
  const suffixesMid = [
    "gaming", "game", "plays", "play", "stream", "streamer",
    "clan", "squad", "team", "uwu", "owo", "xd", "lol",
    "boss", "king", "god", "master", "legend", "hunter", "sniper",
    "official", "backup", "main", "alt", "ru", "rus"
  ];
  for (const p of prefixesMid) {
    push(`${p}${base}`, 2);
    push(`${p}_${base}`, 2);
    push(`${p}-${base}`, 2);
  }
  for (const s of suffixesMid) {
    push(`${base}${s}`, 2);
    push(`${base}_${s}`, 2);
    push(`${base}-${s}`, 2);
  }

  // --- Вставка разделителей между слитными частями ---
  if (base.length >= 6) {
    for (const cut of [3, 4, 5, 6]) {
      if (cut >= base.length) continue;
      const a = base.slice(0, cut);
      const b = base.slice(cut);
      push(`${a}_${b}`, 2);
      push(`${a}-${b}`, 2);
      push(`${a}.${b}`, 2);
    }
  }
  // Разделители по краям для base.
  push(`_${base}`, 2);
  push(`${base}_`, 2);
  push(`-${base}`, 2);
  push(`${base}-`, 2);
  push(`__${base}`, 2);
  push(`${base}__`, 2);
  push(`_${base}_`, 2);
  push(`--${base}--`, 2);
  push(`.${base}.`, 2);

  // --- Перестановка частей ---
  if (parts.length === 2) {
    push(parts[1] + parts[0], 2);
    push(parts[1] + "_" + parts[0], 2);
    push(parts[1] + "-" + parts[0], 2);
    push(parts[0] + parts[1], 2);
  }

  // --- Аббревиатура из частей ---
  if (parts.length >= 2) {
    const initials = parts.map((w) => w.charAt(0)).join("");
    push(initials, 2);
    push(initials.toLowerCase(), 2);
    push(initials.toUpperCase(), 2);
    push(parts.map((w) => w.charAt(0)).join("_"), 2);
    push(parts.map((w) => w.charAt(0)).join("-"), 2);
    push(parts.map((w) => w.charAt(0)).join("."), 2);
  }

  // --- Только одна из частей ---
  if (parts.length >= 2) {
    for (const p of parts) {
      if (p.length >= 3) {
        push(p, 2);
        push(p.toLowerCase(), 2);
        push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(), 2);
      }
    }
    if (parts.length >= 3) {
      push(parts[0] + parts[parts.length - 1], 2);
      push(parts[0] + "_" + parts[parts.length - 1], 2);
    }
  }

  // --- Языковые / региональные маркеры ---
  push(`${base}ru`, 2);
  push(`ru${base}`, 2);
  push(`${base}rus`, 2);
  push(`${base}_ru`, 2);
  push(`${base}_rus`, 2);
  push(`${base}ua`, 2);
  push(`${base}_ua`, 2);
  push(`${base}kz`, 2);
  push(`${base}_kz`, 2);
  push(`${base}by`, 2);
  push(`${base}eu`, 2);
  push(`${base}na`, 2);
  push(`${base}cis`, 2);

  // --- Транслит (кириллица → латиница и обратно) ---
  const ru2lat = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
    щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };
  const lat2ru = {
    a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и",
    k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с",
    t: "т", u: "у", f: "ф", h: "х", c: "ц", y: "й"
  };
  const toLat = (str) =>
    str.toLowerCase().split("").map((ch) => (ru2lat[ch] !== undefined ? ru2lat[ch] : ch)).join("");
  const toRu = (str) =>
    str.toLowerCase().split("").map((ch) => (lat2ru[ch] !== undefined ? lat2ru[ch] : ch)).join("");

  if (/[а-яё]/i.test(original)) {
    push(toLat(original), 2);
    push(toLat(original).replace(/[_\-. ]/g, ""), 2);
  }
  if (/[a-z]/i.test(original) && !/[а-яё]/i.test(original)) {
    push(toRu(original), 2);
    push(toRu(original).replace(/[_\-. ]/g, ""), 2);
  }

  // ==========================================================
  // КОРЗИНА 3 — НИЗКИЙ (долгие/редкие проверки)
  // ==========================================================

  // --- Leet прямые (буквы → цифры) ---
  const leetPairs = [
    ["a", "4"], ["e", "3"], ["i", "1"], ["o", "0"],
    ["s", "5"], ["t", "7"], ["b", "8"], ["g", "9"],
    ["a", "@"], ["i", "!"]
  ];
  let leet = original.toLowerCase();
  for (const [from, to] of leetPairs) leet = leet.replace(new RegExp(from, "gi"), to);
  push(leet, 3);

  // --- Удаление гласных ---
  push(original.replace(/[aeiouyаеёиоуыэюя]/gi, ""), 3);
  push(original.replace(/[aeiouаеёиоуыэюя]/gi, ""), 3);

  // --- Удаление одной буквы (typo-варианты) ---
  if (base.length <= 16) {
    for (let i = 0; i < base.length; i++) {
      push(base.slice(0, i) + base.slice(i + 1), 3);
    }
  }

  // --- Удвоение одной буквы ---
  if (base.length <= 12) {
    for (let i = 0; i < base.length; i++) {
      const ch = base[i];
      if (/[a-zA-Zа-яА-Я]/.test(ch)) {
        push(base.slice(0, i) + ch + ch + base.slice(i + 1), 3);
      }
    }
  }

  // --- Обратный ник ---
  push(base.split("").reverse().join(""), 3);
  push(original.split("").reverse().join(""), 3);

  // --- Фонетические / похожие буквы ---
  const homoglyphMap = [
    [/ph/gi, "f"], [/f/gi, "ph"],
    [/ck/gi, "k"], [/k/gi, "ck"],
    [/x/gi, "ks"], [/ks/gi, "x"],
    [/z/gi, "s"], [/s/gi, "z"],
    [/v/gi, "w"], [/w/gi, "v"],
    [/u/gi, "oo"], [/oo/gi, "u"],
    [/ee/gi, "i"], [/i/gi, "ee"],
    [/y/gi, "ie"], [/ie/gi, "y"],
    [/c/gi, "k"]
  ];
  for (const [from, to] of homoglyphMap) {
    push(base.replace(from, to), 3);
  }
  push(base.replace(/w/gi, "vv"), 3);
  push(base.replace(/vv/gi, "w"), 3);

  // --- Дополнительные числовые хвосты (редкие) ---
  const numSuffixLong = ["1000", "2000", "2001", "2010", "2027",
                         "3000", "9000", "1234", "12345", "321",
                         "7777", "555", "333", "111", "101", "1488"];
  for (const n of numSuffixLong) push(`${base}${n}`, 3);

  // --- Редкие теги ---
  const tagsLong = ["youtube", "twitch", "stream", "streamer", "official",
                    "gaming", "master", "legend"];
  for (const t of tagsLong) {
    push(`${t}${base}`, 3);
    push(`${base}${t}`, 3);
  }

  // ==========================================================
  // СБОРКА РЕЗУЛЬТАТА: только запрошенные корзины, в порядке приоритета.
  // Если bucketFilter не передан — берём все корзины.
  // ==========================================================
  const wanted = bucketFilter || [0, 1, 2, 3];
  const result = [];
  for (const b of wanted) {
    if (buckets[b]) {
      for (const v of buckets[b]) result.push(v);
    }
  }

  // Финальная очистка: только валидные для URL символы.
  return result.filter((v) => /^[a-zA-Zа-яА-Я0-9_.\-]+$/.test(v));
}