import { describe, it, expect } from 'vitest';
import { mergeWords, upgradeRemakeTemplate, validateTemplate, isV2, hasStyle } from '@mathchois/shared';

describe('mergeWords', () => {
  it('applies both sides when their edits do not touch', () => {
    expect(mergeWords('a city at dusk', 'a campus city at dusk', 'a city at night')).toBe('a campus city at night');
  });
  it('returns null when both sides edit the same words', () => {
    expect(mergeWords('the brand name here', 'the channel name here', 'the logo name here')).toBeNull();
  });
  it('accepts the same edit made on both sides', () => {
    expect(mergeWords('one two three', 'one 2 three', 'one 2 three')).toBe('one 2 three');
  });
});

describe('upgradeRemakeTemplate', () => {
  const base = [
    'You are a motion designer. Create a 10-second intro.',
    '- Name: {{Channel name=Oppadu}}',
    '- Topic: {{Topic=Excel lessons}}',
    '- {{?Numbers=1.7M subscribers}}',
    '- {{?Logo=Use the attached logo.}}',
    '- **World:** a city at dusk becomes a stage.',
    "- **Palette:** a limited palette with the brand's five colors.",
    '- **Effects:** sparkles.',
    '- Hook the viewer in 1 s.',
  ].join('\n');
  const remake = [
    'You are a motion designer. Create a 10-second intro.',
    '- Name: {{Channel name=Chois}}',
    '- Topic: {{Topic=Vibe coding}}',
    '- {{-Numbers=Fill in real figures only}}',
    '- {{?Logo=Use the attached pixel logo.}}',
    '- **World:** a campus street at dusk becomes a stage.',
    '- **Story beats:** a prompt card appears first.',
    "- **Palette:** a limited palette with the brand's five colors (navy, gold).",
    '- **Effects:** sparkles.',
    '- Hook the viewer in 1 s (prompt before 1.0 s).',
    '- If a shot list and cue sheet are attached below, keep their order.',
  ].join('\n');
  const next = [
    'You are a motion designer. Create an intro{{@hook}}.',
    '- Name: {{Brand name=Oppadu}}',
    '- Topic: {{Topic=엑셀 강의}}',
    '- {{?Numbers=1.7M subscribers}}',
    '- {{@logo}}',
    '{{#a}}- **World:** a city at dusk becomes a stage.',
    '{{#b}}- **World — you decide:** pick a world for the channel.',
    '- **Palette:** a limited palette with a few accent colors.',
    '{{#sound}}- **Effects:** sparkles.',
    '- Hook the viewer early. Hold {{@hold}} at the end.',
  ].join('\n');

  it('keeps the new layout, moves remake edits into 「예시 그대로」 and leaves 「내 주제에 맞게」 generic', () => {
    const r = upgradeRemakeTemplate(base, remake, next);
    expect(r.text.split('\n')).toEqual([
      'You are a motion designer. Create an intro{{@hook}}.', // option-token lines stay as the new edition wrote them
      '- Name: {{Brand name=Chois}}', // new label, remake default
      '- Topic: {{Topic=Vibe coding}}', // default found by blank name when the new edition rewrote the default text
      '- {{-Numbers=Fill in real figures only}}', // remake switched ? → - (default off) — kept
      '- {{@logo}}',
      '{{#a}}- **World:** a campus street at dusk becomes a stage.',
      '{{#a}}- **Story beats:** a prompt card appears first.', // line the remake added
      '{{#b}}- **World — you decide:** pick a world for the channel.',
      '{{#a}}- **Palette:** a limited palette with a few accent colors (navy, gold).', // both edits merged word by word
      '{{#b}}- **Palette:** a limited palette with a few accent colors.',
      '{{#sound}}- **Effects:** sparkles.',
      '- Hook the viewer early. Hold {{@hold}} at the end.',
    ]);
    // the attached-tables note is dropped (tablesMarkdown carries it); logo and timing edits are reported, not placed
    expect(r.unplaced).toEqual(['- {{?Logo=Use the attached pixel logo.}}', '- Hook the viewer in 1 s (prompt before 1.0 s).']);
    expect(validateTemplate(r.text)).toEqual([]);
    expect(isV2(r.text) && hasStyle(r.text)).toBe(true);
  });

  it('a remake line replaces the new edition’s own 「예시 그대로」 line with the same label', () => {
    const r = upgradeRemakeTemplate(
      ['- **Mood:** calm.', '- **Effects:** none.'].join('\n'),
      ['- **Mood:** calm.', '- **Palette:** navy and gold.', '- **Effects:** none.'].join('\n'),
      ['{{#a}}- **Mood:** calm.', '{{#a}}- **Palette:** pastel set.', '{{#b}}- **Palette:** pick colors.', '- **Effects:** none.'].join('\n'),
    );
    expect(r.text.split('\n')).toEqual([
      '{{#a}}- **Mood:** calm.',
      '{{#a}}- **Palette:** navy and gold.',
      '{{#b}}- **Palette:** pick colors.',
      '- **Effects:** none.',
    ]);
  });

  it('leaves an untouched remake as the new edition', () => {
    const r = upgradeRemakeTemplate(base, base, next);
    expect(r.text).toBe(next);
    expect(r.unplaced).toEqual([]);
  });
});
