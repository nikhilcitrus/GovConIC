/**
 * Parses a Groq chat-completion response for the CMMC Updates article
 * generation step (HTTP Request2) into the structured payload the rest
 * of the workflow (OAT gate, WordPress publish) expects.
 *
 * Pure function: no n8n globals ($json, $getWorkflowStaticData, etc.)
 * so it can be fetched from git and eval'd, and can also be unit-tested
 * directly with plain Node.
 *
 * @param {string} rawContent - the raw message content string from Groq
 *   (choices[0].message.content), possibly fenced in ```json``` and/or
 *   subject to field-naming drift across runs.
 * @param {object} [upstream]
 * @param {number} [upstream.categoryId=52]
 * @param {string} [upstream.topic="CMMC Updates"]
 * @param {string|null} [upstream.link=null]
 * @param {string|null} [upstream.title=null] - fallback title if Groq omits one
 * @param {*} [upstream.currentCategoryId] - fallback used only if categoryId is falsy
 * @returns {object} the parsed article item's json payload
 * @throws {Error} if the response isn't valid JSON, or has no usable title/body fields
 */
function parseGroqArticleResponse(rawContent, upstream = {}) {
  const {
    categoryId = 52,
    topic = "CMMC Updates",
    link = null,
    title: upstreamTitle = null,
    currentCategoryId = null
  } = upstream;

  let raw = (rawContent || "").trim();

  // Strip markdown code fences if Groq wraps the JSON despite instructions
  raw = raw.replace(/^```(?:json)?\n?/i, "").replace(/```$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse Groq response as JSON: ${err.message} | raw: ${raw.slice(0, 300)}`);
  }

  // Helper: pick the first present field from a list of possible key names
  // (handles Groq's field-naming drift across runs -- same pattern as the OAT gate)
  function pickField(data, keys) {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== "") return data[k];
    }
    return null;
  }

  function blocksToHtml(blocks) {
    if (!Array.isArray(blocks)) return String(blocks || "");
    return blocks.map(b => {
      if (typeof b === "string") return `<p>${b}</p>`;
      switch (b.type) {
        case "p": return `<p>${b.text}</p>`;
        case "h2": return `<h2>${b.text}</h2>`;
        case "h3": return `<h3>${b.text}</h3>`;
        case "h4": return `<h4>${b.text}</h4>`;
        case "stat": return `<p><strong>${b.value || ""}</strong> ${b.label || b.text || ""}</p>`;
        case "pullquote": return `<blockquote>${b.text}</blockquote>`;
        case "list": return `<ul>${(b.items || []).map(i => `<li>${i}</li>`).join("")}</ul>`;
        case "callout": return `<div class="callout">${b.text}</div>`;
        default: {
          const stringEntries = Object.entries(b)
            .filter(([k, v]) => k !== "type" && typeof v === "string" && v.trim().length > 0)
            .sort((a, c) => c[1].length - a[1].length);
          if (stringEntries.length === 0) return "";
          if (stringEntries.length === 1) return `<p>${stringEntries[0][1]}</p>`;
          const [, bodyVal] = stringEntries[0];
          const [, headVal] = stringEntries[1];
          if (headVal.length < 80) return `<h2>${headVal}</h2><p>${bodyVal}</p>`;
          return `<p>${bodyVal}</p><p>${headVal}</p>`;
        }
      }
    }).join("\n");
  }

  // Helper to normalize array-or-string fields Groq might return inconsistently
  function asArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val.split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  // --- Title & body extraction, tolerant of key-naming drift ---
  const title = pickField(parsed, ["headline", "title", "articleTitle", "headlineText"]) || upstreamTitle;
  const bodyBlocksRaw = pickField(parsed, ["body", "content", "article", "sections", "articleBody"]);

  // --- Fail loudly instead of silently shipping an empty article ---
  // If Groq's response has none of the expected content keys, something upstream
  // (prompt, schema, token limit, model refusal) is broken -- surface it now,
  // with the actual keys we got, rather than letting an "Untitled" / empty-content
  // item drift downstream and get silently rejected by the OAT gate.
  if (!title && !bodyBlocksRaw) {
    const gotKeys = Object.keys(parsed);
    const looksLikeRequestEcho = ["model", "messages", "response_format", "max_tokens", "temperature"]
      .every(k => gotKeys.includes(k));
    const hint = looksLikeRequestEcho
      ? " This looks like the model echoed back a request-shaped object instead of writing the article -- check the system prompt for embedded request-schema examples that may be confusing the model."
      : "";
    throw new Error(
      `Groq response had no usable title/body fields.${hint} ` +
      `Keys returned: [${gotKeys.join(", ") || "none"}] | ` +
      `Raw (truncated): ${raw.slice(0, 400)}`
    );
  }

  const bodyBlocks = bodyBlocksRaw || [];
  const content = blocksToHtml(bodyBlocks);
  const plainTextWordCount = content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

  // Warn (without throwing) if the body came back suspiciously thin -- this is the
  // kind of partial failure that previously slipped through as a "passing" empty article.
  if (plainTextWordCount < 20) {
    console.log(`WARNING: parsed article body is only ${plainTextWordCount} words. Keys returned: [${Object.keys(parsed).join(", ")}]`);
  }

  return {
    // Existing fields downstream nodes rely on
    title: title || "Untitled",
    content,
    slug: parsed.slug || "",
    section: parsed.section || "compliance",
    kicker: parsed.kicker || "",
    dek: parsed.dek || "",
    byline: parsed.byline || "Shahid Shah",
    articleDate: parsed.date || new Date().toISOString().slice(0, 10),
    dateline: parsed.dateline || "",
    readMinutes: parsed.readMinutes || null,
    categoryId: categoryId || currentCategoryId,
    link: link || null,
    topic: topic || "CMMC Updates",

    // Companion assets required by the OAT gate -- also made tolerant
    // of field-naming drift, matching the pickField keys the gate itself checks for
    altTitles: asArray(pickField(parsed, ["altTitles", "alternativeTitles", "titleOptions", "titles"])),
    linkedinPost: pickField(parsed, ["linkedinPost", "linkedInPost", "linkedin_post"]) || "",
    newsletterSummary: pickField(parsed, ["newsletterSummary", "newsletter_summary", "digestSummary"]) || "",
    suggestedDiagrams: asArray(pickField(parsed, ["suggestedDiagrams", "diagramIdeas", "diagrams"])),
    followOnIdeas: asArray(pickField(parsed, ["followOnIdeas", "followOnArticles", "relatedArticleIdeas"]))
  };
}

if (typeof module !== "undefined") {
  module.exports = { parseGroqArticleResponse };
}
