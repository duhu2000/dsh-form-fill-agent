// MIT — extracted after v0.8.2 golden capture; historical CSV semantics.
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { records.push(row); row = []; };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushField(); pushRow();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      pushField(); pushRow();
    } else {
      field += ch;
    }
  }
  // 末尾无换行时的最后一行
  if (field !== '' || row.length > 0) { pushField(); pushRow(); }

  // 去掉全空行
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h, i) => (String(h).trim() || `col_${i + 1}`));
  const rows = nonEmpty.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] === undefined ? '' : String(r[i]); });
    return o;
  });
  return { headers, rows };
}
