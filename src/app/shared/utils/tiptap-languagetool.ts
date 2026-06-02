/**
 * Adapted from:
 * https://github.com/sereneinserenade/tiptap-languagetool/blob/main/src/components/extensions/languagetool.ts
 *
 * Adaptations for Inkwell (Angular/zoneless project):
 *  - Removed Dexie (IndexedDB) dependency — no database allowed in this project.
 *    The "ignore suggestion" command is kept in the interface for API compatibility
 *    but silently no-ops without persistence.
 *  - Removed lodash dependency — debounce implemented inline.
 *  - Removed Vue-specific env variable (process.env.VUE_APP_LANGUAGE_TOOL_URL).
 *    The caller must supply `apiUrl` via `LanguageTool.configure({ apiUrl })`.
 *  - Removed direct prosemirror-model import to avoid version conflicts between
 *    the project-level prosemirror-model@1.25.6 and @tiptap/pm's prosemirror-model@1.25.4.
 *    ProseMirror node types are accessed as `any` at the module boundary, matching
 *    the established pattern in this codebase (see tiptap-editor.component.ts).
 *  - Fixed strict TypeScript: replaced null assignments with undefined on typed fields.
 *
 * MIT License — Copyright (c) 2022 Jeet Mandaliya
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Software {
  name: string;
  version: string;
  buildDate: string;
  apiVersion: number;
  premium: boolean;
  premiumHint: string;
  status: string;
}

export interface Warnings {
  incompleteResults: boolean;
}

export interface DetectedLanguage {
  name: string;
  code: string;
  confidence: number;
}

export interface Language {
  name: string;
  code: string;
  detectedLanguage: DetectedLanguage;
}

export interface Replacement {
  value: string;
}

export interface Context {
  text: string;
  offset: number;
  length: number;
}

export interface Type {
  typeName: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Rule {
  id: string;
  description: string;
  issueType: string;
  category: Category;
}

export interface Match {
  message: string;
  shortMessage: string;
  replacements: Replacement[];
  offset: number;
  length: number;
  context: Context;
  sentence: string;
  type: Type;
  rule: Rule;
  ignoreForIncompleteSentence: boolean;
  contextForSureMatch: number;
}

export interface LanguageToolResponse {
  software: Software;
  warnings: Warnings;
  language: Language;
  matches: Match[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    languagetool: {
      /** Proofreads the whole document immediately */
      proofread: () => ReturnType;
      toggleProofreading: () => ReturnType;
      ignoreLanguageToolSuggestion: () => ReturnType;
      resetLanguageToolMatch: () => ReturnType;
      toggleLanguageTool: () => ReturnType;
      getLanguageToolState: () => ReturnType;
    };
  }
}

interface TextNodesWithPosition {
  text: string;
  from: number;
  to: number;
}

export interface LanguageToolOptions {
  language: string;
  apiUrl: string;
  automaticMode: boolean;
  documentId: string | number | undefined;
  disabledRules?: string[];
  onIgnoreRule?: (ruleId: string) => void;
  motherTongue?: string;
}

interface LanguageToolStorage {
  match?: Match;
  loading?: boolean;
  matchRange?: { from: number; to: number };
  active: boolean;
}

// ─── Inline debounce (replaces lodash) ───────────────────────────────────────

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// ─── Module-level state (mirrors original) ───────────────────────────────────

let editorView: EditorView;

let decorationSet: DecorationSet;

let apiUrl = '';

let language = 'auto';

let motherTongue: string | undefined;

let textNodesWithPosition: TextNodesWithPosition[] = [];

let match: Match | undefined = undefined;

let matchRange: { from: number; to: number } | undefined;

let proofReadInitially = false;

let isLanguageToolActive = true;

let ignoredRuleIds: string[] = [];

let onIgnoreRuleCallback: ((ruleId: string) => void) | undefined = undefined;

let tooltipEl: HTMLDivElement | null = null;
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

export enum LanguageToolHelpingWords {
  LanguageToolTransactionName = 'languageToolTransaction',
  MatchUpdatedTransactionName = 'matchUpdated',
  MatchRangeUpdatedTransactionName = 'matchRangeUpdated',
  LoadingTransactionName = 'languageToolLoading',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dispatch = (tr: Transaction) => editorView.dispatch(tr);

const updateMatchAndRange = (m?: Match, range?: { from: number; to: number }) => {
  if (m) match = m;
  else match = undefined;

  if (range) matchRange = range;
  else matchRange = undefined;

  const tr = editorView.state.tr;
  tr.setMeta(LanguageToolHelpingWords.MatchUpdatedTransactionName, true);
  tr.setMeta(LanguageToolHelpingWords.MatchRangeUpdatedTransactionName, true);

  editorView.dispatch(tr);
};

const showTooltip = (parsed: { match: Match; from: number; to: number }, target: HTMLElement) => {
  hideTooltip();

  const container = document.createElement('div');
  container.className = 'lt-tooltip';

  // Mensaje de error
  const msg = document.createElement('div');
  msg.className = 'lt-tooltip-message';
  msg.textContent = parsed.match.message;
  container.appendChild(msg);

  // Sugerencias
  if (parsed.match.replacements.length) {
    const suggestions = document.createElement('div');
    suggestions.className = 'lt-tooltip-suggestions';
    parsed.match.replacements.slice(0, 5).forEach((rep) => {
      const btn = document.createElement('button');
      btn.className = 'lt-tooltip-suggestion';
      btn.textContent = rep.value;
      btn.addEventListener('click', () => {
        if (!editorView) return;
        const tr = editorView.state.tr;
        tr.replaceWith(parsed.from, parsed.to, editorView.state.schema.text(rep.value));
        editorView.dispatch(tr);
        hideTooltip();
      });
      suggestions.appendChild(btn);
    });
    container.appendChild(suggestions);
  }

  // Acciones
  const actions = document.createElement('div');
  actions.className = 'lt-tooltip-actions';

  const ignoreBtn = document.createElement('button');
  ignoreBtn.className = 'lt-tooltip-ignore';
  ignoreBtn.textContent = 'Ignorar esta regla';
  ignoreBtn.addEventListener('click', () => {
    const ruleId = parsed.match.rule.id;
    if (!ignoredRuleIds.includes(ruleId)) {
      ignoredRuleIds.push(ruleId);
    }
    hideTooltip();
    if (editorView) proofreadAndDecorateWholeDoc(editorView.state.tr.doc);
    onIgnoreRuleCallback?.(ruleId);
  });
  actions.appendChild(ignoreBtn);

  container.appendChild(actions);

  document.body.appendChild(container);
  tooltipEl = container;

  // Posicionar
  const rect = target.getBoundingClientRect();
  const tooltipRect = container.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 6;

  // Evitar que salga por la derecha
  if (left + tooltipRect.width > window.innerWidth) {
    left = window.innerWidth - tooltipRect.width - 8;
  }
  // Evitar que salga por abajo
  if (top + tooltipRect.height > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - tooltipRect.height - 6;
  }

  container.style.left = `${left}px`;
  container.style.top = `${top}px`;

  // El tooltip tiene sus propios listeners para que el cursor pueda
  // "deslizarse" desde el span hacia el tooltip sin que desaparezca.
  container.addEventListener('mouseenter', () => {
    if (tooltipHideTimer) {
      clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
  });
  container.addEventListener('mouseleave', () => {
    hideTooltip();
  });
};

const hideTooltip = () => {
  if (tooltipHideTimer) {
    clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
};

const scheduleHideTooltip = () => {
  if (tooltipHideTimer) clearTimeout(tooltipHideTimer);
  tooltipHideTimer = setTimeout(() => {
    hideTooltip();
  }, 150);
};

const enterSpanListener = (e: Event) => {
  if (!e.target) return;

  const matchString = (e.target as HTMLSpanElement).getAttribute('match')?.trim();
  if (!matchString) return;

  const parsed = JSON.parse(matchString) as {
    match: Match;
    from: number;
    to: number;
  };

  updateMatchAndRange(parsed.match, { from: parsed.from, to: parsed.to });
  showTooltip(parsed, e.target as HTMLElement);
};

const leaveSpanListener = () => {
  scheduleHideTooltip();
};

const debouncedEnterSpanListener = debounce(enterSpanListener, 50);

const addEventListenersToDecorations = () => {
  const decorations = document.querySelectorAll('span.lt');

  if (!decorations.length) return;

  decorations.forEach((el) => {
    el.addEventListener('mouseenter', debouncedEnterSpanListener);
    el.addEventListener('mouseleave', leaveSpanListener);
  });
};

/**
 * Walks changed descendants between two ProseMirror document revisions.
 * Uses `any` for ProseMirror node types to avoid version conflicts between
 * the project-level prosemirror-model and @tiptap/pm's prosemirror-model.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function changedDescendants(old: any, cur: any, offset: number, f: (node: any, pos: number, cur: any) => void): void {
  const oldSize = old.childCount;
  const curSize = cur.childCount;

  outer: for (let i = 0, j = 0; i < curSize; i++) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const child = cur.child(i);

    for (let scan = j, e = Math.min(oldSize, i + 3); scan < e; scan++) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      if (old.child(scan) === child) {
        j = scan + 1;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        offset += child.nodeSize;
        continue outer;
      }
    }

    f(child, offset, cur);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (j < oldSize && old.child(j).sameMarkup(child)) {
      changedDescendants(old.child(j), child, offset + 1, f);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      child.nodesBetween(0, child.content.size, f, offset + 1);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    offset += child.nodeSize;
  }
}

export const gimmeDecoration = (from: number, to: number, m: Match) =>
  Decoration.inline(from, to, {
    class: `lt lt-${m.rule.issueType}`,
    nodeName: 'span',
    match: JSON.stringify({ match: m, from, to }),
  });

export const moreThan500Words = (s: string) => s.trim().split(/\s+/).length >= 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getMatchAndSetDecorations = async (doc: any, text: string, originalFrom: number) => {
  try {
    let body = `text=${encodeURIComponent(text)}&language=${encodeURIComponent(language)}&enabledOnly=false`;
    if (motherTongue) {
      body += `&motherTongue=${encodeURIComponent(motherTongue)}`;
    }
    if (ignoredRuleIds.length) {
      body += `&disabledRules=${encodeURIComponent(ignoredRuleIds.join(','))}`;
    }

    const postOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    };

    // eslint-disable-next-line no-console
    console.log('[LanguageTool] Checking text, length:', text.length, 'URL:', apiUrl);
    const response = await fetch(apiUrl, postOptions);
    // eslint-disable-next-line no-console
    console.log('[LanguageTool] Response status:', response.status);
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error('[LanguageTool] HTTP error:', response.status, await response.text());
      return;
    }
    const ltRes: LanguageToolResponse = await response.json();
    // eslint-disable-next-line no-console
    console.log('[LanguageTool] Matches found:', ltRes.matches.length);

    const { matches } = ltRes;

    const decorations: Decoration[] = [];

    for (const m of matches) {
      if (ignoredRuleIds.includes(m.rule.id)) continue;
      const docFrom = m.offset + originalFrom;
      const docTo = docFrom + m.length;
      decorations.push(gimmeDecoration(docFrom, docTo, m));
    }

    const decorationsToRemove = decorationSet.find(originalFrom, originalFrom + text.length);

    decorationSet = decorationSet.remove(decorationsToRemove);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    decorationSet = decorationSet.add(doc, decorations);

    if (editorView) dispatch(editorView.state.tr.setMeta(LanguageToolHelpingWords.LanguageToolTransactionName, true));

    setTimeout(addEventListenersToDecorations, 100);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[LanguageTool] Error during check:', err);
  }
};

const debouncedGetMatchAndSetDecorations = debounce(getMatchAndSetDecorations, 300);

let lastOriginalFrom = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onNodeChanged = (doc: any, text: string, originalFrom: number) => {
  if (originalFrom !== lastOriginalFrom) getMatchAndSetDecorations(doc, text, originalFrom);
  else debouncedGetMatchAndSetDecorations(doc, text, originalFrom);

  lastOriginalFrom = originalFrom;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proofreadAndDecorateWholeDoc = async (doc: any, nodePos = 0) => {
  textNodesWithPosition = [];

  let index = 0;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  doc?.descendants((node: any, pos: number) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!node.isText) {
      index += 1;
      return;
    }

    const intermediateTextNodeWithPos: TextNodesWithPosition = {
      text: '',
      from: -1,
      to: -1,
    };

    if (textNodesWithPosition[index]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      intermediateTextNodeWithPos.text = textNodesWithPosition[index].text + (node.text as string);
      intermediateTextNodeWithPos.from = textNodesWithPosition[index].from + nodePos;
      intermediateTextNodeWithPos.to =
        intermediateTextNodeWithPos.from + intermediateTextNodeWithPos.text.length + nodePos;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      intermediateTextNodeWithPos.text = (node.text as string) ?? '';
      intermediateTextNodeWithPos.from = pos + nodePos;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      intermediateTextNodeWithPos.to = pos + nodePos + ((node.text as string | undefined)?.length ?? 0);
    }

    textNodesWithPosition[index] = intermediateTextNodeWithPos;
  });

  textNodesWithPosition = textNodesWithPosition.filter(Boolean);

  let finalText = '';

  const chunksOf500Words: { from: number; text: string }[] = [];

  let upperFrom = 0 + nodePos;
  let newDataSet = true;

  let lastPos = 1 + nodePos;

  for (const { text, from, to } of textNodesWithPosition) {
    if (!newDataSet) {
      upperFrom = from;
      newDataSet = true;
    } else {
      const diff = from - lastPos;
      if (diff > 0) finalText += Array(diff + 1).join(' ');
    }

    lastPos = to;
    finalText += text;

    if (moreThan500Words(finalText)) {
      const updatedFrom = chunksOf500Words.length ? upperFrom : upperFrom + 1;
      chunksOf500Words.push({ from: updatedFrom, text: finalText });
      finalText = '';
      newDataSet = false;
    }
  }

  chunksOf500Words.push({
    from: chunksOf500Words.length ? upperFrom : 1,
    text: finalText,
  });

  const requests = chunksOf500Words.map(({ text, from }) => getMatchAndSetDecorations(doc, text, from));

  if (editorView) dispatch(editorView.state.tr.setMeta(LanguageToolHelpingWords.LoadingTransactionName, true));

  Promise.all(requests).then(() => {
    if (editorView) dispatch(editorView.state.tr.setMeta(LanguageToolHelpingWords.LoadingTransactionName, false));
  });

  proofReadInitially = true;
};

const debouncedProofreadAndDecorate = debounce(proofreadAndDecorateWholeDoc, 500);

// ─── Extension ───────────────────────────────────────────────────────────────

export const LanguageTool = Extension.create<LanguageToolOptions, LanguageToolStorage>({
  name: 'languagetool',

  addOptions() {
    return {
      language: 'auto',
      apiUrl: 'http://localhost:8081/v2/check',
      automaticMode: true,
      documentId: undefined,
      disabledRules: [],
      onIgnoreRule: undefined,
    };
  },

  addStorage() {
    return {
      match: match,
      loading: false,
      matchRange: {
        from: -1,
        to: -1,
      },
      active: isLanguageToolActive,
    };
  },

  addCommands() {
    return {
      proofread:
        () =>
        ({ tr }) => {
          apiUrl = this.options.apiUrl;
          proofreadAndDecorateWholeDoc(tr.doc);
          return true;
        },

      toggleProofreading:
        () =>
        ({ commands }) => {
          isLanguageToolActive = !isLanguageToolActive;
          if (isLanguageToolActive) commands.proofread();
          else commands.resetLanguageToolMatch();
          this.storage.active = isLanguageToolActive;
          return false;
        },

      ignoreLanguageToolSuggestion:
        () =>
        () => {
          // Dexie (IndexedDB) removed — "ignore suggestion" persistence is not
          // available in this project (no database allowed). This command is a
          // no-op kept for API compatibility.
          return false;
        },

      resetLanguageToolMatch:
        () =>
        ({
          editor: {
            view: {
              dispatch: viewDispatch,
              state: { tr },
            },
          },
        }) => {
          match = undefined;
          matchRange = undefined;

          viewDispatch(
            tr
              .setMeta(LanguageToolHelpingWords.MatchRangeUpdatedTransactionName, true)
              .setMeta(LanguageToolHelpingWords.MatchUpdatedTransactionName, true),
          );

          return false;
        },

      toggleLanguageTool:
        () =>
        ({ commands }) => {
          isLanguageToolActive = !isLanguageToolActive;

          if (isLanguageToolActive) commands.proofread();
          else commands.resetLanguageToolMatch();

          this.storage.active = isLanguageToolActive;

          return false;
        },

      getLanguageToolState: () => () => isLanguageToolActive,
    };
  },

  addProseMirrorPlugins() {
    const { apiUrl: optionsApiUrl, language: optionsLanguage, disabledRules: optionsDisabledRules, onIgnoreRule: optionsOnIgnoreRule, motherTongue: optionsMotherTongue } = this.options;

    apiUrl = optionsApiUrl;
    language = optionsLanguage;
    motherTongue = optionsMotherTongue;
    ignoredRuleIds = optionsDisabledRules ?? [];
    onIgnoreRuleCallback = optionsOnIgnoreRule;

    return [
      new Plugin({
        key: new PluginKey('languagetoolPlugin'),
        props: {
          decorations(state) {
            return this.getState(state);
          },
          attributes: {
            spellcheck: 'false',
            isLanguageToolActive: `${isLanguageToolActive}`,
          },

          handlePaste(view) {
            const { docChanged } = view.state.tr;

            if (docChanged) debouncedProofreadAndDecorate(view.state.tr.doc);

            return false;
          },
        },
        state: {
          init: (_, state) => {
            decorationSet = DecorationSet.create(state.doc as any, []);

            if (this.options.automaticMode) proofreadAndDecorateWholeDoc(state.doc);

            return decorationSet;
          },
          apply: (tr) => {
            if (!isLanguageToolActive) return DecorationSet.empty;

            const matchUpdated = tr.getMeta(LanguageToolHelpingWords.MatchUpdatedTransactionName);
            const matchRangeUpdated = tr.getMeta(LanguageToolHelpingWords.MatchRangeUpdatedTransactionName);

            const loading = tr.getMeta(LanguageToolHelpingWords.LoadingTransactionName);

            if (loading) this.storage.loading = true;
            else this.storage.loading = false;

            if (matchUpdated) this.storage.match = match;

            if (matchRangeUpdated) this.storage.matchRange = matchRange;

            const languageToolDecorations = tr.getMeta(LanguageToolHelpingWords.LanguageToolTransactionName);

            if (languageToolDecorations) return decorationSet;

            if (tr.docChanged && this.options.automaticMode) {
              if (!proofReadInitially) {
                debouncedProofreadAndDecorate(tr.doc);
              } else {
                const {
                  selection: { from, to },
                } = tr;

                let changedNodeWithPos: { node: any; pos: number } | undefined;

                tr.doc.descendants((node, pos) => {
                  if (!node.isBlock) return false;

                  const nodeFrom = pos;
                  const nodeTo = pos + node.nodeSize;

                  if (!(nodeFrom <= from && to <= nodeTo)) return false;

                  changedNodeWithPos = { node, pos };
                  return false;
                });

                if (changedNodeWithPos) {
                  onNodeChanged(
                    changedNodeWithPos.node,
                    changedNodeWithPos.node.textContent,
                    changedNodeWithPos.pos + 1,
                  );
                }
              }
            }

            decorationSet = decorationSet.map(tr.mapping, tr.doc);

            setTimeout(addEventListenersToDecorations, 100);

            return decorationSet;
          },
        },
        view: () => ({
          update: (view) => {
            editorView = view;
            setTimeout(addEventListenersToDecorations, 100);
          },
        }),
      }),
    ];
  },
});
