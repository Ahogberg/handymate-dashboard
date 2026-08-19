// Konverterar partnerpaketets markdown till Word (.docx).
// Körs från repo-roten: node scripts/partner-paket-till-word.js (kräver npm-paketet docx).
// Kör om detta efter varje ändring i content/partner/*.md så Word-versionerna hålls i synk.
// Hanterar exakt de konstruktioner som förekommer i content/partner/*.md:
// H1-H3, stycken, kursiva notisblock (_.._), citatblock (>), punkt- och
// nummerlistor, tabeller, **fet**, _kursiv_, *kursiv*, `kod`.
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, BorderStyle, AlignmentType, LevelFormat,
  ShadingType, Footer, PageNumber, convertMillimetersToTwip,
} = require('docx');

const TEAL = '0F766E';
const DARK = '1F2937';
const GRAY = '6B7280';
const LIGHT_TEAL = 'E6F2F1';
const BORDER_GRAY = 'D1D5DB';
const FONT = 'Calibri';
const CONTENT_W = 9026; // A4 minus 2×2,54 cm marginal, i DXA

// ---------- inline-parsning ----------
function inlineRuns(text, base = {}) {
  const runs = [];
  // dela först på **fet**
  const boldParts = text.split(/\*\*/);
  boldParts.forEach((part, i) => {
    const bold = i % 2 === 1;
    // inom varje del: `kod`, sedan kursiv
    const codeParts = part.split(/`/);
    codeParts.forEach((cp, j) => {
      if (cp === '') return;
      if (j % 2 === 1) {
        runs.push(new TextRun({ text: cp, font: 'Consolas', size: 19, color: TEAL, bold, ...base }));
        return;
      }
      // kursiv: _.._ eller *..*  (ej mitt i ord)
      const italRegex = /(^|[\s((„"])([_*])([^_*]+?)\2(?=[\s).,;:!?"”—–]|$)/g;
      let last = 0, m;
      while ((m = italRegex.exec(cp)) !== null) {
        const before = cp.slice(last, m.index) + m[1];
        if (before) runs.push(new TextRun({ text: before, bold, ...base }));
        runs.push(new TextRun({ text: m[3], italics: true, bold, ...base }));
        last = m.index + m[0].length;
      }
      const rest = cp.slice(last);
      if (rest) runs.push(new TextRun({ text: rest, bold, ...base }));
    });
  });
  return runs;
}

// ---------- block-parsning ----------
function parseBlocks(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push({ type: 'heading', level, text: line.replace(/^#+ /, '') });
      i++; continue;
    }
    if (line.startsWith('|')) {
      const tbl = [];
      while (i < lines.length && lines[i].startsWith('|')) { tbl.push(lines[i]); i++; }
      const rows = tbl
        .filter(r => !/^\|[\s\-:|]+\|$/.test(r))
        .map(r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      blocks.push({ type: 'table', rows });
      continue;
    }
    if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(lines[i].replace(/^>\s?/, '')); i++;
      }
      // dela citatet i stycken på tomrader, behåll listrader som egna rader
      const paras = [];
      let cur = [];
      for (const q of quote) {
        if (q.trim() === '') { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
        else if (/^\d+\.\s/.test(q.trim()) || /^-\s/.test(q.trim())) {
          if (cur.length) { paras.push(cur.join(' ')); cur = []; }
          paras.push(q.trim());
        } else cur.push(q.trim());
      }
      if (cur.length) paras.push(cur.join(' '));
      blocks.push({ type: 'quote', paras });
      continue;
    }
    if (/^[-*] /.test(line.trim()) && line.startsWith('-')) {
      const items = [];
      while (i < lines.length && (lines[i].startsWith('- ') || /^  \S/.test(lines[i]))) {
        if (lines[i].startsWith('- ')) items.push(lines[i].slice(2).trim());
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && (/^\d+\. /.test(lines[i]) || /^   \S/.test(lines[i]))) {
        if (/^\d+\. /.test(lines[i])) items.push(lines[i].replace(/^\d+\. /, '').trim());
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    // vanligt stycke — samla rader till tomrad/blockstart
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,3} |\||>|- |\d+\. )/.test(lines[i])) {
      para.push(lines[i].trim()); i++;
    }
    const text = para.join(' ');
    if (/^_.*_$/.test(text)) {
      blocks.push({ type: 'note', text: text.slice(1, -1) });
    } else {
      blocks.push({ type: 'p', text });
    }
  }
  return blocks;
}

// ---------- docx-byggare ----------
function colWidths(n) {
  const pct = n === 2 ? [35, 65]
    : n === 3 ? [22, 30, 48]
    : n === 4 ? [8, 22, 35, 35]
    : Array(n).fill(100 / n);
  const w = pct.map(p => Math.floor((p / 100) * CONTENT_W));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  return w;
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: BORDER_GRAY };

function buildTable(rows) {
  const widths = colWidths(rows[0].length);
  return new Table({
    columnWidths: widths,
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: rows.map((cells, r) => new TableRow({
      tableHeader: r === 0,
      children: cells.map((c, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA },
        shading: r === 0
          ? { type: ShadingType.CLEAR, fill: TEAL }
          : (r % 2 === 0 ? { type: ShadingType.CLEAR, fill: 'F5F8F8' } : undefined),
        margins: { top: 80, bottom: 80, left: 110, right: 110 },
        borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
        children: [new Paragraph({
          spacing: { after: 0 },
          children: inlineRuns(c, r === 0 ? { bold: true, color: 'FFFFFF', size: 20 } : { size: 20 }),
        })],
      })),
    })),
  });
}

let olCounter = 0;

function blocksToChildren(blocks) {
  const children = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      const lvl = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][b.level - 1];
      children.push(new Paragraph({ heading: lvl, children: inlineRuns(b.text) }));
    } else if (b.type === 'p') {
      children.push(new Paragraph({ children: inlineRuns(b.text), spacing: { after: 160 } }));
    } else if (b.type === 'note') {
      children.push(new Paragraph({
        children: inlineRuns(b.text, { italics: true, color: GRAY, size: 19 }),
        spacing: { after: 220 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: BORDER_GRAY, space: 8 } },
        indent: { left: 220 },
      }));
    } else if (b.type === 'quote') {
      b.paras.forEach((p, idx) => children.push(new Paragraph({
        children: inlineRuns(p, { italics: true, color: DARK }),
        indent: { left: 360 },
        spacing: { after: idx === b.paras.length - 1 ? 200 : 60 },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: TEAL, space: 10 } },
      })));
    } else if (b.type === 'ul') {
      b.items.forEach(item => children.push(new Paragraph({
        children: inlineRuns(item),
        numbering: { reference: 'bullets', level: 0 },
        spacing: { after: 60 },
      })));
      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    } else if (b.type === 'ol') {
      const ref = `ol-${olCounter++}`;
      olRefs.push(ref);
      b.items.forEach(item => children.push(new Paragraph({
        children: inlineRuns(item),
        numbering: { reference: ref, level: 0 },
        spacing: { after: 60 },
      })));
      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
    } else if (b.type === 'table') {
      children.push(buildTable(b.rows));
      children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
    }
  }
  return children;
}

let olRefs = [];

function makeDoc(blocks) {
  olRefs = []; olCounter = 0;
  const children = blocksToChildren(blocks);
  const decimalLevel = [{
    level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 440, hanging: 260 } } },
  }];
  return new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 21, color: DARK } },
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 40, bold: true, color: TEAL },
          paragraph: { spacing: { before: 0, after: 260 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 27, bold: true, color: TEAL },
          paragraph: { spacing: { before: 320, after: 140 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LIGHT_TEAL, space: 4 } } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 23, bold: true, color: DARK },
          paragraph: { spacing: { before: 240, after: 100 } } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [{
            level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 440, hanging: 260 } } },
          }] },
        ...olRefs.map(ref => ({ reference: ref, levels: decimalLevel })),
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(22), bottom: convertMillimetersToTwip(22),
            left: convertMillimetersToTwip(25.4), right: convertMillimetersToTwip(25.4),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Handymate Partnerpaket — internt säljmaterial  ·  Sida ', color: GRAY, size: 17 }),
              new TextRun({ children: [PageNumber.CURRENT], color: GRAY, size: 17 }),
            ],
          })],
        }),
      },
      children,
    }],
  });
}

// ---------- körning ----------
const SRC = path.join(__dirname, '..', 'content', 'partner');
const OUT = path.join(SRC, 'word');
fs.mkdirSync(OUT, { recursive: true });

const files = [
  ['README.md', '00-innehall.docx'],
  ['partner-paket.md', 'partner-paket.docx'],
  ['01-vad-ar-handymate.md', '01-vad-ar-handymate.docx'],
  ['02-funktionsguide.md', '02-funktionsguide.docx'],
  ['03-motorerna-enkelt-forklarat.md', '03-motorerna-enkelt-forklarat.docx'],
  ['04-saljmanus.md', '04-saljmanus.docx'],
  ['05-pitchpunkter.md', '05-pitchpunkter.docx'],
  ['06-invandningar-och-faq.md', '06-invandningar-och-faq.docx'],
];

(async () => {
  for (const [src, out] of files) {
    const md = fs.readFileSync(path.join(SRC, src), 'utf8');
    const doc = makeDoc(parseBlocks(md));
    const buf = await Packer.toBuffer(doc);
    fs.writeFileSync(path.join(OUT, out), buf);
    console.log('skrev', out, Math.round(buf.length / 1024) + ' kB');
  }
})();
