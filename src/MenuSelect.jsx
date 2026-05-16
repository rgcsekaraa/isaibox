import { For, Show, createSignal, onCleanup, onMount } from "solid-js";

export function MenuSelect(props) {
  let root;
  const [open, setOpen] = createSignal(false);
  const selected = () => props.options.find((option) => option.value === props.value) || props.options[0];

  onMount(() => {
    const closeOnOutsideClick = (event) => {
      if (root && !root.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    onCleanup(() => document.removeEventListener("pointerdown", closeOnOutsideClick));
  });

  return (
    <div
      ref={root}
      class={`menu-select ${props.class || ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        class="menu-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{selected()?.label}</span>
        <span class="menu-select-caret" aria-hidden="true" />
      </button>
      <Show when={open()}>
        <div class="menu-select-list" role="listbox" aria-label={props.label || "Select option"}>
          <For each={props.options}>
            {(option) => (
              <button
                type="button"
                class="menu-select-option"
                classList={{ active: props.value === option.value }}
                role="option"
                aria-selected={props.value === option.value}
                onClick={() => {
                  props.onChange?.(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
