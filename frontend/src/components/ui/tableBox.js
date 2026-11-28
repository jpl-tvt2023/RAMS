// Every table in RAMS keeps its header row in view while it scrolls (the
// user, 2026-11-28). The page's <main> is its only scroller, and a table wider
// than the page needs a sideways scroll of its own -- which would also catch a
// sticky header -- so a table scrolls inside a box no taller than the screen
// below the top bar (with room left for a pager), with its <thead> sticky in
// that box. A short table never reaches the limit and looks as before; a long
// one keeps its header and its sideways scrollbar on screen.
//
//   <div className={`${TABLE_BOX} ${FIT_SCREEN}`}>
//     <table><thead className={STICKY_HEAD}><tr><th className={HEAD_CELL}>
//
// In a popup the box is shorter (IN_POPUP), since the popup scrolls too. The
// line under the header is a shadow: a collapsed border would scroll away with
// the rows. A test (src/__tests__/tableHeaders.test.js) checks every <thead>.
export const TABLE_BOX = 'overflow-auto';
export const FIT_SCREEN = 'max-h-[calc(100dvh-9rem)]';
export const IN_POPUP = 'max-h-[40vh]';
export const STICKY_HEAD = 'sticky top-0 z-10';
export const HEAD_CELL = 'bg-gray-50 shadow-[inset_0_-1px_0_var(--color-gray-200)]';
// A small table in a card whose header has no fill (Dashboard, settings).
export const HEAD_PLAIN = 'bg-white shadow-[inset_0_-1px_0_var(--color-gray-200)]';
