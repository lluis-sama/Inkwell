import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, changedDescendants, moreThan500Words, gimmeDecoration, Match } from './tiptap-languagetool';

describe('tiptap-languagetool utils', () => {
  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('retrasa ejecución y cancela timer previo', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('a');
      debounced('b');
      debounced('c');

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('c');
    });

    it('ejecuta solo una vez tras ráfaga de llamadas', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 50);

      for (let i = 0; i < 10; i++) {
        debounced(i);
        vi.advanceTimersByTime(10);
      }

      vi.advanceTimersByTime(50);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(9);
    });
  });

  describe('moreThan500Words', () => {
    it('true con ≥500 palabras', () => {
      const text = Array(500).fill('word').join(' ');
      expect(moreThan500Words(text)).toBe(true);
    });

    it('false con <500 palabras', () => {
      const text = Array(499).fill('word').join(' ');
      expect(moreThan500Words(text)).toBe(false);
    });
  });

  describe('changedDescendants', () => {
    it('recorre nodos modificados entre dos docs', () => {
      const visited: Array<{ text: string; pos: number }> = [];

      function makeNode(text: string, nodeSize: number) {
        return {
          childCount: 1,
          child: () => makeLeaf(text, nodeSize),
          sameMarkup: () => false,
          nodeSize,
          nodesBetween: (_from: number, _to: number, f: (n: any, p: number) => void, offset: number) => {
            f(makeLeaf(text, nodeSize), offset + 1);
          },
        };
      }

      function makeLeaf(text: string, nodeSize: number) {
        return {
          text,
          nodeSize,
          content: { size: nodeSize },
          sameMarkup: () => false,
          nodesBetween: (_from: number, _to: number, f: (n: any, p: number) => void, offset: number) => {
            f(makeLeaf(text, nodeSize), offset);
          },
        };
      }

      const oldDoc = makeNode('old', 4);
      const newDoc = makeNode('new', 4);

      changedDescendants(oldDoc, newDoc, 0, (node, pos) => {
        visited.push({ text: node.text, pos });
      });

      expect(visited.length).toBeGreaterThan(0);
      expect(visited.some(v => v.text === 'new')).toBe(true);
    });

    it('ignora hijos idénticos por referencia', () => {
      const visited: string[] = [];
      const sharedChild = { text: 'shared', nodeSize: 7, sameMarkup: () => true };

      function makeDoc(children: any[]) {
        return {
          childCount: children.length,
          child: (i: number) => children[i],
          sameMarkup: () => false,
          nodeSize: children.reduce((sum, c) => sum + c.nodeSize, 0),
          nodesBetween: () => {},
        };
      }

      const oldDoc = makeDoc([sharedChild]);
      const newDoc = makeDoc([sharedChild]);

      changedDescendants(oldDoc, newDoc, 0, (node) => {
        visited.push(node.text);
      });

      expect(visited).not.toContain('shared');
    });
  });

  describe('gimmeDecoration', () => {
    it('genera Decoration inline', () => {
      const match: Match = {
        message: 'Error',
        shortMessage: 'Err',
        replacements: [],
        offset: 0,
        length: 4,
        context: { text: 'test', offset: 0, length: 4 },
        sentence: 'test',
        type: { typeName: 'typo' },
        rule: { id: 'RULE_1', description: 'Rule', issueType: 'typographical', category: { id: 'CAT', name: 'Category' } },
        ignoreForIncompleteSentence: false,
        contextForSureMatch: 0,
      };

      const decoration = gimmeDecoration(2, 6, match);

      expect(decoration.from).toBe(2);
      expect(decoration.to).toBe(6);
      expect(decoration).toBeTruthy();
    });
  });
});
