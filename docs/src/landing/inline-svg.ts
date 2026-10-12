// The brand SVGs carry a <style> that sets `svg { color }` for light/dark;
// inlined into a page it would leak onto every SVG, so drop it and let
// the surrounding CSS colour the marks through currentColor.
export const inlineSvg = (raw: string) =>
  raw
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/\swidth="[^"]*"/, '')
    .replace(/\sheight="[^"]*"/, '')
    .replace('<svg', '<svg aria-hidden="true" focusable="false"');
