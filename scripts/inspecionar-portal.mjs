import { readFileSync } from "node:fs";

async function checkFrontend() {
  try {
    const res = await fetch("https://pncp.gov.br");
    const html = await res.text();
    const matches = html.match(/https?:\/\/[a-zA-Z0-9.-]+\/api\/[^\s"'<>]+/g) || [];
    console.log("URLs de API no HTML:", [...new Set(matches)]);
  } catch (e) {
    console.error("Erro:", e);
  }
}

checkFrontend();
