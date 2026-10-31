// User rules. Defaults are generic (largest audience); every value is editable in settings.

export interface TimeWindow {
  start: number; // minutes after local midnight
  end: number;
}

export interface FocusBlock extends TimeWindow {
  days: number[]; // 0 = Sunday … 6 = Saturday
}

export interface Settings {
  timeZone: string; // the user's IANA zone
  workHours: TimeWindow; // F3: a slot must start and end inside these
  bufferMin: number; // F2
  blockedWeekdays: number[]; // F4
  blockedDates: string[]; // F4, YYYY-MM-DD
  minNoticeMin: number; // F5
  focusBlocks: FocusBlock[]; // R3
  protectedWeekdays: number[]; // R4
  preferredWeekdays: number[]; // R5
  avoidEdges: boolean; // R6: Monday morning, Friday afternoon
  longStretchMin: number; // R7
  dayLoadCap: number; // R8
  lunch: TimeWindow | null; // R9
  interviewMode: boolean; // R10
  interviewDates: string[]; // R10, YYYY-MM-DD
}

export function defaultSettings(timeZone: string): Settings {
  return {
    timeZone,
    workHours: { start: 9 * 60, end: 17 * 60 },
    bufferMin: 10,
    blockedWeekdays: [0, 6],
    blockedDates: [],
    minNoticeMin: 4 * 60,
    focusBlocks: [],
    protectedWeekdays: [],
    preferredWeekdays: [2, 3, 4],
    avoidEdges: true,
    longStretchMin: 120,
    dayLoadCap: 4,
    lunch: { start: 12 * 60, end: 13 * 60 },
    interviewMode: false,
    interviewDates: [],
  };
}
