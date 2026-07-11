import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '@/components/ui/Modal';

type ModalHarnessProps = Omit<React.ComponentProps<typeof Modal>, 'children'> & {
  children?: React.ReactNode;
};

const ModalHarness = Modal as React.ComponentType<ModalHarnessProps>;

function DismissibleModalHarness({ onDismiss }: { onDismiss: () => void }) {
  const [isOpen, setIsOpen] = React.useState(true);

  return React.createElement(
    ModalHarness,
    {
      isOpen,
      onClose: () => {
        onDismiss();
        setIsOpen(false);
      },
      ariaLabel: 'Dismissible dialog',
    },
    React.createElement('button', null, 'Close'),
  );
}

vi.mock('react-dom', () => ({
  createPortal: (children: React.ReactNode) => children,
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const primitives = new Map<string, React.ComponentType<Record<string, unknown>>>();
  const motion = new Proxy({}, {
    get: (_target, tag: string) => {
      if (!primitives.has(tag)) {
        const Primitive = ReactModule.forwardRef<unknown, Record<string, unknown>>(function Primitive(
          props,
          ref,
        ) {
          const domProps = { ...props };
          delete domProps.initial;
          delete domProps.animate;
          delete domProps.exit;
          delete domProps.transition;
          return ReactModule.createElement(tag, { ...domProps, ref });
        });
        primitives.set(tag, Primitive);
      }
      return primitives.get(tag);
    },
  });

  return {
    m: motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    usePresence: () => [true, vi.fn()],
  };
});

vi.mock('@/lib/soundManager', () => ({
  soundManager: { play: vi.fn() },
}));

class FakeElement {
  focusCount = 0;

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly name: string,
  ) {}

  focus() {
    this.focusCount += 1;
    this.ownerDocument.activeElement = this;
  }

  hasAttribute() {
    return false;
  }

  getAttribute() {
    return null;
  }
}

class FakeModalElement extends FakeElement {
  constructor(
    ownerDocument: FakeDocument,
    private readonly focusable: FakeElement[],
  ) {
    super(ownerDocument, 'modal');
  }

  querySelectorAll() {
    return this.focusable;
  }

  contains(element: unknown) {
    return element === this || this.focusable.includes(element as FakeElement);
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  body = { style: { overflow: '' } };
  private keydownListener: ((event: KeyboardEvent) => void) | null = null;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'keydown') this.keydownListener = listener as (event: KeyboardEvent) => void;
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    if (type === 'keydown' && this.keydownListener === listener) this.keydownListener = null;
  }

  dispatchKey(key: string, shiftKey = false) {
    const preventDefault = vi.fn();
    this.keydownListener?.({ key, shiftKey, preventDefault } as unknown as KeyboardEvent);
    return preventDefault;
  }
}

const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: originalHTMLElement });
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Modal focus lifecycle', () => {
  it('dismisses and unmounts on Escape before restoring opener focus', async () => {
    const documentMock = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentMock });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement });

    const opener = new FakeElement(documentMock, 'opener');
    const closeControl = new FakeElement(documentMock, 'close');
    const modalNode = new FakeModalElement(documentMock, [closeControl]);
    const onDismiss = vi.fn();
    documentMock.activeElement = opener;

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(DismissibleModalHarness, { onDismiss }),
        {
          createNodeMock: (element) => (
            (element.props as { role?: string }).role === 'dialog' ? modalNode : null
          ),
        },
      );
    });

    const renderedDialogs = () => renderer.root.findAll(
      (node) => node.type === 'div' && node.props.role === 'dialog',
    );

    expect(renderedDialogs()).toHaveLength(1);
    expect(documentMock.activeElement).toBe(closeControl);
    expect(documentMock.body.style.overflow).toBe('hidden');

    await act(async () => {
      documentMock.dispatchKey('Escape');
    });

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(renderedDialogs()).toHaveLength(0);
    expect(documentMock.activeElement).toBe(opener);
    expect(opener.focusCount).toBe(1);
    expect(documentMock.body.style.overflow).toBe('');

    await act(async () => renderer.unmount());
  });

  it('preserves focus across parent rerenders while using the latest close callback', async () => {
    const documentMock = new FakeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentMock });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeElement });

    const opener = new FakeElement(documentMock, 'opener');
    const firstControl = new FakeElement(documentMock, 'first');
    const secondControl = new FakeElement(documentMock, 'second');
    const modalNode = new FakeModalElement(documentMock, [firstControl, secondControl]);
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    documentMock.activeElement = opener;

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ModalHarness, {
          isOpen: true,
          onClose: firstClose,
          ariaLabel: 'Test dialog',
        },
        React.createElement('button', null, 'First'),
        React.createElement('button', null, 'Second')),
        {
          createNodeMock: (element) => (
            (element.props as { role?: string }).role === 'dialog' ? modalNode : null
          ),
        },
      );
    });

    expect(documentMock.activeElement).toBe(firstControl);
    expect(firstControl.focusCount).toBe(1);

    secondControl.focus();
    await act(async () => {
      renderer.update(
        React.createElement(ModalHarness, {
          isOpen: true,
          onClose: latestClose,
          ariaLabel: 'Test dialog',
        },
        React.createElement('button', null, 'First'),
        React.createElement('button', null, 'Second')),
      );
    });

    expect(documentMock.activeElement).toBe(secondControl);
    expect(firstControl.focusCount).toBe(1);
    expect(opener.focusCount).toBe(0);

    const forwardWrap = documentMock.dispatchKey('Tab');
    expect(forwardWrap).toHaveBeenCalledOnce();
    expect(documentMock.activeElement).toBe(firstControl);

    const backwardWrap = documentMock.dispatchKey('Tab', true);
    expect(backwardWrap).toHaveBeenCalledOnce();
    expect(documentMock.activeElement).toBe(secondControl);

    documentMock.dispatchKey('Escape');
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
    expect(documentMock.activeElement).toBe(opener);
    expect(documentMock.body.style.overflow).toBe('');
  });
});