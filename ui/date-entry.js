// Chromium emits change for each typed date segment, including year 0002/0020/0202.
// Keep native keyboard editing in the controls until the operator commits it.
export function createDateEntry({ inputs, apply, restore, pending }) {
  let keyboard = false,
    dirty = false;
  const invalid = () => inputs.find((input) => !input.validity.valid);
  function reset() {
    keyboard = dirty = false;
    pending(false);
  }
  function commit() {
    if (!dirty) return true;
    if (invalid()) {
      pending(true);
      return false;
    }
    reset();
    apply();
    return true;
  }
  for (const input of inputs) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dirty) {
        event.preventDefault();
        event.stopPropagation();
        restore();
        reset();
      } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && dirty) {
        event.preventDefault();
        event.stopPropagation();
        if (!commit()) invalid()?.reportValidity();
      } else if (
        /^\d$/.test(event.key) ||
        ['Backspace', 'Delete'].includes(event.key) ||
        (!event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) ||
        ((event.ctrlKey || event.metaKey) && ['v', 'x'].includes(event.key.toLowerCase()))
      ) {
        keyboard = true;
      }
    });
    input.addEventListener('pointerdown', () => {
      keyboard = false;
    });
    input.addEventListener('input', () => {
      if (keyboard || invalid()) {
        dirty = true;
        pending(true);
      }
    });
    input.addEventListener(
      'change',
      (event) => {
        if (keyboard || invalid()) {
          event.stopImmediatePropagation();
          dirty = true;
          pending(true);
        } else if (dirty) reset();
      },
      { capture: true },
    );
    input.addEventListener('focusout', (event) => {
      if (dirty && !inputs.includes(event.relatedTarget)) commit();
    });
  }
  return {
    reset,
    commit,
    get pending() {
      return dirty;
    },
  };
}
