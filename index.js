const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const SERPAPI_KEYS = [
  "2a624723c3af966896271ebefbf0b946900334bf83391d976d4caba07b77b0b3",
  "23c0c249aae46514d86078dd65785fb24b89f4549b9fa6f6f70cecd42e68a74c",
  "48cf8c206a5f74404d64becf284af429b904f57759531a61da10fe1931867b65"
];

let currentKeyIndex = 0;

const http = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "BloxAI Search Proxy/1.0"
  }
});

async function tryDuckDuckGo(query) {
  try {
    const response = await http.get("https://api.duckduckgo.com/", {
      params: {
        q: query,
        format: "json",
        no_html: 1,
        skip_disambig: 1
      }
    });

    const data = response.data;

    return (
      data.AbstractText ||
      data.Answer ||
      data.Definition ||
      null
    );
  } catch (error) {
    console.error("[DuckDuckGo Error]", error.message);
    return null;
  }
}

async function trySerpApi(query) {
  if (SERPAPI_KEYS.length === 0) {
    console.error("[SerpApi] No API keys configured");
    return null;
  }

  for (let attempt = 0; attempt < SERPAPI_KEYS.length; attempt++) {
    const key = SERPAPI_KEYS[currentKeyIndex];

    try {
      const response = await http.get(
        "https://serpapi.com/search.json",
        {
          params: {
            engine: "google",
            q: query,
            api_key: key,
            hl: "en",
            gl: "us",
            num: 5
          }
        }
      );

      const data = response.data;

      if (data.error) {
        throw new Error(data.error);
      }

      const results = [];

      const answerBox = data.answer_box;

      if (answerBox?.answer) {
        results.push(answerBox.answer);
      } else if (answerBox?.snippet) {
        results.push(answerBox.snippet);
      }

      for (const result of data.organic_results || []) {
        if (result.snippet) {
          results.push(
            `${result.snippet}${result.link ? `\n${result.link}` : ""}`
          );
        }
      }

      if (results.length > 0) {
        return results.slice(0, 5).join("\n\n");
      }

      throw new Error("No usable search results");
    } catch (error) {
      console.error(
        `[SerpApi] Key ${currentKeyIndex} failed:`,
        error.message
      );

      currentKeyIndex =
        (currentKeyIndex + 1) % SERPAPI_KEYS.length;
    }
  }

  return null;
}

app.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();

    if (!query) {
      return res.status(400).json({
        error: "Missing query parameter: q"
      });
    }

    const simple =
      query.split(/\s+/).length <= 6 &&
      /^(what is|who is|define|meaning of|when was|when did)/i.test(query);

    let answer = null;

    if (simple) {
      answer = await tryDuckDuckGo(query);
    }

    if (!answer) {
      answer = await trySerpApi(query);
    }

    if (!answer) {
      return res.status(502).json({
        error: "Search providers returned no usable answer"
      });
    }

    return res.json({ answer });
  } catch (error) {
    console.error("[Proxy Error]", error);
    return res.status(500).json({
      error: "Internal proxy error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Search proxy running on port ${PORT}`);
});
