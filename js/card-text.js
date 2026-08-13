export function formatCardText(value) {
  let source = decodeCardEntities(String(value ?? ""));
  if (!source.trim()) return "No effect text.";

  const tokens = [];
  const keep = html => {
    const token = `@@SVWB_FORMAT_${tokens.length}@@`;
    tokens.push([token, html]);
    return token;
  };

  source = source
    .replace(/<hr\s*\/?\s*>/gi, () => keep('<hr class="card-text-separator">'))
    .replace(/<br\s*\/?\s*>/gi, () => keep('<br>'))
    .replace(/<b\s*>/gi, () => keep('<strong>'))
    .replace(/<\/b\s*>/gi, () => keep('</strong>'))
    .replace(/<i\s*>/gi, () => keep('<em>'))
    .replace(/<\/i\s*>/gi, () => keep('</em>'))
    .replace(/<color\s*=\s*Keyword\s*>/gi, () => keep('<span class="card-text-keyword">'))
    .replace(/<color\s*=\s*[^>]+>/gi, () => keep('<span class="card-text-emphasis">'))
    .replace(/<\/color\s*>/gi, () => keep('</span>'))
    .replace(/<[^>]+>/g, "");

  let html = escapeHtml(source).replace(/\r?\n/g, "<br>");
  for (const [token, replacement] of tokens) html = html.replaceAll(token, replacement);
  return html;
}

function decodeCardEntities(value) {
  return String(value ?? "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
