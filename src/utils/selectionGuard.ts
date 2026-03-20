let lockCount = 0;
const LOCK_CLASS = "designer-dragging";

export function lockUserSelect(): void {
  lockCount += 1;
  if (typeof document === "undefined") {
    return;
  }
  document.body.classList.add(LOCK_CLASS);
}

export function unlockUserSelect(): void {
  lockCount = Math.max(0, lockCount - 1);
  if (typeof document === "undefined") {
    return;
  }
  if (lockCount === 0) {
    document.body.classList.remove(LOCK_CLASS);
  }
}

