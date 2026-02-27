export interface MidiExportResult {
  format: 'SMF1';
  bytes: Uint8Array;
}

export const exportMidiPlaceholder = (): MidiExportResult => ({
  format: 'SMF1',
  bytes: new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
});
