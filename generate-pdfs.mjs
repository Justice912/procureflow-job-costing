import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Simple markdown to HTML converter
function markdownToHtml(md) {
  let html = md;

  // Escape HTML entities in code blocks first, then process
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    codeBlocks.push(`<pre class="code-block"><code class="language-${lang || 'text'}">${escaped}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Tables
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map(c => c.trim());
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, (match) => {
    const rows = match.trim().split('\n').filter(r => r.trim());
    // Check if second row is separator
    if (rows.length >= 2 && /^<tr>(<td>[\s\-:]+<\/td>)+<\/tr>$/.test(rows[1])) {
      const header = rows[0].replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
      const body = rows.slice(2).join('\n');
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    }
    return `<table><tbody>${match}</tbody></table>`;
  });

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

  // Unordered lists
  html = html.replace(/^(\s*)[-*]\s+(.+)$/gm, (match, indent, content) => {
    const level = Math.floor(indent.length / 2);
    return `<li class="indent-${level}">${content}</li>`;
  });
  // Wrap consecutive li elements
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/(<oli>.*<\/oli>\n?)+/g, (match) => {
    return `<ol>${match.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>')}</ol>`;
  });

  // Paragraphs - wrap remaining text blocks
  html = html.replace(/^(?!<[a-zA-Z%])((?!%%CODEBLOCK).+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    html = html.replace(`%%CODEBLOCK_${idx}%%`, block);
  });

  return html;
}

const CSS = `
  @page {
    margin: 60px 50px;
    size: A4;
  }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.7;
    color: #1e293b;
    font-size: 11px;
    max-width: 100%;
  }
  h1 {
    font-size: 24px;
    color: #0f172a;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 8px;
    margin-top: 30px;
    page-break-after: avoid;
  }
  h2 {
    font-size: 19px;
    color: #1e40af;
    border-bottom: 1px solid #bfdbfe;
    padding-bottom: 5px;
    margin-top: 25px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 15px;
    color: #1d4ed8;
    margin-top: 20px;
    page-break-after: avoid;
  }
  h4 {
    font-size: 13px;
    color: #374151;
    margin-top: 15px;
    page-break-after: avoid;
  }
  p {
    margin: 6px 0;
  }
  blockquote {
    border-left: 4px solid #3b82f6;
    padding: 10px 15px;
    margin: 12px 0;
    background: #eff6ff;
    color: #1e40af;
    border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
  }
  pre.code-block {
    background: #1e293b;
    color: #e2e8f0;
    padding: 14px 18px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 10px;
    line-height: 1.5;
    margin: 10px 0;
    page-break-inside: avoid;
  }
  code.inline-code {
    background: #f1f5f9;
    color: #dc2626;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10.5px;
    font-family: 'Consolas', 'Monaco', monospace;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10.5px;
    page-break-inside: avoid;
  }
  th {
    background: #1e40af;
    color: white;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    border: 1px solid #e2e8f0;
    padding: 7px 12px;
  }
  tr:nth-child(even) {
    background: #f8fafc;
  }
  hr {
    border: none;
    border-top: 2px solid #e2e8f0;
    margin: 25px 0;
  }
  ul, ol {
    margin: 8px 0;
    padding-left: 24px;
  }
  li {
    margin: 3px 0;
  }
  strong {
    color: #0f172a;
  }
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 90vh;
    text-align: center;
  }
  .cover-page h1 {
    font-size: 36px;
    border: none;
    color: #1e40af;
    margin-bottom: 10px;
  }
  .cover-page .subtitle {
    font-size: 18px;
    color: #64748b;
    margin-bottom: 40px;
  }
  .cover-page .project {
    font-size: 14px;
    color: #94a3b8;
    border: 2px solid #e2e8f0;
    padding: 12px 24px;
    border-radius: 8px;
  }
`;

async function generatePDF(mdPath, outputPath, coverTitle, coverSubtitle) {
  console.log(`Reading ${mdPath}...`);
  const md = readFileSync(mdPath, 'utf-8');
  const bodyHtml = markdownToHtml(md);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${CSS}</style>
</head>
<body>
  <div class="cover-page">
    <h1>${coverTitle}</h1>
    <p class="subtitle">${coverSubtitle}</p>
    <p class="project">ProcureFlow Job Costing System</p>
  </div>
  <div style="page-break-before: always;"></div>
  ${bodyHtml}
</body>
</html>`;

  console.log(`Launching browser...`);
  const browser = await chromium.launch({
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'networkidle' });

  console.log(`Generating PDF: ${outputPath}`);
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px; color:#94a3b8; width:100%; text-align:center; padding:5px 50px;">${coverTitle} — ProcureFlow</div>`,
    footerTemplate: '<div style="font-size:8px; color:#94a3b8; width:100%; text-align:center; padding:5px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    margin: { top: '80px', bottom: '60px', left: '50px', right: '50px' },
  });

  await browser.close();
  console.log(`Done: ${outputPath}`);
}

const basePath = '/home/user/procureflow-job-costing';

await generatePDF(
  resolve(basePath, 'LEARN-TO-CODE-TUTORIAL.md'),
  resolve(basePath, 'Learn-To-Code-Tutorial.pdf'),
  'Learn to Code',
  'From Zero to Professional — A Complete Beginner\'s Guide'
);

await generatePDF(
  resolve(basePath, 'DEEP-DIVE-STRUCTURE-GUIDE.md'),
  resolve(basePath, 'Deep-Dive-Structure-Guide.pdf'),
  'Deep Dive Structure Guide',
  'File-by-File & Section-by-Section Breakdown'
);

console.log('\nBoth PDFs generated successfully!');
