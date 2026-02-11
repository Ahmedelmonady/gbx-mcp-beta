/** Extracts YAML frontmatter and strips JSX from MDX content, preserving code blocks and text */
export function parseMdx(raw: string): { title: string; description: string; content: string } {
  let title = '';
  let description = '';
  let body = raw;

  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fmMatch) {
    body = raw.slice(fmMatch[0].length);
    const fm = fmMatch[1];
    const titleMatch = fm.match(/title:\s*["']?(.*?)["']?\s*$/m);
    const descMatch = fm.match(/description:\s*["']?(.*?)["']?\s*$/m);
    if (titleMatch) title = titleMatch[1];
    if (descMatch) description = descMatch[1];
  }

  // Protect code blocks
  const codeBlocks: string[] = [];
  body = body.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `__CB${codeBlocks.length - 1}__`;
  });

  // Strip self-closing JSX tags
  body = body.replace(/<[A-Z][a-zA-Z]*\s[^>]*\/>/g, '');
  body = body.replace(/<(img|Icon|Frame|br)\s*[^>]*\/?>/gi, '');

  // Iteratively unwrap components that should keep inner content
  const keepContent = [
    'Tip', 'Warning', 'Note', 'Info',
    'Accordion', 'AccordionGroup',
    'Tab', 'Tabs',
    'Steps', 'Step',
    'CodeGroup', 'Snippet',
  ];
  const keepRe = new RegExp(
    `<(${keepContent.join('|')})[^>]*>([\\s\\S]*?)<\\/\\1>`, 'g'
  );
  // Loop to handle nesting
  let prev = '';
  while (prev !== body) {
    prev = body;
    body = body.replace(keepRe, '$2');
  }

  // Remove components entirely (layout-only, no useful text)
  const removeEntirely = ['Card', 'CardGroup', 'Frame', 'ResponseField', 'ParamField', 'Expandable'];
  for (const tag of removeEntirely) {
    body = body.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'g'), '');
    body = body.replace(new RegExp(`<${tag}[^>]*\\/?>`, 'g'), '');
  }

  // Clean any remaining JSX-style tags
  body = body.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  // Restore code blocks
  body = body.replace(/__CB(\d+)__/g, (_, i) => codeBlocks[parseInt(i)]);

  // Clean excess whitespace
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  return { title, description, content: body };
}
