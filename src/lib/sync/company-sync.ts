export type CompanySyncCursorState = {
  version: 1;
  countryIndex: number;
  userCursor: string | null;
};

const COMPANY_SYNC_CURSOR_VERSION = 1;

export function createInitialCompanySyncCursorState(): CompanySyncCursorState {
  return {
    version: COMPANY_SYNC_CURSOR_VERSION,
    countryIndex: 0,
    userCursor: null,
  };
}

export function parseCompanySyncCursor(cursor: string): CompanySyncCursorState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(cursor);
  } catch {
    throw new Error("Invalid company sync cursor.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid company sync cursor.");
  }

  const state = parsed as Partial<CompanySyncCursorState>;
  const countryIndex = state.countryIndex;
  const userCursor = state.userCursor;

  if (
    state.version !== COMPANY_SYNC_CURSOR_VERSION ||
    typeof countryIndex !== "number" ||
    !Number.isInteger(countryIndex) ||
    countryIndex < 0 ||
    (userCursor !== null && typeof userCursor !== "string")
  ) {
    throw new Error("Invalid company sync cursor.");
  }

  return {
    version: COMPANY_SYNC_CURSOR_VERSION,
    countryIndex,
    userCursor,
  };
}

export function serializeCompanySyncCursor(state: CompanySyncCursorState) {
  return JSON.stringify(state);
}

export function advanceCompanySyncCursor(
  state: CompanySyncCursorState,
  nextUserCursor: string | null | undefined,
): CompanySyncCursorState {
  if (nextUserCursor) {
    return {
      ...state,
      userCursor: nextUserCursor,
    };
  }

  return {
    version: COMPANY_SYNC_CURSOR_VERSION,
    countryIndex: state.countryIndex + 1,
    userCursor: null,
  };
}
