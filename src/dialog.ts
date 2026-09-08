/** Dialog state, native button behavior and focus ownership live in one place. */
export class DialogLayer {
  private key: string | null = null;
  private previous: HTMLElement | null = null;
  private siblings: HTMLElement[] = [];
  constructor(
    private root: HTMLElement,
    private onEscape: () => void,
  ) {
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "modal-title");
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input,[tabindex="0"]',
        ),
      ).filter((e) => e.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (!first || !last) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }
  get open() {
    return this.key !== null;
  }
  show(key: string, html: string, bind: () => void) {
    if (this.key === key) return;
    if (!this.open) {
      this.previous =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      this.siblings = Array.from(this.root.parentElement!.children).filter(
        (e) => e !== this.root,
      ) as HTMLElement[];
      for (const sibling of this.siblings) sibling.inert = true;
    }
    this.key = key;
    this.root.innerHTML = html;
    this.root.hidden = false;
    bind();
    this.root
      .querySelector<HTMLElement>('[autofocus],button,a[href],[tabindex="0"]')
      ?.focus();
  }
  hide() {
    if (!this.open) return;
    this.key = null;
    this.root.hidden = true;
    for (const sibling of this.siblings) sibling.inert = false;
    this.siblings = [];
    if (this.previous?.isConnected)
      this.previous.focus({ preventScroll: true });
    this.previous = null;
  }
}
