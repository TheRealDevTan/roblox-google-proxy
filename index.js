const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ YOUR 3 SERPAPI KEYS ARE SAFELY INTEGRATED HERE
const SERPAPI_KEYS = [
    "2a624723c3af966896271ebefbf0b946900334bf83391d976d4caba07b77b0b3",
    "23c0c249aae46514d86078dd65785fb24b89f4549b9fa6f6f70cecd42e68a74c",
    "48cf8c206a5f74404d64becf284af429b904f57759531a61da10fe1931867b65"
];

let currentKeyIndex = 0;

async function tryDuckDuckGo(query) {
    try {
        // 🛠️ FIXED: Standardized concatenation syntax string format
        const targetUrl = `https://duckduckgo.com{encodeURIComponent(query)}&format=json`;
        
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const answer = response.data.AbstractText || response.data.Definition;
        return answer || null;
    } catch (e) {
        console.error(`[DuckDuckGo Engine Error]: ${e.message}`);
        return null;
    }
}


async function trySerpApi(query) {
    for (let attempts = 0; attempts < SERPAPI_KEYS.length; attempts++) {
        const activeKey = SERPAPI_KEYS[currentKeyIndex];
        
        // Skip placeholder strings safely to prevent a crash
        if (!activeKey || activeKey.includes("YOUR_") || activeKey.includes("PASTE_")) {
            console.warn(`[Key Shield] Skipped empty or placeholder key at index ${currentKeyIndex}`);
            currentKeyIndex = (currentKeyIndex + 1) % SERPAPI_KEYS.length;
            continue;
        }

        try {
            const response = await axios.get(`https://serpapi.com`, {
                params: { q: query, engine: "google", api_key: activeKey, hl: "en", gl: "us" }
            });

            if (response.data.error && response.data.error.includes("unauthorized_or_no_credits")) {
                throw new Error("Credits exhausted");
            }

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
            return compiledContext || null;
        } catch (error) {
            console.error(`[Router Failover] Key index ${currentKeyIndex} failed. Rotating...`);
            currentKeyIndex = (currentKeyIndex + 1) % SERPAPI_KEYS.length;
        }
    }
    return null;
}

app.get('/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    const cleanQuery = query.trim().replace(/[?.,!]/g, "");
    const lowerQuery = cleanQuery.toLowerCase();
    const words = lowerQuery.split(/\s+/);
    const wordCount = words.length;

    let forceComplex = false;

    const complexKeywords = ["how", "why", "where", "best", "top", "review", "address", "menu", "restaurant", "eat", "places", "near", "versus", "vs", "difference", "compare", "list", "guide", "step"];
    const hasComplexKeyword = complexKeywords.some(keyword => words.includes(keyword));

    const simpleStartPhrases = ["what is", "who is", "define", "meaning of", "when did", "when was", "birthday of"];
    const startsWithSimplePhrase = simpleStartPhrases.some(phrase => lowerQuery.startsWith(phrase));

    if (hasComplexKeyword) forceComplex = true;
    if (wordCount > 6) forceComplex = true;
    if (!startsWithSimplePhrase) forceComplex = true;

    if (!forceComplex) {
        console.log(`[Smart Router] SIMPLE intent verified. Routing to DuckDuckGo: "${query}"`);
        const ddgAnswer = await tryDuckDuckGo(query);
        
        if (ddgAnswer) {
            return res.json({ answer: `[Source: DuckDuckGo Quick Fact]\n${ddgAnswer}` });
        }
        console.log("[Smart Router] DuckDuckGo missed. Automatically falling back to Google...");
    }

    console.log(`[Smart Router] COMPLEX intent verified. Routing to GOOGLE: "${query}"`);
    const googleAnswer = await trySerpApi(query);

    if (googleAnswer) {
        return res.json({ answer: googleAnswer });
    }

    res.status(500).json({ error: "No reliable data could be scraped from either engine." });
});

app.listen(PORT, () => console.log(`Advanced Smart Router Proxy running on port ${PORT}`));
