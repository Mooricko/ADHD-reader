/**
 * Tests for Smart Auto-Pause Feature
 */

import { AutoPauseReason } from '../useSmartAutoPause';

// Mock DOM environment for Node test runner
class MockEventTarget {
  private listeners: Record<string, Function[]> = {};

  addEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  removeEventListener(event: string, fn: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== fn);
  }

  dispatchEvent(event: string, payload: any = {}) {
    if (!this.listeners[event]) return;
    for (const fn of this.listeners[event]) {
      fn(payload);
    }
  }

  getListenerCount(event: string): number {
    return this.listeners[event]?.length || 0;
  }
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    testsFailed++;
  }
}

console.log('=============================================');
console.log('🧪 Testing Smart Auto-Pause Logic');
console.log('=============================================');

// Mock window and document
const mockWindow = new MockEventTarget();
const mockDocElement = new MockEventTarget();
const mockDocument = new MockEventTarget() as any;
mockDocument.hidden = false;

// Setup global mocks if not already present
if (typeof (global as any).window === 'undefined') {
  (global as any).window = mockWindow;
  (global as any).window.innerWidth = 1024;
  (global as any).window.innerHeight = 768;
}
if (typeof (global as any).document === 'undefined') {
  (global as any).document = mockDocument;
  (global as any).document.documentElement = mockDocElement;
}

// Logic helper mirroring useSmartAutoPause
function createSmartAutoPauseController(options: {
  getIsPlaying: () => boolean;
  getEnabled: () => boolean;
  onAutoPause: (reason: AutoPauseReason) => void;
  win?: any;
  doc?: any;
  docElem?: any;
}) {
  const win = options.win || (global as any).window;
  const doc = options.doc || (global as any).document;
  const docElem = options.docElem || doc.documentElement;

  const handleMouseLeave = (e: any) => {
    if (!options.getIsPlaying() || !options.getEnabled()) return;
    const isOutside =
      !e.relatedTarget &&
      (e.clientY <= 0 ||
        e.clientX <= 0 ||
        e.clientX >= win.innerWidth ||
        e.clientY >= win.innerHeight);

    if (isOutside) {
      options.onAutoPause('mouse');
    }
  };

  const handleMouseOut = (e: any) => {
    if (!options.getIsPlaying() || !options.getEnabled()) return;
    if (!e.relatedTarget && !e.toElement) {
      options.onAutoPause('mouse');
    }
  };

  const handleWindowBlur = () => {
    if (!options.getIsPlaying() || !options.getEnabled()) return;
    options.onAutoPause('blur');
  };

  const handleVisibilityChange = () => {
    if (!options.getIsPlaying() || !options.getEnabled()) return;
    if (doc.hidden) {
      options.onAutoPause('visibility');
    }
  };

  docElem.addEventListener('mouseleave', handleMouseLeave);
  win.addEventListener('mouseout', handleMouseOut);
  win.addEventListener('blur', handleWindowBlur);
  doc.addEventListener('visibilitychange', handleVisibilityChange);

  return {
    cleanup: () => {
      docElem.removeEventListener('mouseleave', handleMouseLeave);
      win.removeEventListener('mouseout', handleMouseOut);
      win.removeEventListener('blur', handleWindowBlur);
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
}

// --- Test Suite ---

console.log('\n--- 1. Window Blur & Tab Switching ---');
{
  let isPlaying = true;
  let enabled = true;
  let pauseTriggeredReason: AutoPauseReason | null = null;

  const controller = createSmartAutoPauseController({
    getIsPlaying: () => isPlaying,
    getEnabled: () => enabled,
    onAutoPause: (reason) => {
      pauseTriggeredReason = reason;
    },
    win: mockWindow,
    doc: mockDocument,
    docElem: mockDocElement,
  });

  // Trigger window blur while playing
  mockWindow.dispatchEvent('blur');
  assert(pauseTriggeredReason === 'blur', 'Triggers auto-pause on window blur when reader is active');

  // Reset
  pauseTriggeredReason = null;
  isPlaying = false;

  // Trigger window blur while reader is NOT playing
  mockWindow.dispatchEvent('blur');
  assert(pauseTriggeredReason === null, 'Does not trigger auto-pause when reader is already paused');

  // Trigger window blur when feature is disabled
  isPlaying = true;
  enabled = false;
  mockWindow.dispatchEvent('blur');
  assert(pauseTriggeredReason === null, 'Does not trigger auto-pause when smartAutoPause setting is disabled');

  controller.cleanup();
}

console.log('\n--- 2. Document Visibility Change ---');
{
  let isPlaying = true;
  let enabled = true;
  let pauseTriggeredReason: AutoPauseReason | null = null;

  const controller = createSmartAutoPauseController({
    getIsPlaying: () => isPlaying,
    getEnabled: () => enabled,
    onAutoPause: (reason) => {
      pauseTriggeredReason = reason;
    },
    win: mockWindow,
    doc: mockDocument,
    docElem: mockDocElement,
  });

  // Document becomes hidden
  mockDocument.hidden = true;
  mockDocument.dispatchEvent('visibilitychange');
  assert(pauseTriggeredReason === 'visibility', 'Triggers auto-pause when document becomes hidden (tab switch)');

  // Reset
  pauseTriggeredReason = null;
  mockDocument.hidden = false;
  mockDocument.dispatchEvent('visibilitychange');
  assert(pauseTriggeredReason === null, 'Does not pause when document becomes visible');

  controller.cleanup();
}

console.log('\n--- 3. Mouse Leaving Window Boundary ---');
{
  let isPlaying = true;
  let enabled = true;
  let pauseTriggeredReason: AutoPauseReason | null = null;

  const controller = createSmartAutoPauseController({
    getIsPlaying: () => isPlaying,
    getEnabled: () => enabled,
    onAutoPause: (reason) => {
      pauseTriggeredReason = reason;
    },
    win: mockWindow,
    doc: mockDocument,
    docElem: mockDocElement,
  });

  // Cursor moves inside the window
  mockDocElement.dispatchEvent('mouseleave', {
    relatedTarget: {},
    clientX: 200,
    clientY: 200,
  });
  assert(pauseTriggeredReason === null, 'Does not pause when cursor is inside window or entering another element');

  // Cursor moves above the top edge (e.g., towards tabs or address bar)
  mockDocElement.dispatchEvent('mouseleave', {
    relatedTarget: null,
    clientX: 300,
    clientY: -5,
  });
  assert(pauseTriggeredReason === 'mouse', 'Triggers auto-pause when cursor crosses top window boundary');

  // Reset
  pauseTriggeredReason = null;

  // Cursor leaves via right window edge
  mockDocElement.dispatchEvent('mouseleave', {
    relatedTarget: null,
    clientX: 1200,
    clientY: 300,
  });
  assert(pauseTriggeredReason === 'mouse', 'Triggers auto-pause when cursor crosses right window boundary');

  // Reset
  pauseTriggeredReason = null;

  // Mouseout without related target (outside browser window)
  mockWindow.dispatchEvent('mouseout', {
    relatedTarget: null,
    toElement: null,
  });
  assert(pauseTriggeredReason === 'mouse', 'Triggers auto-pause on window mouseout to outside browser');

  controller.cleanup();
}

console.log('\n--- 4. Cleanup & Event Listener Removal ---');
{
  const testWin = new MockEventTarget();
  const testDoc = new MockEventTarget() as any;
  testDoc.documentElement = new MockEventTarget();

  const controller = createSmartAutoPauseController({
    getIsPlaying: () => true,
    getEnabled: () => true,
    onAutoPause: () => {},
    win: testWin,
    doc: testDoc,
    docElem: testDoc.documentElement,
  });

  assert(testWin.getListenerCount('blur') === 1, 'Attached blur listener on setup');
  assert(testWin.getListenerCount('mouseout') === 1, 'Attached mouseout listener on setup');
  assert(testDoc.getListenerCount('visibilitychange') === 1, 'Attached visibilitychange listener on setup');

  controller.cleanup();

  assert(testWin.getListenerCount('blur') === 0, 'Removed blur listener on cleanup');
  assert(testWin.getListenerCount('mouseout') === 0, 'Removed mouseout listener on cleanup');
  assert(testDoc.getListenerCount('visibilitychange') === 0, 'Removed visibilitychange listener on cleanup');
}

console.log('=============================================');
console.log(`🏁 Smart Auto-Pause Test Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('=============================================');

if (testsFailed > 0) {
  process.exit(1);
}
