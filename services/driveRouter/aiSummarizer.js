// services/driveRouter/aiSummarizer.js
// Gemini Multimodal AI Summarizer for combined multi-file lecture sessions (Slides + Audio)

const fs = require('fs');
const { GEMINI_API_KEY, GEMINI_MODEL } = require('./config');

const SYSTEM_INSTRUCTION = 'คุณคือผู้ช่วยสรุปบทเรียนมหาวิทยาลัย สรุปเนื้อหาการเรียนอย่างกระชับ แม่นยำ อ่านง่าย ใช้ภาษาไทยที่เป็นทางการปานกลางและเข้าใจง่าย';

const SUMMARY_PROMPT = `ช่วยสรุปเนื้อหาคร่าวๆ จากไฟล์การเรียนชุดนี้ (อาจมีทั้งสไลด์และไฟล์เสียงของคาบเดียวกัน) ให้กระชับ:
1. หัวข้อหลักของการเรียนคาบนี้คืออะไร
2. สรุปสาระสำคัญ 3-5 ข้อ
3. สูตรหรือคำศัพท์สำคัญ (ถ้ามี)
ตอบสั้นๆ กระชับ ได้ใจความ ภาษาไทย`;

/**
 * Summarizes a lecture session that may contain multiple files (PDF slides, audio lecture, notes)
 * @param {Array<{ buffer: Buffer, mimeType: string, filename: string, localPath?: string }>} files
 * @param {string} sessionLabel - e.g. "SCMA101 (2026-09-02)"
 * @returns {Promise<{ shortSummary: string, fullMarkdown: string }>}
 */
async function summarizeSession(files, sessionLabel) {
  if (!GEMINI_API_KEY) {
    const errorText = 'ไม่ได้ตั้งค่า GEMINI_API_KEY (ไฟล์ต้นฉบับถูกอัปโหลดขึ้น Drive เรียบร้อยแล้ว)';
    const fullMarkdown = `# สรุปคาบเรียน: ${sessionLabel}\n\n*หมายเหตุ: ไม่ได้ตั้งค่า GEMINI_API_KEY บนระบบ ไฟล์ต้นฉบับถูกจัดเก็บเข้าสู่ Google Drive เรียบร้อยแล้ว*\n`;
    return { shortSummary: errorText, fullMarkdown };
  }

  try {
    const parts = [];

    // Attach file contents
    for (const file of files) {
      let buf = file.buffer;
      if (!buf && file.localPath && fs.existsSync(file.localPath)) {
        buf = fs.readFileSync(file.localPath);
      }

      if (buf) {
        // Only include inlineData if file is <= 25MB (Gemini payload limit)
        if (buf.length <= 25 * 1024 * 1024) {
          const mime = file.mimeType || 'application/octet-stream';
          parts.push({
            inline_data: {
              mime_type: mime,
              data: buf.toString('base64')
            }
          });
        } else {
          parts.push({
            text: `[ไฟล์: ${file.filename} (${(buf.length / (1024 * 1024)).toFixed(1)} MB) - ขนาดใหญ่เกินขอบเขต inline]`
          });
        }
      }
    }

    const fullPromptText = `${SYSTEM_INSTRUCTION}\n\n${SUMMARY_PROMPT}`;
    parts.push({ text: fullPromptText });

    const models = [
      GEMINI_MODEL,
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash-latest',
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash-8b'
    ].filter((v, i, a) => v && a.indexOf(v) === i); // unique

    let responseText = null;

    for (const model of models) {
      try {
        const payload = {
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
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
            responseText = candidate.content.parts[0].text;
            if (responseText) break;
          }
        } else {
          const errText = await res.text();
          console.warn(`⚠️ Gemini model ${model} failed (${res.status}):`, errText);
        }
      } catch (callErr) {
        console.warn(`⚠️ Error calling Gemini ${model}:`, callErr.message);
      }
    }

    if (!responseText) {
      throw new Error('ไม่สามารถดึงข้อมูลสรุปจาก Gemini ได้ (All models exhausted)');
    }

    const shortSummary = responseText.trim();
    const fullMarkdown = `# สรุปคาบเรียน: ${sessionLabel}\n\n${shortSummary}\n\n---\n*สร้างอัตโนมัติโดย E-Calendar Auto Router & Gemini AI เมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}*`;

    return { shortSummary, fullMarkdown };

  } catch (err) {
    console.error('❌ summarizeSession error:', err.message);
    const errorText = 'ไม่สามารถสรุปไฟล์อัตโนมัติได้ (ไฟล์ต้นฉบับยังอยู่ครบใน Drive)';
    const fullMarkdown = `# สรุปคาบเรียน: ${sessionLabel}\n\n> ⚠️ เกิดข้อผิดพลาดขณะสรุปเนื้อหา: ${err.message}\n> ไฟล์ต้นฉบับการเรียนทั้งหมดของคาบนี้ถูกอัปโหลดขึ้น Google Drive เรียบร้อยแล้ว\n`;
    return { shortSummary: errorText, fullMarkdown };
  }
}

module.exports = {
  summarizeSession
};
