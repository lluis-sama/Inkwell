interface TipTapNode {
  type: string;
  text?: string;
  content?: TipTapNode[];
}

const BLOCK_NODES = new Set([
  'paragraph', 'heading', 'blockquote',
  'bulletList', 'orderedList', 'listItem',
  'codeBlock', 'horizontalRule',
]);

function extractText(node: TipTapNode): string {
  if (node.type === 'text') return node.text ?? '';

  const children = (node.content ?? []).map(extractText).join('');

  if (BLOCK_NODES.has(node.type)) {
    return children + '\n';
  }

  return children;
}

export function tiptapToText(doc: object): string {
  return extractText(doc as TipTapNode).trim();
}
