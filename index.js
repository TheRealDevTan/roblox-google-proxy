const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ PASTE YOUR 3 DIFFERENT SERPAPI KEYS HERE
const SERPAPI_KEYS = [
    "2a624723c3af966896271ebefbf0b946900334bf83391d976d4caba07b77b0b3",
    "23c0c249aae46514d86078dd65785fb24b89f4549b9fa6f6f70cecd42e68a74c",
    "48cf8c206a5f74404d64becf284af429b904f57759531a61da10fe1931867b65"
];

// Tracks which key we are currently using (0, 1, or 2)
let currentKeyIndex = 0;

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    // Try up to 3 times (once for each key) if a key fails or runs out of credits
    for (let attempts = 0; attempts < SERPAPI_KEYS.length; attempts++) {
        const activeKey = SERPAPI_KEYS[currentKeyIndex];
        
        try {
            console.log(`Attempting search with API Key index: ${currentKeyIndex}`);
            
            const response = await axios.get(`https://serpapi.com`, {
                params: {
                    q: query,
                    engine: "google",
                    api_key: activeKey,
                    hl: "en",
                    gl: "us"
                }
            });

            // Check if this specific key has run out of credits
            if (response.data.error && response.data.error.includes("unauthorized_or_no_credits")) {
                throw new Error("Key ran out of credits");
            }

            // --- PROCESS THE GOOGLE DATA ---
            let compiledContext = "";

            if (response.data.answer_box && response.data.answer_box.answer) {
                compiledContext += `Direct Answer: ${response.data.answer_box.answer}\n`;
            } else if (response.data.answer_box && response.data.answer_box.snippet) {
                compiledContext += `Direct Snippet: ${response.data.answer_box.snippet}\n`;
            }

            if (response.data.organic_results && response.data.organic_results.length > 0) {
                compiledContext += "Top Web Results:\n";
                const topResults = response.data.organic_results.slice(0, 3);
                topResults.forEach((result, index) => {
                    if (result.snippet) {
                        compiledContext += `[Source ${index + 1}]: ${result.snippet}\n`;
                    }
                });
            }

            if (!compiledContext) compiledContext = "No relevant web summaries found.";

            // If successful, send the response back to Roblox and stop the loop
            return res.json({ answer: compiledContext });

        } catch (error) {
            console.warn(`Key index ${currentKeyIndex} failed. Moving to fallback...`);
            
            // ROUTE TO NEXT KEY: Cycles between 0, 1, and 2
            currentKeyIndex = (currentKeyIndex + 1) % SERPAPI_KEYS.length;
        }
    }

    // If the loop finishes and ALL 3 keys failed
    res.status(500).json({ error: "All 3 SerpApi keys have run out of free monthly credits!" });
});

app.listen(PORT, () => console.log(`Smart 3-Key Rotating Proxy running on port ${PORT}`));
