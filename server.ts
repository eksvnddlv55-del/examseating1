import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiClient = new GoogleGenAI({});
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.post("/api/parse-pdf", async (req, res) => {
    try {
      const { pdfBase64, examClassroom } = req.body;
      if (!pdfBase64 || !examClassroom) {
        return res.status(400).json({ error: "Missing pdfBase64 or examClassroom in request body." });
      }

      let response;
      let retries = 3;
      const ai = getAiClient();
      for (let i = 0; i < retries; i++) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
                  { text: `이 PDF는 고등학교 나이스(NEIS) 출석부입니다. 문서에서 학생 목록과 정보를 추출하여 주어진 지시사항에 따라 HTML 테이블을 생성해주세요.\n교사가 입력한 [응시교실]: ${examClassroom}` }
                ]
              }
            ],
            config: {
              systemInstruction: `당신은 출석부 PDF 데이터 추출기입니다.
다음 규칙에 따라 정확하게 추출하세요:
1. 헤더에서 과목명, 학년, 분반 추출 (예: "교과 : 기하 2학년 2-4 C" -> subject: "기하", grade: "2", classGroup: "C")
2. 학생 데이터 정제 규칙 (매우 중요):
   - 성명 옆에 '(위탁)'이 포함된 경우 결과에서 완전히 제외합니다 (자리배치에서 뺌).
   - 성명 옆에 '(공동)'이 포함된 경우 '(공동)' 텍스트만 삭제하고 이름만 남깁니다.
3. 학년, 반, 번호는 숫자로 제공해야 합니다. (이후 클라이언트에서 5자리 학번으로 조합합니다)`,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  subject: { type: Type.STRING, description: "과목명" },
                  grade: { type: Type.STRING, description: "학년 (숫자만)" },
                  classGroup: { type: Type.STRING, description: "분반 (예: C)" },
                  students: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        grade: { type: Type.NUMBER, description: "학년" },
                        class: { type: Type.NUMBER, description: "반" },
                        number: { type: Type.NUMBER, description: "번호" },
                        name: { type: Type.STRING, description: "학생 이름" }
                      },
                      required: ["grade", "class", "number", "name"]
                    }
                  }
                },
                required: ["subject", "grade", "classGroup", "students"]
              }
            }
          });
          break; // success
        } catch (error: any) {
          const isUnavailable = error?.message?.includes('503') || error?.message?.includes('UNAVAILABLE');
          const isRateLimited = error?.message?.includes('429') || error?.message?.includes('quota') || error?.status === 429;
          
          if ((isUnavailable || isRateLimited) && i < retries - 1) {
            console.log(`Model unavailable or rate limited, retrying in ${Math.pow(2, i)} seconds...`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            continue;
          }
          if (isRateLimited) {
             throw new Error("AI API 호출 한도(Quota)를 초과했습니다. 잠시 후(약 30초~1분) 다시 시도해주세요.");
          }
          if (isUnavailable) {
             throw new Error("현재 AI 모델 서버에 일시적으로 요청이 많아 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
          }
          throw error;
        }
      }

      if (!response) {
        throw new Error("Failed to get response after multiple retries");
      }

      const jsonText = response.text;
      if (!jsonText) {
         throw new Error("Failed to generate response from Gemini API");
      }
      
      let cleanedText = jsonText.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
      }
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.slice(3);
      }
      if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3);
      }
      cleanedText = cleanedText.trim();

      let parsedData;
      try {
        parsedData = JSON.parse(cleanedText);
      } catch (parseError: any) {
        console.error("Failed to parse JSON. Raw text:", jsonText);
        throw new Error("API 응답을 JSON으로 변환하는데 실패했습니다: " + parseError.message);
      }
      
      res.json(parsedData);
    } catch (error: any) {
      console.error("Error parsing PDF:", error);
      res.status(500).json({ error: error.message || "Failed to parse PDF" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
