import { inflateRawSync } from 'node:zlib';

export class FillError extends Error {
  constructor(code, message) { super(message); this.name = 'FillError'; this.code = code; }
}
export function fail(code, message) { throw new FillError(code, message); }
export const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, expanded: 32 * 1024 * 1024, entryBytes: 8 * 1024 * 1024, entries: 256, ratio: 200, sheets: 16, rows: 10000, columns: 128, cells: 100000 });
const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes) crc = table[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

// Read central directory before any inflation; never trust ZIP claimed sizes.
export function readZip(input) {
  const bytes = Buffer.from(input);
  if (bytes.length > LIMITS.bytes) fail('FILE_TOO_LARGE', '文件超过 8 MiB');
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) fail('NOT_XLSX', '仅支持未加密 XLSX ZIP 文件');
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0) fail('BAD_ZIP', 'ZIP 目录缺失');
  const count = bytes.readUInt16LE(eocd + 10), size = bytes.readUInt32LE(eocd + 12), offset = bytes.readUInt32LE(eocd + 16);
  if (bytes.readUInt16LE(eocd + 4) || bytes.readUInt16LE(eocd + 6) || bytes.readUInt16LE(eocd + 8) !== count || count > LIMITS.entries || offset + size !== eocd) fail('ZIP_LIMIT', '多卷、ZIP64 或过多 ZIP 条目不受支持');
  const entries = new Map(), paths = new Map(), spans = [];
  let at = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > eocd || bytes.readUInt32LE(at) !== 0x02014b50) fail('BAD_ZIP', 'ZIP 中央目录损坏');
    const flags = bytes.readUInt16LE(at + 8), method = bytes.readUInt16LE(at + 10), checksum = bytes.readUInt32LE(at + 16);
    const compressed = bytes.readUInt32LE(at + 20), expanded = bytes.readUInt32LE(at + 24);
    const n = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32), local = bytes.readUInt32LE(at + 42);
    const next = at + 46 + n + extra + comment;
    if (next > eocd) fail('BAD_ZIP', 'ZIP 条目越界');
    const name = bytes.subarray(at + 46, at + 46 + n).toString('utf8');
    const directory = name.endsWith('/'), path = directory ? name.slice(0, -1) : name;
    if (!/^[a-zA-Z0-9_\[\].\-/]+$/.test(name) || name.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) fail('ZIP_PATH', 'ZIP 内部路径不安全');
    if (paths.has(path)) fail('ZIP_PATH', 'ZIP 内部路径重复或文件与目录冲突');
    const parts = path.split('/');
    for (let j = 1; j < parts.length; j++) if (paths.get(parts.slice(0, j).join('/')) === false) fail('ZIP_PATH', 'ZIP 文件与目录路径冲突');
    if (!directory && [...paths.keys()].some(p => p.startsWith(path + '/'))) fail('ZIP_PATH', 'ZIP 文件与目录路径冲突');
    paths.set(path, directory);
    if (flags & ~0x080e || ![0, 8].includes(method)) fail('ZIP_UNSUPPORTED', 'ZIP 加密或压缩方式不受支持');
    total += expanded;
    if (expanded > LIMITS.entryBytes || total > LIMITS.expanded || expanded / Math.max(compressed, 1) > LIMITS.ratio) fail('ZIP_LIMIT', 'ZIP 解压大小或压缩比超限');
    if (local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50) fail('BAD_ZIP', 'ZIP 本地头损坏');
    const ln = bytes.readUInt16LE(local + 26), le = bytes.readUInt16LE(local + 28), start = local + 30 + ln + le;
    if (bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method || start + compressed > offset || bytes.subarray(local + 30, local + 30 + ln).toString() !== name) fail('BAD_ZIP', 'ZIP 本地头与目录不一致');
    if (spans.some(([a, b]) => local < b && start + compressed > a)) fail('BAD_ZIP', 'ZIP 条目重叠');
    spans.push([local, start + compressed]);
    let data;
    try { data = method === 0 ? bytes.subarray(start, start + compressed) : inflateRawSync(bytes.subarray(start, start + compressed), { maxOutputLength: Math.max(1, Math.min(expanded, LIMITS.entryBytes)) }); }
    catch { fail('ZIP_LIMIT', 'ZIP 解压失败或实际大小超限'); }
    if (data.length !== expanded || crc32(data) !== checksum) fail('BAD_ZIP', 'ZIP 实际大小或 CRC 校验失败');
    // Directory records are legal ZIP metadata, not OOXML parts. Validate them
    // fully before omitting them from the in-memory workbook part collection.
    if (directory && data.length !== 0) fail('BAD_ZIP', 'ZIP 目录条目包含异常内容');
    if (!directory) entries.set(name, Buffer.from(data));
    at = next;
  }
  if (at !== eocd) fail('BAD_ZIP', 'ZIP 目录大小不匹配');
  return entries;
}

// Deterministic STORE ZIP: no external executable, temporary extraction or path writes.
export function writeZip(entries) {
  const localParts = [], directory = [];
  let offset = 0;
  for (const [name, raw] of entries) {
    const data = Buffer.from(raw), filename = Buffer.from(name), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    localParts.push(local, filename, data); directory.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22), cd = Buffer.concat(directory);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.size, 8); end.writeUInt16LE(entries.size, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, cd, end]);
}
