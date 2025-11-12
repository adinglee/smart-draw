/**
 * 轻量的结构化文本修复工具：
 * - 修复常见的 JSON 括号/引号未闭合、尾随逗号等问题
 * - 修复常见的 XML/HTML 标签未闭合问题（在文末补齐缺失的闭合标签）
 *
 * 设计目标：简洁且实用，不做过度“猜测性”修改，优先保证结果可用。
 */

/**
 * 判定是否更可能是 JSON 片段（而非标记语言）。
 */
function isLikelyJSON(input = '') {
  const s = (input || '').trimStart();
  if (!s) return false;
  if (s.startsWith('{') || s.startsWith('[')) return true;
  // 有明显的 JSON 结构信号也视为可能是 JSON
  if ((s.includes(':{') || s.includes('":[') || s.includes('"type"'))) return true;
  return false;
}

/**
 * 移除 JSON 中在闭合括号前的尾随逗号，如 `, }` 或 `, ]`。
 */
function stripTrailingCommas(text) {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * 基于扫描的方式，补齐 JSON 的引号与括号闭合。
 * 仅在字符串外统计括号，避免误判。
 */
function fixJSONStructure(input = '') {
  let text = (input || '').replace(/\ufeff/g, '').replace(/[\u200B-\u200D\u2060]/g, '');
  text = stripTrailingCommas(text);

  // 计算是否落在未闭合的字符串中，以及未闭合的括号栈
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      escaped = false;
      continue;
    }
    if (ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === '}' || ch === ']') {
      const need = ch === '}' ? '{' : '[';
      if (stack.length && stack[stack.length - 1] === need) {
        stack.pop();
      } else {
        // 遇到多余的闭合符，保留原文但不入栈
      }
    }
  }

  // 如果字符串未闭合，补一个引号
  if (inString) {
    text += '"';
  }

  // 去掉末尾的尾随逗号
  text = text.replace(/,\s*$/g, '');
  text = stripTrailingCommas(text);

  // 按栈补齐缺失的闭合括号
  for (let i = stack.length - 1; i >= 0; i--) {
    text += stack[i] === '{' ? '}' : ']';
  }

  return text;
}

/**
 * 尝试修复 JSON：
 * - 先直接 parse 成功则原样返回
 * - 失败则按规则补齐引号与括号，再尝试 parse
 * - 仍失败则返回“尽力修复”的文本
 */
export function fixJSON(input = '') {
  const raw = (input || '').trim();
  if (!raw) return raw;
  try {
    JSON.parse(raw);
    return raw; // 已经是合法 JSON
  } catch {}

  const fixed = fixJSONStructure(raw);
  try {
    JSON.parse(fixed);
    return fixed;
  } catch {}

  // 兜底：再次移除闭合前尾随逗号
  const second = stripTrailingCommas(fixed);
  return second;
}

/**
 * HTML 的空元素（无需闭合）。用于简单判断，不求穷尽。
 */
const DEFAULT_VOID_TAGS = new Set([
  'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'
]);

/**
 * 简单补齐标记语言（XML/HTML）未闭合的标签：
 * - 仅在文末补齐未闭合的打开标签
 * - 保留原有的中间不匹配闭合，不做“纠错性改写”，避免误伤
 */
export function fixXMLorHTML(input = '', opts = {}) {
  const voidTags = opts.voidTags || DEFAULT_VOID_TAGS;
  const treatAsHTML = opts.html !== false; // 默认按 HTML 大小写不敏感处理
  const src = (input || '').replace(/\ufeff/g, '').replace(/[\u200B-\u200D\u2060]/g, '');

  // 先确保末尾没有半截标签（例如以 "<div" 结尾），补一个 '>' 再处理
  let text = src;
  const lastLt = text.lastIndexOf('<');
  if (lastLt !== -1 && text.indexOf('>', lastLt) === -1) {
    text += '>';
  }

  const tagRe = /<([^>]+)>/g;
  const stack = [];
  let out = '';
  let lastIndex = 0;

  const normalize = (name) => (treatAsHTML ? String(name || '').toLowerCase() : String(name || ''));

  let m;
  while ((m = tagRe.exec(text)) !== null) {
    out += text.slice(lastIndex, m.index); // 追加标签前的原始文本
    lastIndex = tagRe.lastIndex;

    const rawTag = m[1].trim();

    // 注释/DOCTYPE/CDATA/PI 直接原样输出，不参与栈
    if (rawTag.startsWith('!--') || rawTag.startsWith('!DOCTYPE') || rawTag.startsWith('![CDATA[') || rawTag.startsWith('?')) {
      out += '<' + rawTag + '>';
      continue;
    }

    // 闭合标签
    if (rawTag.startsWith('/')) {
      const name = normalize(rawTag.slice(1).split(/\s+/)[0] || '');
      out += '<' + rawTag + '>';
      // 仅当与栈顶匹配时弹出，避免中间强行“纠正”
      if (stack.length && normalize(stack[stack.length - 1]) === name) {
        stack.pop();
      }
      continue;
    }

    // 自闭合
    const selfClosing = /\/$/.test(rawTag);
    const name = normalize(rawTag.split(/\s+/)[0] || '');

    out += '<' + rawTag + '>';

    if (!selfClosing && !voidTags.has(name)) {
      stack.push(name);
    }
  }

  // 追加剩余尾部文本
  out += text.slice(lastIndex);

  // 在文末补齐尚未闭合的打开标签
  for (let i = stack.length - 1; i >= 0; i--) {
    out += `</${stack[i]}>`;
  }

  return out;
}

/**
 * 自动判断并修复：优先按 JSON 处理，失败再按 XML/HTML 处理。
 * @param {string} input
 * @param {{ mode?: 'auto'|'json'|'xml', html?: boolean, voidTags?: Set<string> }} opts
 * @returns {string} 修复后的文本
 */
export function fixUnclosed(input = '', opts = {}) {
  const mode = opts.mode || 'auto';
  const text = String(input ?? '');

  if (mode === 'json' || (mode === 'auto' && isLikelyJSON(text))) {
    const fixed = fixJSON(text);
    return fixed;
  }

  // XML/HTML 路径
  return fixXMLorHTML(text, opts);
}

export default fixUnclosed;

