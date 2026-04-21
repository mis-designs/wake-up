function testAuth() {
  UrlFetchApp.fetch("https://www.google.com");
}

function doGet(e) {
  const action = e.parameter.action;

  if (action === "getQuiz") {
    return getQuiz();
  }

  if (action === "getTTS") {
    return getTTS(e);
  }

  if (action === "getBengaliAudio") {
    return getBengaliAudio(e);
  }

  if (action === "getItalianAudio") {
    return getItalianAudio(e);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: "Invalid GET action" }))
    .setMimeType(ContentService.MimeType.JSON);
}


function doPost(e) {
  const action = e.parameter.action;

  if (action === "checkQuiz") {
    return checkQuiz(e);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: "Invalid POST action" }))
    .setMimeType(ContentService.MimeType.JSON);
}


function getQuiz() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("quiz");
  const data = sheet.getDataRange().getValues();

  data.shift(); // rimuove intestazioni

  let quiz = data.map(row => ({
    id: row[0],
    chapter: row[1],
    question: row[2],
    figure: row[3],
    correct: row[4]
  }));

  // mescola
  quiz = shuffle(quiz);

  // prendi 30
  const selected = quiz.slice(0, 30);

  // NON mandiamo la risposta al frontend!
  const clean = selected.map(q => ({
    id: q.id,
    chapter: q.chapter,
    question: q.question,
    figure: q.figure
  }));

  return ContentService
    .createTextOutput(JSON.stringify(clean))
    .setMimeType(ContentService.MimeType.JSON);
}


// Normalizes any answer representation to 1 (true) or 0 (false), or null if unrecognized.
// Handles: 1/0, true/false (boolean), "1"/"0", "true"/"false", "vero"/"falso", "v"/"f".
function normalizeAnswer(val) {
  if (val === null || val === undefined || val === "") return null;
  if (val === true  || val === 1)  return 1;
  if (val === false || val === 0)  return 0;
  var s = String(val).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s === "1" || s === "true"  || s === "vero"  || s === "v" || s === "si" || s === "yes") return 1;
  if (s === "0" || s === "false" || s === "falso" || s === "f" || s === "no")                return 0;
  return null;
}

function checkQuiz(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: "invalid_payload" });
  }

  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return jsonResponse({ error: "missing_answers" });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("quiz");
  const data = sheet.getDataRange().getValues();
  data.shift();

  // Build id → normalized-correct-answer map
  var db = {};
  data.forEach(function(row) {
    var id = row[0];
    var normalized = normalizeAnswer(row[4]);
    if (id !== "" && id !== null && normalized !== null) {
      db[String(id)] = normalized;
    }
  });

  var correctCount = 0;
  var results = body.answers.map(function(a) {
    var questionId  = String(a.id).trim();
    var userAnswer  = normalizeAnswer(a.answer);
    var rightAnswer = db.hasOwnProperty(questionId) ? db[questionId] : null;

    // Only count as correct when both sides are valid and strictly equal
    var isCorrect = (userAnswer !== null && rightAnswer !== null && userAnswer === rightAnswer);
    if (isCorrect) correctCount++;

    return { id: a.id, correct: isCorrect };
  });

  var total = body.answers.length;
  var passed = correctCount >= 27;

  return ContentService
    .createTextOutput(JSON.stringify({
      correct: correctCount,
      wrong: total - correctCount,
      passed: passed,
      results: results
    }))
    .setMimeType(ContentService.MimeType.JSON);
}


// TTS proxy: fetches Google Translate Bengali audio server-side and returns
// it as base64 JSON. Called by the frontend via ?action=getTTS&text=TEXT.
// Server-side fetch avoids all browser CORS/403 restrictions.
function getTTS(e) {
  const text = (e.parameter.text || "").trim();
  if (!text) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: "no text" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const url = "https://translate.google.com/translate_tts" +
    "?ie=UTF-8&client=tw-ob&tl=bn&q=" + encodeURIComponent(text);

  try {
    const resp = UrlFetchApp.fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://translate.google.com/"
      },
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code !== 200) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: "upstream " + code }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const audio = Utilities.base64Encode(resp.getContent());
    return ContentService
      .createTextOutput(JSON.stringify({ audio: audio }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


// High-quality Bengali audio endpoint.
// 1. Cleans Italian text
// 2. Translates it with LanguageApp.translate() — real Google Translate quality
// 3. Fetches TTS audio server-side (no browser CORS/403 issues)
// 4. Caches result in CacheService for 6 hours to avoid repeated calls
// Returns: { audio: base64_mp3, translation: bengaliText }
function getBengaliAudio(e) {
  const rawText = (e.parameter.text || "").trim();
  if (!rawText) {
    return jsonResponse({ error: "no text" });
  }

  // Normalize punctuation and whitespace
  const italianText = rawText.replace(/\s+/g, " ").replace(/[""'']/g, '"').trim();

  // Build cache key from MD5 of Italian text
  const keyBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, italianText);
  const cacheKey = "bn_" + keyBytes.map(function(b) {
    return (b + 256).toString(16).slice(-2);
  }).join("");

  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  // Step 1: Translate Italian → Bengali (LanguageApp uses Google Translate engine)
  var bengaliText;
  try {
    bengaliText = LanguageApp.translate(italianText, "it", "bn");
  } catch (err) {
    return jsonResponse({ error: "translation_failed: " + err.message });
  }

  if (!bengaliText || bengaliText.trim() === "") {
    return jsonResponse({ error: "empty_translation" });
  }

  // Step 2: Fetch TTS audio for each chunk (Google TTS has 200-char limit)
  var chunks = chunkBengaliText(bengaliText);
  var allBytes = [];

  for (var i = 0; i < chunks.length; i++) {
    var ttsUrl = "https://translate.google.com/translate_tts" +
      "?ie=UTF-8&client=tw-ob&tl=bn&q=" + encodeURIComponent(chunks[i]);

    try {
      var resp = UrlFetchApp.fetch(ttsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/"
        },
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) {
        return jsonResponse({ error: "tts_upstream_" + resp.getResponseCode() });
      }

      allBytes = allBytes.concat(resp.getContent());
    } catch (err) {
      return jsonResponse({ error: "tts_fetch_failed: " + err.message });
    }
  }

  var result = JSON.stringify({
    audio: Utilities.base64Encode(allBytes),
    translation: bengaliText
  });

  // Cache for 6 hours
  try { cache.put(cacheKey, result, 21600); } catch(err) {}

  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
}

// Italian TTS: fixed female voice via Google Cloud TTS (it-IT-Wavenet-A).
// Falls back to Google Translate TTS (also female for it-IT) if no API key.
// Caches result in CacheService for 6 hours.
// Returns: { audio: base64_mp3 }
//
// SETUP: in GAS Project Settings → Script Properties, add:
//   GOOGLE_TTS_API_KEY = <your Google Cloud TTS API key>
function getItalianAudio(e) {
  var rawText = (e.parameter.text || "").trim();
  if (!rawText) {
    return jsonResponse({ error: "no text" });
  }

  var italianText = rawText.replace(/\s+/g, " ").trim();

  var keyBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, italianText);
  var cacheKey = "it3_" + keyBytes.map(function(b) {
    return (b + 256).toString(16).slice(-2);
  }).join("");

  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  }

  // ── Primary: Google Cloud TTS — fixed female voices ──────────────────────
  var apiKey = PropertiesService.getScriptProperties().getProperty("GOOGLE_TTS_API_KEY");
  if (apiKey) {
    var voices = [
      { name: "it-IT-Wavenet-A",  languageCode: "it-IT", ssmlGender: "FEMALE" },
      { name: "it-IT-Neural2-A",  languageCode: "it-IT", ssmlGender: "FEMALE" }
    ];

    for (var v = 0; v < voices.length; v++) {
      try {
        var cloudUrl = "https://texttospeech.googleapis.com/v1/text:synthesize?key=" + apiKey;
        var cloudResp = UrlFetchApp.fetch(cloudUrl, {
          method:             "post",
          contentType:        "application/json",
          payload:            JSON.stringify({
            input:       { text: italianText },
            voice:       voices[v],
            audioConfig: { audioEncoding: "MP3", speakingRate: 0.9, pitch: 0.0 }
          }),
          muteHttpExceptions: true
        });

        if (cloudResp.getResponseCode() === 200) {
          var cloudData = JSON.parse(cloudResp.getContentText());
          if (cloudData.audioContent) {
            var result = JSON.stringify({ audio: cloudData.audioContent });
            try { cache.put(cacheKey, result, 21600); } catch(_) {}
            Logger.log("Italian TTS: " + voices[v].name);
            return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
          }
        }
        Logger.log("Cloud TTS " + voices[v].name + " HTTP " + cloudResp.getResponseCode());
      } catch (err) {
        Logger.log("Cloud TTS " + voices[v].name + " error: " + err.toString());
      }
    }
  }

  // ── Fallback: Google Translate TTS (female for it-IT, free) ───────────────
  // client=gtx gives the female voice; client=tw-ob was changed to male by Google.
  var chunks = chunkBengaliText(italianText);
  var allBytes = [];

  for (var i = 0; i < chunks.length; i++) {
    var ttsUrl = "https://translate.googleapis.com/translate_tts" +
      "?ie=UTF-8&client=gtx&tl=it&ttsspeed=0.9&q=" + encodeURIComponent(chunks[i]);

    try {
      var resp = UrlFetchApp.fetch(ttsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://translate.google.com/"
        },
        muteHttpExceptions: true
      });

      if (resp.getResponseCode() !== 200) {
        return jsonResponse({ error: "tts_upstream_" + resp.getResponseCode() });
      }

      allBytes = allBytes.concat(resp.getContent());
    } catch (err) {
      return jsonResponse({ error: "tts_fetch_failed: " + err.message });
    }
  }

  var result = JSON.stringify({ audio: Utilities.base64Encode(allBytes) });
  try { cache.put(cacheKey, result, 21600); } catch(err) {}
  return ContentService.createTextOutput(result).setMimeType(ContentService.MimeType.JSON);
}


function chunkBengaliText(text) {
  var max = 190;
  if (text.length <= max) return [text];
  var chunks = [];
  var start = 0;
  while (start < text.length) {
    var end = Math.min(start + max, text.length);
    if (end < text.length) {
      var space = text.lastIndexOf(" ", end);
      if (space > start) end = space;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks.filter(function(c) { return c.length > 0; });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// funzione shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}