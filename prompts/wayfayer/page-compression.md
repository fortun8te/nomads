Extract facts about: "{query}"

{knowledge_hint}

Page: {page_title}
URL: {page_url}

{page_content}

Rules:
- End every fact with [Source: {page_url}]
- Copy exact quotes in "quotation marks"
- Preserve: numbers ($, %, units), dates, study names, sample sizes, competitor names, pricing, product names
- NEW info only — skip anything from the knowledge block above
- Strip: navigation, ads, boilerplate, SEO filler, author bios
- Max 350 words. If nothing relevant: NO_RELEVANT_CONTENT
