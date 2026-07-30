/**
 * OAT (Output Acceptance Test) gate for CMMC Updates articles.
 *
 * Applies duplicate / content-quality / relevance / companion-asset checks
 * to each candidate article item, updates the persistent dedup caches in
 * staticData, and returns either the passing items or (if none pass) one
 * debug item per candidate explaining why it was skipped.
 *
 * Pure function: no n8n globals ($input, $getWorkflowStaticData, etc.) --
 * `items` and `staticData` are passed in explicitly -- so it can be
 * fetched from git and eval'd, and can also be unit-tested directly with
 * plain Node. `staticData` is mutated in place, exactly as the original
 * inline Code node did via $getWorkflowStaticData('global').
 *
 * @param {Array<{json: object}>} items - n8n-style items, one per candidate article
 * @param {object} staticData - mutable workflow static data (dedup caches)
 * @returns {Array<{json: object}>} passing items, or debug items if none passed
 */
function runOatGate(items, staticData) {
  if (!staticData.postedUrls) staticData.postedUrls = [];
  if (!staticData.postedTitles) staticData.postedTitles = [];
  if (!staticData.postedContentHashes) staticData.postedContentHashes = [];
  if (!staticData.oatPassedCount) staticData.oatPassedCount = 0;

  // Locked to CMMC only
  const cmmcKeywords = [
    "cmmc", "c3pao", "poa&m", "ssp ", "nist sp 800-171", "nist 800-171",
    "nist sp 800-172", "nist 800-172", "scoring methodology", "level 1", "level 2", "level 3",
    "assessment", "certification", "compliance", "cui", "controlled unclassified",
    "dib ", "defense industrial base", "cyberab", "scoping guide"
  ];

  // Word count target for the article body
  const MIN_WORDS = 100;
  const MAX_WORDS = 200;
  // small tolerance since LLM word counts are approximate
  const WORD_TOLERANCE = 50;

  function pickField(data, keys) {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== "") return data[k];
    }
    return null;
  }

  function wordCount(text) {
    const stripped = (text || "").replace(/<[^>]+>/g, " ").trim();
    if (!stripped) return 0;
    return stripped.split(/\s+/).filter(Boolean).length;
  }

  function asArray(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      return val.split(/\r?\n|\|/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  const passing = [];

  for (const item of items) {
    const data = item.json;

    // --- Duplicate checks ---
    if (data.link && staticData.postedUrls.includes(data.link)) {
      console.log(`SKIP (duplicate URL): "${data.title}"`);
      continue;
    }

    const normalizedIncoming = (data.title || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const isTitleDuplicate = staticData.postedTitles.some(stored => {
      const normalizedStored = stored
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const words = normalizedIncoming.split(" ");
      for (let i = 0; i <= words.length - 6; i++) {
        if (normalizedStored.includes(words.slice(i, i + 6).join(" "))) return true;
      }
      return false;
    });

    if (isTitleDuplicate) {
      console.log(`SKIP (duplicate title): "${data.title}"`);
      continue;
    }

    // --- Content checks ---
    const normalizedContent = (data.content || "")
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!data.title || data.title === "Untitled" || data.title.trim().length < 5) {
      console.log(`SKIP (no title): "${JSON.stringify(data).slice(0, 200)}"`);
      continue;
    }

    if (!data.content || data.content.trim().length < 600) {
      console.log(`SKIP (content too short): "${data.title}"`);
      continue;
    }

    // --- Word count gate ---
    const articleWordCount = wordCount(data.content);
    if (articleWordCount < (MIN_WORDS - WORD_TOLERANCE) || articleWordCount > (MAX_WORDS + WORD_TOLERANCE)) {
      console.log(`SKIP (word count ${articleWordCount} outside ${MIN_WORDS}-${MAX_WORDS} range): "${data.title}"`);
      continue;
    }

    // --- Relevance checks ---
    const searchableText = `${data.title} ${data.content} ${data.dek || ""} ${data.topic || ""}`.toLowerCase();
    const isCmmcRelevant = cmmcKeywords.some(kw => searchableText.includes(kw));

    if (!isCmmcRelevant) {
      console.log(`SKIP (not CMMC relevant): "${data.title}"`);
      continue;
    }

    // --- Vendor PR / generic news-report exclusion ---
    const excludedPatterns = [
      "press release", "partnership announcement", "series a", "series b",
      "funding round", "raises $", "announces partnership", "proud to announce",
      "top 10", "game-changer", "revolutionary", "disrupting government",
      "according to a recent report", "in a recent announcement", "sources say",
      "experts agree", "industry leaders say"
    ];
    const isVendorPR = excludedPatterns.some(kw => searchableText.includes(kw));
    if (isVendorPR) {
      console.log(`SKIP (vendor PR / news-report tone): "${data.title}"`);
      continue;
    }

    // --- Required companion assets ---
    const altTitles = asArray(pickField(data, ["altTitles", "alternativeTitles", "titleOptions", "titles"]));
    if (altTitles.length < 5) {
      console.log(`SKIP (fewer than 5 alternative titles, got ${altTitles.length}): "${data.title}"`);
      continue;
    }

    const linkedinPost = pickField(data, ["linkedinPost", "linkedInPost", "linkedin_post"]);
    if (!linkedinPost || String(linkedinPost).trim().length < 50) {
      console.log(`SKIP (missing/short LinkedIn post): "${data.title}"`);
      continue;
    }

    const newsletterSummary = pickField(data, ["newsletterSummary", "newsletter_summary", "digestSummary"]);
    if (!newsletterSummary || String(newsletterSummary).trim().length < 30) {
      console.log(`SKIP (missing/short newsletter summary): "${data.title}"`);
      continue;
    }

    const suggestedDiagrams = asArray(pickField(data, ["suggestedDiagrams", "diagramIdeas", "diagrams"]));
    if (suggestedDiagrams.length < 1) {
      console.log(`SKIP (no suggested diagrams): "${data.title}"`);
      continue;
    }

    const followOnIdeas = asArray(pickField(data, ["followOnIdeas", "followOnArticles", "relatedArticleIdeas"]));
    if (followOnIdeas.length < 5) {
      console.log(`SKIP (fewer than 5 follow-on article ideas, got ${followOnIdeas.length}): "${data.title}"`);
      continue;
    }

    // --- Passed OAT ---
    console.log(`OAT PASSED [CMMC Updates]: "${data.title}" (${articleWordCount} words)`);

    const subtitleText = data.dek || data.subtitle || data.kicker || "";

    passing.push({
      json: {
        title: data.title,
        content: data.content,
        post_content: data.content,
        slug: data.slug || "",
        section: data.section || "",
        kicker: data.kicker || "",
        dek: data.dek || "",
        byline: data.byline || "",
        articleDate: data.articleDate || "",
        readMinutes: data.readMinutes || "",
        categoryId: data.categoryId || 52,
        status: data.status || "draft",
        categories: [52], // locked to CMMC Updates
        oat_passed: true,
        oat_section: "CMMC Updates",
        oat_timestamp: new Date().toISOString(),
        oat_word_count: articleWordCount,

        altTitles,
        linkedinPost,
        newsletterSummary,
        suggestedDiagrams,
        followOnIdeas,

        meta: {
          ...(data.meta || {}),
          td_post_theme_settings: {
            ...(data.meta?.td_post_theme_settings || {}),
            td_subtitle: subtitleText
          }
        }
      }
    });

    // Update staticData caches
    if (data.link) staticData.postedUrls.push(data.link);
    staticData.postedTitles.push(data.title);
    staticData.postedContentHashes.push(normalizedContent);
    staticData.oatPassedCount++;

    // Trim caches
    if (staticData.postedUrls.length > 300) staticData.postedUrls.shift();
    if (staticData.postedTitles.length > 300) staticData.postedTitles.shift();
    if (staticData.postedContentHashes.length > 300) staticData.postedContentHashes.shift();
  }

  console.log(`OAT result: ${passing.length} of ${items.length} passed`);

  if (passing.length === 0) {
    return items.map(i => {
      const d = i.json;
      const contentLen = (d.content || "").trim().length;
      const normTitle = (d.title || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
      const searchable = `${d.title} ${d.content} ${d.dek || ""} ${d.topic || ""}`.toLowerCase();
      return {
        json: {
          debug_failure: true,
          reason: "No items passed — see skip/fail details below",
          title: d.title,
          content: d.content || "",
          post_content: d.content || "",
          content_length: contentLen,
          content_preview: (d.content || "").slice(0, 150),
          word_count: wordCount(d.content),
          categoryId: d.categoryId,
          is_cmmc_relevant: cmmcKeywords.some(kw => searchable.includes(kw)),
          is_title_duplicate: staticData.postedTitles.includes(d.title),
          title_word_count: normTitle.split(" ").length,
          alt_titles_count: asArray(pickField(d, ["altTitles", "alternativeTitles", "titleOptions", "titles"])).length,
          has_linkedin_post: !!pickField(d, ["linkedinPost", "linkedInPost", "linkedin_post"]),
          has_newsletter_summary: !!pickField(d, ["newsletterSummary", "newsletter_summary", "digestSummary"]),
          diagram_ideas_count: asArray(pickField(d, ["suggestedDiagrams", "diagramIdeas", "diagrams"])).length,
          follow_on_ideas_count: asArray(pickField(d, ["followOnIdeas", "followOnArticles", "relatedArticleIdeas"])).length
        }
      };
    });
  }

  return passing;
}

if (typeof module !== "undefined") {
  module.exports = { runOatGate };
}
