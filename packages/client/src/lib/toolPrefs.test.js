// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  COLOR_SLOT_COUNT, DEFAULT_COLOR_SLOTS, loadColorSlots, saveColorSlots, isHexColor, normalizeHex,
  HL_OPACITY, HL_COLOR_DEFAULT, HL_WIDTH_MIN, HL_WIDTH_MAX, HL_WIDTH_STEP, HL_WIDTH_DEFAULT,
  loadToolColor, saveToolColor, loadToolWidth, saveToolWidth, widthRange,
} from './toolPrefs';
import { PEN_WIDTH_MIN, PEN_WIDTH_MAX, PEN_WIDTH_DEFAULT } from './penWidth';

describe('toolPrefs — 색상 슬롯', () => {
  beforeEach(() => localStorage.clear());

  it('기본 5칸: 검정·빨강·파랑·초록·주황', () => {
    expect(COLOR_SLOT_COUNT).toBe(5);
    expect(DEFAULT_COLOR_SLOTS).toEqual(['#000000', '#e03131', '#1971c2', '#2f9e44', '#f08c00']);
    expect(loadColorSlots()).toEqual(DEFAULT_COLOR_SLOTS);
  });

  it('저장/복원 왕복, 반환 배열은 복사본', () => {
    const slots = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff'];
    saveColorSlots(slots);
    const loaded = loadColorSlots();
    expect(loaded).toEqual(slots);
    loaded[0] = '#123456';
    expect(loadColorSlots()[0]).toBe('#000000');
  });

  it('잘못된 저장값(길이·형식·JSON 오류)은 기본값으로', () => {
    localStorage.setItem('mc_color_slots', JSON.stringify(['#000000']));
    expect(loadColorSlots()).toEqual(DEFAULT_COLOR_SLOTS);
    localStorage.setItem('mc_color_slots', JSON.stringify(['red', '#ffffff', '#ff0000', '#00ff00', '#0000ff']));
    expect(loadColorSlots()).toEqual(DEFAULT_COLOR_SLOTS);
    localStorage.setItem('mc_color_slots', '{not json');
    expect(loadColorSlots()).toEqual(DEFAULT_COLOR_SLOTS);
  });

  it('saveColorSlots 는 소문자 HEX 로 정규화하고 유효하지 않으면 저장하지 않는다', () => {
    expect(saveColorSlots(['#ABCDEF', '#e03131', '#1971c2', '#2f9e44', '#f08c00'])).toEqual(['#abcdef', '#e03131', '#1971c2', '#2f9e44', '#f08c00']);
    expect(saveColorSlots(['bad', '#e03131', '#1971c2', '#2f9e44', '#f08c00'])).toBeNull();
    expect(loadColorSlots()[0]).toBe('#abcdef');
  });

  it('isHexColor / normalizeHex', () => {
    expect(isHexColor('#abc123')).toBe(true);
    expect(isHexColor('#ABC123')).toBe(true);
    expect(isHexColor('abc123')).toBe(false);
    expect(isHexColor('#abc')).toBe(false);
    expect(normalizeHex(' #ABC123 ')).toBe('#abc123');
    expect(normalizeHex('abc123')).toBe('#abc123');
    expect(normalizeHex('#ab')).toBeNull();
  });
});

describe('toolPrefs — 펜/형광펜 기억', () => {
  beforeEach(() => localStorage.clear());

  it('형광펜 상수', () => {
    expect(HL_OPACITY).toBe(40);
    expect(HL_COLOR_DEFAULT).toBe('#ffd43b');
    expect(HL_WIDTH_MIN).toBe(0.4);
    expect(HL_WIDTH_MAX).toBe(3);
    expect(HL_WIDTH_STEP).toBe(0.1);
    expect(HL_WIDTH_DEFAULT).toBe(1.2);
  });

  it('색: 펜은 mc_tool_color(기본 검정), 형광펜은 mc_hl_color(기본 노랑)', () => {
    expect(loadToolColor('freedraw')).toBe('#000000');
    expect(loadToolColor('highlighter')).toBe(HL_COLOR_DEFAULT);
    saveToolColor('freedraw', '#e03131');
    saveToolColor('highlighter', '#2f9e44');
    expect(localStorage.getItem('mc_tool_color')).toBe('#e03131');
    expect(localStorage.getItem('mc_hl_color')).toBe('#2f9e44');
    expect(loadToolColor('freedraw')).toBe('#e03131');
    expect(loadToolColor('highlighter')).toBe('#2f9e44');
  });

  it('두께: 펜은 mc_stroke_width, 형광펜은 mc_hl_width — 범위를 벗어나거나 숫자가 아니면 기본값', () => {
    expect(loadToolWidth('freedraw')).toBe(PEN_WIDTH_DEFAULT);
    expect(loadToolWidth('highlighter')).toBe(HL_WIDTH_DEFAULT);
    saveToolWidth('freedraw', 0.5);
    saveToolWidth('highlighter', 2.5);
    expect(localStorage.getItem('mc_stroke_width')).toBe('0.5');
    expect(localStorage.getItem('mc_hl_width')).toBe('2.5');
    expect(loadToolWidth('freedraw')).toBe(0.5);
    expect(loadToolWidth('highlighter')).toBe(2.5);
    localStorage.setItem('mc_hl_width', 'abc');
    expect(loadToolWidth('highlighter')).toBe(HL_WIDTH_DEFAULT);
    localStorage.setItem('mc_stroke_width', '99');
    expect(loadToolWidth('freedraw')).toBe(PEN_WIDTH_DEFAULT);
  });

  it('widthRange 는 도구별 슬라이더 범위', () => {
    expect(widthRange('freedraw')).toEqual({ min: PEN_WIDTH_MIN, max: PEN_WIDTH_MAX, step: 0.05 });
    expect(widthRange('highlighter')).toEqual({ min: HL_WIDTH_MIN, max: HL_WIDTH_MAX, step: HL_WIDTH_STEP });
  });
});
