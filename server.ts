import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV,
      time: new Date().toISOString()
    });
  });

  app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || "139650";
    
    if (password === adminPassword) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, error: "סיסמה שגויה" });
    }
  });

  app.post("/api/admin/ai-chat", async (req, res) => {
    const { messages, context } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";
      
      const systemInstruction = `אתה עוזר בינה מלאכותית למנהל קמפיין התרמה. 
נתוני הקמפיין הנוכחיים: ${JSON.stringify(context)}.
תפקידך לנתח את החשבונות, לזהות מתרימים מצטיינים, ולנהל את חוקי המחשבון (צ'ופרים והנחות).
אתה יכול להוסיף הנחות יעד (בונוסים לפי אחוזים) או צ'ופרים (לפי סכום) ישירות למערכת לפי פקודות המשתמש.
לדוגמה: "תוסיף הנחה של 10% למי שמגיע ל-120% יעד".
ענה בעברית בצורה מקצועית ומעודדת.`;

      const response = await ai.models.generateContent({
        model,
        contents: messages.map((m: any) => ({ 
          role: m.role === "user" ? "user" : "model", 
          parts: [{ text: m.text }] 
        })),
        config: { 
          systemInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "addGoalBonus",
                  description: "הוספת הנחת יעד חדשה למערכת (בונוס לפי אחוז ביצוע)",
                  parameters: {
                    type: "OBJECT" as any,
                    properties: {
                      name: { type: "STRING" as any, description: "שם ההנחה (למשל: הנחת 10% יעד)" },
                      minPercentage: { type: "NUMBER" as any, description: "אחוז היעד המינימלי הנדרש (למשל: 120)" },
                      description: { type: "STRING" as any, description: "תיאור קצר של ההנחה" }
                    },
                    required: ["name", "minPercentage", "description"]
                  }
                },
                {
                  name: "addReward",
                  description: "הוספת צ'ופר חדש למערכת (לפי סכום כספי שנאסף)",
                  parameters: {
                    type: "OBJECT" as any,
                    properties: {
                      name: { type: "STRING" as any, description: "שם הצ'ופר" },
                      minAmount: { type: "NUMBER" as any, description: "סכום מינימלי הנדרש (בשקלים)" },
                      price: { type: "NUMBER" as any, description: "מחיר הצ'ופר (לחישוב השלמה במזומן)" },
                      description: { type: "STRING" as any, description: "תיאור הצ'ופר" }
                    },
                    required: ["name", "minAmount", "price", "description"]
                  }
                }
              ]
            }
          ]
        },
      });

      res.json({ 
        text: response.text,
        functionCalls: response.functionCalls
      });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.get("/api/campaign/:mosad", async (req, res) => {
    let { mosad } = req.params;
    const { forceId } = req.query;
    mosad = mosad.trim();
    console.log(`[Server] Fetching campaign data for mosad: "${mosad}"${forceId ? ` (Forcing ID: ${forceId})` : ""}`);
    
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://www.matara.pro/nedarimplus/online/?mosad=${mosad}`
      };

      console.log(`[Server] Starting fetch for mosad: ${mosad}`);

      const parseLooseJSON = (str: string) => {
        if (!str) return null;
        try {
          return JSON.parse(str);
        } catch (e) {
          try {
            const fixed = str
              .replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
              .replace(/'/g, '"')
              .replace(/,\s*([}\]])/g, '$1')
              .replace(/\\'/g, "'")
              .trim();
            return JSON.parse(fixed);
          } catch (e2) {
            return null;
          }
        }
      };

      // Helper to try an endpoint
      const tryFetch = async (url: string, isPost = false, postData = "") => {
        const start = Date.now();
        try {
          console.log(`[Server] Trying ${isPost ? 'POST' : 'GET'} ${url}`);
          const config: any = { 
            headers, 
            timeout: 20000, // Increased timeout to 20s
            validateStatus: (status: number) => status < 500 
          };
          const response = isPost 
            ? await axios.post(url, postData, { ...config, headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' } })
            : await axios.get(url, config);
          
          if (response.status !== 200) return null;
          return response.data;
        } catch (e: any) {
          return null;
        }
      };

      // Helper to get BEST result (the one with most groups)
      const getBestResult = async (promises: Promise<any>[], validator: (data: any) => any) => {
        const results = await Promise.all(promises.map(p => p.catch(() => null)));
        let best = null;
        let maxCount = -1;
        
        for (const res of results) {
          const processed = validator(res);
          if (processed) {
            if (Array.isArray(processed)) {
              if (processed.length > maxCount) {
                maxCount = processed.length;
                best = processed;
              }
            } else {
              // For non-array (campaign data), first valid one is fine if we don't have one yet
              if (!best) best = processed;
            }
          }
        }
        return best;
      };

      const campaignValidator = (data: any) => {
        if (!data) return null;
        const parsed = typeof data === 'object' ? data : parseLooseJSON(data);
        if (!parsed) return null;
        
        // Normalize campaign totals
        const normalized = {
          ...parsed,
          CampaignName: parsed.CampaignName || parsed.Name || parsed.Title || "קמפיין נדרים פלוס",
          TotalAmount: Number(parsed.TotalAmount || parsed.Cumule || parsed.Amount || parsed.Sum || 0),
          Goal: Number(parsed.Goal || parsed.Target || parsed.GoalAmount || parsed.TargetAmount || parsed.MainGoal || 0)
        };
        
        return (normalized.CampaignName || normalized.TotalAmount) ? normalized : null;
      };

      const groupsValidator = (data: any) => {
        if (!data) return null;
        let rawGroups: any[] = [];
        
        // Robust recursive search for arrays or single group-like objects in the response
        const findData = (obj: any, depth = 0): any[] | null => {
          if (depth > 5) return null;
          if (Array.isArray(obj)) return obj;
          if (!obj || typeof obj !== 'object') return null;
          
          // If it looks like a single group object, wrap it in an array
          if (obj.GroupName || obj.MatrimName || obj.MatrimID || obj.GroupId) {
            return [obj];
          }
          
          const keys = ['groups', 'Groups', 'CampaignGroups', 'Matrims', 'matrims', 'data', 'items', 'results', 'MatrimsList', 'GroupsList', 'Group', 'Matrim'];
          for (const key of keys) {
            if (Array.isArray(obj[key])) return obj[key];
            if (obj[key] && typeof obj[key] === 'object') {
              const nested = findData(obj[key], depth + 1);
              if (nested) return nested;
            }
          }
          // If no known keys, check all keys for any array
          for (const key in obj) {
            if (Array.isArray(obj[key])) return obj[key];
          }
          return null;
        };

        rawGroups = findData(data) || [];

        if (typeof data === 'string' && rawGroups.length === 0) {
          const parsed = parseLooseJSON(data);
          rawGroups = findData(parsed) || [];
        }
        
        if (Array.isArray(rawGroups) && rawGroups.length > 0) {
          const normalized = rawGroups.map(g => ({
            ...g,
            GroupName: String(g.GroupName || g.Name || g.Title || g.MatrimName || g.GroupTitle || "ללא שם").trim(),
            TotalAmount: Number(g.TotalAmount !== undefined ? g.TotalAmount : (g.Cumule !== undefined ? g.Cumule : (g.Amount || g.Sum || g.Total || 0))),
            Goal: Number(g.Goal !== undefined ? g.Goal : (g.Target || g.GoalAmount || g.TargetAmount || 0)),
            ID: String(g.ID || g.GroupId || g.Code || g.GroupCode || g.MatrimId || g.MatrimID || "").trim()
          }));
          
          const valid = normalized.filter(g => g && (g.GroupName !== "ללא שם" || g.ID));
          return valid.length > 0 ? valid : null;
        }
        return null;
      };

      // Helper to wait
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Helper to try an endpoint with pagination support (Sequential to avoid rate limiting)
      const fetchAllGroups = async (baseUrl: string, isPost = false, postDataTemplate = "") => {
        let allGroups: any[] = [];
        const pageSize = 200; // Nedarim Plus standard limit
        const pagesToFetch = 25; // Up to 5,000 groups
        
        for (let i = 0; i < pagesToFetch; i++) {
          const from = i * pageSize;
          let url = baseUrl;
          let postData = postDataTemplate;
          // Try all common pagination params
          const params = `&From=${from}&Count=${pageSize}&start=${from}&length=${pageSize}&rows=${pageSize}&limit=${pageSize}`;
          
          if (url.includes('?')) url += params;
          else url += `?` + params.substring(1);
          
          if (isPost && postData) postData += params;
          
          const res = await tryFetch(url, isPost, postData);
          const validated = groupsValidator(res);
          
          if (validated && Array.isArray(validated) && validated.length > 0) {
            allGroups = [...allGroups, ...validated];
            // If we got less than the page size, we probably reached the end
            if (validated.length < 150) break; 
            // Small sleep between pages to be safe
            await sleep(300);
          } else {
            break;
          }
        }
        
        return allGroups.length > 0 ? allGroups : null;
      };

      const getCombinedResult = async (mosadId: string, forceId?: string) => {
        console.log(`[Server] Starting deep discovery fetch for mosad ${mosadId}${forceId ? ` (Targeting ID: ${forceId})` : ""}`);
        let allGroups: any[] = [];

        // 0. Priority: Force ID fetch
        if (forceId) {
          const urls = [
            `https://www.matara.pro/nedarimplus/V6/MatchPlus.aspx?Action=SearchMatrim&Name=${forceId}&MosadId=${mosadId}`,
            `https://www.matara.pro/nedarimplus/V6/MatchPlus.aspx?Action=GetGroups&Name=${forceId}&MosadId=${mosadId}`,
            `https://www.matara.pro/nedarimplus/V6/MatchPlus.aspx?Action=GetMatrims&Name=${forceId}&MosadId=${mosadId}`
          ];
          for (const url of urls) {
            const res = await tryFetch(url);
            const validated = groupsValidator(res);
            if (validated && Array.isArray(validated)) {
              allGroups = [...allGroups, ...validated];
              console.log(`[Server] Force ID Discovery [${forceId}]: Found ${validated.length} items`);
            }
          }
        }
        
        // 1. Expanded Alphabet + Numeric + English Search (Dual Action)
        const searchChars = [
          "", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ", "ק", "ר", "ש", "ת",
          "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
          "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
        ];
        
        const chunks = [];
        for (let i = 0; i < searchChars.length; i += 4) chunks.push(searchChars.slice(i, i + 4));

        for (const chunk of chunks) {
          await Promise.all(chunk.map(async (char) => {
            // Search for both Matrims and Groups
            const actions = ['SearchMatrim', 'GetGroups', 'GetMatrims'];
            for (const action of actions) {
              for (let page = 0; page < 4; page++) {
                const from = page * 200;
                const url = `https://www.matara.pro/nedarimplus/V6/MatchPlus.aspx?Action=${action}&Name=${encodeURIComponent(char)}&MosadId=${mosadId}&From=${from}&Count=200`;
                const res = await tryFetch(url);
                const validated = groupsValidator(res);
                if (validated && Array.isArray(validated) && validated.length > 0) {
                  allGroups = [...allGroups, ...validated];
                  console.log(`[Server] Alpha Search [${char}/${action}/p${page}]: Found ${validated.length} items`);
                  if (validated.length < 190) break;
                } else break;
                await sleep(50);
              }
            }
          }));
          await sleep(150);
        }

        // 2. Transaction-Based Discovery (Find hidden IDs from recent donations)
        try {
          const transUrl = `https://www.matara.pro/nedarimplus/online/MatchPlus.aspx?Action=GetTransactions&MosadId=${mosadId}&Count=2000`;
          const transRes = await tryFetch(transUrl);
          if (transRes && Array.isArray(transRes)) {
            const hiddenIds = [...new Set(transRes.map(t => t.MatrimId || t.GroupId || t.MatrimID).filter(id => id && id !== "0"))];
            console.log(`[Server] Found ${hiddenIds.length} potential hidden IDs from transactions`);
            
            const idChunks = [];
            for (let i = 0; i < hiddenIds.length; i += 15) idChunks.push(hiddenIds.slice(i, i + 15));
            
            for (const idChunk of idChunks) {
              await Promise.all(idChunk.map(async (id) => {
                const urls = [
                  `https://www.matara.pro/nedarimplus/V6/MatchPlus.aspx?Action=SearchMatrim&Name=${id}&MosadId=${mosadId}`,
                  `https://www.matara.pro/nedarimplus/V6/MatchPlus.aspx?Action=GetGroups&Name=${id}&MosadId=${mosadId}`
                ];
                for (const url of urls) {
                  const res = await tryFetch(url);
                  const validated = groupsValidator(res);
                  if (validated && Array.isArray(validated)) {
                    allGroups = [...allGroups, ...validated];
                    if (validated.length > 0) console.log(`[Server] ID Discovery [${id}]: Found ${validated.length} items`);
                  }
                }
              }));
              await sleep(100);
            }
          }
        } catch (e) {}

        // 3. Direct Bulk Endpoints
        const bulkEndpoints = [
          `https://www.matara.pro/nedarimplus/online/GetGroups.aspx?mosad=${mosadId}&Count=10000`,
          `https://www.matara.pro/nedarimplus/online/GetCampaignGroups.aspx?mosad=${mosadId}&Count=10000`,
          `https://www.matara.pro/nedarimplus/online/MatchPlus.aspx?Action=GetMatrims&MosadId=${mosadId}&Count=10000`,
          `https://www.matara.pro/nedarimplus/online/MatchPlus.aspx?Action=GetGroups&MosadId=${mosadId}&Count=10000`,
          `https://www.matara.pro/nedarimplus/online/GetCampaignData.aspx?mosad=${mosadId}&all=1`
        ];
        
        for (const url of bulkEndpoints) {
          const res = await tryFetch(url);
          const validated = groupsValidator(res);
          if (validated && Array.isArray(validated)) {
            allGroups = [...allGroups, ...validated];
            console.log(`[Server] Bulk Endpoint [${url.split('/').pop()?.split('?')[0]}]: Found ${validated.length} items`);
          }
        }

        // 4. Deduplicate and normalize
        if (allGroups.length > 0) {
          const uniqueMap = new Map();
          allGroups.forEach((g) => {
            if (!g || typeof g !== 'object') return;
            
            const id = String(g.ID || g.Id || g.MatrimId || g.GroupId || g.Code || "").trim();
            const name = String(g.GroupName || g.Name || g.MatrimName || g.Title || "ללא שם").trim();
            const goal = Number(g.Goal || g.Target || g.GoalAmount || g.TargetAmount || 0);
            const cumule = Number(g.TotalAmount || g.Cumule || g.Amount || g.Sum || g.Total || 0);
            
            if (name === "ללא שם" && !id) return;

            const key = (id && id !== "0" && id !== "undefined") ? `ID:${id}` : `NAME:${name}:${goal}`;
            
            const existing = uniqueMap.get(key);
            if (!existing || cumule > Number(existing.TotalAmount)) {
              uniqueMap.set(key, {
                ...g,
                GroupName: name,
                ID: id,
                Goal: goal,
                TotalAmount: cumule
              });
            }
          });
          
          const finalGroups = Array.from(uniqueMap.values());
          console.log(`[Server] Final count for mosad ${mosadId}: ${finalGroups.length} unique fundraisers found.`);
          return finalGroups;
        }
        
        return [];
      };

      // Fetch campaign data and groups
      const campaignData = await getBestResult([
        tryFetch(`https://www.matara.pro/nedarimplus/online/GetCampaignData.aspx?mosad=${mosad}`),
        tryFetch(`https://nedarim.org.il/nedarimplus/online/GetCampaignData.aspx?mosad=${mosad}`),
        tryFetch(`https://www.matara.pro/nedarimplus/online/GetCampaignData.aspx?mosad=${mosad}&all=1`),
        tryFetch(`https://nedarim.org.il/nedarimplus/online/GetCampaignData.aspx?mosad=${mosad}&all=1`),
        tryFetch(`https://www.matara.pro/nedarimplus/online/?mosad=${mosad}`).then(html => {
          if (!html) return null;
          const $ = cheerio.load(html);
          let scrapedCampaign: any = { CampaignName: $('title').text() || 'קמפיין נדרים פלוס' };
          $('script').each((_, el) => {
            const content = $(el).html() || '';
            const cMatch = content.match(/(?:var|window\.)?CampaignData\s*=\s*({.*?});/s);
            if (cMatch) {
              const parsed = parseLooseJSON(cMatch[1]);
              if (parsed) scrapedCampaign = { ...scrapedCampaign, ...parsed };
            }
          });
          return scrapedCampaign;
        })
      ], campaignValidator);

      let groupsData = await getCombinedResult(mosad, forceId as string);

      // Fallback: If groupsData is missing or smaller than groups in campaignData, use campaignData's groups
      const campaignGroups = campaignData?.groups || campaignData?.Groups || campaignData?.CampaignGroups || campaignData?.data?.groups;
      if (Array.isArray(campaignGroups) && campaignGroups.length > (Array.isArray(groupsData) ? groupsData.length : 0)) {
        console.log(`[Server] Using ${campaignGroups.length} groups from campaignData (more complete than ${Array.isArray(groupsData) ? groupsData.length : 0})`);
        groupsData = campaignGroups;
      }

      if (!campaignData && (!groupsData || (Array.isArray(groupsData) && groupsData.length === 0))) {
        console.warn(`[Server] No data found for mosad ${mosad} after all attempts.`);
        return res.status(404).json({ 
          success: false, 
          error: `לא נמצאו נתונים עבור מוסד ${mosad}. וודא שקוד המוסד תקין והקמפיין פעיל בנדרים פלוס.`,
          mosad 
        });
      }

      console.log(`[Server] Returning data for mosad ${mosad}: ${Array.isArray(groupsData) ? groupsData.length : 0} groups found.`);
      res.json({ success: true, campaign: campaignData, groups: groupsData || [] });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "שגיאה פנימית בשרת." });
    }
  });

  // Serve static files / Vite middleware
  const distPath = path.resolve(process.cwd(), "dist");
  const distExists = fs.existsSync(distPath);
  
  console.log(`[Server] Checking for dist at: ${distPath} (Exists: ${distExists})`);

  if (distExists) {
    console.log("[Server] Production mode: Serving static files from dist...");
    app.use(express.static(distPath));
    
    // SPA fallback: handle all non-API routes by serving index.html
    app.get("*", (req, res, next) => {
      if (req.url.startsWith("/api/")) return next();
      
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("index.html not found in dist folder");
      }
    });
  } else {
    console.log("[Server] Development mode: Initializing Vite middleware...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      
      app.use(vite.middlewares);

      app.get("*", async (req, res, next) => {
        if (req.url.startsWith("/api/")) return next();
        
        const url = req.originalUrl;
        try {
          const indexPath = path.resolve(process.cwd(), "index.html");
          if (!fs.existsSync(indexPath)) {
            return res.status(404).send("Root index.html not found");
          }
          let template = fs.readFileSync(indexPath, "utf-8");
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
          console.error("[Vite Error]", e);
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } catch (err) {
      console.error("[Server] Failed to start Vite:", err);
      app.get("*", (req, res) => {
        res.status(500).send("Server initialization failed. Check logs.");
      });
    }
  }

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
