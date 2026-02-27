export interface KeyboardCommandBinding {
  commandId: string;
  key: string;
}

export const defaultBindings: KeyboardCommandBinding[] = [
  { commandId: 'insertNote', key: 'N' },
  { commandId: 'transpose', key: 'T' },
];
