import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find((arg) => arg.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function normalizeText(input) {
  return input
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

function splitIntoParagraphs(input) {
  return input
    .split(/\n\s*\n/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 60);
}

function chunkParagraphs(paragraphs, maxLength = 900) {
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if (`${current}\n\n${paragraph}`.length <= maxLength) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }

    chunks.push(current);
    current = paragraph;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

const cwd = process.cwd();
const inputPath = path.resolve(cwd, getArg("input", "data/official-marking-guide.pdf"));
const outputPath = path.resolve(cwd, getArg("output", "data/official-marking-guidance.json"));
const sourceName = getArg("source", "Official Marking Guide");
const ranksArg = getArg("ranks", "");
const ranks = ranksArg
  .split(",")
  .map((value) => value.trim().toUpperCase().replace(/\s+/g, ""))
  .filter(Boolean)
  .map((value) => {
    const match = value.match(/E-?(\d+)/);
    return match ? `E${match[1]}` : value;
  });

async function main() {
  const pdfBuffer = await readFile(inputPath);
  const parsed = await pdfParse(pdfBuffer);
  const normalized = normalizeText(parsed.text || "");

  if (!normalized) {
    throw new Error("No text was extracted from the PDF.");
  }

  const paragraphs = splitIntoParagraphs(normalized);
  const chunks = chunkParagraphs(paragraphs).map((text, index) => ({
    id: `chunk-${index + 1}`,
    title: `Section ${index + 1}`,
    text,
    keywords: [],
  }));

  if (!chunks.length) {
    throw new Error("No guidance chunks were generated from the PDF.");
  }

  const payload = {
    source: sourceName,
    ranks,
    generatedAt: new Date().toISOString(),
    chunks,
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  process.stdout.write(`Wrote ${chunks.length} chunks to ${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`Failed to extract guidance: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
