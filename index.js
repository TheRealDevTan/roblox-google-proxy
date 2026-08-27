const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const SERPAPI_KEYS = (process.env.SERPAPI_KEYS || "")
  .split(",")
  .map(key => key.trim())
  .filter(Boolean);

let currentKeyIndex = 0;

const http = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "BloxAI-Search-Proxy/2.0"
  }
});

function clean(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueResults(results) {
  return [...new Set(results.map(clean).filter(x => x.length >= 25))];
}

function getDuckTopics(topics = [], output = []) {
  for (const topic of topics) {
    if (topic.Text) output.push(topic.Text);

    if (topic.Topics) {
      getDuckTopics(topic.Topics, output);
    }
  }

  return output;
}

async function tryDuckDuckGo(query) {
  try {
    const response = await http.get("https://api.duckduckgo.com/", {
      params: {
        q: query,
        format: "json",
        no_html: 1,
        skip_disambig: 0
      }
    });

    const data = response.data;
    const results = [];

    if (data.AbstractText) results.push(data.AbstractText);
    if (data.Answer) results.push(data.Answer);
    if (data.Definition) results.push(data.Definition);

    results.push(...getDuckTopics(data.RelatedTopics));

    const usable = uniqueResults(results);

    if (usable.length > 0) {
      return usable.slice(0, 5).join("\n\n");
    }

    return null;
  } catch (error) {
    console.error("[DuckDuckGo Error]", error.message);
    return null;
  }
}

async function trySerpApi(query) {
  if (SERPAPI_KEYS.length === 0) {
    console.error("[SerpAPI] No keys configured.");
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
            num: 8
          }
        }
      );

      const data = response.data;

      if (data.error) {
        throw new Error(data.error);
      }

      const results = [];

      if (data.answer_box) {
        const box = data.answer_box;

        if (box.answer) results.push(box.answer);
        if (box.snippet) results.push(box.snippet);
        if (box.description) results.push(box.description);
      }

      if (data.knowledge_graph?.description) {
        results.push(data.knowledge_graph.description);
      }

      for (const item of data.organic_results || []) {
        if (item.snippet) {
          results.push(
            `${item.snippet}\nSource: ${item.link || ""}`
          );
        }
      }

      const usable = uniqueResults(results);

      if (usable.length > 0) {
        console.log("[SerpAPI] Successful search.");
        return usable.slice(0, 6).join("\n\n");
      }

      throw new Error("No usable SerpAPI results");
    } catch (error) {
      console.error(
        `[SerpAPI] Key ${currentKeyIndex} failed:`,
        error.message
      );

      currentKeyIndex =
        (currentKeyIndex + 1) % SERPAPI_KEYS.length;
    }
  }

  return null;
}

app.get("/search", async (req, res) => {
  const query = clean(req.query.q);

  if (!query) {
    return res.status(400).json({
      error: "Missing query parameter: q"
    });
  }

  console.log("[Search]", query);

  // Always try DuckDuckGo first.
  let answer = await tryDuckDuckGo(query);
  let provider = "DuckDuckGo";

  // SerpAPI receives the complete original question.
  if (!answer) {
    answer = await trySerpApi(query);
    provider = "SerpAPI";
  }

  if (!answer) {
    return res.status(502).json({
      error: "Search providers returned no usable answer"
    });
  }

  return res.json({
    answer,
    provider,
    query
  });
});

app.get("/", (req, res) => {
  res.send("BloxAI search proxy is running.");
});

app.listen(PORT, () => {
  console.log(`BloxAI search proxy running on port ${PORT}`);
});
