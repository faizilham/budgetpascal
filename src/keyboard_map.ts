export enum SpecialKeys {
  F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
  HOME, UP, PAGEUP, LEFT, RIGHT, END, DOWN, PAGEDOWN,
  INS, DEL
}

export const PascalSpecialKeys: {[key in SpecialKeys]: number} = {
  [SpecialKeys.F1]: 0x3B,
  [SpecialKeys.F2]: 0x3C,
  [SpecialKeys.F3]: 0x3D,
  [SpecialKeys.F4]: 0x3E,
  [SpecialKeys.F5]: 0x3F,
  [SpecialKeys.F6]: 0x40,
  [SpecialKeys.F7]: 0x41,
  [SpecialKeys.F8]: 0x42,
  [SpecialKeys.F9]: 0x43,
  [SpecialKeys.F10]: 0x44,
  [SpecialKeys.F11]: 0x85,
  [SpecialKeys.F12]: 0x86,
  [SpecialKeys.HOME]: 0x47,
  [SpecialKeys.UP]: 0x48,
  [SpecialKeys.PAGEUP]: 0x49,
  [SpecialKeys.LEFT]: 0x4B,
  [SpecialKeys.RIGHT]: 0x4D,
  [SpecialKeys.END]: 0x4F,
  [SpecialKeys.DOWN]: 0x50,
  [SpecialKeys.PAGEDOWN]: 0x51,
  [SpecialKeys.INS]: 0x52,
  [SpecialKeys.DEL]: 0x53,
};
