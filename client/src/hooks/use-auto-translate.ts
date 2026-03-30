import { useLanguage } from '@/hooks/use-language';

/**
 * useAutoTranslate — provides `at()`, a pass-through translation helper.
 * Auto-translation via AI can be layered here in the future; for now it
 * returns the input string unchanged so components compile without alteration.
 */
export function useAutoTranslate() {
  const { language } = useLanguage();

  /** Auto-translate: returns `text` as-is (identity). Replace with AI call if needed. */
  const at = (text: string): string => text;

  return { at, language };
}
