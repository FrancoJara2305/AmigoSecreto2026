export function focusField(id: string) {
  const field = document.getElementById(id);
  for (let parent = field?.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
  field?.focus();
}
