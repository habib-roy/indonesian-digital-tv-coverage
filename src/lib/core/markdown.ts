/**
 * Minimal Markdown → HTML for our own trusted docs (headings, lists, tables, links, bold/italic/code).
 * Input is escaped first, so it is also safe for untrusted text.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

export function markdown(md: string): string {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const h = l.match(/^(#{1,4}) (.*)/);
    if (h) {
      const n = Math.min(6, h[1].length + 1); // page already has <h1>
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
    } else if (/^- /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(`<li>${inline(lines[i++].slice(2))}</li>`);
      i--;
      out.push(`<ul>${items.join("")}</ul>`);
    } else if (/^\|/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i]))
        rows.push(
          lines[i++]
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim()),
        );
      i--;
      const [head, , ...body] = rows;
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join("\n");
}
