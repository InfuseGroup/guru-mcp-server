#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GURU_EMAIL = process.env.GURU_EMAIL;
const GURU_API_TOKEN = process.env.GURU_API_TOKEN;
const BASE_URL = "https://api.getguru.com/api/v1";

if (!GURU_EMAIL || !GURU_API_TOKEN) {
  console.error("GURU_EMAIL and GURU_API_TOKEN environment variables are required");
  process.exit(1);
}

const authHeader = "Basic " + Buffer.from(`${GURU_EMAIL}:${GURU_API_TOKEN}`).toString("base64");

async function guruFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Guru API error ${response.status}: ${body}`);
  }

  const linkHeader = response.headers.get("Link");
  let nextUrl = null;
  if (linkHeader) {
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next(?:-page)?"/);
    if (match) nextUrl = match[1];
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { data, nextUrl };
}

const server = new McpServer({
  name: "guru",
  version: "1.0.0",
});

// --- list_cards ---
server.tool(
  "list_cards",
  "List Guru cards with optional filtering by collection, verification status, and search terms. Returns up to 50 cards per page with pagination support.",
  {
    searchTerms: z.string().optional().describe("Search terms to match against card title and content"),
    verificationState: z.enum(["trusted", "needsVerification"]).optional().describe("Filter by verification status"),
    collectionId: z.string().optional().describe("Filter by board/collection ID"),
    verifierId: z.array(z.string()).optional().describe("Filter by verifier email(s) or group ID(s). Cards matching ANY of the provided verifiers are returned."),
    maxResults: z.number().min(1).max(50).optional().default(50).describe("Max results per page (1-50)"),
    sortField: z.string().optional().describe("Field to sort by (e.g. lastModified, verificationState, title)"),
    sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
    nextPageUrl: z.string().optional().describe("URL for the next page of results (from previous response)"),
  },
  async (params) => {
    try {
      // If we have a next page URL, use it directly
      if (params.nextPageUrl) {
        const { data, nextUrl } = await guruFetch(params.nextPageUrl);
        return {
          content: [{ type: "text", text: JSON.stringify({ cards: data, nextPageUrl: nextUrl }, null, 2) }],
        };
      }

      // Build query string
      const qParts = [];
      if (params.verificationState) {
        qParts.push(`verificationState = ${params.verificationState}`);
      }
      if (params.collectionId) {
        qParts.push(`boards CONTAINS ${params.collectionId}`);
      }
      if (params.verifierId?.length) {
        if (params.verifierId.length === 1) {
          qParts.push(`verifierId = "${params.verifierId[0]}"`);
        } else {
          const orClauses = params.verifierId.map(v => `verifierId = "${v}"`).join(" OR ");
          qParts.push(`(${orClauses})`);
        }
      }

      const searchParams = new URLSearchParams();
      if (qParts.length > 0) {
        searchParams.set("q", qParts.join(" AND "));
      }
      if (params.searchTerms) {
        searchParams.set("searchTerms", params.searchTerms);
      }
      if (params.maxResults) {
        searchParams.set("maxResults", String(params.maxResults));
      }
      if (params.sortField) {
        searchParams.set("sortField", params.sortField);
      }
      if (params.sortOrder) {
        searchParams.set("sortOrder", params.sortOrder);
      }

      const qs = searchParams.toString();
      const path = `/search/query${qs ? `?${qs}` : ""}`;
      const { data, nextUrl } = await guruFetch(path);

      return {
        content: [{ type: "text", text: JSON.stringify({ cards: data, nextPageUrl: nextUrl }, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error listing cards: ${err.message}` }], isError: true };
    }
  }
);

// --- get_card ---
server.tool(
  "get_card",
  "Get the full content and metadata of a single Guru card by its ID.",
  {
    cardId: z.string().describe("The Guru card ID"),
  },
  async ({ cardId }) => {
    try {
      const { data } = await guruFetch(`/cards/${cardId}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error getting card: ${err.message}` }], isError: true };
    }
  }
);

// --- update_card ---
server.tool(
  "update_card",
  "Update a Guru card's content or title. Provide only the fields you want to change.",
  {
    cardId: z.string().describe("The Guru card ID to update"),
    title: z.string().optional().describe("New title for the card"),
    content: z.string().optional().describe("New HTML content for the card"),
  },
  async ({ cardId, title, content }) => {
    try {
      // Fetch the current card first to get required fields
      const { data: existing } = await guruFetch(`/cards/${cardId}`);

      const body = {
        preferredPhrase: title ?? existing.preferredPhrase,
        content: content ?? existing.content,
      };

      const { data } = await guruFetch(`/cards/${cardId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error updating card: ${err.message}` }], isError: true };
    }
  }
);

// --- verify_card ---
server.tool(
  "verify_card",
  "Mark a Guru card as verified, resetting its verification timer.",
  {
    cardId: z.string().describe("The Guru card ID to verify"),
  },
  async ({ cardId }) => {
    try {
      const { data } = await guruFetch(`/cards/${cardId}/verify`, {
        method: "PUT",
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? { verified: true, cardId }, null, 2) }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error verifying card: ${err.message}` }], isError: true };
    }
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
