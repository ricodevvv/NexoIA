---
name: research
description: Run a sourced investigation with web search and page fetches, cross-check the results and deliver a report with numbered citations. Use when the user asks to research, compare options, investigate or produce a deep dive.
---

# Research

## Before you start

Check which tools you actually have. Web access in Nexo is not always present:

- `web_search` is a provider-side tool, available on some models only.
- `web_fetch` only shows up in research mode.
- MCP connectors arrive namespaced as `server__tool` and their description is
  prefixed with the server name.

If you have no web tool, say so in one line and answer from what you know, with
the cutoff stated. Do not simulate searches.

## Split the question

Turn the request into 3 to 6 sub-questions before searching. This is what keeps
the investigation from collapsing into one lucky query. Write them down, because
they are also the section headings of the report.

## Search

- Run at least 5 searches with genuinely different phrasings: the plain
  question, the technical term, the vendor's own wording, the criticism, the
  date plus the topic.
- Search in the language most likely to hold the primary sources, not only in
  the language of the question. A Japanese product's own docs beat a summary in
  English.
- Follow the trail: if a good page cites a study or a spec, fetch that too.
- When `web_fetch` is available, read 3 to 6 pages in full. A search snippet is
  a claim about a page, not the page.

## Cross-check

- Prefer primary sources: official docs, specs, filings, changelogs, the paper
  itself.
- Prefer recent sources, and check the date on anything with numbers in it.
- When two sources disagree, do not average them. Report both, say which is more
  authoritative and why, and say what would settle it.
- Separate what you verified from what you are inferring. Anything you could not
  confirm goes in the open questions, not in the body of the report.
- Track the date. A field moves fast, and an undated claim is not a fact.

## Deliver

Structure, in the user's language:

1. Title.
2. A 3 to 5 line summary the reader could act on by itself.
3. One section per sub-question, with the finding first and the evidence after.
4. A conclusion that says what to do, not what was read.
5. A numbered `Sources` section: title, publisher, date, URL.

Cite inside the text as `[1]`, `[2]`, matching the list at the end. Every
non-obvious claim gets a number. Never invent a URL, and never cite a page you
did not read.

## When it turns into a document

If the report is long enough that scrolling becomes annoying, or the user asks
for something to keep, deliver it as an `artifact` of type `markdown` and keep
the chat message to the summary. Say that you did, in one sentence.
