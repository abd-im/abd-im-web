type RequestLock = {
  current: boolean;
};

export const runWithRequestLock = async (
  lock: RequestLock,
  request: () => Promise<unknown>,
) => {
  if (lock.current) return false;

  lock.current = true;
  try {
    await request();
    return true;
  } finally {
    lock.current = false;
  }
};
