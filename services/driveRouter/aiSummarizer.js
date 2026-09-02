// services/driveRouter/aiSummarizer.js
// Multi-Provider AI Summarizer (OpenRouter / DeepSeek / OpenAI / Groq / Google Gemini)

const fs = require('fs');
const {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  OPENROUTER_API_KEY,
  DEEPSEEK_API_KEY,
  OPENAI_API_KEY,
  GROQ_API_KEY,
  AI_PROVIDER,
  hasAnyAi
} = require('./config');

const SYSTEM_INSTRUCTION = 'คุณคือผู้ช่วยสรุปบทเรียนมหาวิทยาลัย สรุปเนื้อหาการเรียนอย่างกระชับ แม่นยำ อ่านง่าย ใช้ภาษาไทยที่เป็นทางการปานกลางและเข้าใจง่าย';

const SUMMARY_PROMPT = `ช่วยสรุปเนื้อหาคร่าวๆ จากไฟล์การเรียนชุดนี้ ให้กระชับ:
1. หัวข้อหลักของการเรียนคืออะไร
2. สรุปสาระสำคัญ 3-5 ข้อ
3. สูตร กฎ หรือคำศัพท์สำคัญ (ถ้ามี)
ตอบสั้นๆ กระชับ ได้ใจความ ภาษาไทย`;

/**
 * Extracts readable text from PDF or text binary buffer
 */
function extractTextFromBuffer(buffer, mimeType, filename = '') {
  if (!buffer || buffer.length === 0) return '';
  if (mimeType && (mimeType.startsWith('text/') || mimeType === 'application/json')) {
    return buffer.toString('utf-8').slice(0, 20000);
  }

  const raw = buffer.toString('latin1');
  const textBlocks = [];
  const btMatches = raw.match(/BT[\s\S]*?ET/g) || [];
  for (const block of btMatches) {
    const tjMatches = block.match(/\((.*?)\)\s*Tj/g) || [];
    for (const tj of tjMatches) {
      const match = tj.match(/\((.*?)\)\s*Tj/);
      if (match && match[1]) textBlocks.push(match[1]);
    }
    const tjArrMatches = block.match(/\[(.*?)\]\s*TJ/g) || [];
    for (const arr of tjArrMatches) {
      const strMatches = arr.match(/\((.*?)\)/g) || [];
      for (const s of strMatches) {
        textBlocks.push(s.replace(/[()]/g, ''));
      }
    }
  }

  const extracted = textBlocks.join(' ').replace(/\\r|\\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (extracted.length > 50) {
    return extracted.slice(0, 15000);
  }
  return `[เอกสาร: ${filename} (ขนาด ${(buffer.length / (1024 * 1024)).toFixed(1)} MB)]`;
}

/**
 * OpenRouter / OpenCode API caller
 */
async function callOpenRouter(prompt, contextText) {
  if (!OPENROUTER_API_KEY) return null;
  const models = [
    'deepseek/deepseek-chat',
    'google/gemini-2.0-flash-001',
    'google/gemini-flash-1.5',
    'openai/gpt-4o-mini',
    'qwen/qwen-2.5-72b-instruct',
    'meta-llama/llama-3.3-70b-instruct'
  ];
  const baseUrl = (process.env.OPENROUTER_BASE_URL || process.env.OPENCODE_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');

  for (const model of models) {
    try {
      console.log(`🤖 [AISummarizer] Trying OpenRouter model [${model}]...`);
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://e-calendar.app',
          'X-Title': 'E-Calendar Study Space'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: `${prompt}\n\n--- เนื้อหาเอกสาร ---\n${contextText}` }
          ],
          temperature: 0.2,
          max_tokens: 1500
        })
      });
      if (res.ok) {
        const json = await res.json();
        const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
        if (text) {
          console.log(`✅ [AISummarizer] OpenRouter summary generated with ${model}!`);
          return text.trim();
        }
      } else {
        console.warn(`⚠️ OpenRouter model ${model} failed (${res.status}):`, await res.text());
      }
    } catch (e) {
      console.warn(`⚠️ OpenRouter error on ${model}:`, e.message);
    }
  }
  return null;
}

/**
 * DeepSeek API caller
 */
async function callDeepSeek(prompt, contextText) {
  if (!DEEPSEEK_API_KEY) return null;
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: `${prompt}\n\n--- เนื้อหาเอกสาร ---\n${contextText}` }
        ],
        temperature: 0.2,
        max_tokens: 1500
      })
    });
    if (res.ok) {
      const json = await res.json();
      const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (text) return text.trim();
    } else {
      console.warn('⚠️ DeepSeek API failed:', res.status, await res.text());
    }
  } catch (e) {
    console.warn('⚠️ DeepSeek API error:', e.message);
  }
  return null;
}

/**
 * OpenAI API caller
 */
async function callOpenAI(prompt, contextText) {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: `${prompt}\n\n--- เนื้อหาเอกสาร ---\n${contextText}` }
        ],
        temperature: 0.2,
        max_tokens: 1500
      })
    });
    if (res.ok) {
      const json = await res.json();
      const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (text) return text.trim();
    } else {
      console.warn('⚠️ OpenAI API failed:', res.status, await res.text());
    }
  } catch (e) {
    console.warn('⚠️ OpenAI API error:', e.message);
  }
  return null;
}

/**
 * Groq API caller
 */
async function callGroq(prompt, contextText) {
  if (!GROQ_API_KEY) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: `${prompt}\n\n--- เนื้อหาเอกสาร ---\n${contextText}` }
        ],
        temperature: 0.2,
        max_tokens: 1500
      })
    });
    if (res.ok) {
      const json = await res.json();
      const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (text) return text.trim();
    } else {
      console.warn('⚠️ Groq API failed:', res.status, await res.text());
    }
  } catch (e) {
    console.warn('⚠️ Groq API error:', e.message);
  }
  return null;
}

/**
 * Google Gemini Multimodal / Text caller
 */
async function callGemini(prompt, parts, contextText) {
  if (!GEMINI_API_KEY) return null;

  const models = [
    GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro'
  ].filter((v, i, a) => v && a.indexOf(v) === i);

  // Attempt 1: With multimodal parts (if parts available and size < 4MB)
  if (parts && parts.length > 0) {
    for (const model of models) {
      try {
        const payload = {
          contents: [{ parts: [...parts, { text: `${SYSTEM_INSTRUCTION}\n\n${prompt}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        };
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const json = await res.json();
          const candidate = json.candidates && json.candidates[0];
          if (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]) {
            const text = candidate.content.parts[0].text;
            if (text) return text.trim();
          }
        } else {
          console.warn(`⚠️ Gemini multimodal failed on ${model} (${res.status})`);
        }
      } catch (err) {
        console.warn(`⚠️ Gemini error on ${model}:`, err.message);
      }
    }
  }

  // Attempt 2: Text-only payload (resilient for large files / scanned PDFs)
  if (contextText) {
    for (const model of models) {
      try {
        const payload = {
          contents: [{ parts: [{ text: `${SYSTEM_INSTRUCTION}\n\n${prompt}\n\n--- เนื้อหาเอกสาร ---\n${contextText}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
        };
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const json = await res.json();
          const candidate = json.candidates && json.candidates[0];
          if (candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]) {
            const text = candidate.content.parts[0].text;
            if (text) return text.trim();
          }
        }
      } catch (err) {
        console.warn(`⚠️ Gemini text fallback error on ${model}:`, err.message);
      }
    }
  }

  return null;
}

/**
 * Summarizes a lecture session that may contain multiple files
 * @param {Array<{ buffer: Buffer, mimeType: string, filename: string, localPath?: string }>} files
 * @param {string} sessionLabel - e.g. "CHEM (2026-09-03)"
 * @returns {Promise<{ shortSummary: string, fullMarkdown: string }>}
 */
async function summarizeSession(files, sessionLabel) {
  if (!hasAnyAi) {
    const errorText = 'ยังไม่ได้ตั้งค่า API Key สำหรับ AI (ไฟล์ต้นฉบับถูกอัปโหลดขึ้น Drive เรียบร้อยแล้ว)';
    const fullMarkdown = `# สรุปคาบเรียน: ${sessionLabel}\n\n*หมายเหตุ: สามารถใส่ OPENROUTER_API_KEY, DEEPSEEK_API_KEY, หรือ GEMINI_API_KEY บน Railway เพื่อเปิดใช้งาน AI สรุปเนื้อหา*\n`;
    return { shortSummary: errorText, fullMarkdown };
  }

  try {
    const parts = [];
    const textSnippets = [];

    for (const file of files) {
      let buf = file.buffer;
      if (!buf && file.localPath && fs.existsSync(file.localPath)) {
        buf = fs.readFileSync(file.localPath);
      }

      const fn = file.filename || file.driveFilename || 'lecture_file';
      const mime = file.mimeType || 'application/octet-stream';

      if (buf) {
        // Extract text from buffer for text-based LLMs
        const extracted = extractTextFromBuffer(buf, mime, fn);
        if (extracted) {
          textSnippets.push(`[ไฟล์: ${fn}]\n${extracted}`);
        }

        // Only include inlineData if file is small (<= 4MB) to prevent HTTP 413
        if (buf.length <= 4 * 1024 * 1024 && (mime.startsWith('image/') || mime.startsWith('audio/') || mime === 'application/pdf')) {
          parts.push({
            inline_data: {
              mime_type: mime,
              data: buf.toString('base64')
            }
          });
        }
      }
    }

    const contextText = textSnippets.join('\n\n---\n\n') || `[ชื่อไฟล์ในคาบเรียน: ${files.map(f => f.filename || f.driveFilename).join(', ')}]`;

    let responseText = null;

    // 1. Try OpenRouter / OpenCode if configured
    if (!responseText && (OPENROUTER_API_KEY || AI_PROVIDER === 'openrouter')) {
      console.log('🤖 [AISummarizer] Summarizing with OpenRouter API...');
      responseText = await callOpenRouter(SUMMARY_PROMPT, contextText);
    }

    // 2. Try DeepSeek if configured
    if (!responseText && (DEEPSEEK_API_KEY || AI_PROVIDER === 'deepseek')) {
      console.log('🤖 [AISummarizer] Summarizing with DeepSeek API...');
      responseText = await callDeepSeek(SUMMARY_PROMPT, contextText);
    }

    // 3. Try OpenAI if configured
    if (!responseText && (OPENAI_API_KEY || AI_PROVIDER === 'openai')) {
      console.log('🤖 [AISummarizer] Summarizing with OpenAI API...');
      responseText = await callOpenAI(SUMMARY_PROMPT, contextText);
    }

    // 4. Try Groq if configured
    if (!responseText && (GROQ_API_KEY || AI_PROVIDER === 'groq')) {
      console.log('🤖 [AISummarizer] Summarizing with Groq API...');
      responseText = await callGroq(SUMMARY_PROMPT, contextText);
    }

    // 5. Try Google Gemini (Multimodal + Text Fallback)
    if (!responseText && GEMINI_API_KEY) {
      console.log('🤖 [AISummarizer] Summarizing with Google Gemini API...');
      responseText = await callGemini(SUMMARY_PROMPT, parts, contextText);
    }

    // Final check
    if (!responseText) {
      throw new Error('ไม่สามารถดึงข้อมูลสรุปจาก AI ได้ (All configured AI providers exhausted)');
    }

    const shortSummary = responseText.trim();
    const fullMarkdown = `# สรุปคาบเรียน: ${sessionLabel}\n\n${shortSummary}\n\n---\n*สร้างอัตโนมัติโดย E-Calendar Auto Router & AI เมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}*`;

    return { shortSummary, fullMarkdown };

  } catch (err) {
    console.error('❌ summarizeSession error:', err.message);
    const errorText = `⚠️ สรุปเนื้อหาไม่สำเร็จ: ${err.message}\n(ไฟล์ต้นฉบับอัปโหลดเข้า Google Drive เรียบร้อยแล้ว กรุณาตรวจสอบ OPENCODE_API_KEY หรือ GEMINI_API_KEY บน Railway)`;
    const fullMarkdown = `# สรุปคาบเรียน: ${sessionLabel}\n\n> ⚠️ เกิดข้อผิดพลาดขณะสรุปเนื้อหา: ${err.message}\n> ไฟล์ต้นฉบับการเรียนทั้งหมดของคาบนี้ถูกอัปโหลดขึ้น Google Drive เรียบร้อยแล้ว\n`;
    return { shortSummary: errorText, fullMarkdown };
  }
}

module.exports = {
  summarizeSession,
  extractTextFromBuffer
};

