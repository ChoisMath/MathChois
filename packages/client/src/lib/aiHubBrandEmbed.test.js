import { it, expect } from 'vitest';
import { embedBrandHtml, BRAND_EMBED_STYLE } from '@mathchois/shared';

it('inserts before </head>', () => expect(embedBrandHtml('<html><head><title>x</title></head><body></body></html>')).toBe(`<html><head><title>x</title>${BRAND_EMBED_STYLE}\n</head><body></body></html>`));
it('no head → before <body', () => expect(embedBrandHtml('<body>hi</body>')).toBe(`${BRAND_EMBED_STYLE}\n<body>hi</body>`));
it('neither → prepended', () => expect(embedBrandHtml('plain')).toBe(`${BRAND_EMBED_STYLE}\nplain`));
